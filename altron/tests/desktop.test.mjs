import test from 'node:test';
import assert from 'node:assert/strict';

async function actions(options = {}) {
  let module;
  try { module = await import('../ui/actions.mjs'); }
  catch { assert.fail('Altron Desktop actions are not implemented'); }
  const calls = [];
  const listeners = new Map();
  let current = true;
  let connection = 'source-one';
  const api = async (path, opts = {}) => {
    calls.push(['api', path, opts.body]);
    if (path.endsWith('/runs')) return {id: 'run-one', prompt: 'Project-scoped prompt', directory: 'C:/Synthetic/Alpha'};
    return {};
  };
  const rpc = async (method, params) => {
    calls.push(['rpc', method, params]);
    if (method === 'session.create') {
      if (options.switchAfterCreate) current = false;
      if (options.switchConnectionAfterCreate) connection = 'source-two';
      return {session_id: 'runtime-one', stored_session_id: 'stored-one', info: {profile_name: options.wrongProfile ? 'other-profile' : 'test-profile', model: options.wrongModel ? 'wrong' : 'chosen-model', provider: 'chosen-provider'}};
    }
    if (method === 'prompt.submit') {
      if (options.submitError) throw new Error('connection lost');
      return {status: 'streaming'};
    }
    return {status: 'interrupted'};
  };
  const instance = module.createActions({api, rpc, isCurrent: () => current, getConnectionId: () => connection,
    getProfile: () => 'test-profile', onEvent: (type, fn) => { listeners.set(type, fn); return () => listeners.delete(type); },
    onDispose: () => {}, onTrackingError: error => { throw error; }, openSession: async id => calls.push(['open', id]), t: options.t});
  return {instance, calls, listeners, switchSource: () => { connection = 'source-two'; }};
}

const parameters = {projectId: 'project-one', taskId: 'task-one', role: 'technical', model: 'chosen-model', provider: 'chosen-provider'};

test('terminal error after accepted submission is persisted, not called success', async () => {
  const {instance, calls, listeners} = await actions();
  await instance.start(parameters);
  assert.equal(listeners.has('message.complete'), true);
  await listeners.get('message.complete')({type: 'message.complete', session_id: 'foreign', payload: {status: 'error'}});
  assert.equal(calls.filter(c => c[1].endsWith('/terminal')).length, 0);
  await listeners.get('message.complete')({type: 'message.complete', session_id: 'runtime-one', payload: {status: 'error'}});
  assert.deepEqual(calls.find(c => c[1].endsWith('/terminal'))[2], {runtime_id: 'runtime-one', status: 'error'});
  assert.equal(listeners.size, 0);
  assert.equal(calls.filter(c => c[1] === 'prompt.submit').length, 1);
});

test('terminal notification never writes into a different source', async () => {
  const {instance, calls, listeners, switchSource} = await actions();
  await instance.start(parameters);
  switchSource();
  assert.equal(listeners.has('message.complete'), true);
  await listeners.get('message.complete')({type: 'message.complete', session_id: 'runtime-one', payload: {status: 'error'}});
  assert.equal(calls.filter(c => c[1].endsWith('/terminal')).length, 0);
});

test('same profile name on another connection is a different owner', async () => {
  const {instance, calls} = await actions({switchConnectionAfterCreate: true});
  await assert.rejects(instance.start(parameters), /scope_changed/);
  assert.equal(calls.filter(c => c[0] === 'api').length, 1);
  assert.equal(calls.filter(c => c[1] === 'prompt.submit').length, 0);
});

test('one explicit run uses the selected model and only the bound project', async () => {
  const {instance, calls} = await actions();
  await instance.start(parameters);
  const rpc = calls.filter(c => c[0] === 'rpc');
  assert.deepEqual(rpc.map(c => c[1]), ['session.create', 'prompt.submit']);
  assert.equal(rpc[0][2].cwd, 'C:/Synthetic/Alpha');
  assert.equal(rpc[0][2].source, 'desktop');
  assert.equal(rpc[0][2].profile, 'test-profile');
  assert.equal(rpc[0][2].model, 'chosen-model');
  assert.equal(rpc[0][2].provider, 'chosen-provider');
  assert.equal(rpc[1][2].session_id, 'runtime-one');
  assert.equal(rpc[1][2].text, 'Project-scoped prompt');
  assert.ok(calls.filter(c => c[0] === 'api').every(c => c[1].startsWith('/projects/project-one/')));
});

test('lost submit response is unknown, never a hidden resend', async () => {
  const {instance, calls} = await actions({submitError: true});
  await assert.rejects(instance.start(parameters));
  assert.equal(calls.filter(c => c[1] === 'prompt.submit').length, 1);
  assert.equal(calls.find(c => c[0] === 'api' && c[1].endsWith('/status'))[2].status, 'unknown');
});

test('gateway model mismatch refuses the prompt rather than silently switching', async () => {
  const {instance, calls} = await actions({wrongModel: true});
  await assert.rejects(instance.start(parameters), /model_mismatch/);
  assert.equal(calls.filter(c => c[1] === 'prompt.submit').length, 0);
});

test('wrong backend profile refuses delivery', async () => {
  const {instance, calls} = await actions({wrongProfile: true});
  await assert.rejects(instance.start(parameters), /profile_mismatch/);
  assert.equal(calls.filter(c => c[1] === 'prompt.submit').length, 0);
});

test('profile change stops later writes instead of addressing the new backend', async () => {
  const {instance, calls} = await actions({switchAfterCreate: true});
  await assert.rejects(instance.start(parameters), /scope_changed/);
  assert.equal(calls.filter(c => c[0] === 'api').length, 1);
  assert.equal(calls.filter(c => c[1] === 'prompt.submit').length, 0);
});

test('a second simultaneous click does not create another session', async () => {
  const {instance, calls} = await actions();
  const outcomes = await Promise.allSettled([instance.start(parameters), instance.start(parameters)]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(calls.filter(c => c[1] === 'session.create').length, 1);
});

test('cancel is recorded as requested, not as confirmed cancellation', async () => {
  const {instance, calls} = await actions();
  await instance.cancel({projectId: 'project-one', run: {id: 'run-one', runtime_id: 'runtime-one'}});
  assert.equal(calls[0][2].status, 'cancel_requested');
  assert.equal(calls[1][1], 'session.interrupt');
  assert.equal(calls.filter(c => c[0] === 'api' && c[2].status === 'cancelled').length, 0);
});

test('stored run notes use the active interface language', async () => {
  const notes = {
    'actions.submitUnknown': 'Delivery response was not confirmed. There was no automatic retry.',
    'actions.cancelRequested': 'The user requested a stop. Completion is not confirmed yet.',
  };
  const t = key => notes[key] || key;
  const failed = await actions({submitError: true, t});
  await assert.rejects(failed.instance.start(parameters));
  assert.equal(failed.calls.find(call => call[0] === 'api' && call[1].endsWith('/status'))[2].note, notes['actions.submitUnknown']);

  const cancelled = await actions({t});
  await cancelled.instance.cancel({projectId: 'project-one', run: {id: 'run-one', runtime_id: 'runtime-one'}});
  assert.equal(cancelled.calls[0][2].note, notes['actions.cancelRequested']);
});
