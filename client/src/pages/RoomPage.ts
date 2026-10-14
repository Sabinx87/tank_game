import { MAX_NAME_LENGTH, MAX_PLAYERS, MIN_PLAYERS_TO_START, PLAYER_COLORS } from '@shared/constants';
import type { ColorId } from '@shared/types';
import { sounds } from '../audio/sounds';
import { copyText, h, replaceChildren, toast, type Page } from '../dom';
import { leaveRoom } from '../actions';
import { api } from '../net';
import { colorOf, store } from '../store';

/** Page 2: waiting room — pick a name and a color, host starts the game. */
export class RoomPage implements Page {
  readonly el: HTMLElement;
  private nameInput = h('input', { class: 'name-input', maxLength: MAX_NAME_LENGTH, placeholder: 'Your name', autocomplete: 'off' });
  // Built once and updated in place, so a click is never lost to a re-render.
  private swatchButtons = new Map(
    PLAYER_COLORS.map((c) => [
      c.id,
      h('button', { class: 'swatch', style: `--c:${c.css}`, on: { click: () => void this.pickColor(c.id) } }),
    ]),
  );
  private swatches = h('div', { class: 'swatches' }, ...this.swatchButtons.values());
  private playerList = h('ul', { class: 'player-list' });
  private countLabel = h('h3', {});
  private startBtn = h('button', { class: 'btn btn-primary btn-big' }, 'Start Game');
  private hint = h('p', { class: 'hint' });
  private codeEl = h('span', { class: 'room-code' });

  constructor() {
    this.nameInput.value = store.me?.name ?? localStorage.getItem('tanks.name') ?? '';
    const saveName = () => void this.saveName();
    this.nameInput.addEventListener('change', saveName);
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.nameInput.blur();
    });
    this.startBtn.addEventListener('click', () => void this.start());

    this.el = h(
      'div',
      { class: 'page room' },
      h(
        'div',
        { class: 'card room-header' },
        h('div', {}, h('div', { class: 'label' }, 'Room code'), this.codeEl),
        h('button', { class: 'btn', on: { click: () => void this.copyCode() } }, '📋 Copy'),
        h('p', { class: 'hint' }, 'Share this code with your friends so they can join.'),
      ),
      h(
        'div',
        { class: 'room-grid' },
        h(
          'div',
          { class: 'card' },
          h('h3', {}, 'You'),
          h('label', { class: 'label' }, 'Name'),
          this.nameInput,
          h('label', { class: 'label' }, 'Color'),
          this.swatches,
        ),
        h('div', { class: 'card' }, this.countLabel, this.playerList),
      ),
      h(
        'div',
        { class: 'room-actions' },
        h('button', { class: 'btn', on: { click: leaveRoom } }, 'Leave'),
        this.startBtn,
      ),
      this.hint,
    );

    // Pre-fill a name remembered from last time.
    if (this.nameInput.value && !store.me?.name) void this.saveName();
    this.update();
  }

  update(): void {
    const room = store.room;
    const me = store.me;
    if (!room || !me) return;
    this.codeEl.textContent = room.code;

    for (const c of PLAYER_COLORS) {
      const btn = this.swatchButtons.get(c.id)!;
      const owner = room.players.find((p) => p.color === c.id);
      const taken = !!owner && owner.id !== me.id;
      btn.classList.toggle('selected', me.color === c.id);
      btn.disabled = taken;
      btn.title = taken ? `${c.label} (taken by ${owner!.name || 'someone'})` : c.label;
    }

    this.countLabel.textContent = `Players (${room.players.length}/${MAX_PLAYERS})`;
    replaceChildren(
      this.playerList,
      ...room.players.map((p) =>
        h(
          'li',
          { class: p.connected ? '' : 'offline' },
          h('span', { class: 'dot', style: `--c:${p.color ? colorOf(p.color).css : 'transparent'}` }),
          h('span', { class: 'pname' }, p.name || '(choosing a name…)'),
          p.isHost ? h('span', { class: 'badge' }, 'HOST') : null,
          p.id === me.id ? h('span', { class: 'badge badge-you' }, 'YOU') : null,
          p.connected ? null : h('span', { class: 'badge badge-off' }, 'reconnecting…'),
        ),
      ),
    );

    const isHost = room.hostId === me.id;
    const present = room.players.filter((p) => p.connected);
    const missing = present.filter((p) => !p.name || !p.color).length;
    const canStart = present.length >= MIN_PLAYERS_TO_START && missing === 0;
    this.startBtn.style.display = isHost ? '' : 'none';
    this.startBtn.disabled = !canStart;
    this.hint.textContent = !isHost
      ? 'Waiting for the host to start the game…'
      : present.length < MIN_PLAYERS_TO_START
        ? `Need at least ${MIN_PLAYERS_TO_START} players to start.`
        : missing > 0
          ? 'Waiting for everyone to choose a name and color.'
          : 'Everyone is ready — start when you like!';
  }

  private async saveName(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!name || name === store.me?.name) return;
    const res = await api.setProfile({ name });
    if (!res.ok) toast(res.error, 'error');
    else localStorage.setItem('tanks.name', name);
  }

  private async pickColor(color: ColorId): Promise<void> {
    sounds.play('click');
    const res = await api.setProfile({ color });
    if (!res.ok) toast(res.error, 'error');
  }

  private async start(): Promise<void> {
    await this.saveName();
    const res = await api.startGame();
    if (!res.ok) toast(res.error, 'error');
  }

  private async copyCode(): Promise<void> {
    const code = store.room?.code;
    if (code && (await copyText(code))) toast(`Copied room code ${code}`, 'success', 2000);
  }

}
