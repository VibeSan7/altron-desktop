import React from 'react';
import * as sdk from '@hermes/plugin-sdk';
import {createView} from './view.mjs';
import {createCoordinator} from './team.mjs';

export default {
  id: 'altron',
  name: 'Altron',
  version: '0.3.0-beta.1',
  description: 'Проекты, согласованные задачи, специалисты и проверка результатов.',
  defaultEnabled: false,
  register(ctx) {
    const coordinator = createCoordinator({
      api: (...args) => ctx.rest(...args), rpc: (...args) => sdk.host.request(...args),
      getConnectionId: () => sdk.host.state.connectionId.get(), getProfile: () => sdk.host.state.profile.get(),
      isConnected: () => sdk.host.state.gateway.get() === 'open', onEvent: (...args) => sdk.host.onEvent(...args),
      onScopeChange: fn => {
        const stops = [sdk.host.state.connectionId, sdk.host.state.profile, sdk.host.state.gateway].map(atom => atom.subscribe(fn));
        stops.push(sdk.host.onEvent('gateway.ready', fn));
        return () => { for (const stop of stops) stop(); };
      },
      onError: () => sdk.host.notify({kind: 'error', message: 'Продолжение команды Altron остановлено: результат или состояние не подтверждены. Автоматического повтора нет.'}),
    });
    ctx.onDispose(() => coordinator.dispose());
    const View = createView(React, sdk, ctx, coordinator);
    if (typeof sdk.host.openWorkspace !== 'function') throw new Error('Altron requires Hermes Desktop with the openWorkspace SDK.');
    let close;
    const open = () => {
      if (close) {
        sdk.host.revealPane('plugin-workspace:altron');
        return;
      }
      close = sdk.host.openWorkspace('altron', {title: 'Altron', render: () => React.createElement(View), onClose: () => {close = null;}});
    };
    ctx.onDispose(() => close?.());
    ctx.register({id: 'button', area: 'statusBar.left', render: () => React.createElement(sdk.Button, {onClick: open, variant: 'ghost', size: 'sm'}, 'Altron')});
    ctx.register({id: 'open', area: sdk.PALETTE_AREA, data: {id: 'altron.open', label: 'Открыть Altron', keywords: ['altron', 'проекты'], run: open}});
  },
};
