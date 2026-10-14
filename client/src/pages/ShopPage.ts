import { WEAPONS, ownedCount } from '@shared/weapons';
import { sounds } from '../audio/sounds';
import { h, replaceChildren, toast, type Page } from '../dom';
import { api } from '../net';
import { colorOf, playerName, store } from '../store';
import { resultsTable } from './resultsTable';

/** Between rounds: results of the last round + the weapon shop + Ready button. */
export class ShopPage implements Page {
  readonly el: HTMLElement;
  private heading = h('h2', {});
  private results = h('div', {});
  private points = h('div', { class: 'points' });
  // Cards are built once and updated in place, so a click is never lost to a re-render.
  private cards = new Map(
    WEAPONS.map((w) => [
      w.id,
      {
        owned: h('span', {}),
        buy: w.unlimited
          ? null
          : h('button', { class: 'btn btn-small', on: { click: () => void this.buy(w.id) } }, `Buy · ${w.cost}`),
      },
    ]),
  );
  private grid = h(
    'div',
    { class: 'shop-grid' },
    ...WEAPONS.map((w) => {
      const card = this.cards.get(w.id)!;
      return h(
        'div',
        { class: 'weapon-card', style: `--c:#${w.color.toString(16).padStart(6, '0')}` },
        h('div', { class: 'weapon-name' }, h('span', { class: 'weapon-dot' }), w.name),
        h('p', { class: 'weapon-desc' }, w.description),
        h('div', { class: 'weapon-stats' }, `DMG ${w.damage} · Blast ${w.explosionRadius} · Crater ${w.craterRadius}`),
        h('div', { class: 'weapon-buy' }, card.owned, card.buy ?? h('span', { class: 'badge' }, 'FREE')),
      );
    }),
  );
  private readyList = h('div', { class: 'ready-list' });
  private readyBtn = h('button', { class: 'btn btn-primary btn-big' });

  constructor() {
    this.readyBtn.addEventListener('click', () => {
      sounds.play('click');
      api.setReady(!store.me?.ready);
    });
    this.el = h(
      'div',
      { class: 'page shop' },
      h('div', { class: 'card' }, this.heading, this.results),
      h('div', { class: 'card' }, h('div', { class: 'shop-head' }, h('h2', {}, 'Shop'), this.points), this.grid),
      h('div', { class: 'shop-footer' }, this.readyList, this.readyBtn),
    );
    this.update();
  }

  update(): void {
    const room = store.room;
    const me = store.me;
    if (!room || !me) return;
    const res = room.lastRoundResults;
    const winner = store.player(res?.winnerId);
    this.heading.textContent = `Round ${room.round} of ${room.totalRounds} — ${winner ? `${playerName(winner)} wins the round!` : 'Draw!'}`;
    replaceChildren(this.results, res ? resultsTable(res, room.players) : null);
    this.points.textContent = `${me.points} pts`;

    for (const w of WEAPONS) {
      const card = this.cards.get(w.id)!;
      const owned = ownedCount(me.inventory, w.id);
      card.owned.textContent = owned === Infinity ? 'Owned: ∞' : `Owned: ${owned}`;
      if (card.buy) card.buy.disabled = me.points < w.cost;
    }

    replaceChildren(
      this.readyList,
      ...room.players
        .filter((p) => p.connected)
        .map((p) =>
          h('span', { class: `ready-chip${p.ready ? ' is-ready' : ''}`, style: `--c:${colorOf(p.color).css}` }, `${p.ready ? '✔' : '…'} ${playerName(p)}`),
        ),
    );
    this.readyBtn.textContent = me.ready ? 'Not ready' : 'Ready!';
    this.readyBtn.classList.toggle('btn-primary', !me.ready);
  }

  private async buy(weaponId: string): Promise<void> {
    const res = await api.buy(weaponId);
    if (res.ok) sounds.play('buy');
    else toast(res.error, 'error');
  }
}
