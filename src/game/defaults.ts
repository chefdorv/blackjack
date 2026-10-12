import { defaultTableRules } from './blackjack';
import type { AutoKey, Challenge, Level, Settings } from './types';

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

const DEFAULT_LIST: ReadonlyArray<readonly [Level, number, string, AutoKey]> = [
  ['facile', 5, 'Gagner une main après avoir doublé.', 'double-gagne'],
  ['facile', 5, 'Gagner une main avec 4 cartes.', 'gagne-4-cartes'],
  ['facile', 5, 'Battre un croupier qui montre un As.', 'bat-as'],
  ['facile', 5, 'Gagner une main avec exactement 20.', 'gagne-20'],
  ['facile', 5, 'Tirer sur 16 et ne pas sauter.', 'tire-16'],
  ['moyen', 10, 'Faire un blackjack.', 'blackjack'],
  ['moyen', 10, 'Rester à 12 ou moins et gagner.', 'reste-12-gagne'],
  ['moyen', 10, 'Gagner en doublant sur 9 ou moins.', 'double-9-gagne'],
  ['moyen', 15, "Gagner 3 mains d'affilée.", 'serie-3'],
  ['moyen', 15, 'Gagner une main avec 5 cartes sans sauter.', 'gagne-5-cartes'],
  ['moyen', 15, 'Splitter et gagner les deux mains.', 'split-2-gagnees'],
  ['moyen', 15, 'Faire 21 avec 3 cartes.', '21-3-cartes'],
  ['difficile', 20, 'Faire 21 avec 4 cartes.', '21-4-cartes'],
  ['difficile', 20, 'Splitter des As et faire au moins un blackjack.', 'split-as-bj'],
  ['difficile', 20, 'Avoir une paire de départ de la même couleur (ex. 8♥ 8♦) et gagner.', 'paire-couleur-gagne'],
  ['difficile', 25, 'Faire deux blackjacks dans la même manche.', '2-bj-manche'],
  ['difficile', 30, 'Faire 21 avec 5 cartes.', '21-5-cartes'],
  ['difficile', 30, 'Gagner une main avec 6 cartes sans sauter.', 'gagne-6-cartes'],
  ['legendaire', 40, 'Faire 21 avec 6 cartes.', '21-6-cartes'],
  ['legendaire', 75, 'Faire 7-7-7.', '777'],
  ['croupier', 10, 'Battre tous les joueurs sur une même donne.', 'croupier-bat-tous'],
  ['croupier', 10, 'Faire 21 avec 3 cartes ou plus en tant que croupier.', 'croupier-21-3-cartes'],
  ['croupier', 20, 'Faire blackjack contre une table où tout le monde a misé le max.', 'croupier-bj-max'],
  ['croupier', 40, 'Ne perdre aucune donne sur tes 5 donnes de croupier.', 'croupier-invaincu'],
];

export function defaultChallenges(): Challenge[] {
  return DEFAULT_LIST.map(([level, reward, text, auto], i) => ({ id: 'c' + (i + 1), level, reward, text, auto }));
}

/**
 * Clé de validation automatique d'un défi d'origine, retrouvée par son identifiant et son texte
 * (réglages sauvegardés avant l'existence du mode virtuel). Un texte réécrit n'en a plus.
 */
export function defaultAutoKey(id: string, text: string): AutoKey | undefined {
  const i = Number(id.slice(1)) - 1;
  const d = id.startsWith('c') ? DEFAULT_LIST[i] : undefined;
  return d && d[2] === text ? d[3] : undefined;
}

export function defaultSettings(): Settings {
  return {
    startChips: 100,
    rounds: 3,
    deals: 3,
    bankDeals: 5,
    playerSlots: 3,
    dealerSlots: 1,
    rebuyChips: 30,
    rebuyMalus: 50,
    bonusBJ: 10,
    bets: [
      { min: 5, max: 10 },
      { min: 10, max: 20 },
      { min: 15, max: 30 },
    ],
    challenges: defaultChallenges(),
    table: defaultTableRules(),
  };
}
