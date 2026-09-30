import { emptyState, normalizePersisted, type Persisted } from './game/persist';

const KEY = 'bj-soiree-potes-v1';

/** Lit l'état sauvegardé. Stockage indisponible (navigation privée, bloqué) ou corrompu : état vide. */
export function loadState(): Persisted {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? normalizePersisted(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(state: Persisted): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
