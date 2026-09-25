import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const require = createRequire(resolve(process.env.ALTRON_JS_HOME || process.cwd(), 'package.json'));
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');

const sampleConnection = {model: 'model/alpha:latest', provider: 'provider:one', profile: 'profile/one'};
const preparedMission = (overrides = {}) => ({
  id: 'mission/id:one', revision: 2, phase: 'interview', status: 'prepared',
  connection: sampleConnection, transcript: [], proposal: null, approval: null,
  project_id: null, turns: [{id: 'turn/id:one', phase: 'interview', status: 'prepared', directory: 'C:/interviews/one', runtime_id: null, stored_id: null}],
  checkpoint: '', artifacts: [], verification: [], instructions: '', blocker: null, ...overrides,
});

function actionHarness({mission = preparedMission(), switchBeforeBind = false, gateCreate = null} = {}) {
  const calls = [];
  let connectionId = 'connection/one';
  let profile = 'profile/one';
  let createGate;
  const api = async (path, options = {}) => {
    calls.push(['api', path, options.body]);
    if (path === '/missions') return mission;
    if (path.endsWith('/bind')) return {...mission, status: 'bound'};
    return mission;
  };
  const rpc = async (method, params) => {
    calls.push(['rpc', method, params]);
    if (method === 'session.create') {
      if (gateCreate) {
        createGate ||= new Promise(resolveGate => { gateCreate.resolve = resolveGate; });
        await createGate;
      }
      if (switchBeforeBind) connectionId = 'connection/two';
      return {session_id: 'runtime/id:one', stored_session_id: 'stored/id:one', info: {...sampleConnection, profile_name: sampleConnection.profile}};
    }
    throw new Error(`unexpected rpc ${method}`);
  };
  const actionsPromise = import('../ui/mission-view.mjs');
  return actionsPromise.then(module => ({
    actions: module.createMissionActions({
      api, rpc, getConnectionId: () => connectionId, getProfile: () => profile,
      isCurrent: () => connectionId === 'connection/one' && profile === 'profile/one',
    }), calls, setConnection(value) { connectionId = value; },
    setProfile(value) { profile = value; }, createGate,
  }));
}

test('mission actions create and bind using encoded mission and turn identifiers', async () => {
  const {actions, calls} = await actionHarness();
  await actions.create({message: 'Need a report', model: sampleConnection.model, provider: sampleConnection.provider});
  const create = calls.find(call => call[1] === 'session.create');
  assert.deepEqual(create[2], {
    source: 'desktop', profile: sampleConnection.profile, model: sampleConnection.model,
    provider: sampleConnection.provider, cwd: 'C:/interviews/one', close_on_disconnect: false,
    title: 'Altron — интервью',
  });
  assert.equal(calls.some(call => call[1] === 'prompt.submit'), false);
  assert.ok(calls.some(call => call[1] === '/missions/mission%2Fid%3Aone/bind'));
  assert.deepEqual(calls.find(call => call[1].endsWith('/bind'))[2], {
    turn_id: 'turn/id:one', runtime_id: 'runtime/id:one', stored_id: 'stored/id:one',
  });
});

test('prepared answer starts a work/interview session only after the API response', async () => {
  const mission = preparedMission({phase: 'work', connection: {...sampleConnection}, turns: [{id: 'turn', phase: 'work', status: 'prepared', directory: 'C:/work', runtime_id: null, stored_id: null}]});
  const {actions, calls} = await actionHarness({mission});
  await actions.answer(mission.id, {revision: mission.revision, message: 'More context'});
  const create = calls.find(call => call[1] === 'session.create');
  assert.equal(create[2].title, 'Altron — работа');
  assert.equal(create[2].cwd, 'C:/work');
  assert.equal(calls.filter(call => call[1] === 'session.create').length, 1);
});

test('queued, running, and already-bound responses do not create another session', async () => {
  for (const status of ['queued', 'running', 'bound']) {
    const mission = preparedMission({status, turns: [{id: 'turn', phase: 'work', status, directory: 'C:/work', runtime_id: status === 'bound' ? 'runtime' : null, stored_id: status === 'bound' ? 'stored' : null}]});
    const {actions, calls} = await actionHarness({mission});
    await actions.recover(mission.id).catch(() => {});
    assert.equal(calls.filter(call => call[1] === 'session.create').length, 0, status);
  }
});

test('source changes during binding stop the bind and never address the new owner', async () => {
  const {actions, calls} = await actionHarness({switchBeforeBind: true});
  await assert.rejects(actions.create({message: 'Need a report', model: sampleConnection.model, provider: sampleConnection.provider}), /scope_changed/);
  assert.equal(calls.filter(call => call[1].endsWith('/bind')).length, 0);
});

test('synchronous duplicate clicks have one winner before the first await', async () => {
  const gate = {};
  const {actions, calls} = await actionHarness({gateCreate: gate});
  const first = actions.create({message: 'Need a report', model: sampleConnection.model, provider: sampleConnection.provider});
  await new Promise(resolve => setImmediate(resolve));
  const second = actions.create({message: 'Need a report', model: sampleConnection.model, provider: sampleConnection.provider});
  await assert.rejects(second, /mission_already_starting/);
  gate.resolve();
  await first;
  assert.equal(calls.filter(call => call[1] === 'session.create').length, 1);
});

test('all mission actions send the exact confirmation bodies and preserve limits', async () => {
  const mission = preparedMission({status: 'awaiting_approval', phase: 'interview'});
  const {actions, calls} = await actionHarness({mission});
  await actions.approve(mission.id, {revision: 2, directory: 'C:/chosen', max_turns: 12, max_hours: 168});
  await actions.cancel(mission.id);
  await actions.revise(mission.id, {feedback: 'Clarify the check', max_turns: 3, max_hours: 24});
  const approve = calls.find(call => call[1].endsWith('/approve'));
  assert.deepEqual(approve[2], {revision: 2, directory: 'C:/chosen', max_turns: 12, max_hours: 168, confirm: true});
  assert.deepEqual(calls.find(call => call[1].endsWith('/cancel'))[2], {confirm: true});
  assert.deepEqual(calls.find(call => call[1].endsWith('/revise'))[2], {feedback: 'Clarify the check', max_turns: 3, max_hours: 24, confirm: true});
});

test('mission view has no render-side actions and exposes honest interview/proposal/work/result states', async () => {
  const {createMissionView} = await import('../ui/mission-view.mjs');
  const sdk = {Button: 'button', Input: 'input', Textarea: 'textarea', useQuery: () => ({data: [], isLoading: false}), useQueryClient: () => ({invalidateQueries() {}}), host: {request: () => assert.fail('render must not call RPC')}};
  const ctx = {rest: () => assert.fail('render must not call REST'), storage: {get: () => '', set() {}, remove() {}}, os: {revealPath: () => {}}};
  const View = createMissionView(React, sdk, ctx);
  const intro = renderToStaticMarkup(React.createElement(View, {profile: 'profile/one', connectionId: 'connection/one', gateway: 'open', queryKey: ['root'], workspaceId: 'workspace/one', model: sampleConnection.model, provider: sampleConnection.provider}));
  assert.match(intro, /интервью/iu);
  assert.match(intro, /не нужно.*техническое задание/isu);
  assert.match(intro, /Пример/iu);
  assert.doesNotMatch(intro, /prompt\.submit/);

  const render = mission => renderToStaticMarkup(React.createElement(View, {profile: 'profile/one', connectionId: 'connection/one', gateway: 'open', queryKey: ['root'], workspaceId: 'workspace/one', model: sampleConnection.model, provider: sampleConnection.provider, mission}));
  assert.match(render(preparedMission({status: 'awaiting_approval', proposal: {name: 'Proposal', goal: 'Goal', requirements: ['Requirement'], out_of_scope: ['Publication'], plan: 'Plan', deliverables: [{path: 'report.md', purpose: 'Report'}], checks: [{id: 'file', label: 'Report content', kind: 'file', path: 'report.md', contains: ['Goal']}]}})), /Подтвердить и начать/);
  assert.match(render(preparedMission({phase: 'work', status: 'running', checkpoint: 'Inspecting files'})), /Контрольная точка/);
  assert.match(render(preparedMission({phase: 'work', status: 'ready', artifacts: [{path: 'report.md', bytes: 42, sha256: 'hash'}], verification: [{id: 'file', label: 'Report', kind: 'file', passed: true, source: 'file_content'}], instructions: 'Open report.md'})), /Готово по проверкам/);
  assert.match(render(preparedMission({phase: 'work', status: 'blocked', blocker: 'needs_input'})), /Блокировка/);
  assert.match(render(preparedMission({phase: 'work', status: 'running', blocker: 'permission_pending'})), /Hermes ожидает разрешения/);
  assert.match(render(preparedMission({phase: 'work', status: 'blocked', blocker: 'permission_required'})), /Автоматические повторы остановлены/);
});

test('saved missions remain reachable from the unselected home screen', async () => {
  const {createMissionView} = await import('../ui/mission-view.mjs');
  const mission = preparedMission({transcript: [{role: 'user', text: 'Saved interview'}]});
  const sdk = {Button: 'button', Input: 'input', Textarea: 'textarea',
    useQuery: ({queryKey}) => ({data: queryKey.includes('list') ? [mission] : null}),
    host: {request: () => assert.fail('No action during render')}};
  const View = createMissionView(React, sdk, {rest() {}, storage: {get: () => ''}});
  const html = renderToStaticMarkup(React.createElement(View, {profile: 'p', connectionId: 'c', gateway: 'open', workspaceId: 'w'}));
  assert.match(html, /Saved interview/);
});

test('mission interview and result states render in English', async () => {
  const [{createMissionView}, {translate}] = await Promise.all([import('../ui/mission-view.mjs'), import('../ui/i18n.mjs')]);
  const localizer = {useI18n: () => ({t: (key, ...args) => translate('en', key, ...args)})};
  const sdk = {Button: 'button', Input: 'input', Textarea: 'textarea', useQuery: () => ({data: [], isLoading: false}), useQueryClient: () => ({invalidateQueries() {}}), host: {request: () => assert.fail('render must not call RPC')}};
  const ctx = {rest: () => assert.fail('render must not call REST'), storage: {get: () => '', set() {}, remove() {}}, os: {revealPath: () => {}}};
  const View = createMissionView(React, sdk, ctx, localizer);
  const props = {profile: 'profile/one', connectionId: 'connection/one', gateway: 'open', queryKey: ['root'], workspaceId: 'workspace/one', model: sampleConnection.model, provider: sampleConnection.provider};
  const intro = renderToStaticMarkup(React.createElement(View, props));
  assert.match(intro, /Start with your idea/);
  assert.match(intro, /What do you want to create/);
  assert.match(intro, /Start interview/);
  const result = renderToStaticMarkup(React.createElement(View, {...props, mission: preparedMission({phase: 'work', status: 'ready', approval: {directory: 'C:/result'}, artifacts: [{path: 'report.md', bytes: 42, sha256: 'hash'}], verification: [{id: 'file', label: 'Report', kind: 'file', passed: true, source: 'file_content'}], instructions: 'Open report.md'})}));
  assert.match(result, /Ready based on confirmed checks/);
  assert.match(result, /Show folder in File Explorer/);
  assert.doesNotMatch(`${intro}${result}`, /Начнём с вашей идеи|Подтвердить и начать|Готово по подтверждённым проверкам/);
});

test('reconnect reserves a prepared turn before creating its session', async () => {
  const {actions, calls} = await actionHarness();
  assert.equal(typeof actions.resume, 'function');
  await actions.resume('mission/id:one');
  assert.ok(calls[0][1].endsWith('/resume'));
  assert.equal(calls.filter(call => call[1] === 'session.create').length, 1);
  assert.equal(calls.some(call => call[1] === 'prompt.submit'), false);
});
