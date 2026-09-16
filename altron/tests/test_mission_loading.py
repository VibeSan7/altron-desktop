import importlib.util
from pathlib import Path
import sys


def test_mission_store_loads_as_a_standalone_dashboard_component(tmp_path):
    path = Path(__file__).parents[1] / 'dashboard' / 'missions.py'
    spec = importlib.util.spec_from_file_location('qa_altron_missions', path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
        from altron.dashboard.plugin_api import Store
        mission = module.MissionStore(Store(tmp_path / 'data')).create('A useful result', 'model', 'provider', 'profile')
        assert mission['status'] == 'prepared'
    finally:
        sys.modules.pop(spec.name, None)
