/**
 * CanonicalSymbolRenderer â€” Komponenty SVG dla symboli CANONICAL
 *
 * CANONICAL ALIGNMENT:
 * - canonical_symbols/*.svg: ĹąrĂłdĹ‚o prawdy dla ksztaĹ‚tĂłw symboli
 * - ports.json: Definicje portĂłw
 * - SymbolResolver.ts: Mapowanie element â†’ symbol
 *
 * CANONICAL PARITY:
 * - Wszystkie symbole majÄ… viewBox 0 0 100 100
 * - Stroke: currentColor (dziedziczy z CSS), stroke-width: 3 (main), 2 (details)
 * - Kolory mogÄ… byÄ‡ nadpisywane przez props (stroke, fill)
 */

import React from 'react';
import type { CanonicalSymbolId } from './SymbolResolver';

/**
 * Switch state for CB/DS elements.
 * CANONICAL-like visual representation:
 * - OPEN: gap/break in circuit (rozwarcie)
 * - CLOSED: continuous symbol (poĹ‚Ä…czenie)
 * - UNKNOWN: indeterminate state (stan nieznany)
 */
export type SwitchState = 'OPEN' | 'CLOSED' | 'UNKNOWN';

/**
 * Props dla renderera symbolu CANONICAL.
 */
export interface CanonicalSymbolProps {
  /** ID symbolu CANONICAL */
  symbolId: CanonicalSymbolId;
  /** Kolor obrysu (domyĹ›lnie currentColor - dziedziczy z CSS) */
  stroke?: string;
  /** Kolor wypeĹ‚nienia (domyĹ›lnie none) */
  fill?: string;
  /** GruboĹ›Ä‡ obrysu (domyĹ›lnie 3) */
  strokeWidth?: number;
  /** PrzezroczystoĹ›Ä‡ (0-1) */
  opacity?: number;
  /** WzĂłr kreski (dla linii) */
  strokeDasharray?: string;
  /** Skala symbolu (w pikselach, domyĹ›lnie 40) */
  size?: number;
  /** Stan Ĺ‚Ä…czeniowy dla CB/DS (CANONICAL-like) */
  switchState?: SwitchState;
}

/**
 * Busbar / Szyna zbiorcza
 * ALWAYS HORIZONTAL thick bar â€” ABB standard.
 * ABB busbar: bold stroke, round caps, dominant visual weight.
 */
const BusbarSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Shadow for depth â€” ABB convention */}
    <line
      x1="4"
      y1="52"
      x2="96"
      y2="52"
      stroke="rgba(0,0,0,0.08)"
      strokeWidth={strokeWidth + 4}
      strokeLinecap="round"
    />
    {/* Main busbar â€” HORIZONTAL, bold, ABB-grade */}
    <line
      x1="2"
      y1="50"
      x2="98"
      y2="50"
      stroke={stroke}
      strokeWidth={strokeWidth + 2}
      strokeLinecap="round"
      opacity={opacity}
    />
    {/* End caps â€” ABB filled dots */}
    <circle cx="4" cy="50" r={2.5} fill={stroke} stroke="none" opacity={opacity} />
    <circle cx="96" cy="50" r={2.5} fill={stroke} stroke="none" opacity={opacity} />
  </>
);

/**
 * Circuit Breaker / WyĹ‚Ä…cznik
 * CANONICAL/ABB-grade visual representation with trip indicator:
 * - CLOSED: Square with X pattern, continuous connections, trip coil mark
 * - OPEN: Square with X pattern, gap in bottom connection showing break
 * - UNKNOWN: Dashed outline indicating indeterminate state
 */
const CircuitBreakerSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
  switchState = 'CLOSED',
}) => {
  const isOpen = switchState === 'OPEN';
  const isUnknown = switchState === 'UNKNOWN';

  // UNKNOWN state: dashed outline
  const rectDasharray = isUnknown ? '4,2' : undefined;

  return (
    <>
      {/* CB body */}
      <rect
        x="30"
        y="30"
        width="40"
        height="40"
        fill={fill === 'none' ? 'rgba(255,255,255,0.95)' : fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={rectDasharray}
        opacity={opacity}
        data-testid="sld-switch-state-cb-rect"
      />
      {/* Cross pattern (IEC standard CB symbol) */}
      <line x1="30" y1="30" x2="70" y2="70" stroke={stroke} strokeWidth={2} opacity={opacity} />
      <line x1="70" y1="30" x2="30" y2="70" stroke={stroke} strokeWidth={2} opacity={opacity} />
      {/* Top connection - always connected */}
      <line x1="50" y1="0" x2="50" y2="30" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
      {/* Bottom connection - OPEN shows gap, CLOSED shows continuous */}
      {isOpen ? (
        <>
          {/* Gap indicator - disconnected at y=75 */}
          <line x1="50" y1="70" x2="50" y2="75" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
          {/* Bottom stub with gap */}
          <line x1="50" y1="85" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
          {/* Open indicator marks */}
          <line x1="45" y1="77" x2="55" y2="83" stroke={stroke} strokeWidth={2} opacity={opacity} />
        </>
      ) : (
        <line x1="50" y1="70" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
      )}
      {/* Trip coil indicator (small horizontal mark â€” CANONICAL convention) */}
      <line x1="72" y1="48" x2="78" y2="48" stroke={stroke} strokeWidth={1.5} opacity={opacity * 0.6} />
      <line x1="72" y1="52" x2="78" y2="52" stroke={stroke} strokeWidth={1.5} opacity={opacity * 0.6} />
    </>
  );
};

/**
 * Disconnector / RozĹ‚Ä…cznik
 * CANONICAL/ABB-grade: blade switch with detailed contact points.
 * - OPEN: Blade angled away (Ĺ‚opatka otwarta)
 * - CLOSED: Blade vertical connecting contacts (Ĺ‚opatka zamkniÄ™ta)
 * - UNKNOWN: Dashed blade indicating indeterminate state
 */
const DisconnectorSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  strokeWidth = 3,
  opacity = 1,
  switchState = 'CLOSED',
}) => {
  const isOpen = switchState === 'OPEN';
  const isUnknown = switchState === 'UNKNOWN';

  // UNKNOWN state: dashed blade
  const bladeDasharray = isUnknown ? '4,2' : undefined;

  return (
    <>
      {/* Top connection */}
      <line x1="50" y1="0" x2="50" y2="35" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
      {/* Bottom connection */}
      <line x1="50" y1="65" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
      {/* Blade - OPEN: angled, CLOSED: vertical */}
      {isOpen ? (
        <line
          x1="50"
          y1="35"
          x2="70"
          y2="50"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={bladeDasharray}
          opacity={opacity}
          data-testid="sld-switch-state-ds-blade-open"
        />
      ) : (
        <line
          x1="50"
          y1="35"
          x2="50"
          y2="65"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={bladeDasharray}
          opacity={opacity}
          data-testid="sld-switch-state-ds-blade-closed"
        />
      )}
      {/* Fixed contact points â€” prominent filled dots (CANONICAL convention) */}
      <circle cx="50" cy="35" r="4" fill={stroke} stroke="none" opacity={opacity} />
      <circle cx="50" cy="65" r="4" fill={stroke} stroke="none" opacity={opacity} />
      {/* Contact seat marks (horizontal short bars â€” industrial detail) */}
      <line x1="44" y1="35" x2="56" y2="35" stroke={stroke} strokeWidth={1.5} opacity={opacity * 0.5} />
      <line x1="44" y1="65" x2="56" y2="65" stroke={stroke} strokeWidth={1.5} opacity={opacity * 0.5} />
    </>
  );
};

/**
 * Overhead Line / Linia napowietrzna
 * Solid continuous line.
 */
const LineOverheadSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    <line x1="0" y1="50" x2="100" y2="50" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Cable Line / Linia kablowa
 * Dashed line pattern.
 */
const LineCableSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    <line
      x1="0"
      y1="50"
      x2="100"
      y2="50"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray="8,4"
      opacity={opacity}
    />
  </>
);

/**
 * Two-Winding Transformer / Transformator 2-uzwojeniowy
 * CANONICAL/ABB-grade: Two overlapping circles with winding sense dots.
 * Enhanced with winding polarity indicators and industrial detail.
 */
const Transformer2wSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Connection stubs */}
    <line x1="50" y1="0" x2="50" y2="15" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="50" y1="85" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Primary winding (WN) */}
    <circle cx="50" cy="35" r="20" fill={fill === 'none' ? 'rgba(255,255,255,0.95)' : fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Secondary winding (SN/nN) */}
    <circle cx="50" cy="65" r="20" fill={fill === 'none' ? 'rgba(255,255,255,0.95)' : fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Winding polarity dots (IEC 60617) */}
    <circle cx="42" cy="25" r="2.5" fill={stroke} stroke="none" opacity={opacity * 0.8} />
    <circle cx="42" cy="55" r="2.5" fill={stroke} stroke="none" opacity={opacity * 0.8} />
  </>
);

/**
 * Three-Winding Transformer / Transformator 3-uzwojeniowy
 * Three overlapping circles.
 */
const Transformer3wSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    <circle cx="50" cy="30" r="18" fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <circle cx="32" cy="62" r="18" fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <circle cx="68" cy="62" r="18" fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Connection stubs */}
    <line x1="50" y1="0" x2="50" y2="12" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="14" y1="62" x2="0" y2="62" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="86" y1="62" x2="100" y2="62" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Generator / Generator synchroniczny
 * CANONICAL/ABB-grade: Circle with G + sine wave accent.
 */
const GeneratorSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Main body */}
    <circle cx="50" cy="40" r="30" fill={fill === 'none' ? 'rgba(255,255,255,0.95)' : fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* G label */}
    <text x="50" y="44" textAnchor="middle" fontSize="22" fontWeight="bold" fill={stroke} opacity={opacity}>
      G
    </text>
    {/* Sine wave accent below G (AC generator indicator) */}
    <path
      d="M 38 55 Q 44 49 50 55 Q 56 61 62 55"
      fill="none"
      stroke={stroke}
      strokeWidth={1.5}
      opacity={opacity * 0.5}
    />
    {/* Connection stub */}
    <line x1="50" y1="70" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Photovoltaic / Fotowoltaika
 * Solar panel symbol with sun rays.
 */
const PvSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Panel rectangle */}
    <rect x="20" y="20" width="60" height="40" fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Grid lines inside panel */}
    <line x1="20" y1="40" x2="80" y2="40" stroke={stroke} strokeWidth={1.5} opacity={opacity} />
    <line x1="40" y1="20" x2="40" y2="60" stroke={stroke} strokeWidth={1.5} opacity={opacity} />
    <line x1="60" y1="20" x2="60" y2="60" stroke={stroke} strokeWidth={1.5} opacity={opacity} />
    {/* Sun rays (arrow pointing to panel) */}
    <line x1="10" y1="10" x2="25" y2="25" stroke={stroke} strokeWidth={2} opacity={opacity} />
    <path d="M 10 10 L 10 18 M 10 10 L 18 10" stroke={stroke} strokeWidth={2} fill="none" opacity={opacity} />
    {/* Connection stub */}
    <line x1="50" y1="60" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Wind Farm / Farma wiatrowa
 * Wind turbine symbol.
 */
const FwSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Turbine hub (circle) */}
    <circle cx="50" cy="30" r="8" fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Three blades */}
    <line x1="50" y1="30" x2="50" y2="5" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="50" y1="30" x2="28" y2="45" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="50" y1="30" x2="72" y2="45" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Tower */}
    <line x1="50" y1="38" x2="50" y2="70" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Base */}
    <line x1="35" y1="70" x2="65" y2="70" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Connection stub */}
    <line x1="50" y1="70" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Battery Energy Storage System / Magazyn energii
 * Battery symbol.
 */
const BessSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Battery outline */}
    <rect x="25" y="25" width="50" height="45" fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Battery cap */}
    <rect x="40" y="18" width="20" height="7" fill={fill} stroke={stroke} strokeWidth={2} opacity={opacity} />
    {/* Plus/minus indicators */}
    <text x="50" y="42" textAnchor="middle" fontSize="16" fontWeight="bold" fill={stroke} opacity={opacity}>
      +
    </text>
    <text x="50" y="62" textAnchor="middle" fontSize="20" fontWeight="bold" fill={stroke} opacity={opacity}>
      â’
    </text>
    {/* Connection stub */}
    <line x1="50" y1="70" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * System Source / ĹąrĂłdĹ‚o systemowe GPZ
 * IEC-style external grid source for the primary GPZ infeed.
 */
const SystemSourceSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    <circle
      cx="50"
      cy="22"
      r="16"
      fill={fill === 'none' ? 'rgba(255,255,255,0.95)' : fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
    />
    <path
      d="M 38 22 Q 44 16 50 22 Q 56 28 62 22"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth * 0.65}
      opacity={opacity}
      strokeLinecap="round"
    />
    <line
      x1="16"
      y1="22"
      x2="34"
      y2="22"
      stroke={stroke}
      strokeWidth={strokeWidth * 0.9}
      opacity={opacity}
      strokeLinecap="round"
    />
    <line
      x1="66"
      y1="22"
      x2="84"
      y2="22"
      stroke={stroke}
      strokeWidth={strokeWidth * 0.9}
      opacity={opacity}
      strokeLinecap="round"
    />
    <line
      x1="50"
      y1="38"
      x2="50"
      y2="48"
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
      strokeLinecap="round"
    />
    <rect
      x="42"
      y="48"
      width="16"
      height="18"
      rx="2"
      ry="2"
      fill={fill === 'none' ? 'rgba(255,255,255,0.9)' : fill}
      stroke={stroke}
      strokeWidth={strokeWidth * 0.85}
      opacity={opacity}
    />
    <line
      x1="50"
      y1="66"
      x2="50"
      y2="100"
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
      strokeLinecap="round"
    />
  </>
);

/**
 * Utility Feeder / Zasilanie z sieci
 * IEC-style grid source symbol feeding the GPZ busbar below.
 */
const UtilityFeederSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* IEC-style external grid source */}
    <circle
      cx="50"
      cy="24"
      r="14"
      fill={fill === 'none' ? 'rgba(255,255,255,0.95)' : fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
    />
    {/* AC network mark */}
    <path
      d="M 40 24 Q 45 19 50 24 Q 55 29 60 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth * 0.6}
      opacity={opacity}
      strokeLinecap="round"
    />
    <line
      x1="36"
      y1="24"
      x2="18"
      y2="24"
      stroke={stroke}
      strokeWidth={strokeWidth * 0.85}
      opacity={opacity}
      strokeLinecap="round"
    />
    {/* Feeder field / gĹ‚owica liniowa pod ĹşrĂłdĹ‚em systemowym */}
    <line
      x1="50"
      y1="38"
      x2="50"
      y2="48"
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
      strokeLinecap="round"
    />
    <rect
      x="42"
      y="48"
      width="16"
      height="18"
      rx="2"
      ry="2"
      fill={fill === 'none' ? 'rgba(255,255,255,0.95)' : fill}
      stroke={stroke}
      strokeWidth={strokeWidth * 0.85}
      opacity={opacity}
    />
    <line
      x1="50"
      y1="50"
      x2="50"
      y2="64"
      stroke={stroke}
      strokeWidth={strokeWidth * 0.85}
      opacity={opacity}
      strokeLinecap="round"
    />
    <line
      x1="50"
      y1="66"
      x2="50"
      y2="100"
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
      strokeLinecap="round"
    />
  </>
);

/**
 * Branch pole / Slup rozgalezny
 * Inline branch object on the trunk, owned by the shared symbol library.
 */
const BranchPoleSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    <line x1="0" y1="50" x2="18" y2="50" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <polygon
      points="50,12 82,50 50,88 18,50"
      fill={fill === 'none' ? 'rgba(255,255,255,0.95)' : fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      opacity={opacity}
    />
    <line x1="82" y1="50" x2="100" y2="50" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * ZKSN / Zlacze kablowe SN
 * Inline cable joint box on the trunk, owned by the shared symbol library.
 */
const ZksnSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    <line x1="0" y1="50" x2="22" y2="50" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <rect
      x="22"
      y="30"
      width="56"
      height="40"
      rx="6"
      ry="6"
      fill={fill === 'none' ? 'rgba(248,250,252,0.96)' : fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
    />
    <text x="50" y="56" textAnchor="middle" fontSize="24" fontWeight="700" fill={stroke} opacity={opacity}>
      Z
    </text>
    <line x1="78" y1="50" x2="100" y2="50" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Cable Head / Glowica kablowa
 * Canonical triangular cable termination, never mapped to ground.
 */
const CableHeadSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    <line x1="50" y1="0" x2="50" y2="28" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <polygon
      points="50,28 28,68 72,68"
      fill={fill === 'none' ? 'rgba(255,255,255,0.95)' : fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      opacity={opacity}
    />
    <line x1="50" y1="68" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Ground / Uziemienie
 * Standard ground symbol.
 */
const GroundSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Vertical line from top */}
    <line x1="50" y1="0" x2="50" y2="40" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Three horizontal lines (ground symbol) */}
    <line x1="25" y1="40" x2="75" y2="40" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="32" y1="55" x2="68" y2="55" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="40" y1="70" x2="60" y2="70" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Current Transformer / PrzekĹ‚adnik prÄ…dowy
 * CANONICAL/ABB-grade CT: inline donut with secondary winding indication.
 * PR-SLD-UX-MAX: Compact inline design, detail hierarchy level.
 */
const CtSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Through-line (the feeder passes through) */}
    <line x1="0" y1="50" x2="35" y2="50" stroke={stroke} strokeWidth={strokeWidth * 0.8} opacity={opacity} />
    <line x1="65" y1="50" x2="100" y2="50" stroke={stroke} strokeWidth={strokeWidth * 0.8} opacity={opacity} />
    {/* CT donut â€” compact inline */}
    <circle cx="50" cy="50" r="15" fill={fill === 'none' ? 'rgba(255,255,255,0.95)' : fill} stroke={stroke} strokeWidth={strokeWidth * 0.7} opacity={opacity} />
    {/* Inner winding indicator */}
    <circle cx="50" cy="50" r="8" fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.5} opacity={opacity * 0.8} />
    {/* Secondary output taps (measurement leads) */}
    <line x1="50" y1="65" x2="50" y2="75" stroke={stroke} strokeWidth={strokeWidth * 0.4} opacity={opacity * 0.6} />
    <line x1="46" y1="75" x2="54" y2="75" stroke={stroke} strokeWidth={strokeWidth * 0.4} opacity={opacity * 0.6} />
    {/* Secondary measurement mark */}
    <circle cx="50" cy="88" r="2.5" fill={stroke} opacity={opacity * 0.75} />
  </>
);

/**
 * Voltage Transformer / PrzekĹ‚adnik napiÄ™ciowy
 * VT symbol â€” inline tap style for measurement points.
 * PR-SLD-UX-MAX: Compact inline design, detail hierarchy level.
 */
const VtSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Through-line */}
    <line x1="0" y1="50" x2="35" y2="50" stroke={stroke} strokeWidth={strokeWidth * 0.8} opacity={opacity} />
    <line x1="65" y1="50" x2="100" y2="50" stroke={stroke} strokeWidth={strokeWidth * 0.8} opacity={opacity} />
    {/* VT symbol â€” two concentric circles with tap */}
    <circle cx="50" cy="50" r="12" fill={fill === 'none' ? '#FFFFFF' : fill} stroke={stroke} strokeWidth={strokeWidth * 0.6} opacity={opacity} />
    {/* Tap line (measurement point) */}
    <line x1="50" y1="62" x2="50" y2="80" stroke={stroke} strokeWidth={strokeWidth * 0.5} opacity={opacity * 0.8} />
    <line x1="42" y1="80" x2="58" y2="80" stroke={stroke} strokeWidth={strokeWidth * 0.5} opacity={opacity * 0.8} />
    {/* Secondary voltage mark */}
    <line x1="46" y1="92" x2="54" y2="92" stroke={stroke} strokeWidth={strokeWidth * 0.45} opacity={opacity * 0.75} />
    <line x1="50" y1="88" x2="50" y2="96" stroke={stroke} strokeWidth={strokeWidth * 0.45} opacity={opacity * 0.75} />
  </>
);

// ============================================================================
// Tree-specific symbols (P9 Project Tree CANONICAL parity)
// ============================================================================

/**
 * Load / Odbiornik
 * Triangle pointing down (standard load symbol).
 */
const LoadSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Connection stub from top */}
    <line x1="50" y1="0" x2="50" y2="25" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Triangle pointing down */}
    <polygon
      points="50,25 25,70 75,70"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      opacity={opacity}
    />
    {/* Horizontal line at bottom */}
    <line x1="25" y1="85" x2="75" y2="85" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Project / Projekt
 * Grid/network symbol representing the project root.
 */
const ProjectSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Outer frame */}
    <rect x="10" y="15" width="80" height="70" fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Top bar (title area) */}
    <line x1="10" y1="30" x2="90" y2="30" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Grid inside */}
    <line x1="35" y1="30" x2="35" y2="85" stroke={stroke} strokeWidth={2} opacity={opacity} />
    <line x1="65" y1="30" x2="65" y2="85" stroke={stroke} strokeWidth={2} opacity={opacity} />
    <line x1="10" y1="55" x2="90" y2="55" stroke={stroke} strokeWidth={2} opacity={opacity} />
  </>
);

/**
 * Catalog / Katalog typĂłw
 * Book/library symbol.
 */
const CatalogSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Book outline */}
    <rect x="20" y="15" width="60" height="70" fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Spine */}
    <line x1="30" y1="15" x2="30" y2="85" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Page lines */}
    <line x1="40" y1="30" x2="70" y2="30" stroke={stroke} strokeWidth={2} opacity={opacity} />
    <line x1="40" y1="45" x2="70" y2="45" stroke={stroke} strokeWidth={2} opacity={opacity} />
    <line x1="40" y1="60" x2="70" y2="60" stroke={stroke} strokeWidth={2} opacity={opacity} />
  </>
);

/**
 * Study Case / wariant pracy
 * Calculator/document with sigma symbol.
 */
const StudyCaseSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Document outline */}
    <rect x="20" y="10" width="60" height="80" fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Sigma symbol (ÎŁ) for calculations */}
    <text x="50" y="60" textAnchor="middle" fontSize="36" fontWeight="bold" fill={stroke} opacity={opacity}>
      ÎŁ
    </text>
  </>
);

/**
 * Results / Wyniki
 * Bar chart symbol representing calculation results.
 */
const ResultsSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Chart frame */}
    <line x1="15" y1="15" x2="15" y2="85" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="15" y1="85" x2="85" y2="85" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Bar 1 */}
    <rect x="25" y="50" width="12" height="30" fill={fill} stroke={stroke} strokeWidth={2} opacity={opacity} />
    {/* Bar 2 (taller) */}
    <rect x="45" y="30" width="12" height="50" fill={fill} stroke={stroke} strokeWidth={2} opacity={opacity} />
    {/* Bar 3 */}
    <rect x="65" y="45" width="12" height="35" fill={fill} stroke={stroke} strokeWidth={2} opacity={opacity} />
  </>
);

/**
 * Folder / Folder container
 * Simple folder icon for generic containers.
 */
const FolderSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Folder tab */}
    <path
      d="M 10 25 L 10 20 L 35 20 L 45 30 L 90 30 L 90 25"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      opacity={opacity}
    />
    {/* Folder body */}
    <rect x="10" y="30" width="80" height="55" fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Overcurrent Relay / Zabezpieczenie nadpradowe
 * IEC 60617 symbol: rectangle with ANSI code, inline on feeder.
 */
const OvercurrentRelaySymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    <line x1="10" y1="50" x2="35" y2="50" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <rect x="35" y="35" width="30" height="30" fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={2} opacity={opacity} />
    <text x="50" y="55" textAnchor="middle" fontSize="12" fill={stroke} opacity={opacity}>
      51
    </text>
    <line x1="65" y1="50" x2="90" y2="50" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Directional Relay / Zabezpieczenie kierunkowe
 * IEC 60617 symbol: rectangle with ANSI code 67, inline.
 */
const DirectionalRelaySymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    <line x1="10" y1="50" x2="35" y2="50" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <rect x="35" y="35" width="30" height="30" fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={2} opacity={opacity} />
    <text x="50" y="55" textAnchor="middle" fontSize="12" fill={stroke} opacity={opacity}>
      67
    </text>
    <line x1="65" y1="50" x2="90" y2="50" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Direction arrow */}
    <polygon points="72,46 78,50 72,54" fill={stroke} opacity={opacity} />
  </>
);

/**
 * Earthing Switch / Uziemnik
 * IEC 60617 symbol: X with ground symbol below.
 */
const EarthingSwitchSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    <line x1="10" y1="50" x2="40" y2="50" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="40" y1="35" x2="60" y2="65" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="40" y1="65" x2="60" y2="35" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="60" y1="50" x2="90" y2="50" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Ground symbol */}
    <line x1="50" y1="65" x2="50" y2="75" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="42" y1="75" x2="58" y2="75" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="44" y1="80" x2="56" y2="80" stroke={stroke} strokeWidth={1.5} opacity={opacity} />
    <line x1="47" y1="85" x2="53" y2="85" stroke={stroke} strokeWidth={1} opacity={opacity} />
  </>
);

/**
 * Load Arrow / Strzalka odbioru
 * Downward-pointing filled triangle for load termination.
 */
const LoadArrowSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    <line x1="50" y1="10" x2="50" y2="45" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <polygon
      points="35,45 65,45 50,75"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      opacity={opacity}
    />
  </>
);

/**
 * Fuse / Bezpiecznik
 * IEC 60617 symbol: rectangle with strikethrough line.
 */
const FuseSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Top connection */}
    <line x1="50" y1="0" x2="50" y2="30" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Fuse body â€” narrow rectangle per IEC 60617 */}
    <rect x="38" y="30" width="24" height="40" fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={1} opacity={opacity} />
    {/* Fuse element â€” center line */}
    <line x1="50" y1="30" x2="50" y2="70" stroke={stroke} strokeWidth={strokeWidth * 0.6} opacity={opacity} />
    {/* Bottom connection */}
    <line x1="50" y1="70" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Surge Arrester / Ogranicznik przepiÄ™Ä‡
 * IEC 60617 symbol: ground + gap + zigzag varistor element.
 */
const SurgeArresterSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Top connection */}
    <line x1="50" y1="0" x2="50" y2="25" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Gap plate top */}
    <line x1="35" y1="25" x2="65" y2="25" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Gap */}
    <line x1="35" y1="35" x2="65" y2="35" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Varistor body â€” zigzag */}
    <polyline
      points="50,35 40,45 60,55 50,65"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      opacity={opacity}
    />
    {/* Bottom connection */}
    <line x1="50" y1="65" x2="50" y2="78" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Ground */}
    <line x1="35" y1="78" x2="65" y2="78" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    <line x1="40" y1="85" x2="60" y2="85" stroke={stroke} strokeWidth={strokeWidth * 0.7} opacity={opacity} />
    <line x1="45" y1="92" x2="55" y2="92" stroke={stroke} strokeWidth={strokeWidth * 0.5} opacity={opacity} />
  </>
);

/**
 * Capacitor / Kondensator
 * IEC 60617 symbol: two parallel plates.
 */
const CapacitorSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Top connection */}
    <line x1="50" y1="0" x2="50" y2="40" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Top plate */}
    <line x1="30" y1="40" x2="70" y2="40" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Bottom plate */}
    <line x1="30" y1="55" x2="70" y2="55" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Bottom connection */}
    <line x1="50" y1="55" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Reactor / DĹ‚awik
 * IEC 60617 symbol: coil/inductor with 3 half-loops.
 */
const ReactorSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Top connection */}
    <line x1="50" y1="0" x2="50" y2="25" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Coil â€” three arcs (half-circles) */}
    <path
      d="M 50 25 A 12 12 0 0 1 50 49 A 12 12 0 0 1 50 73"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
    />
    {/* Bottom connection */}
    <line x1="50" y1="73" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Inverter / Falownik
 * IEC 60617 symbol: rectangle with AC/DC wave marks.
 */
const InverterSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Top connection (DC side) */}
    <line x1="50" y1="0" x2="50" y2="20" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Inverter body */}
    <rect x="25" y="20" width="50" height="55" fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={2} opacity={opacity} />
    {/* DC mark â€” straight line with +/- */}
    <line x1="35" y1="35" x2="65" y2="35" stroke={stroke} strokeWidth={1.5} opacity={opacity} />
    <line x1="38" y1="32" x2="38" y2="38" stroke={stroke} strokeWidth={1.5} opacity={opacity} />
    {/* AC mark â€” sine wave */}
    <path
      d="M 35 60 Q 42 50 50 60 Q 58 70 65 60"
      fill="none"
      stroke={stroke}
      strokeWidth={1.5}
      opacity={opacity}
    />
    {/* Diagonal arrow (conversion direction) */}
    <line x1="35" y1="68" x2="65" y2="28" stroke={stroke} strokeWidth={1} opacity={opacity * 0.6} />
    {/* Bottom connection (AC side) */}
    <line x1="50" y1="75" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Metering Cubicle / Szafka pomiarowa
 * IEC 61082: rectangle with kWh meter symbol.
 */
const MeteringCubicleSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Top connection */}
    <line x1="50" y1="0" x2="50" y2="20" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Cubicle body */}
    <rect x="25" y="20" width="50" height="55" fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={2} opacity={opacity} />
    {/* Meter circle */}
    <circle cx="50" cy="42" r="12" fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.6} opacity={opacity} />
    {/* kWh label */}
    <text x="50" y="46" textAnchor="middle" fontSize="8" fontWeight="500" fill={stroke} opacity={opacity}>
      kWh
    </text>
    {/* Spinning disc indicator */}
    <line x1="42" y1="60" x2="58" y2="60" stroke={stroke} strokeWidth={1.5} opacity={opacity} />
    {/* Bottom connection */}
    <line x1="50" y1="75" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Motor / Silnik
 * IEC 60617 symbol: circle with letter M.
 */
const MotorSymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Connection stub from top */}
    <line x1="50" y1="0" x2="50" y2="20" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Motor circle */}
    <circle cx="50" cy="50" r="30" fill={fill === 'none' ? 'rgba(255,255,255,0.95)' : fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Letter M */}
    <text x="50" y="58" textAnchor="middle" fontSize="28" fontWeight="bold" fill={stroke} opacity={opacity}>
      M
    </text>
  </>
);

/**
 * Relay / PrzekaĹşnik zabezpieczeniowy
 * IEC 60617 symbol: rectangle with function label, placed above breaker.
 */
const RelaySymbol: React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> = ({
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
}) => (
  <>
    {/* Relay body */}
    <rect x="25" y="20" width="50" height="40" fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
    {/* Function label */}
    <text x="50" y="47" textAnchor="middle" fontSize="18" fontWeight="bold" fill={stroke} opacity={opacity}>
      I&gt;
    </text>
    {/* Connection to CB below */}
    <line x1="50" y1="60" x2="50" y2="100" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  </>
);

/**
 * Mapa komponentĂłw symboli.
 */
const SYMBOL_COMPONENTS: Record<CanonicalSymbolId, React.FC<Omit<CanonicalSymbolProps, 'symbolId'>>> = {
  busbar: BusbarSymbol,
  circuit_breaker: CircuitBreakerSymbol,
  disconnector: DisconnectorSymbol,
  line_overhead: LineOverheadSymbol,
  line_cable: LineCableSymbol,
  transformer_2w: Transformer2wSymbol,
  transformer_3w: Transformer3wSymbol,
  generator: GeneratorSymbol,
  pv: PvSymbol,
  fw: FwSymbol,
  bess: BessSymbol,
  system_source: SystemSourceSymbol,
  utility_feeder: UtilityFeederSymbol,
  branch_pole: BranchPoleSymbol,
  zksn: ZksnSymbol,
  cable_head: CableHeadSymbol,
  ground: GroundSymbol,
  ct: CtSymbol,
  vt: VtSymbol,
  // Canonical SLD symbols (IEC 60617/61082)
  overcurrent_relay: OvercurrentRelaySymbol,
  directional_relay: DirectionalRelaySymbol,
  earthing_switch: EarthingSwitchSymbol,
  load_arrow: LoadArrowSymbol,
  // Industrial canonical SLD symbols (IEC 60617/61082 â€” BLOK B)
  fuse: FuseSymbol,
  surge_arrester: SurgeArresterSymbol,
  capacitor: CapacitorSymbol,
  reactor: ReactorSymbol,
  inverter: InverterSymbol,
  metering_cubicle: MeteringCubicleSymbol,
  motor: MotorSymbol,
  // Tree-specific symbols
  load: LoadSymbol,
  project: ProjectSymbol,
  catalog: CatalogSymbol,
  study_case: StudyCaseSymbol,
  results: ResultsSymbol,
  relay: RelaySymbol,
  folder: FolderSymbol,
};

/**
 * GĹ‚Ăłwny komponent renderujÄ…cy symbol CANONICAL.
 *
 * UĹĽycie:
 * ```tsx
 * <g transform={`translate(${x}, ${y}) scale(${scale})`}>
 *   <CanonicalSymbol symbolId="circuit_breaker" stroke="#1f2937" switchState="OPEN" />
 * </g>
 * ```
 */
export const CanonicalSymbol: React.FC<CanonicalSymbolProps> = ({
  symbolId,
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 3,
  opacity = 1,
  size = 40,
  switchState,
}) => {
  const SymbolComponent = SYMBOL_COMPONENTS[symbolId];

  if (!SymbolComponent) {
    console.warn(`[CanonicalSymbol] Nieznany symbolId: ${symbolId}`);
    return null;
  }

  // Scale: viewBox is 100x100, we scale to desired size
  const scale = size / 100;

  return (
    <g transform={`scale(${scale})`} data-canonical-symbol={symbolId} data-switch-state={switchState}>
      <SymbolComponent
        stroke={stroke}
        fill={fill}
        strokeWidth={strokeWidth / scale} // Compensate for scaling
        opacity={opacity}
        switchState={switchState}
      />
    </g>
  );
};

/**
 * Pobierz komponent symbolu po ID (dla zaawansowanego uĹĽycia).
 */
export function getSymbolComponent(
  symbolId: CanonicalSymbolId
): React.FC<Omit<CanonicalSymbolProps, 'symbolId'>> | null {
  return SYMBOL_COMPONENTS[symbolId] || null;
}

/**
 * Renderuj symbol jako SVG string (dla eksportu/testĂłw).
 */
export function renderSymbolToString(symbolId: CanonicalSymbolId): string | null {
  const svgContent: Record<CanonicalSymbolId, string> = {
    busbar: '<rect x="5" y="45" width="90" height="10" fill="none" stroke="#000000" stroke-width="3"/>',
    circuit_breaker: `<rect x="30" y="30" width="40" height="40" fill="none" stroke="#000000" stroke-width="3"/>
      <line x1="30" y1="30" x2="70" y2="70" stroke="#000000" stroke-width="2"/>
      <line x1="70" y1="30" x2="30" y2="70" stroke="#000000" stroke-width="2"/>
      <line x1="50" y1="0" x2="50" y2="30" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="70" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    disconnector: `<line x1="50" y1="0" x2="50" y2="35" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="65" x2="50" y2="100" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="35" x2="70" y2="50" stroke="#000000" stroke-width="3"/>
      <circle cx="50" cy="35" r="4" fill="#000000"/>
      <circle cx="50" cy="65" r="4" fill="#000000"/>`,
    line_overhead: '<line x1="0" y1="50" x2="100" y2="50" stroke="#000000" stroke-width="3"/>',
    line_cable: '<line x1="0" y1="50" x2="100" y2="50" stroke="#000000" stroke-width="3" stroke-dasharray="8,4"/>',
    transformer_2w: `<circle cx="50" cy="35" r="20" fill="none" stroke="#000000" stroke-width="3"/>
      <circle cx="50" cy="65" r="20" fill="none" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="0" x2="50" y2="15" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="85" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    transformer_3w: `<circle cx="50" cy="30" r="18" fill="none" stroke="#000000" stroke-width="3"/>
      <circle cx="32" cy="62" r="18" fill="none" stroke="#000000" stroke-width="3"/>
      <circle cx="68" cy="62" r="18" fill="none" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="0" x2="50" y2="12" stroke="#000000" stroke-width="3"/>
      <line x1="14" y1="62" x2="0" y2="62" stroke="#000000" stroke-width="3"/>
      <line x1="86" y1="62" x2="100" y2="62" stroke="#000000" stroke-width="3"/>`,
    generator: `<circle cx="50" cy="40" r="30" fill="none" stroke="#000000" stroke-width="3"/>
      <text x="50" y="48" text-anchor="middle" font-size="24" font-weight="bold" fill="#000000">G</text>
      <line x1="50" y1="70" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    pv: `<rect x="20" y="20" width="60" height="40" fill="none" stroke="#000000" stroke-width="3"/>
      <line x1="20" y1="40" x2="80" y2="40" stroke="#000000" stroke-width="1.5"/>
      <line x1="40" y1="20" x2="40" y2="60" stroke="#000000" stroke-width="1.5"/>
      <line x1="60" y1="20" x2="60" y2="60" stroke="#000000" stroke-width="1.5"/>
      <line x1="10" y1="10" x2="25" y2="25" stroke="#000000" stroke-width="2"/>
      <path d="M 10 10 L 10 18 M 10 10 L 18 10" stroke="#000000" stroke-width="2" fill="none"/>
      <line x1="50" y1="60" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    fw: `<circle cx="50" cy="30" r="8" fill="none" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="30" x2="50" y2="5" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="30" x2="28" y2="45" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="30" x2="72" y2="45" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="38" x2="50" y2="70" stroke="#000000" stroke-width="3"/>
      <line x1="35" y1="70" x2="65" y2="70" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="70" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    bess: `<rect x="25" y="25" width="50" height="45" fill="none" stroke="#000000" stroke-width="3"/>
      <rect x="40" y="18" width="20" height="7" fill="none" stroke="#000000" stroke-width="2"/>
      <text x="50" y="42" text-anchor="middle" font-size="16" font-weight="bold" fill="#000000">+</text>
      <text x="50" y="62" text-anchor="middle" font-size="20" font-weight="bold" fill="#000000">â’</text>
      <line x1="50" y1="70" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    system_source: `<circle cx="50" cy="22" r="16" fill="none" stroke="#000000" stroke-width="3"/>
      <path d="M 38 22 Q 44 16 50 22 Q 56 28 62 22" fill="none" stroke="#000000" stroke-width="1.95" stroke-linecap="round"/>
      <line x1="16" y1="22" x2="34" y2="22" stroke="#000000" stroke-width="2.7" stroke-linecap="round"/>
      <line x1="66" y1="22" x2="84" y2="22" stroke="#000000" stroke-width="2.7" stroke-linecap="round"/>
      <line x1="50" y1="38" x2="50" y2="48" stroke="#000000" stroke-width="3" stroke-linecap="round"/>
      <rect x="42" y="48" width="16" height="18" rx="2" ry="2" fill="none" stroke="#000000" stroke-width="2.55"/>
      <line x1="50" y1="66" x2="50" y2="100" stroke="#000000" stroke-width="3" stroke-linecap="round"/>`,
    utility_feeder: `<circle cx="50" cy="24" r="14" fill="none" stroke="#000000" stroke-width="3"/>
      <path d="M 40 24 Q 45 19 50 24 Q 55 29 60 24" fill="none" stroke="#000000" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="36" y1="24" x2="18" y2="24" stroke="#000000" stroke-width="2.55" stroke-linecap="round"/>
      <line x1="50" y1="38" x2="50" y2="48" stroke="#000000" stroke-width="3" stroke-linecap="round"/>
      <rect x="42" y="48" width="16" height="18" rx="2" ry="2" fill="none" stroke="#000000" stroke-width="2.55"/>
      <line x1="50" y1="50" x2="50" y2="64" stroke="#000000" stroke-width="2.55" stroke-linecap="round"/>
      <line x1="50" y1="66" x2="50" y2="100" stroke="#000000" stroke-width="3" stroke-linecap="round"/>`,
    branch_pole: `<line x1="0" y1="50" x2="18" y2="50" stroke="#000000" stroke-width="3"/>
      <polygon points="50,12 82,50 50,88 18,50" fill="none" stroke="#000000" stroke-width="3" stroke-linejoin="round"/>
      <line x1="82" y1="50" x2="100" y2="50" stroke="#000000" stroke-width="3"/>`,
    zksn: `<line x1="0" y1="50" x2="22" y2="50" stroke="#000000" stroke-width="3"/>
      <rect x="22" y="30" width="56" height="40" rx="6" ry="6" fill="none" stroke="#000000" stroke-width="3"/>
      <text x="50" y="56" text-anchor="middle" font-size="24" font-weight="700" fill="#000000">Z</text>
      <line x1="78" y1="50" x2="100" y2="50" stroke="#000000" stroke-width="3"/>`,
    cable_head: `<line x1="50" y1="0" x2="50" y2="28" stroke="#000000" stroke-width="3"/>
      <polygon points="50,28 28,68 72,68" fill="none" stroke="#000000" stroke-width="3" stroke-linejoin="round"/>
      <line x1="50" y1="68" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    ground: `<line x1="50" y1="0" x2="50" y2="40" stroke="#000000" stroke-width="3"/>
      <line x1="25" y1="40" x2="75" y2="40" stroke="#000000" stroke-width="3"/>
      <line x1="32" y1="55" x2="68" y2="55" stroke="#000000" stroke-width="3"/>
      <line x1="40" y1="70" x2="60" y2="70" stroke="#000000" stroke-width="3"/>`,
    ct: `<line x1="0" y1="50" x2="35" y2="50" stroke="#000000" stroke-width="2.4"/>
      <line x1="65" y1="50" x2="100" y2="50" stroke="#000000" stroke-width="2.4"/>
      <circle cx="50" cy="50" r="15" fill="none" stroke="#000000" stroke-width="2.1"/>
      <circle cx="50" cy="50" r="8" fill="none" stroke="#000000" stroke-width="1.5"/>
      <line x1="50" y1="65" x2="50" y2="75" stroke="#000000" stroke-width="1.2"/>
      <line x1="46" y1="75" x2="54" y2="75" stroke="#000000" stroke-width="1.2"/>
      <circle cx="50" cy="88" r="2.5" fill="#000000"/>`,
    vt: `<line x1="0" y1="50" x2="35" y2="50" stroke="#000000" stroke-width="2.4"/>
      <line x1="65" y1="50" x2="100" y2="50" stroke="#000000" stroke-width="2.4"/>
      <circle cx="50" cy="50" r="12" fill="none" stroke="#000000" stroke-width="1.8"/>
      <line x1="50" y1="62" x2="50" y2="80" stroke="#000000" stroke-width="1.5"/>
      <line x1="42" y1="80" x2="58" y2="80" stroke="#000000" stroke-width="1.5"/>
      <line x1="46" y1="92" x2="54" y2="92" stroke="#000000" stroke-width="1.2"/>
      <line x1="50" y1="88" x2="50" y2="96" stroke="#000000" stroke-width="1.2"/>`,
    // Tree-specific symbols
    load: `<line x1="50" y1="0" x2="50" y2="25" stroke="#000000" stroke-width="3"/>
      <polygon points="50,25 25,70 75,70" fill="none" stroke="#000000" stroke-width="3" stroke-linejoin="round"/>
      <line x1="25" y1="85" x2="75" y2="85" stroke="#000000" stroke-width="3"/>`,
    project: `<rect x="10" y="15" width="80" height="70" fill="none" stroke="#000000" stroke-width="3"/>
      <line x1="10" y1="30" x2="90" y2="30" stroke="#000000" stroke-width="3"/>
      <line x1="35" y1="30" x2="35" y2="85" stroke="#000000" stroke-width="2"/>
      <line x1="65" y1="30" x2="65" y2="85" stroke="#000000" stroke-width="2"/>
      <line x1="10" y1="55" x2="90" y2="55" stroke="#000000" stroke-width="2"/>`,
    catalog: `<rect x="20" y="15" width="60" height="70" fill="none" stroke="#000000" stroke-width="3"/>
      <line x1="30" y1="15" x2="30" y2="85" stroke="#000000" stroke-width="3"/>
      <line x1="40" y1="30" x2="70" y2="30" stroke="#000000" stroke-width="2"/>
      <line x1="40" y1="45" x2="70" y2="45" stroke="#000000" stroke-width="2"/>
      <line x1="40" y1="60" x2="70" y2="60" stroke="#000000" stroke-width="2"/>`,
    study_case: `<rect x="20" y="10" width="60" height="80" fill="none" stroke="#000000" stroke-width="3"/>
      <text x="50" y="60" text-anchor="middle" font-size="36" font-weight="bold" fill="#000000">ÎŁ</text>`,
    results: `<line x1="15" y1="15" x2="15" y2="85" stroke="#000000" stroke-width="3"/>
      <line x1="15" y1="85" x2="85" y2="85" stroke="#000000" stroke-width="3"/>
      <rect x="25" y="50" width="12" height="30" fill="none" stroke="#000000" stroke-width="2"/>
      <rect x="45" y="30" width="12" height="50" fill="none" stroke="#000000" stroke-width="2"/>
      <rect x="65" y="45" width="12" height="35" fill="none" stroke="#000000" stroke-width="2"/>`,
    relay: `<rect x="25" y="20" width="50" height="40" fill="none" stroke="#000000" stroke-width="3"/>
      <text x="50" y="47" text-anchor="middle" font-size="18" font-weight="bold" fill="#000000">I&gt;</text>
      <line x1="50" y1="60" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    folder: `<path d="M 10 25 L 10 20 L 35 20 L 45 30 L 90 30 L 90 25" fill="none" stroke="#000000" stroke-width="3" stroke-linejoin="round"/>
      <rect x="10" y="30" width="80" height="55" fill="none" stroke="#000000" stroke-width="3"/>`,
    overcurrent_relay: `<line x1="10" y1="50" x2="35" y2="50" stroke="#000000" stroke-width="3"/>
      <rect x="35" y="35" width="30" height="30" fill="none" stroke="#000000" stroke-width="3" rx="2"/>
      <text x="50" y="55" text-anchor="middle" font-size="12" fill="#000000">51</text>
      <line x1="65" y1="50" x2="90" y2="50" stroke="#000000" stroke-width="3"/>`,
    directional_relay: `<line x1="10" y1="50" x2="35" y2="50" stroke="#000000" stroke-width="3"/>
      <rect x="35" y="35" width="30" height="30" fill="none" stroke="#000000" stroke-width="3" rx="2"/>
      <text x="50" y="55" text-anchor="middle" font-size="12" fill="#000000">67</text>
      <line x1="65" y1="50" x2="90" y2="50" stroke="#000000" stroke-width="3"/>
      <polygon points="72,46 78,50 72,54" fill="#000000"/>`,
    earthing_switch: `<line x1="10" y1="50" x2="40" y2="50" stroke="#000000" stroke-width="3"/>
      <line x1="40" y1="35" x2="60" y2="65" stroke="#000000" stroke-width="3"/>
      <line x1="40" y1="65" x2="60" y2="35" stroke="#000000" stroke-width="3"/>
      <line x1="60" y1="50" x2="90" y2="50" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="65" x2="50" y2="75" stroke="#000000" stroke-width="3"/>
      <line x1="42" y1="75" x2="58" y2="75" stroke="#000000" stroke-width="3"/>
      <line x1="44" y1="80" x2="56" y2="80" stroke="#000000" stroke-width="1.5"/>
      <line x1="47" y1="85" x2="53" y2="85" stroke="#000000" stroke-width="1"/>`,
    load_arrow: `<line x1="50" y1="10" x2="50" y2="45" stroke="#000000" stroke-width="3"/>
      <polygon points="35,45 65,45 50,75" fill="none" stroke="#000000" stroke-width="3" stroke-linejoin="round"/>`,
    fuse: `<line x1="50" y1="0" x2="50" y2="30" stroke="#000000" stroke-width="3"/>
      <rect x="38" y="30" width="24" height="40" fill="none" stroke="#000000" stroke-width="3" rx="1"/>
      <line x1="50" y1="30" x2="50" y2="70" stroke="#000000" stroke-width="1.8"/>
      <line x1="50" y1="70" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    surge_arrester: `<line x1="50" y1="0" x2="50" y2="25" stroke="#000000" stroke-width="3"/>
      <line x1="35" y1="25" x2="65" y2="25" stroke="#000000" stroke-width="3"/>
      <line x1="35" y1="35" x2="65" y2="35" stroke="#000000" stroke-width="3"/>
      <polyline points="50,35 40,45 60,55 50,65" fill="none" stroke="#000000" stroke-width="3" stroke-linejoin="round"/>
      <line x1="50" y1="65" x2="50" y2="78" stroke="#000000" stroke-width="3"/>
      <line x1="35" y1="78" x2="65" y2="78" stroke="#000000" stroke-width="3"/>
      <line x1="40" y1="85" x2="60" y2="85" stroke="#000000" stroke-width="2"/>
      <line x1="45" y1="92" x2="55" y2="92" stroke="#000000" stroke-width="1.5"/>`,
    capacitor: `<line x1="50" y1="0" x2="50" y2="40" stroke="#000000" stroke-width="3"/>
      <line x1="30" y1="40" x2="70" y2="40" stroke="#000000" stroke-width="3"/>
      <line x1="30" y1="55" x2="70" y2="55" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="55" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    reactor: `<line x1="50" y1="0" x2="50" y2="25" stroke="#000000" stroke-width="3"/>
      <path d="M 50 25 A 12 12 0 0 1 50 49 A 12 12 0 0 1 50 73" fill="none" stroke="#000000" stroke-width="3"/>
      <line x1="50" y1="73" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    inverter: `<line x1="50" y1="0" x2="50" y2="20" stroke="#000000" stroke-width="3"/>
      <rect x="25" y="20" width="50" height="55" fill="none" stroke="#000000" stroke-width="3" rx="2"/>
      <line x1="35" y1="35" x2="65" y2="35" stroke="#000000" stroke-width="1.5"/>
      <line x1="38" y1="32" x2="38" y2="38" stroke="#000000" stroke-width="1.5"/>
      <path d="M 35 60 Q 42 50 50 60 Q 58 70 65 60" fill="none" stroke="#000000" stroke-width="1.5"/>
      <line x1="50" y1="75" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    metering_cubicle: `<line x1="50" y1="0" x2="50" y2="20" stroke="#000000" stroke-width="3"/>
      <rect x="25" y="20" width="50" height="55" fill="none" stroke="#000000" stroke-width="3" rx="2"/>
      <circle cx="50" cy="42" r="12" fill="none" stroke="#000000" stroke-width="1.8"/>
      <text x="50" y="46" text-anchor="middle" font-size="8" font-weight="500" fill="#000000">kWh</text>
      <line x1="42" y1="60" x2="58" y2="60" stroke="#000000" stroke-width="1.5"/>
      <line x1="50" y1="75" x2="50" y2="100" stroke="#000000" stroke-width="3"/>`,
    motor: `<line x1="50" y1="0" x2="50" y2="20" stroke="#000000" stroke-width="3"/>
      <circle cx="50" cy="50" r="30" fill="none" stroke="#000000" stroke-width="3"/>
      <text x="50" y="58" text-anchor="middle" font-size="28" font-weight="bold" fill="#000000">M</text>`,
  };

  return svgContent[symbolId] || null;
}

export default CanonicalSymbol;

