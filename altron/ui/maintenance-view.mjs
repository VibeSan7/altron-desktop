import {defaultLocalizer} from './i18n.mjs';

const errorCodes = ['active_operations', 'archive_checksum_mismatch', 'invalid_archive_path', 'lock_exists', 'code_changed', 'backup_invalid', 'database_incompatible', 'recovery_required'];

export function createMaintenanceView(React, sdk, ctx, localizer = defaultLocalizer) {
  const {createElement: h, useState, useEffect, useRef} = React;
  const {Button, Input, useQuery, useQueryClient} = sdk;
  const grid = {display: 'grid', gap: 10};
  return function Maintenance({queryKey, gateway}) {
    const {t} = localizer.useI18n();
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
          if (result.requires_restart) sdk.host.notify({kind: 'info', message: t('maintenance.restartNotice')});
        }
      } catch (failure) {
        if (live.current) {
          const code = errorCodes.find(value => String(failure?.message).includes(value));
          setError(code ? t(`maintenance.errors.${code}`) : t('maintenance.genericError'));
        }
      } finally {
        if (live.current) {setBusy(false); await cache.invalidateQueries({queryKey});}
      }
    };
    const field = (label, value, change) => h('label', {style: grid}, h('span', null, label), h(Input, {'aria-label': label, value, disabled: busy, onChange: e => {change(e.target.value); setStage(null);}, maxLength: 4096}));
    const blocked = busy || gateway !== 'open' || !state.data || state.data.requires_restart || state.data.status === 'recovery_required';
    return h('details', {style: {...grid, padding: 16, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 10}},
      h('summary', null, t('maintenance.title')),
      h('p', null, t('maintenance.description')),
      h('p', null, t('maintenance.scopeDescription')),
      state.data && h('p', {role: 'status'}, t(`maintenance.states.${state.data.status}`) || t('maintenance.stateUnknown')),
      state.error && h('p', {role: 'alert'}, t('maintenance.unavailable')),
      state.data?.requires_restart && h('p', {role: 'alert'}, t('maintenance.restartRequired')),
      error && h('p', {role: 'alert'}, error),
      field(t('maintenance.archivePath'), archive, setArchive),
      field(t('maintenance.checksum'), sha256, setSha256),
      h(Button, {disabled: blocked || !archive.trim() || !/^[0-9a-f]{64}$/.test(sha256), onClick: () => perform('stage', {archive_path: archive, sha256})}, t('maintenance.verifyPackage')),
      stage && h('section', {style: grid}, h('strong', null, t('maintenance.packageVerified', stage.version)), h('p', null, t('maintenance.codeFiles', stage.files.length)), h(Button, {disabled: blocked, onClick: () => setConfirm('apply')}, t('maintenance.install'))),
      state.data?.backup_id && h(Button, {disabled: busy || gateway !== 'open', onClick: () => setConfirm('rollback')}, t('maintenance.rollback')),
      confirm && h('section', {role: 'dialog', 'aria-label': t('maintenance.confirmDialog'), style: grid},
        h('p', null, confirm === 'apply' ? t('maintenance.installQuestion') : t('maintenance.rollbackQuestion')),
        h(Button, {disabled: busy, onClick: () => perform(confirm, confirm === 'apply' ? {stage_id: stage.id, confirm: true} : {confirm: true})}, t('maintenance.confirm')),
        h(Button, {disabled: busy, onClick: () => setConfirm(null)}, t('maintenance.cancel'))),
    );
  };
}
