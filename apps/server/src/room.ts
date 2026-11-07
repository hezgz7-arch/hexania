import { randomBytes } from 'node:crypto';
import {
  EngineError,
  PLAYER_COLORS,
  applyAction,
  activePlayerId,
  chooseBotAction,
  createGame,
  forceEndTurn,
  getPlayerView,
  type Action,
  type ClientAction,
  type GameEvent,
  type GameState,
  type HostCommand,
  type NumberMode,
  type PlayerColor,
  type RoomInfo,
  type SeatInfo,
  type StateMessage,
} from '@hexania/engine';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
const BOT_NAMES = ['Aldara', 'Brumo', 'Cálix', 'Dorna', 'Eskarpa', 'Fendel'];

export interface Seat {
  playerId: string;
  name: string;
  color: PlayerColor;
  bot: boolean;
  /** null = vacant */
  token: string | null;
  connected: boolean;
}

/** What is written to disk. */
export interface RoomRecord {
  code: string;
  hostToken: string;
  createdAt: number;
  updatedAt: number;
  status: 'lobby' | 'playing' | 'finished';
  seats: Omit<Seat, 'connected'>[];
  state: GameState | null;
  numberMode: NumberMode;
  timerSeconds: number;
  paused: boolean;
  demo: boolean;
  seq: number;
}

export class RoomError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const newToken = () => randomBytes(16).toString('hex');
const cleanName = (n: unknown, fallback: string) => {
  const s = typeof n === 'string' ? n.replace(/\s+/g, ' ').trim().slice(0, 16) : '';
  return s || fallback;
};
const BUILD_ACTIONS = new Set(['BUILD_ROAD', 'BUILD_SETTLEMENT', 'BUILD_CITY']);

export interface RoomHooks {
  /** state changed: send every client its view */
  changed(room: Room): void;
  events(room: Room, events: GameEvent[], seq: number): void;
  notice(room: Room, text: string): void;
  /** persist soon */
  dirty(room: Room): void;
}

export class Room {
  code: string;
  hostToken: string;
  createdAt: number;
  updatedAt: number;
  status: RoomRecord['status'] = 'lobby';
  seats: Seat[] = [];
  state: GameState | null = null;
  numberMode: NumberMode = 'spiral';
  timerSeconds = 0;
  paused = false;
  demo = false;
  seq = 0;
  /** snapshot before the last build, for the host's undo */
  private undoState: GameState | null = null;
  private deadline: number | null = null;
  private remainingMs: number | null = null;
  private deadlineKey = '';
  private turnTimer: NodeJS.Timeout | null = null;
  private botTimer: NodeJS.Timeout | null = null;
  private botRng: { rng: number };

  constructor(
    code: string,
    private hooks: RoomHooks,
    private publicUrl: () => string,
    record?: RoomRecord,
  ) {
    this.code = code;
    this.botRng = { rng: (Date.now() ^ 0x9e3779b9) >>> 0 };
    if (record) {
      this.hostToken = record.hostToken;
      this.createdAt = record.createdAt;
      this.updatedAt = record.updatedAt;
      this.status = record.status;
      this.seats = record.seats.map((s) => ({ ...s, connected: false }));
      this.state = record.state;
      this.numberMode = record.numberMode;
      this.timerSeconds = record.timerSeconds;
      this.paused = record.paused;
      this.demo = record.demo;
      this.seq = record.seq;
    } else {
      this.hostToken = newToken();
      this.createdAt = this.updatedAt = Date.now();
    }
  }

  toRecord(): RoomRecord {
    return {
      code: this.code,
      hostToken: this.hostToken,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      status: this.status,
      seats: this.seats.map(({ connected: _c, ...s }) => s),
      state: this.state,
      numberMode: this.numberMode,
      timerSeconds: this.timerSeconds,
      paused: this.paused,
      demo: this.demo,
      seq: this.seq,
    };
  }

  /** After loading from disk or creating: arm timers and bots. */
  resume(): void {
    this.afterChange(false);
  }

  dispose(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
    this.turnTimer = this.botTimer = null;
  }

  // ---------------------------------------------------------------- seats

  seatByToken(token: string | undefined): Seat | undefined {
    return token ? this.seats.find((s) => s.token === token) : undefined;
  }
  seatInfo(): SeatInfo[] {
    return this.seats.map((s) => ({
      playerId: s.playerId,
      name: s.name,
      color: s.color,
      connected: s.bot || s.connected,
      bot: s.bot,
      vacant: s.token === null && !s.bot,
    }));
  }
  vacantSeats(): SeatInfo[] {
    return this.seatInfo().filter((s) => s.vacant);
  }

  private freeColor(wanted?: PlayerColor): PlayerColor {
    const used = new Set(this.seats.map((s) => s.color));
    if (wanted && PLAYER_COLORS.includes(wanted) && !used.has(wanted)) return wanted;
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? 'red';
  }

  /** Joins as a player. Returns the seat (new, reclaimed or taken over). */
  joinPlayer(opts: { token?: string; name?: string; color?: PlayerColor; seat?: string }): Seat {
    const known = this.seatByToken(opts.token);
    if (known) {
      if (opts.name && this.status === 'lobby') known.name = cleanName(opts.name, known.name);
      return known;
    }
    if (this.status === 'lobby') {
      if (this.seats.length >= MAX_PLAYERS) throw new RoomError('ROOM_FULL', 'La sala está llena (máximo 6 jugadores)');
      // a demo room holds a vacant human seat
      const vacant = this.seats.find((s) => s.token === null && !s.bot);
      if (vacant) {
        vacant.token = newToken();
        vacant.name = cleanName(opts.name, vacant.name);
        this.touch();
        return vacant;
      }
      const idx = this.seats.length;
      const seat: Seat = {
        playerId: `p${this.nextSeatNumber()}`,
        name: cleanName(opts.name, `Jugador ${idx + 1}`),
        color: this.freeColor(opts.color),
        bot: false,
        token: newToken(),
        connected: false,
      };
      this.seats.push(seat);
      this.touch();
      return seat;
    }
    const vacant = this.seats.filter((s) => s.token === null && !s.bot);
    if (!vacant.length) throw new RoomError('IN_PROGRESS', 'La partida ya ha empezado y no hay asientos libres');
    const target = opts.seat ? vacant.find((s) => s.playerId === opts.seat) : vacant.length === 1 ? vacant[0] : undefined;
    if (!target) throw new RoomError('CHOOSE_SEAT', 'Elige el asiento que quieres ocupar');
    target.token = newToken();
    if (opts.name) target.name = cleanName(opts.name, target.name);
    if (this.state) {
      const p = this.state.players.find((x) => x.id === target.playerId);
      if (p) p.name = target.name;
    }
    this.touch();
    return target;
  }

  private nextSeatNumber(): number {
    let n = 0;
    const ids = new Set(this.seats.map((s) => s.playerId));
    while (ids.has(`p${n}`)) n++;
    return n;
  }

  setConnected(playerId: string, connected: boolean): void {
    const s = this.seats.find((x) => x.playerId === playerId);
    if (s && s.connected !== connected) {
      s.connected = connected;
      this.hooks.changed(this);
    }
  }

  // ---------------------------------------------------------------- game

  private start(): void {
    if (this.status !== 'lobby') throw new RoomError('BAD_STATE', 'La partida ya ha empezado');
    if (this.seats.some((s) => s.token === null && !s.bot)) throw new RoomError('BAD_STATE', 'Falta jugador en un asiento');
    if (this.seats.length < MIN_PLAYERS) throw new RoomError('NOT_ENOUGH', `Hacen falta al menos ${MIN_PLAYERS} jugadores`);
    const seed = randomBytes(4).readUInt32BE(0);
    this.state = createGame(
      {
        players: this.seats.map((s) => ({ id: s.playerId, name: s.name, color: s.color })),
        numberMode: this.numberMode,
      },
      seed,
    );
    this.status = 'playing';
    this.undoState = null;
    this.paused = false;
    this.seq++;
    this.hooks.events(this, [{ type: 'GAME_STARTED', order: this.state.players.map((p) => p.id) }], this.seq);
    this.afterChange(true);
  }

  act(playerId: string, action: ClientAction): void {
    if (this.status !== 'playing' || !this.state) throw new RoomError('BAD_STATE', 'La partida no está en curso');
    if (this.paused) throw new RoomError('PAUSED', 'La partida está en pausa');
    const full = { ...action, playerId } as Action;
    this.apply(full);
  }

  private apply(action: Action): void {
    const before = this.state!;
    let result;
    try {
      result = applyAction(before, action);
    } catch (e) {
      if (e instanceof EngineError) throw new RoomError(e.code, e.message);
      throw e;
    }
    this.undoState = BUILD_ACTIONS.has(action.type) && before.phase !== 'setup' ? before : null;
    this.commit(result.state, result.events);
  }

  private commit(next: GameState, events: GameEvent[]): void {
    this.state = next;
    if (next.phase === 'finished') this.status = 'finished';
    this.seq++;
    if (events.length) this.hooks.events(this, events, this.seq);
    this.afterChange(true);
  }

  // ---------------------------------------------------------------- host

  host(cmd: HostCommand): void {
    switch (cmd.cmd) {
      case 'start':
        return this.start();
      case 'pause':
        if (this.status !== 'playing') throw new RoomError('BAD_STATE', 'No hay partida en curso');
        this.paused = true;
        this.hooks.notice(this, 'Partida en pausa');
        return this.afterChange(false);
      case 'resume':
        this.paused = false;
        this.hooks.notice(this, 'La partida continúa');
        return this.afterChange(false);
      case 'addBot': {
        if (this.status !== 'lobby') throw new RoomError('BAD_STATE', 'Solo antes de empezar');
        if (this.seats.length >= MAX_PLAYERS) throw new RoomError('ROOM_FULL', 'La sala está llena');
        const used = new Set(this.seats.map((s) => s.name));
        this.seats.push({
          playerId: `p${this.nextSeatNumber()}`,
          name: BOT_NAMES.find((n) => !used.has(n)) ?? 'Bot',
          color: this.freeColor(),
          bot: true,
          token: null,
          connected: true,
        });
        return this.afterChange(false);
      }
      case 'removeBot': {
        if (this.status !== 'lobby') throw new RoomError('BAD_STATE', 'Solo antes de empezar');
        this.seats = this.seats.filter((s) => !(s.bot && s.playerId === cmd.playerId));
        return this.afterChange(false);
      }
      case 'kick': {
        const seat = this.seats.find((s) => s.playerId === cmd.playerId);
        if (!seat) throw new RoomError('NOT_FOUND', 'Asiento no encontrado');
        if (this.status === 'lobby') this.seats = this.seats.filter((s) => s !== seat);
        else {
          seat.token = null;
          seat.connected = false;
        }
        this.hooks.notice(this, `${seat.name} ha sido expulsado`);
        return this.afterChange(false);
      }
      case 'setTimer': {
        const s = Math.round(Number(cmd.seconds));
        if (!Number.isFinite(s) || s < 0 || s > 600) throw new RoomError('BAD_ARG', 'Tiempo no válido');
        this.timerSeconds = s;
        this.deadlineKey = '';
        return this.afterChange(false);
      }
      case 'setNumberMode':
        if (this.status !== 'lobby') throw new RoomError('BAD_STATE', 'Solo antes de empezar');
        if (cmd.mode !== 'spiral' && cmd.mode !== 'balanced') throw new RoomError('BAD_ARG', 'Modo no válido');
        this.numberMode = cmd.mode;
        return this.afterChange(false);
      case 'undo': {
        if (!this.undoState || this.status !== 'playing') throw new RoomError('BAD_STATE', 'No hay nada que deshacer');
        this.state = this.undoState;
        this.undoState = null;
        this.seq++;
        this.hooks.notice(this, 'Se ha deshecho la última construcción');
        return this.afterChange(true);
      }
      case 'rematch': {
        if (this.status !== 'finished') throw new RoomError('BAD_STATE', 'La partida no ha terminado');
        this.status = 'lobby';
        this.state = null;
        this.undoState = null;
        this.deadlineKey = '';
        return this.afterChange(false);
      }
    }
  }

  // ---------------------------------------------------------------- timers & bots

  private turnKey(): string {
    const s = this.state;
    if (!s) return '';
    return `${s.turn}|${s.phase}|${activePlayerId(s) ?? Object.keys(s.pendingDiscards).sort().join(',')}|${s.setup?.step ?? ''}|${s.special?.queue.length ?? ''}`;
  }

  private afterChange(touch: boolean): void {
    if (touch) this.touch();
    this.updateDeadline();
    this.hooks.changed(this);
    this.hooks.dirty(this);
    this.scheduleBot();
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }

  private updateDeadline(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    const running = this.status === 'playing' && this.state && this.timerSeconds > 0 && this.state.phase !== 'finished';
    if (!running) {
      this.deadline = null;
      this.remainingMs = null;
      this.deadlineKey = '';
      return;
    }
    if (this.paused) {
      if (this.deadline !== null) this.remainingMs = Math.max(0, this.deadline - Date.now());
      this.deadline = null;
      return;
    }
    const key = this.turnKey();
    if (this.remainingMs !== null) {
      this.deadline = Date.now() + this.remainingMs;
      this.remainingMs = null;
    } else if (key !== this.deadlineKey || this.deadline === null) {
      // setup placements get more time than a normal action
      this.deadline = Date.now() + this.timerSeconds * 1000;
    }
    this.deadlineKey = key;
    const wait = Math.max(0, this.deadline! - Date.now());
    this.turnTimer = setTimeout(() => this.onTimeout(key), wait);
  }

  private onTimeout(key: string): void {
    if (!this.state || this.paused || this.status !== 'playing' || key !== this.turnKey()) return;
    const s = this.state;
    try {
      if (s.phase === 'setup') {
        const a = chooseBotAction(s, this.botRng);
        if (a) this.apply(a);
      } else {
        const r = forceEndTurn(s);
        this.undoState = null;
        this.hooks.notice(this, 'Se acabó el tiempo: turno terminado automáticamente');
        this.commit(r.state, r.events);
      }
    } catch (e) {
      console.error('timeout handling failed', e);
    }
  }

  private scheduleBot(): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    if (this.paused || this.status !== 'playing' || !this.state) return;
    const bots = new Set(this.seats.filter((s) => s.bot).map((s) => s.playerId));
    if (!bots.size) return;
    const action = chooseBotAction(this.state, this.botRng, { controls: (id) => bots.has(id), offerChance: 0 });
    if (!action) return;
    const delay = 600 + (this.botRng.rng % 700);
    this.botRng.rng = (Math.imul(this.botRng.rng, 1664525) + 1013904223) >>> 0;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      if (this.paused || this.status !== 'playing' || !this.state) return;
      // recompute: the situation may have changed while we waited
      const a = chooseBotAction(this.state, this.botRng, { controls: (id) => bots.has(id), offerChance: 0 });
      if (!a) return;
      try {
        this.apply(a);
      } catch (e) {
        console.error('bot action failed', e);
        // never stall the bot loop on an unexpected error
        this.botTimer = setTimeout(() => this.scheduleBot(), 1500);
      }
    }, delay);
  }

  // ---------------------------------------------------------------- views

  info(): RoomInfo {
    return {
      code: this.code,
      status: this.status,
      seats: this.seatInfo(),
      paused: this.paused,
      timerSeconds: this.timerSeconds,
      numberMode: this.numberMode,
      deadline: this.deadline,
      canUndo: this.undoState !== null && this.status === 'playing',
      publicUrl: this.publicUrl(),
      serverTime: Date.now(),
      demo: this.demo,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
    };
  }

  message(role: 'board' | 'player', playerId: string | null, isHost: boolean): StateMessage {
    return {
      room: this.info(),
      view: this.state ? getPlayerView(this.state, role === 'player' ? playerId : null) : null,
      you: { playerId, isHost, role },
    };
  }
}
