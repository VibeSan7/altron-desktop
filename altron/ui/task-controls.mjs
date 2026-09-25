import {defaultLocalizer} from './i18n.mjs';

export const runUnsettled = run => !run.terminal_status && !(run.status === 'failed' && !run.runtime_id);

export function createTaskControls(React, {Button, Textarea}, ctx, localizer = defaultLocalizer) {
  const {createElement: h, useState} = React;
  const stack = {display: 'grid', gap: 10};
  const panel = {...stack, padding: 12, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8};
  return function TaskControls({task, runs, path, perform, busy}) {
    const {t} = localizer.useI18n();
    const [action, setAction] = useState(null);
    const [feedback, setFeedback] = useState('');
    const unsettled = runs.some(runUnsettled);
    const revise = ['review', 'done', 'failed', 'interrupted', 'cancelled'].includes(task.status);
    const cancel = ['draft', 'approved', 'failed', 'interrupted', 'team_waiting', 'unknown'].includes(task.status);
    const archive = ['done', 'cancelled', 'failed', 'interrupted'].includes(task.status);
    const submit = () => perform(async () => {
      await ctx.rest(`${path}/${action}`, {method: 'POST', body: action === 'recover' ? {confirm: true} : action === 'revise' ? {feedback, confirm: true} : {reason: feedback, confirm: true}});
      setAction(null); setFeedback('');
    });
    return h('section', {style: stack},
      h('small', null, t('taskControls.attempt', task.attempt || 1, Boolean(task.archived))),
      task.feedback && h('p', {style: {whiteSpace: 'pre-wrap'}}, t('taskControls.revisionFeedback', task.feedback)),
      task.cancellation && h('p', null, t('taskControls.cancellationReason', task.cancellation.reason)),
      unsettled && h('p', {role: 'status'}, t('taskControls.unsettled')),
      !task.archived && h('div', {style: {display: 'flex', gap: 8, flexWrap: 'wrap'}},
        cancel && h(Button, {disabled: busy || unsettled, onClick: () => setAction('cancel')}, t('taskControls.cancel')),
        revise && h(Button, {disabled: busy || unsettled, onClick: () => setAction('revise')}, t('taskControls.revise')),
        (unsettled || ['unknown', 'team_waiting'].includes(task.status)) && h(Button, {disabled: busy, onClick: () => setAction('recover')}, t('taskControls.recover'))),
      archive && h(Button, {disabled: busy || unsettled, onClick: () => perform(() => ctx.rest(`${path}/archive`, {method: 'POST', body: {archived: !task.archived}}))}, task.archived ? t('taskControls.restoreArchive') : t('taskControls.archive')),
      action && h('section', {role: 'dialog', 'aria-label': t('taskControls.dialogLabel'), style: panel},
        h('p', null, action === 'recover' ? t('taskControls.recoverDescription') : action === 'revise' ? t('taskControls.reviseDescription') : t('taskControls.cancelDescription')),
        action !== 'recover' && h('label', {style: stack}, h('span', null, action === 'revise' ? t('taskControls.whatToFix') : t('taskControls.cancelReason')),
          h(Textarea, {'aria-label': action === 'revise' ? t('taskControls.whatToFix') : t('taskControls.cancelReason'), value: feedback, rows: 3, maxLength: action === 'revise' ? 16000 : 2000, disabled: busy, onChange: e => setFeedback(e.target.value)})),
        h(Button, {disabled: busy || (action !== 'recover' && !feedback.trim()), onClick: submit}, t('taskControls.confirmChange')),
        h(Button, {disabled: busy, onClick: () => setAction(null)}, t('taskControls.leaveUnchanged'))),
      task.recovery && h('p', {role: 'status'}, task.recovery.active_runs.length ? t('taskControls.recoveryActive') : t('taskControls.recoveryDone')),
      task.attempts?.length > 0 && h('details', {style: panel}, h('summary', null, t('taskControls.attemptHistory')),
        h('p', null, t('taskControls.historyDescription')),
        ...task.attempts.map(previous => h('section', {key: previous.attempt, style: panel},
          h('strong', null, t('taskControls.previousAttempt', previous.attempt)),
          ...['plan', 'feedback', 'summary'].filter(key => previous[key]).map(key => h('p', {key, style: {whiteSpace: 'pre-wrap'}}, previous[key])),
          previous.acceptance_review && h('p', null, t('taskControls.acceptance', previous.acceptance_review.text)),
          ...(previous.artifacts || []).map(file => h('code', {key: file.path, style: {overflowWrap: 'anywhere'}}, `${file.path} · ${file.sha256}`))))));
  };
}
