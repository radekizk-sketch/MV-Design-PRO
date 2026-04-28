import React, { useMemo } from 'react';
import type { GpzFieldAnnotationV1, GpzSectionV1 } from './core/layoutResult';
import { FieldRoleV1, type FieldRoleV1 as FieldRoleName } from './core/fieldDeviceContracts';

const WIRE = '#F8FAFC';
const MUTED_WIRE = '#CBD5E1';
const BACKDROP = '#1F2933';
const BACKDROP_STROKE = '#334155';
const CLOSED_FILL = '#16A34A';
const OPEN_FILL = '#DC2626';
const PORT_STROKE = 'rgba(96, 165, 250, 0.24)';

const TILE_WIDTH = 44;
const TILE_HEIGHT = 34;
const CT_SYMBOL_HEIGHT = 26;
const TILE_GAP = 1;
const BAY_STACK_OFFSET = 34;
const BAY_BOTTOM_TAIL = 58;
const EARTH_BRANCH_OFFSET = 56;

export interface GpzFieldBlockRendererProps {
  field: GpzFieldAnnotationV1;
  color?: string;
  showTechnicalLabels?: boolean;
  bayNumber?: string;
  selected?: boolean;
  resultValues?: GpzFieldResultValues | null;
  onTrunkOutPortClick?: (field: GpzFieldAnnotationV1) => void;
  onTrunkOutPortHover?: (field: GpzFieldAnnotationV1 | null) => void;
}

export interface GpzSwitchgearRendererProps {
  sections: readonly GpzSectionV1[];
  fields: readonly GpzFieldAnnotationV1[];
  showTechnicalLabels?: boolean;
  selectedFieldId?: string | null;
  fieldResults?: ReadonlyMap<string, GpzFieldResultValues>;
  onFieldClick?: (field: GpzFieldAnnotationV1) => void;
  onFieldDoubleClick?: (field: GpzFieldAnnotationV1) => void;
  onTrunkOutPortClick?: (field: GpzFieldAnnotationV1) => void;
  onTrunkOutPortHover?: (field: GpzFieldAnnotationV1 | null) => void;
}

export interface GpzFieldResultValues {
  i1A?: number | null;
  i2A?: number | null;
  i3A?: number | null;
  pMW?: number | null;
  qMvar?: number | null;
  status?: 'aktualne' | 'brak' | 'nieaktualne';
}

type SwitchState = 'closed' | 'open';
type ApparatusKind = 'disconnector' | 'breaker' | 'earthing-switch';

interface BayFunctionDescriptor {
  role: FieldRoleName;
  title: string;
  subtitle: string;
  requiredPath: string;
  portLabel: string;
}

interface TileProps {
  x: number;
  y: number;
  label?: string;
  kind: ApparatusKind;
  state?: SwitchState;
  testId: string;
}

function apparatusFill(state: SwitchState): string {
  return state === 'closed' ? CLOSED_FILL : OPEN_FILL;
}

function DisconnectorGlyph() {
  return (
    <g stroke={WIRE} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <line x1={22} y1={4} x2={22} y2={10} />
      <line x1={22} y1={30} x2={22} y2={22} />
      <path d="M13 23 L22 9 L31 23" />
    </g>
  );
}

function BreakerGlyph() {
  return (
    <g stroke={WIRE} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <line x1={22} y1={3} x2={22} y2={9} />
      <line x1={22} y1={25} x2={22} y2={31} />
      <line x1={14} y1={25} x2={30} y2={9} />
      <line x1={16} y1={12} x2={28} y2={24} />
      <line x1={28} y1={12} x2={16} y2={24} />
    </g>
  );
}

function EarthingSwitchGlyph() {
  return (
    <g stroke={WIRE} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <line x1={22} y1={5} x2={22} y2={12} />
      <line x1={15} y1={28} x2={29} y2={10} />
    </g>
  );
}

function SwitchTile({ x, y, label, kind, state = 'closed', testId }: TileProps) {
  return (
    <g data-testid={testId} data-state={state} transform={`translate(${x}, ${y})`}>
      <rect
        x={0}
        y={0}
        width={TILE_WIDTH}
        height={TILE_HEIGHT}
        rx={5}
        ry={5}
        fill={apparatusFill(state)}
        stroke={state === 'closed' ? '#15803D' : '#991B1B'}
        strokeWidth={1.2}
      />
      {kind === 'breaker' && <BreakerGlyph />}
      {kind === 'disconnector' && <DisconnectorGlyph />}
      {kind === 'earthing-switch' && <EarthingSwitchGlyph />}
      {label && (
        <text
          x={TILE_WIDTH + 7}
          y={TILE_HEIGHT / 2 + 4}
          fill={WIRE}
          fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
          fontSize={16}
          fontWeight={700}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function resolveFieldRole(field: GpzFieldAnnotationV1): FieldRoleName {
  const detailField = field.detail?.fields.find((candidate) => candidate.id === field.fieldId);
  return detailField?.fieldRole ?? FieldRoleV1.GPZ_LINE_BAY;
}

function resolveBayFunction(role: FieldRoleName): BayFunctionDescriptor {
  switch (role) {
    case FieldRoleV1.TRANSFORMER_SN_NN:
      return {
        role,
        title: 'Pole transformatorowe SN',
        subtitle: 'transformatorowe',
        requiredPath: 'Q2 - Q1 - PP - pole transformatorowe',
        portLabel: 'port transformatorowy SN',
      };
    case FieldRoleV1.MEASUREMENT_SN:
      return {
        role,
        title: 'Pole pomiarowe SN',
        subtitle: 'pomiarowe',
        requiredPath: 'Q2 - PP/PN - układ pomiarowy',
        portLabel: 'port pomiarowy SN',
      };
    case FieldRoleV1.PV_SN:
      return {
        role,
        title: 'Pole źródła PV SN',
        subtitle: 'źródłowe PV',
        requiredPath: 'Q2 - Q1 - PP - pole źródłowe',
        portLabel: 'port źródła SN',
      };
    case FieldRoleV1.BESS_SN:
      return {
        role,
        title: 'Pole magazynu energii SN',
        subtitle: 'źródłowe BESS',
        requiredPath: 'Q2 - Q1 - PP - pole źródłowe',
        portLabel: 'port źródła SN',
      };
    case FieldRoleV1.FW_SN:
      return {
        role,
        title: 'Pole farmy wiatrowej SN',
        subtitle: 'źródłowe FW',
        requiredPath: 'Q2 - Q1 - PP - pole źródłowe',
        portLabel: 'port źródła SN',
      };
    case FieldRoleV1.LINE_IN:
      return {
        role,
        title: 'Pole liniowe wejściowe SN',
        subtitle: 'liniowe wejściowe',
        requiredPath: 'Q2 - Q1 - PP - tor liniowy',
        portLabel: 'port wejściowy SN',
      };
    case FieldRoleV1.LINE_BRANCH:
      return {
        role,
        title: 'Pole odgałęźne SN',
        subtitle: 'odgałęźne',
        requiredPath: 'Q2 - Q1 - PP - odgałęzienie SN',
        portLabel: 'port odgałęzienia SN',
      };
    case FieldRoleV1.LINE_OUT:
    case FieldRoleV1.GPZ_LINE_BAY:
    default:
      return {
        role: FieldRoleV1.GPZ_LINE_BAY,
        title: 'Pole liniowe SN',
        subtitle: 'liniowe odpływowe',
        requiredPath: 'Q2 - Q1 - PP - Q3',
        portLabel: 'BAY_SN_OUT',
      };
  }
}

function CurrentTransformerSymbol({
  x,
  y,
  fieldId,
}: {
  x: number;
  y: number;
  fieldId: string;
}) {
  const centerY = y + CT_SYMBOL_HEIGHT / 2;
  return (
    <g
      data-testid={`gpz-device-${fieldId}-PP`}
      data-apparatus-role="przekladnik-pradowy"
      stroke={WIRE}
      strokeWidth={2}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1={x} y1={y} x2={x} y2={y + CT_SYMBOL_HEIGHT} />
      <circle cx={x - 7} cy={centerY} r={7} />
      <circle cx={x + 7} cy={centerY} r={7} />
      <text
        x={x + 28}
        y={centerY + 4}
        fill={WIRE}
        stroke="none"
        fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
        fontSize={13}
        fontWeight={700}
      >
        PP
      </text>
    </g>
  );
}

function ProtectionRelayBadge({
  fieldId,
  x,
  y,
  targetX,
  targetY,
}: {
  fieldId: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}) {
  return (
    <g data-testid={`gpz-protection-${fieldId}`} data-apparatus-role="zabezpieczenie-pola">
      <path
        d={`M${x + 58} ${y + 20} L${targetX} ${targetY}`}
        stroke="#93C5FD"
        strokeWidth={1.2}
        strokeDasharray="4 4"
        fill="none"
      />
      <rect x={x} y={y} width={58} height={40} rx={5} ry={5} fill="#0B1723" stroke="#60A5FA" strokeWidth={1.2} />
      <text
        x={x + 29}
        y={y + 16}
        textAnchor="middle"
        fill="#BFDBFE"
        fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
        fontSize={10}
        fontWeight={700}
      >
        ZAB
      </text>
      <text
        x={x + 29}
        y={y + 31}
        textAnchor="middle"
        fill={WIRE}
        fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
        fontSize={11}
        fontWeight={700}
      >
        50/51
      </text>
    </g>
  );
}

function GroundSymbol({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={WIRE} strokeWidth={2.2} strokeLinecap="round">
      <line x1={x} y1={y} x2={x} y2={y + 14} />
      <line x1={x - 17} y1={y + 14} x2={x + 17} y2={y + 14} />
      <line x1={x - 12} y1={y + 21} x2={x + 12} y2={y + 21} />
      <line x1={x - 7} y1={y + 28} x2={x + 7} y2={y + 28} />
    </g>
  );
}

function BayNumberLabel({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill={WIRE}
      fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
      fontSize={20}
      fontWeight={700}
    >
      {label}
    </text>
  );
}

function MissingCurrentValues({ x, y }: { x: number; y: number }) {
  return (
    <g
      data-testid="gpz-coupler-results"
      data-result-status="brak"
      fill={WIRE}
      fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
      fontSize={19}
      fontWeight={600}
    >
      <text x={x} y={y}>I1 = -- A</text>
      <text x={x} y={y + 28}>I2 = -- A</text>
      <text x={x} y={y + 56}>I3 = -- A</text>
    </g>
  );
}

function formatMeasuredValue(value: number | null | undefined, unit: string, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return `-- ${unit}`;
  }
  return `${value.toFixed(digits)} ${unit}`;
}

function FieldResultBlock({
  fieldId,
  x,
  y,
  values,
}: {
  fieldId: string;
  x: number;
  y: number;
  values?: GpzFieldResultValues | null;
}) {
  const status = values?.status ?? 'brak';
  return (
    <g
      data-testid={`gpz-field-results-${fieldId}`}
      data-result-status={status}
      fill={status === 'nieaktualne' ? '#FBBF24' : WIRE}
      fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
      fontSize={15}
      fontWeight={650}
    >
      <text x={x} y={y}>I1 = {formatMeasuredValue(values?.i1A, 'A', 1)}</text>
      <text x={x} y={y + 19}>I2 = {formatMeasuredValue(values?.i2A, 'A', 1)}</text>
      <text x={x} y={y + 38}>I3 = {formatMeasuredValue(values?.i3A, 'A', 1)}</text>
      <text x={x} y={y + 61}>P = {formatMeasuredValue(values?.pMW, 'MW', 2)}</text>
      <text x={x} y={y + 80}>Q = {formatMeasuredValue(values?.qMvar, 'Mvar', 2)}</text>
    </g>
  );
}

function stackTop(field: GpzFieldAnnotationV1): number {
  return field.busTap.y + BAY_STACK_OFFSET;
}

function stackBottom(field: GpzFieldAnnotationV1): number {
  return stackTop(field) + 3 * TILE_HEIGHT + CT_SYMBOL_HEIGHT + 3 * TILE_GAP;
}

function exitY(field: GpzFieldAnnotationV1): number {
  return Math.max(field.segmentStart.y, stackBottom(field) + BAY_BOTTOM_TAIL);
}

function lineBayLabel(index: number, total: number, hasCoupler: boolean, fallback: string): string {
  if (hasCoupler && total >= 2) {
    if (index === 0) return '5';
    if (index === total - 1) return '8';
    return String(5 + index);
  }
  return fallback || String(index + 1);
}

function CanonicalLineBay({
  field,
  bayNumber,
  showTechnicalLabels,
  selected = false,
  resultValues,
  onTrunkOutPortClick,
  onTrunkOutPortHover,
}: GpzFieldBlockRendererProps) {
  const axisX = field.axisX;
  const tileX = axisX - TILE_WIDTH / 2;
  const yTop = stackTop(field);
  const yQ1 = yTop + TILE_HEIGHT + TILE_GAP;
  const yCt = yQ1 + TILE_HEIGHT + TILE_GAP;
  const yBottomDs = yCt + CT_SYMBOL_HEIGHT + TILE_GAP;
  const verticalExitY = exitY(field);
  const earthTapY = yBottomDs + TILE_HEIGHT + 28;
  const earthX = axisX + EARTH_BRANCH_OFFSET;
  const earthY = earthTapY + 8;
  const showResultBlock = selected || Boolean(resultValues);
  const bayFunction = resolveBayFunction(resolveFieldRole(field));

  return (
    <g
      data-sld-role="gpz-feeder-field"
      data-field-id={field.fieldId}
      data-element-id={field.fieldId}
      data-element-type="BaySN"
      data-element-name={field.designation}
      data-testid={`gpz-line-bay-${field.fieldId}`}
    >
      {selected && (
        <g data-testid={`gpz-field-selection-${field.fieldId}`} pointerEvents="none">
          <rect
            x={axisX - 58}
            y={field.busTap.y - 8}
            width={116}
            height={verticalExitY - field.busTap.y + 190}
            rx={6}
            ry={6}
            fill="rgba(37, 99, 235, 0.10)"
            stroke="#3B82F6"
            strokeWidth={1.4}
          />
          <rect
            x={axisX - 49}
            y={yTop - 9}
            width={98}
            height={TILE_HEIGHT * 3 + CT_SYMBOL_HEIGHT + TILE_GAP * 3 + 18}
            rx={5}
            ry={5}
            fill="none"
            stroke="#60A5FA"
            strokeWidth={1.6}
            strokeDasharray="5 4"
          />
          <circle cx={axisX} cy={field.busTap.y} r={6} fill="#60A5FA" stroke={WIRE} strokeWidth={1.5} />
        </g>
      )}
      {bayNumber && <BayNumberLabel x={axisX} y={field.busTap.y - 22} label={bayNumber} />}
      <circle cx={axisX} cy={field.busTap.y} r={5} fill={WIRE} />
      <line x1={axisX} y1={field.busTap.y} x2={axisX} y2={yTop} stroke={WIRE} strokeWidth={3} />
      <line x1={axisX} y1={yTop + TILE_HEIGHT} x2={axisX} y2={yQ1} stroke={WIRE} strokeWidth={3} />
      <line x1={axisX} y1={yQ1 + TILE_HEIGHT} x2={axisX} y2={yCt} stroke={WIRE} strokeWidth={3} />
      <line x1={axisX} y1={yCt + CT_SYMBOL_HEIGHT} x2={axisX} y2={yBottomDs} stroke={WIRE} strokeWidth={3} />
      <line x1={axisX} y1={yBottomDs + TILE_HEIGHT} x2={axisX} y2={verticalExitY} stroke={WIRE} strokeWidth={3} />

      <SwitchTile
        x={tileX}
        y={yTop}
        label="Q2"
        kind="disconnector"
        state="closed"
        testId={`gpz-device-${field.fieldId}-Q2`}
      />
      <SwitchTile
        x={tileX}
        y={yQ1}
        label="Q1"
        kind="breaker"
        state="closed"
        testId={`gpz-device-${field.fieldId}-Q1`}
      />
      <CurrentTransformerSymbol x={axisX} y={yCt} fieldId={field.fieldId} />
      <SwitchTile
        x={tileX}
        y={yBottomDs}
        kind="disconnector"
        state="closed"
        testId={`gpz-device-${field.fieldId}-DS-DOWNSTREAM`}
      />
      <ProtectionRelayBadge
        fieldId={field.fieldId}
        x={axisX - 104}
        y={yQ1 - 3}
        targetX={tileX}
        targetY={yQ1 + TILE_HEIGHT / 2}
      />

      <line x1={axisX} y1={earthTapY} x2={earthX} y2={earthTapY} stroke={WIRE} strokeWidth={3} />
      <line x1={earthX} y1={earthTapY} x2={earthX} y2={earthY} stroke={WIRE} strokeWidth={3} />
      <SwitchTile
        x={earthX - TILE_WIDTH / 2}
        y={earthY}
        label="Q3"
        kind="earthing-switch"
        state="open"
        testId={`gpz-device-${field.fieldId}-Q3`}
      />
      <GroundSymbol x={earthX} y={earthY + TILE_HEIGHT} />

      <circle
        data-testid={`sld-port-${field.fieldId}-TRUNK_OUT`}
        cx={axisX}
        cy={verticalExitY}
        r={12}
        fill="transparent"
        stroke={PORT_STROKE}
        strokeWidth={1}
        style={{ cursor: 'crosshair' }}
        onClick={(event) => {
          event.stopPropagation();
          onTrunkOutPortClick?.(field);
        }}
        onMouseEnter={() => onTrunkOutPortHover?.(field)}
        onMouseLeave={() => onTrunkOutPortHover?.(null)}
      >
        <title>Port wyjścia pola SN - {bayFunction.portLabel}</title>
      </circle>

      <text
        x={axisX}
        y={verticalExitY + 24}
        textAnchor="middle"
        fill={MUTED_WIRE}
        fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
        fontSize={11}
        fontWeight={650}
      >
        {bayFunction.subtitle}
      </text>

      {showTechnicalLabels && (
        <g
          fill={MUTED_WIRE}
          fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
          fontSize={9}
          textAnchor="middle"
        >
          <text x={axisX} y={verticalExitY + (showResultBlock ? 146 : 44)}>{bayFunction.title}</text>
          <text x={axisX} y={verticalExitY + (showResultBlock ? 160 : 58)}>{bayFunction.requiredPath}</text>
          <text x={axisX} y={verticalExitY + (showResultBlock ? 174 : 72)}>wyjście SN: {bayFunction.portLabel}</text>
          <text x={axisX} y={verticalExitY + (showResultBlock ? 188 : 86)}>{field.designation}</text>
        </g>
      )}
      {showResultBlock && (
        <FieldResultBlock
          fieldId={field.fieldId}
          x={axisX - 50}
          y={verticalExitY + 46}
          values={resultValues}
        />
      )}
    </g>
  );
}

function CouplerRenderer({
  leftX,
  rightX,
  busY,
}: {
  leftX: number;
  rightX: number;
  busY: number;
}) {
  const topY = busY + BAY_STACK_OFFSET;
  const leftTileX = leftX - TILE_WIDTH / 2;
  const rightTileX = rightX - TILE_WIDTH / 2;
  const yQ1 = topY + TILE_HEIGHT + TILE_GAP;
  const yBottomDs = yQ1 + TILE_HEIGHT + TILE_GAP;
  const rightLowerY = topY + TILE_HEIGHT + 2 * TILE_GAP + 44;
  const uY = Math.max(yBottomDs + TILE_HEIGHT, rightLowerY + TILE_HEIGHT) + 26;

  return (
    <g data-sld-role="gpz-bus-coupler" data-testid="gpz-coupler-6-7">
      <BayNumberLabel x={(leftX + rightX) / 2} y={busY - 22} label="6-7" />
      <circle cx={leftX} cy={busY} r={5} fill={WIRE} />
      <circle cx={rightX} cy={busY} r={5} fill={WIRE} />
      <line x1={leftX} y1={busY} x2={leftX} y2={topY} stroke={WIRE} strokeWidth={3} />
      <line x1={rightX} y1={busY} x2={rightX} y2={topY} stroke={WIRE} strokeWidth={3} />

      <SwitchTile x={leftTileX} y={topY} label="Q2" kind="disconnector" state="closed" testId="gpz-coupler-Q2" />
      <SwitchTile x={leftTileX} y={yQ1} label="Q1" kind="breaker" state="closed" testId="gpz-coupler-Q1" />
      <SwitchTile x={leftTileX} y={yBottomDs} kind="disconnector" state="closed" testId="gpz-coupler-DS-LEFT" />

      <SwitchTile x={rightTileX} y={topY} label="Q3" kind="disconnector" state="closed" testId="gpz-coupler-Q3" />
      <SwitchTile x={rightTileX} y={rightLowerY} kind="disconnector" state="closed" testId="gpz-coupler-DS-RIGHT" />

      <line x1={leftX} y1={topY + TILE_HEIGHT} x2={leftX} y2={yQ1} stroke={WIRE} strokeWidth={3} />
      <line x1={leftX} y1={yQ1 + TILE_HEIGHT} x2={leftX} y2={yBottomDs} stroke={WIRE} strokeWidth={3} />
      <line x1={leftX} y1={yBottomDs + TILE_HEIGHT} x2={leftX} y2={uY} stroke={WIRE} strokeWidth={3} />
      <line x1={leftX} y1={uY} x2={rightX} y2={uY} stroke={WIRE} strokeWidth={3} />
      <line x1={rightX} y1={uY} x2={rightX} y2={rightLowerY + TILE_HEIGHT} stroke={WIRE} strokeWidth={3} />
      <line x1={rightX} y1={topY + TILE_HEIGHT} x2={rightX} y2={rightLowerY} stroke={WIRE} strokeWidth={3} />
    </g>
  );
}

function sortByAxis(fields: readonly GpzFieldAnnotationV1[]): GpzFieldAnnotationV1[] {
  return [...fields].sort((left, right) => {
    if (left.axisX !== right.axisX) return left.axisX - right.axisX;
    return left.fieldId.localeCompare(right.fieldId);
  });
}

function sectionHasField(section: GpzSectionV1, field: GpzFieldAnnotationV1): boolean {
  return section.fieldIds.includes(field.fieldId);
}

export const GpzSwitchgearRenderer: React.FC<GpzSwitchgearRendererProps> = ({
  sections,
  fields,
  showTechnicalLabels = false,
  selectedFieldId = null,
  fieldResults,
  onFieldClick,
  onFieldDoubleClick,
  onTrunkOutPortClick,
  onTrunkOutPortHover,
}) => {
  const layout = useMemo(() => {
    const sortedFields = sortByAxis(fields);
    const busY = sortedFields[0]?.busTap.y ?? sections[0]?.busbar.y ?? 0;
    const hasCoupler = sections.length >= 2 && sortedFields.length >= 2;
    const firstAxis = sortedFields[0]?.axisX ?? 0;
    const lastAxis = sortedFields[sortedFields.length - 1]?.axisX ?? firstAxis;
    const couplerCenter = (firstAxis + lastAxis) / 2;
    const couplerLeftX = hasCoupler ? Math.round(couplerCenter - 42) : null;
    const couplerRightX = hasCoupler ? Math.round(couplerCenter + 42) : null;
    const leftBusStart = firstAxis - 110;
    const leftBusEnd = hasCoupler && couplerLeftX !== null ? couplerLeftX : lastAxis + 110;
    const rightBusStart = hasCoupler && couplerRightX !== null ? couplerRightX : null;
    const rightBusEnd = hasCoupler ? lastAxis + 110 : null;
    const minX = Math.min(leftBusStart, ...(rightBusStart !== null ? [rightBusStart] : []));
    const maxX = Math.max(leftBusEnd, ...(rightBusEnd !== null ? [rightBusEnd] : []));
    const lowerLabelReserve = showTechnicalLabels ? 210 : 136;
    const maxExitY = sortedFields.reduce(
      (maxY, field) => Math.max(maxY, exitY(field) + lowerLabelReserve),
      busY + 320,
    );

    return {
      sortedFields,
      busY,
      hasCoupler,
      couplerLeftX,
      couplerRightX,
      leftBusStart,
      leftBusEnd,
      rightBusStart,
      rightBusEnd,
      backdrop: {
        x: minX - 54,
        y: busY - 58,
        width: maxX - minX + 108,
        height: maxExitY - (busY - 58) + 24,
      },
    };
  }, [fields, sections, showTechnicalLabels]);

  if (layout.sortedFields.length === 0) {
    return null;
  }

  const leftSection = sections[0] ?? null;
  const rightSection = sections[1] ?? null;

  return (
    <g data-sld-role="gpz-switchgear-canonical" data-testid="gpz-switchgear-canonical">
      <rect
        x={layout.backdrop.x}
        y={layout.backdrop.y}
        width={layout.backdrop.width}
        height={layout.backdrop.height}
        rx={0}
        ry={0}
        fill={BACKDROP}
        stroke={BACKDROP_STROKE}
        strokeWidth={1}
      />
      <text
        x={layout.backdrop.x + 16}
        y={layout.backdrop.y + 22}
        fill="#E5E7EB"
        fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
        fontSize={13}
        fontWeight={800}
      >
        ROZDZIELNIA SN GPZ
      </text>
      <text
        x={layout.backdrop.x + 16}
        y={layout.backdrop.y + 40}
        fill="#93A4B8"
        fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
        fontSize={10}
        fontWeight={600}
      >
        szyny sekcyjne 15 kV - pola funkcjonalne
      </text>
      {leftSection && (
        <text
          x={(layout.leftBusStart + layout.leftBusEnd) / 2}
          y={layout.busY + 18}
          textAnchor="middle"
          fill="#BFDBFE"
          fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
          fontSize={11}
          fontWeight={700}
        >
          Sekcja A
        </text>
      )}
      {layout.hasCoupler && rightSection && layout.rightBusStart !== null && layout.rightBusEnd !== null && (
        <text
          x={(layout.rightBusStart + layout.rightBusEnd) / 2}
          y={layout.busY + 18}
          textAnchor="middle"
          fill="#BFDBFE"
          fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
          fontSize={11}
          fontWeight={700}
        >
          Sekcja B
        </text>
      )}
      <line
        x1={layout.leftBusStart}
        y1={layout.busY}
        x2={layout.leftBusEnd}
        y2={layout.busY}
        stroke={WIRE}
        strokeWidth={3}
        data-testid={leftSection ? `gpz-bus-section-${leftSection.sectionId}` : 'gpz-bus-section-left'}
      />
      {layout.hasCoupler && layout.rightBusStart !== null && layout.rightBusEnd !== null && (
        <line
          x1={layout.rightBusStart}
          y1={layout.busY}
          x2={layout.rightBusEnd}
          y2={layout.busY}
          stroke={WIRE}
          strokeWidth={3}
          data-testid={rightSection ? `gpz-bus-section-${rightSection.sectionId}` : 'gpz-bus-section-right'}
        />
      )}

      {layout.sortedFields.map((field, index) => {
        const label = lineBayLabel(index, layout.sortedFields.length, layout.hasCoupler, field.designation);
        const section = sections.find((candidate) => sectionHasField(candidate, field));
        const selected = selectedFieldId === field.fieldId || selectedFieldId === field.feederNodeId;
        const resultValues = fieldResults?.get(field.fieldId) ?? fieldResults?.get(field.feederNodeId) ?? null;
        return (
          <g
            key={field.fieldId}
            data-gpz-section-id={section?.sectionId ?? field.rootBusId}
            style={{ cursor: onFieldClick ? 'pointer' : undefined }}
            onClick={(event) => {
              event.stopPropagation();
              onFieldClick?.(field);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onFieldDoubleClick?.(field);
            }}
          >
            <CanonicalLineBay
              field={field}
              bayNumber={label}
              showTechnicalLabels={showTechnicalLabels}
              selected={selected}
              resultValues={resultValues}
              onTrunkOutPortClick={onTrunkOutPortClick}
              onTrunkOutPortHover={onTrunkOutPortHover}
            />
          </g>
        );
      })}

      {layout.hasCoupler && layout.couplerLeftX !== null && layout.couplerRightX !== null && (
        <>
          <CouplerRenderer leftX={layout.couplerLeftX} rightX={layout.couplerRightX} busY={layout.busY} />
          <MissingCurrentValues x={layout.couplerLeftX - 2} y={layout.busY + 178} />
        </>
      )}
    </g>
  );
};

export const GpzFieldBlockRenderer: React.FC<GpzFieldBlockRendererProps> = ({
  field,
  showTechnicalLabels = false,
  bayNumber,
  selected,
  resultValues,
  onTrunkOutPortClick,
  onTrunkOutPortHover,
}) => (
  <CanonicalLineBay
    field={field}
    bayNumber={bayNumber ?? field.designation}
    showTechnicalLabels={showTechnicalLabels}
    selected={selected}
    resultValues={resultValues}
    onTrunkOutPortClick={onTrunkOutPortClick}
    onTrunkOutPortHover={onTrunkOutPortHover}
  />
);
