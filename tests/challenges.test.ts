import { describe, expect, it } from 'vitest';
import { claimChallenge, fillChallenges, flipAll, flipCard, kindOf, poolRemaining, tableChallenges, unflippedCount } from '../src/game/challenges';
import { createGame } from '../src/game/game';
import { removeChallenge } from '../src/game/settings';
import type { Challenge, Game, Settings } from '../src/game/types';
import { newGame, seeded, settings } from './helpers';

function byId(s: Settings, id: string): Challenge {
  const c = s.challenges.find((x) => x.id === id);
  if (!c) throw new Error('défi introuvable ' + id);
  return c;
}

function counts(g: Game, s: Settings) {
  const cs = g.current.map((id) => byId(s, id));
  return { joueur: cs.filter((c) => kindOf(c) === 'joueur').length, croupier: cs.filter((c) => kindOf(c) === 'croupier').length };
}

describe('tirage des défis', () => {
  it('tire 3 défis joueurs et 1 défi croupier au lancement', () => {
    const s = settings();
    for (let seed = 1; seed < 30; seed++) {
      const g = newGame(undefined, s, seed);
      expect(counts(g, s)).toEqual({ joueur: 3, croupier: 1 });
      expect(new Set(g.current).size).toBe(4);
      expect(g.drawn).toEqual(g.current);
      expect(g.fresh).toEqual(g.current);
      expect(g.flipped).toEqual([]);
    }
  });

  it('respecte les nombres réglés', () => {
    const s = settings({ playerSlots: 5, dealerSlots: 2 });
    expect(counts(newGame(undefined, s), s)).toEqual({ joueur: 5, croupier: 2 });
  });

  it('complète immédiatement quand on augmente le nombre de cartes', () => {
    const s = settings();
    const g = newGame(undefined, s);
    const s2 = { ...s, playerSlots: 4, dealerSlots: 2 };
    const r = fillChallenges(g, s2, seeded(9));
    expect(counts(r.game, s2)).toEqual({ joueur: 4, croupier: 2 });
    expect(r.drawn).toHaveLength(2);
    // Les cartes déjà en jeu restent.
    for (const id of g.current) expect(r.game.current).toContain(id);
  });

  it("ne retire pas de carte quand on baisse le nombre, et n'en retire pas en remplaçant", () => {
    const s = settings();
    const g = newGame(undefined, s);
    const s2 = { ...s, playerSlots: 1 };
    const r = fillChallenges(g, s2, seeded(9));
    expect(r.game.current).toEqual(g.current);
    const pid = g.players[1].id;
    const playerCard = tableChallenges(g, s2).find((c) => kindOf(c) === 'joueur');
    if (!playerCard) throw new Error();
    const claim = claimChallenge(g, s2, playerCard.id, pid, seeded(1));
    if (!claim.ok) throw new Error(claim.reason);
    expect(claim.replacement).toBeNull();
    expect(counts(claim.game, s2).joueur).toBe(2);
  });
});

describe('réclamation et remplacement', () => {
  it('le gagnant empoche le gain et une carte du même type remplace la carte réclamée', () => {
    const s = settings();
    const rng = seeded(4);
    let g = newGame(undefined, s, 4);
    const card = tableChallenges(g, s).find((c) => kindOf(c) === 'joueur');
    if (!card) throw new Error();
    g = flipCard(g, card.id);
    const bob = g.players[1];
    const r = claimChallenge(g, s, card.id, bob.id, rng);
    if (!r.ok) throw new Error(r.reason);
    expect(r.reward).toBe(card.reward);
    expect(r.game.players[1].bonus).toBe(card.reward);
    expect(r.game.current).not.toContain(card.id);
    expect(r.game.flipped).not.toContain(card.id);
    expect(r.replacement).not.toBeNull();
    expect(kindOf(byId(s, r.replacement ?? ''))).toBe('joueur');
    expect(r.game.fresh).toEqual([r.replacement]);
    expect(counts(r.game, s)).toEqual({ joueur: 3, croupier: 1 });
    expect(r.game.claims).toEqual([
      { cid: card.id, pid: bob.id, name: 'Bob', text: card.text, level: card.level, reward: card.reward, round: 1 },
    ]);
  });

  it('un défi croupier est réservé au croupier en cours et remplacé par un défi croupier', () => {
    const s = settings();
    const g = newGame(undefined, s, 7);
    const dc = tableChallenges(g, s).find((c) => kindOf(c) === 'croupier');
    if (!dc) throw new Error();
    const refused = claimChallenge(g, s, dc.id, g.players[1].id, seeded(1));
    expect(refused).toEqual({ ok: false, reason: 'reserve-croupier' });
    const ok = claimChallenge(g, s, dc.id, g.players[g.dealer].id, seeded(1));
    if (!ok.ok) throw new Error(ok.reason);
    expect(ok.kind).toBe('croupier');
    expect(kindOf(byId(s, ok.replacement ?? ''))).toBe('croupier');
  });

  it('refuse un défi qui n’est pas sur la table ou un joueur inconnu', () => {
    const s = settings();
    const g = newGame(undefined, s);
    const notOnTable = s.challenges.find((c) => !g.current.includes(c.id));
    expect(claimChallenge(g, s, notOnTable?.id ?? '', g.players[0].id, seeded(1))).toEqual({ ok: false, reason: 'absent' });
    expect(claimChallenge(g, s, g.current[0], 'personne', seeded(1))).toEqual({ ok: false, reason: 'joueur-inconnu' });
  });

  it('ne sort jamais deux fois le même défi, puis signale la pioche vide', () => {
    const s = settings();
    const rng = seeded(11);
    let g = createGame(['A', 'B', 'C', 'D'], s, rng, 5).game;
    const everShown = new Set(g.current);
    let emptyPlayer = false;
    let emptyDealer = false;
    // On réclame tout ce qui passe jusqu'à épuiser les deux pioches.
    for (let guard = 0; guard < 100 && g.current.length > 0; guard++) {
      const c = byId(s, g.current[0]);
      const pid = kindOf(c) === 'croupier' ? g.players[g.dealer].id : g.players[guard % 4].id;
      const r = claimChallenge(g, s, c.id, pid, rng);
      if (!r.ok) throw new Error(r.reason);
      if (r.replacement) {
        expect(everShown.has(r.replacement)).toBe(false);
        everShown.add(r.replacement);
      } else if (r.kind === 'joueur') emptyPlayer = true;
      else emptyDealer = true;
      g = r.game;
    }
    expect(g.current).toEqual([]);
    expect(emptyPlayer && emptyDealer).toBe(true);
    expect(everShown.size).toBe(s.challenges.length);
    expect(new Set(g.drawn).size).toBe(g.drawn.length);
    expect(g.claims).toHaveLength(s.challenges.length);
    expect(poolRemaining(g, s)).toEqual({ joueur: 0, croupier: 0 });
    const total = g.players.reduce((sum, p) => sum + p.bonus, 0);
    expect(total).toBe(s.challenges.reduce((sum, c) => sum + c.reward, 0));
  });

  it('signale le type dont la pioche est vide au remplissage', () => {
    const s = settings({ dealerSlots: 5 });
    const r = createGame(['A', 'B', 'C'], s, seeded(2), 1);
    expect(r.empty).toEqual(['croupier']);
    expect(counts(r.game, s)).toEqual({ joueur: 3, croupier: 4 });
  });

  it("remplace une carte dont le défi a été supprimé des réglages", () => {
    const s = settings();
    const g = newGame(undefined, s);
    const s2 = removeChallenge(s, g.current[0]);
    const r = fillChallenges(g, s2, seeded(5));
    expect(r.game.current).not.toContain(g.current[0]);
    expect(counts(r.game, s2)).toEqual({ joueur: 3, croupier: 1 });
  });
});

describe('cartes face cachée', () => {
  it('compte les cartes à retourner', () => {
    const s = settings();
    let g = newGame(undefined, s);
    expect(unflippedCount(g, s)).toBe(4);
    g = flipCard(g, g.current[0]);
    expect(unflippedCount(g, s)).toBe(3);
    expect(flipCard(g, g.current[0])).toBe(g);
    g = flipAll(g);
    expect(unflippedCount(g, s)).toBe(0);
  });

  it('affiche les défis joueurs avant les défis croupier', () => {
    const s = settings();
    const g = newGame(undefined, s, 21);
    const kinds = tableChallenges(g, s).map(kindOf);
    expect(kinds).toEqual(['joueur', 'joueur', 'joueur', 'croupier']);
  });
});
