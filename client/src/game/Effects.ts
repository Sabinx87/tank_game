import Phaser from 'phaser';

/** Visual effects: explosions, muzzle flashes, floating damage numbers. */
export class Effects {
  /** Everything currently animating, so a new round can wipe leftovers. */
  private readonly live = new Set<Phaser.GameObjects.GameObject>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {
    if (!scene.textures.exists('spark')) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
      g.generateTexture('spark', 8, 8);
      g.clear().fillStyle(0xffffff, 1).fillCircle(16, 16, 16);
      g.generateTexture('puff', 32, 32);
      g.destroy();
    }
  }

  /** Explosion sized by its blast radius. */
  explosion(x: number, y: number, radius: number, color: number): void {
    const s = this.scene;
    const flash = this.track(s.add.circle(x, y, radius, 0xffffff, 0.9).setDepth(this.depth).setScale(0.2));
    s.tweens.add({ targets: flash, scale: 1, alpha: 0, duration: 260, ease: 'Cubic.out', onComplete: () => flash.destroy() });

    const ring = this.track(s.add.circle(x, y, radius, color, 0).setStrokeStyle(4, color, 1).setDepth(this.depth).setScale(0.3));
    s.tweens.add({ targets: ring, scale: 1.15, alpha: 0, duration: 450, ease: 'Cubic.out', onComplete: () => ring.destroy() });

    const sparks = this.track(s.add.particles(0, 0, 'spark', {
      speed: { min: radius * 1.5, max: radius * 5 },
      angle: { min: 180, max: 360 },
      gravityY: 500,
      lifespan: { min: 400, max: 900 },
      scale: { start: 1.2, end: 0 },
      tint: [color, 0xffcc33, 0xff5522, 0xffffff],
      blendMode: 'ADD',
      emitting: false,
    }).setDepth(this.depth));
    sparks.explode(Math.round(12 + radius / 2), x, y);

    const smoke = this.track(s.add.particles(0, 0, 'puff', {
      speed: { min: 10, max: radius * 0.8 },
      angle: { min: 200, max: 340 },
      lifespan: { min: 700, max: 1500 },
      scale: { start: radius / 60, end: radius / 25 },
      alpha: { start: 0.45, end: 0 },
      tint: 0x555555,
      emitting: false,
    }).setDepth(this.depth - 1));
    smoke.explode(Math.round(4 + radius / 12), x, y);

    s.time.delayedCall(1700, () => {
      sparks.destroy();
      smoke.destroy();
    });
    s.cameras.main.shake(150 + radius * 2, Math.min(0.02, 0.002 + radius / 9000));
  }

  /** Remove every effect still on screen (e.g. when a new round starts). */
  clear(): void {
    for (const obj of this.live) obj.destroy();
    this.live.clear();
  }

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.live.add(obj);
    obj.once(Phaser.GameObjects.Events.DESTROY, () => this.live.delete(obj));
    return obj;
  }

  muzzleFlash(x: number, y: number): void {
    const f = this.track(this.scene.add.circle(x, y, 9, 0xfff2a0, 1).setDepth(this.depth));
    this.scene.tweens.add({ targets: f, scale: 2, alpha: 0, duration: 160, onComplete: () => f.destroy() });
  }

  floatingText(x: number, y: number, text: string, color = '#ff5555'): void {
    const t = this.track(this.scene.add
      .text(x, y, text, { fontFamily: 'Trebuchet MS, sans-serif', fontSize: '22px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(this.depth + 1));
    this.scene.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1300, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  tankDestroyed(x: number, y: number): void {
    this.explosion(x, y - 10, 45, 0xff8800);
    this.floatingText(x, y - 70, '💀 DESTROYED', '#ffffff');
  }
}
