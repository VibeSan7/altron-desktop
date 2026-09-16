from altron.tests.test_mission_execution import approved
from altron.tests.test_autonomous_runtime import RecordingRuntime, controller


def test_explicit_reconnect_reserves_prepared_turn_without_dispatching(tmp_path):
    missions, mission, _ = approved(tmp_path)
    runtime = RecordingRuntime()
    c = controller(missions, runtime)
    c.tick()
    assert missions.get(mission['id'])['status'] == 'prepared'
    assert hasattr(c, 'resume'), 'Explicit connection recovery is not implemented'
    saved = c.resume(mission['id'])
    c.tick()
    assert saved['status'] == 'prepared'
    assert not runtime.submissions and not runtime.sessions
    assert not missions.claim_creation(mission['id'], saved['turns'][-1]['id'], 'other-owner', 'epoch')
