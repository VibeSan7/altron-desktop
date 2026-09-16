import {createActions} from './actions.mjs';

export function createCoordinator(options) {
  const {api, rpc, getConnectionId, getProfile, isConnected, onEvent, onScopeChange, onError} = options;
  const jobs = new Map();
  let disposed = false;
  const owner = () => JSON.stringify([getConnectionId(), getProfile()]);
  const keyFor = ({projectId, taskId}) => JSON.stringify([owner(), projectId, taskId]);
  const close = job => {
    job.enabled = false;
    for (const stop of job.stops) stop();
    if (jobs.get(job.key) === job) jobs.delete(job.key);
  };
  const check = source => {
    if (disposed || !isConnected() || owner() !== source) throw new Error('scope_changed');
  };
  const invalidate = () => { for (const job of jobs.values()) close(job); };
  const unsubscribe = onScopeChange(invalidate);
  async function pump(job) {
    if (!job.enabled) return;
    if (job.pumping) { job.pending = true; return; }
    job.pumping = true;
    try {
      do {
        job.pending = false;
        check(job.owner);
        const run = await job.actions.start({...job.ids, team: true});
        if (!run) close(job);
      } while (job.pending && job.enabled);
    } catch (error) {
      close(job);
      throw error;
    } finally {
      job.pumping = false;
    }
  }
  return {
    async start(ids) {
      const key = keyFor(ids), source = owner();
      check(source);
      if (jobs.has(key)) throw new Error('run_already_starting');
      const job = {key, owner: source, ids, enabled: true, pumping: false, pending: false, stops: []};
      jobs.set(key, job);
      job.actions = createActions({api, rpc, getConnectionId, getProfile, onEvent,
        isCurrent: () => job.enabled && !disposed && isConnected(),
        onDispose: stop => job.stops.push(stop),
        onTrackingError: error => {close(job); onError(error);},
        onTerminal: async ({status}) => {
          if (status !== 'complete' || !job.enabled) {close(job); return;}
          await pump(job);
        },
      });
      try {
        await api(`/projects/${encodeURIComponent(ids.projectId)}/tasks/${encodeURIComponent(ids.taskId)}/team/resume`, {method: 'POST'});
        check(source);
        await pump(job);
      } catch (error) {
        close(job);
        throw error;
      }
    },
    async pause(ids) {
      const source = owner();
      check(source);
      const job = jobs.get(keyFor(ids));
      if (job) job.enabled = false;
      const result = await api(`/projects/${encodeURIComponent(ids.projectId)}/tasks/${encodeURIComponent(ids.taskId)}/team/pause`, {method: 'POST'});
      check(source);
      if (result.active_run?.runtime_id) await rpc('session.interrupt', {session_id: result.active_run.runtime_id});
      else if (job) close(job);
    },
    dispose() {
      disposed = true;
      unsubscribe();
      invalidate();
    },
  };
}
