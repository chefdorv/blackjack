// Parties en ligne : salles ouvertes, salle d'attente de l'hôte, saisie du code et attente des invités.
import { useState } from 'preact/hooks';
import { addName, MAX_PLAYERS, minPlayers, NAME_MAX, nameError } from '../game/names';
import type { DealerMode } from '../game/types';
import type { OpenTable } from '../net/directory';
import type { LobbyEntry } from '../net/protocol';
import type { TransportStatus } from '../net/transport';
import type { Settings } from '../game/types';
import { Dialog, Haptic } from './common';
import { DurationFields } from './SetupScreen';
import { IconClose, IconDown, IconLock, IconUnlock, IconUp } from './icons';

const STATUS: Record<TransportStatus, string> = {
  connexion: 'Connexion au serveur…',
  connecte: 'Connecté',
  erreur: 'Connexion impossible pour le moment, nouvel essai automatique…',
};

export function StatusLine({ status }: { status: TransportStatus | null }) {
  const st = status ?? 'connexion';
  return (
    <p class={'net-status ' + st} role="status">
      <span class="net-dot" aria-hidden="true" />
      {STATUS[st]}
    </p>
  );
}

export function roomLink(code: string): string {
  try {
    const u = new URL(window.location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('salle', code);
    const reseau = new URLSearchParams(window.location.search).get('reseau');
    if (reseau) u.searchParams.set('reseau', reseau);
    return u.toString();
  } catch {
    return '';
  }
}

/** Saisie d'un nom ajouté à une liste (joueurs de cet appareil). */
function NameForm({ id, names, others, onAdd, label }: { id: string; names: string[]; others: string[]; onAdd: (n: string) => void; label: string }) {
  const [draft, setDraft] = useState('');
  const all = names.concat(others);
  const err = draft.trim() ? nameError(draft, all) : null;
  return (
    <>
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (nameError(draft, all)) return;
          onAdd(addName(draft, [])[0] ?? '');
          setDraft('');
        }}
      >
        <label class="sr" for={id}>
          {label}
        </label>
        <input
          id={id}
          class="txt grow"
          type="text"
          value={draft}
          maxLength={NAME_MAX}
          onInput={(e) => setDraft(e.currentTarget.value)}
          placeholder={label}
          autoComplete="off"
          enterKeyHint="done"
          disabled={all.length >= MAX_PLAYERS}
        />
        <button type="submit" class="btn gold" disabled={err !== null || !draft.trim()}>
          Ajouter
        </button>
      </form>
      {err === 'doublon' && <p class="small hint-err">Ce nom est déjà à la table.</p>}
    </>
  );
}

export function HostLobbyScreen({
  code,
  mode,
  lobby,
  device,
  status,
  offline,
  onAdd,
  onRemove,
  onMove,
  onStart,
  onCancel,
  settings,
  onSettings,
  locked,
  onLock,
}: {
  locked: boolean;
  onLock: () => void;
  settings: Settings;
  onSettings: (s: Settings) => void;
  code: string;
  mode: DealerMode;
  lobby: LobbyEntry[];
  device: string;
  status: TransportStatus | null;
  offline: (device: string) => boolean;
  onAdd: (name: string) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, delta: number) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = roomLink(code);
  const min = minPlayers(mode);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Blackjack entre potes', text: 'Rejoins la table avec le code ' + code, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      // partage annulé : rien à faire
    }
  };
  return (
    <section class="panel" aria-labelledby="lobby-title">
      <div class="k">Partie en ligne · {mode === 'banque' ? 'banque automatique' : 'croupier tournant'}</div>
      <h1 class="h1" id="lobby-title">
        {locked ? 'La salle est verrouillée' : 'La salle est ouverte'}
      </h1>
      <StatusLine status={status} />
      <div class="room-code" aria-label={'Code de la salle : ' + code.split('').join(' ')}>
        {code.split('').map((c, i) => (
          <span key={i} aria-hidden="true">
            {c}
          </span>
        ))}
      </div>
      <p class="muted">
        Les autres joueurs ouvrent blackjack.dooka.fr, sur téléphone ou sur ordinateur, puis touchent « Rejoindre une partie » et tapent ce code. Ou envoyez-leur directement le lien.
      </p>
      <button type="button" class="btn" onClick={share}>
        {copied ? 'Lien copié' : 'Partager le lien'}
      </button>
      <LockSwitch locked={locked} onLock={onLock} />
      <h2 class="h3">Autour de la table ({lobby.length})</h2>
      <p class="small">
        {mode === 'banque' ? "L'ordre de la liste est l'ordre de jeu." : "L'ordre de la liste est l'ordre de la table : le premier est le premier croupier."}
      </p>
      <ol class="setup-list" style="margin:0;padding:0;list-style:none">
        {lobby.map((e, i) => (
          <li class="setup-row" key={e.device + e.name}>
            <span class="seat" aria-hidden="true">
              {i + 1}
            </span>
            <span class="setup-name">
              {e.name}
              <span class={'small lobby-dev' + (e.device !== device && offline(e.device) ? ' off' : '')}>
                {e.device === device ? 'vous' : offline(e.device) ? 'déconnecté' : 'autre joueur'}
              </span>
            </span>
            <button type="button" class="icon-btn" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label={'Monter ' + e.name}>
              <IconUp />
            </button>
            <button type="button" class="icon-btn" onClick={() => onMove(i, 1)} disabled={i === lobby.length - 1} aria-label={'Descendre ' + e.name}>
              <IconDown />
            </button>
            <button type="button" class="icon-btn" onClick={() => onRemove(i)} aria-label={'Retirer ' + e.name}>
              <IconClose />
            </button>
          </li>
        ))}
      </ol>
      {lobby.length === 0 && <div class="empty">Personne pour l'instant.</div>}
      <NameForm id="lobby-name" names={lobby.map((e) => e.name)} others={[]} onAdd={onAdd} label="Prénom" />
      <DurationFields settings={settings} mode={mode} players={lobby.length} onSettings={onSettings} />
      <Haptic>
        <button type="button" class="btn big gold" onClick={onStart} disabled={lobby.length < min || lobby.length > MAX_PLAYERS}>
          Lancer la partie
        </button>
      </Haptic>
      {lobby.length < min && <p class="small">Encore {min - lobby.length} joueur{min - lobby.length > 1 ? 's' : ''} minimum.</p>}
      <button type="button" class="btn danger" onClick={onCancel}>
        Fermer la salle
      </button>
    </section>
  );
}

export function JoinScreen({
  initialCode,
  initialNames,
  onJoin,
  onCancel,
  cleanCode,
}: {
  initialCode: string;
  initialNames: string[];
  onJoin: (code: string, names: string[]) => void;
  onCancel: () => void;
  cleanCode: (raw: string) => string | null;
}) {
  const [code, setCode] = useState(initialCode);
  const [names, onNames] = useState(initialNames);
  const valid = cleanCode(code);
  return (
    <section class="panel" aria-labelledby="join-title">
      <div class="k">Partie en ligne</div>
      <h1 class="h1" id="join-title">
        Rejoindre une table
      </h1>
      <label class="set-label" for="join-code">
        Code de la salle (4 lettres, affiché chez le joueur qui l'a ouverte)
      </label>
      <input
        id="join-code"
        class="txt code-input"
        type="text"
        value={code}
        maxLength={6}
        autoComplete="off"
        autoCapitalize="characters"
        spellcheck={false}
        onInput={(e) => setCode(e.currentTarget.value.toUpperCase())}
        placeholder="ABCD"
      />
      <h2 class="h3">Qui joue ?</h2>
      <ul class="setup-list" style="margin:0;padding:0;list-style:none">
        {names.map((n, i) => (
          <li class="setup-row" key={n}>
            <span class="setup-name">{n}</span>
            <button type="button" class="icon-btn" onClick={() => onNames(names.filter((_, j) => j !== i))} aria-label={'Retirer ' + n}>
              <IconClose />
            </button>
          </li>
        ))}
      </ul>
      <NameForm id="join-name" names={names} others={[]} onAdd={(n) => onNames(names.concat(n))} label="Votre prénom" />
      <button type="button" class="btn big gold" disabled={!valid || names.length === 0} onClick={() => valid && onJoin(valid, names)}>
        Rejoindre
      </button>
      <button type="button" class="btn ghost" onClick={onCancel}>
        Retour
      </button>
    </section>
  );
}

export function GuestLobbyScreen({
  code,
  names,
  lobby,
  device,
  status,
  hostOffline,
  closed,
  lockedOut,
  onLeave,
}: {
  code: string;
  names: string[];
  lobby: LobbyEntry[];
  device: string;
  status: TransportStatus | null;
  hostOffline: boolean;
  closed: boolean;
  lockedOut: boolean;
  onLeave: () => void;
}) {
  const seated = lobby.filter((e) => e.device === device).map((e) => e.name.toLocaleLowerCase('fr-FR'));
  const refused = lobby.length > 0 ? names.filter((n) => !seated.includes(n.toLocaleLowerCase('fr-FR'))) : [];
  return (
    <section class="panel" aria-labelledby="wait-title">
      <div class="k">Salle {code}</div>
      <h1 class="h1" id="wait-title">
        {closed ? 'Salle fermée' : lockedOut ? 'Salle verrouillée' : lobby.length ? 'Vous êtes à la table' : 'Recherche de la table…'}
      </h1>
      <StatusLine status={status} />
      {closed ? (
        <p class="muted">L'hôte a fermé la salle.</p>
      ) : lockedOut ? (
        <p class="muted" role="alert">
          L'hôte a verrouillé cette partie : elle n'accepte plus de nouveaux joueurs. Vous entrerez automatiquement s'il la rouvre.
        </p>
      ) : lobby.length === 0 ? (
        <p class="muted">Le joueur qui a ouvert la salle {code} doit avoir l'application ouverte. Vérifiez le code si rien ne se passe.</p>
      ) : (
        <p class="muted">{hostOffline ? "L'hôte ne répond plus : la partie reprendra dès qu'il revient." : "En attente du lancement de la partie par l'hôte."}</p>
      )}
      {refused.length > 0 && (
        <p class="small hint-err" role="alert">
          {refused.join(', ')} : ce nom est déjà pris à la table (ou la table est complète). Quittez et rejoignez avec un autre nom.
        </p>
      )}
      {lobby.length > 0 && (
        <ol class="setup-list" style="margin:0;padding:0;list-style:none">
          {lobby.map((e, i) => (
            <li class="setup-row" key={e.device + e.name}>
              <span class="seat" aria-hidden="true">
                {i + 1}
              </span>
              <span class="setup-name">
                {e.name}
                {e.device === device && <span class="small lobby-dev">vous</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      <button type="button" class="btn danger" onClick={onLeave}>
        Quitter la salle
      </button>
    </section>
  );
}

/** Bandeau de la salle pendant la partie : code, connexion, joueurs injoignables. */
export function RoomBar({
  code,
  status,
  hostOffline,
  offlineNames,
  label,
  onClose,
  locked,
  onLock,
}: {
  code: string;
  status: TransportStatus | null;
  hostOffline: boolean;
  offlineNames: string[];
  label: string;
  onClose: () => void;
  /** Hôte seulement : verrouiller ou rouvrir la salle. */
  locked?: boolean;
  onLock?: () => void;
}) {
  const st = status ?? 'connexion';
  let text = 'Salle ' + code;
  if (st !== 'connecte') text += ' · ' + STATUS[st];
  else if (hostOffline) text += " · l'hôte ne répond plus";
  else if (offlineNames.length) text += ' · déconnecté : ' + offlineNames.join(', ');
  return (
    <div class={'room-bar ' + (st !== 'connecte' || hostOffline || offlineNames.length ? 'warn' : '')} role="status">
      <span class="net-dot" aria-hidden="true" />
      <span class="grow">{text}</span>
      {onLock && (
        <button
          type="button"
          class={'btn sm ghost lock-btn' + (locked ? ' on' : '')}
          onClick={onLock}
          aria-pressed={locked}
          aria-label={locked ? 'Partie verrouillée : toucher pour la rouvrir' : 'Partie ouverte : toucher pour la verrouiller'}
        >
          {locked ? <IconLock /> : <IconUnlock />}
        </button>
      )}
      <button type="button" class="btn sm ghost" onClick={onClose}>
        {label}
      </button>
    </div>
  );
}

/** Hôte : à quel appareil donner la place d'un joueur qui ne répond plus. */
export function ReassignDialog({
  name,
  candidates,
  onPick,
  onSelf,
  onClose,
}: {
  name: string;
  candidates: LobbyEntry[];
  onPick: (device: string) => void;
  onSelf: () => void;
  onClose: () => void;
}) {
  const devices = [...new Set(candidates.map((c) => c.device))];
  return (
    <Dialog label={'Donner la place de ' + name} onClose={onClose} variant="modal">
      <div class="k">{name} ne répond plus</div>
      <h2 class="h3">Qui reprend sa place ?</h2>
      <p class="small">Ses jetons, ses défis et sa main en cours restent les mêmes.</p>
      <div class="pick-list">
        {devices.map((d) => (
          <button type="button" class="pick stack" key={d} onClick={() => onPick(d)}>
            {candidates
              .filter((c) => c.device === d)
              .map((c) => c.name)
              .join(', ')}{' '}
            <small>joueur arrivé en cours de partie</small>
          </button>
        ))}
        <button type="button" class="pick stack" onClick={onSelf}>
          Moi <small>vous jouez à sa place</small>
        </button>
      </div>
      {devices.length === 0 && (
        <p class="small">Pour qu'il reprenne la main depuis un autre appareil : qu'il ouvre le lien de la salle, puis revenez ici.</p>
      )}
      <button type="button" class="btn" onClick={onClose}>
        Annuler
      </button>
    </Dialog>
  );
}

/** Invité sans place à la table : il regarde, et sait quand il pourra jouer. */
export function SpectatorNote({ text }: { text: string }) {
  return (
    <p class="spectator" role="status">
      {text}
    </p>
  );
}

/** Hôte : joueurs arrivés une fois la partie lancée. */
export function GuestsBanner({ items }: { items: Array<{ name: string; status: string }> }) {
  return (
    <div class="spectator" role="status">
      <b>Arrivés en cours de partie</b>
      <ul>
        {items.map((i) => (
          <li key={i.name}>
            {i.name} : {i.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Hôte : salle ouverte à tous (visible dans la liste) ou verrouillée. */
function LockSwitch({ locked, onLock }: { locked: boolean; onLock: () => void }) {
  return (
    <div class="set-row">
      <div class="grow">
        <label class="set-label" for="room-lock">
          Verrouiller la partie
        </label>
        <div class="small">
          {locked
            ? 'Plus personne de nouveau ne peut entrer, même avec le code. Les joueurs déjà là gardent leur place.'
            : 'Ouverte : elle apparaît dans la liste des parties, et n’importe qui peut la rejoindre.'}
        </div>
      </div>
      <input id="room-lock" class="switch" type="checkbox" role="switch" checked={locked} onChange={onLock} />
    </div>
  );
}

/** Écran de création : les parties en ligne restées ouvertes, à rejoindre d'un geste. */
export function OpenTablesPanel({ tables, onJoin }: { tables: OpenTable[]; onJoin: (code: string) => void }) {
  return (
    <section class="panel open-tables" aria-labelledby="open-title">
      <h2 class="h3" id="open-title">
        Parties ouvertes
      </h2>
      {tables.length === 0 ? (
        <p class="small" aria-live="polite">
          Aucune partie ouverte pour l'instant. Elles apparaissent ici dès que quelqu'un ouvre une salle.
        </p>
      ) : (
        <ul class="setup-list" style="margin:0;padding:0;list-style:none" aria-live="polite">
          {tables.map((t) => {
            const full = t.players >= MAX_PLAYERS;
            const who = t.host.length ? t.host.join(', ') : 'Salle ' + t.code;
            const where = t.started ? 'en jeu, manche ' + Math.min(t.round, t.rounds) + '/' + t.rounds : 'en attente';
            return (
              <li class="setup-row open-table" key={t.code}>
                <span class="open-name">
                  {who}
                  <span class="small lobby-dev">
                    {t.players} joueur{t.players > 1 ? 's' : ''} · {where} · {t.mode === 'banque' ? 'banque' : 'croupier tournant'}
                  </span>
                </span>
                <button type="button" class="btn sm gold" onClick={() => onJoin(t.code)} disabled={full} aria-label={(full ? 'Complète : ' : 'Rejoindre ') + who}>
                  {full ? 'Complète' : 'Rejoindre'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
