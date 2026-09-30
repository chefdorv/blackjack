import { useState } from 'preact/hooks';
import { isLevel, LEVELS } from '../game/defaults';
import { addChallenge, BET_LIMIT, REWARD_LIMIT, SETTING_FIELDS, setBet, setNumber, updateChallenge } from '../game/settings';
import type { Level, Settings } from '../game/types';
import { Stepper } from './common';
import { IconTrash } from './icons';

function LevelSelect({ id, value, onChange, label }: { id: string; value: Level; onChange: (l: Level) => void; label: string }) {
  return (
    <>
      <label class="sr" for={id}>
        {label}
      </label>
      <select
        id={id}
        class="txt"
        value={value}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (isLevel(v)) onChange(v);
        }}
      >
        {LEVELS.map((l) => (
          <option value={l.key} key={l.key}>
            {l.key === 'croupier' ? 'Croupier' : l.label} ({l.color})
          </option>
        ))}
      </select>
    </>
  );
}

function RewardInput({ id, value, onChange, label }: { id: string; value: number; onChange: (v: number) => void; label: string }) {
  return (
    <>
      <label class="sr" for={id}>
        {label}
      </label>
      <input
        id={id}
        class="txt num"
        type="number"
        inputMode="numeric"
        min={0}
        max={REWARD_LIMIT}
        value={value}
        onChange={(e) => {
          const el = e.currentTarget;
          const n = Math.max(0, Math.min(REWARD_LIMIT, Math.round(Number(el.value) || 0)));
          el.value = String(n);
          onChange(n);
        }}
      />
    </>
  );
}

export function SettingsScreen({
  settings: s,
  hasGame,
  onSettings,
  onDeleteChallenge,
  onRestoreChallenges,
  onAbandon,
  onResetSettings,
  onAdded,
}: {
  settings: Settings;
  hasGame: boolean;
  onSettings: (next: Settings) => void;
  onDeleteChallenge: (id: string, text: string) => void;
  onRestoreChallenges: () => void;
  onAbandon: () => void;
  onResetSettings: () => void;
  onAdded: () => void;
}) {
  const [draft, setDraft] = useState<{ text: string; level: Level; reward: number }>({ text: '', level: 'facile', reward: 5 });
  return (
    <>
      <section class="panel" aria-labelledby="settings-title">
        <div class="k">Réglages</div>
        <h1 class="h1" id="settings-title">
          La maison
        </h1>
        <p class="small">Les jetons de départ s'appliquent à la prochaine partie ; le reste s'applique tout de suite.</p>
        <div>
          {SETTING_FIELDS.map((f) => (
            <Stepper
              key={f.key}
              id={'set-' + f.key}
              label={f.label}
              value={s[f.key]}
              step={f.step}
              min={f.min}
              max={f.max}
              onChange={(v) => {
                if (v !== null) onSettings(setNumber(s, f.key, v));
              }}
            />
          ))}
        </div>
      </section>

      <section class="panel" aria-labelledby="bets-title">
        <h2 class="h3" id="bets-title">
          Mises par manche
        </h2>
        {s.bets.slice(0, s.rounds).map((b, i) => (
          <div class="bet-edit" key={i} role="group" aria-label={'Mises de la manche ' + (i + 1)}>
            <div class="k">Manche {i + 1}</div>
            {(['min', 'max'] as const).map((which) => (
              <Stepper
                key={which}
                id={'bet-' + i + '-' + which}
                label={which === 'min' ? 'Mise min' : 'Mise max'}
                value={b[which]}
                min={1}
                max={BET_LIMIT}
                decLabel={'Diminuer la mise ' + which + ' de la manche ' + (i + 1)}
                incLabel={'Augmenter la mise ' + which + ' de la manche ' + (i + 1)}
                onChange={(v) => {
                  if (v !== null) onSettings(setBet(s, i, which, v));
                }}
              />
            ))}
          </div>
        ))}
      </section>

      <section class="panel" aria-labelledby="ch-title">
        <h2 class="h3" id="ch-title">
          Défis ({s.challenges.length})
        </h2>
        <p class="small">Modifiez le texte, le niveau (et donc la couleur) et le gain de chaque défi.</p>
        <ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:14px">
          {s.challenges.map((c, i) => (
            <li class="ch-edit" key={c.id}>
              <div class="ch-edit-top">
                <span class={'lv-dot lv-' + c.level} aria-hidden="true" />
                <LevelSelect id={'ch-lv-' + c.id} label={'Niveau du défi ' + (i + 1)} value={c.level} onChange={(level) => onSettings(updateChallenge(s, c.id, { level }))} />
                <RewardInput id={'ch-rw-' + c.id} label={'Gain en jetons du défi ' + (i + 1)} value={c.reward} onChange={(reward) => onSettings(updateChallenge(s, c.id, { reward }))} />
                <button type="button" class="icon-btn" onClick={() => onDeleteChallenge(c.id, c.text)} aria-label={'Supprimer le défi ' + (i + 1)}>
                  <IconTrash />
                </button>
              </div>
              <label class="sr" for={'ch-tx-' + c.id}>
                Texte du défi {i + 1}
              </label>
              <input
                id={'ch-tx-' + c.id}
                class="txt"
                type="text"
                value={c.text}
                maxLength={140}
                onInput={(e) => onSettings(updateChallenge(s, c.id, { text: e.currentTarget.value }))}
              />
            </li>
          ))}
        </ul>
        <div class="divider" />
        <form
          class="ch-edit"
          aria-labelledby="newch-title"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.text.trim()) return;
            onSettings(addChallenge(s, draft.level, draft.reward, draft.text, 'u' + Date.now().toString(36)));
            setDraft({ ...draft, text: '' });
            onAdded();
          }}
        >
          <div class="k" id="newch-title">
            Nouveau défi
          </div>
          <div class="ch-edit-top">
            <LevelSelect id="newch-lv" label="Niveau du nouveau défi" value={draft.level} onChange={(level) => setDraft({ ...draft, level })} />
            <RewardInput id="newch-rw" label="Gain du nouveau défi" value={draft.reward} onChange={(reward) => setDraft({ ...draft, reward })} />
          </div>
          <label class="sr" for="newch-tx">
            Texte du nouveau défi
          </label>
          <input
            id="newch-tx"
            class="txt"
            type="text"
            value={draft.text}
            maxLength={140}
            onInput={(e) => setDraft({ ...draft, text: e.currentTarget.value })}
            placeholder="Ex. Gagner une main avec deux 10"
          />
          <button type="submit" class="btn gold" disabled={!draft.text.trim()}>
            Ajouter le défi
          </button>
        </form>
        <button type="button" class="btn ghost" onClick={onRestoreChallenges}>
          Restaurer les défis d'origine
        </button>
      </section>

      <section class="panel" aria-labelledby="party-title">
        <h2 class="h3" id="party-title">
          Partie
        </h2>
        {hasGame && (
          <button type="button" class="btn danger" onClick={onAbandon}>
            Abandonner la partie
          </button>
        )}
        <button type="button" class="btn danger" onClick={onResetSettings}>
          Remettre les réglages par défaut
        </button>
      </section>
    </>
  );
}
