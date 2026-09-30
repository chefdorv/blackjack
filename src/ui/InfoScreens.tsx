// Onglets Classement et Règles.
import { CHAMP_POINTS, LEVELS } from '../game/defaults';
import { frDate, plural, signed } from '../game/format';
import { championshipStandings, finalRanking, liveRanking, type ScoreRow } from '../game/scoring';
import { betFor } from '../game/settings';
import type { Championship, Game, Settings } from '../game/types';
import { RankList } from './EndScreens';

function liveDetail(r: ScoreRow): string {
  const parts = ['défis +' + r.bonus];
  if (r.malus) parts.push('−' + r.malus + ' (' + plural(r.rebuys, 'recave') + ')');
  if (r.bjBonus) parts.push('+' + r.bjBonus + ' roi du blackjack');
  parts.push(plural(r.bj, 'blackjack'));
  return parts.join(' · ');
}

function finalDetail(r: ScoreRow): string {
  const parts = [(r.chips ?? 0) + ' jetons'];
  if (r.unsettled) parts.push('non réglé ' + signed(r.unsettled));
  if (r.bjBonus) parts.push('+' + r.bjBonus + ' roi du blackjack');
  parts.push(plural(r.bj, 'blackjack'));
  return parts.join(' · ');
}

const CHAMP_RULE = CHAMP_POINTS.join(' / ');

export function RankScreen({
  game: g,
  settings: s,
  champ,
  onEndNow,
  onDeleteNight,
}: {
  game: Game | null;
  settings: Settings;
  champ: Championship;
  onEndNow: () => void;
  onDeleteNight: (id: string) => void;
}) {
  const fin = g?.finished === true;
  const rows = g ? (fin ? finalRanking(g, s) : liveRanking(g, s)) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const standings = championshipStandings(champ.nights);
  const byKey = new Map(standings.map((r) => [r.key, r]));
  const nights = champ.nights.slice().reverse();
  return (
    <>
      {g && (
        <section class="panel" aria-labelledby="rank-title">
          <div class="k">{fin ? 'Résultat final' : 'En direct · manche ' + g.round + '/' + Math.max(s.rounds, g.round)}</div>
          <h1 class="h1" id="rank-title">
            Classement
          </h1>
          <p class="small">
            {fin
              ? "Score = jetons comptés + ce qui n'a pas été réglé en fin de manche + bonus du roi du blackjack."
              : "En cours de partie, on ne compte pas les jetons : le classement montre les gains des défis − les malus de recave (réglés ou non), plus le bonus du roi du blackjack qu'on attribuerait maintenant. Le vrai classement se fait au décompte final."}
          </p>
          <RankList
            rows={rows}
            detail={(id) => {
              const r = byId.get(id);
              return r ? (fin ? finalDetail(r) : liveDetail(r)) : '';
            }}
          />
          {!fin && (
            <button type="button" class="btn danger" onClick={onEndNow}>
              Terminer la partie maintenant
            </button>
          )}
        </section>
      )}
      <section class="panel" aria-labelledby="champ-title">
        <div class="k">Plusieurs soirées</div>
        {g ? (
          <h2 class="h2" id="champ-title">
            Championnat
          </h2>
        ) : (
          <h1 class="h1" id="champ-title">
            Championnat
          </h1>
        )}
        <p class="small">
          Chaque soirée rapporte {CHAMP_RULE} points aux cinq premiers (les ex æquo prennent les points de leur place). Classement général par points,
          départagé par le nombre de victoires. Les joueurs sont reconnus par leur nom, sans tenir compte des majuscules.
        </p>
        {standings.length === 0 ? (
          <div class="empty">Aucune soirée enregistrée. À la fin d'une partie, touchez « Enregistrer au championnat ».</div>
        ) : (
          <RankList
            rows={standings.map((r) => ({ id: r.key, place: r.place, name: r.name, score: r.pts }))}
            detail={(key) => {
              const r = byKey.get(key);
              return r ? plural(r.nights, 'soirée') + ' · ' + plural(r.wins, 'victoire') : '';
            }}
          />
        )}
        {nights.length > 0 && (
          <>
            <h3 class="h3">Soirées</h3>
            <ul class="log" style="margin:0;padding:0;list-style:none">
              {nights.map((n) => {
                const winners = n.results.filter((r) => r.place === 1).map((r) => r.name);
                return (
                  <li class="log-row" key={n.id}>
                    <span class="grow">
                      <b>{frDate(n.date)}</b>
                      <br />
                      <span class="small">
                        {(winners.length > 1 ? winners.join(' et ') + ' gagnent' : (winners[0] ?? '?') + ' gagne') + ' · ' + plural(n.results.length, 'joueur')}
                      </span>
                    </span>
                    <button type="button" class="btn sm danger" onClick={() => onDeleteNight(n.id)} aria-label={'Supprimer la soirée du ' + frDate(n.date)}>
                      Supprimer
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

export function RulesScreen({ settings: s }: { settings: Settings }) {
  const bets = Array.from({ length: s.rounds }, (_, i) => {
    const b = betFor(s, i + 1);
    return b.min + ' à ' + b.max + ' jetons en manche ' + (i + 1);
  }).join(', ');
  const rules: Array<[string, string]> = [
    ['Joueurs.', '3 à 8 joueurs, chacun commence avec ' + s.startChips + ' jetons. On joue avec de vraies cartes et de vrais jetons, sans argent.'],
    [
      'Croupier tournant.',
      'Chaque joueur est croupier pendant ' + plural(s.deals, 'donne') + ', puis la main passe à gauche (joueur suivant dans l’ordre de la table). Une manche = tout le monde a été croupier une fois. ' +
        plural(s.rounds, 'manche') + ' par partie.',
    ],
    ['Le croupier', 'tire jusqu’à 16 et reste à 17. Blackjack payé 3 contre 2, arrondi au jeton supérieur. Pas d’assurance, un seul split par main.'],
    ['Mises :', bets + '.'],
    ['Recave.', 'Un joueur à 0 jeton reprend ' + s.rebuyChips + ' jetons à la banque, avec un malus de ' + s.rebuyMalus + ' jetons.'],
    [
      'Défis.',
      'En permanence, ' + plural(s.playerSlots, 'défi joueur', 'défis joueurs') + ' et ' + plural(s.dealerSlots, 'défi croupier', 'défis croupier') +
        ' sont en jeu. Le premier qui réussit un défi le réclame et gagne les jetons indiqués ; la carte est aussitôt remplacée par une nouvelle du même type. Le défi croupier est réservé au croupier en cours. Un défi ne sort qu’une fois par partie.',
    ],
    [
      'Fin de manche.',
      'On règle les comptes : chacun prend à la banque les jetons gagnés avec les défis, ou rembourse ses malus de recave (' + s.rebuyMalus +
        ' jetons par recave). Ce qui ne peut pas être payé est reporté.',
    ],
    ['Pendant la partie,', 'les mises se jouent avec les vrais jetons, sans rien saisir. L’application suit les défis, les recaves et les blackjacks.'],
    [
      'Classement final :',
      'jetons comptés + ce qui n’a pas été réglé + bonus de fin. Bonus de fin : +' + s.bonusBJ +
        ' au joueur qui a fait le plus de blackjacks (chacun le prend en cas d’égalité ; aucun bonus si personne n’en a fait).',
    ],
    ['Championnat.', 'Sur plusieurs soirées : ' + CHAMP_RULE + ' points selon la place, cumulés au classement général.'],
  ];
  const levels = LEVELS.map((l) => ({ ...l, items: s.challenges.filter((c) => c.level === l.key) })).filter((l) => l.items.length > 0);
  return (
    <>
      <section class="panel" aria-labelledby="rules-title">
        <div class="k">À lire avant de miser</div>
        <h1 class="h1" id="rules-title">
          Règles
        </h1>
        <ul class="rules">
          {rules.map(([title, text]) => (
            <li key={title}>
              <b>{title}</b> {text}
            </li>
          ))}
        </ul>
      </section>
      <section class="panel" aria-labelledby="rules-defis">
        <h2 class="h2" id="rules-defis">
          Les défis
        </h2>
        <p class="muted">Chaque niveau a sa couleur : vert (facile), jaune (moyen), orange (difficile), rouge (légendaire) et violet pour les défis croupier.</p>
        {levels.map((l) => (
          <div class="lv-group" key={l.key}>
            <h3 class={'lv-head lv-' + l.key} style="margin:0">
              {l.label} ({l.color})
            </h3>
            <ul style="margin:0;padding:0;list-style:none">
              {l.items.map((c) => (
                <li class="ch-line" key={c.id}>
                  <span>{c.text}</span>
                  <b>+{c.reward}</b>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
