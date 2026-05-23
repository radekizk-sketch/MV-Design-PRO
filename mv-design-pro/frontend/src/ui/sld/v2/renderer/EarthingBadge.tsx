/**
 * EarthingBadge — wizualizacja systemu uziemienia (TN/IT/TT/Petersen) na SLD.
 *
 * Render: mały badge ⏚ z literą TN/IT/TT/PC + opcjonalna wartość R0/X0.
 *
 * Stosowane: na GPZ obok punktu neutralnego, na stacjach z różnym systemem.
 */

export type EarthingType = 'TN' | 'IT' | 'TT' | 'PETERSEN' | 'SOLID' | 'ISOLATED' | 'RESISTOR';

const EARTHING_LABELS: Record<EarthingType, { code: string; label: string; color: string }> = {
  TN: { code: 'TN', label: 'TN (bezpośrednie)', color: '#26f0b1' },
  IT: { code: 'IT', label: 'IT (izolowane)', color: '#ffd166' },
  TT: { code: 'TT', label: 'TT (odbiorcze)', color: '#88c0ff' },
  PETERSEN: { code: 'PC', label: 'Cewka Petersena', color: '#c084fc' },
  SOLID: { code: 'TN', label: 'Bezpośrednie', color: '#26f0b1' },
  ISOLATED: { code: 'IT', label: 'Izolowane', color: '#ffd166' },
  RESISTOR: { code: 'R', label: 'Rezystorowe', color: '#ff8b5c' },
};

export interface EarthingBadgeProps {
  /** Typ uziemienia. */
  readonly type: EarthingType;
  /** Pozycja X na canvas. */
  readonly x: number;
  /** Pozycja Y na canvas. */
  readonly y: number;
  /** Opcjonalna wartość R [Ω] dla rezystorowego. */
  readonly r_ohm?: number;
  /** Opcjonalna wartość X [Ω] dla cewki Petersena. */
  readonly x_ohm?: number;
  /** Klik handler. */
  readonly onClick?: () => void;
}

export function EarthingBadge({ type, x, y, r_ohm, x_ohm, onClick }: EarthingBadgeProps): JSX.Element {
  const info = EARTHING_LABELS[type];
  const valueText = r_ohm !== undefined
    ? `${r_ohm} Ω`
    : x_ohm !== undefined
      ? `${x_ohm} Ω`
      : null;

  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      data-testid={`earthing-badge-${type}`}
    >
      {/* Symbol uziemienia ⏚ - 3 poziome kreski malejące */}
      <line x1={-8} y1={0} x2={8} y2={0} stroke={info.color} strokeWidth={2} />
      <line x1={-6} y1={3} x2={6} y2={3} stroke={info.color} strokeWidth={1.5} />
      <line x1={-4} y1={6} x2={4} y2={6} stroke={info.color} strokeWidth={1.2} />
      <line x1={-2} y1={9} x2={2} y2={9} stroke={info.color} strokeWidth={1} />
      {/* Linia pionowa od symbolu w górę */}
      <line x1={0} y1={-6} x2={0} y2={0} stroke={info.color} strokeWidth={2} />
      {/* Tekst kod */}
      <text
        x={0}
        y={-10}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        fill={info.color}
        fontFamily="ui-monospace, monospace"
      >
        {info.code}
      </text>
      {valueText && (
        <text
          x={12}
          y={3}
          fontSize={8}
          fill={info.color}
          fontFamily="ui-monospace, monospace"
          data-testid={`earthing-value-${type}`}
        >
          {valueText}
        </text>
      )}
      <title>{info.label}{valueText ? ` (${valueText})` : ''}</title>
    </g>
  );
}
