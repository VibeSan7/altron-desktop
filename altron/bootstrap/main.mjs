import React from 'react';
import * as sdk from '@hermes/plugin-sdk';
import {createBootstrapView} from './view.mjs';
import {createI18n} from '../ui/i18n.mjs';

export default {
  id: 'altron-maintenance', name: 'Altron Maintenance', version: '0.5.0-beta.2',
  description: 'Safely update an existing Altron installation to a new version.',
  defaultEnabled: false,
  register(ctx) {
    const i18n = createI18n(React, sdk, ctx, 'altron-maintenance');
    const View = createBootstrapView(React, sdk, ctx, i18n);
    const App = () => React.createElement(i18n.Provider, null, React.createElement(View));
    let close;
    const open = () => {
      if (close) {sdk.host.revealPane('plugin-workspace:altron-maintenance'); return;}
      close = sdk.host.openWorkspace('altron-maintenance', {title: ctx.i18n.t('plugin.maintenanceTitle'), render: () => React.createElement(App), onClose: () => {close = null;}});
    };
    ctx.onDispose(() => close?.());
    ctx.register({id: 'button', area: 'statusBar.left', render: () => React.createElement(sdk.Button, {onClick: open, variant: 'ghost', size: 'sm'}, ctx.i18n.t('plugin.maintenanceButton'))});
  },
};
