import {defaultLocalizer} from './i18n.mjs';

const stack = {display: 'grid', gap: 10};
const row = {display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center'};
const panel = {...stack, padding: 12, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8};
const selectStyle = {color: 'inherit', background: 'var(--ui-background)', padding: 8};

export function createTeamViews(React, sdk, ctx, coordinator, localizer = defaultLocalizer) {
  const {createElement: h, useEffect, useState} = React;
  const {Button, Input, Textarea} = sdk;
  const field = (name, control) => h('label', {style: stack}, h('span', null, name), React.cloneElement(control, {'aria-label': name}));

  function TeamSettings({project, perform, busy, model, provider, catalog}) {
    const {t} = localizer.useI18n();
    const roleLabel = role => t(`team.roles.${role}`);
    const saved = JSON.stringify(project.team || {});
    const [routes, setRoutes] = useState(() => JSON.parse(saved));
    useEffect(() => setRoutes(JSON.parse(saved)), [saved]);
    const change = (role, key, value) => setRoutes(previous => ({...previous, [role]: {...previous[role], [key]: value}}));
    const assignments = Object.fromEntries(Object.entries(routes).filter(([, route]) => route.model || route.provider || route.specialist).map(([role, route]) => [role, {model: route.model || '', provider: route.provider || '', specialist: route.specialist || null}]));
    const valid = Object.values(assignments).every(route => route.model.trim() && route.provider.trim());
    return h('details', {style: panel}, h('summary', null, t('team.setup')),
      h('p', null, t('team.setupDescription')),
      h(Button, {disabled: busy || !model || !provider, onClick: () => setRoutes(previous => ({...previous, ...Object.fromEntries(['altron', 'technical', 'business', 'memory'].map(role => [role, {...previous[role], model, provider}]))}))}, t('team.assignAll')),
      ...['altron', 'technical', 'business', 'memory', 'reviewer'].map(role => h('section', {key: role, style: panel}, h('strong', null, roleLabel(role)),
        field(t('team.modelFor', roleLabel(role)), h(Input, {value: routes[role]?.model || '', maxLength: 300, disabled: busy, onChange: e => change(role, 'model', e.target.value)})),
        field(t('team.providerFor', roleLabel(role)), h(Input, {value: routes[role]?.provider || '', maxLength: 100, disabled: busy, onChange: e => change(role, 'provider', e.target.value)})),
        field(t('team.instructionsFor', roleLabel(role)), h('select', {'aria-label': t('team.instructionsFor', roleLabel(role)), value: routes[role]?.specialist || '', disabled: busy, style: selectStyle, onChange: e => change(role, 'specialist', e.target.value)},
          h('option', {value: ''}, t('team.baseRole')),
          ...(catalog?.specialists || []).filter(s => s.role === role).map(s => h('option', {key: s.id, value: s.id}, s.name)))),
        routes[role]?.specialist && h('p', null, t('team.adaptedInstructions')),
        h(Button, {disabled: busy, onClick: () => setRoutes(previous => {const next = {...previous}; delete next[role]; return next;})}, t('team.removeAssignment', roleLabel(role))))),
      !valid && h('p', {role: 'status'}, t('team.assignmentIncomplete')),
      h(Button, {disabled: busy || !valid, onClick: () => perform(() => ctx.rest(`/projects/${project.id}/team`, {method: 'POST', body: {assignments}}))}, t('team.save')),
      catalog?.source_commit && h('p', {style: {overflowWrap: 'anywhere'}}, t('team.source', catalog.source_commit)),
    );
  }

  function TaskTeam({task, project, plan, steps, setSteps, perform, busy}) {
    const {t} = localizer.useI18n();
    const roleLabel = role => t(`team.roles.${role}`);
    const stateLabel = state => t(`team.states.${state}`);
    const routeText = route => route?.model && route?.provider ? `${route.provider} / ${route.model}${route.specialist?.name ? ` · ${route.specialist.name}` : ''}` : t('team.noRoute');
    const [confirm, setConfirm] = useState(false);
    const ids = {projectId: project.id, taskId: task.id};
    const path = `/projects/${project.id}/tasks/${task.id}/team`;
    if (!task.team && task.status !== 'draft') return null;
    const update = (index, key, value) => setSteps(previous => previous.map((step, i) => i === index ? {...step, [key]: value} : step));
    if (task.status === 'draft') return h('details', {style: panel, open: steps.length > 0}, h('summary', null, t('team.sequence')),
      h('p', null, t('team.sequenceDescription')),
      ...steps.map((step, index) => h('section', {key: index, style: panel},
        field(t('team.stepRole', index + 1), h('select', {'aria-label': t('team.stepRole', index + 1), value: step.role, disabled: busy, style: selectStyle, onChange: e => update(index, 'role', e.target.value)},
          ...['technical', 'business', 'memory'].map(role => h('option', {key: role, value: role}, roleLabel(role))))),
        h('p', null, routeText(project.team?.[step.role])),
        field(t('team.stepResult', index + 1), h(Textarea, {value: step.goal, maxLength: 16000, disabled: busy, onChange: e => update(index, 'goal', e.target.value)})),
        field(t('team.stepAcceptance', index + 1), h(Textarea, {value: step.acceptance, maxLength: 16000, disabled: busy, onChange: e => update(index, 'acceptance', e.target.value)})),
        h(Button, {disabled: busy, onClick: () => setSteps(previous => previous.filter((_, i) => i !== index))}, t('team.removeStep', index + 1)))),
      h(Button, {disabled: busy || steps.length >= 8, onClick: () => setSteps(previous => [...previous, {role: 'technical', goal: '', acceptance: ''}])}, t('team.addStep')),
      steps.length > 0 && h(Button, {disabled: busy || !plan.trim() || steps.some(step => !step.goal.trim() || !step.acceptance.trim() || !project.team?.[step.role]), onClick: () => perform(() => ctx.rest(`${path}/approve`, {method: 'POST', body: {plan, steps}}))}, t('team.approvePlan')),
    );
    const team = task.team;
    if (!team) return null;
    const resumable = ['ready', 'paused'].includes(team.status) && team.steps.every(step => !step.run_id || step.status === 'complete');
    return h('section', {style: panel},
      h('strong', null, t('team.approvedTeam', stateLabel(team.status))),
      team.note && h('p', {role: 'status'}, team.note),
      ...team.steps.map((step, index) => h('div', {key: index, style: stack},
        h('strong', null, `${index + 1}. ${roleLabel(step.role)} — ${step.goal}`),
        h('span', null, t('team.criteria', step.acceptance)),
        h('span', null, routeText(step)), h('span', null, stateLabel(step.status)))),
      h('p', null, t('team.separateReviewer')),
      resumable && h(Button, {disabled: busy || !coordinator, onClick: () => setConfirm(true)}, team.status === 'ready' ? t('team.start') : t('team.resume')),
      team.status === 'running' && h(Button, {disabled: busy || !coordinator, onClick: () => perform(() => coordinator.pause(ids))}, t('team.pause')),
      confirm && h('section', {role: 'dialog', 'aria-label': t('team.startDialog'), style: panel},
        h('strong', null, t('team.project', project.name)), h('p', null, project.directory),
        h('p', null, t('team.startDescription')),
        h('div', {style: row}, h(Button, {disabled: busy, onClick: () => perform(async () => {setConfirm(false); await coordinator.start(ids);})}, t('team.confirmStart')),
          h(Button, {disabled: busy, onClick: () => setConfirm(false)}, t('team.doNotStart')))),
    );
  }
  return {TeamSettings, TaskTeam};
}
