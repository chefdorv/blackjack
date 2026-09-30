import { describe, expect, it } from 'vitest';
import { advance, endGame, finishSettling, turnInfo } from '../src/game/game';
import type { Game } from '../src/game/types';
import { newGame, seeded, settings } from './helpers';

describe('rotation du croupier', () => {
  it('chaque joueur fait ses donnes puis la main passe au suivant', () => {
    const s = settings({ deals: 2 });
    let g = newGame(['Alice', 'Bob', 'Chloé'], s);
    const seen: Array<[string, number]> = [];
    const events: string[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push([g.players[g.dealer].name, g.deal]);
      const r = advance(g, s);
      events.push(r.event);
      g = r.game;
    }
    expect(seen).toEqual([
      ['Alice', 1],
      ['Alice', 2],
      ['Bob', 1],
      ['Bob', 2],
      ['Chloé', 1],
      ['Chloé', 2],
    ]);
    expect(events).toEqual(['donne', 'croupier', 'donne', 'croupier', 'donne', 'fin-de-manche']);
    expect(g.settling).toEqual({ round: 1 });
    expect(g.dealer).toBe(0);
    expect(g.dealersDone).toBe(0);
  });

  it("ne fait rien pendant le règlement ou après la fin de partie", () => {
    const s = settings({ deals: 1 });
    let g = newGame(undefined, s);
    for (let i = 0; i < 3; i++) g = advance(g, s).game;
    expect(g.settling).not.toBeNull();
    const again = advance(g, s);
    expect(again.game).toBe(g);
    expect(advance(endGame(g), s).game.finished).toBe(true);
  });

  it('enchaîne les manches puis termine la partie après la dernière', () => {
    const s = settings({ deals: 1, rounds: 2 });
    const rng = seeded(3);
    let g: Game = newGame(undefined, s);
    for (let i = 0; i < 3; i++) g = advance(g, s).game;
    const r1 = finishSettling(g, s, rng);
    expect(r1.event).toBe('manche-suivante');
    expect(r1.game.round).toBe(2);
    expect(r1.game.settling).toBeNull();
    expect(r1.game.players[r1.game.dealer].name).toBe('Alice');
    g = r1.game;
    for (let i = 0; i < 3; i++) g = advance(g, s).game;
    expect(g.settling).toEqual({ round: 2 });
    const r2 = finishSettling(g, s, rng);
    expect(r2.event).toBe('partie-terminee');
    expect(r2.game.finished).toBe(true);
    expect(r2.game.round).toBe(2);
  });

  it('annonce le bon libellé du bouton et la phrase du croupier', () => {
    const s = settings({ deals: 3 });
    let g = newGame(['Alice', 'Bob', 'Paul'], s);
    let t = turnInfo(g, s);
    expect(t.nextLabel).toBe('Donne suivante');
    expect(t.dealerLine).toBe('Encore 2 donnes après celle-ci, puis la main passe à Bob.');
    g = advance(g, s).game;
    expect(turnInfo(g, s).dealerLine).toBe('Encore 1 donne après celle-ci, puis la main passe à Bob.');
    g = advance(g, s).game;
    t = turnInfo(g, s);
    expect(t.nextLabel).toBe('Croupier suivant : Bob');
    expect(t.isLastDeal).toBe(true);
    // Jusqu'au dernier croupier de la manche.
    for (let i = 0; i < 6; i++) g = advance(g, s).game;
    t = turnInfo(g, s);
    expect(g.players[g.dealer].name).toBe('Paul');
    expect(t.isLastDealer).toBe(true);
    expect(t.nextLabel).toBe('Fin de manche : on règle les comptes');
    expect(t.dealerLine).toBe('Dernière donne de la manche.');
  });

  it('ne modifie jamais la partie reçue', () => {
    const s = settings({ deals: 1 });
    const g = newGame(undefined, s);
    const copy = structuredClone(g);
    advance(g, s);
    expect(g).toEqual(copy);
  });
});
