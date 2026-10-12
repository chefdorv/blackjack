import { describe, expect, it } from 'vitest';
import { cleanRoomCode, controlled, joinLobby, leaveLobby, newRoomCode, parseMessage, redact, seatsFor } from '../src/net/protocol';
import { createVirtualGame } from '../src/game/virtual';
import { seeded, settings } from './helpers';

describe('salle d’attente', () => {
  it('codes de salle lisibles', () => {
    const code = newRoomCode(seeded(4));
    expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(cleanRoomCode(' kr-bx ')).toBe('KRBX');
    expect(cleanRoomCode('KRB')).toBeNull();
    expect(cleanRoomCode('KROB')).toBeNull();
  });

  it('chaque appareil apporte ses joueurs, sans doublon de nom', () => {
    let r = joinLobby([], 'hote', ['Alice']);
    r = joinLobby(r.lobby, 'tel-b', ['Bob', 'alice']);
    expect(r.refused).toEqual(['alice']);
    expect(r.lobby).toEqual([
      { name: 'Alice', device: 'hote' },
      { name: 'Bob', device: 'tel-b' },
    ]);
    // L'appareil renomme ses joueurs : Bob garde sa place, Bea s'ajoute à la fin.
    r = joinLobby(joinLobby(r.lobby, 'tel-c', ['Chloé']).lobby, 'tel-b', ['Bob', 'Bea']);
    expect(r.lobby.map((e) => e.name)).toEqual(['Alice', 'Bob', 'Chloé', 'Bea']);
    expect(leaveLobby(r.lobby, 'tel-b').map((e) => e.name)).toEqual(['Alice', 'Chloé']);
  });

  it('table complète à 8', () => {
    const many = Array.from({ length: 8 }, (_, i) => 'J' + i);
    const r = joinLobby(joinLobby([], 'a', many).lobby, 'b', ['Zoé']);
    expect(r.refused).toEqual(['Zoé']);
  });

  it('associe les joueurs de la partie aux appareils', () => {
    const lobby = joinLobby(joinLobby([], 'hote', ['Alice', 'Chloé']).lobby, 'tel-b', ['Bob']).lobby;
    const g = createVirtualGame(['Alice', 'Bob', 'Chloé'], settings(), 'tournant', seeded(1), 1).game;
    const seats = seatsFor(g, lobby);
    expect(controlled(seats, 'hote')).toEqual([g.players[0].id, g.players[2].id]);
    expect(controlled(seats, 'tel-b')).toEqual([g.players[1].id]);
  });
});

describe('messages', () => {
  it('l’état envoyé aux invités ne contient pas l’ordre du sabot', () => {
    const g = createVirtualGame(['Alice', 'Bob'], settings(), 'tournant', seeded(1), 1).game;
    const sent = JSON.parse(JSON.stringify({ k: 'state', from: 'hote', rev: 1, game: redact(g), settings: settings(), seats: {}, lobby: [] }));
    const m = parseMessage(sent);
    expect(m?.k).toBe('state');
    if (m?.k !== 'state') return;
    expect(m.game.virtual?.shoe.cards).toEqual([]);
    expect(m.game.virtual?.chips).toEqual(g.virtual?.chips);
    expect(g.virtual?.shoe.cards.length).toBe(312);
  });

  it('rejette les messages mal formés', () => {
    expect(parseMessage({ k: 'hello', names: ['x'] })).toBeNull();
    expect(parseMessage({ k: 'intent', from: 'a', intent: { t: 'play', pid: 'p', action: 'voler' } })).toBeNull();
    expect(parseMessage({ k: 'state', from: 'a', rev: 1, game: { players: [] } })).toBeNull();
    expect(parseMessage({ k: 'hello', from: 'a', names: ['  Bob  ', 3, ''] })).toEqual({ k: 'hello', from: 'a', names: ['Bob'] });
  });
});
