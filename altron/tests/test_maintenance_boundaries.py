import hashlib
import gzip
import json
import sqlite3

import pytest

from altron.dashboard.maintenance import Maintenance, MaintenanceError
from test_maintenance import REQUIRED, _archive, _maintenance, _valid_archive


def test_compressed_input_is_bounded_before_tar_parsing(tmp_path):
    service, _, _ = _maintenance(tmp_path)
    archive = gzip.compress(b"x" * (34 * 1024 * 1024))
    with pytest.raises(MaintenanceError, match="archive_total_too_large"):
        service.stage(archive, hashlib.sha256(archive).hexdigest())


def test_same_stage_cannot_replace_the_original_backup_on_retry(tmp_path):
    service, profile, _ = _maintenance(tmp_path)
    archive = _valid_archive()
    stage = service.stage(archive, hashlib.sha256(archive).hexdigest())
    applied = service.apply(stage['id'])
    with pytest.raises(MaintenanceError, match='update_pending'):
        service.apply(stage['id'])
    assert service.status()['backup_id'] == applied['backup_id']
    service.rollback()
    assert (profile / 'plugins/altron/__init__.py').read_bytes() == REQUIRED['plugins/altron/__init__.py']


def test_apply_and_rollback_keep_database_locked_until_code_is_written(tmp_path, monkeypatch):
    service, _, _ = _maintenance(tmp_path)
    archive = _valid_archive()
    staged = service.stage(archive, hashlib.sha256(archive).hexdigest())
    original = service._replace_file
    blocked = []

    def observed(source, target):
        db = sqlite3.connect(service.database, timeout=0)
        try:
            db.execute('BEGIN IMMEDIATE')
            blocked.append(False)
        except sqlite3.OperationalError:
            blocked.append(True)
        finally:
            db.rollback()
            db.close()
        return original(source, target)

    monkeypatch.setattr(service, '_replace_file', observed)
    service.apply(staged['id'])
    service.rollback()
    assert blocked and all(blocked), 'A new run must not start between validation and file replacement'


def test_checking_a_later_package_preserves_the_existing_rollback(tmp_path):
    service, profile, _ = _maintenance(tmp_path)
    first = _valid_archive()
    applied = service.apply(service.stage(first, hashlib.sha256(first).hexdigest())['id'])
    later = _archive({name: data.replace(b'old', b'next') for name, data in REQUIRED.items()}, version='0.4.0')
    service.stage(later, hashlib.sha256(later).hexdigest())
    assert service.status()['backup_id'] == applied['backup_id']
    service.rollback()
    assert (profile / 'plugins/altron/__init__.py').read_bytes() == b'old init\n'


def test_later_release_can_update_after_previous_application(tmp_path):
    service, profile, desktop = _maintenance(tmp_path)
    first = _valid_archive()
    service.apply(service.stage(first, hashlib.sha256(first).hexdigest())['id'])
    later = _archive({name: data.replace(b'old', b'next') for name, data in REQUIRED.items()}, version='0.4.0')
    restarted = Maintenance(profile, desktop)
    restarted.apply(restarted.stage(later, hashlib.sha256(later).hexdigest())['id'])
    restarted.rollback()
    assert (profile / 'plugins/altron/__init__.py').read_bytes() == b'new init\n'


def test_corrupt_backup_is_rejected_before_any_rollback_write(tmp_path):
    service, profile, desktop = _maintenance(tmp_path)
    archive = _valid_archive()
    result = service.apply(service.stage(archive, hashlib.sha256(archive).hexdigest())['id'])
    backup = profile / 'altron/maintenance/backups' / result['backup_id'] / 'code/plugins/altron/__init__.py'
    backup.write_bytes(b'corrupt backup')
    with pytest.raises(MaintenanceError, match='backup_invalid'):
        service.rollback()
    for name, data in REQUIRED.items():
        assert ((profile if name.startswith('plugins/') else desktop) / name).read_bytes() == data.replace(b'old', b'new')


def test_journal_paths_cannot_redirect_rollback_into_private_files(tmp_path):
    service, profile, _ = _maintenance(tmp_path)
    archive = _valid_archive()
    service.apply(service.stage(archive, hashlib.sha256(archive).hexdigest())['id'])
    state = json.loads(service.journal_path.read_text())
    record = next(row for row in state['operation']['files'] if row['path'] == 'plugins/altron/__init__.py')
    record['path'] = 'plugins/altron/../../auth.json'
    record['new_sha256'] = hashlib.sha256((profile / 'auth.json').read_bytes()).hexdigest()
    service.journal_path.write_text(json.dumps(state))
    with pytest.raises(MaintenanceError):
        service.rollback()
    assert (profile / 'auth.json').read_bytes() == b'{"token":"private"}\n'


@pytest.mark.parametrize('path', ['plugins/altron/file.py.', 'plugins/altron/file.py ', 'plugins/altron/CON', 'plugins/altron/AUX.txt', 'plugins/altron/LPT1.py'])
def test_windows_ambiguous_names_are_rejected_before_staging(tmp_path, path):
    service, profile, _ = _maintenance(tmp_path)
    archive = _archive(dict(REQUIRED, **{path: b'x'}))
    with pytest.raises(MaintenanceError):
        service.stage(archive, hashlib.sha256(archive).hexdigest())
    assert not (profile / 'altron/maintenance').exists()


def test_update_can_add_a_managed_subdirectory(tmp_path):
    service, profile, _ = _maintenance(tmp_path)
    archive = _archive(dict(REQUIRED, **{'plugins/altron/nested/module.py': b'new code'}))
    service.apply(service.stage(archive, hashlib.sha256(archive).hexdigest())['id'])
    assert (profile / 'plugins/altron/nested/module.py').read_bytes() == b'new code'
    service.rollback()
    assert not (profile / 'plugins/altron/nested/module.py').exists()
