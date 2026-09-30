import { CHAMP_POINTS } from './defaults';
import type { Game, Night, Player, Settings } from './types';

/** Ce qui reste à régler avec la banque : gains de défis − malus de recave − déjà réglé. */
export function pending(p: Player, s: Settings): number {
  return p.bonus - p.rebuys * s.rebuyMalus - p.settled;
}

export interface SettleResult {
  game: Game;
  amount: number;
}

/** Le joueur a encaissé (ou payé) tout ce qu'il lui reste à régler. */
export function settlePlayer(game: Game, s: Settings, pid: string): SettleResult {
  const g = structuredClone(game);
  const p = g.players.find((x) => x.id === pid);
  if (!p) return { game, amount: 0 };
  const amount = pending(p, s);
  p.settled += amount;
  return { game: g, amount };
}

export function settleAll(game: Game, s: Settings): Game {
  const g = structuredClone(game);
  for (const p of g.players) p.settled += pending(p, s);
  return g;
}

/** Joueurs qui ont fait le plus de blackjacks (tous en cas d'égalité, personne si aucun). */
export function blackjackKings(players: readonly Player[]): { max: number; ids: string[] } {
  const max = players.reduce((m, p) => Math.max(m, p.bj), 0);
  return { max, ids: max > 0 ? players.filter((p) => p.bj === max).map((p) => p.id) : [] };
}

/**
 * Trie par score décroissant (clés comparées dans l'ordre) et attribue les places :
 * deux entrées aux clés identiques partagent la même place (1, 1, 3…).
 * Le tri est stable : à égalité, l'ordre d'origine est conservé.
 */
export function rankWithTies<T>(items: readonly T[], keys: (t: T) => number[]): Array<T & { place: number }> {
  const withKeys = items.map((item, i) => ({ item, k: keys(item), i }));
  withKeys.sort((a, b) => {
    for (let j = 0; j < a.k.length; j++) if (b.k[j] !== a.k[j]) return b.k[j] - a.k[j];
    return a.i - b.i;
  });
  let place = 0;
  return withKeys.map((w, idx) => {
    const prev = withKeys[idx - 1];
    if (!prev || prev.k.some((v, j) => v !== w.k[j])) place = idx + 1;
    return { ...w.item, place };
  });
}

export interface ScoreRow {
  id: string;
  name: string;
  place: number;
  score: number;
  chips: number | null;
  unsettled: number;
  bjBonus: number;
  bonus: number;
  malus: number;
  rebuys: number;
  bj: number;
}

function baseRows(g: Game, s: Settings): Omit<ScoreRow, 'place' | 'score'>[] {
  const kings = blackjackKings(g.players).ids;
  return g.players.map((p) => ({
    id: p.id,
    name: p.name,
    chips: p.final,
    unsettled: pending(p, s),
    bjBonus: kings.includes(p.id) ? s.bonusBJ : 0,
    bonus: p.bonus,
    malus: p.rebuys * s.rebuyMalus,
    rebuys: p.rebuys,
    bj: p.bj,
  }));
}

/**
 * Classement en direct (on ne compte pas les jetons en cours de partie) :
 * gains de défis − malus de recave + bonus du roi du blackjack attribué maintenant.
 */
export function liveRanking(g: Game, s: Settings): ScoreRow[] {
  const rows = baseRows(g, s).map((r) => ({ ...r, score: r.bonus - r.malus + r.bjBonus }));
  return rankWithTies(rows, (r) => [r.score]);
}

/** Classement final : jetons comptés + ce qui n'a pas été réglé + bonus de fin. */
export function finalRanking(g: Game, s: Settings): ScoreRow[] {
  const rows = baseRows(g, s).map((r) => ({ ...r, score: (r.chips ?? 0) + r.unsettled + r.bjBonus }));
  return rankWithTies(rows, (r) => [r.score]);
}

export function championshipPoints(place: number): number {
  return CHAMP_POINTS[place - 1] ?? 0;
}

export function buildNight(g: Game, s: Settings, id: string, dateIso: string): Night {
  return {
    id,
    date: dateIso,
    results: finalRanking(g, s).map((r) => ({ name: r.name, place: r.place, score: r.score, pts: championshipPoints(r.place) })),
  };
}

export interface Standing {
  key: string;
  name: string;
  pts: number;
  nights: number;
  wins: number;
  place: number;
}

export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('fr-FR');
}

/** Classement général : points cumulés, départagés par le nombre de victoires. Noms insensibles à la casse. */
export function championshipStandings(nights: readonly Night[]): Standing[] {
  const map = new Map<string, Omit<Standing, 'place'>>();
  for (const n of nights) {
    for (const r of n.results) {
      const key = nameKey(r.name);
      const cur = map.get(key) ?? { key, name: r.name.trim(), pts: 0, nights: 0, wins: 0 };
      cur.name = r.name.trim();
      cur.pts += r.pts;
      cur.nights += 1;
      if (r.place === 1) cur.wins += 1;
      map.set(key, cur);
    }
  }
  return rankWithTies([...map.values()], (r) => [r.pts, r.wins]);
}
