import pytest
from altron.dashboard.plugin_api import Store
from altron.tests.test_missions import mission_store
from altron.tests.test_mission_execution import approved, working, result, end


def test_interview_accepts_only_its_deferred_protocol(tmp_path):
    missions = mission_store(Store(tmp_path / 'data'))
    mission = missions.create('Interview', 'model', 'provider', 'profile')
    turn = mission['turns'][-1]
    missions.bind(mission['id'], turn['id'], 'r', 's')
    missions.claim(mission['id'], turn['id'])
    missions.before_tool('r', 'tool_describe', {'names': ['altron_context', 'altron_update']}, 'describe')
    missions.before_tool('r', 'tool_call', {'calls': [{'name': 'altron_context', 'arguments': {}}]}, 'context')
    for name, args in [('tool_describe', {'names': ['terminal']}), ('tool_call', {'calls': []}),
                       ('tool_call', {'calls': [{'name': 'terminal', 'arguments': {'command': 'no'}}]}),
                       ('tool_call', {'calls': [{'name': 'altron_context', 'arguments': {}}, {'name': 'write_file', 'arguments': {}}]})]:
        with pytest.raises(ValueError, match='interview_tools_only'):
            missions.before_tool('r', name, args, 'blocked')


def test_deferred_result_does_not_invalidate_a_real_terminal_receipt(tmp_path):
    missions, mission, target = approved(tmp_path, commands=True)
    running = working(missions, mission)
    sid = running['turns'][-1]['runtime_id']
    (target / 'report.txt').write_text('Findings', encoding='utf-8')
    args = {'command': 'python -m unittest', 'workdir': str(target)}
    missions.before_tool(sid, 'terminal', args, 'check')
    missions.after_tool(sid, 'terminal', args, {'exit_code': 0}, 'check', 'ok')
    missions.before_tool(sid, 'tool_call', {'calls': [{'name': 'altron_update', 'arguments': {'action': 'result'}}]}, 'report')
    result(missions, running)
    assert end(missions, running)['status'] == 'ready'


def test_deferred_report_cannot_bypass_expired_authorization(tmp_path):
    missions, mission, target = approved(tmp_path)
    running = working(missions, mission)
    with missions.changing(mission['id']) as (saved, _):
        saved['approval']['deadline_at'] = '2000-01-01T00:00:00+00:00'
    with pytest.raises(ValueError, match='time_limit'):
        missions.before_tool(running['turns'][-1]['runtime_id'], 'tool_call',
                             {'calls': [{'name': 'altron_update', 'arguments': {'action': 'result'}}]}, 'report')


@pytest.mark.parametrize('denial', [
    {'exit_code': -1, 'error': 'BLOCKED: user declined; do not retry'},
    {'exit_code': -1, 'approval_pending': True},
    {'exit_code': -1, 'user_consent': False},
])
def test_native_permission_denial_never_schedules_automatic_repair(tmp_path, denial):
    missions, mission, target = approved(tmp_path, commands=True)
    running = working(missions, mission)
    sid = running['turns'][-1]['runtime_id']
    (target / 'report.txt').write_text('Findings', encoding='utf-8')
    args = {'command': 'python -m unittest', 'workdir': str(target)}
    missions.before_tool(sid, 'terminal', args, 'check')
    missions.after_tool(sid, 'terminal', args, denial, 'check', 'error')
    with pytest.raises(ValueError, match='permission_required'):
        missions.before_tool(sid, 'terminal', args, 'retry')
    result(missions, running)
    settled = end(missions, running)
    assert settled['status'] == 'blocked'
    assert settled['blocker'] == 'permission_required'
