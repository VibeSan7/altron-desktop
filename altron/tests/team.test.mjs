import test from 'node:test';
import assert from 'node:assert/strict';

async function setup(options = {}) {
  let createCoordinator;
  try { ({createCoordinator} = await import('../ui/team.mjs')); }
  catch { assert.fail('Team coordinator is not implemented'); }
  const calls = [], errors = [], listeners = new Set(), changes = new Set();
  let connection = 'connection', profile = 'profile', ready = true, count = 0;
  const emit = async (id, status) => {
    for (const fn of [...listeners]) await fn({session_id: id, payload: {status}});
  };
  const api = async (path, init = {}) => {
    calls.push({path, body: init.body});
    if (path.endsWith('/next')) {
      if (!ready || count === 2) return null;
      ready = false; count++;
      return {id: `run-${count}`, role: count === 1 ? 'technical' : 'memory', model: `model-${count}`, provider: `provider-${count}`, directory: 'C:/Synthetic/Project', prompt: `step-${count}`};
    }
    if (path.endsWith('/terminal')) {
      if (options.terminalFailure) throw new Error('terminal_write_failed');
      ready = init.body.status === 'complete';
    }
    if (path.endsWith('/pause')) {ready = false; return {active_run: {runtime_id: `session-${count}`}};}
    return {};
  };
  const rpc = async (method, body) => {
    calls.push({method, body});
    if (method === 'session.create') return {session_id: `session-${count}`, stored_session_id: `stored-${count}`, info: {model: body.model, provider: body.provider, profile_name: body.profile}};
    if (method === 'prompt.submit') {
      if (options.lostSubmit) throw new Error('lost_response');
      if (options.fastComplete) await emit(body.session_id, 'complete');
      return {status: 'streaming'};
    }
  };
  const coordinator = createCoordinator({api, rpc, getConnectionId: () => connection, getProfile: () => profile,
    isConnected: () => true, onError: error => errors.push(error),
    onEvent: (type, fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    onScopeChange: fn => { changes.add(fn); return () => changes.delete(fn); },
  });
  return {coordinator, calls, errors, emit, listeners, switchProfile() {profile = 'other'; for (const fn of changes) fn();}, switchConnection() {connection = 'other'; for (const fn of changes) fn();}};
}
const task = {projectId: 'project', taskId: 'task'};

for (const fastComplete of [false, true]) test(`only confirmed terminal success starts next assigned route (fast=${fastComplete})`, async () => {
  const s = await setup({fastComplete});
  assert.equal(s.calls.length, 0);
  await s.coordinator.start(task);
  if (!fastComplete) {
    assert.equal(s.calls.filter(c => c.method === 'prompt.submit').length, 1);
    await s.emit('foreign-session', 'complete');
    assert.equal(s.calls.filter(c => c.method === 'prompt.submit').length, 1);
    await s.emit('session-1', 'complete');
    await s.emit('session-2', 'complete');
  }
  assert.deepEqual(s.calls.filter(c => c.method === 'session.create').map(c => [c.body.model, c.body.provider]), [['model-1', 'provider-1'], ['model-2', 'provider-2']]);
  assert.deepEqual(s.calls.filter(c => c.method === 'prompt.submit').map(c => c.body.text), ['step-1', 'step-2']);
  assert.equal(s.calls.filter(c => c.path?.endsWith('/resume')).length, 1);
  assert.equal(s.errors.length, 0);
  assert.equal(s.listeners.size, 0);
  s.coordinator.dispose();
});

for (const status of ['error', 'interrupted']) test(`terminal ${status} never starts next model`, async () => {
  const s = await setup();
  await s.coordinator.start(task);
  await s.emit('session-1', status);
  assert.equal(s.calls.filter(c => c.method === 'prompt.submit').length, 1);
  s.coordinator.dispose();
});

for (const change of ['switchProfile', 'switchConnection']) test(`${change} discards continuation without a write to another owner`, async () => {
  const s = await setup();
  await s.coordinator.start(task);
  const before = s.calls.length;
  s[change]();
  await s.emit('session-1', 'complete');
  assert.equal(s.calls.length, before);
  assert.equal(s.listeners.size, 0);
  s.coordinator.dispose();
});

test('failed terminal persistence cannot continue the team', async () => {
  const s = await setup({terminalFailure: true});
  await s.coordinator.start(task);
  await s.emit('session-1', 'complete');
  assert.equal(s.errors.length, 1);
  assert.equal(s.calls.filter(c => c.method === 'prompt.submit').length, 1);
  s.coordinator.dispose();
});

test('lost submit response creates an unknown state and no resend', async () => {
  const s = await setup({lostSubmit: true});
  await assert.rejects(s.coordinator.start(task), /lost_response/);
  await s.emit('session-1', 'complete');
  assert.equal(s.calls.filter(c => c.method === 'prompt.submit').length, 1);
  assert.equal(s.calls.find(c => c.path?.endsWith('/status')).body.status, 'unknown');
  s.coordinator.dispose();
});

test('double start does not approve or send twice', async () => {
  const s = await setup();
  const outcomes = await Promise.allSettled([s.coordinator.start(task), s.coordinator.start(task)]);
  assert.equal(outcomes.filter(o => o.status === 'rejected').length, 1);
  assert.equal(s.calls.filter(c => c.method === 'prompt.submit').length, 1);
  s.coordinator.dispose();
});

test('pause persists before requesting interruption and prevents continuation', async () => {
  const s = await setup();
  await s.coordinator.start(task);
  await s.coordinator.pause({...task, run: {id: 'run-1', runtime_id: 'session-1'}});
  const pause = s.calls.findIndex(c => c.path?.endsWith('/pause'));
  const interrupt = s.calls.findIndex(c => c.method === 'session.interrupt');
  assert.ok(pause >= 0 && interrupt > pause);
  await s.emit('session-1', 'complete');
  assert.equal(s.calls.filter(c => c.method === 'prompt.submit').length, 1);
  s.coordinator.dispose();
});
