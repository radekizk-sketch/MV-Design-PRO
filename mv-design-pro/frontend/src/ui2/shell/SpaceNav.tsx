/*
 * Nawigacja lewego panelu: 7 przestrzeni roboczych. Renderuje wariant pełny
 * (podpisy + skróty) albo listwę ikon 48 px (podpisy w dymkach) w zależności od
 * zwinięcia — nawigacja pozostaje zawsze osiągalna (SPEC_UKLAD_PANELI §1.1).
 */

import { SPACES, SPACES_HEADING, type SpaceId } from './spaces';

interface SpaceNavProps {
  activeSpace: SpaceId;
  collapsed: boolean;
  onSelect: (space: SpaceId) => void;
}

function SpaceIcon({ id }: { id: SpaceId }) {
  const common = { className: 'mvd-icon', viewBox: '0 0 20 20', 'aria-hidden': true } as const;
  switch (id) {
    case 'projekt':
      return (
        <svg {...common}>
          <path d="M3 9.5 10 3l7 6.5M5 8v8h10V8" />
        </svg>
      );
    case 'model':
      return (
        <svg {...common}>
          <circle cx="5" cy="5" r="2" />
          <circle cx="15" cy="5" r="2" />
          <circle cx="10" cy="15" r="2" />
          <path d="M6.4 6.4 8.8 13M13.6 6.4 11.2 13M7 5h6" />
        </svg>
      );
    case 'schemat':
      return (
        <svg {...common}>
          <path d="M3 5h14M10 5v5m-5 5v-3m5 3v-3m5 3v-3M5 12h10" />
        </svg>
      );
    case 'gotowosc':
      return (
        <svg {...common}>
          <path d="M10 3 3 6v5c0 4 3.5 5.5 7 6 3.5-.5 7-2 7-6V6z" />
          <path d="m7 10 2 2 4-4" />
        </svg>
      );
    case 'obliczenia':
      return (
        <svg {...common}>
          <path d="M6 3v14M6 17l-2.5-3M6 17l2.5-3M14 17V3M14 3l-2.5 3M14 3l2.5 3" />
        </svg>
      );
    case 'wyniki':
      return (
        <svg {...common}>
          <path d="M3 17V8m4.5 9V4M12 17v-7m4.5 7V6" />
        </svg>
      );
    case 'dokumentacja':
      return (
        <svg {...common}>
          <path d="M6 3h6l3 3v11H6zM12 3v3h3" />
          <path d="M8 10h5M8 13h5" />
        </svg>
      );
  }
}

export function SpaceNav({ activeSpace, collapsed, onSelect }: SpaceNavProps) {
  if (collapsed) {
    return (
      <nav className="mvd-rail" aria-label={SPACES_HEADING}>
        {SPACES.map((space) => (
          <button
            key={space.id}
            type="button"
            className={space.id === activeSpace ? 'mvd-rail-btn mvd-on' : 'mvd-rail-btn'}
            aria-label={space.label}
            aria-current={space.id === activeSpace ? 'page' : undefined}
            title={`${space.label} (${space.shortcut})`}
            onClick={() => onSelect(space.id)}
          >
            <SpaceIcon id={space.id} />
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav className="mvd-nav" aria-label={SPACES_HEADING}>
      <span className="mvd-lbl mvd-nav-heading">{SPACES_HEADING}</span>
      {SPACES.map((space) => (
        <button
          key={space.id}
          type="button"
          className={space.id === activeSpace ? 'mvd-nav-btn mvd-on' : 'mvd-nav-btn'}
          aria-current={space.id === activeSpace ? 'page' : undefined}
          onClick={() => onSelect(space.id)}
        >
          <SpaceIcon id={space.id} />
          <span>{space.label}</span>
          <span className="mvd-nav-key">{space.shortcut}</span>
        </button>
      ))}
    </nav>
  );
}
