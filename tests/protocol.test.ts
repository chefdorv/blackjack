import { describe, expect, it } from 'vitest';
import { freshTables, parseTable, TABLE_TTL_MS } from '../src/net/directory';
import { normalizePersisted } from '../src/game/persist';
import { cleanRoomCode, controlled, joinLobby, knownDevices, leaveLobby, newRoomCode, parseMessage, redact, seatsFor } from '../src/net/protocol';
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

describe('salle verrouillée', () => {
  it('le refus ne vise qu’un appareil', () => {
    expect(parseMessage({ k: 'locked', from: 'dh', to: 'dx' })).toEqual({ k: 'locked', from: 'dh', to: 'dx' });
    expect(parseMessage({ k: 'locked', from: 'dh' })).toBeNull();
  });
  it('ceux déjà dans la salle peuvent revenir', () => {
    const known = knownDevices({ lobby: [{ name: 'Alice', device: 'da' }], seats: { p2: 'db' }, guests: [{ name: 'Zoé', device: 'dz' }] });
    expect([...known].sort()).toEqual(['da', 'db', 'dz']);
    expect(knownDevices({ lobby: [], seats: null, guests: [] }).size).toBe(0);
  });
  it('une salle sauvegardée sans verrou est ouverte', () => {
    const base = { settings: {}, room: { role: 'host', code: 'ABCD', mode: 'tournant', lobby: [], seats: null, guests: [] } };
    const open = normalizePersisted(base).room;
    expect(open?.role === 'host' && open.locked).toBe(false);
    const locked = normalizePersisted({ ...base, room: { ...base.room, locked: true } }).room;
    expect(locked?.role === 'host' && locked.locked).toBe(true);
  });
});

describe('parties ouvertes', () => {
  const t = { code: 'abcd', host: ['  Alice '], players: 3, started: true, round: 2, rounds: 3, mode: 'banque' };
  it('relit une annonce défensivement', () => {
    expect(parseTable(t)).toEqual({ code: 'ABCD', host: ['Alice'], players: 3, started: true, round: 2, rounds: 3, mode: 'banque' });
    expect(parseTable({ ...t, code: 'AB' })).toBeNull();
    expect(parseTable({ ...t, players: 99, mode: 'x', host: 'Alice' })).toMatchObject({ players: 8, mode: 'tournant', host: [] });
  });
  it('oublie les salles qui ne s’annoncent plus', () => {
    const a = parseTable(t)!;
    const b = { ...a, code: 'EFGH' };
    const seen = { ABCD: { table: a, at: 1000 }, EFGH: { table: b, at: 5000 } };
    expect(freshTables(seen, 6000).map((x) => x.code)).toEqual(['EFGH', 'ABCD']);
    expect(freshTables(seen, 1000 + TABLE_TTL_MS + 1).map((x) => x.code)).toEqual(['EFGH']);
  });
});
