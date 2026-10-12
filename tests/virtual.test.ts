import { describe, expect, it } from 'vitest';
import { isCard, stackedShoe, type Card } from '../src/game/blackjack';
import { defaultChallenges } from '../src/game/defaults';
import { emptyState, normalizePersisted } from '../src/game/persist';
import { liveRanking, pending } from '../src/game/scoring';
import { normalizeSettings, updateChallenge } from '../src/game/settings';
import type { Game, Settings, Virtual } from '../src/game/types';
import {
  addPlayers,
  allReady,
  betRange,
  chooseBet,
  claimVirtual,
  createVirtualGame,
  deal,
  finishVirtual,
  nextDeal,
  nextManche,
  play,
  seatedPlayers,
  setReady,
  turnPid,
} from '../src/game/virtual';
import { seeded, settings as baseSettings } from './helpers';

/** Mises 2–10 / 4–20 / 6–30 : les montants des scénarios ci-dessous ont été calculés avec elles. */
function settings(patch: Partial<Settings> = {}): Settings {
  return baseSettings({ bets: [{ min: 2, max: 10 }, { min: 4, max: 20 }, { min: 6, max: 30 }], ...patch });
}

function cards(s: string): Card[] {
  if (!s) return [];
  const list = s.split(' ');
  for (const c of list) if (!isCard(c)) throw new Error('carte inconnue ' + c);
  return list as Card[];
}

function vOf(g: Game): Virtual {
  if (!g.virtual) throw new Error('pas de partie virtuelle');
  return g.virtual;
}

const rng = seeded(3);
const NAMES = ['Alice', 'Bob', 'Chloé'];

function start(mode: 'tournant' | 'banque' = 'tournant', s: Settings = settings()): Game {
  return createVirtualGame(NAMES, s, mode, seeded(1), 1_000_000).game;
}

/** Sabot truqué et défis choisis (aucun par défaut) pour des donnes prévisibles. */
function rig(game: Game, order: string, current: string[] = []): Game {
  const g = structuredClone(game);
  vOf(g).shoe = stackedShoe(cards(order));
  g.current = current.slice();
  g.flipped = current.slice();
  g.drawn = Array.from(new Set([...g.drawn, ...current]));
  return g;
}

function id(g: Game, name: string): string {
  const p = g.players.find((x) => x.name === name);
  if (!p) throw new Error('joueur inconnu ' + name);
  return p.id;
}

/** Mises de chacun, tout le monde prêt, distribution. */
function bet(g: Game, s: Settings, bets: Record<string, number>): Game {
  let x = g;
  for (const [name, amount] of Object.entries(bets)) x = chooseBet(x, s, id(x, name), amount);
  x = setReady(
    x,
    seatedPlayers(x).map((p) => p.id),
    true,
  );
  return deal(x, s, rng);
}

function standAll(g: Game, s: Settings): Game {
  let x = g;
  while (turnPid(x)) x = play(x, s, 'rester', rng);
  return x;
}

describe('création', () => {
  it('donne un tas à chacun et pose les défis face visible', () => {
    const s = settings();
    const g = start();
    const v = vOf(g);
    expect(Object.values(v.chips)).toEqual([100, 100, 100]);
    expect(v.phase).toBe('mises');
    expect(g.flipped).toEqual(g.current);
    expect(v.shoe.cards).toHaveLength(312);
    expect(betRange(g, s, id(g, 'Bob'))).toEqual({ min: 2, max: 10 });
  });

  it('banque automatique : pas de défi croupier, tout le monde mise', () => {
    const g = start('banque');
    const croupier = defaultChallenges().filter((c) => c.level === 'croupier').map((c) => c.id);
    expect(g.current.some((c) => croupier.includes(c))).toBe(false);
    expect(g.current).toHaveLength(3);
    expect(seatedPlayers(g).map((p) => p.name)).toEqual(NAMES);
  });

  it('croupier tournant : le croupier ne mise pas', () => {
    expect(seatedPlayers(start()).map((p) => p.name)).toEqual(['Bob', 'Chloé']);
  });
});

describe('mises', () => {
  it('bornées par la manche et par le tas', () => {
    const s = settings();
    let g = start();
    g = chooseBet(g, s, id(g, 'Bob'), 50);
    expect(vOf(g).bets[id(g, 'Bob')]).toBe(10);
    g = chooseBet(g, s, id(g, 'Bob'), 0);
    expect(vOf(g).bets[id(g, 'Bob')]).toBe(2);
    const low = structuredClone(g);
    vOf(low).chips[id(g, 'Bob')] = 7;
    expect(betRange(low, s, id(g, 'Bob'))).toEqual({ min: 2, max: 7 });
    vOf(low).chips[id(g, 'Bob')] = 1;
    expect(betRange(low, s, id(g, 'Bob'))).toEqual({ min: 1, max: 1 });
  });

  it('le croupier ne peut pas miser, et la donne attend que tout le monde soit prêt', () => {
    const s = settings();
    let g = start();
    expect(chooseBet(g, s, id(g, 'Alice'), 5)).toBe(g);
    g = setReady(g, [id(g, 'Bob')], true);
    expect(allReady(g)).toBe(false);
    expect(deal(g, s, rng)).toBe(g);
    g = setReady(g, [id(g, 'Chloé'), id(g, 'Alice')], true);
    expect(vOf(g).ready).toEqual([id(g, 'Bob'), id(g, 'Chloé')]);
    expect(allReady(g)).toBe(true);
  });
});

describe('donne avec croupier tournant', () => {
  it('le croupier encaisse les pertes et paie les gains', () => {
    const s = settings();
    // Bob 10 9 = 19, Chloé 10 7 = 17, croupier 10 puis 8 = 18
    let g = bet(rig(start(), '10♠ 10♥ 10♦ 9♣ 7♠ 8♥'), s, { Bob: 10, Chloé: 6 });
    expect(vOf(g).phase).toBe('jeu');
    expect(turnPid(g)).toBe(id(g, 'Bob'));
    g = standAll(g, s);
    const v = vOf(g);
    expect(v.phase).toBe('bilan');
    expect(v.chips).toEqual({ [id(g, 'Alice')]: 96, [id(g, 'Bob')]: 110, [id(g, 'Chloé')]: 94 });
    expect(v.last?.nets).toEqual({ [id(g, 'Bob')]: 10, [id(g, 'Chloé')]: -6, [id(g, 'Alice')]: -4 });
  });

  it('compte les blackjacks des joueurs et du croupier', () => {
    const s = settings();
    // Bob A K = blackjack ; Chloé 9 9 ; croupier A puis K = blackjack
    let g = bet(rig(start(), 'A♠ 9♥ A♦ K♣ 9♠ K♥'), s, { Bob: 4, Chloé: 4 });
    g = standAll(g, s);
    expect(g.players.map((p) => p.bj)).toEqual([1, 1, 0]);
    expect(vOf(g).last?.nets[id(g, 'Bob')]).toBe(0);
  });

  it('recave automatique d’un joueur à 0', () => {
    const s = settings();
    // Bob 10 9 = 19 (égalité), Chloé 10 6 = 16 perd contre 10 9
    let g = rig(start(), '10♠ 10♥ 10♦ 9♣ 6♠ 9♥');
    vOf(g).chips[id(g, 'Chloé')] = 5;
    g = bet(g, s, { Bob: 2, Chloé: 5 });
    g = standAll(g, s);
    const chloe = g.players[2];
    expect(vOf(g).chips[chloe.id]).toBe(30);
    expect(chloe.rebuys).toBe(1);
    expect(pending(chloe, s)).toBe(-50);
    expect(vOf(g).last?.rebuys).toEqual([chloe.id]);
  });

  it('un croupier qui ne peut pas payer toute la table se recave autant que nécessaire', () => {
    const s = settings({ rebuyChips: 15 });
    // Bob et Chloé font blackjack (15 chacun), croupier 9 puis 7
    let g = rig(start('tournant', s), 'A♠ A♥ 9♦ K♣ Q♠ 7♥');
    vOf(g).chips[id(g, 'Alice')] = 10;
    g = bet(g, s, { Bob: 10, Chloé: 10 });
    expect(vOf(g).phase).toBe('bilan');
    // 10 − 30 = −20 → deux recaves de 15 → 10
    expect(vOf(g).chips[id(g, 'Alice')]).toBe(10);
    expect(g.players[0].rebuys).toBe(2);
  });
});

describe('défis validés automatiquement', () => {
  it('21 avec 3 cartes : gain crédité sur le tas, carte remplacée face visible', () => {
    const s = settings();
    // Bob 5 6 tire 10 = 21 ; Chloé 10 8 ; croupier 10 puis 7
    let g = bet(rig(start(), '5♠ 10♥ 10♦ 6♣ 8♠ 10♣ 7♥', ['c12']), s, { Bob: 2, Chloé: 2 });
    g = play(g, s, 'tirer', rng);
    g = standAll(g, s);
    const bob = g.players[1];
    expect(vOf(g).last?.claims).toEqual([{ pid: bob.id, cid: 'c12', text: 'Faire 21 avec 3 cartes.', reward: 15 }]);
    expect(vOf(g).chips[bob.id]).toBe(100 + 2 + 15);
    expect(bob.bonus).toBe(15);
    expect(pending(bob, s)).toBe(0);
    expect(g.current).not.toContain('c12');
    // la table est complétée (3 défis joueurs + 1 croupier), face visible
    expect(g.current).toHaveLength(4);
    expect(g.flipped).toEqual(g.current);
    expect(g.claims[0]).toMatchObject({ cid: 'c12', pid: bob.id, round: 1 });
  });

  it('le premier joueur de la table qui réussit le défi le remporte', () => {
    const s = settings();
    // Bob 10 10 = 20 et Chloé 10 10 = 20 gagnent contre 10 8
    let g = bet(rig(start(), '10♠ 10♥ 10♦ 10♣ 10♥ 8♠', ['c4']), s, { Bob: 2, Chloé: 2 });
    g = standAll(g, s);
    expect(vOf(g).last?.claims.map((c) => c.pid)).toEqual([id(g, 'Bob')]);
  });

  it('défi croupier réservé au croupier : battre tous les joueurs', () => {
    const s = settings();
    let g = bet(rig(start(), '10♠ 10♥ 10♦ 7♣ 8♠ 9♥', ['c21', 'c4']), s, { Bob: 2, Chloé: 2 });
    g = standAll(g, s);
    expect(vOf(g).last?.claims).toEqual([{ pid: id(g, 'Alice'), cid: 'c21', text: 'Battre tous les joueurs sur une même donne.', reward: 10 }]);
  });

  it('série de 3 mains gagnées, une égalité ne casse pas la série', () => {
    const s = settings({ deals: 5 });
    const win = '10♠ 2♥ 10♦ 10♣ 2♠ 7♥'; // Bob 20 contre 17, Chloé 4 perd
    const push = '10♥ 2♦ 10♣ Q♠ 2♣ K♦'; // Bob 20 contre 20
    let g = rig(start('tournant', s), [win, push, win, win].join(' '), ['c9']);
    const claimsAfter: number[] = [];
    for (let d = 0; d < 4; d++) {
      g = standAll(bet(g, s, { Bob: 2, Chloé: 2 }), s);
      claimsAfter.push(g.claims.length);
      const n = nextDeal(g, s);
      if (!n) throw new Error('pas de donne suivante');
      g = n.game;
    }
    expect(claimsAfter).toEqual([0, 0, 0, 1]);
    expect(g.claims[0]).toMatchObject({ cid: 'c9', pid: id(g, 'Bob') });
  });
});

describe('enchaînement', () => {
  it('donne suivante, croupier suivant, fin de manche, manche suivante', () => {
    const s = settings({ deals: 1, rounds: 2 });
    let g = start('tournant', s);
    const steps: string[] = [];
    for (let i = 0; i < 3; i++) {
      g = bet(g, s, {});
      g = standAll(g, s);
      const n = nextDeal(g, s);
      if (!n) throw new Error('bloqué');
      steps.push(n.event);
      g = n.game;
    }
    expect(steps).toEqual(['croupier', 'croupier', 'fin-de-manche']);
    expect(g.settling).toEqual({ round: 1 });
    vOf(g).bjRound[id(g, 'Bob')] = 1;
    const m = nextManche(g, s, rng);
    expect(m.finished).toBe(false);
    expect(m.game.round).toBe(2);
    expect(vOf(m.game).bjRound).toEqual({});
    expect(seatedPlayers(m.game).map((p) => p.name)).toEqual(['Bob', 'Chloé']);
    // mises de la manche 2 : 4 à 20
    expect(vOf(m.game).bets[id(g, 'Bob')]).toBeGreaterThanOrEqual(4);
  });

  it('banque automatique : une manche dure le nombre de donnes réglé, quel que soit le nombre de joueurs', () => {
    const s = settings({ deals: 2, bankDeals: 4 });
    let g = start('banque', s);
    let n = 0;
    for (;;) {
      g = standAll(bet(g, s, {}), s);
      n++;
      const r = nextDeal(g, s);
      if (!r) throw new Error('bloqué');
      g = r.game;
      if (r.event === 'fin-de-manche') break;
    }
    expect(n).toBe(4);
  });

  it('fin de partie : les tas deviennent le décompte final', () => {
    const s = settings({ deals: 1, rounds: 1 });
    let g = start('tournant', s);
    vOf(g).chips[id(g, 'Bob')] = 140;
    g.players[1].rebuys = 1;
    const end = finishVirtual(g);
    expect(end.finished).toBe(true);
    expect(end.revealed).toBe(true);
    expect(end.players.map((p) => p.final)).toEqual([100, 140, 100]);
    const rows = liveRanking(g, s);
    expect(rows.find((r) => r.name === 'Bob')?.score).toBe(90);
  });

  it('défi personnalisé réclamé à la main : jetons sur le tas', () => {
    const s = settings();
    const g = rig(start(), '', ['c1']);
    const r = claimVirtual(g, s, 'c1', id(g, 'Chloé'), rng);
    if (!r.ok) throw new Error('réclamation refusée');
    expect(vOf(r.game).chips[id(g, 'Chloé')]).toBe(105);
  });
});

describe('sauvegarde', () => {
  it('une donne en cours survit à un rechargement', () => {
    const s = settings();
    const g = bet(rig(start(), '5♠ 10♥ 10♦ 6♣ 8♠ 10♣ 7♥'), s, { Bob: 3, Chloé: 2 });
    const state = { ...emptyState(), game: g, setupMode: 'tournant' as const };
    const back = normalizePersisted(JSON.parse(JSON.stringify(state)));
    expect(back.game).toEqual(g);
    expect(back.setupMode).toBe('tournant');
  });

  it('une donne corrompue revient à la phase des mises', () => {
    const g = start();
    const raw = JSON.parse(JSON.stringify({ ...emptyState(), game: { ...g, virtual: { ...vOf(g), phase: 'jeu', round: { seats: 'x' } } } }));
    expect(normalizePersisted(raw).game?.virtual?.phase).toBe('mises');
  });

  it('retrouve la validation automatique des défis d’origine dans d’anciens réglages', () => {
    const old = defaultChallenges().map((c) => ({ id: c.id, level: c.level, reward: c.reward, text: c.text }));
    const s = normalizeSettings({ challenges: old });
    expect(s.challenges.every((c) => c.auto !== undefined)).toBe(true);
    expect(s.table.decks).toBe(6);
    const edited = updateChallenge(s, 'c1', { text: 'Autre chose' });
    expect(edited.challenges[0].auto).toBeUndefined();
    expect(updateChallenge(edited, 'c1', { text: 'Gagner une main après avoir doublé.' }).challenges[0].auto).toBe('double-gagne');
  });
});

describe('arrivée en cours de partie', () => {
  it('un joueur s’assoit en bout de table au début de la manche suivante', () => {
    const s = settings({ deals: 1, rounds: 2 });
    let g = start('tournant', s);
    for (let i = 0; i < 3; i++) {
      g = standAll(bet(g, s, {}), s);
      // en pleine manche (croupier suivant) : refusé
      expect(addPlayers(g, s, ['Zoé'])).toBe(g);
      const n = nextDeal(g, s);
      if (!n) throw new Error('bloqué');
      g = n.game;
      if (i === 0) expect(addPlayers(g, s, ['Zoé'])).toBe(g);
    }
    // bilan de fin de manche : toujours refusé
    expect(addPlayers(g, s, ['Zoé'])).toBe(g);
    g = nextManche(g, s, rng).game;
    const after = addPlayers(g, s, ['Zoé', 'alice'], 5);
    expect(after.players.map((p) => p.name)).toEqual(['Alice', 'Bob', 'Chloé', 'Zoé']);
    const zoe = after.players[3];
    expect(vOf(after).chips[zoe.id]).toBe(100);
    expect(seatedPlayers(after).map((p) => p.name)).toEqual(['Bob', 'Chloé', 'Zoé']);
    // elle sera croupier à son tour : la manche dure maintenant 4 croupiers
    let x = after;
    const dealers: string[] = [];
    for (let i = 0; i < 4; i++) {
      dealers.push(x.players[x.dealer].name);
      x = standAll(bet(x, s, {}), s);
      const n = nextDeal(x, s);
      if (!n) throw new Error('bloqué');
      x = n.game;
    }
    expect(dealers).toEqual(['Alice', 'Bob', 'Chloé', 'Zoé']);
    expect(x.settling).toEqual({ round: 2 });
  });
});

