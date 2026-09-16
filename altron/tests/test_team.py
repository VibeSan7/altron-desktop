import json
from concurrent.futures import ThreadPoolExecutor

import pytest

from altron.dashboard.plugin_api import AltronError, Store


@pytest.fixture
def sample(tmp_path):
    folder = tmp_path / 'project'
    folder.mkdir()
    store = Store(tmp_path / 'data')
    pid = store.create_project('Команда', str(folder))['id']
    tid = store.create_task(pid, 'Подготовить результат и инструкцию', 'Оба файла проверены')['id']
    return store, pid, tid, folder


def configure(sample):
    store, pid, tid, folder = sample
    store.set_team(pid, {
        'technical': {'model': 'model-code', 'provider': 'provider-code'},
        'memory': {'model': 'model-docs', 'provider': 'provider-docs'},
    })
    steps = [
        {'role': 'technical', 'goal': 'Создать результат', 'acceptance': 'Результат существует'},
        {'role': 'memory', 'goal': 'Описать результат', 'acceptance': 'Инструкция соответствует файлу'},
    ]
    store.approve_team(pid, tid, 'Сначала результат, затем инструкция', steps)
    return steps


def finish(sample, run, name, status='complete'):
    store, pid, tid, folder = sample
    store.bind_run(pid, run['id'], 'runtime-' + run['id'], 'stored-' + run['id'])
    (folder / name).write_text('проверяемый файл ' + name, encoding='utf-8')
    store.submit_result(pid, run['id'], 'Сохранён ' + name, [name])
    store.record_terminal(pid, run['id'], 'runtime-' + run['id'], status)


def test_team_is_persistent_and_approved_routes_are_snapshots(sample):
    store, pid, tid, folder = sample
    configure(sample)
    store.set_team(pid, {'technical': {'model': 'future-model', 'provider': 'future-provider'}})
    reopened = Store(store.root)
    assert reopened.project(pid)['team']['technical']['model'] == 'future-model'
    assert reopened.next_team_run(pid, tid) is None
    reopened.resume_team(pid, tid)
    run = reopened.next_team_run(pid, tid)
    assert (run['model'], run['provider']) == ('model-code', 'provider-code')
    assert 'Создать результат' in run['prompt']
    with pytest.raises(AltronError, match='team_requires_coordinator'):
        reopened.prepare_run(pid, tid, 'technical', 'bypass', 'bypass')


def test_team_handoff_requires_terminal_success_and_never_self_accepts(sample):
    store, pid, tid, folder = sample
    configure(sample)
    store.resume_team(pid, tid)
    first = store.next_team_run(pid, tid)
    store.bind_run(pid, first['id'], 'first', 'stored-first')
    assert store.project(pid)['tasks'][0]['team']['steps'][0]['status'] == 'running'
    (folder / 'result.txt').write_text('result', encoding='utf-8')
    store.submit_result(pid, first['id'], 'result created', ['result.txt'])
    assert store.next_team_run(pid, tid) is None
    with pytest.raises(AltronError):
        store.accept(pid, tid, 'too early')
    store.record_terminal(pid, first['id'], 'first', 'complete')
    second = store.next_team_run(pid, tid)
    assert second['role'] == 'memory' and second['model'] == 'model-docs'
    store.bind_run(pid, second['id'], 'second', 'stored-second')
    context = store.agent_context('second')
    assert context['task']['goal'] == 'Описать результат'
    assert context['task']['overall_goal'] == 'Подготовить результат и инструкцию'
    assert context['task']['artifacts'][0]['path'] == 'result.txt'
    (folder / 'guide.md').write_text('guide', encoding='utf-8')
    store.submit_result(pid, second['id'], 'guide created', ['guide.md'])
    store.record_terminal(pid, second['id'], 'second', 'complete')
    task = store.project(pid)['tasks'][0]
    assert task['status'] == task['team']['status'] == 'review'
    assert {a['path'] for a in task['artifacts']} == {'result.txt', 'guide.md'}
    assert store.next_team_run(pid, tid) is None
    assert store.accept(pid, tid, 'Both files checked')['team']['status'] == 'done'
    assert len(store.project(pid)['runs']) == 2


def test_concurrent_team_claim_allocates_only_one_run(sample):
    store, pid, tid, folder = sample
    configure(sample)
    store.resume_team(pid, tid)
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda _: store.next_team_run(pid, tid), range(2)))
    assert sum(run is not None for run in outcomes) == 1
    assert len(store.project(pid)['runs']) == 1


@pytest.mark.parametrize('status', ['error', 'interrupted'])
def test_error_even_after_artifact_delivery_blocks_following_step(sample, status):
    store, pid, tid, folder = sample
    configure(sample)
    store.resume_team(pid, tid)
    run = store.next_team_run(pid, tid)
    finish(sample, run, 'result.txt', status)
    assert store.next_team_run(pid, tid) is None
    assert store.project(pid)['tasks'][0]['team']['status'] == 'failed'
    with pytest.raises(AltronError):
        store.resume_team(pid, tid)
    with pytest.raises(AltronError):
        store.accept(pid, tid, 'not successful')


def test_changed_handoff_is_not_sent_to_next_specialist(sample):
    store, pid, tid, folder = sample
    configure(sample)
    store.resume_team(pid, tid)
    first = store.next_team_run(pid, tid)
    finish(sample, first, 'result.txt')
    (folder / 'result.txt').write_text('changed outside the workflow', encoding='utf-8')
    with pytest.raises(AltronError, match='artifact_changed'):
        store.next_team_run(pid, tid)
    assert len(store.project(pid)['runs']) == 1
    assert store.project(pid)['tasks'][0]['team']['status'] == 'failed'


def test_restarted_team_needs_explicit_resume_and_keeps_completed_steps(sample):
    store, pid, tid, folder = sample
    store.workspace('backend-one')
    configure(sample)
    store.resume_team(pid, tid)
    first = store.next_team_run(pid, tid)
    finish(sample, first, 'result.txt')
    reopened = Store(store.root)
    reopened.workspace('backend-two')
    assert reopened.project(pid)['tasks'][0]['team']['status'] == 'paused'
    assert reopened.next_team_run(pid, tid) is None
    reopened.resume_team(pid, tid)
    second = reopened.next_team_run(pid, tid)
    assert second['team_step'] == 1 and second['role'] == 'memory'
    assert len(reopened.project(pid)['runs']) == 2


def test_interrupted_unconfirmed_step_is_never_repeated(sample):
    store, pid, tid, folder = sample
    store.workspace('backend-one')
    configure(sample)
    store.resume_team(pid, tid)
    first = store.next_team_run(pid, tid)
    store.bind_run(pid, first['id'], 'active', 'stored-active')
    store.workspace('backend-two')
    assert store.project(pid)['tasks'][0]['team']['status'] == 'unknown'
    assert store.next_team_run(pid, tid) is None
    with pytest.raises(AltronError):
        store.resume_team(pid, tid)
    assert len(store.project(pid)['runs']) == 1


def test_pause_prevents_handoff_and_resuming_active_work(sample):
    store, pid, tid, folder = sample
    configure(sample)
    store.resume_team(pid, tid)
    first = store.next_team_run(pid, tid)
    store.pause_team(pid, tid)
    with pytest.raises(AltronError, match='team_state_unconfirmed'):
        store.resume_team(pid, tid)
    finish(sample, first, 'result.txt')
    assert store.next_team_run(pid, tid) is None
    store.resume_team(pid, tid)
    assert store.next_team_run(pid, tid)['team_step'] == 1


@pytest.mark.parametrize('role', ['reviewer', 'altron', 'unknown'])
def test_automatic_plan_cannot_include_unapproved_reviewer_or_arbitrary_role(sample, role):
    store, pid, tid, folder = sample
    with pytest.raises(AltronError, match='invalid_team_step'):
        store.approve_team(pid, tid, 'plan', [{'role': role, 'goal': 'goal', 'acceptance': 'criteria'}])
    assert store.project(pid)['tasks'][0]['status'] == 'draft'


def test_missing_route_is_not_filled_implicitly(sample):
    store, pid, tid, folder = sample
    with pytest.raises(AltronError, match='team_role_not_configured'):
        store.approve_team(pid, tid, 'plan', [{'role': 'technical', 'goal': 'goal', 'acceptance': 'criteria'}])
    assert store.project(pid)['runs'] == []


def test_team_cannot_address_another_project_task(sample, tmp_path):
    store, pid, tid, folder = sample
    configure(sample)
    other = tmp_path / 'other'
    other.mkdir()
    other_id = store.create_project('Другой', str(other))['id']
    with pytest.raises(AltronError, match='task_not_found'):
        store.resume_team(other_id, tid)
    assert store.project(other_id)['runs'] == []


def test_planner_can_only_propose_steps_without_approving_routes(sample):
    store, pid, tid, folder = sample
    run = store.prepare_run(pid, tid, 'altron', 'planner', 'provider')
    store.bind_run(pid, run['id'], 'planner', 'stored-planner')
    proposed = [{'role': 'memory', 'goal': 'Документ', 'acceptance': 'Документ проверен'}]
    task = store.propose_plan(pid, run['id'], 'Предложенный план', steps=proposed)
    assert task['status'] == 'draft' and task['proposed_steps'] == proposed
    assert not task.get('team')


def test_selected_specialist_has_pinned_provenance_and_matches_role(sample):
    store, pid, tid, folder = sample
    store.set_team(pid, {'memory': {'model': 'model', 'provider': 'provider', 'specialist': 'technical-writer'}})
    store.approve_team(pid, tid, 'Документ', [{'role': 'memory', 'goal': 'Написать', 'acceptance': 'Проверить'}])
    store.resume_team(pid, tid)
    run = store.next_team_run(pid, tid)
    assert run['specialist']['source_commit'] == '6d29a9b08785a0e49ffc9818bbdd381164c2df5f'
    assert run['specialist']['instructions'] in run['prompt']
    with pytest.raises(AltronError, match='specialist_role_mismatch'):
        store.set_team(pid, {'technical': {'model': 'model', 'provider': 'provider', 'specialist': 'technical-writer'}})
