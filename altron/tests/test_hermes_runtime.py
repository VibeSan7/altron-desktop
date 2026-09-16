from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
import sys
import threading

import pytest

from altron.dashboard import autonomous_runtime, desktop_services


@pytest.fixture
def bridge(monkeypatch, tmp_path):
    home = tmp_path / 'profile'
    folder = tmp_path / 'project'
    home.mkdir(); folder.mkdir()
    peer = SimpleNamespace(closed=False)
    ready = threading.Event(); ready.set()
    agent = SimpleNamespace(model='org/model:exact', _fallback_chain=[], _fallback_activated=False, skip_background_review=False)
    session = {'session_key': 'stored-1', 'profile_home': str(home), 'cwd': str(folder), 'running': False,
               'model_override': {'model': 'org/model:exact', 'provider': 'custom:chosen'},
               'agent': agent, 'agent_ready': ready, 'transport': peer}
    server = SimpleNamespace(_sessions={'runtime-1': session}, _sessions_lock=threading.RLock(), _hermes_home=home,
        _session_lookup_key=lambda value, **kw: value['session_key'],
        _session_live_status=lambda sid, value: 'working' if value['running'] else 'idle',
        _session_usage_snapshot=lambda value: {'input': 10, 'api_key': 'not metadata'},
        _close_session_by_id=lambda sid: server._sessions.pop(sid, None),
        _session_live_transports=lambda value: (value['transport'],),
        _transport_is_live_peer=lambda value: not value.closed,
        current_peer=None, current_home=None, calls=[])
    def bind(value):
        old = server.current_peer; server.current_peer = value; return old
    server.bind_transport = bind
    server.reset_transport = lambda value: setattr(server, 'current_peer', value)
    @contextmanager
    def scope(value):
        old = server.current_home
        server.current_home = value['profile_home']
        try:
            yield
        finally:
            server.current_home = old
    server._session_profile_runtime_scope = scope
    def request(value):
        server.calls.append((value, server.current_peer, server.current_home))
        if value['method'] == 'session.events.since':
            return {'result': {'epoch': 'epoch', 'events': [], 'count': 0, 'latest_seq': 0, 'truncated': False, 'open_requests': []}}
        if value['method'] == 'approval.pending':
            return {'result': {'approvals': getattr(server, 'approvals', [])}}
        if value['method'] == 'session.create':
            fresh = dict(session, session_key='stored-2', agent=SimpleNamespace(**vars(agent)))
            server._sessions['runtime-2'] = fresh
            return {'result': {'session_id': 'runtime-2', 'stored_session_id': 'stored-2'}}
        return {'result': {'status': 'streaming'}}
    server.handle_request = request
    monkeypatch.setitem(sys.modules, 'tui_gateway.server', server)
    mission = {'id': 'mission', 'connection': {'model': 'org/model:exact', 'provider': 'custom:chosen', 'profile': 'profile'}}
    turn = {'id': 'turn-1', 'directory': str(folder), 'phase': 'work', 'runtime_id': 'runtime-1', 'stored_id': 'stored-1'}
    def create():
        assert hasattr(autonomous_runtime, 'HermesRuntime'), 'Native Hermes adapter is not implemented'
        adapter = autonomous_runtime.HermesRuntime(home, desktop_services)
        return adapter, mission, turn, session, server, peer
    return create


def test_adapter_pins_native_transport_and_home_without_changing_connection(bridge):
    adapter, mission, turn, session, server, peer = bridge()
    adapter.bind(mission, turn, 'runtime-1', 'stored-1')
    assert adapter.ready(mission, turn)
    assert session['agent'].skip_background_review
    assert adapter.submit(mission, turn, 'Explicit approved assignment') == {'status': 'streaming'}
    req, used_peer, used_home = server.calls[-1]
    assert req['method'] == 'prompt.submit'
    assert req['params'] == {'session_id': 'runtime-1', 'text': 'Explicit approved assignment'}
    assert used_peer is peer and Path(used_home) == adapter.home
    assert server.current_peer is None and server.current_home is None


@pytest.mark.parametrize('change', ['profile', 'cwd', 'model', 'provider'])
def test_adapter_refuses_foreign_scope_before_any_rpc(bridge, change, tmp_path):
    adapter, mission, turn, session, server, _ = bridge()
    if change == 'profile':
        session['profile_home'] = str(tmp_path / 'foreign-profile')
    elif change == 'cwd':
        session['cwd'] = str(tmp_path / 'foreign-project')
    else:
        session['model_override'][change] = 'other'
    with pytest.raises(ValueError):
        adapter.bind(mission, turn, 'runtime-1', 'stored-1')
    assert not server.calls


def test_configured_fallback_is_not_used_for_an_autonomous_turn(bridge):
    adapter, mission, turn, session, server, _ = bridge()
    adapter.bind(mission, turn, 'runtime-1', 'stored-1')
    session['agent']._fallback_chain = [{'model': 'other', 'provider': 'other'}]
    with pytest.raises(ValueError, match='model_fallback_not_allowed'):
        adapter.ready(mission, turn)
    assert not server.calls


def test_reusing_a_runtime_identifier_does_not_transfer_authority(bridge):
    adapter, mission, turn, session, server, _ = bridge()
    adapter.bind(mission, turn, 'runtime-1', 'stored-1')
    server._sessions['runtime-1'] = dict(session)
    with pytest.raises(ValueError, match='runtime_ownership_lost'):
        adapter.submit(mission, turn, 'must not dispatch')
    assert not server.calls


def test_observation_is_passive_and_excludes_secrets(bridge):
    adapter, mission, turn, _, server, _ = bridge()
    adapter.bind(mission, turn, 'runtime-1', 'stored-1')
    assert adapter.observe(mission, turn) == {'state': 'idle', 'stored_id': 'stored-1', 'usage': {'input': 10}}
    assert 'runtime-1' in server._sessions
    assert not server.calls


def test_new_session_requires_a_live_original_channel(bridge):
    adapter, mission, turn, _, server, peer = bridge()
    assert not adapter.can_create(mission)
    adapter.bind(mission, turn, 'runtime-1', 'stored-1')
    assert adapter.can_create(mission)
    assert adapter.create(mission, turn)['session_id'] == 'runtime-2'
    params = server.calls[-1][0]['params']
    assert params['model'] == 'org/model:exact' and params['provider'] == 'custom:chosen'
    peer.closed = True
    assert not adapter.can_create(mission)
    count = len(server.calls)
    with pytest.raises(ValueError, match='runtime_connection_lost'):
        adapter.create(mission, turn)
    assert len(server.calls) == count


def test_native_terminal_receipt_is_read_from_the_owned_replay(bridge):
    adapter, mission, turn, session, server, _ = bridge()
    original = server.handle_request
    events = []
    def replay(request):
        if request['method'] == 'session.events.since':
            cursor = request['params']['last_seen']
            rows = [row for row in events if row['seq'] > cursor]
            return {'result': {'events': rows, 'latest_seq': len(events), 'count': len(rows), 'epoch': 'native-epoch', 'truncated': False, 'open_requests': []}}
        return original(request)
    server.handle_request = replay
    events.append({'seq': 1, 'type': 'message.complete', 'session_id': 'runtime-1', 'payload': {'status': 'error'}})
    adapter.bind(mission, turn, 'runtime-1', 'stored-1')
    adapter.submit(mission, turn, 'Owned assignment')
    assert not adapter.observe(mission, turn).get('terminal_status'), 'A pre-submission receipt is not this turn'
    events.append({'seq': 2, 'type': 'message.complete', 'session_id': 'foreign', 'payload': {'status': 'complete'}})
    assert not adapter.observe(mission, turn).get('terminal_status')
    events.append({'seq': 3, 'type': 'message.complete', 'session_id': 'runtime-1', 'payload': {'status': 'complete'}})
    assert adapter.observe(mission, turn)['terminal_status'] == 'complete'
