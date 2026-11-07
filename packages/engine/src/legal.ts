import { activePlayerId } from './game';
import {
  bankRatio,
  canAfford,
  citySpots,
  countOf,
  geo,
  getPlayer,
  handSize,
  missingFor,
  roadSpots,
  robberVictims,
  setupRoadSpots,
  settlementSpots,
} from './queries';
import {
  COSTS,
  RESOURCES,
  type Action,
  type BuildKind,
  type GameState,
  type Resource,
  type ResourceCounts,
} from './types';

export const RESOURCE_NAME_ES: Record<Resource, string> = {
  lumber: 'madera',
  brick: 'arcilla',
  wool: 'lana',
  grain: 'trigo',
  ore: 'mineral',
};

export interface LegalActions {
  /** setup sub-step the player must perform */
  setup: 'settlement' | 'road' | null;
  rollDice: boolean;
  endTurn: boolean;
  passSpecial: boolean;
  roads: number[];
  settlements: number[];
  cities: number[];
  buyDevCard: boolean;
  playKnight: boolean;
  playRoadBuilding: boolean;
  playYearOfPlenty: boolean;
  playMonopoly: boolean;
  /** number of cards this player must discard now (null = nothing to discard) */
  discard: number | null;
  robber: { hexId: number; victims: string[] }[];
  bankTrades: { give: Resource; receive: Resource; ratio: number }[];
  canOffer: boolean;
  canPropose: boolean;
  respondable: number[];
  confirmable: { offerId: number; partnerId: string }[];
  cancellable: number[];
  /** why a build/buy button is disabled (Spanish), only for kinds that are disabled */
  blocked: Partial<Record<BuildKind, string>>;
  freeRoads: number;
}

export function missingText(missing: Partial<ResourceCounts>): string {
  const parts = RESOURCES.filter((r) => (missing[r] ?? 0) > 0).map((r) => `${missing[r]} ${RESOURCE_NAME_ES[r]}`);
  return parts.length ? `Te falta ${parts.join(' y ')}` : '';
}

function emptyLegal(): LegalActions {
  return {
    setup: null,
    rollDice: false,
    endTurn: false,
    passSpecial: false,
    roads: [],
    settlements: [],
    cities: [],
    buyDevCard: false,
    playKnight: false,
    playRoadBuilding: false,
    playYearOfPlenty: false,
    playMonopoly: false,
    discard: null,
    robber: [],
    bankTrades: [],
    canOffer: false,
    canPropose: false,
    respondable: [],
    confirmable: [],
    cancellable: [],
    blocked: {},
    freeRoads: 0,
  };
}

export function getLegalActions(s: GameState, playerId: string): LegalActions {
  const L = emptyLegal();
  const p = getPlayer(s, playerId);
  if (!p || s.phase === 'finished') return L;
  const g = geo(s);
  const isTurn = s.players[s.current]!.id === p.id;

  if (s.phase === 'setup') {
    const step = s.setup!.step;
    const seq = Math.floor(step / 2);
    const n = s.players.length;
    const idx = seq < n ? seq : 2 * n - 1 - seq;
    if (s.players[idx]!.id !== p.id) return L;
    if (step % 2 === 0) {
      L.setup = 'settlement';
      L.settlements = settlementSpots(s, p.id, false);
    } else {
      L.setup = 'road';
      L.roads = setupRoadSpots(s);
    }
    return L;
  }

  if (s.phase === 'discard') {
    L.discard = s.pendingDiscards[p.id] ?? null;
    return L;
  }

  if (s.phase === 'robber') {
    if (!isTurn) return L;
    L.robber = g.hexes
      .filter((h) => h.id !== s.board.robber)
      .map((h) => ({ hexId: h.id, victims: robberVictims(s, p.id, h.id) }));
    return L;
  }

  if (s.phase === 'roadBuilding') {
    if (!isTurn) return L;
    L.roads = p.roadsLeft > 0 ? roadSpots(s, p.id) : [];
    L.freeRoads = s.freeRoads;
    return L;
  }

  const builder = s.phase === 'main' ? isTurn : s.phase === 'special' ? s.special!.queue[0] === p.id : false;

  if (builder) {
    // ---- build / buy
    const why = (kind: BuildKind, extra?: string) => {
      const m = missingFor(p.hand, COSTS[kind]);
      return countOf(m) ? missingText(m) : extra;
    };
    const set = (kind: BuildKind, ok: boolean, msg: string | undefined) => {
      if (!ok && msg) L.blocked[kind] = msg;
    };
    const rs = p.roadsLeft > 0 && canAfford(p, 'road') ? roadSpots(s, p.id) : [];
    L.roads = rs;
    set('road', rs.length > 0, p.roadsLeft <= 0 ? 'No te quedan carreteras' : why('road', 'No hay sitio para una carretera'));
    const ss = p.settlementsLeft > 0 && canAfford(p, 'settlement') ? settlementSpots(s, p.id, true) : [];
    L.settlements = ss;
    set(
      'settlement',
      ss.length > 0,
      p.settlementsLeft <= 0 ? 'No te quedan poblados' : why('settlement', 'No hay sitio conectado para un poblado'),
    );
    const cs = p.citiesLeft > 0 && canAfford(p, 'city') ? citySpots(s, p.id) : [];
    L.cities = cs;
    set('city', cs.length > 0, p.citiesLeft <= 0 ? 'No te quedan ciudades' : why('city', 'No tienes ningún poblado que mejorar'));
    L.buyDevCard = s.deck.length > 0 && canAfford(p, 'devCard');
    set('devCard', L.buyDevCard, s.deck.length === 0 ? 'El mazo está vacío' : why('devCard'));
  }

  if (s.phase === 'special') {
    L.passSpecial = builder;
    return L;
  }

  if (s.phase === 'roll' || s.phase === 'main') {
    if (!isTurn) {
      if (s.phase === 'main') {
        L.canPropose = handSize(p) > 0;
        L.respondable = s.trades.filter((t) => t.to === null && t.from !== p.id).map((t) => t.id);
        L.cancellable = s.trades.filter((t) => t.from === p.id).map((t) => t.id);
      }
      return L;
    }
    if (s.phase === 'roll') L.rollDice = true;
    const canPlay = !s.devPlayedThisTurn;
    L.playKnight = canPlay && p.dev.knight > 0;
    L.playRoadBuilding = canPlay && p.dev.roadBuilding > 0 && p.roadsLeft > 0 && roadSpots(s, p.id).length > 0;
    L.playYearOfPlenty = canPlay && p.dev.yearOfPlenty > 0 && RESOURCES.some((r) => s.bank[r] > 0);
    L.playMonopoly = canPlay && p.dev.monopoly > 0;
  }

  if (s.phase === 'main' && isTurn) {
    L.endTurn = true;
    for (const give of RESOURCES) {
      const ratio = bankRatio(s, p.id, give);
      if (p.hand[give] < ratio) continue;
      for (const receive of RESOURCES) if (receive !== give && s.bank[receive] > 0) L.bankTrades.push({ give, receive, ratio });
    }
    L.canOffer = handSize(p) > 0;
    L.cancellable = s.trades.filter((t) => t.from === p.id).map((t) => t.id);
    for (const t of s.trades) {
      if (t.from === p.id) {
        for (const [pid, r] of Object.entries(t.responses)) {
          const o = getPlayer(s, pid)!;
          if (r === 'accept' && RESOURCES.every((x) => o.hand[x] >= (t.want[x] ?? 0)) && RESOURCES.every((x) => p.hand[x] >= (t.give[x] ?? 0)))
            L.confirmable.push({ offerId: t.id, partnerId: pid });
        }
      } else {
        const o = getPlayer(s, t.from)!;
        if (RESOURCES.every((x) => o.hand[x] >= (t.give[x] ?? 0)) && RESOURCES.every((x) => p.hand[x] >= (t.want[x] ?? 0)))
          L.confirmable.push({ offerId: t.id, partnerId: t.from });
      }
    }
  }
  return L;
}

/** Representative list of concrete legal actions (for bots / tests). Parameterised actions (discard, trade offers) are sampled. */
export function listActions(s: GameState, playerId: string, opts: { includeTrades?: boolean } = {}): Action[] {
  const L = getLegalActions(s, playerId);
  const out: Action[] = [];
  const id = playerId;
  const p = getPlayer(s, id)!;
  if (L.rollDice) out.push({ type: 'ROLL_DICE', playerId: id });
  if (L.endTurn) out.push({ type: 'END_TURN', playerId: id });
  if (L.passSpecial) out.push({ type: 'PASS_SPECIAL', playerId: id });
  for (const e of L.roads) out.push({ type: 'BUILD_ROAD', playerId: id, edgeId: e });
  for (const v of L.settlements) out.push({ type: 'BUILD_SETTLEMENT', playerId: id, vertexId: v });
  for (const v of L.cities) out.push({ type: 'BUILD_CITY', playerId: id, vertexId: v });
  if (L.buyDevCard) out.push({ type: 'BUY_DEV_CARD', playerId: id });
  if (L.playKnight) out.push({ type: 'PLAY_KNIGHT', playerId: id });
  if (L.playRoadBuilding) out.push({ type: 'PLAY_ROAD_BUILDING', playerId: id });
  if (L.playYearOfPlenty) {
    const avail = RESOURCES.filter((r) => s.bank[r] > 0);
    const total = RESOURCES.reduce((n, r) => n + s.bank[r], 0);
    for (const a of avail) {
      if (total === 1) out.push({ type: 'PLAY_YEAR_OF_PLENTY', playerId: id, resources: [a] });
      else for (const b of avail) if (a !== b || s.bank[a] >= 2) out.push({ type: 'PLAY_YEAR_OF_PLENTY', playerId: id, resources: [a, b] });
    }
  }
  if (L.playMonopoly) for (const r of RESOURCES) out.push({ type: 'PLAY_MONOPOLY', playerId: id, resource: r });
  if (L.discard !== null) out.push({ type: 'DISCARD', playerId: id, cards: defaultDiscard(p.hand, L.discard) });
  for (const r of L.robber) {
    if (r.victims.length) for (const v of r.victims) out.push({ type: 'MOVE_ROBBER', playerId: id, hexId: r.hexId, victimId: v });
    else out.push({ type: 'MOVE_ROBBER', playerId: id, hexId: r.hexId });
  }
  for (const t of L.bankTrades) out.push({ type: 'BANK_TRADE', playerId: id, give: t.give, receive: t.receive });
  for (const c of L.confirmable) out.push({ type: 'CONFIRM_TRADE', playerId: id, offerId: c.offerId, partnerId: c.partnerId });
  for (const o of L.respondable) {
    const offer = s.trades.find((x) => x.id === o)!;
    if (RESOURCES.every((r) => p.hand[r] >= (offer.want[r] ?? 0)))
      out.push({ type: 'RESPOND_TRADE', playerId: id, offerId: o, response: 'accept' });
    out.push({ type: 'RESPOND_TRADE', playerId: id, offerId: o, response: 'reject' });
  }
  for (const o of L.cancellable) out.push({ type: 'CANCEL_TRADE', playerId: id, offerId: o });
  if (opts.includeTrades && (L.canOffer || L.canPropose)) {
    for (const give of RESOURCES)
      if (p.hand[give] > 0)
        for (const want of RESOURCES)
          if (want !== give)
            out.push({ type: L.canOffer ? 'OFFER_TRADE' : 'PROPOSE_TRADE', playerId: id, give: { [give]: 1 }, want: { [want]: 1 } });
  }
  return out;
}

/** A valid discard of `n` cards: take from the biggest piles first. */
export function defaultDiscard(hand: ResourceCounts, n: number): Partial<ResourceCounts> {
  const left = { ...hand };
  const out: Partial<ResourceCounts> = {};
  for (let i = 0; i < n; i++) {
    const r = RESOURCES.reduce((best, x) => (left[x] > left[best] ? x : best), RESOURCES[0]!);
    left[r]--;
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

export { activePlayerId };
