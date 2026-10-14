import type { PlayerInfo, RoundResults } from '@shared/types';
import { h } from '../dom';
import { colorOf, playerName } from '../store';

/** Table of one round's kills / damage / survival / points. */
export function resultsTable(res: RoundResults, players: PlayerInfo[]): HTMLElement {
  const byId = new Map(players.map((p) => [p.id, p]));
  return h(
    'table',
    { class: 'results' },
    h('thead', {}, h('tr', {}, ...['Player', 'Kills', 'Damage', 'Survived', 'Earned', 'Total'].map((t) => h('th', {}, t)))),
    h(
      'tbody',
      {},
      ...res.entries.map((e) => {
        const p = byId.get(e.playerId);
        return h(
          'tr',
          {},
          h('td', {}, h('span', { class: 'dot', style: `--c:${colorOf(p?.color).css}` }), playerName(p)),
          h('td', {}, String(e.kills)),
          h('td', {}, String(e.damageDealt)),
          h('td', {}, e.survived ? '✔' : '✖'),
          h('td', { class: 'earned' }, `+${e.pointsEarned}`),
          h('td', {}, String(e.totalPoints)),
        );
      }),
    ),
  );
}
