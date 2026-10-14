import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '@shared/constants';
import { GameScene } from './GameScene';

/** Owns the Phaser instance. Created on first use, then shown/hidden as pages change. */
export class GameView {
  private game: Phaser.Game | null = null;
  private visible = false;

  constructor(private readonly container: HTMLElement) {}

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.container.style.display = visible ? 'block' : 'none';

    if (visible && !this.game) {
      this.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: this.container,
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        backgroundColor: '#2b5876',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [GameScene],
      });
      return;
    }
    if (!this.game) return;
    // Phaser captures arrow keys / space globally: release them while the
    // HTML pages (name input, shop) are showing.
    const kb = this.game.input.keyboard;
    if (kb) kb.enabled = visible;
    const scene = this.game.scene.getScene('game');
    if (!scene) return;
    if (visible) {
      scene.input.keyboard?.resetKeys();
      this.game.scene.wake('game');
    } else {
      this.game.scene.sleep('game');
    }
  }
}
