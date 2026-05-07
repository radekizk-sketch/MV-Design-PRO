/**
 * DerConnectionTreeRenderer — pełne drzewo połączeń DER (Phase 0C / Phase 4).
 *
 * Renderowane przy LOD ≥ 3 (szczegół techniczny) zamiast pojedynczego rombu.
 * Walks `Generator.connection_variant` i renderuje pełen schemat:
 *   - LV_BEHIND_STATION_TRANSFORMER:
 *       szyna nN stacji → odpływ nN → falownik (PV/BESS/FW)
 *   - DEDICATED_MV_CONNECTION:
 *       pole SN → trafo blokowy → falownik
 *   - SOURCE_CONNECTION_STATION:
 *       osobna stacja źródłowa SN/nN → trafo blokowy → falownik
 *   - nn_side:
 *       szyna nN za transformatorem stacji → odpływ → falownik
 *   - block_transformer:
 *       szyna SN → trafo blokowy LV/MV → falownik
 *
 * Acceptance Invariant 10 (operator-grade SLD plan v2): DER zawsze ma PCC +
 * connection_variant + port + voltage_level — albo widoczny missing-connection
 * blocker. `missingPcc` flag rendererowany jako czerwony X na korzeniu drzewa.
 *
 * Ten renderer NIE jest pełnym SVG geometry pipeline — to "logiczne drzewo"
 * z kotwami (anchors) dla CableRunRenderer (kable nN i SN).
 */

import {
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_MONO,
  FONT_SANS,
  FONT_SIZES,
} from '../theme/tokens';

export type DerConnectionVariant =
  | 'nn_side'
  | 'block_transformer'
  | 'LV_BEHIND_STATION_TRANSFORMER'
  | 'DEDICATED_MV_CONNECTION'
  | 'SOURCE_CONNECTION_STATION';

export interface DerConnectionTreeProps {
  readonly id: string;
  /** Punkt zaczepienia (port stacji LUB bus stacji LUB pole SN). */
  readonly anchor: { x: number; y: number };
  /** Typ DER — wpływa na kolor akcentu badge'a. */
  readonly kind: 'PV' | 'BESS' | 'FW';
  readonly name: string;
  readonly nominalPowerKw?: number | null;
  readonly variant: DerConnectionVariant;
  /** Etykieta PCC do wyświetlenia (np. "Stacja S05 / Bus nN" lub "GPZ-1 / Sekcja A"). */
  readonly pccLabel?: string;
  readonly selected?: boolean;
  /**
   * Phase 0C: gdy true → renderuje czerwony X badge na całym drzewie zamiast
   * normalnego widoku, plus tooltip z reason. Operator widzi natychmiast że
   * obiekt ma blokadę (Acceptance Invariant 10).
   */
  readonly missingPcc?: boolean;
  readonly onClick?: (id: string) => void;
  readonly onDoubleClick?: (id: string) => void;
}

const KIND_FILL_COLOR: Record<DerConnectionTreeProps['kind'], string> = {
  PV: '#FFC857',
  BESS: '#3FA9F5',
  FW: '#7FB069',
};

const KIND_LABEL_PL: Record<DerConnectionTreeProps['kind'], string> = {
  PV: 'PV',
  BESS: 'BESS',
  FW: 'FW',
};

const VARIANT_LABEL_PL: Record<DerConnectionVariant, string> = {
  nn_side: 'po stronie nN',
  block_transformer: 'trafo blokowy',
  LV_BEHIND_STATION_TRANSFORMER: 'za trafem stacji',
  DEDICATED_MV_CONNECTION: 'dedykowane SN',
  SOURCE_CONNECTION_STATION: 'osobna stacja',
};

/**
 * Helpers per wariant — czy schemat zawiera trafo blokowy w torze ENM.
 * Decision #14: block_transformer / DEDICATED_MV / SOURCE_CONNECTION_STATION
 * zawierają trafo, nn_side / LV_BEHIND_STATION_TRANSFORMER nie (trafo to
 * trafo stacji, nie blokowy).
 */
function variantHasBlockTransformer(v: DerConnectionVariant): boolean {
  return v === 'block_transformer'
    || v === 'DEDICATED_MV_CONNECTION'
    || v === 'SOURCE_CONNECTION_STATION';
}

const TR_BLOCK_DX = 60;
const TR_BLOCK_DY = 0;
const INVERTER_DX = 130;
const INVERTER_DY = 0;
const INVERTER_HALF = 14;
const TR_BLOCK_HALF = 12;

export function DerConnectionTreeRenderer(props: DerConnectionTreeProps): JSX.Element {
  const {
    id, anchor, kind, name, nominalPowerKw, variant, pccLabel,
    selected, missingPcc, onClick, onDoubleClick,
  } = props;
  const hasTrBlock = variantHasBlockTransformer(variant);
  const inverterX = anchor.x + INVERTER_DX;
  const inverterY = anchor.y + INVERTER_DY;
  const trBlockX = anchor.x + TR_BLOCK_DX;
  const trBlockY = anchor.y + TR_BLOCK_DY;

  return (
    <g
      data-testid={`sld-v2-der-tree-${id}`}
      data-element-kind="der_sub_tree"
      data-element-id={id}
      data-der-kind={kind}
      data-variant={variant}
      data-missing-pcc={missingPcc ? 'true' : undefined}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
      onDoubleClick={onDoubleClick ? (e) => { e.stopPropagation(); onDoubleClick(id); } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Połączenie horyzontalne: anchor → (trafo blokowy?) → falownik. */}
      <line
        x1={anchor.x}
        y1={anchor.y}
        x2={inverterX - INVERTER_HALF}
        y2={inverterY}
        stroke={selected ? '#35C7FF' : COLOR_LINE_PRIMARY}
        strokeWidth={selected ? 2 : 1.5}
        opacity={missingPcc ? 0.4 : 1}
      />

      {/* Anchor point (PCC marker). */}
      <circle
        cx={anchor.x}
        cy={anchor.y}
        r={3}
        fill={COLOR_LINE_PRIMARY}
        stroke={COLOR_PANEL_RAISED}
        strokeWidth={1}
      >
        <title>{`PCC: ${pccLabel ?? '?'}`}</title>
      </circle>

      {/* PCC label nad anchor. */}
      {pccLabel && (
        <text
          x={anchor.x}
          y={anchor.y - 8}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_MONO}
          fontSize={FONT_SIZES.numericValue}
        >
          {pccLabel}
        </text>
      )}

      {/* Trafo blokowy (gdy variant go zawiera). */}
      {hasTrBlock && (
        <g data-testid={`sld-v2-der-tree-${id}-block-transformer`}>
          <circle
            cx={trBlockX - TR_BLOCK_HALF / 2}
            cy={trBlockY}
            r={TR_BLOCK_HALF / 2}
            fill="none"
            stroke={selected ? '#35C7FF' : COLOR_LINE_PRIMARY}
            strokeWidth={1.5}
            opacity={missingPcc ? 0.4 : 1}
          />
          <circle
            cx={trBlockX + TR_BLOCK_HALF / 2}
            cy={trBlockY}
            r={TR_BLOCK_HALF / 2}
            fill="none"
            stroke={selected ? '#35C7FF' : COLOR_LINE_PRIMARY}
            strokeWidth={1.5}
            opacity={missingPcc ? 0.4 : 1}
          />
          <text
            x={trBlockX}
            y={trBlockY - 14}
            textAnchor="middle"
            fill={COLOR_TEXT_SECONDARY}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.bayLabel}
          >
            TR
          </text>
        </g>
      )}

      {/* Falownik (PV/BESS/FW) — romb. */}
      <g data-testid={`sld-v2-der-tree-${id}-inverter`}>
        <polygon
          points={
            `${inverterX},${inverterY - INVERTER_HALF} ` +
            `${inverterX + INVERTER_HALF},${inverterY} ` +
            `${inverterX},${inverterY + INVERTER_HALF} ` +
            `${inverterX - INVERTER_HALF},${inverterY}`
          }
          fill={KIND_FILL_COLOR[kind]}
          fillOpacity={missingPcc ? 0.15 : 0.3}
          stroke={selected ? '#35C7FF' : COLOR_LINE_PRIMARY}
          strokeWidth={selected ? 2 : 1.5}
        />
        <text
          x={inverterX}
          y={inverterY + 4}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.bayLabel}
          fontWeight={700}
        >
          {KIND_LABEL_PL[kind]}
        </text>
        <text
          x={inverterX}
          y={inverterY + INVERTER_HALF + 14}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.technicalPanel}
        >
          {name}
        </text>
        {nominalPowerKw !== null && nominalPowerKw !== undefined && (
          <text
            x={inverterX}
            y={inverterY + INVERTER_HALF + 26}
            textAnchor="middle"
            fill={COLOR_TEXT_SECONDARY}
            fontFamily={FONT_MONO}
            fontSize={FONT_SIZES.numericValue}
          >
            {nominalPowerKw.toFixed(0)} kW
          </text>
        )}
      </g>

      {/* Variant label — pod całym drzewem. */}
      <text
        x={(anchor.x + inverterX) / 2}
        y={inverterY + INVERTER_HALF + 38}
        textAnchor="middle"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_MONO}
        fontSize={FONT_SIZES.numericValue}
        fontStyle="italic"
      >
        {VARIANT_LABEL_PL[variant]}
      </text>

      {/* Phase 0C: missing PCC blocker — czerwony X dominujący nad całym drzewem.
       * Acceptance Invariant 10: DER bez PCC = blocker, NIE normalny badge. */}
      {missingPcc && (
        <g data-testid={`sld-v2-der-tree-${id}-blocker`}>
          <circle
            cx={inverterX}
            cy={inverterY}
            r={INVERTER_HALF + 4}
            fill="none"
            stroke="#FF4040"
            strokeWidth={2}
            strokeDasharray="3 2"
          />
          <line
            x1={inverterX - 6}
            y1={inverterY - 6}
            x2={inverterX + 6}
            y2={inverterY + 6}
            stroke="#FF4040"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <line
            x1={inverterX - 6}
            y1={inverterY + 6}
            x2={inverterX + 6}
            y2={inverterY - 6}
            stroke="#FF4040"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <text
            x={inverterX}
            y={inverterY - INVERTER_HALF - 8}
            textAnchor="middle"
            fill="#FF4040"
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.numericValue}
            fontWeight={700}
          >
            BLOKADA PCC
          </text>
        </g>
      )}
    </g>
  );
}
