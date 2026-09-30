import { useState } from 'preact/hooks';
import { addName, canStart, MAX_PLAYERS, MIN_PLAYERS, moveItem, NAME_MAX, nameError } from '../game/names';
import type { Settings } from '../game/types';
import { IconClose, IconDown, IconUp } from './icons';

export function SetupScreen({
  names,
  settings: s,
  onNames,
  onStart,
}: {
  names: string[];
  settings: Settings;
  onNames: (names: string[]) => void;
  onStart: (names: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const err = draft.trim() ? nameError(draft, names) : null;
  const add = () => {
    if (nameError(draft, names)) return;
    onNames(addName(draft, names));
    setDraft('');
  };
  const missing = MIN_PLAYERS - names.length;
  let hint: string;
  if (err === 'doublon') hint = 'Ce nom est déjà à la table.';
  else if (names.length >= MAX_PLAYERS) hint = 'Table complète : ' + MAX_PLAYERS + ' joueurs maximum.';
  else if (missing > 0)
    hint = 'Encore ' + missing + ' joueur' + (missing > 1 ? 's' : '') + ' minimum pour lancer. Chacun démarre avec ' + s.startChips + ' jetons.';
  else
    hint =
      names.length + ' joueurs, ' + s.startChips + ' jetons chacun, ' + s.rounds + ' manche' + (s.rounds > 1 ? 's' : '') + ' de ' +
      names.length + ' croupiers × ' + s.deals + ' donne' + (s.deals > 1 ? 's' : '') + '.';

  return (
    <section class="panel" aria-labelledby="setup-title">
      <div class="k">Nouvelle partie</div>
      <h1 class="h1" id="setup-title">
        Qui s'assoit à la table ?
      </h1>
      <p class="muted">
        Ajoutez les joueurs dans l'ordre autour de la table ({MIN_PLAYERS} à {MAX_PLAYERS}). Le premier de la liste est le premier croupier, puis la
        main passe au joueur suivant, à sa gauche.
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
      <button type="button" class="btn big gold" onClick={() => onStart(names.slice())} disabled={!canStart(names)}>
        Lancer la partie
      </button>
    </section>
  );
}
