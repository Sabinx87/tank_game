import Phaser from 'phaser';
import {
  AIM_SEND_INTERVAL_MS,
  AIM_SPEED,
  DEFAULT_MAP_ID,
  DEFAULT_WEAPON_ID,
  MAX_POWER,
  POWER_CHANGE_SPEED,
  SHIELD_BUBBLE_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '@shared/constants';
import { getMap, survivingDecorations, type MapDef } from '@shared/maps';
import { getShield, ownedShields } from '@shared/shields';
import { barrelTip, clampAngle, clampPower } from '@shared/tank';
import { carveCrater } from '@shared/terrain';
import type { Decoration, ExplosionEvent, GameState, ShotResult, TankState, TankUpdate } from '@shared/types';
import { getWeapon, ownedCount } from '@shared/weapons';
import { sounds } from '../audio/sounds';
import { toast } from '../dom';
import { api } from '../net';
import { colorOf, playerName, store } from '../store';
import { Clouds } from './Clouds';
import { Effects } from './Effects';
import { ShotPlayer } from './ShotPlayer';
import { TankSprite } from './TankSprite';
import { SkyRenderer, TerrainRenderer } from './TerrainRenderer';
import { ActionBar } from './ui/ActionBar';
import { FuelBar } from './ui/FuelBar';
import { HealthBars } from './ui/HealthBars';
import { PowerMeter } from './ui/PowerMeter';
import { HUD_DEPTH, textStyle } from './ui/style';
import { TurnBanner } from './ui/TurnBanner';
import { WeaponPicker } from './ui/WeaponPicker';
import { WindIndicator } from './ui/WindIndicator';

const DEPTH = { sky: 0, clouds: 1, terrain: 2, tanks: 3, projectiles: 4, effects: 5 };

type Keys = Record<'left' | 'right' | 'up' | 'down' | 'w' | 's' | 'r' | 'e' | 'space' | 'enter' | 'shift', Phaser.Input.Keyboard.Key>;

/**
 * The battlefield. Renders whatever the server says, animates shots, and
 * turns keyboard input into intentions (move / aim / fire) for the server.
 */
export class GameScene extends Phaser.Scene {
  private state: GameState | null = null;
  private terrain: number[] = [];
  private map: MapDef = getMap(DEFAULT_MAP_ID)!;
  private decorations: Decoration[] = [];
  private readonly tanks = new Map<string, TankSprite>();
  private shot: ShotPlayer | null = null;

  private sky!: SkyRenderer;
  private terrainRenderer!: TerrainRenderer;
  private clouds!: Clouds;
  private effects!: Effects;
  private projectileGfx!: Phaser.GameObjects.Graphics;
  private healthBars!: HealthBars;
  private wind!: WindIndicator;
  private banner!: TurnBanner;
  private powerMeter!: PowerMeter;
  private fuelBar!: FuelBar;
  private weaponPicker!: WeaponPicker;
  private actionBar!: ActionBar;
  private keys!: Keys;

  /** My aim, predicted locally while it's my turn (the server validates on fire). */
  private local = { angle: 45, power: 60, weaponId: DEFAULT_WEAPON_ID };
  private aimDirty = false;
  private lastAimSent = 0;
  private sentMoveDir: -1 | 0 | 1 = 0;
  private firing = false;
  private turnEndsAt = 0;
  private lastTickSecond = -1;
  private readonly unsubscribe: (() => void)[] = [];

  constructor() {
    super('game');
  }

  create(): void {
    this.sky = new SkyRenderer(this, DEPTH.sky);
    this.clouds = new Clouds(this, DEPTH.clouds);
    this.terrainRenderer = new TerrainRenderer(this, DEPTH.terrain);
    this.projectileGfx = this.add.graphics().setDepth(DEPTH.projectiles);
    this.effects = new Effects(this, DEPTH.effects);

    this.healthBars = new HealthBars(this);
    this.wind = new WindIndicator(this);
    this.banner = new TurnBanner(this);
    this.powerMeter = new PowerMeter(this);
    this.fuelBar = new FuelBar(this);
    this.weaponPicker = new WeaponPicker(this, (id) => this.selectWeapon(id));
    this.actionBar = new ActionBar(this, { repair: () => void this.repair(), shield: (id) => void this.activateShield(id) });
    this.add
      .text(WORLD_WIDTH - 12, WORLD_HEIGHT - 74, '←/→ drive   ↑/↓ aim (Shift = fine)   W/S power   1–9 weapon   R repair   E shield   SPACE fire', textStyle(13, '#e8eef5'))
      .setOrigin(1, 1)
      .setDepth(HUD_DEPTH)
      .setAlpha(0.85);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      left: 'LEFT',
      right: 'RIGHT',
      up: 'UP',
      down: 'DOWN',
      w: 'W',
      s: 'S',
      r: 'R',
      e: 'E',
      space: 'SPACE',
      enter: 'ENTER',
      shift: 'SHIFT',
    }) as Keys;
    kb.on('keydown', (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9) {
        const w = this.weaponPicker.owned[n - 1];
        if (w) this.selectWeapon(w.id);
      }
    });

    this.unsubscribe.push(
      store.on('game', (gs) => this.applyState(gs)),
      store.on('tank', (u) => this.applyTankUpdate(u)),
      store.on('shot', (s) => this.startShot(s)),
      store.on('room', () => this.refreshHud()),
      store.on('turnSkipped', ({ playerId, reason }) => {
        const who = playerId === store.myId ? 'Your' : `${playerName(store.player(playerId))}'s`;
        toast(`${who} turn was skipped (${reason === 'timeout' ? 'out of time' : 'disconnected'})`);
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe.forEach((u) => u()));

    if (store.game) this.applyState(store.game);
  }

  // ================================================================ server → scene

  private applyState(gs: GameState): void {
    const newRound = !this.state || this.state.round !== gs.round || this.state.turnOrder.join() !== gs.turnOrder.join();
    // The snapshot is authoritative: finish any shot animation still playing.
    if (this.shot) {
      this.shot.skipToEnd();
      this.shot = null;
    }
    if (newRound) this.effects.clear();
    this.state = structuredClone(gs);
    this.terrain = [...gs.terrain];
    this.map = getMap(gs.mapId) ?? getMap(DEFAULT_MAP_ID)!;
    this.decorations = [...gs.decorations];
    this.sky.draw(this.map);
    this.terrainRenderer.draw(this.terrain, this.map, this.decorations);

    for (const [id, sprite] of this.tanks) {
      if (!gs.tanks.some((t) => t.playerId === id)) {
        sprite.destroy();
        this.tanks.delete(id);
      }
    }
    for (const t of gs.tanks) {
      const p = store.player(t.playerId);
      let sprite = this.tanks.get(t.playerId);
      if (!sprite) {
        sprite = new TankSprite(this, t.playerId, colorOf(p?.color).hex, playerName(p), DEPTH.tanks);
        this.tanks.set(t.playerId, sprite);
      }
      sprite.setPosition(t.x, t.y, newRound);
      sprite.setAngle(t.angle);
      sprite.setHealth(t.health, t.alive);
      sprite.setShield(t.shield);
      sprite.setCurrent(t.playerId === gs.currentPlayerId);
    }

    this.clouds.setWind(gs.wind);
    this.wind.update(gs.wind);
    this.turnEndsAt = gs.currentPlayerId ? performance.now() + gs.turnTimeLeftMs : 0;
    this.firing = false;
    this.sentMoveDir = 0;

    if (gs.currentPlayerId && gs.currentPlayerId === store.myId && !gs.shotInProgress) {
      const mine = gs.tanks.find((t) => t.playerId === store.myId)!;
      this.local.angle = mine.angle;
      this.local.power = clampPower(mine.power, mine.maxPower);
      this.ensureWeaponOwned();
      this.aimDirty = true; // tell everyone which weapon I have selected
      sounds.play('turn');
      this.announce('YOUR TURN!');
    }
    this.refreshHud();
  }

  private applyTankUpdate(u: TankUpdate): void {
    const tank = this.state?.tanks.find((t) => t.playerId === u.playerId);
    if (!tank) return;
    const before: Pick<TankState, 'maxPower' | 'health' | 'shield'> = { maxPower: tank.maxPower, health: tank.health, shield: tank.shield };
    Object.assign(tank, u);
    const sprite = this.tanks.get(u.playerId);
    sprite?.setPosition(u.x, u.y);
    if (!this.isMyTurn() || u.playerId !== store.myId) sprite?.setAngle(u.angle);
    if (!sprite) return;

    // Repairs and shields arrive as tank updates: show what changed.
    const repaired = u.maxPower > before.maxPower + 0.05 || u.health > before.health;
    if (repaired) {
      const parts = [u.maxPower > before.maxPower + 0.05 ? `+${Math.round(u.maxPower - before.maxPower)} POWER` : '', u.health > before.health ? `+${u.health - before.health} HP` : ''];
      this.effects.repair(sprite.x, sprite.y, parts.filter(Boolean).join('  '));
      sounds.play('repair');
    }
    if (u.shield && !before.shield) {
      this.effects.shieldUp(sprite.x, sprite.bubbleY, SHIELD_BUBBLE_RADIUS, getShield(u.shield.shieldId)?.color ?? 0xffffff);
      sounds.play('shield');
    }
    if (repaired || u.shield?.hp !== before.shield?.hp) {
      sprite.setHealth(u.health, u.alive);
      sprite.setShield(u.shield);
      if (u.playerId === store.myId) this.local.power = clampPower(this.local.power, u.maxPower);
      this.refreshHud();
    }
  }

  private startShot(shot: ShotResult): void {
    if (!this.state) return;
    this.state.shotInProgress = true;
    this.turnEndsAt = 0;
    this.firing = false;
    const shooter = this.state.tanks.find((t) => t.playerId === shot.shooterId);
    const sprite = this.tanks.get(shot.shooterId);
    sprite?.setAngle(shot.angle);
    if (shooter) {
      const tip = barrelTip(shooter.x, shooter.y, shot.angle);
      this.effects.muzzleFlash(tip.x, tip.y);
    }
    sounds.play('fire');
    this.shot = new ShotPlayer(shot, this.projectileGfx, (ev) => this.onExplosion(ev));
  }

  private onExplosion(ev: ExplosionEvent): void {
    // Same order as the server: decorations are checked against the ground before the crater.
    this.decorations = survivingDecorations(this.decorations, this.terrain, ev.x, ev.y, ev.craterRadius);
    carveCrater(this.terrain, ev.x, ev.y, ev.craterRadius);
    this.terrainRenderer.draw(this.terrain, this.map, this.decorations);
    this.effects.explosion(ev.x, ev.y, ev.explosionRadius, ev.color);
    sounds.play('explosion', ev.explosionRadius / 100);

    for (const d of ev.damage) {
      const s = this.tanks.get(d.playerId);
      if (!s) continue;
      if (d.absorbed > 0) {
        s.flashShield();
        this.effects.floatingText(s.x + 34, s.y - 34, `🛡 ${d.absorbed}`, '#9fd8ff', 16);
        sounds.play('shield');
      }
      if (d.shieldBroken) {
        this.effects.shieldBreak(s.x, s.bubbleY, SHIELD_BUBBLE_RADIUS, getShield(s.shield?.shieldId ?? '')?.color ?? 0x9fd8ff);
        sounds.play('shieldBreak');
      }
      if (d.amount > 0) this.effects.damageNumber(s.x, s.y - 60, d.amount, d.direct);
    }
    if (ev.damage.some((d) => d.amount > 0)) sounds.play('hit');
    for (const t of ev.tanks) {
      const st = this.state?.tanks.find((x) => x.playerId === t.playerId);
      if (st) Object.assign(st, t);
      const s = this.tanks.get(t.playerId);
      s?.setPosition(t.x, t.y);
      s?.setHealth(t.health, t.alive);
      s?.setShield(t.shield);
    }
    for (const id of ev.killed) {
      const s = this.tanks.get(id);
      if (s) this.effects.tankDestroyed(s.x, s.y);
      s?.setCurrent(false);
      sounds.play('death');
    }
    this.refreshHud();
  }

  /** Big centred text that pops in and fades out. */
  private announce(text: string): void {
    const t = this.add
      .text(WORLD_WIDTH / 2, WORLD_HEIGHT * 0.3, text, textStyle(56, '#ffd166', true))
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH + 1)
      .setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 1000, duration: 400, onComplete: () => t.destroy() });
  }

  // ================================================================ input

  private isMyTurn(): boolean {
    return !!this.state && this.state.currentPlayerId === store.myId && !!store.myId;
  }

  private canControl(): boolean {
    if (!this.state || !this.isMyTurn() || this.state.shotInProgress || this.firing || this.shot) return false;
    return !!this.state.tanks.find((t) => t.playerId === store.myId)?.alive;
  }

  private handleInput(dt: number): void {
    if (!this.canControl()) return;
    const k = this.keys;

    const dir = ((k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0)) as -1 | 0 | 1;
    if (dir !== this.sentMoveDir) {
      api.move(dir);
      this.sentMoveDir = dir;
    }

    const fine = k.shift.isDown ? 0.25 : 1;
    const before = { ...this.local };
    const maxPower = this.myTank()?.maxPower ?? MAX_POWER;
    if (k.up.isDown) this.local.angle = clampAngle(this.local.angle + AIM_SPEED * fine * dt);
    if (k.down.isDown) this.local.angle = clampAngle(this.local.angle - AIM_SPEED * fine * dt);
    if (k.w.isDown) this.local.power = clampPower(this.local.power + POWER_CHANGE_SPEED * fine * dt, maxPower);
    if (k.s.isDown) this.local.power = clampPower(this.local.power - POWER_CHANGE_SPEED * fine * dt, maxPower);
    if (before.angle !== this.local.angle || before.power !== this.local.power) this.aimDirty = true;

    this.tanks.get(store.myId!)?.setAngle(this.local.angle);

    const now = performance.now();
    if (this.aimDirty && now - this.lastAimSent >= AIM_SEND_INTERVAL_MS) {
      api.aim(round1(this.local.angle), round1(this.local.power), this.local.weaponId);
      this.aimDirty = false;
      this.lastAimSent = now;
    }

    if (Phaser.Input.Keyboard.JustDown(k.r)) void this.repair();
    if (Phaser.Input.Keyboard.JustDown(k.e)) {
      const best = store.me && ownedShields(store.me.shields)[0];
      if (best) void this.activateShield(best.id);
      else toast("You don't own a shield — buy one in the shop", 'error');
    }
    if (Phaser.Input.Keyboard.JustDown(k.space) || Phaser.Input.Keyboard.JustDown(k.enter)) void this.fire();
  }

  private myTank(): TankState | undefined {
    return this.state?.tanks.find((t) => t.playerId === store.myId);
  }

  /** Use a repair kit charge. Doesn't end the turn. */
  private async repair(): Promise<void> {
    if (!this.canControl()) return;
    const res = await api.repair();
    if (!res.ok) toast(res.error, 'error');
  }

  /** Switch on a shield. Doesn't end the turn. */
  private async activateShield(shieldId: string): Promise<void> {
    if (!this.canControl()) return;
    if (this.myTank()?.shield) {
      toast('You already have a shield up', 'error');
      return;
    }
    const res = await api.activateShield(shieldId);
    if (!res.ok) toast(res.error, 'error');
  }

  private async fire(): Promise<void> {
    if (!this.canControl()) return;
    this.firing = true;
    this.sentMoveDir = 0;
    const res = await api.fire(round1(this.local.angle), round1(this.local.power), this.local.weaponId);
    if (!res.ok) {
      this.firing = false;
      toast(res.error, 'error');
    }
  }

  private selectWeapon(weaponId: string): void {
    const me = store.me;
    if (!me || ownedCount(me.inventory, weaponId) <= 0) return;
    this.local.weaponId = weaponId;
    this.aimDirty = true;
    sounds.play('click');
    this.refreshHud();
  }

  private ensureWeaponOwned(): void {
    const me = store.me;
    if (me && ownedCount(me.inventory, this.local.weaponId) <= 0) this.local.weaponId = DEFAULT_WEAPON_ID;
  }

  // ================================================================ frame loop & HUD

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1);
    this.clouds.update(dt);
    this.handleInput(dt);
    for (const s of this.tanks.values()) s.update(dt, this.terrain);

    if (this.shot) {
      this.shot.update(dt);
      if (this.shot.finished) {
        this.shot = null;
        this.projectileGfx.clear();
      }
    }
    this.refreshDynamicHud();
  }

  /** Things that change every frame: timer, power/angle, fuel. */
  private refreshDynamicHud(): void {
    const gs = this.state;
    if (!gs) return;
    const current = gs.tanks.find((t) => t.playerId === gs.currentPlayerId);
    const mine = this.isMyTurn();
    const angle = mine ? this.local.angle : (current?.angle ?? 0);
    const power = mine ? this.local.power : (current?.power ?? 0);
    this.powerMeter.update(power, angle, current?.maxPower ?? MAX_POWER);
    this.fuelBar.update(current?.fuel ?? 0);

    const secondsLeft = this.turnEndsAt && !gs.shotInProgress ? Math.ceil(Math.max(0, this.turnEndsAt - performance.now()) / 1000) : null;
    if (mine && secondsLeft !== null && secondsLeft <= 5 && secondsLeft !== this.lastTickSecond) {
      this.lastTickSecond = secondsLeft;
      sounds.play('tick');
    }
    const player = store.player(gs.currentPlayerId);
    const weaponId = mine ? this.local.weaponId : current?.weaponId;
    this.banner.update({
      round: gs.round,
      totalRounds: gs.totalRounds,
      text: !gs.currentPlayerId ? 'Waiting for players…' : mine ? 'YOUR TURN!' : `${playerName(player)}'s turn`,
      color: mine ? '#ffd166' : colorOf(player?.color).css,
      secondsLeft,
      weapon: weaponId ? getWeapon(weaponId)?.name : undefined,
    });
  }

  /** Things that change on server events: health bars, weapon slots, names. */
  private refreshHud(): void {
    const gs = this.state;
    const room = store.room;
    if (!gs || !room) return;
    this.ensureWeaponOwned();
    this.healthBars.update(room.players, gs.tanks, gs.currentPlayerId);
    const me = store.me;
    if (me) {
      this.weaponPicker.update(me.inventory, this.local.weaponId, this.isMyTurn());
      this.actionBar.update(me, this.myTank(), this.isMyTurn() && !gs.shotInProgress);
    }
    for (const p of room.players) this.tanks.get(p.id)?.setName(p.name, colorOf(p.color).hex);
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10;
