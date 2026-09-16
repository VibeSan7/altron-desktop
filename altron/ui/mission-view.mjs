import {createWorkspaceTools} from './workspace-tools.mjs';

const DEFAULT_LIMITS = {max_turns: 12, max_hours: 168};
const LIMITS = {max_turns: [1, 200], max_hours: [1, 168]};
const statuses = {
  prepared: 'Подготовлено', creating: 'Создаётся сессия', bound: 'Сессия связана', running: 'В работе',
  waiting: 'Ждём ответа', awaiting_approval: 'Ждёт подтверждения', queued: 'В очереди', ready: 'Готово по проверкам',
  blocked: 'Заблокировано', unknown: 'Состояние не подтверждено', cancel_requested: 'Запрошена остановка',
  cancelled: 'Остановлено подтверждённо',
};
const stack = {display: 'grid', gap: 12, minWidth: 0};
const row = {display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minWidth: 0};
const panel = {...stack, padding: 16, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 10};
const muted = {color: 'var(--ui-text-secondary)', fontSize: 13, overflowWrap: 'anywhere'};
const textBlock = {whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0, minWidth: 0};

function failure(code) {
  return new Error(code);
}

function validateLimits(max_turns, max_hours) {
  if (!Number.isInteger(max_turns) || max_turns < LIMITS.max_turns[0] || max_turns > LIMITS.max_turns[1]) throw failure('invalid_limits');
  if (!Number.isInteger(max_hours) || max_hours < LIMITS.max_hours[0] || max_hours > LIMITS.max_hours[1]) throw failure('invalid_limits');
}

function encodeMissionId(id) {
  return encodeURIComponent(id);
}

function lastTurn(mission) {
  return mission?.turns?.[mission.turns.length - 1] || null;
}

function needsSession(mission) {
  const turn = lastTurn(mission);
  return mission?.status === 'prepared' && !turn?.runtime_id && !turn?.stored_id;
}

export function createMissionActions({api, rpc, getConnectionId, getProfile, isCurrent}) {
  const busy = new Set();

  const sourceSnapshot = () => Object.freeze({connectionId: getConnectionId(), profile: getProfile()});
  const check = source => {
    if (!isCurrent() || getConnectionId() !== source.connectionId || getProfile() !== source.profile) throw failure('scope_changed');
  };
  const external = async (source, work) => {
    check(source);
    return work();
  };
  const post = (source, path, body) => external(source, () => api(path, {method: 'POST', body}));

  async function bindPrepared(source, mission) {
    if (!needsSession(mission)) return mission;
    const turn = lastTurn(mission);
    const selected = mission.connection || {};
    if (selected.profile !== source.profile) throw failure('profile_mismatch');
    if (!selected.model || !selected.provider) throw failure('model_mismatch');
    const created = await external(source, () => rpc('session.create', {
      source: 'desktop', profile: selected.profile, model: selected.model, provider: selected.provider,
      cwd: turn.directory, close_on_disconnect: false,
      title: mission.phase === 'interview' ? 'Altron — интервью' : 'Altron — работа',
    }));
    const info = created?.info || {};
    if (info.model !== selected.model || info.provider !== selected.provider) throw failure('model_mismatch');
    if (info.profile_name !== selected.profile) throw failure('profile_mismatch');
    if (!created?.session_id || !created?.stored_session_id) throw failure('session_identity_missing');
    return post(source, `/missions/${encodeMissionId(mission.id)}/bind`, {
      turn_id: turn.id, runtime_id: created.session_id, stored_id: created.stored_session_id,
    });
  }

  function run(key, operation) {
    const source = sourceSnapshot();
    if (busy.has(key)) return Promise.reject(failure('mission_already_starting'));
    busy.add(key);
    return (async () => {
      try { return await operation(source); }
      finally { busy.delete(key); }
    })();
  }

  return {
    create({message, model, provider}) {
      const source = sourceSnapshot();
      const key = `create:${source.connectionId}:${source.profile}`;
      if (busy.has(key)) return Promise.reject(failure('mission_already_starting'));
      busy.add(key);
      return (async () => {
        try {
          const mission = await post(source, '/missions', {message, model, provider, profile: source.profile});
          return mission ? await bindPrepared(source, mission) : mission;
        } finally { busy.delete(key); }
      })();
    },
    answer(id, {revision, message}) {
      return run(`answer:${id}`, async source => {
        const mission = await post(source, `/missions/${encodeMissionId(id)}/answer`, {revision, message});
        return mission ? await bindPrepared(source, mission) : mission;
      });
    },
    approve(id, {revision, directory, max_turns = DEFAULT_LIMITS.max_turns, max_hours = DEFAULT_LIMITS.max_hours}) {
      validateLimits(max_turns, max_hours);
      if (typeof directory !== 'string' || !directory.trim()) throw failure('directory_required');
      return run(`approve:${id}`, async source => {
        const mission = await post(source, `/missions/${encodeMissionId(id)}/approve`, {revision, directory, max_turns, max_hours, confirm: true});
        return mission ? await bindPrepared(source, mission) : mission;
      });
    },
    resume(id) {
      return run(`resume:${id}`, async source => {
        const mission = await post(source, `/missions/${encodeMissionId(id)}/resume`, {confirm: true});
        return mission ? await bindPrepared(source, mission) : mission;
      });
    },
    cancel(id) {
      return run(`cancel:${id}`, source => post(source, `/missions/${encodeMissionId(id)}/cancel`, {confirm: true}));
    },
    recover(id) {
      return run(`recover:${id}`, async source => {
        const mission = await post(source, `/missions/${encodeMissionId(id)}/recover`, {confirm: true});
        return mission ? await bindPrepared(source, mission) : mission;
      });
    },
    revise(id, {feedback, max_turns = DEFAULT_LIMITS.max_turns, max_hours = DEFAULT_LIMITS.max_hours}) {
      validateLimits(max_turns, max_hours);
      return run(`revise:${id}`, async source => {
        const mission = await post(source, `/missions/${encodeMissionId(id)}/revise`, {feedback, max_turns, max_hours, confirm: true});
        return mission ? await bindPrepared(source, mission) : mission;
      });
    },
  };
}

function valueOf(event) {
  return event?.target?.value ?? '';
}

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function errorText(error) {
  const message = String(error?.message || error || '');
  const known = {
    scope_changed: 'Профиль или подключение сменились. Операция остановлена; другой источник не изменён.',
    model_mismatch: 'Hermes вернул другую модель или провайдера. Сессия не привязана.',
    profile_mismatch: 'Hermes вернул другой профиль. Сессия не привязана.',
    session_identity_missing: 'Hermes не вернул обе идентичности сессии. Повторной привязки нет.',
    mission_already_starting: 'Эта операция уже выполняется. Повторный клик не запустил её снова.',
    directory_required: 'Выберите папку проекта перед подтверждением.',
    directory_must_be_absolute: 'Укажите полный путь к папке проекта, а не относительный.',
    project_overlap: 'Эта папка уже относится к другому проекту. Выберите отдельную папку.',
    invalid_limits: 'Лимиты: от 1 до 200 рабочих ходов и от 1 до 168 часов.',
    permission_pending: 'Hermes ожидает разрешения на отдельную команду. Откройте сеанс Hermes и проверьте запрос. Altron не обходит защиту.',
    permission_required: 'Hermes не разрешил команду или не получил ответ. Автоматические повторы остановлены; проверьте разрешения перед продолжением.',
    run_still_active: 'Предыдущее выполнение ещё активно. Слепой повтор запрещён.',
    time_limit: 'Временной лимит исчерпан.',
    turn_limit: 'Лимит рабочих ходов исчерпан.',
  };
  return Object.entries(known).find(([code]) => message.includes(code))?.[1] || message || 'Операция не подтверждена. Проверьте состояние миссии и подключение Hermes.';
}

function createDraftStorage(ctx, scope) {
  const key = field => `altron.mission.draft:${JSON.stringify([...scope, field])}`;
  return {
    read(field) {
      if (!ctx.storage?.get) return '';
      return ctx.storage.get(key(field), '');
    },
    write(field, value) {
      ctx.storage?.set?.(key(field), value);
    },
  };
}

export function createMissionView(React, sdk, ctx) {
  const {createElement: h, Fragment, useEffect, useMemo, useRef, useState} = React;
  const {Button, ConfirmDialog, Input, Textarea, useQuery, useQueryClient} = sdk;
  const {FolderPicker} = createWorkspaceTools(React, sdk, ctx);
  const field = (label, control) => h('label', {style: stack}, h('span', null, label), React.cloneElement(control, {'aria-label': label}));
  const paragraph = value => h('p', {style: textBlock}, value || '');
  const itemList = (items, empty = 'Пока нет данных.') => items?.length ? h('ul', {style: {...stack, gap: 6, paddingLeft: 20}}, ...items.map((item, index) => h('li', {key: `${item?.path || item?.id || index}`, style: {overflowWrap: 'anywhere'}}, typeof item === 'string' ? item : item.path ? `${item.path}${item.purpose ? ` — ${item.purpose}` : ''}` : JSON.stringify(item)))) : h('p', {style: muted}, empty);

  function MissionView({profile, connectionId, gateway, queryKey = [], workspaceId, model, provider, mission: suppliedMission}) {
    const baseKey = Array.isArray(queryKey) ? queryKey : [queryKey];
    const listKey = [...baseKey, 'missions', 'list', workspaceId, connectionId, profile];
    const [selectedId, setSelectedId] = useState(suppliedMission?.id || null);
    const [intro, setIntro] = useState('');
    const [answer, setAnswer] = useState('');
    const [feedback, setFeedback] = useState('');
    const [directory, setDirectory] = useState('');
    const [maxTurns, setMaxTurns] = useState(DEFAULT_LIMITS.max_turns);
    const [maxHours, setMaxHours] = useState(DEFAULT_LIMITS.max_hours);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [confirm, setConfirm] = useState(null);
    const touched = useRef(new Set());
    const live = useRef(true);
    useEffect(() => {live.current = true; return () => {live.current = false;};}, []);
    const errorRef = useRef(null);
    const queryClient = useQueryClient?.();
    const missionsQuery = useQuery({queryKey: listKey, queryFn: () => ctx.rest('/missions'), enabled: gateway === 'open', retry: false, refetchInterval: 3000});
    const missions = listOf(missionsQuery.data);
    const detailKey = [...baseKey, 'missions', 'detail', workspaceId, connectionId, profile, selectedId || 'none'];
    const detailQuery = useQuery({queryKey: detailKey, queryFn: () => ctx.rest(`/missions/${encodeMissionId(selectedId)}`), enabled: gateway === 'open' && Boolean(selectedId), retry: false, refetchInterval: 3000});
    const detail = detailQuery.data && !Array.isArray(detailQuery.data) ? detailQuery.data : null;
    const mission = suppliedMission || detail || missions.find(item => item.id === selectedId) || null;
    const storage = useMemo(() => createDraftStorage(ctx, [workspaceId, connectionId, profile, selectedId || 'new']), [workspaceId, connectionId, profile, selectedId]);
    const actions = useMemo(() => createMissionActions({
      api: (...args) => ctx.rest(...args),
      rpc: (...args) => sdk.host.request(...args),
      getConnectionId: () => sdk.host?.state?.connectionId?.get?.() ?? connectionId,
      getProfile: () => sdk.host?.state?.profile?.get?.() ?? profile,
      isCurrent: () => live.current && (sdk.host?.state?.gateway?.get?.() ?? gateway) === 'open',
    }), [connectionId, gateway, profile, sdk.host, ctx.rest]);

    useEffect(() => {
      if (suppliedMission?.id) setSelectedId(suppliedMission.id);
      else if (selectedId && missions.length && !missions.some(item => item.id === selectedId)) setSelectedId(null);
    }, [missions, selectedId, suppliedMission?.id]);

    useEffect(() => {
      setIntro(''); setAnswer(''); setFeedback(''); setDirectory('');
      setMaxTurns(DEFAULT_LIMITS.max_turns); setMaxHours(DEFAULT_LIMITS.max_hours);
      touched.current = new Set();
      let active = true;
      const restore = async (name, setter) => {
        const saved = await Promise.resolve(storage.read(name));
        if (active && !touched.current.has(name) && typeof saved === 'string' && saved) setter(saved);
      };
      void restore('intro', setIntro);
      void restore('answer', setAnswer);
      void restore('feedback', setFeedback);
      void restore('directory', setDirectory);
      return () => { active = false; };
    }, [storage]);

    useEffect(() => {
      if (!error) return;
      errorRef.current?.focus?.({preventScroll: true});
      errorRef.current?.scrollIntoView?.({block: 'center', behavior: 'instant'});
    }, [error]);

    const refresh = () => queryClient?.invalidateQueries?.({queryKey: listKey});
    const perform = async operation => {
      if (busy || gateway !== 'open') return;
      setBusy(true); setError('');
      try { await operation(); }
      catch (failureValue) { setError(errorText(failureValue)); }
      finally { setBusy(false); refresh(); }
    };
    const edit = (name, setter) => event => {
      const next = valueOf(event);
      touched.current.add(name);
      setter(next);
      storage.write(name, next);
    };
    const chooseExample = text => { touched.current.add('intro'); setIntro(text); storage.write('intro', text); };
    const startInterview = event => {
      event.preventDefault();
      if (!intro.trim() || !model?.trim() || !provider?.trim()) return;
      void perform(async () => {
        const created = await actions.create({message: intro, model, provider});
        setSelectedId(created?.id || null);
      });
    };
    const answerMission = event => {
      event.preventDefault();
      if (!mission || !answer.trim()) return;
      void perform(async () => {
        const updated = await actions.answer(mission.id, {revision: mission.revision, message: answer});
        setAnswer(''); storage.write('answer', ''); setSelectedId(updated?.id || mission.id);
      });
    };
    const approveMission = event => {
      event.preventDefault();
      if (!mission || !directory.trim()) { setError(errorText(failure('directory_required'))); return; }
      void perform(async () => {
        const updated = await actions.approve(mission.id, {revision: mission.revision, directory, max_turns: maxTurns, max_hours: maxHours});
        setSelectedId(updated?.id || mission.id);
      });
    };
    const runCancel = () => void perform(async () => { await actions.cancel(mission.id); setConfirm(null); });
    const runRecover = () => void perform(async () => { const updated = await actions.recover(mission.id); setConfirm(null); setSelectedId(updated?.id || mission.id); });
    const runRevise = event => {
      event?.preventDefault?.();
      if (!feedback.trim()) return;
      void perform(async () => { const updated = await actions.revise(mission.id, {feedback, max_turns: maxTurns, max_hours: maxHours}); setFeedback(''); storage.write('feedback', ''); setConfirm(null); setSelectedId(updated?.id || mission.id); });
    };
    const openSession = storedId => {
      if (storedId && typeof sdk.host?.openSession === 'function') void sdk.host.openSession(storedId);
    };
    const status = mission?.status;
    const history = missions.length > 0 && h('aside', {style: panel}, h('h2', null, 'Мои миссии'),
      h('div', {style: stack}, ...missions.map(item => h(Button, {key: item.id, type: 'button',
        variant: item.id === selectedId ? 'secondary' : 'ghost',
        style: {justifyContent: 'flex-start', minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere'},
        onClick: () => setSelectedId(item.id)}, `${item.proposal?.name || item.transcript?.[0]?.text || item.id} · ${statuses[item.status] || item.status}`))));
    const queryError = (missionsQuery.error || detailQuery.error) && h('p', {role: 'alert'}, 'Не удалось прочитать сохранённые миссии. Проверьте подключение; новые выполнения не запускались.');
    const renderLimits = () => h('div', {style: row},
      field('Рабочие ходы (1–200)', h(Input, {type: 'number', min: 1, max: 200, value: maxTurns, disabled: busy, onChange: e => setMaxTurns(Number(valueOf(e)))})),
      field('Часы (1–168)', h(Input, {type: 'number', min: 1, max: 168, value: maxHours, disabled: busy, onChange: e => setMaxHours(Number(valueOf(e)))})));

    const renderTranscript = () => h('section', {style: panel}, h('h2', null, 'Интервью'), h('p', {style: muted}, 'Вопросы и ответы сохраняются в миссии. Техническое задание заранее писать не нужно.'),
      h('div', {style: stack}, ...(mission.transcript || []).map((entry, index) => h('article', {key: `${entry.role}-${index}`, style: {padding: 12, borderRadius: 8, background: 'var(--ui-bg-quaternary)', minWidth: 0}}, h('strong', null, entry.role === 'assistant' ? 'Вопрос Altron' : 'Ваш ответ'), paragraph(entry.text)))),
      ['waiting', 'awaiting_approval'].includes(status) && h('form', {onSubmit: answerMission, style: stack}, field(status === 'awaiting_approval' ? 'Исправить или уточнить предложение' : 'Ответ на вопрос', h(Textarea, {value: answer, disabled: busy, onChange: edit('answer', setAnswer), placeholder: 'Напишите следующий важный контекст…'})), h(Button, {type: 'submit', disabled: busy || !answer.trim()}, 'Сохранить ответ')));

    const renderProposal = () => {
      const proposal = mission.proposal;
      if (!proposal) return null;
      return h('section', {style: panel}, h('h2', {style: {overflowWrap: 'anywhere'}}, proposal.name), h('p', {style: muted}, 'Предложение можно уточнить ответом выше. Подтверждение ниже запускает проект. Отдельные запросы безопасности Hermes могут потребовать вашего решения.'),
        h('h3', null, 'Цель'), paragraph(proposal.goal),
        h('h3', null, 'Требования'), itemList(proposal.requirements),
        h('h3', null, 'За пределами задачи'), itemList(proposal.out_of_scope),
        h('h3', null, 'План'), paragraph(proposal.plan),
        h('h3', null, 'Результаты'), itemList(proposal.deliverables),
        h('h3', null, 'Конкретные проверки'), h('div', {style: stack}, ...(proposal.checks || []).map(checkItem)),
        h('p', {style: muted}, `Модель: ${mission.connection?.model || 'не указана'} · Провайдер: ${mission.connection?.provider || 'не указан'}`),
        h('form', {onSubmit: approveMission, style: stack}, field('Папка проекта — выберите явно', h(Input, {value: directory, disabled: busy, placeholder: 'Полный путь к отдельной папке', onChange: edit('directory', setDirectory)})), h(FolderPicker, {directory, onChoose: path => {setDirectory(path); storage.write('directory', path);}, busy}),
          h('div', {style: row}, field('Рабочие ходы (1–200)', h(Input, {type: 'number', min: 1, max: 200, value: maxTurns, disabled: busy, onChange: e => setMaxTurns(Number(valueOf(e)))})), field('Часы (1–168)', h(Input, {type: 'number', min: 1, max: 168, value: maxHours, disabled: busy, onChange: e => setMaxHours(Number(valueOf(e)))}))),
          h('p', {style: muted}, 'Это лимиты рабочих ходов и времени, а не число отдельных вызовов модели и не денежный лимит.'), h(Button, {type: 'submit', disabled: busy || !directory.trim() || !proposal}, 'Подтвердить и начать')));
    };

    const checkItem = check => h('article', {key: check.id, style: {padding: 10, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8, minWidth: 0}}, h('strong', null, check.label), h('p', {style: muted}, check.kind === 'file' ? (check.contains?.length ? `Файл ${check.path}: проверяется содержимое` : `Файл ${check.path}: проверяется наличие`) : `Команда: ${check.command}`));
    const renderRuns = () => h('section', {style: panel}, h('h2', null, 'Ходы и состояние'), mission.checkpoint && h(Fragment, null, h('h3', null, 'Контрольная точка'), paragraph(mission.checkpoint)), h('div', {style: stack}, ...(mission.turns || []).map((turn, index) => h('article', {key: turn.id, style: {padding: 10, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8, minWidth: 0}}, h('div', {style: row}, h('strong', null, `Ход ${index + 1}`), h('span', {style: muted}, `${turn.phase} · ${statuses[turn.status] || turn.status}`)), h('p', {style: muted}, `Создан: ${turn.created_at || 'время не указано'}`), turn.terminal_status && h('p', {style: muted}, `Завершение: ${turn.terminal_status}; settled: ${turn.settled ? 'да' : 'нет'}`), turn.stored_id && h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => openSession(turn.stored_id)}, 'Открыть историю Hermes')))),
      status === 'cancel_requested' && h('p', {role: 'status'}, 'Остановка запрошена. Подтверждённой отменой она станет только после проверки фактической остановки.'),
      status === 'unknown' && h('p', {role: 'alert', tabIndex: -1}, 'Состояние не подтверждено. Повторная отправка не выполняется автоматически; сначала нужна проверка и явное восстановление.'),
      (status === 'blocked' || mission.blocker === 'permission_pending') && h('p', {role: 'alert'}, `${status === 'blocked' ? 'Блокировка: ' : ''}${errorText(mission.blocker || 'причина не указана')}`),
      ['running', 'bound', 'creating', 'queued', 'prepared'].includes(status) && h('div', {style: row}, h(Button, {type: 'button', variant: 'destructive', disabled: busy, onClick: () => setConfirm('cancel')}, 'Остановить выполнение')),
      ['prepared', 'queued'].includes(status) && h(Button, {type: 'button', disabled: busy, onClick: () => void perform(() => actions.resume(mission.id))}, 'Продолжить сохранённую миссию'),
      ['unknown', 'blocked', 'cancelled'].includes(status) && h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => setConfirm('recover')}, 'Проверить предыдущее выполнение и восстановить'));

    const renderResult = () => h('section', {style: panel}, h('h2', null, 'Результат'), h('p', {role: 'status'}, status === 'ready' ? 'Готово по подтверждённым проверкам. Это не означает, что пользователь уже принял результат.' : 'Результат ещё не прошёл все подтверждённые проверки.'), h('h3', null, 'Файлы'), h('div', {style: stack}, ...(mission.artifacts || []).map(artifact => h('article', {key: artifact.path, style: {minWidth: 0}}, h('strong', {style: {overflowWrap: 'anywhere'}}, artifact.path), h('p', {style: muted}, `${artifact.bytes} байт · SHA-256: ${artifact.sha256}`)))), h('h3', null, 'Проверки'), h('div', {style: stack}, ...(mission.verification || []).map(check => h('article', {key: check.id, style: {minWidth: 0}}, h('strong', null, `${check.passed ? 'Пройдена' : 'Не пройдена'}: ${check.label}`), h('p', {style: muted}, `${check.kind === 'file' ? 'Файловая проверка' : 'Командная проверка'} · источник: ${check.source || 'не указан'}`)))), h('h3', null, 'Инструкция'), paragraph(mission.instructions), mission.approval?.directory && h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => void ctx.os?.revealPath?.(mission.approval.directory)}, 'Показать папку в Проводнике'), h('form', {onSubmit: event => {event.preventDefault(); if (feedback.trim()) setConfirm('revise');}, style: stack}, field('Необязательная ревизия', h(Textarea, {value: feedback, disabled: busy, onChange: edit('feedback', setFeedback), placeholder: 'Опишите, что нужно изменить…'})), renderLimits(), h('p', {style: muted}, `Новая ревизия использует тот же согласованный проект и проверки. Подтверждаемые лимиты: ${maxTurns} ходов и ${maxHours} часов.`), h(Button, {type: 'submit', disabled: busy || !feedback.trim()}, 'Подтвердить ревизию')));

    const confirmation = confirm && ConfirmDialog && h(ConfirmDialog, {open: true, onClose: () => setConfirm(null), onConfirm: confirm === 'cancel' ? runCancel : confirm === 'recover' ? runRecover : runRevise, title: confirm === 'cancel' ? 'Остановить миссию?' : confirm === 'recover' ? 'Восстановить миссию?' : 'Подтвердить ревизию?', description: confirm === 'cancel' ? 'Остановка сначала запрашивается, а подтверждённой становится после проверки Hermes.' : confirm === 'recover' ? 'Предыдущее выполнение будет проверено первым. Слепого повтора не будет.' : `Согласованные требования сохраняются. Разрешить до ${maxTurns} рабочих ходов и ${maxHours} часов на доработку?`, confirmLabel: confirm === 'cancel' ? 'Остановить' : confirm === 'recover' ? 'Проверить и восстановить' : 'Подтвердить ревизию', destructive: confirm === 'cancel'});

    if (!mission) return h('section', {style: stack},
      queryError, history,
      h('section', {style: {...panel, borderColor: 'var(--ui-accent)'}},
        h('p', {style: muted}, 'ИНТЕРВЬЮ → РАБОТА → РЕЗУЛЬТАТ'),
        h('h2', null, 'Начнём с вашей идеи'),
        h('p', null, 'Вам не нужно заранее писать техническое задание. Altron задаст вопросы, предложит конкретный план и попросит одно финальное подтверждение перед работой.'),
        h('form', {onSubmit: startInterview, style: stack},
          field('Что вы хотите получить?', h(Textarea, {value: intro, rows: 5, maxLength: 16000, disabled: busy,
            placeholder: 'Опишите проблему или желаемый результат своими словами…', onChange: edit('intro', setIntro)})),
          h('div', {style: row},
            h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => chooseExample('Подготовьте краткий отчёт о текущем процессе для команды.')}, 'Пример отчёта'),
            h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => chooseExample('Сделайте небольшую страницу с инструкцией и проверками для пользователей.')}, 'Пример страницы')),
          h('p', {style: muted}, 'Примеры только заполняют поле. Интервью использует выбранное подключение ИИ и может расходовать его лимит; выполнение проекта начнётся только после подтверждения плана.'),
          h(Button, {type: 'submit', disabled: busy || gateway !== 'open' || !intro.trim() || !model?.trim() || !provider?.trim()}, busy ? 'Сохраняем интервью…' : 'Начать интервью'))),
      error && h('div', {ref: errorRef, role: 'alert', tabIndex: -1, style: panel}, error));

    const stage = status === 'ready' ? 2 : mission.approval ? 1 : 0;
    return h('section', {style: stack, 'data-mission-id': mission.id},
      queryError,
      h('header', {style: row}, h('div', {style: {flex: '1 1 300px', minWidth: 0}},
        h('h2', {style: {overflowWrap: 'anywhere'}}, mission.proposal?.name || 'Автономная миссия'),
        h('p', {role: 'status', style: muted}, statuses[status] || status)),
        h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => setSelectedId(null)}, 'Новое интервью')),
      h('ol', {style: {display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, padding: 0, listStyle: 'none'}},
        ...['Интервью', 'Работа', 'Результат'].map((label, index) => h('li', {key: label, 'aria-current': index === stage ? 'step' : undefined,
          style: {padding: 12, borderRadius: 8, border: `1px solid var(${index === stage ? '--ui-accent' : '--ui-stroke-secondary'})`, overflowWrap: 'anywhere'}}, `${index + 1}. ${label}`))),
      h('p', {style: muted}, 'Можно закрыть вкладку Altron — работа продолжится, пока работает Hermes Desktop. Полное закрытие программы или отключение компьютера потребует безопасного восстановления.'),
      renderTranscript(), status === 'awaiting_approval' && renderProposal(), renderRuns(),
      ['ready', 'blocked', 'cancelled'].includes(status) && mission.approval && renderResult(),
      error && h('div', {ref: errorRef, role: 'alert', tabIndex: -1, style: panel}, error), history, confirmation);
  }
  return MissionView;
}
