import hashlib
import json
from pathlib import Path
import tarfile
import zipfile

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
        assert release['format'] == 1 and release['data_version'] == manifest['data_version'] == 2
        assert release['version'] == manifest['version']
        assert release['files'] == {target: hashlib.sha256((ROOT / source).read_bytes()).hexdigest() for source, target in manifest['files'].items()}
        for entry in members:
            assert entry.isfile() and not entry.issym() and not entry.islnk()
            assert '.env' not in entry.name and not entry.name.endswith(('.db', '.log'))
            if entry.name in expected:
                assert hashlib.sha256(bundle.extractfile(entry).read()).digest() == hashlib.sha256(expected[entry.name].read_bytes()).digest()
    assert manifest['profile'] == ('altron' if manifest_name == 'manifest.json' else 'altron-maintenance')


def test_handoff_kit_has_matching_profiles_checksums_and_offline_guides():
    manifest = json.loads((ROOT / 'packaging' / 'manifest.json').read_text(encoding='utf-8'))
    version = manifest['version']
    profiles = {f'{name}-{version}.tar.gz' for name in ('altron', 'altron-maintenance')}
    required = profiles | {'SHA256SUMS.txt', 'README.md', 'README.ru.md', 'LICENSE',
                          'THIRD_PARTY_NOTICES.md', 'docs/FIRST_RUN.md', 'docs/ALTRON_DESKTOP.md',
                          'docs/AUTONOMOUS_PROJECTS.md', 'docs/UPDATING.md', 'docs/DESKTOP_VERIFICATION.md'}
    with zipfile.ZipFile(ROOT / 'dist' / f'altron-kit-{version}.zip') as kit:
        names = kit.namelist()
        assert len(names) == len(set(names))
        assert required.issubset(names)
        assert all(not Path(name).is_absolute() and '..' not in Path(name).parts for name in names)
        assert all(name in required or (name.startswith('docs/') and name.endswith(('.md', '.json')))
                   for name in names)
        checksums = dict(line.split('  ', 1)[::-1] for line in kit.read('SHA256SUMS.txt').decode().splitlines())
        assert set(checksums) == profiles
        for name in profiles:
            assert hashlib.sha256(kit.read(name)).hexdigest() == checksums[name]
            assert kit.read(name) == (ROOT / 'dist' / name).read_bytes()
        for name in required - profiles - {'SHA256SUMS.txt'}:
            assert kit.read(name) == (ROOT / name).read_bytes()
