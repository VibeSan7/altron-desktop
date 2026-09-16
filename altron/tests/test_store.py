import importlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest


@pytest.fixture
def api():
    try:
        return importlib.import_module("altron.dashboard.plugin_api")
    except ModuleNotFoundError:
        pytest.fail("Altron Store has not been implemented")


@pytest.fixture
def sample(tmp_path, api):
    folder = tmp_path / "project"
    folder.mkdir()
    store = api.Store(tmp_path / "data")
    project = store.create_project("Сайт мастерской", str(folder))
    task = store.create_task(project["id"], "Сделать страницу", "Открывается без ошибок")
    return store, project["id"], task["id"], folder


def running(sample):
    store, pid, tid, folder = sample
    store.approve(pid, tid, "Создать страницу; проверить открытие")
    run = store.prepare_run(pid, tid, "technical", "chosen-model", "chosen-provider")
    store.bind_run(pid, run["id"], "runtime-one", "stored-one")
    return store, pid, tid, folder, run


def test_projects_and_decisions_survive_reopening_without_mixing(sample, api, tmp_path):
    store, pid, tid, folder = sample
    second_folder = tmp_path / "second"
    second_folder.mkdir()
    second = store.create_project("Бот", str(second_folder))
    store.add_decision(pid, "Без регистрации")
    reopened = api.Store(tmp_path / "data")
    assert reopened.project(pid)["tasks"][0]["id"] == tid
    assert reopened.project(pid)["decisions"][0]["text"] == "Без регистрации"
    assert reopened.project(second["id"])["tasks"] == []
    assert reopened.project(second["id"])["decisions"] == []


def test_foreign_task_id_is_rejected_without_changes(sample, tmp_path, api):
    store, pid, tid, folder = sample
    other_dir = tmp_path / "other"
    other_dir.mkdir()
    other = store.create_project("Другой", str(other_dir))
    before = store.project(pid)
    with pytest.raises(api.AltronError, match="task_not_found"):
        store.approve(other["id"], tid, "Чужой план")
    assert store.project(pid) == before


def test_execution_requires_approved_plan(sample, api):
    store, pid, tid, _ = sample
    with pytest.raises(api.AltronError, match="plan_not_approved"):
        store.prepare_run(pid, tid, "technical", "model", "provider")
    assert store.project(pid)["runs"] == []


@pytest.mark.parametrize("model,provider", [("", "provider"), ("model", ""), (" ", "provider")])
def test_no_implicit_model_or_provider(sample, api, model, provider):
    store, pid, tid, _ = sample
    store.approve(pid, tid, "План")
    with pytest.raises(api.AltronError):
        store.prepare_run(pid, tid, "technical", model, provider)
    assert store.project(pid)["runs"] == []


def test_concurrent_launch_has_one_winner_and_survives_restart(sample, api, tmp_path):
    store, pid, tid, _ = sample
    store.approve(pid, tid, "План")
    def start():
        try:
            return store.prepare_run(pid, tid, "technical", "model", "provider")["id"]
        except api.AltronError:
            return None
    with ThreadPoolExecutor(max_workers=2) as pool:
        winners = list(pool.map(lambda _: start(), range(2)))
    assert len([w for w in winners if w]) == 1
    reopened = api.Store(tmp_path / "data")
    assert len(reopened.project(pid)["runs"]) == 1
    with pytest.raises(api.AltronError):
        reopened.prepare_run(pid, tid, "technical", "model", "provider")


def test_task_is_not_done_when_agent_submits_files(sample):
    store, pid, tid, folder, run = running(sample)
    (folder / "index.html").write_text("<h1>Мастерская</h1>", encoding="utf-8")
    result = store.submit_result(pid, run["id"], "Создана страница", ["index.html"])
    assert result["status"] == "review"
    assert store.project(pid)["tasks"][0]["status"] == "review"
    assert len(result["artifacts"][0]["sha256"]) == 64


@pytest.mark.parametrize("kind", ["missing", "outside", "directory"])
def test_bad_evidence_is_rejected(sample, api, tmp_path, kind):
    store, pid, tid, folder, run = running(sample)
    outside = tmp_path / "foreign.txt"
    outside.write_text("foreign")
    paths = {"missing": ["missing.txt"], "outside": [str(outside)], "directory": ["."]}
    with pytest.raises(api.AltronError):
        store.submit_result(pid, run["id"], "Не результат", paths[kind])
    assert store.project(pid)["tasks"][0]["status"] == "running"


@pytest.mark.parametrize('name', ['.env.local', '.env.production', '.ENV'])
def test_environment_files_cannot_be_attached_as_results(sample, api, name):
    store, pid, tid, folder, run = running(sample)
    (folder / name).write_text('synthetic configuration', encoding='utf-8')
    with pytest.raises(api.AltronError, match='sensitive_artifact'):
        store.submit_result(pid, run['id'], 'Not a deliverable', [name])
    assert store.project(pid)['tasks'][0]['artifacts'] == []


def test_changed_file_blocks_acceptance_and_original_can_be_accepted(sample, api):
    store, pid, tid, folder, run = running(sample)
    target = folder / "result.txt"
    target.write_text("original")
    store.submit_result(pid, run["id"], "Результат", ["result.txt"])
    target.write_text("changed")
    with pytest.raises(api.AltronError, match="artifact_changed"):
        store.accept(pid, tid, "Проверено человеком")
    assert store.project(pid)["tasks"][0]["status"] == "review"
    target.write_text("original")
    result = store.accept(pid, tid, "Открыл файл и проверил по условию")
    assert result["status"] == "done"
    assert result["acceptance_review"]["actor"] == "user"


def test_unknown_delivery_does_not_retry_or_claim_success(sample, api, tmp_path):
    store, pid, tid, _, run = running(sample)
    store.mark_run(pid, run["id"], "unknown", "Ответ на отправку не получен")
    reopened = api.Store(tmp_path / "data")
    assert reopened.project(pid)["tasks"][0]["status"] == "unknown"
    with pytest.raises(api.AltronError):
        reopened.prepare_run(pid, tid, "technical", "model", "provider")


def test_cancel_request_does_not_claim_cancellation(sample):
    store, pid, tid, _, run = running(sample)
    store.mark_run(pid, run["id"], "cancel_requested", "Пользователь запросил остановку")
    project = store.project(pid)
    assert project["runs"][0]["status"] == "cancel_requested"
    assert project["tasks"][0]["status"] != "done"


def test_session_binding_cannot_be_reused_by_another_run(sample, api):
    store, pid, tid, _, run = running(sample)
    second = store.create_task(pid, "Второй результат", "Проверить файл")
    store.approve(pid, second["id"], "План")
    other = store.prepare_run(pid, second["id"], "technical", "model", "provider")
    with pytest.raises(api.AltronError, match="session_already_bound"):
        store.bind_run(pid, other["id"], "runtime-one", "stored-one")


def test_only_bound_run_can_use_agent_tools(sample, api):
    store, pid, tid, folder, run = running(sample)
    with pytest.raises(api.AltronError, match="session_not_bound"):
        store.agent_context("foreign-runtime")
    context = store.agent_context("runtime-one")
    assert context["project"]["id"] == pid
    assert context["task"]["id"] == tid
    assert context["run"]["id"] == run["id"]


def test_overlapping_project_roots_are_refused(sample, api):
    store, pid, tid, folder = sample
    nested = folder / "nested"
    nested.mkdir()
    with pytest.raises(api.AltronError, match="project_overlap"):
        store.create_project("Вложенный", str(nested))


def test_empty_store_does_not_invent_personal_configuration(tmp_path, api):
    store = api.Store(tmp_path / "blank")
    assert store.projects() == []
    assert not list((tmp_path / "blank").glob("*.env"))


def test_planner_proposal_still_needs_user_approval(sample, api):
    store, pid, tid, _ = sample
    run = store.prepare_run(pid, tid, "altron", "model", "provider")
    store.bind_run(pid, run["id"], "planner-runtime", "planner-stored")
    result = store.propose_plan(pid, run["id"], "Предлагаемый план")
    assert result["status"] == "draft"
    with pytest.raises(api.AltronError, match="plan_not_approved"):
        store.prepare_run(pid, tid, "technical", "model", "provider")
