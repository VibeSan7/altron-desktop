import {createMaintenanceView} from '../ui/maintenance-view.mjs';

export function createBootstrapView(React, sdk, ctx) {
  const {createElement: h, useState, useMemo} = React;
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
      h('p', null, 'Эта панель переносит установленный Altron 0.2 на новую версию без повторного импорта его профиля. Подключения, проекты и история не заменяются. ИИ не запускается.'),
      h('p', null, 'Перед обслуживанием завершите задания и полностью закройте остальные окна Hermes. Откройте только профиль altron-maintenance. Интерфейс Altron общий для профилей этого компьютера.'),
      targets.error && h('p', {role: 'alert'}, 'Выберите профиль обслуживания altron-maintenance. Не удалось получить список установок.'),
      h('label', null, 'Профиль для обновления', h('select', {'aria-label': 'Профиль для обновления', value: target, onChange: e => {setTarget(e.target.value); setClosed(false);}},
        h('option', {value: ''}, 'Выберите профиль'),
        ...(targets.data?.profiles || []).map(name => h('option', {key: name, value: name}, name)))),
      targets.data?.profiles?.length === 0 && h('p', null, 'Не найден существующий Altron с базой проектов. Для новой установки импортируйте основной пакет Altron.'),
      h('label', null, h('input', {type: 'checkbox', checked: closed, onChange: e => setClosed(e.target.checked)}), 'Я полностью закрыл остальные окна Hermes'),
      target && closed && h(Maintenance, {key: target, queryKey: [...queryKey, target], gateway}));
  }
  return function Bootstrap() {
    const connection = sdk.useValue(sdk.host.state.connectionId);
    const profile = sdk.useValue(sdk.host.state.profile);
    const gateway = sdk.useValue(sdk.host.state.gateway);
    return h(Panel, {key: JSON.stringify([connection, profile]), scope: [connection, profile], gateway});
  };
}
