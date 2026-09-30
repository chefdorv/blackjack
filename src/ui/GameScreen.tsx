import { plural, signed } from '../game/format';
import { turnInfo, type Correctable } from '../game/game';
import { pending } from '../game/scoring';
import { betFor } from '../game/settings';
import type { Game, Settings } from '../game/types';
import { Dialog } from './common';

export function GameScreen({
  game: g,
  settings: s,
  unflipped,
  onNext,
  onGoDefis,
  onBlackjack,
  onRebuy,
  onCorrect,
}: {
  game: Game;
  settings: Settings;
  unflipped: number;
  onNext: () => void;
  onGoDefis: () => void;
  onBlackjack: (pid: string) => void;
  onRebuy: (pid: string) => void;
  onCorrect: (pid: string) => void;
}) {
  const t = turnInfo(g, s);
  const bet = betFor(s, g.round);
  const n = g.players.length;
  return (
    <>
      <h1 class="sr">Partie en cours</h1>
      <section class="status" aria-label="Où en est la partie">
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
            <small>/{Math.max(s.deals, g.deal)}</small>
          </span>
          <div class="dots" aria-hidden="true">
            {Array.from({ length: Math.min(s.deals, 12) }, (_, i) => (
              <span key={i} class={'dot' + (i < g.deal ? ' on' : '')} />
            ))}
          </div>
        </div>
        <div class="pill">
          <span class="k">Croupier</span>
          <span class="pill-v">
            {g.dealersDone + 1}
            <small>/{n}</small>
          </span>
        </div>
      </section>

      <section class="hero">
        <div class="dealer-banner">
          <div class="dealer-chip" aria-hidden="true">
            D
          </div>
          <div class="grow">
            <div class="k">Croupier en cours</div>
            <div class="dealer-name">{t.dealer.name}</div>
            <div class="small">{t.dealerLine}</div>
          </div>
        </div>
        <div class="bets">
          <div class="k">Mises · manche {g.round}</div>
          <div class="bet-v">
            {bet.min} – {bet.max} <small>jetons</small>
          </div>
        </div>
      </section>

      {unflipped > 0 && (
        <button type="button" class="notice" onClick={onGoDefis}>
          {plural(unflipped, 'carte défi', 'cartes défis')} à retourner
        </button>
      )}

      <button type="button" class="btn big gold" onClick={onNext}>
        {t.nextLabel}
      </button>

      <section class="players" aria-label="Joueurs">
        {g.players.map((p, i) => {
          const isDealer = i === g.dealer;
          const due = pending(p, s);
          return (
            <article key={p.id} class={'pcard' + (isDealer ? ' is-dealer' : '') + (due < 0 ? ' is-broke' : '')} aria-label={p.name + (isDealer ? ', croupier' : '')}>
              <div class="pc-head">
                <div class="pc-id">
                  <span class="seat" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h2 class="pc-name" style="margin:0">
                    {p.name}
                  </h2>
                  {isDealer && <span class="tag-dealer">Croupier</span>}
                </div>
                <div class="stack">
                  <span class="stack-v">{signed(due)}</span>
                  <span class="stack-k">à régler</span>
                </div>
              </div>
              <div class="badges">
                <span class="badge">Défis +{p.bonus}</span>
                <span class={'badge' + (p.rebuys ? ' warn' : '')}>Recaves : {p.rebuys}</span>
                <span class="badge">Blackjacks : {p.bj}</span>
              </div>
              <div class="pc-foot3">
                <button type="button" class="btn ghost" onClick={() => onBlackjack(p.id)} aria-label={'+1 blackjack pour ' + p.name}>
                  +1 Blackjack
                </button>
                <button type="button" class="btn red" onClick={() => onRebuy(p.id)} aria-label={'Recave de ' + p.name}>
                  Recave
                </button>
                <button type="button" class="btn ghost" onClick={() => onCorrect(p.id)} aria-label={'Corriger ' + p.name}>
                  Corriger
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

export function CorrectSheet({
  game: g,
  settings: s,
  pid,
  onAdjust,
  onClose,
}: {
  game: Game;
  settings: Settings;
  pid: string;
  onAdjust: (field: Correctable, delta: number) => void;
  onClose: () => void;
}) {
  const idx = g.players.findIndex((p) => p.id === pid);
  const p = g.players[idx];
  if (!p) return null;
  const row = (label: string, value: string | number, field: Correctable, step: number, what: string) => (
    <div class="set-row">
      <span class="set-label">{label}</span>
      <div class="step">
        <button type="button" class="qbtn" onClick={() => onAdjust(field, -step)} aria-label={'Retirer ' + what}>
          {step === 1 ? '−' : '−' + step}
        </button>
        <span class="stepv" aria-live="polite">
          {value}
        </span>
        <button type="button" class="qbtn" onClick={() => onAdjust(field, step)} aria-label={'Ajouter ' + what}>
          {step === 1 ? '+' : '+' + step}
        </button>
      </div>
    </div>
  );
  return (
    <Dialog label={'Corriger ' + p.name} onClose={onClose} variant="sheet">
      <div class="sheet-head">
        <div>
          <div class="k">{idx === g.dealer ? 'Croupier en cours' : 'Joueur ' + (idx + 1)}</div>
          <div class="pc-name">{p.name}</div>
        </div>
        <div class="stack">
          <span class="stack-v">{signed(pending(p, s))}</span>
          <span class="stack-k">à régler</span>
        </div>
      </div>
      <p class="small">Pour corriger une erreur. Le bouton Annuler en haut de l'écran annule aussi la dernière action.</p>
      {row('Blackjacks', p.bj, 'bj', 1, 'un blackjack')}
      {row('Recaves (−' + s.rebuyMalus + ' chacune)', p.rebuys, 'rebuys', 1, 'une recave')}
      {row('Gains de défis', '+' + p.bonus, 'bonus', 5, '5 jetons de défis')}
      <button type="button" class="btn big gold" onClick={onClose}>
        Fermer
      </button>
    </Dialog>
  );
}
