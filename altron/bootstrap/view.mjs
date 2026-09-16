import {createMaintenanceView} from '../ui/maintenance-view.mjs';

export function createBootstrapView(React, sdk, ctx) {
  const {createElement: h, useState, useMemo} = React;
  function PendingPlans({target, scope, gateway}) {
    const [selected, setSelected] = useState(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const request = (route, options) => {
      if (sdk.host.state.connectionId.get() !== scope[0] || sdk.host.state.profile.get() !== scope[1]) throw new Error('Source changed');
      return ctx.rest(`/targets/${encodeURIComponent(target)}/maintenance/pending-plans${route}`, options);
    };
    const plans = sdk.useQuery({queryKey: ['altron-maintenance', ...scope, target, 'pending-plans'], queryFn: () => request(''), enabled: gateway === 'open', retry: false});
    return h('section', {style: {display: 'grid', gap: 10}},
      h('h2', null, 'Согласованные планы, которые ещё не запускались'),
      h('p', null, 'В старой версии они могут блокировать обновление. Можно явно отменить выбранный план: его текст и история сохранятся. Это не остановка работающего задания и не обход защиты.'),
      (plans.error || error) && h('p', {role: 'alert'}, error || 'Список планов не подтверждён. Обновление не разблокировано.'),
      plans.data?.plans.length === 0 && h('p', null, 'Незапущенных командных планов нет.'),
      ...(plans.data?.plans || []).map(plan => h('section', {key: plan.task_id},
        h('strong', null, `${plan.project_name}: ${plan.goal}`),
        h('p', {style: {whiteSpace: 'pre-wrap'}}, plan.plan),
        h(sdk.Button, {disabled: busy || gateway !== 'open', onClick: () => {setSelected(plan); setReason('');}}, 'Отменить этот незапущенный план'))),
      selected && h('section', {role: 'dialog', 'aria-label': 'Отмена старого плана'},
        h('p', null, `Профиль: ${target}. Проект: ${selected.project_name}. Задача: ${selected.goal}. Новое задание не отправляется.`),
        h(sdk.Textarea, {'aria-label': 'Причина отмены старого плана', value: reason, maxLength: 2000, disabled: busy, onChange: event => setReason(event.target.value)}),
        h(sdk.Button, {disabled: busy || !reason.trim() || gateway !== 'open', onClick: async () => {
          setBusy(true); setError('');
          try {
            await request(`/${selected.project_id}/${selected.task_id}/cancel`, {method: 'POST', body: {reason, confirm: true, closed_other_windows: true}});
            setSelected(null); await plans.refetch();
          } catch {setError('Отмена не подтверждена. Если план уже запускался, эта операция запрещена; не удаляйте его записи вручную.');}
          finally {setBusy(false);}
        }}, 'Подтверждаю отмену старого плана'),
        h(sdk.Button, {disabled: busy, onClick: () => setSelected(null)}, 'Оставить старый план')));
  }
  function Panel({scope, gateway}) {
    const [target, setTarget] = useState('');
    const [closed, setClosed] = useState(false);
    const queryKey = ['altron-maintenance', ...scope];
    const targets = sdk.useQuery({queryKey, queryFn: () => ctx.rest('/targets'), enabled: gateway === 'open', retry: false});
    const Maintenance = useMemo(() => createMaintenanceView(React, sdk, {rest: (route, options) => {
      if (sdk.host.state.connectionId.get() !== scope[0] || sdk.host.state.profile.get() !== scope[1]) throw new Error('Source changed');
      const body = options?.body;
      const confirmed = route === '/maintenance/apply' || route === '/maintenance/rollback';
      return ctx.rest(`/targets/${encodeURIComponent(target)}${route}`, confirmed ? {...options, body: {...body, closed_other_windows: true}} : options);
    }}), [target, scope[0], scope[1]]);
    return h('main', {style: {padding: 24, display: 'grid', gap: 16}},
      h('h1', null, 'Обновление существующего Altron'),
      h('p', null, 'Эта панель переносит установленный Altron на новую версию без повторного импорта его профиля. Подключения, проекты и история не заменяются. ИИ не запускается.'),
      h('p', null, 'Перед обслуживанием завершите задания и полностью закройте остальные окна Hermes. Откройте только профиль altron-maintenance. Интерфейс Altron общий для профилей этого компьютера.'),
      targets.error && h('p', {role: 'alert'}, 'Выберите профиль обслуживания altron-maintenance. Не удалось получить список установок.'),
      h('label', null, 'Профиль для обновления', h('select', {'aria-label': 'Профиль для обновления', value: target, onChange: e => {setTarget(e.target.value); setClosed(false);}},
        h('option', {value: ''}, 'Выберите профиль'),
        ...(targets.data?.profiles || []).map(name => h('option', {key: name, value: name}, name)))),
      targets.data?.profiles?.length === 0 && h('p', null, 'Не найден существующий Altron с базой проектов. Для новой установки импортируйте основной пакет Altron.'),
      h('label', null, h('input', {type: 'checkbox', checked: closed, onChange: e => setClosed(e.target.checked)}), 'Я полностью закрыл остальные окна Hermes'),
      target && closed && h(PendingPlans, {key: `plans-${target}`, target, scope, gateway}),
      target && closed && h(Maintenance, {key: target, queryKey: [...queryKey, target], gateway}));
  }
  return function Bootstrap() {
    const connection = sdk.useValue(sdk.host.state.connectionId);
    const profile = sdk.useValue(sdk.host.state.profile);
    const gateway = sdk.useValue(sdk.host.state.gateway);
    return h(Panel, {key: JSON.stringify([connection, profile]), scope: [connection, profile], gateway});
  };
}
