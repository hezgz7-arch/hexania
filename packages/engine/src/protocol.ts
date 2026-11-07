import type { GameView } from './view';
import type { Action, GameEvent, NumberMode, PlayerColor } from './types';

/** Messages shared by the server and both web clients. */

export interface SeatInfo {
  playerId: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  bot: boolean;
  /** true when nobody holds the seat (kicked, or demo seat waiting for its human) */
  vacant: boolean;
}

export interface RoomInfo {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  seats: SeatInfo[];
  paused: boolean;
  timerSeconds: number;
  numberMode: NumberMode;
  /** epoch ms when the active turn is force-ended, null if no timer / paused */
  deadline: number | null;
  canUndo: boolean;
  publicUrl: string;
  serverTime: number;
  demo: boolean;
  minPlayers: number;
  maxPlayers: number;
}

export interface StateMessage {
  room: RoomInfo;
  view: GameView | null;
  you: { playerId: string | null; isHost: boolean; role: 'board' | 'player' };
}

export interface EventsMessage {
  seq: number;
  events: GameEvent[];
}

export interface JoinRequest {
  room: string;
  role: 'board' | 'player';
  /** seat token from a previous join */
  token?: string;
  hostToken?: string;
  name?: string;
  color?: PlayerColor;
  /** claim a specific vacant seat in a running game */
  seat?: string;
}

export type JoinResult =
  | { ok: true; token?: string; playerId?: string; isHost: boolean }
  | { ok: false; code: string; message: string; vacant?: SeatInfo[] };

/** `playerId` is always taken from the socket, never from the client. */
export type ClientAction = Action extends infer A ? (A extends Action ? Omit<A, 'playerId'> : never) : never;

export type ActionResult = { ok: true } | { ok: false; code: string; message: string };

export type HostCommand =
  | { cmd: 'start' }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'kick'; playerId: string }
  | { cmd: 'addBot' }
  | { cmd: 'removeBot'; playerId: string }
  | { cmd: 'setTimer'; seconds: number }
  | { cmd: 'setNumberMode'; mode: NumberMode }
  | { cmd: 'undo' }
  | { cmd: 'rematch' };

export interface NoticeMessage {
  text: string;
}
