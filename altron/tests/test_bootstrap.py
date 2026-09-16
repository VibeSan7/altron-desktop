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
