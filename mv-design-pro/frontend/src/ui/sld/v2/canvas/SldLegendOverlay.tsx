/**
 * K30-39 — SldLegendOverlay: legend / klucz symboli + palet używanych na schemacie.
 *
 * Industrial drawings zgodnie z PN-EN ISO 7200 + IEC 60617 wymagają legendy
 * symboli i palet kolorów. Bez legendy operator/elektromontażysta musi się
 * domyślać znaczenia różnych odcieni — co eliminuje wartość color codingu
 * dodanego w K30-33 (cable variants), K30-37 (voltage bus tint), K30-41
 * (cable voltage tint).
 *
 * Komponent renderuje 4 sekcje:
 * 1. Klasy napięcia (voltage classes): WN / SN / SN niskie / nN palette
 * 2. Warianty kabla (cable variants): XLPE / EPR / PVC / PAPER / OH
 * 3. Stan aparatu (apparatus state): closed / open / unknown
 * 4. DER types: PV / BESS / FW
 *
 * Pozycja: top-right canvas (poniżej alarm summary, przed title block).
 * Toggleable via prop `visible` (default true).
 */

import type { JSX } from 'react';

export interface SldLegendOverlayProps {
  /** Czy legenda widoczna. Default true. */
  readonly visible?: boolean;
  /** X coordinate origin (zwykle ustalany przez rodzica względem viewport).
   *  Default 0 → renderer zakłada że rodzic stosuje transform. */
  readonly x?: number;
  /** Y coordinate origin. Default 0. */
  readonly y?: number;
}

const PANEL_WIDTH = 220;
const PANEL_HEIGHT = 320;
const PANEL_BG = '#0A0E14';
const PANEL_BORDER = '#5A6878';
const TEXT_PRIMARY = '#DDF7FF';
const TEXT_SECONDARY = '#88BBDD';
const TEXT_TITLE = '#7EE0B5';

const VOLTAGE_PALETTE: ReadonlyArray<{ label: string; color: string; range: string }> = [
  { label: 'WN', range: '≥ 100 kV', color: '#E74C3C' },
  { label: 'SN', range: '12–30 kV', color: '#13C45A' },
  { label: 'SN niskie', range: '5–10 kV', color: '#0A8D43' },
  { label: 'nN', range: '0.2–1 kV', color: '#7DD3FC' },
];

const CABLE_VARIANTS: ReadonlyArray<{ label: string; color: string; dasharray?: string }> = [
  { label: 'XLPE Al/Cu', color: '#13C45A' },
  { label: 'EPR Al/Cu', color: '#FFD166' },
  { label: 'PVC', color: '#7DD3FC' },
  { label: 'Papier-olej', color: '#A8B5BD', dasharray: '6 3' },
  { label: 'Linia napowietrzna (AFL)', color: '#13C45A', dasharray: '12 4' },
];

const APPARATUS_STATES: ReadonlyArray<{ label: string; fill: string; stroke: string; openMarker?: boolean }> = [
  { label: 'Zamknięty (energized)', fill: '#07983A', stroke: '#13C45A' },
  { label: 'Otwarty', fill: '#1E242A', stroke: '#FF333D', openMarker: true },
  { label: 'Nieznany (brak telemetrii)', fill: '#6E737A', stroke: '#6E737A' },
];

const DER_TYPES: ReadonlyArray<{ label: string; symbol: 'PV' | 'BESS' | 'FW'; color: string }> = [
  { label: 'PV (fotowoltaika)', symbol: 'PV', color: '#FFD166' },
  { label: 'BESS (magazyn energii)', symbol: 'BESS', color: '#7DD3FC' },
  { label: 'FW (farma wiatrowa)', symbol: 'FW', color: '#7EE0B5' },
];

export function SldLegendOverlay(props: SldLegendOverlayProps): JSX.Element | null {
  const { visible = true, x = 0, y = 0 } = props;
  if (!visible) return null;

  return (
    <g
      data-testid="sld-v2-legend-overlay"
      pointerEvents="none"
      transform={`translate(${x}, ${y})`}
    >
      <rect
        x={0}
        y={0}
        width={PANEL_WIDTH}
        height={PANEL_HEIGHT}
        rx={3}
        ry={3}
        fill={PANEL_BG}
        stroke={PANEL_BORDER}
        strokeWidth={1.4}
        opacity={0.95}
      />

      {/* Header */}
      <text x={10} y={16} fill={TEXT_PRIMARY} fontFamily="sans-serif" fontSize={11} fontWeight={800}>
        LEGENDA · IEC 60617 / PN-EN
      </text>
      <line x1={10} y1={22} x2={PANEL_WIDTH - 10} y2={22} stroke={PANEL_BORDER} strokeWidth={0.8} />

      {/* §1 Voltage classes */}
      <g data-testid="sld-v2-legend-voltage" transform="translate(10, 36)">
        <text x={0} y={0} fill={TEXT_TITLE} fontFamily="sans-serif" fontSize={9} fontWeight={700}>
          KLASY NAPIĘCIA (szyna / kabel)
        </text>
        {VOLTAGE_PALETTE.map((row, idx) => (
          <g key={`v-${row.label}`} transform={`translate(0, ${12 + idx * 14})`}>
            <line x1={0} y1={4} x2={28} y2={4} stroke={row.color} strokeWidth={3} strokeLinecap="round" />
            <text x={36} y={7} fill={TEXT_PRIMARY} fontFamily="sans-serif" fontSize={9} fontWeight={700}>
              {row.label}
            </text>
            <text x={80} y={7} fill={TEXT_SECONDARY} fontFamily="sans-serif" fontSize={9}>
              {row.range}
            </text>
          </g>
        ))}
      </g>

      {/* §2 Cable variants */}
      <g data-testid="sld-v2-legend-cable-variants" transform="translate(10, 108)">
        <text x={0} y={0} fill={TEXT_TITLE} fontFamily="sans-serif" fontSize={9} fontWeight={700}>
          WARIANTY KABLA (izolacja)
        </text>
        {CABLE_VARIANTS.map((row, idx) => (
          <g key={`c-${row.label}`} transform={`translate(0, ${12 + idx * 13})`}>
            <line
              x1={0}
              y1={4}
              x2={28}
              y2={4}
              stroke={row.color}
              strokeWidth={3}
              strokeDasharray={row.dasharray}
              strokeLinecap="round"
            />
            <text x={36} y={7} fill={TEXT_PRIMARY} fontFamily="sans-serif" fontSize={9}>
              {row.label}
            </text>
          </g>
        ))}
      </g>

      {/* §3 Apparatus states */}
      <g data-testid="sld-v2-legend-apparatus-states" transform="translate(10, 187)">
        <text x={0} y={0} fill={TEXT_TITLE} fontFamily="sans-serif" fontSize={9} fontWeight={700}>
          STAN APARATU (CB / DS)
        </text>
        {APPARATUS_STATES.map((row, idx) => (
          <g key={`a-${row.label}`} transform={`translate(0, ${12 + idx * 16})`}>
            <rect x={6} y={-3} width={14} height={14} fill={row.fill} stroke={row.stroke} strokeWidth={1.2} rx={1} />
            {row.openMarker && (
              <line x1={7} y1={4} x2={19} y2={4} stroke="#C9151B" strokeWidth={1.3} />
            )}
            <text x={28} y={7} fill={TEXT_PRIMARY} fontFamily="sans-serif" fontSize={9}>
              {row.label}
            </text>
          </g>
        ))}
      </g>

      {/* §4 DER types */}
      <g data-testid="sld-v2-legend-der-types" transform="translate(10, 254)">
        <text x={0} y={0} fill={TEXT_TITLE} fontFamily="sans-serif" fontSize={9} fontWeight={700}>
          UKŁADY PRZYŁĄCZENIOWE (DER)
        </text>
        {DER_TYPES.map((row, idx) => (
          <g key={`d-${row.symbol}`} transform={`translate(0, ${12 + idx * 14})`}>
            <circle cx={13} cy={4} r={6} fill={row.color} stroke="#0A0E14" strokeWidth={0.8} />
            <text
              x={13}
              y={7}
              textAnchor="middle"
              fill="#0A0E14"
              fontFamily="sans-serif"
              fontSize={6}
              fontWeight={900}
            >
              {row.symbol === 'BESS' ? 'B' : row.symbol[0]}
            </text>
            <text x={28} y={7} fill={TEXT_PRIMARY} fontFamily="sans-serif" fontSize={9}>
              {row.label}
            </text>
          </g>
        ))}
      </g>
    </g>
  );
}
