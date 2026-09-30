import { describe, expect, it } from 'vitest';
import { addBlackjack, addRebuy, adjustPlayer, allCounted, setFinalCount } from '../src/game/game';
import {
  blackjackKings,
  buildNight,
  championshipPoints,
  championshipStandings,
  finalRanking,
  liveRanking,
  pending,
  rankWithTies,
  settleAll,
  settlePlayer,
} from '../src/game/scoring';
import type { Game, Night } from '../src/game/types';
import { newGame, settings } from './helpers';

function withBonus(g: Game, i: number, bonus: number): Game {
  return adjustPlayer(g, g.players[i].id, 'bonus', bonus);
}

describe('ce qui reste à régler', () => {
  const s = settings();

  it('gains de défis − malus de recave − déjà réglé', () => {
    let g = newGame(undefined, s);
    const [a, b, c] = g.players.map((p) => p.id);
    g = withBonus(g, 0, 25);
    g = addRebuy(g, b);
    g = withBonus(g, 2, 15);
    g = addRebuy(g, c);
    expect(g.players.map((p) => pending(p, s))).toEqual([25, -50, -35]);

    const r = settlePlayer(g, s, a);
    expect(r.amount).toBe(25);
    expect(pending(r.game.players[0], s)).toBe(0);
    expect(r.game.players[0].settled).toBe(25);
    // Bob n'a pas pu payer : sa dette est reportée.
    g = r.game;
    g = withBonus(g, 0, 10);
    expect(pending(g.players[0], s)).toBe(10);
    expect(pending(g.players[1], s)).toBe(-50);
  });

  it('tout le monde règle', () => {
    let g = newGame(undefined, s);
    g = withBonus(g, 0, 20);
    g = addRebuy(g, g.players[1].id);
    g = settleAll(g, s);
    expect(g.players.map((p) => pending(p, s))).toEqual([0, 0, 0]);
    expect(g.players.map((p) => p.settled)).toEqual([20, -50, 0]);
  });

  it('les corrections ne descendent jamais sous zéro', () => {
    let g = newGame(undefined, s);
    const id = g.players[0].id;
    g = adjustPlayer(g, id, 'bonus', -5);
    g = adjustPlayer(g, id, 'bj', -1);
    g = adjustPlayer(g, id, 'rebuys', -1);
    expect(g.players[0]).toMatchObject({ bonus: 0, bj: 0, rebuys: 0 });
  });
});

describe('roi du blackjack', () => {
  it("personne n'a de bonus sans blackjack", () => {
    expect(blackjackKings(newGame().players)).toEqual({ max: 0, ids: [] });
  });

  it('chacun le prend en cas d’égalité', () => {
    let g = newGame();
    const [a, b] = g.players.map((p) => p.id);
    g = addBlackjack(addBlackjack(g, a), b);
    expect(blackjackKings(g.players)).toEqual({ max: 1, ids: [a, b] });
    g = addBlackjack(g, b);
    expect(blackjackKings(g.players)).toEqual({ max: 2, ids: [b] });
  });
});

describe('places avec égalités', () => {
  it('partage la place et saute la suivante', () => {
    const rows = rankWithTies(
      [
        { n: 'a', s: 10 },
        { n: 'b', s: 30 },
        { n: 'c', s: 10 },
        { n: 'd', s: 30 },
        { n: 'e', s: 5 },
      ],
      (r) => [r.s],
    );
    expect(rows.map((r) => [r.n, r.place])).toEqual([
      ['b', 1],
      ['d', 1],
      ['a', 3],
      ['c', 3],
      ['e', 5],
    ]);
  });
});

describe('scores finaux', () => {
  const s = settings();

  it('jetons comptés + non réglé + bonus du roi du blackjack', () => {
    let g = newGame(['Alice', 'Bob', 'Chloé'], s);
    const [a, b, c] = g.players.map((p) => p.id);
    g = withBonus(g, 0, 25); // Alice : 25 non réglé
    g = addRebuy(g, b); // Bob : −50 non réglé
    g = addBlackjack(addBlackjack(g, c), c); // Chloé : roi du blackjack
    g = setFinalCount(g, a, 90);
    g = setFinalCount(g, b, 160);
    expect(allCounted(g)).toBe(false);
    g = setFinalCount(g, c, 105);
    expect(allCounted(g)).toBe(true);
    const rows = finalRanking(g, s);
    expect(rows.map((r) => [r.name, r.score, r.place])).toEqual([
      ['Alice', 115, 1],
      ['Chloé', 115, 1],
      ['Bob', 110, 3],
    ]);
    expect(rows[1]).toMatchObject({ chips: 105, unsettled: 0, bjBonus: 10, bj: 2 });
  });

  it('ce qui a été réglé en cours de partie ne compte pas deux fois', () => {
    let g = newGame(undefined, s);
    const a = g.players[0].id;
    g = withBonus(g, 0, 25);
    g = settlePlayer(g, s, a).game; // Alice a pris 25 jetons à la banque, ils sont dans son tas.
    g = g.players.reduce((acc, p) => setFinalCount(acc, p.id, p.id === a ? 125 : 100), g);
    expect(finalRanking(g, s).find((r) => r.id === a)?.score).toBe(125);
  });

  it('classement en direct : défis − malus + roi du blackjack', () => {
    let g = newGame(['Alice', 'Bob', 'Chloé'], s);
    g = withBonus(g, 0, 15);
    g = addRebuy(g, g.players[1].id);
    g = addBlackjack(g, g.players[2].id);
    expect(liveRanking(g, s).map((r) => [r.name, r.score, r.place])).toEqual([
      ['Alice', 15, 1],
      ['Chloé', 10, 2],
      ['Bob', -50, 3],
    ]);
  });
});

describe('championnat', () => {
  it('10 / 7 / 5 / 3 / 1 points puis 0', () => {
    expect([1, 2, 3, 4, 5, 6, 8].map(championshipPoints)).toEqual([10, 7, 5, 3, 1, 0, 0]);
  });

  it('les ex æquo prennent les points de leur place', () => {
    const s = settings();
    let g = newGame(['A', 'B', 'C', 'D'], s);
    const scores = [100, 100, 80, 50];
    g = g.players.reduce((acc, p, i) => setFinalCount(acc, p.id, scores[i]), g);
    const night = buildNight(g, s, 'n1', '2026-09-30T20:00:00.000Z');
    expect(night.results.map((r) => [r.name, r.place, r.pts])).toEqual([
      ['A', 1, 10],
      ['B', 1, 10],
      ['C', 3, 5],
      ['D', 4, 3],
    ]);
  });

  it('cumule les soirées, reconnaît les noms sans la casse et départage par les victoires', () => {
    const night = (id: string, rs: Array<[string, number]>): Night => ({
      id,
      date: '2026-09-01T20:00:00.000Z',
      results: rs.map(([name, place]) => ({ name, place, score: 0, pts: championshipPoints(place) })),
    });
    const nights = [
      night('1', [
        ['Alice', 1],
        ['Bob', 2],
        ['Chloé', 3],
      ]),
      night('2', [
        ['bob', 1],
        ['alice', 2],
        ['Chloé', 3],
      ]),
      night('3', [
        ['Chloé', 1],
        ['David', 2],
        ['ALICE', 3],
        ['Bob', 3],
      ]),
    ];
    const st = championshipStandings(nights);
    expect(st.map((r) => [r.key, r.pts, r.nights, r.wins, r.place])).toEqual([
      ['alice', 22, 3, 1, 1],
      ['bob', 22, 3, 1, 1],
      ['chloé', 20, 3, 1, 3],
      ['david', 7, 1, 0, 4],
    ]);
    // Le nom affiché est la dernière orthographe utilisée.
    expect(st[0].name).toBe('ALICE');

    const tieBreak = championshipStandings([
      night('a', [
        ['X', 1],
        ['Y', 2],
      ]),
      night('b', [
        ['Y', 2],
        ['Z', 1],
      ]),
      night('c', [
        ['Y', 1],
        ['X', 2],
      ]),
    ]);
    // X : 17 pts / 1 victoire, Y : 24 pts / 1 victoire, Z : 10 pts.
    expect(tieBreak.map((r) => [r.name, r.pts, r.wins, r.place])).toEqual([
      ['Y', 24, 1, 1],
      ['X', 17, 1, 2],
      ['Z', 10, 1, 3],
    ]);
    const equalPts = championshipStandings([
      night('a', [
        ['X', 1],
        ['Y', 2],
      ]),
      night('b', [
        ['Y', 4],
      ]),
    ]);
    // X : 10 pts et 1 victoire ; Y : 7 + 3 = 10 pts et 0 victoire → X devant.
    expect(equalPts.map((r) => [r.name, r.pts, r.wins, r.place])).toEqual([
      ['X', 10, 1, 1],
      ['Y', 10, 0, 2],
    ]);
  });
});
