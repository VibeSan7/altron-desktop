import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require = createRequire(resolve(process.env.ALTRON_JS_HOME || process.cwd(), 'package.json'));
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');

const tools = () => import('../ui/workspace-tools.mjs');

test('connection catalog preserves configured endpoints and exact model IDs without private metadata', async () => {
  const {loadConnections} = await tools();
  const calls = [];
  const result = await loadConnections(async (method, params) => {
    calls.push([method, params]);
    if (method === 'config.get') return {model: 'org/chosen:beta', provider: 'org', providers: [{id: 'custom', label: 'Custom', authenticated: false}]};
    assert.equal(method, 'model.options');
    return {model: 'org/chosen:beta', provider: 'custom:local', providers: [
      {slug: 'custom:local', name: 'Local', authenticated: true, is_user_defined: true, models: ['org/chosen:beta', 'other', 'other'], api_url: 'PRIVATE', key_env: 'PRIVATE'},
      {slug: 'unconfigured', name: 'Not configured', authenticated: false, models: []},
    ]};
  }, 'isolated');
  assert.deepEqual(result.current, {model: 'org/chosen:beta', provider: 'custom:local'});
  assert.deepEqual(result.providers, [
    {id: 'custom:local', label: 'Local', authenticated: true, models: ['org/chosen:beta', 'other']},
    {id: 'unconfigured', label: 'Not configured', authenticated: false, models: []},
  ]);
  assert.deepEqual(calls, [['model.options', {profile: 'isolated', explicit_only: true, include_unconfigured: true}]]);
});

test('current connection aliases and uncatalogued models are preserved without a fallback selection', async () => {
  const {loadConnections} = await tools();
  const row = {slug: 'custom:local', name: 'Local', aliases: ['local'], authenticated: true, models: ['other']};
  const load = current => loadConnections(async () => ({...current, providers: [row]}), 'isolated');
  const named = await load({model: 'org/exact-model:v2', provider: 'local'});
  assert.deepEqual(named.current, {model: 'org/exact-model:v2', provider: 'local'});
  assert.deepEqual(named.providers, [{id: 'local', label: 'Local', authenticated: true, models: ['org/exact-model:v2', 'other']}]);
  const missing = await load({model: '', provider: ''});
  assert.deepEqual(missing.current, {model: '', provider: ''});
  assert.deepEqual(missing.providers[0].models, ['other']);
  assert.equal(missing.providers[0].id, 'custom:local');
  assert.deepEqual(row.models, ['other']);
});

test('overview separates archived tasks and never turns unknown cost into zero', async () => {
  const {projectSummary, usageText, elapsedText, demoTask} = await tools();
  const project = {tasks: [{status: 'review'}, {status: 'done', archived: true}, {status: 'unknown'}]};
  assert.deepEqual(projectSummary(project), {active: 2, archived: 1, review: 1, blocked: 1, done: 0});
  assert.match(usageText({}), /неизвестна/);
  assert.match(usageText({cost_usd: 0, cost_status: 'unknown'}), /неизвестна/);
  assert.match(usageText({cost_usd: 0.12, cost_status: 'estimated', input: 12}), /оценка/);
  assert.equal(elapsedText({created_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T00:02:03Z'}), '2 мин 3 с');
  assert.ok(demoTask.goal && demoTask.acceptance);
  assert.match(demoTask.goal, /index.html/);
});

test('setup has a folder chooser, configured provider picker and honest readiness text', async () => {
  const {createWorkspaceTools} = await tools();
  const sdk = {Button: 'button', Input: 'input', host: {request: () => assert.fail('render must not start RPC')}, useQuery: () => ({data: {current: {model: 'm', provider: 'p'}, providers: [{id: 'p', label: 'Configured', authenticated: true, models: ['m']}]}})};
  const {Connections, FolderPicker, Diagnostics} = createWorkspaceTools(React, sdk, {rest: () => assert.fail('render must not read files')});
  const html = renderToStaticMarkup(React.createElement(Connections, {profile: 'isolated', queryKey: ['scope'], model: '', provider: '', setModel: () => {}, setProvider: () => {}, gateway: 'open'}));
  assert.match(html, /Настроенное подключение/);
  assert.match(html, /Запрос к модели не отправлялся/);
  assert.match(html, /Расширенный ручной ввод/);
  assert.match(renderToStaticMarkup(React.createElement(FolderPicker, {directory: '', onChoose: () => {}})), /Выбрать папку/);
  assert.match(renderToStaticMarkup(React.createElement(Diagnostics)), /без путей и содержимого задач/);
});
