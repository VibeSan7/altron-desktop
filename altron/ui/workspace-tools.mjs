export const demoTask = {
  goal: 'Создать в папке проекта автономную страницу index.html: понятный заголовок, список трёх услуг и кнопку, показывающую контактную информацию. Без внешних библиотек, сети и публикации.',
  acceptance: 'Открыть index.html в браузере. Проверить заголовок, три услуги, нажатие кнопки и отсутствие ошибок в консоли. Описать выполненные проверки и ограничения в CHECKS.md.',
};

export async function loadConnections(rpc, profile) {
  const [config, inventory] = await Promise.all([
    rpc('config.get', {key: 'provider', profile}), rpc('model.options', {profile}),
  ]);
  const providers = (config.providers || []).map(p => ({id: p.id, label: p.label, authenticated: p.authenticated === true,
    models: [...new Set((inventory.providers || []).find(row => row.slug === p.id)?.models || [])],
  }));
  const current = {model: config.model || '', provider: config.provider || ''};
  const selected = providers.find(p => p.id === current.provider);
  if (selected && current.model && !selected.models.includes(current.model)) selected.models.unshift(current.model);
  return {current, providers};
}

export function projectSummary(project) {
  const visible = project.tasks.filter(task => !task.archived);
  return {active: visible.filter(t => !['done', 'cancelled'].includes(t.status)).length,
    archived: project.tasks.length - visible.length, review: visible.filter(t => t.status === 'review').length,
    blocked: visible.filter(t => ['unknown', 'failed', 'interrupted', 'cancel_requested'].includes(t.status)).length,
    done: visible.filter(t => t.status === 'done').length};
}

export function usageText(usage = {}) {
  const tokens = Number.isFinite(usage.input) && Number.isFinite(usage.output) ? `Токены (части текста): ${usage.input} вход / ${usage.output} выход. ` : '';
  if (!Number.isFinite(usage.cost_usd) || !['known', 'estimated'].includes(usage.cost_status)) return `${tokens}Стоимость неизвестна: Hermes не предоставил подтверждённую сумму.`;
  return `${tokens}Стоимость: $${usage.cost_usd.toFixed(4)}${usage.cost_status === 'estimated' ? ' — оценка Hermes, не счёт провайдера' : ' — по данным Hermes'}.`;
}

export function elapsedText(run, now = Date.now()) {
  const end = run.finished_at ? Date.parse(run.finished_at) : now;
  const seconds = Math.max(0, Math.floor((end - Date.parse(run.created_at)) / 1000));
  return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)} мин ${seconds % 60} с` : 'Время неизвестно';
}

export function createWorkspaceTools(React, sdk, ctx) {
  const {createElement: h, useEffect, useRef, useState} = React;
  const {Button, Input, useQuery, host} = sdk;
  const stack = {display: 'grid', gap: 10};
  const panel = {...stack, padding: 12, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8};
  const selectStyle = {color: 'inherit', background: 'var(--ui-background)', padding: 8};
  const field = (label, input) => h('label', {style: stack}, h('span', null, label), React.cloneElement(input, {'aria-label': label}));

  function Connections({profile, queryKey, gateway, model, provider, setModel, setProvider, busy}) {
    const query = useQuery({queryKey: [...queryKey, 'connections'], queryFn: () => loadConnections((...args) => host.request(...args), profile), enabled: gateway === 'open', retry: false});
    const providers = query.data?.providers || [];
    const selected = providers.find(p => p.id === provider);
    const current = query.data?.current;
    return h('section', {style: panel}, h('h3', null, 'Подключение ИИ для следующего запуска'),
      h('p', null, 'Используются ваши подключения Hermes. Ключи и пароли сюда не вводятся. Выбор здесь не меняет настройки других диалогов.'),
      query.error && h('p', {role: 'status'}, 'Не удалось прочитать каталог. Проверьте подключение Hermes или задайте известные вам значения вручную.'),
      field('Настроенное подключение', h('select', {value: selected ? provider : '', disabled: busy, style: selectStyle, onChange: e => {setProvider(e.target.value); setModel('');}},
        h('option', {value: ''}, 'Выберите подключение'), ...providers.map(p => h('option', {key: p.id, value: p.id, disabled: !p.authenticated}, `${p.label}${p.authenticated ? '' : ' — требуется вход в Hermes'}`)))),
      field('Модель из каталога', h('select', {value: selected?.models.includes(model) ? model : '', disabled: busy || !selected?.authenticated, style: selectStyle, onChange: e => setModel(e.target.value)},
        h('option', {value: ''}, 'Выберите модель'), ...(selected?.models || []).map(name => h('option', {key: name, value: name}, name)))),
      h(Button, {disabled: busy || !current?.model || !providers.some(p => p.id === current?.provider && p.authenticated), onClick: () => {setModel(current.model); setProvider(current.provider);}}, 'Использовать текущее подключение Hermes'),
      h('p', {role: 'status'}, selected?.authenticated && model ? 'Настройки выбраны. Запрос к модели не отправлялся; работоспособность ответа проверится при подтверждённом запуске.' : 'Выберите подключение и модель. Если вход ещё не настроен: Settings → Model в Hermes. Запрос к модели не отправлялся.'),
      h('details', null, h('summary', null, 'Расширенный ручной ввод'),
        field('Модель', h(Input, {value: model, maxLength: 300, disabled: busy, onChange: e => setModel(e.target.value)})),
        field('Провайдер', h(Input, {value: provider, maxLength: 100, disabled: busy, onChange: e => setProvider(e.target.value)}))),
      h(Button, {disabled: busy || gateway !== 'open', onClick: () => query.refetch?.()}, 'Проверить настройки подключения'));
  }

  function FolderPicker({directory, onChoose, busy}) {
    const [listing, setListing] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [name, setName] = useState('');
    const live = useRef(true);
    useEffect(() => {live.current = true; return () => {live.current = false;};}, []);
    const browse = async path => {
      setLoading(true); setError('');
      try {const data = await ctx.rest(`/folders?path=${encodeURIComponent(path || '')}`); if (live.current) setListing(data);}
      catch {if (live.current) setError('Папка недоступна. Можно указать полный путь в поле проекта.');}
      finally {if (live.current) setLoading(false);}
    };
    return h('div', {style: stack},
      h(Button, {type: 'button', disabled: busy || loading, onClick: () => browse(directory)}, 'Выбрать папку'),
      error && h('p', {role: 'alert'}, error),
      listing && h('section', {role: 'dialog', 'aria-label': 'Выбор папки проекта', style: panel},
        h('strong', null, listing.path), h('p', null, 'Показаны только папки на компьютере, где работает выбранный Hermes; содержимое файлов не читается.'),
        h(Button, {type: 'button', disabled: loading || !listing.parent, onClick: () => browse(listing.parent)}, 'На уровень выше'),
        h('div', {style: {...stack, maxHeight: 250, overflow: 'auto'}}, ...listing.directories.map(entry => h(Button, {key: entry.path, type: 'button', disabled: loading, onClick: () => browse(entry.path)}, entry.name))),
        field('Имя новой папки', h(Input, {value: name, maxLength: 120, disabled: loading, onChange: e => setName(e.target.value)})),
        h(Button, {type: 'button', disabled: loading || !name.trim(), onClick: async () => {
          setLoading(true); setError('');
          try {const created = await ctx.rest('/folders', {method: 'POST', body: {parent: listing.path, name}}); if (live.current) {onChoose(created.path); setListing(null); setName('');}}
          catch {if (live.current) setError('Не удалось создать папку. Проверьте имя, права и наличие папки с таким именем.');}
          finally {if (live.current) setLoading(false);}
        }}, 'Создать и выбрать папку'),
        h(Button, {type: 'button', disabled: loading, onClick: () => {onChoose(listing.path); setListing(null);}}, 'Выбрать эту папку'),
        h(Button, {type: 'button', disabled: loading, onClick: () => setListing(null)}, 'Закрыть выбор папки')));
  }

  function Diagnostics({perform = work => work(), busy = false}) {
    const [report, setReport] = useState(null);
    return h('details', {style: panel}, h('summary', null, 'Помощь и безопасная диагностика'),
      h('p', null, 'Отчёт без путей и содержимого задач: только версии, система и количество состояний. Он никуда не отправляется автоматически.'),
      h(Button, {disabled: busy, onClick: () => perform(async () => setReport(await ctx.rest('/diagnostics')))}, 'Составить диагностический отчёт'),
      report && h(React.Fragment, null, h('pre', {style: {whiteSpace: 'pre-wrap'}}, JSON.stringify(report, null, 2)),
        h(Button, {disabled: busy, onClick: () => perform(() => ctx.os.writeClipboard(JSON.stringify(report, null, 2)))}, 'Скопировать проверенный отчёт')),
      h('a', {href: 'https://github.com/VibeSan7/altron-desktop/issues/new?template=bug_report.yml', target: '_blank', rel: 'noreferrer'}, 'Сообщить о проблеме на GitHub'));
  }
  return {Connections, FolderPicker, Diagnostics};
}
