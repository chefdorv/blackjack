import { emptyState, normalizePersisted, type Persisted } from './game/persist';

/**
 * `?appareil=b` (essais à plusieurs onglets d'un même navigateur) : chaque onglet garde sa propre
 * sauvegarde et son propre identifiant, comme s'il s'agissait de téléphones différents.
 */
function suffix(): string {
  try {
    const a = new URLSearchParams(window.location.search).get('appareil') ?? '';
    return /^[a-z0-9]{1,12}$/.test(a) ? '-' + a : '';
  } catch {
    return '';
  }
}

const KEY = 'bj-soiree-potes-v1' + suffix();

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

const DEVICE_KEY = 'bj-appareil-v1' + suffix();
let memoryDevice: string | null = null;

/** Identifiant de ce téléphone pour les parties à plusieurs (stable d'une visite à l'autre si possible). */
export function deviceId(make: () => string): string {
  try {
    const saved = window.localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const id = make();
    window.localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    memoryDevice ??= make();
    return memoryDevice;
  }
}
