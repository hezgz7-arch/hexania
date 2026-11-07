import { useEffect, useState } from 'react';
import { Splash } from './common';
import { store } from './net';
import { isMuted, setMuted } from './sound';
import { Phone } from './Phone';
import { Tablet } from './Tablet';

function useRoute(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

const go = (to: string) => {
  history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

/** Most recent room this browser has a seat or host token for, if any. */
function lastRoom(): string | null {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i) ?? '';
      const h = /^hexania:host:(.+)$/.exec(k);
      if (h) return `/board/${h[1]}`;
      const t = /^hexania:token:(.+)$/.exec(k);
      if (t) return `/play/${t[1]}`;
    }
  } catch {
    /* storage blocked */
  }
  return null;
}

function Landing() {
  const [muted, setM] = useState(isMuted());
  const last = lastRoom();
  const link = (to: string) => ({ href: to, onClick: (e: React.MouseEvent) => (e.preventDefault(), go(to)) });
  return (
    <main className="landing">
      <h1 className="logo">Hexania</h1>
      <p className="lede">El tablero en la tablet, tu mano en el móvil.</p>
      <nav className="menu" aria-label="Menú principal">
        <img src="/art/menu.png" alt="" draggable={false} />
        {last ? (
          <a className="menu-btn m1" {...link(last)}>
            Continuar
          </a>
        ) : (
          <span className="menu-btn m1 off" aria-disabled="true">
            Continuar
          </span>
        )}
        <a className="menu-btn m2" {...link('/board')}>
          Crear partida
        </a>
        <a className="menu-btn m3" {...link('/play')}>
          Unirme
        </a>
        <button className="menu-btn m4" onClick={() => (setMuted(!muted), setM(!muted))} aria-pressed={muted}>
          {muted ? 'Sonido: no' : 'Sonido: sí'}
        </button>
      </nav>
      <p className="menu-hint">Crear partida: en la tablet · Unirme: en cada móvil</p>
    </main>
  );
}

function NewRoom() {
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/rooms', { method: 'POST' });
        const { code, hostToken } = (await res.json()) as { code: string; hostToken: string };
        store.set(`hexania:host:${code}`, hostToken);
        if (live) history.replaceState(null, '', `/board/${code}`), window.dispatchEvent(new PopStateEvent('popstate'));
      } catch {
        if (live) setErr('No se pudo crear la partida. ¿Está el servidor encendido?');
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return err ? (
    <Splash title="Algo ha fallado">
      <p className="error">{err}</p>
      <button className="btn primary" onClick={() => location.reload()}>
        Reintentar
      </button>
    </Splash>
  ) : (
    <Splash title="Preparando la mesa…" />
  );
}

function JoinCode() {
  const [code, setCode] = useState('');
  return (
    <main className="landing">
      <h1 className="logo">Hexania</h1>
      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) go(`/play/${code.trim().toUpperCase()}`);
        }}
      >
        <label className="field">
          <span>Código de la sala</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} autoCapitalize="characters" autoComplete="off" inputMode="text" placeholder="ABCD" />
        </label>
        <button className="btn primary big" disabled={!code.trim()}>
          Entrar
        </button>
      </form>
    </main>
  );
}

// A ?host= token in the URL (printed by the demo CLI) is stored and stripped
// before any child hook reads it.
function adoptHostToken(): void {
  const m = /^\/board\/([^/]+)/.exec(location.pathname);
  const t = new URLSearchParams(location.search).get('host');
  if (m && t) {
    store.set(`hexania:host:${m[1].toUpperCase()}`, t);
    history.replaceState(null, '', location.pathname);
  }
}
adoptHostToken();

export function App() {
  const path = useRoute();
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'board') return parts[1] ? <Tablet key={parts[1]} room={parts[1].toUpperCase()} /> : <NewRoom />;
  if (parts[0] === 'play') return parts[1] ? <Phone key={parts[1]} room={parts[1].toUpperCase()} /> : <JoinCode />;
  return <Landing />;
}
