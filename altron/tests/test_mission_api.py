from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from altron.dashboard import plugin_api as api
from altron.tests.test_missions import report_interview
from altron.tests.test_autonomous_runtime import RecordingRuntime


@pytest.fixture
def client(monkeypatch, tmp_path):
    store = api.Store(tmp_path / 'profile' / 'altron')
    monkeypatch.setattr(api, 'get_store', lambda: store)
    instances = []
    def controller(missions):
        if not instances:
            runtime = api.mission_component('autonomous_runtime')
            adapter = RecordingRuntime(); adapter.can_create = lambda mission: False
            instances.append(runtime.Controller(missions, adapter))
        return instances[0]
    monkeypatch.setattr(api, 'get_mission_controller', controller, raising=False)
    app = FastAPI(); app.include_router(api.router)
    # Routers retain the original dependency object after module registration.
    for route in app.routes:
        for dependency in getattr(getattr(route, 'dependant', None), 'dependencies', []):
            if dependency.call.__name__ == 'get_store':
                app.dependency_overrides[dependency.call] = lambda: store
    with TestClient(app) as http:
        yield http, store, instances


def create(http):
    response = http.post('/missions', json={'message': 'Help me find the right project',
        'model': 'org/model:exact', 'provider': 'custom:chosen', 'profile': 'altron'})
    assert response.status_code == 200, response.text
    return response.json()


def test_saved_interview_round_trip_does_not_create_a_project_or_call_a_model(client):
    http, store, controllers = client
    mission = create(http)
    assert http.get(f"/missions/{mission['id']}").json()['transcript'][0]['text'] == 'Help me find the right project'
    assert http.get('/missions').json()[0]['id'] == mission['id']
    assert store.projects() == [] and controllers == []


def test_final_approval_is_atomic_strict_and_idempotent(client, tmp_path):
    http, store, controllers = client
    mission = create(http)
    missions = api.get_missions(store)
    proposal = report_interview(missions, mission)
    directory = tmp_path / 'project'; directory.mkdir()
    body = {'revision': proposal['revision'], 'directory': str(directory), 'max_turns': 3, 'max_hours': 12, 'confirm': True}
    endpoint = f"/missions/{mission['id']}/approve"
    assert http.post(endpoint, json={**body, 'confirm': 1}).status_code == 422
    assert http.post(endpoint, json={**body, 'provider': 'other'}).status_code == 422
    assert store.projects() == []
    first = http.post(endpoint, json=body)
    assert first.status_code == 200, first.text
    again = http.post(endpoint, json=body)
    assert again.status_code == 200, again.text
    assert first.json()['project_id'] == again.json()['project_id']
    assert len(store.projects()) == 1
    assert not controllers[0].adapter.submissions


def test_operator_api_does_not_accept_a_forged_worker_receipt(client):
    http, store, _ = client
    mission = create(http)
    response = http.post(f"/missions/{mission['id']}/bind", json={
        'turn_id': mission['turns'][-1]['id'], 'runtime_id': 'r', 'stored_id': 's', 'terminal_status': 'complete'})
    assert response.status_code == 422
    assert api.get_missions(store).get(mission['id'])['turns'][-1]['runtime_id'] is None


def test_cancel_before_binding_does_not_invent_an_executor_receipt(client):
    http, store, controllers = client
    mission = create(http)
    result = http.post(f"/missions/{mission['id']}/cancel", json={'confirm': True})
    assert result.status_code == 200, result.text
    assert result.json()['status'] == 'cancelled'
    assert result.json()['turns'][-1]['terminal_status'] is None
    assert not controllers
