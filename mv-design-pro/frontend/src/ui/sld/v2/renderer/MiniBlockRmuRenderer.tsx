/**
 * SLD V2 — MiniBlockRmuRenderer (Phase 0A).
 *
 * Mini-blok stacji RMU/RM6 dla LOD 0-2. Komponuje się z faktycznych
 * pól (`bays[]`) — NIE jest dekoracyjnym szablonem. Zgodne z
 * Acceptance Invariant nr 11 (mini-RMU od LOD 0).
 *
 * Warianty:
 *   - `compact` (LOD 0-1): zwarta reprezentacja 100×56 px, jeden rząd pól.
 *   - `detail`  (LOD 2): rozszerzona 160×100 px, dwa rzędy (SN + nN), pola
 *     z markerem aparatu głównego.
 *
 * LOD ≥ 3: nie używaj tego rendererera — `StationOnRunRenderer` deleguje
 * do `StationInternalView` (drill-down).
 *
 * @see SLD_STATION_MINI_BLOCK_SPEC.md
 */

import {
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_SELECTION,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_SANS,
  FONT_SIZES,
  STROKE_BUSBAR_PX,
} from '../theme/tokens';
import { FIELD_ROLE, type FieldRole } from '../domain/apparatusContracts';
import {
  MINI_BLOCK_FOOTPRINT,
  type StationFootprintType,
} from './MiniBlockFootprints';

// =============================================================================
// Constants (deterministyczna geometria)
// =============================================================================

const COMPACT_WIDTH = 100;
const COMPACT_HEIGHT = 56;
const DETAIL_WIDTH = 160;
const DETAIL_HEIGHT = 100;
const BAY_MARKER_WIDTH = 14;
const BAY_MARKER_HEIGHT = 18;
const BAY_MARKER_GAP = 4;
const SECTION_BAR_HEIGHT = 4;

const COLOR_TR_TRIANGLE = '#A5C8FF';
const COLOR_DER_PV = '#FFC857';
const COLOR_DER_BESS = '#5BB8FF';
const COLOR_DER_FW = '#5BFFD9';
const COLOR_MISSING = '#FFC857';
// Wykorzystujemy token motywu (`COLOR_SELECTION`) zamiast hardkoda.
const COLOR_BLOCKER = '#FF5560';

// =============================================================================
// Public types
// =============================================================================

/**
 * Pojedynczy bay deskryptor dla mini-bloku — dane wystarczające do
 * zaznaczenia obecności pola w odpowiednim rzędzie / kolumnie.
 *
 * Reguła traceability: każdy bay ma `bayRef` (ENM domain ref).
 */
export interface MiniBlockBayDescriptor {
  readonly bayRef: string;
  readonly fieldRole: FieldRole;
  readonly designation: string;
  /** Czy w polu brakuje wymaganego aparatu (blocker badge). */
  readonly hasMissingRequiredDevice: boolean;
}

export interface MiniBlockDerBadge {
  readonly kind: 'PV' | 'BESS' | 'FW';
  /** Liczba jednostek tego typu w stacji (UI badge). */
  readonly count: number;
}

export interface MiniBlockRmuRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Wariant — domyślnie wybiera `StationOnRunRenderer` na podstawie LOD. */
  readonly variant: 'compact' | 'detail';
  readonly footprintType: StationFootprintType;
  readonly name: string;
  /** Faktyczne pola SN tej stacji (z ENM). Pusta tablica → blocker badge. */
  readonly snBays: readonly MiniBlockBayDescriptor[];
  readonly hasTransformer: boolean;
  /** Suma mocy znamionowej transformatorów (kVA). null → not applicable. */
  readonly transformerRatedKva: number | null;
  /** Łączna moc znamionowa nN przyłączy / liczba odpływów (badge). */
  readonly nnFeedersCount: number;
  /** DER badges (typ + liczba). */
  readonly derBadges: readonly MiniBlockDerBadge[];
  /** Czy w stacji są braki danych (badge missing-data). */
  readonly missingData: boolean;
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
  readonly onDoubleClick?: (id: string) => void;
}

// =============================================================================
// Renderer
// =============================================================================

export function MiniBlockRmuRenderer(props: MiniBlockRmuRendererProps): JSX.Element {
  const { variant } = props;
  const width = variant === 'compact' ? COMPACT_WIDTH : DETAIL_WIDTH;
  const height = variant === 'compact' ? COMPACT_HEIGHT : DETAIL_HEIGHT;
  const offsetX = -width / 2;
  const offsetY = -height / 2;

  const showLvRow = variant === 'detail' && MINI_BLOCK_FOOTPRINT[props.footprintType].hasLvSection;
  const isBlocker = props.snBays.length === 0;
  const stroke = props.selected ? COLOR_SELECTION : isBlocker ? COLOR_BLOCKER : COLOR_LINE_PRIMARY;
  const strokeWidth = props.selected ? 2.5 : 1.5;

  return (
    <g
      data-testid={`sld-v2-mini-rmu-${props.id}`}
      data-element-kind={variant === 'compact' ? 'mini_block_compact' : 'mini_block_detail'}
      data-element-id={props.id}
      data-footprint-type={props.footprintType}
      data-bay-count={String(props.snBays.length)}
      transform={`translate(${props.x}, ${props.y})`}
      onClick={
        props.onClick
          ? (e) => {
              e.stopPropagation();
              props.onClick?.(props.id);
            }
          : undefined
      }
      onDoubleClick={
        props.onDoubleClick
          ? (e) => {
              e.stopPropagation();
              props.onDoubleClick?.(props.id);
            }
          : undefined
      }
      style={{ cursor: props.onClick ? 'pointer' : 'default' }}
    >
      {/* Korpus bloku */}
      <rect
        x={offsetX}
        y={offsetY}
        width={width}
        height={height}
        fill={COLOR_PANEL_RAISED}
        stroke={stroke}
        strokeWidth={strokeWidth}
        rx={3}
        ry={3}
      />

      {/* Nazwa stacji (góra) */}
      <text
        x={0}
        y={offsetY + 12}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={600}
      >
        {props.name}
      </text>

      {/* Krótki kod typu stacji (pod nazwą) */}
      <text
        x={0}
        y={offsetY + 12 + FONT_SIZES.bayLabel + 1}
        textAnchor="middle"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
      >
        {MINI_BLOCK_FOOTPRINT[props.footprintType].shortCodePl}
      </text>

      {/* Szyna SN (pozioma kreska) i markery pól */}
      {!isBlocker && (
        <SnBusRow
          offsetX={offsetX}
          width={width}
          rowY={variant === 'compact' ? 4 : -8}
          bays={props.snBays}
        />
      )}

      {/* Drugi rząd nN (LOD 2 detail tylko) */}
      {showLvRow && (
        <LvSectionRow
          offsetX={offsetX}
          width={width}
          rowY={20}
          feedersCount={props.nnFeedersCount}
          hasTransformer={props.hasTransformer}
        />
      )}

      {/* Symbol transformatora (mały trójkąt na środku detailu) */}
      {variant === 'detail' && props.hasTransformer && (
        <TransformerTriangle
          cx={0}
          cy={6}
          ratedKva={props.transformerRatedKva}
        />
      )}

      {/* Blocker badge dla pustego mini-bloku (brak bays). */}
      {isBlocker && (
        <g data-testid={`sld-v2-mini-rmu-blocker-${props.id}`}>
          <rect
            x={-44}
            y={-2}
            width={88}
            height={20}
            fill={COLOR_BLOCKER}
            opacity={0.18}
            rx={2}
            ry={2}
          />
          <text
            x={0}
            y={12}
            textAnchor="middle"
            fill={COLOR_BLOCKER}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel}
            fontWeight={600}
          >
            Brak pól SN — uzupełnij konfigurację
          </text>
        </g>
      )}

      {/* DER badges (rząd ikon kolorowych) */}
      {props.derBadges.length > 0 && (
        <DerBadges
          offsetX={offsetX}
          offsetY={offsetY}
          height={height}
          badges={props.derBadges}
        />
      )}

      {/* Missing-data marker (prawy górny róg) */}
      {props.missingData && (
        <circle
          cx={offsetX + width - 7}
          cy={offsetY + 7}
          r={5}
          fill={COLOR_MISSING}
          stroke="#FFB020"
          strokeWidth={1}
        >
          <title>Brakuje danych do obliczeń</title>
        </circle>
      )}
    </g>
  );
}

// =============================================================================
// Sub-renderers
// =============================================================================

interface SnBusRowProps {
  offsetX: number;
  width: number;
  rowY: number;
  bays: readonly MiniBlockBayDescriptor[];
}

function SnBusRow(props: SnBusRowProps): JSX.Element {
  const { offsetX, width, rowY, bays } = props;
  const totalBaysWidth = bays.length * BAY_MARKER_WIDTH + (bays.length - 1) * BAY_MARKER_GAP;
  const startX = -totalBaysWidth / 2;

  return (
    <g data-testid="sld-v2-mini-rmu-sn-row">
      {/* Pozioma szyna SN */}
      <line
        x1={offsetX + 6}
        y1={rowY}
        x2={offsetX + width - 6}
        y2={rowY}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={STROKE_BUSBAR_PX}
      />
      {/* Markery pól */}
      {bays.map((bay, idx) => (
        <BayMarker
          key={bay.bayRef}
          x={startX + idx * (BAY_MARKER_WIDTH + BAY_MARKER_GAP)}
          y={rowY}
          fieldRole={bay.fieldRole}
          hasMissing={bay.hasMissingRequiredDevice}
          designation={bay.designation}
        />
      ))}
    </g>
  );
}

interface BayMarkerProps {
  x: number;
  y: number;
  fieldRole: FieldRole;
  hasMissing: boolean;
  designation: string;
}

function BayMarker(props: BayMarkerProps): JSX.Element {
  const { x, y, fieldRole, hasMissing, designation } = props;
  const isTransformer =
    fieldRole === FIELD_ROLE.TRANSFORMER || fieldRole === FIELD_ROLE.RMU_TRANSFORMER;
  const isCoupler = fieldRole === FIELD_ROLE.COUPLER;

  const fillColor = hasMissing
    ? COLOR_MISSING
    : isTransformer
      ? COLOR_TR_TRIANGLE
      : isCoupler
        ? '#9aa6b8'
        : COLOR_PANEL_RAISED;
  const strokeColor = hasMissing ? '#FFB020' : COLOR_LINE_PRIMARY;

  return (
    <g data-testid={`sld-v2-mini-rmu-bay-marker-${fieldRole}`}>
      <line x1={x + BAY_MARKER_WIDTH / 2} y1={y} x2={x + BAY_MARKER_WIDTH / 2} y2={y + 4} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
      <rect
        x={x}
        y={y + 4}
        width={BAY_MARKER_WIDTH}
        height={BAY_MARKER_HEIGHT - 4}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1}
        rx={1}
        ry={1}
      >
        <title>{`${designation} (${fieldRole})`}</title>
      </rect>
    </g>
  );
}

interface LvSectionRowProps {
  offsetX: number;
  width: number;
  rowY: number;
  feedersCount: number;
  hasTransformer: boolean;
}

function LvSectionRow(props: LvSectionRowProps): JSX.Element {
  const { offsetX, width, rowY, feedersCount, hasTransformer } = props;
  return (
    <g data-testid="sld-v2-mini-rmu-lv-row">
      {/* Pozioma szyna nN */}
      <rect
        x={offsetX + 8}
        y={rowY}
        width={width - 16}
        height={SECTION_BAR_HEIGHT}
        fill={COLOR_LINE_PRIMARY}
        opacity={hasTransformer ? 0.85 : 0.35}
      />
      <text
        x={offsetX + width - 14}
        y={rowY + 14}
        textAnchor="end"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
      >
        {feedersCount > 0 ? `${feedersCount}× nN` : 'nN'}
      </text>
    </g>
  );
}

interface TransformerTriangleProps {
  cx: number;
  cy: number;
  ratedKva: number | null;
}

function TransformerTriangle(props: TransformerTriangleProps): JSX.Element {
  const { cx, cy, ratedKva } = props;
  const size = 8;
  return (
    <g data-testid="sld-v2-mini-rmu-tr-triangle">
      <polygon
        points={`${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`}
        fill={COLOR_TR_TRIANGLE}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1}
      />
      {ratedKva !== null && (
        <text
          x={cx}
          y={cy + 3}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.technicalPanel - 1}
          fontWeight={600}
        >
          {ratedKva}
        </text>
      )}
    </g>
  );
}

interface DerBadgesProps {
  offsetX: number;
  offsetY: number;
  height: number;
  badges: readonly MiniBlockDerBadge[];
}

function DerBadges(props: DerBadgesProps): JSX.Element {
  const { offsetX, offsetY, height, badges } = props;
  return (
    <g data-testid="sld-v2-mini-rmu-der-badges">
      {badges.map((badge, idx) => {
        const cx = offsetX + 8 + idx * 16;
        const cy = offsetY + height - 8;
        const fill =
          badge.kind === 'PV' ? COLOR_DER_PV : badge.kind === 'BESS' ? COLOR_DER_BESS : COLOR_DER_FW;
        return (
          <g
            key={`${badge.kind}-${idx}`}
            data-testid={`sld-v2-mini-rmu-der-badge-${badge.kind}`}
          >
            <circle cx={cx} cy={cy} r={5} fill={fill} stroke={COLOR_LINE_PRIMARY} strokeWidth={0.8}>
              <title>{`${badge.kind}: ${badge.count} szt.`}</title>
            </circle>
            <text
              x={cx}
              y={cy + 2}
              textAnchor="middle"
              fill={COLOR_TEXT_PRIMARY}
              fontFamily={FONT_SANS}
              fontSize={FONT_SIZES.technicalPanel - 2}
              fontWeight={700}
            >
              {badge.count > 1 ? badge.count : ''}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// =============================================================================
// Helper: viewBox dla testów structural invariant
// =============================================================================

export function miniBlockViewBox(
  variant: 'compact' | 'detail',
): { width: number; height: number } {
  return variant === 'compact'
    ? { width: COMPACT_WIDTH, height: COMPACT_HEIGHT }
    : { width: DETAIL_WIDTH, height: DETAIL_HEIGHT };
}
