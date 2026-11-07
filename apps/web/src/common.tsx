import { useEffect, useState, type ReactNode } from 'react';
import type { Conn } from './net';
import { fmtClock } from './lib';

export function useNow(interval = 500): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

/** Keeps the screen on while the game is open (tablet and phones). */
export function useWakeLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    let lock: WakeLockSentinel | null = null;
    let dead = false;
    const request = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          lock = await navigator.wakeLock.request('screen');
          if (dead) void lock.release();
        }
      } catch {
        /* denied or unsupported: nothing to do */
      }
    };
    void request();
    const onVis = () => void request();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      dead = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

export function Splash({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="splash">
      <div className="splash-mark" aria-hidden>
        <svg viewBox="-30 -30 60 60" width="84" height="84">
          <polygon points="0,-26 22.5,-13 22.5,13 0,26 -22.5,13 -22.5,-13" fill="none" stroke="#d6ad4f" strokeWidth="3" />
          <polygon points="0,-14 12,-7 12,7 0,14 -12,7 -12,-7" fill="#d6ad4f" opacity=".85" className="pulse" />
        </svg>
      </div>
      <h1>{title}</h1>
      {children}
    </main>
  );
}

export function ConnBanner({ conn }: { conn: Conn }) {
  if (conn === 'online') return null;
  return (
    <div className="conn-banner" role="status">
      {conn === 'offline' ? 'Sin conexión. Reconectando…' : 'Conectando…'}
    </div>
  );
}

export function WakingScreen() {
  return (
    <Splash title="Despertando servidor…">
      <p className="muted">El servidor gratuito se duerme cuando nadie juega. Tarda hasta un minuto en despertar; no cierres esta página.</p>
    </Splash>
  );
}

export function Countdown({ deadline, skew }: { deadline: number | null; skew: number }) {
  const now = useNow(250);
  if (!deadline) return null;
  const left = deadline - (now + skew);
  return <span className={`clock${left < 10000 ? ' urgent' : ''}`}>{fmtClock(left)}</span>;
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="toast" role="status">
      {text}
    </div>
  );
}
