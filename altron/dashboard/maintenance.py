"""Safe, local maintenance for the Altron plugin files."""

from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import gzip
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import stat
import tarfile
import tempfile
from uuid import uuid4


class MaintenanceError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


_ARCHIVE_LIMIT = 16 * 1024 * 1024
_FILE_LIMIT = 8 * 1024 * 1024
_TOTAL_LIMIT = 32 * 1024 * 1024
_FILE_COUNT_LIMIT = 128
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_STAGE_ID = re.compile(r"^[0-9a-f]{32}$")
_VERSION = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")
_ROOT_FILES = {"config.yaml", "SOUL.md", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"}
_REQUIRED_FILES = {
    "plugins/altron/__init__.py",
    "plugins/altron/plugin.yaml",
    "plugins/altron/dashboard/plugin_api.py",
    "desktop-plugins/altron/plugin.js",
}
_OPERATION_STATES = {"apply_started", "compensating", "failed", "recovery_required"}


def _fail(code, cause=None):
    error = MaintenanceError(code)
    if cause is None:
        raise error
    raise error from cause


def _is_linklike(path):
    try:
        info = path.lstat()
    except OSError:
        return False
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)


def _sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _json_load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        _fail("journal_invalid", exc)


def _reject_duplicate_json(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def _validate_relative(value, *, archive=False):
    if not isinstance(value, str) or not value or "\x00" in value or "\\" in value:
        _fail("archive_path_invalid" if archive else "invalid_manifest_path")
    if value.startswith("/") or value.startswith("\\") or re.match(r"^[A-Za-z]:", value):
        _fail("archive_path_invalid" if archive else "invalid_manifest_path")
    parts = value.split("/")
    if any(not part or part in {".", ".."} or any(c in part for c in ":<>\"|?*") or part.rstrip(" .") != part or re.fullmatch(r"(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?", part) for part in parts):
        _fail("archive_path_invalid" if archive else "invalid_manifest_path")
    return "/".join(parts)


def _archive_relative(name):
    if not isinstance(name, str) or "\x00" in name or "\\" in name:
        _fail("archive_path_invalid")
    if name.startswith("/") or name.startswith("\\") or re.match(r"^[A-Za-z]:", name):
        _fail("archive_path_invalid")
    if name.endswith("/"):
        name = name[:-1]
    if name == "altron":
        return ""
    if not name.startswith("altron/"):
        _fail("archive_path_invalid")
    return _validate_relative(name[7:], archive=True)


def _forbidden(relative):
    parts = relative.split("/") if relative else []
    for part in parts:
        lowered = part.lower()
        if lowered.startswith(".env") or lowered in {"auth.json", "credentials.json"}:
            return True
        if lowered.endswith(".db") or lowered.endswith(".log"):
            return True
    return False


def _allowed_archive_file(relative):
    return relative in _ROOT_FILES or relative.startswith("plugins/altron/") or relative.startswith("desktop-plugins/altron/")


def _atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(value, stream, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except OSError:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


class Maintenance:
    def __init__(self, profile_home, desktop_home):
        self.profile_home = Path(os.fspath(profile_home))
        self.desktop_home = Path(os.fspath(desktop_home))
        if not self.profile_home.is_absolute() or not self.desktop_home.is_absolute():
            _fail("paths_must_be_absolute")
        self.profile_data = self.profile_home / "altron"
        self.database = self.profile_data / "altron.db"
        self.profile_code = self.profile_home / "plugins" / "altron"
        self.desktop_code = self.desktop_home / "desktop-plugins" / "altron"
        self.maintenance = self.profile_data / "maintenance"
        self.journal_path = self.maintenance / "journal.json"
        self.profile_lock_path = self.maintenance / "maintenance.lock"
        self.desktop_lock_path = self.desktop_home / "desktop-plugins" / ".altron-maintenance.lock"
        self._validate_installation()

    def _validate_chain(self, root, relative, missing_code=None):
        current = root
        for part in Path(relative).parts:
            current /= part
            if _is_linklike(current):
                _fail("path_is_link")
        if missing_code is not None and not current.exists():
            _fail(missing_code)
        return current

    def _validate_installation(self):
        if not self.profile_home.is_dir() or _is_linklike(self.profile_home):
            _fail("invalid_profile_home")
        if not self.desktop_home.is_dir() or _is_linklike(self.desktop_home):
            _fail("invalid_desktop_home")
        self._validate_chain(self.profile_home, "plugins/altron", "invalid_profile_code")
        self._validate_chain(self.profile_home, "altron", "invalid_profile_data")
        database = self._validate_chain(self.profile_home, "altron/altron.db", "invalid_database")
        if not database.is_file():
            _fail("invalid_database")
        self._validate_chain(self.desktop_home, "desktop-plugins/altron", "invalid_desktop_code")
        if self.maintenance.exists() and _is_linklike(self.maintenance):
            _fail("path_is_link")

    def _ensure_maintenance(self):
        self._validate_chain(self.profile_home, "altron", "invalid_profile_data")
        self.maintenance.mkdir(exist_ok=True)
        if _is_linklike(self.maintenance):
            _fail("path_is_link")
        for name in ("stages", "backups"):
            child = self.maintenance / name
            if child.exists() and _is_linklike(child):
                _fail("path_is_link")
            child.mkdir(exist_ok=True)

    @contextmanager
    def _lock(self, path):
        self._ensure_maintenance()
        if path.exists() or _is_linklike(path):
            _fail("lock_exists")
        try:
            descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except OSError as exc:
            _fail("lock_exists", exc)
        try:
            with os.fdopen(descriptor, "w", encoding="ascii") as stream:
                stream.write(str(os.getpid()))
                stream.flush()
                os.fsync(stream.fileno())
            yield
        finally:
            try:
                path.unlink()
            except FileNotFoundError:
                pass

    @contextmanager
    def _locks(self):
        with self._lock(self.profile_lock_path):
            with self._lock(self.desktop_lock_path):
                yield

    def _read_journal(self):
        if not self.journal_path.exists():
            return {"schema": 1, "events": [], "stage": None, "operation": None, "version": None, "backup_id": None, "requires_restart": False}
        if _is_linklike(self.journal_path):
            _fail("path_is_link")
        try:
            value = json.loads(self.journal_path.read_text(encoding="utf-8"), object_pairs_hook=_reject_duplicate_json)
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
            _fail("journal_invalid", exc)
        if not isinstance(value, dict) or value.get("schema") != 1 or not isinstance(value.get("events"), list):
            _fail("journal_invalid")
        return value

    def _write_journal(self, journal):
        self._ensure_maintenance()
        _atomic_json(self.journal_path, journal)

    @staticmethod
    def _event(journal, event, **values):
        journal.setdefault("events", []).append({"event": event, **values})

    def _parse_archive(self, archive_bytes, expected_sha256):
        if not isinstance(archive_bytes, bytes):
            _fail("archive_bytes_invalid")
        if not isinstance(expected_sha256, str) or not _SHA256.fullmatch(expected_sha256):
            _fail("expected_sha256_invalid")
        if len(archive_bytes) > _ARCHIVE_LIMIT:
            _fail("archive_too_large")
        if _sha256_bytes(archive_bytes) != expected_sha256:
            _fail("archive_checksum_mismatch")
        payload = archive_bytes
        if archive_bytes.startswith(b"\x1f\x8b"):
            maximum = _TOTAL_LIMIT + _FILE_COUNT_LIMIT * 1024 + 10240
            try:
                with gzip.GzipFile(fileobj=io.BytesIO(archive_bytes)) as compressed:
                    payload = compressed.read(maximum + 1)
            except (OSError, EOFError) as exc:
                _fail("invalid_archive", exc)
            if len(payload) > maximum:
                _fail("archive_total_too_large")
        files = {}
        release = None
        seen = set()
        total_size = 0
        try:
            stream = tarfile.open(fileobj=io.BytesIO(payload), mode="r:")
        except Exception as exc:
            _fail("invalid_archive", exc)
        with stream:
            try:
                members = stream.getmembers()
            except Exception as exc:
                _fail("invalid_archive", exc)
            if len(members) > _FILE_COUNT_LIMIT * 2 + 1:
                _fail("archive_file_count_too_large")
            for member in members:
                relative = _archive_relative(member.name)
                key = (relative if relative else "altron").casefold()
                if key in seen:
                    _fail("duplicate_archive_path")
                seen.add(key)
                if _forbidden(relative):
                    _fail("forbidden_archive_file")
                if relative == "":
                    if not member.isdir():
                        _fail("archive_member_type")
                    continue
                if member.isdir():
                    continue
                if not member.isreg() or member.issym() or member.islnk() or getattr(member, "sparse", None):
                    _fail("archive_member_type")
                if member.size < 0 or member.size > _FILE_LIMIT:
                    _fail("archive_file_too_large")
                total_size += member.size
                if total_size > _TOTAL_LIMIT:
                    _fail("archive_total_too_large")
                if not _allowed_archive_file(relative) and relative != "release.json":
                    _fail("archive_path_not_allowed")
                try:
                    extracted = stream.extractfile(member)
                    content = extracted.read(member.size + 1) if extracted is not None else None
                except (OSError, tarfile.TarError) as exc:
                    _fail("invalid_archive", exc)
                if extracted is None:
                    _fail("archive_member_type")
                if len(content) != member.size:
                    _fail("invalid_archive")
                if relative == "release.json":
                    if release is not None:
                        _fail("duplicate_archive_path")
                    release = content
                else:
                    files[relative] = content
                if len(files) > _FILE_COUNT_LIMIT:
                    _fail("archive_file_count_too_large")
        if release is None:
            _fail("release_manifest_missing")
        try:
            manifest = json.loads(release.decode("utf-8"), object_pairs_hook=_reject_duplicate_json)
        except (UnicodeError, json.JSONDecodeError, ValueError) as exc:
            _fail("release_manifest_invalid", exc)
        if not isinstance(manifest, dict) or set(manifest) != {"format", "version", "data_version", "files"}:
            _fail("release_manifest_invalid")
        if manifest["format"] != 1:
            _fail("release_format_unsupported")
        if not isinstance(manifest["version"], str) or not _VERSION.fullmatch(manifest["version"]):
            _fail("version_invalid")
        if type(manifest["data_version"]) is not int or manifest["data_version"] not in (1, 2):
            _fail("data_version_unsupported")
        declared = manifest["files"]
        if not isinstance(declared, dict):
            _fail("release_manifest_invalid")
        normalized = {}
        for path, digest in declared.items():
            normalized_path = _validate_relative(path)
            if normalized_path in normalized or normalized_path.casefold() in {item.casefold() for item in normalized}:
                _fail("duplicate_manifest_path")
            if not isinstance(digest, str) or not _SHA256.fullmatch(digest):
                _fail("manifest_hash_invalid")
            if not _allowed_archive_file(normalized_path) or _forbidden(normalized_path):
                _fail("archive_path_not_allowed")
            normalized[normalized_path] = digest
        if set(normalized) != set(files):
            _fail("manifest_file_set_mismatch")
        for path, content in files.items():
            if _sha256_bytes(content) != normalized[path]:
                _fail("file_hash_mismatch")
        if not _REQUIRED_FILES.issubset(files):
            _fail("missing_required_file")
        return manifest, files

    def stage(self, archive_bytes: bytes, expected_sha256: str):
        manifest, files = self._parse_archive(archive_bytes, expected_sha256)
        with self._lock(self.profile_lock_path):
            journal = self._read_journal()
            operation = journal.get("operation")
            if operation and operation.get("state") in _OPERATION_STATES:
                _fail("recovery_required")
            stage_id = uuid4().hex
            stage_dir = self.maintenance / "stages" / stage_id
            (stage_dir / "files").mkdir(parents=True, exist_ok=False)
            for relative, content in files.items():
                target = stage_dir / "files" / Path(relative)
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("xb") as stream:
                    stream.write(content)
                    stream.flush()
                    os.fsync(stream.fileno())
            stage_info = {
                "id": stage_id,
                "version": manifest["version"],
                "data_version": manifest["data_version"],
                "files": {path: {"sha256": _sha256_bytes(content), "size": len(content)} for path, content in sorted(files.items())},
                "archive_sha256": expected_sha256,
                "stage_dir": f"stages/{stage_id}",
            }
            _atomic_json(stage_dir / "stage.json", stage_info)
            journal["stage"] = stage_info
            self._event(journal, "staged", stage_id=stage_id, version=manifest["version"], archive_sha256=expected_sha256, files=stage_info["files"])
            self._write_journal(journal)
        return {"id": stage_id, "version": manifest["version"], "files": sorted(files)}

    def _stage_files(self, journal, stage_id):
        stage = journal.get("stage")
        if not isinstance(stage, dict) or stage.get("id") != stage_id or not _STAGE_ID.fullmatch(stage_id):
            _fail("stage_not_found")
        stage_dir = self.maintenance / "stages" / stage_id
        if not stage_dir.is_dir() or _is_linklike(stage_dir):
            _fail("stage_not_found")
        verified = {}
        for relative, record in stage.get("files", {}).items():
            if not isinstance(record, dict) or not _SHA256.fullmatch(record.get("sha256", "")):
                _fail("journal_invalid")
            relative = _validate_relative(relative)
            if not _allowed_archive_file(relative) or _forbidden(relative):
                _fail("journal_invalid")
            target = stage_dir / "files" / Path(relative)
            if _is_linklike(target) or not target.is_file():
                _fail("staged_file_changed")
            try:
                digest = _sha256_file(target)
                size = target.stat().st_size
            except OSError as exc:
                _fail("staged_file_changed", exc)
            if digest != record["sha256"] or size != record.get("size"):
                _fail("staged_file_changed")
            verified[relative] = target
        if not _REQUIRED_FILES.issubset(verified):
            _fail("missing_required_file")
        return stage, stage_dir, verified

    @staticmethod
    def _unstarted_plan(project, task):
        team = task.get("team")
        return (task.get("status") == "approved" and isinstance(team, dict) and team.get("status") == "ready"
                and bool(team.get("steps"))
                and all(step.get("status") == "pending" and not step.get("run_id") for step in team["steps"])
                and not any(run.get("task_id") == task["id"] for run in project["runs"]))

    def pending_plans(self):
        self._validate_installation()
        try:
            with closing(sqlite3.connect(self.database.as_uri() + "?mode=ro", uri=True, timeout=10)) as db:
                if db.execute("PRAGMA user_version").fetchone()[0] not in (1, 2):
                    _fail("database_incompatible")
                plans = []
                for (document,) in db.execute("SELECT document FROM altron_projects"):
                    project = json.loads(document)
                    for task in project["tasks"]:
                        if self._unstarted_plan(project, task):
                            plans.append({"project_id": project["id"], "project_name": project["name"], "task_id": task["id"], "goal": task["goal"], "plan": task["plan"]})
                return {"plans": plans}
        except (sqlite3.Error, json.JSONDecodeError, KeyError, TypeError, AttributeError) as exc:
            _fail("database_invalid", exc)

    def cancel_pending_plan(self, project_id, task_id, reason):
        if not isinstance(reason, str) or not reason.strip() or len(reason) > 2000:
            _fail("invalid_reason")
        with self._lock(self.profile_lock_path):
            self._validate_installation()
            if (self._read_journal().get("operation") or {}).get("state") in _OPERATION_STATES:
                _fail("recovery_required")
            try:
                with closing(sqlite3.connect(self.database.as_uri() + "?mode=rw", uri=True, timeout=10)) as db, db:
                    db.execute("BEGIN IMMEDIATE")
                    if db.execute("PRAGMA user_version").fetchone()[0] not in (1, 2):
                        _fail("database_incompatible")
                    row = db.execute("SELECT document FROM altron_projects WHERE id=?", (project_id,)).fetchone()
                    if row is None:
                        _fail("project_not_found")
                    project = json.loads(row[0])
                    task = next((task for task in project["tasks"] if task["id"] == task_id), None)
                    if task is None or not self._unstarted_plan(project, task):
                        _fail("plan_not_unstarted")
                    task["status"] = task["team"]["status"] = "cancelled"
                    task["cancellation"] = {"reason": reason.strip(), "at": datetime.now(timezone.utc).isoformat(), "source": "maintenance"}
                    db.execute("UPDATE altron_projects SET document=? WHERE id=?", (json.dumps(project, ensure_ascii=False), project_id))
                    return {"task_id": task_id, "status": "cancelled"}
            except (sqlite3.Error, json.JSONDecodeError, KeyError, TypeError, AttributeError) as exc:
                _fail("database_invalid", exc)

    @contextmanager
    def _validate_database(self):
        if _is_linklike(self.database) or not self.database.is_file():
            _fail("invalid_database")
        db = None
        try:
            db = sqlite3.connect(self.database, timeout=10)
            db.execute("BEGIN IMMEDIATE")
            if db.execute("PRAGMA user_version").fetchone()[0] not in (1, 2):
                _fail("database_incompatible")
            for (raw_document,) in db.execute("SELECT document FROM altron_projects"):
                try:
                    project = json.loads(raw_document)
                except (TypeError, json.JSONDecodeError) as exc:
                    _fail("database_invalid", exc)
                if not isinstance(project, dict) or not isinstance(project.get("runs"), list) or not isinstance(project.get("tasks"), list):
                    _fail("database_invalid")
                for run in project["runs"]:
                    if not isinstance(run, dict):
                        _fail("database_invalid")
                    if run.get("status") in {"prepared", "running", "unknown", "cancel_requested"} or (not run.get("terminal_status") and (run.get("status") == "reported" or run.get("runtime_id"))):
                        _fail("active_operations")
                for task in project["tasks"]:
                    if not isinstance(task, dict):
                        _fail("database_invalid")
                    team = task.get("team")
                    if isinstance(team, dict) and team.get("status") in {"ready", "running", "paused", "unknown"}:
                        _fail("active_operations")
            if db.execute("PRAGMA user_version").fetchone()[0] == 2:
                for (document,) in db.execute("SELECT document FROM altron_missions"):
                    try:
                        mission = json.loads(document)
                    except (TypeError, json.JSONDecodeError) as exc:
                        _fail("database_invalid", exc)
                    if not isinstance(mission, dict) or not isinstance(mission.get("turns"), list):
                        _fail("database_invalid")
                    if mission.get("status") not in {"waiting", "awaiting_approval", "ready", "blocked", "cancelled"}:
                        _fail("active_operations")
                    if any(not isinstance(turn, dict) or not turn.get("settled") for turn in mission["turns"]):
                        _fail("active_operations")
            yield db
        except sqlite3.Error as exc:
            _fail("database_invalid", exc)
        finally:
            if db is not None:
                db.rollback()
                db.close()

    def _managed_target(self, relative):
        relative = _validate_relative(relative)
        if _forbidden(relative):
            _fail("archive_path_not_allowed")
        if relative.startswith("plugins/altron/"):
            root = self.profile_home
        elif relative.startswith("desktop-plugins/altron/"):
            root = self.desktop_home
        else:
            _fail("archive_path_not_allowed")
        target = root / Path(relative)
        self._validate_chain(root, Path(relative).parent)
        if target.exists() and _is_linklike(target):
            _fail("path_is_link")
        return target

    def _write_backup_file(self, path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())

    def _prepare_backup(self, stage, stage_dir, verified):
        backup_id = uuid4().hex
        backup_dir = self.maintenance / "backups" / backup_id
        (backup_dir / "code").mkdir(parents=True, exist_ok=False)
        (backup_dir / "new").mkdir(parents=True, exist_ok=True)
        code_records = []
        for relative in sorted(path for path in verified if path.startswith(("plugins/altron/", "desktop-plugins/altron/"))):
            target = self._managed_target(relative)
            if target.exists():
                if not target.is_file():
                    _fail("invalid_code_path")
                content = target.read_bytes()
                old = {"exists": True, "sha256": _sha256_bytes(content), "size": len(content), "backup_path": f"code/{relative}"}
                self._write_backup_file(backup_dir / "code" / Path(relative), content)
            else:
                old = {"exists": False, "sha256": None, "size": 0, "backup_path": None}
            new_content = verified[relative].read_bytes()
            self._write_backup_file(backup_dir / "new" / Path(relative), new_content)
            code_records.append({"path": relative, "old": old, "new_sha256": _sha256_bytes(new_content), "new_size": len(new_content)})
        try:
            database_backup = backup_dir / "altron.db"
            db = sqlite3.connect(self.database, timeout=10)
            backup_db = sqlite3.connect(database_backup)
            try:
                db.backup(backup_db)
                integrity = backup_db.execute("PRAGMA integrity_check").fetchone()[0]
            finally:
                backup_db.close()
                db.close()
            if integrity != "ok":
                _fail("database_backup_invalid")
        except sqlite3.Error as exc:
            _fail("database_backup_invalid", exc)
        backup_info = {"id": backup_id, "version": stage["version"], "code": code_records, "database": "altron.db"}
        _atomic_json(backup_dir / "backup.json", backup_info)
        return backup_id, backup_dir, code_records

    def _replace_file(self, source, target):
        if _is_linklike(target.parent) or (target.exists() and _is_linklike(target)):
            _fail("path_is_link")
        content = source.read_bytes()
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
        except OSError:
            try:
                os.unlink(temporary)
            except OSError:
                pass
            raise

    def _restore_record(self, record, backup_dir):
        target = self._managed_target(record["path"])
        if not target.exists() or _is_linklike(target):
            if record["old"]["exists"]:
                _fail("recovery_required")
            return
        current_hash = _sha256_file(target)
        if current_hash == record["old"]["sha256"]:
            return
        if current_hash != record["new_sha256"]:
            _fail("code_changed")
        if record["old"]["exists"]:
            self._replace_file(backup_dir / record["old"]["backup_path"], target)
        else:
            target.unlink()

    def _compensate(self, operation, backup_dir):
        self._verify_backup(operation, backup_dir)
        for record in reversed(operation["files"]):
            self._restore_record(record, backup_dir)

    def _verify_backup(self, operation, backup_dir):
        records = operation.get("files")
        if not isinstance(records, list) or not records or len(records) > _FILE_COUNT_LIMIT:
            _fail("backup_invalid")
        seen = set()
        for record in records:
            try:
                relative = record["path"]
                self._managed_target(relative)
                if relative.casefold() in seen:
                    _fail("backup_invalid")
                seen.add(relative.casefold())
                old = record["old"]
                if not isinstance(record["new_sha256"], str) or not _SHA256.fullmatch(record["new_sha256"]):
                    _fail("backup_invalid")
                if old["exists"]:
                    if old["backup_path"] != f"code/{relative}":
                        _fail("backup_invalid")
                    source = self._validate_chain(backup_dir, old["backup_path"], "backup_invalid")
                    if not source.is_file() or source.stat().st_size != old["size"] or _sha256_file(source) != old["sha256"]:
                        _fail("backup_invalid")
                elif old != {"exists": False, "sha256": None, "size": 0, "backup_path": None}:
                    _fail("backup_invalid")
            except (KeyError, TypeError, OSError) as exc:
                _fail("backup_invalid", exc)

    def _verify_rollback_preconditions(self, operation):
        for record in operation["files"]:
            target = self._managed_target(record["path"])
            if not target.is_file() or _is_linklike(target) or _sha256_file(target) != record["new_sha256"]:
                _fail("code_changed")

    def apply(self, stage_id: str):
        with self._locks(), self._validate_database() as db:
            journal = self._read_journal()
            stage, stage_dir, verified = self._stage_files(journal, stage_id)
            if db.execute("PRAGMA user_version").fetchone()[0] > stage["data_version"]:
                _fail("database_incompatible")
            if journal.get("operation") and journal["operation"].get("state") in _OPERATION_STATES:
                _fail("recovery_required")
            previous = journal.get("operation") or {}
            if previous.get("state") == "applied" and previous.get("stage_id") == stage_id:
                _fail("update_pending")
            backup_id, backup_dir, records = self._prepare_backup(stage, stage_dir, verified)
            operation = {"kind": "apply", "process_id": os.getpid(), "state": "apply_started", "stage_id": stage_id, "backup_id": backup_id, "files": records, "applied": []}
            journal["operation"] = operation
            journal["backup_id"] = backup_id
            journal["requires_restart"] = False
            self._event(journal, "apply_started", stage_id=stage_id, backup_id=backup_id, files=records)
            self._write_journal(journal)
            try:
                for record in records:
                    record["state"] = "replace_started"
                    operation["applied"].append(record["path"])
                    self._event(journal, "replace_started", path=record["path"], old_sha256=record["old"]["sha256"], new_sha256=record["new_sha256"])
                    self._write_journal(journal)
                    self._replace_file(verified[record["path"]], self._managed_target(record["path"]))
                    target = self._managed_target(record["path"])
                    if _sha256_file(target) != record["new_sha256"]:
                        _fail("apply_verification_failed")
                    record["state"] = "replaced"
                    self._event(journal, "replaced", path=record["path"], sha256=record["new_sha256"])
                    self._write_journal(journal)
            except MaintenanceError as exc:
                failure = exc
                try:
                    operation["state"] = "compensating"
                    self._write_journal(journal)
                    self._compensate(operation, backup_dir)
                except Exception as compensation_error:
                    operation["state"] = "recovery_required"
                    operation["error"] = "recovery_required"
                    try:
                        self._event(journal, "recovery_required", error=str(compensation_error))
                        self._write_journal(journal)
                    except Exception:
                        pass
                    _fail("recovery_required", compensation_error)
                operation["state"] = "failed"
                operation["error"] = failure.code
                self._event(journal, "apply_failed", error=failure.code)
                self._write_journal(journal)
                raise
            except Exception as exc:
                try:
                    operation["state"] = "compensating"
                    self._write_journal(journal)
                    self._compensate(operation, backup_dir)
                except Exception as compensation_error:
                    operation["state"] = "recovery_required"
                    operation["error"] = "recovery_required"
                    try:
                        self._event(journal, "recovery_required", error=str(compensation_error))
                        self._write_journal(journal)
                    except Exception:
                        pass
                    _fail("recovery_required", compensation_error)
                operation["state"] = "failed"
                operation["error"] = "apply_failed"
                self._event(journal, "apply_failed", error="apply_failed")
                self._write_journal(journal)
                _fail("apply_failed", exc)
            operation["state"] = "applied"
            journal["version"] = stage["version"]
            journal["requires_restart"] = True
            self._event(journal, "applied", version=stage["version"], backup_id=backup_id)
            self._write_journal(journal)
            return {"status": "applied", "requires_restart": True, "version": stage["version"], "backup_id": backup_id}

    def _recover_interrupted(self, journal, operation, backup_dir):
        self._compensate(operation, backup_dir)
        operation["state"] = "rolled_back"
        journal["version"] = None
        journal["requires_restart"] = True
        self._event(journal, "recovered_rollback", backup_id=operation["backup_id"])
        self._write_journal(journal)

    def rollback(self):
        with self._locks(), self._validate_database() as db:
            journal = self._read_journal()
            operation = journal.get("operation")
            if not isinstance(operation, dict) or operation.get("state") not in {"applied", "failed", "apply_started", "compensating", "recovery_required"}:
                _fail("no_applied_update")
            operation["process_id"] = os.getpid()
            backup_id = operation.get("backup_id")
            if not _STAGE_ID.fullmatch(backup_id or ""):
                _fail("backup_invalid")
            backup_dir = self.maintenance / "backups" / backup_id
            if not backup_dir.is_dir() or _is_linklike(backup_dir):
                _fail("backup_invalid")
            self._verify_backup(operation, backup_dir)
            backup_database = self._validate_chain(backup_dir, "altron.db", "backup_invalid")
            try:
                with closing(sqlite3.connect(backup_database.as_uri() + "?mode=ro", uri=True, timeout=10)) as previous_db:
                    previous_schema = previous_db.execute("PRAGMA user_version").fetchone()[0]
                if previous_schema != db.execute("PRAGMA user_version").fetchone()[0]:
                    _fail("database_incompatible")
            except sqlite3.Error as exc:
                _fail("backup_invalid", exc)
            if operation.get("state") == "applied":
                self._verify_rollback_preconditions(operation)
            try:
                self._compensate(operation, backup_dir)
            except MaintenanceError:
                raise
            except Exception as exc:
                operation["state"] = "recovery_required"
                journal["requires_restart"] = True
                self._event(journal, "recovery_required", error=str(exc))
                self._write_journal(journal)
                _fail("recovery_required", exc)
            operation["state"] = "rolled_back"
            journal["version"] = None
            journal["requires_restart"] = True
            self._event(journal, "rolled_back", backup_id=backup_id)
            self._write_journal(journal)
            return {"status": "rolled_back", "requires_restart": True}

    def status(self):
        try:
            journal = self._read_journal()
        except MaintenanceError:
            return {"status": "recovery_required", "version": None, "backup_id": None, "requires_restart": True}
        operation = journal.get("operation")
        if isinstance(operation, dict) and operation.get("state") in _OPERATION_STATES:
            status = "recovery_required"
        elif isinstance(operation, dict) and operation.get("state") == "applied":
            status = "applied"
        elif isinstance(operation, dict) and operation.get("state") == "rolled_back":
            status = "rolled_back"
        elif journal.get("stage"):
            status = "staged"
        else:
            status = "idle"
        return {
            "status": status,
            "version": journal.get("version") or (journal.get("stage") or {}).get("version"),
            "backup_id": journal.get("backup_id"),
            "requires_restart": bool(journal.get("requires_restart")),
        }
