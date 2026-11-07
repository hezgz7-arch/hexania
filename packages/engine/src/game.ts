import { generateBoard } from './board';
import { nextInt, rollDie, shuffle } from './rng';
import {
  bankRatio,
  canAfford,
  citySpots,
  countOf,
  geo,
  getPlayer,
  handSize,
  longestRoadFor,
  missingFor,
  roadSpots,
  robberVictims,
  setupRoadSpots,
  settlementSpots,
  totalVP,
} from './queries';
import {
  COSTS,
  DEV_TYPES,
  EngineError,
  RESOURCES,
  TERRAIN_RESOURCE,
  emptyCounts,
  emptyDev,
  type Action,
  type BuildKind,
  type DevCardType,
  type ErrorCode,
  type GameConfig,
  type GameEvent,
  type GameState,
  type PlayerState,
  type Resource,
  type ResourceCounts,
} from './types';

const fail = (code: ErrorCode, msg: string): never => {
  throw new EngineError(code, msg);
};

export const VP_TO_WIN = 10;

export function createGame(config: GameConfig, seed: number): GameState {
  const n = config.players.length;
  if (n < 3 || n > 6) fail('INVALID_ARGUMENT', 'Hexania se juega de 3 a 6 jugadores');
  if (new Set(config.players.map((p) => p.id)).size !== n) fail('INVALID_ARGUMENT', 'ids de jugador repetidos');
  const extended = n >= 5;
  const holder = { rng: seed | 0 };
  const board = generateBoard(extended, extended ? 'balanced' : config.numberMode, holder);

  const bankN = extended ? 24 : 19;
  const bank = { lumber: bankN, brick: bankN, wool: bankN, grain: bankN, ore: bankN };
  const deckMix: Record<DevCardType, number> = extended
    ? { knight: 20, victoryPoint: 5, roadBuilding: 3, yearOfPlenty: 3, monopoly: 3 }
    : { knight: 14, victoryPoint: 5, roadBuilding: 2, yearOfPlenty: 2, monopoly: 2 };
  const deck: DevCardType[] = [];
  for (const t of DEV_TYPES) for (let i = 0; i < deckMix[t]; i++) deck.push(t);
  shuffle(holder, deck);

  // who starts: highest of two dice, ties re-roll among the tied
  let candidates = config.players.map((p) => p.id);
  const startRolls = config.players.map((p) => ({ playerId: p.id, rolls: [] as [number, number][] }));
  while (candidates.length > 1) {
    let best = -1;
    let winners: string[] = [];
    for (const id of candidates) {
      const d: [number, number] = [rollDie(holder), rollDie(holder)];
      startRolls.find((r) => r.playerId === id)!.rolls.push(d);
      const t = d[0] + d[1];
      if (t > best) {
        best = t;
        winners = [id];
      } else if (t === best) winners.push(id);
    }
    candidates = winners;
  }
  const startIdx = config.players.findIndex((p) => p.id === candidates[0]);
  const ordered = [...config.players.slice(startIdx), ...config.players.slice(0, startIdx)];

  const players: PlayerState[] = ordered.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    hand: emptyCounts(),
    dev: emptyDev(),
    devNew: emptyDev(),
    knightsPlayed: 0,
    roadsLeft: 15,
    settlementsLeft: 5,
    citiesLeft: 4,
    longestRoad: 0,
  }));
  const zero = () => Object.fromEntries(players.map((p) => [p.id, 0]));
  return {
    version: 1,
    config: { ...config, players: ordered },
    extended,
    seed,
    rng: holder.rng,
    players,
    board,
    roads: {},
    buildings: {},
    bank,
    deck,
    phase: 'setup',
    current: 0,
    turn: 0,
    setup: { step: 0, lastVertex: null },
    devPlayedThisTurn: false,
    lastRoll: null,
    pendingDiscards: {},
    robberReturn: 'main',
    freeRoads: 0,
    roadReturn: 'main',
    special: null,
    trades: [],
    nextTradeId: 1,
    longestRoadHolder: null,
    largestArmyHolder: null,
    winner: null,
    stats: {
      dice: Array(13).fill(0),
      produced: zero(),
      stolenFrom: zero(),
      lostToThief: zero(),
      maxHand: { playerId: null, size: 0 },
    },
    startRolls,
  };
}

// ---------------------------------------------------------------------------

const setupIndex = (n: number, step: number): number => {
  const seq = Math.floor(step / 2);
  return seq < n ? seq : 2 * n - 1 - seq;
};

/** Who is allowed to act right now (null = several players, see DISCARD). */
export function activePlayerId(s: GameState): string | null {
  if (s.phase === 'finished') return null;
  if (s.phase === 'discard') return null;
  if (s.phase === 'special') return s.special?.queue[0] ?? null;
  return s.players[s.current]!.id;
}

function pay(s: GameState, p: PlayerState, kind: BuildKind): void {
  const cost = COSTS[kind] as Partial<ResourceCounts>;
  if (countOf(missingFor(p.hand, cost)) > 0) fail('CANNOT_AFFORD', 'No tienes recursos suficientes');
  for (const r of RESOURCES) {
    const c = cost[r] ?? 0;
    p.hand[r] -= c;
    s.bank[r] += c;
  }
}

function updateLongestRoad(s: GameState, ev: GameEvent[]): void {
  const prev: Record<string, number> = {};
  for (const p of s.players) {
    prev[p.id] = p.longestRoad;
    p.longestRoad = longestRoadFor(s, p.id);
  }
  const lens = s.players.map((p) => ({ id: p.id, len: p.longestRoad }));
  const uniqueMax = (): { id: string; len: number } | null => {
    const m = Math.max(...lens.map((l) => l.len));
    if (m < 5) return null;
    const top = lens.filter((l) => l.len === m);
    return top.length === 1 ? top[0]! : null;
  };
  const holder = s.longestRoadHolder;
  let next: { id: string; len: number } | null;
  if (holder) {
    const hp = getPlayer(s, holder)!;
    const cut = hp.longestRoad < prev[holder]!;
    if (cut || hp.longestRoad < 5) next = uniqueMax();
    else {
      const better = lens.filter((l) => l.len > hp.longestRoad);
      next = better.length ? uniqueMax() : { id: holder, len: hp.longestRoad };
    }
  } else next = uniqueMax();
  const nextId = next?.id ?? null;
  if (nextId !== holder) {
    s.longestRoadHolder = nextId;
    ev.push({ type: 'LONGEST_ROAD', playerId: nextId, length: next?.len ?? 0 });
  }
}

function updateLargestArmy(s: GameState, ev: GameEvent[], p: PlayerState): void {
  if (p.knightsPlayed < 3) return;
  const holder = s.largestArmyHolder ? getPlayer(s, s.largestArmyHolder)! : null;
  if (holder && holder.id !== p.id && p.knightsPlayed <= holder.knightsPlayed) return;
  if (holder?.id === p.id) return;
  s.largestArmyHolder = p.id;
  ev.push({ type: 'LARGEST_ARMY', playerId: p.id });
}

function beginTurn(s: GameState, ev: GameEvent[]): void {
  const p = s.players[s.current]!;
  for (const t of DEV_TYPES) {
    p.dev[t] += p.devNew[t];
    p.devNew[t] = 0;
  }
  s.phase = 'roll';
  s.turn += 1;
  s.devPlayedThisTurn = false;
  s.lastRoll = null;
  s.trades = [];
  s.special = null;
  ev.push({ type: 'TURN_STARTED', playerId: p.id, turn: s.turn });
}

export function hasBuildOption(s: GameState, pid: string): boolean {
  const p = getPlayer(s, pid)!;
  if (canAfford(p, 'road') && p.roadsLeft > 0 && roadSpots(s, pid).length > 0) return true;
  if (canAfford(p, 'settlement') && p.settlementsLeft > 0 && settlementSpots(s, pid, true).length > 0) return true;
  if (canAfford(p, 'city') && p.citiesLeft > 0 && citySpots(s, pid).length > 0) return true;
  if (canAfford(p, 'devCard') && s.deck.length > 0) return true;
  return false;
}

function nextTurnOrSpecial(s: GameState, ev: GameEvent[], afterEndTurn: boolean): void {
  if (afterEndTurn && s.extended) {
    const n = s.players.length;
    const queue: string[] = [];
    for (let k = 1; k < n; k++) queue.push(s.players[(s.current + k) % n]!.id);
    s.phase = 'special';
    s.special = { queue };
    s.trades = [];
    ev.push({ type: 'SPECIAL_BUILD_STARTED', queue: [...queue] });
  }
  advanceSpecial(s, ev);
}

/** Skips players with nothing to do; starts the next turn when everyone has had their chance. */
function advanceSpecial(s: GameState, ev: GameEvent[]): void {
  if (s.phase === 'special' && s.special) {
    while (s.special.queue.length && !hasBuildOption(s, s.special.queue[0]!)) {
      ev.push({ type: 'SPECIAL_BUILD_PASSED', playerId: s.special.queue.shift()!, auto: true });
    }
    if (s.special.queue.length) return;
  }
  s.current = (s.current + 1) % s.players.length;
  beginTurn(s, ev);
}

// ---------------------------------------------------------------------------

function produce(s: GameState, ev: GameEvent[], total: number): void {
  const g = geo(s);
  type Contribution = { playerId: string; hexId: number; resource: Resource; amount: number };
  const byRes: Record<Resource, Contribution[]> = { lumber: [], brick: [], wool: [], grain: [], ore: [] };
  s.board.hexes.forEach((h, hexId) => {
    if (h.token !== total || s.board.robber === hexId || h.terrain === 'desert') return;
    const resource = TERRAIN_RESOURCE[h.terrain];
    for (const v of g.hexVertices[hexId]!) {
      const b = s.buildings[v];
      if (b) byRes[resource].push({ playerId: b.owner, hexId, resource, amount: b.kind === 'city' ? 2 : 1 });
    }
  });
  const gains: Contribution[] = [];
  const shortages: Resource[] = [];
  for (const r of RESOURCES) {
    const list = byRes[r];
    const owed = list.reduce((n, c) => n + c.amount, 0);
    if (owed === 0) continue;
    if (owed <= s.bank[r]) {
      gains.push(...list);
      continue;
    }
    const receivers = new Set(list.map((c) => c.playerId));
    if (receivers.size === 1) {
      let left = s.bank[r];
      for (const c of list) {
        const a = Math.min(c.amount, left);
        left -= a;
        if (a > 0) gains.push({ ...c, amount: a });
      }
    }
    shortages.push(r);
  }
  for (const gn of gains) {
    const p = getPlayer(s, gn.playerId)!;
    p.hand[gn.resource] += gn.amount;
    s.bank[gn.resource] -= gn.amount;
    s.stats.produced[p.id] = (s.stats.produced[p.id] ?? 0) + gn.amount;
  }
  ev.push({ type: 'RESOURCES_PRODUCED', gains, shortages });
}

function stealCard(s: GameState, ev: GameEvent[], thief: PlayerState, victim: PlayerState): void {
  const total = handSize(victim);
  let pick = nextInt(s, total);
  let res: Resource = 'lumber';
  for (const r of RESOURCES) {
    if (pick < victim.hand[r]) {
      res = r;
      break;
    }
    pick -= victim.hand[r];
  }
  victim.hand[res] -= 1;
  thief.hand[res] += 1;
  s.stats.stolenFrom[thief.id] = (s.stats.stolenFrom[thief.id] ?? 0) + 1;
  s.stats.lostToThief[victim.id] = (s.stats.lostToThief[victim.id] ?? 0) + 1;
  ev.push({ type: 'CARD_STOLEN', thiefId: thief.id, victimId: victim.id, resource: res });
}

function cleanCounts(c: Partial<ResourceCounts>): Partial<ResourceCounts> {
  const out: Partial<ResourceCounts> = {};
  for (const r of RESOURCES) {
    const v = c[r] ?? 0;
    if (!Number.isInteger(v) || v < 0) fail('INVALID_ARGUMENT', 'cantidad no válida');
    if (v > 0) out[r] = v;
  }
  return out;
}
const has = (p: PlayerState, c: Partial<ResourceCounts>) => RESOURCES.every((r) => p.hand[r] >= (c[r] ?? 0));
const transfer = (from: PlayerState, to: PlayerState, c: Partial<ResourceCounts>) => {
  for (const r of RESOURCES) {
    const v = c[r] ?? 0;
    from.hand[r] -= v;
    to.hand[r] += v;
  }
};
function checkTradeShape(give: Partial<ResourceCounts>, want: Partial<ResourceCounts>) {
  if (countOf(give) === 0 || countOf(want) === 0) fail('INVALID_ARGUMENT', 'Una oferta necesita dar y pedir algo');
  if (RESOURCES.some((r) => (give[r] ?? 0) > 0 && (want[r] ?? 0) > 0))
    fail('ILLEGAL', 'No se puede cambiar un recurso por el mismo recurso');
}

// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  if (state.phase === 'finished') fail('GAME_OVER', 'La partida ha terminado');
  const s = structuredClone(state);
  const ev: GameEvent[] = [];
  const p = getPlayer(s, action.playerId);
  if (!p) return fail('UNKNOWN_PLAYER', 'Jugador desconocido');
  const g = geo(s);
  const wrongPhase = (): never => fail('WRONG_PHASE', 'No puedes hacer eso ahora');
  const turnPlayer = s.players[s.current]!;
  const isTurn = turnPlayer.id === p.id;

  /** Who may build / buy right now. */
  const requireBuilder = () => {
    if (s.phase === 'main' || s.phase === 'roadBuilding') {
      if (!isTurn) fail('NOT_YOUR_TURN', 'No es tu turno');
    } else if (s.phase === 'special') {
      if (s.special!.queue[0] !== p.id) fail('NOT_YOUR_TURN', 'No es tu fase de construcción');
    } else wrongPhase();
  };
  const afterBuild = () => {
    if (s.phase === 'special') advanceSpecial(s, ev);
  };

  switch (action.type) {
    case 'ROLL_DICE': {
      if (s.phase !== 'roll') wrongPhase();
      if (!isTurn) fail('NOT_YOUR_TURN', 'No es tu turno');
      const forced = s.forcedDice?.shift();
      const dice: [number, number] = forced ?? [rollDie(s), rollDie(s)];
      const total = dice[0] + dice[1];
      s.lastRoll = dice;
      s.stats.dice[total] = (s.stats.dice[total] ?? 0) + 1;
      ev.push({ type: 'DICE_ROLLED', playerId: p.id, dice, total });
      if (total === 7) {
        const pending: Record<string, number> = {};
        for (const q of s.players) if (handSize(q) > 7) pending[q.id] = Math.floor(handSize(q) / 2);
        s.robberReturn = 'main';
        if (Object.keys(pending).length) {
          s.pendingDiscards = pending;
          s.phase = 'discard';
          ev.push({ type: 'DISCARD_REQUIRED', pending: { ...pending } });
        } else s.phase = 'robber';
      } else {
        produce(s, ev, total);
        s.phase = 'main';
      }
      break;
    }

    case 'DISCARD': {
      if (s.phase !== 'discard') wrongPhase();
      const need = s.pendingDiscards[p.id];
      if (need === undefined) fail('ILLEGAL', 'No tienes que descartar');
      const cards = cleanCounts(action.cards);
      if (countOf(cards) !== need) fail('INVALID_ARGUMENT', `Tienes que descartar exactamente ${need} cartas`);
      if (!has(p, cards)) fail('INVALID_ARGUMENT', 'No tienes esas cartas');
      for (const r of RESOURCES) {
        p.hand[r] -= cards[r] ?? 0;
        s.bank[r] += cards[r] ?? 0;
      }
      delete s.pendingDiscards[p.id];
      ev.push({ type: 'DISCARDED', playerId: p.id, count: need, cards });
      if (Object.keys(s.pendingDiscards).length === 0) s.phase = 'robber';
      break;
    }

    case 'MOVE_ROBBER': {
      if (s.phase !== 'robber') wrongPhase();
      if (!isTurn) fail('NOT_YOUR_TURN', 'No es tu turno');
      if (!Number.isInteger(action.hexId) || action.hexId < 0 || action.hexId >= g.hexes.length)
        fail('INVALID_TARGET', 'Hexágono no válido');
      if (action.hexId === s.board.robber) fail('ILLEGAL', 'El ladrón debe moverse a otro hexágono');
      const victims = robberVictims(s, p.id, action.hexId);
      if (victims.length && (!action.victimId || !victims.includes(action.victimId)))
        fail('INVALID_TARGET', 'Elige a quién robar');
      if (!victims.length && action.victimId) fail('INVALID_TARGET', 'Nadie a quien robar en ese hexágono');
      ev.push({ type: 'ROBBER_MOVED', playerId: p.id, from: s.board.robber, to: action.hexId });
      s.board.robber = action.hexId;
      if (action.victimId) stealCard(s, ev, p, getPlayer(s, action.victimId)!);
      s.phase = s.robberReturn;
      break;
    }

    case 'END_TURN': {
      if (s.phase !== 'main') wrongPhase();
      if (!isTurn) fail('NOT_YOUR_TURN', 'No es tu turno');
      s.trades = [];
      nextTurnOrSpecial(s, ev, true);
      break;
    }

    case 'PASS_SPECIAL': {
      if (s.phase !== 'special') wrongPhase();
      if (s.special!.queue[0] !== p.id) fail('NOT_YOUR_TURN', 'No es tu fase de construcción');
      s.special!.queue.shift();
      ev.push({ type: 'SPECIAL_BUILD_PASSED', playerId: p.id, auto: false });
      advanceSpecial(s, ev);
      break;
    }

    case 'BUILD_ROAD': {
      const e = action.edgeId;
      if (!Number.isInteger(e) || e < 0 || e >= g.edges.length) fail('INVALID_TARGET', 'Camino no válido');
      if (s.phase === 'setup') {
        const step = s.setup!.step;
        if (step % 2 !== 1) wrongPhase();
        if (s.players[setupIndex(s.players.length, step)]!.id !== p.id) fail('NOT_YOUR_TURN', 'No es tu turno');
        if (!setupRoadSpots(s).includes(e)) fail('ILLEGAL', 'La carretera debe tocar tu poblado');
        s.roads[e] = p.id;
        p.roadsLeft--;
        ev.push({ type: 'ROAD_BUILT', playerId: p.id, edgeId: e, free: true });
        s.setup!.step++;
        s.setup!.lastVertex = null;
        if (s.setup!.step >= 4 * s.players.length) {
          s.setup = null;
          s.current = 0;
          beginTurn(s, ev);
        } else s.current = setupIndex(s.players.length, s.setup!.step);
        updateLongestRoad(s, ev);
        break;
      }
      requireBuilder();
      const free = s.phase === 'roadBuilding';
      if (p.roadsLeft <= 0) fail('NO_PIECES', 'No te quedan carreteras');
      if (!roadSpots(s, p.id).includes(e)) fail('ILLEGAL', 'Ese camino no está conectado a tu red');
      if (!free) pay(s, p, 'road');
      s.roads[e] = p.id;
      p.roadsLeft--;
      ev.push({ type: 'ROAD_BUILT', playerId: p.id, edgeId: e, free });
      updateLongestRoad(s, ev);
      if (free) {
        s.freeRoads--;
        if (s.freeRoads <= 0 || p.roadsLeft <= 0 || roadSpots(s, p.id).length === 0) {
          s.freeRoads = 0;
          s.phase = s.roadReturn;
        }
      } else afterBuild();
      break;
    }

    case 'BUILD_SETTLEMENT': {
      const v = action.vertexId;
      if (!Number.isInteger(v) || v < 0 || v >= g.vertices.length) fail('INVALID_TARGET', 'Intersección no válida');
      if (p.settlementsLeft <= 0) fail('NO_PIECES', 'No te quedan poblados');
      if (s.phase === 'setup') {
        const step = s.setup!.step;
        if (step % 2 !== 0) wrongPhase();
        if (s.players[setupIndex(s.players.length, step)]!.id !== p.id) fail('NOT_YOUR_TURN', 'No es tu turno');
        if (!settlementSpots(s, p.id, false).includes(v)) fail('ILLEGAL', 'Demasiado cerca de otro poblado');
        s.buildings[v] = { owner: p.id, kind: 'settlement' };
        p.settlementsLeft--;
        s.setup!.lastVertex = v;
        ev.push({ type: 'SETTLEMENT_BUILT', playerId: p.id, vertexId: v });
        if (Math.floor(step / 2) >= s.players.length) {
          const gains: { hexId: number; resource: Resource }[] = [];
          for (const hid of g.vertexHexes[v]!) {
            const t = s.board.hexes[hid]!.terrain;
            if (t === 'desert') continue;
            const r = TERRAIN_RESOURCE[t];
            if (s.bank[r] > 0) {
              s.bank[r]--;
              p.hand[r]++;
              gains.push({ hexId: hid, resource: r });
            }
          }
          ev.push({ type: 'SETUP_RESOURCES', playerId: p.id, gains });
        }
        s.setup!.step++;
        break;
      }
      requireBuilder();
      if (s.phase === 'roadBuilding') wrongPhase();
      if (!settlementSpots(s, p.id, true).includes(v)) fail('ILLEGAL', 'Ahí no puedes construir un poblado');
      pay(s, p, 'settlement');
      s.buildings[v] = { owner: p.id, kind: 'settlement' };
      p.settlementsLeft--;
      ev.push({ type: 'SETTLEMENT_BUILT', playerId: p.id, vertexId: v });
      updateLongestRoad(s, ev);
      afterBuild();
      break;
    }

    case 'BUILD_CITY': {
      requireBuilder();
      if (s.phase === 'roadBuilding') wrongPhase();
      const v = action.vertexId;
      if (!citySpots(s, p.id).includes(v)) fail('ILLEGAL', 'Solo puedes mejorar un poblado propio');
      if (p.citiesLeft <= 0) fail('NO_PIECES', 'No te quedan ciudades');
      pay(s, p, 'city');
      s.buildings[v] = { owner: p.id, kind: 'city' };
      p.citiesLeft--;
      p.settlementsLeft++;
      ev.push({ type: 'CITY_BUILT', playerId: p.id, vertexId: v });
      afterBuild();
      break;
    }

    case 'BUY_DEV_CARD': {
      requireBuilder();
      if (s.phase === 'roadBuilding') wrongPhase();
      if (s.deck.length === 0) fail('ILLEGAL', 'El mazo de desarrollo está vacío');
      pay(s, p, 'devCard');
      const card = s.deck.pop()!;
      p.devNew[card]++;
      ev.push({ type: 'DEV_CARD_BOUGHT', playerId: p.id, card });
      afterBuild();
      break;
    }

    case 'PLAY_KNIGHT':
    case 'PLAY_ROAD_BUILDING':
    case 'PLAY_YEAR_OF_PLENTY':
    case 'PLAY_MONOPOLY': {
      if (s.phase !== 'roll' && s.phase !== 'main') wrongPhase();
      if (!isTurn) fail('NOT_YOUR_TURN', 'No es tu turno');
      if (s.devPlayedThisTurn) fail('DEV_CARD_RESTRICTION', 'Solo una carta de desarrollo por turno');
      const card: DevCardType =
        action.type === 'PLAY_KNIGHT'
          ? 'knight'
          : action.type === 'PLAY_ROAD_BUILDING'
            ? 'roadBuilding'
            : action.type === 'PLAY_YEAR_OF_PLENTY'
              ? 'yearOfPlenty'
              : 'monopoly';
      if (p.dev[card] <= 0) {
        if (p.devNew[card] > 0) fail('DEV_CARD_RESTRICTION', 'No puedes jugar una carta que compraste este turno');
        fail('DEV_CARD_RESTRICTION', 'No tienes esa carta');
      }
      const returnTo = s.phase as 'roll' | 'main';
      if (action.type === 'PLAY_ROAD_BUILDING') {
        const n = Math.min(2, p.roadsLeft);
        if (n <= 0 || roadSpots(s, p.id).length === 0) fail('ILLEGAL', 'No puedes colocar carreteras');
        s.freeRoads = n;
        s.roadReturn = returnTo;
      }
      if (action.type === 'PLAY_YEAR_OF_PLENTY') {
        const avail = RESOURCES.reduce((n, r) => n + s.bank[r], 0);
        const want = Math.min(2, avail);
        if (want === 0) fail('ILLEGAL', 'La banca está vacía');
        if (action.resources.length !== want) fail('INVALID_ARGUMENT', `Elige ${want} recurso(s)`);
        const need = emptyCounts();
        for (const r of action.resources) {
          if (!RESOURCES.includes(r)) fail('INVALID_ARGUMENT', 'Recurso no válido');
          need[r]++;
        }
        if (RESOURCES.some((r) => need[r] > s.bank[r])) fail('ILLEGAL', 'La banca no tiene esas cartas');
        for (const r of action.resources) {
          s.bank[r]--;
          p.hand[r]++;
        }
        ev.push({ type: 'YEAR_OF_PLENTY', playerId: p.id, resources: [...action.resources] });
      }
      if (action.type === 'PLAY_MONOPOLY') {
        const r = action.resource;
        if (!RESOURCES.includes(r)) fail('INVALID_ARGUMENT', 'Recurso no válido');
        const taken: Record<string, number> = {};
        let total = 0;
        for (const q of s.players) {
          if (q.id === p.id || q.hand[r] === 0) continue;
          taken[q.id] = q.hand[r];
          total += q.hand[r];
          p.hand[r] += q.hand[r];
          q.hand[r] = 0;
        }
        ev.push({ type: 'MONOPOLY', playerId: p.id, resource: r, taken, total });
      }
      p.dev[card]--;
      s.devPlayedThisTurn = true;
      ev.push({ type: 'DEV_CARD_PLAYED', playerId: p.id, card });
      if (card === 'knight') {
        p.knightsPlayed++;
        updateLargestArmy(s, ev, p);
        s.robberReturn = returnTo;
        s.phase = 'robber';
      } else if (card === 'roadBuilding') s.phase = 'roadBuilding';
      break;
    }

    case 'BANK_TRADE': {
      if (s.phase !== 'main') wrongPhase();
      if (!isTurn) fail('NOT_YOUR_TURN', 'No es tu turno');
      const { give, receive } = action;
      if (!RESOURCES.includes(give) || !RESOURCES.includes(receive) || give === receive)
        fail('INVALID_ARGUMENT', 'Intercambio no válido');
      const ratio = bankRatio(s, p.id, give);
      if (p.hand[give] < ratio) fail('CANNOT_AFFORD', `Necesitas ${ratio} de ese recurso`);
      if (s.bank[receive] < 1) fail('ILLEGAL', 'La banca no tiene ese recurso');
      p.hand[give] -= ratio;
      s.bank[give] += ratio;
      s.bank[receive]--;
      p.hand[receive]++;
      ev.push({ type: 'BANK_TRADE', playerId: p.id, give, receive, ratio });
      break;
    }

    case 'OFFER_TRADE': {
      if (s.phase !== 'main') wrongPhase();
      if (!isTurn) fail('NOT_YOUR_TURN', 'Solo el jugador activo puede abrir una oferta');
      const give = cleanCounts(action.give);
      const want = cleanCounts(action.want);
      checkTradeShape(give, want);
      if (!has(p, give)) fail('CANNOT_AFFORD', 'No tienes esas cartas');
      s.trades = s.trades.filter((t) => t.from !== p.id);
      const offer = { id: s.nextTradeId++, from: p.id, to: null, give, want, responses: {} };
      s.trades.push(offer);
      ev.push({ type: 'TRADE_OFFERED', offer: structuredClone(offer) });
      break;
    }

    case 'PROPOSE_TRADE': {
      if (s.phase !== 'main') wrongPhase();
      if (isTurn) fail('ILLEGAL', 'Tú tienes que usar una oferta abierta');
      const give = cleanCounts(action.give);
      const want = cleanCounts(action.want);
      checkTradeShape(give, want);
      if (!has(p, give)) fail('CANNOT_AFFORD', 'No tienes esas cartas');
      s.trades = s.trades.filter((t) => t.from !== p.id);
      if (action.counterOf !== undefined) {
        const base = s.trades.find((t) => t.id === action.counterOf && t.to === null);
        if (base) base.responses[p.id] = 'counter';
      }
      const offer = { id: s.nextTradeId++, from: p.id, to: turnPlayer.id, give, want, responses: {} };
      s.trades.push(offer);
      ev.push({ type: 'TRADE_OFFERED', offer: structuredClone(offer) });
      break;
    }

    case 'RESPOND_TRADE': {
      if (s.phase !== 'main') wrongPhase();
      const offer = s.trades.find((t) => t.id === action.offerId);
      if (!offer || offer.to !== null) fail('INVALID_TARGET', 'Oferta no encontrada');
      if (offer!.from === p.id) fail('ILLEGAL', 'No puedes responder a tu propia oferta');
      if (action.response === 'accept' && !has(p, offer!.want)) fail('CANNOT_AFFORD', 'No tienes lo que piden');
      offer!.responses[p.id] = action.response;
      ev.push({ type: 'TRADE_RESPONDED', offerId: offer!.id, playerId: p.id, response: action.response });
      break;
    }

    case 'CANCEL_TRADE': {
      if (s.phase !== 'main') wrongPhase();
      const offer = s.trades.find((t) => t.id === action.offerId);
      if (!offer) fail('INVALID_TARGET', 'Oferta no encontrada');
      if (offer!.from !== p.id && !(offer!.to === p.id)) fail('ILLEGAL', 'No es tu oferta');
      s.trades = s.trades.filter((t) => t.id !== offer!.id);
      ev.push({ type: 'TRADE_CANCELLED', offerId: offer!.id });
      break;
    }

    case 'CONFIRM_TRADE': {
      if (s.phase !== 'main') wrongPhase();
      if (!isTurn) fail('NOT_YOUR_TURN', 'Solo el jugador activo cierra tratos');
      const offer = s.trades.find((t) => t.id === action.offerId);
      if (!offer) return fail('INVALID_TARGET', 'Oferta no encontrada');
      const from = getPlayer(s, offer.from)!;
      const other = getPlayer(s, action.partnerId);
      if (!other) return fail('UNKNOWN_PLAYER', 'Jugador desconocido');
      if (offer.from === p.id) {
        if (offer.responses[other.id] !== 'accept') fail('ILLEGAL', 'Ese jugador no ha aceptado');
      } else if (other.id !== offer.from) fail('INVALID_TARGET', 'Compañero no válido');
      const counterpart = offer.from === p.id ? other : p;
      if (!has(from, offer.give) || !has(counterpart, offer.want)) fail('CANNOT_AFFORD', 'Alguno ya no tiene las cartas');
      transfer(from, counterpart, offer.give);
      transfer(counterpart, from, offer.want);
      s.trades = s.trades.filter((t) => t.id !== offer.id);
      ev.push({
        type: 'TRADE_COMPLETED',
        offerId: offer.id,
        a: from.id,
        b: counterpart.id,
        aGives: offer.give,
        bGives: offer.want,
      });
      break;
    }

    default:
      fail('INVALID_ARGUMENT', 'Acción desconocida');
  }

  finalize(s, ev);
  return { state: s, events: ev };
}

function finalize(s: GameState, ev: GameEvent[]): void {
  for (const q of s.players) {
    const size = handSize(q);
    if (size > s.stats.maxHand.size) s.stats.maxHand = { playerId: q.id, size };
  }
  if (s.phase === 'setup' || s.phase === 'special' || s.phase === 'finished') return;
  const cur = s.players[s.current]!;
  if (totalVP(s, cur) >= VP_TO_WIN) {
    s.phase = 'finished';
    s.winner = cur.id;
    ev.push({ type: 'GAME_WON', playerId: cur.id });
  }
}
