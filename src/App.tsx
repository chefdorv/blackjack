import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { claimChallenge, fillChallenges, flipAll, flipCard, unflippedCount } from './game/challenges';
import { defaultSettings } from './game/defaults';
import { plural } from './game/format';
import { addBlackjack, addRebuy, adjustPlayer, advance, createGame, endGame, finishSettling, setFinalCount, type Correctable } from './game/game';
import { lastLabel, pushHistory } from './game/history';
import { applyIntent, type Intent, type IntentEvent } from './game/intents';
import { moveItem } from './game/names';
import type { Persisted, SetupMode, Tab } from './game/persist';
import { buildNight, settleAll, settlePlayer } from './game/scoring';
import { restoreChallenges, removeChallenge } from './game/settings';
import type { ChallengeKind, Game, Settings } from './game/types';
import { createVirtualGame, finishVirtual, virtualSettings } from './game/virtual';
import { cleanRoomCode, controlled, joinLobby, leaveLobby, newDeviceId, newRoomCode, seatsFor } from './net/protocol';
import { transportKind } from './net/transport';
import { useRoom } from './net/useRoom';
import { deviceId, saveState, loadState } from './storage';
import { ConfirmDialog, type ConfirmRequest } from './ui/common';
import { ClaimDialog, DefisScreen } from './ui/DefisScreen';
import { CountScreen, EndScreen, SettleScreen, VirtualSettleScreen } from './ui/EndScreens';
import { CorrectSheet, GameScreen } from './ui/GameScreen';
import { IconBook, IconCards, IconSliders, IconTable, IconTrophy, IconUndo } from './ui/icons';
import { RankScreen, RulesScreen } from './ui/InfoScreens';
import { GuestLobbyScreen, HostLobbyScreen, JoinScreen, RoomBar } from './ui/RoomScreens';
import { SettingsScreen } from './ui/SettingsScreen';
import { SetupScreen } from './ui/SetupScreen';
import { TableScreen } from './ui/TableScreen';

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

/** Code de salle passé dans le lien partagé (?salle=ABCD). */
function codeFromUrl(): string | null {
  try {
    return cleanRoomCode(new URLSearchParams(window.location.search).get('salle') ?? '');
  } catch {
    return null;
  }
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

  const [device] = useState(() => deviceId(() => newDeviceId(rng)));
  const [kind] = useState(transportKind);
  const [joining, setJoining] = useState<string | null>(() => (kind && !data.room ? codeFromUrl() : null));
  const kicked = useRef(new Set<string>());

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
  const startGame = (names: string[], mode: SetupMode = ref.current.setupMode) => {
    const d = ref.current;
    const r = mode === 'reel' ? createGame(names, d.settings, rng) : createVirtualGame(names, d.settings, mode, rng);
    if (d.room?.role === 'host') {
      // Revanche à plusieurs téléphones : mêmes joueurs, mêmes appareils.
      setData({ ...d, game: r.game, history: [], tab: 'table', room: { ...d.room, seats: seatsFor(r.game, d.room.lobby) } });
      setSheet(null);
      scrollTop();
      return;
    }
    setData({ ...d, game: r.game, history: [], tab: 'table', setupNames: names, setupMode: mode });
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

  /** Mode virtuel : une demande de joueur, appliquée par le moteur (sans entrée d'annulation). */
  const send = (intent: Intent) => {
    const d = ref.current;
    if (d.room?.role === 'guest') {
      net.sendIntent(intent);
      return;
    }
    if (!d.game?.virtual) return;
    const r = applyIntent(d.game, d.settings, intent, rng);
    if (r.game !== d.game) setData({ ...d, game: r.game });
    r.events.forEach(announce);
  };

  const announce = (ev: IntentEvent) => {
    const d = ref.current;
    switch (ev.e) {
      case 'croupier':
        flash(ev.name + ' prend la main');
        break;
      case 'fin-de-manche':
        scrollTop();
        flash('Fin de la manche ' + ev.round + ' : le bilan');
        break;
      case 'manche': {
        scrollTop();
        const b = d.settings.bets[ev.round - 1] ?? d.settings.bets[d.settings.bets.length - 1];
        flash('Manche ' + ev.round + ' : mises de ' + b.min + ' à ' + b.max);
        break;
      }
      case 'fin-de-partie':
        scrollTop();
        flash('Partie terminée !');
        break;
      default:
        // Résultats et défis validés s'affichent dans le bilan de la donne, après le jeu du croupier.
        break;
    }
  };

  const setRoom = (fn: (r: NonNullable<Persisted['room']>) => Persisted['room']) => {
    const d = ref.current;
    if (d.room) setData({ ...d, room: fn(d.room) });
  };

  const net = useRoom({
    kind,
    room: data.room,
    device,
    hostGame: data.room?.role === 'host' ? data.game : null,
    hostSettings: data.settings,
    onHello: (from, names) =>
      setRoom((r) => (r.role === 'host' && !r.seats && !kicked.current.has(from) ? { ...r, lobby: joinLobby(r.lobby, from, names).lobby } : r)),
    onLeave: (from) => setRoom((r) => (r.role === 'host' && !r.seats ? { ...r, lobby: leaveLobby(r.lobby, from) } : r)),
    onIntent: (from, intent) => {
      const d = ref.current;
      if (d.room?.role !== 'host' || !d.room.seats || !d.game?.virtual) return;
      const r = applyIntent(d.game, d.settings, intent, rng, controlled(d.room.seats, from));
      if (r.game !== d.game) setData({ ...d, game: r.game });
      r.events.forEach(announce);
    },
  });

  // Invité : la table change chez l'hôte, on annonce les grands moments comme sur un seul appareil.
  const seen = useRef<{ dealer: number; round: number; settling: boolean; finished: boolean } | null>(null);
  const viewGame = net.view?.game ?? null;
  useEffect(() => {
    if (!viewGame) {
      seen.current = null;
      return;
    }
    const now = { dealer: viewGame.dealer, round: viewGame.round, settling: viewGame.settling !== null, finished: viewGame.finished };
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    if (now.finished && !before.finished) {
      scrollTop();
      flash('Partie terminée !');
    } else if (now.settling && !before.settling) {
      scrollTop();
      flash('Fin de la manche ' + viewGame.round + ' : le bilan');
    } else if (now.round !== before.round) {
      scrollTop();
      flash('Manche ' + now.round);
    } else if (now.dealer !== before.dealer && viewGame.virtual?.mode === 'tournant') flash(viewGame.players[now.dealer].name + ' prend la main');
  }, [viewGame]);

  const openRoom = () => {
    const d = ref.current;
    if (d.setupMode === 'reel') return;
    const lobby = joinLobby([], device, d.setupNames).lobby;
    kicked.current.clear();
    setData({ ...d, room: { role: 'host', code: newRoomCode(rng), mode: d.setupMode, lobby, seats: null }, tab: 'table' });
    scrollTop();
  };

  const startRoomGame = () => {
    const d = ref.current;
    if (d.room?.role !== 'host') return;
    const r = createVirtualGame(
      d.room.lobby.map((e) => e.name),
      d.settings,
      d.room.mode,
      rng,
    );
    setData({ ...d, game: r.game, history: [], tab: 'table', room: { ...d.room, seats: seatsFor(r.game, d.room.lobby) } });
    scrollTop();
    flash("C'est parti ! " + plural(r.game.current.length, 'défi') + ' sur la table');
  };

  const closeRoom = () =>
    ask(
      ref.current.room?.role === 'host' && ref.current.room.seats
        ? 'Fermer la salle ? La partie continue sur ce seul téléphone.'
        : 'Fermer la salle ?',
      () => {
        net.close(true);
        setData({ ...ref.current, room: null });
      },
    );

  const leaveRoom = () =>
    ask('Quitter la salle ?', () => {
      net.close(true);
      setData({ ...ref.current, room: null, tab: 'table' });
    });

  /** L'hôte reprend la place d'un joueur dont le téléphone ne répond plus. */
  const takeOver = (pid: string) =>
    setRoom((r) => (r.role === 'host' && r.seats ? { ...r, seats: { ...r.seats, [pid]: device } } : r));

  const claim = (cid: string, pid: string) => {
    setClaimId(null);
    if (ref.current.room?.role === 'guest') {
      send({ t: 'claim', cid, pid });
      return;
    }
    if (ref.current.game?.virtual) {
      const before = ref.current.game;
      send({ t: 'claim', cid, pid });
      const after = ref.current.game;
      const last = after?.claims[after.claims.length - 1];
      if (after !== before && last) flash(last.name + ' remporte +' + last.reward + ' jetons');
      return;
    }
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
      if (d.game.virtual) {
        setData({ ...d, game: finishVirtual(d.game), tab: 'table' });
        scrollTop();
        flash('Partie terminée !');
        return;
      }
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
    if (d.room?.role === 'host') {
      // À plusieurs téléphones : retour à la salle d'attente, les invités restent connectés.
      setData({ ...d, game: null, history: [], tab: 'table', room: { ...d.room, seats: null } });
      setSheet(null);
      scrollTop();
      return;
    }
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
    let game = d.game && !d.game.finished ? fillChallenges(d.game, virtualSettings(d.game, next), rng).game : d.game;
    if (game?.virtual && !game.finished) game = { ...game, flipped: game.current.slice() };
    setData({ ...d, settings: next, game });
  };

  // ---- rendu ----
  const { tab, room } = data;
  const guest = room?.role === 'guest';
  const hosting = room?.role === 'host';
  // Un invité affiche la table reçue de l'hôte, avec les réglages de l'hôte.
  const g = guest ? (net.closedByHost ? null : (net.view?.game ?? null)) : data.game;
  const settingsRaw = guest ? (net.view?.settings ?? data.settings) : data.settings;
  // En banque automatique, pas de défis croupier : tous les écrans voient 0 emplacement croupier.
  const s = virtualSettings(g, settingsRaw);
  const seats = guest ? (net.view?.seats ?? null) : hosting ? room.seats : null;
  const controls = seats ? controlled(seats, device) : null;
  const unflipped = g ? unflippedCount(g, s) : 0;
  const undoLabel = g && !room ? lastLabel(data.history) : null;
  const pidOffline = (pid: string) => {
    const d = seats?.[pid];
    return d !== undefined && net.offline(d);
  };
  const sheetPlayer = g && sheet ? g.players.find((p) => p.id === sheet) : undefined;
  const claimCh = g && claimId ? s.challenges.find((c) => c.id === claimId) : undefined;

  let screen: JSX.Element;
  if (tab === 'table' && joining !== null && !room)
    screen = (
      <JoinScreen
        initialCode={joining}
        initialNames={data.room === null && data.setupNames.length === 1 ? data.setupNames : []}
        cleanCode={cleanRoomCode}
        onJoin={(code, names) => {
          setJoining(null);
          // On retient le prénom pour la prochaine fois.
          setData({ ...ref.current, room: { role: 'guest', code, names }, tab: 'table', setupNames: names });
        }}
        onCancel={() => setJoining(null)}
      />
    );
  else if (tab === 'table' && room?.role === 'guest' && !g)
    screen = (
      <GuestLobbyScreen
        code={room.code}
        names={room.names}
        lobby={net.lobby}
        device={device}
        status={net.status}
        hostOffline={net.hostOffline}
        closed={net.closedByHost}
        onLeave={leaveRoom}
      />
    );
  else if (tab === 'table' && room?.role === 'host' && !room.seats)
    screen = (
      <HostLobbyScreen
        code={room.code}
        mode={room.mode}
        lobby={room.lobby}
        device={device}
        status={net.status}
        offline={net.offline}
        onAdd={(name) =>
          setRoom((r) =>
            r.role === 'host'
              ? { ...r, lobby: joinLobby(r.lobby, device, r.lobby.filter((e) => e.device === device).map((e) => e.name).concat(name)).lobby }
              : r,
          )
        }
        onRemove={(i) =>
          setRoom((r) => {
            if (r.role !== 'host') return r;
            const e = r.lobby[i];
            if (e && e.device !== device) kicked.current.add(e.device);
            return { ...r, lobby: r.lobby.filter((_, j) => j !== i) };
          })
        }
        onMove={(i, delta) => setRoom((r) => (r.role === 'host' ? { ...r, lobby: moveItem(r.lobby, i, delta) } : r))}
        onStart={startRoomGame}
        onCancel={closeRoom}
      />
    );
  else if (tab === 'table') {
    if (!g)
      screen = (
        <SetupScreen
          names={data.setupNames}
          settings={s}
          mode={data.setupMode}
          onMode={(setupMode) => setData({ ...ref.current, setupMode })}
          onNames={(setupNames) => setData({ ...ref.current, setupNames })}
          onStart={(names) => startGame(names)}
          onHost={kind ? openRoom : undefined}
          onJoin={kind ? () => setJoining(codeFromUrl() ?? '') : undefined}
        />
      );
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
          onRematch={() =>
            ask('Relancer une partie avec les mêmes joueurs ?', () => startGame(g.players.map((p) => p.name), g.virtual ? g.virtual.mode : 'reel'))
          }
          onNewGame={() => ask(hosting ? 'Revenir à la salle d’attente ?' : 'Revenir à la création de partie ?', toSetup)}
          guest={guest}
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
    else if (g.virtual && g.settling) screen = <VirtualSettleScreen game={g} settings={s} onNext={() => send({ t: 'manche' })} />;
    else if (g.virtual)
      screen = (
        <TableScreen
          game={g}
          settings={s}
          controls={controls}
          offline={seats ? pidOffline : undefined}
          onTakeOver={hosting ? takeOver : undefined}
          onBet={(pid, amount) => send({ t: 'bet', pid, amount })}
          onReady={(pids, ready) => send({ t: 'ready', pids, ready })}
          onPlay={(pid, action) => send({ t: 'play', pid, action })}
          onNext={() => send({ t: 'next' })}
          onClaim={setClaimId}
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
        onEndNow={guest ? undefined : endNow}
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
  else if (guest)
    screen = (
      <section class="panel" aria-labelledby="guest-settings">
        <div class="k">Réglages</div>
        <h1 class="h1" id="guest-settings">
          La maison
        </h1>
        <p class="muted">Pendant une partie à plusieurs téléphones, les règles, les mises et les défis sont ceux du téléphone hôte.</p>
        <button type="button" class="btn danger" onClick={leaveRoom}>
          Quitter la salle {room.code}
        </button>
      </section>
    );
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
        {room && g && tab === 'table' && (
          <RoomBar
            code={room.code}
            status={net.status}
            hostOffline={net.hostOffline}
            offlineNames={g.players.filter((p) => pidOffline(p.id)).map((p) => p.name)}
            label={hosting ? 'Fermer la salle' : 'Quitter'}
            onClose={hosting ? closeRoom : leaveRoom}
          />
        )}
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
