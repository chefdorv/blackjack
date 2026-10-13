// Petites vibrations aux moments forts. Android : API Vibration. iPhone (Safari n'a pas
// cette API) : depuis iOS 18, basculer un interrupteur natif (`<input type=checkbox switch>`)
// donne un retour haptique ; on en bascule un, caché, pour chaque impulsion.
// Réglage propre à l'appareil (pas partagé avec la salle), activé par défaut.

export type Buzz = 'carte' | 'gagne' | 'blackjack' | 'manche';

/** Durées en ms : vibration, pause, vibration… */
const PATTERNS: Record<Buzz, number[]> = {
  carte: [12],
  gagne: [35, 70, 35],
  blackjack: [50, 50, 50, 50, 140],
  manche: [90, 90, 90],
};

const KEY = 'bj-vibrations-v1';
let enabled = read();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'non';
  } catch {
    return true;
  }
}

export function vibrationsOn(): boolean {
  return enabled;
}

export function setVibrations(on: boolean): void {
  enabled = on;
  try {
    window.localStorage.setItem(KEY, on ? 'oui' : 'non');
  } catch {
    // stockage indisponible : le choix vaut pour cette visite
  }
  if (on) buzz('carte');
}

let iosSwitch: HTMLLabelElement | null = null;

/** Interrupteur natif caché : chaque clic sur son libellé fait un « tic » sur iPhone. */
function iosTick(): void {
  if (!iosSwitch) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

export function buzz(kind: Buzz): void {
  if (!enabled || typeof navigator === 'undefined') return;
  // Avant tout toucher sur la page (juste après un rechargement), le navigateur refuse de vibrer.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  const pattern = PATTERNS[kind];
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
      return;
    }
    // Une impulsion par vibration du motif, aux mêmes instants.
    let at = 0;
    pattern.forEach((ms, i) => {
      if (i % 2 === 0) window.setTimeout(iosTick, at);
      at += ms;
    });
  } catch {
    // pas de vibration possible : rien à faire
  }
}
