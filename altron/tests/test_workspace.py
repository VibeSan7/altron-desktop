import importlib


def test_workspace_selection_persists_and_is_scoped(tmp_path):
    module = importlib.import_module("altron.dashboard.plugin_api")
    store = module.Store(tmp_path / "one")
    assert hasattr(store, "workspace"), "Workspace selection is not implemented"
    assert store.workspace()["selected_project_id"] is None
    folder = tmp_path / "project"
    folder.mkdir()
    project = store.create_project("Project", str(folder))
    store.select(project["id"])
    reopened = module.Store(tmp_path / "one")
    assert reopened.workspace()["selected_project_id"] == project["id"]
    assert reopened.workspace()["workspace_id"] == store.workspace()["workspace_id"]
    other = module.Store(tmp_path / "two")
    assert other.workspace()["workspace_id"] != store.workspace()["workspace_id"]
    assert other.workspace()["selected_project_id"] is None


def test_backend_restart_does_not_claim_old_execution_is_still_running(tmp_path):
    module = importlib.import_module("altron.dashboard.plugin_api")
    store = module.Store(tmp_path / 'data')
    assert 'runtime_id' in __import__('inspect').signature(store.workspace).parameters, 'Runtime reconciliation is missing'
    store.workspace(runtime_id='first-backend')
    folder = tmp_path / 'project'
    folder.mkdir()
    pid = store.create_project('Project', str(folder))['id']
    task = store.create_task(pid, 'Task', 'Evidence exists')
    store.approve(pid, task['id'], 'Plan')
    run = store.prepare_run(pid, task['id'], 'technical', 'model', 'provider')
    store.bind_run(pid, run['id'], 'runtime', 'stored')
    store.workspace(runtime_id='first-backend')
    assert store.project(pid)['tasks'][0]['status'] == 'running'
    reopened = module.Store(tmp_path / 'data')
    reopened.workspace(runtime_id='second-backend')
    restored = reopened.project(pid)
    assert restored['tasks'][0]['status'] == 'unknown'
    assert restored['runs'][0]['status'] == 'unknown'
    assert len(restored['runs']) == 1
