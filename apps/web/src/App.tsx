import { useEffect, useState } from 'react';
import { Splash } from './common';
import { store } from './net';
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

function Landing() {
  return (
    <main className="landing">
      <h1 className="logo">Hexania</h1>
      <p className="lede">El tablero en la tablet, tu mano en el móvil.</p>
      <div className="landing-actions">
        <a className="btn primary big" href="/board" onClick={(e) => (e.preventDefault(), go('/board'))}>
          Crear partida (tablet)
        </a>
        <a className="btn big" href="/play" onClick={(e) => (e.preventDefault(), go('/play'))}>
          Unirme con un código (móvil)
        </a>
      </div>
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
