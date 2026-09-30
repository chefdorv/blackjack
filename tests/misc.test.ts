import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/game/defaults';
import { signed } from '../src/game/format';
import { HISTORY_MAX, pushHistory } from '../src/game/history';
import { addName, canStart, cleanName, moveItem, nameError } from '../src/game/names';
import { emptyState, normalizePersisted } from '../src/game/persist';
import { betFor, fixBets, normalizeSettings, setBet, setNumber } from '../src/game/settings';
import { newGame, settings } from './helpers';

describe('noms des joueurs', () => {
  it('coupe à 16 caractères et refuse vides, doublons et table pleine', () => {
    expect(cleanName('  Jean   Pierre de la Fontaine ')).toBe('Jean Pierre de l');
    expect(nameError('   ', [])).toBe('vide');
    expect(nameError('alice', ['Alice'])).toBe('doublon');
    expect(nameError('Zoé', ['1', '2', '3', '4', '5', '6', '7', '8'])).toBe('complet');
    expect(addName('Bob', ['Alice'])).toEqual(['Alice', 'Bob']);
    expect(addName('ALICE', ['Alice'])).toEqual(['Alice']);
  });

  it('réordonne et vérifie le nombre de joueurs', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(canStart(['a', 'b'])).toBe(false);
    expect(canStart(['a', 'b', 'c'])).toBe(true);
    expect(canStart(['1', '2', '3', '4', '5', '6', '7', '8', '9'])).toBe(false);
  });
});

describe('réglages', () => {
  it('prolonge les mises quand on ajoute des manches et garde min ≤ max', () => {
    const s = setNumber(defaultSettings(), 'rounds', 5);
    expect(s.bets.slice(0, 5)).toEqual([
      { min: 2, max: 10 },
      { min: 4, max: 20 },
      { min: 6, max: 30 },
      { min: 8, max: 40 },
      { min: 10, max: 50 },
    ]);
    expect(setBet(s, 0, 'min', 15).bets[0]).toEqual({ min: 15, max: 15 });
    expect(setBet(s, 0, 'max', 1).bets[0]).toEqual({ min: 1, max: 1 });
    expect(fixBets({ ...s, bets: [{ min: 9, max: 3 }] }).bets[0]).toEqual({ min: 3, max: 9 });
    expect(betFor(s, 99)).toEqual(s.bets[s.bets.length - 1]);
  });

  it('borne les valeurs saisies', () => {
    const s = defaultSettings();
    expect(setNumber(s, 'rounds', 0).rounds).toBe(1);
    expect(setNumber(s, 'rounds', '42').rounds).toBe(10);
    expect(setNumber(s, 'deals', 'abc').deals).toBe(1);
  });

  it('répare des réglages sauvegardés abîmés', () => {
    const s = normalizeSettings({ rounds: 4, deals: 'x', bets: [{ min: 3, max: 12 }], challenges: [{ id: 'a', level: 'nope', text: 't' }, { id: 'b', level: 'moyen', text: 'ok', reward: 12 }] });
    expect(s.rounds).toBe(4);
    expect(s.deals).toBe(1);
    expect(s.bets).toHaveLength(4);
    expect(s.challenges).toEqual([{ id: 'b', level: 'moyen', reward: 12, text: 'ok' }]);
    expect(normalizeSettings(null)).toEqual(defaultSettings());
  });
});

describe('historique d’annulation', () => {
  it('garde au plus 60 actions et copie la partie', () => {
    const g = newGame(undefined, settings());
    let h = pushHistory([], 'x', g);
    g.round = 99;
    expect(h[0].game.round).toBe(1);
    for (let i = 0; i < 80; i++) h = pushHistory(h, 'a' + i, g);
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h[h.length - 1].label).toBe('a79');
  });
});

describe('sauvegarde', () => {
  it('relit un état sauvegardé à l’identique', () => {
    const g = newGame(undefined, settings());
    const state = { ...emptyState(), game: g, history: pushHistory([], 'Donne suivante', g), setupNames: ['Alice', 'Bob', 'Chloé'], tab: 'defis' as const };
    expect(normalizePersisted(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('tolère n’importe quoi', () => {
    expect(normalizePersisted('pas du json')).toEqual(emptyState());
    expect(normalizePersisted({ game: { players: 'x' }, tab: 'nulle-part', history: [1, 2] })).toEqual(emptyState());
  });
});

describe('format', () => {
  it('signe les nombres avec un vrai moins', () => {
    expect([signed(5), signed(-5), signed(0)]).toEqual(['+5', '−5', '0']);
  });
});
