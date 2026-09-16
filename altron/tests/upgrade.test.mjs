import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const oldArchive = process.env.ALTRON_OLD_ARCHIVE;

test('a released profile upgrades and rolls back through Desktop without losing new data', {skip: !oldArchive, timeout: 300000}, async () => {
  const desktop = process.env.ALTRON_JS_HOME;
  const python = process.env.ALTRON_PYTHON;
  assert.ok(desktop && python);
  const require = createRequire(path.resolve(desktop, 'package.json'));
  const {_electron} = require('playwright');
  const core = path.resolve(desktop, '../..');
  const manifest = JSON.parse(await fs.readFile('packaging/manifest.json', 'utf8'));
  const archive = path.resolve('dist', `altron-${manifest.version}.tar.gz`);
  const bootstrapArchive = path.resolve('dist', `altron-maintenance-${manifest.version}.tar.gz`);
  for (const file of [oldArchive, archive, bootstrapArchive]) await fs.access(file);
  await fs.mkdir('.hermes', {recursive: true});
  const root = await fs.mkdtemp(path.resolve('.hermes/upgrade-'));
  const home = path.join(root, 'localappdata/hermes');
  const profileHome = path.join(home, 'profiles/altron');
  await fs.mkdir(home, {recursive: true});
  await fs.writeFile(path.join(home, 'config.yaml'), '{}\n');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS'].includes(key.toUpperCase())));
  Object.assign(env, {
    HERMES_HOME: home, HOME: home, USERPROFILE: home, LOCALAPPDATA: path.join(root, 'localappdata'), APPDATA: path.join(root, 'appdata'), TEMP: root, TMP: root,
    PYTHONDONTWRITEBYTECODE: '1', HERMES_DESKTOP_USER_DATA_DIR: path.join(root, 'electron'),
    HERMES_DESKTOP_IGNORE_EXISTING: '1', HERMES_DESKTOP_HERMES_ROOT: core, HERMES_DESKTOP_PYTHON: python, HERMES_DESKTOP_APP_NAME: `AltronUpgrade-${path.basename(root)}`,
  });
  console.log(`Upgrade evidence: ${root}`);
  let app;
  let page;
  let profileImported = false;
  const launch = async () => {
    app = await _electron.launch({executablePath: require('electron'), args: [desktop, '--local'], cwd: root, env, timeout: 45000});
    page = await app.firstWindow({timeout: 45000});
    if (profileImported) {
      const setupLater = page.getByRole('button', {name: /Выберу провайдера позже|Choose.*later|Set up later/i});
      await page.addLocatorHandler(setupLater, () => setupLater.click());
      await page.waitForFunction(() => window.__HERMES_PLUGIN_SDK__?.host.state.gateway.get() === 'open', null, {timeout: 60000});
    }
  };
  const close = async () => {await app.close(); app = null;};
  const selectProfile = async name => {
    await page.getByRole('button', {name, exact: true}).click();
    await page.waitForFunction(expected => window.__HERMES_PLUGIN_SDK__?.host.state.profile.get() === expected, name);
    await page.waitForFunction(() => window.__HERMES_PLUGIN_SDK__?.host.state.gateway.get() === 'open');
  };
  const enable = async label => {
    await page.getByRole('button', {name: /^(Capabilities|Возможности)$/}).click();
    await page.getByText(/^(Plugins|Плагины)$/).first().click();
    const toggle = page.getByRole('switch', {name: label, exact: true});
    await toggle.waitFor();
    if (await toggle.getAttribute('aria-checked') !== 'true') await toggle.click();
  };
  const importProfile = async filename => {
    await app.evaluate(({dialog}, file) => {dialog.showOpenDialog = async () => ({canceled: false, filePaths: [file]});}, filename);
    await page.getByRole('button', {name: 'Импортировать профиль…', exact: true}).click();
  };
  const readProjects = async () => {
    const {stdout} = await promisify(execFile)(python, ['-c', 'import json,sqlite3,sys; c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); print(json.dumps(c.execute("SELECT id,document FROM altron_projects ORDER BY id").fetchall())); c.close()', path.join(profileHome, 'altron/altron.db')], {env, windowsHide: true, encoding: 'utf8'});
    return JSON.parse(stdout);
  };
  try {
    await launch();
    await page.getByRole('button', {name: /Выберу провайдера позже|Choose.*later|Set up later/i}).click({timeout: 60000});
    await importProfile(oldArchive);
    await page.getByRole('button', {name: 'altron', exact: true}).waitFor();
    profileImported = true;
    await close();
    await launch();
    await selectProfile('altron');
    await enable('Desktop: Altron');
    await page.getByRole('button', {name: 'Altron', exact: true}).click();
    const work = path.join(root, 'project');
    await fs.mkdir(work);
    await page.getByLabel('Название проекта', {exact: true}).fill('Existing project');
    await page.getByLabel('Папка проекта', {exact: true}).fill(work);
    await page.getByRole('button', {name: 'Создать проект', exact: true}).click();
    await page.getByRole('heading', {name: 'Existing project', exact: true}).waitFor();
    await page.getByLabel('Какой результат нужен', {exact: true}).fill('Task created before upgrade');
    await page.getByLabel('Как проверить готовность', {exact: true}).fill('Survives upgrade');
    await page.getByRole('button', {name: 'Создать задачу', exact: true}).click();
    await page.getByText('Task created before upgrade', {exact: true}).waitFor();
    const oldTeamEditor = await page.getByText('Состав команды', {exact: true}).count();
    if (oldTeamEditor) {
      await page.getByText('Состав команды', {exact: true}).click();
      await page.getByLabel('Модель — Техническая работа', {exact: true}).fill('qa-no-inference');
      await page.getByLabel('Провайдер — Техническая работа', {exact: true}).fill('qa-no-provider');
      await page.getByRole('button', {name: 'Сохранить состав команды', exact: true}).click();
      await page.getByLabel('План для согласования', {exact: true}).fill('A preserved plan that has never started');
      await page.getByText('Последовательность специалистов', {exact: true}).click();
      await page.getByRole('button', {name: 'Добавить шаг', exact: true}).click();
      await page.getByLabel('Результат шага 1', {exact: true}).fill('Do not execute; this is an upgrade fixture');
      await page.getByLabel('Критерии шага 1', {exact: true}).fill('Plan is preserved after cancellation');
      await page.getByRole('button', {name: 'Согласовать командный план', exact: true}).click();
      await page.getByRole('button', {name: 'Запустить согласованную команду', exact: true}).waitFor();
    }
    let before = await readProjects();
    const oldCode = await fs.readFile(path.join(profileHome, 'plugins/altron/dashboard/plugin_api.py'));
    const oldUi = await fs.readFile(path.join(home, 'desktop-plugins/altron/plugin.js'));
    await fs.writeFile(path.join(profileHome, '.env'), 'QA_SENTINEL=preserve-me\n');
    await fs.writeFile(path.join(profileHome, 'auth.json'), '{"qa_sentinel":"not-a-real-credential"}\n');
    const privateFiles = {};
    for (const name of ['config.yaml', 'SOUL.md', '.env', 'auth.json']) privateFiles[name] = await fs.readFile(path.join(profileHome, name));
    await importProfile(bootstrapArchive);
    await page.getByRole('button', {name: 'altron-maintenance', exact: true}).waitFor();
    await selectProfile('altron-maintenance');
    await close();
    await launch();
    await selectProfile('altron-maintenance');
    await enable('Desktop: Altron Maintenance');
    await page.getByRole('button', {name: 'Обновление Altron', exact: true}).click();
    await page.getByLabel('Профиль для обновления', {exact: true}).selectOption('altron');
    await page.getByLabel('Я полностью закрыл остальные окна Hermes', {exact: true}).check();
    if (oldTeamEditor && JSON.parse(before[0][1]).tasks[0].team.status === 'ready') {
      await page.getByRole('button', {name: 'Отменить этот незапущенный план', exact: true}).click();
      await page.getByLabel('Причина отмены старого плана', {exact: true}).fill('Explicit cancellation before upgrade');
      await page.getByRole('button', {name: 'Подтверждаю отмену старого плана', exact: true}).click();
      await page.getByText('Незапущенных командных планов нет.', {exact: true}).waitFor();
      const afterCancellation = await readProjects();
      const task = JSON.parse(afterCancellation[0][1]).tasks[0];
      assert.equal(task.status, 'cancelled');
      assert.equal(task.team.status, 'cancelled');
      assert.deepEqual(task.team.steps, JSON.parse(before[0][1]).tasks[0].team.steps);
      assert.equal(task.plan, JSON.parse(before[0][1]).tasks[0].plan);
      assert.deepEqual(JSON.parse(afterCancellation[0][1]).runs, []);
      before = afterCancellation;
    }
    await page.getByText('Обслуживание Altron', {exact: true}).click();
    await page.getByLabel('Полный путь к архиву Altron', {exact: true}).fill(archive);
    const archiveHash = createHash('sha256').update(await fs.readFile(archive)).digest('hex');
    await page.getByLabel('Контрольная сумма SHA-256', {exact: true}).fill(archiveHash);
    await page.getByRole('button', {name: 'Проверить пакет', exact: true}).click();
    await page.getByText(`Проверен пакет ${manifest.version}`, {exact: true}).waitFor();
    await page.getByRole('button', {name: 'Установить проверенный пакет', exact: true}).click();
    await page.getByRole('button', {name: 'Подтверждаю обслуживание', exact: true}).click();
    await page.getByText('Обновление установлено', {exact: true}).waitFor();
    assert.deepEqual(await readProjects(), before);
    assert.deepEqual(await fs.readFile(path.join(profileHome, 'plugins/altron/dashboard/plugin_api.py')), await fs.readFile('altron/dashboard/plugin_api.py'));
    const journalPath = path.join(profileHome, 'altron/maintenance/journal.json');
    const applied = JSON.parse(await fs.readFile(journalPath, 'utf8'));
    assert.equal(applied.operation.state, 'applied');
    await fs.access(path.join(profileHome, 'altron/maintenance/backups', applied.backup_id, 'altron.db'));
    await close();
    await launch();
    await selectProfile('altron');
    await page.getByRole('button', {name: 'Altron', exact: true}).click();
    await page.getByText('Task created before upgrade', {exact: true}).waitFor();
    await page.getByText('Состав команды', {exact: true}).waitFor();
    await page.getByLabel('Новое решение', {exact: true}).fill('Decision created after upgrading');
    await page.getByRole('button', {name: 'Сохранить решение', exact: true}).click();
    await page.locator('p').filter({hasText: /^Decision created after upgrading$/}).waitFor();
    const after = await readProjects();
    assert.notDeepEqual(after, before);
    await selectProfile('altron-maintenance');
    await close();
    await launch();
    await selectProfile('altron-maintenance');
    await page.getByRole('button', {name: 'Обновление Altron', exact: true}).click();
    await page.getByLabel('Профиль для обновления', {exact: true}).selectOption('altron');
    await page.getByLabel('Я полностью закрыл остальные окна Hermes', {exact: true}).check();
    await page.getByText('Обслуживание Altron', {exact: true}).click();
    await page.getByRole('button', {name: 'Вернуть предыдущий код', exact: true}).click();
    await page.getByRole('button', {name: 'Подтверждаю обслуживание', exact: true}).click();
    await page.getByText('Предыдущий код восстановлен', {exact: true}).waitFor();
    await close();
    await launch();
    await selectProfile('altron');
    await page.getByRole('button', {name: 'Altron', exact: true}).click();
    await page.getByText('Task created before upgrade', {exact: true}).waitFor();
    await page.locator('p').filter({hasText: /^Decision created after upgrading$/}).waitFor();
    assert.equal(await page.getByText('Состав команды', {exact: true}).count(), oldTeamEditor);
    assert.deepEqual(await fs.readFile(path.join(profileHome, 'plugins/altron/dashboard/plugin_api.py')), oldCode);
    assert.deepEqual(await fs.readFile(path.join(home, 'desktop-plugins/altron/plugin.js')), oldUi);
    assert.deepEqual(await readProjects(), after);
    for (const [name, bytes] of Object.entries(privateFiles)) assert.deepEqual(await fs.readFile(path.join(profileHome, name)), bytes, name);
    assert.equal(JSON.parse(await fs.readFile(journalPath, 'utf8')).operation.state, 'rolled_back');
    await fs.writeFile(path.join(root, 'result.json'), JSON.stringify({passed: true, realDesktop: true, oldArchiveSha256: createHash('sha256').update(await fs.readFile(oldArchive)).digest('hex'), archiveSha256: archiveHash, bootstrapArchiveSha256: createHash('sha256').update(await fs.readFile(bootstrapArchive)).digest('hex'), oldProfileImportedThroughUI: true, legacyUnstartedPlanCancelledThroughUI: Boolean(oldTeamEditor), maintenanceProfileImportedThroughUI: true, oldTasksPreserved: true, newDataPreservedAfterRollback: true, oldCodeRestoredByteForByte: true, privateFilesPreserved: Object.keys(privateFiles), externalInferenceAuthorized: false, credentialFilesCopied: false}, null, 2));
  } finally {
    if (page && !page.isClosed()) await fs.writeFile(path.join(root, 'ui-status.json'), JSON.stringify({text: (await page.locator('body').innerText()).slice(0, 18000), alerts: await page.getByRole('alert').allTextContents(), context: await page.evaluate(() => ({profile: window.__HERMES_PLUGIN_SDK__?.host.state.profile.get(), gateway: window.__HERMES_PLUGIN_SDK__?.host.state.gateway.get(), pluginDecisions: JSON.parse(localStorage.getItem('hermes.desktop.pluginDecisions.v2') || '{}')}))}, null, 2));
    if (app) await close();
  }
});
