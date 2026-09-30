import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** Fenêtre modale ou panneau montant : focus à l'ouverture, Échap pour fermer, focus rendu à la fermeture. */
export function Dialog({
  label,
  onClose,
  variant,
  children,
}: {
  label: string;
  onClose: () => void;
  variant: 'modal' | 'sheet';
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = ref.current?.querySelector<HTMLElement>('button:not([disabled]), input, select');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);
  return (
    <>
      <button type="button" class="overlay" onClick={onClose} aria-label="Fermer" tabIndex={-1} />
      <div ref={ref} class={variant} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </>
  );
}

/** Champ numérique avec boutons − / +, et vrai <label>. */
export function Stepper({
  id,
  label,
  value,
  step = 1,
  min = 0,
  max = 9999,
  onChange,
  decLabel,
  incLabel,
  placeholder,
  allowEmpty = false,
  hideLabel = false,
  sub,
}: {
  id: string;
  label: string;
  value: number | null;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number | null) => void;
  decLabel?: string;
  incLabel?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  hideLabel?: boolean;
  sub?: ComponentChildren;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  const commit = (e: { currentTarget: HTMLInputElement }, live: boolean) => {
    const el = e.currentTarget;
    const raw = el.value.trim();
    if (raw === '') {
      if (allowEmpty) onChange(null);
      else if (!live) el.value = String(value ?? min);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const v = clamp(n);
    // En saisie libre on n'écrase pas ce qui est tapé ; on corrige à la validation.
    if (live) {
      if (v === n) onChange(v);
      return;
    }
    onChange(v);
    el.value = String(v);
  };
  const dec = step === 1 ? '−' : '−' + step;
  const inc = step === 1 ? '+' : '+' + step;
  return (
    <div class="set-row">
      <div class="grow">
        <label class={hideLabel ? 'sr' : 'set-label'} for={id}>
          {label}
        </label>
        {sub}
      </div>
      <div class="step">
        <button type="button" class="qbtn" onClick={() => onChange(clamp((value ?? 0) - step))} aria-label={decLabel ?? 'Diminuer ' + label}>
          {dec}
        </button>
        <input
          id={id}
          class="txt num"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value === null ? '' : value}
          placeholder={placeholder}
          onInput={(e) => commit(e, true)}
          onChange={(e) => commit(e, false)}
        />
        <button type="button" class="qbtn" onClick={() => onChange(clamp((value ?? 0) + step))} aria-label={incLabel ?? 'Augmenter ' + label}>
          {inc}
        </button>
      </div>
    </div>
  );
}

export interface ConfirmRequest {
  text: string;
  yes: string;
  onYes: () => void;
}

export function ConfirmDialog({ req, onClose }: { req: ConfirmRequest; onClose: () => void }) {
  return (
    <Dialog label="Confirmation" onClose={onClose} variant="modal">
      <h2 class="h3">{req.text}</h2>
      <div class="grid2">
        <button type="button" class="btn" onClick={onClose}>
          Non
        </button>
        <button
          type="button"
          class="btn red"
          onClick={() => {
            onClose();
            req.onYes();
          }}
        >
          {req.yes}
        </button>
      </div>
    </Dialog>
  );
}
