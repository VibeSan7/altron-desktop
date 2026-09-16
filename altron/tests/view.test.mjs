import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const require = createRequire(resolve(process.env.ALTRON_JS_HOME || process.cwd(), 'package.json'));
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');

test('team setup and steps show explicit assignments and separate acceptance', async () => {
  let createTeamViews;
  try { ({createTeamViews} = await import('../ui/team-view.mjs')); }
  catch { assert.fail('Team UI is not implemented'); }
  const sdk = {Button: 'button', Input: 'input', Textarea: 'textarea'};
  const {TeamSettings, TaskTeam} = createTeamViews(React, sdk, {rest: async () => {}}, {start: async () => {}, pause: async () => {}});
  const project = {id: 'project', team: {technical: {model: 'chosen-code', provider: 'chosen-provider', specialist: null}}};
  const common = {project, perform: async () => {}, busy: false, model: '', provider: '', catalog: {specialists: []}};
  const setup = renderToStaticMarkup(React.createElement(TeamSettings, common));
  assert.match(setup, /aria-label="Модель — Техническая работа"/);
  assert.match(setup, /Состав команды/);
  assert.match(setup, /chosen-code/);
  assert.match(setup, /Сохранить состав команды/);
  const task = {id: 'task', status: 'approved', team: {status: 'ready', steps: [{role: 'technical', goal: 'Файл', acceptance: 'Сверить', model: 'locked-model', provider: 'locked-provider', status: 'pending'}]}};
  const html = renderToStaticMarkup(React.createElement(TaskTeam, {...common, task, plan: 'План', steps: [], setSteps: () => {}}));
  assert.match(html, /locked-model/);
  assert.match(html, /Запустить согласованную команду/);
  assert.match(html, /отдельным подтверждением/);
  assert.doesNotMatch(html, /Я проверил результат — принять/);
});

test('bootstrap requires an explicit target and closed windows', async () => {
  let createBootstrapView;
  try { ({createBootstrapView} = await import('../bootstrap/view.mjs')); }
  catch { assert.fail('Bootstrap UI is not implemented'); }
  const sdk = {
    Button: 'button', Input: 'input', useQuery: () => ({data: {profiles: ['existing-altron']}}),
    useValue: atom => atom.get(),
    host: {state: {connectionId: {get: () => 'local'}, profile: {get: () => 'maintenance'}, gateway: {get: () => 'open'}}},
  };
  const View = createBootstrapView(React, sdk, {rest: async () => {}});
  const html = renderToStaticMarkup(React.createElement(View));
  assert.match(html, /Профиль для обновления/);
  assert.match(html, /Выберите профиль/);
  assert.match(html, /Я полностью закрыл остальные окна Hermes/);
  assert.doesNotMatch(html, /Проверить пакет|Установить проверенный пакет/);
});

test('first screen has real project inputs and no prefilled personal project', async () => {
  let createView;
  try { ({createView} = await import('../ui/view.mjs')); }
  catch { assert.fail('Altron Desktop view is not implemented'); }
  const sdk = {
    Button: 'button', Input: 'input', Textarea: 'textarea',
    useQuery: () => ({data: {projects: [], selected_project_id: null, workspace_id: 'isolated'}, isLoading: false}),
    useQueryClient: () => ({invalidateQueries: async () => {}}),
    useValue: atom => atom.get(),
    host: {state: {connectionId: {get: () => 'synthetic-source'}, profile: {get: () => 'synthetic'}, gateway: {get: () => 'open'}, model: {get: () => ''}}, onEvent: () => () => {}, request: async () => { throw new Error('No real model in this UI test'); }},
  };
  const View = createView(React, sdk, {rest: async () => {}, os: {}});
  const html = renderToStaticMarkup(React.createElement(View));
  assert.match(html, /Altron/);
  assert.match(html, /aria-label="Название проекта"/);
  assert.match(html, /Обслуживание Altron/);
  assert.match(html, /Контрольная сумма SHA-256/);
  assert.match(html, /Проверить пакет/);
  assert.match(html, /Название проекта/);
  assert.match(html, /Папка проекта/);
  assert.match(html, /Создать проект/);
  assert.match(html, /<input(?=[^>]*aria-label="Название проекта")(?=[^>]*value="")[^>]*>/);
  assert.match(html, /<input(?=[^>]*aria-label="Папка проекта")(?=[^>]*value="")[^>]*>/);
});
