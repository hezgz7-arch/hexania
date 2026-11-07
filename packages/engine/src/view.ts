import { activePlayerId } from './game';
import { getLegalActions, type LegalActions } from './legal';
import { handSize, hiddenVP, publicVP, totalVP } from './queries';
import type {
  BoardState,
  DevCounts,
  GameEvent,
  GameState,
  Phase,
  PlayerColor,
  ResourceCounts,
  Stats,
  TradeOffer,
} from './types';

export interface PublicPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  handCount: number;
  devCount: number;
  knightsPlayed: number;
  publicVP: number;
  longestRoad: number;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
  roadsLeft: number;
  settlementsLeft: number;
  citiesLeft: number;
}

export interface GameView {
  extended: boolean;
  phase: Phase;
  turn: number;
  current: string;
  active: string | null;
  setupStep: number | null;
  lastRoll: [number, number] | null;
  board: BoardState;
  roads: Record<string, string>;
  buildings: GameStateBuildings;
  bankCounts: ResourceCounts;
  deckCount: number;
  players: PublicPlayer[];
  pendingDiscards: Record<string, number>;
  trades: TradeOffer[];
  special: string[] | null;
  freeRoads: number;
  winner: string | null;
  /** only when the game is over */
  finalScores: { playerId: string; public: number; hidden: number; total: number }[] | null;
  stats: Stats | null;
  startRolls: GameState['startRolls'];
  me: null | {
    id: string;
    hand: ResourceCounts;
    dev: DevCounts;
    devNew: DevCounts;
    hiddenVP: number;
    totalVP: number;
    legal: LegalActions;
  };
}
type GameStateBuildings = GameState['buildings'];

/** `playerId = null` gives the public (tablet) view. */
export function getPlayerView(s: GameState, playerId: string | null): GameView {
  const me = playerId ? s.players.find((p) => p.id === playerId) : undefined;
  const over = s.phase === 'finished';
  return {
    extended: s.extended,
    phase: s.phase,
    turn: s.turn,
    current: s.players[s.current]!.id,
    active: activePlayerId(s),
    setupStep: s.setup ? s.setup.step : null,
    lastRoll: s.lastRoll,
    board: s.board,
    roads: s.roads,
    buildings: s.buildings,
    bankCounts: s.bank,
    deckCount: s.deck.length,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      handCount: handSize(p),
      devCount: Object.values(p.dev).reduce((a, b) => a + b, 0) + Object.values(p.devNew).reduce((a, b) => a + b, 0),
      knightsPlayed: p.knightsPlayed,
      publicVP: publicVP(s, p),
      longestRoad: p.longestRoad,
      hasLongestRoad: s.longestRoadHolder === p.id,
      hasLargestArmy: s.largestArmyHolder === p.id,
      roadsLeft: p.roadsLeft,
      settlementsLeft: p.settlementsLeft,
      citiesLeft: p.citiesLeft,
    })),
    pendingDiscards: s.pendingDiscards,
    trades: s.trades,
    special: s.special ? [...s.special.queue] : null,
    freeRoads: s.freeRoads,
    winner: s.winner,
    finalScores: over
      ? s.players.map((p) => ({ playerId: p.id, public: publicVP(s, p), hidden: hiddenVP(p), total: totalVP(s, p) }))
      : null,
    stats: over ? s.stats : null,
    startRolls: s.startRolls,
    me: me
      ? {
          id: me.id,
          hand: me.hand,
          dev: me.dev,
          devNew: me.devNew,
          hiddenVP: hiddenVP(me),
          totalVP: totalVP(s, me),
          legal: getLegalActions(s, me.id),
        }
      : null,
  };
}

/** Strip information that `viewerId` may not see. */
export function redactEvent(e: GameEvent, viewerId: string | null): GameEvent {
  switch (e.type) {
    case 'CARD_STOLEN': {
      if (viewerId === e.thiefId || viewerId === e.victimId) return e;
      const { resource: _r, ...rest } = e;
      return rest;
    }
    case 'DEV_CARD_BOUGHT': {
      if (viewerId === e.playerId) return e;
      const { card: _c, ...rest } = e;
      return rest;
    }
    case 'DISCARDED': {
      if (viewerId === e.playerId) return e;
      const { cards: _c, ...rest } = e;
      return rest;
    }
    default:
      return e;
  }
}
