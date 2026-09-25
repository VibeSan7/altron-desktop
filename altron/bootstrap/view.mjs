import {createMaintenanceView} from '../ui/maintenance-view.mjs';
import {defaultLocalizer} from '../ui/i18n.mjs';

export function createBootstrapView(React, sdk, ctx, localizer = defaultLocalizer) {
  const {createElement: h, useState, useMemo} = React;
  function PendingPlans({target, scope, gateway}) {
    const {t} = localizer.useI18n();
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
      h('h2', null, t('bootstrap.pendingTitle')),
      h('p', null, t('bootstrap.pendingDescription')),
      (plans.error || error) && h('p', {role: 'alert'}, error || t('bootstrap.pendingError')),
      plans.data?.plans.length === 0 && h('p', null, t('bootstrap.noPending')),
      ...(plans.data?.plans || []).map(plan => h('section', {key: plan.task_id},
        h('strong', null, `${plan.project_name}: ${plan.goal}`),
        h('p', {style: {whiteSpace: 'pre-wrap'}}, plan.plan),
        h(sdk.Button, {disabled: busy || gateway !== 'open', onClick: () => {setSelected(plan); setReason('');}}, t('bootstrap.cancelPlan')))),
      selected && h('section', {role: 'dialog', 'aria-label': t('bootstrap.cancelDialog')},
        h('p', null, t('bootstrap.planSummary', target, selected.project_name, selected.goal)),
        h(sdk.Textarea, {'aria-label': t('bootstrap.cancelReason'), value: reason, maxLength: 2000, disabled: busy, onChange: event => setReason(event.target.value)}),
        h(sdk.Button, {disabled: busy || !reason.trim() || gateway !== 'open', onClick: async () => {
          setBusy(true); setError('');
          try {
            await request(`/${selected.project_id}/${selected.task_id}/cancel`, {method: 'POST', body: {reason, confirm: true, closed_other_windows: true}});
            setSelected(null); await plans.refetch();
          } catch {setError(t('bootstrap.cancelFailed'));}
          finally {setBusy(false);}
        }}, t('bootstrap.confirmCancel')),
        h(sdk.Button, {disabled: busy, onClick: () => setSelected(null)}, t('bootstrap.keepPlan'))));
  }
  function Panel({scope, gateway}) {
    const {t} = localizer.useI18n();
    const [target, setTarget] = useState('');
    const [closed, setClosed] = useState(false);
    const queryKey = ['altron-maintenance', ...scope];
    const targets = sdk.useQuery({queryKey, queryFn: () => ctx.rest('/targets'), enabled: gateway === 'open', retry: false});
    const Maintenance = useMemo(() => createMaintenanceView(React, sdk, {rest: (route, options) => {
      if (sdk.host.state.connectionId.get() !== scope[0] || sdk.host.state.profile.get() !== scope[1]) throw new Error('Source changed');
      const body = options?.body;
      const confirmed = route === '/maintenance/apply' || route === '/maintenance/rollback';
      return ctx.rest(`/targets/${encodeURIComponent(target)}${route}`, confirmed ? {...options, body: {...body, closed_other_windows: true}} : options);
    }}, localizer), [target, scope[0], scope[1]]);
    return h('main', {style: {padding: 24, display: 'grid', gap: 16}},
      localizer.LanguageSelector && h('div', {style: {justifySelf: 'end'}}, h(localizer.LanguageSelector)),
      h('h1', null, t('bootstrap.title')),
      h('p', null, t('bootstrap.description')),
      h('p', null, t('bootstrap.safety')),
      targets.error && h('p', {role: 'alert'}, t('bootstrap.targetError')),
      h('label', null, t('bootstrap.target'), h('select', {'aria-label': t('bootstrap.target'), value: target, onChange: e => {setTarget(e.target.value); setClosed(false);}},
        h('option', {value: ''}, t('bootstrap.chooseTarget')),
        ...(targets.data?.profiles || []).map(name => h('option', {key: name, value: name}, name)))),
      targets.data?.profiles?.length === 0 && h('p', null, t('bootstrap.noTarget')),
      h('label', null, h('input', {type: 'checkbox', checked: closed, onChange: e => setClosed(e.target.checked)}), t('bootstrap.windowsClosed')),
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
