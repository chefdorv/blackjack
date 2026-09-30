import { fillChallenges, type FillResult } from './challenges';
import type { ChallengeKind, Game, Player, Rng, Settings } from './types';

export function createGame(names: readonly string[], s: Settings, rng: Rng, now: number = Date.now()): FillResult {
  const g: Game = {
    id: 'g' + now.toString(36),
    startedAt: now,
    startChips: s.startChips,
    players: names.map((name, i) => ({
      id: 'p' + now.toString(36) + '_' + i,
      name,
      bonus: 0,
      rebuys: 0,
      bj: 0,
      settled: 0,
      final: null,
    })),
    round: 1,
    deal: 1,
    dealer: 0,
    dealersDone: 0,
    drawn: [],
    current: [],
    flipped: [],
    fresh: [],
    claims: [],
    settling: null,
    finished: false,
    revealed: false,
    savedNightId: null,
  };
  return fillChallenges(g, s, rng);
}

export interface TurnInfo {
  dealer: Player;
  next: Player;
  isLastDeal: boolean;
  isLastDealer: boolean;
  isLastRound: boolean;
  /** Donnes restantes pour ce croupier après la donne en cours. */
  dealsLeftAfter: number;
  nextLabel: string;
  dealerLine: string;
}

export function turnInfo(g: Game, s: Settings): TurnInfo {
  const n = g.players.length;
  const dealer = g.players[g.dealer];
  const next = g.players[(g.dealer + 1) % n];
  const isLastDeal = g.deal >= s.deals;
  const isLastDealer = g.dealersDone >= n - 1;
  const isLastRound = g.round >= s.rounds;
  const dealsLeftAfter = Math.max(0, s.deals - g.deal);

  let nextLabel = 'Donne suivante';
  if (isLastDeal && isLastDealer) nextLabel = 'Fin de manche : on règle les comptes';
  else if (isLastDeal) nextLabel = 'Croupier suivant : ' + next.name;

  const then = isLastDealer ? 'puis la manche se termine.' : 'puis la main passe à ' + next.name + '.';
  let dealerLine: string;
  if (isLastDeal) dealerLine = isLastDealer ? 'Dernière donne de la manche.' : 'Dernière donne, ensuite la main passe à ' + next.name + '.';
  else dealerLine = 'Encore ' + dealsLeftAfter + ' donne' + (dealsLeftAfter > 1 ? 's' : '') + ' après celle-ci, ' + then;

  return { dealer, next, isLastDeal, isLastDealer, isLastRound, dealsLeftAfter, nextLabel, dealerLine };
}

export type AdvanceEvent = 'donne' | 'croupier' | 'fin-de-manche';

export interface AdvanceResult {
  game: Game;
  event: AdvanceEvent;
  /** Libellé de l'action pour l'historique d'annulation. */
  label: string;
}

/**
 * Bouton « Donne suivante » : passe à la donne suivante, ou au croupier suivant
 * (joueur suivant dans l'ordre de la table) après sa dernière donne.
 * Quand tout le monde a été croupier, la manche se termine et le règlement commence.
 */
export function advance(game: Game, s: Settings): AdvanceResult {
  const g = structuredClone(game);
  if (g.finished || g.settling) return { game, event: 'donne', label: '' };
  if (g.deal < s.deals) {
    g.deal++;
    return { game: g, event: 'donne', label: 'Donne suivante' };
  }
  const n = g.players.length;
  const out = g.players[g.dealer];
  g.deal = 1;
  g.dealersDone++;
  g.dealer = (g.dealer + 1) % n;
  const label = 'Fin des donnes de ' + out.name;
  if (g.dealersDone >= n) {
    g.dealersDone = 0;
    g.settling = { round: g.round };
    return { game: g, event: 'fin-de-manche', label };
  }
  return { game: g, event: 'croupier', label };
}

export interface FinishSettlingResult {
  game: Game;
  event: 'manche-suivante' | 'partie-terminee';
  empty: ChallengeKind[];
}

/** Bouton « Lancer la manche N » ou « Passer au décompte final ». */
export function finishSettling(game: Game, s: Settings, rng: Rng): FinishSettlingResult {
  const g = structuredClone(game);
  g.settling = null;
  if (g.round >= s.rounds) {
    g.finished = true;
    g.revealed = false;
    return { game: g, event: 'partie-terminee', empty: [] };
  }
  g.round++;
  const filled = fillChallenges(g, s, rng);
  return { game: filled.game, event: 'manche-suivante', empty: filled.empty };
}

/** « Terminer la partie maintenant » : on saute directement au décompte. */
export function endGame(game: Game): Game {
  return { ...structuredClone(game), finished: true, revealed: false, settling: null };
}

function withPlayer(game: Game, pid: string, fn: (p: Player) => void): Game {
  const g = structuredClone(game);
  const p = g.players.find((x) => x.id === pid);
  if (p) fn(p);
  return g;
}

export function addBlackjack(game: Game, pid: string): Game {
  return withPlayer(game, pid, (p) => {
    p.bj += 1;
  });
}

export function addRebuy(game: Game, pid: string): Game {
  return withPlayer(game, pid, (p) => {
    p.rebuys += 1;
  });
}

export type Correctable = 'bj' | 'rebuys' | 'bonus';

export function adjustPlayer(game: Game, pid: string, field: Correctable, delta: number): Game {
  return withPlayer(game, pid, (p) => {
    p[field] = Math.max(0, p[field] + delta);
  });
}

export function setFinalCount(game: Game, pid: string, value: number | null): Game {
  return withPlayer(game, pid, (p) => {
    p.final = value === null ? null : Math.max(0, Math.round(value));
  });
}

export function allCounted(g: Game): boolean {
  return g.players.every((p) => p.final !== null);
}
