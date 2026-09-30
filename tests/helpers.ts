import { defaultSettings } from '../src/game/defaults';
import { createGame } from '../src/game/game';
import type { Game, Rng, Settings } from '../src/game/types';

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function settings(patch: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), ...patch };
}

export function newGame(names: string[] = ['Alice', 'Bob', 'Chloé'], s: Settings = settings(), seed = 1): Game {
  return createGame(names, s, seeded(seed), 1_000_000).game;
}
