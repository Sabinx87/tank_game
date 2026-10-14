import {
  DEFAULT_ROUNDS,
  EMPTY_ROOM_TTL_MS,
  LOBBY_DISCONNECT_GRACE_MS,
  MAX_ANGLE,
  MAX_PLAYERS,
  MAX_POWER,
  MIN_ANGLE,
  MIN_PLAYERS_TO_START,
  MIN_POWER,
  POST_SHOT_DELAY_MS,
  RECONNECT_WINDOW_MS,
  ROUND_END_DELAY_MS,
  SERVER_TICK_HZ,
  TURN_TIME_MS,
} from '@shared/constants';
import type { AckResult, ColorId, GameState, JoinedRoom, Phase, RoomState, RoundResults } from '@shared/types';
import { getWeapon } from '@shared/weapons';
import type { GameSocket, IO } from './io';
import { Player } from './Player';
import { Battlefield } from './systems/Battlefield';
import { Scoring } from './systems/Scoring';
import { buyWeapon, canUseWeapon, consumeWeapon } from './systems/Shop';
import { TurnSystem } from './systems/TurnSystem';
import { cleanName, isColorId, isFiniteNumber, isMoveDir, isWeaponId } from './validation';

const ok = <T>(data: T): AckResult<T> => ({ ok: true, data });
const fail = (error: string): AckResult<never> => ({ ok: false, error });

/**
 * One room: its players, phase (lobby → playing → roundEnd → ... → finished),
 * and the systems that run a match. Every client intention is validated here.
 */
export class GameRoom {
  readonly players = new Map<string, Player>();
  phase: Phase = 'lobby';
  hostId = '';
  round = 0;
  totalRounds = Number(process.env.ROUNDS) || DEFAULT_ROUNDS;
  lastRoundResults: RoundResults | null = null;

  private battlefield: Battlefield | null = null;
  private readonly turns = new TurnSystem();
  private readonly scoring = new Scoring();
  private tickTimer: NodeJS.Timeout | null = null;
  private readonly pending = new Set<NodeJS.Timeout>();
  private readonly removalTimers = new Map<string, NodeJS.Timeout>();
  private emptyTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(
    readonly code: string,
    private readonly io: IO,
    private readonly onEmpty: (room: GameRoom) => void,
  ) {}

  private get channel(): string {
    return `room:${this.code}`;
  }

  // ================================================================ membership

  join(socket: GameSocket): AckResult<JoinedRoom> {
    if (this.phase !== 'lobby') return fail('That game has already started');
    if (this.players.size >= MAX_PLAYERS) return fail(`Room is full (max ${MAX_PLAYERS} players)`);
    const player = new Player(socket.id);
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    this.attach(socket, player);
    this.broadcastRoom();
    return ok({ code: this.code, playerId: player.id, token: player.token });
  }

  rejoin(socket: GameSocket, token: string): AckResult<JoinedRoom> {
    const player = [...this.players.values()].find((p) => p.token === token);
    if (!player || player.left) return fail('Your seat in this room is no longer available');
    if (!player.connected && player.disconnectedAt !== null && Date.now() - player.disconnectedAt > RECONNECT_WINDOW_MS) {
      return fail('The reconnect window has expired');
    }
    if (player.connected && player.socketId !== socket.id) {
      // Same seat opened in another tab (or a stale socket): the newest one wins.
      const old = this.io.sockets.sockets.get(player.socketId!);
      if (old) {
        old.emit('server:error', 'This seat was opened in another tab');
        old.leave(this.channel);
        old.data = {};
        old.disconnect(true);
      }
    }
    this.attach(socket, player);
    this.reassignHostIfNeeded();
    this.broadcastRoom();
    if (this.phase === 'playing' && this.battlefield) {
      socket.emit('game:state', this.gameState());
      // Nobody could play while everyone was away: resume.
      if (this.turns.currentPlayerId === null && !this.battlefield.shotInProgress) this.nextTurn();
    }
    return ok({ code: this.code, playerId: player.id, token: player.token });
  }

  /** Leaving on purpose: lobby seats are freed, in-game tanks stay but are skipped. */
  leave(socket: GameSocket, playerId: string): void {
    const player = this.players.get(playerId);
    socket.leave(this.channel);
    socket.data = {};
    if (!player) return;
    if (this.phase === 'lobby') {
      this.removePlayer(playerId);
      return;
    }
    player.left = true;
    this.markDisconnected(player);
  }

  handleDisconnect(playerId: string, socketId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.socketId !== socketId) return; // already replaced by a newer socket
    this.markDisconnected(player);
  }

  private attach(socket: GameSocket, player: Player): void {
    player.socketId = socket.id;
    player.disconnectedAt = null;
    socket.join(this.channel);
    socket.data = { code: this.code, playerId: player.id };
    const t = this.removalTimers.get(player.id);
    if (t) clearTimeout(t);
    this.removalTimers.delete(player.id);
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.emptyTimer = null;
  }

  private markDisconnected(player: Player): void {
    player.socketId = null;
    player.disconnectedAt = Date.now();
    player.ready = false;

    if (this.phase === 'lobby') {
      this.removalTimers.set(
        player.id,
        setTimeout(() => this.removePlayer(player.id), player.left ? 0 : LOBBY_DISCONNECT_GRACE_MS).unref(),
      );
    }
    this.reassignHostIfNeeded();

    if (this.phase === 'playing' && this.battlefield && this.turns.isCurrent(player.id)) {
      this.battlefield.moveDir = 0;
      if (!this.battlefield.shotInProgress) {
        this.io.to(this.channel).emit('game:turnSkipped', { playerId: player.id, reason: 'disconnected' });
        this.nextTurn();
      }
    }
    if (this.phase === 'roundEnd') this.maybeStartNextRound();

    this.broadcastRoom();
    this.checkEmpty();
  }

  private removePlayer(playerId: string): void {
    this.removalTimers.delete(playerId);
    if (!this.players.delete(playerId)) return;
    this.reassignHostIfNeeded();
    this.broadcastRoom();
    this.checkEmpty();
  }

  private reassignHostIfNeeded(): void {
    const host = this.players.get(this.hostId);
    if (host?.connected) return;
    const next = [...this.players.values()].find((p) => p.connected) ?? [...this.players.values()][0];
    this.hostId = next?.id ?? '';
  }

  private checkEmpty(): void {
    if (this.destroyed) return;
    if (this.players.size === 0) {
      this.destroy();
      return;
    }
    const anyoneHere = [...this.players.values()].some((p) => p.connected);
    if (!anyoneHere && !this.emptyTimer) {
      this.emptyTimer = setTimeout(() => this.destroy(), EMPTY_ROOM_TTL_MS).unref();
    }
  }

  get isEmpty(): boolean {
    return ![...this.players.values()].some((p) => p.connected);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.turns.clearTimer();
    this.stopTick();
    for (const t of this.pending) clearTimeout(t);
    for (const t of this.removalTimers.values()) clearTimeout(t);
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.pending.clear();
    this.removalTimers.clear();
    this.onEmpty(this);
  }

  // ================================================================ waiting room

  setProfile(playerId: string, payload: { name?: unknown; color?: unknown }): AckResult<null> {
    if (this.phase !== 'lobby') return fail('You can only change your profile in the waiting room');
    const player = this.players.get(playerId);
    if (!player) return fail('You are not in this room');

    let name = player.name;
    let color = player.color;
    if (payload.name !== undefined) {
      const cleaned = cleanName(payload.name);
      if (cleaned === null) return fail('Name must be 1–16 characters');
      name = cleaned;
    }
    if (payload.color !== undefined) {
      if (!isColorId(payload.color)) return fail('Unknown color');
      const takenBy = [...this.players.values()].find((p) => p.id !== playerId && p.color === payload.color);
      if (takenBy) return fail('That color is already taken');
      color = payload.color as ColorId;
    }
    player.name = name;
    player.color = color;
    this.broadcastRoom();
    return ok(null);
  }

  /** Why the game can't start yet, or null if it can. */
  startBlocker(): string | null {
    const present = [...this.players.values()].filter((p) => p.connected);
    if (present.length < MIN_PLAYERS_TO_START) return `Need at least ${MIN_PLAYERS_TO_START} players`;
    if (present.some((p) => !p.hasProfile)) return 'Everyone needs a name and a color';
    return null;
  }

  start(playerId: string): AckResult<null> {
    if (playerId !== this.hostId) return fail('Only the host can start the game');
    if (this.phase !== 'lobby') return fail('The game has already started');
    const blocker = this.startBlocker();
    if (blocker) return fail(blocker);

    // Seats of people who dropped out of the waiting room are released now.
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    for (const t of this.removalTimers.values()) clearTimeout(t);
    this.removalTimers.clear();

    for (const p of this.players.values()) p.resetForNewGame();
    this.round = 1;
    this.lastRoundResults = null;
    this.phase = 'playing';
    this.startTick();
    this.startRound();
    return ok(null);
  }

  backToLobby(playerId: string): void {
    if (playerId !== this.hostId || this.phase !== 'finished') return;
    for (const p of [...this.players.values()]) {
      if (!p.connected) this.players.delete(p.id);
      else p.resetForNewGame();
    }
    this.phase = 'lobby';
    this.round = 0;
    this.lastRoundResults = null;
    this.battlefield = null;
    this.reassignHostIfNeeded();
    this.broadcastRoom();
  }

  // ================================================================ rounds & turns

  private startRound(): void {
    const ids = [...this.players.keys()];
    this.battlefield = new Battlefield(ids);
    this.turns.startRound(ids);
    this.scoring.startRound(ids);
    for (const p of this.players.values()) p.ready = false;
    this.broadcastRoom();
    this.nextTurn();
  }

  private isRoundOver(): boolean {
    return !this.battlefield || this.battlefield.aliveIds().size <= 1;
  }

  private nextTurn(): void {
    const bf = this.battlefield;
    if (!bf || this.phase !== 'playing' || this.destroyed) return;
    if (this.isRoundOver()) {
      this.endRound();
      return;
    }
    const id = this.turns.advance((pid) => !!bf.tanks.get(pid)?.alive && !!this.players.get(pid)?.connected);
    if (!id) {
      // Every living tank's owner is offline. Check again shortly.
      this.schedule(() => {
        if (this.turns.currentPlayerId === null) this.nextTurn();
      }, 2000);
      this.broadcastGame();
      return;
    }
    bf.rollWind();
    bf.beginTurn(id);
    this.turns.startTimer(TURN_TIME_MS, () => {
      if (bf.shotInProgress) return;
      this.io.to(this.channel).emit('game:turnSkipped', { playerId: id, reason: 'timeout' });
      this.nextTurn();
    });
    this.broadcastGame();
  }

  private endRound(): void {
    const bf = this.battlefield;
    if (!bf) return;
    this.turns.clearTimer();
    this.turns.currentPlayerId = null;
    this.lastRoundResults = this.scoring.finishRound([...this.players.values()], bf.aliveIds(), this.round, this.totalRounds);
    this.phase = this.lastRoundResults.isFinal ? 'finished' : 'roundEnd';
    for (const p of this.players.values()) p.ready = false;
    this.battlefield = null;
    if (this.phase === 'finished') this.stopTick();
    this.broadcastRoom();
  }

  private maybeStartNextRound(): void {
    if (this.phase !== 'roundEnd') return;
    const present = [...this.players.values()].filter((p) => p.connected);
    if (present.length === 0 || present.some((p) => !p.ready)) return;
    this.round += 1;
    this.phase = 'playing';
    this.startRound();
  }

  // ================================================================ in-game intentions

  private canAct(playerId: string): Battlefield | null {
    const bf = this.battlefield;
    if (this.phase !== 'playing' || !bf || bf.shotInProgress || !this.turns.isCurrent(playerId)) return null;
    if (!bf.tanks.get(playerId)?.alive) return null;
    return bf;
  }

  move(playerId: string, dir: unknown): void {
    const bf = this.canAct(playerId);
    if (!bf || !isMoveDir(dir)) return;
    bf.moveDir = dir;
  }

  aim(playerId: string, payload: { angle?: unknown; power?: unknown; weaponId?: unknown }): void {
    const bf = this.canAct(playerId);
    const player = this.players.get(playerId);
    if (!bf || !player || !isFiniteNumber(payload.angle) || !isFiniteNumber(payload.power)) return;
    const current = bf.tanks.get(playerId)!.weaponId;
    const weaponId = isWeaponId(payload.weaponId) && canUseWeapon(player, payload.weaponId) ? payload.weaponId : current;
    const update = bf.setAim(playerId, payload.angle, payload.power, weaponId);
    if (update) this.io.to(this.channel).emit('game:tank', update);
  }

  fire(playerId: string, payload: { angle?: unknown; power?: unknown; weaponId?: unknown }): AckResult<null> {
    const bf = this.canAct(playerId);
    const player = this.players.get(playerId);
    if (!bf || !player) return fail("It's not your turn");
    const { angle, power, weaponId } = payload;
    if (!isFiniteNumber(angle) || angle < MIN_ANGLE || angle > MAX_ANGLE) return fail('Angle out of range');
    if (!isFiniteNumber(power) || power < MIN_POWER || power > MAX_POWER) return fail('Power out of range');
    if (!isWeaponId(weaponId)) return fail('Unknown weapon');
    if (!canUseWeapon(player, weaponId)) return fail("You don't have that weapon");

    consumeWeapon(player, weaponId);
    this.turns.clearTimer();
    bf.shotInProgress = true;
    const shot = bf.fire(playerId, getWeapon(weaponId)!, angle, power);
    this.scoring.recordShot(shot);
    this.io.to(this.channel).emit('game:shot', shot);
    this.broadcastRoom(); // inventory changed

    const delay = shot.duration * 1000 + POST_SHOT_DELAY_MS + (this.isRoundOver() ? ROUND_END_DELAY_MS : 0);
    this.schedule(() => {
      bf.shotInProgress = false;
      this.nextTurn();
    }, delay);
    return ok(null);
  }

  // ================================================================ shop

  buy(playerId: string, weaponId: unknown): AckResult<null> {
    if (this.phase !== 'roundEnd') return fail('The shop is closed');
    const player = this.players.get(playerId);
    if (!player) return fail('You are not in this room');
    if (!isWeaponId(weaponId)) return fail('Unknown weapon');
    const error = buyWeapon(player, weaponId);
    if (error) return fail(error);
    this.broadcastRoom();
    return ok(null);
  }

  setReady(playerId: string, ready: unknown): void {
    const player = this.players.get(playerId);
    if (this.phase !== 'roundEnd' || !player) return;
    player.ready = ready === true;
    this.broadcastRoom();
    this.maybeStartNextRound();
  }

  // ================================================================ broadcasting

  roomState(): RoomState {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players: [...this.players.values()].map((p) => p.toInfo(this.hostId)),
      round: this.round,
      totalRounds: this.totalRounds,
      lastRoundResults: this.lastRoundResults,
    };
  }

  gameState(): GameState {
    const bf = this.battlefield!;
    return {
      round: this.round,
      totalRounds: this.totalRounds,
      terrain: bf.terrain,
      tanks: [...bf.tanks.values()].map((t) => ({ ...t })),
      turnOrder: this.turns.order,
      currentPlayerId: this.turns.currentPlayerId,
      wind: bf.wind,
      turnTimeLeftMs: this.turns.timeLeftMs(),
      shotInProgress: bf.shotInProgress,
    };
  }

  private broadcastRoom(): void {
    if (this.destroyed) return;
    this.io.to(this.channel).emit('room:state', this.roomState());
  }

  private broadcastGame(): void {
    if (this.destroyed || !this.battlefield) return;
    this.io.to(this.channel).emit('game:state', this.gameState());
  }

  // ================================================================ timers

  private schedule(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.pending.delete(t);
      if (!this.destroyed) fn();
    }, ms);
    this.pending.add(t);
  }

  private startTick(): void {
    this.stopTick();
    const dt = 1 / SERVER_TICK_HZ;
    this.tickTimer = setInterval(() => {
      const id = this.turns.currentPlayerId;
      if (this.phase !== 'playing' || !this.battlefield || !id) return;
      const update = this.battlefield.tickMovement(id, dt);
      if (update) this.io.to(this.channel).emit('game:tank', update);
    }, 1000 / SERVER_TICK_HZ);
  }

  private stopTick(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }
}
