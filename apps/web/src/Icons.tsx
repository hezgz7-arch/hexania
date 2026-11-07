import type { Resource } from '@hexania/engine';
import { colorKey, RES_COLOR, RES_ES } from './lib';

const GLYPH: Record<Resource, JSX.Element> = {
  lumber: (
    <g>
      <rect x="3" y="8" width="18" height="9" rx="2.5" fill="#f1e1bd" />
      <ellipse cx="6" cy="12.5" rx="3" ry="4.5" fill="#d9b673" stroke="#7a5a2b" strokeWidth="1" />
      <ellipse cx="6" cy="12.5" rx="1.2" ry="2" fill="none" stroke="#7a5a2b" strokeWidth=".8" />
      <path d="M10 10h9M10 13h9M10 16h7" stroke="#7a5a2b" strokeWidth=".8" opacity=".6" />
    </g>
  ),
  brick: (
    <g fill="#f4d8c8" stroke="#7a2f14" strokeWidth=".9">
      <rect x="3" y="5" width="8.5" height="4.5" rx=".8" />
      <rect x="12.5" y="5" width="8.5" height="4.5" rx=".8" />
      <rect x="7.5" y="10.5" width="9" height="4.5" rx=".8" />
      <rect x="3" y="16" width="8.5" height="4" rx=".8" />
      <rect x="12.5" y="16" width="8.5" height="4" rx=".8" />
    </g>
  ),
  wool: (
    <g>
      <circle cx="8" cy="11" r="4" fill="#fbfbf4" />
      <circle cx="13" cy="9" r="4.4" fill="#fbfbf4" />
      <circle cx="17" cy="12" r="3.8" fill="#fbfbf4" />
      <circle cx="11.5" cy="14" r="4" fill="#fbfbf4" />
      <circle cx="9.5" cy="18" r="1.1" fill="#3a3a30" />
      <circle cx="14" cy="18" r="1.1" fill="#3a3a30" />
    </g>
  ),
  grain: (
    <g fill="#fff3c4" stroke="#8a6a12" strokeWidth=".8">
      <path d="M12 21V8" fill="none" strokeWidth="1.2" />
      <ellipse cx="12" cy="5.5" rx="2" ry="3" />
      <ellipse cx="8.6" cy="9.5" rx="1.8" ry="2.8" transform="rotate(-28 8.6 9.5)" />
      <ellipse cx="15.4" cy="9.5" rx="1.8" ry="2.8" transform="rotate(28 15.4 9.5)" />
      <ellipse cx="8.8" cy="14.5" rx="1.8" ry="2.8" transform="rotate(-28 8.8 14.5)" />
      <ellipse cx="15.2" cy="14.5" rx="1.8" ry="2.8" transform="rotate(28 15.2 14.5)" />
    </g>
  ),
  ore: (
    <g>
      <path d="M12 3l7 6-7 12L5 9z" fill="#e7eef5" stroke="#3a4654" strokeWidth="1" strokeLinejoin="round" />
      <path d="M5 9h14M12 3l-3 6 3 12 3-12z" fill="none" stroke="#3a4654" strokeWidth=".8" opacity=".7" />
    </g>
  ),
};

export function ResIcon({ r, size = 28, title }: { r: Resource; size?: number; title?: boolean }) {
  return <img src={`/art/res-${r}.png`} width={size} height={size} alt={RES_ES[r]} title={title ? RES_ES[r] : undefined} className="res-icon" draggable={false} />;
}

/** Piece icons: the road stays a drawn bar, houses and castles are the sprites from the design sheet. */
export function PieceIcon({ kind, color, size = 22 }: { kind: 'road' | 'settlement' | 'city'; color: string; size?: number }) {
  if (kind === 'road')
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <rect x="2" y="9" width="20" height="6" rx="2" fill={color} stroke="#0b1c22" strokeWidth="1.4" />
      </svg>
    );
  return <img src={`/art/${kind === 'city' ? 'city' : 'house'}-${colorKey(color)}.png`} height={size} alt="" aria-hidden draggable={false} style={{ width: 'auto' }} />;
}

export function DevIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="2.5" width="16" height="19" rx="2.5" fill="#f3ead3" stroke="#0b1c22" strokeWidth="1.4" />
      <path d="M12 7l1.7 3.4 3.7.5-2.7 2.6.7 3.7-3.4-1.8-3.4 1.8.7-3.7-2.7-2.6 3.7-.5z" fill="#b78a2c" />
    </svg>
  );
}

export function Die({ n, size = 44, rolling }: { n: number; size?: number; rolling?: boolean }) {
  const pips: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
  };
  if (rolling) return <img src={`/art/die-${n % 2 ? 1 : 2}.png`} height={size} alt="" className="die rolling" draggable={false} style={{ width: 'auto' }} />;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={rolling ? 'die rolling' : 'die'} role="img" aria-label={`Dado: ${n}`}>
      <rect x="2" y="2" width="36" height="36" rx="8" fill="#f7efdb" stroke="#0b1c22" strokeWidth="2" />
      {(pips[n] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={9 + cx * 11} cy={9 + cy * 11} r="3.3" fill={n === 1 ? '#c2412d' : '#17262b'} />
      ))}
    </svg>
  );
}
