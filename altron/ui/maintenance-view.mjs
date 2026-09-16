const messages = {
  active_operations: 'Есть работающие, приостановленные или неподтверждённые запуски. Сначала завершите их; обновление не началось.',
  archive_checksum_mismatch: 'Контрольная сумма не совпала. Скачайте архив и SHA256SUMS.txt из одного выпуска.',
  invalid_archive_path: 'Не найден обычный файл архива по полному пути на этом компьютере.',
  lock_exists: 'Обслуживание заблокировано другой или прерванной операцией. Автоматического снятия блокировки нет.',
  code_changed: 'Установленные файлы изменены после обновления. Возврат остановлен, ваши изменения не перезаписаны.',
  backup_invalid: 'Резервная копия повреждена. Возврат остановлен.',
  database_incompatible: 'Формат базы несовместим с этим кодом. Возврат остановлен без изменения файлов. После миграции нужен проверенный совместимый выпуск или отдельное восстановление полной резервной копии.',
  recovery_required: 'Предыдущая операция не завершена. Новые задания запрещены до восстановления.',
};
const states = {idle: 'Обновлений ещё не было', staged: 'Пакет проверен', applied: 'Обновление установлено', rolled_back: 'Предыдущий код восстановлен', recovery_required: 'Требуется восстановление'};

export function createMaintenanceView(React, sdk, ctx) {
  const {createElement: h, useState, useEffect, useRef} = React;
  const {Button, Input, useQuery, useQueryClient} = sdk;
  const grid = {display: 'grid', gap: 10};
  return function Maintenance({queryKey, gateway}) {
    const [archive, setArchive] = useState('');
    const [sha256, setSha256] = useState('');
    const [stage, setStage] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const live = useRef(true);
    useEffect(() => {live.current = true; return () => {live.current = false;};}, []);
    const cache = useQueryClient();
    const state = useQuery({queryKey: [...queryKey, 'maintenance'], queryFn: () => ctx.rest('/maintenance'), enabled: gateway === 'open', retry: false, refetchInterval: 5000});
    const perform = async (route, body) => {
      if (busy || !live.current) return;
      setBusy(true); setError(''); setConfirm(null);
      try {
        const result = await ctx.rest(`/maintenance/${route}`, {method: 'POST', body, timeoutMs: 60000});
        if (live.current) {
          setStage(route === 'stage' ? result : null);
          if (result.requires_restart) sdk.host.notify({kind: 'info', message: 'Altron: полностью закройте Hermes Desktop и откройте снова. До перезапуска новые задания заблокированы.'});
        }
      } catch (failure) {
        if (live.current) {
          const code = Object.keys(messages).find(value => String(failure?.message).includes(value));
          setError(code ? messages[code] : 'Пакет или операция не прошли проверку. Файлы не считаются обновлёнными. Проверьте архив выпуска и состояние обслуживания.');
        }
      } finally {
        if (live.current) {setBusy(false); await cache.invalidateQueries({queryKey});}
      }
    };
    const field = (label, value, change) => h('label', {style: grid}, h('span', null, label), h(Input, {'aria-label': label, value, disabled: busy, onChange: e => {change(e.target.value); setStage(null);}, maxLength: 4096}));
    const blocked = busy || gateway !== 'open' || !state.data || state.data.requires_restart || state.data.status === 'recovery_required';
    return h('details', {style: {...grid, padding: 16, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 10}},
      h('summary', null, 'Обслуживание Altron'),
      h('p', null, 'Скачайте архив Altron и SHA256SUMS.txt из одного проверенного выпуска GitHub. Обновление меняет код Altron, но не ваши проекты, подключения и настройки. Копия базы и старого кода создаётся до замены.'),
      h('p', null, 'Обслуживается выбранный сервер Hermes. Для обычной локальной установки это ваш компьютер. Код интерфейса общий для его профилей. Перед обновлением завершите работу во всех окнах Altron.'),
      state.data && h('p', {role: 'status'}, states[state.data.status] || 'Состояние не подтверждено'),
      state.error && h('p', {role: 'alert'}, 'Обслуживание недоступно в этом профиле. Проверьте установку пакета Altron.'),
      state.data?.requires_restart && h('p', {role: 'alert'}, 'Полностью закройте Hermes Desktop и откройте снова. Новые задания заблокированы до перезапуска.'),
      error && h('p', {role: 'alert'}, error),
      field('Полный путь к архиву Altron', archive, setArchive),
      field('Контрольная сумма SHA-256', sha256, setSha256),
      h(Button, {disabled: blocked || !archive.trim() || !/^[0-9a-f]{64}$/.test(sha256), onClick: () => perform('stage', {archive_path: archive, sha256})}, 'Проверить пакет'),
      stage && h('section', {style: grid}, h('strong', null, `Проверен пакет ${stage.version}`), h('p', null, `${stage.files.length} файлов кода. До подтверждения они не заменяются.`), h(Button, {disabled: blocked, onClick: () => setConfirm('apply')}, 'Установить проверенный пакет')),
      state.data?.backup_id && h(Button, {disabled: busy || gateway !== 'open', onClick: () => setConfirm('rollback')}, 'Вернуть предыдущий код'),
      confirm && h('section', {role: 'dialog', 'aria-label': 'Подтверждение обслуживания', style: grid},
        h('p', null, confirm === 'apply' ? 'Установить проверенный пакет? После замены потребуется полный перезапуск Hermes Desktop.' : 'Восстановить предыдущий код? Текущие проекты и база сохранятся. Потребуется полный перезапуск Hermes Desktop.'),
        h(Button, {disabled: busy, onClick: () => perform(confirm, confirm === 'apply' ? {stage_id: stage.id, confirm: true} : {confirm: true})}, 'Подтверждаю обслуживание'),
        h(Button, {disabled: busy, onClick: () => setConfirm(null)}, 'Отмена')),
    );
  };
}
