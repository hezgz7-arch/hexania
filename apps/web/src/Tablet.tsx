import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { RESOURCES, type GameEvent, type GameView, type NumberMode, type RoomInfo, type SeatInfo } from '@hexania/engine';
import { BoardSvg, type Burst } from './BoardSvg';
import { Countdown, ConnBanner, Splash, Toast, WakingScreen, useWakeLock } from './common';
import { DevIcon, Die, PieceIcon, ResIcon } from './Icons';
import { COLOR_ES, PLAYER_HEX, describeEvent, fmtCounts, nameOf } from './lib';
import { useRoom } from './net';
import { isMuted, play, setMuted, unlockAudio } from './sound';

function banner(view: GameView): string {
  const name = (id: string | null) => nameOf(view.players, id);
  switch (view.phase) {
    case 'setup': {
      const id = view.active;
      const buildings = Object.values(view.buildings).filter((b) => b.owner === id).length;
      const roads = Object.values(view.roads).filter((o) => o === id).length;
      return `Preparación · ${name(id)} coloca ${buildings > roads ? 'un camino' : 'un poblado'}`;
    }
    case 'roll':
      return `${name(view.active)} tira los dados`;
    case 'main':
      return `${name(view.active)} juega su turno`;
    case 'discard':
      return `Descartan: ${Object.keys(view.pendingDiscards).map(name).join(', ')}`;
    case 'robber':
      return `${name(view.active)} mueve al ladrón`;
    case 'roadBuilding':
      return `${name(view.active)} construye caminos gratis`;
    case 'special':
      return `Construcción especial · ${name(view.special?.[0] ?? null)}`;
    case 'finished':
      return `¡${name(view.winner)} gana!`;
  }
}

export function Tablet({ room }: { room: string }) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [rolling, setRolling] = useState(false);
  const burstId = useRef(0);
  const namesRef = useRef<{ id: string; name: string }[]>([]);

  const onEvents = useCallback((events: GameEvent[]) => {
    const flashes: string[] = [];
    const newBursts: Burst[] = [];
    for (const e of events) {
      switch (e.type) {
        case 'DICE_ROLLED':
          setRolling(true);
          setTimeout(() => setRolling(false), 750);
          play('dice');
          break;
        case 'RESOURCES_PRODUCED': {
          const sum = new Map<string, Burst>();
          for (const g of e.gains) {
            const k = `${g.hexId}:${g.resource}`;
            const b = sum.get(k);
            if (b) b.amount += g.amount;
            else sum.set(k, { id: ++burstId.current, hexId: g.hexId, resource: g.resource, amount: g.amount, color: '' });
          }
          newBursts.push(...sum.values());
          if (e.gains.length) setTimeout(() => play('card'), 800);
          break;
        }
        case 'SETUP_RESOURCES':
          for (const g of e.gains) newBursts.push({ id: ++burstId.current, hexId: g.hexId, resource: g.resource, amount: 1, color: '' });
          break;
        case 'ROAD_BUILT':
          flashes.push(`r${e.edgeId}`);
          play('build');
          break;
        case 'SETTLEMENT_BUILT':
          flashes.push(`b${e.vertexId}settlement`);
          play('build');
          break;
        case 'CITY_BUILT':
          flashes.push(`b${e.vertexId}city`);
          play('city');
          break;
        case 'ROBBER_MOVED':
          play('robber');
          break;
        case 'BANK_TRADE':
        case 'TRADE_COMPLETED':
          play('coin');
          break;
        case 'GAME_WON':
          play('win');
          break;
      }
    }
    if (newBursts.length) {
      setBursts((b) => [...b, ...newBursts]);
      setTimeout(() => setBursts((b) => b.filter((x) => !newBursts.includes(x))), 2200);
    }
    if (flashes.length) {
      setFresh((f) => new Set([...f, ...flashes]));
      setTimeout(() => setFresh((f) => new Set([...f].filter((x) => !flashes.includes(x)))), 1200);
    }
  }, []);

  const net = useRoom({ room, role: 'board', onEvents });
  const { state } = net;
  useWakeLock(true);
  if (state?.view) namesRef.current = state.view.players;

  if (net.conn === 'waking') return <WakingScreen />;
  if (net.joinError) {
    return (
      <Splash title="No encuentro esa sala">
        <p className="muted">{net.joinError.message}</p>
        <a className="btn" href="/board">
          Crear una partida nueva
        </a>
      </Splash>
    );
  }
  if (!state) return <Splash title="Conectando…" />;

  const { view, room: info, you } = state;
  return (
    <div className="tablet" onPointerDown={unlockAudio}>
      <ConnBanner conn={net.conn} />
      <Toast text={net.notice} />
      {!view ? (
        <Lobby info={info} isHost={you.isHost} host={net.host} />
      ) : view.phase === 'finished' ? (
        <Finale view={view} info={info} isHost={you.isHost} host={net.host} />
      ) : (
        <Game view={view} info={info} isHost={you.isHost} host={net.host} log={net.log} skew={net.skew} bursts={bursts} fresh={fresh} rolling={rolling} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- lobby

function SeatCard({ seat, canEdit, host }: { seat: SeatInfo; canEdit: boolean; host: (c: import('@hexania/engine').HostCommand) => Promise<unknown> }) {
  return (
    <li className="seat-card" style={{ ['--pc' as string]: PLAYER_HEX[seat.color] }}>
      <span className="seat-dot" aria-hidden />
      <span className="seat-name">{seat.name}</span>
      <span className="seat-state">
        {seat.bot ? 'Bot' : seat.vacant ? 'Esperando…' : seat.connected ? 'Conectado' : 'Desconectado'}
      </span>
      {canEdit && (
        <button className="btn ghost small" onClick={() => void host(seat.bot ? { cmd: 'removeBot', playerId: seat.playerId } : { cmd: 'kick', playerId: seat.playerId })}>
          {seat.bot ? 'Quitar' : 'Expulsar'}
        </button>
      )}
    </li>
  );
}

function Lobby({ info, isHost, host }: { info: RoomInfo; isHost: boolean; host: (c: import('@hexania/engine').HostCommand) => Promise<{ ok: boolean; message?: string }> }) {
  const [qr, setQr] = useState('');
  const [err, setErr] = useState('');
  const url = `${info.publicUrl}/play/${info.code}`;
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0b1c22', light: '#f6ecd2' } }).then(setQr, () => setQr(''));
  }, [url]);
  const filled = info.seats.every((s) => !s.vacant);
  const canStart = isHost && filled && info.seats.length >= info.minPlayers;
  const run = async (c: import('@hexania/engine').HostCommand) => {
    const r = await host(c);
    setErr(r.ok ? '' : (r.message ?? 'No se pudo'));
  };
  return (
    <main className="lobby">
      <section className="lobby-join">
        <h1 className="logo">Hexania</h1>
        <p className="lede">Escanea con el móvil para sentarte a la mesa</p>
        <div className="qr-frame">{qr ? <img src={qr} alt={`Código QR para unirse a la sala ${info.code}`} width={260} height={260} /> : <div className="qr-wait" />}</div>
        <div className="code" aria-label={`Código de sala ${info.code.split('').join(' ')}`}>
          {info.code}
        </div>
        <p className="url">{url.replace(/^https?:\/\//, '')}</p>
      </section>
      <section className="lobby-seats">
        <h2>
          Jugadores <span className="count">{info.seats.length}/{info.maxPlayers}</span>
        </h2>
        {info.seats.length === 0 && <p className="muted">Todavía no se ha sentado nadie.</p>}
        <ul className="seat-list">
          {info.seats.map((s) => (
            <SeatCard key={s.playerId} seat={s} canEdit={isHost} host={host} />
          ))}
        </ul>
        {isHost && (
          <div className="lobby-controls">
            <button className="btn ghost" disabled={info.seats.length >= info.maxPlayers} onClick={() => void run({ cmd: 'addBot' })}>
              Añadir bot
            </button>
            <label className="field inline">
              <span>Fichas de número</span>
              <select value={info.numberMode} onChange={(e) => void run({ cmd: 'setNumberMode', mode: e.target.value as NumberMode })}>
                <option value="spiral">Espiral clásica</option>
                <option value="balanced">Equilibradas al azar</option>
              </select>
            </label>
            <label className="field inline">
              <span>Tiempo por turno</span>
              <select value={info.timerSeconds} onChange={(e) => void run({ cmd: 'setTimer', seconds: Number(e.target.value) })}>
                <option value={0}>Sin límite</option>
                <option value={60}>1 minuto</option>
                <option value={90}>90 segundos</option>
                <option value={120}>2 minutos</option>
                <option value={180}>3 minutos</option>
              </select>
            </label>
            <button className="btn primary big" disabled={!canStart} onClick={() => void run({ cmd: 'start' })}>
              Empezar partida
            </button>
            {!canStart && <p className="muted small">{info.seats.length < info.minPlayers ? `Hacen falta ${info.minPlayers} jugadores como mínimo (puedes usar bots).` : 'Falta alguien por sentarse.'}</p>}
            {err && <p className="error" role="alert">{err}</p>}
          </div>
        )}
        {!isHost && <p className="muted">Esta pantalla solo mira: el control está en el tablero que creó la sala.</p>}
      </section>
    </main>
  );
}

// ----------------------------------------------------------------- game

function Game({
  view,
  info,
  isHost,
  host,
  log,
  skew,
  bursts,
  fresh,
  rolling,
}: {
  view: GameView;
  info: RoomInfo;
  isHost: boolean;
  host: (c: import('@hexania/engine').HostCommand) => Promise<unknown>;
  log: { id: number; event: GameEvent }[];
  skew: number;
  bursts: Burst[];
  fresh: Set<string>;
  rolling: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [muted, setM] = useState(isMuted());
  const lines = useMemo(
    () =>
      log
        .map((l) => ({ id: l.id, text: describeEvent(l.event, view.players) }))
        .filter((l): l is { id: number; text: string } => !!l.text)
        .slice(-14)
        .reverse(),
    [log, view.players],
  );
  const seatOf = (id: string) => info.seats.find((s) => s.playerId === id);
  const activeColor = view.active ? PLAYER_HEX[view.players.find((p) => p.id === view.active)?.color ?? 'red'] : '#888';

  return (
    <div className="game">
      <header className="topbar" style={{ ['--pc' as string]: activeColor }}>
        <div className="banner">
          <span className="banner-dot" aria-hidden />
          <span className="banner-text">{info.paused ? 'Partida en pausa' : banner(view)}</span>
          {!info.paused && <Countdown deadline={info.deadline} skew={skew} />}
        </div>
        <div className="top-actions">
          <span className="turn-no">Turno {view.turn}</span>
          <button className="btn ghost small" onClick={() => (setMuted(!muted), setM(!muted))} aria-pressed={muted}>
            <img className={`ico${muted ? ' off' : ''}`} src="/art/ico-sound.png" alt="" /> {muted ? 'Sonido apagado' : 'Sonido'}
          </button>
          {isHost && (
            <button className="btn ghost small" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
              <img className="ico" src="/art/ico-gear.png" alt="" /> Anfitrión
            </button>
          )}
        </div>
      </header>

      <aside className="players" aria-label="Jugadores">
        {view.players.map((p) => {
          const seat = seatOf(p.id);
          const turn = view.active === p.id;
          return (
            <div key={p.id} className={`pcard${turn ? ' active' : ''}${seat && !seat.bot && !seat.connected ? ' away' : ''}`} style={{ ['--pc' as string]: PLAYER_HEX[p.color] }}>
              <div className="pcard-head">
                <span className="seat-dot" aria-hidden />
                <span className="pname">{p.name}</span>
                {seat?.bot && <span className="tag">bot</span>}
                {seat && !seat.bot && !seat.connected && <span className="tag warn">sin conexión</span>}
                <span className="vp" title="Puntos de victoria visibles">
                  {p.publicVP}
                  <small>PV</small>
                </span>
              </div>
              <div className="pcard-stats">
                <span title="Cartas de recurso en mano">
                  <ResIcon r="grain" size={0} />
                  {p.handCount} cartas
                </span>
                <span title="Cartas de desarrollo">
                  <DevIcon size={16} /> {p.devCount}
                </span>
                <span title="Caballeros jugados">⚔ {p.knightsPlayed}</span>
                <span title="Camino más largo">Camino {p.longestRoad}</span>
              </div>
              <div className="pcard-badges">
                {p.hasLongestRoad && <span className="badge">Camino más largo</span>}
                {p.hasLargestArmy && <span className="badge">Ejército mayor</span>}
                <span className="pieces" title="Piezas que le quedan">
                  <PieceIcon kind="road" color={PLAYER_HEX[p.color]} size={14} />
                  {p.roadsLeft}
                  <PieceIcon kind="settlement" color={PLAYER_HEX[p.color]} size={14} />
                  {p.settlementsLeft}
                  <PieceIcon kind="city" color={PLAYER_HEX[p.color]} size={14} />
                  {p.citiesLeft}
                </span>
              </div>
            </div>
          );
        })}
      </aside>

      <section className="stage">
        <BoardSvg view={view} bursts={bursts} fresh={fresh} />
        {info.paused && <div className="pause-veil">Pausa</div>}
      </section>

      <aside className="side">
        <div className="dice-box" aria-live="polite">
          {view.lastRoll ? (
            <>
              <Die n={view.lastRoll[0]} rolling={rolling} />
              <Die n={view.lastRoll[1]} rolling={rolling} />
              <span className="dice-total">{rolling ? '…' : view.lastRoll[0] + view.lastRoll[1]}</span>
            </>
          ) : (
            <span className="muted">Aún sin tiradas</span>
          )}
        </div>

        <div className="awards" aria-label="Premios">
          {([['army', 'Mayor ejército'], ['road', 'Ruta comercial más larga']] as const).map(([k, label]) => {
            const holder = view.players.find((p) => (k === 'army' ? p.hasLargestArmy : p.hasLongestRoad));
            return (
              <figure key={k} className={`award${holder ? ' held' : ''}`} title={label}>
                <img src={`/art/card-${k}.png`} alt={label} draggable={false} />
                <figcaption style={holder ? { background: PLAYER_HEX[holder.color] } : undefined}>{holder ? holder.name : 'Libre'}</figcaption>
              </figure>
            );
          })}
        </div>

        <div className="bank" aria-label="Banco">
          <h3>Banco</h3>
          <div className="bank-row">
            {RESOURCES.map((r) => (
              <span key={r} className="bank-cell">
                <ResIcon r={r} size={26} />
                <b>{view.bankCounts[r]}</b>
              </span>
            ))}
            <span className="bank-cell" title="Cartas de desarrollo en el mazo">
              <DevIcon size={26} />
              <b>{view.deckCount}</b>
            </span>
          </div>
        </div>

        {view.trades.length > 0 && (
          <div className="trades">
            <h3>Tratos abiertos</h3>
            {view.trades.map((t) => (
              <p key={t.id} className="trade-line">
                <b style={{ color: PLAYER_HEX[view.players.find((p) => p.id === t.from)?.color ?? 'red'] }}>{nameOf(view.players, t.from)}</b> da {fmtCounts(t.give)} · pide {fmtCounts(t.want)}
              </p>
            ))}
          </div>
        )}

        <div className="log" aria-label="Registro de la partida">
          <h3>Qué ha pasado</h3>
          <ol>
            {lines.map((l) => (
              <li key={l.id}>{l.text}</li>
            ))}
          </ol>
        </div>
      </aside>

      {menu && isHost && <HostMenu view={view} info={info} host={host} close={() => setMenu(false)} />}
    </div>
  );
}

function HostMenu({ view, info, host, close }: { view: GameView; info: RoomInfo; host: (c: import('@hexania/engine').HostCommand) => Promise<unknown>; close: () => void }) {
  return (
    <div className="host-menu" role="dialog" aria-label="Controles del anfitrión">
      <div className="host-menu-head">
        <h3>Anfitrión</h3>
        <button className="btn ghost small" onClick={close}>
          Cerrar
        </button>
      </div>
      <div className="host-row">
        <button className="btn" onClick={() => void host({ cmd: info.paused ? 'resume' : 'pause' })}>
          <img className="ico" src="/art/btn-pause.png" alt="" /> {info.paused ? 'Reanudar' : 'Pausar'}
        </button>
        <button className="btn" disabled={!info.canUndo} onClick={() => void host({ cmd: 'undo' })}>
          Deshacer última construcción
        </button>
      </div>
      <label className="field">
        <span>Tiempo por turno</span>
        <select value={info.timerSeconds} onChange={(e) => void host({ cmd: 'setTimer', seconds: Number(e.target.value) })}>
          <option value={0}>Sin límite</option>
          <option value={60}>1 minuto</option>
          <option value={90}>90 segundos</option>
          <option value={120}>2 minutos</option>
          <option value={180}>3 minutos</option>
        </select>
      </label>
      <h4>Expulsar a un jugador</h4>
      <p className="muted small">Su asiento queda libre para que otra persona lo ocupe con su móvil.</p>
      <ul className="kick-list">
        {view.players.map((p) => (
          <li key={p.id}>
            <span style={{ color: PLAYER_HEX[p.color] }}>{p.name}</span>
            <button className="btn ghost small" onClick={() => void host({ cmd: 'kick', playerId: p.id })}>
              Expulsar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- finale

function Finale({ view, info, isHost, host }: { view: GameView; info: RoomInfo; isHost: boolean; host: (c: import('@hexania/engine').HostCommand) => Promise<unknown> }) {
  const scores = [...(view.finalScores ?? [])].sort((a, b) => b.total - a.total);
  const stats = view.stats;
  const maxDice = Math.max(1, ...(stats?.dice ?? [1]));
  const winner = view.players.find((p) => p.id === view.winner);
  const top = (m: Record<string, number> | undefined): string => {
    const e = Object.entries(m ?? {}).sort((a, b) => b[1] - a[1])[0];
    return e && e[1] > 0 ? `${nameOf(view.players, e[0])} (${e[1]})` : '—';
  };
  return (
    <main className="finale" style={{ ['--pc' as string]: PLAYER_HEX[winner?.color ?? 'red'] }}>
      <section className="finale-hero">
        <p className="lede">Fin de la partida</p>
        <img className="trophy" src="/art/ico-trophy.png" alt="" />
        <h1 className="winner">{winner?.name ?? '—'}</h1>
        <p className="muted">
          gana con {scores.find((s) => s.playerId === view.winner)?.total ?? 10} puntos en {view.turn} turnos
        </p>
        <ol className="podium">
          {scores.map((s, i) => {
            const p = view.players.find((x) => x.id === s.playerId)!;
            return (
              <li key={s.playerId} style={{ ['--pc' as string]: PLAYER_HEX[p.color] }} className={i === 0 ? 'first' : ''}>
                <span className="rank">{i + 1}</span>
                <span className="pname">{p.name}</span>
                <span className="muted small">
                  {COLOR_ES[p.color]} · {s.public} visibles{s.hidden ? ` + ${s.hidden} ocultos` : ''}
                </span>
                <b className="vp">{s.total}</b>
              </li>
            );
          })}
        </ol>
        {isHost && (
          <button className="btn primary big" onClick={() => void host({ cmd: 'rematch' })}>
            Jugar la revancha
          </button>
        )}
      </section>
      <section className="finale-stats">
        <h2>
          <img className="ico" src="/art/ico-bars.png" alt="" /> Estadísticas
        </h2>
        <h3>Resultado de los dados</h3>
        <div className="histogram" role="img" aria-label="Histograma de tiradas de dados">
          {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
            <div key={n} className="bar-col">
              <div className={`bar${n === 6 || n === 8 ? ' hot' : ''}`} style={{ height: `${((stats?.dice[n] ?? 0) / maxDice) * 100}%` }} />
              <span className="bar-n">{stats?.dice[n] ?? 0}</span>
              <span className="bar-l">{n}</span>
            </div>
          ))}
        </div>
        <dl className="facts">
          <dt>Más recursos cobrados</dt>
          <dd>{top(stats?.produced)}</dd>
          <dt>Más cartas robadas</dt>
          <dd>{top(stats?.stolenFrom)}</dd>
          <dt>Más víctima del ladrón</dt>
          <dd>{top(stats?.lostToThief)}</dd>
          <dt>Mano más grande</dt>
          <dd>{stats?.maxHand.playerId ? `${nameOf(view.players, stats.maxHand.playerId)} (${stats.maxHand.size} cartas)` : '—'}</dd>
          <dt>Camino más largo</dt>
          <dd>{(() => {
            const p = [...view.players].sort((a, b) => b.longestRoad - a.longestRoad)[0];
            return p ? `${p.name} (${p.longestRoad})` : '—';
          })()}</dd>
          <dt>Caballeros jugados</dt>
          <dd>{(() => {
            const p = [...view.players].sort((a, b) => b.knightsPlayed - a.knightsPlayed)[0];
            return p && p.knightsPlayed ? `${p.name} (${p.knightsPlayed})` : '—';
          })()}</dd>
        </dl>
        {!isHost && <p className="muted small">Sala {info.code}</p>}
      </section>
    </main>
  );
}
