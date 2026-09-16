"""Narrow, profile-scoped integration with the installed Hermes runtime."""

from collections import Counter
from contextlib import contextmanager
import math
from pathlib import Path
import platform
import sys


def clean_usage(value):
    result = {}
    for key in ("input", "output", "total", "calls", "cost_usd"):
        number = value.get(key)
        if isinstance(number, (int, float)) and not isinstance(number, bool) and math.isfinite(number) and number >= 0:
            result[key] = number
    if value.get("cost_status") in {"known", "estimated", "partial", "unknown", "unavailable", "included"}:
        result["cost_status"] = value["cost_status"]
    return result


def _runtime():
    server = sys.modules.get("tui_gateway.server")
    required = ("_sessions", "_sessions_lock", "_session_lookup_key", "_session_live_status", "_close_session_by_id")
    if server is None or any(not hasattr(server, key) for key in required):
        raise ValueError("runtime_unavailable")
    return server


def _session(server, run, project, home):
    direct = server._sessions.get(run.get("runtime_id"))
    matches = [(sid, session) for sid, session in server._sessions.items()
               if server._session_lookup_key(session, fallback=sid) == run.get("stored_id")
               and Path(session.get("profile_home") or server._hermes_home).resolve() == home.resolve()]
    if direct is not None and not any(session is direct for _, session in matches):
        raise ValueError("runtime_scope_mismatch")
    if len(matches) > 1:
        raise ValueError("runtime_state_unconfirmed")
    if matches and Path(matches[0][1].get("cwd", "")).resolve() != Path(project["directory"]).resolve():
        raise ValueError("runtime_scope_mismatch")
    return matches[0] if matches else (None, None)


@contextmanager
def observe_run(run, project, home):
    server = _runtime()
    try:
        from hermes_cli.active_sessions import active_session_liveness_guard
    except ImportError as exc:
        raise ValueError("runtime_unavailable") from exc
    with server._sessions_lock:
        sid, session = _session(server, run, project, home)
        if session is not None:
            usage = clean_usage(server._session_usage_snapshot(session)) if hasattr(server, "_session_usage_snapshot") else {}
            busy = (server._session_live_status(sid, session) != "idle" or session.get("_compute_host_active")
                    or session.get("hydrating") or session.get("queued_prompt") or session.get("queued_prompts")
                    or any(getattr(session.get(key), "is_alive", lambda: False)() for key in ("_run_thread", "worker", "slash_worker")))
            if busy:
                yield {"state": "active", "usage": usage}
                return
            # Fence late prompt.submit on this idle runtime before settling Altron.
            server._close_session_by_id(sid)
            if sid in server._sessions:
                raise ValueError("runtime_state_unconfirmed")
        else:
            usage = {}
        # The native guard checks other processes (including PID reuse) and holds
        # ownership closed through Altron's write. Never clear another lease.
        with active_session_liveness_guard(run.get("stored_id") or "", registry_home=home) as active:
            yield {"state": "active" if active else "stopped", "usage": usage}


def _mission_lineage(run, home):
    known = [value for value in [*run.get('stored_id_history', []), run.get('stored_id')] if value]
    if not known:
        raise ValueError('runtime_state_unconfirmed')
    path = Path(home) / 'state.db'
    if not path.exists() and not run.get('started_at'):
        return known
    try:
        from hermes_state import SessionDB
        db = SessionDB(db_path=path, read_only=True)
        try:
            root = db.get_session(known[0])
            if root is None:
                if run.get('started_at'):
                    raise ValueError('runtime_state_unconfirmed')
                return known
            chain = db.get_compression_chain(known[0])
            if not chain or not set(known).issubset(chain):
                raise ValueError('runtime_state_unconfirmed')
            return chain
        finally:
            db.close()
    except Exception as exc:
        raise ValueError('runtime_state_unconfirmed') from exc


@contextmanager
def observe_mission_run(run, project, home):
    if not run.get('stored_id'):
        if run.get('runtime_id') or run.get('started_at'):
            raise ValueError('runtime_state_unconfirmed')
        yield {'state': 'stopped', 'basis': 'not_dispatched', 'usage': {}}
        return
    server = _runtime()
    try:
        from importlib import import_module
        registry = import_module('hermes_cli.active_sessions')
        required = ('_lease_paths', '_FileLock', '_prune_dead', '_read_entries', '_holds_session')
        if any(not callable(getattr(registry, key, None)) for key in required):
            raise ValueError('runtime_unavailable')
    except ImportError as exc:
        raise ValueError('runtime_unavailable') from exc
    with server._sessions_lock:
        chain = _mission_lineage(run, home)
        sid, session = _session(server, dict(run, stored_id=chain[-1]), project, home)
        usage = clean_usage(server._session_usage_snapshot(session)) if session is not None else {}
        if session is not None:
            busy = (server._session_live_status(sid, session) != 'idle' or session.get('_compute_host_active')
                    or session.get('hydrating') or session.get('queued_prompt') or session.get('queued_prompts')
                    or any(getattr(session.get(key), 'is_alive', lambda: False)() for key in ('_run_thread', 'worker', 'slash_worker')))
            if busy:
                yield {'state': 'active', 'stored_id': chain[-1], 'usage': usage}
                return
            server._close_session_by_id(sid)
            if sid in server._sessions:
                raise ValueError('runtime_state_unconfirmed')
        # A compression can move the lease from an ancestor to its continuation.
        # Hold Hermes' one registry lock and check the whole lineage, not just its tip.
        state_path, lock_path = registry._lease_paths(registry_home=home)
        with registry._FileLock(lock_path):
            entries = registry._prune_dead(registry._read_entries(state_path, strict=True), strict=True)
            chain = _mission_lineage(run, home)
            active = any(registry._holds_session(entries, stored_id) for stored_id in chain)
            yield {'state': 'active' if active else 'stopped', 'stored_id': chain[-1], 'usage': usage}


def run_usage(run, project, home):
    try:
        server = _runtime()
        with server._sessions_lock:
            _, session = _session(server, run, project, home)
            if session is not None and hasattr(server, "_session_usage_snapshot"):
                return clean_usage(server._session_usage_snapshot(session))
    except (ValueError, AttributeError, OSError):
        pass
    return clean_usage(run.get("usage", {}))


def folders(path=""):
    raw = Path(path) if path else Path.home()
    if not raw.is_absolute() or raw.is_symlink():
        raise ValueError("invalid_directory")
    try:
        directory = raw.resolve(strict=True)
        entries = sorted((child for child in directory.iterdir() if not child.name.startswith(".") and child.is_dir() and not child.is_symlink()), key=lambda child: child.name.casefold())
    except OSError as exc:
        raise ValueError("directory_unavailable") from exc
    return {"path": str(directory), "parent": str(directory.parent) if directory.parent != directory else None,
            "directories": [{"name": child.name, "path": str(child)} for child in entries]}


def create_folder(parent, name):
    if not isinstance(name, str) or not name.strip() or name != name.strip() or any(c in name for c in '/\\:*?"<>|') or name in {".", ".."} or name.startswith(".") or name.endswith(".") or len(name) > 120:
        raise ValueError("invalid_folder_name")
    base = Path(parent)
    if not base.is_absolute() or base.is_symlink():
        raise ValueError("invalid_directory")
    try:
        base = base.resolve(strict=True)
        target = base / name
        target.mkdir()
    except OSError as exc:
        raise ValueError("folder_creation_failed") from exc
    return {"path": str(target)}


def diagnostics(store):
    tasks, runs = Counter(), Counter()
    allowed = {"draft", "approved", "launching", "planning", "running", "reviewing", "review", "done", "failed", "unknown", "cancel_requested", "reported", "prepared", "interrupted", "team_waiting", "cancelled"}
    projects = store.projects()
    for row in projects:
        project = store.project(row["id"])
        tasks.update(t["status"] if t["status"] in allowed else "other" for t in project["tasks"])
        runs.update(r["status"] if r["status"] in allowed else "other" for r in project["runs"])
    return {"altron_version": "0.4.0-beta.1", "data_version": 1, "platform": platform.system(),
            "python": platform.python_version(), "projects": len(projects), "tasks": dict(tasks), "runs": dict(runs),
            "runtime_loaded": "tui_gateway.server" in sys.modules}
