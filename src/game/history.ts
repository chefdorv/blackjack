import type { Game, HistoryEntry } from './types';

export const HISTORY_MAX = 60;

/** Enregistre l'état de la partie AVANT une action, pour pouvoir l'annuler. */
export function pushHistory(history: readonly HistoryEntry[], label: string, before: Game): HistoryEntry[] {
  return history.concat({ label, game: structuredClone(before) }).slice(-HISTORY_MAX);
}

export function lastLabel(history: readonly HistoryEntry[]): string | null {
  return history.length ? history[history.length - 1].label : null;
}
