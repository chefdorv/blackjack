// Fin de manche (règlement), décompte des jetons et podium.
import { plural, signed } from '../game/format';
import { allCounted } from '../game/game';
import { blackjackKings, finalRanking, pending, type ScoreRow } from '../game/scoring';
import type { Championship, Game, Settings } from '../game/types';
import { Stepper } from './common';

export function SettleScreen({
  game: g,
  settings: s,
  onSettle,
  onSettleAll,
  onNext,
}: {
  game: Game;
  settings: Settings;
  onSettle: (pid: string) => void;
  onSettleAll: () => void;
  onNext: () => void;
}) {
  const last = g.round >= s.rounds;
  const rows = g.players.map((p) => ({ p, due: pending(p, s) }));
  const anyLeft = rows.some((r) => r.due !== 0);
  return (
    <section class="panel" aria-labelledby="settle-title">
      <div class="k">Fin de la manche {g.settling?.round ?? g.round}</div>
      <h1 class="h1" id="settle-title">
        On règle les comptes
      </h1>
      <p class="muted">
        Chacun prend à la banque les jetons gagnés avec les défis, ou rembourse ses malus de recave, en vrais jetons. Touchez le bouton quand c'est
        fait.
      </p>
      <div>
        {rows.map(({ p, due }) => (
          <div class="set-row" key={p.id}>
            <div class="grow">
              <div class="set-label">{p.name}</div>
              <div class="small">
                {due > 0
                  ? 'prend ' + due + ' jetons à la banque (défis)'
                  : due < 0
                    ? 'rend ' + -due + ' jetons à la banque (recave)'
                    : 'rien à régler'}
              </div>
            </div>
            <span class={'settle-amt' + (due > 0 ? ' pos' : due < 0 ? ' neg' : '')}>{signed(due)}</span>
            {due !== 0 ? (
              <button type="button" class="btn sm gold" onClick={() => onSettle(p.id)} aria-label={(due > 0 ? 'Encaissé : ' : 'Payé : ') + p.name}>
                {due > 0 ? 'Encaissé' : 'Payé'}
              </button>
            ) : (
              <span class="badge">Réglé</span>
            )}
          </div>
        ))}
      </div>
      {anyLeft && (
        <button type="button" class="btn" onClick={onSettleAll}>
          Tout le monde a réglé
        </button>
      )}
      <p class="small">
        Un joueur ne peut pas payer tout de suite ? Ce qui n'est pas réglé est reporté {last ? 'au décompte final' : 'à la manche suivante, ou compté au décompte final'}.
      </p>
      <button type="button" class="btn big gold" onClick={onNext}>
        {last ? 'Passer au décompte final' : 'Lancer la manche ' + (g.round + 1)}
      </button>
    </section>
  );
}

export function CountScreen({
  game: g,
  settings: s,
  onFinal,
  onReveal,
}: {
  game: Game;
  settings: Settings;
  onFinal: (pid: string, v: number | null) => void;
  onReveal: () => void;
}) {
  const kings = blackjackKings(g.players);
  const names = g.players.filter((p) => kings.ids.includes(p.id)).map((p) => p.name);
  const missing = g.players.filter((p) => p.final === null).length;
  return (
    <>
      <section class="panel" aria-labelledby="count-title">
        <div class="k">Partie terminée</div>
        <h1 class="h1" id="count-title">
          On compte les jetons
        </h1>
        <p class="muted">
          Chacun compte ses jetons sur la table (recaves comprises) et on les saisit ici. L'application ajoute ce qui n'a pas été réglé en fin de
          manche et le bonus du roi du blackjack.
        </p>
        <div>
          {g.players.map((p) => {
            const due = pending(p, s);
            return (
              <Stepper
                key={p.id}
                id={'count-' + p.id}
                label={p.name}
                value={p.final}
                step={5}
                min={0}
                max={99999}
                allowEmpty
                placeholder="?"
                decLabel={'Moins 5 jetons pour ' + p.name}
                incLabel={'Plus 5 jetons pour ' + p.name}
                onChange={(v) => onFinal(p.id, v)}
                sub={
                  <div class="small">
                    {(due ? 'non réglé ' + signed(due) : 'tout est réglé') + ' · ' + plural(p.bj, 'blackjack')}
                  </div>
                }
              />
            );
          })}
        </div>
      </section>
      <section class="panel">
        <h2 class="h3">Bonus du roi du blackjack</h2>
        <p class="small">
          {names.length
            ? 'Roi du blackjack (+' + s.bonusBJ + ') : ' + names.join(', ') + ' avec ' + plural(kings.max, 'blackjack') + '.'
            : 'Aucun blackjack compté : pas de bonus du roi du blackjack.'}
        </p>
      </section>
      <p class="small" style="text-align:center" aria-live="polite">
        {missing ? 'Encore ' + plural(missing, 'joueur') + ' à compter.' : 'Tout est compté !'}
      </p>
      <button type="button" class="btn big gold" onClick={onReveal} disabled={!allCounted(g)}>
        Voir le podium
      </button>
    </>
  );
}

export function RankList({ rows, detail }: { rows: Array<{ id: string; place: number; name: string; score: number }>; detail: (id: string) => string }) {
  return (
    <ol class="rank" style="margin:0;padding:0;list-style:none">
      {rows.map((r) => (
        <li class={'rank-row' + (r.place === 1 ? ' top1' : '')} key={r.id}>
          <span class="rank-pos" aria-label={r.place + (r.place === 1 ? 're' : 'e') + ' place'}>
            {r.place}
          </span>
          <div class="grow">
            <div class="rank-name">{r.name}</div>
            <div class="rank-sub">{detail(r.id)}</div>
          </div>
          <span class="rank-score">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}

function FinalTable({ rows }: { rows: ScoreRow[] }) {
  return (
    <div class="tbl-wrap">
      <table class="tbl">
        <caption class="sr">Décompte détaillé par joueur</caption>
        <thead>
          <tr>
            <th scope="col">
              <span aria-hidden="true">#</span>
              <span class="sr">Place</span>
            </th>
            <th scope="col">Joueur</th>
            <th scope="col">Jetons</th>
            <th scope="col">Non réglé</th>
            <th scope="col">Bonus</th>
            <th scope="col">BJ</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} class={r.place === 1 ? 'top1' : ''}>
              <td class="t-place">{r.place}</td>
              <th scope="row" class="t-name" style="text-align:left">
                {r.name}
              </th>
              <td>{r.chips ?? 0}</td>
              <td class={r.unsettled > 0 ? 'pos' : r.unsettled < 0 ? 'neg' : ''}>{signed(r.unsettled)}</td>
              <td>{r.bjBonus ? '+' + r.bjBonus : '0'}</td>
              <td>{r.bj}</td>
              <td class="t-total">{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EndScreen({
  game: g,
  settings: s,
  champ,
  onSave,
  onEdit,
  onRematch,
  onNewGame,
}: {
  game: Game;
  settings: Settings;
  champ: Championship;
  onSave: () => void;
  onEdit: () => void;
  onRematch: () => void;
  onNewGame: () => void;
}) {
  const rows = finalRanking(g, s);
  const saved = g.savedNightId ? champ.nights.find((n) => n.id === g.savedNightId) : undefined;
  const stale =
    saved !== undefined &&
    (saved.results.length !== rows.length || saved.results.some((r, i) => r.name !== rows[i].name || r.score !== rows[i].score || r.place !== rows[i].place));
  // Ordre d'affichage du podium : 2e, 1er, 3e.
  const podium = [rows[1], rows[0], rows[2]].filter((r): r is ScoreRow => r !== undefined);
  return (
    <>
      <div class="confetti" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <span key={i} class={'cf c' + i} />
        ))}
      </div>
      <h1 class="end-title">Fin de partie</h1>
      <section class="podium" aria-label="Podium">
        {podium.map((r) => (
          <div class={'pod pos' + Math.min(r.place, 3)} key={r.id}>
            {r.place === 1 && (
              <span class="crown" aria-hidden="true">
                ♛
              </span>
            )}
            <span class="pod-name">{r.name}</span>
            <span class="pod-score">{r.score} pts</span>
            <div class="pod-block" aria-label={r.place + (r.place === 1 ? 're' : 'e') + ' place'}>
              {r.place}
            </div>
          </div>
        ))}
      </section>
      <section class="panel">
        <h2 class="h2">Décompte final</h2>
        <p class="small">Score = jetons comptés + ce qui n'a pas été réglé en fin de manche + bonus du roi du blackjack.</p>
        <FinalTable rows={rows} />
        {!saved && (
          <button type="button" class="btn big gold" onClick={onSave}>
            Enregistrer au championnat
          </button>
        )}
        {saved && !stale && <p class="muted">Soirée enregistrée au championnat.</p>}
        {saved && stale && (
          <button type="button" class="btn big gold" onClick={onSave}>
            Mettre à jour la soirée au championnat
          </button>
        )}
        <button type="button" class="btn ghost" onClick={onEdit}>
          Modifier le décompte
        </button>
        <div class="grid2">
          <button type="button" class="btn" onClick={onRematch}>
            Revanche
          </button>
          <button type="button" class="btn" onClick={onNewGame}>
            Nouvelle partie
          </button>
        </div>
      </section>
    </>
  );
}
