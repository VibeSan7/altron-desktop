from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import importlib
from uuid import uuid4

import pytest

from altron.tests.test_mission_execution import approved, result


class RecordingRuntime:
    """Explicit runtime test double; no model or remote service is contacted."""
    def __init__(self):
        self.sessions = {}
        self.submissions = []
        self.lose_submit_reply = False
        self.interrupts = []

    def can_create(self, mission):
        return True

    def create(self, mission, turn):
        sid = uuid4().hex
        stored = 'stored-' + sid
        self.sessions[sid] = {'state': 'idle', 'stored_id': stored}
        return {'session_id': sid, 'stored_session_id': stored}

    def bind(self, mission, turn, runtime_id, stored_id):
        assert self.sessions[runtime_id]['stored_id'] == stored_id

    def ready(self, mission, turn):
        return True

    def submit(self, mission, turn, prompt):
        self.submissions.append((mission['id'], turn['id'], mission['connection'], prompt))
        self.sessions[turn['runtime_id']]['state'] = 'active'
        if self.lose_submit_reply:
            raise TimeoutError('Simulated lost reply after actual submission')
        return {'status': 'streaming'}

    def observe(self, mission, turn):
        return dict(self.sessions[turn['runtime_id']])

    @contextmanager
    def fence(self, mission, turn):
        yield {'state': 'stopped' if self.sessions[turn['runtime_id']]['state'] == 'idle' else 'active'}

    def interrupt(self, mission, turn):
        self.interrupts.append(turn['runtime_id'])


def controller(missions, adapter):
    assert importlib.util.find_spec('altron.dashboard.autonomous_runtime'), 'Backend-owned controller is not implemented'
    return importlib.import_module('altron.dashboard.autonomous_runtime').Controller(missions, adapter)


def drive_to_running(c, mission_id):
    for _ in range(10):
        c.tick()
        saved = c.missions.get(mission_id)
        if saved['status'] == 'running':
            return saved
    pytest.fail('Controller did not start its approved pending turn')


def complete(c, runtime, mission, payload):
    sid = mission['turns'][-1]['runtime_id']
    c.missions.update(sid, payload)
    c.missions.terminal(sid, 'complete')
    runtime.sessions[sid]['state'] = 'idle'
    c.tick()
    return c.missions.get(mission['id'])


def test_two_controllers_have_one_dispatch_winner(tmp_path):
    missions, mission, target = approved(tmp_path)
    runtime = RecordingRuntime()
    a, b = controller(missions, runtime), controller(missions, runtime)
    for _ in range(5):
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda c: c.tick(), (a, b)))
    saved = missions.get(mission['id'])
    assert saved['status'] == 'running'
    assert len(runtime.submissions) == 1
    assert saved['approval'] == mission['approval']
    assert runtime.submissions[0][2] == mission['approval']['connection']


def test_lost_ack_is_unknown_and_never_automatically_resubmitted(tmp_path):
    missions, mission, target = approved(tmp_path)
    runtime = RecordingRuntime()
    runtime.lose_submit_reply = True
    c = controller(missions, runtime)
    for _ in range(5):
        c.tick()
    assert missions.get(mission['id'])['status'] == 'unknown'
    assert len(runtime.submissions) == 1
    assert runtime.sessions[missions.get(mission['id'])['turns'][-1]['runtime_id']]['state'] == 'active'


def test_multiple_checkpoints_reach_real_result_without_more_approvals(tmp_path):
    missions, mission, target = approved(tmp_path)
    runtime = RecordingRuntime()
    c = controller(missions, runtime)
    first = drive_to_running(c, mission['id'])
    complete(c, runtime, first, {'action': 'checkpoint', 'summary': 'Research done. Create the result next.'})
    second = drive_to_running(c, mission['id'])
    (target / 'report.txt').write_text('Findings: a real file', encoding='utf-8')
    ready = complete(c, runtime, second, {'action': 'result', 'summary': 'Finished', 'paths': ['report.txt'], 'instructions': 'Open the report'})
    assert ready['status'] == 'ready'
    assert ready['approval'] == mission['approval']
    assert len(runtime.submissions) == 2
    assert 'Research done.' in runtime.submissions[-1][3]
    assert ready['artifacts'][0]['bytes'] == (target / 'report.txt').stat().st_size


def test_terminal_receipt_waits_until_runtime_is_actually_stopped(tmp_path):
    missions, mission, target = approved(tmp_path)
    runtime = RecordingRuntime()
    c = controller(missions, runtime)
    running = drive_to_running(c, mission['id'])
    (target / 'report.txt').write_text('Findings', encoding='utf-8')
    result(missions, running)
    sid = running['turns'][-1]['runtime_id']
    missions.terminal(sid, 'complete')
    c.tick()
    assert missions.get(mission['id'])['status'] == 'running'
    runtime.sessions[sid]['state'] = 'idle'
    c.tick()
    assert missions.get(mission['id'])['status'] == 'ready'


def test_cancel_does_not_claim_active_runtime_stopped(tmp_path):
    missions, mission, target = approved(tmp_path)
    runtime = RecordingRuntime()
    c = controller(missions, runtime)
    running = drive_to_running(c, mission['id'])
    c.cancel(mission['id'])
    c.tick()
    assert missions.get(mission['id'])['status'] == 'cancel_requested'
    assert runtime.interrupts
    sid = running['turns'][-1]['runtime_id']
    missions.terminal(sid, 'interrupted')
    runtime.sessions[sid]['state'] = 'idle'
    c.tick()
    assert missions.get(mission['id'])['status'] == 'cancelled'


def test_restart_preserves_unknown_execution_and_recovery_checks_liveness(tmp_path):
    missions, mission, target = approved(tmp_path)
    runtime = RecordingRuntime()
    c = controller(missions, runtime)
    running = drive_to_running(c, mission['id'])
    missions.reconcile('different-backend-epoch')
    assert missions.get(mission['id'])['status'] == 'unknown'
    with pytest.raises(ValueError, match='run_still_active'):
        c.recover(mission['id'])
    assert len(runtime.submissions) == 1
    runtime.sessions[running['turns'][-1]['runtime_id']]['state'] = 'idle'
    recovered = c.recover(mission['id'])
    assert recovered['status'] in {'queued', 'prepared'}
    assert recovered['approval'] == mission['approval']
    assert recovered['turns'][-1]['id'] != running['turns'][-1]['id'] or recovered['turns'][-1]['settled']


def test_unknown_without_terminal_cannot_be_reported_as_ready(tmp_path):
    missions, mission, target = approved(tmp_path)
    runtime = RecordingRuntime()
    c = controller(missions, runtime)
    running = drive_to_running(c, mission['id'])
    runtime.sessions[running['turns'][-1]['runtime_id']]['state'] = 'idle'
    c.tick()
    assert missions.get(mission['id'])['status'] == 'unknown'
    assert len(runtime.submissions) == 1


def test_prepared_ui_turn_is_not_stolen_by_background_scheduler(tmp_path):
    from altron.dashboard.plugin_api import Store
    from altron.tests.test_missions import mission_store
    missions = mission_store(Store(tmp_path / 'data'))
    mission = missions.create('Interview', 'model', 'provider', 'profile')
    runtime = RecordingRuntime()
    c = controller(missions, runtime)
    for _ in range(3):
        c.tick()
    assert missions.get(mission['id'])['status'] == 'prepared'
    assert not runtime.sessions and not runtime.submissions


def test_explicit_revision_preserves_approval_and_renews_only_budget(tmp_path):
    missions, mission, target = approved(tmp_path)
    runtime = RecordingRuntime()
    c = controller(missions, runtime)
    running = drive_to_running(c, mission['id'])
    (target / 'report.txt').write_text('Findings: a real file', encoding='utf-8')
    ready = complete(c, runtime, running, {'action': 'result', 'summary': 'Done', 'paths': ['report.txt'], 'instructions': 'Read it'})
    assert hasattr(c, 'revise'), 'Explicit result revision is not implemented'
    revised = c.revise(mission['id'], 'Make the explanation clearer', 2, 4)
    assert revised['status'] == 'prepared'
    assert revised['approval'] == ready['approval']
    assert revised['revision_budget']['limits'] == {'max_turns': 2, 'max_hours': 4}
    assert revised['feedback'] == 'Make the explanation clearer'
    c.tick()
    assert len(runtime.submissions) == 1


@pytest.mark.parametrize('initialized', [False, True])
def test_deadline_during_initialization_stops_without_submitting(tmp_path, initialized):
    missions, mission, _ = approved(tmp_path)
    runtime = RecordingRuntime()
    c = controller(missions, runtime)
    c.tick()
    c.tick()
    bound = missions.get(mission['id'])
    assert bound['status'] == 'bound'
    runtime.ready = lambda *_: initialized
    with missions.changing(mission['id']) as (saved, _):
        saved['approval']['deadline_at'] = '2000-01-01T00:00:00+00:00'
    c.tick()
    assert missions.get(mission['id'])['status'] == 'cancel_requested'
    assert not runtime.submissions
    c.tick()
    stopped = missions.get(mission['id'])
    assert stopped['status'] == 'blocked'
    assert stopped['blocker'] == 'time_limit'
    assert stopped['turns'][-1]['settled']
    assert not runtime.submissions


def test_native_event_receipt_completes_without_a_lifecycle_end_hook(tmp_path):
    missions, mission, target = approved(tmp_path)
    runtime = RecordingRuntime()
    c = controller(missions, runtime)
    running = drive_to_running(c, mission['id'])
    (target / 'report.txt').write_text('Findings: checked', encoding='utf-8')
    result(missions, running)
    sid = running['turns'][-1]['runtime_id']
    runtime.sessions[sid].update(state='idle', terminal_status='complete')
    c.tick()
    assert missions.get(mission['id'])['status'] == 'ready'
