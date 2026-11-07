import { buildGeometry } from './geometry';
import { shuffle, nextInt } from './rng';
import type { BoardState, NumberMode, PortInfo, PortType, Terrain } from './types';

const rep = (t: Terrain, n: number): Terrain[] => Array.from({ length: n }, () => t);
const BASE_TERRAIN: Terrain[] = [
  ...rep('forest', 4),
  ...rep('pasture', 4),
  ...rep('fields', 4),
  ...rep('hills', 3),
  ...rep('mountains', 3),
  'desert',
];
const EXT_TERRAIN: Terrain[] = [
  ...rep('forest', 6),
  ...rep('pasture', 6),
  ...rep('fields', 6),
  ...rep('hills', 5),
  ...rep('mountains', 5),
  'desert',
  'desert',
];
export const BASE_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
export const EXT_TOKENS = [
  2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
];
/** Official spiral order for the base board. */
export const SPIRAL_TOKENS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

const isRed = (n: number | null) => n === 6 || n === 8;

/** Hex ids in spiral order: outer ring from a random corner, then each inner ring, ending at the centre. */
export function spiralOrder(extended: boolean, holder: { rng: number }): number[] {
  const g = buildGeometry(extended);
  const n = g.hexes.length;
  const cx = g.hexes.reduce((s, h) => s + h.x, 0) / n;
  const cy = g.hexes.reduce((s, h) => s + h.y, 0) / n;
  const angle = (id: number) => Math.atan2(g.hexes[id]!.y - cy, g.hexes[id]!.x - cx);
  let remaining = new Set(g.hexes.map((h) => h.id));
  const out: number[] = [];
  let last = -1;
  while (remaining.size) {
    const layer = [...remaining].filter((id) => g.hexNeighbors[id]!.filter((x) => remaining.has(x)).length < 6);
    const layerSet = layer.length ? layer : [...remaining];
    layerSet.sort((a, b) => angle(a) - angle(b));
    let start: number;
    if (last < 0) {
      const corners = layerSet.filter((id) => g.hexCorners.includes(id));
      start = corners[nextInt(holder, corners.length)]!;
    } else {
      const L = g.hexes[last]!;
      const d = (id: number) => Math.hypot(g.hexes[id]!.x - L.x, g.hexes[id]!.y - L.y);
      start = layerSet.reduce((best, id) => (d(id) < d(best) ? id : best), layerSet[0]!);
    }
    const si = layerSet.indexOf(start);
    for (let k = 0; k < layerSet.length; k++) out.push(layerSet[(si + k) % layerSet.length]!);
    last = out[out.length - 1]!;
    const used = new Set(layerSet);
    remaining = new Set([...remaining].filter((id) => !used.has(id)));
  }
  return out;
}

export function generateBoard(extended: boolean, mode: NumberMode, holder: { rng: number }): BoardState {
  const g = buildGeometry(extended);
  const terrains = shuffle(holder, [...(extended ? EXT_TERRAIN : BASE_TERRAIN)]);
  const tokens: (number | null)[] = terrains.map(() => null);
  const land = terrains.map((t, i) => (t === 'desert' ? -1 : i)).filter((i) => i >= 0);

  if (mode === 'spiral' && !extended) {
    const order = spiralOrder(false, holder).filter((id) => terrains[id] !== 'desert');
    order.forEach((id, i) => (tokens[id] = SPIRAL_TOKENS[i]!));
  } else {
    const pool = extended ? EXT_TOKENS : BASE_TOKENS;
    let ok = false;
    for (let attempt = 0; attempt < 50000 && !ok; attempt++) {
      const shuffled = shuffle(holder, [...pool]);
      land.forEach((id, i) => (tokens[id] = shuffled[i]!));
      ok = land.every((id) => !isRed(tokens[id]!) || g.hexNeighbors[id]!.every((nb) => !isRed(tokens[nb]!)));
    }
    if (!ok) throw new Error('could not place balanced numbers');
  }

  const portTypes: PortType[] = extended
    ? ['generic', 'generic', 'generic', 'generic', 'generic', 'lumber', 'brick', 'wool', 'wool', 'grain', 'ore']
    : ['generic', 'generic', 'generic', 'generic', 'lumber', 'brick', 'wool', 'grain', 'ore'];
  shuffle(holder, portTypes);
  const ports: PortInfo[] = g.portSlots.map((edgeId, i) => ({ edgeId, type: portTypes[i]! }));
  const hexes = terrains.map((terrain, i) => ({ terrain, token: tokens[i]! }));
  const robber = hexes.findIndex((h) => h.terrain === 'desert');
  return { hexes, ports, robber };
}
