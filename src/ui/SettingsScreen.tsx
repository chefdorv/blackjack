import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { isLevel, LEVELS } from '../game/defaults';
import { buzz, hapticsMode, isIOS, setVibrations, vibrationsOn } from '../haptics';
import { plural } from '../game/format';
import { addChallenge, BET_LIMIT, DECKS_MAX, DECKS_MIN, REWARD_LIMIT, SETTING_FIELDS, setBet, setNumber, setTable, updateChallenge, type SettingField } from '../game/settings';
import type { Level, NumericSettingKey, Settings } from '../game/types';
import { Haptic, Stepper } from './common';
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

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div class="set-row">
      <label class="set-label" for={id}>
        {label}
      </label>
      <input id={id} class="switch" type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
    </div>
  );
}

/** Mode de la partie en cours, pour ne montrer que les réglages qui s'y appliquent. */
export type SettingsMode = 'cartes' | 'tournant' | 'banque' | null;

const HIDDEN: Record<Exclude<SettingsMode, null>, readonly NumericSettingKey[]> = {
  cartes: ['bankDeals'],
  tournant: ['bankDeals'],
  banque: ['deals', 'dealerSlots'],
};
const SLOT_KEYS: readonly NumericSettingKey[] = ['playerSlots', 'dealerSlots'];

/** Section repliable : le titre et un résumé d'une ligne, le détail au toucher. */
function Fold({ id, title, summary, open, children }: { id: string; title: string; summary: string; open?: boolean; children: ComponentChildren }) {
  return (
    <details class="panel fold" open={open}>
      <summary aria-labelledby={id + '-title'}>
        <span class="grow">
          <span class="h3" id={id + '-title'}>
            {title}
          </span>
          <span class="small fold-sum">{summary}</span>
        </span>
        <span class="fold-chev" aria-hidden="true" />
      </summary>
      <div class="fold-body">{children}</div>
    </details>
  );
}

export function SettingsScreen({
  settings: s,
  mode,
  onSettings,
  onDeleteChallenge,
  onRestoreChallenges,
  onResetSettings,
  onAdded,
}: {
  settings: Settings;
  mode: SettingsMode;
  onSettings: (next: Settings) => void;
  onDeleteChallenge: (id: string, text: string) => void;
  onRestoreChallenges: () => void;
  onResetSettings: () => void;
  onAdded: () => void;
}) {
  const [vibrations, setVib] = useState(vibrationsOn);
  const [draft, setDraft] = useState<{ text: string; level: Level; reward: number }>({ text: '', level: 'facile', reward: 5 });
  const hidden = mode ? HIDDEN[mode] : [];
  const field = (f: SettingField) => (
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
  );
  const fields = SETTING_FIELDS.filter((f) => !hidden.includes(f.key));
  const virtual = mode === 'tournant' || mode === 'banque';
  const onTable = s.playerSlots + (mode === 'banque' ? 0 : s.dealerSlots);
  return (
    <>
      <section class="panel" aria-labelledby="settings-title">
        <div class="k">Réglages</div>
        <h1 class="h1" id="settings-title">
          La maison
        </h1>
        <p class="small">
          {mode
            ? 'Seuls les réglages utiles à la partie en cours sont affichés. Les jetons de départ comptent pour la prochaine partie, le reste tout de suite.'
            : "Les jetons de départ s'appliquent à la prochaine partie ; le reste s'applique tout de suite."}
        </p>
      </section>

      <Fold id="game" title="Partie" summary={s.startChips + ' jetons · ' + s.rounds + ' manches · recave ' + s.rebuyChips} open>
        {fields.filter((f) => !SLOT_KEYS.includes(f.key)).map(field)}
      </Fold>

      <Fold id="bets" title="Mises par manche" summary={s.bets.slice(0, s.rounds).map((b) => b.min + '–' + b.max).join(' · ')}>
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
      </Fold>

      {mode !== 'cartes' && (
        <Fold
          id="table"
          title="Table virtuelle"
          summary={plural(s.table.decks, 'jeu', 'jeux') + ' · carte cachée ' + (s.table.holeCard === 'americaine' ? 'à l’américaine' : 'à l’européenne')}
        >
          <p class="small">
            {virtual ? '' : "Pour le mode « Tout dans l'app ». "}S'applique à la donne suivante ; changer le nombre de jeux remélange le sabot.
          </p>
          <Stepper
            id="set-decks"
            label="Jeux de cartes dans le sabot"
            value={s.table.decks}
            min={DECKS_MIN}
            max={DECKS_MAX}
            onChange={(v) => {
              if (v !== null) onSettings(setTable(s, { decks: v }));
            }}
          />
          <Toggle id="set-h17" label="Le croupier tire sur 17 souple (As + 6)" checked={s.table.hitSoft17} onChange={(hitSoft17) => onSettings(setTable(s, { hitSoft17 }))} />
          <Toggle
            id="set-das"
            label="Doubler après un split"
            checked={s.table.doubleAfterSplit}
            onChange={(doubleAfterSplit) => onSettings(setTable(s, { doubleAfterSplit }))}
          />
          <div class="set-row">
            <label class="set-label" for="set-hole">
              Carte cachée du croupier
            </label>
            <select
              id="set-hole"
              class="txt auto-w"
              value={s.table.holeCard}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v === 'europeenne' || v === 'americaine') onSettings(setTable(s, { holeCard: v }));
              }}
            >
              <option value="europeenne">À l'européenne</option>
              <option value="americaine">À l'américaine</option>
            </select>
          </div>
        </Fold>
      )}

      <Fold id="ch" title={'Défis (' + s.challenges.length + ')'} summary={plural(onTable, 'défi', 'défis') + ' sur la table à la fois'}>
        {fields.filter((f) => SLOT_KEYS.includes(f.key)).map(field)}
        <p class="small">
          Touchez un défi pour changer son texte, son niveau (et donc sa couleur) ou son gain. En mode « Tout dans l'app », les défis marqués ✓ sont validés
          automatiquement ; un défi réécrit ou ajouté se réclame à la main. Les changements de défis sur la table valent pour les prochains tirages.
        </p>
        <ul class="plain-list ch-list">
          {s.challenges.map((c, i) => (
            <li key={c.id}>
              <details class="ch-edit">
                <summary class="ch-sum">
                  <span class={'lv-dot lv-' + c.level} aria-hidden="true" />
                  <span class="grow">{c.text || 'Défi sans texte'}</span>
                  {c.auto && (
                    <span class="ch-auto" title="Validé automatiquement">
                      ✓<span class="sr"> validé automatiquement</span>
                    </span>
                  )}
                  <b>+{c.reward}</b>
                </summary>
                <div class="ch-edit-top">
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
              </details>
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
      </Fold>

      <Fold id="device" title="Sur cet appareil" summary={'Vibrations ' + (vibrations ? 'activées' : 'coupées')}>
        <Toggle
          id="set-vibrations"
          label="Vibrations (cartes, gains, blackjack, manches)"
          checked={vibrations}
          onChange={(on) => {
            setVibrations(on);
            setVib(on);
          }}
        />
        {vibrations && (
          <Haptic>
            <button type="button" class="btn" onClick={() => buzz('gagne')}>
              Tester la vibration
            </button>
          </Haptic>
        )}
        <p class="small">
          Sur Android, le téléphone vibre aux moments forts de la partie. Sur iPhone, Safari ne laisse vibrer qu’au toucher : un petit « tic » quand
          vous touchez les boutons du jeu (mises, Distribuer, Tirer, Rester…).
        </p>
        {isIOS() && (
          <div class="set-row">
            <label class="set-label" for="set-native-switch">
              Interrupteur de l’iPhone : s’il ne vibre pas non plus, activez Réglages › Sons et vibrations › Retour haptique système
            </label>
            <input id="set-native-switch" type="checkbox" class="native-switch" {...{ switch: '' }} />
          </div>
        )}
        <p class="small">Cet appareil : {hapticsMode()}.</p>
      </Fold>

      <section class="panel">
        <button type="button" class="btn danger" onClick={onResetSettings}>
          Remettre les réglages par défaut
        </button>
      </section>
    </>
  );
}
