// Mode « Tout dans l'app » : la table de blackjack virtuelle.
import { useEffect, useRef, useState } from 'preact/hooks';
import { handValue, isBlackjack, isWin, type Hand, type HandAction, type Outcome, type Round } from '../game/blackjack';
import { kindOf, tableChallenges } from '../game/challenges';
import { levelLabel } from '../game/defaults';
import { plural, signed } from '../game/format';
import { betFor } from '../game/settings';
import type { Challenge, Game, Player, Settings, Virtual } from '../game/types';
import { betRange, chipsOf, dealerPlayer, legal, seatedPlayers, turnPid } from '../game/virtual';
import { buzz } from '../haptics';
import { Haptic, Stepper } from './common';
import { CardBack, PlayingCard, totalLabel } from './PlayingCard';

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const DEAL_MS = 300;
const DEALER_MS = 800;

interface Reveal {
  dealNo: number;
  /** Cartes de la distribution initiale déjà posées. */
  dealt: number;
  /** Cartes du croupier face visible. */
  dealerUp: number;
}

const ALL = Number.POSITIVE_INFINITY;

/** Rejoue la distribution puis le jeu du croupier carte par carte ; tout est visible au chargement. */
function useReveal(v: Virtual): { r: Reveal; done: boolean; dealing: boolean; skip: () => void } {
  const round = v.round;
  const [r, setR] = useState<Reveal>({ dealNo: v.dealNo, dealt: ALL, dealerUp: ALL });
  const instant = reducedMotion();
  const current: Reveal = r.dealNo === v.dealNo ? r : { dealNo: v.dealNo, dealt: instant ? ALL : 0, dealerUp: instant ? ALL : 0 };
  if (current !== r) setR(current);

  const seats = round?.seats.length ?? 0;
  const initial = round ? seats * 2 + (round.rules.holeCard === 'americaine' ? 2 : 1) : 0;
  const dealing = round !== null && current.dealt < initial;
  const finished = round?.phase === 'terminee';
  const dealerTarget = round ? (finished ? round.dealer.length : 1) : 0;
  const dealerDone = !round || current.dealerUp >= dealerTarget;
  const done = !dealing && (!finished || dealerDone);

  useEffect(() => {
    if (!round) return;
    let next: Reveal | null = null;
    let delay = DEAL_MS;
    if (current.dealt < initial) {
      next = { ...current, dealt: current.dealt + 1, dealerUp: current.dealt + 1 > seats ? Math.max(current.dealerUp, 1) : current.dealerUp };
    } else if (current.dealerUp < dealerTarget) {
      next = { ...current, dealerUp: current.dealerUp + 1 };
      delay = current.dealerUp === 0 ? DEAL_MS : DEALER_MS;
    }
    if (!next) return;
    const t = window.setTimeout(() => setR(next), delay);
    return () => window.clearTimeout(t);
  }, [current.dealNo, current.dealt, current.dealerUp, initial, dealerTarget]);

  return { r: current, done, dealing, skip: () => setR({ dealNo: v.dealNo, dealt: ALL, dealerUp: ALL }) };
}

const OUTCOME: Record<Outcome, string> = { blackjack: 'Blackjack', gagne: 'Gagné', egalite: 'Égalité', perdu: 'Perdu', saute: 'Sauté' };
const OUTCOME_CLASS: Record<Outcome, string> = { blackjack: 'bj', gagne: 'win', egalite: 'push', perdu: 'lose', saute: 'lose' };

function HandView({
  hand,
  label,
  visible,
  active,
  showResult,
}: {
  hand: Hand;
  label: string;
  visible: number;
  active: boolean;
  showResult: boolean;
}) {
  const shown = hand.cards.slice(0, visible);
  const v = handValue(shown);
  return (
    <div class={'hand' + (active ? ' on' : '')} aria-label={label}>
      <div class="cards-row">
        {shown.map((c, i) => (
          <PlayingCard key={i} card={c} />
        ))}
      </div>
      <div class="hand-meta">
        {shown.length > 0 && <span class={'total' + (v.bust ? ' bust' : '')}>{totalLabel(shown)}</span>}
        <span class="hand-bet" aria-label={'Mise ' + hand.bet + ' jetons'}>
          <span class="chip-ico" aria-hidden="true" />
          {hand.bet}
          {hand.doubled && <small> doublée</small>}
        </span>
        {showResult && hand.outcome && (
          <span class={'out ' + OUTCOME_CLASS[hand.outcome]}>
            {OUTCOME[hand.outcome]}
            {hand.net !== 0 && ' ' + signed(hand.net)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Carte cachée du croupier posée face contre la table (règle américaine). */
function holeShown(round: Round | null, reveal: Reveal, up: number): boolean {
  return round !== null && round.rules.holeCard === 'americaine' && round.dealer.length >= 2 && up < 2 && reveal.dealt > round.seats.length * 2 + 1;
}

/** Cartes d'une main déjà posées : pendant la distribution, les deux premières arrivent dans l'ordre du sabot. */
function visibleCards(h: Hand, hi: number, seatIdx: number, nSeats: number, reveal: Reveal, dealing: boolean): number {
  if (!dealing || hi !== 0) return h.cards.length;
  return (reveal.dealt > seatIdx ? 1 : 0) + (reveal.dealt > nSeats + 1 + seatIdx ? 1 : 0);
}

function DealerZone({ g, round, reveal, done }: { g: Game; round: Round | null; reveal: Reveal; done: boolean }) {
  const dealer = dealerPlayer(g);
  const name = dealer ? dealer.name : 'La banque';
  const cards = round?.dealer ?? [];
  const up = cards.slice(0, Math.min(cards.length, reveal.dealerUp));
  const hole = holeShown(round, reveal, up.length);
  const v = handValue(up);
  return (
    <section class="dealer-zone" aria-label={'Croupier : ' + name}>
      <div class="dz-head">
        <div class="dealer-chip sm" aria-hidden="true">
          D
        </div>
        <div class="grow">
          <div class="k">{dealer ? 'Croupier' : 'Croupier automatique'}</div>
          <div class="dz-name">{name}</div>
        </div>
        {dealer && (
          <div class="stack">
            <span class="stack-v sm">{chipsOf(g, dealer.id)}</span>
            <span class="stack-k">jetons</span>
          </div>
        )}
      </div>
      <div class="dz-cards">
        <div class="cards-row" aria-live="polite">
          {up.map((c, i) => (
            <PlayingCard key={i} card={c} />
          ))}
          {hole && <CardBack />}
          {cards.length === 0 && <span class="dz-empty">Le croupier attend les mises</span>}
        </div>
        {up.length > 0 && (
          <span class={'total big' + (v.bust ? ' bust' : '')}>
            {done && round?.phase === 'terminee' && v.bust ? 'Sauté' : totalLabel(up)}
          </span>
        )}
      </div>
    </section>
  );
}

export interface TableProps {
  game: Game;
  settings: Settings;
  /** Joueurs que cet appareil fait jouer ; null = tous (un seul appareil). */
  controls: readonly string[] | null;
  onBet: (pid: string, amount: number) => void;
  onReady: (pids: string[], ready: boolean) => void;
  onPlay: (pid: string, action: HandAction) => void;
  onNext: () => void;
  onClaim: (cid: string) => void;
  /** Partie en ligne : ce joueur ne répond plus. */
  offline?: (pid: string) => boolean;
  /** Hôte : donner la place d'un joueur déconnecté à un autre appareil (ou la reprendre). */
  onTakeOver?: (pid: string) => void;
}

export function TableScreen(props: TableProps) {
  const v = props.game.virtual;
  return v ? <Table {...props} v={v} /> : null;
}

function Table({ game: g, settings: s, controls, onBet, onReady, onPlay, onNext, onClaim, offline, onTakeOver, v }: TableProps & { v: Virtual }) {
  const { r: reveal, done, dealing, skip } = useReveal(v);
  const round = v.round;
  const seated = seatedPlayers(g);
  const mine = (pid: string) => controls === null || controls.includes(pid);
  const solo = controls === null;
  const dealer = dealerPlayer(g);
  const n = g.players.length;
  const bank = v.mode === 'banque';
  const turn = turnPid(g);
  const busy = round !== null && !done;

  const lastOfRound = bank ? g.deal >= s.bankDeals : g.dealersDone >= n - 1 && g.deal >= s.deals;
  const lastOfDealer = g.deal >= s.deals;
  const nextDealer = g.players[(g.dealer + 1) % n];
  const nextLabel = lastOfRound ? 'Fin de manche : le bilan' : !bank && lastOfDealer ? 'Croupier suivant : ' + nextDealer.name : 'Donne suivante';
  const range = betFor(s, g.round);

  /** Tas affiché : pendant la donne, la mise est sur la table ; le résultat arrive avec le croupier. */
  const shownChips = (p: Player): number => {
    const seat = round?.seats.find((x) => x.pid === p.id);
    const committed = seat ? seat.hands.reduce((sum, h) => sum + h.bet, 0) : 0;
    if (v.phase === 'jeu') return chipsOf(g, p.id) - committed;
    if (v.phase === 'bilan' && !done) return (v.last?.before[p.id] ?? chipsOf(g, p.id)) - committed;
    return chipsOf(g, p.id);
  };

  const myPending = seated.filter((p) => mine(p.id) && !v.ready.includes(p.id));
  // Aucun joueur de cet appareil ne mise (spectateur, croupier de la donne) : rien à valider ni à changer.
  const betting = seated.some((p) => mine(p.id));
  const waitingFor = seated.filter((p) => !v.ready.includes(p.id));
  const challenges = tableChallenges(g, s);

  // La main qui doit jouer reste visible au-dessus du panneau d'actions.
  const turnHand = round?.turn?.hand ?? -1;
  useEffect(() => {
    if (!done || !turn || !mine(turn)) return;
    document.querySelector('.seat-card.is-turn')?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [turn, turnHand, done]);

  // Vibrations : chaque carte posée, un blackjack servi, une main gagnée contre la banque.
  let shownCards = 0;
  if (round) {
    const up = Math.min(round.dealer.length, reveal.dealerUp);
    shownCards = up + (holeShown(round, reveal, up) ? 1 : 0);
    round.seats.forEach((seat, si) => seat.hands.forEach((h, hi) => (shownCards += visibleCards(h, hi, si, round.seats.length, reveal, dealing))));
  }
  const cardsSeen = useRef<{ dealNo: number; n: number } | null>(null);
  useEffect(() => {
    const prev = cardsSeen.current;
    cardsSeen.current = { dealNo: v.dealNo, n: shownCards };
    if (prev && prev.dealNo === v.dealNo && shownCards > prev.n) buzz('carte');
  }, [v.dealNo, shownCards]);
  // Donnes déjà vues à l'ouverture de l'écran : pas de vibration en rechargeant la page.
  const bjSeen = useRef(v.dealNo);
  useEffect(() => {
    if (!round || dealing || bjSeen.current === v.dealNo) return;
    bjSeen.current = v.dealNo;
    if (round.seats.some((seat) => mine(seat.pid) && seat.hands.some(isBlackjack))) buzz('blackjack');
  }, [v.dealNo, dealing, round !== null]);
  const resultShown = done && round?.phase === 'terminee';
  const winSeen = useRef(v.dealNo);
  useEffect(() => {
    if (!resultShown || !round || winSeen.current === v.dealNo) return;
    winSeen.current = v.dealNo;
    // Après le blackjack, laisser la vibration précédente se finir.
    if (round.seats.some((seat) => mine(seat.pid) && seat.hands.some((h) => isWin(h.outcome)))) window.setTimeout(() => buzz('gagne'), 350);
  }, [resultShown, v.dealNo]);

  // Le croupier joue : on le regarde tirer, puis le résultat de la donne apparaît juste en dessous.
  const dealerTurn = round?.phase === 'terminee' && !dealing && !done;
  useEffect(() => {
    // Jusqu'aux compteurs de manche et de donne, juste sous la barre « Quitter » : le croupier est en dessous.
    if (dealerTurn) document.querySelector('.status')?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [dealerTurn]);

  return (
    <>
      <h1 class="sr">Table de blackjack</h1>
      <section class="status tight" aria-label="Où en est la partie">
        <div class="pill">
          <span class="k">Manche</span>
          <span class="pill-v">
            {g.round}
            <small>/{Math.max(s.rounds, g.round)}</small>
          </span>
        </div>
        <div class="pill">
          <span class="k">Donne</span>
          <span class="pill-v">
            {g.deal}
            <small>/{bank ? s.bankDeals : s.deals}</small>
          </span>
        </div>
        <div class="pill">
          <span class="k">Mises</span>
          <span class="pill-v sm">
            {range.min}–{range.max}
          </span>
        </div>
      </section>

      <DealerZone g={g} round={round} reveal={reveal} done={done} />

      {v.phase === 'mises' && (
        <section class="panel bet-panel" aria-labelledby="bet-title">
          <h2 class="h3" id="bet-title">
            {myPending.length > 0 ? 'Faites vos jeux' : betting ? 'Mises validées' : 'Les mises'}
          </h2>
          {myPending.length > 0 ? (
            <>
              {myPending.map((p) => {
                const br = betRange(g, s, p.id);
                return (
                  <Stepper
                    key={p.id}
                    id={'bet-' + p.id}
                    label={p.name}
                    value={v.bets[p.id] ?? br.min}
                    min={br.min}
                    max={br.max}
                    bigStep={5}
                    haptic
                    clearOnFocus
                    decLabel={'Miser un jeton de moins pour ' + p.name}
                    incLabel={'Miser un jeton de plus pour ' + p.name}
                    onChange={(x) => {
                      if (x !== null) onBet(p.id, x);
                    }}
                    sub={
                      <span class="small bet-chips">
                        {chipsOf(g, p.id) + ' jetons'}
                        {br.max < range.max && ' · max ' + br.max}
                      </span>
                    }
                  />
                );
              })}
              <Haptic>
                <button type="button" class="btn big gold bet-go" onClick={() => onReady(myPending.map((p) => p.id), true)}>
                  {solo || waitingFor.length === myPending.length ? 'Distribuer' : 'Valider ma mise'}
                </button>
              </Haptic>
            </>
          ) : (
            <>
              <p class="muted" aria-live="polite">
                En attente de {waitingFor.map((p) => p.name).join(', ')}.
              </p>
              {betting && (
                <button
                  type="button"
                  class="btn ghost"
                  onClick={() =>
                    onReady(
                      seated.filter((p) => mine(p.id)).map((p) => p.id),
                      false,
                    )
                  }
                >
                  Changer ma mise
                </button>
              )}
            </>
          )}
        </section>
      )}

      {v.phase === 'bilan' && done && v.last && (
        <section class="panel recap" aria-labelledby="recap-title">
          <h2 class="h3" id="recap-title">
            Résultat de la donne
          </h2>
          <ul class="recap-list">
            {g.players
              .filter((p) => v.last?.nets[p.id] !== undefined)
              .map((p) => {
                const net = v.last?.nets[p.id] ?? 0;
                return (
                  <li key={p.id}>
                    <span class="grow">
                      {p.name}
                      {dealer?.id === p.id && <span class="small"> · croupier</span>}
                    </span>
                    <b class={net > 0 ? 'pos' : net < 0 ? 'neg' : ''}>{signed(net)}</b>
                  </li>
                );
              })}
          </ul>
          {v.last.claims.map((c) => (
            <p class="recap-ev ok" key={c.cid}>
              <b>{g.players.find((p) => p.id === c.pid)?.name}</b> réussit « {c.text} » : +{c.reward} jetons
            </p>
          ))}
          {v.last.rebuys.map((pid, i) => (
            <p class="recap-ev bad" key={pid + i}>
              <b>{g.players.find((p) => p.id === pid)?.name}</b> est à sec : recave de {s.rebuyChips} jetons, malus −{s.rebuyMalus}
            </p>
          ))}
        </section>
      )}

      <section class="seats" aria-label="Joueurs">
        {seated.map((p) => {
          const seat = round?.seats.find((x) => x.pid === p.id);
          const seatIdx = round ? round.seats.findIndex((x) => x.pid === p.id) : -1;
          const nSeats = round?.seats.length ?? 0;
          const playing = turn === p.id && done;
          return (
            <article key={p.id} class={'seat-card' + (playing ? ' is-turn' : '') + (mine(p.id) && !solo ? ' is-mine' : '')} aria-label={p.name}>
              <div class="pc-head">
                <div class="pc-id">
                  <span class="seat" aria-hidden="true">
                    {g.players.indexOf(p) + 1}
                  </span>
                  <h3 class="seat-name">{p.name}</h3>
                  {!solo && mine(p.id) && <span class="tag-me">Vous</span>}
                  {v.phase === 'mises' && v.ready.includes(p.id) && <span class="tag-ready">Prêt</span>}
                  {offline?.(p.id) && <span class="tag-off">Déconnecté</span>}
                </div>
                <div class="stack">
                  <span class="stack-v sm">{shownChips(p)}</span>
                  <span class="stack-k">jetons</span>
                </div>
              </div>
              {seat &&
                seat.hands.map((h, hi) => {
                  const visible = visibleCards(h, hi, seatIdx, nSeats, reveal, dealing);
                  const active = playing && round?.turn?.hand === hi;
                  return (
                    <HandView
                      key={hi}
                      hand={h}
                      label={p.name + (seat.hands.length > 1 ? ', main ' + (hi + 1) : '')}
                      visible={visible}
                      active={active}
                      showResult={done && round?.phase === 'terminee'}
                    />
                  );
                })}
              {!seat && v.phase === 'mises' && (
                <div class="small">{v.ready.includes(p.id) ? 'Mise : ' + (v.bets[p.id] ?? range.min) + ' jetons' : 'Choisit sa mise…'}</div>
              )}
              {offline?.(p.id) && onTakeOver && !mine(p.id) && (
                <button type="button" class="btn sm ghost" onClick={() => onTakeOver(p.id)}>
                  Donner la place de {p.name}…
                </button>
              )}
              <div class="badges">
                <span class="badge">Défis +{p.bonus}</span>
                {p.rebuys > 0 && <span class="badge warn">{plural(p.rebuys, 'recave')}</span>}
                <span class="badge">{plural(p.bj, 'blackjack')}</span>
              </div>
            </article>
          );
        })}
      </section>

      {challenges.length > 0 && (
        <section class="panel" aria-labelledby="table-defis">
          <h2 class="h3" id="table-defis">
            Défis en jeu
          </h2>
          <ul class="mini-defis">
            {challenges.map((c) => (
              <MiniChallenge key={c.id} c={c} g={g} onClaim={onClaim} />
            ))}
          </ul>
        </section>
      )}

      {v.phase === 'jeu' && done && turn && <ActionDock g={g} pid={turn} mine={mine(turn)} onPlay={onPlay} />}
      {busy && (
        <div class="dock wait" role="status">
          <span>{dealing ? 'Distribution…' : 'Le croupier joue…'}</span>
          <button type="button" class="btn sm ghost" onClick={skip}>
            Accélérer
          </button>
        </div>
      )}
      {v.phase === 'bilan' && done && (
        <div class="dock">
          <Haptic>
            <button type="button" class="btn big gold" onClick={onNext}>
              {nextLabel}
            </button>
          </Haptic>
        </div>
      )}
    </>
  );
}

function MiniChallenge({ c, g, onClaim }: { c: Challenge; g: Game; onClaim: (cid: string) => void }) {
  const dealer = dealerPlayer(g);
  const note = kindOf(c) === 'croupier' ? 'Réservé au croupier' + (dealer ? ' : ' + dealer.name : '') : c.auto ? 'Validé automatiquement' : 'À réclamer à la main';
  return (
    <li class="mini-defi">
      <span class={'lv-dot lv-' + c.level} aria-hidden="true" />
      <span class="grow">
        <span class="sr">{levelLabel(c.level)} : </span>
        {c.text}
        <span class="small mini-note">{note}</span>
      </span>
      <b>+{c.reward}</b>
      {!c.auto && (
        <button type="button" class="btn sm" onClick={() => onClaim(c.id)} aria-label={'Réclamer : ' + c.text}>
          Réclamer
        </button>
      )}
    </li>
  );
}

const ACTION_LABEL: Record<HandAction, string> = { tirer: 'Tirer', rester: 'Rester', doubler: 'Doubler', splitter: 'Splitter' };

function ActionDock({ g, pid, mine, onPlay }: { g: Game; pid: string; mine: boolean; onPlay: (pid: string, action: HandAction) => void }) {
  const p = g.players.find((x) => x.id === pid);
  const round = g.virtual?.round;
  const hand = round?.turn ? round.seats[round.turn.seat]?.hands[round.turn.hand] : undefined;
  if (!p || !hand) return null;
  const l = legal(g);
  const several = (round?.turn && round.seats[round.turn.seat]?.hands.length) ?? 1;
  return (
    <section class="dock" aria-label={'À ' + p.name + ' de jouer'}>
      <div class="dock-head">
        <span>
          À <b>{p.name}</b>
          {several > 1 && round?.turn ? ', main ' + (round.turn.hand + 1) : ''}
        </span>
        <span class="total">{totalLabel(hand.cards)}</span>
      </div>
      {mine ? (
        <div class="dock-btns">
          {(['tirer', 'rester', 'doubler', 'splitter'] as const).map((a) => (
            <Haptic key={a}>
              <button type="button" class={'btn' + (a === 'tirer' ? ' gold' : a === 'rester' ? ' red' : ' ghost')} disabled={!l[a]} onClick={() => onPlay(pid, a)}>
                {ACTION_LABEL[a]}
              </button>
            </Haptic>
          ))}
        </div>
      ) : (
        <p class="small" style="margin:0">
          {p.name} réfléchit…
        </p>
      )}
    </section>
  );
}
