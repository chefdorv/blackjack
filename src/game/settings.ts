import { defaultChallenges, defaultSettings, isLevel } from './defaults';
import type { BetRange, Challenge, Level, NumericSettingKey, Settings } from './types';

export interface SettingField {
  key: NumericSettingKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const SETTING_FIELDS: readonly SettingField[] = [
  { key: 'startChips', label: 'Jetons de départ', min: 10, max: 1000, step: 10 },
  { key: 'rounds', label: 'Nombre de manches', min: 1, max: 10, step: 1 },
  { key: 'deals', label: 'Donnes par croupier', min: 1, max: 20, step: 1 },
  { key: 'playerSlots', label: 'Défis joueurs sur la table', min: 0, max: 12, step: 1 },
  { key: 'dealerSlots', label: 'Défis croupier sur la table', min: 0, max: 6, step: 1 },
  { key: 'rebuyChips', label: 'Jetons de recave', min: 5, max: 500, step: 5 },
  { key: 'rebuyMalus', label: 'Malus par recave', min: 0, max: 500, step: 5 },
  { key: 'bonusBJ', label: 'Bonus du roi du blackjack', min: 0, max: 200, step: 5 },
];

export const BET_LIMIT = 9999;
export const REWARD_LIMIT = 999;

export function clampInt(v: unknown, lo: number, hi: number): number {
  let n = typeof v === 'number' ? Math.round(v) : parseInt(String(v), 10);
  if (!Number.isFinite(n)) n = lo;
  return Math.max(lo, Math.min(hi, n));
}

function cloneSettings(s: Settings): Settings {
  return structuredClone(s);
}

/**
 * Garantit une plage de mises par manche (en prolongeant la dernière) et min ≤ max.
 * Mute et renvoie `s`.
 */
export function fixBets(s: Settings): Settings {
  if (!Array.isArray(s.bets) || s.bets.length === 0) s.bets = [{ min: 2, max: 10 }];
  s.bets = s.bets.map((b) => {
    const min = clampInt(b.min, 1, BET_LIMIT);
    const max = clampInt(b.max, 1, BET_LIMIT);
    return { min: Math.min(min, max), max: Math.max(min, max) };
  });
  while (s.bets.length < s.rounds) {
    const last = s.bets[s.bets.length - 1];
    s.bets.push({ min: Math.min(BET_LIMIT, last.min + 2), max: Math.min(BET_LIMIT, last.max + 10) });
  }
  return s;
}

export function betFor(s: Settings, round: number): BetRange {
  const i = Math.min(Math.max(round, 1), s.bets.length) - 1;
  return s.bets[i] ?? { min: 2, max: 10 };
}

export function setNumber(s: Settings, key: NumericSettingKey, value: unknown): Settings {
  const field = SETTING_FIELDS.find((f) => f.key === key);
  if (!field) return s;
  const next = cloneSettings(s);
  next[key] = clampInt(value, field.min, field.max);
  return fixBets(next);
}

export function setBet(s: Settings, index: number, which: 'min' | 'max', value: unknown): Settings {
  const next = cloneSettings(s);
  const b = next.bets[index];
  if (!b) return s;
  b[which] = clampInt(value, 1, BET_LIMIT);
  if (which === 'min' && b.max < b.min) b.max = b.min;
  if (which === 'max' && b.min > b.max) b.min = b.max;
  return next;
}

export function updateChallenge(s: Settings, id: string, patch: Partial<Omit<Challenge, 'id'>>): Settings {
  const next = cloneSettings(s);
  const c = next.challenges.find((x) => x.id === id);
  if (!c) return s;
  if (patch.level !== undefined && isLevel(patch.level)) c.level = patch.level;
  if (patch.reward !== undefined) c.reward = clampInt(patch.reward, 0, REWARD_LIMIT);
  if (patch.text !== undefined) c.text = patch.text;
  return next;
}

export function addChallenge(s: Settings, level: Level, reward: unknown, text: string, id: string): Settings {
  const t = text.trim();
  if (!t) return s;
  const next = cloneSettings(s);
  next.challenges.push({ id, level, reward: clampInt(reward, 0, REWARD_LIMIT), text: t });
  return next;
}

export function removeChallenge(s: Settings, id: string): Settings {
  const next = cloneSettings(s);
  next.challenges = next.challenges.filter((c) => c.id !== id);
  return next;
}

export function restoreChallenges(s: Settings): Settings {
  const next = cloneSettings(s);
  next.challenges = defaultChallenges();
  return next;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Reconstruit des réglages valides à partir de n'importe quelle donnée (localStorage corrompu, ancienne version…). */
export function normalizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(raw)) return d;
  const s: Settings = { ...d };
  for (const f of SETTING_FIELDS) {
    if (raw[f.key] !== undefined) s[f.key] = clampInt(raw[f.key], f.min, f.max);
  }
  if (Array.isArray(raw.bets)) {
    const bets = raw.bets.filter(isObj).map((b) => ({ min: clampInt(b.min, 1, BET_LIMIT), max: clampInt(b.max, 1, BET_LIMIT) }));
    if (bets.length) s.bets = bets;
  }
  if (Array.isArray(raw.challenges)) {
    const seen = new Set<string>();
    s.challenges = raw.challenges.filter(isObj).flatMap((c) => {
      if (typeof c.id !== 'string' || seen.has(c.id) || !isLevel(c.level) || typeof c.text !== 'string') return [];
      seen.add(c.id);
      return [{ id: c.id, level: c.level, reward: clampInt(c.reward, 0, REWARD_LIMIT), text: c.text }];
    });
  }
  return fixBets(s);
}
