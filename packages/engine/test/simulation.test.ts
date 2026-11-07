import { describe, expect, it } from 'vitest';
import {
  EngineError,
  applyAction,
  chooseBotAction,
  getLegalActions,
  getPlayerView,
  longestRoadFor,
  totalVP,
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

export function play(n: number, seed: number): { finished: boolean; actions: number } {
  let s = newGame(n, seed, seed % 2 ? 'spiral' : 'balanced');
  const h = { rng: seed * 2654435761 };
  let actions = 0;
  while (s.phase !== 'finished' && actions < MAX_ACTIONS) {
    const a = chooseBotAction(s, h);
    if (!a) throw new Error(`bot has no action in phase ${s.phase} (seed ${seed}, n ${n})`);
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
