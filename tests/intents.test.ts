import { describe, expect, it } from 'vitest';
import { applyIntent, parseIntent } from '../src/game/intents';
import type { Game } from '../src/game/types';
import { createVirtualGame, turnPid } from '../src/game/virtual';
import { seeded, settings } from './helpers';

const rng = seeded(9);
const s = settings();

function start(): Game {
  return createVirtualGame(['Alice', 'Bob', 'Chloé'], s, 'tournant', seeded(1), 1_000_000).game;
}

describe('intentions', () => {
  it('la donne part quand le dernier joueur est prêt', () => {
    const g = start();
    const [, bob, chloe] = g.players;
    let r = applyIntent(g, s, { t: 'ready', pids: [bob.id], ready: true }, rng);
    expect(r.game.virtual?.phase).toBe('mises');
    expect(r.events).toEqual([]);
    r = applyIntent(r.game, s, { t: 'ready', pids: [chloe.id], ready: true }, rng);
    expect(r.game.virtual?.phase).not.toBe('mises');
    expect(r.events[0]).toEqual({ e: 'donne' });
  });

  it('refuse un geste joué par un autre que le joueur dont c’est le tour', () => {
    const g = start();
    const ids = g.players.map((p) => p.id);
    let x = applyIntent(g, s, { t: 'ready', pids: ids, ready: true }, rng).game;
    if (x.virtual?.phase !== 'jeu') return; // donne déjà finie (blackjacks) : rien à vérifier
    const turn = turnPid(x);
    const other = ids.find((id) => id !== turn && id !== x.players[x.dealer].id) ?? ids[0];
    expect(applyIntent(x, s, { t: 'play', pid: other, action: 'rester' }, rng).game).toBe(x);
    if (turn) {
      expect(applyIntent(x, s, { t: 'play', pid: turn, action: 'rester' }, rng, [other]).game).toBe(x);
      x = applyIntent(x, s, { t: 'play', pid: turn, action: 'rester' }, rng, [turn]).game;
      expect(turnPid(x)).not.toBe(turn);
    }
  });

  it('un appareil ne peut miser que pour ses joueurs', () => {
    const g = start();
    const bob = g.players[1].id;
    expect(applyIntent(g, s, { t: 'bet', pid: bob, amount: 8 }, rng, ['autre']).game).toBe(g);
    expect(applyIntent(g, s, { t: 'bet', pid: bob, amount: 8 }, rng, [bob]).game.virtual?.bets[bob]).toBe(8);
  });

  it('un défi validé automatiquement ne se réclame pas à la main', () => {
    const g = start();
    const cid = g.current[0];
    expect(applyIntent(g, s, { t: 'claim', cid, pid: g.players[1].id }, rng).game).toBe(g);
  });

  it('relit les messages reçus et rejette ceux qui sont mal formés', () => {
    expect(parseIntent({ t: 'play', pid: 'p', action: 'tirer' })).toEqual({ t: 'play', pid: 'p', action: 'tirer' });
    expect(parseIntent({ t: 'play', pid: 'p', action: 'tricher' })).toBeNull();
    expect(parseIntent({ t: 'bet', pid: 'p', amount: 'beaucoup' })).toBeNull();
    expect(parseIntent({ t: 'ready', pids: [1], ready: true })).toBeNull();
    expect(parseIntent('next')).toBeNull();
    expect(parseIntent({ t: 'next' })).toEqual({ t: 'next' });
  });
});
