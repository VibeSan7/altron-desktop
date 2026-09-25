import {russianT} from './i18n.mjs';

export function createActions({api, rpc, isCurrent, getConnectionId, getProfile, onEvent, onDispose, onTrackingError, onTerminal, openSession, t = russianT}) {
  const busy = new Set();
  const connectionId = getConnectionId();
  const profile = getProfile();
  const sourceCurrent = () => getConnectionId() === connectionId && getProfile() === profile;
  const current = () => isCurrent() && sourceCurrent();
  const track = (projectId, runId, runtimeId) => {
    const stop = onEvent('message.complete', async event => {
      if (event.session_id !== runtimeId || !['complete', 'error', 'interrupted'].includes(event.payload?.status)) return;
      stop();
      if (!sourceCurrent()) return;
      try {
        await api(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/terminal`, {
          method: 'POST', body: {runtime_id: runtimeId, status: event.payload.status},
        });
        if (sourceCurrent()) await onTerminal?.({projectId, runId, status: event.payload.status});
      } catch (error) {
        onTrackingError(error);
      }
    });
    onDispose(stop);
  };
  const check = () => { if (!current()) throw new Error('scope_changed'); };
  const post = (path, body) => {
    check();
    return api(path, {method: 'POST', body});
  };
  return {
    async start({projectId, taskId, role, model, provider, specialist = null, team = false}) {
      const key = `${projectId}:${taskId}`;
      check();
      if (busy.has(key)) throw new Error('run_already_starting');
      if (!team && (!model?.trim() || !provider?.trim())) throw new Error('model_and_provider_required');
      busy.add(key);
      let run;
      let submitted = false;
      try {
        const path = `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;
        run = team ? await post(`${path}/team/next`) : await post(`${path}/runs`, {role, model, provider, specialist});
        if (!run) return null;
        if (team) ({role, model, provider} = run);
        check();
        const session = await rpc('session.create', {
          source: 'desktop', profile, cwd: run.directory, title: `Altron · ${role} · ${taskId.slice(0, 8)}`,
          model, provider, reasoning_effort: 'max', close_on_disconnect: false,
          hidden: false, follow_profile_config: false,
        });
        check();
        if (session.info?.model !== model || session.info?.provider !== provider) throw new Error('model_mismatch');
        if (session.info?.profile_name !== profile) throw new Error('profile_mismatch');
        if (!session.session_id || !session.stored_session_id) throw new Error('session_identity_missing');
        await post(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(run.id)}/bind`, {
          runtime_id: session.session_id, stored_id: session.stored_session_id,
        });
        check();
        track(projectId, run.id, session.session_id);
        submitted = true;
        const accepted = await rpc('prompt.submit', {session_id: session.session_id, text: run.prompt});
        if (accepted.status !== 'streaming') throw new Error('prompt_delivery_unconfirmed');
        return {...run, runtime_id: session.session_id, stored_id: session.stored_session_id, status: 'running'};
      } catch (error) {
        if (run && current()) {
          try {
            await post(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(run.id)}/status`, {
              status: submitted ? 'unknown' : 'failed',
              note: submitted ? t('actions.submitUnknown') : t('actions.stoppedBeforeSubmit'),
            });
          } catch {
            throw new Error('run_state_unconfirmed', {cause: error});
          }
        }
        throw error;
      } finally {
        busy.delete(key);
      }
    },
    async cancel({projectId, run}) {
      check();
      await post(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(run.id)}/status`, {
        status: 'cancel_requested', note: t('actions.cancelRequested'),
      });
      check();
      if (run.runtime_id) await rpc('session.interrupt', {session_id: run.runtime_id});
      return {status: 'cancel_requested'};
    },
    async open(run) {
      check();
      if (!run.stored_id) throw new Error('session_identity_missing');
      return openSession(run.stored_id);
    },
  };
}
