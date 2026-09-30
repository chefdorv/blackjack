/** Nombre signé, avec un vrai signe moins typographique. */
export function signed(n: number): string {
  if (n > 0) return '+' + n;
  if (n < 0) return '−' + Math.abs(n);
  return '0';
}

export function plural(n: number, singular: string, pluralForm: string = singular + 's'): string {
  return n + ' ' + (Math.abs(n) > 1 ? pluralForm : singular);
}

export function frDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date inconnue';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
