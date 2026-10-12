import { describe, expect, it } from 'vitest';
import { act, defaultTableRules, isCard, stackedShoe, startRound, type Card, type HandAction, type Round } from '../src/game/blackjack';
import { dealerAchieves, playerAchieves, type DetectContext } from '../src/game/detect';
import type { AutoKey } from '../src/game/types';
import { seeded } from './helpers';

const rng = seeded(5);

function cards(s: string): Card[] {
  const list = s.split(' ');
  for (const c of list) if (!isCard(c)) throw new Error('carte inconnue ' + c);
  return list as Card[];
}

/** Un joueur (mise 10), sabot truqué, gestes joués dans l'ordre. */
function played(order: string, moves: HandAction[] = [], stake = 10): Round {
  let r = startRound(stackedShoe(cards(order)), defaultTableRules(), [{ pid: 'p', chips: 100, bet: stake }], rng);
  for (const m of moves) r = act(r, m, rng);
  if (r.phase !== 'terminee') r = act(r, 'rester', rng);
  return r;
}

function ctx(round: Round, patch: Partial<DetectContext> = {}): DetectContext {
  return { round, betMax: 10, streak: {}, bjRound: {}, dealerUnbeaten: false, ...patch };
}

function achieves(key: AutoKey, r: Round, patch: Partial<DetectContext> = {}): boolean {
  return playerAchieves(key, r.seats[0], ctx(r, patch));
}

describe('défis joueurs', () => {
  it('gagner après avoir doublé, et doubler sur 9 ou moins', () => {
    // 4 5 = 9, double et prend 10 = 19 contre 10 7
    const r = played('4♠ 10♥ 5♦ 10♣ 7♠', ['doubler']);
    expect(achieves('double-gagne', r)).toBe(true);
    expect(achieves('double-9-gagne', r)).toBe(true);
    // 5 5 = 10 : doubler sur 10 ne compte pas pour « 9 ou moins »
    const r10 = played('5♠ 10♥ 5♦ 9♣ 7♠', ['doubler']);
    expect(achieves('double-gagne', r10)).toBe(true);
    expect(achieves('double-9-gagne', r10)).toBe(false);
  });

  it('tirer sur 16 sans sauter', () => {
    expect(achieves('tire-16', played('10♠ 10♥ 6♦ 3♣ 7♠', ['tirer']))).toBe(true);
    expect(achieves('tire-16', played('10♠ 10♥ 6♦ 9♣ 7♠', ['tirer']))).toBe(false);
    expect(achieves('tire-16', played('10♠ 10♥ 5♦ 3♣ 7♠', ['tirer']))).toBe(false);
  });

  it('cartes et totaux : 21 en 3, 4 cartes gagnantes, 20, 12 ou moins, 7-7-7', () => {
    const r21 = played('7♠ 10♥ 7♦ 7♣ 7♠', ['tirer']);
    expect(achieves('21-3-cartes', r21)).toBe(true);
    expect(achieves('777', r21)).toBe(true);
    expect(achieves('21-4-cartes', r21)).toBe(false);
    const four = played('2♠ 10♥ 3♦ 2♣ 3♠ 6♥ 9♣', ['tirer', 'tirer']);
    expect(four.seats[0].hands[0].cards).toHaveLength(4);
    expect(achieves('gagne-4-cartes', four)).toBe(true);
    expect(achieves('gagne-20', played('10♠ 10♥ K♦ 8♣'))).toBe(true);
    // 12 et le croupier saute (10 6 10)
    expect(achieves('reste-12-gagne', played('10♠ 10♥ 2♦ 6♣ 10♠'))).toBe(true);
  });

  it('battre un croupier qui montre un As', () => {
    expect(achieves('bat-as', played('10♠ A♥ 10♦ 5♣ 10♠'))).toBe(true);
    expect(achieves('bat-as', played('10♠ A♥ 10♦ 9♣'))).toBe(false);
  });

  it('blackjack, et splitter des As pour un 21 en deux cartes', () => {
    expect(achieves('blackjack', played('A♠ 9♥ K♦ 8♣'))).toBe(true);
    const split = played('A♠ 9♥ A♦ K♣ 5♠ 10♥', ['splitter']);
    expect(achieves('blackjack', split)).toBe(false);
    expect(achieves('split-as-bj', split)).toBe(true);
  });

  it('splitter et gagner les deux mains', () => {
    const r = played('8♠ 6♥ 8♦ 10♣ 10♠ 10♥ 10♦', ['splitter', 'rester', 'rester']);
    expect(r.seats[0].hands.map((h) => h.outcome)).toEqual(['gagne', 'gagne']);
    expect(achieves('split-2-gagnees', r)).toBe(true);
  });

  it('paire de départ de la même couleur, et gagner', () => {
    expect(achieves('paire-couleur-gagne', played('8♥ 10♠ 8♦ 3♣ 7♠', ['tirer']))).toBe(true);
    expect(achieves('paire-couleur-gagne', played('8♥ 10♠ 8♣ 3♣ 7♠', ['tirer']))).toBe(false);
  });

  it('séries et blackjacks de la manche viennent du contexte', () => {
    const r = played('10♠ 10♥ K♦ 8♣');
    expect(achieves('serie-3', r, { streak: { p: 3 } })).toBe(true);
    expect(achieves('serie-3', r, { streak: { p: 2 } })).toBe(false);
    expect(achieves('2-bj-manche', r, { bjRound: { p: 2 } })).toBe(true);
  });
});

describe('défis croupier', () => {
  it('21 avec 3 cartes ou plus', () => {
    const r = played('10♠ 6♥ 8♦ 10♣ 5♠');
    expect(r.dealer).toHaveLength(3);
    expect(dealerAchieves('croupier-21-3-cartes', ctx(r))).toBe(true);
  });

  it('blackjack contre une table qui a misé le max', () => {
    expect(dealerAchieves('croupier-bj-max', ctx(played('10♠ A♥ 8♦ K♣', [], 10)))).toBe(true);
    expect(dealerAchieves('croupier-bj-max', ctx(played('10♠ A♥ 8♦ K♣', [], 9)))).toBe(false);
  });

  it('ne perdre aucune donne : décidé par la partie', () => {
    const r = played('10♠ A♥ 8♦ K♣');
    expect(dealerAchieves('croupier-invaincu', ctx(r, { dealerUnbeaten: true }))).toBe(true);
    expect(dealerAchieves('croupier-invaincu', ctx(r))).toBe(false);
  });

  it('un défi croupier n’est jamais validé pour un joueur', () => {
    const r = played('10♠ 9♥ 8♦ K♣');
    expect(achieves('croupier-bat-tous', r)).toBe(false);
    expect(dealerAchieves('croupier-bat-tous', ctx(r))).toBe(true);
  });
});
