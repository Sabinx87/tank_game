import Phaser from 'phaser';

/** Visual effects: explosions, muzzle flashes, floating damage numbers, shield pops, repairs. */
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

  floatingText(x: number, y: number, text: string, color = '#ff5555', size = 22): void {
    const t = this.track(this.scene.add
      .text(x, y, text, { fontFamily: 'Trebuchet MS, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(this.depth + 1));
    this.scene.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1300, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  /** Damage number above a hit tank; direct hits get a bigger number and a "DIRECT HIT!" label. */
  damageNumber(x: number, y: number, amount: number, direct: boolean): void {
    if (!direct) {
      this.floatingText(x, y, `-${amount}`);
      return;
    }
    this.floatingText(x, y, `-${amount}`, '#ff3030', 30);
    const label = this.track(this.scene.add
      .text(x, y - 34, 'DIRECT HIT!', { fontFamily: 'Trebuchet MS, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#ffd166', stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(this.depth + 2)
      .setScale(0.3));
    this.scene.tweens.add({ targets: label, scale: 1.1, duration: 220, ease: 'Back.out' });
    this.scene.tweens.add({ targets: label, y: y - 70, alpha: 0, delay: 900, duration: 700, onComplete: () => label.destroy() });
  }

  /** The shield bubble shatters. */
  shieldBreak(x: number, y: number, radius: number, color: number): void {
    const s = this.scene;
    const ring = this.track(s.add.circle(x, y, radius, color, 0).setStrokeStyle(4, color, 1).setDepth(this.depth));
    s.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 420, ease: 'Cubic.out', onComplete: () => ring.destroy() });
    const shards = this.track(s.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 260 },
      lifespan: { min: 300, max: 650 },
      scale: { start: 1, end: 0 },
      tint: [color, 0xffffff],
      blendMode: 'ADD',
      emitting: false,
    }).setDepth(this.depth));
    shards.explode(24, x, y);
    s.time.delayedCall(800, () => shards.destroy());
    this.floatingText(x, y - radius - 10, 'SHIELD DOWN', '#9fd8ff', 18);
  }

  /** Green sparkle rising from a tank that used a repair kit. */
  repair(x: number, y: number, text: string): void {
    const s = this.scene;
    const sparks = this.track(s.add.particles(0, 0, 'spark', {
      x: { min: -18, max: 18 },
      speedY: { min: -90, max: -40 },
      speedX: { min: -10, max: 10 },
      lifespan: 700,
      scale: { start: 0.9, end: 0 },
      tint: [0x9be37a, 0xe8ffd0],
      blendMode: 'ADD',
      emitting: false,
    }).setDepth(this.depth));
    sparks.explode(18, x, y - 10);
    s.time.delayedCall(900, () => sparks.destroy());
    this.floatingText(x, y - 60, text, '#9be37a', 18);
  }

  /** Shield switched on: a ring that snaps into place. */
  shieldUp(x: number, y: number, radius: number, color: number): void {
    const ring = this.track(this.scene.add.circle(x, y, radius, color, 0.25).setStrokeStyle(3, color, 1).setDepth(this.depth).setScale(1.8).setAlpha(0));
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 1, duration: 260, ease: 'Back.out', onComplete: () => ring.destroy() });
  }

  tankDestroyed(x: number, y: number): void {
    this.explosion(x, y - 10, 45, 0xff8800);
    this.floatingText(x, y - 70, '💀 DESTROYED', '#ffffff');
  }
}
