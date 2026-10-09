/* Master Games Arcade — diagnóstico de controles web.
 * Baseado nas melhorias de HID/Gamepad do projeto original, sem reescrever
 * eventos: o EmulatorJS continua responsável pela entrada do jogo.
 */
(function () {
  'use strict';
  const STORAGE_KEY = 'mga-gamepads-v2';
  const MAX_PLAYERS = 4;
  const state = { connected: 0, players: [], updatedAt: 0 };

  const safeRead = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  };
  const stableKey = (pad) => `index:${Number.isFinite(Number(pad?.index)) ? Number(pad.index) : 'na'}`;
  const snapshot = () => {
    try { return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []; }
    catch { return []; }
  };
  const update = (reason = 'poll') => {
    const previous = state.players.map((p) => p.key);
    const pads = snapshot().slice(0, MAX_PLAYERS);
    state.connected = pads.length;
    state.updatedAt = Date.now();
    state.players = pads.map((pad, index) => ({
      player: index + 1,
      key: stableKey(pad),
      index: pad.index,
      id: pad.id || 'Controle USB',
      mapping: pad.mapping || 'unknown',
      buttons: pad.buttons?.length || 0,
      axes: pad.axes?.length || 0,
      connected: pad.connected !== false
    }));
    const current = state.players.map((p) => p.key);
    const eventType = current.length > previous.length ? 'mga-gamepad-connected' : current.length < previous.length ? 'mga-gamepad-disconnected' : 'mga-gamepads-update';
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, reason })); } catch {}
    window.dispatchEvent(new CustomEvent(eventType, { detail: { ...state, reason } }));
    window.dispatchEvent(new CustomEvent('mga-gamepads-update', { detail: { ...state, reason } }));
  };
  const get = () => ({ connected: state.connected, players: state.players.slice(), updatedAt: state.updatedAt });
  window.MGA_Gamepads = Object.freeze({ get, refresh: () => update('manual'), key: stableKey, stored: safeRead });
  window.addEventListener('gamepadconnected', () => update('connected'));
  window.addEventListener('gamepaddisconnected', () => update('disconnected'));
  window.addEventListener('focus', () => update('focus'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update('visible'); });
  setInterval(() => update('poll'), 1500);
  update('startup');
})();
