import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {scriptedModel} from './fixtures/scripted-model.mjs';
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

test('real Hermes executes and repairs a mission while its UI is unmounted', {timeout: 420000}, async () => {
  await fs.mkdir(path.resolve('.hermes'), {recursive: true});
  const root = await fs.mkdtemp(path.resolve('.hermes/aa-'));
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
  const input = {marker: randomUUID(), values: [11, -3, 8]};
  const fixture = await scriptedModel({input, model: 'qa/exact-model:v1'});
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
    const catalogSelection = {model: 'qa/exact-model:v1', provider: 'custom:qa-local'};
    for (const [key, value] of [
      ['custom_providers', JSON.stringify([{name: 'QA Local', base_url: fixture.baseUrl, api_mode: 'chat_completions', models: [catalogSelection.model]}])],
      ['model.default', catalogSelection.model], ['model.provider', catalogSelection.provider],
      ['auxiliary.title_generation.enabled', 'false'],
      // Keep native security checks; the harness answers only the known read-only calculation.
      ['approvals.mode', 'manual'],
    ]) {
      await promisify(execFile)(env.HERMES_DESKTOP_PYTHON, ['-m', 'hermes_cli.main', 'config', 'set', key, value], {
        cwd: core, env: {...env, HERMES_HOME: path.join(home, 'profiles/altron')}, windowsHide: true,
      });
    }
    app = await _electron.launch({executablePath: require('electron'), args: [desktop, '--local'], cwd: root, env, timeout: 45000});
    page = await app.firstWindow({timeout: 45000});
    page.on('pageerror', error => uiErrors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') uiErrors.push(message.text().slice(0, 1000));});
    const setupLater = page.getByRole('button', {name: /Выберу провайдера позже|Choose.*later|Set up later/i});
    await page.addLocatorHandler(setupLater, () => setupLater.click());
    await page.getByRole('button', {name: /^(Capabilities|Возможности)$/}).click();
    const plugins = page.getByText(/^(Plugins|Плагины)$/);
    await plugins.first().click();
    await fs.writeFile(path.join(root, 'initial-dom.json'), JSON.stringify({text: (await page.locator('body').innerText()).slice(0, 10000), buttons: await page.getByRole('button').allTextContents()}, null, 2));
    console.log(`Autonomy evidence: ${root}`);
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
    const profileHome = path.join(home, 'profiles/altron');
    const work = path.join(root, 'mission-output');
    await fs.mkdir(work);
    await fs.writeFile(path.join(work, 'input.json'), JSON.stringify(input));
    await page.getByLabel('Настроенное подключение', {exact: true}).selectOption(catalogSelection.provider);
    await page.getByLabel('Модель из каталога', {exact: true}).selectOption(catalogSelection.model);
    await page.getByLabel('Что вы хотите получить?', {exact: true}).fill('Нужен результат из локального input.json. Сначала уточните потребность.');
    await page.getByRole('button', {name: 'Начать интервью', exact: true}).click();
    await page.getByLabel('Ответ на вопрос', {exact: true}).waitFor({timeout: 90000});
    assert.equal(await fs.readdir(work).then(files => files.includes('result.json')), false);
    const interviewRequestCount = fixture.requests.length;
    await app.close(); app = null;
    app = await _electron.launch({executablePath: require('electron'), args: [desktop, '--local'], cwd: root, env, timeout: 45000});
    page = await app.firstWindow({timeout: 45000});
    page.on('pageerror', error => uiErrors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') uiErrors.push(message.text().slice(0, 1000));});
    await page.addLocatorHandler(page.getByRole('button', {name: /Выберу провайдера позже|Choose.*later|Set up later/i}), locator => locator.click());
    await page.getByRole('button', {name: 'altron', exact: true}).click();
    await page.waitForFunction(() => window.__HERMES_PLUGIN_SDK__?.host.state.profile.get() === 'altron');
    await page.getByRole('button', {name: 'Altron', exact: true}).click();
    await page.getByRole('button', {name: /^Нужен результат из локального input.json/}).click();
    await page.getByLabel('Ответ на вопрос', {exact: true}).waitFor({timeout: 30000});
    assert.equal(fixture.requests.length, interviewRequestCount, 'Restarting a saved interview must not spend another request');
    const answer = 'Для команды. Проверить исходный маркер, число значений и сумму. Только локальные файлы. Справочная ссылка: https://example.invalid/' + 'long-path/'.repeat(100);
    await page.getByLabel('Ответ на вопрос', {exact: true}).fill(answer);
    await page.getByRole('button', {name: 'Ручной режим', exact: true}).click();
    await page.getByRole('button', {name: 'Автономный проект', exact: true}).click();
    await page.getByRole('button', {name: /^Нужен результат из локального input.json/}).click();
    assert.equal(await page.getByLabel('Ответ на вопрос', {exact: true}).inputValue(), answer);
    await page.getByRole('button', {name: 'Сохранить ответ', exact: true}).click();
    await page.getByLabel('Папка проекта — выберите явно', {exact: true}).waitFor({timeout: 90000});
    assert.equal(await fs.readdir(work).then(files => files.includes('result.json')), false);
    await page.setViewportSize({width: 1000, height: 760});
    await page.getByLabel('Папка проекта — выберите явно', {exact: true}).fill('relative-folder');
    await page.getByRole('button', {name: 'Подтвердить и начать', exact: true}).click();
    const alert = page.locator('[data-mission-id]').getByRole('alert');
    await alert.waitFor();
    assert.ok(await alert.evaluate(element => document.activeElement === element));
    assert.match(await alert.innerText(), /Укажите полный путь к папке/);
    const errorBounds = await alert.boundingBox();
    const viewport = await page.evaluate(() => ({width: innerWidth, height: innerHeight}));
    await fs.writeFile(path.join(root, 'ux-metrics.json'), JSON.stringify({errorBounds, viewport}));
    assert.ok(errorBounds.y >= 0 && errorBounds.y + errorBounds.height <= viewport.height, 'An approval error must be visible, not offscreen');
    await page.getByLabel('Папка проекта — выберите явно', {exact: true}).fill(work);
    await page.getByLabel('Рабочие ходы (1–200)', {exact: true}).fill('6');
    await page.getByLabel('Часы (1–168)', {exact: true}).fill('1');
    await page.getByRole('button', {name: 'Подтвердить и начать', exact: true}).click();
    await page.getByRole('button', {name: 'Остановить выполнение', exact: true}).waitFor({timeout: 30000});
    await page.getByRole('button', {name: 'Остановить выполнение', exact: true}).click();
    const stopDialog = page.getByRole('dialog');
    await stopDialog.waitFor();
    assert.ok(await stopDialog.evaluate(element => element.contains(document.activeElement)), 'Confirmation must receive keyboard focus');
    await page.keyboard.press('Escape');
    await stopDialog.waitFor({state: 'hidden'});
    // Unmount every mission component. No renderer callback may schedule the repair.
    await page.getByRole('button', {name: 'Ручной режим', exact: true}).click();
    assert.equal(await page.locator('[data-mission-id]').count(), 0);
    const readMission = async () => {
      const {stdout} = await promisify(execFile)(env.HERMES_DESKTOP_PYTHON, ['-c',
        'import sqlite3,sys; c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); print(c.execute("SELECT document FROM altron_missions ORDER BY rowid DESC LIMIT 1").fetchone()[0]); c.close()',
        path.join(profileHome, 'altron/altron.db')], {env, windowsHide: true, encoding: 'utf8'});
      return JSON.parse(stdout);
    };
    let mission;
    let nativeApprovals = 0;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      mission = await readMission();
      if (['ready', 'blocked', 'unknown', 'cancelled'].includes(mission.status)) break;
      const runtime = mission.turns.at(-1).runtime_id;
      if (runtime && mission.turns.at(-1).status === 'running') {
        const pending = await page.evaluate(async session_id => {
          try {return await window.__HERMES_PLUGIN_SDK__.host.request('approval.pending', {session_id});}
          catch (error) {
            // The coordinator may fence a finished turn between the two reads.
            if (error.message === 'session not found') return {approvals: []};
            throw error;
          }
        }, runtime);
        for (const approval of pending.approvals) {
          assert.equal(approval.command, mission.approval.contract.checks.find(check => check.kind === 'command').command);
          const response = await page.evaluate(({session_id, request_id}) => window.__HERMES_PLUGIN_SDK__.host.request('approval.respond', {session_id, request_id, choice: 'once', all: false}), {session_id: runtime, request_id: approval.request_id});
          assert.equal(response.resolved, 1);
          nativeApprovals += 1;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    await fs.writeFile(path.join(root, 'mission.json'), JSON.stringify(mission, null, 2));
    assert.deepEqual(fixture.errors, []);
    assert.equal(mission.status, 'ready', mission.blocker);
    const workTurns = mission.turns.filter(t => t.phase === 'work');
    assert.equal(workTurns.length, 2, 'The failed first attempt must be repaired once');
    assert.ok(workTurns.every(t => t.settled && t.terminal_status === 'complete'));
    assert.ok(mission.verification.every(check => check.passed));
    assert.ok(mission.verification.some(check => check.source === 'terminal_receipt' && check.exit_code === 0));
    const result = JSON.parse(await fs.readFile(path.join(work, 'result.json'), 'utf8'));
    assert.deepEqual(result, {marker: input.marker, count: input.values.length, total: input.values.reduce((a, b) => a + b, 0), ready: true});
    assert.equal(mission.artifacts[0].sha256, createHash('sha256').update(await fs.readFile(path.join(work, 'result.json'))).digest('hex'));
    await page.getByRole('button', {name: 'Автономный проект', exact: true}).click();
    await page.getByRole('button', {name: /Protocol acceptance · Готово по проверкам/}).click();
    await page.getByText('Готово по подтверждённым проверкам. Это не означает, что пользователь уже принял результат.', {exact: true}).waitFor();
    const sizing = await page.locator('[data-mission-id]').evaluate(element => ({width: element.clientWidth, scrollWidth: element.scrollWidth}));
    assert.ok(sizing.width > 0 && sizing.scrollWidth <= sizing.width, 'Long text must wrap at a small viewport');
    await page.locator('[data-mission-id]').screenshot({path: path.join(root, 'mission-ready.png')});
    const requestCount = fixture.requests.length;
    await app.close(); app = null;
    app = await _electron.launch({executablePath: require('electron'), args: [desktop, '--local'], cwd: root, env, timeout: 45000});
    page = await app.firstWindow({timeout: 45000});
    page.on('pageerror', error => uiErrors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') uiErrors.push(message.text().slice(0, 1000));});
    await page.addLocatorHandler(page.getByRole('button', {name: /Выберу провайдера позже|Choose.*later|Set up later/i}), locator => locator.click());
    await page.getByRole('button', {name: 'altron', exact: true}).click();
    await page.waitForFunction(() => window.__HERMES_PLUGIN_SDK__?.host.state.profile.get() === 'altron');
    await page.getByRole('button', {name: 'Altron', exact: true}).click();
    await page.getByRole('button', {name: /Protocol acceptance · Готово по проверкам/}).click();
    await page.getByText('Готово по подтверждённым проверкам. Это не означает, что пользователь уже принял результат.', {exact: true}).waitFor();
    assert.equal(fixture.requests.length, requestCount, 'Reopening must not replay a completed mission');
    assert.deepEqual(await readMission(), mission);
    assert.deepEqual(uiErrors, [], 'Every imported, working, and reopened window must stay free of runtime errors');
    await fs.writeFile(path.join(root, 'result.json'), JSON.stringify({passed: true, archiveSha256: createHash('sha256').update(await fs.readFile(archive)).digest('hex'),
      desktopVersion: await app.evaluate(({app}) => app.getVersion()),
      realDesktop: true, realGateway: true, realFilesystemTools: true, deterministicModelFixture: true, realLanguageModel: false,
      externalInference: false, interviewTurns: mission.turns.filter(t => t.phase === 'interview').length, workTurns: workTurns.length,
      projectApprovedOnceThroughUI: true, nativeCommandApprovals: nativeApprovals, nativeSafetyDisabled: false, beforeApprovalNoDeliverable: true, rendererUnmountedDuringWork: true, automaticRepair: true,
      nativeCommandReceiptVerified: true, noReplayAfterRestart: true, interviewRestoredAfterRestart: true, draftRestoredAfterNavigation: true, errorFocusedAndVisible: true, escapeDismissesWithoutCancellation: true, confirmationReceivesFocus: true, longTextWrapsAt1000px: true, requests: requestCount}, null, 2));
  } finally {
    await fs.writeFile(path.join(root, 'protocol.json'), JSON.stringify({requests: fixture.requests, errors: fixture.errors}, null, 2));
    await fs.writeFile(path.join(root, 'ui-errors.json'), JSON.stringify(uiErrors));
    if (page && !page.isClosed()) await fs.writeFile(path.join(root, 'final-dom.json'), JSON.stringify({text: (await page.locator('body').innerText()).slice(0, 22000)}, null, 2));
    if (app) {
      const child = app.process();
      const timer = setTimeout(() => {
        if (process.platform === 'win32') {
          void promisify(execFile)('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true}).catch(() => {});
        } else child.kill();
      }, 15000);
      try {await app.close();} finally {clearTimeout(timer);}
    }
    await fixture.close();
    console.log(`Autonomy evidence: ${root}`);
  }
});
