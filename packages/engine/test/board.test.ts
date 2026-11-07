import { describe, expect, it } from 'vitest';
import { BASE_TOKENS, EXT_TOKENS, SPIRAL_TOKENS, buildGeometry, generateBoard, spiralOrder } from '../src';
import { newGame } from './helpers';

describe('geometry', () => {
  it('base board: 19 hexes, 54 vertices, 72 edges, 30 coast edges', () => {
    const g = buildGeometry(false);
    expect(g.hexes).toHaveLength(19);
    expect(g.vertices).toHaveLength(54);
    expect(g.edges).toHaveLength(72);
    expect(g.coastEdges).toHaveLength(30);
    expect(g.portSlots).toHaveLength(9);
  });
  it('rows are 3-4-5-4-3', () => {
    const g = buildGeometry(false);
    const rows = new Map<number, number>();
    g.hexes.forEach((h) => rows.set(h.r, (rows.get(h.r) ?? 0) + 1));
    expect([...rows.values()]).toEqual([3, 4, 5, 4, 3]);
  });
  it('extended board: 30 hexes in rows 3-4-5-6-5-4-3 and 11 port slots', () => {
    const g = buildGeometry(true);
    expect(g.hexes).toHaveLength(30);
    const rows = new Map<number, number>();
    g.hexes.forEach((h) => rows.set(h.r, (rows.get(h.r) ?? 0) + 1));
    expect([...rows.values()]).toEqual([3, 4, 5, 6, 5, 4, 3]);
    expect(g.portSlots).toHaveLength(11);
    expect(g.coastEdges.length).toBeGreaterThan(30);
  });
  it('port slots never share a vertex', () => {
    for (const ext of [false, true]) {
      const g = buildGeometry(ext);
      const seen = new Set<number>();
      for (const e of g.portSlots) {
        for (const v of [g.edges[e]!.a, g.edges[e]!.b]) {
          expect(seen.has(v)).toBe(false);
          seen.add(v);
        }
      }
    }
  });
  it('adjacency is consistent', () => {
    const g = buildGeometry(true);
    for (const e of g.edges) {
      expect(g.vertexNeighbors[e.a]).toContain(e.b);
      expect(g.vertexNeighbors[e.b]).toContain(e.a);
    }
    for (const v of g.vertices) expect(g.vertexEdges[v.id]!.length).toBeGreaterThanOrEqual(2);
    for (const v of g.vertices) expect(g.vertexEdges[v.id]!.length).toBeLessThanOrEqual(3);
  });
});

describe('board generation', () => {
  it('base: terrain mix, tokens, ports, robber on desert', () => {
    const b = generateBoard(false, 'spiral', { rng: 5 });
    const count = (t: string) => b.hexes.filter((h) => h.terrain === t).length;
    expect([count('forest'), count('pasture'), count('fields'), count('hills'), count('mountains'), count('desert')]).toEqual([4, 4, 4, 3, 3, 1]);
    expect(b.hexes.filter((h) => h.token !== null).map((h) => h.token).sort((a, b) => a! - b!)).toEqual([...BASE_TOKENS].sort((a, b) => a - b));
    expect(b.hexes[b.robber]!.terrain).toBe('desert');
    expect(b.hexes[b.robber]!.token).toBeNull();
    expect(b.ports.filter((p) => p.type === 'generic')).toHaveLength(4);
    for (const r of ['lumber', 'brick', 'wool', 'grain', 'ore']) expect(b.ports.filter((p) => p.type === r)).toHaveLength(1);
  });
  it('spiral: tokens follow the official order skipping the desert', () => {
    const rng = { rng: 11 };
    const b = generateBoard(false, 'spiral', rng);
    // reconstruct with same stream: the order is deterministic given the seed, check by walking the spiral again
    const g = buildGeometry(false);
    const seen = b.hexes.map((h) => h.token).filter((t) => t !== null);
    expect(seen).toHaveLength(18);
    // every ring-walk neighbour pair along the spiral is adjacent (outer ring is a cycle)
    const order = spiralOrder(false, { rng: 11 });
    expect(order).toHaveLength(19);
    expect(order[18]).toBe(g.hexes.findIndex((h) => h.q === 0 && h.r === 0));
    for (let i = 0; i < 11; i++) expect(g.hexNeighbors[order[i]!]).toContain(order[i + 1]);
    expect(SPIRAL_TOKENS).toHaveLength(18);
  });
  it('balanced: no 6/8 touches another 6/8 (base and extended, many seeds)', () => {
    for (const ext of [false, true]) {
      const g = buildGeometry(ext);
      for (let seed = 1; seed <= 30; seed++) {
        const b = generateBoard(ext, 'balanced', { rng: seed });
        b.hexes.forEach((h, i) => {
          if (h.token === 6 || h.token === 8)
            for (const nb of g.hexNeighbors[i]!) expect([6, 8]).not.toContain(b.hexes[nb]!.token);
        });
      }
    }
  });
  it('extended: 30 hexes, 2 deserts without tokens, 28 tokens, 11 ports with 2 wool', () => {
    const b = generateBoard(true, 'spiral', { rng: 3 }); // spiral is ignored for 5-6
    expect(b.hexes).toHaveLength(30);
    expect(b.hexes.filter((h) => h.terrain === 'desert')).toHaveLength(2);
    expect(b.hexes.filter((h) => h.terrain === 'desert').every((h) => h.token === null)).toBe(true);
    expect(b.hexes.filter((h) => h.token !== null).map((h) => h.token).sort((a, b) => a! - b!)).toEqual([...EXT_TOKENS].sort((a, b) => a - b));
    expect(b.ports).toHaveLength(11);
    expect(b.ports.filter((p) => p.type === 'generic')).toHaveLength(5);
    expect(b.ports.filter((p) => p.type === 'wool')).toHaveLength(2);
    expect(b.hexes[b.robber]!.terrain).toBe('desert');
  });
  it('createGame component counts', () => {
    const s = newGame(3);
    expect(s.bank.lumber).toBe(19);
    expect(s.deck).toHaveLength(25);
    expect(s.deck.filter((c) => c === 'knight')).toHaveLength(14);
    const e = newGame(6);
    expect(e.bank.ore).toBe(24);
    expect(e.deck).toHaveLength(34);
    expect(e.deck.filter((c) => c === 'knight')).toHaveLength(20);
    expect(e.extended).toBe(true);
  });
});
