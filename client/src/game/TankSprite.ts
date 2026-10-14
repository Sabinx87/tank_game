import Phaser from 'phaser';
import { BARREL_LENGTH, MAX_HEALTH, TANK_HEIGHT, TANK_WIDTH, TURRET_PIVOT_HEIGHT } from '@shared/constants';
import { heightAt } from '@shared/terrain';

const DEAD_COLOR = 0x4a4a4a;

/** One tank: hull, turret, barrel, name label and a mini health bar. */
export class TankSprite {
  readonly container: Phaser.GameObjects.Container;
  private readonly hull: Phaser.GameObjects.Graphics;
  private readonly barrel: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly marker: Phaser.GameObjects.Triangle;
  private targetX = 0;
  private targetY = 0;
  private alive = true;
  health = MAX_HEALTH;
  angle = 45;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly playerId: string,
    private color: number,
    name: string,
    depth: number,
  ) {
    this.hull = scene.add.graphics();
    this.barrel = scene.add.graphics();
    this.barrel.setPosition(0, -TURRET_PIVOT_HEIGHT);
    this.label = scene.add
      .text(0, -52, name, { fontFamily: 'Trebuchet MS, sans-serif', fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5);
    this.hpBar = scene.add.graphics();
    this.marker = scene.add.triangle(0, -72, 0, 0, 16, 0, 8, 12, 0xffffff).setVisible(false);
    scene.tweens.add({ targets: this.marker, y: -64, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.container = scene.add.container(0, 0, [this.barrel, this.hull, this.label, this.hpBar, this.marker]).setDepth(depth);
    this.drawHull();
    this.drawBarrel();
    this.drawHp();
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  setName(name: string, color: number): void {
    this.label.setText(name);
    if (color !== this.color) {
      this.color = color;
      this.drawHull();
      this.drawBarrel();
    }
  }

  /** Move toward (x, y). `snap` jumps there immediately. */
  setPosition(x: number, y: number, snap = false): void {
    this.targetX = x;
    this.targetY = y;
    if (snap) this.container.setPosition(x, y);
  }

  setAngle(angle: number): void {
    if (angle === this.angle) return;
    this.angle = angle;
    this.barrel.setRotation(Phaser.Math.DegToRad(-angle));
  }

  setHealth(health: number, alive: boolean): void {
    const changed = health !== this.health || alive !== this.alive;
    this.health = health;
    if (alive !== this.alive) {
      this.alive = alive;
      this.drawHull();
      this.drawBarrel();
    }
    if (changed) this.drawHp();
  }

  setCurrent(current: boolean): void {
    this.marker.setVisible(current && this.alive);
    this.marker.setFillStyle(this.color);
  }

  /** Smoothly follow the server position and tilt the hull to the slope. */
  update(dt: number, terrain: number[]): void {
    const k = Math.min(1, dt * 14);
    this.container.x += (this.targetX - this.container.x) * k;
    // Falling looks better a bit slower than driving.
    const ky = this.targetY > this.container.y + 4 ? Math.min(1, dt * 6) : k;
    this.container.y += (this.targetY - this.container.y) * ky;
    if (Math.abs(this.targetX - this.container.x) < 0.05) this.container.x = this.targetX;
    if (Math.abs(this.targetY - this.container.y) < 0.05) this.container.y = this.targetY;
    if (terrain.length) {
      const slope = heightAt(terrain, this.container.x + 12) - heightAt(terrain, this.container.x - 12);
      this.hull.setRotation(Phaser.Math.Clamp(Math.atan2(slope, 24), -0.5, 0.5));
    }
  }

  destroy(): void {
    this.container.destroy();
  }

  private drawHull(): void {
    const g = this.hull.clear();
    const c = this.alive ? this.color : DEAD_COLOR;
    const w = TANK_WIDTH;
    // Treads
    g.fillStyle(0x222222, 1).fillRoundedRect(-w / 2, -8, w, 8, 4);
    g.fillStyle(0x555555, 1);
    for (let i = 0; i < 5; i++) g.fillCircle(-w / 2 + 5 + i * ((w - 10) / 4), -4, 2.2);
    // Body
    g.fillStyle(c, 1).fillRoundedRect(-w / 2 + 3, -TANK_HEIGHT, w - 6, TANK_HEIGHT - 7, 4);
    g.fillStyle(0xffffff, this.alive ? 0.18 : 0.05).fillRect(-w / 2 + 6, -TANK_HEIGHT + 2, w - 12, 3);
    // Turret dome
    g.fillStyle(c, 1).fillCircle(0, -TURRET_PIVOT_HEIGHT, 8);
    g.lineStyle(1.5, 0x000000, 0.4).strokeCircle(0, -TURRET_PIVOT_HEIGHT, 8);
  }

  private drawBarrel(): void {
    const g = this.barrel.clear();
    g.fillStyle(this.alive ? 0x2b2b2b : 0x333333, 1).fillRect(0, -2.5, BARREL_LENGTH, 5);
    g.fillStyle(this.alive ? this.color : DEAD_COLOR, 1).fillRect(BARREL_LENGTH - 5, -3.5, 5, 7);
    this.barrel.setRotation(Phaser.Math.DegToRad(-this.angle));
  }

  private drawHp(): void {
    const g = this.hpBar.clear();
    if (!this.alive) {
      this.label.setAlpha(0.5);
      return;
    }
    this.label.setAlpha(1);
    const w = 40;
    const frac = Phaser.Math.Clamp(this.health / MAX_HEALTH, 0, 1);
    g.fillStyle(0x000000, 0.6).fillRect(-w / 2 - 1, -41, w + 2, 6);
    g.fillStyle(frac > 0.5 ? 0x2ecc71 : frac > 0.25 ? 0xf1c40f : 0xe74c3c, 1).fillRect(-w / 2, -40, w * frac, 4);
  }
}
