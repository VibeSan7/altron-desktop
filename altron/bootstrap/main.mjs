import React from 'react';
import * as sdk from '@hermes/plugin-sdk';
import {createBootstrapView} from './view.mjs';

export default {
  id: 'altron-maintenance', name: 'Altron Maintenance', version: '0.5.0-beta.2',
  description: 'Безопасный переход существующего Altron на новую версию.',
  defaultEnabled: false,
  register(ctx) {
    const View = createBootstrapView(React, sdk, ctx);
    let close;
    const open = () => {
      if (close) {sdk.host.revealPane('plugin-workspace:altron-maintenance'); return;}
      close = sdk.host.openWorkspace('altron-maintenance', {title: 'Обновление Altron', render: () => React.createElement(View), onClose: () => {close = null;}});
    };
    ctx.onDispose(() => close?.());
    ctx.register({id: 'button', area: 'statusBar.left', render: () => React.createElement(sdk.Button, {onClick: open, variant: 'ghost', size: 'sm'}, 'Обновление Altron')});
  },
};
