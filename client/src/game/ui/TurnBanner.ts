import Phaser from 'phaser';
import { HUD_DEPTH, PANEL_ALPHA, PANEL_COLOR, textStyle } from './style';

/** Top-left: round number, whose turn it is and the turn timer. */
export class TurnBanner {
  private readonly round: Phaser.GameObjects.Text;
  private readonly turn: Phaser.GameObjects.Text;
  private readonly timer: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add.graphics();
    this.round = scene.add.text(12, 8, '', textStyle(14, '#bcd'));
    this.turn = scene.add.text(12, 28, '', textStyle(22, '#fff', true));
    this.timer = scene.add.text(12, 58, '', textStyle(15, '#fff'));
    scene.add.container(12, 12, [this.bg, this.round, this.turn, this.timer]).setDepth(HUD_DEPTH);
  }

  update(opts: { round: number; totalRounds: number; text: string; color: string; secondsLeft: number | null; weapon?: string }): void {
    this.round.setText(`ROUND ${opts.round} / ${opts.totalRounds}`);
    this.turn.setText(opts.text).setColor(opts.color);
    const parts: string[] = [];
    if (opts.secondsLeft !== null) parts.push(`⏱ ${opts.secondsLeft}s`);
    if (opts.weapon) parts.push(opts.weapon);
    this.timer.setText(parts.join('   ')).setColor(opts.secondsLeft !== null && opts.secondsLeft <= 5 ? '#ff6b6b' : '#ffffff');
    const w = Math.max(this.turn.width, this.timer.width, this.round.width) + 24;
    this.bg.clear().fillStyle(PANEL_COLOR, PANEL_ALPHA).fillRoundedRect(0, 0, w, 84, 8);
  }
}
