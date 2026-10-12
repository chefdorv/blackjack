// Reconstruction défensive de l'état sauvegardé : tout ce qui vient du stockage est `unknown`.
import { isCard, type Card, type Hand, type HandMove, type Outcome, type Round, type Seat, type Shoe } from './blackjack';
import { isLevel, defaultSettings } from './defaults';
import { HISTORY_MAX } from './history';
import { MAX_PLAYERS, NAME_MAX } from './names';
import { normalizeSettings, normalizeTable } from './settings';
import type { Championship, ClaimRecord, DealSummary, Game, HistoryEntry, Night, Player, Settings, Virtual } from './types';

export const TABS = ['table', 'defis', 'rank', 'rules', 'settings'] as const;
export type Tab = (typeof TABS)[number];

/** Choix du mode sur l'écran de création : vraies cartes, ou tout dans l'app avec l'un des deux croupiers. */
export type SetupMode = 'reel' | 'tournant' | 'banque';
export const SETUP_MODES: readonly SetupMode[] = ['reel', 'tournant', 'banque'];

/** Partie en ligne en cours (voir src/net) ; relue sans dépendre du réseau. */
export type PersistedRoom =
  | {
      role: 'host';
      code: string;
      mode: 'tournant' | 'banque';
      lobby: Array<{ name: string; device: string }>;
      seats: Record<string, string> | null;
      /** Appareils arrivés une fois la partie lancée : ils entrent à la manche suivante. */
      guests: Array<{ name: string; device: string }>;
      /** Verrouillée : absente de la liste des parties ouvertes, et fermée aux nouveaux venus. */
      locked: boolean;
    }
  | { role: 'guest'; code: string; names: string[] };

export interface Persisted {
  settings: Settings;
  setupMode: SetupMode;
  room: PersistedRoom | null;
  game: Game | null;
  history: HistoryEntry[];
  champ: Championship;
  setupNames: string[];
  tab: Tab;
}

export function emptyState(): Persisted {
  return { settings: defaultSettings(), setupMode: 'reel', room: null, game: null, history: [], champ: { nights: [] }, setupNames: [], tab: 'table' };
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function int(v: unknown, fallback: number, min = -Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.round(v)) : fallback;
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function normPlayer(v: unknown): Player | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  return {
    id: v.id,
    name: v.name,
    bonus: int(v.bonus, 0, 0),
    rebuys: int(v.rebuys, 0, 0),
    bj: int(v.bj, 0, 0),
    settled: int(v.settled, 0),
    final: typeof v.final === 'number' && Number.isFinite(v.final) ? Math.max(0, Math.round(v.final)) : null,
  };
}

function normClaim(v: unknown): ClaimRecord | null {
  if (!isObj(v) || typeof v.cid !== 'string' || typeof v.pid !== 'string') return null;
  return {
    cid: v.cid,
    pid: v.pid,
    name: str(v.name),
    text: str(v.text),
    level: isLevel(v.level) ? v.level : 'facile',
    reward: int(v.reward, 0, 0),
    round: int(v.round, 1, 1),
  };
}

export function normalizeGame(v: unknown): Game | null {
  if (!isObj(v) || !Array.isArray(v.players)) return null;
  const players = v.players.map(normPlayer).filter((p): p is Player => p !== null);
  if (players.length < 1) return null;
  const n = players.length;
  const settling = isObj(v.settling) ? { round: int(v.settling.round, 1, 1) } : null;
  return {
    id: str(v.id, 'g0'),
    startedAt: int(v.startedAt, 0),
    startChips: int(v.startChips, 100, 0),
    players,
    round: int(v.round, 1, 1),
    deal: int(v.deal, 1, 1),
    dealer: Math.min(int(v.dealer, 0, 0), n - 1),
    dealersDone: Math.min(int(v.dealersDone, 0, 0), n - 1),
    drawn: strList(v.drawn),
    current: strList(v.current),
    flipped: strList(v.flipped),
    fresh: strList(v.fresh),
    claims: Array.isArray(v.claims) ? v.claims.map(normClaim).filter((c): c is ClaimRecord => c !== null) : [],
    settling,
    finished: v.finished === true,
    revealed: v.revealed === true,
    savedNightId: typeof v.savedNightId === 'string' ? v.savedNightId : null,
    virtual: normVirtual(v.virtual, players),
  };
}

// ---- mode virtuel ----

function cards(v: unknown): Card[] {
  return Array.isArray(v) ? v.filter(isCard) : [];
}

function numRecord(v: unknown, ids: readonly string[], min: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const id of ids) if (typeof v[id] === 'number') out[id] = int(v[id], min, min);
  return out;
}

function normShoe(v: unknown): Shoe | null {
  if (!isObj(v)) return null;
  const list = cards(v.cards);
  return { cards: list, size: int(v.size, list.length, list.length), decks: int(v.decks, 0, 0) };
}

const OUTCOMES: readonly Outcome[] = ['blackjack', 'gagne', 'egalite', 'perdu', 'saute'];
const ACTIONS: readonly HandMove['action'][] = ['tirer', 'rester', 'doubler', 'splitter'];

function normHand(v: unknown): Hand | null {
  if (!isObj(v)) return null;
  const moves = Array.isArray(v.moves)
    ? v.moves.filter(isObj).flatMap((m) => {
        const action = ACTIONS.find((a) => a === m.action);
        return action ? [{ action, before: int(m.before, 0, 0), after: int(m.after, 0, 0) }] : [];
      })
    : [];
  return {
    cards: cards(v.cards),
    bet: int(v.bet, 1, 1),
    doubled: v.doubled === true,
    fromSplit: v.fromSplit === true,
    done: v.done === true,
    moves,
    outcome: OUTCOMES.find((o) => o === v.outcome) ?? null,
    net: int(v.net, 0),
  };
}

function normSeat(v: unknown, ids: readonly string[]): Seat | null {
  if (!isObj(v) || typeof v.pid !== 'string' || !ids.includes(v.pid) || !Array.isArray(v.hands)) return null;
  const hands = v.hands.map(normHand).filter((h): h is Hand => h !== null);
  if (hands.length < 1 || hands.length > 2) return null;
  return { pid: v.pid, chips: int(v.chips, 0, 0), stake: int(v.stake, hands[0].bet, 1), start: cards(v.start), hands };
}

function normRound(v: unknown, ids: readonly string[]): Round | null {
  if (!isObj(v) || !Array.isArray(v.seats)) return null;
  const shoe = normShoe(v.shoe);
  const seats = v.seats.map((s) => normSeat(s, ids)).filter((s): s is Seat => s !== null);
  if (!shoe || seats.length === 0) return null;
  const phase = v.phase === 'terminee' ? 'terminee' : 'joueurs';
  let turn: Round['turn'] = null;
  if (phase === 'joueurs' && isObj(v.turn)) {
    const seat = int(v.turn.seat, -1);
    const hand = int(v.turn.hand, -1);
    if (seats[seat]?.hands[hand] && !seats[seat].hands[hand].done) turn = { seat, hand };
  }
  // Une donne en cours sans main à jouer est incohérente : on l'abandonne.
  if (phase === 'joueurs' && !turn) return null;
  return { rules: normalizeTable(v.rules), shoe, seats, dealer: cards(v.dealer), phase, turn, shuffled: v.shuffled === true };
}

function normSummary(v: unknown, ids: readonly string[]): DealSummary | null {
  if (!isObj(v)) return null;
  const pids = (x: unknown) => strList(x).filter((id) => ids.includes(id));
  return {
    before: numRecord(v.before, ids, 0),
    nets: numRecord(v.nets, ids, -Infinity),
    claims: Array.isArray(v.claims)
      ? v.claims.filter(isObj).flatMap((c) =>
          typeof c.pid === 'string' && ids.includes(c.pid) && typeof c.cid === 'string' ? [{ pid: c.pid, cid: c.cid, text: str(c.text), reward: int(c.reward, 0, 0) }] : [],
        )
      : [],
    rebuys: pids(v.rebuys),
    blackjacks: pids(v.blackjacks),
  };
}

function normVirtual(v: unknown, players: readonly Player[]): Virtual | null {
  if (!isObj(v)) return null;
  const ids = players.map((p) => p.id);
  const shoe = normShoe(v.shoe);
  if (!shoe) return null;
  const chips = numRecord(v.chips, ids, 0);
  for (const id of ids) if (chips[id] === undefined) chips[id] = 0;
  let phase: Virtual['phase'] = v.phase === 'jeu' || v.phase === 'bilan' ? v.phase : 'mises';
  let round = phase === 'mises' ? null : normRound(v.round, ids);
  if (phase === 'jeu' && round?.phase !== 'joueurs') phase = round ? 'bilan' : 'mises';
  if (phase === 'bilan' && round?.phase !== 'terminee') {
    phase = 'mises';
    round = null;
  }
  return {
    mode: v.mode === 'banque' ? 'banque' : 'tournant',
    shoe,
    chips,
    bets: numRecord(v.bets, ids, 1),
    ready: phase === 'mises' ? strList(v.ready).filter((id) => ids.includes(id)) : [],
    phase,
    round,
    dealNo: int(v.dealNo, 0, 0),
    streak: numRecord(v.streak, ids, 0),
    bjRound: numRecord(v.bjRound, ids, 0),
    dealerLost: v.dealerLost === true,
    last: phase === 'bilan' ? normSummary(v.last, ids) : null,
  };
}

function normRoom(v: unknown): PersistedRoom | null {
  if (!isObj(v) || typeof v.code !== 'string' || !/^[A-Z]{4}$/.test(v.code)) return null;
  if (v.role === 'guest') return { role: 'guest', code: v.code, names: strList(v.names).map((n) => n.slice(0, NAME_MAX)).slice(0, MAX_PLAYERS) };
  if (v.role !== 'host') return null;
  const entries = (x: unknown) =>
    Array.isArray(x)
      ? x.filter(isObj).flatMap((e) => (typeof e.name === 'string' && typeof e.device === 'string' ? [{ name: e.name.slice(0, NAME_MAX), device: e.device }] : []))
      : [];
  const lobby = entries(v.lobby);
  let seats: Record<string, string> | null = null;
  if (isObj(v.seats)) {
    seats = {};
    for (const [pid, d] of Object.entries(v.seats)) if (typeof d === 'string') seats[pid] = d;
  }
  return {
    role: 'host',
    code: v.code,
    mode: v.mode === 'banque' ? 'banque' : 'tournant',
    lobby: lobby.slice(0, MAX_PLAYERS),
    seats,
    guests: seats ? entries(v.guests).slice(0, MAX_PLAYERS * 2) : [],
    locked: v.locked === true,
  };
}

function normNight(v: unknown, i: number): Night | null {
  if (!isObj(v) || !Array.isArray(v.results)) return null;
  const results = v.results.filter(isObj).map((r) => ({
    name: str(r.name, '?'),
    place: int(r.place, 1, 1),
    score: int(r.score, 0),
    pts: int(r.pts, 0, 0),
  }));
  return { id: str(v.id, 'n' + i), date: str(v.date, new Date(0).toISOString()), results };
}

export function normalizePersisted(raw: unknown): Persisted {
  const base = emptyState();
  if (!isObj(raw)) return base;
  const history: HistoryEntry[] = Array.isArray(raw.history)
    ? raw.history.flatMap((h) => {
        if (!isObj(h)) return [];
        const game = normalizeGame(h.game);
        return game ? [{ label: str(h.label, 'Action'), game }] : [];
      })
    : [];
  const nights = isObj(raw.champ) && Array.isArray(raw.champ.nights) ? raw.champ.nights.map(normNight).filter((n): n is Night => n !== null) : [];
  const tab = TABS.find((t) => t === raw.tab) ?? 'table';
  const game = normalizeGame(raw.game);
  return {
    settings: raw.settings === undefined ? base.settings : normalizeSettings(raw.settings),
    setupMode: SETUP_MODES.find((m) => m === raw.setupMode) ?? 'reel',
    room: normRoom(raw.room),
    game,
    history: game ? history.slice(-HISTORY_MAX) : [],
    champ: { nights },
    setupNames: strList(raw.setupNames).map((n) => n.slice(0, NAME_MAX)).slice(0, MAX_PLAYERS),
    tab,
  };
}
