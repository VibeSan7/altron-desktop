"""Native Hermes receipts, never worker-supplied claims about execution."""

from fastapi import HTTPException


def observe(stage, **event):
    from gateway.session_context import get_session_env
    runtime_id = get_session_env('HERMES_UI_SESSION_ID', '')
    if not runtime_id:
        return None
    from .plugin_api import get_missions, get_store
    try:
        missions = get_missions(get_store())
        missions.context(runtime_id)
        if stage == 'before':
            missions.before_tool(runtime_id, event['tool_name'], event.get('args') or {}, event.get('tool_call_id'))
        elif stage == 'after':
            missions.after_tool(runtime_id, event['tool_name'], event.get('args') or {}, event.get('result'),
                                event.get('tool_call_id'), event.get('status'))
        elif stage == 'end':
            status = 'interrupted' if event.get('interrupted') else 'complete' if event.get('completed') and not event.get('failed') else 'error'
            missions.terminal(runtime_id, status)
    except (ValueError, OSError, HTTPException) as exc:
        message = str(getattr(exc, 'detail', exc))
        if stage == 'before' and message != 'session_not_bound':
            return {'action': 'block', 'message': 'Altron: ' + message}
    return None
