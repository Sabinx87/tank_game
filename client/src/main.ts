import './styles.css';
import { sounds } from './audio/sounds';
import { toast, type Page } from './dom';
import { GameView } from './game/GameView';
import { api, socket } from './net';
import { FinalPage } from './pages/FinalPage';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
import { ShopPage } from './pages/ShopPage';
import { store } from './store';

type Route = 'home' | 'room' | 'game' | 'shop' | 'final';

const pageEl = document.getElementById('page')!;
const gameView = new GameView(document.getElementById('game-container')!);
let route: Route | null = null;
let page: Page | null = null;
let homeError: string | undefined;

function currentRoute(): Route {
  const { room, session } = store;
  if (!session || !room || room.code !== session.code) return 'home';
  switch (room.phase) {
    case 'lobby':
      return 'room';
    case 'playing':
      return 'game';
    case 'roundEnd':
      return 'shop';
    case 'finished':
      return 'final';
  }
}

/** Show the page matching the current room phase (or just refresh it). */
function render(): void {
  const next = currentRoute();
  if (next !== route) {
    page?.destroy?.();
    page = null;
    route = next;
    pageEl.replaceChildren();
    if (next === 'home') page = new HomePage(homeError);
    else if (next === 'room') page = new RoomPage();
    else if (next === 'shop') page = new ShopPage();
    else if (next === 'final') page = new FinalPage();
    homeError = undefined;
    if (page) pageEl.appendChild(page.el);
    pageEl.style.display = page ? '' : 'none';
    gameView.setVisible(next === 'game');
  } else {
    page?.update();
  }
}

// ---------------------------------------------------------------- server events
socket.on('room:state', (state) => {
  store.room = state;
  store.emit('room', state);
});
socket.on('game:state', (state) => {
  store.game = state;
  store.emit('game', state);
});
socket.on('game:tank', (u) => {
  const t = store.game?.tanks.find((x) => x.playerId === u.playerId);
  if (t) Object.assign(t, u);
  store.emit('tank', u);
});
socket.on('game:shot', (shot) => store.emit('shot', shot));
socket.on('game:turnSkipped', (p) => store.emit('turnSkipped', p));
socket.on('server:error', (msg) => toast(msg, 'error', 6000));

store.on('room', render);

// ---------------------------------------------------------------- connection / reconnect
let everConnected = false;
socket.on('connect', async () => {
  if (everConnected) toast('Reconnected', 'success', 2000);
  everConnected = true;
  const s = store.session;
  if (!s) return;
  const res = await api.rejoinRoom(s.code, s.token);
  if (!res.ok) {
    store.setSession(null);
    store.room = null;
    homeError = `Couldn't rejoin room ${s.code}: ${res.error}`;
    render();
  }
});
socket.on('disconnect', () => {
  if (store.session) toast('Connection lost — trying to reconnect…', 'error', 4000);
});

// ---------------------------------------------------------------- misc UI
const muteBtn = document.getElementById('mute')!;
const paintMute = () => (muteBtn.textContent = sounds.muted ? '🔇' : '🔊');
muteBtn.addEventListener('click', () => {
  sounds.toggleMute();
  paintMute();
  muteBtn.blur();
});
paintMute();

render();

// Dev-only handle for debugging / automated browser tests (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { __tanks: { store, api } });
