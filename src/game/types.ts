// Types partagés par toute la logique de jeu. Aucune dépendance à l'interface.

export type Level = 'facile' | 'moyen' | 'difficile' | 'legendaire' | 'croupier';

/** Un défi est soit ouvert à tous les joueurs, soit réservé au croupier en cours. */
export type ChallengeKind = 'joueur' | 'croupier';

export interface Challenge {
  id: string;
  level: Level;
  reward: number;
  text: string;
}

export interface BetRange {
  min: number;
  max: number;
}

export interface Settings {
  startChips: number;
  rounds: number;
  deals: number;
  playerSlots: number;
  dealerSlots: number;
  rebuyChips: number;
  rebuyMalus: number;
  bonusBJ: number;
  bets: BetRange[];
  challenges: Challenge[];
}

export type NumericSettingKey =
  | 'startChips'
  | 'rounds'
  | 'deals'
  | 'playerSlots'
  | 'dealerSlots'
  | 'rebuyChips'
  | 'rebuyMalus'
  | 'bonusBJ';

export interface Player {
  id: string;
  name: string;
  /** Total des jetons gagnés avec les défis. */
  bonus: number;
  rebuys: number;
  bj: number;
  /** Ce qui a déjà été réglé avec la banque (positif = encaissé, négatif = remboursé). */
  settled: number;
  /** Jetons comptés sur la table au décompte final (null = pas encore compté). */
  final: number | null;
}

export interface ClaimRecord {
  cid: string;
  pid: string;
  name: string;
  text: string;
  level: Level;
  reward: number;
  round: number;
}

export interface Game {
  id: string;
  startedAt: number;
  startChips: number;
  players: Player[];
  round: number;
  deal: number;
  /** Index du croupier en cours dans `players`. */
  dealer: number;
  /** Nombre de croupiers qui ont fini leurs donnes dans la manche en cours. */
  dealersDone: number;
  /** Tous les défis déjà sortis de la pioche pendant la partie. */
  drawn: string[];
  /** Défis actuellement sur la table. */
  current: string[];
  flipped: string[];
  /** Défis tirés au dernier tirage (pour l'animation de distribution). */
  fresh: string[];
  claims: ClaimRecord[];
  settling: { round: number } | null;
  finished: boolean;
  revealed: boolean;
  savedNightId: string | null;
}

export interface HistoryEntry {
  label: string;
  game: Game;
}

export interface NightResult {
  name: string;
  place: number;
  score: number;
  pts: number;
}

export interface Night {
  id: string;
  date: string;
  results: NightResult[];
}

export interface Championship {
  nights: Night[];
}

/** Générateur aléatoire injecté (Math.random par défaut) pour rendre les tirages testables. */
export type Rng = () => number;
