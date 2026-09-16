from altron.dashboard import plugin_api as api_module

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def plugin_api():
    return api_module


@pytest.fixture
def work(tmp_path, plugin_api):
    folder = tmp_path / "project"
    folder.mkdir()
    store = plugin_api.Store(tmp_path / "data")
    project = store.create_project("Example", str(folder))
    task = store.create_task(project["id"], "Create a report", "Read report.txt")
    return store, project["id"], task["id"], folder


def started(work):
    store, pid, tid, folder = work
    store.approve(pid, tid, "Write and check report.txt")
    run = store.prepare_run(pid, tid, "technical", "chosen-model", "chosen-provider")
    store.bind_run(pid, run["id"], "runtime", "stored")
    return run


def reported(work):
    run = started(work)
    store, pid, tid, folder = work
    (folder / "report.txt").write_text("actual result", encoding="utf-8")
    store.submit_result(pid, run["id"], "Created report", ["report.txt"])
    return run


def test_cancel_approved_team_preserves_plan_and_unblocks_state(work):
    store, pid, tid, _ = work
    store.set_team(pid, {"technical": {"model": "m", "provider": "p"}})
    store.approve_team(pid, tid, "Plan", [{"role": "technical", "goal": "File", "acceptance": "Read it"}])
    task = store.cancel_task(pid, tid, "Not needed now")
    assert task["status"] == task["team"]["status"] == "cancelled"
    assert task["plan"] == "Plan"
    assert store.project(pid)["runs"] == []


@pytest.mark.parametrize("action", ["cancel", "revise", "archive"])
def test_unconfirmed_run_cannot_be_hidden_or_replaced(work, plugin_api, action):
    run = reported(work)
    store, pid, tid, _ = work
    with pytest.raises(plugin_api.AltronError, match="run_state_unconfirmed"):
        {"cancel": store.cancel_task, "revise": store.revise_task, "archive": store.archive_task}[action](pid, tid, True if action == "archive" else "Change")
    assert store.project(pid)["tasks"][0]["status"] == "review"
    assert store.project(pid)["runs"][0]["id"] == run["id"]


def test_revision_has_same_identity_and_durable_attempt_history(work, plugin_api):
    run = reported(work)
    store, pid, tid, folder = work
    store.record_terminal(pid, run["id"], "runtime", "complete")
    task = store.revise_task(pid, tid, "Add a conclusion")
    assert task["id"] == tid and task["attempt"] == 2 and task["status"] == "draft"
    assert task["feedback"] == "Add a conclusion" and task["artifacts"] == []
    assert task["attempts"][0]["artifacts"][0]["path"] == "report.txt"
    assert (folder / "report.txt").read_text(encoding="utf-8") == "actual result"
    reopened = plugin_api.Store(store.root).project(pid)
    assert reopened["tasks"][0] == task
    assert reopened["runs"][0]["id"] == run["id"]
    with pytest.raises(plugin_api.AltronError):
        store.prepare_run(pid, tid, "technical", "m", "p")
    with pytest.raises(plugin_api.AltronError):
        store.submit_result(pid, run["id"], "late", ["report.txt"])
    store.record_terminal(pid, run["id"], "runtime", "complete")
    assert store.project(pid)["tasks"][0] == task
    store.approve(pid, tid, "Revised plan")
    next_run = store.prepare_run(pid, tid, "technical", "m", "p")
    assert next_run["attempt"] == 2
    assert "Add a conclusion" in next_run["prompt"]


def test_archive_is_reversible_and_never_deletes_tasks(work, plugin_api):
    store, pid, tid, _ = work
    store.cancel_task(pid, tid, "Later")
    store.archive_task(pid, tid, True)
    with pytest.raises(plugin_api.AltronError, match="task_archived"):
        store.revise_task(pid, tid, "Now")
    assert store.project(pid)["tasks"][0]["archived"] is True
    store.archive_task(pid, tid, False)
    assert store.revise_task(pid, tid, "Now")["status"] == "draft"


def test_old_schema_and_late_failed_status(work, plugin_api):
    store, pid, tid, _ = work
    with store.changing(pid) as (project, _):
        task = project["tasks"][0]
        for key in ("attempt", "attempts", "feedback", "archived"):
            task.pop(key, None)
    run = started(work)
    store.record_terminal(pid, run["id"], "runtime", "interrupted")
    revised = store.revise_task(pid, tid, "Try a different plan")
    assert revised["attempt"] == 2
    with pytest.raises(plugin_api.AltronError):
        store.mark_run(pid, run["id"], "failed", "Late event")
    assert store.project(pid)["tasks"][0]["status"] == "draft"


def test_unbound_failure_stops_duration_but_bound_failure_remains_unconfirmed(work):
    store, pid, tid, _ = work
    run = store.prepare_run(pid, tid, "altron", "model", "provider")
    failed = store.mark_run(pid, run["id"], "failed", "Provider rejected before binding")
    assert failed.get("finished_at")
    assert not failed.get("terminal_status")
    tid2 = store.create_task(pid, "Another task", "Read the result")["id"]
    bound = store.prepare_run(pid, tid2, "altron", "model", "provider")
    store.bind_run(pid, bound["id"], "runtime-two", "stored-two")
    uncertain = store.mark_run(pid, bound["id"], "failed", "Failure after binding")
    assert not uncertain.get("finished_at")
    assert not uncertain.get("terminal_status")


def test_accept_waits_for_terminal_receipt(work, plugin_api):
    run = reported(work)
    store, pid, tid, _ = work
    with pytest.raises(plugin_api.AltronError, match="run_state_unconfirmed"):
        store.accept(pid, tid, "Checked file")
    store.record_terminal(pid, run["id"], "runtime", "complete")
    assert store.accept(pid, tid, "Checked file")["status"] == "done"


def test_user_actions_require_confirmation_and_reject_extra_fields(work, plugin_api):
    store, pid, tid, _ = work
    app = FastAPI()
    app.include_router(plugin_api.router)
    app.dependency_overrides[plugin_api.get_store] = lambda: store
    client = TestClient(app)
    path = f"/projects/{pid}/tasks/{tid}"
    assert client.post(path + "/cancel", json={"reason": "Later"}).status_code == 422
    assert client.post(path + "/cancel", json={"reason": "Later", "confirm": False}).status_code == 422
    assert client.post(path + "/cancel", json={"reason": "Later", "confirm": True}).status_code == 200
    assert client.post(path + "/revise", json={"feedback": "Now", "confirm": True, "terminal_status": "complete"}).status_code == 422
    assert client.post(path + "/revise", json={"feedback": "Now", "confirm": True}).json()["attempt"] == 2


def test_run_budget_is_atomic_and_includes_planning(work, plugin_api):
    store, pid, tid, _ = work
    store.set_budget(pid, 0)
    with pytest.raises(plugin_api.AltronError, match="run_budget_exhausted"):
        store.prepare_run(pid, tid, "altron", "m", "p")
    assert store.project(pid)["runs"] == []
    store.set_budget(pid, 1)
    run = store.prepare_run(pid, tid, "altron", "m", "p")
    assert store.project(pid)["remaining_runs"] == 0
    assert run["role"] == "altron"


def test_cancelled_team_allows_maintenance_but_unconfirmed_bound_failure_does_not(tmp_path, plugin_api):
    from altron.tests.test_maintenance import _maintenance
    from altron.dashboard.maintenance import MaintenanceError
    maintenance, home, _ = _maintenance(tmp_path)
    root = tmp_path / "project"
    root.mkdir()
    store = plugin_api.Store(home / "altron")
    pid = store.create_project("P", str(root))["id"]
    tid = store.create_task(pid, "G", "A")["id"]
    store.set_team(pid, {"technical": {"model": "m", "provider": "p"}})
    store.approve_team(pid, tid, "Plan", [{"role": "technical", "goal": "G", "acceptance": "A"}])
    with pytest.raises(MaintenanceError, match="active_operations"):
        with maintenance._validate_database():
            pass
    store.cancel_task(pid, tid, "Later")
    with maintenance._validate_database():
        pass
    tid2 = store.create_task(pid, "G2", "A2")["id"]
    run = store.prepare_run(pid, tid2, "altron", "m", "p")
    store.bind_run(pid, run["id"], "live", "stored")
    store.mark_run(pid, run["id"], "failed", "Unknown failure")
    with pytest.raises(MaintenanceError, match="active_operations"):
        with maintenance._validate_database():
            pass
