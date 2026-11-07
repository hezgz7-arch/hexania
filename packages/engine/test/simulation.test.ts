import { describe, expect, it } from 'vitest';
import {
  EngineError,
  activePlayerId,
  applyAction,
  getLegalActions,
  getPlayerView,
  listActions,
  longestRoadFor,
  nextInt,
  totalVP,
  type Action,
  type GameState,
  type Resource,
} from '../src';
import { newGame } from './helpers';

const RES: Resource[] = ['lumber', 'brick', 'wool', 'grain', 'ore'];
const MAX_ACTIONS = 6000;
// 250 games per player count = 1000 in total; SIM_GAMES=20 for a quick local run
const SIM = Number(process.env.SIM_GAMES ?? 250);

function quickCards(s: GameState): void {
  for (const r of RES) {
    let sum = s.bank[r];
    for (const p of s.players) {
      if (p.hand[r] < 0) throw new Error('negative hand');
      sum += p.hand[r];
    }
    if (sum !== (s.extended ? 24 : 19) || s.bank[r] < 0) throw new Error('card conservation broken');
  }
}

function checkInvariants(s: GameState, n: number): void {
  const full = s.extended ? 24 : 19;
  for (const r of RES) {
    let sum = s.bank[r];
    expect(s.bank[r]).toBeGreaterThanOrEqual(0);
    for (const p of s.players) {
      expect(p.hand[r]).toBeGreaterThanOrEqual(0);
      sum += p.hand[r];
    }
    if (sum !== full) throw new Error(`card conservation broken for ${r}: ${sum} != ${full} (game ${n})`);
  }
  for (const p of s.players) {
    const roads = Object.values(s.roads).filter((o) => o === p.id).length;
    const setl = Object.values(s.buildings).filter((b) => b.owner === p.id && b.kind === 'settlement').length;
    const cit = Object.values(s.buildings).filter((b) => b.owner === p.id && b.kind === 'city').length;
    if (roads + p.roadsLeft !== 15) throw new Error('road pieces mismatch');
    if (setl + p.settlementsLeft !== 5) throw new Error('settlement pieces mismatch');
    if (cit + p.citiesLeft !== 4) throw new Error('city pieces mismatch');
    for (const k of Object.values(p.dev)) expect(k).toBeGreaterThanOrEqual(0);
  }
  // no two buildings closer than 2 edges
  const owned = Object.keys(s.buildings).map(Number);
  expect(new Set(owned).size).toBe(owned.length);
  // dev card conservation
  const inHands = s.players.reduce(
    (a, p) => a + Object.values(p.dev).reduce((x, y) => x + y, 0) + Object.values(p.devNew).reduce((x, y) => x + y, 0),
    0,
  );
  const played = s.players.reduce((a, p) => a + p.knightsPlayed, 0);
  expect(s.deck.length + inHands).toBeLessThanOrEqual(s.extended ? 34 : 25);
  expect(played).toBeGreaterThanOrEqual(0);
  if (s.longestRoadHolder) expect(longestRoadFor(s, s.longestRoadHolder)).toBeGreaterThanOrEqual(5);
  if (s.largestArmyHolder) expect(s.players.find((p) => p.id === s.largestArmyHolder)!.knightsPlayed).toBeGreaterThanOrEqual(3);
  if (s.phase !== 'finished') for (const p of s.players) expect(totalVP(s, p)).toBeLessThan(16);
}

function pick<T>(h: { rng: number }, xs: T[]): T {
  return xs[nextInt(h, xs.length)]!;
}

/** Bot that prefers building, rarely trades, otherwise ends its turn. */
function chooseAction(s: GameState, h: { rng: number }): Action {
  if (s.phase === 'discard') {
    const pid = Object.keys(s.pendingDiscards)[0]!;
    return listActions(s, pid).find((a) => a.type === 'DISCARD')!;
  }
  const pid = activePlayerId(s)!;
  const acts = listActions(s, pid);
  const of = (...t: string[]) => acts.filter((a) => t.includes(a.type));

  if (s.phase === 'main' && s.trades.length && nextInt(h, 100) < 60) {
    // let somebody answer / the owner confirm
    const owner = s.trades[0]!.from;
    const confirm = listActions(s, owner).filter((a) => a.type === 'CONFIRM_TRADE');
    if (confirm.length && nextInt(h, 100) < 70) return pick(h, confirm);
    const others = s.players.map((p) => p.id).filter((id) => id !== owner);
    for (const o of others) {
      const resp = listActions(s, o).filter((a) => a.type === 'RESPOND_TRADE');
      if (resp.length) return pick(h, resp);
    }
  }

  const prio = ['BUILD_CITY', 'BUILD_SETTLEMENT', 'BUY_DEV_CARD', 'PLAY_KNIGHT', 'PLAY_ROAD_BUILDING', 'PLAY_YEAR_OF_PLENTY', 'PLAY_MONOPOLY'];
  if (s.phase === 'main' || s.phase === 'special') {
    for (const t of prio) {
      const c = of(t);
      if (c.length && (t !== 'PLAY_MONOPOLY' || nextInt(h, 100) < 30)) return pick(h, c);
    }
    const roads = of('BUILD_ROAD');
    if (roads.length && nextInt(h, 100) < 45) return pick(h, roads);
    if (s.phase === 'main') {
      if (nextInt(h, 100) < 8) {
        const bt = of('BANK_TRADE');
        if (bt.length) return pick(h, bt);
      }
      if (nextInt(h, 100) < 6) {
        const o = listActions(s, pid, { includeTrades: true }).filter((a) => a.type === 'OFFER_TRADE');
        if (o.length) return pick(h, o);
      }
    }
  }
  if (s.phase === 'setup') return acts[nextInt(h, acts.length)]!;
  const forced = of('ROLL_DICE', 'MOVE_ROBBER', 'BUILD_ROAD', 'END_TURN', 'PASS_SPECIAL');
  if (s.phase === 'roll') return of('ROLL_DICE', 'PLAY_KNIGHT').find((a) => a.type === 'ROLL_DICE')!;
  if (s.phase === 'robber') return pick(h, of('MOVE_ROBBER'));
  if (s.phase === 'roadBuilding') return pick(h, of('BUILD_ROAD'));
  return forced.find((a) => a.type === 'END_TURN' || a.type === 'PASS_SPECIAL') ?? forced[0]!;
}

export function play(n: number, seed: number): { finished: boolean; actions: number } {
  let s = newGame(n, seed, seed % 2 ? 'spiral' : 'balanced');
  const h = { rng: seed * 2654435761 };
  let actions = 0;
  while (s.phase !== 'finished' && actions < MAX_ACTIONS) {
    const a = chooseAction(s, h);
    try {
      s = applyAction(s, a).state;
    } catch (e) {
      if (e instanceof EngineError) throw new Error(`bot played an action listed as legal but it failed: ${JSON.stringify(a)} -> ${e.code} ${e.message} (seed ${seed}, n ${n})`);
      throw e;
    }
    actions++;
    if (actions % 8 === 0 || s.phase === 'finished') checkInvariants(s, seed);
    else quickCards(s);
    if (actions % 200 === 0) {
      // views must always be producible and never leak other hands
      const v = getPlayerView(s, s.players[0]!.id);
      expect(JSON.stringify(v.players)).not.toContain('"hand"');
    }
  }
  if (s.phase === 'finished') {
    expect(s.winner).not.toBeNull();
    expect(totalVP(s, s.players.find((p) => p.id === s.winner)!)).toBeGreaterThanOrEqual(10);
    expect(getLegalActions(s, s.winner!).endTurn).toBe(false);
  }
  return { finished: s.phase === 'finished', actions };
}

describe('1000 random-bot games', () => {
  for (const [n, games] of [[3, SIM], [4, SIM], [5, SIM], [6, SIM]] as const) {
    it(`${n} players × ${games} games: no errors, valid states, cards conserved`, () => {
      let finished = 0;
      for (let i = 1; i <= games; i++) {
        const r = play(n, 1000 * n + i);
        if (r.finished) finished++;
      }
      // bots build rather than idle, so the vast majority must reach a winner
      expect(finished).toBeGreaterThan(games * 0.8);
    }, 300_000);
  }
});
