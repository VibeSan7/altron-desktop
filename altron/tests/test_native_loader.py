import importlib
import json


def test_native_plugin_manager_registers_only_altron_tools(tmp_path, installed_altron):
    from hermes_constants import get_hermes_home
    from hermes_cli.plugins import PluginManager
    from tools.registry import registry
    home = get_hermes_home()
    (home / 'config.yaml').write_text('plugins:\n  enabled:\n    - altron\n', encoding='utf-8')
    manager = PluginManager(scope_key=str(home))
    try:
        manager.discover_and_load()
        assert set(manager._plugins['altron'].tools_registered) == {'altron_context', 'altron_update'}
        response = json.loads(registry.dispatch('altron_context', {}, scope=manager.scope_key))
        assert response == {'ok': False, 'error': 'session_not_bound'}
    finally:
        manager.unload()
