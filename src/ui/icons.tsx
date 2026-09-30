import type { ComponentChildren } from 'preact';

function Svg({ children, width = 2 }: { children: ComponentChildren; width?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={width} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const IconUndo = () => (
  <Svg width={2.4}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);
export const IconUp = () => (
  <Svg width={2.4}>
    <path d="m6 15 6-6 6 6" />
  </Svg>
);
export const IconDown = () => (
  <Svg width={2.4}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
export const IconClose = () => (
  <Svg width={2.4}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
export const IconTrash = () => (
  <Svg width={2.2}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Svg>
);
export const IconTable = () => (
  <Svg>
    <ellipse cx="12" cy="12" rx="10" ry="6.5" />
    <ellipse cx="12" cy="12" rx="5.5" ry="3" />
  </Svg>
);
export const IconCards = () => (
  <Svg>
    <rect x="3" y="5" width="11" height="15" rx="2" />
    <path d="M17 4.5 21 6l-4.2 13" />
  </Svg>
);
export const IconTrophy = () => (
  <Svg>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
  </Svg>
);
export const IconBook = () => (
  <Svg>
    <path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4Z" />
    <path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6Z" />
  </Svg>
);
export const IconSliders = () => (
  <Svg>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Svg>
);
