"""Hermes agent tools for explicitly assigned Altron runs."""

import json


def register(ctx):
    def invoke(args, update=False, **kwargs):
        from gateway.session_context import get_session_env
        from .dashboard.plugin_api import AltronError, get_missions, get_store
        try:
            store = get_store()
            runtime_id = get_session_env("HERMES_UI_SESSION_ID", "")
            try:
                context = store.agent_context(runtime_id)
            except AltronError as exc:
                if str(exc) != 'session_not_bound':
                    raise
                missions = get_missions(store)
                context = missions.context(runtime_id)
                if update:
                    return json.dumps({'ok': True, 'data': missions.update(runtime_id, args)}, ensure_ascii=False)
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
        except ValueError as exc:
            return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)

    from .dashboard.mission_hooks import observe
    ctx.register_hook('pre_tool_call', lambda **event: observe('before', **event))
    ctx.register_hook('post_tool_call', lambda **event: observe('after', **event))
    ctx.register_hook('on_session_end', lambda **event: observe('end', **event))

    ctx.register_tool(
        name="altron_context", toolset="altron",
        schema={"name": "altron_context", "description": "Получить только назначенный этой сессии проект, задачу, решения и запуск Altron. Чужая сессия отклоняется.", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}},
        handler=lambda args, **kw: invoke(args, **kw),
    )
    ctx.register_tool(
        name="altron_update", toolset="altron",
        schema={"name": "altron_update", "description": "Сохранить предложенный план, реальные файлы результата, заключение проверки или блокировку назначенного запуска. Не утверждает план и не принимает задачу вместо пользователя.", "parameters": {"type": "object", "properties": {"action": {"type": "string", "enum": ["plan", "interview", "checkpoint", "result", "review", "blocked"]}, "summary": {"type": "string", "minLength": 1, "maxLength": 16000}, "contract": {"type": "object", "description": "Interview proposal: name, goal, requirements, out_of_scope, plan, deliverables and checks."}, "instructions": {"type": "string", "maxLength": 16000}, "paths": {"type": "array", "items": {"type": "string"}, "maxItems": 30}, "steps": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"type": "object", "properties": {"role": {"type": "string", "enum": ["technical", "business", "memory"]}, "goal": {"type": "string", "minLength": 1, "maxLength": 16000}, "acceptance": {"type": "string", "minLength": 1, "maxLength": 16000}}, "required": ["role", "goal", "acceptance"], "additionalProperties": False}}}, "required": ["action", "summary"], "additionalProperties": False}},
        handler=lambda args, **kw: invoke(args, update=True, **kw),
    )
