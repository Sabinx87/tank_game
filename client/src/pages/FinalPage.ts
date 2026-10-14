import { sounds } from '../audio/sounds';
import { h, replaceChildren, type Page } from '../dom';
import { leaveRoom } from '../actions';
import { api } from '../net';
import { colorOf, playerName, store } from '../store';
import { resultsTable } from './resultsTable';

/** After the last round: final leaderboard. */
export class FinalPage implements Page {
  readonly el: HTMLElement;
  private board = h('ol', { class: 'leaderboard' });
  private lastRound = h('div', {});
  private actions = h('div', { class: 'room-actions' });

  constructor() {
    this.el = h(
      'div',
      { class: 'page final' },
      h('h1', { class: 'title' }, 'Final Results'),
      h('div', { class: 'card' }, this.board),
      h('details', { class: 'card' }, h('summary', {}, 'Last round details'), this.lastRound),
      this.actions,
    );
    sounds.play('win');
    this.update();
  }

  update(): void {
    const room = store.room;
    if (!room) return;
    const ranked = [...room.players].sort((a, b) => b.points - a.points);
    const medals = ['🥇', '🥈', '🥉'];
    replaceChildren(
      this.board,
      ...ranked.map((p, i) =>
        h(
          'li',
          { class: i === 0 ? 'winner' : '' },
          h('span', { class: 'medal' }, medals[i] ?? `${i + 1}.`),
          h('span', { class: 'dot', style: `--c:${colorOf(p.color).css}` }),
          h('span', { class: 'pname' }, playerName(p)),
          h('span', { class: 'pts' }, `${p.points} pts`),
        ),
      ),
    );
    replaceChildren(this.lastRound, room.lastRoundResults ? resultsTable(room.lastRoundResults, room.players) : null);

    const isHost = room.hostId === store.myId;
    replaceChildren(
      this.actions,
      h(
        'button',
        {
          class: 'btn',
          on: { click: leaveRoom },
        },
        'Leave',
      ),
      isHost
        ? h('button', { class: 'btn btn-primary btn-big', on: { click: () => api.backToLobby() } }, 'Play again')
        : h('p', { class: 'hint' }, 'The host can start a new game.'),
    );
  }
}
