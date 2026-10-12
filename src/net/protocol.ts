// Messages échangés entre l'appareil hôte et les invités, et logique de la salle d'attente.
// Tout ce qui arrive du réseau est relu défensivement, comme ce qui sort du localStorage.

import { parseIntent, type Intent } from '../game/intents';
import { cleanName, MAX_PLAYERS } from '../game/names';
import { normalizeGame } from '../game/persist';
import { normalizeSettings } from '../game/settings';
import type { DealerMode, Game, Rng, Settings } from '../game/types';

/** Lettres sans ambiguïté à l'oral ni à l'écrit (pas de I ni de O). */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

export function newRoomCode(rng: Rng): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[Math.floor(rng() * CODE_LETTERS.length)];
  return code;
}

/** Code saisi par un invité : majuscules, sans espaces ; null s'il n'est pas valide. */
export function cleanRoomCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z]/g, '');
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_LETTERS.includes(c)) ? code : null;
}

export function newDeviceId(rng: Rng): string {
  return 'd' + Math.floor(rng() * 36 ** 8).toString(36).padStart(8, '0');
}

export interface LobbyEntry {
  name: string;
  device: string;
}

/** Joueur → appareil qui le fait jouer. */
export type Seats = Record<string, string>;

export type NetMessage =
  | { k: 'hello'; from: string; names: string[] }
  | { k: 'lobby'; from: string; lobby: LobbyEntry[]; mode: DealerMode }
  | { k: 'state'; from: string; rev: number; game: Game; settings: Settings; seats: Seats; lobby: LobbyEntry[]; guests: LobbyEntry[] }
  | { k: 'intent'; from: string; intent: Intent }
  | { k: 'here'; from: string }
  | { k: 'leave'; from: string }
  | { k: 'closed'; from: string }
  /** Hôte d'une salle verrouillée : réponse à un appareil inconnu qui veut entrer. */
  | { k: 'locked'; from: string; to: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseLobby(v: unknown): LobbyEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .flatMap((e) => (typeof e.name === 'string' && typeof e.device === 'string' ? [{ name: cleanName(e.name), device: e.device }] : []))
    .filter((e) => e.name)
    .slice(0, MAX_PLAYERS);
}

function parseSeats(v: unknown): Seats {
  const out: Seats = {};
  if (!isObj(v)) return out;
  for (const [pid, device] of Object.entries(v)) if (typeof device === 'string') out[pid] = device;
  return out;
}

export function parseMessage(v: unknown): NetMessage | null {
  if (!isObj(v) || typeof v.from !== 'string' || !v.from) return null;
  const from = v.from;
  switch (v.k) {
    case 'hello':
      return {
        k: 'hello',
        from,
        names: Array.isArray(v.names) ? v.names.filter((n): n is string => typeof n === 'string').map(cleanName).filter(Boolean).slice(0, MAX_PLAYERS) : [],
      };
    case 'lobby':
      return { k: 'lobby', from, lobby: parseLobby(v.lobby), mode: v.mode === 'banque' ? 'banque' : 'tournant' };
    case 'state': {
      const game = normalizeGame(v.game);
      if (!game?.virtual || typeof v.rev !== 'number') return null;
      return {
        k: 'state',
        from,
        rev: v.rev,
        game,
        settings: normalizeSettings(v.settings),
        seats: parseSeats(v.seats),
        lobby: parseLobby(v.lobby),
        guests: parseLobby(v.guests),
      };
    }
    case 'intent': {
      const intent = parseIntent(v.intent);
      return intent ? { k: 'intent', from, intent } : null;
    }
    case 'locked':
      return typeof v.to === 'string' && v.to ? { k: 'locked', from, to: v.to } : null;
    case 'here':
    case 'leave':
    case 'closed':
      return { k: v.k, from };
    default:
      return null;
  }
}

export interface JoinResult {
  lobby: LobbyEntry[];
  /** Noms refusés : déjà pris par un autre appareil, ou table complète. */
  refused: string[];
}

/**
 * Un appareil annonce ses joueurs : ils remplacent ceux qu'il avait déjà dans la salle.
 * Un joueur déjà assis garde sa place dans l'ordre de la table.
 */
export function joinLobby(lobby: readonly LobbyEntry[], device: string, names: readonly string[]): JoinResult {
  const wanted = names.map(cleanName).filter(Boolean);
  const out = lobby.filter((e) => e.device !== device || wanted.some((n) => sameName(n, e.name)));
  const refused: string[] = [];
  for (const name of wanted) {
    const taken = out.find((e) => sameName(e.name, name));
    if (taken?.device === device) continue;
    if (taken || out.length >= MAX_PLAYERS) refused.push(name);
    else out.push({ name, device });
  }
  return { lobby: out, refused };
}

function sameName(a: string, b: string): boolean {
  return a.toLocaleLowerCase('fr-FR') === b.toLocaleLowerCase('fr-FR');
}

export function leaveLobby(lobby: readonly LobbyEntry[], device: string): LobbyEntry[] {
  return lobby.filter((e) => e.device !== device);
}

/** À qui appartient chaque joueur une fois la partie lancée (les noms de la salle sont uniques). */
export function seatsFor(game: Game, lobby: readonly LobbyEntry[]): Seats {
  const seats: Seats = {};
  for (const p of game.players) {
    const e = lobby.find((x) => sameName(x.name, p.name));
    if (e) seats[p.id] = e.device;
  }
  return seats;
}

/** Un appareil arrive alors que la partie est lancée : on retient ses joueurs (remplace son annonce précédente). */
export function noteGuest(guests: readonly LobbyEntry[], device: string, names: readonly string[]): LobbyEntry[] {
  const mine = names.map(cleanName).filter(Boolean).slice(0, MAX_PLAYERS);
  return guests.filter((e) => e.device !== device).concat(mine.map((name) => ({ name, device })));
}

export function dropGuest(guests: readonly LobbyEntry[], device: string): LobbyEntry[] {
  return guests.filter((e) => e.device !== device);
}

/**
 * Arrivés en cours de partie qui peuvent s'asseoir maintenant : appareil joignable, prénom
 * pas déjà à la table, dans la limite des places.
 */
export function lateJoiners(game: Game, guests: readonly LobbyEntry[], online: (device: string) => boolean): LobbyEntry[] {
  const taken = new Set(game.players.map((p) => p.name.toLocaleLowerCase('fr-FR')));
  const out: LobbyEntry[] = [];
  for (const e of guests) {
    const key = e.name.toLocaleLowerCase('fr-FR');
    if (!online(e.device) || taken.has(key) || game.players.length + out.length >= MAX_PLAYERS) continue;
    taken.add(key);
    out.push(e);
  }
  return out;
}

/** Retour à la salle d'attente : les arrivés en cours de partie y prennent place. */
export function mergeGuests(lobby: readonly LobbyEntry[], guests: readonly LobbyEntry[]): LobbyEntry[] {
  let out = lobby.slice();
  for (const device of new Set(guests.map((g) => g.device))) {
    const names = out
      .filter((e) => e.device === device)
      .map((e) => e.name)
      .concat(guests.filter((g) => g.device === device).map((g) => g.name));
    out = joinLobby(out, device, names).lobby;
  }
  return out;
}

/** Appareils déjà dans la salle : ils peuvent revenir même quand elle est verrouillée. */
export function knownDevices(room: { lobby: readonly LobbyEntry[]; seats: Seats | null; guests: readonly LobbyEntry[] }): Set<string> {
  return new Set([...room.lobby.map((e) => e.device), ...Object.values(room.seats ?? {}), ...room.guests.map((e) => e.device)]);
}

export function controlled(seats: Seats, device: string): string[] {
  return Object.keys(seats).filter((pid) => seats[pid] === device);
}

/** Ce que voient les invités : tout sauf l'ordre des cartes du sabot. */
export function redact(game: Game): Game {
  const v = game.virtual;
  if (!v) return game;
  const hide = <T extends { cards: unknown[] }>(shoe: T): T => ({ ...shoe, cards: [] });
  return { ...game, virtual: { ...v, shoe: hide(v.shoe), round: v.round ? { ...v.round, shoe: hide(v.round.shoe) } : null } };
}
