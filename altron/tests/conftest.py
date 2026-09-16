import os
import json
import shutil
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def isolated_home(tmp_path, monkeypatch):
    home = tmp_path / "hermes-home"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / 'localappdata'))
    monkeypatch.setenv("APPDATA", str(tmp_path / 'appdata'))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)


@pytest.fixture
def installed_altron(isolated_home):
    root = Path(__file__).resolve().parents[2]
    home = Path(os.environ["HERMES_HOME"])
    manifest = json.loads((root / "packaging/manifest.json").read_text(encoding="utf-8"))
    for source, target in manifest["files"].items():
        if target.startswith(("plugins/", "desktop-plugins/")):
            destination = home / target
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / source, destination)
    return home
