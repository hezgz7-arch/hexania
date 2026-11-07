import { existsSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server as IOServer, type Socket } from 'socket.io';
import {
  redactEvent,
  type ActionResult,
  type ClientAction,
  type EventsMessage,
  type GameEvent,
  type HostCommand,
  type JoinRequest,
  type JoinResult,
  type NoticeMessage,
} from '@hexania/engine';
import { Room, RoomError, type RoomHooks } from './room';
import { RoomStore } from './store';
import { lanAddresses } from './net';

export interface ServerOptions {
  /** where rooms are saved; null = memory only (tests) */
  dataDir: string | null;
  /** externally visible base URL (no trailing slash); may change after start (LAN selector) */
  publicUrl: () => string;
  /** built web client; served with SPA fallback when present */
  webDir?: string;
  logger?: boolean;
}

interface Client {
  socket: Socket;
  room: Room;
  role: 'board' | 'player';
  playerId: string | null;
  isHost: boolean;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface HexaniaServer {
  app: FastifyInstance;
  io: IOServer;
  rooms: Map<string, Room>;
  createRoom(opts?: { demo?: boolean }): Room;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export async function createHexaniaServer(opts: ServerOptions): Promise<HexaniaServer> {
  const app = Fastify({ logger: opts.logger ?? false });
  const store = new RoomStore(opts.dataDir);
  const rooms = new Map<string, Room>();
  const clients = new Map<string, Client>();
  const saveTimers = new Map<string, NodeJS.Timeout>();

  const clientsOf = (room: Room) => [...clients.values()].filter((c) => c.room === room);

  const hooks: RoomHooks = {
    changed(room) {
      for (const c of clientsOf(room)) c.socket.emit('state', room.message(c.role, c.playerId, c.isHost));
    },
    events(room, events: GameEvent[], seq) {
      for (const c of clientsOf(room)) {
        const msg: EventsMessage = {
          seq,
          events: events.map((e) => redactEvent(e, c.role === 'player' ? c.playerId : null)),
        };
        c.socket.emit('events', msg);
      }
    },
    notice(room, text) {
      const msg: NoticeMessage = { text };
      for (const c of clientsOf(room)) c.socket.emit('notice', msg);
    },
    dirty(room) {
      if (!opts.dataDir || saveTimers.has(room.code)) return;
      saveTimers.set(
        room.code,
        setTimeout(() => {
          saveTimers.delete(room.code);
          store.save(room.toRecord());
        }, 250),
      );
    },
  };

  for (const rec of store.loadAll()) {
    const room = new Room(rec.code, hooks, opts.publicUrl, rec);
    rooms.set(room.code, room);
    room.resume();
  }

  function createRoom(o: { demo?: boolean } = {}): Room {
    let code = '';
    do code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    while (rooms.has(code));
    const room = new Room(code, hooks, opts.publicUrl);
    rooms.set(code, room);
    if (o.demo) {
      room.demo = true;
      room.seats.push({ playerId: 'p0', name: 'Tú', color: 'red', bot: false, token: null, connected: false });
      for (let i = 0; i < 3; i++) room.host({ cmd: 'addBot' });
    }
    hooks.dirty(room);
    return room;
  }

  // ------------------------------------------------------------------ HTTP
  app.get('/api/health', async () => ({ ok: true, rooms: rooms.size }));
  app.get('/api/info', async () => ({
    publicUrl: opts.publicUrl(),
    lan: lanAddresses().map((a) => a.address),
  }));
  app.post('/api/rooms', async () => {
    const room = createRoom();
    return { code: room.code, hostToken: room.hostToken };
  });
  app.get<{ Params: { code: string } }>('/api/rooms/:code', async (req, reply) => {
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return reply.code(404).send({ exists: false });
    return { exists: true, status: room.status, demo: room.demo };
  });

  if (opts.webDir && existsSync(join(opts.webDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: opts.webDir,
      setHeaders(res, path) {
        // hashed assets never change; the shell and service worker must stay fresh
        if (path.includes(`${join('assets')}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/socket.io/')) return reply.code(404).send({ error: 'not found' });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  }

  // ---------------------------------------------------------------- sockets
  const io = new IOServer(app.server, { maxHttpBufferSize: 64 * 1024, cors: { origin: true } });

  io.on('connection', (socket) => {
    socket.on('join', (req: JoinRequest, ack?: (r: JoinResult) => void) => {
      const reply = (r: JoinResult) => typeof ack === 'function' && ack(r);
      try {
        const room = rooms.get(String(req?.room ?? '').toUpperCase());
        if (!room) return reply({ ok: false, code: 'NO_ROOM', message: 'Esa sala no existe' });
        // a socket joins one room at a time
        const prev = clients.get(socket.id);
        if (prev?.playerId) prev.room.setConnected(prev.playerId, false);
        const isHost = req.role === 'board' && !!req.hostToken && req.hostToken === room.hostToken;

        if (req.role === 'board') {
          clients.set(socket.id, { socket, room, role: 'board', playerId: null, isHost });
          reply({ ok: true, isHost });
          socket.emit('state', room.message('board', null, isHost));
          return;
        }
        const seat = room.joinPlayer({ token: req.token, name: req.name, color: req.color, seat: req.seat });
        // someone else on the same seat is replaced
        for (const c of clientsOf(room)) if (c.playerId === seat.playerId && c.socket.id !== socket.id) c.socket.emit('replaced');
        clients.set(socket.id, { socket, room, role: 'player', playerId: seat.playerId, isHost: false });
        reply({ ok: true, token: seat.token!, playerId: seat.playerId, isHost: false });
        room.setConnected(seat.playerId, true);
        socket.emit('state', room.message('player', seat.playerId, false));
        hooks.changed(room);
        hooks.dirty(room);
        // demo: start as soon as the human sits down
        if (room.demo && room.status === 'lobby' && room.seats.every((s) => s.bot || s.token)) {
          setTimeout(() => {
            try {
              if (room.status === 'lobby') room.host({ cmd: 'start' });
            } catch {
              /* ignore */
            }
          }, 1200);
        }
      } catch (e) {
        if (e instanceof RoomError) {
          const room = rooms.get(String(req?.room ?? '').toUpperCase());
          return reply({
            ok: false,
            code: e.code,
            message: e.message,
            vacant: e.code === 'CHOOSE_SEAT' ? room?.vacantSeats() : undefined,
          });
        }
        console.error('join failed', e);
        reply({ ok: false, code: 'ERROR', message: 'Error al unirse' });
      }
    });

    socket.on('action', (action: ClientAction, ack?: (r: ActionResult) => void) => {
      const reply = (r: ActionResult) => typeof ack === 'function' && ack(r);
      const c = clients.get(socket.id);
      if (!c || c.role !== 'player' || !c.playerId) return reply({ ok: false, code: 'NOT_PLAYER', message: 'No estás en un asiento' });
      if (!action || typeof action !== 'object' || typeof action.type !== 'string')
        return reply({ ok: false, code: 'INVALID_ARGUMENT', message: 'Acción no válida' });
      try {
        c.room.act(c.playerId, action);
        reply({ ok: true });
      } catch (e) {
        if (e instanceof RoomError) return reply({ ok: false, code: e.code, message: e.message });
        console.error('action failed', e);
        reply({ ok: false, code: 'INVALID_ARGUMENT', message: 'Acción no válida' });
      }
    });

    socket.on('host', (cmd: HostCommand, ack?: (r: ActionResult) => void) => {
      const reply = (r: ActionResult) => typeof ack === 'function' && ack(r);
      const c = clients.get(socket.id);
      if (!c?.isHost) return reply({ ok: false, code: 'NOT_HOST', message: 'Solo el anfitrión puede hacer esto' });
      try {
        if (cmd.cmd === 'kick') {
          const target = c.room.seatInfo().find((s) => s.playerId === cmd.playerId);
          for (const o of clientsOf(c.room)) if (o.playerId === cmd.playerId) o.socket.emit('kicked');
          if (!target) return reply({ ok: false, code: 'NOT_FOUND', message: 'Asiento no encontrado' });
        }
        c.room.host(cmd);
        reply({ ok: true });
      } catch (e) {
        if (e instanceof RoomError) return reply({ ok: false, code: e.code, message: e.message });
        console.error('host command failed', e);
        reply({ ok: false, code: 'ERROR', message: 'Comando no válido' });
      }
    });

    socket.on('disconnect', () => {
      const c = clients.get(socket.id);
      clients.delete(socket.id);
      if (c?.playerId && !clientsOf(c.room).some((o) => o.playerId === c.playerId)) c.room.setConnected(c.playerId, false);
    });
  });

  // drop rooms nobody touched for a week
  const sweeper = setInterval(() => {
    for (const room of [...rooms.values()]) {
      if (Date.now() - room.updatedAt > 7 * 24 * 3600 * 1000 && !clientsOf(room).length) {
        room.dispose();
        rooms.delete(room.code);
        store.remove(room.code);
      }
    }
  }, 3600 * 1000);
  sweeper.unref();

  return {
    app,
    io,
    rooms,
    createRoom,
    async listen(port, host = '0.0.0.0') {
      await app.listen({ port, host });
      const addr = app.server.address();
      return typeof addr === 'object' && addr ? addr.port : port;
    },
    async close() {
      clearInterval(sweeper);
      for (const [code, t] of saveTimers) {
        clearTimeout(t);
        const room = rooms.get(code);
        if (room) store.save(room.toRecord());
      }
      for (const room of rooms.values()) room.dispose();
      await io.close();
      await app.close().catch(() => undefined);
    },
  };
}
