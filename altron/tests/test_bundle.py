import hashlib
import json
from pathlib import Path
import tarfile

import pytest


ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize('manifest_name', ['manifest.json', 'maintenance-manifest.json'])
def test_release_contains_only_declared_regular_files(manifest_name):
    manifest = json.loads((ROOT / 'packaging' / manifest_name).read_text(encoding='utf-8'))
    profile = manifest['profile']
    archive = ROOT / 'dist' / f"{profile}-{manifest['version']}.tar.gz"
    expected = {f"{profile}/{target}": ROOT / source for source, target in manifest['files'].items()}
    with tarfile.open(archive) as bundle:
        members = bundle.getmembers()
        assert len({entry.name for entry in members}) == len(members)
        assert {entry.name for entry in members} == set(expected) | {f'{profile}/release.json'}
        release = json.loads(bundle.extractfile(f'{profile}/release.json').read())
        assert release['format'] == 1 and release['data_version'] == 1
        assert release['version'] == manifest['version']
        assert release['files'] == {target: hashlib.sha256((ROOT / source).read_bytes()).hexdigest() for source, target in manifest['files'].items()}
        for entry in members:
            assert entry.isfile() and not entry.issym() and not entry.islnk()
            assert '.env' not in entry.name and not entry.name.endswith(('.db', '.log'))
            if entry.name in expected:
                assert hashlib.sha256(bundle.extractfile(entry).read()).digest() == hashlib.sha256(expected[entry.name].read_bytes()).digest()
    assert manifest['profile'] == ('altron' if manifest_name == 'manifest.json' else 'altron-maintenance')
