export const runUnsettled = run => !run.terminal_status && !(run.status === 'failed' && !run.runtime_id);

export function createTaskControls(React, {Button, Textarea}, ctx) {
  const {createElement: h, useState} = React;
  const stack = {display: 'grid', gap: 10};
  const panel = {...stack, padding: 12, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8};
  return function TaskControls({task, runs, path, perform, busy}) {
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
      h('small', null, `Попытка ${task.attempt || 1}${task.archived ? ' · В архиве' : ''}`),
      task.feedback && h('p', {style: {whiteSpace: 'pre-wrap'}}, `Замечания к доработке: ${task.feedback}`),
      task.cancellation && h('p', null, `Причина отмены: ${task.cancellation.reason}`),
      unsettled && h('p', {role: 'status'}, 'Выполнение ещё не подтверждено как завершённое. Отмена задачи, новая попытка, архив и приёмка заблокированы. Запросите остановку работающего исполнителя или проверьте состояние после сбоя.'),
      !task.archived && h('div', {style: {display: 'flex', gap: 8, flexWrap: 'wrap'}},
        cancel && h(Button, {disabled: busy || unsettled, onClick: () => setAction('cancel')}, 'Отменить задачу'),
        revise && h(Button, {disabled: busy || unsettled, onClick: () => setAction('revise')}, 'Вернуть на доработку'),
        (unsettled || ['unknown', 'team_waiting'].includes(task.status)) && h(Button, {disabled: busy, onClick: () => setAction('recover')}, 'Проверить и восстановить состояние')),
      archive && h(Button, {disabled: busy || unsettled, onClick: () => perform(() => ctx.rest(`${path}/archive`, {method: 'POST', body: {archived: !task.archived}}))}, task.archived ? 'Вернуть из архива' : 'Убрать в архив'),
      action && h('section', {role: 'dialog', 'aria-label': 'Подтверждение изменения задачи', style: panel},
        h('p', null, action === 'recover' ? 'Altron проверит работающие сеансы Hermes и закроет только неработающий старый запуск. Активного исполнителя это действие не останавливает. Новое задание не отправляется; при недоступной проверке блокировка остаётся.' : action === 'revise' ? 'История, прежний отчёт и список файлов сохранятся. Новая попытка останется черновиком до нового согласования и подтверждения запуска.' : 'План и история сохранятся. Выполнение этой задачи больше не будет ожидаться.'),
        action !== 'recover' && h('label', {style: stack}, h('span', null, action === 'revise' ? 'Что исправить' : 'Причина отмены'),
          h(Textarea, {'aria-label': action === 'revise' ? 'Что исправить' : 'Причина отмены', value: feedback, rows: 3, maxLength: action === 'revise' ? 16000 : 2000, disabled: busy, onChange: e => setFeedback(e.target.value)})),
        h(Button, {disabled: busy || (action !== 'recover' && !feedback.trim()), onClick: submit}, 'Подтверждаю изменение задачи'),
        h(Button, {disabled: busy, onClick: () => setAction(null)}, 'Оставить без изменений')),
      task.recovery && h('p', {role: 'status'}, task.recovery.active_runs.length ? 'Hermes всё ещё выполняет работу. Повторный запуск не выполнялся.' : 'Сверка завершена. Автоматического продолжения нет; выберите дальнейшее действие.'),
      task.attempts?.length > 0 && h('details', {style: panel}, h('summary', null, 'История попыток'),
        h('p', null, 'Сохранены прежние планы, замечания, отчёты и контрольные суммы. Файлы в рабочей папке могут быть изменены следующей попыткой; это не система версий файлов.'),
        ...task.attempts.map(previous => h('section', {key: previous.attempt, style: panel},
          h('strong', null, `Попытка ${previous.attempt}`),
          ...['plan', 'feedback', 'summary'].filter(key => previous[key]).map(key => h('p', {key, style: {whiteSpace: 'pre-wrap'}}, previous[key])),
          previous.acceptance_review && h('p', null, `Приёмка: ${previous.acceptance_review.text}`),
          ...(previous.artifacts || []).map(file => h('code', {key: file.path, style: {overflowWrap: 'anywhere'}}, `${file.path} · ${file.sha256}`))))));
  };
}
