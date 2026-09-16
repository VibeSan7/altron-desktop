from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
import sys
import threading

import pytest

from altron.dashboard import desktop_services


def setup_lineage(monkeypatch, tmp_path):
    home = tmp_path / 'profile'; home.mkdir()
    (home / 'state.db').touch()
    directory = tmp_path / 'project'; directory.mkdir()
    session = {'session_key': 'tip', 'profile_home': str(home), 'cwd': str(directory), 'running': False}
    server = SimpleNamespace(_sessions={'runtime': session}, _sessions_lock=threading.RLock(), _hermes_home=home,
        _session_lookup_key=lambda s, **kw: s['session_key'],
        _session_live_status=lambda sid, s: 'working' if s['running'] else 'idle',
        _session_usage_snapshot=lambda s: {},
        _close_session_by_id=lambda sid: server._sessions.pop(sid, None))
    monkeypatch.setitem(sys.modules, 'tui_gateway.server', server)
    state = {'locked': False, 'entries': [], 'chain': ['root', 'tip'], 'closed': 0, 'chain_under_lock': []}
    @contextmanager
    def file_lock(path):
        assert not state['locked']
        state['locked'] = True
        try:
            yield
        finally:
            state['locked'] = False
    registry = SimpleNamespace(_FileLock=file_lock,
        _lease_paths=lambda **kw: (home / 'leases.json', home / 'leases.lock'),
        _read_entries=lambda path, **kw: list(state['entries']),
        _prune_dead=lambda entries, **kw: entries,
        _holds_session=lambda entries, sid: any(e['session_id'] == sid for e in entries))
    monkeypatch.setitem(sys.modules, 'hermes_cli.active_sessions', registry)
    class Database:
        def __init__(self, db_path, read_only):
            assert Path(db_path) == home / 'state.db' and read_only is True
        def get_session(self, sid):
            return {'id': sid} if sid in state['chain'] else None
        def get_compression_chain(self, sid):
            state['chain_under_lock'].append(state['locked'])
            return state['chain'][state['chain'].index(sid):]
        def close(self):
            state['closed'] += 1
    monkeypatch.setitem(sys.modules, 'hermes_state', SimpleNamespace(SessionDB=Database))
    run = {'runtime_id': 'runtime', 'stored_id': 'root', 'started_at': '2026-09-16T12:00:00+00:00'}
    project = {'directory': str(directory)}
    return home, run, project, session, server, state


def test_a_live_lease_on_any_compression_ancestor_blocks_recovery(monkeypatch, tmp_path):
    assert hasattr(desktop_services, 'observe_mission_run'), 'Compression-aware recovery is missing'
    home, run, project, session, server, state = setup_lineage(monkeypatch, tmp_path)
    state['entries'] = [{'session_id': 'root'}]
    with desktop_services.observe_mission_run(run, project, home) as observed:
        assert observed['state'] == 'active'
        assert state['locked']
    assert state['chain_under_lock'][-1] is True
    assert state['closed'] >= 1 and not state['locked']


def test_stop_receipt_is_held_under_native_registry_lock(monkeypatch, tmp_path):
    assert hasattr(desktop_services, 'observe_mission_run'), 'Compression-aware recovery is missing'
    home, run, project, _, server, state = setup_lineage(monkeypatch, tmp_path)
    with desktop_services.observe_mission_run(run, project, home) as observed:
        assert observed['state'] == 'stopped' and state['locked']
        assert observed['stored_id'] == 'tip'
        assert not server._sessions
    assert not state['locked']


def test_a_busy_native_session_is_not_closed_even_if_lease_list_is_empty(monkeypatch, tmp_path):
    assert hasattr(desktop_services, 'observe_mission_run'), 'Compression-aware recovery is missing'
    home, run, project, session, server, state = setup_lineage(monkeypatch, tmp_path)
    session['running'] = True
    with desktop_services.observe_mission_run(run, project, home) as observed:
        assert observed['state'] == 'active'
    assert server._sessions['runtime'] is session


def test_missing_durable_lineage_after_dispatch_is_not_a_stop_receipt(monkeypatch, tmp_path):
    assert hasattr(desktop_services, 'observe_mission_run'), 'Compression-aware recovery is missing'
    home, run, project, _, server, state = setup_lineage(monkeypatch, tmp_path)
    state['chain'] = []
    with pytest.raises(ValueError, match='runtime_state_unconfirmed'):
        with desktop_services.observe_mission_run(run, project, home):
            pytest.fail('a missing lineage cannot prove inactivity')
    assert server._sessions
