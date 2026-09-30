import type { Challenge, ChallengeKind, Game, Rng, Settings } from './types';

export function kindOf(c: Challenge): ChallengeKind {
  return c.level === 'croupier' ? 'croupier' : 'joueur';
}

export function slotsFor(s: Settings, kind: ChallengeKind): number {
  return kind === 'croupier' ? s.dealerSlots : s.playerSlots;
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Défis encore dans la pioche (jamais sortis pendant la partie), par type. */
export function poolRemaining(g: Game, s: Settings): Record<ChallengeKind, number> {
  const out: Record<ChallengeKind, number> = { joueur: 0, croupier: 0 };
  for (const c of s.challenges) if (!g.drawn.includes(c.id)) out[kindOf(c)]++;
  return out;
}

/** Défis actuellement sur la table, dans l'ordre d'affichage (défis joueurs puis croupier). */
export function tableChallenges(g: Game, s: Settings): Challenge[] {
  const byId = new Map(s.challenges.map((c) => [c.id, c]));
  const list = g.current.flatMap((id) => {
    const c = byId.get(id);
    return c ? [c] : [];
  });
  return list.filter((c) => kindOf(c) === 'joueur').concat(list.filter((c) => kindOf(c) === 'croupier'));
}

export function unflippedCount(g: Game, s: Settings): number {
  if (g.finished) return 0;
  return tableChallenges(g, s).filter((c) => !g.flipped.includes(c.id)).length;
}

export interface FillResult {
  game: Game;
  /** Défis tirés pendant ce remplissage. */
  drawn: string[];
  /** Types pour lesquels il manque des cartes sur la table et la pioche est vide. */
  empty: ChallengeKind[];
}

/**
 * Complète la table jusqu'au nombre de défis joueurs et croupier demandé,
 * en tirant uniquement parmi les défis jamais sortis. Ne retire jamais une carte en trop.
 */
export function fillChallenges(game: Game, s: Settings, rng: Rng): FillResult {
  const g = structuredClone(game);
  const byId = new Map(s.challenges.map((c) => [c.id, c]));
  g.current = g.current.filter((id) => byId.has(id));
  g.flipped = g.flipped.filter((id) => g.current.includes(id));
  const picked: string[] = [];
  const empty: ChallengeKind[] = [];
  for (const kind of ['joueur', 'croupier'] as const) {
    const onTable = g.current.filter((id) => {
      const c = byId.get(id);
      return c !== undefined && kindOf(c) === kind;
    }).length;
    const need = Math.max(0, slotsFor(s, kind) - onTable);
    if (need === 0) continue;
    const pool = s.challenges.filter((c) => kindOf(c) === kind && !g.drawn.includes(c.id));
    const pick = shuffle(pool, rng).slice(0, need).map((c) => c.id);
    if (pick.length < need) empty.push(kind);
    picked.push(...pick);
  }
  g.drawn = g.drawn.concat(picked);
  g.current = g.current.concat(picked);
  g.fresh = picked;
  return { game: g, drawn: picked, empty };
}

export function canClaim(g: Game, c: Challenge, playerIndex: number): boolean {
  if (playerIndex < 0 || playerIndex >= g.players.length) return false;
  return kindOf(c) === 'joueur' || playerIndex === g.dealer;
}

export type ClaimResult =
  | { ok: false; reason: 'absent' | 'joueur-inconnu' | 'reserve-croupier' }
  | {
      ok: true;
      game: Game;
      reward: number;
      playerName: string;
      kind: ChallengeKind;
      replacement: string | null;
    };

/**
 * Un joueur réclame un défi : il gagne le montant, la carte quitte la table
 * et une nouvelle carte du même type est tirée (si la pioche le permet).
 */
export function claimChallenge(game: Game, s: Settings, cid: string, pid: string, rng: Rng): ClaimResult {
  const c = s.challenges.find((x) => x.id === cid);
  if (!c || !game.current.includes(cid)) return { ok: false, reason: 'absent' };
  const idx = game.players.findIndex((p) => p.id === pid);
  if (idx < 0) return { ok: false, reason: 'joueur-inconnu' };
  if (!canClaim(game, c, idx)) return { ok: false, reason: 'reserve-croupier' };

  const g = structuredClone(game);
  const p = g.players[idx];
  p.bonus += c.reward;
  g.current = g.current.filter((x) => x !== cid);
  g.flipped = g.flipped.filter((x) => x !== cid);
  g.claims.push({ cid, pid, name: p.name, text: c.text, level: c.level, reward: c.reward, round: g.round });
  const filled = fillChallenges(g, s, rng);
  const kind = kindOf(c);
  const replacement = filled.drawn.find((id) => {
    const x = s.challenges.find((y) => y.id === id);
    return x !== undefined && kindOf(x) === kind;
  });
  return { ok: true, game: filled.game, reward: c.reward, playerName: p.name, kind, replacement: replacement ?? null };
}

export function flipCard(game: Game, cid: string): Game {
  if (!game.current.includes(cid) || game.flipped.includes(cid)) return game;
  return { ...game, flipped: game.flipped.concat(cid) };
}

export function flipAll(game: Game): Game {
  return { ...game, flipped: game.current.slice() };
}
