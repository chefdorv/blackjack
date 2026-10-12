export const NAME_MAX = 16;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX).trim();
}

export type NameError = 'vide' | 'doublon' | 'complet';

export function nameError(raw: string, list: readonly string[]): NameError | null {
  const n = cleanName(raw);
  if (!n) return 'vide';
  if (list.length >= MAX_PLAYERS) return 'complet';
  const k = n.toLocaleLowerCase('fr-FR');
  if (list.some((x) => x.toLocaleLowerCase('fr-FR') === k)) return 'doublon';
  return null;
}

export function addName(raw: string, list: readonly string[]): string[] {
  return nameError(raw, list) ? list.slice() : list.concat(cleanName(raw));
}

export function moveItem<T>(list: readonly T[], index: number, delta: number): T[] {
  const j = index + delta;
  const out = list.slice();
  if (index < 0 || index >= out.length || j < 0 || j >= out.length) return out;
  [out[index], out[j]] = [out[j], out[index]];
  return out;
}

/** Avec de vraies cartes il faut 3 joueurs ; en virtuel, 2 avec croupier tournant, 1 contre la banque. */
export function minPlayers(mode: 'reel' | 'tournant' | 'banque'): number {
  return mode === 'reel' ? MIN_PLAYERS : mode === 'tournant' ? 2 : 1;
}

export function canStart(list: readonly string[], min: number = MIN_PLAYERS): boolean {
  return list.length >= min && list.length <= MAX_PLAYERS;
}
