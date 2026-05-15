/**
 * StationOnRunRenderer - stacja na ciagu SN.
 *
 * Widok sieciowy nie jest kaflem. Stacja jest rysowana jako element
 * dyspozytorskiego SLD: zielona szyna SN, romby pol liniowych, tory do
 * ciagu oraz etykiety pod szyna zgodnie z referencjami OSD.
 */

import {
  COLOR_DEVICE_OPEN,
  COLOR_FIELD_TRUNK_ENERGIZED,
  COLOR_SELECTION,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_WARN,
  FONT_SANS,
  FONT_SIZES,
} from '../theme/tokens';
import type { LodLevel } from '../lod/LodPolicy';
import {
  MiniBlockRmuRenderer,
  type MiniBlockBayDescriptor,
  type MiniBlockDerBadge,
} from './MiniBlockRmuRenderer';
import type { StationFootprintType } from './MiniBlockFootprints';

// K30-4: enlarged for industrial readability (24+ px symbols @ LOD-2).
// Previously: 176/124/120/30/48 (mikroskopijny w widoku K30 30-station chain).
const STATION_SYMBOL_WIDTH = 280;
const STATION_SYMBOL_HEIGHT = 200;
const STATION_BUS_WIDTH = 200;
const STATION_BUS_Y = 0;
export const STATION_RUN_TRUNK_OFFSET_Y = 80;
const TRUNK_Y = -STATION_RUN_TRUNK_OFFSET_Y;
const LABEL_Y = 36;
const CODE_Y = 58;

export interface StationOnRunRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly topologicalType: 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';
  readonly nnVoltageLevelsCount?: number;
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
  readonly onDoubleClick?: (id: string) => void;
  readonly missingData?: boolean;
  readonly lod?: LodLevel;
  readonly footprintType?: StationFootprintType;
  readonly snBays?: readonly MiniBlockBayDescriptor[];
  readonly hasTransformer?: boolean;
  readonly transformerRefs?: readonly string[];
  readonly transformerRatedKva?: number | null;
  readonly nnFeedersCount?: number;
  readonly derBadges?: readonly MiniBlockDerBadge[];
  /** Stacja jest punktem NMO (Normalnie Otwartym) — renderuje badge "NOP"
   *  sygnalizujący granicę zasilania dwóch połówek ciągu (IEC 60617 ring). */
  readonly isNop?: boolean;
  /** Skumulowana odległość od GPZ [km] — pomaga Projektantowi ocenić geograficzne
   *  rozmieszczenie stacji na ciągu (np. "1.5 km"). */
  readonly distanceFromGpzKm?: number | null;
  /** Krótki kod stacji (S01, S15, S29...) wyświetlany jako prominent badge.
   *  K30-4: zastępuje regex extraction z name (backend gubi name_pl). */
  readonly stationCode?: string | null;
  /** K30-7: switching state per connection column (CB position).
   *  Indeks per connectionColumns(): 0 = WE, 1 = WY, 2 = ODG (per topologicalType).
   *  - 'closed' (default): polygon filled green = pole pod napięciem
   *  - 'open': polygon stroke-only = wyłączone, brak napięcia
   *  - 'unknown': polygon filled grey z '?' overlay = brak telemetrii
   *  Domyślnie wszystko 'closed' (back-compat z testami).
   */
  readonly switchStateByColumn?: ReadonlyArray<'closed' | 'open' | 'unknown'>;
  /** K30-8: alarm summary indicator — gdy stacja ma WARNING/IMPORTANT/CRITICAL
   *  z overlay (np. SC_3F Ik" > threshold), pokazuj alarm icon przy code badge.
   *  Wartość: 'critical' (red triangle), 'important' (orange), 'warning' (amber).
   *  null/undefined = brak alarmu (no overlay icon).
   */
  readonly alarmSeverity?: 'warning' | 'important' | 'critical' | null;
  /** K30-15.3: peak load attached to station's LV side [kW].
   *  Wartość >0 → 'L' badge widoczny pod transformer pokazujący poziom odbioru
   *  (Eksploatacyjny diff vs station bez load = ZKSN-only). */
  readonly totalLoadKw?: number | null;
  /** K30-15.3: total generation capacity attached [kW]. */
  readonly totalGenerationKw?: number | null;
  /** K30-36: krótkie etykiety roli pola per kolumna połączenia (WE/WY/TR/ODG/SPR/POM).
   *  Index = pozycja w `connectionColumns(topologicalType)`. Wartości:
   *   - 'WE' (wejściowe — Line IN od strony GPZ)
   *   - 'WY' (wyjściowe — Line OUT do następnej stacji)
   *   - 'TR' (transformator)
   *   - 'ODG' (odgałęzienie do branch run)
   *   - 'SPR' (sprzęgło sekcyjne)
   *   - 'POM' (pomiar VT/CT)
   *  Brak → renderer wyprowadza domyślną etykietę z `topologicalType`. */
  readonly bayRoleByColumn?: ReadonlyArray<'WE' | 'WY' | 'TR' | 'ODG' | 'SPR' | 'POM'>;
  /** K30-37: napięcie szyny stacji [kV]. Renderer dobiera tint koloru szyny
   *  zgodnie z konwencją dyspozytorską (110kV → czerwień WN, 15kV → zieleń SN,
   *  0.4kV → błękit nN). Brak → fallback do COLOR_FIELD_TRUNK_ENERGIZED. */
  readonly busVoltageKv?: number | null;
}

const TYPE_TO_LABEL_PL: Record<StationOnRunRendererProps['topologicalType'], string> = {
  końcowa: 'końcowa',
  przelotowa: 'przelotowa',
  odgałęźna: 'odgałęźna',
  sekcyjna: 'sekcyjna',
};

const TOPOLOGY_TO_FOOTPRINT: Record<
  StationOnRunRendererProps['topologicalType'],
  StationFootprintType
> = {
  końcowa: 'mv_lv_terminal',
  przelotowa: 'mv_lv_inline',
  odgałęźna: 'mv_lv_branch',
  sekcyjna: 'mv_lv_sectional',
};

function shouldDelegateToMiniBlock(props: StationOnRunRendererProps): boolean {
  if (props.lod === undefined) return false;
  if (props.lod >= 3) return false;
  return props.snBays !== undefined;
}

export function StationOnRunRenderer(props: StationOnRunRendererProps): JSX.Element {
  if (shouldDelegateToMiniBlock(props)) {
    const variant = miniBlockVariantForLod(props.lod ?? 0);
    const footprintType = props.footprintType ?? TOPOLOGY_TO_FOOTPRINT[props.topologicalType];
    return (
      <MiniBlockRmuRenderer
        id={props.id}
        x={props.x}
        y={props.y}
        variant={variant}
        footprintType={footprintType}
        name={props.name}
        stationCode={props.stationCode ?? null}
        alarmSeverity={props.alarmSeverity ?? null}
        totalLoadKw={props.totalLoadKw ?? null}
        totalGenerationKw={props.totalGenerationKw ?? null}
        snBays={props.snBays ?? []}
        hasTransformer={props.hasTransformer ?? true}
        transformerRatedKva={props.transformerRatedKva ?? null}
        nnFeedersCount={props.nnFeedersCount ?? props.nnVoltageLevelsCount ?? 0}
        derBadges={props.derBadges ?? []}
        missingData={props.missingData ?? false}
        selected={props.selected}
        onClick={props.onClick}
        onDoubleClick={props.onDoubleClick}
        busVoltageKv={props.busVoltageKv ?? null}
      />
    );
  }

  return <DispatcherStationSymbol {...props} />;
}

function miniBlockVariantForLod(lod: LodLevel): 'overview' | 'compact' | 'detail' {
  if (lod <= 0) return 'overview';
  if (lod === 1) return 'compact';
  return 'detail';
}

function DispatcherStationSymbol(props: StationOnRunRendererProps): JSX.Element {
  const {
    id, x, y, name, topologicalType, nnVoltageLevelsCount,
    selected, onClick, onDoubleClick, missingData, isNop, distanceFromGpzKm,
    transformerRatedKva, stationCode, switchStateByColumn, alarmSeverity,
    nnFeedersCount, bayRoleByColumn, busVoltageKv,
  } = props;
  // K30-37: tint szyny stacji per voltage class (SCADA dispatcher konwencja).
  const busColor = busColorForVoltage(busVoltageKv ?? null);
  // K30-29: per-feeder visualization w dispatcher (LOD3+). User K30-25 demand:
  // 'wszystko konfigurowalne' — liczba odpływów nN musi być widoczna pixel-precise
  // (1/2/3/4/N), nie tylko jako label tekstowy.
  const effectiveFeeders = nnFeedersCount ?? nnVoltageLevelsCount ?? 0;
  const connectionXs = connectionColumns(topologicalType);
  const voltageLabel = nnVoltageLevelsCount && nnVoltageLevelsCount > 1
    ? `${nnVoltageLevelsCount}× nN`
    : 'SN/nN';
  // Z mocą znamionową transformatora przesuwamy NOP/distance niżej (extraSlotY).
  const extraSlotY = transformerRatedKva != null ? 14 : 0;

  return (
    <g
      data-testid={`sld-v2-station-${id}`}
      data-element-kind="station_block"
      data-element-id={id}
      data-topological-type={topologicalType}
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? (event) => { event.stopPropagation(); onClick(id); } : undefined}
      onDoubleClick={onDoubleClick ? (event) => { event.stopPropagation(); onDoubleClick(id); } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <rect
        x={-STATION_SYMBOL_WIDTH / 2}
        y={-STATION_SYMBOL_HEIGHT / 2}
        width={STATION_SYMBOL_WIDTH}
        height={STATION_SYMBOL_HEIGHT}
        fill="transparent"
        stroke={selected ? COLOR_SELECTION : 'transparent'}
        strokeWidth={selected ? 1.5 : 0}
        strokeDasharray={selected ? '5 4' : undefined}
        rx={4}
        ry={4}
        data-testid={`sld-v2-station-hitarea-${id}`}
      />

      <line
        x1={-STATION_BUS_WIDTH / 2}
        y1={STATION_BUS_Y}
        x2={STATION_BUS_WIDTH / 2}
        y2={STATION_BUS_Y}
        stroke={busColor}
        strokeWidth={4}
        strokeLinecap="butt"
        data-testid={`sld-v2-station-bus-${id}`}
        data-bus-voltage-kv={busVoltageKv ?? ''}
      />
      {/* IEC 60617: terminatory szyny SN — krótkie kreski prostopadłe na końcach
          szyny, sygnalizujące fizyczne zakończenie szyny (a nie kontynuację). */}
      <line
        x1={-STATION_BUS_WIDTH / 2}
        y1={STATION_BUS_Y - 5}
        x2={-STATION_BUS_WIDTH / 2}
        y2={STATION_BUS_Y + 5}
        stroke={busColor}
        strokeWidth={2}
        strokeLinecap="round"
        data-testid={`sld-v2-station-bus-end-left-${id}`}
      />
      <line
        x1={STATION_BUS_WIDTH / 2}
        y1={STATION_BUS_Y - 5}
        x2={STATION_BUS_WIDTH / 2}
        y2={STATION_BUS_Y + 5}
        stroke={busColor}
        strokeWidth={2}
        strokeLinecap="round"
        data-testid={`sld-v2-station-bus-end-right-${id}`}
      />

      {connectionXs.map((cx, index) => {
        // K30-7: per-column switching state (CB open/closed/unknown)
        const swState = switchStateByColumn?.[index] ?? 'closed';
        const swFill = swState === 'closed' ? '#0A8D43' : swState === 'unknown' ? '#5A6878' : 'none';
        const swStroke = swState === 'open' ? COLOR_DEVICE_OPEN : COLOR_FIELD_TRUNK_ENERGIZED;
        const connectorStroke = swState === 'closed' ? COLOR_FIELD_TRUNK_ENERGIZED : COLOR_DEVICE_OPEN;
        const connectorDash = swState === 'open' ? '4 3' : undefined;
        // K30-36: bay-role label below switch diamond — pomaga operatorowi
        // odróżnić WE/WY/TR/ODG przy zoom-out (LOD3+).
        const bayRoleLabel = bayRoleByColumn?.[index]
          ?? defaultBayRoleForColumn(topologicalType, index, connectionXs.length);
        return (
        <g key={`${id}-connector-${index}`} data-testid={`sld-v2-station-connector-${id}-${index}`} data-switch-state={swState} data-bay-role={bayRoleLabel ?? ''}>
          <line
            x1={cx}
            y1={TRUNK_Y}
            x2={cx}
            y2={STATION_BUS_Y}
            stroke={connectorStroke}
            strokeWidth={2.5}
            strokeDasharray={connectorDash}
          />
          <polygon
            points={`${cx},${STATION_BUS_Y - 34} ${cx + 11},${STATION_BUS_Y - 23} ${cx},${STATION_BUS_Y - 12} ${cx - 11},${STATION_BUS_Y - 23}`}
            fill={swFill}
            stroke={swStroke}
            strokeWidth={swState === 'open' ? 2 : 1.3}
            data-testid={`sld-v2-station-diamond-${id}-${index}`}
            data-apparatus-kind="switch_disconnector"
            data-symbol-canon="switch_disconnector_rotated_square"
          />
          {swState === 'unknown' && (
            <text
              x={cx}
              y={STATION_BUS_Y - 19}
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily={FONT_SANS}
              fontSize={10}
              fontWeight={900}
            >?</text>
          )}
          <g
            data-apparatus-kind="earthing_switch"
            data-symbol-canon="earthing_switch_lateral_branch"
          >
            <line x1={cx + 13} y1={STATION_BUS_Y - 23} x2={cx + 25} y2={STATION_BUS_Y - 23} stroke={COLOR_TEXT_SECONDARY} strokeWidth={1.2} />
            <line x1={cx + 25} y1={STATION_BUS_Y - 23} x2={cx + 25} y2={STATION_BUS_Y - 11} stroke={COLOR_TEXT_SECONDARY} strokeWidth={1.2} strokeDasharray="2 2" />
            <line x1={cx + 20} y1={STATION_BUS_Y - 11} x2={cx + 30} y2={STATION_BUS_Y - 11} stroke={COLOR_TEXT_SECONDARY} strokeWidth={1.2} />
            <line x1={cx + 22} y1={STATION_BUS_Y - 8} x2={cx + 28} y2={STATION_BUS_Y - 8} stroke={COLOR_TEXT_SECONDARY} strokeWidth={1} />
            <line x1={cx + 24} y1={STATION_BUS_Y - 5} x2={cx + 26} y2={STATION_BUS_Y - 5} stroke={COLOR_TEXT_SECONDARY} strokeWidth={0.9} />
          </g>
          {topologicalType === 'sekcyjna' && index === 0 && (
            <line
              x1={cx - 16}
              y1={STATION_BUS_Y - 23}
              x2={cx + 16}
              y2={STATION_BUS_Y - 23}
              stroke={COLOR_DEVICE_OPEN}
              strokeWidth={2}
              transform={`rotate(-90 ${cx} ${STATION_BUS_Y - 23})`}
              data-testid={`sld-v2-station-open-marker-${id}`}
            />
          )}
          {/* K30-36: bay-role label nad polygon diamond — operator widzi
              od razu które pole to WE/WY/TR przy zoom-out (LOD3+). */}
          {bayRoleLabel && (
            <text
              x={cx}
              y={STATION_BUS_Y - 40}
              textAnchor="middle"
              fill={COLOR_TEXT_SECONDARY}
              fontFamily={FONT_SANS}
              fontSize={9}
              fontWeight={800}
              letterSpacing={0.4}
              paintOrder="stroke"
              stroke="#05070A"
              strokeWidth={2.5}
              data-testid={`sld-v2-station-bay-role-${id}-${index}`}
              opacity={0.92}
            >
              {bayRoleLabel}
            </text>
          )}
        </g>
        );
      })}

      {topologicalType === 'odgałęźna' && (
        <g data-testid={`sld-v2-station-branch-drop-${id}`}>
          <line x1={0} y1={STATION_BUS_Y} x2={0} y2={STATION_BUS_Y + 20} stroke={busColor} strokeWidth={2.5} />
          <line x1={-10} y1={STATION_BUS_Y + 14} x2={10} y2={STATION_BUS_Y + 14} stroke={COLOR_DEVICE_OPEN} strokeWidth={2} />
        </g>
      )}

      {missingData && (
        <g data-testid={`sld-v2-station-missing-${id}`} transform={`translate(${STATION_BUS_WIDTH / 2 + 14}, ${STATION_BUS_Y - 36})`}>
          <circle r={6} fill={COLOR_WARN} stroke="#FFB020" strokeWidth={1}>
            <title>Brakuje danych do obliczeń</title>
          </circle>
          <text x={0} y={4} textAnchor="middle" fill="#0B0E11" fontFamily={FONT_SANS} fontSize={10} fontWeight={800}>!</text>
        </g>
      )}

      {/* K30-4: prominent station code badge. Najpierw używa props.stationCode
       *  (z adaptera — adresuje backend gubi name_pl), fallback z regex z name. */}
      {(() => {
        const code = stationCode
          ?? (name.match(/\b(S\d{2,3})\b/)?.[1] ?? null);
        return code ? (
          <g data-testid={`sld-v2-station-code-${id}`} transform={`translate(0, ${LABEL_Y - 4})`}>
            <rect x={-32} y={-18} width={64} height={26} rx={3} ry={3} fill="#0A1018" stroke="#7EC8FF" strokeWidth={1.4} opacity={0.95} />
            <text x={0} y={2} textAnchor="middle" fill="#7EC8FF" fontFamily={FONT_SANS} fontSize={20} fontWeight={900} letterSpacing={1}>
              {code}
            </text>
          </g>
        ) : null;
      })()}

      {/* K30-8: alarm summary triangle obok code badge gdy stacja ma WARNING/IMPORTANT/CRITICAL */}
      {alarmSeverity && (() => {
        const color = alarmSeverity === 'critical' ? '#FF6B6B' : alarmSeverity === 'important' ? '#FF8B5C' : '#FFD166';
        const symbol = alarmSeverity === 'critical' ? '!' : alarmSeverity === 'important' ? '!' : '⚠';
        return (
          <g data-testid={`sld-v2-station-alarm-${id}`} data-alarm-severity={alarmSeverity} transform={`translate(36, ${LABEL_Y - 5})`}>
            <polygon points={`0,-14 12,7 -12,7`} fill={color} stroke="#0A0E14" strokeWidth={1.2} />
            <text x={0} y={4} textAnchor="middle" fill="#0A0E14" fontFamily={FONT_SANS} fontSize={13} fontWeight={900}>
              {symbol}
            </text>
          </g>
        );
      })()}
      <text
        x={0}
        y={LABEL_Y + 26}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={800}
        paintOrder="stroke"
        stroke="#05070A"
        strokeWidth={3}
      >
        {name.length > 24 ? name.slice(0, 22) + '…' : name}
      </text>
      <text
        x={0}
        y={CODE_Y + 28}
        textAnchor="middle"
        fill={selected ? COLOR_SELECTION : '#7EC8FF'}
        fontFamily={FONT_SANS}
        fontSize={14}
        fontWeight={700}
        paintOrder="stroke"
        stroke="#05070A"
        strokeWidth={3}
      >
        {TYPE_TO_LABEL_PL[topologicalType]}
      </text>
      <text
        x={0}
        y={CODE_Y + 48}
        textAnchor="middle"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
        fontWeight={700}
        paintOrder="stroke"
        stroke="#05070A"
        strokeWidth={2}
      >
        {voltageLabel}
      </text>

      {/* K30-29: per-feeder visualization — N short droplines + CB symbol */}
      {effectiveFeeders > 0 && (
        <g
          data-testid={`sld-v2-station-feeders-viz-${id}`}
          data-feeders-count={effectiveFeeders}
          transform={`translate(0, ${CODE_Y + 44})`}
        >
          {/* LV bus bar */}
          <rect x={-30} y={0} width={60} height={2.5} fill="#4EC9B0" opacity={0.9} />
          {/* Per-feeder dropline + CB rectangle */}
          {Array.from({ length: effectiveFeeders }).map((_, idx) => {
            const margin = effectiveFeeders === 1 ? 0 : 22;
            const span = effectiveFeeders === 1 ? 0 : 44;
            const step = effectiveFeeders === 1 ? 0 : span / (effectiveFeeders - 1);
            const fx = effectiveFeeders === 1 ? 0 : -margin + step * idx;
            return (
              <g key={`fd-${idx}`} data-testid={`sld-v2-station-feeder-${id}-${idx}`}>
                <line
                  x1={fx}
                  y1={2.5}
                  x2={fx}
                  y2={10}
                  stroke="#4EC9B0"
                  strokeWidth={1.4}
                />
                <rect
                  x={fx - 3}
                  y={10}
                  width={6}
                  height={6}
                  fill="#0D2818"
                  stroke="#4EC9B0"
                  strokeWidth={0.8}
                />
              </g>
            );
          })}
        </g>
      )}

      {transformerRatedKva != null && (
        <text
          data-testid={`sld-v2-station-rated-kva-${id}`}
          x={0}
          y={CODE_Y + 66}
          textAnchor="middle"
          fill="#FFD166"
          fontFamily={FONT_SANS}
          fontSize={14}
          fontWeight={800}
          paintOrder="stroke"
          stroke="#05070A"
          strokeWidth={2}
          opacity={0.95}
        >
          {transformerRatedKva >= 1000
            ? `${(transformerRatedKva / 1000).toFixed(1)} MVA`
            : `${transformerRatedKva} kVA`}
        </text>
      )}

      {isNop && (
        <g
          data-testid={`sld-v2-station-nop-badge-${id}`}
          transform={`translate(0, ${CODE_Y + 70 + extraSlotY})`}
        >
          <rect x={-24} y={-12} width={48} height={20} rx={3} ry={3} fill="#C00000" opacity={0.95} />
          <text x={0} y={4} textAnchor="middle" fill="#FFFFFF" fontFamily={FONT_SANS} fontSize={13} fontWeight={800} letterSpacing={1}>
            NOP
          </text>
        </g>
      )}

      {distanceFromGpzKm != null && (
        <text
          data-testid={`sld-v2-station-distance-${id}`}
          x={0}
          y={CODE_Y + (isNop ? 96 : 70) + extraSlotY}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.technicalPanel}
          fontWeight={600}
          opacity={0.75}
          paintOrder="stroke"
          stroke="#05070A"
          strokeWidth={2}
        >
          {distanceFromGpzKm < 1
            ? `${Math.round(distanceFromGpzKm * 1000)} m`
            : `${distanceFromGpzKm.toFixed(1)} km`}
        </text>
      )}
    </g>
  );
}

function connectionColumns(topologicalType: StationOnRunRendererProps['topologicalType']): readonly number[] {
  switch (topologicalType) {
    case 'końcowa':
      return [0];
    case 'przelotowa':
      return [-28, 28];
    case 'odgałęźna':
      return [-36, 0, 36];
    case 'sekcyjna':
      return [-28, 28];
    default:
      return [0];
  }
}

/**
 * K30-37: kolor szyny stacji per voltage class, zgodnie z konwencją
 * dyspozytorską OSD (Energa / Tauron / PSE):
 * - 110 kV (WN): czerwień #E74C3C
 * - 15 / 20 / 30 kV (SN): zieleń energized #13C45A (kanon SCADA)
 * - 6 / 10 kV (SN niskie): głębsza zieleń #0A8D43
 * - 0.4 / 1 kV (nN): chłodny błękit #7DD3FC
 * - inne / brak: fallback do COLOR_FIELD_TRUNK_ENERGIZED.
 */
function busColorForVoltage(kv: number | null): string {
  if (kv == null || !Number.isFinite(kv) || kv <= 0) return COLOR_FIELD_TRUNK_ENERGIZED;
  if (kv >= 100) return '#E74C3C';     // 110 kV WN
  if (kv >= 12) return COLOR_FIELD_TRUNK_ENERGIZED; // 15-30 kV SN
  if (kv >= 5) return '#0A8D43';       // 6-10 kV SN niskie
  if (kv >= 0.2) return '#7DD3FC';     // 0.4 / 1 kV nN
  return COLOR_FIELD_TRUNK_ENERGIZED;
}

/**
 * K30-36: domyślna etykieta roli pola dla kolumny połączenia w widoku
 * dyspozytorskim (LOD3+) gdy `bayRoleByColumn` nie jest podane.
 * Wynika z `topologicalType` + pozycji indeksu.
 */
function defaultBayRoleForColumn(
  topologicalType: StationOnRunRendererProps['topologicalType'],
  index: number,
  totalColumns: number,
): 'WE' | 'WY' | 'TR' | 'ODG' | 'SPR' | 'POM' | null {
  switch (topologicalType) {
    case 'końcowa':
      return 'WE';
    case 'przelotowa':
      return index === 0 ? 'WE' : 'WY';
    case 'odgałęźna':
      // 3 kolumny: [-36, 0, 36] → [WE, TR, WY]; gdy łączy też odgałęzienie
      // do branch run, środkowa to ODG (decyzja adaptera via prop).
      if (totalColumns === 3) return index === 0 ? 'WE' : index === 1 ? 'TR' : 'WY';
      return index === 0 ? 'WE' : index === 1 ? 'WY' : 'ODG';
    case 'sekcyjna':
      return index === 0 ? 'SPR' : 'WE';
    default:
      return null;
  }
}
