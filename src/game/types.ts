// Types partagés par toute la logique de jeu. Aucune dépendance à l'interface.
import type { Round, Shoe, TableRules } from './blackjack';

export type Level = 'facile' | 'moyen' | 'difficile' | 'legendaire' | 'croupier';

/** Un défi est soit ouvert à tous les joueurs, soit réservé au croupier en cours. */
export type ChallengeKind = 'joueur' | 'croupier';

/**
 * Défis que l'application sait valider seule en mode « Tout dans l'app ».
 * Un défi sans clé (ajouté ou réécrit dans les réglages) se réclame à la main.
 */
export const AUTO_KEYS = [
  'double-gagne',
  'gagne-4-cartes',
  'bat-as',
  'gagne-20',
  'tire-16',
  'blackjack',
  'reste-12-gagne',
  'double-9-gagne',
  'serie-3',
  'gagne-5-cartes',
  'split-2-gagnees',
  '21-3-cartes',
  '21-4-cartes',
  'split-as-bj',
  'paire-couleur-gagne',
  '2-bj-manche',
  '21-5-cartes',
  'gagne-6-cartes',
  '21-6-cartes',
  '777',
  'croupier-bat-tous',
  'croupier-21-3-cartes',
  'croupier-bj-max',
  'croupier-invaincu',
] as const;
export type AutoKey = (typeof AUTO_KEYS)[number];

export interface Challenge {
  id: string;
  level: Level;
  reward: number;
  text: string;
  auto?: AutoKey;
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
  /** Règles de la table pour le mode « Tout dans l'app ». */
  table: TableRules;
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
  /** Mode « Tout dans l'app » : cartes et jetons virtuels. null avec de vraies cartes. */
  virtual: Virtual | null;
}

/** Qui tient la banque en mode virtuel : le joueur croupier du moment, ou l'application. */
export type DealerMode = 'tournant' | 'banque';

export interface DealClaim {
  pid: string;
  cid: string;
  text: string;
  reward: number;
}

/** Ce qui s'est passé à la dernière donne, pour l'affichage. */
export interface DealSummary {
  /** Tas de chacun avant la donne (pour l'animation des tas). */
  before: Record<string, number>;
  /** Gain net de chaque joueur (croupier tournant compris). */
  nets: Record<string, number>;
  claims: DealClaim[];
  /** Joueurs recavés automatiquement, autant de fois qu'ils apparaissent. */
  rebuys: string[];
  blackjacks: string[];
}

export interface Virtual {
  mode: DealerMode;
  shoe: Shoe;
  /** Tas de jetons de chaque joueur. */
  chips: Record<string, number>;
  /** Mise choisie pour la prochaine donne. */
  bets: Record<string, number>;
  /** Joueurs qui ont validé leur mise. */
  ready: string[];
  phase: 'mises' | 'jeu' | 'bilan';
  /** Donne en cours, ou dernière donne jouée (phase « bilan »). */
  round: Round | null;
  /** Numéro de la donne depuis le début de la partie (sert à rejouer les animations une seule fois). */
  dealNo: number;
  /** Mains gagnées d'affilée par joueur (une égalité ne casse pas la série). */
  streak: Record<string, number>;
  /** Blackjacks de chaque joueur dans la manche en cours. */
  bjRound: Record<string, number>;
  /** Le croupier en cours a perdu au moins une donne. */
  dealerLost: boolean;
  last: DealSummary | null;
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
