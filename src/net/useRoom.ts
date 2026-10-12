// Contrôleur de salle en ligne : ouvre le canal, échange les messages,
// suit qui est connecté. L'hôte diffuse l'état de la partie ; l'invité l'affiche et envoie
// ses demandes. La logique de jeu reste entièrement chez l'hôte.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Intent } from '../game/intents';
import type { PersistedRoom } from '../game/persist';
import type { DealerMode, Game, Settings } from '../game/types';
import { parseMessage, redact, type LobbyEntry, type NetMessage, type Seats } from './protocol';
import { openTransport, type Transport, type TransportKind, type TransportStatus } from './transport';

export type Room = PersistedRoom;

export interface GuestView {
  rev: number;
  game: Game;
  settings: Settings;
  seats: Seats;
  /** Appareils arrivés en cours de partie, en attente de la manche suivante. */
  guests: LobbyEntry[];
}

const HEARTBEAT_MS = 4000;
/** Au-delà, un appareil silencieux est affiché comme déconnecté. */
export const OFFLINE_MS = 12000;

export interface RoomApi {
  status: TransportStatus | null;
  /** Invité : dernière table reçue de l'hôte (null avant le lancement). */
  view: GuestView | null;
  /** Salle d'attente : celle de l'hôte, ou la dernière reçue par l'invité. */
  lobby: LobbyEntry[];
  /** Mode annoncé par l'hôte (invité). */
  mode: DealerMode;
  /** Appareils silencieux depuis trop longtemps (hôte compris, vu d'un invité). */
  offline: (device: string) => boolean;
  hostOffline: boolean;
  closedByHost: boolean;
  /** Invité : l'hôte a verrouillé la salle avant qu'on y entre. */
  lockedOut: boolean;
  sendIntent: (intent: Intent) => void;
  close: (farewell: boolean) => void;
}

export function useRoom({
  kind,
  room,
  device,
  hostGame,
  hostSettings,
  onHello,
  onLeave,
  onIntent,
}: {
  kind: TransportKind | null;
  room: Room | null;
  device: string;
  hostGame: Game | null;
  hostSettings: Settings;
  /** Hôte : un appareil annonce ses joueurs (salle d'attente) ; false s'il est refusé (salle verrouillée). */
  onHello: (from: string, names: string[]) => boolean;
  onLeave: (from: string) => void;
  /** Hôte : demande d'un invité. */
  onIntent: (from: string, intent: Intent) => void;
}): RoomApi {
  const [status, setStatus] = useState<TransportStatus | null>(null);
  const [view, setView] = useState<GuestView | null>(null);
  const [guestLobby, setGuestLobby] = useState<{ lobby: LobbyEntry[]; mode: DealerMode }>({ lobby: [], mode: 'tournant' });
  const [closedByHost, setClosedByHost] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);
  const refused = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Record<string, number>>({});
  // Début de l'écoute : un appareil pas encore entendu n'est pas « déconnecté » avant OFFLINE_MS.
  const since = useRef(Date.now());
  const hostDevice = useRef<string | null>(null);
  const transport = useRef<Transport | null>(null);
  const rev = useRef(0);
  const hasView = useRef(false);
  hasView.current = view !== null;

  // Les gestionnaires lisent toujours les dernières valeurs.
  const latest = useRef({ room, hostGame, hostSettings, onHello, onLeave, onIntent });
  latest.current = { room, hostGame, hostSettings, onHello, onLeave, onIntent };

  const send = (m: NetMessage) => transport.current?.send(m);

  const sendState = () => {
    const { room: r, hostGame: g, hostSettings: s } = latest.current;
    if (r?.role !== 'host') return;
    if (!r.seats || !g?.virtual) {
      send({ k: 'lobby', from: device, lobby: r.lobby, mode: r.mode });
      return;
    }
    rev.current = Math.max(rev.current + 1, Date.now());
    send({ k: 'state', from: device, rev: rev.current, game: redact(g), settings: s, seats: r.seats, lobby: r.lobby, guests: r.guests });
  };

  const key = room && kind ? kind + ':' + room.role + ':' + room.code : null;
  useEffect(() => {
    if (!room || !kind) return;
    setView(null);
    setClosedByHost(false);
    setLockedOut(false);
    refused.current = false;
    seen.current = {};
    since.current = Date.now();
    hostDevice.current = null;
    const t = openTransport(
      kind,
      room.code,
      (raw) => {
        const m = parseMessage(raw);
        if (!m || m.from === device) return;
        seen.current[m.from] = Date.now();
        const r = latest.current.room;
        if (r?.role === 'host') {
          if (m.k === 'hello') {
            if (!latest.current.onHello(m.from, m.names)) {
              send({ k: 'locked', from: device, to: m.from });
              return;
            }
            // Partie lancée : l'appareil (re)venu reçoit la table, une fois son arrivée notée par l'hôte.
            if (r.seats) window.setTimeout(sendState, 0);
          } else if (m.k === 'intent') latest.current.onIntent(m.from, m.intent);
          else if (m.k === 'leave') latest.current.onLeave(m.from);
        } else if (r?.role === 'guest') {
          if (m.k === 'lobby' || m.k === 'state' || m.k === 'closed') hostDevice.current = m.from;
          if (m.k === 'lobby' || m.k === 'state') {
            // Refusé par une salle verrouillée : on ne regarde pas la table des autres,
            // sauf si l'hôte nous a finalement accueillis (salle rouverte entre-temps).
            const me = m.lobby.some((e) => e.device === device) || (m.k === 'state' && (Object.values(m.seats).includes(device) || m.guests.some((e) => e.device === device)));
            if (refused.current && !me) return;
            if (me && refused.current) {
              refused.current = false;
              setLockedOut(false);
            }
          }
          if (m.k === 'lobby') {
            // L'hôte est (re)venu à la salle d'attente : on quitte la table précédente.
            setGuestLobby({ lobby: m.lobby, mode: m.mode });
            setView(null);
          } else if (m.k === 'state') {
            setGuestLobby((x) => ({ ...x, lobby: m.lobby }));
            setView((cur) => (cur && cur.rev >= m.rev ? cur : { rev: m.rev, game: m.game, settings: m.settings, seats: m.seats, guests: m.guests }));
          } else if (m.k === 'closed') setClosedByHost(true);
          else if (m.k === 'locked' && m.to === device) {
            refused.current = true;
            setLockedOut(true);
            setView(null);
            setGuestLobby((x) => ({ ...x, lobby: [] }));
          }
        }
      },
      (st) => {
        setStatus(st);
        if (st !== 'connecte') return;
        since.current = Date.now();
        const r = latest.current.room;
        if (r?.role === 'guest') send({ k: 'hello', from: device, names: r.names });
        else sendState();
      },
    );
    transport.current = t;
    const beat = window.setInterval(() => {
      const r = latest.current.room;
      // Un invité se réannonce tant qu'il n'a pas reçu la table (hôte arrivé après lui, message perdu…).
      if (r?.role === 'guest' && !hasView.current) send({ k: 'hello', from: device, names: r.names });
      else send({ k: 'here', from: device });
      setNow(Date.now());
    }, HEARTBEAT_MS);
    return () => {
      window.clearInterval(beat);
      t.close();
      transport.current = null;
      setStatus(null);
    };
  }, [key]);

  // Hôte : chaque changement de partie ou de salle est diffusé.
  useEffect(() => {
    if (room?.role === 'host') sendState();
  }, [hostGame, room, hostSettings]);

  // Invité : les noms annoncés changent (salle d'attente).
  const names = room?.role === 'guest' ? room.names.join('\n') : '';
  useEffect(() => {
    if (room?.role === 'guest' && status === 'connecte') send({ k: 'hello', from: device, names: room.names });
  }, [names]);

  const offline = (d: string) => d !== device && now - (seen.current[d] ?? since.current) > OFFLINE_MS;
  const hostOffline = room?.role === 'guest' && status === 'connecte' && (hostDevice.current === null ? false : offline(hostDevice.current));

  return {
    status,
    view: room?.role === 'guest' ? view : null,
    lobby: room?.role === 'host' ? room.lobby : guestLobby.lobby,
    mode: room?.role === 'host' ? room.mode : guestLobby.mode,
    offline,
    hostOffline,
    closedByHost,
    lockedOut: room?.role === 'guest' && lockedOut,
    sendIntent: (intent) => send({ k: 'intent', from: device, intent }),
    close: (farewell) => {
      if (farewell) send(room?.role === 'host' ? { k: 'closed', from: device } : { k: 'leave', from: device });
    },
  };
}
