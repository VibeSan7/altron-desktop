const roles = {altron: 'Altron — требования и план', technical: 'Техническая работа', business: 'Исследования и бизнес', memory: 'Решения и документация', reviewer: 'Отдельная проверка'};
const states = {blocked: 'Шаг не начат: файлы предыдущего шага не подтверждены', ready: 'Ожидает запуска', running: 'Команда работает', paused: 'На паузе', unknown: 'Состояние не подтверждено — повтор запрещён', failed: 'Остановлено с ошибкой', review: 'Все шаги переданы — нужна приёмка', done: 'Принято пользователем', pending: 'Ещё не начат', prepared: 'Подготовлен', reported: 'Файлы переданы, ожидается завершение', complete: 'Шаг завершён', cancel_requested: 'Запрошена остановка'};
const stack = {display: 'grid', gap: 10};
const row = {display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center'};
const panel = {...stack, padding: 12, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8};
const selectStyle = {color: 'inherit', background: 'var(--ui-background)', padding: 8};

export function createTeamViews(React, sdk, ctx, coordinator) {
  const {createElement: h, useEffect, useState} = React;
  const {Button, Input, Textarea} = sdk;
  const field = (name, control) => h('label', {style: stack}, h('span', null, name), React.cloneElement(control, {'aria-label': name}));
  const routeText = route => route?.model && route?.provider ? `${route.provider} / ${route.model}${route.specialist?.name ? ` · ${route.specialist.name}` : ''}` : 'Модель для роли не назначена';

  function TeamSettings({project, perform, busy, model, provider, catalog}) {
    const saved = JSON.stringify(project.team || {});
    const [routes, setRoutes] = useState(() => JSON.parse(saved));
    useEffect(() => setRoutes(JSON.parse(saved)), [saved]);
    const change = (role, key, value) => setRoutes(previous => ({...previous, [role]: {...previous[role], [key]: value}}));
    const assignments = Object.fromEntries(Object.entries(routes).filter(([, route]) => route.model || route.provider || route.specialist).map(([role, route]) => [role, {model: route.model || '', provider: route.provider || '', specialist: route.specialist || null}]));
    const valid = Object.values(assignments).every(route => route.model.trim() && route.provider.trim());
    return h('details', {style: panel}, h('summary', null, 'Состав команды'),
      h('p', null, 'Роли и подключения сохраняются для этого проекта. Пустые роли не запускаются. Здесь нет работающих круглосуточно моделей. Изменение состава не меняет уже согласованные планы.'),
      h(Button, {disabled: busy || !model || !provider, onClick: () => setRoutes(previous => ({...previous, ...Object.fromEntries(['altron', 'technical', 'business', 'memory'].map(role => [role, {...previous[role], model, provider}]))}))}, 'Назначить выбранное подключение всем ролям, кроме проверяющего'),
      ...Object.entries(roles).map(([role, label]) => h('section', {key: role, style: panel}, h('strong', null, label),
        field(`Модель — ${label}`, h(Input, {value: routes[role]?.model || '', maxLength: 300, disabled: busy, onChange: e => change(role, 'model', e.target.value)})),
        field(`Провайдер — ${label}`, h(Input, {value: routes[role]?.provider || '', maxLength: 100, disabled: busy, onChange: e => change(role, 'provider', e.target.value)})),
        field(`Инструкции — ${label}`, h('select', {'aria-label': `Инструкции — ${label}`, value: routes[role]?.specialist || '', disabled: busy, style: selectStyle, onChange: e => change(role, 'specialist', e.target.value)},
          h('option', {value: ''}, 'Основная роль Altron'),
          ...(catalog?.specialists || []).filter(s => s.role === role).map(s => h('option', {key: s.id, value: s.id}, s.name)))),
        routes[role]?.specialist && h('p', null, 'Выбраны адаптированные инструкции agency-agents. Они не дают новых доступов и не заменяют согласование.'),
        h(Button, {disabled: busy, onClick: () => setRoutes(previous => {const next = {...previous}; delete next[role]; return next;})}, `Убрать назначение — ${label}`))),
      !valid && h('p', {role: 'status'}, 'Для каждой назначенной роли нужны и модель, и провайдер.'),
      h(Button, {disabled: busy || !valid, onClick: () => perform(() => ctx.rest(`/projects/${project.id}/team`, {method: 'POST', body: {assignments}}))}, 'Сохранить состав команды'),
      catalog?.source_commit && h('p', {style: {overflowWrap: 'anywhere'}}, `Инструкции зафиксированы: ${catalog.source_commit}. Лицензия MIT; источники и изменения — в THIRD_PARTY_NOTICES.md.`),
    );
  }

  function TaskTeam({task, project, plan, steps, setSteps, perform, busy}) {
    const [confirm, setConfirm] = useState(false);
    const ids = {projectId: project.id, taskId: task.id};
    const path = `/projects/${project.id}/tasks/${task.id}/team`;
    if (!task.team && task.status !== 'draft') return null;
    const update = (index, key, value) => setSteps(previous => previous.map((step, i) => i === index ? {...step, [key]: value} : step));
    if (task.status === 'draft') return h('details', {style: panel, open: steps.length > 0}, h('summary', null, 'Последовательность специалистов'),
      h('p', null, 'Необязательно: разбейте план на шаги. Altron передаст проверенные файлы следующему исполнителю после завершения предыдущего. Проверяющий запускается отдельно.'),
      ...steps.map((step, index) => h('section', {key: index, style: panel},
        field(`Роль шага ${index + 1}`, h('select', {'aria-label': `Роль шага ${index + 1}`, value: step.role, disabled: busy, style: selectStyle, onChange: e => update(index, 'role', e.target.value)},
          ...['technical', 'business', 'memory'].map(role => h('option', {key: role, value: role}, roles[role])))),
        h('p', null, routeText(project.team?.[step.role])),
        field(`Результат шага ${index + 1}`, h(Textarea, {value: step.goal, maxLength: 16000, disabled: busy, onChange: e => update(index, 'goal', e.target.value)})),
        field(`Критерии шага ${index + 1}`, h(Textarea, {value: step.acceptance, maxLength: 16000, disabled: busy, onChange: e => update(index, 'acceptance', e.target.value)})),
        h(Button, {disabled: busy, onClick: () => setSteps(previous => previous.filter((_, i) => i !== index))}, `Убрать шаг ${index + 1}`))),
      h(Button, {disabled: busy || steps.length >= 8, onClick: () => setSteps(previous => [...previous, {role: 'technical', goal: '', acceptance: ''}])}, 'Добавить шаг'),
      steps.length > 0 && h(Button, {disabled: busy || !plan.trim() || steps.some(step => !step.goal.trim() || !step.acceptance.trim() || !project.team?.[step.role]), onClick: () => perform(() => ctx.rest(`${path}/approve`, {method: 'POST', body: {plan, steps}}))}, 'Согласовать командный план'),
    );
    const team = task.team;
    if (!team) return null;
    const resumable = ['ready', 'paused'].includes(team.status) && team.steps.every(step => !step.run_id || step.status === 'complete');
    return h('section', {style: panel},
      h('strong', null, `Согласованная команда: ${states[team.status] || team.status}`),
      team.note && h('p', {role: 'status'}, team.note),
      ...team.steps.map((step, index) => h('div', {key: index, style: stack},
        h('strong', null, `${index + 1}. ${roles[step.role]} — ${step.goal}`),
        h('span', null, `Критерии: ${step.acceptance}`),
        h('span', null, routeText(step)), h('span', null, states[step.status] || step.status))),
      h('p', null, 'Проверяющий запускается отдельным подтверждением. Итоговую работу принимает пользователь, а не команда.'),
      resumable && h(Button, {disabled: busy || !coordinator, onClick: () => setConfirm(true)}, team.status === 'ready' ? 'Запустить согласованную команду' : 'Продолжить после паузы'),
      team.status === 'running' && h(Button, {disabled: busy || !coordinator, onClick: () => perform(() => coordinator.pause(ids))}, 'Приостановить команду и запросить остановку'),
      confirm && h('section', {role: 'dialog', 'aria-label': 'Подтверждение запуска команды', style: panel},
        h('strong', null, `Проект: ${project.name}`), h('p', null, project.directory),
        h('p', null, 'Будут последовательно выполнены только показанные выше шаги на указанных моделях. Возможны расходы вашего провайдера. При ошибке или смене профиля продолжение остановится; скрытых повторов нет.'),
        h('div', {style: row}, h(Button, {disabled: busy, onClick: () => perform(async () => {setConfirm(false); await coordinator.start(ids);})}, 'Подтверждаю запуск команды'),
          h(Button, {disabled: busy, onClick: () => setConfirm(false)}, 'Не запускать'))),
    );
  }
  return {TeamSettings, TaskTeam};
}
