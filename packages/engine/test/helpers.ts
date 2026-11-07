import {
  applyAction,
  buildGeometry,
  createGame,
  emptyCounts,
  listActions,
  longestRoadFor,
  type Action,
  type GameState,
  type PlayerColor,
  type ResourceCounts,
} from '../src';

const COLORS: PlayerColor[] = ['red', 'blue', 'white', 'orange', 'green', 'purple'];

export function newGame(n = 4, seed = 1, mode: 'spiral' | 'balanced' = 'spiral'): GameState {
  return createGame(
    { players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: COLORS[i]! })), numberMode: mode },
    seed,
  );
}

/** A game already past setup: empty board, phase `main`, player 0 to act, empty hands. */
export function mainState(n = 4, seed = 1): GameState {
  const s = newGame(n, seed);
  // createGame rotates seats so the dice winner goes first; tests want p0..pn-1 in order
  s.players.sort((a, b) => a.id.localeCompare(b.id));
  s.config.players.sort((a, b) => a.id.localeCompare(b.id));
  s.setup = null;
  s.phase = 'main';
  s.current = 0;
  s.turn = 1;
  return s;
}

export const hand = (s: GameState, pid: string, c: Partial<ResourceCounts>) => {
  const p = s.players.find((x) => x.id === pid)!;
  // keep the bank consistent: adjust bank by the difference
  const next = { ...emptyCounts(), ...c };
  for (const r of Object.keys(next) as (keyof ResourceCounts)[]) {
    s.bank[r] += p.hand[r] - next[r];
    p.hand[r] = next[r];
  }
};
export const pl = (s: GameState, pid: string) => s.players.find((p) => p.id === pid)!;
export const putSettlement = (s: GameState, pid: string, v: number, kind: 'settlement' | 'city' = 'settlement') => {
  s.buildings[v] = { owner: pid, kind };
  const p = pl(s, pid);
  if (kind === 'settlement') p.settlementsLeft--;
  else p.citiesLeft--;
};
export const putRoad = (s: GameState, pid: string, e: number) => {
  s.roads[e] = pid;
  pl(s, pid).roadsLeft--;
};
export const act = (s: GameState, a: Action) => applyAction(s, a);
export const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    if ((e as { code?: string }).code === code) return;
    throw new Error(`expected ${code}, got ${(e as { code?: string }).code}: ${(e as Error).message}`);
  }
  throw new Error(`expected error ${code}, nothing thrown`);
};

/** A simple path of `len` edges starting at a vertex; returns edge ids in order and the vertex chain. */
export function chain(extended: boolean, len: number, startVertex = 0, avoidEdges: Set<number> = new Set()) {
  const g = buildGeometry(extended);
  const usedV = new Set<number>([startVertex]);
  const edges: number[] = [];
  const verts = [startVertex];
  const dfs = (v: number): boolean => {
    if (edges.length === len) return true;
    for (const e of g.vertexEdges[v]!) {
      if (avoidEdges.has(e)) continue;
      const ed = g.edges[e]!;
      const w = ed.a === v ? ed.b : ed.a;
      if (usedV.has(w)) continue;
      usedV.add(w);
      edges.push(e);
      verts.push(w);
      if (dfs(w)) return true;
      edges.pop();
      verts.pop();
      usedV.delete(w);
    }
    return false;
  };
  if (!dfs(startVertex)) throw new Error('no chain');
  return { edges, verts };
}

/** Plays the whole setup phase with the first legal action each time. */
export function autoSetup(s: GameState): GameState {
  let st = s;
  while (st.phase === 'setup') {
    const pid = st.players[st.current]!.id;
    st = applyAction(st, listActions(st, pid)[0]!).state;
  }
  return st;
}

export { longestRoadFor };
