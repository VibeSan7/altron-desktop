import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require = createRequire(resolve(process.env.ALTRON_JS_HOME || process.cwd(), 'package.json'));
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');

test('task controls expose cancelled plans, revision history, recovery and reversible archive', async () => {
  const {createTaskControls} = await import('../ui/task-controls.mjs');
  const Controls = createTaskControls(React, {Button: 'button', Textarea: 'textarea'}, {rest: () => assert.fail('render must not act')});
  const render = task => renderToStaticMarkup(React.createElement(Controls, {task: {id: 't', artifacts: [], ...task}, runs: [], path: '/tasks/t', perform: () => {}}));
  assert.match(render({status: 'approved'}), /Отменить задачу/);
  assert.match(render({status: 'review'}), /Вернуть на доработку/);
  assert.match(render({status: 'unknown'}), /Проверить и восстановить состояние/);
  assert.match(render({status: 'cancelled', archived: true}), /Вернуть из архива/);
  assert.match(render({status: 'draft', attempt: 2, attempts: [{attempt: 1, status: 'review', plan: 'old plan', summary: 'old report', artifacts: []}]}), /old report/);
});

test('task controls render actions in English through the real catalog', async () => {
  const [{createTaskControls}, {translate}] = await Promise.all([import('../ui/task-controls.mjs'), import('../ui/i18n.mjs')]);
  const localizer = {useI18n: () => ({t: (key, ...args) => translate('en', key, ...args)})};
  const Controls = createTaskControls(React, {Button: 'button', Textarea: 'textarea'}, {rest: () => assert.fail('render must not act')}, localizer);
  const render = task => renderToStaticMarkup(React.createElement(Controls, {task: {id: 't', artifacts: [], ...task}, runs: [], path: '/tasks/t', perform: () => {}}));
  assert.match(render({status: 'approved'}), /Cancel task/);
  assert.match(render({status: 'review'}), /Return for revision/);
  assert.match(render({status: 'unknown'}), /Check and recover state/);
  assert.match(render({status: 'cancelled', archived: true}), /Restore from archive/);
  assert.match(render({status: 'draft', attempt: 2, attempts: [{attempt: 1, status: 'review', plan: 'old plan', summary: 'old report', artifacts: []}]}), /Attempt 2/);
});
