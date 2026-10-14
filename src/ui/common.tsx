import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { tapHaptics } from '../haptics';

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

/** Attribut `switch` (Safari 17.4+) : l'interrupteur natif, qui vibre quand il bascule sur iPhone. */
const SWITCH_ATTR: Record<string, string> = { switch: '' };

/** Libellé transparent posé sur le bouton : c'est lui que le doigt touche. */
const ZONE_STYLE = 'position:absolute;inset:0;z-index:1;margin:0;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent';
/** L'interrupteur reste caché et jamais sous le doigt (sinon le défilement de la page se bloque). */
const SWITCH_STYLE = 'position:absolute;width:1px;height:1px;margin:0;visibility:hidden';

/**
 * Enveloppe un bouton : sur iPhone, un libellé transparent le recouvre. Le toucher, vrai geste de
 * l'utilisateur, fait basculer l'interrupteur caché du libellé (seul chemin qui vibre encore sur
 * iOS 26.5 et 27, d'après ios-haptics), puis l'action du bouton est déclenchée. Ailleurs, rien ne
 * change (clavier et lecteurs d'écran passent par le vrai bouton).
 */
export function Haptic({ children }: { children: ComponentChildren }) {
  const ref = useRef<HTMLSpanElement>(null);
  if (!tapHaptics()) return <>{children}</>;
  return (
    <span ref={ref} class="hap">
      {children}
      <label
        class="hap-zone"
        aria-hidden="true"
        style={ZONE_STYLE}
        onClick={() => {
          const b = ref.current?.querySelector('button');
          if (b && !b.disabled) b.click();
        }}
      >
        {/* Le libellé renvoie son clic à l'interrupteur : cette copie ne doit pas rejouer l'action. */}
        <input type="checkbox" tabIndex={-1} style={SWITCH_STYLE} {...SWITCH_ATTR} onClick={(e) => e.stopPropagation()} />
      </label>
    </span>
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
  haptic = false,
  clearOnFocus = false,
  bigStep,
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
  /** Vibration au toucher des boutons (iPhone, voir `Haptic`). */
  haptic?: boolean;
  /** Vide le champ quand on le touche : on tape la nouvelle valeur sans effacer l'ancienne (remise si rien n'est tapé). */
  clearOnFocus?: boolean;
  /** Deuxième paire de boutons (ex. −5 / +5) autour de −1 / +1 ; les réglages passent alors sous le libellé. */
  bigStep?: number;
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
  const dec = step === 1 && !bigStep ? '−' : '−' + step;
  const inc = step === 1 && !bigStep ? '+' : '+' + step;
  const tap = (b: ComponentChildren) => (haptic ? <Haptic>{b}</Haptic> : b);
  const big = (sign: 1 | -1) =>
    bigStep ? tap(
      <button type="button" class={'qbtn big-step ' + (sign > 0 ? 'inc' : 'dec')} onClick={() => onChange(clamp((value ?? 0) + sign * bigStep))} aria-label={(sign > 0 ? 'Ajouter ' : 'Retirer ') + bigStep + ' : ' + label}>
        {(sign > 0 ? '+' : '−') + bigStep}
      </button>,
    ) : null;
  return (
    <div class={'set-row' + (bigStep ? ' stacked' : '')}>
      <div class="grow">
        <label class={hideLabel ? 'sr' : 'set-label'} for={id}>
          {label}
        </label>
        {sub}
      </div>
      <div class="step">
        {big(-1)}
        {tap(<button type="button" class="qbtn dec" onClick={() => onChange(clamp((value ?? 0) - step))} aria-label={decLabel ?? 'Diminuer ' + label}>
          {dec}
        </button>)}
        <input
          id={id}
          class="txt num"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value === null ? '' : value}
          placeholder={clearOnFocus && value !== null ? String(value) : placeholder}
          onFocus={
            clearOnFocus
              ? (e) => {
                  e.currentTarget.value = '';
                }
              : undefined
          }
          onBlur={
            clearOnFocus
              ? (e) => {
                  if (e.currentTarget.value.trim() === '') e.currentTarget.value = String(value ?? min);
                }
              : undefined
          }
          onInput={(e) => commit(e, true)}
          onChange={(e) => commit(e, false)}
        />
        {tap(<button type="button" class="qbtn inc" onClick={() => onChange(clamp((value ?? 0) + step))} aria-label={incLabel ?? 'Augmenter ' + label}>
          {inc}
        </button>)}
        {big(1)}
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
