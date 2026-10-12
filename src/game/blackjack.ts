// Moteur de blackjack pur : sabot, valeur des mains, actions des joueurs, jeu
// automatique du croupier et paiements d'une donne. Il ne connaît ni les manches,
// ni les défis, ni qui paie (banque ou croupier tournant) : c'est le rôle de la partie.

import type { Rng } from './types';

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export type Rank = (typeof RANKS)[number];

/** Une carte s'écrit comme on la lit : « A♠ », « 10♥ », « Q♦ ». */
export type Card = `${Rank}${Suit}`;

const ALL_CARDS: readonly Card[] = SUITS.flatMap((s) => RANKS.map((r): Card => `${r}${s}`));
const CARD_SET = new Set<string>(ALL_CARDS);

export function isCard(v: unknown): v is Card {
  return typeof v === 'string' && CARD_SET.has(v);
}

export function rankOf(c: Card): Rank {
  return c.slice(0, -1) as Rank;
}

export function suitOf(c: Card): Suit {
  return c.slice(-1) as Suit;
}

export function isRed(c: Card): boolean {
  const s = suitOf(c);
  return s === '♥' || s === '♦';
}

/** Valeur d'une carte, l'As compté 1 (handValue décide s'il vaut 11). */
export function cardPoints(c: Card): number {
  const r = rankOf(c);
  if (r === 'A') return 1;
  if (r === 'J' || r === 'Q' || r === 'K') return 10;
  return Number(r);
}

export interface TableRules {
  decks: number;
  /** Part du sabot distribuée avant de remélanger (0,75 = aux trois quarts). */
  penetration: number;
  /** true : le croupier tire sur 17 souple (As + 6). */
  hitSoft17: boolean;
  doubleAfterSplit: boolean;
  /**
   * « europeenne » : le croupier ne prend sa seconde carte qu'après les joueurs ; s'il fait
   * blackjack, les mises doublées ou splittées sont perdues en entier.
   * « americaine » : il la prend tout de suite et, s'il a blackjack, la donne s'arrête.
   */
  holeCard: 'europeenne' | 'americaine';
}

export function defaultTableRules(): TableRules {
  return { decks: 6, penetration: 0.75, hitSoft17: false, doubleAfterSplit: true, holeCard: 'europeenne' };
}

// ---------------------------------------------------------------------------
// Sabot

export interface Shoe {
  /** Cartes restantes, la prochaine en tête. */
  cards: Card[];
  /** Nombre de cartes au dernier mélange. */
  size: number;
  /** Nombre de jeux mélangés ; 0 pour un sabot truqué (tests), jamais remélangé avant d'être vide. */
  decks: number;
}

export function newShoe(decks: number, rng: Rng): Shoe {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) cards.push(...ALL_CARDS);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return { cards, size: cards.length, decks };
}

/** Sabot truqué (tests, e2e) : les cartes sortent dans l'ordre donné. */
export function stackedShoe(cards: readonly Card[]): Shoe {
  return { cards: cards.slice(), size: cards.length, decks: 0 };
}

/** Faut-il remélanger avant la prochaine donne ? (pénétration atteinte, ou nombre de jeux changé dans les réglages) */
export function needsShuffle(shoe: Shoe, rules: TableRules): boolean {
  if (shoe.decks === 0) return shoe.cards.length === 0;
  if (shoe.decks !== rules.decks) return true;
  return shoe.size - shoe.cards.length >= shoe.size * rules.penetration;
}

// ---------------------------------------------------------------------------
// Valeur des mains

export interface HandValue {
  total: number;
  /** Un As compte 11 sans faire sauter la main. */
  soft: boolean;
  bust: boolean;
}

export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardPoints(c);
    if (rankOf(c) === 'A') aces++;
  }
  const soft = aces > 0 && total + 10 <= 21;
  if (soft) total += 10;
  return { total, soft, bust: total > 21 };
}

export function isNatural(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

// ---------------------------------------------------------------------------
// Donne

export type HandAction = 'tirer' | 'rester' | 'doubler' | 'splitter';

export interface HandMove {
  action: HandAction;
  /** Total de la main juste avant le geste (« tirer sur 16 »…). */
  before: number;
  /** Total juste après. */
  after: number;
}

export type Outcome = 'blackjack' | 'gagne' | 'egalite' | 'perdu' | 'saute';

export interface Hand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  /** Main issue d'un split : 21 en deux cartes n'y vaut pas blackjack. */
  fromSplit: boolean;
  done: boolean;
  moves: HandMove[];
  outcome: Outcome | null;
  /** Gain net de la main, mise non comprise (positif, nul ou négatif). */
  net: number;
}

export interface Seat {
  pid: string;
  /** Jetons du joueur au début de la donne, mise comprise. */
  chips: number;
  /** Mise de départ, avant double ou split. */
  stake: number;
  /** Les deux cartes reçues à la distribution. */
  start: Card[];
  hands: Hand[];
}

export interface Bet {
  pid: string;
  chips: number;
  bet: number;
}

export interface Round {
  rules: TableRules;
  shoe: Shoe;
  seats: Seat[];
  dealer: Card[];
  phase: 'joueurs' | 'terminee';
  /** Main qui doit jouer ; null quand ce n'est plus aux joueurs. */
  turn: { seat: number; hand: number } | null;
  /** Le sabot a été remélangé pendant cette donne. */
  shuffled: boolean;
}

export function isBlackjack(hand: Hand): boolean {
  return !hand.fromSplit && isNatural(hand.cards);
}

export function isWin(o: Outcome | null): boolean {
  return o === 'gagne' || o === 'blackjack';
}

function draw(r: Round, rng: Rng): Card {
  if (r.shoe.cards.length === 0) {
    r.shoe = newShoe(r.rules.decks, rng);
    r.shuffled = true;
  }
  const c = r.shoe.cards.shift();
  if (!c) throw new Error('sabot vide');
  return c;
}

function newHand(cards: Card[], bet: number, fromSplit: boolean): Hand {
  return { cards, bet, doubled: false, fromSplit, done: false, moves: [], outcome: null, net: 0 };
}

/** Jetons encore libres pour doubler ou splitter. */
export function freeChips(seat: Seat): number {
  return seat.chips - seat.hands.reduce((sum, h) => sum + h.bet, 0);
}

/**
 * Distribue une donne : une carte à chaque joueur, une au croupier, une seconde à chaque
 * joueur (et au croupier en règle américaine). Remélange d'abord si besoin.
 */
export function startRound(shoe: Shoe, rules: TableRules, bets: readonly Bet[], rng: Rng): Round {
  if (bets.length === 0) throw new Error('aucune mise');
  for (const b of bets) {
    if (!Number.isInteger(b.bet) || b.bet <= 0 || b.bet > b.chips) throw new Error('mise invalide pour ' + b.pid);
  }
  const shuffle = needsShuffle(shoe, rules);
  const r: Round = {
    rules: { ...rules },
    shoe: shuffle ? newShoe(rules.decks, rng) : structuredClone(shoe),
    seats: bets.map((b) => ({ pid: b.pid, chips: b.chips, stake: b.bet, start: [], hands: [newHand([], b.bet, false)] })),
    dealer: [],
    phase: 'joueurs',
    turn: null,
    shuffled: shuffle,
  };
  for (const s of r.seats) s.hands[0].cards.push(draw(r, rng));
  r.dealer.push(draw(r, rng));
  for (const s of r.seats) s.hands[0].cards.push(draw(r, rng));
  if (rules.holeCard === 'americaine') r.dealer.push(draw(r, rng));

  for (const s of r.seats) {
    s.start = s.hands[0].cards.slice();
    if (isNatural(s.hands[0].cards)) s.hands[0].done = true;
  }
  if (rules.holeCard === 'americaine' && isNatural(r.dealer)) {
    for (const s of r.seats) s.hands[0].done = true;
  }
  return nextTurn(r, rng);
}

export interface Legal {
  tirer: boolean;
  rester: boolean;
  doubler: boolean;
  splitter: boolean;
}

const NONE: Legal = { tirer: false, rester: false, doubler: false, splitter: false };

/** Gestes permis pour la main qui doit jouer. */
export function legalActions(r: Round): Legal {
  if (r.phase !== 'joueurs' || !r.turn) return NONE;
  const seat = r.seats[r.turn.seat];
  const hand = seat.hands[r.turn.hand];
  const two = hand.cards.length === 2;
  const free = freeChips(seat);
  return {
    tirer: true,
    rester: true,
    doubler: two && free >= hand.bet && (!hand.fromSplit || r.rules.doubleAfterSplit),
    splitter: two && seat.hands.length === 1 && free >= hand.bet && cardPoints(hand.cards[0]) === cardPoints(hand.cards[1]),
  };
}

/** Joue un geste pour la main en cours. Un geste interdit laisse la donne inchangée. */
export function act(round: Round, action: HandAction, rng: Rng): Round {
  if (!legalActions(round)[action] || !round.turn) return round;
  const r = structuredClone(round);
  const { seat: si, hand: hi } = round.turn;
  const seat = r.seats[si];
  const hand = seat.hands[hi];
  const move: HandMove = { action, before: handValue(hand.cards).total, after: 0 };
  hand.moves.push(move);

  switch (action) {
    case 'tirer': {
      hand.cards.push(draw(r, rng));
      const v = handValue(hand.cards);
      if (v.bust || v.total === 21) hand.done = true;
      break;
    }
    case 'rester':
      hand.done = true;
      break;
    case 'doubler':
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(draw(r, rng));
      hand.done = true;
      break;
    case 'splitter': {
      const aces = rankOf(hand.cards[0]) === 'A';
      const second = newHand([hand.cards[1]], hand.bet, true);
      hand.cards = [hand.cards[0]];
      hand.fromSplit = true;
      seat.hands.push(second);
      for (const h of seat.hands) {
        h.cards.push(draw(r, rng));
        if (aces || handValue(h.cards).total === 21) h.done = true;
      }
      second.moves = hand.moves.slice();
      break;
    }
  }
  move.after = handValue(hand.cards).total;
  return nextTurn(r, rng);
}

/** Passe à la prochaine main qui doit jouer, ou fait jouer le croupier et paie. */
function nextTurn(r: Round, rng: Rng): Round {
  for (let s = 0; s < r.seats.length; s++) {
    for (let h = 0; h < r.seats[s].hands.length; h++) {
      if (!r.seats[s].hands[h].done) {
        r.turn = { seat: s, hand: h };
        return r;
      }
    }
  }
  r.turn = null;
  playDealer(r, rng);
  settle(r);
  r.phase = 'terminee';
  return r;
}

function playDealer(r: Round, rng: Rng): void {
  if (r.dealer.length < 2) r.dealer.push(draw(r, rng));
  if (isNatural(r.dealer)) return;
  const alive = r.seats.some((s) => s.hands.some((h) => !handValue(h.cards).bust && !isBlackjack(h)));
  if (!alive) return;
  for (;;) {
    const v = handValue(r.dealer);
    if (v.total < 17 || (v.total === 17 && v.soft && r.rules.hitSoft17)) r.dealer.push(draw(r, rng));
    else return;
  }
}

/** Gain d'un blackjack : 3 contre 2, arrondi au jeton supérieur. */
export function blackjackPayout(bet: number): number {
  return Math.ceil((bet * 3) / 2);
}

function settle(r: Round): void {
  const d = handValue(r.dealer);
  const dealerBJ = isNatural(r.dealer);
  for (const seat of r.seats) {
    for (const h of seat.hands) {
      const v = handValue(h.cards);
      const bj = isBlackjack(h);
      let outcome: Outcome;
      if (v.bust) outcome = 'saute';
      else if (bj && dealerBJ) outcome = 'egalite';
      else if (bj) outcome = 'blackjack';
      else if (dealerBJ) outcome = 'perdu';
      else if (d.bust || v.total > d.total) outcome = 'gagne';
      else if (v.total === d.total) outcome = 'egalite';
      else outcome = 'perdu';
      h.outcome = outcome;
      h.net = outcome === 'blackjack' ? blackjackPayout(h.bet) : outcome === 'gagne' ? h.bet : outcome === 'egalite' ? 0 : -h.bet;
    }
  }
}

/** Gain net de chaque joueur sur la donne (somme de ses mains). */
export function seatNet(seat: Seat): number {
  return seat.hands.reduce((sum, h) => sum + h.net, 0);
}
