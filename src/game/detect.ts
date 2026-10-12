// Validation automatique des défis à partir d'une donne jouée en mode virtuel.
import { handValue, isBlackjack, isNatural, isRed, isWin, rankOf, type Hand, type Round, type Seat } from './blackjack';
import type { AutoKey } from './types';

export interface DetectContext {
  round: Round;
  /** Mise max de la manche (défi « tout le monde a misé le max »). */
  betMax: number;
  /** Mains gagnées d'affilée, donne comprise. */
  streak: Record<string, number>;
  /** Blackjacks de la manche, donne comprise. */
  bjRound: Record<string, number>;
  /** Dernière donne du croupier en cours, sans en avoir perdu une seule. */
  dealerUnbeaten: boolean;
}

const total = (h: Hand) => handValue(h.cards).total;
const won = (h: Hand) => isWin(h.outcome);
const lost = (h: Hand) => h.outcome === 'perdu' || h.outcome === 'saute';
const twentyOne = (n: number) => (h: Hand) => h.cards.length === n && total(h) === 21;
const winWith = (n: number) => (h: Hand) => h.cards.length === n && won(h);

/** Le joueur assis à `seat` a-t-il réussi ce défi pendant la donne ? */
export function playerAchieves(key: AutoKey, seat: Seat, ctx: DetectContext): boolean {
  const any = (f: (h: Hand) => boolean) => seat.hands.some(f);
  const [a, b] = seat.start;
  switch (key) {
    case 'double-gagne':
      return any((h) => h.doubled && won(h));
    case 'gagne-4-cartes':
      return any(winWith(4));
    case 'gagne-5-cartes':
      return any(winWith(5));
    case 'gagne-6-cartes':
      return any(winWith(6));
    case 'bat-as':
      return rankOf(ctx.round.dealer[0]) === 'A' && any(won);
    case 'gagne-20':
      return any((h) => total(h) === 20 && won(h));
    case 'tire-16':
      return any((h) => h.moves.some((m) => m.action === 'tirer' && m.before === 16 && m.after <= 21));
    case 'blackjack':
      return any(isBlackjack);
    case 'reste-12-gagne':
      return any((h) => total(h) <= 12 && won(h));
    case 'double-9-gagne':
      return any((h) => won(h) && h.moves.some((m) => m.action === 'doubler' && m.before <= 9));
    case 'serie-3':
      return (ctx.streak[seat.pid] ?? 0) >= 3;
    case 'split-2-gagnees':
      return seat.hands.length === 2 && seat.hands.every(won);
    case '21-3-cartes':
      return any(twentyOne(3));
    case '21-4-cartes':
      return any(twentyOne(4));
    case '21-5-cartes':
      return any(twentyOne(5));
    case '21-6-cartes':
      return any(twentyOne(6));
    case 'split-as-bj':
      return seat.hands.length === 2 && seat.start.every((c) => rankOf(c) === 'A') && any((h) => isNatural(h.cards));
    case 'paire-couleur-gagne':
      return a !== undefined && b !== undefined && rankOf(a) === rankOf(b) && isRed(a) === isRed(b) && any(won);
    case '2-bj-manche':
      return (ctx.bjRound[seat.pid] ?? 0) >= 2;
    case '777':
      return any((h) => h.cards.length === 3 && h.cards.every((c) => rankOf(c) === '7'));
    default:
      return false;
  }
}

/** Le croupier (joueur en mode croupier tournant) a-t-il réussi ce défi ? */
export function dealerAchieves(key: AutoKey, ctx: DetectContext): boolean {
  const { round: r } = ctx;
  switch (key) {
    case 'croupier-bat-tous':
      return r.seats.length > 0 && r.seats.every((s) => s.hands.every(lost));
    case 'croupier-21-3-cartes':
      return r.dealer.length >= 3 && handValue(r.dealer).total === 21;
    case 'croupier-bj-max':
      return isNatural(r.dealer) && r.seats.length > 0 && r.seats.every((s) => s.stake === ctx.betMax);
    case 'croupier-invaincu':
      return ctx.dealerUnbeaten;
    default:
      return false;
  }
}
