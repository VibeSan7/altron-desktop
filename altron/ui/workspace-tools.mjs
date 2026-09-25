import {defaultLocalizer, russianT} from './i18n.mjs';

export const demoTask = {
  goal: russianT('workspace.demoGoal'),
  acceptance: russianT('workspace.demoAcceptance'),
};

export const demoTaskFor = t => ({
  goal: t('workspace.demoGoal'),
  acceptance: t('workspace.demoAcceptance'),
});

export async function loadConnections(rpc, profile) {
  const inventory = await rpc('model.options', {profile, explicit_only: true, include_unconfigured: true});
  const current = {model: inventory.model || '', provider: inventory.provider || ''};
  const providers = (inventory.providers || []).map(p => ({
    id: current.provider && (p.slug === current.provider || p.name === current.provider || p.aliases?.includes(current.provider)) ? current.provider : p.slug,
    label: p.name, authenticated: p.authenticated === true, models: [...new Set(p.models || [])],
  }));
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

export function usageText(usage = {}, t = russianT) {
  const tokens = Number.isFinite(usage.input) && Number.isFinite(usage.output) ? t('workspace.usageTokens', usage.input, usage.output) : '';
  if (!Number.isFinite(usage.cost_usd) || !['known', 'estimated'].includes(usage.cost_status)) return t('workspace.costUnknown', tokens);
  return t('workspace.cost', tokens, usage.cost_usd.toFixed(4), usage.cost_status === 'estimated');
}

export function elapsedText(run, now = Date.now(), t = russianT) {
  const end = run.finished_at ? Date.parse(run.finished_at) : now;
  const seconds = Math.max(0, Math.floor((end - Date.parse(run.created_at)) / 1000));
  return Number.isFinite(seconds) ? t('workspace.elapsed', Math.floor(seconds / 60), seconds % 60) : t('workspace.timeUnknown');
}

export function createWorkspaceTools(React, sdk, ctx, localizer = defaultLocalizer) {
  const {createElement: h, useEffect, useRef, useState} = React;
  const {Button, Input, useQuery, host} = sdk;
  const stack = {display: 'grid', gap: 10};
  const panel = {...stack, padding: 12, border: '1px solid var(--ui-stroke-secondary)', borderRadius: 8};
  const selectStyle = {color: 'inherit', background: 'var(--ui-background)', padding: 8};
  const field = (label, input) => h('label', {style: stack}, h('span', null, label), React.cloneElement(input, {'aria-label': label}));

  function Connections({profile, queryKey, gateway, model, provider, setModel, setProvider, busy}) {
    const {t} = localizer.useI18n();
    const query = useQuery({queryKey: [...queryKey, 'connections'], queryFn: () => loadConnections((...args) => host.request(...args), profile), enabled: gateway === 'open', retry: false});
    const providers = query.data?.providers || [];
    const selected = providers.find(p => p.id === provider);
    const current = query.data?.current;
    return h('section', {style: panel}, h('h3', null, t('workspace.connectionTitle')),
      h('p', null, t('workspace.connectionDescription')),
      query.error && h('p', {role: 'status'}, t('workspace.catalogError')),
      field(t('workspace.configuredConnection'), h('select', {value: selected ? provider : '', disabled: busy, style: selectStyle, onChange: e => {setProvider(e.target.value); setModel('');}},
        h('option', {value: ''}, t('workspace.chooseConnection')), ...providers.map(p => h('option', {key: p.id, value: p.id, disabled: !p.authenticated}, `${p.label}${p.authenticated ? '' : t('workspace.loginRequired')}`)))),
      field(t('workspace.catalogModel'), h('select', {value: selected?.models.includes(model) ? model : '', disabled: busy || !selected?.authenticated, style: selectStyle, onChange: e => setModel(e.target.value)},
        h('option', {value: ''}, t('workspace.chooseModel')), ...(selected?.models || []).map(name => h('option', {key: name, value: name}, name)))),
      h(Button, {disabled: busy || !current?.model || !providers.some(p => p.id === current?.provider && p.authenticated), onClick: () => {setModel(current.model); setProvider(current.provider);}}, t('workspace.useCurrentConnection')),
      h('p', {role: 'status'}, selected?.authenticated && model ? t('workspace.connectionReady') : t('workspace.connectionNeeded')),
      h('details', null, h('summary', null, t('workspace.advancedEntry')),
        field(t('workspace.model'), h(Input, {value: model, maxLength: 300, disabled: busy, onChange: e => setModel(e.target.value)})),
        field(t('workspace.provider'), h(Input, {value: provider, maxLength: 100, disabled: busy, onChange: e => setProvider(e.target.value)}))),
      h(Button, {disabled: busy || gateway !== 'open', onClick: () => query.refetch?.()}, t('workspace.checkConnection')));
  }

  function FolderPicker({directory, onChoose, busy}) {
    const {t} = localizer.useI18n();
    const [listing, setListing] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [name, setName] = useState('');
    const live = useRef(true);
    useEffect(() => {live.current = true; return () => {live.current = false;};}, []);
    const browse = async path => {
      setLoading(true); setError('');
      try {const data = await ctx.rest(`/folders?path=${encodeURIComponent(path || '')}`); if (live.current) setListing(data);}
      catch {if (live.current) setError(t('workspace.folderUnavailable'));}
      finally {if (live.current) setLoading(false);}
    };
    return h('div', {style: stack},
      h(Button, {type: 'button', disabled: busy || loading, onClick: () => browse(directory)}, t('workspace.chooseFolder')),
      error && h('p', {role: 'alert'}, error),
      listing && h('section', {role: 'dialog', 'aria-label': t('workspace.folderDialog'), style: panel},
        h('strong', null, listing.path), h('p', null, t('workspace.folderPrivacy')),
        h(Button, {type: 'button', disabled: loading || !listing.parent, onClick: () => browse(listing.parent)}, t('workspace.parentFolder')),
        h('div', {style: {...stack, maxHeight: 250, overflow: 'auto'}}, ...listing.directories.map(entry => h(Button, {key: entry.path, type: 'button', disabled: loading, onClick: () => browse(entry.path)}, entry.name))),
        field(t('workspace.newFolderName'), h(Input, {value: name, maxLength: 120, disabled: loading, onChange: e => setName(e.target.value)})),
        h(Button, {type: 'button', disabled: loading || !name.trim(), onClick: async () => {
          setLoading(true); setError('');
          try {const created = await ctx.rest('/folders', {method: 'POST', body: {parent: listing.path, name}}); if (live.current) {onChoose(created.path); setListing(null); setName('');}}
          catch {if (live.current) setError(t('workspace.createFolderFailed'));}
          finally {if (live.current) setLoading(false);}
        }}, t('workspace.createAndChoose')),
        h(Button, {type: 'button', disabled: loading, onClick: () => {onChoose(listing.path); setListing(null);}}, t('workspace.chooseThisFolder')),
        h(Button, {type: 'button', disabled: loading, onClick: () => setListing(null)}, t('workspace.closeFolderPicker'))));
  }

  function Diagnostics({perform = work => work(), busy = false}) {
    const {t} = localizer.useI18n();
    const [report, setReport] = useState(null);
    return h('details', {style: panel}, h('summary', null, t('workspace.diagnosticsTitle')),
      h('p', null, t('workspace.diagnosticsDescription')),
      h(Button, {disabled: busy, onClick: () => perform(async () => setReport(await ctx.rest('/diagnostics')))}, t('workspace.buildDiagnostics')),
      report && h(React.Fragment, null, h('pre', {style: {whiteSpace: 'pre-wrap'}}, JSON.stringify(report, null, 2)),
        h(Button, {disabled: busy, onClick: () => perform(() => ctx.os.writeClipboard(JSON.stringify(report, null, 2)))}, t('workspace.copyDiagnostics'))),
      h('a', {href: 'https://github.com/VibeSan7/altron-desktop/issues/new?template=bug_report.yml', target: '_blank', rel: 'noreferrer'}, t('workspace.reportIssue')));
  }
  return {Connections, FolderPicker, Diagnostics};
}
