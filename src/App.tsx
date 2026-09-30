import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { claimChallenge, fillChallenges, flipAll, flipCard, unflippedCount } from './game/challenges';
import { defaultSettings } from './game/defaults';
import { plural } from './game/format';
import { addBlackjack, addRebuy, adjustPlayer, advance, createGame, endGame, finishSettling, setFinalCount, type Correctable } from './game/game';
import { lastLabel, pushHistory } from './game/history';
import type { Persisted, Tab } from './game/persist';
import { buildNight, settleAll, settlePlayer } from './game/scoring';
import { restoreChallenges, removeChallenge } from './game/settings';
import type { ChallengeKind, Game, Settings } from './game/types';
import { saveState, loadState } from './storage';
import { ConfirmDialog, type ConfirmRequest } from './ui/common';
import { ClaimDialog, DefisScreen } from './ui/DefisScreen';
import { CountScreen, EndScreen, SettleScreen } from './ui/EndScreens';
import { CorrectSheet, GameScreen } from './ui/GameScreen';
import { IconBook, IconCards, IconSliders, IconTable, IconTrophy, IconUndo } from './ui/icons';
import { RankScreen, RulesScreen } from './ui/InfoScreens';
import { SettingsScreen } from './ui/SettingsScreen';
import { SetupScreen } from './ui/SetupScreen';

const rng = () => Math.random();

const EMPTY_TEXT: Record<ChallengeKind, string> = {
  joueur: 'la pioche des défis joueurs est vide',
  croupier: 'la pioche des défis croupier est vide',
};

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

const NAV: Array<{ tab: Tab; label: string; icon: () => JSX.Element }> = [
  { tab: 'table', label: 'Table', icon: IconTable },
  { tab: 'defis', label: 'Défis', icon: IconCards },
  { tab: 'rank', label: 'Classement', icon: IconTrophy },
  { tab: 'rules', label: 'Règles', icon: IconBook },
  { tab: 'settings', label: 'Réglages', icon: IconSliders },
];

export function App() {
  const [data, setDataState] = useState<Persisted>(loadState);
  // Référence toujours à jour : les actions lisent l'état le plus récent, même depuis un minuteur.
  const ref = useRef(data);
  const setData = (next: Persisted) => {
    ref.current = next;
    setDataState(next);
  };
  useEffect(() => {
    saveState(data);
  }, [data]);

  const [sheet, setSheet] = useState<string | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [vanishing, setVanishing] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const vanishTimer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(vanishTimer.current);
    },
    [],
  );

  const flash = (msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };

  const ask = (text: string, onYes: () => void, yes = 'Oui') => setConfirm({ text, yes, onYes });

  /** Applique une action de partie en enregistrant l'état précédent pour « Annuler ». */
  const act = (label: string, next: Game, patch: Partial<Persisted> = {}) => {
    const d = ref.current;
    if (!d.game) return;
    setData({ ...d, ...patch, game: next, history: pushHistory(d.history, label, d.game) });
  };
  /** Changement d'état de la partie qui ne mérite pas une entrée d'annulation (retourner une carte, saisir un compte). */
  const quiet = (fn: (g: Game) => Game) => {
    const d = ref.current;
    if (d.game) setData({ ...d, game: fn(d.game) });
  };
  const player = (pid: string) => ref.current.game?.players.find((p) => p.id === pid);

  const setTab = (tab: Tab) => {
    if (tab !== ref.current.tab) {
      setData({ ...ref.current, tab });
      window.scrollTo(0, 0);
    }
  };

  // ---- actions ----
  const startGame = (names: string[]) => {
    const d = ref.current;
    const r = createGame(names, d.settings, rng);
    setData({ ...d, game: r.game, history: [], tab: 'table', setupNames: names });
    setSheet(null);
    scrollTop();
    flash("C'est parti ! " + plural(r.game.current.length, 'défi') + ' sur la table' + r.empty.map((k) => ' · ' + EMPTY_TEXT[k]).join(''));
  };

  const nextDeal = () => {
    const d = ref.current;
    if (!d.game) return;
    const r = advance(d.game, d.settings);
    if (!r.label) return;
    act(r.label, r.game);
    if (r.event === 'croupier') flash(r.game.players[r.game.dealer].name + ' prend la main');
    if (r.event === 'fin-de-manche') {
      scrollTop();
      flash('Fin de la manche ' + d.game.round + ' : on règle les comptes');
    }
  };

  const blackjack = (pid: string) => {
    const d = ref.current;
    const p = player(pid);
    if (!d.game || !p) return;
    act(p.name + ' : +1 blackjack', addBlackjack(d.game, pid));
    flash(p.name + ' : ' + plural(p.bj + 1, 'blackjack'));
  };

  const rebuy = (pid: string) => {
    const p = player(pid);
    if (!p) return;
    const s = ref.current.settings;
    ask(p.name + ' est à 0 et reprend ' + s.rebuyChips + ' jetons, malus −' + s.rebuyMalus + ' ?', () => {
      const d = ref.current;
      if (!d.game) return;
      act(p.name + ' : recave', addRebuy(d.game, pid));
      flash(p.name + ' se recave : prenez ' + s.rebuyChips + ' jetons à la banque');
    });
  };

  const correct = (pid: string, field: Correctable, delta: number) => {
    const d = ref.current;
    const p = player(pid);
    if (!d.game || !p) return;
    const what = field === 'bj' ? 'blackjack' : field === 'rebuys' ? 'recave' : 'défis';
    const label = p.name + ' : ' + (delta > 0 ? '+' : '−') + Math.abs(delta) + ' ' + what;
    const next = adjustPlayer(d.game, pid, field, delta);
    if (JSON.stringify(next) !== JSON.stringify(d.game)) act(label, next);
  };

  const claim = (cid: string, pid: string) => {
    setClaimId(null);
    setVanishing(cid);
    window.clearTimeout(vanishTimer.current);
    vanishTimer.current = window.setTimeout(
      () => {
        setVanishing(null);
        const d = ref.current;
        if (!d.game) return;
        const r = claimChallenge(d.game, d.settings, cid, pid, rng);
        if (!r.ok) {
          flash(r.reason === 'reserve-croupier' ? 'Ce défi est réservé au croupier en cours' : 'Ce défi n’est plus sur la table');
          return;
        }
        act('Défi de ' + r.playerName, r.game);
        flash(r.playerName + ' remporte +' + r.reward + ' jetons · ' + (r.replacement ? 'nouvelle carte tirée' : EMPTY_TEXT[r.kind]));
      },
      reducedMotion() ? 0 : 430,
    );
  };

  const settleOne = (pid: string) => {
    const d = ref.current;
    const p = player(pid);
    if (!d.game || !p) return;
    const r = settlePlayer(d.game, d.settings, pid);
    act('Règlement de ' + p.name, r.game);
    flash(r.amount >= 0 ? p.name + ' prend ' + r.amount + ' jetons à la banque' : p.name + ' rend ' + -r.amount + ' jetons à la banque');
  };

  const settleEveryone = () => {
    const d = ref.current;
    if (!d.game) return;
    act('Tout le monde a réglé', settleAll(d.game, d.settings));
    flash('Comptes réglés');
  };

  const endSettling = () => {
    const d = ref.current;
    if (!d.game) return;
    const r = finishSettling(d.game, d.settings, rng);
    const round = r.game.round;
    act(r.event === 'partie-terminee' ? 'Fin de la dernière manche' : 'Lancement de la manche ' + round, r.game);
    scrollTop();
    if (r.event === 'partie-terminee') flash('Partie terminée : place au décompte !');
    else {
      const b = d.settings.bets[round - 1] ?? d.settings.bets[d.settings.bets.length - 1];
      flash('Manche ' + round + ' : mises de ' + b.min + ' à ' + b.max + r.empty.map((k) => ' · ' + EMPTY_TEXT[k]).join(''));
    }
  };

  const endNow = () =>
    ask('Terminer la partie maintenant et passer au décompte ?', () => {
      const d = ref.current;
      if (!d.game) return;
      act('Fin de partie', endGame(d.game), { tab: 'table' });
      scrollTop();
      flash('Place au décompte !');
    });

  const saveChamp = () => {
    const d = ref.current;
    const g = d.game;
    if (!g || !g.finished) return;
    const existing = g.savedNightId ? d.champ.nights.find((n) => n.id === g.savedNightId) : undefined;
    const night = buildNight(g, d.settings, existing?.id ?? 'n' + Date.now().toString(36), existing?.date ?? new Date().toISOString());
    const nights = existing ? d.champ.nights.map((n) => (n.id === night.id ? night : n)) : d.champ.nights.concat(night);
    setData({ ...d, champ: { nights }, game: { ...g, savedNightId: night.id } });
    flash(existing ? 'Soirée mise à jour au championnat' : 'Soirée ajoutée au championnat');
  };

  const toSetup = () => {
    const d = ref.current;
    setData({ ...d, game: null, history: [], tab: 'table', setupNames: d.game ? d.game.players.map((p) => p.name) : d.setupNames });
    setSheet(null);
    scrollTop();
  };

  const undo = () => {
    const d = ref.current;
    const last = d.history[d.history.length - 1];
    if (!last || !d.game) return;
    window.clearTimeout(vanishTimer.current);
    setVanishing(null);
    // Le lien vers le championnat ne s'annule pas : on évite d'enregistrer deux fois la même soirée.
    const restored = { ...last.game, savedNightId: d.game.savedNightId };
    // Les réglages ont pu changer depuis : on complète la table si besoin.
    const synced = restored.finished ? restored : fillChallenges(restored, d.settings, rng).game;
    setData({ ...d, game: synced, history: d.history.slice(0, -1) });
    setSheet(null);
    setClaimId(null);
    setConfirm(null);
    flash('Annulé : ' + last.label);
  };

  const updateSettings = (next: Settings) => {
    const d = ref.current;
    const game = d.game && !d.game.finished ? fillChallenges(d.game, next, rng).game : d.game;
    setData({ ...d, settings: next, game });
  };

  // ---- rendu ----
  const { game: g, settings: s, tab } = data;
  const unflipped = g ? unflippedCount(g, s) : 0;
  const undoLabel = g ? lastLabel(data.history) : null;
  const sheetPlayer = g && sheet ? g.players.find((p) => p.id === sheet) : undefined;
  const claimCh = g && claimId ? s.challenges.find((c) => c.id === claimId) : undefined;

  let screen: JSX.Element;
  if (tab === 'table') {
    if (!g) screen = <SetupScreen names={data.setupNames} settings={s} onNames={(setupNames) => setData({ ...ref.current, setupNames })} onStart={startGame} />;
    else if (g.finished && g.revealed)
      screen = (
        <EndScreen
          game={g}
          settings={s}
          champ={data.champ}
          onSave={saveChamp}
          onEdit={() => {
            quiet((x) => ({ ...x, revealed: false }));
            scrollTop();
          }}
          onRematch={() => ask('Relancer une partie avec les mêmes joueurs ?', () => startGame(g.players.map((p) => p.name)))}
          onNewGame={() => ask('Revenir à la création de partie ?', toSetup)}
        />
      );
    else if (g.finished)
      screen = (
        <CountScreen
          game={g}
          settings={s}
          onFinal={(pid, v) => quiet((x) => setFinalCount(x, pid, v))}
          onReveal={() => {
            quiet((x) => ({ ...x, revealed: true }));
            window.scrollTo(0, 0);
          }}
        />
      );
    else if (g.settling) screen = <SettleScreen game={g} settings={s} onSettle={settleOne} onSettleAll={settleEveryone} onNext={endSettling} />;
    else
      screen = (
        <GameScreen
          game={g}
          settings={s}
          unflipped={unflipped}
          onNext={nextDeal}
          onGoDefis={() => setTab('defis')}
          onBlackjack={blackjack}
          onRebuy={rebuy}
          onCorrect={setSheet}
        />
      );
  } else if (tab === 'defis')
    screen = (
      <DefisScreen
        game={g}
        settings={s}
        vanishing={vanishing}
        onFlip={(cid) => quiet((x) => flipCard(x, cid))}
        onFlipAll={() => quiet(flipAll)}
        onClaim={setClaimId}
      />
    );
  else if (tab === 'rank')
    screen = (
      <RankScreen
        game={g}
        settings={s}
        champ={data.champ}
        onEndNow={endNow}
        onDeleteNight={(id) =>
          ask('Supprimer cette soirée du championnat ?', () => {
            const d = ref.current;
            setData({ ...d, champ: { nights: d.champ.nights.filter((n) => n.id !== id) } });
            flash('Soirée supprimée');
          })
        }
      />
    );
  else if (tab === 'rules') screen = <RulesScreen settings={s} />;
  else
    screen = (
      <SettingsScreen
        settings={s}
        hasGame={g !== null}
        onSettings={updateSettings}
        onAdded={() => flash('Défi ajouté')}
        onDeleteChallenge={(id, text) =>
          ask('Supprimer le défi « ' + text + ' » ?', () => {
            updateSettings(removeChallenge(ref.current.settings, id));
            flash('Défi supprimé');
          })
        }
        onRestoreChallenges={() =>
          ask("Remplacer tous les défis par la liste d'origine ?", () => {
            updateSettings(restoreChallenges(ref.current.settings));
            flash("Défis d'origine restaurés");
          })
        }
        onAbandon={() => ask('Abandonner la partie en cours ? Elle ne pourra pas être reprise.', toSetup)}
        onResetSettings={() =>
          ask('Remettre tous les réglages (et les défis) par défaut ?', () => {
            updateSettings(defaultSettings());
            flash('Réglages par défaut');
          })
        }
      />
    );

  return (
    <div class="app">
      <header class="top">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">
            ♠
          </span>
          <span class="brand-txt">
            Blackjack <span class="brand-sub">entre potes</span>
          </span>
        </div>
        {undoLabel && (
          <button type="button" class="undo" onClick={undo} aria-label={'Annuler : ' + undoLabel}>
            <IconUndo />
            <span class="undo-txt">
              <b>Annuler</b>
              <span class="undo-lbl">{undoLabel}</span>
            </span>
          </button>
        )}
      </header>

      <main class="main" id="contenu">
        {screen}
      </main>

      <nav class="nav" aria-label="Navigation principale">
        {NAV.map(({ tab: t, label, icon: Icon }) => (
          <button
            type="button"
            key={t}
            class={'nav-btn' + (tab === t ? ' on' : '')}
            onClick={() => setTab(t)}
            aria-current={tab === t ? 'page' : undefined}
            aria-label={t === 'defis' && unflipped > 0 ? label + ', ' + plural(unflipped, 'carte face cachée', 'cartes face cachée') : undefined}
          >
            <Icon />
            <span>{label}</span>
            {t === 'defis' && unflipped > 0 && (
              <span class="nav-badge" aria-hidden="true">
                {unflipped}
              </span>
            )}
          </button>
        ))}
      </nav>

      {sheetPlayer && g && (
        <CorrectSheet game={g} settings={s} pid={sheetPlayer.id} onAdjust={(field, delta) => correct(sheetPlayer.id, field, delta)} onClose={() => setSheet(null)} />
      )}
      {claimCh && g && <ClaimDialog game={g} challenge={claimCh} onPick={(pid) => claim(claimCh.id, pid)} onClose={() => setClaimId(null)} />}
      {confirm && <ConfirmDialog req={confirm} onClose={() => setConfirm(null)} />}

      <div class="toast-region" role="status" aria-live="polite">
        {toast && <div class="toast">{toast}</div>}
      </div>
    </div>
  );
}
