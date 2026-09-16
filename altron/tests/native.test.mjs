import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const desktop = process.env.ALTRON_JS_HOME;
const require = createRequire(path.resolve(desktop, 'package.json'));
const {_electron} = require('playwright');
const core = path.resolve(desktop, '../..');
const manifest = JSON.parse(await fs.readFile('packaging/manifest.json', 'utf8'));
const archive = path.resolve('dist', `altron-${manifest.version}.tar.gz`);

test('Altron runs in the real Desktop with an empty, isolated profile', {timeout: 180000}, async () => {
  await fs.mkdir(path.resolve('.hermes'), {recursive: true});
  const root = await fs.mkdtemp(path.resolve('.hermes/an-'));
  const home = path.join(root, 'localappdata', 'hermes');
  const userData = path.join(root, 'electron');
  await fs.mkdir(home, {recursive: true});
  await fs.access(archive);
  await fs.writeFile(path.join(home, 'config.yaml'), '{}\n', 'utf8');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS'].includes(key.toUpperCase())));
  Object.assign(env, {
    HERMES_HOME: home, HOME: home, USERPROFILE: home,
    LOCALAPPDATA: path.join(root, 'localappdata'), APPDATA: path.join(root, 'appdata'),
    TEMP: root, TMP: root, PYTHONDONTWRITEBYTECODE: '1',
    HERMES_DESKTOP_USER_DATA_DIR: userData,
    HERMES_DESKTOP_IGNORE_EXISTING: '1', HERMES_DESKTOP_HERMES_ROOT: core,
    HERMES_DESKTOP_PYTHON: process.env.ALTRON_PYTHON,
    HERMES_DESKTOP_APP_NAME: `AltronValidation-${path.basename(root)}`,
  });
  await fs.writeFile(path.join(root, 'boundary.json'), JSON.stringify({home, userData, profileArchive: archive, credentialEnvironmentInherited: false, externalInferenceAuthorized: false, sandboxDisablingFlags: false}, null, 2));
  let app;
  let page;
  const uiErrors = [];
  try {
    app = await _electron.launch({executablePath: require('electron'), args: [desktop, '--local'], cwd: root, env, timeout: 45000});
    page = await app.firstWindow({timeout: 45000});
    page.on('pageerror', error => uiErrors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') uiErrors.push(message.text().slice(0, 1000));});
    await page.getByRole('button', {name: /Выберу провайдера позже|Choose.*later|Set up later/i}).click({timeout: 60000});
    await app.evaluate(({dialog}, filename) => {
      dialog.showOpenDialog = async () => ({canceled: false, filePaths: [filename]});
    }, archive);
    await page.getByRole('button', {name: 'Импортировать профиль…', exact: true}).click();
    await page.getByRole('button', {name: 'altron', exact: true}).waitFor({timeout: 45000});
    await fs.access(path.join(home, 'profiles/altron/plugins/altron/plugin.yaml'));
    await app.close();
    app = null;
    app = await _electron.launch({executablePath: require('electron'), args: [desktop, '--local'], cwd: root, env, timeout: 45000});
    page = await app.firstWindow({timeout: 45000});
    const setupLater = page.getByRole('button', {name: /Выберу провайдера позже|Choose.*later|Set up later/i});
    if (await setupLater.isVisible()) await setupLater.click();
    await page.getByRole('button', {name: /^(Capabilities|Возможности)$/}).click();
    const plugins = page.getByText(/^(Plugins|Плагины)$/);
    await plugins.first().click();
    await fs.writeFile(path.join(root, 'initial-dom.json'), JSON.stringify({text: (await page.locator('body').innerText()).slice(0, 10000), buttons: await page.getByRole('button').allTextContents()}, null, 2));
    console.log(`Native evidence: ${root}`);
    await page.getByText('Altron', {exact: true}).first().waitFor({timeout: 30000});
    assert.ok((await page.locator('body').innerText()).includes('Altron'));
    const desktopSwitch = page.getByRole('switch', {name: 'Desktop: Altron', exact: true});
    if (await desktopSwitch.getAttribute('aria-checked') !== 'true') await desktopSwitch.click();
    await page.getByRole('button', {name: 'altron', exact: true}).click();
    await page.waitForFunction(() => window.__HERMES_PLUGIN_SDK__?.host.state.profile.get() === 'altron');
    await page.getByRole('button', {name: 'Altron', exact: true}).click();
    await fs.writeFile(path.join(root, 'sdk-state.json'), JSON.stringify(await page.evaluate(() => {
      const sdk = window.__HERMES_PLUGIN_SDK__;
      return {routesArea: sdk.ROUTES_AREA, sidebarArea: sdk.SIDEBAR_NAV_AREA, gateway: sdk.host.state.gateway.get(), profile: sdk.host.state.profile.get(), sdkFunctions: Object.keys(sdk).filter(key => /registry|contrib|plugin/i.test(key))};
    }), null, 2));
    await page.getByRole('heading', {name: 'Altron', exact: true}).waitFor();
    const alpha = path.join(root, 'Alpha');
    const beta = path.join(root, 'Beta');
    await fs.mkdir(alpha); await fs.mkdir(beta);
    await page.getByLabel('Название проекта', {exact: true}).fill('Alpha');
    await page.getByLabel('Папка проекта', {exact: true}).fill(alpha);
    await page.getByRole('button', {name: 'Создать проект', exact: true}).click();
    await page.getByRole('heading', {name: 'Alpha', exact: true}).waitFor();
    await page.getByLabel('Какой результат нужен', {exact: true}).fill('Alpha task');
    await page.getByLabel('Как проверить готовность', {exact: true}).fill('Alpha criteria');
    await page.getByRole('button', {name: 'Создать задачу', exact: true}).click();
    await page.getByLabel('План для согласования', {exact: true}).fill('Alpha plan');
    await page.getByRole('button', {name: 'Согласовать план', exact: true}).click();
    await page.getByText('План согласован', {exact: true}).waitFor();
    await page.getByLabel('Новое решение', {exact: true}).fill('Alpha decision');
    await page.getByRole('button', {name: 'Сохранить решение', exact: true}).click();
    await page.locator('p').filter({hasText: /^Alpha decision$/}).waitFor();
    await page.getByText('Добавить проект', {exact: true}).click();
    await page.getByLabel('Название проекта', {exact: true}).fill('Beta');
    await page.getByLabel('Папка проекта', {exact: true}).fill(beta);
    await page.getByRole('button', {name: 'Создать проект', exact: true}).click();
    await page.getByRole('heading', {name: 'Beta', exact: true}).waitFor();
    assert.equal(await page.getByText('Alpha task', {exact: true}).count(), 0);
    assert.equal(await page.getByText('Alpha decision', {exact: true}).count(), 0);
    await page.getByLabel('Какой результат нужен', {exact: true}).fill('Beta task');
    await page.getByLabel('Как проверить готовность', {exact: true}).fill('Beta criteria');
    await page.getByRole('button', {name: 'Создать задачу', exact: true}).click();
    await page.getByText('Beta task', {exact: true}).waitFor();
    await page.getByText('Состав команды', {exact: true}).click();
    for (const label of ['Техническая работа', 'Решения и документация']) {
      await page.getByLabel(`Модель — ${label}`, {exact: true}).fill('altron-nonexistent-model');
      await page.getByLabel(`Провайдер — ${label}`, {exact: true}).fill('altron-invalid-provider');
    }
    await page.getByLabel('Инструкции — Решения и документация', {exact: true}).selectOption('technical-writer');
    await page.getByRole('button', {name: 'Сохранить состав команды', exact: true}).click();
    await page.getByLabel('План для согласования', {exact: true}).fill('Результат, затем документация');
    await page.getByText('Последовательность специалистов', {exact: true}).click();
    for (let index = 1; index <= 2; index++) {
      await page.getByRole('button', {name: 'Добавить шаг', exact: true}).click();
      await page.getByLabel(`Роль шага ${index}`, {exact: true}).selectOption(index === 1 ? 'technical' : 'memory');
      await page.getByLabel(`Результат шага ${index}`, {exact: true}).fill(`Файл шага ${index}`);
      await page.getByLabel(`Критерии шага ${index}`, {exact: true}).fill('Файл проверен');
    }
    await page.getByRole('button', {name: 'Согласовать командный план', exact: true}).click();
    await page.getByRole('button', {name: 'Запустить согласованную команду', exact: true}).waitFor();
    await page.getByLabel('Текущий проект', {exact: true}).selectOption({label: 'Alpha'});
    await page.getByText('Alpha task', {exact: true}).waitFor();
    assert.equal(await page.getByText('Beta task', {exact: true}).count(), 0);
    await page.screenshot({path: path.join(root, 'altron-native.png')});
    await app.close();
    app = null;
    app = await _electron.launch({executablePath: require('electron'), args: [desktop, '--local'], cwd: root, env, timeout: 45000});
    page = await app.firstWindow({timeout: 45000});
    await page.getByRole('button', {name: 'Altron', exact: true}).waitFor({timeout: 60000});
    const later = page.getByRole('button', {name: /Выберу провайдера позже|Choose.*later|Set up later/i});
    if (await later.isVisible()) await later.click();
    await page.getByRole('button', {name: 'altron', exact: true}).click();
    await page.waitForFunction(() => window.__HERMES_PLUGIN_SDK__?.host.state.profile.get() === 'altron');
    await page.getByRole('button', {name: 'Altron', exact: true}).click();
    await page.getByRole('heading', {name: 'Alpha', exact: true}).waitFor();
    await page.locator('p').filter({hasText: /^Alpha decision$/}).waitFor();
    await page.getByText('План согласован', {exact: true}).waitFor();
    assert.equal(await page.getByText('Beta task', {exact: true}).count(), 0);
    await page.getByText('Подключение ИИ для следующего запуска', {exact: true}).click();
    await page.getByLabel('Модель', {exact: true}).fill('altron-nonexistent-model');
    await page.getByLabel('Провайдер', {exact: true}).fill('altron-invalid-provider');
    await page.getByRole('button', {name: 'Запустить исполнителя', exact: true}).click();
    await page.getByRole('button', {name: 'Подтверждаю запуск', exact: true}).click();
    await page.getByText('Остановлено с ошибкой', {exact: true}).waitFor();
    assert.equal(await page.getByText('Принято пользователем', {exact: true}).count(), 0);
    await page.getByLabel('Текущий проект', {exact: true}).selectOption({label: 'Beta'});
    await page.getByText('Beta task', {exact: true}).waitFor();
    assert.equal(await page.getByText('Alpha task', {exact: true}).count(), 0);
    await page.getByRole('button', {name: 'Запустить согласованную команду', exact: true}).click();
    await page.getByRole('dialog', {name: 'Подтверждение запуска команды', exact: true}).waitFor();
    await page.getByRole('button', {name: 'Подтверждаю запуск команды', exact: true}).click();
    await page.getByText('Согласованная команда: Остановлено с ошибкой', {exact: true}).waitFor();
    assert.equal(await page.getByText('Ещё не начат', {exact: true}).count(), 1);
    assert.equal(await page.getByRole('button', {name: 'Я проверил результат — принять', exact: true}).count(), 0);
    const profileHome = path.join(home, 'profiles/altron');
    const restartText = 'Полностью закройте Hermes Desktop и откройте снова. Новые задания заблокированы до перезапуска.';
    const reopenMaintenance = async () => {
      try {await page.getByRole('heading', {name: 'Altron', exact: true}).waitFor({state: 'hidden', timeout: 3000});}
      catch (error) {if (error.name !== 'TimeoutError') throw error;}
      await page.getByRole('button', {name: 'Altron', exact: true}).click();
      const summary = page.getByText('Обслуживание Altron', {exact: true});
      if (await summary.locator('..').getAttribute('open') === null) await summary.click();
      await page.getByText(restartText, {exact: true}).waitFor();
    };
    const configBefore = await fs.readFile(path.join(profileHome, 'config.yaml'));
    const readProjects = async () => {
      const {stdout} = await promisify(execFile)(env.HERMES_DESKTOP_PYTHON, ['-c', 'import json,sqlite3,sys; c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); print(json.dumps(c.execute("SELECT id, document FROM altron_projects ORDER BY id").fetchall())); c.close()', path.join(profileHome, 'altron/altron.db')], {env, windowsHide: true, encoding: 'utf8'});
      return JSON.parse(stdout);
    };
    const projectsBefore = await readProjects();
    await page.getByText('Обслуживание Altron', {exact: true}).click();
    await page.getByLabel('Полный путь к архиву Altron', {exact: true}).fill(archive);
    await page.getByLabel('Контрольная сумма SHA-256', {exact: true}).fill(createHash('sha256').update(await fs.readFile(archive)).digest('hex'));
    await page.getByRole('button', {name: 'Проверить пакет', exact: true}).click();
    await page.getByText(`Проверен пакет ${manifest.version}`, {exact: true}).waitFor();
    await page.getByRole('button', {name: 'Установить проверенный пакет', exact: true}).click();
    await page.getByRole('button', {name: 'Подтверждаю обслуживание', exact: true}).click();
    const journalPath = path.join(profileHome, 'altron/maintenance/journal.json');
    await reopenMaintenance();
    const applied = JSON.parse(await fs.readFile(journalPath, 'utf8'));
    assert.equal(applied.operation.state, 'applied');
    assert.deepEqual(await readProjects(), projectsBefore);
    await fs.access(path.join(profileHome, 'altron/maintenance/backups', applied.backup_id, 'altron.db'));
    await app.close(); app = null;
    app = await _electron.launch({executablePath: require('electron'), args: [desktop, '--local'], cwd: root, env, timeout: 45000});
    page = await app.firstWindow({timeout: 45000});
    await page.waitForFunction(() => window.__HERMES_PLUGIN_SDK__?.host.state.profile.get() === 'altron');
    await page.getByRole('button', {name: 'Altron', exact: true}).click();
    await page.getByText('Обслуживание Altron', {exact: true}).click();
    await page.getByText('Обновление установлено', {exact: true}).waitFor();
    assert.equal(await page.getByText('Полностью закройте Hermes Desktop и откройте снова. Новые задания заблокированы до перезапуска.', {exact: true}).count(), 0);
    await page.getByRole('button', {name: 'Вернуть предыдущий код', exact: true}).click();
    await page.getByRole('button', {name: 'Подтверждаю обслуживание', exact: true}).click();
    await reopenMaintenance();
    assert.equal(JSON.parse(await fs.readFile(journalPath, 'utf8')).operation.state, 'rolled_back');
    await app.close(); app = null;
    app = await _electron.launch({executablePath: require('electron'), args: [desktop, '--local'], cwd: root, env, timeout: 45000});
    page = await app.firstWindow({timeout: 45000});
    await page.waitForFunction(() => window.__HERMES_PLUGIN_SDK__?.host.state.profile.get() === 'altron');
    await page.getByRole('button', {name: 'Altron', exact: true}).click();
    await page.getByText('Beta task', {exact: true}).waitFor();
    assert.deepEqual(await readProjects(), projectsBefore);
    assert.deepEqual(await fs.readFile(path.join(profileHome, 'config.yaml')), configBefore);
    await fs.writeFile(path.join(root, 'ui-checks.json'), JSON.stringify({profileArchiveImportedThroughUI: true, nativeDesktop: true, realBackend: true, syntheticProjects: 2, projectSeparation: true, approvedPlan: true, restoredAfterDesktopRestart: true, invalidProviderRejected: true, inferenceTested: false, maintenanceApplyRollbackThroughUI: true, maintenancePackage: 'same-version-reinstall', databaseAndSettingsPreserved: true, maintenanceRestartVerified: true}));
  } finally {
    try {
      if (page && !page.isClosed()) await fs.writeFile(path.join(root, 'final-dom.json'), JSON.stringify({url: page.url(), text: (await page.locator('body').innerText()).slice(0, 12000), buttons: await page.getByRole('button').allTextContents()}, null, 2));
      console.log(`Native evidence: ${root}`);
      await fs.writeFile(path.join(root, 'ui-errors.json'), JSON.stringify(uiErrors));
    } finally {
      if (app) await app.close();
    }
  }
});
