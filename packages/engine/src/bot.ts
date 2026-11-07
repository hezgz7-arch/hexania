import { listActions } from './legal';
import { nextInt } from './rng';
import type { Action, GameState } from './types';
import { activePlayerId } from './game';

export interface BotOptions {
  /** Which seats this bot may play for (default: all of them). */
  controls?: (playerId: string) => boolean;
  /** % chance per decision of answering/confirming an open trade (default 60). */
  tradeChance?: number;
  /** % chance per main-phase decision of opening a 1:1 offer (default 6). */
  offerChance?: number;
  /** % chance per main-phase decision of trading with the bank (default 8). */
  bankChance?: number;
}

function pick<T>(h: { rng: number }, xs: T[]): T {
  return xs[nextInt(h, xs.length)]!;
}

/**
 * A simple bot: prefers building (city > settlement > dev card > road), plays cards,
 * rarely trades, otherwise ends its turn. Returns null when none of the seats it controls can act.
 * `h` is a private RNG holder, so bot decisions never touch the game's own RNG stream.
 */
export function chooseBotAction(s: GameState, h: { rng: number }, opts: BotOptions = {}): Action | null {
  if (s.phase === 'finished') return null;
  const controls = opts.controls ?? (() => true);
  const tradeChance = opts.tradeChance ?? 60;

  if (s.phase === 'discard') {
    const pid = Object.keys(s.pendingDiscards).find(controls);
    if (!pid) return null;
    return listActions(s, pid).find((a) => a.type === 'DISCARD') ?? null;
  }

  if (s.phase === 'main' && s.trades.length && nextInt(h, 100) < tradeChance) {
    const owner = s.trades[0]!.from;
    if (controls(owner)) {
      const confirm = listActions(s, owner).filter((a) => a.type === 'CONFIRM_TRADE');
      if (confirm.length && nextInt(h, 100) < 70) return pick(h, confirm);
    }
    for (const o of s.players.map((p) => p.id).filter((id) => id !== owner && controls(id))) {
      const resp = listActions(s, o).filter((a) => a.type === 'RESPOND_TRADE');
      if (resp.length) return pick(h, resp);
    }
  }

  const pid = activePlayerId(s);
  if (!pid || !controls(pid)) return null;
  const acts = listActions(s, pid);
  const of = (...t: string[]) => acts.filter((a) => t.includes(a.type));

  if (s.phase === 'setup') return pick(h, acts);
  if (s.phase === 'roll') return of('ROLL_DICE')[0] ?? null;
  if (s.phase === 'robber') return pick(h, of('MOVE_ROBBER'));
  if (s.phase === 'roadBuilding') return pick(h, of('BUILD_ROAD'));

  if (s.phase === 'main' || s.phase === 'special') {
    const prio = ['BUILD_CITY', 'BUILD_SETTLEMENT', 'BUY_DEV_CARD', 'PLAY_KNIGHT', 'PLAY_ROAD_BUILDING', 'PLAY_YEAR_OF_PLENTY', 'PLAY_MONOPOLY'];
    for (const t of prio) {
      const c = of(t);
      if (c.length && (t !== 'PLAY_MONOPOLY' || nextInt(h, 100) < 30)) return pick(h, c);
    }
    const roads = of('BUILD_ROAD');
    if (roads.length && nextInt(h, 100) < 45) return pick(h, roads);
    if (s.phase === 'main') {
      if (nextInt(h, 100) < (opts.bankChance ?? 8)) {
        const bt = of('BANK_TRADE');
        if (bt.length) return pick(h, bt);
      }
      if (nextInt(h, 100) < (opts.offerChance ?? 6)) {
        const o = listActions(s, pid, { includeTrades: true }).filter((a) => a.type === 'OFFER_TRADE');
        if (o.length) return pick(h, o);
      }
    }
  }
  return of('END_TURN', 'PASS_SPECIAL')[0] ?? null;
}
