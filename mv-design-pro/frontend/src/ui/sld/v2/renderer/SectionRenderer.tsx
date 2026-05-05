/**
 * SectionRenderer — renderer sekcji rozdzielni SN GPZ (PR-5b).
 *
 * Renderuje szynę sekcji (pozioma linia) + etykietę sekcji (numer + napięcie).
 */

import {
  BAY_WIDTH_PX,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_SANS,
  FONT_SIZES,
  STROKE_BUSBAR_PX,
} from '../theme/tokens';

export interface SectionRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly number: number;
  readonly busVoltageKv: number;
  readonly bayCount: number;
  /** Cyfra rzymska sekcji ("I", "II", "III", "IV") albo "S{n}". */
  readonly displayLabel?: string;
}

function toRoman(n: number): string {
  const map: Array<[number, string]> = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let result = '';
  let remaining = n;
  for (const [value, numeral] of map) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result || `${n}`;
}

export function SectionRenderer(props: SectionRendererProps): JSX.Element {
  const { id, x, y, number, busVoltageKv, bayCount, displayLabel } = props;
  const label = displayLabel ?? `Sekcja ${toRoman(number)}`;
  // Szerokość szyny zależy od liczby pól (każde pole zajmuje BAY_WIDTH_PX).
  const busbarWidth = Math.max(BAY_WIDTH_PX * Math.max(bayCount, 1), BAY_WIDTH_PX);

  return (
    <g
      data-testid={`sld-v2-section-${id}`}
      data-element-kind="section"
      data-element-id={id}
      transform={`translate(${x}, ${y})`}
    >
      {/* Etykieta sekcji nad szyną */}
      <text
        x={0}
        y={-20}
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.switchgearParams}
        fontWeight={600}
      >
        {label}
      </text>
      <text
        x={0}
        y={-4}
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
      >
        {busVoltageKv} kV
      </text>
      {/* Szyna sekcji */}
      <line
        x1={0}
        y1={0}
        x2={busbarWidth}
        y2={0}
        stroke="#FFD400"  /* scada-sn yellow */
        strokeWidth={STROKE_BUSBAR_PX}
        strokeLinecap="square"
      />
    </g>
  );
}
