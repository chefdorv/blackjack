// Tout ce qu'un joueur peut demander pendant une partie virtuelle, sous forme de messages.
// Sur un seul appareil, l'application les applique directement ; à plusieurs téléphones,
// les invités les envoient au téléphone hôte, qui les vérifie et les applique.

import type { HandAction } from './blackjack';
import type { Game, Rng, Settings } from './types';
import { allReady, chooseBet, claimVirtual, deal, nextDeal, nextManche, play, setReady, turnPid, virtualSettings } from './virtual';

export type Intent =
  | { t: 'bet'; pid: string; amount: number }
  | { t: 'ready'; pids: string[]; ready: boolean }
  | { t: 'play'; pid: string; action: HandAction }
  | { t: 'next' }
  | { t: 'manche' }
  | { t: 'claim'; cid: string; pid: string };

export type IntentEvent =
  | { e: 'donne' }
  | { e: 'resultat' }
  | { e: 'croupier'; name: string }
  | { e: 'fin-de-manche'; round: number }
  | { e: 'manche'; round: number }
  | { e: 'fin-de-partie' }
  | { e: 'defi'; name: string; reward: number };

export interface IntentResult {
  game: Game;
  events: IntentEvent[];
}

const HAND_ACTIONS: readonly HandAction[] = ['tirer', 'rester', 'doubler', 'splitter'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Relit un message reçu du réseau ; null s'il est mal formé. */
export function parseIntent(v: unknown): Intent | null {
  if (!isObj(v)) return null;
  switch (v.t) {
    case 'bet':
      return typeof v.pid === 'string' && typeof v.amount === 'number' && Number.isFinite(v.amount) ? { t: 'bet', pid: v.pid, amount: v.amount } : null;
    case 'ready':
      return Array.isArray(v.pids) && v.pids.every((p) => typeof p === 'string') && typeof v.ready === 'boolean'
        ? { t: 'ready', pids: v.pids.slice(0, 8) as string[], ready: v.ready }
        : null;
    case 'play': {
      const action = HAND_ACTIONS.find((a) => a === v.action);
      return typeof v.pid === 'string' && action ? { t: 'play', pid: v.pid, action } : null;
    }
    case 'next':
      return { t: 'next' };
    case 'manche':
      return { t: 'manche' };
    case 'claim':
      return typeof v.cid === 'string' && typeof v.pid === 'string' ? { t: 'claim', cid: v.cid, pid: v.pid } : null;
    default:
      return null;
  }
}

/**
 * Applique une intention. `allowed` = joueurs que l'appareil émetteur a le droit de faire
 * jouer (null = tous, sur un seul appareil). Une intention refusée renvoie la partie inchangée.
 */
export function applyIntent(game: Game, s: Settings, intent: Intent, rng: Rng, allowed: readonly string[] | null = null): IntentResult {
  const same = { game, events: [] };
  const v = game.virtual;
  if (!v || game.finished) return same;
  const may = (pid: string) => allowed === null || allowed.includes(pid);
  const events: IntentEvent[] = [];
  const claimsBefore = game.claims.length;
  let g = game;

  switch (intent.t) {
    case 'bet':
      if (!may(intent.pid)) return same;
      g = chooseBet(game, s, intent.pid, intent.amount);
      break;
    case 'ready': {
      const pids = intent.pids.filter(may);
      if (pids.length === 0) return same;
      g = setReady(game, pids, intent.ready);
      if (allReady(g)) {
        g = deal(g, s, rng);
        events.push({ e: 'donne' });
        if (g.virtual?.phase === 'bilan') events.push({ e: 'resultat' });
      }
      break;
    }
    case 'play': {
      if (!may(intent.pid) || turnPid(game) !== intent.pid) return same;
      g = play(game, s, intent.action, rng);
      if (g !== game && g.virtual?.phase === 'bilan') events.push({ e: 'resultat' });
      break;
    }
    case 'next': {
      if (game.settling) return same;
      const r = nextDeal(game, s);
      if (!r) return same;
      g = r.game;
      if (r.event === 'croupier' && g.virtual?.mode === 'tournant') events.push({ e: 'croupier', name: g.players[g.dealer].name });
      if (r.event === 'fin-de-manche') events.push({ e: 'fin-de-manche', round: game.round });
      break;
    }
    case 'manche': {
      if (!game.settling) return same;
      const r = nextManche(game, s, rng);
      g = r.game;
      events.push(r.finished ? { e: 'fin-de-partie' } : { e: 'manche', round: g.round });
      break;
    }
    case 'claim': {
      if (!may(intent.pid)) return same;
      const c = s.challenges.find((x) => x.id === intent.cid);
      // Les défis que l'application sait vérifier ne se réclament pas à la main.
      if (!c || c.auto) return same;
      const r = claimVirtual(game, virtualSettings(game, s), intent.cid, intent.pid, rng);
      if (!r.ok) return same;
      g = r.game;
      break;
    }
  }
  for (const c of g.claims.slice(claimsBefore)) events.push({ e: 'defi', name: c.name, reward: c.reward });
  return { game: g, events };
}
