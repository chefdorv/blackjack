import { useState } from 'preact/hooks';
import { addName, canStart, MAX_PLAYERS, minPlayers, moveItem, NAME_MAX, nameError } from '../game/names';
import type { SetupMode } from '../game/persist';
import type { Settings } from '../game/types';
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

export function SetupScreen({
  names,
  settings: s,
  mode,
  onMode,
  onNames,
  onStart,
  onHost,
  onJoin,
}: {
  names: string[];
  settings: Settings;
  mode: SetupMode;
  onMode: (m: SetupMode) => void;
  onNames: (names: string[]) => void;
  onStart: (names: string[]) => void;
  /** Ouvrir une salle à plusieurs téléphones (absent si aucun serveur n'est configuré). */
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
  const dealers = mode === 'banque' ? 'la banque' : names.length + ' croupiers';
  let hint: string;
  if (err === 'doublon') hint = 'Ce nom est déjà à la table.';
  else if (names.length >= MAX_PLAYERS) hint = 'Table complète : ' + MAX_PLAYERS + ' joueurs maximum.';
  else if (missing > 0)
    hint = 'Encore ' + missing + ' joueur' + (missing > 1 ? 's' : '') + ' minimum pour lancer. Chacun démarre avec ' + s.startChips + ' jetons.';
  else
    hint =
      names.length + ' joueur' + (names.length > 1 ? 's' : '') + ', ' + s.startChips + ' jetons chacun, ' + s.rounds + ' manche' + (s.rounds > 1 ? 's' : '') + ' de ' +
      (mode === 'banque' ? names.length * s.deals + ' donnes contre la banque' : dealers + ' × ' + s.deals + ' donne' + (s.deals > 1 ? 's' : '')) + '.';

  return (
    <section class="panel" aria-labelledby="setup-title">
      <div class="k">Nouvelle partie</div>
      <h1 class="h1" id="setup-title">
        Qui s'assoit à la table ?
      </h1>
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
      <p class="muted">
        {mode === 'banque'
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
      <button type="button" class="btn big gold" onClick={() => onStart(names.slice())} disabled={!canStart(names, min)}>
        Lancer la partie
      </button>
      {(onHost || onJoin) && (
        <div class="multi">
          <div class="k">À plusieurs téléphones</div>
          {virtual && onHost && (
            <button type="button" class="btn" onClick={onHost}>
              Ouvrir une salle pour les autres téléphones
            </button>
          )}
          {virtual && onHost && <p class="small">Ajoutez ici seulement les joueurs de ce téléphone ; les autres rejoignent avec un code.</p>}
          {onJoin && (
            <button type="button" class="btn ghost" onClick={onJoin}>
              Rejoindre une partie avec un code
            </button>
          )}
        </div>
      )}
    </section>
  );
}
