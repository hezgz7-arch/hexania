export interface Geometry {
  extended: boolean;
  hexes: { id: number; q: number; r: number; x: number; y: number }[];
  vertices: { id: number; x: number; y: number }[];
  edges: { id: number; a: number; b: number }[];
  hexVertices: number[][]; // 6 vertex ids per hex (corner 0 = top, clockwise on screen)
  hexNeighbors: number[][];
  vertexHexes: number[][];
  vertexNeighbors: number[][];
  vertexEdges: number[][];
  edgeHexes: number[][];
  /** coast edges in walking order around the island */
  coastEdges: number[];
  /** fixed port slots (edge ids) */
  portSlots: number[];
  /** outermost corner hexes, used as spiral start */
  hexCorners: number[];
}

const SQRT3 = Math.sqrt(3);
export const ROWS_BASE = [3, 4, 5, 4, 3];
export const ROWS_EXT = [3, 4, 5, 6, 5, 4, 3];

const cache = new Map<boolean, Geometry>();

export function buildGeometry(extended: boolean): Geometry {
  const hit = cache.get(extended);
  if (hit) return hit;
  const rows = extended ? ROWS_EXT : ROWS_BASE;
  const half = Math.floor(rows.length / 2);
  const hexes: Geometry['hexes'] = [];
  rows.forEach((len, i) => {
    const r = i - half;
    for (let c = 0; c < len; c++) {
      const xs = (c - (len - 1) / 2) * SQRT3 + (extended ? SQRT3 / 2 : 0);
      const q = Math.round(xs / SQRT3 - r / 2);
      hexes.push({ id: hexes.length, q, r, x: xs, y: 1.5 * r });
    }
  });

  const vKey = new Map<string, number>();
  const vertices: Geometry['vertices'] = [];
  const hexVertices: number[][] = [];
  for (const h of hexes) {
    const ids: number[] = [];
    for (let k = 0; k < 6; k++) {
      const ang = ((-90 + 60 * k) * Math.PI) / 180;
      const px = h.x + Math.cos(ang);
      const py = h.y + Math.sin(ang);
      const key = `${Math.round(px * 100)}_${Math.round(py * 100)}`;
      let id = vKey.get(key);
      if (id === undefined) {
        id = vertices.length;
        vKey.set(key, id);
        vertices.push({ id, x: px, y: py });
      }
      ids.push(id);
    }
    hexVertices.push(ids);
  }

  const eKey = new Map<string, number>();
  const edges: Geometry['edges'] = [];
  const edgeHexes: number[][] = [];
  for (const h of hexes) {
    const vs = hexVertices[h.id]!;
    for (let k = 0; k < 6; k++) {
      const a = vs[k]!;
      const b = vs[(k + 1) % 6]!;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let id = eKey.get(key);
      if (id === undefined) {
        id = edges.length;
        eKey.set(key, id);
        edges.push({ id, a: Math.min(a, b), b: Math.max(a, b) });
        edgeHexes.push([]);
      }
      edgeHexes[id]!.push(h.id);
    }
  }

  const vertexHexes: number[][] = vertices.map(() => []);
  hexVertices.forEach((vs, hid) => vs.forEach((v) => vertexHexes[v]!.push(hid)));
  const vertexEdges: number[][] = vertices.map(() => []);
  const vertexNeighbors: number[][] = vertices.map(() => []);
  for (const e of edges) {
    vertexEdges[e.a]!.push(e.id);
    vertexEdges[e.b]!.push(e.id);
    vertexNeighbors[e.a]!.push(e.b);
    vertexNeighbors[e.b]!.push(e.a);
  }
  const hexNeighbors: number[][] = hexes.map(() => []);
  for (const hs of edgeHexes) {
    if (hs.length === 2) {
      hexNeighbors[hs[0]!]!.push(hs[1]!);
      hexNeighbors[hs[1]!]!.push(hs[0]!);
    }
  }

  // walk the coastline
  const coast = edges.filter((e) => edgeHexes[e.id]!.length === 1).map((e) => e.id);
  const coastSet = new Set(coast);
  const ordered: number[] = [];
  const seen = new Set<number>();
  let curEdge = coast[0]!;
  let curV = edges[curEdge]!.b;
  while (!seen.has(curEdge)) {
    seen.add(curEdge);
    ordered.push(curEdge);
    const next = vertexEdges[curV]!.find((e) => coastSet.has(e) && !seen.has(e));
    if (next === undefined) break;
    const ne = edges[next]!;
    curV = ne.a === curV ? ne.b : ne.a;
    curEdge = next;
  }
  const portCount = extended ? 11 : 9;
  const portSlots = Array.from({ length: portCount }, (_, k) => ordered[Math.floor((k * ordered.length) / portCount)]!);

  const cx = hexes.reduce((s, h) => s + h.x, 0) / hexes.length;
  const cy = hexes.reduce((s, h) => s + h.y, 0) / hexes.length;
  const dist = hexes.map((h) => Math.hypot(h.x - cx, h.y - cy));
  const maxD = Math.max(...dist);
  const hexCorners = hexes.filter((h) => dist[h.id]! > maxD - 0.01).map((h) => h.id);

  const g: Geometry = {
    extended,
    hexes,
    vertices,
    edges,
    hexVertices,
    hexNeighbors,
    vertexHexes,
    vertexNeighbors,
    vertexEdges,
    edgeHexes,
    coastEdges: ordered,
    portSlots,
    hexCorners,
  };
  cache.set(extended, g);
  return g;
}
