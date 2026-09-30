import type { Challenge, Level, Settings } from './types';

export interface LevelDef {
  key: Level;
  label: string;
  color: string;
}

export const LEVELS: readonly LevelDef[] = [
  { key: 'facile', label: 'Facile', color: 'vert' },
  { key: 'moyen', label: 'Moyen', color: 'jaune' },
  { key: 'difficile', label: 'Difficile', color: 'orange' },
  { key: 'legendaire', label: 'Légendaire', color: 'rouge' },
  { key: 'croupier', label: 'Défi croupier', color: 'violet' },
];

export function levelLabel(level: Level): string {
  return LEVELS.find((l) => l.key === level)?.label ?? level;
}

export function isLevel(v: unknown): v is Level {
  return LEVELS.some((l) => l.key === v);
}

/** Points de championnat selon la place (1re, 2e, ...). Au-delà : 0. */
export const CHAMP_POINTS: readonly number[] = [10, 7, 5, 3, 1];

const DEFAULT_LIST: ReadonlyArray<readonly [Level, number, string]> = [
  ['facile', 5, 'Gagner une main après avoir doublé.'],
  ['facile', 5, 'Gagner une main avec 4 cartes.'],
  ['facile', 5, 'Battre un croupier qui montre un As.'],
  ['facile', 5, 'Gagner une main avec exactement 20.'],
  ['facile', 5, 'Tirer sur 16 et ne pas sauter.'],
  ['moyen', 10, 'Faire un blackjack.'],
  ['moyen', 10, 'Rester à 12 ou moins et gagner.'],
  ['moyen', 10, 'Gagner en doublant sur 9 ou moins.'],
  ['moyen', 15, "Gagner 3 mains d'affilée."],
  ['moyen', 15, 'Gagner une main avec 5 cartes sans sauter.'],
  ['moyen', 15, 'Splitter et gagner les deux mains.'],
  ['moyen', 15, 'Faire 21 avec 3 cartes.'],
  ['difficile', 20, 'Faire 21 avec 4 cartes.'],
  ['difficile', 20, 'Splitter des As et faire au moins un blackjack.'],
  ['difficile', 20, 'Avoir une paire de départ de la même couleur (ex. 8♥ 8♦) et gagner.'],
  ['difficile', 25, 'Faire deux blackjacks dans la même manche.'],
  ['difficile', 30, 'Faire 21 avec 5 cartes.'],
  ['difficile', 30, 'Gagner une main avec 6 cartes sans sauter.'],
  ['legendaire', 40, 'Faire 21 avec 6 cartes.'],
  ['legendaire', 75, 'Faire 7-7-7.'],
  ['croupier', 10, 'Battre tous les joueurs sur une même donne.'],
  ['croupier', 10, 'Faire 21 avec 3 cartes ou plus en tant que croupier.'],
  ['croupier', 20, 'Faire blackjack contre une table où tout le monde a misé le max.'],
  ['croupier', 40, 'Ne perdre aucune donne sur tes 5 donnes de croupier.'],
];

export function defaultChallenges(): Challenge[] {
  return DEFAULT_LIST.map(([level, reward, text], i) => ({ id: 'c' + (i + 1), level, reward, text }));
}

export function defaultSettings(): Settings {
  return {
    startChips: 100,
    rounds: 3,
    deals: 5,
    playerSlots: 3,
    dealerSlots: 1,
    rebuyChips: 30,
    rebuyMalus: 50,
    bonusBJ: 10,
    bets: [
      { min: 2, max: 10 },
      { min: 4, max: 20 },
      { min: 6, max: 30 },
    ],
    challenges: defaultChallenges(),
  };
}
