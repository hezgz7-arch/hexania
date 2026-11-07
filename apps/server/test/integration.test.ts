import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  defaultDiscard,
  getPlayerView,
  type ActionResult,
  type ClientAction,
  type GameEvent,
  type JoinResult,
  type StateMessage,
} from '@hexania/engine';
import { createHexaniaServer, type HexaniaServer } from '../src/server';

let server: HexaniaServer;
let url = '';
let dataDir = '';

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'hexania-test-'));
  server = await createHexaniaServer({ dataDir, publicUrl: () => url });
  const port = await server.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  await server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

class Client {
  socket!: Socket;
  last: StateMessage | null = null;
  events: GameEvent[] = [];
  token = '';
  playerId = '';
  errors: string[] = [];
  constructor(public name: string) {}

  async open(): Promise<void> {
    this.socket = connect(url, { transports: ['websocket'], forceNew: true });
    this.socket.on('state', (m: StateMessage) => (this.last = m));
    this.socket.on('events', (m: { events: GameEvent[] }) => this.events.push(...m.events));
    await new Promise<void>((res) => this.socket.on('connect', () => res()));
  }
  join(req: Record<string, unknown>): Promise<JoinResult> {
    return new Promise((res) => this.socket.emit('join', req, res));
  }
  act(a: ClientAction): Promise<ActionResult> {
    return new Promise((res) => this.socket.emit('action', a, res));
  }
  host(cmd: Record<string, unknown>): Promise<ActionResult> {
    return new Promise((res) => this.socket.emit('host', cmd, res));
  }
  close(): void {
    this.socket.close();
  }

  /** One decision from this client's private view; returns false when nothing to do. */
  async step(onlySetup = false): Promise<boolean> {
    const v = this.last?.view;
    if (onlySetup && v?.phase !== 'setup') return false;
    const me = v?.me;
    if (!v || !me || v.phase === 'finished') return false;
    const L = me.legal;
    let a: ClientAction | null = null;
    if (L.discard !== null) a = { type: 'DISCARD', cards: defaultDiscard(me.hand, L.discard) };
    else if (L.setup === 'settlement') a = { type: 'BUILD_SETTLEMENT', vertexId: L.settlements[0]! };
    else if (L.setup === 'road') a = { type: 'BUILD_ROAD', edgeId: L.roads[0]! };
    else if (L.rollDice) a = { type: 'ROLL_DICE' };
    else if (L.robber.length) {
      const r = L.robber[0]!;
      a = { type: 'MOVE_ROBBER', hexId: r.hexId, ...(r.victims[0] ? { victimId: r.victims[0] } : {}) };
    } else if (v.phase === 'roadBuilding' && L.roads.length) a = { type: 'BUILD_ROAD', edgeId: L.roads[0]! };
    else if (L.cities.length) a = { type: 'BUILD_CITY', vertexId: L.cities[0]! };
    else if (L.settlements.length) a = { type: 'BUILD_SETTLEMENT', vertexId: L.settlements[0]! };
    else if (L.buyDevCard) a = { type: 'BUY_DEV_CARD' };
    else if (L.roads.length) a = { type: 'BUILD_ROAD', edgeId: L.roads[0]! };
    else if (L.playKnight) a = { type: 'PLAY_KNIGHT' };
    else if (L.endTurn) {
      // convert surplus into what cities and dev cards need, so games do not stall
      const want = me.hand.ore < 3 ? 'ore' : me.hand.grain < 2 ? 'grain' : me.hand.wool < 1 ? 'wool' : null;
      const t = want && L.bankTrades.find((b) => b.receive === want && b.give !== want && me.hand[b.give] >= b.ratio + (['ore', 'grain'].includes(b.give) ? 3 : 0));
      a = t ? { type: 'BANK_TRADE', give: t.give, receive: t.receive } : { type: 'END_TURN' };
    }
    else if (L.passSpecial) a = { type: 'PASS_SPECIAL' };
    if (!a) return false;
    const r = await this.act(a);
    if (!r.ok) this.errors.push(`${a.type}: ${r.code} ${r.message}`);
    return true;
  }
}

const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error('timeout waiting for condition');
    await tick(10);
  }
}

async function newTable(n = 4) {
  const res = await fetch(`${url}/api/rooms`, { method: 'POST' });
  const { code, hostToken } = (await res.json()) as { code: string; hostToken: string };
  const board = new Client('board');
  await board.open();
  const j = await board.join({ room: code, role: 'board', hostToken });
  expect(j).toMatchObject({ ok: true, isHost: true });
  const players: Client[] = [];
  for (let i = 0; i < n; i++) {
    const c = new Client(`Jugador${i}`);
    await c.open();
    const r = await c.join({ room: code, role: 'player', name: c.name });
    if (!r.ok) throw new Error(r.message);
    c.token = r.token!;
    c.playerId = r.playerId!;
    players.push(c);
  }
  return { code, hostToken, board, players };
}

describe('rooms and play over sockets', () => {
  it('four phones and a tablet play a whole game without errors, only seeing their own cards', async () => {
    const { code, board, players } = await newTable(4);
    await waitFor(() => board.last?.room.seats.length === 4);
    expect(board.last!.room.status).toBe('lobby');

    // a non-host cannot start
    expect((await players[0]!.host({ cmd: 'start' })).ok).toBe(false);
    expect((await board.host({ cmd: 'start' })).ok).toBe(true);
    await waitFor(() => players.every((p) => p.last?.view?.phase === 'setup'));

    let guard = 0;
    while (board.last!.view!.phase !== 'finished' && guard++ < 30000) {
      let moved = false;
      for (const p of players) moved = (await p.step()) || moved;
      if (!moved) await tick(5);
      // privacy: the tablet and the other phones never get anyone's hand
      if (guard % 300 === 0) {
        expect(board.last!.view!.me).toBeNull();
        expect(JSON.stringify(board.last!.view!.players)).not.toContain('"lumber"');
      }
    }
    expect(players.flatMap((p) => p.errors)).toEqual([]);
    const bv = board.last!.view!;
    if (bv.phase !== 'finished') console.log('STUCK', guard, bv.phase, bv.turn, bv.active, JSON.stringify(bv.players.map((p) => [p.publicVP, p.handCount])), JSON.stringify(players.map((p) => p.last!.view!.me!.legal)).slice(0, 1500));
    expect(bv.phase).toBe('finished');
    expect(board.last!.view!.winner).not.toBeNull();
    expect(board.last!.view!.finalScores!.length).toBe(4);
    expect(board.last!.room.status).toBe('finished');
    // everyone saw the events stream; theft/dev-card details are redacted for outsiders
    expect(board.events.some((e) => e.type === 'GAME_WON')).toBe(true);
    for (const e of board.events) {
      if (e.type === 'CARD_STOLEN') expect('resource' in e).toBe(false);
      if (e.type === 'DEV_CARD_BOUGHT') expect('card' in e).toBe(false);
    }
    expect(server.rooms.get(code)!.status).toBe('finished');
    [board, ...players].forEach((c) => c.close());
  }, 240_000);

  it('rejects an action from the wrong player and from spectators', async () => {
    const { board, players } = await newTable(3);
    await board.host({ cmd: 'start' });
    await waitFor(() => players.every((p) => p.last?.view?.phase === 'setup'));
    const notActive = players.find((p) => p.last!.view!.active !== p.playerId)!;
    const r = await notActive.act({ type: 'ROLL_DICE' });
    expect(r.ok).toBe(false);
    const spectator = await new Promise<ActionResult>((res) => board.socket.emit('action', { type: 'END_TURN' }, res));
    expect(spectator.ok).toBe(false);
    [board, ...players].forEach((c) => c.close());
  });

  it('a reload resumes the same seat with the same private view', async () => {
    const { code, board, players } = await newTable(3);
    await board.host({ cmd: 'start' });
    await waitFor(() => players.every((p) => p.last?.view?.phase === 'setup'));
    for (let i = 0; i < 30; i++) for (const p of players) await p.step();
    const victim = players[1]!;
    await tick(150); // let every in-flight update land
    const truth = () => JSON.stringify(getPlayerView(server.rooms.get(code)!.state!, victim.playerId));
    victim.close();
    await waitFor(() => board.last!.room.seats.find((s) => s.playerId === victim.playerId)!.connected === false);

    const again = new Client('again');
    await again.open();
    const r = await again.join({ room: code, role: 'player', token: victim.token });
    expect(r).toMatchObject({ ok: true, playerId: victim.playerId, token: victim.token });
    await waitFor(() => again.last?.view?.me?.id === victim.playerId);
    expect(JSON.stringify(again.last!.view)).toBe(truth());
    await waitFor(() => board.last!.room.seats.find((s) => s.playerId === victim.playerId)!.connected);

    // a stranger cannot take a seat in a running game, and a bad token does not grant one
    const stranger = new Client('stranger');
    await stranger.open();
    const bad = await stranger.join({ room: code, role: 'player', token: 'nope' });
    expect(bad.ok).toBe(false);
    [board, again, stranger, ...players].forEach((c) => c.close());
  });

  it('host can kick a player, who is replaced by a newcomer taking the vacant seat', async () => {
    const { code, board, players } = await newTable(3);
    await board.host({ cmd: 'start' });
    await waitFor(() => players.every((p) => p.last?.view?.phase === 'setup'));
    const gone = players[2]!;
    expect((await board.host({ cmd: 'kick', playerId: gone.playerId })).ok).toBe(true);
    await waitFor(() => board.last!.room.seats.some((s) => s.vacant));
    const newcomer = new Client('new');
    await newcomer.open();
    const r = await newcomer.join({ room: code, role: 'player', name: 'Nuevo' });
    expect(r).toMatchObject({ ok: true, playerId: gone.playerId });
    expect(r.ok && r.token).not.toBe(gone.token);
    // the kicked token no longer works
    const old = new Client('old');
    await old.open();
    expect((await old.join({ room: code, role: 'player', token: gone.token })).ok).toBe(false);
    [board, newcomer, old, ...players].forEach((c) => c.close());
  });

  it('pause blocks actions; undo reverts the last build', async () => {
    const { board, players } = await newTable(3);
    await board.host({ cmd: 'start' });
    await waitFor(() => players.every((p) => p.last?.view?.phase === 'setup'));
    // play out setup
    let guard = 0;
    while (board.last!.view!.phase === 'setup' && guard++ < 400) {
      for (const p of players) await p.step(true);
      await tick(5);
    }
    await waitFor(() => players.every((p) => p.last!.view!.phase === 'roll'));
    const active = players.find((p) => p.last!.view!.active === p.playerId)!;
    await board.host({ cmd: 'pause' });
    await waitFor(() => board.last!.room.paused);
    expect((await active.act({ type: 'ROLL_DICE' })).ok).toBe(false);
    await board.host({ cmd: 'resume' });
    await waitFor(() => !board.last!.room.paused);
    expect((await active.act({ type: 'ROLL_DICE' })).ok).toBe(true);
    // give the active player something to build by playing until a build happens, then undo it
    let built = false;
    for (let i = 0; i < 4000 && !built; i++) {
      for (const p of players) await p.step();
      built = board.last!.room.canUndo;
    }
    if (built) {
      const roadsBefore = JSON.stringify(board.last!.view!.roads) + JSON.stringify(board.last!.view!.buildings);
      expect((await board.host({ cmd: 'undo' })).ok).toBe(true);
      await waitFor(() => !board.last!.room.canUndo);
      expect(JSON.stringify(board.last!.view!.roads) + JSON.stringify(board.last!.view!.buildings)).not.toBe(roadsBefore);
    }
    [board, ...players].forEach((c) => c.close());
  }, 60_000);

  it('game state survives a server restart', async () => {
    const { code, hostToken, board, players } = await newTable(3);
    await board.host({ cmd: 'start' });
    await waitFor(() => players.every((p) => p.last?.view?.phase === 'setup'));
    for (let i = 0; i < 20; i++) for (const p of players) await p.step();
    await tick(150);
    const view = JSON.stringify(players[0]!.last!.view);
    const token = players[0]!.token;
    [board, ...players].forEach((c) => c.close());
    await tick(400); // let the debounced write land

    const second = await createHexaniaServer({ dataDir, publicUrl: () => url });
    const port2 = await second.listen(0, '127.0.0.1');
    const oldUrl = url;
    url = `http://127.0.0.1:${port2}`;
    try {
      const c = new Client('back');
      await c.open();
      const r = await c.join({ room: code, role: 'player', token });
      expect(r.ok).toBe(true);
      await waitFor(() => c.last?.view?.me?.id === players[0]!.playerId);
      expect(JSON.stringify(c.last!.view)).toBe(view);
      const b = new Client('board2');
      await b.open();
      expect(await b.join({ room: code, role: 'board', hostToken })).toMatchObject({ ok: true, isHost: true });
      c.close();
      b.close();
    } finally {
      url = oldUrl;
      await second.close();
    }
  });

  it('bots fill empty seats and play on their own', async () => {
    const { board, players } = await newTable(1);
    await board.host({ cmd: 'addBot' });
    await board.host({ cmd: 'addBot' });
    await waitFor(() => board.last!.room.seats.length === 3);
    expect((await board.host({ cmd: 'start' })).ok).toBe(true);
    // the human only does setup + keeps ending turns; bots must move the game on
    let guard = 0;
    while (board.last!.view!.turn < 6 && guard++ < 2000) {
      await players[0]!.step();
      await tick(10);
    }
    expect(board.last!.view!.turn).toBeGreaterThanOrEqual(6);
    expect(players[0]!.errors).toEqual([]);
    [board, ...players].forEach((c) => c.close());
  }, 60_000);

  it('turn timer ends an idle turn', async () => {
    const { board, players } = await newTable(3);
    await board.host({ cmd: 'start' });
    await board.host({ cmd: 'setTimer', seconds: 1 });
    await waitFor(() => players.every((p) => p.last?.view?.phase === 'setup'));
    const start = board.last!.view!.setupStep;
    await waitFor(() => board.last!.view!.setupStep !== start, 4000);
    expect(board.last!.room.deadline).not.toBeNull();
    [board, ...players].forEach((c) => c.close());
  }, 15_000);
});
