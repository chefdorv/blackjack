// Annuaire des salles ouvertes : un canal commun où chaque hôte d'une salle non verrouillée
// s'annonce régulièrement. Qui est sur l'écran de création voit la liste et peut rejoindre.
// Rien n'est stocké : une salle disparaît de la liste quand son hôte se tait.

import { useEffect, useRef, useState } from 'preact/hooks';
import { cleanName, MAX_PLAYERS } from '../game/names';
import type { DealerMode } from '../game/types';
import { cleanRoomCode } from './protocol';
import { openTransport, type TransportKind } from './transport';

/** Nom du canal commun (les salles ont des codes de 4 lettres, pas de collision possible). */
const DIRECTORY = 'SALLES';
const ANNOUNCE_MS = 5000;
/** Sans nouvelle de l'hôte au-delà, la salle sort de la liste. */
export const TABLE_TTL_MS = 15000;

export interface OpenTable {
  code: string;
  /** Joueurs de l'appareil hôte. */
  host: string[];
  players: number;
  started: boolean;
  round: number;
  rounds: number;
  mode: DealerMode;
}

type DirMessage = { k: 'table'; from: string; table: OpenTable } | { k: 'gone'; from: string; code: string } | { k: 'who'; from: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const int = (v: unknown, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : min);

/** Relit une annonce venue du réseau ; null si elle n'est pas exploitable. */
export function parseTable(v: unknown): OpenTable | null {
  if (!isObj(v) || typeof v.code !== 'string') return null;
  const code = cleanRoomCode(v.code);
  if (!code) return null;
  const host = Array.isArray(v.host)
    ? v.host
        .filter((n): n is string => typeof n === 'string')
        .map(cleanName)
        .filter(Boolean)
        .slice(0, MAX_PLAYERS)
    : [];
  return {
    code,
    host,
    players: int(v.players, 0, MAX_PLAYERS),
    started: v.started === true,
    round: int(v.round, 1, 99),
    rounds: int(v.rounds, 1, 99),
    mode: v.mode === 'banque' ? 'banque' : 'tournant',
  };
}

function parseDir(v: unknown): DirMessage | null {
  if (!isObj(v) || typeof v.from !== 'string' || !v.from) return null;
  if (v.k === 'who') return { k: 'who', from: v.from };
  if (v.k === 'gone') {
    const code = typeof v.code === 'string' ? cleanRoomCode(v.code) : null;
    return code ? { k: 'gone', from: v.from, code } : null;
  }
  if (v.k === 'table') {
    const table = parseTable(v.table);
    return table ? { k: 'table', from: v.from, table } : null;
  }
  return null;
}

export interface Seen {
  table: OpenTable;
  at: number;
}

/** Salles encore annoncées récemment, la plus récente en premier. */
export function freshTables(seen: Record<string, Seen>, now: number): OpenTable[] {
  return Object.values(seen)
    .filter((s) => now - s.at <= TABLE_TTL_MS)
    .sort((a, b) => b.at - a.at)
    .map((s) => s.table);
}

/**
 * `announce` : la salle que cet appareil héberge et laisse ouverte (null sinon).
 * `listen` : on affiche la liste des salles ouvertes.
 */
export function useOpenTables({ kind, device, announce, listen }: { kind: TransportKind | null; device: string; announce: OpenTable | null; listen: boolean }): OpenTable[] {
  const [seen, setSeen] = useState<Record<string, Seen>>({});
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef(announce);
  latest.current = announce;
  const send = useRef<((m: DirMessage) => void) | null>(null);
  /** Dernière salle annoncée sur le canal. */
  const previous = useRef<OpenTable | null>(null);
  const active = kind !== null && (listen || announce !== null);

  useEffect(() => {
    if (!active || !kind) return;
    const tell = () => {
      const t = latest.current;
      if (t) send.current?.({ k: 'table', from: device, table: t });
    };
    const transport = openTransport<DirMessage>(
      kind,
      DIRECTORY,
      (raw) => {
        const m = parseDir(raw);
        if (!m || m.from === device) return;
        if (m.k === 'who') tell();
        else if (m.k === 'table') setSeen((x) => ({ ...x, [m.table.code]: { table: m.table, at: Date.now() } }));
        else
          setSeen((x) => {
            if (!x[m.code]) return x;
            const next = { ...x };
            delete next[m.code];
            return next;
          });
      },
      (st) => {
        if (st !== 'connecte') return;
        // Arrivée : on demande aux hôtes de se présenter, sans attendre leur prochaine annonce.
        send.current?.({ k: 'who', from: device });
        tell();
      },
    );
    send.current = transport.send;
    const beat = window.setInterval(() => {
      tell();
      setNow(Date.now());
    }, ANNOUNCE_MS);
    return () => {
      window.clearInterval(beat);
      // La dernière salle annoncée (l'annonce courante est peut-être déjà vidée).
      const t = previous.current;
      if (t) transport.send({ k: 'gone', from: device, code: t.code });
      // Laisse partir l'adieu avant de couper.
      window.setTimeout(() => transport.close(), 300);
      send.current = null;
      setSeen({});
    };
  }, [active, kind]);

  // L'annonce change (joueur arrivé, partie lancée, salle verrouillée) : on prévient tout de suite.
  const key = announce ? JSON.stringify(announce) : '';
  useEffect(() => {
    const before = previous.current;
    previous.current = announce;
    if (announce) send.current?.({ k: 'table', from: device, table: announce });
    else if (before) send.current?.({ k: 'gone', from: device, code: before.code });
  }, [key]);

  return listen ? freshTables(seen, now) : [];
}
