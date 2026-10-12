// Mode « Tout dans l'app » : la partie de soirée (manches, croupier tournant, défis,
// classement) jouée avec le moteur de blackjack, des tas de jetons suivis et des défis
// validés automatiquement.

import { act, isBlackjack, isNatural, isWin, legalActions, newShoe, seatNet, startRound, type HandAction, type Legal } from './blackjack';
import { claimChallenge, kindOf, tableChallenges, type FillResult } from './challenges';
import { dealerAchieves, playerAchieves, type DetectContext } from './detect';
import { advance, createGame, endGame, finishSettling, type AdvanceEvent } from './game';
import { MAX_PLAYERS } from './names';
import { betFor } from './settings';
import type { BetRange, DealerMode, DealSummary, Game, Player, Rng, Settings, Virtual } from './types';

/** En banque automatique, il n'y a pas de croupier joueur : pas de défis croupier. */
export function virtualSettings(g: Game | null, s: Settings): Settings {
  return g?.virtual?.mode === 'banque' ? { ...s, dealerSlots: 0 } : s;
}

export function createVirtualGame(names: readonly string[], s: Settings, mode: DealerMode, rng: Rng, now: number = Date.now()): FillResult {
  const sv = mode === 'banque' ? { ...s, dealerSlots: 0 } : s;
  const r = createGame(names, sv, rng, now);
  const g = r.game;
  const min = betFor(s, 1).min;
  g.virtual = {
    mode,
    shoe: newShoe(s.table.decks, rng),
    chips: Object.fromEntries(g.players.map((p) => [p.id, s.startChips])),
    bets: Object.fromEntries(g.players.map((p) => [p.id, Math.min(min, s.startChips)])),
    ready: [],
    phase: 'mises',
    round: null,
    dealNo: 0,
    streak: {},
    bjRound: {},
    dealerLost: false,
    last: null,
  };
  // Pas de suspense à retourner les cartes : en virtuel, les défis sont posés face visible.
  g.flipped = g.current.slice();
  return { ...r, game: g };
}

/** Le joueur croupier du moment (croupier tournant), sinon null. */
export function dealerPlayer(g: Game): Player | null {
  return g.virtual?.mode === 'tournant' ? (g.players[g.dealer] ?? null) : null;
}

/** Joueurs qui misent à cette donne : tout le monde, sauf le croupier en mode tournant. */
export function seatedPlayers(g: Game): Player[] {
  const d = dealerPlayer(g);
  return g.players.filter((p) => p !== d);
}

export function chipsOf(g: Game, pid: string): number {
  return g.virtual?.chips[pid] ?? 0;
}

/** Mises permises pour un joueur : celles de la manche, sans dépasser son tas. */
export function betRange(g: Game, s: Settings, pid: string): BetRange {
  const range = betFor(s, g.round);
  const chips = chipsOf(g, pid);
  return { min: Math.max(1, Math.min(range.min, chips)), max: Math.max(1, Math.min(range.max, chips)) };
}

function clampBet(g: Game, s: Settings, pid: string, amount: number): number {
  const r = betRange(g, s, pid);
  const n = Number.isFinite(amount) ? Math.round(amount) : r.min;
  return Math.max(r.min, Math.min(r.max, n));
}

function withVirtual(game: Game, fn: (g: Game, v: Virtual) => void): Game {
  if (!game.virtual) return game;
  const g = structuredClone(game);
  if (g.virtual) fn(g, g.virtual);
  return g;
}

/** Choisit la mise d'un joueur pour la prochaine donne (bornée par la manche et son tas). */
export function chooseBet(game: Game, s: Settings, pid: string, amount: number): Game {
  if (game.virtual?.phase !== 'mises' || !seatedPlayers(game).some((p) => p.id === pid)) return game;
  return withVirtual(game, (g, v) => {
    v.bets[pid] = clampBet(g, s, pid, amount);
  });
}

/** Un ou plusieurs joueurs valident (ou retirent) leur mise. */
export function setReady(game: Game, pids: readonly string[], ready: boolean): Game {
  if (game.virtual?.phase !== 'mises') return game;
  return withVirtual(game, (g, v) => {
    const seated = new Set(seatedPlayers(g).map((p) => p.id));
    const set = new Set(v.ready);
    for (const pid of pids) if (seated.has(pid)) ready ? set.add(pid) : set.delete(pid);
    v.ready = g.players.filter((p) => set.has(p.id)).map((p) => p.id);
  });
}

export function allReady(g: Game): boolean {
  const v = g.virtual;
  return v !== null && v.phase === 'mises' && seatedPlayers(g).every((p) => v.ready.includes(p.id));
}

/** Distribue la donne avec les mises choisies. */
export function deal(game: Game, s: Settings, rng: Rng): Game {
  if (!allReady(game) || game.finished || game.settling) return game;
  let g = withVirtual(game, (x, v) => {
    const bets = seatedPlayers(x).map((p) => ({ pid: p.id, chips: v.chips[p.id] ?? 0, bet: clampBet(x, s, p.id, v.bets[p.id] ?? 0) }));
    v.round = startRound(v.shoe, s.table, bets, rng);
    v.shoe = v.round.shoe;
    v.phase = 'jeu';
    v.ready = [];
    v.dealNo += 1;
    v.last = null;
  });
  if (g.virtual?.round?.phase === 'terminee') g = resolve(g, s, rng);
  return g;
}

/** Joueur dont c'est le tour de jouer, ou null. */
export function turnPid(g: Game): string | null {
  const r = g.virtual?.round;
  if (g.virtual?.phase !== 'jeu' || !r?.turn) return null;
  return r.seats[r.turn.seat]?.pid ?? null;
}

export function legal(g: Game): Legal {
  const r = g.virtual?.round;
  return g.virtual?.phase === 'jeu' && r ? legalActions(r) : { tirer: false, rester: false, doubler: false, splitter: false };
}

/** Le joueur dont c'est le tour tire, reste, double ou splitte. */
export function play(game: Game, s: Settings, action: HandAction, rng: Rng): Game {
  const r0 = game.virtual?.round;
  if (game.virtual?.phase !== 'jeu' || !r0 || !legalActions(r0)[action]) return game;
  let g = withVirtual(game, (_x, v) => {
    if (!v.round) return;
    v.round = act(v.round, action, rng);
    v.shoe = v.round.shoe;
  });
  if (g.virtual?.round?.phase === 'terminee') g = resolve(g, s, rng);
  return g;
}

/** Fin de donne : paiements, blackjacks, séries, défis validés, recaves automatiques. */
function resolve(game: Game, s: Settings, rng: Rng): Game {
  let g = structuredClone(game);
  const v0 = g.virtual;
  const round = v0?.round;
  if (!v0 || !round) return game;
  const sv = virtualSettings(g, s);
  const sum: DealSummary = { before: { ...v0.chips }, nets: {}, claims: [], rebuys: [], blackjacks: [] };
  const byId = (pid: string) => g.players.find((p) => p.id === pid);

  let dealerNet = 0;
  for (const seat of round.seats) {
    const net = seatNet(seat);
    dealerNet -= net;
    v0.chips[seat.pid] = (v0.chips[seat.pid] ?? 0) + net;
    sum.nets[seat.pid] = net;
    for (const h of seat.hands) {
      if (isWin(h.outcome)) v0.streak[seat.pid] = (v0.streak[seat.pid] ?? 0) + 1;
      else if (h.outcome === 'perdu' || h.outcome === 'saute') v0.streak[seat.pid] = 0;
    }
    if (seat.hands.length === 1 && isBlackjack(seat.hands[0])) {
      sum.blackjacks.push(seat.pid);
    }
  }
  const dealer = dealerPlayer(g);
  if (dealer) {
    v0.chips[dealer.id] = (v0.chips[dealer.id] ?? 0) + dealerNet;
    sum.nets[dealer.id] = dealerNet;
    if (dealerNet < 0) v0.dealerLost = true;
    if (isNatural(round.dealer)) sum.blackjacks.push(dealer.id);
  }
  for (const pid of sum.blackjacks) {
    const p = byId(pid);
    if (p) p.bj += 1;
    v0.bjRound[pid] = (v0.bjRound[pid] ?? 0) + 1;
  }

  // Défis : chaque carte sur la table au moment de la donne va au premier joueur (dans l'ordre
  // de la table) qui l'a réussie ; sa remplaçante attend la donne suivante.
  const ctx: DetectContext = {
    round,
    betMax: betFor(s, g.round).max,
    streak: v0.streak,
    bjRound: v0.bjRound,
    dealerUnbeaten: dealer !== null && g.deal >= s.deals && !v0.dealerLost,
  };
  for (const c of tableChallenges(g, sv)) {
    if (!c.auto) continue;
    let winner: string | undefined;
    if (kindOf(c) === 'croupier') winner = dealer && dealerAchieves(c.auto, ctx) ? dealer.id : undefined;
    else winner = round.seats.find((seat) => c.auto !== undefined && playerAchieves(c.auto, seat, ctx))?.pid;
    if (!winner) continue;
    const res = claimVirtual(g, sv, c.id, winner, rng);
    if (!res.ok) continue;
    g = res.game;
    sum.claims.push({ pid: winner, cid: c.id, text: c.text, reward: c.reward });
  }

  const v = g.virtual;
  if (!v) return game;
  for (const p of g.players) {
    // Un tas à 0 (ou un croupier qui n'a pas pu payer toute la table) : recave automatique.
    while ((v.chips[p.id] ?? 0) <= 0) {
      v.chips[p.id] = (v.chips[p.id] ?? 0) + s.rebuyChips;
      p.rebuys += 1;
      sum.rebuys.push(p.id);
    }
  }
  for (const p of seatedPlayers(g)) v.bets[p.id] = clampBet(g, s, p.id, v.bets[p.id] ?? 0);
  v.phase = 'bilan';
  v.last = sum;
  return g;
}

export type VirtualClaim = { ok: false } | { ok: true; game: Game; reward: number; playerName: string };

/**
 * Défi gagné en mode virtuel (validé automatiquement ou réclamé à la main pour un défi
 * personnalisé) : les jetons vont directement sur le tas du joueur.
 */
export function claimVirtual(game: Game, s: Settings, cid: string, pid: string, rng: Rng): VirtualClaim {
  const r = claimChallenge(game, s, cid, pid, rng);
  if (!r.ok || !r.game.virtual) return { ok: false };
  const g = r.game;
  const v = r.game.virtual;
  const p = g.players.find((x) => x.id === pid);
  if (!p) return { ok: false };
  v.chips[pid] = (v.chips[pid] ?? 0) + r.reward;
  p.settled += r.reward;
  g.flipped = g.current.slice();
  return { ok: true, game: g, reward: r.reward, playerName: r.playerName };
}

export interface VirtualAdvance {
  game: Game;
  event: AdvanceEvent;
}

/** Après le bilan d'une donne : donne suivante, croupier suivant ou fin de manche. */
export function nextDeal(game: Game, s: Settings): VirtualAdvance | null {
  if (game.virtual?.phase !== 'bilan') return null;
  const r = advance(game, s);
  if (!r.label) return null;
  const g = withVirtual(r.game, (x, v) => {
    v.phase = 'mises';
    v.round = null;
    v.ready = [];
    if (r.event !== 'donne') v.dealerLost = false;
    for (const p of seatedPlayers(x)) v.bets[p.id] = clampBet(x, s, p.id, v.bets[p.id] ?? 0);
  });
  return { game: g, event: r.event };
}

/** Fin de manche : manche suivante, ou fin de partie avec le décompte fait par l'application. */
export function nextManche(game: Game, s: Settings, rng: Rng): { game: Game; finished: boolean } {
  const r = finishSettling(game, virtualSettings(game, s), rng);
  if (r.event === 'partie-terminee') return { game: finishVirtual(r.game), finished: true };
  const g = withVirtual(r.game, (x, v) => {
    v.bjRound = {};
    x.flipped = x.current.slice();
    for (const p of seatedPlayers(x)) v.bets[p.id] = clampBet(x, s, p.id, v.bets[p.id] ?? 0);
  });
  return { game: g, finished: false };
}

/**
 * Joueurs arrivés en cours de partie : ils s'assoient en bout de table au début d'une manche,
 * avec les jetons de départ. Refusé en pleine manche (la rotation du croupier serait faussée).
 */
export function addPlayers(game: Game, s: Settings, names: readonly string[], now: number = Date.now()): Game {
  const v = game.virtual;
  const startOfRound = game.deal === 1 && game.dealersDone === 0 && v?.phase === 'mises' && v.dealNo >= 0;
  if (!v || game.finished || game.settling || !startOfRound || names.length === 0) return game;
  return withVirtual(game, (g, vv) => {
    const taken = new Set(g.players.map((p) => p.name.toLocaleLowerCase('fr-FR')));
    for (const name of names) {
      const key = name.toLocaleLowerCase('fr-FR');
      if (!name || taken.has(key) || g.players.length >= MAX_PLAYERS) continue;
      taken.add(key);
      const id = 'p' + now.toString(36) + '_n' + g.players.length;
      g.players.push({ id, name, bonus: 0, rebuys: 0, bj: 0, settled: 0, final: null });
      vv.chips[id] = s.startChips;
      vv.bets[id] = clampBet(g, s, id, betFor(s, g.round).min);
    }
  });
}

/** Partie terminée : les tas comptent comme décompte final, pas de saisie. Une donne en cours est annulée. */
export function finishVirtual(game: Game): Game {
  const ended = game.finished ? game : endGame(game);
  return withVirtual(ended, (g, v) => {
    if (v.phase === 'jeu') v.round = null;
    for (const p of g.players) p.final = v.chips[p.id] ?? 0;
    g.revealed = true;
  });
}
