from contextlib import contextmanager
from types import SimpleNamespace
import sys
import threading

import pytest

from altron.dashboard import plugin_api as api


@pytest.fixture
def service():
    from altron.dashboard import desktop_services
    return desktop_services


@pytest.fixture
def runtime(monkeypatch, tmp_path):
    home = tmp_path / "profile"
    home.mkdir()
    session = {"session_key": "stored", "profile_home": str(home), "cwd": str(tmp_path / "project"), "running": True}
    server = SimpleNamespace(_sessions={"runtime": session}, _sessions_lock=threading.RLock(), _hermes_home=home,
        _session_lookup_key=lambda s, **kw: s["session_key"],
        _session_live_status=lambda sid, s: "working" if s["running"] else "idle",
        _session_usage_snapshot=lambda s: {"input": 12, "output": 3, "token_secret": "must not escape"},
        _close_session_by_id=lambda sid: server._sessions.pop(sid, None))
    monkeypatch.setitem(sys.modules, "tui_gateway.server", server)
    leases = []
    @contextmanager
    def guard(stored_id, *, registry_home):
        assert registry_home == home
        yield bool(leases)
    monkeypatch.setitem(sys.modules, "hermes_cli.active_sessions", SimpleNamespace(active_session_liveness_guard=guard))
    return home, session, server, leases


def test_missing_gateway_is_not_proof_of_stop(service, monkeypatch, tmp_path):
    monkeypatch.delitem(sys.modules, "tui_gateway.server", raising=False)
    with pytest.raises(ValueError, match="runtime_unavailable"):
        with service.observe_run({"runtime_id": "r", "stored_id": "s"}, {"directory": str(tmp_path)}, tmp_path):
            pytest.fail("unavailable cannot become stopped")


def test_observation_checks_live_session_and_profile_without_prompts(service, runtime, tmp_path):
    home, session, server, leases = runtime
    project = {"directory": str(tmp_path / "project")}
    run = {"runtime_id": "runtime", "stored_id": "stored"}
    with service.observe_run(run, project, home) as observed:
        assert observed["state"] == "active"
    assert "runtime" in server._sessions
    session["running"] = False
    with service.observe_run(run, project, home) as observed:
        assert observed["state"] == "stopped"
        assert observed["usage"] == {"input": 12, "output": 3}
    assert not server._sessions
    leases.append("other process owns stored session")
    with service.observe_run(run, project, home) as observed:
        assert observed["state"] == "active"
    leases.clear()
    with service.observe_run(run, project, home) as observed:
        assert observed["state"] == "stopped"


def test_foreign_profile_and_working_directory_fail_closed(service, runtime, tmp_path):
    home, session, _, _ = runtime
    session["running"] = False
    run = {"runtime_id": "runtime", "stored_id": "stored"}
    with pytest.raises(ValueError, match="runtime_scope_mismatch"):
        with service.observe_run(run, {"directory": str(tmp_path / "other")}, home):
            pass


def test_recover_persists_interruption_and_never_starts_next_step(tmp_path):
    folder = tmp_path / "project"
    folder.mkdir()
    store = api.Store(tmp_path / "home" / "altron")
    pid = store.create_project("Project", str(folder))["id"]
    tid = store.create_task(pid, "Goal", "Check")["id"]
    store.set_team(pid, {"technical": {"model": "m", "provider": "p"}})
    store.approve_team(pid, tid, "Plan", [{"role": "technical", "goal": "one", "acceptance": "file"}])
    store.resume_team(pid, tid)
    run = store.next_team_run(pid, tid)
    store.bind_run(pid, run["id"], "runtime", "stored")
    @contextmanager
    def active(*args):
        yield {"state": "active", "usage": {}}
    @contextmanager
    def stopped(*args):
        yield {"state": "stopped", "usage": {"input": 8}}
    assert store.recover_task(pid, tid, active)["status"] == "running"
    task = store.recover_task(pid, tid, stopped)
    assert task["status"] == "interrupted"
    assert task["team"]["status"] == "failed"
    assert store.next_team_run(pid, tid) is None
    assert len(store.project(pid)["runs"]) == 1
    assert store.project(pid)["runs"][0]["usage"] == {"input": 8}
    assert store.revise_task(pid, tid, "Change plan")["attempt"] == 2


def test_recovery_refuses_a_binding_created_after_its_observation(tmp_path):
    folder = tmp_path / "project"
    folder.mkdir()
    store = api.Store(tmp_path / "home" / "altron")
    pid = store.create_project("P", str(folder))["id"]
    tid = store.create_task(pid, "G", "A")["id"]
    store.approve(pid, tid, "Plan")
    run = store.prepare_run(pid, tid, "technical", "m", "p")

    @contextmanager
    def concurrently_bound(*args):
        store.bind_run(pid, run["id"], "new-runtime", "new-stored")
        yield {"state": "stopped", "usage": {}}

    with pytest.raises(api.AltronError, match="runtime_state_changed"):
        store.recover_task(pid, tid, concurrently_bound)
    saved = store.project(pid)["runs"][0]
    assert saved["status"] == "running" and not saved.get("terminal_status")


def test_folder_picker_reads_directories_only_and_diagnostics_are_allowlisted(service, tmp_path):
    (tmp_path / "folder").mkdir()
    (tmp_path / "private-file.txt").write_text("secret", encoding="utf-8")
    folders = service.folders(str(tmp_path))
    names = [entry["name"] for entry in folders["directories"]]
    assert "folder" in names and "private-file.txt" not in names
    store = api.Store(tmp_path / "data")
    store.create_project("PRIVATE PROJECT", str(tmp_path / "folder"))
    report = service.diagnostics(store)
    assert report["projects"] == 1
    assert "PRIVATE" not in str(report) and str(tmp_path) not in str(report)
    assert report["data_version"] == 1
