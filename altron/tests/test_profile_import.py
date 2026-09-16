import json
from pathlib import Path

import pytest


def test_official_importer_preserves_package_and_refuses_overwrite(tmp_path):
    from hermes_cli.profiles import get_profile_dir, import_profile
    root = Path(__file__).resolve().parents[2]
    manifest = json.loads((root / 'packaging/manifest.json').read_text(encoding='utf-8'))
    target = get_profile_dir('altron')
    assert target.resolve().is_relative_to(tmp_path.resolve()), 'Import must stay inside the synthetic home'
    archive = root / 'dist' / f"altron-{manifest['version']}.tar.gz"
    imported = import_profile(str(archive))
    assert imported == target
    for source, relative in manifest['files'].items():
        assert (imported / relative).read_bytes() == (root / source).read_bytes()
    assert not (imported / '.env').exists()
    assert not (imported / 'altron').exists()
    with pytest.raises(FileExistsError, match="already exists"):
        import_profile(str(archive))
