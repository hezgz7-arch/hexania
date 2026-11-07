import { applyAction } from './game';
import { defaultDiscard, listActions } from './legal';
import { nextInt, shuffle } from './rng';
import { getPlayer } from './queries';
import type { Action, GameEvent, GameState, ResourceCounts } from './types';
import { RESOURCES } from './types';

/** Random discard of exactly `n` cards (used by the turn timer). */
export function randomDiscard(s: GameState, playerId: string, n: number): Partial<ResourceCounts> {
  const p = getPlayer(s, playerId)!;
  const pool = RESOURCES.flatMap((r) => Array<typeof r>(p.hand[r]).fill(r));
  const holder = { rng: s.rng ^ (n * 7919) };
  shuffle(holder, pool);
  const out: Partial<ResourceCounts> = {};
  for (const r of pool.slice(0, n)) out[r] = (out[r] ?? 0) + 1;
  return out;
}

/**
 * Timer expiry: finish the active player's turn automatically.
 * Pending discards are chosen at random, the robber goes to the best-looking hex, building is skipped.
 */
export function forceEndTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  const run = (a: Action) => {
    const r = applyAction(s, a);
    s = r.state;
    events.push(...r.events);
  };
  const startTurn = s.turn;
  for (let guard = 0; guard < 50 && s.phase !== 'finished'; guard++) {
    if (s.turn !== startTurn && s.phase !== 'special') break;
    const cur = s.players[s.current]!.id;
    switch (s.phase) {
      case 'roll':
        run({ type: 'ROLL_DICE', playerId: cur });
        break;
      case 'discard':
        for (const [pid, n] of Object.entries(s.pendingDiscards)) {
          if (s.phase === 'discard' && s.pendingDiscards[pid] !== undefined)
            run({ type: 'DISCARD', playerId: pid, cards: randomDiscard(s, pid, n) });
        }
        break;
      case 'robber': {
        const acts = listActions(s, cur).filter((a) => a.type === 'MOVE_ROBBER');
        run(acts[nextIntSafe(s, acts.length)]!);
        break;
      }
      case 'roadBuilding': {
        const acts = listActions(s, cur).filter((a) => a.type === 'BUILD_ROAD');
        run(acts[nextIntSafe(s, acts.length)]!);
        break;
      }
      case 'main':
        run({ type: 'END_TURN', playerId: cur });
        break;
      case 'special': {
        const q = s.special!.queue[0]!;
        run({ type: 'PASS_SPECIAL', playerId: q });
        break;
      }
      default:
        return { state: s, events };
    }
  }
  return { state: s, events };
}

function nextIntSafe(s: GameState, n: number): number {
  return nextInt({ rng: s.rng + n }, n);
}

export { defaultDiscard };
