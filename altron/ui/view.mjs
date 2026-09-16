import {createActions} from './actions.mjs';
import {createTeamViews} from './team-view.mjs';
import {createMaintenanceView} from './maintenance-view.mjs';

const statuses = {team_waiting: 'Передача между шагами команды', interrupted: 'Выполнение остановлено', draft: 'Нужен план', approved: 'План согласован', launching: 'Подготовка запуска', planning: 'Altron составляет план', running: 'В работе', reviewing: 'Идёт проверка', review: 'Нужна приёмка', done: 'Принято пользователем', failed: 'Остановлено с ошибкой', unknown: 'Состояние не подтверждено', cancel_requested: 'Запрошена остановка', reported: 'Результат передан', prepared: 'Запуск подготовлен'};
const roles = {technical: 'Техническая работа', business: 'Исследования и бизнес', memory: 'Решения и документация', altron: 'Altron — составить план', reviewer: 'Отдельный проверяющий'};
const errors = {scope_changed: 'Профиль или проект сменился. Продолжение операции остановлено.', model_mismatch: 'Hermes вернул другую модель или провайдера. Задание не отправлено.', model_and_provider_required: 'Выберите модель и укажите её провайдера.', project_overlap: 'Эта папка уже относится к другому проекту. Выберите отдельную папку.', directory_not_found: 'Папка не найдена. Создайте её в Проводнике и укажите полный путь.', directory_must_be_absolute: 'Нужен полный путь к существующей папке.', directory_too_broad: 'Нужна отдельная папка проекта, не весь диск или профиль Hermes.', artifact_changed: 'Файл изменился после передачи результата. Приёмка заблокирована.', artifact_unavailable: 'Один из файлов недоступен. Приёмка заблокирована.', run_state_unconfirmed: 'Не удалось подтвердить состояние запуска. Повторной отправки нет.', run_already_starting: 'Этот запуск уже обрабатывается.'};
const stack = {display: 'grid', gap: 12};
const row = {display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center'};
const panel = {...stack, padding: 16, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 10};
const muted = {color: 'var(--ui-text-secondary)', fontSize: 13};

export function createView(React, sdk, ctx, coordinator) {
  const {createElement: h, useEffect, useMemo, useRef, useState} = React;
  const {Button, Input, Textarea, useValue, useQuery, useQueryClient, host} = sdk;
  const field = (label, control) => h('label', {style: {...stack, gap: 5}}, h('span', null, label), React.cloneElement(control, {'aria-label': label}));
  const paragraph = value => h('p', {style: {whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0}}, value);

  const Maintenance = createMaintenanceView(React, sdk, ctx);
  const {TeamSettings, TaskTeam} = createTeamViews(React, sdk, ctx, coordinator);
  function Task({task, project, perform, actions, busy, model, provider}) {
    const [plan, setPlan] = useState(task.plan);
    const [review, setReview] = useState('');
    const [role, setRole] = useState('technical');
    const [confirmRole, setConfirmRole] = useState(null);
    const proposed = JSON.stringify(task.proposed_steps || []);
    const [steps, setSteps] = useState(() => JSON.parse(proposed));
    useEffect(() => setSteps(JSON.parse(proposed)), [proposed]);
    const routeFor = value => project.team?.[value] || {model, provider};
    const confirmRoute = confirmRole ? routeFor(confirmRole) : null;
    useEffect(() => setPlan(task.plan), [task.plan]);
    const path = `/projects/${project.id}/tasks/${task.id}`;
    const launch = () => perform(async () => {
      const chosen = confirmRole;
      setConfirmRole(null);
      await actions.start({projectId: project.id, taskId: task.id, role: chosen, ...routeFor(chosen)});
    });
    return h('article', {style: panel, 'data-task-id': task.id},
      h('div', {style: row}, h('strong', null, task.goal), h('span', {style: muted}, statuses[task.status] || task.status)),
      h('div', null, h('strong', null, 'Критерии готовности'), paragraph(task.acceptance)),
      task.status === 'draft' ? h('div', {style: stack},
        field('План для согласования', h(Textarea, {value: plan, rows: 4, maxLength: 16000, onChange: e => setPlan(e.target.value), disabled: busy})),
        h('div', {style: row},
          h(Button, {onClick: () => setConfirmRole('altron'), disabled: busy || !routeFor('altron').model || !routeFor('altron').provider}, 'Попросить Altron составить план'),
          h(Button, {onClick: () => perform(() => ctx.rest(`${path}/approve`, {method: 'POST', body: {plan}})), disabled: busy || !plan.trim() || steps.length > 0}, 'Согласовать план')),
      ) : h('div', null, h('strong', null, 'Согласованный план'), paragraph(task.plan || 'План ещё не согласован.')),
      task.status === 'approved' && !task.team && h('div', {style: row},
        field('Исполнитель', h('select', {value: role, onChange: e => setRole(e.target.value), disabled: busy, style: {color: 'inherit', background: 'var(--ui-background)', padding: 8}},
          ...['technical', 'business', 'memory'].map(value => h('option', {key: value, value}, roles[value])))),
        h(Button, {disabled: busy || !routeFor(role).model || !routeFor(role).provider, onClick: () => setConfirmRole(role)}, 'Запустить исполнителя')),
      h(TaskTeam, {task, project, plan, steps, setSteps, perform, busy}),
      confirmRole && h('section', {role: 'dialog', 'aria-label': 'Подтверждение запуска', style: panel},
        h('strong', null, `Запуск: ${roles[confirmRole]}`),
        paragraph(`Проект: ${project.name}\nПапка: ${project.directory}\nМодель: ${confirmRoute.model}\nПровайдер: ${confirmRoute.provider}`),
        paragraph('Это отдельный запуск в вашем Hermes. Возможны расходы вашего провайдера. Автоматической замены модели и повторной отправки Altron не делает.'),
        h('div', {style: row}, h(Button, {disabled: busy, onClick: launch}, 'Подтверждаю запуск'), h(Button, {disabled: busy, onClick: () => setConfirmRole(null)}, 'Не запускать'))),
      task.summary && h('div', null, h('strong', null, 'Отчёт исполнителя — ещё не приёмка'), paragraph(task.summary)),
      task.artifacts.length > 0 && h('div', {style: stack}, h('strong', null, 'Реальные файлы результата'),
        ...task.artifacts.map(file => h('div', {key: file.path, style: stack},
          h('code', {style: {overflowWrap: 'anywhere'}}, file.path),
          h('small', {style: muted}, `${file.bytes} байт · SHA-256 ${file.sha256}`))),
        h(Button, {disabled: busy, onClick: () => perform(() => ctx.os.revealPath(project.directory))}, 'Открыть папку результата')),
      task.specialist_review && h('div', null, h('strong', null, 'Заключение отдельного проверяющего'), paragraph(task.specialist_review.text)),
      task.status === 'review' && h('div', {style: stack},
        h(Button, {disabled: busy || !routeFor('reviewer').model || !routeFor('reviewer').provider, onClick: () => setConfirmRole('reviewer')}, 'Заказать отдельную проверку'),
        paragraph('Можно проверить файлы самостоятельно. Контрольная сумма подтверждает неизменность файла, а не правильность его содержания.'),
        field('Что вы проверили по критериям задачи', h(Textarea, {value: review, rows: 3, maxLength: 16000, onChange: e => setReview(e.target.value), disabled: busy})),
        h(Button, {disabled: busy || !review.trim(), onClick: () => perform(() => ctx.rest(`${path}/accept`, {method: 'POST', body: {review}}))}, 'Я проверил результат — принять')),
      task.acceptance_review && paragraph(`Приёмка пользователя: ${task.acceptance_review.text}`),
      ...project.runs.filter(run => run.task_id === task.id).map(run => h('section', {key: run.id, style: {...panel, padding: 10}},
        h('span', null, `${roles[run.role]} · ${run.provider} / ${run.model} · ${statuses[run.status] || run.status}`),
        run.note && paragraph(run.note),
        h('div', {style: row},
          run.stored_id && h(Button, {disabled: busy, onClick: () => perform(() => actions.open(run))}, 'Открыть диалог в Hermes'),
          !task.team && !['reported', 'failed', 'interrupted', 'cancel_requested'].includes(run.status) && h(Button, {disabled: busy, onClick: () => perform(() => actions.cancel({projectId: project.id, run}))}, 'Запросить остановку')))),
    );
  }

  function Project({project, perform, actions, busy, model, provider, catalog}) {
    const [goal, setGoal] = useState('');
    const [acceptance, setAcceptance] = useState('');
    const [decision, setDecision] = useState('');
    const addTask = e => {
      e.preventDefault();
      perform(async () => {
        await ctx.rest(`/projects/${project.id}/tasks`, {method: 'POST', body: {goal, acceptance}});
        setGoal(''); setAcceptance('');
      });
    };
    return h('section', {style: stack},
      h('h2', null, project.name), h('p', {style: {...muted, overflowWrap: 'anywhere'}}, project.directory),
      h(TeamSettings, {project, perform, busy, model, provider, catalog}),
      h('form', {style: panel, onSubmit: addTask}, h('h3', null, 'Новая задача'),
        field('Какой результат нужен', h(Textarea, {required: true, value: goal, rows: 3, maxLength: 16000, onChange: e => setGoal(e.target.value), disabled: busy})),
        field('Как проверить готовность', h(Textarea, {required: true, value: acceptance, rows: 3, maxLength: 16000, onChange: e => setAcceptance(e.target.value), disabled: busy})),
        h(Button, {type: 'submit', disabled: busy || !goal.trim() || !acceptance.trim()}, 'Создать задачу')),
      ...project.tasks.slice().reverse().map(task => h(Task, {key: task.id, task, project, perform, actions, busy, model, provider})),
      h('section', {style: panel}, h('h3', null, 'Решения проекта'),
        ...project.decisions.map(item => h('div', {key: item.id}, paragraph(item.text))),
        h('form', {style: stack, onSubmit: e => {e.preventDefault(); perform(async () => {await ctx.rest(`/projects/${project.id}/decisions`, {method: 'POST', body: {text: decision}}); setDecision('');});}},
          field('Новое решение', h(Textarea, {required: true, value: decision, maxLength: 16000, onChange: e => setDecision(e.target.value), disabled: busy})),
          h(Button, {type: 'submit', disabled: busy || !decision.trim()}, 'Сохранить решение'))),
    );
  }

  function Workspace({profile, gateway, epoch, connectionId}) {
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [name, setName] = useState('');
    const [directory, setDirectory] = useState('');
    const [model, setModel] = useState(() => typeof host.state.model.get() === 'string' ? host.state.model.get() : '');
    const [provider, setProvider] = useState('');
    const live = useRef(true);
    const selected = useRef(null);
    useEffect(() => {live.current = true; return () => {live.current = false;};}, []);
    const queryKey = ['altron', connectionId, profile, epoch];
    const workspace = useQuery({queryKey: [...queryKey, 'workspace'], queryFn: () => ctx.rest('/workspace'), enabled: gateway === 'open', retry: false, refetchInterval: 5000});
    const catalog = useQuery({queryKey: [...queryKey, 'specialists'], queryFn: () => ctx.rest('/specialists'), enabled: gateway === 'open', retry: false});
    const pid = workspace.data?.selected_project_id;
    selected.current = pid;
    const project = useQuery({queryKey: [...queryKey, 'project', pid], queryFn: () => ctx.rest(`/projects/${pid}`), enabled: gateway === 'open' && Boolean(pid), retry: false, refetchInterval: 5000});
    const actions = useMemo(() => createActions({
      api: (...args) => ctx.rest(...args), rpc: (...args) => host.request(...args), openSession: id => host.openSession(id),
      getConnectionId: () => host.state.connectionId.get(), getProfile: () => host.state.profile.get(),
      onEvent: (...args) => host.onEvent(...args), onDispose: fn => ctx.onDispose(fn),
      onTrackingError: () => host.notify({kind: 'error', message: 'Не удалось сохранить итог запуска Altron. Состояние не подтверждено; повтор не выполнялся.'}),
      isCurrent: () => live.current && host.state.profile.get() === profile && host.state.gateway.get() === 'open' && selected.current === pid,
    }), [profile, pid]);
    const refresh = () => queryClient.invalidateQueries({queryKey});
    const perform = async work => {
      if (busy || !live.current) return;
      setBusy(true); setError('');
      try {await work();}
      catch (failure) {
        if (live.current) {
          const code = Object.keys(errors).find(value => String(failure?.message).includes(value));
          setError(code ? errors[code] : 'Операция не подтверждена. Проверьте состояние задачи и подключение Hermes; автоматического повтора нет.');
        }
      } finally {
        if (live.current) {setBusy(false); await refresh();}
      }
    };
    const addProject = e => {
      e.preventDefault();
      perform(async () => {
        const created = await ctx.rest('/projects', {method: 'POST', body: {name, directory}});
        if (!live.current) return;
        await ctx.rest(`/projects/${created.id}/select`, {method: 'POST'});
        setName(''); setDirectory('');
      });
    };
    return h('main', {style: {...stack, padding: 24, maxWidth: 1080, margin: '0 auto', overflow: 'auto', height: '100%'}},
      h('header', null, h('h1', null, 'Altron'), h('p', {style: muted}, 'Проект → задача → согласованный план → работа → проверка.')),
      gateway !== 'open' && h('p', {role: 'status'}, 'Нет подключения к Hermes. Действия с задачами недоступны.'),
      workspace.isLoading && h('p', {role: 'status'}, 'Загрузка Altron…'),
      workspace.error && h('p', {role: 'alert'}, 'API Altron недоступен. Проверьте, что Python-часть пакета включена в этом профиле Hermes.'),
      error && h('p', {role: 'alert'}, error),
      h(Maintenance, {queryKey, gateway}),
      h(Button, {disabled: busy || gateway !== 'open', onClick: refresh}, 'Обновить состояние'),
      workspace.data && h(React.Fragment, null,
        workspace.data.projects.length > 0 && field('Текущий проект', h('select', {'aria-label': 'Текущий проект', value: pid || '', disabled: busy, onChange: e => perform(() => ctx.rest(`/projects/${e.target.value}/select`, {method: 'POST'})), style: {color: 'inherit', background: 'var(--ui-background)', padding: 10}},
          h('option', {value: '', disabled: true}, 'Выберите проект'), ...workspace.data.projects.map(p => h('option', {key: p.id, value: p.id}, p.name)))),
        h('details', {open: workspace.data.projects.length === 0, style: panel}, h('summary', null, 'Добавить проект'),
          h('form', {onSubmit: addProject, style: stack},
            field('Название проекта', h(Input, {required: true, value: name, maxLength: 200, onChange: e => setName(e.target.value), disabled: busy})),
            field('Папка проекта', h(Input, {required: true, value: directory, placeholder: 'Полный путь к отдельной существующей папке', maxLength: 4096, onChange: e => setDirectory(e.target.value), disabled: busy})),
            h('p', {style: muted}, 'Не выбирайте весь диск или папку Hermes. Altron не копирует старые проекты и не создаёт задачи автоматически.'),
            h(Button, {type: 'submit', disabled: busy || !name.trim() || !directory.trim()}, 'Создать проект'))),
        h('details', {style: panel}, h('summary', null, 'Подключение ИИ для следующего запуска'),
          h('p', {style: muted}, 'Используются ваши подключения в Hermes. Ключи и пароли сюда не вводятся. Провайдер — идентификатор подключения из штатных настроек моделей, например openai-codex.'),
          field('Модель', h(Input, {value: model, maxLength: 300, onChange: e => setModel(e.target.value), disabled: busy})),
          field('Провайдер', h(Input, {value: provider, maxLength: 100, onChange: e => setProvider(e.target.value), disabled: busy}))),
        project.error && h('p', {role: 'alert'}, 'Выбранный проект недоступен. Чужие данные не подставляются.'),
        pid && project.data?.id === pid && h(Project, {key: pid, project: project.data, perform, actions, busy, model, provider, catalog: catalog.data}),
      ),
    );
  }

  return function Altron() {
    const profile = useValue(host.state.profile);
    const gateway = useValue(host.state.gateway);
    const connectionId = useValue(host.state.connectionId);
    const [epoch, setEpoch] = useState(0);
    useEffect(() => host.onEvent('gateway.ready', () => setEpoch(value => value + 1)), []);
    return h(Workspace, {key: JSON.stringify([connectionId, profile, epoch]), profile, gateway, epoch, connectionId});
  };
}
