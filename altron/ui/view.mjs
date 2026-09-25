import {createActions} from './actions.mjs';
import {createMissionView} from './mission-view.mjs';
import {createTeamViews} from './team-view.mjs';
import {createMaintenanceView} from './maintenance-view.mjs';
import {createWorkspaceTools, demoTaskFor, projectSummary, usageText, elapsedText} from './workspace-tools.mjs';
import {createTaskControls, runUnsettled} from './task-controls.mjs';
import {defaultLocalizer} from './i18n.mjs';

const errorCodes = ['runtime_state_changed', 'runtime_unavailable', 'runtime_scope_mismatch', 'runtime_state_unconfirmed', 'run_budget_exhausted',
  'task_archived', 'scope_changed', 'model_mismatch', 'model_and_provider_required', 'project_overlap', 'directory_not_found',
  'directory_must_be_absolute', 'directory_too_broad', 'artifact_changed', 'artifact_unavailable', 'run_state_unconfirmed', 'run_already_starting'];
const stack = {display: 'grid', gap: 12, minWidth: 0, overflowWrap: 'anywhere'};
const row = {display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center'};
const panel = {...stack, padding: 16, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 10};
const muted = {color: 'var(--ui-text-secondary)', fontSize: 13};

export function createView(React, sdk, ctx, coordinator, localizer = defaultLocalizer) {
  const {createElement: h, useEffect, useMemo, useRef, useState} = React;
  const {Button, Input, Textarea, useValue, useQuery, useQueryClient, host} = sdk;
  const field = (label, control) => h('label', {style: {...stack, gap: 5}}, h('span', null, label), React.cloneElement(control, {'aria-label': label}));
  const paragraph = value => h('p', {style: {whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0}}, value);

  const Maintenance = createMaintenanceView(React, sdk, ctx, localizer);
  const MissionView = createMissionView(React, sdk, ctx, localizer);
  const {Connections, FolderPicker, Diagnostics} = createWorkspaceTools(React, sdk, ctx, localizer);
  const TaskControls = createTaskControls(React, sdk, ctx, localizer);
  const {TeamSettings, TaskTeam} = createTeamViews(React, sdk, ctx, coordinator, localizer);
  function Task({task, project, perform, actions, busy, model, provider}) {
    const {t} = localizer.useI18n();
    const statusLabel = status => t(`view.statuses.${status}`);
    const roleLabel = role => t(`view.roles.${role}`);
    const [plan, setPlan] = useState(task.plan);
    const [review, setReview] = useState('');
    const [checked, setChecked] = useState(false);
    const runs = project.runs.filter(run => run.task_id === task.id);
    const unsettled = runs.some(runUnsettled);
    const taskBusy = busy || Boolean(task.archived);
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
      h('div', {style: row}, h('strong', null, task.goal), h('span', {style: muted}, statusLabel(task.status))),
      h('div', null, h('strong', null, t('view.readinessCriteria')), paragraph(task.acceptance)),
      h(TaskControls, {key: task.attempt || 1, task, runs, path, perform, busy}),
      h('p', {style: muted}, task.archived ? t('view.archivedTask') : task.status === 'draft' ? t('view.nextDraft') : task.status === 'approved' ? t('view.nextApproved') : task.status === 'review' ? t('view.nextReview') : ['failed', 'interrupted', 'unknown'].includes(task.status) ? t('view.nextStopped') : ''),
      task.status === 'draft' && !task.archived ? h('div', {style: stack},
        field(t('view.planForApproval'), h(Textarea, {value: plan, rows: 4, maxLength: 16000, onChange: e => setPlan(e.target.value), disabled: busy})),
        h('div', {style: row},
          h(Button, {onClick: () => setConfirmRole('altron'), disabled: busy || !routeFor('altron').model || !routeFor('altron').provider}, t('view.askPlan')),
          h(Button, {onClick: () => perform(() => ctx.rest(`${path}/approve`, {method: 'POST', body: {plan}})), disabled: busy || !plan.trim() || steps.length > 0}, t('view.approvePlan'))),
      ) : h('div', null, h('strong', null, t('view.approvedPlan')), paragraph(task.plan || t('view.noApprovedPlan'))),
      task.status === 'approved' && !task.team && !task.archived && h('div', {style: row},
        field(t('view.assignee'), h('select', {value: role, onChange: e => setRole(e.target.value), disabled: busy, style: {color: 'inherit', background: 'var(--ui-background)', padding: 8}},
          ...['technical', 'business', 'memory'].map(value => h('option', {key: value, value}, roleLabel(value))))),
        h(Button, {disabled: busy || !routeFor(role).model || !routeFor(role).provider, onClick: () => setConfirmRole(role)}, t('view.startWorker'))),
      h(TaskTeam, {task, project, plan, steps, setSteps, perform, busy: taskBusy}),
      confirmRole && h('section', {role: 'dialog', 'aria-label': t('view.launchDialog'), style: panel},
        h('strong', null, t('view.launch', roleLabel(confirmRole))),
        paragraph(t('view.launchSummary', project.name, project.directory, confirmRoute.model, confirmRoute.provider)),
        paragraph(t('view.launchDescription')),
        h('div', {style: row}, h(Button, {disabled: busy, onClick: launch}, t('view.confirmLaunch')), h(Button, {disabled: busy, onClick: () => setConfirmRole(null)}, t('view.doNotLaunch')))),
      task.summary && h('div', null, h('strong', null, t('view.workerReport')), paragraph(task.summary)),
      task.artifacts.length > 0 && h('div', {style: stack}, h('strong', null, t('view.resultFiles')),
        ...task.artifacts.map(file => h('div', {key: file.path, style: stack},
          h('code', {style: {overflowWrap: 'anywhere'}}, file.path),
          h('small', {style: muted}, `${t('view.fileSize', file.bytes)} · SHA-256 ${file.sha256}`))),
        h(Button, {disabled: busy, onClick: () => perform(() => ctx.os.revealPath(project.directory))}, t('view.openResultFolder'))),
      task.specialist_review && h('div', null, h('strong', null, t('view.reviewerConclusion')), paragraph(task.specialist_review.text)),
      task.status === 'review' && !task.archived && h('div', {style: stack},
        h(Button, {disabled: busy || !routeFor('reviewer').model || !routeFor('reviewer').provider, onClick: () => setConfirmRole('reviewer')}, t('view.orderReview')),
        paragraph(t('view.checksumDescription')),
        field(t('view.reviewField'), h(Textarea, {value: review, rows: 3, maxLength: 16000, onChange: e => setReview(e.target.value), disabled: busy})),
        h('label', {style: row}, h('input', {type: 'checkbox', checked, disabled: busy || unsettled, onChange: e => setChecked(e.target.checked), 'aria-label': t('view.reviewCheckbox')}), t('view.reviewCheckbox')),
        h(Button, {disabled: busy || unsettled || !checked || !review.trim(), onClick: () => perform(() => ctx.rest(`${path}/accept`, {method: 'POST', body: {review}}))}, t('view.acceptResult'))),
      task.acceptance_review && paragraph(t('view.userAcceptance', task.acceptance_review.text)),
      ...runs.map(run => h('section', {key: run.id, style: {...panel, padding: 10}},
        h('span', null, `${roleLabel(run.role)} · ${run.provider} / ${run.model} · ${statusLabel(run.status)}`),
        h('small', null, t('view.runAttempt', run.attempt || 1, elapsedText(run, Date.now(), t))),
        h('p', {style: muted}, usageText(run.usage, t)),
        run.note && paragraph(run.note),
        h('div', {style: row},
          run.stored_id && h(Button, {disabled: busy, onClick: () => perform(() => actions.open(run))}, t('view.openHermes')),
          !task.archived && runUnsettled(run) && run.runtime_id && run.status !== 'cancel_requested' && h(Button, {disabled: busy, onClick: () => perform(() => actions.cancel({projectId: project.id, run}))}, t('view.requestStop'))))),
    );
  }

  function Project({project, perform, actions, busy, model, provider, catalog}) {
    const {t} = localizer.useI18n();
    const [goal, setGoal] = useState('');
    const [acceptance, setAcceptance] = useState('');
    const [decision, setDecision] = useState('');
    const [search, setSearch] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [budget, setBudget] = useState(project.remaining_runs == null ? '' : String(project.remaining_runs));
    const counts = projectSummary(project);
    const addTask = e => {
      e.preventDefault();
      perform(async () => {
        await ctx.rest(`/projects/${project.id}/tasks`, {method: 'POST', body: {goal, acceptance}});
        setGoal(''); setAcceptance('');
      });
    };
    return h('section', {style: stack},
      h('h2', null, project.name), h('p', {style: {...muted, overflowWrap: 'anywhere'}}, project.directory),
      h('section', {style: panel}, h('h3', null, t('view.projectNow')),
        paragraph(t('view.projectSummary', counts.active, counts.review, counts.blocked, counts.done, counts.archived)),
        project.decisions.length > 0 && paragraph(t('view.lastDecision', project.decisions.at(-1).text))),
      h(TeamSettings, {project, perform, busy, model, provider, catalog}),
      h('details', {style: panel}, h('summary', null, t('view.runLimit')),
        paragraph(t('view.remainingRuns', project.remaining_runs ?? t('view.unlimited'))),
        field(t('view.allowRuns'), h(Input, {type: 'number', min: 0, max: 10000, value: budget, placeholder: t('view.emptyUnlimited'), disabled: busy, onChange: e => setBudget(e.target.value)})),
        h(Button, {disabled: busy || (budget !== '' && (!Number.isInteger(Number(budget)) || Number(budget) < 0 || Number(budget) > 10000)), onClick: () => perform(() => ctx.rest(`/projects/${project.id}/budget`, {method: 'POST', body: {remaining: budget === '' ? null : Number(budget), confirm: true}}))}, t('view.confirmRunLimit'))),
      h('form', {style: panel, onSubmit: addTask}, h('h3', null, t('view.newTask')),
        h(Button, {type: 'button', disabled: busy || Boolean(goal || acceptance), onClick: () => {const demo = demoTaskFor(t); setGoal(demo.goal); setAcceptance(demo.acceptance);}}, t('view.fillDemo')),
        h('p', {style: muted}, t('view.demoDescription')),
        field(t('view.desiredOutcome'), h(Textarea, {required: true, value: goal, rows: 3, maxLength: 16000, onChange: e => setGoal(e.target.value), disabled: busy})),
        field(t('view.readinessCheck'), h(Textarea, {required: true, value: acceptance, rows: 3, maxLength: 16000, onChange: e => setAcceptance(e.target.value), disabled: busy})),
        h(Button, {type: 'submit', disabled: busy || !goal.trim() || !acceptance.trim()}, t('view.createTask'))),
      field(t('view.searchTasks'), h(Input, {value: search, onChange: e => setSearch(e.target.value)})),
      h('label', {style: row}, h('input', {type: 'checkbox', checked: showArchived, onChange: e => setShowArchived(e.target.checked), 'aria-label': t('view.showArchive')}), t('view.showArchive')),
      ...project.tasks.filter(task => Boolean(task.archived) === showArchived && `${task.goal} ${task.acceptance}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice().reverse().map(task => h(Task, {key: `${task.id}:${task.attempt || 1}`, task, project, perform, actions, busy, model, provider})),
      h('section', {style: panel}, h('h3', null, t('view.projectDecisions')),
        ...project.decisions.map(item => h('div', {key: item.id}, paragraph(item.text))),
        h('form', {style: stack, onSubmit: e => {e.preventDefault(); perform(async () => {await ctx.rest(`/projects/${project.id}/decisions`, {method: 'POST', body: {text: decision}}); setDecision('');});}},
          field(t('view.newDecision'), h(Textarea, {required: true, value: decision, maxLength: 16000, onChange: e => setDecision(e.target.value), disabled: busy})),
          h(Button, {type: 'submit', disabled: busy || !decision.trim()}, t('view.saveDecision')))),
    );
  }

  function Workspace({profile, gateway, epoch, connectionId}) {
    const {t} = localizer.useI18n();
    const LanguageSelector = localizer.LanguageSelector;
    const [mode, setMode] = useState('mission');
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
      onTrackingError: () => host.notify({kind: 'error', message: t('view.trackingError')}),
      t,
      isCurrent: () => live.current && host.state.profile.get() === profile && host.state.gateway.get() === 'open' && selected.current === pid,
    }), [profile, pid, t]);
    const refresh = () => queryClient.invalidateQueries({queryKey});
    const perform = async work => {
      if (busy || !live.current) return;
      setBusy(true); setError('');
      try {await work();}
      catch (failure) {
        if (live.current) {
          const code = errorCodes.find(value => String(failure?.message).includes(value));
          setError(code ? t(`view.errors.${code}`) : t('view.genericError'));
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
      h('header', {style: stack},
        h('div', {style: {...row, justifyContent: 'space-between'}}, h('h1', null, 'Altron'), LanguageSelector && h(LanguageSelector)),
        h('p', {style: muted}, t('view.headerDescription'))),
      gateway !== 'open' && h('p', {role: 'status'}, t('view.noConnection')),
      workspace.isLoading && h('p', {role: 'status'}, t('view.loading')),
      workspace.error && h('p', {role: 'alert'}, t('view.apiUnavailable')),
      error && h('p', {role: 'alert'}, error),
      h('nav', {style: row, 'aria-label': t('view.modeLabel')}, ...[['mission', t('view.autonomousMode')], ['manual', t('view.manualMode')]].map(([value, label]) => h(Button, {key: value, variant: mode === value ? 'secondary' : 'ghost', 'aria-pressed': mode === value, onClick: () => setMode(value)}, label))),
      h(Button, {disabled: busy || gateway !== 'open', onClick: refresh}, t('view.refresh')),
      workspace.data && h(Connections, {profile, queryKey, gateway, model, provider, setModel, setProvider, busy}),
      workspace.data && mode === 'mission' && h(MissionView, {key: workspace.data.workspace_id, profile, gateway, connectionId, queryKey, workspaceId: workspace.data.workspace_id, model, provider}),
      workspace.data && mode === 'manual' && h(React.Fragment, null,
        workspace.data.projects.length > 0 && field(t('view.currentProject'), h('select', {'aria-label': t('view.currentProject'), value: pid || '', disabled: busy, onChange: e => perform(() => ctx.rest(`/projects/${e.target.value}/select`, {method: 'POST'})), style: {color: 'inherit', background: 'var(--ui-background)', padding: 10}},
          h('option', {value: '', disabled: true}, t('view.chooseProject')), ...workspace.data.projects.map(p => h('option', {key: p.id, value: p.id}, p.name)))),
        h('details', {open: workspace.data.projects.length === 0, style: panel}, h('summary', null, t('view.addProject')),
          h('form', {onSubmit: addProject, style: stack},
            field(t('view.projectName'), h(Input, {required: true, value: name, maxLength: 200, onChange: e => setName(e.target.value), disabled: busy})),
            field(t('view.projectFolder'), h(Input, {required: true, value: directory, placeholder: t('view.projectFolderPlaceholder'), maxLength: 4096, onChange: e => setDirectory(e.target.value), disabled: busy})),
            h(FolderPicker, {directory, onChoose: setDirectory, busy}),
            h('p', {style: muted}, t('view.folderWarning')),
            h(Button, {type: 'submit', disabled: busy || !name.trim() || !directory.trim()}, t('view.createProject')))),
        project.error && h('p', {role: 'alert'}, t('view.projectUnavailable')),
        pid && project.data?.id === pid && (project.data.autonomy_id ? paragraph(t('view.autonomousProjectNotice')) : h(Project, {key: pid, project: project.data, perform, actions, busy, model, provider, catalog: catalog.data})),
      ),
      h(Maintenance, {queryKey, gateway}),
      h(Diagnostics, {perform, busy: busy || gateway !== 'open'}),
    );
  }

  return function Altron() {
    const profile = useValue(host.state.profile);
    const gateway = useValue(host.state.gateway);
    const connectionId = useValue(host.state.connectionId);
    const [epoch, setEpoch] = useState(0);
    useEffect(() => {
      let previousEpoch;
      return host.onEvent('gateway.ready', event => {
        const nextEpoch = event.payload?.replay_epoch ?? null;
        // The first (or repeated same-server) handshake must not unmount an in-flight launch.
        if (previousEpoch !== undefined && (nextEpoch === null || nextEpoch !== previousEpoch)) setEpoch(value => value + 1);
        previousEpoch = nextEpoch;
      });
    }, [connectionId, profile]);
    return h(Workspace, {key: JSON.stringify([connectionId, profile, epoch]), profile, gateway, epoch, connectionId});
  };
}
