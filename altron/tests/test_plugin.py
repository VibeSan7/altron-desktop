import importlib
import json
from pathlib import Path

import pytest


def test_registered_tools_obey_the_real_session_context(tmp_path, installed_altron):
    plugin = importlib.import_module("altron")
    assert hasattr(plugin, "register"), "Altron agent plugin is not implemented"
    from gateway.session_context import set_session_vars, clear_session_vars
    api = importlib.import_module("altron.dashboard.plugin_api")
    store = api.get_store()
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    pid = store.create_project("Сайт", str(project_dir))["id"]
    task = store.create_task(pid, "Записать файл", "Прочитать обратно")
    store.approve(pid, task["id"], "Создать файл и прочитать")
    run = store.prepare_run(pid, task["id"], "technical", "model", "provider")
    store.bind_run(pid, run["id"], "own-runtime", "own-stored")
    registered = {}
    class Context:
        def register_tool(self, **kwargs):
            registered[kwargs["name"]] = kwargs
    plugin.register(Context())
    assert set(registered) == {"altron_context", "altron_update"}
    tokens = set_session_vars(ui_session_id="foreign-runtime")
    try:
        denied = json.loads(registered["altron_context"]["handler"]({}))
        assert denied["ok"] is False
        assert denied["error"] == "session_not_bound"
    finally:
        clear_session_vars(tokens)
    tokens = set_session_vars(ui_session_id="own-runtime")
    try:
        result = json.loads(registered["altron_context"]["handler"]({}))
        assert result["data"]["task"]["id"] == task["id"]
        (project_dir / "result.txt").write_text("Реальный файл", encoding="utf-8")
        result = json.loads(registered["altron_update"]["handler"]({"action": "result", "summary": "Файл создан", "paths": ["result.txt"]}))
        assert result["data"]["status"] == "review"
        refused = json.loads(registered["altron_update"]["handler"]({"action": "accept", "summary": "Готово"}))
        assert refused["ok"] is False
        assert store.project(pid)["tasks"][0]["status"] == "review"
    finally:
        clear_session_vars(tokens)
