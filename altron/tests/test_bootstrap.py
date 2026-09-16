import hashlib
import importlib.util
import json
import shutil
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from test_maintenance import _maintenance, _valid_archive


@pytest.fixture
def bootstrap(tmp_path):
    source = Path(__file__).resolve().parents[1] / "bootstrap" / "plugin_api.py"
    assert source.is_file(), "The 0.2 upgrade needs a separately importable maintenance profile"
    installed = tmp_path / "bootstrap"
    installed.mkdir()
    shutil.copyfile(source, installed / "plugin_api.py")
    shutil.copyfile(source.parents[1] / "dashboard/maintenance.py", installed / "maintenance.py")
    spec = importlib.util.spec_from_file_location("bootstrap_api", installed / "plugin_api.py")
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    service, old_profile, desktop = _maintenance(tmp_path)
    target = desktop / "profiles" / "existing-altron"
    target.parent.mkdir()
    shutil.move(str(old_profile), target)
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[api.get_root] = lambda: desktop
    with TestClient(app) as client:
        yield client, desktop, target


def test_unstarted_legacy_plan_is_explicitly_cancelled_without_bypassing_active_runs(bootstrap, tmp_path):
    from altron.dashboard.plugin_api import Store
    client, _, profile = bootstrap
    folder = tmp_path / "project"
    folder.mkdir()
    store = Store(profile / "altron")
    pid = store.create_project("Legacy", str(folder))["id"]
    tid = store.create_task(pid, "Old approved task", "Keep history")["id"]
    store.set_team(pid, {"technical": {"model": "m", "provider": "p"}})
    original = store.approve_team(pid, tid, "Unstarted plan", [{"role": "technical", "goal": "G", "acceptance": "A"}])
    base = "/targets/existing-altron/maintenance"
    listing = client.get(base + "/pending-plans")
    assert listing.status_code == 200
    assert listing.json()["plans"] == [{"project_id": pid, "project_name": "Legacy", "task_id": tid, "goal": "Old approved task", "plan": "Unstarted plan"}]
    path = base + f"/pending-plans/{pid}/{tid}/cancel"
    payload = {"confirm": True, "closed_other_windows": True, "reason": "Cancel before update"}
    assert client.post(path, json={**payload, "confirm": False}).status_code == 422
    assert client.post(path, json=payload).status_code == 200
    saved = store.project(pid)["tasks"][0]
    assert saved["status"] == saved["team"]["status"] == "cancelled"
    assert saved["plan"] == original["plan"] and saved["team"]["steps"] == original["team"]["steps"]
    assert store.project(pid)["runs"] == []

    tid2 = store.create_task(pid, "Another task", "A")["id"]
    store.approve_team(pid, tid2, "Plan", [{"role": "technical", "goal": "G", "acceptance": "A"}])
    store.resume_team(pid, tid2)
    store.next_team_run(pid, tid2)
    before = store.project(pid)
    assert client.post(base + f"/pending-plans/{pid}/{tid2}/cancel", json=payload).status_code == 409
    assert store.project(pid) == before


def test_only_existing_altron_profiles_are_offered(bootstrap):
    client, desktop, profile = bootstrap
    unrelated = desktop / "profiles" / "other"
    unrelated.mkdir()
    (unrelated / "config.yaml").write_text("{}")
    assert client.get("/targets").json() == {"profiles": ["existing-altron"]}
    for name in ["other", "missing", "..", "C:private"]:
        assert client.get(f"/targets/{name}/maintenance").status_code != 200
    assert not (desktop / "profiles" / "missing").exists()


def test_explicit_upgrade_and_rollback_preserve_private_files(bootstrap, tmp_path):
    client, desktop, profile = bootstrap
    private = {"config.yaml": b"user: preserved\n", ".env": b"QA_SENTINEL=not-a-credential\n", "auth.json": b'{"qa_sentinel":true}', "SOUL.md": b"My instructions"}
    for name, data in private.items():
        (profile / name).write_bytes(data)
    archive = tmp_path / "release.tar.gz"
    archive.write_bytes(_valid_archive())
    base = "/targets/existing-altron/maintenance"
    assert client.get(base).status_code == 200
    staged = client.post(base + "/stage", json={"archive_path": str(archive), "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()})
    assert staged.status_code == 200
    payload = {"stage_id": staged.json()["id"], "confirm": True}
    assert client.post(base + "/apply", json=payload).status_code == 422
    payload["closed_other_windows"] = True
    assert client.post(base + "/apply", json=payload).json()["requires_restart"] is True
    assert client.get(base).json()["requires_restart"] is True
    assert client.post(base + "/rollback", json={"confirm": False, "closed_other_windows": True}).status_code == 422
    assert client.post(base + "/rollback", json={"confirm": True, "closed_other_windows": True}).json()["status"] == "rolled_back"
    for name, data in private.items():
        assert (profile / name).read_bytes() == data


def test_target_cannot_be_a_link_to_another_directory(bootstrap, tmp_path):
    client, desktop, profile = bootstrap
    alias = desktop / "profiles" / "linked"
    try:
        alias.symlink_to(profile, target_is_directory=True)
    except OSError:
        pytest.skip("Creating symlinks requires permission on this host")
    assert "linked" not in client.get("/targets").json()["profiles"]
    assert client.get("/targets/linked/maintenance").status_code == 404


def test_stage_is_bound_to_the_selected_profile(bootstrap, tmp_path):
    client, desktop, profile = bootstrap
    second = desktop / "profiles" / "second"
    shutil.copytree(profile, second)
    archive = tmp_path / "release.tar.gz"
    archive.write_bytes(_valid_archive())
    staged = client.post("/targets/existing-altron/maintenance/stage", json={"archive_path": str(archive), "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()})
    assert staged.status_code == 200
    result = client.post("/targets/second/maintenance/apply", json={"stage_id": staged.json()["id"], "confirm": True, "closed_other_windows": True})
    assert result.status_code == 409
    assert not (second / "altron/maintenance/backups").exists() or not list((second / "altron/maintenance/backups").iterdir())
