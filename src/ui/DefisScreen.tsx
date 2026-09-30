import { canClaim, kindOf, poolRemaining, slotsFor, tableChallenges } from '../game/challenges';
import { levelLabel } from '../game/defaults';
import { plural } from '../game/format';
import type { Challenge, ChallengeKind, Game, Settings } from '../game/types';
import { Dialog } from './common';

function noteFor(c: Challenge, g: Game): string {
  return kindOf(c) === 'croupier' ? 'Réservé au croupier : ' + g.players[g.dealer].name : 'Premier qui réussit';
}

const KIND_LABEL: Record<ChallengeKind, string> = { joueur: 'défis joueurs', croupier: 'défis croupier' };

export function DefisScreen({
  game: g,
  settings: s,
  vanishing,
  onFlip,
  onFlipAll,
  onClaim,
}: {
  game: Game | null;
  settings: Settings;
  vanishing: string | null;
  onFlip: (cid: string) => void;
  onFlipAll: () => void;
  onClaim: (cid: string) => void;
}) {
  const active = g !== null && !g.finished;
  const cards = active ? tableChallenges(g, s) : [];
  const pool = g ? poolRemaining(g, s) : null;
  const anyHidden = active && cards.some((c) => !g.flipped.includes(c.id));
  const exhausted: ChallengeKind[] =
    active && pool
      ? (['joueur', 'croupier'] as const).filter((k) => pool[k] === 0 && cards.filter((c) => kindOf(c) === k).length < slotsFor(s, k))
      : [];
  let kicker = 'Pas de partie en cours';
  if (g && pool) kicker = g.finished ? 'Partie terminée' : 'Manche ' + g.round + ' · ' + plural(pool.joueur + pool.croupier, 'défi') + ' dans la pioche';
  const claims = g ? g.claims.slice().reverse() : [];
  const freshIdx = (id: string) => (g ? g.fresh.indexOf(id) : -1);

  return (
    <>
      <section class="panel" aria-labelledby="defis-title">
        <div class="row wrap" style="justify-content:space-between">
          <div>
            <div class="k">{kicker}</div>
            <h1 class="h1" id="defis-title">
              Cartes défis
            </h1>
          </div>
          {anyHidden && (
            <button type="button" class="btn gold" onClick={onFlipAll}>
              Tout retourner
            </button>
          )}
        </div>
        <p class="muted">
          Il y a toujours {plural(s.playerSlots, 'défi joueur', 'défis joueurs')} et {plural(s.dealerSlots, 'défi croupier', 'défis croupier')} sur la
          table. Le premier qui réussit un défi le réclame et empoche les jetons, puis une nouvelle carte du même type est tirée pour le remplacer. Le
          défi croupier (violet) ne peut être réclamé que par le croupier en cours. Un défi ne sort qu'une fois par partie.
        </p>
        {pool && active && (
          <div class="pool" aria-label="Défis restants dans la pioche">
            <span class="badge">Pioche joueurs : {pool.joueur}</span>
            <span class="badge avail">Pioche croupier : {pool.croupier}</span>
          </div>
        )}
      </section>

      {exhausted.map((k) => (
        <div class="pool-empty" role="status" key={k}>
          La pioche des {KIND_LABEL[k]} est vide : plus aucune nouvelle carte de ce type ne sera tirée cette partie.
        </div>
      ))}

      {cards.length === 0 && (
        <div class="empty">
          {!g
            ? "Créez une partie depuis l'onglet Table pour tirer les premiers défis."
            : g.finished
              ? 'La partie est terminée.'
              : 'Plus aucune carte défi sur la table : la pioche est vide.'}
        </div>
      )}

      {cards.length > 0 && g && (
        <ul class="cards" style="margin:0;padding:0;list-style:none" aria-label="Défis sur la table">
          {cards.map((c, i) => {
            const flipped = g.flipped.includes(c.id);
            const fi = freshIdx(c.id);
            const cls =
              'flip' +
              (flipped ? ' flipped' : '') +
              (vanishing === c.id ? ' vanish' : '') +
              (fi >= 0 && !flipped ? ' deal-in d' + Math.min(fi + 1, 7) : '');
            return (
              <li class={cls} key={c.id}>
                <button
                  type="button"
                  class="flip-inner"
                  onClick={() => {
                    if (!flipped) onFlip(c.id);
                  }}
                  aria-label={flipped ? levelLabel(c.level) + ' : ' + c.text + ', +' + c.reward + ' jetons. ' + noteFor(c, g) + '.' : 'Retourner la carte défi ' + (i + 1) + ' (' + levelLabel(c.level) + ')'}
                  aria-disabled={flipped}
                >
                  <span class="face back" aria-hidden="true">
                    <span class="back-core">♠</span>
                    <span class={'back-lv lv-' + c.level}>{levelLabel(c.level)}</span>
                    <span class="back-tap">Toucher pour retourner</span>
                  </span>
                  <span class={'face front lv-' + c.level} aria-hidden="true">
                    <span class="front-lv">{levelLabel(c.level)}</span>
                    <span class="front-txt">{c.text}</span>
                    <span class="front-note">{noteFor(c, g)}</span>
                    <span class="front-rw">
                      +{c.reward} <small>jetons</small>
                    </span>
                  </span>
                </button>
                {flipped && (
                  <button type="button" class="btn gold claim" onClick={() => onClaim(c.id)} disabled={vanishing !== null} aria-label={'Réclamer : ' + c.text}>
                    Réclamer
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {claims.length > 0 && (
        <section class="panel" aria-labelledby="claims-title">
          <h2 class="h3" id="claims-title">
            Défis réclamés
          </h2>
          <ul class="log" style="margin:0;padding:0;list-style:none">
            {claims.map((cl, i) => (
              <li class="log-row" key={cl.cid + i}>
                <span class={'lv-dot lv-' + cl.level} aria-hidden="true" />
                <span class="grow">
                  <b>{cl.name}</b> · {cl.text} <span class="small">(manche {cl.round})</span>
                </span>
                <b>+{cl.reward}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function ClaimDialog({
  game: g,
  challenge: c,
  onPick,
  onClose,
}: {
  game: Game;
  challenge: Challenge;
  onPick: (pid: string) => void;
  onClose: () => void;
}) {
  const isDealer = kindOf(c) === 'croupier';
  return (
    <Dialog label="Réclamer le défi" onClose={onClose} variant="modal">
      <div class="k">Qui a réussi ?</div>
      <div class={'face front claim-card lv-' + c.level}>
        <span class="front-lv">{levelLabel(c.level)}</span>
        <span class="front-txt">{c.text}</span>
        <span class="front-rw">
          +{c.reward} <small>jetons</small>
        </span>
      </div>
      <p class="small">
        {isDealer
          ? 'Défi croupier : seul ' + g.players[g.dealer].name + ' (croupier en cours) peut le réclamer.'
          : "Touchez le nom du premier joueur qui l'a réussi."}
      </p>
      <div class="pick-list">
        {g.players.map((p, i) => (
          <button type="button" class="pick" key={p.id} onClick={() => onPick(p.id)} disabled={!canClaim(g, c, i)}>
            {p.name} <small>{(i === g.dealer ? 'croupier · ' : '') + 'défis +' + p.bonus}</small>
          </button>
        ))}
      </div>
      <button type="button" class="btn" onClick={onClose}>
        Annuler
      </button>
    </Dialog>
  );
}
