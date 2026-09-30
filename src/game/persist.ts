// Reconstruction défensive de l'état sauvegardé : tout ce qui vient du stockage est `unknown`.
import { isLevel, defaultSettings } from './defaults';
import { HISTORY_MAX } from './history';
import { MAX_PLAYERS, NAME_MAX } from './names';
import { normalizeSettings } from './settings';
import type { Championship, ClaimRecord, Game, HistoryEntry, Night, Player, Settings } from './types';

export const TABS = ['table', 'defis', 'rank', 'rules', 'settings'] as const;
export type Tab = (typeof TABS)[number];

export interface Persisted {
  settings: Settings;
  game: Game | null;
  history: HistoryEntry[];
  champ: Championship;
  setupNames: string[];
  tab: Tab;
}

export function emptyState(): Persisted {
  return { settings: defaultSettings(), game: null, history: [], champ: { nights: [] }, setupNames: [], tab: 'table' };
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
    game,
    history: game ? history.slice(-HISTORY_MAX) : [],
    champ: { nights },
    setupNames: strList(raw.setupNames).map((n) => n.slice(0, NAME_MAX)).slice(0, MAX_PLAYERS),
    tab,
  };
}
