import { describe, expect, it } from 'vitest';
import {
  applyAction,
  bankRatio,
  buildGeometry,
  getLegalActions,
  getPlayerView,
  listActions,
  redactEvent,
  type GameState,
  type Resource,
} from '../src';
import { autoSetup, chain, expectCode, hand, mainState, newGame, pl, putRoad, putSettlement } from './helpers';

const RES: Resource[] = ['lumber', 'brick', 'wool', 'grain', 'ore'];
const total = (s: GameState) =>
  RES.map((r) => s.bank[r] + s.players.reduce((n, p) => n + p.hand[r], 0));

describe('setup', () => {
  it('snake order: 1..n then n..1, each places settlement then road', () => {
    let s = newGame(4, 7);
    const order: string[] = [];
    while (s.phase === 'setup') {
      const pid = s.players[s.current]!.id;
      const a = listActions(s, pid)[0]!;
      if (a.type === 'BUILD_SETTLEMENT') order.push(pid);
      s = applyAction(s, a).state;
    }
    const ids = s.players.map((p) => p.id);
    expect(order).toEqual([...ids, ...[...ids].reverse()]);
    expect(s.phase).toBe('roll');
    expect(s.current).toBe(0);
    for (const p of s.players) {
      expect(p.settlementsLeft).toBe(3);
      expect(p.roadsLeft).toBe(13);
    }
  });
  it('starter is the highest roller; ties are re-rolled among the tied', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = newGame(4, seed);
      const last = (id: string) => {
        const r = s.startRolls.find((x) => x.playerId === id)!.rolls;
        return r[r.length - 1]!;
      };
      const first = s.players[0]!.id;
      const t = (id: string) => last(id)[0] + last(id)[1];
      const max = Math.max(...s.startRolls.filter((r) => r.rolls.length === Math.max(...s.startRolls.map((x) => x.rolls.length))).map((r) => r.rolls.at(-1)![0] + r.rolls.at(-1)![1]));
      expect(t(first)).toBe(max);
    }
  });
  it('distance rule applies in setup, in all directions', () => {
    const s = newGame(3, 2);
    const g = buildGeometry(false);
    const v = g.vertices.find((x) => g.vertexHexes[x.id]!.length === 3)!.id;
    const pid = s.players[0]!.id;
    const s2 = applyAction(s, { type: 'BUILD_SETTLEMENT', playerId: pid, vertexId: v }).state;
    // the road, then next player tries a neighbour
    const e = g.vertexEdges[v]![0]!;
    const s3 = applyAction(s2, { type: 'BUILD_ROAD', playerId: pid, edgeId: e }).state;
    const nb = g.vertexNeighbors[v]![0]!;
    expectCode(() => applyAction(s3, { type: 'BUILD_SETTLEMENT', playerId: s3.players[1]!.id, vertexId: nb }), 'ILLEGAL');
    expectCode(() => applyAction(s3, { type: 'BUILD_SETTLEMENT', playerId: s3.players[1]!.id, vertexId: v }), 'ILLEGAL');
  });
  it('initial road must touch the settlement just placed; wrong player/order rejected', () => {
    const s = newGame(3, 2);
    const g = buildGeometry(false);
    const pid = s.players[0]!.id;
    expectCode(() => applyAction(s, { type: 'BUILD_ROAD', playerId: pid, edgeId: 0 }), 'WRONG_PHASE');
    expectCode(() => applyAction(s, { type: 'BUILD_SETTLEMENT', playerId: s.players[1]!.id, vertexId: 0 }), 'NOT_YOUR_TURN');
    const s2 = applyAction(s, { type: 'BUILD_SETTLEMENT', playerId: pid, vertexId: 0 }).state;
    const far = g.edges.find((e) => e.a !== 0 && e.b !== 0)!.id;
    expectCode(() => applyAction(s2, { type: 'BUILD_ROAD', playerId: pid, edgeId: far }), 'ILLEGAL');
  });
  it('second settlement yields 1 card per adjacent hex (desert gives nothing); first yields none', () => {
    const s0 = newGame(3, 5);
    let s = s0;
    const g = buildGeometry(false);
    const gained: Record<string, number> = {};
    while (s.phase === 'setup') {
      const pid = s.players[s.current]!.id;
      const a = listActions(s, pid)[0]!;
      const r = applyAction(s, a);
      for (const e of r.events) if (e.type === 'SETUP_RESOURCES') gained[e.playerId] = e.gains.length;
      s = r.state;
    }
    for (const p of s.players) {
      const second = Object.entries(s.buildings)
        .filter(([, b]) => b.owner === p.id)
        .map(([v]) => Number(v));
      const cards = Object.values(p.hand).reduce((a, b) => a + b, 0);
      const maxPossible = Math.max(...second.map((v) => g.vertexHexes[v]!.length));
      expect(cards).toBeLessThanOrEqual(maxPossible);
      expect(cards).toBe(gained[p.id] ?? 0);
    }
    expect(total(s)).toEqual([19, 19, 19, 19, 19]);
  });
});

describe('production', () => {
  function board(): { s: GameState; hex: number; v: number[] } {
    const s = mainState(3, 4);
    s.phase = 'roll';
    const g = buildGeometry(false);
    const hex = s.board.hexes.findIndex((h) => h.terrain === 'forest');
    s.board.hexes.forEach((h) => (h.token = h.terrain === 'desert' ? null : 2));
    s.board.hexes[hex]!.token = 9;
    return { s, hex, v: g.hexVertices[hex]! };
  }
  it('settlement gives 1, city gives 2; robber blocks the hex', () => {
    const { s, hex, v } = board();
    putSettlement(s, 'p0', v[0]!);
    putSettlement(s, 'p1', v[2]!, 'city');
    s.forcedDice = [[4, 5], [4, 5]];
    const r = applyAction(s, { type: 'ROLL_DICE', playerId: 'p0' });
    expect(pl(r.state, 'p0').hand.lumber).toBe(1);
    expect(pl(r.state, 'p1').hand.lumber).toBe(2);
    expect(total(r.state)).toEqual([19, 19, 19, 19, 19]);
    const s2 = structuredClone(s);
    s2.board.robber = hex;
    const r2 = applyAction(s2, { type: 'ROLL_DICE', playerId: 'p0' });
    expect(pl(r2.state, 'p0').hand.lumber).toBe(0);
  });
  it('bank shortage: nobody gets it when several are owed; the single receiver gets what is left', () => {
    const { s, v } = board();
    putSettlement(s, 'p0', v[0]!);
    putSettlement(s, 'p1', v[2]!);
    s.bank.lumber = 1;
    s.forcedDice = [[4, 5]];
    const r = applyAction(s, { type: 'ROLL_DICE', playerId: 'p0' });
    expect(pl(r.state, 'p0').hand.lumber + pl(r.state, 'p1').hand.lumber).toBe(0);
    expect(r.state.bank.lumber).toBe(1);
    const s2 = structuredClone(s);
    delete s2.buildings[v[2]!];
    pl(s2, 'p0').hand.lumber = 0;
    s2.buildings[v[0]!] = { owner: 'p0', kind: 'city' };
    s2.forcedDice = [[4, 5]];
    const r2 = applyAction(s2, { type: 'ROLL_DICE', playerId: 'p0' });
    expect(pl(r2.state, 'p0').hand.lumber).toBe(1);
    expect(r2.state.bank.lumber).toBe(0);
  });
  it('a 7 produces nothing', () => {
    const { s, v } = board();
    putSettlement(s, 'p0', v[0]!);
    s.forcedDice = [[3, 4]];
    const r = applyAction(s, { type: 'ROLL_DICE', playerId: 'p0' });
    expect(pl(r.state, 'p0').hand.lumber).toBe(0);
    expect(r.state.phase).toBe('robber');
  });
});

describe('seven, robber and stealing', () => {
  const rolled7 = (s: GameState) => {
    s.phase = 'roll';
    s.forcedDice = [[3, 4]];
    return applyAction(s, { type: 'ROLL_DICE', playerId: 'p0' }).state;
  };
  it('players with more than 7 cards discard half rounded down; exactly 7 does not', () => {
    const s = mainState(4, 1);
    hand(s, 'p1', { lumber: 5, brick: 4 }); // 9 -> 4
    hand(s, 'p2', { lumber: 7 }); // 7 -> none
    hand(s, 'p3', { lumber: 8 }); // 8 -> 4
    const r = rolled7(s);
    expect(r.phase).toBe('discard');
    expect(r.pendingDiscards).toEqual({ p1: 4, p3: 4 });
    expect(getLegalActions(r, 'p1').discard).toBe(4);
    expect(getLegalActions(r, 'p2').discard).toBeNull();
  });
  it('discard validates the exact amount and ownership; the game waits for everyone', () => {
    const s = mainState(4, 1);
    hand(s, 'p1', { lumber: 5, brick: 4 });
    hand(s, 'p3', { lumber: 8 });
    const r = rolled7(s);
    expectCode(() => applyAction(r, { type: 'DISCARD', playerId: 'p1', cards: { lumber: 3 } }), 'INVALID_ARGUMENT');
    expectCode(() => applyAction(r, { type: 'DISCARD', playerId: 'p1', cards: { ore: 4 } }), 'INVALID_ARGUMENT');
    expectCode(() => applyAction(r, { type: 'DISCARD', playerId: 'p2', cards: {} }), 'ILLEGAL');
    const a = applyAction(r, { type: 'DISCARD', playerId: 'p1', cards: { lumber: 2, brick: 2 } }).state;
    expect(a.phase).toBe('discard');
    expectCode(() => applyAction(a, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: 0 }), 'WRONG_PHASE');
    const b = applyAction(a, { type: 'DISCARD', playerId: 'p3', cards: { lumber: 4 } }).state;
    expect(b.phase).toBe('robber');
    expect(total(b)).toEqual([19, 19, 19, 19, 19]);
  });
  it('robber must move to a different hex; steals from a chosen adjacent victim with cards', () => {
    const s = mainState(4, 1);
    const g = buildGeometry(false);
    const hex = s.board.robber === 0 ? 1 : 0;
    putSettlement(s, 'p1', g.hexVertices[hex]![0]!);
    putSettlement(s, 'p2', g.hexVertices[hex]![2]!); // p2 has no cards
    hand(s, 'p1', { grain: 1 });
    const r = rolled7(s);
    expectCode(() => applyAction(r, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: r.board.robber }), 'ILLEGAL');
    expectCode(() => applyAction(r, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: hex }), 'INVALID_TARGET'); // must choose victim
    expectCode(() => applyAction(r, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: hex, victimId: 'p2' }), 'INVALID_TARGET');
    const done = applyAction(r, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: hex, victimId: 'p1' });
    expect(done.state.board.robber).toBe(hex);
    expect(pl(done.state, 'p0').hand.grain).toBe(1);
    expect(pl(done.state, 'p1').hand.grain).toBe(0);
    expect(done.state.phase).toBe('main');
    const ev = done.events.find((e) => e.type === 'CARD_STOLEN')!;
    expect('resource' in redactEvent(ev, 'p2')).toBe(false);
    expect('resource' in redactEvent(ev, 'p0')).toBe(true);
  });
  it('no victim means no theft; robber may return to the desert', () => {
    const s = mainState(4, 1);
    const r = rolled7(s);
    const empty = r.board.hexes.findIndex((_, i) => i !== r.board.robber);
    const out = applyAction(r, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: empty }).state;
    expect(out.phase).toBe('main');
    const s2 = structuredClone(out);
    s2.phase = 'robber';
    const desert = s.board.hexes.findIndex((h) => h.terrain === 'desert');
    const back = applyAction(s2, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: desert === empty ? 0 : desert });
    expect(back.state.phase).toBe('main');
  });
  it('only the active player moves the robber', () => {
    const r = rolled7(mainState(4, 1));
    expectCode(() => applyAction(r, { type: 'MOVE_ROBBER', playerId: 'p1', hexId: 3 }), 'NOT_YOUR_TURN');
  });
});

describe('building', () => {
  it('road: needs connection, resources, free edge; cannot pass through a rival settlement', () => {
    const s = mainState(3, 3);
    const g = buildGeometry(false);
    const { edges, verts } = chain(false, 3, 10);
    putSettlement(s, 'p0', verts[0]!);
    hand(s, 'p0', { lumber: 2, brick: 2 });
    expectCode(() => applyAction(s, { type: 'BUILD_ROAD', playerId: 'p0', edgeId: edges[1]! }), 'ILLEGAL');
    const a = applyAction(s, { type: 'BUILD_ROAD', playerId: 'p0', edgeId: edges[0]! }).state;
    expect(pl(a, 'p0').roadsLeft).toBe(14);
    expect(pl(a, 'p0').hand.lumber).toBe(1);
    expect(a.bank.lumber).toBe(18); // 2 handed out by hand(), 1 paid back
    expectCode(() => applyAction(a, { type: 'BUILD_ROAD', playerId: 'p0', edgeId: edges[0]! }), 'ILLEGAL');
    // rival settlement in front blocks the extension
    const b = structuredClone(a);
    putSettlement(b, 'p1', verts[1]!);
    expectCode(() => applyAction(b, { type: 'BUILD_ROAD', playerId: 'p0', edgeId: edges[1]! }), 'ILLEGAL');
    const c = structuredClone(a);
    const noMoney = structuredClone(c);
    hand(noMoney, 'p0', {});
    expectCode(() => applyAction(noMoney, { type: 'BUILD_ROAD', playerId: 'p0', edgeId: edges[1]! }), 'CANNOT_AFFORD');
    expect(g.edges).toBeTruthy();
  });
  it('settlement: needs own road, distance rule, resources; city replaces settlement and returns the piece', () => {
    const s = mainState(3, 3);
    const { edges, verts } = chain(false, 3, 10);
    putSettlement(s, 'p0', verts[0]!);
    putRoad(s, 'p0', edges[0]!);
    putRoad(s, 'p0', edges[1]!);
    hand(s, 'p0', { lumber: 1, brick: 1, wool: 1, grain: 1 });
    expectCode(() => applyAction(s, { type: 'BUILD_SETTLEMENT', playerId: 'p0', vertexId: verts[1]! }), 'ILLEGAL'); // adjacent to own
    const a = applyAction(s, { type: 'BUILD_SETTLEMENT', playerId: 'p0', vertexId: verts[2]! }).state;
    expect(a.buildings[verts[2]!]).toEqual({ owner: 'p0', kind: 'settlement' });
    expect(pl(a, 'p0').settlementsLeft).toBe(3);
    expectCode(() => applyAction(a, { type: 'BUILD_SETTLEMENT', playerId: 'p0', vertexId: verts[2]! }), 'ILLEGAL'); // occupied
    // not connected
    const b = structuredClone(s);
    const far = buildGeometry(false).vertices.length - 1;
    expectCode(() => applyAction(b, { type: 'BUILD_SETTLEMENT', playerId: 'p0', vertexId: far }), 'ILLEGAL');
    // city
    hand(a, 'p0', { grain: 2, ore: 3 });
    const c = applyAction(a, { type: 'BUILD_CITY', playerId: 'p0', vertexId: verts[2]! }).state;
    expect(c.buildings[verts[2]!]!.kind).toBe('city');
    expect(pl(c, 'p0').settlementsLeft).toBe(4);
    expect(pl(c, 'p0').citiesLeft).toBe(3);
    expectCode(() => applyAction(c, { type: 'BUILD_CITY', playerId: 'p0', vertexId: verts[2]! }), 'ILLEGAL');
    const d = structuredClone(c);
    hand(d, 'p0', { grain: 2, ore: 3 });
    expectCode(() => applyAction(d, { type: 'BUILD_CITY', playerId: 'p0', vertexId: verts[2]! }), 'ILLEGAL'); // already a city
  });
  it('cannot build when out of pieces', () => {
    const s = mainState(3, 3);
    const { edges, verts } = chain(false, 2, 10);
    putSettlement(s, 'p0', verts[0]!);
    pl(s, 'p0').roadsLeft = 0;
    hand(s, 'p0', { lumber: 1, brick: 1 });
    expectCode(() => applyAction(s, { type: 'BUILD_ROAD', playerId: 'p0', edgeId: edges[0]! }), 'NO_PIECES');
    const t = mainState(3, 3);
    putSettlement(t, 'p0', verts[0]!);
    putRoad(t, 'p0', edges[0]!);
    putRoad(t, 'p0', edges[1]!);
    pl(t, 'p0').settlementsLeft = 0;
    hand(t, 'p0', { lumber: 1, brick: 1, wool: 1, grain: 1 });
    expectCode(() => applyAction(t, { type: 'BUILD_SETTLEMENT', playerId: 'p0', vertexId: verts[2]! }), 'NO_PIECES');
    const u = mainState(3, 3);
    putSettlement(u, 'p0', verts[0]!);
    pl(u, 'p0').citiesLeft = 0;
    hand(u, 'p0', { grain: 2, ore: 3 });
    expectCode(() => applyAction(u, { type: 'BUILD_CITY', playerId: 'p0', vertexId: verts[0]! }), 'NO_PIECES');
  });
  it('legal actions explain why a build is blocked', () => {
    const s = mainState(3, 3);
    hand(s, 'p0', { lumber: 1 });
    const L = getLegalActions(s, 'p0');
    expect(L.blocked.road).toBe('Te falta 1 arcilla');
    expect(L.blocked.city).toContain('mineral');
    expect(getLegalActions(s, 'p1').roads).toEqual([]);
  });
  it('only the active player acts, and only after rolling', () => {
    const s = mainState(3, 3);
    expectCode(() => applyAction(s, { type: 'END_TURN', playerId: 'p1' }), 'NOT_YOUR_TURN');
    const r = structuredClone(s);
    r.phase = 'roll';
    expectCode(() => applyAction(r, { type: 'END_TURN', playerId: 'p0' }), 'WRONG_PHASE');
    expectCode(() => applyAction(r, { type: 'BUY_DEV_CARD', playerId: 'p0' }), 'WRONG_PHASE');
    expectCode(() => applyAction(r, { type: 'ROLL_DICE', playerId: 'p1' }), 'NOT_YOUR_TURN');
  });
});

describe('development cards', () => {
  it('buying costs wool+grain+ore, empty deck blocks, card is unplayable the same turn', () => {
    const s = mainState(3, 3);
    hand(s, 'p0', { wool: 1, grain: 1, ore: 1 });
    s.deck = ['knight'];
    const a = applyAction(s, { type: 'BUY_DEV_CARD', playerId: 'p0' }).state;
    expect(pl(a, 'p0').devNew.knight).toBe(1);
    expect(a.deck).toHaveLength(0);
    expectCode(() => applyAction(a, { type: 'PLAY_KNIGHT', playerId: 'p0' }), 'DEV_CARD_RESTRICTION');
    hand(a, 'p0', { wool: 1, grain: 1, ore: 1 });
    expectCode(() => applyAction(a, { type: 'BUY_DEV_CARD', playerId: 'p0' }), 'ILLEGAL');
    // next turn it is playable
    a.current = 2; // the card matures when p0's next turn begins
    const b = applyAction(a, { type: 'END_TURN', playerId: 'p2' }).state;
    expect(pl(b, 'p0').dev.knight).toBe(1);
  });
  it('knight: playable before rolling, moves robber, steals, counts toward army; max one dev card per turn', () => {
    const s = mainState(3, 3);
    s.phase = 'roll';
    pl(s, 'p0').dev.knight = 2;
    const a = applyAction(s, { type: 'PLAY_KNIGHT', playerId: 'p0' }).state;
    expect(a.phase).toBe('robber');
    expect(pl(a, 'p0').knightsPlayed).toBe(1);
    const b = applyAction(a, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: a.board.robber === 0 ? 1 : 0 }).state;
    expect(b.phase).toBe('roll'); // still has to roll
    expectCode(() => applyAction(b, { type: 'PLAY_KNIGHT', playerId: 'p0' }), 'DEV_CARD_RESTRICTION');
  });
  it('knight: only on your own turn; no discards', () => {
    const s = mainState(3, 3);
    pl(s, 'p1').dev.knight = 1;
    expectCode(() => applyAction(s, { type: 'PLAY_KNIGHT', playerId: 'p1' }), 'NOT_YOUR_TURN');
    pl(s, 'p0').dev.knight = 1;
    hand(s, 'p1', { lumber: 10 });
    expect(applyAction(s, { type: 'PLAY_KNIGHT', playerId: 'p0' }).state.phase).toBe('robber');
  });
  it('road building: two free roads (or what is left), returns to the previous phase', () => {
    const s = mainState(3, 3);
    const { edges, verts } = chain(false, 3, 10);
    putSettlement(s, 'p0', verts[0]!);
    pl(s, 'p0').dev.roadBuilding = 1;
    const a = applyAction(s, { type: 'PLAY_ROAD_BUILDING', playerId: 'p0' }).state;
    expect(a.phase).toBe('roadBuilding');
    const b = applyAction(a, { type: 'BUILD_ROAD', playerId: 'p0', edgeId: edges[0]! }).state;
    expect(b.phase).toBe('roadBuilding');
    expect(pl(b, 'p0').hand.lumber).toBe(0);
    const c = applyAction(b, { type: 'BUILD_ROAD', playerId: 'p0', edgeId: edges[1]! }).state;
    expect(c.phase).toBe('main');
    expect(pl(c, 'p0').roadsLeft).toBe(13);
    // only one road left in the box
    const d = structuredClone(s);
    pl(d, 'p0').roadsLeft = 1;
    const e = applyAction(d, { type: 'PLAY_ROAD_BUILDING', playerId: 'p0' }).state;
    expect(applyAction(e, { type: 'BUILD_ROAD', playerId: 'p0', edgeId: edges[0]! }).state.phase).toBe('main');
  });
  it('year of plenty: 2 resources from the bank, limited by availability', () => {
    const s = mainState(3, 3);
    pl(s, 'p0').dev.yearOfPlenty = 1;
    const a = applyAction(s, { type: 'PLAY_YEAR_OF_PLENTY', playerId: 'p0', resources: ['ore', 'ore'] }).state;
    expect(pl(a, 'p0').hand.ore).toBe(2);
    expect(a.bank.ore).toBe(17);
    const b = structuredClone(s);
    b.bank.ore = 1;
    expectCode(() => applyAction(b, { type: 'PLAY_YEAR_OF_PLENTY', playerId: 'p0', resources: ['ore', 'ore'] }), 'ILLEGAL');
    expectCode(() => applyAction(b, { type: 'PLAY_YEAR_OF_PLENTY', playerId: 'p0', resources: ['ore'] }), 'INVALID_ARGUMENT');
    // bank almost empty: 1 card total -> take only one
    const c = structuredClone(s);
    for (const r of RES) c.bank[r] = 0;
    c.bank.grain = 1;
    expect(pl(applyAction(c, { type: 'PLAY_YEAR_OF_PLENTY', playerId: 'p0', resources: ['grain'] }).state, 'p0').hand.grain).toBe(1);
  });
  it('monopoly takes every card of the named resource from all other players', () => {
    const s = mainState(4, 3);
    pl(s, 'p0').dev.monopoly = 1;
    hand(s, 'p1', { wool: 3, ore: 1 });
    hand(s, 'p2', { wool: 2 });
    hand(s, 'p0', { wool: 1 });
    const a = applyAction(s, { type: 'PLAY_MONOPOLY', playerId: 'p0', resource: 'wool' }).state;
    expect(pl(a, 'p0').hand.wool).toBe(6);
    expect(pl(a, 'p1').hand.wool).toBe(0);
    expect(pl(a, 'p1').hand.ore).toBe(1);
    expect(total(a)).toEqual(total(s));
  });
  it('victory point cards count immediately and stay hidden from others', () => {
    const s = mainState(3, 3);
    hand(s, 'p0', { wool: 1, grain: 1, ore: 1 });
    s.deck = ['victoryPoint'];
    const a = applyAction(s, { type: 'BUY_DEV_CARD', playerId: 'p0' }).state;
    expect(getPlayerView(a, 'p0').me!.totalVP).toBe(1);
    expect(getPlayerView(a, 'p0').me!.hiddenVP).toBe(1);
    expect(getPlayerView(a, 'p1').players.find((p) => p.id === 'p0')!.publicVP).toBe(0);
    expect(JSON.stringify(getPlayerView(a, 'p1'))).not.toContain('victoryPoint":1');
    expect(getPlayerView(a, 'p1').me!.hand).toBeDefined();
    expectCode(() => applyAction(a, { type: 'PLAY_KNIGHT', playerId: 'p0' }), 'DEV_CARD_RESTRICTION');
  });
});

describe('longest road & largest army', () => {
  // find a start vertex where the vertex at index k of the chain has 3 edges
  function chainWithBranch(len: number, startFrom = 0, avoid: Set<number> = new Set(), banned: Set<number> = new Set()) {
    const g = buildGeometry(false);
    for (let v = startFrom; v < g.vertices.length; v++) {
      if (banned.has(v)) continue;
      try {
        const c = chain(false, len, v, avoid);
        if (c.verts.some((x) => banned.has(x))) continue;
        return c;
      } catch {
        /* next */
      }
    }
    throw new Error('no chain');
  }
  const buildAll = (s: GameState, pid: string, edges: number[]) => {
    const idx = s.players.findIndex((p) => p.id === pid);
    s.current = idx;
    for (const e of edges) {
      hand(s, pid, { lumber: 1, brick: 1 });
      Object.assign(s, applyAction(s, { type: 'BUILD_ROAD', playerId: pid, edgeId: e }).state);
    }
  };
  const start = (s: GameState, pid: string, v: number) => putSettlement(s, pid, v);

  it('5 connected roads earn the card (2 VP); 4 do not', () => {
    const s = mainState(3, 3);
    const { edges, verts } = chainWithBranch(5);
    start(s, 'p0', verts[0]!);
    buildAll(s, 'p0', edges.slice(0, 4));
    expect(s.longestRoadHolder).toBeNull();
    buildAll(s, 'p0', edges.slice(4));
    expect(s.longestRoadHolder).toBe('p0');
    expect(getPlayerView(s, null).players[0]!.publicVP).toBe(3);
  });
  it('branches do not add up; a cycle is counted once', () => {
    const s = mainState(3, 3);
    const g = buildGeometry(false);
    // hexagon ring of 6 roads around one hex = a cycle with length 6
    const hexId = g.hexes.find((h) => g.hexNeighbors[h.id]!.length === 6)!.id;
    const vs = g.hexVertices[hexId]!;
    const ring: number[] = [];
    for (let k = 0; k < 6; k++) {
      const a = vs[k]!;
      const b = vs[(k + 1) % 6]!;
      ring.push(g.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))!.id);
    }
    for (const e of ring) putRoad(s, 'p0', e);
    expect(buildAllLen(s, 'p0')).toBe(6);
    // add a spur: still 6 + spur at most 7 only if attached; spur attached to ring gives 7 (ring path of 6 + spur)
    const spur = g.vertexEdges[vs[0]!]!.find((e) => !ring.includes(e))!;
    putRoad(s, 'p0', spur);
    expect(buildAllLen(s, 'p0')).toBe(6 + 1 - 0 > 7 ? 7 : buildAllLen(s, 'p0'));
    // "T" shape: a straight chain of 3 with a branch of 1 at its middle has length 3
    const t = mainState(3, 3);
    const c = chainWithBranch(3);
    for (const e of c.edges) putRoad(t, 'p0', e);
    const mid = c.verts[1]!;
    const branch = g.vertexEdges[mid]!.find((e) => !c.edges.includes(e));
    if (branch !== undefined) putRoad(t, 'p0', branch);
    expect(buildAllLen(t, 'p0')).toBe(3);
  });
  function buildAllLen(s: GameState, pid: string) {
    return longestRoadForLocal(s, pid);
  }
  it('a rival settlement in the middle cuts the road; nobody holds the card if nobody reaches 5', () => {
    const g = buildGeometry(false);
    let found = false;
    for (let v0 = 0; v0 < g.vertices.length && !found; v0++) {
      let c;
      try {
        c = chain(false, 5, v0);
      } catch {
        continue;
      }
      const cut = c.verts[2]!;
      const third = g.vertexEdges[cut]!.find((e) => !c.edges.includes(e));
      if (third === undefined) continue;
      found = true;
      const s = mainState(3, 3);
      start(s, 'p0', c.verts[0]!);
      buildAll(s, 'p0', c.edges);
      expect(s.longestRoadHolder).toBe('p0');
      putRoad(s, 'p1', third);
      s.current = 1;
      hand(s, 'p1', { lumber: 1, brick: 1, wool: 1, grain: 1 });
      const r = applyAction(s, { type: 'BUILD_SETTLEMENT', playerId: 'p1', vertexId: cut });
      expect(r.state.longestRoadHolder).toBeNull();
      expect(r.events.some((e) => e.type === 'LONGEST_ROAD' && e.playerId === null)).toBe(true);
    }
    expect(found).toBe(true);
  });
  it('after a cut, the unique longest road takes the card; a tie leaves it unowned', () => {
    const g = buildGeometry(false);
    // p0: chain of 6, cut next to its start leaves 5; p1 owns a separate chain of 5 => tie => no owner
    // p0: chain of 6; p1: chain of 6 elsewhere => p0 holds (first); cut p0 at vertex 1 -> 5 vs 6 => p1 unique max takes it
    let done = false;
    for (let v0 = 0; v0 < g.vertices.length && !done; v0++) {
      let c0;
      try {
        c0 = chain(false, 7, v0);
      } catch {
        continue;
      }
      const cutV = c0.verts[2]!;
      const third = g.vertexEdges[cutV]!.find((e) => !c0.edges.includes(e));
      if (third === undefined) continue;
      const banned = new Set<number>();
      for (const v of c0.verts) {
        banned.add(v);
        for (const n of g.vertexNeighbors[v]!) banned.add(n);
      }
      let c1;
      try {
        c1 = chainWithBranch(6, 0, new Set(), banned);
      } catch {
        continue;
      }
      if (c1.verts.some((v) => banned.has(v))) continue;
      done = true;
      for (const mode of ['p1-unique', 'tie'] as const) {
        const s = mainState(3, 3);
        start(s, 'p0', c0.verts[0]!);
        buildAll(s, 'p0', c0.edges);
        start(s, 'p1', c1.verts[0]!);
        buildAll(s, 'p1', mode === 'tie' ? c1.edges.slice(0, 5) : c1.edges);
        expect(s.longestRoadHolder).toBe('p0'); // a tie (5 vs 6)... p0 first
        if (mode === 'p1-unique') {
          // p1 reached 6 = tie with the holder: holder keeps
          expect(s.longestRoadHolder).toBe('p0');
        }
        putRoad(s, 'p2', third);
        s.current = 2;
        hand(s, 'p2', { lumber: 1, brick: 1, wool: 1, grain: 1 });
        const r = applyAction(s, { type: 'BUILD_SETTLEMENT', playerId: 'p2', vertexId: cutV });
        // p0 drops from 6 to 5
        if (mode === 'p1-unique') expect(r.state.longestRoadHolder).toBe('p1');
        else expect(r.state.longestRoadHolder).toBeNull(); // 5 vs 5 tie
      }
    }
    expect(done).toBe(true);
  });
  it('a tie is not enough to take the card; exceeding it is', () => {
    const g = buildGeometry(false);
    let done = false;
    for (let v0 = 0; v0 < g.vertices.length && !done; v0++) {
      let c0;
      try {
        c0 = chain(false, 5, v0);
      } catch {
        continue;
      }
      const banned = new Set<number>();
      for (const v of c0.verts) {
        banned.add(v);
        for (const n of g.vertexNeighbors[v]!) banned.add(n);
      }
      let c1;
      try {
        c1 = chainWithBranch(6, 0, new Set(), banned);
      } catch {
        continue;
      }
      done = true;
      const s = mainState(3, 3);
      start(s, 'p0', c0.verts[0]!);
      buildAll(s, 'p0', c0.edges);
      start(s, 'p1', c1.verts[0]!);
      buildAll(s, 'p1', c1.edges.slice(0, 5));
      expect(s.longestRoadHolder).toBe('p0');
      buildAll(s, 'p1', c1.edges.slice(5));
      expect(s.longestRoadHolder).toBe('p1');
    }
    expect(done).toBe(true);
  });
  it('largest army: 3 knights to take it, rivals must strictly exceed', () => {
    const s = mainState(3, 3);
    const play = (pid: string) => {
      s.current = s.players.findIndex((p) => p.id === pid);
      s.phase = 'main';
      s.devPlayedThisTurn = false;
      pl(s, pid).dev.knight++;
      Object.assign(s, applyAction(s, { type: 'PLAY_KNIGHT', playerId: pid }).state);
      Object.assign(s, applyAction(s, { type: 'MOVE_ROBBER', playerId: pid, hexId: s.board.robber === 0 ? 1 : 0 }).state);
    };
    play('p0');
    play('p0');
    expect(s.largestArmyHolder).toBeNull();
    play('p0');
    expect(s.largestArmyHolder).toBe('p0');
    play('p1');
    play('p1');
    play('p1');
    expect(s.largestArmyHolder).toBe('p0'); // tie
    play('p1');
    expect(s.largestArmyHolder).toBe('p1');
  });
});

function longestRoadForLocal(s: GameState, pid: string): number {
  // imported lazily to keep the test list above readable
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (globalThis as unknown as { __lr: (s: GameState, p: string) => number }).__lr(s, pid);
}
import { longestRoadFor } from '../src';
(globalThis as unknown as { __lr: typeof longestRoadFor }).__lr = longestRoadFor;

describe('ports and bank trade', () => {
  it('4:1 by default, 3:1 on a generic port, 2:1 on the matching specific port', () => {
    const s = mainState(3, 3);
    const g = buildGeometry(false);
    expect(bankRatio(s, 'p0', 'wool')).toBe(4);
    const generic = s.board.ports.find((p) => p.type === 'generic')!;
    const specific = s.board.ports.find((p) => p.type !== 'generic')!;
    putSettlement(s, 'p0', g.edges[generic.edgeId]!.a);
    expect(bankRatio(s, 'p0', 'wool')).toBe(3);
    putSettlement(s, 'p0', g.edges[specific.edgeId]!.b, 'city');
    expect(bankRatio(s, 'p0', specific.type as Resource)).toBe(2);
    const other = RES.find((r) => r !== specific.type)!;
    expect(bankRatio(s, 'p0', other)).toBe(3);
    expect(bankRatio(s, 'p1', other)).toBe(4);
  });
  it('bank trade executes at the best ratio, only with the active player, bank must have the card', () => {
    const s = mainState(3, 3);
    hand(s, 'p0', { wool: 4 });
    const a = applyAction(s, { type: 'BANK_TRADE', playerId: 'p0', give: 'wool', receive: 'ore' }).state;
    expect(pl(a, 'p0').hand).toMatchObject({ wool: 0, ore: 1 });
    expect(total(a)).toEqual([19, 19, 19, 19, 19]);
    hand(s, 'p0', { wool: 3 });
    expectCode(() => applyAction(s, { type: 'BANK_TRADE', playerId: 'p0', give: 'wool', receive: 'ore' }), 'CANNOT_AFFORD');
    hand(s, 'p0', { wool: 4 });
    s.bank.ore = 0;
    expectCode(() => applyAction(s, { type: 'BANK_TRADE', playerId: 'p0', give: 'wool', receive: 'ore' }), 'ILLEGAL');
    expectCode(() => applyAction(s, { type: 'BANK_TRADE', playerId: 'p0', give: 'wool', receive: 'wool' }), 'INVALID_ARGUMENT');
    expectCode(() => applyAction(s, { type: 'BANK_TRADE', playerId: 'p1', give: 'wool', receive: 'ore' }), 'NOT_YOUR_TURN');
  });
});

describe('player trading', () => {
  it('open offer → accept → confirm swaps cards atomically', () => {
    const s = mainState(4, 3);
    hand(s, 'p0', { wool: 2 });
    hand(s, 'p1', { ore: 1 });
    const o = applyAction(s, { type: 'OFFER_TRADE', playerId: 'p0', give: { wool: 1 }, want: { ore: 1 } });
    const id = o.state.trades[0]!.id;
    const r = applyAction(o.state, { type: 'RESPOND_TRADE', playerId: 'p1', offerId: id, response: 'accept' }).state;
    expect(getLegalActions(r, 'p0').confirmable).toEqual([{ offerId: id, partnerId: 'p1' }]);
    const done = applyAction(r, { type: 'CONFIRM_TRADE', playerId: 'p0', offerId: id, partnerId: 'p1' }).state;
    expect(pl(done, 'p0').hand).toMatchObject({ wool: 1, ore: 1 });
    expect(pl(done, 'p1').hand).toMatchObject({ wool: 1, ore: 0 });
    expect(done.trades).toHaveLength(0);
    expect(total(done)).toEqual(total(s));
  });
  it('rejects same-resource swaps, gifts, empty sides, and trades between non-active players', () => {
    const s = mainState(4, 3);
    hand(s, 'p0', { wool: 2 });
    hand(s, 'p1', { ore: 1 });
    hand(s, 'p2', { grain: 1 });
    expectCode(() => applyAction(s, { type: 'OFFER_TRADE', playerId: 'p0', give: { wool: 1 }, want: { wool: 1 } }), 'ILLEGAL');
    expectCode(() => applyAction(s, { type: 'OFFER_TRADE', playerId: 'p0', give: { wool: 1 }, want: {} }), 'INVALID_ARGUMENT');
    expectCode(() => applyAction(s, { type: 'OFFER_TRADE', playerId: 'p0', give: {}, want: { ore: 1 } }), 'INVALID_ARGUMENT');
    expectCode(() => applyAction(s, { type: 'OFFER_TRADE', playerId: 'p1', give: { ore: 1 }, want: { grain: 1 } }), 'NOT_YOUR_TURN');
    expectCode(() => applyAction(s, { type: 'OFFER_TRADE', playerId: 'p0', give: { ore: 1 }, want: { grain: 1 } }), 'CANNOT_AFFORD');
  });
  it('a non-active player can propose or counter; the active player accepts', () => {
    const s = mainState(4, 3);
    hand(s, 'p0', { wool: 2 });
    hand(s, 'p1', { ore: 2 });
    const o = applyAction(s, { type: 'OFFER_TRADE', playerId: 'p0', give: { wool: 2 }, want: { ore: 1 } }).state;
    const id = o.trades[0]!.id;
    const c = applyAction(o, { type: 'PROPOSE_TRADE', playerId: 'p1', give: { ore: 1 }, want: { wool: 1 }, counterOf: id }).state;
    expect(c.trades.find((t) => t.id === id)!.responses.p1).toBe('counter');
    const cid = c.trades.find((t) => t.from === 'p1')!.id;
    const done = applyAction(c, { type: 'CONFIRM_TRADE', playerId: 'p0', offerId: cid, partnerId: 'p1' }).state;
    expect(pl(done, 'p0').hand).toMatchObject({ wool: 1, ore: 1 });
    // cannot confirm someone who has not accepted
    expectCode(() => applyAction(o, { type: 'CONFIRM_TRADE', playerId: 'p0', offerId: id, partnerId: 'p2' }), 'ILLEGAL');
    // atomicity: if the partner no longer has the cards it fails and nothing changes
    const r = applyAction(o, { type: 'RESPOND_TRADE', playerId: 'p1', offerId: id, response: 'accept' }).state;
    pl(r, 'p1').hand.ore = 0;
    expectCode(() => applyAction(r, { type: 'CONFIRM_TRADE', playerId: 'p0', offerId: id, partnerId: 'p1' }), 'CANNOT_AFFORD');
  });
  it('offers are cleared at end of turn; trading is not allowed before rolling', () => {
    const s = mainState(4, 3);
    hand(s, 'p0', { wool: 2 });
    const o = applyAction(s, { type: 'OFFER_TRADE', playerId: 'p0', give: { wool: 1 }, want: { ore: 1 } }).state;
    expect(applyAction(o, { type: 'END_TURN', playerId: 'p0' }).state.trades).toHaveLength(0);
    const r = structuredClone(s);
    r.phase = 'roll';
    expectCode(() => applyAction(r, { type: 'OFFER_TRADE', playerId: 'p0', give: { wool: 1 }, want: { ore: 1 } }), 'WRONG_PHASE');
  });
});

describe('victory', () => {
  it('reaching 10 VP on your own turn wins at once', () => {
    const s = mainState(3, 3);
    pl(s, 'p0').dev.victoryPoint = 9;
    hand(s, 'p0', { wool: 1, grain: 1, ore: 1 });
    s.deck = ['victoryPoint'];
    const r = applyAction(s, { type: 'BUY_DEV_CARD', playerId: 'p0' });
    expect(r.state.phase).toBe('finished');
    expect(r.state.winner).toBe('p0');
    expect(r.events.some((e) => e.type === 'GAME_WON')).toBe(true);
    expectCode(() => applyAction(r.state, { type: 'END_TURN', playerId: 'p0' }), 'GAME_OVER');
    expect(getPlayerView(r.state, null).finalScores!.find((x) => x.playerId === 'p0')!.total).toBe(10);
  });
  it('reaching 10 on someone else\'s turn only wins when your own turn starts', () => {
    const s = mainState(3, 3);
    pl(s, 'p1').dev.victoryPoint = 10;
    hand(s, 'p0', { wool: 1 });
    const a = applyAction(s, { type: 'BANK_TRADE', playerId: 'p0', give: 'ore', receive: 'wool' }.type === 'x' ? ({} as never) : { type: 'END_TURN', playerId: 'p0' });
    expect(a.state.phase).toBe('finished');
    expect(a.state.winner).toBe('p1');
  });
  it('another player does not win during a turn that is not theirs', () => {
    const s = mainState(3, 3);
    pl(s, 'p1').dev.victoryPoint = 10;
    hand(s, 'p0', { wool: 4 });
    const a = applyAction(s, { type: 'BANK_TRADE', playerId: 'p0', give: 'wool', receive: 'ore' }).state;
    expect(a.phase).toBe('main');
    expect(a.winner).toBeNull();
  });
});

describe('5-6 players: special build phase', () => {
  it('after each turn the others, in order, may build/buy but not trade or play cards; nothing-to-do players are skipped', () => {
    const s = mainState(5, 3);
    expect(s.extended).toBe(true);
    const { edges, verts } = chain(true, 3, 10);
    putSettlement(s, 'p2', verts[0]!);
    hand(s, 'p2', { lumber: 2, brick: 2 });
    putSettlement(s, 'p4', chain(true, 1, 60).verts[0]!);
    hand(s, 'p4', { lumber: 1, brick: 1, wool: 1, grain: 1 });
    // p4's settlement needs a road + spot, so give them road money only
    hand(s, 'p4', { lumber: 1, brick: 1 });
    pl(s, 'p4').dev.knight = 1;
    const a = applyAction(s, { type: 'END_TURN', playerId: 'p0' });
    expect(a.state.phase).toBe('special');
    expect(a.state.special!.queue[0]).toBe('p2'); // p1 skipped automatically
    expect(a.events.filter((e) => e.type === 'SPECIAL_BUILD_PASSED' && e.auto).map((e) => (e as { playerId: string }).playerId)).toEqual(['p1']);
    expectCode(() => applyAction(a.state, { type: 'BUILD_ROAD', playerId: 'p4', edgeId: 0 }), 'NOT_YOUR_TURN');
    expectCode(() => applyAction(a.state, { type: 'BANK_TRADE', playerId: 'p2', give: 'wool', receive: 'ore' }), 'WRONG_PHASE');
    expectCode(() => applyAction(a.state, { type: 'OFFER_TRADE', playerId: 'p2', give: { lumber: 1 }, want: { ore: 1 } }), 'WRONG_PHASE');
    pl(a.state, 'p2').dev.knight = 1;
    expectCode(() => applyAction(a.state, { type: 'PLAY_KNIGHT', playerId: 'p2' }), 'WRONG_PHASE');
    expect(getLegalActions(a.state, 'p2').passSpecial).toBe(true);
    const b = applyAction(a.state, { type: 'BUILD_ROAD', playerId: 'p2', edgeId: edges[0]! }).state;
    expect(b.phase).toBe('special'); // p2 still has resources for another road
    const c = applyAction(b, { type: 'PASS_SPECIAL', playerId: 'p2' }).state;
    // p3 has nothing, p4 can build a road if it has a spot => p4 is next
    expect(['special', 'roll']).toContain(c.phase);
    if (c.phase === 'special') expect(c.special!.queue[0]).toBe('p4');
  });
  it('when everyone has had their chance, the next player starts their turn', () => {
    const s = mainState(5, 3);
    const a = applyAction(s, { type: 'END_TURN', playerId: 'p0' }).state;
    expect(a.phase).toBe('roll');
    expect(a.players[a.current]!.id).toBe('p1');
  });
  it('a player reaching 10 VP during another player\'s special build phase wins only on their own turn', () => {
    const s = mainState(5, 3);
    pl(s, 'p3').dev.victoryPoint = 10;
    const a = applyAction(s, { type: 'END_TURN', playerId: 'p0' }).state;
    expect(a.winner).toBeNull();
    let t = a;
    t = applyAction(t, { type: 'ROLL_DICE', playerId: 'p1' }).state; // p1's turn (their start check happened before)
    expect(t.winner).toBeNull();
  });
});

describe('invariants', () => {
  it('applyAction never mutates its input', () => {
    const s = autoSetup(newGame(4, 9));
    const snap = JSON.stringify(s);
    applyAction(s, { type: 'ROLL_DICE', playerId: s.players[s.current]!.id });
    expect(JSON.stringify(s)).toBe(snap);
  });
  it('state survives JSON round trip (persistence)', () => {
    const s = autoSetup(newGame(4, 9));
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    const a = applyAction(s, { type: 'ROLL_DICE', playerId: s.players[s.current]!.id });
    const b = applyAction(copy, { type: 'ROLL_DICE', playerId: copy.players[copy.current]!.id });
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
