"""Hermes agent tools for explicitly assigned Altron runs."""

import json


def register(ctx):
    def invoke(args, update=False, **kwargs):
        from gateway.session_context import get_session_env
        from .dashboard.plugin_api import AltronError, get_store
        try:
            store = get_store()
            context = store.agent_context(get_session_env("HERMES_UI_SESSION_ID", ""))
            if not update:
                return json.dumps({"ok": True, "data": context}, ensure_ascii=False)
            pid, rid = context["project"]["id"], context["run"]["id"]
            handlers = {
                "plan": lambda: store.propose_plan(pid, rid, args.get("summary"), steps=args.get("steps")),
                "result": lambda: store.submit_result(pid, rid, args.get("summary"), args.get("paths")),
                "review": lambda: store.submit_review(pid, rid, args.get("summary")),
                "blocked": lambda: store.mark_run(pid, rid, "failed", args.get("summary")),
            }
            if args.get("action") not in handlers:
                raise AltronError("action_not_allowed")
            return json.dumps({"ok": True, "data": handlers[args["action"]]()}, ensure_ascii=False)
        except AltronError as exc:
            return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)

    ctx.register_tool(
        name="altron_context", toolset="altron",
        schema={"name": "altron_context", "description": "Получить только назначенный этой сессии проект, задачу, решения и запуск Altron. Чужая сессия отклоняется.", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}},
        handler=lambda args, **kw: invoke(args, **kw),
    )
    ctx.register_tool(
        name="altron_update", toolset="altron",
        schema={"name": "altron_update", "description": "Сохранить предложенный план, реальные файлы результата, заключение проверки или блокировку назначенного запуска. Не утверждает план и не принимает задачу вместо пользователя.", "parameters": {"type": "object", "properties": {"action": {"type": "string", "enum": ["plan", "result", "review", "blocked"]}, "summary": {"type": "string", "minLength": 1, "maxLength": 16000}, "paths": {"type": "array", "items": {"type": "string"}, "maxItems": 30}, "steps": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"type": "object", "properties": {"role": {"type": "string", "enum": ["technical", "business", "memory"]}, "goal": {"type": "string", "minLength": 1, "maxLength": 16000}, "acceptance": {"type": "string", "minLength": 1, "maxLength": 16000}}, "required": ["role", "goal", "acceptance"], "additionalProperties": False}}}, "required": ["action", "summary"], "additionalProperties": False}},
        handler=lambda args, **kw: invoke(args, update=True, **kw),
    )
