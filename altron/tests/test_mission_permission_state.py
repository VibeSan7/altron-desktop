from types import SimpleNamespace
from altron.dashboard.autonomous_runtime import Controller, EPOCH
from altron.tests.test_mission_execution import approved, working


def test_native_approval_wait_is_visible_without_claiming_worker_stopped(tmp_path):
    missions, mission, _ = approved(tmp_path)
    running = working(missions, mission)
    observed = {'state': 'active', 'needs_permission': True}
    controller = Controller(missions, SimpleNamespace(observe=lambda *args: observed))
    missions.own(running['id'], running['turns'][-1]['id'], controller.owner, EPOCH)
    controller._advance(missions.get(running['id']))
    current = missions.get(mission['id'])
    assert current['status'] == 'running'
    assert current['blocker'] == 'permission_pending'
    assert current['turns'][-1]['terminal_status'] is None
    observed['needs_permission'] = False
    controller._advance(current)
    assert missions.get(mission['id'])['blocker'] is None
