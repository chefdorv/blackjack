import { handValue, isRed, rankOf, suitOf, type Card, type Rank, type Suit } from '../game/blackjack';

// Index des cartes à la française : Roi, Dame, Valet.
const FACE: Partial<Record<Rank, string>> = { J: 'V', Q: 'D', K: 'R' };
const RANK_NAME: Record<Rank, string> = {
  A: 'As',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'Valet',
  Q: 'Dame',
  K: 'Roi',
};
const SUIT_NAME: Record<Suit, string> = { '♠': 'pique', '♥': 'cœur', '♦': 'carreau', '♣': 'trèfle' };

export function cardName(c: Card): string {
  return RANK_NAME[rankOf(c)] + ' de ' + SUIT_NAME[suitOf(c)];
}

export function PlayingCard({ card, fresh }: { card: Card; fresh?: boolean }) {
  const r = rankOf(card);
  const label = FACE[r] ?? r;
  return (
    <span class={'pc' + (isRed(card) ? ' red' : '') + (fresh ? ' pc-in' : '')} role="img" aria-label={cardName(card)}>
      <span class="pc-corner" aria-hidden="true">
        <b>{label}</b>
        <span>{suitOf(card)}</span>
      </span>
      <span class="pc-pip" aria-hidden="true">
        {suitOf(card)}
      </span>
    </span>
  );
}

export function CardBack({ label = 'Carte face cachée' }: { label?: string }) {
  return (
    <span class="pc pc-back" role="img" aria-label={label}>
      <span class="pc-back-core" aria-hidden="true">
        ♠
      </span>
    </span>
  );
}

/** Total lisible : « 7 / 17 » pour une main souple, « 22 » pour une main qui saute. */
export function totalLabel(cards: readonly Card[]): string {
  if (cards.length === 0) return '';
  const v = handValue(cards);
  if (v.soft && v.total < 21) return v.total - 10 + ' / ' + v.total;
  return String(v.total);
}
