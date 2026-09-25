import {createWorkspaceTools} from './workspace-tools.mjs';
import {defaultLocalizer, russianT} from './i18n.mjs';

const DEFAULT_LIMITS = {max_turns: 12, max_hours: 168};
const LIMITS = {max_turns: [1, 200], max_hours: [1, 168]};

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

export function createMissionActions({api, rpc, getConnectionId, getProfile, isCurrent, t = russianT}) {
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
      title: mission.phase === 'interview' ? t('mission.sessionInterview') : t('mission.sessionWork'),
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

function errorText(error, t = russianT) {
  const message = String(error?.message || error || '');
  const known = ['scope_changed', 'model_mismatch', 'profile_mismatch', 'session_identity_missing', 'mission_already_starting',
    'directory_required', 'directory_must_be_absolute', 'project_overlap', 'invalid_limits', 'permission_pending',
    'permission_required', 'run_still_active', 'time_limit', 'turn_limit'];
  const code = known.find(value => message.includes(value));
  return code ? t(`mission.errors.${code}`) : message || t('mission.genericError');
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

export function createMissionView(React, sdk, ctx, localizer = defaultLocalizer) {
  const {createElement: h, Fragment, useEffect, useMemo, useRef, useState} = React;
  const {Button, ConfirmDialog, Input, Textarea, useQuery, useQueryClient} = sdk;
  const {FolderPicker} = createWorkspaceTools(React, sdk, ctx, localizer);
  const field = (label, control) => h('label', {style: stack}, h('span', null, label), React.cloneElement(control, {'aria-label': label}));
  const paragraph = value => h('p', {style: textBlock}, value || '');
  const itemList = (items, t) => items?.length ? h('ul', {style: {...stack, gap: 6, paddingLeft: 20}}, ...items.map((item, index) => h('li', {key: `${item?.path || item?.id || index}`, style: {overflowWrap: 'anywhere'}}, typeof item === 'string' ? item : item.path ? `${item.path}${item.purpose ? ` — ${item.purpose}` : ''}` : JSON.stringify(item)))) : h('p', {style: muted}, t('mission.empty'));

  function MissionView({profile, connectionId, gateway, queryKey = [], workspaceId, model, provider, mission: suppliedMission}) {
    const {t} = localizer.useI18n();
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
      t,
    }), [connectionId, gateway, profile, sdk.host, ctx.rest, t]);

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
      catch (failureValue) { setError(errorText(failureValue, t)); }
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
      if (!mission || !directory.trim()) { setError(errorText(failure('directory_required'), t)); return; }
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
    const history = missions.length > 0 && h('aside', {style: panel}, h('h2', null, t('mission.myMissions')),
      h('div', {style: stack}, ...missions.map(item => h(Button, {key: item.id, type: 'button',
        variant: item.id === selectedId ? 'secondary' : 'ghost',
        style: {justifyContent: 'flex-start', minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere'},
        onClick: () => setSelectedId(item.id)}, `${item.proposal?.name || item.transcript?.[0]?.text || item.id} · ${t(`mission.statuses.${item.status}`)}`))));
    const queryError = (missionsQuery.error || detailQuery.error) && h('p', {role: 'alert'}, t('mission.queryError'));
    const renderLimits = () => h('div', {style: row},
      field(t('mission.turnsLimit'), h(Input, {type: 'number', min: 1, max: 200, value: maxTurns, disabled: busy, onChange: e => setMaxTurns(Number(valueOf(e)))})),
      field(t('mission.hoursLimit'), h(Input, {type: 'number', min: 1, max: 168, value: maxHours, disabled: busy, onChange: e => setMaxHours(Number(valueOf(e)))})));

    const renderTranscript = () => h('section', {style: panel}, h('h2', null, t('mission.interview')), h('p', {style: muted}, t('mission.interviewDescription')),
      h('div', {style: stack}, ...(mission.transcript || []).map((entry, index) => h('article', {key: `${entry.role}-${index}`, style: {padding: 12, borderRadius: 8, background: 'var(--ui-bg-quaternary)', minWidth: 0}}, h('strong', null, entry.role === 'assistant' ? t('mission.altronQuestion') : t('mission.yourAnswer')), paragraph(entry.text)))),
      ['waiting', 'awaiting_approval'].includes(status) && h('form', {onSubmit: answerMission, style: stack}, field(status === 'awaiting_approval' ? t('mission.reviseProposal') : t('mission.answerQuestion'), h(Textarea, {value: answer, disabled: busy, onChange: edit('answer', setAnswer), placeholder: t('mission.answerPlaceholder')})), h(Button, {type: 'submit', disabled: busy || !answer.trim()}, t('mission.saveAnswer'))));

    const renderProposal = () => {
      const proposal = mission.proposal;
      if (!proposal) return null;
      return h('section', {style: panel}, h('h2', {style: {overflowWrap: 'anywhere'}}, proposal.name), h('p', {style: muted}, t('mission.proposalDescription')),
        h('h3', null, t('mission.goal')), paragraph(proposal.goal),
        h('h3', null, t('mission.requirements')), itemList(proposal.requirements, t),
        h('h3', null, t('mission.outOfScope')), itemList(proposal.out_of_scope, t),
        h('h3', null, t('mission.plan')), paragraph(proposal.plan),
        h('h3', null, t('mission.deliverables')), itemList(proposal.deliverables, t),
        h('h3', null, t('mission.checks')), h('div', {style: stack}, ...(proposal.checks || []).map(checkItem)),
        h('p', {style: muted}, t('mission.connection', mission.connection?.model || t('common.notSpecified'), mission.connection?.provider || t('common.notSpecified'))),
        h('form', {onSubmit: approveMission, style: stack}, field(t('mission.projectFolder'), h(Input, {value: directory, disabled: busy, placeholder: t('mission.folderPlaceholder'), onChange: edit('directory', setDirectory)})), h(FolderPicker, {directory, onChoose: path => {setDirectory(path); storage.write('directory', path);}, busy}),
          h('div', {style: row}, field(t('mission.turnsLimit'), h(Input, {type: 'number', min: 1, max: 200, value: maxTurns, disabled: busy, onChange: e => setMaxTurns(Number(valueOf(e)))})), field(t('mission.hoursLimit'), h(Input, {type: 'number', min: 1, max: 168, value: maxHours, disabled: busy, onChange: e => setMaxHours(Number(valueOf(e)))}))),
          h('p', {style: muted}, t('mission.limitsDescription')), h(Button, {type: 'submit', disabled: busy || !directory.trim() || !proposal}, t('mission.approve'))));
    };

    const checkItem = check => h('article', {key: check.id, style: {padding: 10, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8, minWidth: 0}}, h('strong', null, check.label), h('p', {style: muted}, check.kind === 'file' ? (check.contains?.length ? t('mission.fileContentCheck', check.path) : t('mission.fileExistenceCheck', check.path)) : t('mission.commandCheck', check.command)));
    const renderRuns = () => h('section', {style: panel}, h('h2', null, t('mission.runs')), mission.checkpoint && h(Fragment, null, h('h3', null, t('mission.checkpoint')), paragraph(mission.checkpoint)), h('div', {style: stack}, ...(mission.turns || []).map((turn, index) => h('article', {key: turn.id, style: {padding: 10, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8, minWidth: 0}}, h('div', {style: row}, h('strong', null, t('mission.turn', index + 1)), h('span', {style: muted}, `${t(`mission.phases.${turn.phase}`)} · ${t(`mission.statuses.${turn.status}`)}`)), h('p', {style: muted}, t('mission.created', turn.created_at || t('common.unknownTime'))), turn.terminal_status && h('p', {style: muted}, t('mission.terminal', turn.terminal_status, turn.settled ? t('common.yes') : t('common.no'))), turn.stored_id && h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => openSession(turn.stored_id)}, t('mission.openHistory'))))),
      status === 'cancel_requested' && h('p', {role: 'status'}, t('mission.stopRequested')),
      status === 'unknown' && h('p', {role: 'alert', tabIndex: -1}, t('mission.stateUnknown')),
      (status === 'blocked' || mission.blocker === 'permission_pending') && h('p', {role: 'alert'}, `${status === 'blocked' ? t('mission.blocked') : ''}${errorText(mission.blocker || t('mission.reasonMissing'), t)}`),
      ['running', 'bound', 'creating', 'queued', 'prepared'].includes(status) && h('div', {style: row}, h(Button, {type: 'button', variant: 'destructive', disabled: busy, onClick: () => setConfirm('cancel')}, t('mission.stop'))),
      ['prepared', 'queued'].includes(status) && h(Button, {type: 'button', disabled: busy, onClick: () => void perform(() => actions.resume(mission.id))}, t('mission.resume')),
      ['unknown', 'blocked', 'cancelled'].includes(status) && h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => setConfirm('recover')}, t('mission.recover')));

    const renderResult = () => h('section', {style: panel},
      h('h2', null, t('mission.result')),
      h('p', {role: 'status'}, status === 'ready' ? t('mission.resultReady') : t('mission.resultNotReady')),
      h('h3', null, t('mission.files')),
      h('div', {style: stack}, ...(mission.artifacts || []).map(artifact => h('article', {key: artifact.path, style: {minWidth: 0}},
        h('strong', {style: {overflowWrap: 'anywhere'}}, artifact.path),
        h('p', {style: muted}, `${t('mission.artifactSize', artifact.bytes)} · SHA-256: ${artifact.sha256}`)))),
      h('h3', null, t('mission.verifications')),
      h('div', {style: stack}, ...(mission.verification || []).map(check => h('article', {key: check.id, style: {minWidth: 0}},
        h('strong', null, `${check.passed ? t('mission.passed') : t('mission.failed')}: ${check.label}`),
        h('p', {style: muted}, `${check.kind === 'file' ? t('mission.fileCheck') : t('mission.commandVerification')} · ${t('mission.source', check.source || t('common.notSpecified'))}`)))),
      h('h3', null, t('mission.instructions')), paragraph(mission.instructions),
      mission.approval?.directory && h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => void ctx.os?.revealPath?.(mission.approval.directory)}, t('mission.showFolder')),
      h('form', {onSubmit: event => {event.preventDefault(); if (feedback.trim()) setConfirm('revise');}, style: stack},
        field(t('mission.optionalRevision'), h(Textarea, {value: feedback, disabled: busy, onChange: edit('feedback', setFeedback), placeholder: t('mission.revisionPlaceholder')})),
        renderLimits(), h('p', {style: muted}, t('mission.revisionLimits', maxTurns, maxHours)),
        h(Button, {type: 'submit', disabled: busy || !feedback.trim()}, t('mission.confirmRevision'))));

    const confirmation = confirm && ConfirmDialog && h(ConfirmDialog, {
      open: true, onClose: () => setConfirm(null),
      onConfirm: confirm === 'cancel' ? runCancel : confirm === 'recover' ? runRecover : runRevise,
      title: confirm === 'cancel' ? t('mission.stopTitle') : confirm === 'recover' ? t('mission.recoverTitle') : t('mission.reviseTitle'),
      description: confirm === 'cancel' ? t('mission.stopDescription') : confirm === 'recover' ? t('mission.recoverDescription') : t('mission.reviseDescription', maxTurns, maxHours),
      confirmLabel: confirm === 'cancel' ? t('mission.stopLabel') : confirm === 'recover' ? t('mission.recoverLabel') : t('mission.reviseLabel'),
      destructive: confirm === 'cancel',
    });

    if (!mission) return h('section', {style: stack},
      queryError, history,
      h('section', {style: {...panel, borderColor: 'var(--ui-accent)'}},
        h('p', {style: muted}, t('mission.flow')),
        h('h2', null, t('mission.startTitle')),
        h('p', null, t('mission.startDescription')),
        h('form', {onSubmit: startInterview, style: stack},
          field(t('mission.desiredResult'), h(Textarea, {value: intro, rows: 5, maxLength: 16000, disabled: busy,
            placeholder: t('mission.desiredPlaceholder'), onChange: edit('intro', setIntro)})),
          h('div', {style: row},
            h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => chooseExample(t('mission.reportExampleText'))}, t('mission.reportExample')),
            h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => chooseExample(t('mission.pageExampleText'))}, t('mission.pageExample'))),
          h('p', {style: muted}, t('mission.examplesDescription')),
          h(Button, {type: 'submit', disabled: busy || gateway !== 'open' || !intro.trim() || !model?.trim() || !provider?.trim()}, busy ? t('mission.savingInterview') : t('mission.startInterview')))),
      error && h('div', {ref: errorRef, role: 'alert', tabIndex: -1, style: panel}, error));

    const stage = status === 'ready' ? 2 : mission.approval ? 1 : 0;
    return h('section', {style: stack, 'data-mission-id': mission.id},
      queryError,
      h('header', {style: row}, h('div', {style: {flex: '1 1 300px', minWidth: 0}},
        h('h2', {style: {overflowWrap: 'anywhere'}}, mission.proposal?.name || t('mission.autonomousMission')),
        h('p', {role: 'status', style: muted}, t(`mission.statuses.${status}`))),
        h(Button, {type: 'button', variant: 'outline', disabled: busy, onClick: () => setSelectedId(null)}, t('mission.newInterview'))),
      h('ol', {style: {display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, padding: 0, listStyle: 'none'}},
        ...[t('mission.interview'), t('mission.work'), t('mission.result')].map((label, index) => h('li', {key: label, 'aria-current': index === stage ? 'step' : undefined,
          style: {padding: 12, borderRadius: 8, border: `1px solid var(${index === stage ? '--ui-accent' : '--ui-stroke-secondary'})`, overflowWrap: 'anywhere'}}, `${index + 1}. ${label}`))),
      h('p', {style: muted}, t('mission.closeDescription')),
      renderTranscript(), status === 'awaiting_approval' && renderProposal(), renderRuns(),
      ['ready', 'blocked', 'cancelled'].includes(status) && mission.approval && renderResult(),
      error && h('div', {ref: errorRef, role: 'alert', tabIndex: -1, style: panel}, error), history, confirmation);
  }
  return MissionView;
}
