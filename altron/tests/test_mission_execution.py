from copy import deepcopy
import json
from pathlib import Path

import pytest

from altron.dashboard.plugin_api import Store
from altron.tests.test_missions import CONTRACT, report_interview, mission_store


def approved(tmp_path, *, commands=False, max_turns=3):
    store = Store(tmp_path / 'data')
    missions = mission_store(store)
    proposal = deepcopy(CONTRACT)
    if commands:
        proposal['checks'].append({'id': 'tests', 'label': 'Run the tests', 'kind': 'command', 'command': 'python -m unittest'})
    mission = report_interview(missions, missions.create('Investigate', 'model', 'provider', 'profile'), contract=proposal)
    target = tmp_path / 'project'
    target.mkdir()
    return missions, missions.approve(mission['id'], mission['revision'], str(target), max_turns, 168), target


def working(missions, mission):
    mission = missions.prepare(mission['id'])
    turn = mission['turns'][-1]
    missions.bind(mission['id'], turn['id'], 'runtime-' + turn['id'], 'stored-' + turn['id'])
    assert missions.claim(mission['id'], turn['id'])
    return missions.get(mission['id'])


def end(missions, mission, status='complete'):
    turn = mission['turns'][-1]
    missions.terminal(turn['runtime_id'], status)
    return missions.settle(mission['id'], turn['id'])


def result(missions, mission):
    return missions.update(mission['turns'][-1]['runtime_id'], {
        'action': 'result', 'summary': 'Findings are ready', 'paths': ['report.txt'], 'instructions': 'Open report.txt',
    })


def test_checkpoint_advances_without_new_approval(tmp_path):
    missions, mission, target = approved(tmp_path)
    first = working(missions, mission)
    missions.update(first['turns'][-1]['runtime_id'], {'action': 'checkpoint', 'summary': 'Gathered evidence. Write the report next.'})
    queued = end(missions, first)
    assert queued['status'] == 'queued'
    second = working(missions, queued)
    assert second['approval'] == first['approval']
    assert second['checkpoint'].startswith('Gathered evidence')
    assert second['turns'][-1]['id'] != first['turns'][-1]['id']


def test_real_result_waits_for_terminal_and_fence_and_is_not_user_acceptance(tmp_path):
    missions, mission, target = approved(tmp_path)
    running = working(missions, mission)
    (target / 'report.txt').write_text('Findings: the result', encoding='utf-8')
    result(missions, running)
    assert missions.get(mission['id'])['status'] == 'running'
    ready = end(missions, running)
    assert ready['status'] == 'ready'
    assert ready['instructions'] == 'Open report.txt'
    assert ready['verification'][0]['passed'] is True
    assert ready['artifacts'][0]['sha256']
    assert 'acceptance_review' not in ready


def test_plain_model_completion_does_not_mean_ready(tmp_path):
    missions, mission, target = approved(tmp_path)
    running = working(missions, mission)
    assert end(missions, running)['status'] == 'blocked'


def test_failed_file_check_queues_repair_and_later_succeeds(tmp_path):
    missions, mission, target = approved(tmp_path)
    running = working(missions, mission)
    (target / 'report.txt').write_text('Not a report', encoding='utf-8')
    result(missions, running)
    repair = end(missions, running)
    assert repair['status'] == 'queued'
    assert repair['verification'][0]['passed'] is False
    running = working(missions, repair)
    (target / 'report.txt').write_text('Findings: fixed', encoding='utf-8')
    result(missions, running)
    assert end(missions, running)['status'] == 'ready'


def test_command_check_requires_actual_matching_success_receipt(tmp_path):
    missions, mission, target = approved(tmp_path, commands=True)
    running = working(missions, mission)
    (target / 'report.txt').write_text('Findings', encoding='utf-8')
    result(missions, running)
    repair = end(missions, running)
    assert repair['status'] == 'queued'
    running = working(missions, repair)
    sid = running['turns'][-1]['runtime_id']
    args = {'command': 'python -m unittest', 'workdir': str(target)}
    missions.before_tool(sid, 'terminal', args, 'check-1')
    missions.after_tool(sid, 'terminal', args, json.dumps({'exit_code': 0, 'output': 'OK'}), 'check-1', 'ok')
    result(missions, running)
    ready = end(missions, running)
    assert ready['status'] == 'ready'
    assert ready['verification'][1]['source'] == 'terminal_receipt'


@pytest.mark.parametrize('receipt', [
    {'exit_code': 1, 'output': 'FAILED'}, {'session_id': 'still-running', 'output': 'Started'},
    {'output': 'Everything passed'}, {'exit_code': True},
])
def test_incomplete_or_failed_tool_receipts_never_pass(tmp_path, receipt):
    missions, mission, target = approved(tmp_path, commands=True)
    running = working(missions, mission)
    sid = running['turns'][-1]['runtime_id']
    (target / 'report.txt').write_text('Findings', encoding='utf-8')
    args = {'command': 'python -m unittest', 'workdir': str(target)}
    missions.before_tool(sid, 'terminal', args, 'check-1')
    missions.after_tool(sid, 'terminal', args, json.dumps(receipt), 'check-1', 'ok')
    result(missions, running)
    assert end(missions, running)['status'] != 'ready'


def test_edit_after_a_successful_check_invalidates_it(tmp_path):
    missions, mission, target = approved(tmp_path, commands=True)
    running = working(missions, mission)
    sid = running['turns'][-1]['runtime_id']
    (target / 'report.txt').write_text('Findings', encoding='utf-8')
    args = {'command': 'python -m unittest', 'workdir': str(target)}
    missions.before_tool(sid, 'terminal', args, 'check-1')
    missions.after_tool(sid, 'terminal', args, {'exit_code': 0}, 'check-1', 'ok')
    missions.before_tool(sid, 'write_file', {'path': str(target / 'report.txt')}, 'edit-1')
    result(missions, running)
    assert end(missions, running)['status'] == 'queued'


def test_file_change_after_receipt_invalidates_it_even_without_an_agent_tool(tmp_path):
    missions, mission, target = approved(tmp_path, commands=True)
    running = working(missions, mission)
    sid = running['turns'][-1]['runtime_id']
    (target / 'report.txt').write_text('Findings', encoding='utf-8')
    args = {'command': 'python -m unittest', 'workdir': str(target)}
    missions.before_tool(sid, 'terminal', args, 'check-1')
    missions.after_tool(sid, 'terminal', args, {'exit_code': 0}, 'check-1', 'ok')
    (target / 'report.txt').write_text('Findings changed', encoding='utf-8')
    result(missions, running)
    assert end(missions, running)['status'] == 'queued'


def test_turn_limit_blocks_without_dispatching_again(tmp_path):
    missions, mission, target = approved(tmp_path, max_turns=1)
    running = working(missions, mission)
    missions.update(running['turns'][-1]['runtime_id'], {'action': 'checkpoint', 'summary': 'Need more work'})
    queued = end(missions, running)
    limited = missions.prepare(queued['id'])
    assert limited['status'] == 'blocked'
    assert limited['blocker'] == 'turn_limit'
    assert len(limited['turns']) == len(queued['turns'])


def test_deadline_blocks_without_dispatching_again(tmp_path):
    missions, mission, target = approved(tmp_path)
    with missions.changing(mission['id']) as (saved, _):
        saved['approval']['deadline_at'] = '2000-01-01T00:00:00+00:00'
    assert missions.prepare(mission['id'])['blocker'] == 'time_limit'


def test_expired_deadline_cannot_be_claimed_after_binding(tmp_path):
    missions, mission, _ = approved(tmp_path)
    prepared = missions.prepare(mission['id'])
    turn = prepared['turns'][-1]
    missions.bind(mission['id'], turn['id'], 'runtime-expired', 'stored-expired')
    with missions.changing(mission['id']) as (saved, _):
        saved['approval']['deadline_at'] = '2000-01-01T00:00:00+00:00'
    assert not missions.claim(mission['id'], turn['id'])
    saved = missions.get(mission['id'])
    assert saved['status'] == 'cancel_requested'
    assert saved['stop_reason'] == 'time_limit'
    assert not saved['turns'][-1].get('started_at')
    assert not saved['turns'][-1]['settled']


def test_interview_hook_denies_execution_tools(tmp_path):
    missions = mission_store(Store(tmp_path / 'data'))
    mission = missions.create('Discover the need', 'model', 'provider', 'profile')
    turn = mission['turns'][-1]
    missions.bind(mission['id'], turn['id'], 'r', 's')
    missions.claim(mission['id'], turn['id'])
    with pytest.raises(ValueError, match='interview_tools_only'):
        missions.before_tool('r', 'terminal', {'command': 'anything'}, 'call')
    missions.before_tool('r', 'altron_context', {}, 'context')
