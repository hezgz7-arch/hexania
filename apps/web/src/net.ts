import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ActionResult,
  ClientAction,
  EventsMessage,
  GameEvent,
  HostCommand,
  JoinResult,
  NoticeMessage,
  PlayerColor,
  SeatInfo,
  StateMessage,
} from '@hexania/engine';

export type Conn = 'waking' | 'connecting' | 'online' | 'offline';

export interface LogEntry {
  id: number;
  event: GameEvent;
}

export interface UseRoom {
  conn: Conn;
  state: StateMessage | null;
  /** set while the player still has to choose / claim a seat */
  joinError: { code: string; message: string; vacant?: SeatInfo[] } | null;
  log: LogEntry[];
  notice: string | null;
  replaced: boolean;
  kicked: boolean;
  join(opts: { name?: string; color?: PlayerColor; seat?: string }): Promise<JoinResult>;
  act(a: ClientAction): Promise<ActionResult>;
  host(c: HostCommand): Promise<ActionResult>;
  /** server clock minus local clock, to show timers correctly */
  skew: number;
}

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
  del(k: string): void {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
export { store };

interface Opts {
  room: string;
  role: 'board' | 'player';
  onEvents?: (events: GameEvent[]) => void;
}

/** One socket per screen; rejoins by stored token after every reconnect so a reload never loses the seat. */
export function useRoom({ room, role, onEvents }: Opts): UseRoom {
  const code = room.toUpperCase();
  const [conn, setConn] = useState<Conn>('waking');
  const [state, setState] = useState<StateMessage | null>(null);
  const [joinError, setJoinError] = useState<UseRoom['joinError']>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [replaced, setReplaced] = useState(false);
  const [kicked, setKicked] = useState(false);
  const [skew, setSkew] = useState(0);
  const sock = useRef<Socket | null>(null);
  const logId = useRef(0);
  const cb = useRef(onEvents);
  cb.current = onEvents;
  const everConnected = useRef(false);
  const pending = useRef<{ name?: string; color?: PlayerColor; seat?: string } | null>(null);

  const tokenKey = `hexania:token:${code}`;
  const hostKey = `hexania:host:${code}`;

  const doJoin = useCallback(
    (extra: { name?: string; color?: PlayerColor; seat?: string } = {}): Promise<JoinResult> => {
      const s = sock.current;
      if (!s) return Promise.resolve({ ok: false, code: 'OFFLINE', message: 'Sin conexión' });
      const req =
        role === 'board'
          ? { room: code, role, hostToken: store.get(hostKey) ?? undefined }
          : { room: code, role, token: store.get(tokenKey) ?? undefined, ...extra };
      return new Promise((resolve) => {
        s.timeout(8000).emit('join', req, (err: unknown, r: JoinResult) => {
          const res: JoinResult = err || !r ? { ok: false, code: 'TIMEOUT', message: 'El servidor no responde' } : r;
          if (res.ok) {
            setJoinError(null);
            if (res.token) store.set(tokenKey, res.token);
          } else {
            // a token the server no longer knows must not block a fresh join
            if (res.code === 'BAD_TOKEN' || res.code === 'KICKED') store.del(tokenKey);
            setJoinError({ code: res.code, message: res.message, vacant: res.vacant });
          }
          resolve(res);
        });
      });
    },
    [code, role, tokenKey, hostKey],
  );

  useEffect(() => {
    let dead = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    // cloud free tiers sleep: poll /api/health until the server answers before opening the socket
    const wake = async (): Promise<void> => {
      for (;;) {
        if (dead) return;
        try {
          const r = await fetch('/api/health', { cache: 'no-store' });
          if (r.ok) break;
        } catch {
          /* still asleep */
        }
        await new Promise((res) => (retry = setTimeout(res, 2000)));
      }
      if (dead) return;
      setConn('connecting');
      const s = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
      sock.current = s;
      s.on('connect', () => {
        everConnected.current = true;
        setConn('online');
        // a phone without a stored seat waits for the join form instead of grabbing a seat
        if (role === 'board' || pending.current || store.get(tokenKey)) void doJoin(pending.current ?? {});
      });
      s.on('disconnect', () => setConn('offline'));
      s.on('connect_error', () => setConn(everConnected.current ? 'offline' : 'connecting'));
      s.on('state', (m: StateMessage) => {
        setSkew(m.room.serverTime - Date.now());
        setState(m);
      });
      s.on('events', (m: EventsMessage) => {
        setLog((l) => [...l, ...m.events.map((event) => ({ id: ++logId.current, event }))].slice(-80));
        cb.current?.(m.events);
      });
      s.on('notice', (m: NoticeMessage) => {
        setNotice(m.text);
        setTimeout(() => setNotice((n) => (n === m.text ? null : n)), 4500);
      });
      s.on('replaced', () => setReplaced(true));
      s.on('kicked', () => {
        store.del(tokenKey);
        setKicked(true);
      });
    };
    void wake();
    return () => {
      dead = true;
      if (retry) clearTimeout(retry);
      sock.current?.close();
      sock.current = null;
    };
  }, [doJoin, tokenKey, role]);

  const emit = useCallback(<T,>(ev: string, payload: unknown): Promise<T> => {
    const s = sock.current;
    if (!s) return Promise.resolve({ ok: false, code: 'OFFLINE', message: 'Sin conexión' } as T);
    return new Promise((resolve) => {
      s.timeout(8000).emit(ev, payload, (err: unknown, r: T) =>
        resolve(err || !r ? ({ ok: false, code: 'TIMEOUT', message: 'El servidor no responde' } as T) : r),
      );
    });
  }, []);

  return {
    conn,
    state,
    joinError,
    log,
    notice,
    replaced,
    kicked,
    skew,
    join: (o) => {
      pending.current = o;
      return doJoin(o);
    },
    act: (a) => emit<ActionResult>('action', a),
    host: (c) => emit<ActionResult>('host', c),
  };
}
