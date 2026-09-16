import importlib
import json

import pytest

from altron.tests.test_missions import CONTRACT, mission_store
from altron.dashboard.plugin_api import Store


class Context:
    def __init__(self):
        self.tools, self.hooks = {}, {}

    def register_tool(self, **kw):
        self.tools[kw['name']] = kw['handler']

    def register_hook(self, name, callback):
        self.hooks[name] = callback


def test_native_hooks_bind_interview_receipts_to_runtime_not_model_arguments(tmp_path, monkeypatch):
    pytest.importorskip('gateway.session_context')
    plugin = importlib.import_module('altron')
    api = importlib.import_module('altron.dashboard.plugin_api')
    store = Store(tmp_path / 'data')
    monkeypatch.setattr(api, 'get_store', lambda: store)
    missions = mission_store(store)
    mission = missions.create('Discover a useful result', 'model', 'provider', 'profile')
    turn = mission['turns'][-1]
    missions.bind(mission['id'], turn['id'], 'runtime', 'stored')
    missions.claim(mission['id'], turn['id'])
    ctx = Context(); plugin.register(ctx)
    assert {'pre_tool_call', 'post_tool_call', 'on_session_end'} <= set(ctx.hooks)
    from gateway.session_context import set_session_vars, clear_session_vars
    tokens = set_session_vars(ui_session_id='runtime')
    try:
        bound = json.loads(ctx.tools['altron_context']({}))
        assert bound['ok'] and bound['data']['mode'] == 'mission'
        denied = ctx.hooks['pre_tool_call'](tool_name='terminal', args={'command': 'not allowed'}, tool_call_id='blocked-call')
        assert denied['action'] == 'block'
        assert 'interview_tools_only' in denied['message']
        response = json.loads(ctx.tools['altron_update']({'action': 'interview', 'summary': 'Proposed outcome', 'contract': CONTRACT}))
        assert response['ok'], response
        assert missions.get(mission['id'])['status'] == 'running'
        ctx.hooks['on_session_end'](session_id='stored', completed=True, interrupted=False)
        assert missions.get(mission['id'])['turns'][-1]['terminal_status'] == 'complete'
        assert missions.settle(mission['id'], turn['id'])['status'] == 'awaiting_approval'
    finally:
        clear_session_vars(tokens)
    assert ctx.hooks['pre_tool_call'](tool_name='terminal', args={}) is None
