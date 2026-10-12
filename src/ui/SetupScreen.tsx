import { useState } from 'preact/hooks';
import { addName, canStart, MAX_PLAYERS, minPlayers, moveItem, NAME_MAX, nameError } from '../game/names';
import type { SetupMode } from '../game/persist';
import { setNumber } from '../game/settings';
import type { Settings } from '../game/types';
import { Stepper } from './common';
import { IconClose, IconDown, IconUp } from './icons';

function Choice<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: ReadonlyArray<{ value: T; title: string; text: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset class="choice">
      <legend class="k">{legend}</legend>
      <div class="choice-grid">
        {options.map((o) => (
          <label key={o.value} class={'choice-opt' + (value === o.value ? ' on' : '')}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <b>{o.title}</b>
            <span class="small">{o.text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Nombre de manches et de donnes, réglables dès la création (et dans l'onglet Réglages). */
export function DurationFields({
  settings: s,
  mode,
  players,
  onSettings,
}: {
  settings: Settings;
  mode: SetupMode;
  players: number;
  onSettings: (s: Settings) => void;
}) {
  const bank = mode === 'banque';
  const n = Math.max(players, 1);
  const key = bank ? 'bankDeals' : 'deals';
  const perRound = bank
    ? 'Une manche : ' + s.bankDeals + ' donne' + (s.bankDeals > 1 ? 's' : '') + ' contre la banque'
    : 'Une manche : chacun est croupier ' + s.deals + ' donne' + (s.deals > 1 ? 's' : '') + (players > 1 ? ', soit ' + n * s.deals + ' donnes' : '');
  return (
    <fieldset class="choice">
      <legend class="k">Durée de la partie</legend>
      <div>
        <Stepper
          id="setup-rounds"
          label="Manches"
          value={s.rounds}
          min={1}
          max={10}
          onChange={(v) => {
            if (v !== null) onSettings(setNumber(s, 'rounds', v));
          }}
          sub={<div class="small">Les mises montent à chaque manche</div>}
        />
        <Stepper
          id="setup-deals"
          label={bank ? 'Donnes par manche' : 'Donnes par croupier'}
          value={s[key]}
          min={1}
          max={bank ? 50 : 20}
          onChange={(v) => {
            if (v !== null) onSettings(setNumber(s, key, v));
          }}
          sub={<div class="small">{perRound}</div>}
        />
      </div>
    </fieldset>
  );
}

export function SetupScreen({
  names,
  settings: s,
  mode,
  onMode,
  onNames,
  onStart,
  onHost,
  onJoin,
  multi,
  onMulti,
  onSettings,
}: {
  names: string[];
  settings: Settings;
  mode: SetupMode;
  onMode: (m: SetupMode) => void;
  onNames: (names: string[]) => void;
  onStart: (names: string[]) => void;
  /** Partie en ligne (choix « Chacun sur le sien »). */
  multi: boolean;
  onMulti: (m: boolean) => void;
  onSettings: (s: Settings) => void;
  /** Ouvrir une salle en ligne (absent si aucun serveur n'est configuré). */
  onHost?: () => void;
  onJoin?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const err = draft.trim() ? nameError(draft, names) : null;
  const add = () => {
    if (nameError(draft, names)) return;
    onNames(addName(draft, names));
    setDraft('');
  };
  const min = minPlayers(mode);
  const missing = min - names.length;
  const virtual = mode !== 'reel';
  const hosting = virtual && multi && onHost !== undefined;
  const dealers = mode === 'banque' ? 'la banque' : names.length + ' croupiers';
  let hint: string;
  if (err === 'doublon') hint = 'Ce nom est déjà à la table.';
  else if (names.length >= MAX_PLAYERS) hint = 'Table complète : ' + MAX_PLAYERS + ' joueurs maximum.';
  else if (hosting)
    hint = names.length
      ? 'Les autres joueurs rejoindront avec le code de la salle.'
      : 'Ajoutez votre prénom (et ceux des joueurs qui jouent à côté de vous, sur le même écran).';
  else if (missing > 0)
    hint = 'Encore ' + missing + ' joueur' + (missing > 1 ? 's' : '') + ' minimum pour lancer. Chacun démarre avec ' + s.startChips + ' jetons.';
  else
    hint =
      names.length + ' joueur' + (names.length > 1 ? 's' : '') + ', ' + s.startChips + ' jetons chacun, ' + s.rounds + ' manche' + (s.rounds > 1 ? 's' : '') + ' de ' +
      (mode === 'banque' ? s.bankDeals + ' donnes contre la banque' : dealers + ' × ' + s.deals + ' donne' + (s.deals > 1 ? 's' : '')) + '.';

  return (
    <section class="panel" aria-labelledby="setup-title">
      <div class="k">Nouvelle partie</div>
      <h1 class="h1" id="setup-title">
        Qui s'assoit à la table ?
      </h1>
      {onJoin && (
        <div class="join-row">
          <span class="small">On vous a donné un code ?</span>
          <button type="button" class="btn sm ghost" onClick={onJoin}>
            Rejoindre une partie
          </button>
        </div>
      )}
      <Choice
        name="mode"
        legend="Comment on joue ?"
        value={virtual ? 'virtuel' : 'reel'}
        onChange={(m) => onMode(m === 'reel' ? 'reel' : 'tournant')}
        options={[
          { value: 'reel', title: 'Avec de vraies cartes', text: "Cartes et jetons sur la table ; l'application gère les défis et les comptes." },
          { value: 'virtuel', title: "Tout dans l'app", text: "Cartes, mises et jetons virtuels ; les défis se valident tout seuls." },
        ]}
      />
      {virtual && (
        <Choice
          name="croupier"
          legend="Qui tient la banque ?"
          value={mode}
          onChange={onMode}
          options={[
            { value: 'tournant', title: 'Croupier tournant', text: 'Chacun est croupier à son tour et paie la table avec ses jetons. Défis croupier en jeu.' },
            { value: 'banque', title: 'Banque automatique', text: "L'application tient la banque, tout le monde mise à chaque donne." },
          ]}
        />
      )}
      {virtual && onHost && (
        <Choice
          name="telephones"
          legend="Où joue chacun ?"
          value={multi ? 'plusieurs' : 'seul'}
          onChange={(v) => onMulti(v === 'plusieurs')}
          options={[
            { value: 'seul', title: 'Tous sur le même écran', text: 'On se passe l’appareil autour de la table.' },
            { value: 'plusieurs', title: 'Chacun sur le sien', text: 'Vous ouvrez une salle ; les autres joueurs la rejoignent depuis leur téléphone ou leur navigateur.' },
          ]}
        />
      )}
      <DurationFields settings={s} mode={mode} players={names.length} onSettings={onSettings} />
      <p class="muted">
        {hosting
          ? 'Ajoutez les joueurs à côté de vous. Vous pourrez changer l’ordre de la table dans la salle.'
          : mode === 'banque'
          ? 'Ajoutez les joueurs dans l’ordre autour de la table (' + min + ' à ' + MAX_PLAYERS + ').'
          : "Ajoutez les joueurs dans l'ordre autour de la table (" + min + ' à ' + MAX_PLAYERS + '). Le premier de la liste est le premier croupier, puis la main passe au joueur suivant, à sa gauche.'}
      </p>
      <ol class="setup-list" style="margin:0;padding:0;list-style:none">
        {names.map((n, i) => (
          <li class="setup-row" key={n}>
            <span class="seat" aria-hidden="true">
              {i + 1}
            </span>
            <span class="setup-name">{n}</span>
            <button type="button" class="icon-btn" onClick={() => onNames(moveItem(names, i, -1))} disabled={i === 0} aria-label={'Monter ' + n}>
              <IconUp />
            </button>
            <button
              type="button"
              class="icon-btn"
              onClick={() => onNames(moveItem(names, i, 1))}
              disabled={i === names.length - 1}
              aria-label={'Descendre ' + n}
            >
              <IconDown />
            </button>
            <button type="button" class="icon-btn" onClick={() => onNames(names.filter((_, j) => j !== i))} aria-label={'Retirer ' + n}>
              <IconClose />
            </button>
          </li>
        ))}
      </ol>
      {names.length === 0 && <div class="empty">Aucun joueur pour l'instant.</div>}
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label class="sr" for="bj-newname">
          Nom du joueur
        </label>
        <input
          id="bj-newname"
          class="txt grow"
          type="text"
          value={draft}
          maxLength={NAME_MAX}
          onInput={(e) => setDraft(e.currentTarget.value)}
          placeholder="Nom du joueur"
          autoComplete="off"
          enterKeyHint="done"
          aria-describedby="setup-hint"
          disabled={names.length >= MAX_PLAYERS}
        />
        <button type="submit" class="btn gold" disabled={err !== null || !draft.trim()}>
          Ajouter
        </button>
      </form>
      <p class={'small' + (err === 'doublon' ? ' hint-err' : '')} id="setup-hint" aria-live="polite">
        {hint}
      </p>
      {hosting ? (
        <button type="button" class="btn big gold" onClick={onHost}>
          Ouvrir la salle
        </button>
      ) : (
        <button type="button" class="btn big gold" onClick={() => onStart(names.slice())} disabled={!canStart(names, min)}>
          Lancer la partie
        </button>
      )}
    </section>
  );
}
