export type Resource = 'lumber' | 'brick' | 'wool' | 'grain' | 'ore';
export const RESOURCES: readonly Resource[] = ['lumber', 'brick', 'wool', 'grain', 'ore'];
export type Terrain = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert';
export const TERRAIN_RESOURCE: Record<Exclude<Terrain, 'desert'>, Resource> = {
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  hills: 'brick',
  mountains: 'ore',
};
export type DevCardType = 'knight' | 'victoryPoint' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly';
export const DEV_TYPES: readonly DevCardType[] = ['knight', 'victoryPoint', 'roadBuilding', 'yearOfPlenty', 'monopoly'];
export type ResourceCounts = Record<Resource, number>;
export type DevCounts = Record<DevCardType, number>;
export type PlayerColor = 'red' | 'blue' | 'white' | 'orange' | 'green' | 'brown';
export const PLAYER_COLORS: readonly PlayerColor[] = ['red', 'blue', 'white', 'orange', 'green', 'brown'];
export type PortType = Resource | 'generic';
export type NumberMode = 'spiral' | 'balanced';

export interface PlayerConfig {
  id: string;
  name: string;
  color: PlayerColor;
}
export interface GameConfig {
  players: PlayerConfig[];
  numberMode: NumberMode;
}

export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  hand: ResourceCounts;
  dev: DevCounts; // playable (bought on a previous turn)
  devNew: DevCounts; // bought this turn
  knightsPlayed: number;
  roadsLeft: number;
  settlementsLeft: number;
  citiesLeft: number;
  longestRoad: number;
}

export type Phase =
  | 'setup'
  | 'roll'
  | 'discard'
  | 'robber'
  | 'main'
  | 'roadBuilding'
  | 'special'
  | 'finished';

export interface Building {
  owner: string;
  kind: 'settlement' | 'city';
}
export interface HexInfo {
  terrain: Terrain;
  token: number | null;
}
export interface PortInfo {
  edgeId: number;
  type: PortType;
}
export interface BoardState {
  hexes: HexInfo[];
  ports: PortInfo[];
  robber: number;
}

export interface TradeOffer {
  id: number;
  from: string;
  /** null = open to every other player (offer by the active player); otherwise the active player id */
  to: string | null;
  give: Partial<ResourceCounts>; // what `from` hands over
  want: Partial<ResourceCounts>; // what `from` asks for
  responses: Record<string, 'accept' | 'reject' | 'counter'>;
}

export interface Stats {
  dice: number[]; // index 2..12
  produced: Record<string, number>;
  stolenFrom: Record<string, number>; // cards stolen BY this player
  lostToThief: Record<string, number>;
  maxHand: { playerId: string | null; size: number };
}

export interface GameState {
  version: 1;
  config: GameConfig;
  extended: boolean;
  seed: number;
  rng: number;
  players: PlayerState[];
  board: BoardState;
  roads: Record<string, string>;
  buildings: Record<string, Building>;
  bank: ResourceCounts;
  deck: DevCardType[];
  phase: Phase;
  current: number;
  turn: number;
  setup: { step: number; lastVertex: number | null } | null;
  devPlayedThisTurn: boolean;
  lastRoll: [number, number] | null;
  pendingDiscards: Record<string, number>;
  robberReturn: 'roll' | 'main';
  freeRoads: number;
  roadReturn: 'roll' | 'main';
  special: { queue: string[] } | null;
  trades: TradeOffer[];
  nextTradeId: number;
  longestRoadHolder: string | null;
  largestArmyHolder: string | null;
  winner: string | null;
  stats: Stats;
  startRolls: { playerId: string; rolls: [number, number][] }[];
  forcedDice?: [number, number][];
}

// ---------- actions ----------
export type Action =
  | { type: 'ROLL_DICE'; playerId: string }
  | { type: 'END_TURN'; playerId: string }
  | { type: 'BUILD_ROAD'; playerId: string; edgeId: number }
  | { type: 'BUILD_SETTLEMENT'; playerId: string; vertexId: number }
  | { type: 'BUILD_CITY'; playerId: string; vertexId: number }
  | { type: 'BUY_DEV_CARD'; playerId: string }
  | { type: 'PLAY_KNIGHT'; playerId: string }
  | { type: 'PLAY_ROAD_BUILDING'; playerId: string }
  | { type: 'PLAY_YEAR_OF_PLENTY'; playerId: string; resources: Resource[] }
  | { type: 'PLAY_MONOPOLY'; playerId: string; resource: Resource }
  | { type: 'DISCARD'; playerId: string; cards: Partial<ResourceCounts> }
  | { type: 'MOVE_ROBBER'; playerId: string; hexId: number; victimId?: string }
  | { type: 'BANK_TRADE'; playerId: string; give: Resource; receive: Resource }
  | { type: 'OFFER_TRADE'; playerId: string; give: Partial<ResourceCounts>; want: Partial<ResourceCounts> }
  | {
      type: 'PROPOSE_TRADE';
      playerId: string;
      give: Partial<ResourceCounts>;
      want: Partial<ResourceCounts>;
      /** id of the active player's open offer this proposal answers (counter-offer) */
      counterOf?: number;
    }
  | { type: 'RESPOND_TRADE'; playerId: string; offerId: number; response: 'accept' | 'reject' }
  | { type: 'CONFIRM_TRADE'; playerId: string; offerId: number; partnerId: string }
  | { type: 'CANCEL_TRADE'; playerId: string; offerId: number }
  | { type: 'PASS_SPECIAL'; playerId: string };

export type ActionType = Action['type'];

export type GameEvent =
  | { type: 'GAME_STARTED'; order: string[] }
  | { type: 'TURN_STARTED'; playerId: string; turn: number }
  | { type: 'DICE_ROLLED'; playerId: string; dice: [number, number]; total: number }
  | {
      type: 'RESOURCES_PRODUCED';
      gains: { playerId: string; hexId: number; resource: Resource; amount: number }[];
      shortages: Resource[];
    }
  | { type: 'SETUP_RESOURCES'; playerId: string; gains: { hexId: number; resource: Resource }[] }
  | { type: 'DISCARD_REQUIRED'; pending: Record<string, number> }
  | { type: 'DISCARDED'; playerId: string; count: number; cards?: Partial<ResourceCounts> }
  | { type: 'ROBBER_MOVED'; playerId: string; from: number; to: number }
  | { type: 'CARD_STOLEN'; thiefId: string; victimId: string; resource?: Resource }
  | { type: 'ROAD_BUILT'; playerId: string; edgeId: number; free: boolean }
  | { type: 'SETTLEMENT_BUILT'; playerId: string; vertexId: number }
  | { type: 'CITY_BUILT'; playerId: string; vertexId: number }
  | { type: 'DEV_CARD_BOUGHT'; playerId: string; card?: DevCardType }
  | { type: 'DEV_CARD_PLAYED'; playerId: string; card: DevCardType }
  | { type: 'YEAR_OF_PLENTY'; playerId: string; resources: Resource[] }
  | { type: 'MONOPOLY'; playerId: string; resource: Resource; taken: Record<string, number>; total: number }
  | { type: 'BANK_TRADE'; playerId: string; give: Resource; receive: Resource; ratio: number }
  | { type: 'TRADE_OFFERED'; offer: TradeOffer }
  | { type: 'TRADE_RESPONDED'; offerId: number; playerId: string; response: 'accept' | 'reject' | 'counter' }
  | { type: 'TRADE_CANCELLED'; offerId: number }
  | {
      type: 'TRADE_COMPLETED';
      offerId: number;
      a: string;
      b: string;
      aGives: Partial<ResourceCounts>;
      bGives: Partial<ResourceCounts>;
    }
  | { type: 'LONGEST_ROAD'; playerId: string | null; length: number }
  | { type: 'LARGEST_ARMY'; playerId: string }
  | { type: 'SPECIAL_BUILD_STARTED'; queue: string[] }
  | { type: 'SPECIAL_BUILD_PASSED'; playerId: string; auto: boolean }
  | { type: 'GAME_WON'; playerId: string };

export type ErrorCode =
  | 'GAME_OVER'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'ILLEGAL'
  | 'CANNOT_AFFORD'
  | 'NO_PIECES'
  | 'INVALID_TARGET'
  | 'INVALID_ARGUMENT'
  | 'DEV_CARD_RESTRICTION'
  | 'UNKNOWN_PLAYER';

export class EngineError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'EngineError';
  }
}

export const emptyCounts = (): ResourceCounts => ({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 });
export const emptyDev = (): DevCounts => ({ knight: 0, victoryPoint: 0, roadBuilding: 0, yearOfPlenty: 0, monopoly: 0 });
export const COSTS = {
  road: { lumber: 1, brick: 1 },
  settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  devCard: { wool: 1, grain: 1, ore: 1 },
} as const satisfies Record<string, Partial<ResourceCounts>>;
export type BuildKind = keyof typeof COSTS;
