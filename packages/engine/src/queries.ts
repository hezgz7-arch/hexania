import { buildGeometry, type Geometry } from './geometry';
import { COSTS, RESOURCES, type BuildKind, type GameState, type PlayerState, type Resource, type ResourceCounts } from './types';

export const geo = (s: GameState): Geometry => buildGeometry(s.extended);
export const getPlayer = (s: GameState, id: string): PlayerState | undefined => s.players.find((p) => p.id === id);
export const handSize = (p: PlayerState): number => RESOURCES.reduce((n, r) => n + p.hand[r], 0);
export const countOf = (c: Partial<ResourceCounts>): number => RESOURCES.reduce((n, r) => n + (c[r] ?? 0), 0);

export function missingFor(hand: ResourceCounts, cost: Partial<ResourceCounts>): Partial<ResourceCounts> {
  const out: Partial<ResourceCounts> = {};
  for (const r of RESOURCES) {
    const need = (cost[r] ?? 0) - hand[r];
    if (need > 0) out[r] = need;
  }
  return out;
}
export const canAfford = (p: PlayerState, kind: BuildKind): boolean => countOf(missingFor(p.hand, COSTS[kind])) === 0;

/** Vertices from which `pid` may extend a road (own building, or own road without a rival building in between). */
function roadFrontier(s: GameState, pid: string): Set<number> {
  const g = geo(s);
  const out = new Set<number>();
  for (const [v, b] of Object.entries(s.buildings)) if (b.owner === pid) out.add(Number(v));
  for (const [e, owner] of Object.entries(s.roads)) {
    if (owner !== pid) continue;
    const edge = g.edges[Number(e)]!;
    for (const v of [edge.a, edge.b]) {
      const b = s.buildings[v];
      if (!b || b.owner === pid) out.add(v);
    }
  }
  return out;
}

export function roadSpots(s: GameState, pid: string): number[] {
  const g = geo(s);
  const front = roadFrontier(s, pid);
  return g.edges.filter((e) => s.roads[e.id] === undefined && (front.has(e.a) || front.has(e.b))).map((e) => e.id);
}

export function distanceOk(s: GameState, v: number): boolean {
  const g = geo(s);
  return s.buildings[v] === undefined && g.vertexNeighbors[v]!.every((n) => s.buildings[n] === undefined);
}

export function settlementSpots(s: GameState, pid: string, needRoad: boolean): number[] {
  const g = geo(s);
  const own = new Set<number>();
  if (needRoad) {
    for (const [e, owner] of Object.entries(s.roads)) {
      if (owner !== pid) continue;
      own.add(g.edges[Number(e)]!.a);
      own.add(g.edges[Number(e)]!.b);
    }
  }
  return g.vertices.filter((v) => distanceOk(s, v.id) && (!needRoad || own.has(v.id))).map((v) => v.id);
}

export function citySpots(s: GameState, pid: string): number[] {
  return Object.entries(s.buildings)
    .filter(([, b]) => b.owner === pid && b.kind === 'settlement')
    .map(([v]) => Number(v));
}

export function longestRoadFor(s: GameState, pid: string): number {
  const g = geo(s);
  const adj = new Map<number, number[]>();
  for (const [e, owner] of Object.entries(s.roads)) {
    if (owner !== pid) continue;
    const edge = g.edges[Number(e)]!;
    for (const v of [edge.a, edge.b]) {
      if (!adj.has(v)) adj.set(v, []);
      adj.get(v)!.push(edge.id);
    }
  }
  const blocked = (v: number) => {
    const b = s.buildings[v];
    return b !== undefined && b.owner !== pid;
  };
  const visited = new Set<number>();
  let best = 0;
  const dfs = (v: number, len: number) => {
    if (len > best) best = len;
    for (const e of adj.get(v) ?? []) {
      if (visited.has(e)) continue;
      const edge = g.edges[e]!;
      const w = edge.a === v ? edge.b : edge.a;
      visited.add(e);
      if (blocked(w)) best = Math.max(best, len + 1);
      else dfs(w, len + 1);
      visited.delete(e);
    }
  };
  for (const v of adj.keys()) dfs(v, 0);
  return best;
}

export function publicVP(s: GameState, p: PlayerState): number {
  let vp = 0;
  for (const b of Object.values(s.buildings)) if (b.owner === p.id) vp += b.kind === 'city' ? 2 : 1;
  if (s.longestRoadHolder === p.id) vp += 2;
  if (s.largestArmyHolder === p.id) vp += 2;
  return vp;
}
export const hiddenVP = (p: PlayerState): number => p.dev.victoryPoint + p.devNew.victoryPoint;
export const totalVP = (s: GameState, p: PlayerState): number => publicVP(s, p) + hiddenVP(p);

/** Best maritime ratio for giving `res`. */
export function bankRatio(s: GameState, pid: string, res: Resource): number {
  const g = geo(s);
  let ratio = 4;
  for (const port of s.board.ports) {
    const e = g.edges[port.edgeId]!;
    const mine = [e.a, e.b].some((v) => s.buildings[v]?.owner === pid);
    if (!mine) continue;
    if (port.type === 'generic') ratio = Math.min(ratio, 3);
    else if (port.type === res) ratio = Math.min(ratio, 2);
  }
  return ratio;
}

/** Players (other than `pid`) with a building on the hex and at least one card. */
export function robberVictims(s: GameState, pid: string, hexId: number): string[] {
  const g = geo(s);
  const out = new Set<string>();
  for (const v of g.hexVertices[hexId]!) {
    const b = s.buildings[v];
    if (b && b.owner !== pid) {
      const p = getPlayer(s, b.owner)!;
      if (handSize(p) > 0) out.add(b.owner);
    }
  }
  return [...out];
}

/** Edges next to a vertex that are free (used in setup). */
export function setupRoadSpots(s: GameState): number[] {
  const v = s.setup?.lastVertex;
  if (v === null || v === undefined) return [];
  return geo(s).vertexEdges[v]!.filter((e) => s.roads[e] === undefined);
}
