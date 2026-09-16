import hashlib

from fastapi import FastAPI
from fastapi.testclient import TestClient

from altron.dashboard import plugin_api as api
from test_maintenance import _maintenance, _valid_archive


def test_maintenance_http_checks_then_updates_and_requires_restart(tmp_path, monkeypatch):
    service, profile, desktop = _maintenance(tmp_path)
    archive = tmp_path / "update.tar.gz"
    archive.write_bytes(_valid_archive())
    assert hasattr(api, "get_maintenance")
    app = FastAPI()
    app.include_router(api.router, prefix="/api/plugins/altron")
    app.dependency_overrides[api.get_maintenance] = lambda: service
    monkeypatch.setattr(api, "get_maintenance", lambda: service)
    with TestClient(app) as client:
        base = "/api/plugins/altron/maintenance"
        assert client.get(base).json()["requires_restart"] is False
        response = client.post(base + "/stage", json={"archive_path": str(archive), "sha256": "0" * 64})
        assert response.status_code == 409
        assert response.json()["detail"] == "archive_checksum_mismatch"
        staged = client.post(base + "/stage", json={"archive_path": str(archive), "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()})
        assert staged.status_code == 200
        assert client.post(base + "/apply", json={"stage_id": staged.json()["id"], "confirm": False}).status_code == 422
        result = client.post(base + "/apply", json={"stage_id": staged.json()["id"], "confirm": True})
        assert result.status_code == 200
        assert result.json()["requires_restart"] is True
        assert client.get(base).json()["requires_restart"] is True
        work = tmp_path / "project"
        work.mkdir()
        response = client.post("/api/plugins/altron/projects", json={"name": "blocked", "directory": str(work)})
        assert response.status_code == 409
        assert response.json()["detail"] == "restart_required"
        assert client.post(base + "/rollback", json={"confirm": False}).status_code == 422
        assert client.post(base + "/rollback", json={"confirm": True}).json()["requires_restart"] is True
        assert client.get(base).json()["requires_restart"] is True
        monkeypatch.setattr(api, "_MAINTENANCE_BASELINES", {})
        assert client.get(base).json()["requires_restart"] is True, "Reloading modules is not restarting the backend"
        pid = api.os.getpid()
        monkeypatch.setattr(api.os, "getpid", lambda: pid + 1)
        assert client.get(base).json()["requires_restart"] is False
        assert client.post("/api/plugins/altron/projects", json={"name": "restored", "directory": str(work)}).status_code == 200


def test_running_store_refuses_pending_recovery(tmp_path):
    service, profile, desktop = _maintenance(tmp_path)
    assert hasattr(api, "check_maintenance")
    service.maintenance.mkdir()
    service.journal_path.write_text('{"schema":1,"events":[],"operation":{"state":"recovery_required"}}')
    import pytest
    with pytest.raises(api.AltronError, match="recovery_required"):
        api.check_maintenance(service)
