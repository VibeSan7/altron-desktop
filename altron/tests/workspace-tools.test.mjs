import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require = createRequire(resolve(process.env.ALTRON_JS_HOME || process.cwd(), 'package.json'));
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');

const tools = () => import('../ui/workspace-tools.mjs');

test('connection catalog uses profile scope and keeps only safe metadata', async () => {
  const {loadConnections} = await tools();
  const calls = [];
  const result = await loadConnections(async (method, params) => {
    calls.push([method, params]);
    if (method === 'config.get') return {model: 'chosen', provider: 'p', providers: [{id: 'p', label: 'Configured', authenticated: true}, {id: 'q', label: 'Not configured', authenticated: false}]};
    return {providers: [{slug: 'p', models: ['chosen', 'other'], api_url: 'PRIVATE', key_env: 'PRIVATE'}, {slug: 'q', models: ['q-model']}]};
  }, 'isolated');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(([, params]) => params.profile === 'isolated'));
  assert.ok(calls.every(([method]) => !/submit|create|set/.test(method)));
  assert.deepEqual(result.current, {model: 'chosen', provider: 'p'});
  assert.equal(result.providers[0].models.length, 2);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
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
