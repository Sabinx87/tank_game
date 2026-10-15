import { SHOP_SECTIONS, ownedOf, type ShopCategory, type ShopItem } from '@shared/shop';
import { sounds } from '../audio/sounds';
import { h, replaceChildren, toast, type Page } from '../dom';
import { api } from '../net';
import { colorOf, playerName, store } from '../store';
import { resultsTable } from './resultsTable';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const cardKey = (i: ShopItem) => `${i.category}:${i.id}`;

/** Between rounds: results of the last round + the shop (bombs, shields, repair kits) + Ready button. */
export class ShopPage implements Page {
  readonly el: HTMLElement;
  private heading = h('h2', {});
  private results = h('div', {});
  private points = h('div', { class: 'points' });
  // Cards are built once and updated in place, so a click is never lost to a re-render.
  private cards = new Map(
    SHOP_SECTIONS.flatMap((sec) => sec.items).map((item) => [
      cardKey(item),
      {
        item,
        owned: h('span', {}),
        buy: item.free
          ? null
          : h('button', { class: 'btn btn-small', on: { click: () => void this.buy(item.category, item.id) } }, `Buy · ${item.cost}`),
      },
    ]),
  );
  private sections = SHOP_SECTIONS.map((sec) =>
    h(
      'section',
      { class: 'shop-section' },
      h('h3', {}, sec.title),
      h(
        'div',
        { class: 'shop-grid' },
        ...sec.items.map((item) => {
          const card = this.cards.get(cardKey(item))!;
          return h(
            'div',
            { class: 'weapon-card', style: `--c:${hex(item.color)}` },
            h('div', { class: 'weapon-name' }, h('span', { class: 'weapon-dot' }), item.name),
            h('p', { class: 'weapon-desc' }, item.description),
            h('div', { class: 'weapon-stats' }, item.stats),
            h('div', { class: 'weapon-buy' }, card.owned, card.buy ?? h('span', { class: 'badge' }, 'FREE')),
          );
        }),
      ),
    ),
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
      h('div', { class: 'card' }, h('div', { class: 'shop-head' }, h('h2', {}, 'Shop'), this.points), ...this.sections),
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

    for (const { item, owned, buy } of this.cards.values()) {
      const count = ownedOf(me, item.category, item.id);
      owned.textContent = count === Infinity ? 'Owned: ∞' : item.max !== undefined ? `Owned: ${count} / ${item.max}` : `Owned: ${count}`;
      if (buy) buy.disabled = me.points < item.cost || (item.max !== undefined && count >= item.max);
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

  private async buy(category: ShopCategory, itemId: string): Promise<void> {
    const res = await api.buy(category, itemId);
    if (res.ok) sounds.play('buy');
    else toast(res.error, 'error');
  }
}
