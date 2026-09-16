import pytest

from altron.dashboard.plugin_api import Store
from altron.dashboard.missions import MissionStore
from altron.dashboard.maintenance import MaintenanceError
from altron.tests.test_maintenance import _maintenance


def test_prepared_interview_blocks_maintenance_without_legacy_runs(tmp_path):
    maintenance, home, _ = _maintenance(tmp_path)
    missions = MissionStore(Store(home / 'altron'))
    missions.create('A new need', 'chosen', 'explicit', 'altron')
    with pytest.raises(MaintenanceError, match='active_operations'):
        with maintenance._validate_database():
            pass


def test_migrated_idle_profile_remains_maintainable(tmp_path):
    maintenance, home, _ = _maintenance(tmp_path)
    Store(home / 'altron')
    with maintenance._validate_database():
        pass


def test_schema_two_update_accepts_schema_one_profile(tmp_path):
    import hashlib
    from altron.tests.test_maintenance import _archive, REQUIRED
    maintenance, _, _ = _maintenance(tmp_path)
    archive = _archive(REQUIRED, version='0.5.0-beta.1', data_version=2)
    staged = maintenance.stage(archive, hashlib.sha256(archive).hexdigest())
    assert maintenance.apply(staged['id'])['status'] == 'applied'


def test_old_release_cannot_replace_code_after_migration(tmp_path):
    import hashlib
    from altron.tests.test_maintenance import _valid_archive
    maintenance, home, _ = _maintenance(tmp_path)
    Store(home / 'altron')
    archive = _valid_archive()
    staged = maintenance.stage(archive, hashlib.sha256(archive).hexdigest())
    before = (home / 'plugins/altron/__init__.py').read_bytes()
    with pytest.raises(MaintenanceError, match='database_incompatible'):
        maintenance.apply(staged['id'])
    assert (home / 'plugins/altron/__init__.py').read_bytes() == before


def test_code_only_rollback_is_blocked_after_schema_migration(tmp_path):
    import hashlib
    from altron.tests.test_maintenance import _valid_archive
    maintenance, home, _ = _maintenance(tmp_path)
    archive = _valid_archive()
    staged = maintenance.stage(archive, hashlib.sha256(archive).hexdigest())
    maintenance.apply(staged['id'])
    Store(home / 'altron')
    before = (home / 'plugins/altron/__init__.py').read_bytes()
    with pytest.raises(MaintenanceError, match='database_incompatible'):
        maintenance.rollback()
    assert (home / 'plugins/altron/__init__.py').read_bytes() == before


def test_store_does_not_migrate_when_maintenance_guard_blocks(tmp_path):
    import sqlite3
    from altron.dashboard.plugin_api import AltronError
    _, home, _ = _maintenance(tmp_path)
    def blocked():
        raise AltronError('restart_required')
    with pytest.raises(AltronError, match='restart_required'):
        Store(home / 'altron', guard=blocked)
    with sqlite3.connect(home / 'altron/altron.db') as db:
        assert db.execute('PRAGMA user_version').fetchone()[0] == 1
        assert db.execute("SELECT count(*) FROM sqlite_master WHERE name='altron_missions'").fetchone()[0] == 0
