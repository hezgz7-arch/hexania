import { memo, useMemo, useRef } from 'react';
import { buildGeometry, type GameView, type Resource } from '@hexania/engine';
import { colorKey, PLAYER_HEX, PORT_LABEL, RES_COLOR, TERRAIN_FILL } from './lib';

const S = 60; // pixels per hex radius in SVG space

export interface Targets {
  vertices?: number[];
  edges?: number[];
  hexes?: number[];
}
export type PickKind = 'vertex' | 'edge' | 'hex';
export interface Picked {
  kind: PickKind;
  id: number;
}
export interface Burst {
  id: number;
  hexId: number;
  resource: Resource;
  amount: number;
  color: string;
}

interface Props {
  view: GameView;
  targets?: Targets;
  picked?: Picked | null;
  /** colour of the piece shown as a ghost on `picked` */
  ghostColor?: string;
  ghostKind?: 'road' | 'settlement' | 'city';
  onPick?: (p: Picked) => void;
  bursts?: Burst[];
  /** ids of pieces just built, for a pop animation */
  fresh?: Set<string>;
  highlightHexes?: Set<number>;
  compact?: boolean;
}

const dot = (n: number): number => 6 - Math.abs(7 - n);

function Patterns() {
  return (
    <defs>
      <pattern id="pat-forest" width="26" height="26" patternUnits="userSpaceOnUse">
        <path d="M7 19l4-9 4 9zM15 12l3.4-7 3.4 7z" fill="#245a33" opacity=".55" />
      </pattern>
      <pattern id="pat-pasture" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M4 18q2-5 4 0M14 9q2-5 4 0M16 20q2-4 3 0" fill="none" stroke="#5d9132" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
      </pattern>
      <pattern id="pat-fields" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
        <path d="M0 3h14M0 10h14" stroke="#b8861a" strokeWidth="2.2" opacity=".5" />
      </pattern>
      <pattern id="pat-hills" width="30" height="18" patternUnits="userSpaceOnUse">
        <path d="M0 9h30M0 0h30M15 0v9M0 9v9M30 9v9" stroke="#8c3a1c" strokeWidth="1.4" fill="none" opacity=".45" />
      </pattern>
      <pattern id="pat-mountains" width="34" height="26" patternUnits="userSpaceOnUse">
        <path d="M2 22l9-15 9 15zM16 22l8-11 8 11z" fill="#4e5764" opacity=".5" />
        <path d="M11 7l3 5h-6zM24 11l2.4 4h-4.8z" fill="#f2f5f8" opacity=".85" />
      </pattern>
      <pattern id="pat-desert" width="30" height="16" patternUnits="userSpaceOnUse">
        <path d="M2 11q7-8 14 0t13 0" fill="none" stroke="#a98f4d" strokeWidth="1.4" opacity=".6" />
      </pattern>
      <radialGradient id="sea" cx="50%" cy="45%" r="75%">
        <stop offset="0" stopColor="#4aa3d8" />
        <stop offset="1" stopColor="#1f6aa5" />
      </radialGradient>
      <filter id="piece-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.4" floodColor="#000" floodOpacity=".55" />
      </filter>
    </defs>
  );
}

const hexPoints = (vs: { x: number; y: number }[]): string => vs.map((v) => `${v.x * S},${v.y * S}`).join(' ');

/** mix a #rrggbb colour towards black (k<0) or white (k>0) */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Settlement / city sprites cut from the design sheet (65x62 house, 128x170 castle), anchored at their base. */
function Settlement({ x, y, color, big }: { x: number; y: number; color: string; big?: boolean }) {
  const name = (Object.keys(PLAYER_HEX) as (keyof typeof PLAYER_HEX)[]).find((k) => PLAYER_HEX[k] === color) ?? 'red';
  const w = big ? 48 : 38;
  const h = big ? (w * 170) / 128 : (w * 62) / 65;
  return (
    <g filter="url(#piece-shadow)">
      <ellipse cx={x} cy={y + 9} rx={w * 0.46} ry={w * 0.15} fill="#000" opacity=".28" />
      <image href={`/art/${big ? 'city' : 'house'}-${name}.png`} x={x - w / 2} y={y + 11 - h} width={w} height={h} />
    </g>
  );
}

/** Road bar sprite (iso, rising to the right): mirrored / rotated to lie along any of the three edge directions. */
function Road({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  let ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang <= -90) ang += 180;
  const flip = ang > 0;
  const rot = flip ? ang - 30 : ang + 30;
  const w = 42;
  const h = (w * 78) / 88;
  return (
    <g transform={`translate(${(x1 + x2) / 2},${(y1 + y2) / 2 + 1}) rotate(${rot}) scale(${flip ? -1 : 1},1)`} filter="url(#piece-shadow)">
      <image href={`/art/road-${colorKey(color)}.png`} x={-w / 2} y={-h / 2} width={w} height={h} />
    </g>
  );
}

function BoardSvgImpl({ view, targets, picked, ghostColor, ghostKind, onPick, bursts, fresh, highlightHexes, compact }: Props) {
  const geo = useMemo(() => buildGeometry(view.extended), [view.extended]);
  const svgRef = useRef<SVGSVGElement>(null);
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of view.players) m.set(p.id, PLAYER_HEX[p.color]);
    return m;
  }, [view.players]);

  // the sea sits inside the wooden frame art (470x352, inner sea 420x305 at 25,24)
  const bounds = useMemo(() => {
    const xs = geo.vertices.map((v) => v.x * S);
    const ys = geo.vertices.map((v) => v.y * S);
    const pad = S * 1.15;
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cw = Math.max(...xs) - Math.min(...xs) + 2 * pad;
    const ch = Math.max(...ys) - Math.min(...ys) + 2 * pad;
    const fw = Math.max((cw * 470) / 420, (ch * 470) / 305);
    const k = fw / 470;
    return { x: cx - fw / 2, y: cy - (352 * k) / 2, w: fw, h: 352 * k, k };
  }, [geo]);

  const vx = (id: number) => geo.vertices[id]!;
  const ports = useMemo(
    () =>
      view.board.ports.map((p) => {
        const e = geo.edges[p.edgeId]!;
        const a = vx(e.a);
        const b = vx(e.b);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const h = geo.hexes[geo.edgeHexes[p.edgeId]![0]!]!;
        let dx = mx - h.x;
        let dy = my - h.y;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
        return { ...p, a, b, px: (mx + dx * 0.62) * S, py: (my + dy * 0.62) * S };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.board.ports, geo],
  );

  const robberHex = geo.hexes[view.board.robber]!;

  // tapping anywhere snaps to the nearest legal target: fingers are far bigger than corners
  function handlePointer(ev: React.PointerEvent<SVGSVGElement>) {
    if (!onPick || !svgRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const m = svgRef.current.getScreenCTM();
    if (!m) return;
    const p = pt.matrixTransform(m.inverse());
    let best: Picked | null = null;
    let bestD = S * 0.75;
    for (const id of targets?.vertices ?? []) {
      const v = vx(id);
      const d = Math.hypot(v.x * S - p.x, v.y * S - p.y);
      if (d < bestD) (bestD = d), (best = { kind: 'vertex', id });
    }
    for (const id of targets?.edges ?? []) {
      const e = geo.edges[id]!;
      const d = Math.hypot(((vx(e.a).x + vx(e.b).x) / 2) * S - p.x, ((vx(e.a).y + vx(e.b).y) / 2) * S - p.y);
      if (d < bestD) (bestD = d), (best = { kind: 'edge', id });
    }
    if (!best) {
      let bd = S * 0.95;
      for (const id of targets?.hexes ?? []) {
        const h = geo.hexes[id]!;
        const d = Math.hypot(h.x * S - p.x, h.y * S - p.y);
        if (d < bd) (bd = d), (best = { kind: 'hex', id });
      }
    }
    if (best) onPick(best);
  }

  const interactive = !!onPick && !!(targets?.vertices?.length || targets?.edges?.length || targets?.hexes?.length);

  return (
    <svg
      ref={svgRef}
      className={`board-svg${compact ? ' compact' : ''}${interactive ? ' interactive' : ''}`}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerUp={handlePointer}
      role="img"
      aria-label="Tablero de Hexania"
    >
      <Patterns />

      {/* sea under the wooden frame art */}
      <polygon
        points={[[115, 24], [365, 24], [445, 114], [445, 259], [365, 329], [115, 329], [25, 259], [25, 114]].map(([px, py]) => `${bounds.x + (px! - 4 * Math.sign(px! - 235)) * bounds.k},${bounds.y + (py! - 4 * Math.sign(py! - 176)) * bounds.k}`).join(' ')}
        fill="url(#sea)"
      />

      <image href="/art/frame.png" x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} pointerEvents="none" />

      {/* ports: piers first so hexes overlap their feet */}
      {ports.map((p) => (
        <g key={`port-${p.edgeId}`} className="port">
          <path d={`M${p.a.x * S},${p.a.y * S}L${p.px},${p.py}L${p.b.x * S},${p.b.y * S}`} stroke="#8a5a1c" strokeWidth="4" fill="none" strokeLinecap="round" />
          {p.type === 'generic' && <path d={`M${p.px},${p.py - 22}L${p.px + 19},${p.py - 11}V${p.py + 8}L${p.px},${p.py + 22}L${p.px - 19},${p.py + 8}V${p.py - 11}Z`} fill="#f6e6bd" stroke="#6a3f18" strokeWidth="3" strokeLinejoin="round" />}
          {p.type !== 'generic' ? <image href={`/art/port-${p.type}.png`} x={p.px - 29} y={p.py - 35} width="58" height="70" /> : <g><image href="/art/shield-ship.png" x={p.px - 28} y={p.py - 25} width="56" height="48" /><text x={p.px} y={p.py + 21} textAnchor="middle" className="port-label">{PORT_LABEL(p.type)}</text></g>}
        </g>
      ))}

      {geo.hexes.map((h) => {
        const info = view.board.hexes[h.id]!;
        const vs = geo.hexVertices[h.id]!.map(vx);
        return (
          <g key={h.id} className={`hex terrain-${info.terrain}`}>
            <polygon points={hexPoints(vs)} fill={TERRAIN_FILL[info.terrain]} />
            <image href={`/art/hex-${info.terrain}.png`} x={h.x * S - 55.3} y={h.y * S - 61.5} width="110.6" height="123" pointerEvents="none" />
            {highlightHexes?.has(h.id) && <polygon points={hexPoints(vs)} fill="#fff" opacity=".28" pointerEvents="none" className="hex-glow" />}
            {info.token !== null && (
              <g transform={`translate(${h.x * S},${h.y * S})`} className="token" pointerEvents="none">
                <image href={`/art/tok-${info.token}.png`} x="-22" y="-22" width="44" height="44" />
              </g>
            )}
          </g>
        );
      })}

      {/* roads */}
      {Object.entries(view.roads).map(([eid, owner]) => {
        const e = geo.edges[Number(eid)]!;
        const a = vx(e.a);
        const b = vx(e.b);
        const x1 = a.x * S + (b.x - a.x) * S * 0.14;
        const y1 = a.y * S + (b.y - a.y) * S * 0.14;
        const x2 = b.x * S + (a.x - b.x) * S * 0.14;
        const y2 = b.y * S + (a.y - b.y) * S * 0.14;
        return (
          <g key={`r${eid}`} className={fresh?.has(`r${eid}`) ? 'piece fresh' : 'piece'} filter="url(#piece-shadow)">
            <Road x1={x1} y1={y1} x2={x2} y2={y2} color={colorOf.get(owner) ?? '#888'} />
          </g>
        );
      })}

      {/* buildings */}
      {Object.entries(view.buildings).map(([vid, b]) => {
        const v = vx(Number(vid));
        return (
          <g key={`b${vid}`} className={fresh?.has(`b${vid}${b.kind}`) ? 'piece fresh' : 'piece'}>
            <Settlement x={v.x * S} y={v.y * S - 2} color={colorOf.get(b.owner) ?? '#888'} big={b.kind === 'city'} />
          </g>
        );
      })}

      {/* robber */}
      <g className="robber" style={{ transform: `translate(${robberHex.x * S + 20}px, ${robberHex.y * S - 4}px)` }} pointerEvents="none" filter="url(#piece-shadow)">
        <image href="/art/robber.png" x="-21" y="-46" width="42" height="64" />
      </g>

      {/* targets */}
      {targets?.edges?.map((id) => {
        const e = geo.edges[id]!;
        const a = vx(e.a);
        const b = vx(e.b);
        const on = picked?.kind === 'edge' && picked.id === id;
        return (
          <line
            key={`te${id}`}
            x1={a.x * S + (b.x - a.x) * S * 0.18}
            y1={a.y * S + (b.y - a.y) * S * 0.18}
            x2={b.x * S + (a.x - b.x) * S * 0.18}
            y2={b.y * S + (a.y - b.y) * S * 0.18}
            className={`target edge${on ? ' on' : ''}`}
            strokeWidth="9"
            strokeLinecap="round"
          />
        );
      })}
      {targets?.vertices?.map((id) => {
        const v = vx(id);
        const on = picked?.kind === 'vertex' && picked.id === id;
        return <circle key={`tv${id}`} cx={v.x * S} cy={v.y * S} r={on ? 13 : 9} className={`target vertex${on ? ' on' : ''}`} />;
      })}
      {targets?.hexes?.map((id) => {
        const h = geo.hexes[id]!;
        const on = picked?.kind === 'hex' && picked.id === id;
        return <polygon key={`th${id}`} points={hexPoints(geo.hexVertices[id]!.map(vx))} className={`target hexsel${on ? ' on' : ''}`} />;
      })}

      {/* ghost piece */}
      {picked && ghostColor && ghostKind && picked.kind === 'vertex' && (
        <g opacity=".72" pointerEvents="none">
          <Settlement x={vx(picked.id).x * S} y={vx(picked.id).y * S - 2} color={ghostColor} big={ghostKind === 'city'} />
        </g>
      )}
      {picked && ghostColor && picked.kind === 'edge' && (() => {
        const e = geo.edges[picked.id]!;
        const a = vx(e.a);
        const b = vx(e.b);
        return (
          <g opacity=".72" pointerEvents="none">
            <Road x1={a.x * S} y1={a.y * S} x2={b.x * S} y2={b.y * S} color={ghostColor} />
          </g>
        );
      })()}

      {/* resource income bursts */}
      {bursts?.map((b, i) => {
        const h = geo.hexes[b.hexId]!;
        return (
          <g key={b.id} transform={`translate(${h.x * S + (i % 3) * 14 - 14},${h.y * S - 24})`} className="burst" pointerEvents="none">
            <circle r="13" fill={RES_COLOR[b.resource]} stroke="#fff" strokeWidth="2" />
            <text y="5" textAnchor="middle" className="burst-num">
              +{b.amount}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export const BoardSvg = memo(BoardSvgImpl);
