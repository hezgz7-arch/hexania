import {
  RESOURCES,
  type DevCardType,
  type GameEvent,
  type PlayerColor,
  type PortType,
  type PublicPlayer,
  type Resource,
  type ResourceCounts,
  type Terrain,
} from '@hexania/engine';

export const RES_ES: Record<Resource, string> = {
  lumber: 'madera',
  brick: 'arcilla',
  wool: 'lana',
  grain: 'trigo',
  ore: 'mineral',
};
export const RES_COLOR: Record<Resource, string> = {
  lumber: '#2f7a3c',
  brick: '#c4552b',
  wool: '#9acb4f',
  grain: '#e8b92c',
  ore: '#7a8797',
};
export const TERRAIN_ES: Record<Terrain, string> = {
  forest: 'Bosque',
  pasture: 'Pradera',
  fields: 'Campos',
  hills: 'Colinas',
  mountains: 'Montañas',
  desert: 'Desierto',
};
export const TERRAIN_FILL: Record<Terrain, string> = {
  forest: '#2f7a3c',
  pasture: '#8fca4e',
  fields: '#eab928',
  hills: '#c4552b',
  mountains: '#8793a3',
  desert: '#ecd290',
};
export const PLAYER_HEX: Record<PlayerColor, string> = {
  red: '#d9453d',
  blue: '#3a80d6',
  white: '#efeee8',
  orange: '#f08c28',
  green: '#35a96a',
  brown: '#8c5a3c',
};
export const COLOR_ES: Record<PlayerColor, string> = {
  red: 'Rojo',
  blue: 'Azul',
  white: 'Blanco',
  orange: 'Naranja',
  green: 'Verde',
  brown: 'Marrón',
};
export const DEV_ES: Record<DevCardType, string> = {
  knight: 'Caballero',
  victoryPoint: 'Punto de victoria',
  roadBuilding: 'Construcción de caminos',
  yearOfPlenty: 'Año de abundancia',
  monopoly: 'Monopolio',
};
export const DEV_HINT: Record<DevCardType, string> = {
  knight: 'Mueve el ladrón y roba una carta.',
  victoryPoint: 'Suma 1 punto; se revela al ganar.',
  roadBuilding: 'Construye 2 caminos gratis.',
  yearOfPlenty: 'Toma 2 recursos del banco.',
  monopoly: 'Todos te dan todo el recurso que elijas.',
};
export const PORT_LABEL = (t: PortType): string => (t === 'generic' ? '3:1' : '2:1');

export const handTotal = (h: ResourceCounts): number => RESOURCES.reduce((n, r) => n + h[r], 0);

export const fmtCounts = (c: Partial<ResourceCounts>): string => {
  const parts = RESOURCES.filter((r) => (c[r] ?? 0) > 0).map((r) => `${c[r]} ${RES_ES[r]}`);
  return parts.length ? parts.join(', ') : 'nada';
};

export function nameOf(players: { id: string; name: string }[], id: string | null | undefined): string {
  return players.find((p) => p.id === id)?.name ?? '—';
}

export const playerColor = (players: PublicPlayer[], id: string | null | undefined): string => {
  const p = players.find((x) => x.id === id);
  return p ? PLAYER_HEX[p.color] : '#888';
};

/** Spanish one-liner for the activity log. */
export function describeEvent(e: GameEvent, players: PublicPlayer[]): string | null {
  const n = (id: string) => nameOf(players, id);
  switch (e.type) {
    case 'GAME_STARTED':
      return '¡Empieza la partida!';
    case 'TURN_STARTED':
      return `Turno de ${n(e.playerId)}`;
    case 'DICE_ROLLED':
      return `${n(e.playerId)} saca ${e.dice[0]} + ${e.dice[1]} = ${e.total}`;
    case 'RESOURCES_PRODUCED': {
      if (e.shortages.length) return `El banco no tiene ${e.shortages.map((r) => RES_ES[r]).join(' ni ')}: nadie cobra`;
      return e.gains.length ? null : 'Nadie cobra esta vez';
    }
    case 'DISCARD_REQUIRED':
      return 'Salió un 7: quien tenga más de 7 cartas descarta la mitad';
    case 'DISCARDED':
      return `${n(e.playerId)} descarta ${e.count} cartas`;
    case 'ROBBER_MOVED':
      return `${n(e.playerId)} mueve al ladrón`;
    case 'CARD_STOLEN':
      return `${n(e.thiefId)} roba una carta a ${n(e.victimId)}`;
    case 'ROAD_BUILT':
      return `${n(e.playerId)} construye un camino`;
    case 'SETTLEMENT_BUILT':
      return `${n(e.playerId)} funda un poblado`;
    case 'CITY_BUILT':
      return `${n(e.playerId)} mejora a ciudad`;
    case 'DEV_CARD_BOUGHT':
      return `${n(e.playerId)} compra una carta de desarrollo`;
    case 'DEV_CARD_PLAYED':
      return `${n(e.playerId)} juega ${DEV_ES[e.card].toLowerCase()}`;
    case 'YEAR_OF_PLENTY':
      return `${n(e.playerId)} toma ${e.resources.map((r) => RES_ES[r]).join(' y ')} del banco`;
    case 'MONOPOLY':
      return `${n(e.playerId)} monopoliza ${RES_ES[e.resource]} (${e.total})`;
    case 'BANK_TRADE':
      return `${n(e.playerId)} cambia ${e.ratio} ${RES_ES[e.give]} por 1 ${RES_ES[e.receive]}`;
    case 'TRADE_OFFERED':
      return `${n(e.offer.from)} ofrece ${fmtCounts(e.offer.give)} por ${fmtCounts(e.offer.want)}`;
    case 'TRADE_COMPLETED':
      return `${n(e.a)} y ${n(e.b)} cierran un trato`;
    case 'LONGEST_ROAD':
      return e.playerId ? `${n(e.playerId)} tiene el camino más largo (${e.length})` : 'Nadie tiene el camino más largo';
    case 'LARGEST_ARMY':
      return `${n(e.playerId)} tiene el ejército más grande`;
    case 'SPECIAL_BUILD_STARTED':
      return 'Fase de construcción especial';
    case 'GAME_WON':
      return `¡${n(e.playerId)} gana la partida!`;
    default:
      return null;
  }
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
