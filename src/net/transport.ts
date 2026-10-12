// Canal de messages (une salle, ou l'annuaire des salles ouvertes). Deux implémentations au choix :
// - Supabase Realtime (diffusion entre appareils, sans table ni compte) quand le projet est configuré ;
// - BroadcastChannel du navigateur (entre onglets d'un même navigateur) pour les essais et l'e2e.

import type { NetMessage } from './protocol';

export type TransportStatus = 'connexion' | 'connecte' | 'erreur';

export interface Transport<M = NetMessage> {
  send: (m: M) => void;
  close: () => void;
}

export type TransportKind = 'supabase' | 'local';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

/**
 * Transport disponible : `?reseau=local` force les onglets du navigateur (tests) ;
 * sinon Supabase s'il est configuré ; sinon aucun (le jeu en ligne est masqué).
 */
export function transportKind(): TransportKind | null {
  try {
    if (new URLSearchParams(window.location.search).get('reseau') === 'local' && 'BroadcastChannel' in window) return 'local';
  } catch {
    // pas d'URL lisible : on continue
  }
  return SUPABASE_URL && SUPABASE_KEY ? 'supabase' : null;
}

const topic = (code: string) => 'bj-' + code;

/** `code` : celui d'une salle (4 lettres), ou un nom de canal commun comme celui de l'annuaire. */
export function openTransport<M = NetMessage>(kind: TransportKind, code: string, onMessage: (m: unknown) => void, onStatus: (s: TransportStatus) => void): Transport<M> {
  return kind === 'local' ? openLocal<M>(code, onMessage, onStatus) : openSupabase<M>(code, onMessage, onStatus);
}

function openLocal<M>(code: string, onMessage: (m: unknown) => void, onStatus: (s: TransportStatus) => void): Transport<M> {
  const ch = new BroadcastChannel(topic(code));
  ch.onmessage = (e: MessageEvent<unknown>) => onMessage(e.data);
  // Annoncé après le retour de la fonction, comme pour Supabase : l'appelant a alors de quoi envoyer.
  const t = window.setTimeout(() => onStatus('connecte'), 0);
  return {
    send: (m) => ch.postMessage(m),
    close: () => {
      window.clearTimeout(t);
      ch.close();
    },
  };
}

function openSupabase<M>(code: string, onMessage: (m: unknown) => void, onStatus: (s: TransportStatus) => void): Transport<M> {
  onStatus('connexion');
  let closed = false;
  let ready = false;
  const queue: M[] = [];
  let sendNow: ((m: M) => void) | null = null;
  let stop: (() => void) | null = null;

  // Chargé à la demande : le jeu sur un seul appareil n'en a pas besoin (et reste léger hors ligne).
  import('@supabase/realtime-js')
    .then(({ RealtimeClient }) => {
      if (closed || !SUPABASE_URL || !SUPABASE_KEY) return;
      const client = new RealtimeClient(SUPABASE_URL.replace(/\/$/, '') + '/realtime/v1', { params: { apikey: SUPABASE_KEY } });
      const channel = client.channel(topic(code), { config: { broadcast: { self: false } } });
      channel.on('broadcast', { event: 'm' }, (msg: { payload?: unknown }) => onMessage(msg.payload));
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ready = true;
          onStatus('connecte');
          for (const m of queue.splice(0)) sendNow?.(m);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          ready = false;
          onStatus('erreur');
        } else if (status === 'CLOSED' && !closed) {
          ready = false;
          onStatus('connexion');
        }
      });
      sendNow = (m) => {
        void channel.send({ type: 'broadcast', event: 'm', payload: m });
      };
      stop = () => {
        void client.removeChannel(channel);
        client.disconnect();
      };
    })
    .catch(() => onStatus('erreur'));

  return {
    send: (m) => {
      if (ready && sendNow) sendNow(m);
      else queue.push(m);
    },
    close: () => {
      closed = true;
      stop?.();
    },
  };
}
