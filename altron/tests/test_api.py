import importlib

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest


@pytest.fixture
def client(tmp_path):
    module = importlib.import_module("altron.dashboard.plugin_api")
    assert hasattr(module, "router"), "Altron HTTP API is not implemented"
    app = FastAPI()
    app.include_router(module.router, prefix="/api/plugins/altron")
    app.dependency_overrides[module.get_store] = lambda: module.Store(tmp_path / "api-data")
    with TestClient(app) as value:
        yield value


def test_http_project_task_and_approval_round_trip(client, tmp_path):
    root = tmp_path / "workspace"
    root.mkdir()
    response = client.post("/api/plugins/altron/projects", json={"name": "Сайт", "directory": str(root)})
    assert response.status_code == 200
    pid = response.json()["id"]
    task = client.post(f"/api/plugins/altron/projects/{pid}/tasks", json={"goal": "Документ", "acceptance": "Файл открывается"}).json()
    response = client.post(f"/api/plugins/altron/projects/{pid}/tasks/{task['id']}/approve", json={"plan": "Написать и проверить"})
    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    project = client.get(f"/api/plugins/altron/projects/{pid}").json()
    assert project["tasks"][0]["id"] == task["id"]
    assert client.get("/api/plugins/altron/projects").json()[0]["id"] == pid


def test_http_rejects_unknown_fields_and_empty_inputs(client, tmp_path):
    root = tmp_path / "workspace"
    root.mkdir()
    response = client.post("/api/plugins/altron/projects", json={"name": "Сайт", "directory": str(root), "api_key": "never-needed"})
    assert response.status_code == 422
    response = client.post("/api/plugins/altron/projects", json={"name": "", "directory": str(root)})
    assert response.status_code == 422
    assert client.get("/api/plugins/altron/projects").json() == []


def test_http_cannot_accept_a_task_without_evidence(client, tmp_path):
    root = tmp_path / "workspace"
    root.mkdir()
    pid = client.post("/api/plugins/altron/projects", json={"name": "Сайт", "directory": str(root)}).json()["id"]
    tid = client.post(f"/api/plugins/altron/projects/{pid}/tasks", json={"goal": "Документ", "acceptance": "Файл"}).json()["id"]
    response = client.post(f"/api/plugins/altron/projects/{pid}/tasks/{tid}/accept", json={"review": "Просто готово"})
    assert response.status_code == 409
    assert response.json()["detail"] == "task_not_in_review"


def test_http_team_plan_routes_and_explicit_start(client, tmp_path):
    folder = tmp_path / 'team-project'
    folder.mkdir()
    base = '/api/plugins/altron'
    pid = client.post(base + '/projects', json={'name': 'Команда', 'directory': str(folder)}).json()['id']
    task = client.post(f'{base}/projects/{pid}/tasks', json={'goal': 'Результат', 'acceptance': 'Файл'}).json()
    path = f'{base}/projects/{pid}/tasks/{task["id"]}/team'
    assignments = {'memory': {'model': 'chosen', 'provider': 'explicit', 'specialist': 'technical-writer'}}
    response = client.post(f'{base}/projects/{pid}/team', json={'assignments': assignments})
    assert response.status_code == 200
    steps = [{'role': 'memory', 'goal': 'Документ', 'acceptance': 'Файл открывается'}]
    assert client.post(path + '/approve', json={'plan': 'Создать документ', 'steps': steps}).status_code == 200
    assert client.post(path + '/next').json() is None
    assert client.post(path + '/resume').status_code == 200
    run = client.post(path + '/next').json()
    assert run['model'] == 'chosen' and run['specialist']['id'] == 'technical-writer'
    assert client.post(path + '/next').json() is None
    assert client.post(path + '/pause').json()['team']['status'] == 'paused'
    assert client.post(path + '/resume').status_code == 409
    catalog = client.get(base + '/specialists').json()
    assert len(catalog['specialists']) == 4
    invalid = client.post(f'{base}/projects/{pid}/team', json={'assignments': {'memory': {'model': 'chosen', 'provider': 'explicit', 'password': 'not-used'}}})
    assert invalid.status_code == 422


def test_http_missing_project_is_not_silently_created(client):
    response = client.get("/api/plugins/altron/projects/missing")
    assert response.status_code == 404
    assert client.get("/api/plugins/altron/projects").json() == []
