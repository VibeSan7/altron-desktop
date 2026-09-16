import hashlib
import io
import json
import sqlite3
import tarfile
from pathlib import Path

import pytest

from altron.dashboard.maintenance import Maintenance, MaintenanceError


REQUIRED = {
    "plugins/altron/__init__.py": b"old init\n",
    "plugins/altron/plugin.yaml": b"old plugin\n",
    "plugins/altron/dashboard/plugin_api.py": b"old api\n",
    "desktop-plugins/altron/plugin.js": b"old desktop\n",
}


def _make_profile(root, *, document=None, user_version=1):
    profile = root / "profile"
    desktop = root / "desktop"
    for relative, content in REQUIRED.items():
        target = (profile if relative.startswith("plugins/") else desktop) / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    data = profile / "altron"
    data.mkdir(parents=True, exist_ok=True)
    db_path = data / "altron.db"
    db = sqlite3.connect(db_path)
    db.execute("PRAGMA user_version = ?".replace("?", str(user_version)))
    db.execute("CREATE TABLE altron_projects (id TEXT PRIMARY KEY, document TEXT NOT NULL)")
    db.execute("CREATE TABLE altron_sessions (runtime_id TEXT PRIMARY KEY, stored_id TEXT UNIQUE NOT NULL, project_id TEXT NOT NULL, run_id TEXT NOT NULL UNIQUE)")
    if document is not None:
        db.execute("INSERT INTO altron_projects VALUES (?, ?)", (document["id"], json.dumps(document)))
    db.commit()
    db.close()
    (profile / "config.yaml").write_bytes(b"private: old\n")
    (profile / "auth.json").write_bytes(b'{"token":"private"}\n')
    (profile / "project-data.txt").write_bytes(b"do not touch\n")
    return profile, desktop


def _archive(files, *, version="0.3.0", data_version=1, extra_manifest=None, members=None):
    manifest = {
        "format": 1,
        "version": version,
        "data_version": data_version,
        "files": {name: hashlib.sha256(content).hexdigest() for name, content in files.items()},
    }
    if extra_manifest:
        manifest.update(extra_manifest)
    entries = [("altron/release.json", json.dumps(manifest, separators=(",", ":")).encode())]
    entries.extend((f"altron/{name}", content) for name, content in files.items())
    if members is not None:
        entries = members
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as archive:
        root = tarfile.TarInfo("altron/")
        root.type = tarfile.DIRTYPE
        archive.addfile(root)
        for name, content in entries:
            if isinstance(name, tarfile.TarInfo):
                archive.addfile(name, io.BytesIO(content) if content else None)
                continue
            info = tarfile.TarInfo(name)
            info.size = len(content)
            archive.addfile(info, io.BytesIO(content))
    return output.getvalue()


def _valid_archive():
    return _archive({name: content.replace(b"old", b"new") for name, content in REQUIRED.items()})


def _maintenance(tmp_path, **kwargs):
    profile, desktop = _make_profile(tmp_path, **kwargs)
    return Maintenance(profile, desktop), profile, desktop


def test_stage_does_not_modify_installed_code_and_apply_rollback_preserves_data(tmp_path):
    maintenance, profile, desktop = _maintenance(tmp_path)
    archive = _valid_archive()
    expected = hashlib.sha256(archive).hexdigest()

    staged = maintenance.stage(archive, expected)

    assert staged["version"] == "0.3.0"
    assert staged["files"] == sorted(REQUIRED)
    assert (profile / "plugins/altron/__init__.py").read_bytes() == REQUIRED["plugins/altron/__init__.py"]
    assert (desktop / "desktop-plugins/altron/plugin.js").read_bytes() == REQUIRED["desktop-plugins/altron/plugin.js"]

    applied = maintenance.apply(staged["id"])
    assert applied["status"] == "applied"
    assert applied["requires_restart"] is True
    assert applied["version"] == "0.3.0"
    assert (profile / "plugins/altron/__init__.py").read_bytes() == b"new init\n"
    assert (profile / "config.yaml").read_bytes() == b"private: old\n"
    assert (profile / "auth.json").read_bytes() == b'{"token":"private"}\n'
    assert (profile / "project-data.txt").read_bytes() == b"do not touch\n"

    rolled_back = maintenance.rollback()
    assert rolled_back == {"status": "rolled_back", "requires_restart": True}
    for relative, content in REQUIRED.items():
        target = (profile if relative.startswith("plugins/") else desktop) / relative
        assert target.read_bytes() == content

    db = sqlite3.connect(profile / "altron/altron.db")
    assert db.execute("SELECT count(*) FROM altron_projects").fetchone()[0] == 0
    db.close()


def test_root_documents_are_checked_but_never_replaced_and_new_code_is_removed_on_rollback(tmp_path):
    maintenance, profile, _ = _maintenance(tmp_path)
    files = dict(REQUIRED)
    files["README.md"] = b"release readme\n"
    files["plugins/altron/dashboard/new_module.py"] = b"new module\n"
    archive = _archive(files)
    staged = maintenance.stage(archive, hashlib.sha256(archive).hexdigest())

    assert maintenance.status()["version"] == "0.3.0"
    maintenance.apply(staged["id"])
    assert (profile / "config.yaml").read_bytes() == b"private: old\n"
    assert (profile / "plugins/altron/dashboard/new_module.py").read_bytes() == b"new module\n"

    maintenance.rollback()
    assert not (profile / "plugins/altron/dashboard/new_module.py").exists()
    assert (profile / "config.yaml").read_bytes() == b"private: old\n"


def test_hostile_archive_is_rejected_before_maintenance_write(tmp_path):
    maintenance, profile, _ = _maintenance(tmp_path)
    traversal = tarfile.TarInfo("altron/../auth.json")
    traversal.size = 0
    archive = _archive({}, members=[("altron/release.json", b"{}"), (traversal, b"")])

    with pytest.raises(MaintenanceError) as error:
        maintenance.stage(archive, "0" * 64)

    assert str(error.value) in {"archive_checksum_mismatch", "invalid_archive_member", "archive_path_invalid"}
    assert not (profile / "altron/maintenance").exists()


@pytest.mark.parametrize("bad_path", ["/etc/passwd", "C:/escape", "plugins\\altron\\x.py", "plugins/altron/.env.local", "plugins/altron/auth.json", "plugins/altron/cache.db", "plugins/altron/debug.log"])
def test_archive_paths_are_strictly_validated(tmp_path, bad_path):
    maintenance, profile, _ = _maintenance(tmp_path)
    files = dict(REQUIRED)
    files[bad_path] = b"bad"
    archive = _archive(files)

    with pytest.raises(MaintenanceError):
        maintenance.stage(archive, hashlib.sha256(archive).hexdigest())

    assert not (profile / "altron/maintenance").exists()


def test_stage_rejects_missing_required_file_and_bad_manifest_hash(tmp_path):
    maintenance, _, _ = _maintenance(tmp_path)
    files = dict(REQUIRED)
    files.pop("plugins/altron/plugin.yaml")
    archive = _archive(files)
    with pytest.raises(MaintenanceError) as missing:
        maintenance.stage(archive, hashlib.sha256(archive).hexdigest())
    assert str(missing.value) == "missing_required_file"

    files = dict(REQUIRED)
    archive = _archive(files, extra_manifest={"files": {name: "0" * 64 for name in files}})
    with pytest.raises(MaintenanceError) as mismatch:
        maintenance.stage(archive, hashlib.sha256(archive).hexdigest())
    assert str(mismatch.value) == "file_hash_mismatch"


def test_stage_rejects_archive_duplicates_and_links(tmp_path):
    maintenance, _, _ = _maintenance(tmp_path)
    duplicate = [("altron/release.json", b"{}"), ("altron/release.json", b"{}")]
    archive = _archive({}, members=duplicate)
    with pytest.raises(MaintenanceError) as duplicate_error:
        maintenance.stage(archive, hashlib.sha256(archive).hexdigest())
    assert str(duplicate_error.value) == "duplicate_archive_path"

    link = tarfile.TarInfo("altron/plugins/altron/link")
    link.type = tarfile.SYMTYPE
    link.linkname = "../../outside"
    archive = _archive({}, members=[("altron/release.json", b"{}"), (link, b"")])
    with pytest.raises(MaintenanceError) as link_error:
        maintenance.stage(archive, hashlib.sha256(archive).hexdigest())
    assert str(link_error.value) == "archive_member_type"


def test_apply_rejects_inconsistent_stage_id_and_modified_staged_file(tmp_path):
    maintenance, profile, _ = _maintenance(tmp_path)
    staged = maintenance.stage(_valid_archive(), hashlib.sha256(_valid_archive()).hexdigest())
    with pytest.raises(MaintenanceError) as wrong_id:
        maintenance.apply("f" * 32)
    assert str(wrong_id.value) == "stage_not_found"

    staged_file = profile / "altron/maintenance/stages" / staged["id"] / "files/plugins/altron/__init__.py"
    staged_file.write_bytes(b"tampered")
    with pytest.raises(MaintenanceError) as tampered:
        maintenance.apply(staged["id"])
    assert str(tampered.value) == "staged_file_changed"


@pytest.mark.parametrize("document", [
    {"id": "p", "tasks": [], "runs": [{"id": "r", "status": "running"}]},
    {"id": "p", "tasks": [], "runs": [{"id": "r", "status": "reported"}]},
    {"id": "p", "tasks": [{"id": "t", "team": {"status": "paused", "steps": []}}], "runs": []},
])
def test_apply_rejects_incompatible_or_active_database_state(tmp_path, document):
    maintenance, _, _ = _maintenance(tmp_path, document=document)
    staged = maintenance.stage(_valid_archive(), hashlib.sha256(_valid_archive()).hexdigest())

    with pytest.raises(MaintenanceError) as error:
        maintenance.apply(staged["id"])

    assert str(error.value) in {"active_operations", "database_invalid"}


def test_apply_rejects_incompatible_database_version(tmp_path):
    maintenance, _, _ = _maintenance(tmp_path, user_version=999)
    staged = maintenance.stage(_valid_archive(), hashlib.sha256(_valid_archive()).hexdigest())
    with pytest.raises(MaintenanceError) as error:
        maintenance.apply(staged["id"])
    assert str(error.value) == "database_incompatible"


def test_apply_compensates_after_write_failure(tmp_path, monkeypatch):
    maintenance, profile, desktop = _maintenance(tmp_path)
    archive = _valid_archive()
    staged = maintenance.stage(archive, hashlib.sha256(archive).hexdigest())
    original = maintenance._replace_file
    calls = 0

    def fail_once(source, target):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("injected write failure")
        return original(source, target)

    monkeypatch.setattr(maintenance, "_replace_file", fail_once)
    with pytest.raises(MaintenanceError) as error:
        maintenance.apply(staged["id"])
    assert str(error.value) == "apply_failed"
    assert maintenance.status()["status"] == "recovery_required"
    assert (profile / "plugins/altron/__init__.py").read_bytes() == REQUIRED["plugins/altron/__init__.py"]
    assert (desktop / "desktop-plugins/altron/plugin.js").read_bytes() == REQUIRED["desktop-plugins/altron/plugin.js"]


def test_failed_compensation_requires_recovery(tmp_path, monkeypatch):
    maintenance, _, _ = _maintenance(tmp_path)
    archive = _valid_archive()
    staged = maintenance.stage(archive, hashlib.sha256(archive).hexdigest())
    original = maintenance._replace_file
    calls = 0

    def fail_compensation(source, target):
        nonlocal calls
        calls += 1
        if calls in {2, 3}:
            raise OSError("injected failure")
        return original(source, target)

    monkeypatch.setattr(maintenance, "_replace_file", fail_compensation)
    with pytest.raises(MaintenanceError) as error:
        maintenance.apply(staged["id"])
    assert str(error.value) == "recovery_required"
    assert maintenance.status()["status"] == "recovery_required"


def test_status_reports_interrupted_journal_and_rollback_does_not_remove_live_lock(tmp_path):
    maintenance, profile, _ = _maintenance(tmp_path)
    archive = _valid_archive()
    staged = maintenance.stage(archive, hashlib.sha256(archive).hexdigest())
    journal = profile / "altron/maintenance/journal.json"
    state = json.loads(journal.read_text())
    state["operation"] = {"kind": "apply", "state": "apply_started", "stage_id": staged["id"], "backup_id": "b"}
    journal.write_text(json.dumps(state))
    lock = profile / "altron/maintenance/maintenance.lock"
    lock.write_text("foreign")

    assert maintenance.status()["status"] == "recovery_required"
    with pytest.raises(MaintenanceError) as error:
        maintenance.rollback()
    assert str(error.value) == "lock_exists"
    assert lock.exists()


def test_rollback_blocks_when_applied_code_was_changed(tmp_path):
    maintenance, profile, _ = _maintenance(tmp_path)
    archive = _valid_archive()
    staged = maintenance.stage(archive, hashlib.sha256(archive).hexdigest())
    maintenance.apply(staged["id"])
    target = profile / "plugins/altron/__init__.py"
    target.write_bytes(b"user change")

    with pytest.raises(MaintenanceError) as error:
        maintenance.rollback()

    assert str(error.value) == "code_changed"
    assert target.read_bytes() == b"user change"
