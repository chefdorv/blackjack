import { describe, expect, it } from 'vitest';
import {
  act,
  blackjackPayout,
  defaultTableRules,
  handValue,
  isCard,
  legalActions,
  needsShuffle,
  newShoe,
  rankOf,
  seatNet,
  stackedShoe,
  startRound,
  type Card,
  type Round,
  type TableRules,
} from '../src/game/blackjack';
import { seeded } from './helpers';

/** « A♠ 10♥ K♦ » → cartes. */
function cards(s: string): Card[] {
  const list = s.split(' ');
  for (const c of list) if (!isCard(c)) throw new Error('carte inconnue ' + c);
  return list as Card[];
}

const rng = seeded(7);

/**
 * Donne truquée. Ordre de sortie : 1re carte de chaque joueur, carte du croupier,
 * 2e carte de chaque joueur, puis les cartes tirées dans l'ordre du jeu (et, en règle
 * européenne, la seconde carte du croupier quand les joueurs ont fini).
 */
function deal(order: string, bets: number[] = [10], rules: Partial<TableRules> = {}, chips = 100): Round {
  return startRound(
    stackedShoe(cards(order)),
    { ...defaultTableRules(), ...rules },
    bets.map((bet, i) => ({ pid: 'p' + i, chips, bet })),
    rng,
  );
}

describe('valeur des mains', () => {
  it('compte l’As à 11 tant que la main ne saute pas', () => {
    expect(handValue(cards('A♠ 6♥'))).toEqual({ total: 17, soft: true, bust: false });
    expect(handValue(cards('A♠ 6♥ 10♦'))).toEqual({ total: 17, soft: false, bust: false });
    expect(handValue(cards('A♠ A♥ 9♦'))).toEqual({ total: 21, soft: true, bust: false });
    expect(handValue(cards('K♠ Q♥ 2♦'))).toEqual({ total: 22, soft: false, bust: true });
    expect(handValue(cards('A♠ A♥ A♦ A♣'))).toEqual({ total: 14, soft: true, bust: false });
  });
});

describe('sabot', () => {
  it('contient 52 cartes par jeu, chacune autant de fois que le nombre de jeux', () => {
    const s = newShoe(6, seeded(1));
    expect(s.cards).toHaveLength(312);
    const as = s.cards.filter((c) => c === 'A♠');
    expect(as).toHaveLength(6);
  });

  it('se remélange une fois la pénétration atteinte, ou si le nombre de jeux change', () => {
    const rules = defaultTableRules();
    const s = newShoe(6, seeded(1));
    expect(needsShuffle(s, rules)).toBe(false);
    expect(needsShuffle({ ...s, cards: s.cards.slice(234) }, rules)).toBe(true);
    expect(needsShuffle({ ...s, cards: s.cards.slice(233) }, rules)).toBe(false);
    expect(needsShuffle(s, { ...rules, decks: 2 })).toBe(true);
  });

  it('un sabot truqué n’est remélangé qu’une fois vide', () => {
    const rules = defaultTableRules();
    expect(needsShuffle(stackedShoe(cards('A♠')), rules)).toBe(false);
    expect(needsShuffle(stackedShoe([]), rules)).toBe(true);
  });

  it('remplace un sabot vide en pleine donne', () => {
    const r = deal('10♠ 5♥ 6♦', [10]);
    const after = act(r, 'tirer', rng);
    expect(after.shuffled).toBe(true);
    expect(after.seats[0].hands[0].cards).toHaveLength(3);
  });
});

describe('donne simple', () => {
  it('le joueur reste, le croupier tire jusqu’à 17', () => {
    // joueur 10 9 ; croupier 6 puis 10 (16) puis 5 (21)
    const r = act(deal('10♠ 6♥ 9♦ 10♣ 5♠'), 'rester', rng);
    expect(r.phase).toBe('terminee');
    expect(r.dealer.map(rankOf)).toEqual(['6', '10', '5']);
    expect(r.seats[0].hands[0].outcome).toBe('perdu');
    expect(seatNet(r.seats[0])).toBe(-10);
  });

  it('le croupier saute : le joueur gagne sa mise', () => {
    const r = act(deal('10♠ 6♥ 2♦ 10♣ 8♠'), 'rester', rng);
    expect(r.seats[0].hands[0].outcome).toBe('gagne');
    expect(seatNet(r.seats[0])).toBe(10);
  });

  it('égalité : rien ne bouge', () => {
    const r = act(deal('10♠ 10♥ 9♦ 9♣'), 'rester', rng);
    expect(r.seats[0].hands[0].outcome).toBe('egalite');
    expect(seatNet(r.seats[0])).toBe(0);
  });

  it('le joueur qui saute perd même si le croupier saute ensuite', () => {
    const r = act(deal('10♠ 6♥ 6♦ K♣'), 'tirer', rng);
    expect(r.seats[0].hands[0].outcome).toBe('saute');
    expect(seatNet(r.seats[0])).toBe(-10);
    // personne n'est encore en jeu : le croupier se contente de sa seconde carte
    expect(r.dealer).toHaveLength(2);
  });

  it('tirer jusqu’à 21 termine la main tout seul', () => {
    const r = act(deal('5♠ 10♥ 6♦ K♣ 10♠ 9♥'), 'tirer', rng);
    expect(r.seats[0].hands[0].done).toBe(true);
    expect(r.phase).toBe('terminee');
  });

  it('garde la trace des gestes et du total avant chacun', () => {
    let r = deal('10♠ 7♥ 6♦ 2♣ 3♠ K♥');
    r = act(r, 'tirer', rng);
    r = act(r, 'rester', rng);
    expect(r.seats[0].hands[0].moves).toEqual([
      { action: 'tirer', before: 16, after: 18 },
      { action: 'rester', before: 18, after: 18 },
    ]);
  });
});

describe('règle du croupier', () => {
  it('reste sur 17 souple par défaut', () => {
    const r = act(deal('10♠ A♥ 8♦ 6♣'), 'rester', rng);
    expect(r.dealer).toHaveLength(2);
    expect(r.seats[0].hands[0].outcome).toBe('gagne');
  });

  it('tire sur 17 souple si la règle le demande', () => {
    const r = act(deal('10♠ A♥ 8♦ 6♣ 2♠', [10], { hitSoft17: true }), 'rester', rng);
    expect(r.dealer.map(rankOf)).toEqual(['A', '6', '2']);
    expect(r.seats[0].hands[0].outcome).toBe('perdu');
  });
});

describe('blackjack', () => {
  it('paie 3 contre 2 arrondi au jeton supérieur', () => {
    expect(blackjackPayout(10)).toBe(15);
    expect(blackjackPayout(5)).toBe(8);
    expect(blackjackPayout(3)).toBe(5);
  });

  it('un blackjack joueur termine sa main et passe au suivant', () => {
    const r = deal('A♠ 10♥ 9♦ K♠ 8♥ 8♣', [5, 10]);
    expect(r.turn).toEqual({ seat: 1, hand: 0 });
    const end = act(r, 'rester', rng);
    expect(end.seats[0].hands[0].outcome).toBe('blackjack');
    expect(seatNet(end.seats[0])).toBe(8);
  });

  it('blackjack contre blackjack : égalité', () => {
    const r = deal('A♠ 10♥ K♦ A♣');
    expect(r.phase).toBe('terminee');
    expect(r.seats[0].hands[0].outcome).toBe('egalite');
  });

  it('règle européenne : le blackjack du croupier prend aussi la mise doublée', () => {
    // joueur 5 6 = 11, double et prend 10 = 21 ; croupier As puis K = blackjack
    const r = act(deal('5♠ A♥ 6♦ 10♣ K♠'), 'doubler', rng);
    expect(r.seats[0].hands[0].outcome).toBe('perdu');
    expect(seatNet(r.seats[0])).toBe(-20);
  });

  it('règle européenne : le blackjack du croupier prend les deux mains splittées', () => {
    // 8 8 contre As ; split : 8+10, 8+9 ; croupier K = blackjack
    let r = deal('8♠ A♥ 8♦ 10♣ 9♠ K♥');
    r = act(r, 'splitter', rng);
    r = act(r, 'rester', rng);
    r = act(r, 'rester', rng);
    expect(r.seats[0].hands.map((h) => h.outcome)).toEqual(['perdu', 'perdu']);
    expect(seatNet(r.seats[0])).toBe(-20);
  });

  it('règle américaine : le croupier vérifie tout de suite, on ne perd que la mise de départ', () => {
    const r = deal('5♠ A♥ 6♦ K♠', [10], { holeCard: 'americaine' });
    expect(r.phase).toBe('terminee');
    expect(legalActions(r).doubler).toBe(false);
    expect(seatNet(r.seats[0])).toBe(-10);
  });
});

describe('doubler', () => {
  it('double la mise, donne une seule carte et termine la main', () => {
    const r = act(deal('5♠ 6♥ 6♦ 10♣ 10♠ 9♥'), 'doubler', rng);
    const h = r.seats[0].hands[0];
    expect(h.bet).toBe(20);
    expect(h.doubled).toBe(true);
    expect(h.cards).toHaveLength(3);
    expect(h.outcome).toBe('gagne');
    expect(seatNet(r.seats[0])).toBe(20);
  });

  it('interdit sans assez de jetons, ou après avoir tiré', () => {
    expect(legalActions(deal('5♠ 6♥ 6♦', [60], {}, 100)).doubler).toBe(false);
    expect(legalActions(deal('5♠ 6♥ 6♦', [50], {}, 100)).doubler).toBe(true);
    const r = act(deal('2♠ 6♥ 3♦ 2♣'), 'tirer', rng);
    expect(legalActions(r).doubler).toBe(false);
  });

  it('un geste interdit ne change rien', () => {
    const r = act(deal('2♠ 6♥ 3♦ 2♣'), 'tirer', rng);
    expect(act(r, 'doubler', rng)).toBe(r);
  });
});

describe('splitter', () => {
  it('sépare une paire en deux mains de même mise', () => {
    let r = deal('8♠ 6♥ 8♦ 3♣ 10♠');
    expect(legalActions(r).splitter).toBe(true);
    r = act(r, 'splitter', rng);
    const [a, b] = r.seats[0].hands;
    expect(a.cards.map(rankOf)).toEqual(['8', '3']);
    expect(b.cards.map(rankOf)).toEqual(['8', '10']);
    expect(a.bet).toBe(10);
    expect(b.bet).toBe(10);
    expect(r.turn).toEqual({ seat: 0, hand: 0 });
  });

  it('accepte deux figures de même valeur', () => {
    expect(legalActions(deal('K♠ 6♥ 10♦')).splitter).toBe(true);
    expect(legalActions(deal('K♠ 6♥ 9♦')).splitter).toBe(false);
  });

  it('un seul split par main', () => {
    let r = deal('8♠ 6♥ 8♦ 8♣ 8♥');
    r = act(r, 'splitter', rng);
    expect(legalActions(r).splitter).toBe(false);
  });

  it('deux As splittés reçoivent une carte chacun, et 21 n’y vaut pas blackjack', () => {
    // As As contre 9 ; split : As+K, As+5 ; croupier 9+10 = 19
    let r = deal('A♠ 9♥ A♦ K♣ 5♠ 10♥');
    r = act(r, 'splitter', rng);
    expect(r.phase).toBe('terminee');
    expect(r.seats[0].hands.map((h) => h.outcome)).toEqual(['gagne', 'perdu']);
    expect(seatNet(r.seats[0])).toBe(0);
  });

  it('doubler après un split selon la règle', () => {
    const order = '5♠ 6♥ 5♦ 6♣ 10♠';
    expect(legalActions(act(deal(order), 'splitter', rng)).doubler).toBe(true);
    expect(legalActions(act(deal(order, [10], { doubleAfterSplit: false }), 'splitter', rng)).doubler).toBe(false);
  });

  it('interdit sans assez de jetons pour la seconde mise', () => {
    expect(legalActions(deal('8♠ 6♥ 8♦', [60], {}, 100)).splitter).toBe(false);
  });
});

describe('plusieurs joueurs', () => {
  it('fait jouer les mains dans l’ordre de la table, puis le croupier une seule fois', () => {
    // J1 10 7, J2 9 9, croupier 10 puis 7
    let r = deal('10♠ 9♥ 10♦ 7♣ 9♠ 7♦', [10, 20]);
    expect(r.turn).toEqual({ seat: 0, hand: 0 });
    r = act(r, 'rester', rng);
    expect(r.turn).toEqual({ seat: 1, hand: 0 });
    r = act(r, 'rester', rng);
    expect(r.dealer.map(rankOf)).toEqual(['10', '7']);
    expect(r.seats.map(seatNet)).toEqual([0, 20]);
  });

  it('refuse une mise supérieure aux jetons', () => {
    expect(() => deal('10♠ 9♥ 10♦', [120])).toThrow();
  });
});
