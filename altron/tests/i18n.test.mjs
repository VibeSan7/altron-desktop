import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const require = createRequire(resolve(process.env.ALTRON_JS_HOME || process.cwd(), 'package.json'));
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const i18n = await import('../ui/i18n.mjs').catch(() => ({}));

test('manual locale translation renders English and keeps Russian available', () => {
  assert.equal(i18n.translate?.('en', 'language.label'), 'Language');
  assert.equal(i18n.translate?.('ru', 'language.label'), 'Язык');
  assert.equal(i18n.translate?.('en', 'common.attempt', 3), 'Attempt 3');
  assert.equal(i18n.translate?.('ru', 'common.attempt', 3), 'Попытка 3');
});

test('language preference follows Hermes unless a supported override is stored', () => {
  assert.equal(i18n.readLanguage?.({get: () => undefined}), 'hermes');
  assert.equal(i18n.readLanguage?.({get: () => 'english'}), 'hermes');
  assert.equal(i18n.readLanguage?.({get: () => 'en'}), 'en');
  assert.equal(i18n.readLanguage?.({get: () => 'ru'}), 'ru');
});

test('language preference persists only supported modes', () => {
  const writes = [];
  const storage = {set: (...args) => writes.push(args)};
  assert.equal(i18n.writeLanguage?.(storage, 'en'), 'en');
  assert.equal(i18n.writeLanguage?.(storage, 'invalid'), 'hermes');
  assert.deepEqual(writes, [['language', 'en'], ['language', 'hermes']]);
});

test('locale provider follows Hermes or a stored Altron override', () => {
  const render = language => {
    const ctx = {
      i18n: {register: () => () => {}},
      storage: {get: () => language, set: () => {}},
    };
    const sdk = {usePluginI18n: () => key => key === 'language.label' ? 'Hermes language' : key};
    const localizer = i18n.createI18n?.(React, sdk, ctx, 'altron');
    if (!localizer) return '';
    function Probe() {
      const {t} = localizer.useI18n();
      return React.createElement('p', null, t('language.label'));
    }
    return renderToStaticMarkup(React.createElement(localizer.Provider, null,
      React.createElement(localizer.LanguageSelector), React.createElement(Probe)));
  };

  assert.match(render('hermes'), /Hermes language/);
  assert.match(render('en'), />Language</);
  assert.match(render('ru'), />Язык</);
  assert.match(render('en'), /<option value="hermes">Hermes<\/option>/);
  assert.match(render('en'), /<option value="ru">Русский<\/option>/);
  assert.match(render('en'), /<option value="en" selected="">English<\/option>/);
});

test('English and Russian catalogs expose the same translation keys', () => {
  const leaves = (tree, prefix = '') => Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' ? leaves(value, path) : [path];
  }).sort();
  assert.deepEqual(leaves(i18n.messages.en), leaves(i18n.messages.ru));
});
