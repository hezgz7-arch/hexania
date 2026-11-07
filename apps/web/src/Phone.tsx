import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  COSTS,
  PLAYER_COLORS,
  RESOURCES,
  defaultDiscard,
  type BuildKind,
  type ClientAction,
  type DevCardType,
  type GameEvent,
  type GameView,
  type PlayerColor,
  type Resource,
  type ResourceCounts,
  type TradeOffer,
} from '@hexania/engine';
import { BoardSvg, type Picked, type Targets } from './BoardSvg';
import { ConnBanner, Countdown, Splash, Toast, WakingScreen, useWakeLock } from './common';
import { DevIcon, PieceIcon, ResIcon } from './Icons';
import { COLOR_ES, DEV_ES, DEV_HINT, PLAYER_HEX, RES_ES, fmtCounts, handTotal, nameOf } from './lib';
import { useRoom } from './net';
import { play, unlockAudio, vibrate } from './sound';

type Mode =
  | { t: 'build'; kind: 'road' | 'settlement' | 'city' }
  | { t: 'menu' }
  | { t: 'trade'; counterOf?: number }
  | { t: 'cards' }
  | { t: 'yop' }
  | { t: 'mono' }
  | null;

export function Phone({ room }: { room: string }) {
  const myId = useRef<string | null>(null);
  const onEvents = useCallback((events: GameEvent[]) => {
    for (const e of events) {
      if (e.type === 'TURN_STARTED' && e.playerId === myId.current) {
        vibrate([180, 80, 180]);
        play('turn');
      } else if (e.type === 'DISCARD_REQUIRED' && myId.current && e.pending[myId.current]) vibrate([300]);
      else if (e.type === 'TRADE_OFFERED' && e.offer.from !== myId.current) vibrate(80);
      else if (e.type === 'DICE_ROLLED') play('dice');
      else if (e.type === 'GAME_WON') {
        play('win');
        vibrate([100, 60, 100, 60, 300]);
      }
    }
  }, []);
  const net = useRoom({ room, role: 'player', onEvents });
  useWakeLock(true);
  const st = net.state;
  myId.current = st?.you.playerId ?? null;

  if (net.conn === 'waking') return <WakingScreen />;
  if (net.replaced)
    return (
      <Splash title="Sesión abierta en otro dispositivo">
        <p className="muted">Este asiento se ha abierto en otro móvil. Recarga esta página para volver a entrar.</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Recuperar el asiento
        </button>
      </Splash>
    );
  if (net.kicked)
    return (
      <Splash title="Te han sacado de la partida">
        <p className="muted">El anfitrión ha liberado tu asiento. Si quieres volver, pídele que te deje sitio.</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Volver a entrar
        </button>
      </Splash>
    );

  const seated = !!st?.you.playerId;
  return (
    <div className="phone" onPointerDown={unlockAudio}>
      <ConnBanner conn={net.conn} />
      <Toast text={net.notice} />
      {!seated || !st ? (
        <JoinForm room={room} net={net} />
      ) : !st.view ? (
        <Waiting net={net} />
      ) : (
        <GamePhone view={st.view} info={st.room} act={net.act} skew={net.skew} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ join

function JoinForm({ room, net }: { room: string; net: ReturnType<typeof useRoom> }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('hexania:name') ?? '';
    } catch {
      return '';
    }
  });
  const [color, setColor] = useState<PlayerColor | undefined>();
  const [busy, setBusy] = useState(false);
  const err = net.joinError;
  const submit = async (seat?: string) => {
    setBusy(true);
    try {
      localStorage.setItem('hexania:name', name);
    } catch {
      /* ignore */
    }
    await net.join({ name: name.trim() || undefined, color, seat });
    setBusy(false);
  };
  const pending = net.conn !== 'online';
  return (
    <main className="join">
      <h1 className="logo">Hexania</h1>
      <p className="lede">
        Sala <b className="code-inline">{room.toUpperCase()}</b>
      </p>
      <label className="field">
        <span>¿Cómo te llamas?</span>
        <input value={name} maxLength={16} autoComplete="nickname" placeholder="Tu nombre" onChange={(e) => setName(e.target.value)} />
      </label>
      <fieldset className="colors">
        <legend>Tu color (si está libre)</legend>
        <div className="color-row">
          {PLAYER_COLORS.map((c) => (
            <button key={c} type="button" className={`swatch${color === c ? ' on' : ''}`} style={{ background: PLAYER_HEX[c] }} aria-label={COLOR_ES[c]} aria-pressed={color === c} onClick={() => setColor(c)} />
          ))}
        </div>
      </fieldset>
      {err && err.code === 'CHOOSE_SEAT' ? (
        <div className="seat-choice">
          <p>Elige el asiento que quieres ocupar:</p>
          {err.vacant?.map((s) => (
            <button key={s.playerId} className="btn" style={{ ['--pc' as string]: PLAYER_HEX[s.color] }} onClick={() => void submit(s.playerId)}>
              <span className="seat-dot" /> {s.name}
            </button>
          ))}
        </div>
      ) : (
        <button className="btn primary big" disabled={busy || pending} onClick={() => void submit()}>
          {pending ? 'Conectando…' : 'Sentarme a la mesa'}
        </button>
      )}
      {err && err.code !== 'CHOOSE_SEAT' && (
        <p className="error" role="alert">
          {err.message}
        </p>
      )}
    </main>
  );
}

function Waiting({ net }: { net: ReturnType<typeof useRoom> }) {
  const st = net.state!;
  const me = st.room.seats.find((s) => s.playerId === st.you.playerId);
  return (
    <main className="join">
      <h1 className="logo">Hexania</h1>
      <p className="lede">Estás dentro</p>
      <div className="me-chip" style={{ ['--pc' as string]: PLAYER_HEX[me?.color ?? 'red'] }}>
        <span className="seat-dot" /> {me?.name}
      </div>
      <p className="muted">Espera a que el anfitrión empiece la partida desde el tablero.</p>
      <ul className="seat-list">
        {st.room.seats.map((s) => (
          <li key={s.playerId} className="seat-card" style={{ ['--pc' as string]: PLAYER_HEX[s.color] }}>
            <span className="seat-dot" />
            <span className="seat-name">{s.name}</span>
            <span className="seat-state">{s.bot ? 'Bot' : s.vacant ? 'Libre' : s.connected ? 'Conectado' : 'Desconectado'}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

// ------------------------------------------------------------------ sheet

function Sheet({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet">
        <div className="sheet-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="btn ghost small" onClick={onClose}>
              Cerrar
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function Stepper({ r, value, max, onChange }: { r: Resource; value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <ResIcon r={r} size={32} />
      <span className="step-name">{RES_ES[r]}</span>
      <button type="button" className="step-btn" aria-label={`Menos ${RES_ES[r]}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <b className="step-val">{value}</b>
      <button type="button" className="step-btn" aria-label={`Más ${RES_ES[r]}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

const sum = (c: Partial<ResourceCounts>): number => RESOURCES.reduce((n, r) => n + (c[r] ?? 0), 0);
const clean = (c: Partial<ResourceCounts>): Partial<ResourceCounts> => Object.fromEntries(RESOURCES.filter((r) => (c[r] ?? 0) > 0).map((r) => [r, c[r]!]));

function CostRow({ kind }: { kind: BuildKind }) {
  const cost = COSTS[kind] as Partial<ResourceCounts>;
  return (
    <span className="cost">
      {RESOURCES.filter((r) => cost[r]).map((r) => (
        <span key={r} className="cost-item">
          <ResIcon r={r} size={20} />
          {cost[r]! > 1 ? `×${cost[r]}` : ''}
        </span>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------- game

function GamePhone({ view, info, act, skew }: { view: GameView; info: import('@hexania/engine').RoomInfo; act: (a: ClientAction) => Promise<{ ok: boolean; message?: string }>; skew: number }) {
  const me = view.me!;
  const L = me.legal;
  const mine = view.players.find((p) => p.id === me.id)!;
  const color = PLAYER_HEX[mine.color];
  const [mode, setMode] = useState<Mode>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isMyTurn = view.active === me.id;

  const send = useCallback(
    async (a: ClientAction): Promise<boolean> => {
      setBusy(true);
      const r = await act(a);
      setBusy(false);
      if (!r.ok) {
        setErr(r.message ?? 'Acción no válida');
        play('error');
        vibrate(120);
        setTimeout(() => setErr(null), 3500);
      }
      return r.ok;
    },
    [act],
  );

  // shake to roll
  useEffect(() => {
    if (!L.rollDice) return;
    let last = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      if (mag > 28 && Date.now() - last > 1500) {
        last = Date.now();
        void send({ type: 'ROLL_DICE' });
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [L.rollDice, send]);

  // close any picker that stopped being valid (turn changed, etc.)
  useEffect(() => {
    if (!isMyTurn && view.phase !== 'special' && mode && (mode.t === 'build' || mode.t === 'menu' || mode.t === 'yop' || mode.t === 'mono')) setMode(null);
  }, [isMyTurn, view.phase, mode]);

  const placing: 'settlement' | 'road' | 'city' | null =
    L.setup ?? (view.phase === 'roadBuilding' && L.roads.length ? 'road' : null) ?? (mode?.t === 'build' ? mode.kind : null);
  const buildKind = L.setup ?? (view.phase === 'roadBuilding' && L.roads.length ? 'road' : mode?.t === 'build' ? mode.kind : null);

  const status = (() => {
    if (view.phase === 'finished') return view.winner === me.id ? '¡Has ganado!' : `Gana ${nameOf(view.players, view.winner)}`;
    if (L.discard !== null) return `Descarta ${L.discard} cartas`;
    if (L.setup) return L.setup === 'settlement' ? 'Coloca un poblado' : 'Coloca un camino';
    if (L.robber.length) return 'Mueve el ladrón';
    if (L.rollDice) return 'Tu turno: tira los dados';
    if (view.phase === 'roadBuilding' && isMyTurn) return 'Coloca caminos gratis';
    if (view.phase === 'special' && L.passSpecial) return 'Construcción especial: tu turno';
    if (isMyTurn) return 'Tu turno';
    if (view.phase === 'discard') return 'Otros descartan…';
    return `Turno de ${nameOf(view.players, view.active)}`;
  })();

  return (
    <div className="gp" style={{ ['--pc' as string]: color }}>
      <header className="gp-top">
        <span className="seat-dot" aria-hidden />
        <div className="gp-who">
          <b>{mine.name}</b>
          <span className={`gp-status${isMyTurn || L.discard !== null ? ' mine' : ''}`}>{info.paused ? 'Partida en pausa' : status}</span>
        </div>
        {!info.paused && <Countdown deadline={info.deadline} skew={skew} />}
        <span className="vp" title="Tus puntos, con cartas ocultas">
          {me.totalVP}
          <small>PV</small>
        </span>
      </header>

      <div className="gp-body">
        {view.lastRoll && (
          <p className="last-roll">
            Última tirada: <b>{view.lastRoll[0] + view.lastRoll[1]}</b> ({view.lastRoll[0]} + {view.lastRoll[1]})
          </p>
        )}

        <section className="hand" aria-label="Tu mano">
          {RESOURCES.map((r) => (
            <div key={r} className={`hand-card${me.hand[r] === 0 ? ' empty' : ''}`}>
              <ResIcon r={r} size={46} />
              <b className="hand-n">{me.hand[r]}</b>
              <span className="hand-name">{RES_ES[r]}</span>
            </div>
          ))}
        </section>
        <p className="hand-total muted">{handTotal(me.hand)} cartas · {mine.roadsLeft} caminos, {mine.settlementsLeft} poblados, {mine.citiesLeft} ciudades por colocar</p>

        {sumDev(me.dev) + sumDev(me.devNew) > 0 && (
          <button className="dev-strip" onClick={() => setMode({ t: 'cards' })}>
            <DevIcon size={24} />
            <span>
              {(Object.keys(me.dev) as DevCardType[])
                .filter((k) => me.dev[k] + me.devNew[k] > 0)
                .map((k) => `${DEV_ES[k]} ×${me.dev[k] + me.devNew[k]}`)
                .join(' · ')}
            </span>
          </button>
        )}

        <Offers view={view} L={L} send={send} counter={(id) => setMode({ t: 'trade', counterOf: id })} />

        <section className="others" aria-label="Rivales">
          {view.players
            .filter((p) => p.id !== me.id)
            .map((p) => (
              <div key={p.id} className={`other${view.active === p.id ? ' active' : ''}`} style={{ ['--pc' as string]: PLAYER_HEX[p.color] }}>
                <span className="seat-dot" />
                <span className="pname">{p.name}</span>
                <span className="muted small">{p.handCount} cartas</span>
                {p.hasLongestRoad && <span className="badge">Camino</span>}
                {p.hasLargestArmy && <span className="badge">Ejército</span>}
                <b className="vp-sm">{p.publicVP}</b>
              </div>
            ))}
        </section>
      </div>

      {err && (
        <p className="gp-error" role="alert">
          {err}
        </p>
      )}

      <ActionBar view={view} L={L} busy={busy} send={send} setMode={setMode} />

      {/* ------------- overlays, in priority order ------------- */}
      {L.discard !== null && <DiscardSheet need={L.discard} hand={me.hand} send={send} />}

      {L.discard === null && L.robber.length > 0 && <RobberPicker view={view} send={send} />}

      {L.discard === null && !L.robber.length && buildKind && (mode?.t === 'build' || L.setup || view.phase === 'roadBuilding') && (
        <PlacePicker
          key={buildKind}
          view={view}
          kind={buildKind}
          targets={buildKind === 'road' ? { edges: L.roads } : buildKind === 'settlement' ? { vertices: L.settlements } : { vertices: L.cities }}
          color={color}
          mandatory={!!L.setup || view.phase === 'roadBuilding'}
          onCancel={() => setMode(null)}
          onConfirm={async (p) => {
            const ok = await send(
              buildKind === 'road' ? { type: 'BUILD_ROAD', edgeId: p.id } : buildKind === 'settlement' ? { type: 'BUILD_SETTLEMENT', vertexId: p.id } : { type: 'BUILD_CITY', vertexId: p.id },
            );
            if (ok) {
              play(buildKind === 'city' ? 'city' : 'build');
              setMode(null);
            }
          }}
        />
      )}

      {mode?.t === 'menu' && (
        <Sheet title="Construir" onClose={() => setMode(null)}>
          {(
            [
              ['road', 'Camino', L.roads.length > 0],
              ['settlement', 'Poblado', L.settlements.length > 0],
              ['city', 'Ciudad', L.cities.length > 0],
            ] as const
          ).map(([kind, label, ok]) => (
            <div key={kind} className="build-row">
              <PieceIcon kind={kind} color={color} size={30} />
              <div className="build-info">
                <b>{label}</b>
                <CostRow kind={kind} />
                {!ok && L.blocked[kind] && <span className="why">{L.blocked[kind]}</span>}
              </div>
              <button className="btn primary" disabled={!ok} onClick={() => setMode({ t: 'build', kind })}>
                Elegir sitio
              </button>
            </div>
          ))}
          <div className="build-row">
            <DevIcon size={30} />
            <div className="build-info">
              <b>Carta de desarrollo</b>
              <CostRow kind="devCard" />
              {!L.buyDevCard && L.blocked.devCard && <span className="why">{L.blocked.devCard}</span>}
            </div>
            <button
              className="btn primary"
              disabled={!L.buyDevCard || busy}
              onClick={async () => {
                if (await send({ type: 'BUY_DEV_CARD' })) {
                  play('card');
                  setMode(null);
                }
              }}
            >
              Comprar
            </button>
          </div>
        </Sheet>
      )}

      {mode?.t === 'cards' && <CardsSheet view={view} L={L} send={send} close={() => setMode(null)} pick={setMode} />}
      {mode?.t === 'yop' && <YearSheet send={send} close={() => setMode(null)} bank={view.bankCounts} />}
      {mode?.t === 'mono' && <MonoSheet send={send} close={() => setMode(null)} />}
      {mode?.t === 'trade' && <TradeSheet view={view} L={L} send={send} close={() => setMode(null)} counterOf={mode.counterOf} />}

      {view.phase === 'finished' && <FinishedCard view={view} />}
    </div>
  );
}

const sumDev = (d: Record<DevCardType, number>): number => Object.values(d).reduce((a, b) => a + b, 0);

// -------------------------------------------------------------- action bar

function ActionBar({
  view,
  L,
  busy,
  send,
  setMode,
}: {
  view: GameView;
  L: NonNullable<GameView['me']>['legal'];
  busy: boolean;
  send: (a: ClientAction) => Promise<boolean>;
  setMode: (m: Mode) => void;
}) {
  if (view.phase === 'finished') return null;
  if (L.rollDice)
    return (
      <nav className="bar">
        <button className="btn primary huge" disabled={busy} onClick={() => void send({ type: 'ROLL_DICE' })}>
          Tirar dados
        </button>
        {L.playKnight && (
          <button className="btn" onClick={() => setMode({ t: 'cards' })}>
            Jugar carta
          </button>
        )}
      </nav>
    );
  if (L.passSpecial)
    return (
      <nav className="bar">
        <button className="btn" onClick={() => setMode({ t: 'menu' })}>
          Construir
        </button>
        <button className="btn primary" disabled={busy} onClick={() => void send({ type: 'PASS_SPECIAL' })}>
          Pasar
        </button>
      </nav>
    );
  if (L.endTurn)
    return (
      <nav className="bar">
        <button className="btn" onClick={() => setMode({ t: 'menu' })}>
          Construir
        </button>
        <button className="btn" onClick={() => setMode({ t: 'trade' })}>
          Comerciar
        </button>
        <button className="btn" onClick={() => setMode({ t: 'cards' })}>
          Cartas
        </button>
        <button className="btn primary" disabled={busy} onClick={() => void send({ type: 'END_TURN' })}>
          Fin de turno
        </button>
      </nav>
    );
  if (view.phase === 'main' && (L.canPropose || L.respondable.length || L.cancellable.length))
    return (
      <nav className="bar">
        <button className="btn" onClick={() => setMode({ t: 'trade' })}>
          Proponer trato
        </button>
      </nav>
    );
  return null;
}

// ----------------------------------------------------------------- offers

function Offers({
  view,
  L,
  send,
  counter,
}: {
  view: GameView;
  L: NonNullable<GameView['me']>['legal'];
  send: (a: ClientAction) => Promise<boolean>;
  counter: (offerId: number) => void;
}) {
  const me = view.me!.id;
  const incoming = view.trades.filter((t) => L.respondable.includes(t.id) || (t.to === me && t.from !== me));
  const mineOpen = view.trades.filter((t) => t.from === me);
  if (!incoming.length && !mineOpen.length) return null;
  const hand = view.me!.hand;
  const canPay = (want: Partial<ResourceCounts>) => RESOURCES.every((r) => hand[r] >= (want[r] ?? 0));
  const who = (id: string) => nameOf(view.players, id);
  return (
    <section className="offers" aria-label="Tratos">
      {incoming.map((t: TradeOffer) => (
        <div key={t.id} className="offer-card" style={{ ['--pc' as string]: PLAYER_HEX[view.players.find((p) => p.id === t.from)?.color ?? 'red'] }}>
          {t.to === null ? (
            <>
              <p>
                <b>{who(t.from)}</b> te ofrece <b>{fmtCounts(t.give)}</b> a cambio de <b>{fmtCounts(t.want)}</b>
              </p>
              {t.responses[me] ? (
                <p className="muted small">Has respondido: {t.responses[me] === 'accept' ? 'aceptar' : t.responses[me] === 'reject' ? 'rechazar' : 'contraoferta'}</p>
              ) : (
                <div className="row">
                  <button className="btn primary" disabled={!canPay(t.want)} onClick={() => void send({ type: 'RESPOND_TRADE', offerId: t.id, response: 'accept' })}>
                    Aceptar
                  </button>
                  <button className="btn" onClick={() => void send({ type: 'RESPOND_TRADE', offerId: t.id, response: 'reject' })}>
                    Rechazar
                  </button>
                  <button className="btn ghost" onClick={() => counter(t.id)}>
                    Contraoferta
                  </button>
                </div>
              )}
              {!canPay(t.want) && !t.responses[me] && <p className="why">No tienes lo que piden.</p>}
            </>
          ) : (
            <>
              <p>
                <b>{who(t.from)}</b> propone darte <b>{fmtCounts(t.give)}</b> por <b>{fmtCounts(t.want)}</b>
              </p>
              <div className="row">
                {L.confirmable.some((c) => c.offerId === t.id) && (
                  <button className="btn primary" onClick={() => void send({ type: 'CONFIRM_TRADE', offerId: t.id, partnerId: t.from })}>
                    Aceptar trato
                  </button>
                )}
                <button className="btn" onClick={() => void send({ type: 'CANCEL_TRADE', offerId: t.id })}>
                  Rechazar
                </button>
              </div>
            </>
          )}
        </div>
      ))}
      {mineOpen.map((t) => (
        <div key={t.id} className="offer-card mine">
          <p>
            Tu oferta: das <b>{fmtCounts(t.give)}</b>, pides <b>{fmtCounts(t.want)}</b>
            {t.to ? ` a ${who(t.to)}` : ''}
          </p>
          {t.to === null && (
            <ul className="responses">
              {view.players
                .filter((p) => p.id !== me)
                .map((p) => (
                  <li key={p.id}>
                    <span style={{ color: PLAYER_HEX[p.color] }}>{p.name}</span>: {t.responses[p.id] === 'accept' ? 'acepta' : t.responses[p.id] === 'reject' ? 'rechaza' : t.responses[p.id] === 'counter' ? 'contraoferta' : 'pensando…'}
                    {L.confirmable.some((c) => c.offerId === t.id && c.partnerId === p.id) && (
                      <button className="btn primary small" onClick={() => void send({ type: 'CONFIRM_TRADE', offerId: t.id, partnerId: p.id })}>
                        Cerrar trato
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          )}
          <button className="btn ghost small" onClick={() => void send({ type: 'CANCEL_TRADE', offerId: t.id })}>
            Retirar
          </button>
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------------ board picking

function PlacePicker({
  view,
  kind,
  targets,
  color,
  mandatory,
  onCancel,
  onConfirm,
}: {
  view: GameView;
  kind: 'road' | 'settlement' | 'city';
  targets: Targets;
  color: string;
  mandatory: boolean;
  onCancel: () => void;
  onConfirm: (p: Picked) => void | Promise<void>;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const label = kind === 'road' ? 'camino' : kind === 'settlement' ? 'poblado' : 'ciudad';
  return (
    <Sheet title={`Coloca ${kind === 'road' ? 'un' : kind === 'settlement' ? 'un' : 'una'} ${label}`} onClose={mandatory ? undefined : onCancel}>
      <p className="muted small">Toca un punto brillante del tablero y confirma.</p>
      <div className="mini-board">
        <BoardSvg view={view} targets={targets} picked={picked} ghostColor={color} ghostKind={kind} onPick={setPicked} compact />
      </div>
      <button className="btn primary big" disabled={!picked} onClick={() => picked && void onConfirm(picked)}>
        {picked ? `Construir ${label} aquí` : 'Elige un sitio'}
      </button>
    </Sheet>
  );
}

function RobberPicker({ view, send }: { view: GameView; send: (a: ClientAction) => Promise<boolean> }) {
  const L = view.me!.legal;
  const [hex, setHex] = useState<number | null>(null);
  const opts = L.robber.find((r) => r.hexId === hex);
  const hexes = useMemo(() => L.robber.map((r) => r.hexId), [L.robber]);
  const go = (victimId?: string) => void send({ type: 'MOVE_ROBBER', hexId: hex!, ...(victimId ? { victimId } : {}) });
  return (
    <Sheet title="Mueve el ladrón">
      <p className="muted small">Toca la casilla donde quieres ponerlo.</p>
      <div className="mini-board">
        <BoardSvg view={view} targets={{ hexes }} picked={hex === null ? null : { kind: 'hex', id: hex }} onPick={(p) => setHex(p.id)} compact />
      </div>
      {hex !== null && opts && opts.victims.length > 1 && (
        <div className="victims">
          <p>¿A quién robas?</p>
          {opts.victims.map((v) => (
            <button key={v} className="btn" style={{ ['--pc' as string]: playerHex(view, v) }} onClick={() => go(v)}>
              <span className="seat-dot" /> {nameOf(view.players, v)} ({view.players.find((p) => p.id === v)?.handCount} cartas)
            </button>
          ))}
        </div>
      )}
      {hex !== null && opts && opts.victims.length <= 1 && (
        <button className="btn primary big" onClick={() => go(opts.victims[0])}>
          {opts.victims[0] ? `Mover y robar a ${nameOf(view.players, opts.victims[0])}` : 'Mover aquí'}
        </button>
      )}
      {hex === null && <button className="btn big" disabled>Elige una casilla</button>}
    </Sheet>
  );
}

const playerHex = (view: GameView, id: string): string => PLAYER_HEX[view.players.find((p) => p.id === id)?.color ?? 'red'];

// ------------------------------------------------------------ discard etc.

function DiscardSheet({ need, hand, send }: { need: number; hand: ResourceCounts; send: (a: ClientAction) => Promise<boolean> }) {
  const [sel, setSel] = useState<Partial<ResourceCounts>>({});
  const total = sum(sel);
  return (
    <Sheet title={`Descarta ${need} cartas`}>
      <p className="muted small">Salió un 7 y tienes más de 7 cartas. Quedan {need - total} por elegir.</p>
      {RESOURCES.map((r) => (
        <Stepper key={r} r={r} value={sel[r] ?? 0} max={Math.min(hand[r], (sel[r] ?? 0) + need - total)} onChange={(n) => setSel({ ...sel, [r]: n })} />
      ))}
      <div className="row">
        <button className="btn ghost" onClick={() => setSel(defaultDiscard(hand, need))}>
          Elegir por mí
        </button>
        <button className="btn primary" disabled={total !== need} onClick={() => void send({ type: 'DISCARD', cards: clean(sel) })}>
          Descartar
        </button>
      </div>
    </Sheet>
  );
}

function CardsSheet({
  view,
  L,
  send,
  close,
  pick,
}: {
  view: GameView;
  L: NonNullable<GameView['me']>['legal'];
  send: (a: ClientAction) => Promise<boolean>;
  close: () => void;
  pick: (m: Mode) => void;
}) {
  const me = view.me!;
  const items: { k: DevCardType; can: boolean; run: () => void }[] = [
    { k: 'knight', can: L.playKnight, run: () => void send({ type: 'PLAY_KNIGHT' }).then((ok) => ok && close()) },
    { k: 'roadBuilding', can: L.playRoadBuilding, run: () => void send({ type: 'PLAY_ROAD_BUILDING' }).then((ok) => ok && close()) },
    { k: 'yearOfPlenty', can: L.playYearOfPlenty, run: () => pick({ t: 'yop' }) },
    { k: 'monopoly', can: L.playMonopoly, run: () => pick({ t: 'mono' }) },
    { k: 'victoryPoint', can: false, run: () => undefined },
  ];
  const owned = items.filter((i) => me.dev[i.k] + me.devNew[i.k] > 0);
  return (
    <Sheet title="Tus cartas de desarrollo" onClose={close}>
      {owned.length === 0 && <p className="muted">No tienes cartas de desarrollo.</p>}
      {owned.map((i) => (
        <div key={i.k} className="build-row">
          <DevIcon size={30} />
          <div className="build-info">
            <b>
              {DEV_ES[i.k]} ×{me.dev[i.k] + me.devNew[i.k]}
            </b>
            <span className="muted small">{DEV_HINT[i.k]}</span>
            {me.devNew[i.k] > 0 && <span className="why">{me.devNew[i.k]} comprada(s) este turno: no se pueden jugar aún.</span>}
          </div>
          {i.k !== 'victoryPoint' && (
            <button className="btn primary" disabled={!i.can} onClick={i.run}>
              Jugar
            </button>
          )}
        </div>
      ))}
    </Sheet>
  );
}

function YearSheet({ send, close, bank }: { send: (a: ClientAction) => Promise<boolean>; close: () => void; bank: ResourceCounts }) {
  const [picked, setPicked] = useState<Resource[]>([]);
  return (
    <Sheet title="Año de abundancia" onClose={close}>
      <p className="muted small">Elige 2 recursos del banco ({picked.length}/2).</p>
      <div className="res-pick">
        {RESOURCES.map((r) => (
          <button key={r} className="btn" disabled={picked.length >= 2 || bank[r] - picked.filter((x) => x === r).length <= 0} onClick={() => setPicked([...picked, r])}>
            <ResIcon r={r} size={26} /> {RES_ES[r]}
          </button>
        ))}
      </div>
      <p>{picked.length ? picked.map((r) => RES_ES[r]).join(' + ') : 'Nada elegido'}</p>
      <div className="row">
        <button className="btn ghost" onClick={() => setPicked([])}>
          Borrar
        </button>
        <button className="btn primary" disabled={picked.length !== 2} onClick={() => void send({ type: 'PLAY_YEAR_OF_PLENTY', resources: picked }).then((ok) => ok && close())}>
          Tomar
        </button>
      </div>
    </Sheet>
  );
}

function MonoSheet({ send, close }: { send: (a: ClientAction) => Promise<boolean>; close: () => void }) {
  return (
    <Sheet title="Monopolio" onClose={close}>
      <p className="muted small">Todos los demás te dan todas sus cartas del recurso que elijas.</p>
      <div className="res-pick">
        {RESOURCES.map((r) => (
          <button key={r} className="btn" onClick={() => void send({ type: 'PLAY_MONOPOLY', resource: r }).then((ok) => ok && close())}>
            <ResIcon r={r} size={26} /> {RES_ES[r]}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- trading

function TradeSheet({
  view,
  L,
  send,
  close,
  counterOf,
}: {
  view: GameView;
  L: NonNullable<GameView['me']>['legal'];
  send: (a: ClientAction) => Promise<boolean>;
  close: () => void;
  counterOf?: number;
}) {
  const me = view.me!;
  const [tab, setTab] = useState<'bank' | 'players'>(counterOf !== undefined || !L.bankTrades.length ? 'players' : 'bank');
  const [give, setGive] = useState<Partial<ResourceCounts>>({});
  const [want, setWant] = useState<Partial<ResourceCounts>>({});
  const [bankGive, setBankGive] = useState<Resource | null>(null);
  const giveable = [...new Set(L.bankTrades.map((b) => b.give))];
  const ratio = (g: Resource) => L.bankTrades.find((b) => b.give === g)?.ratio ?? 4;
  const overlap = RESOURCES.some((r) => (give[r] ?? 0) > 0 && (want[r] ?? 0) > 0);
  const valid = sum(give) > 0 && sum(want) > 0 && !overlap;
  const submit = async () => {
    const ok = await send(
      L.canOffer
        ? { type: 'OFFER_TRADE', give: clean(give), want: clean(want) }
        : { type: 'PROPOSE_TRADE', give: clean(give), want: clean(want), ...(counterOf !== undefined ? { counterOf } : {}) },
    );
    if (ok) close();
  };
  return (
    <Sheet title={counterOf !== undefined ? 'Contraoferta' : 'Comerciar'} onClose={close}>
      {L.canOffer && counterOf === undefined && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'bank'} className={tab === 'bank' ? 'on' : ''} onClick={() => setTab('bank')}>
            Con el banco
          </button>
          <button role="tab" aria-selected={tab === 'players'} className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>
            Con jugadores
          </button>
        </div>
      )}
      {tab === 'bank' && L.canOffer ? (
        <>
          {giveable.length === 0 ? (
            <p className="muted">Todavía no tienes cartas suficientes para cambiar con el banco (necesitas 4 iguales, o 3 / 2 si tienes puerto).</p>
          ) : (
            <>
              <p className="muted small">Entrega:</p>
              <div className="res-pick">
                {giveable.map((g) => (
                  <button key={g} className={`btn${bankGive === g ? ' primary' : ''}`} onClick={() => setBankGive(g)}>
                    <ResIcon r={g} size={26} /> {ratio(g)}× {RES_ES[g]}
                  </button>
                ))}
              </div>
              {bankGive && (
                <>
                  <p className="muted small">Recibes 1:</p>
                  <div className="res-pick">
                    {L.bankTrades
                      .filter((b) => b.give === bankGive)
                      .map((b) => (
                        <button key={b.receive} className="btn" onClick={() => void send({ type: 'BANK_TRADE', give: b.give, receive: b.receive }).then((ok) => ok && (play('coin'), close()))}>
                          <ResIcon r={b.receive} size={26} /> {RES_ES[b.receive]}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {!L.canOffer && !L.canPropose && counterOf === undefined ? (
            <p className="muted">Ahora no puedes proponer tratos.</p>
          ) : (
            <>
              <h3 className="sub">Das</h3>
              {RESOURCES.map((r) => (
                <Stepper key={r} r={r} value={give[r] ?? 0} max={me.hand[r]} onChange={(n) => setGive({ ...give, [r]: n })} />
              ))}
              <h3 className="sub">Pides</h3>
              {RESOURCES.map((r) => (
                <Stepper key={r} r={r} value={want[r] ?? 0} max={9} onChange={(n) => setWant({ ...want, [r]: n })} />
              ))}
              {overlap && <p className="why">No puedes dar y pedir el mismo recurso.</p>}
              <button className="btn primary big" disabled={!valid} onClick={() => void submit()}>
                {L.canOffer ? 'Ofrecer a todos' : counterOf !== undefined ? 'Enviar contraoferta' : 'Proponer al jugador activo'}
              </button>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function FinishedCard({ view }: { view: GameView }) {
  const me = view.me!;
  const won = view.winner === me.id;
  const scores = [...(view.finalScores ?? [])].sort((a, b) => b.total - a.total);
  return (
    <Sheet title={won ? '¡Has ganado!' : 'Fin de la partida'}>
      <ol className="podium small">
        {scores.map((s, i) => {
          const p = view.players.find((x) => x.id === s.playerId)!;
          return (
            <li key={s.playerId} style={{ ['--pc' as string]: PLAYER_HEX[p.color] }} className={i === 0 ? 'first' : ''}>
              <span className="rank">{i + 1}</span>
              <span className="pname">{p.name}</span>
              <b className="vp">{s.total}</b>
            </li>
          );
        })}
      </ol>
      <p className="muted small">El anfitrión puede empezar una revancha desde el tablero.</p>
    </Sheet>
  );
}
