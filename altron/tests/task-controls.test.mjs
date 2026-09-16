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
