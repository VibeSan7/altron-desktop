import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash, randomUUID} from 'node:crypto';

const execFileAsync = promisify(execFile);

test(process.env.ALTRON_LIVE_TEAM === '1' ? 'an approved team hands off verified files through the real Altron Desktop' : 'an explicitly authorized model delivers a verified artifact through Altron Desktop', {
  skip: process.env.ALTRON_LIVE !== '1', timeout: 900000,
}, async () => {
  const teamMode = process.env.ALTRON_LIVE_TEAM === '1';
  const {ALTRON_JS_HOME: desktop, ALTRON_PYTHON: python, ALTRON_LIVE_MODEL: model, ALTRON_LIVE_PROVIDER: provider, HERMES_HOME: home} = process.env;
  assert.ok(desktop && python && model && provider && home, 'Explicit Desktop, Python, model, provider and Hermes home are required');
  const require = createRequire(path.resolve(desktop, 'package.json'));
  const {_electron} = require('playwright');
  const core = path.resolve(desktop, '../..');
  const manifest = JSON.parse(await fs.readFile('packaging/manifest.json', 'utf8'));
  const archive = path.resolve('dist', `altron-${manifest.version}.tar.gz`);
  await fs.access(archive);
  await fs.mkdir('.hermes', {recursive: true});
  const evidence = await fs.mkdtemp(path.resolve('.hermes/live-'));
  const profile = `altron-qa-${randomUUID().slice(0, 8)}`;
  const qaRoot = path.join(evidence, 'unpack');
  const profileHome = path.join(home, 'profiles', profile);
  const appHome = path.join(evidence, 'app-home');
  await fs.mkdir(qaRoot, {recursive: true});
  const projectDirectory = path.join(evidence, 'project');
  await fs.mkdir(projectDirectory);
  const input = {marker: randomUUID(), values: [17, 29, 43]};
  await fs.writeFile(path.join(projectDirectory, 'input.json'), JSON.stringify(input), 'utf8');
  const defaultConfig = await fs.readFile(path.join(home, 'config.yaml'));
  const originalUiPath = path.join(home, 'desktop-plugins/altron/plugin.js');
  const originalUi = await fs.readFile(originalUiPath).catch(error => {if (error.code === 'ENOENT') return null; throw error;});
  const archiveSha256 = createHash('sha256').update(await fs.readFile(archive)).digest('hex');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => [
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE', 'OS', 'USERPROFILE', 'HOME', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP',
  ].includes(key.toUpperCase())));
  Object.assign(env, {HERMES_HOME: profileHome, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8'});
  await execFileAsync(python, ['-c', 'from pathlib import Path; import sys; from hermes_cli.profiles import safe_extract_targz; safe_extract_targz(Path(sys.argv[1]), Path(sys.argv[2]))', archive, qaRoot], {cwd: core, env, windowsHide: true});
  await fs.rename(path.join(qaRoot, 'altron'), profileHome);
  await fs.mkdir(appHome);
  await fs.cp(path.join(profileHome, 'desktop-plugins'), path.join(appHome, 'desktop-plugins'), {recursive: true});
  await fs.access(path.join(profileHome, 'plugins/altron/plugin.yaml'));
  for (const [key, value] of [['model.default', model], ['model.provider', provider]]) {
    await execFileAsync(python, ['-m', 'hermes_cli.main', 'config', 'set', key, value], {cwd: core, env, windowsHide: true});
  }
  Object.assign(env, {
    HERMES_HOME: appHome, HERMES_DESKTOP_USER_DATA_DIR: path.join(evidence, 'electron'),
    HERMES_DESKTOP_IGNORE_EXISTING: '1', HERMES_DESKTOP_HERMES_ROOT: core,
    HERMES_DESKTOP_PYTHON: python, HERMES_DESKTOP_APP_NAME: `AltronAcceptance-${path.basename(evidence)}`,
  });
  await fs.writeFile(path.join(evidence, 'boundary.json'), JSON.stringify({profile, profileHome, projectDirectory, model, provider, externalInferenceAuthorized: true, credentialFilesCopied: false, originalDesktopControlled: false, isolatedDesktopPluginRoot: true, archiveSha256}, null, 2));
  console.log(`Live evidence: ${evidence}`);
  await fs.mkdir(env.HERMES_DESKTOP_USER_DATA_DIR, {recursive: true});
  await fs.writeFile(path.join(env.HERMES_DESKTOP_USER_DATA_DIR, 'active-profile.json'), JSON.stringify({profile}));
  const token = randomUUID() + randomUUID();
  await fs.writeFile(path.join(profileHome, '.env'), `HERMES_DASHBOARD_SESSION_TOKEN=${token}
`, {mode: 0o600});
  let backend;
  let backendLog = '';
  const startBackend = async () => {
    backend = spawn(python, ['-m', 'hermes_cli.main', '--profile', profile, 'serve', '--isolated', '--skip-build', '--host', '127.0.0.1', '--port', '0'], {
      cwd: core, env: {...env, HERMES_HOME: profileHome, HERMES_DASHBOARD_SESSION_TOKEN: token}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('QA backend readiness timed out')), 60000);
      const capture = data => {
        backendLog += data.toString('utf8').replaceAll(token, '[REDACTED]');
        const match = backendLog.match(/HERMES_BACKEND_READY port=(\d+)/);
        if (match) {clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`);}
      };
      backend.stdout.on('data', capture); backend.stderr.on('data', capture);
      backend.once('error', error => {clearTimeout(timer); reject(error);});
      backend.once('exit', code => {clearTimeout(timer); reject(new Error(`QA backend exited: ${code}`));});
    });
    env.HERMES_DESKTOP_REMOTE_URL = await ready;
    env.HERMES_DESKTOP_REMOTE_TOKEN = token;
  };
  const stopBackend = async () => {
    if (backend?.exitCode === null) {
      if (process.platform === 'win32') await execFileAsync('taskkill', ['/PID', String(backend.pid), '/T', '/F'], {windowsHide: true});
      else backend.kill('SIGTERM');
      await new Promise(resolve => backend.exitCode !== null ? resolve() : backend.once('exit', resolve));
    }
    backendLog = '';
  };
  let app;
  let page;
  const readProject = async () => {
    const {stdout} = await execFileAsync(python, ['-c', 'import json,sqlite3,sys; c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); rows=c.execute("SELECT document FROM altron_projects").fetchall(); assert len(rows)==1; print(rows[0][0]); c.close()', path.join(profileHome, 'altron/altron.db')], {env, windowsHide: true, encoding: 'utf8'});
    return JSON.parse(stdout);
  };
  const launchOptions = {executablePath: require('electron'), args: [desktop], cwd: evidence, env, timeout: 60000};
  try {
    await startBackend();
    app = await _electron.launch(launchOptions);
    page = await app.firstWindow({timeout: 60000});
    const later = page.getByRole('button', {name: /Выберу провайдера позже|Choose.*later|Set up later/i});
    try {
      await later.waitFor({state: 'visible', timeout: 30000});
      await later.click();
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
      await page.locator('[class*="--z-onboarding"]').waitFor({state: 'hidden', timeout: 1000});
    }
    await page.waitForFunction(expected => window.__HERMES_PLUGIN_SDK__?.host.state.profile.get() === expected, profile);
    await page.waitForFunction(() => window.__HERMES_PLUGIN_SDK__?.host.state.gateway.get() === 'open');
    const sessions = await page.evaluate(expected => window.__HERMES_PLUGIN_SDK__.host.request('session.list', {profile: expected, limit: 1}), profile);
    assert.equal((sessions.sessions ?? sessions).length, 0, 'A fresh QA profile must not expose existing sessions');
    await page.getByRole('button', {name: /^(Capabilities|Возможности)$/}).click();
    await page.getByText(/^(Plugins|Плагины)$/).first().click();
    const toggle = page.getByRole('switch', {name: 'Desktop: Altron', exact: true});
    await toggle.waitFor({timeout: 30000});
    if (await toggle.getAttribute('aria-checked') !== 'true') await toggle.click();
    await page.getByRole('button', {name: 'Altron', exact: true}).click();
    await page.getByLabel('Название проекта', {exact: true}).fill('Live acceptance');
    await page.getByLabel('Папка проекта', {exact: true}).fill(projectDirectory);
    await page.getByRole('button', {name: 'Создать проект', exact: true}).click();
    await page.getByRole('heading', {name: 'Live acceptance', exact: true}).waitFor();
    await page.getByText('Расширенный ручной ввод', {exact: true}).click();
    await page.getByLabel('Модель', {exact: true}).fill(model);
    await page.getByLabel('Провайдер', {exact: true}).fill(provider);
    await page.getByLabel('Какой результат нужен', {exact: true}).fill(teamMode ? 'Контрольная задача: выполнить два согласованных шага. Первый исполнитель создаёт result.json по input.json; второй читает полученный result.json и создаёт handoff.json с данными и его контрольной суммой. Передавать файлы через altron_update; не менять input.json, настройки, другие проекты. Не использовать сеть, делегацию или установку пакетов. Итог проверит автоматизированная QA-приёмка, не модели.' : 'Контрольная задача: прочитай input.json в папке проекта. Создай result.json с полями marker (точно из входа), count (длина values), total (сумма values). Сначала вызови altron_context, после создания файла передай result.json через altron_update action=result. Не меняй другие файлы, настройки, репозитории или подключения; не используй браузер, внешнюю сеть, делегацию и установку пакетов. Это маленькая проверка передачи реального файла, а не задача разработки Altron.');
    await page.getByLabel('Как проверить готовность', {exact: true}).fill('result.json — корректный JSON. marker совпадает с входным; count равен длине массива, total — его сумме. Файл передан через altron_update, а задача остаётся на приёмке до отдельной проверки.');
    await page.getByRole('button', {name: 'Создать задачу', exact: true}).click();
    await page.getByLabel('План для согласования', {exact: true}).fill('Получить назначенный контекст Altron. Прочитать input.json. Вычислить count и total. Создать result.json. Передать существующий файл через altron_update. Не принимать результат от имени пользователя.');
    if (teamMode) {
      await page.getByText('Состав команды', {exact: true}).click();
      for (const label of ['Техническая работа', 'Решения и документация']) {
        await page.getByLabel(`Модель — ${label}`, {exact: true}).fill(model);
        await page.getByLabel(`Провайдер — ${label}`, {exact: true}).fill(provider);
      }
      await page.getByLabel('Инструкции — Решения и документация', {exact: true}).selectOption('technical-writer');
      await page.getByRole('button', {name: 'Сохранить состав команды', exact: true}).click();
      await page.getByLabel('План для согласования', {exact: true}).fill('Шаг 1: получить altron_context, прочитать input.json и создать result.json с marker/count/total, передать через altron_update. Шаг 2: получить новый altron_context, прочитать result.json и создать handoff.json с marker/total/source_sha256, передать через altron_update. Никакой сети, делегации, установки или изменения чужих файлов. Это два исполнения, не отдельная проверяющая модель.');
      await page.getByText('Последовательность специалистов', {exact: true}).click();
      const goals = [
        'Получить altron_context. Прочитать input.json. Создать ТОЛЬКО result.json: marker из входа, count — длина values, total — сумма values. Передать файл через altron_update action=result. Не делать второй шаг и не писать handoff.json.',
        'Получить altron_context. Прочитать результат предыдущего специалиста result.json. Создать ТОЛЬКО handoff.json с marker и total точно из result.json и source_sha256 — SHA-256 реальных байтов result.json. Проверить собственный handoff.json и передать его через altron_update action=result. Не переписывать result.json или input.json.'
      ];
      for (let index = 0; index < goals.length; index++) {
        await page.getByRole('button', {name: 'Добавить шаг', exact: true}).click();
        await page.getByLabel(`Роль шага ${index + 1}`, {exact: true}).selectOption(index === 0 ? 'technical' : 'memory');
        await page.getByLabel(`Результат шага ${index + 1}`, {exact: true}).fill(goals[index]);
        await page.getByLabel(`Критерии шага ${index + 1}`, {exact: true}).fill(index === 0 ? 'result.json соответствует входу и содержит marker/count/total.' : 'handoff.json содержит правильные marker/total/source_sha256; исходные файлы не изменены.');
      }
      await page.getByRole('button', {name: 'Согласовать командный план', exact: true}).click();
      await page.getByRole('button', {name: 'Запустить согласованную команду', exact: true}).click();
      await page.getByRole('button', {name: 'Подтверждаю запуск команды', exact: true}).click();
    } else {
      await page.getByRole('button', {name: 'Согласовать план', exact: true}).click();
      await page.getByText('План согласован', {exact: true}).waitFor();
      await page.getByRole('button', {name: 'Запустить исполнителя', exact: true}).click();
      await page.getByRole('dialog', {name: 'Подтверждение запуска'}).waitFor();
      await page.getByRole('button', {name: 'Подтверждаю запуск', exact: true}).click();
    }
    const deadline = Date.now() + 600000;
    let project;
    while (Date.now() < deadline) {
      project = await readProject();
      if (project.runs.some(run => ['error', 'interrupted'].includes(run.terminal_status) || ['failed', 'unknown', 'interrupted'].includes(run.status))) break;
      if (project.runs.length === (teamMode ? 2 : 1) && project.runs.every(run => run.terminal_status === 'complete')) break;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    await fs.writeFile(path.join(evidence, 'project.json'), JSON.stringify(project, null, 2));
    assert.ok(project.tasks[0].goal.startsWith('Контрольная задача:'), 'UTF-8 project text must survive the evidence export');
    assert.equal(project.runs.length, teamMode ? 2 : 1, 'One launch per approved step, no automatic retry');
    for (const step of project.runs) {
      assert.equal(step.model, model); assert.equal(step.provider, provider);
      assert.equal(step.terminal_status, 'complete', step.note);
      assert.equal(step.status, 'reported', step.note);
    }
    const run = project.runs[0];
    assert.equal(run.model, model);
    assert.equal(run.provider, provider);
    assert.equal(run.terminal_status, 'complete', run.note);
    assert.equal(run.status, 'reported', run.note);
    assert.equal(project.tasks[0].status, 'review', 'The model cannot accept its own result');
    const bytes = await fs.readFile(path.join(projectDirectory, 'result.json'));
    assert.deepEqual(JSON.parse(bytes.toString('utf8')), {marker: input.marker, count: input.values.length, total: input.values.reduce((sum, value) => sum + value, 0)});
    assert.equal(project.tasks[0].artifacts.length, teamMode ? 2 : 1);
    const sourceHash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(project.tasks[0].artifacts.find(file => file.path === 'result.json').sha256, sourceHash);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(projectDirectory, 'input.json'), 'utf8')), input);
    if (teamMode) {
      assert.deepEqual(project.runs.map(step => step.role), ['technical', 'memory']);
      assert.equal(project.tasks[0].team.status, 'review');
      const handoff = await fs.readFile(path.join(projectDirectory, 'handoff.json'));
      assert.deepEqual(JSON.parse(handoff.toString('utf8')), {marker: input.marker, total: input.values.reduce((sum, value) => sum + value, 0), source_sha256: sourceHash});
      assert.equal(project.tasks[0].artifacts.find(file => file.path === 'handoff.json').sha256, createHash('sha256').update(handoff).digest('hex'));
      assert.equal(project.runs[1].specialist.id, 'technical-writer');
    }
    await page.getByText('Нужна приёмка', {exact: true}).waitFor();
    await page.getByLabel('Что вы проверили по критериям задачи', {exact: true}).fill('Автоматизированная приёмка только искусственной QA-задачи по разрешению владельца: проверены JSON, marker, count, total и SHA-256; модель и провайдер совпали с явно выбранными.');
    await page.getByLabel('Я открыл файлы и проверил критерии', {exact: true}).check();
    await page.getByRole('button', {name: 'Я проверил результат — принять', exact: true}).click();
    await page.getByText('Принято пользователем', {exact: true}).waitFor();
    const accepted = await readProject();
    assert.equal(accepted.tasks[0].status, 'done');
    assert.ok(accepted.tasks[0].acceptance_review.text.includes('QA'));
    await app.close();
    app = null;
    await stopBackend();
    await startBackend();
    app = await _electron.launch(launchOptions);
    page = await app.firstWindow({timeout: 60000});
    await page.waitForFunction(expected => window.__HERMES_PLUGIN_SDK__?.host.state.profile.get() === expected, profile);
    await page.getByRole('button', {name: 'Altron', exact: true}).click();
    await page.getByText('Принято пользователем', {exact: true}).waitFor();
    assert.deepEqual(await readProject(), accepted, 'Restart must preserve the accepted result without another launch');
    assert.deepEqual(await fs.readFile(path.join(home, 'config.yaml')), defaultConfig, 'Default configuration must not change');
    const afterUi = await fs.readFile(originalUiPath).catch(error => {if (error.code === 'ENOENT') return null; throw error;});
    assert.deepEqual(afterUi, originalUi, 'The original Desktop UI must not be upgraded by a QA run');
    await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify({passed: true, model, provider, singleLaunch: !teamMode, teamMode, archiveSha256, originalDesktopUiUnchanged: true, launches: project.runs.length, selectedRoles: project.runs.map(step => step.role), separateReviewerLaunched: false, runtimeId: run.runtime_id, storedId: run.stored_id, terminalStatus: run.terminal_status, verifiedArtifact: project.tasks[0].artifacts[0], acceptedAfterIndependentFileAssertions: true, preservedAfterDesktopRestart: true, defaultConfigUnchanged: true}, null, 2));
    await page.locator('main').filter({has: page.getByRole('heading', {name: 'Altron', exact: true})}).screenshot({path: path.join(evidence, 'altron-result.png')});
  } finally {
    if (page && !page.isClosed()) await fs.writeFile(path.join(evidence, 'ui-status.json'), JSON.stringify({alerts: await page.getByRole('alert').allTextContents(), taskCards: await page.locator('[data-task-id]').allTextContents()}, null, 2));
    await fs.writeFile(path.join(evidence, 'backend.log'), backendLog.replaceAll(token, '[REDACTED]'));
    if (app) await app.close();
    await stopBackend();
  }
});
