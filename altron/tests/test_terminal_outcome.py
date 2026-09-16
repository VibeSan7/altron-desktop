import importlib

import pytest


@pytest.fixture
def running(tmp_path):
    module = importlib.import_module('altron.dashboard.plugin_api')
    store = module.Store(tmp_path / 'data')
    root = tmp_path / 'project'
    root.mkdir()
    project = store.create_project('Project', str(root))['id']
    task = store.create_task(project, 'Goal', 'Actual file')['id']
    store.approve(project, task, 'Write and test')
    run = store.prepare_run(project, task, 'technical', 'model', 'provider')['id']
    store.bind_run(project, run, 'runtime', 'stored')
    return store, project, task, run, root


@pytest.mark.parametrize('outcome,expected', [('error', 'failed'), ('interrupted', 'interrupted'), ('complete', 'failed')])
def test_transport_acceptance_is_not_success(running, outcome, expected):
    store, project, task, run, _ = running
    store.record_terminal(project, run, 'runtime', outcome)
    assert store.project(project)['tasks'][0]['status'] == expected
    assert store.project(project)['runs'][0]['terminal_status'] == outcome


def test_confirmed_stop_cannot_be_overwritten_by_late_cancel(running):
    store, project, task, run, _ = running
    module = importlib.import_module('altron.dashboard.plugin_api')
    store.record_terminal(project, run, 'runtime', 'interrupted')
    with pytest.raises(module.AltronError, match='run_is_terminal'):
        store.mark_run(project, run, 'cancel_requested', 'Late cancellation')
    assert store.project(project)['tasks'][0]['status'] == 'interrupted'


def test_late_terminal_event_preserves_real_artifacts_for_review(running):
    store, project, task, run, root = running
    (root / 'result.txt').write_text('Actual synthetic result', encoding='utf-8')
    store.submit_result(project, run, 'Created result', ['result.txt'])
    store.record_terminal(project, run, 'runtime', 'error')
    data = store.project(project)
    assert data['tasks'][0]['status'] == 'review'
    assert data['runs'][0]['terminal_status'] == 'error'
    assert data['runs'][0]['note']


def test_foreign_or_duplicate_terminal_receipt_cannot_change_outcome(running):
    store, project, task, run, _ = running
    module = importlib.import_module('altron.dashboard.plugin_api')
    with pytest.raises(module.AltronError):
        store.record_terminal(project, run, 'another-session', 'complete')
    store.record_terminal(project, run, 'runtime', 'error')
    store.record_terminal(project, run, 'runtime', 'complete')
    assert store.project(project)['runs'][0]['terminal_status'] == 'error'
