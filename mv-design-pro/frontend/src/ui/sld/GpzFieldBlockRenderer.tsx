import React, { useMemo } from 'react';
import type { GpzFieldAnnotationV1, GpzSectionV1 } from './core/layoutResult';
import {
  DeviceElectricalRoleV1,
  DevicePowerPathPositionV1,
  DeviceTypeV1,
  type DeviceV1,
} from './core/fieldDeviceContracts';

const WIRE = '#F8FAFC';
const MUTED_WIRE = '#CBD5E1';
const BACKDROP = 'rgba(3, 12, 20, 0.58)';
const BACKDROP_STROKE = 'rgba(45, 86, 116, 0.42)';
const SWITCHGEAR_FRAME = 'rgba(2, 9, 18, 0.66)';
const SWITCHGEAR_FRAME_STROKE = 'rgba(56, 189, 248, 0.36)';
const LABEL_CYAN = '#67E8F9';
const CLOSED_FILL = '#16A34A';
const OPEN_FILL = '#334155';
const UNKNOWN_FILL = '#1E293B';
const ALARM_FILL = '#DC2626';
const PORT_STROKE = 'rgba(96, 165, 250, 0.24)';

const TILE_WIDTH = 44;
const TILE_HEIGHT = 34;
const TILE_GAP = 1;
const BAY_STACK_OFFSET = 26;
const BAY_BOTTOM_TAIL = 38;
const EARTH_BRANCH_OFFSET = 52;

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

type SwitchState = 'closed' | 'open' | 'unknown' | 'alarm';
type ApparatusKind = 'disconnector' | 'breaker' | 'earthing-switch' | 'ct' | 'vt' | 'relay' | 'termination';

interface TileProps {
  x: number;
  y: number;
  label?: string;
  kind: ApparatusKind;
  state?: SwitchState;
  testId: string;
}

function apparatusFill(state: SwitchState): string {
  if (state === 'closed') return CLOSED_FILL;
  if (state === 'alarm') return ALARM_FILL;
  if (state === 'unknown') return UNKNOWN_FILL;
  return OPEN_FILL;
}

function apparatusStroke(state: SwitchState): string {
  if (state === 'closed') return '#15803D';
  if (state === 'alarm') return '#991B1B';
  return '#64748B';
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

function CtGlyph() {
  return (
    <g stroke={WIRE} strokeWidth={2.2} fill="none">
      <circle cx={17} cy={17} r={7} />
      <circle cx={27} cy={17} r={7} />
      <line x1={22} y1={3} x2={22} y2={9} />
      <line x1={22} y1={25} x2={22} y2={31} />
    </g>
  );
}

function VtGlyph() {
  return (
    <g stroke={WIRE} strokeWidth={2.2} strokeLinejoin="round" fill="none">
      <path d="M22 5 L34 27 H10 Z" />
      <line x1={22} y1={3} x2={22} y2={9} />
      <line x1={22} y1={27} x2={22} y2={31} />
    </g>
  );
}

function RelayGlyph() {
  return (
    <g stroke={WIRE} strokeWidth={1.8} fill="none">
      <rect x={12} y={8} width={20} height={18} rx={2} />
      <path d="M16 19 L21 13 H28" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function TerminationGlyph() {
  return (
    <g stroke={WIRE} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M22 6 V23" />
      <path d="M13 23 H31" />
      <path d="M16 28 H28" />
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
        rx={1}
        ry={1}
        fill={apparatusFill(state)}
        stroke={apparatusStroke(state)}
        strokeWidth={1.2}
      />
      {kind === 'breaker' && <BreakerGlyph />}
      {kind === 'disconnector' && <DisconnectorGlyph />}
      {kind === 'earthing-switch' && <EarthingSwitchGlyph />}
      {kind === 'ct' && <CtGlyph />}
      {kind === 'vt' && <VtGlyph />}
      {kind === 'relay' && <RelayGlyph />}
      {kind === 'termination' && <TerminationGlyph />}
      {label && (
        <text
          x={TILE_WIDTH + 7}
          y={TILE_HEIGHT / 2 + 4}
          fill={WIRE}
          fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
          fontSize={11}
          fontWeight={700}
        >
          {label}
        </text>
      )}
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
      fontSize={12}
      fontWeight={700}
    >
      {label}
    </text>
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
  return stackTop(field) + 3 * TILE_HEIGHT + 2 * TILE_GAP;
}

function exitY(field: GpzFieldAnnotationV1): number {
  return Math.max(field.segmentStart.y, stackBottom(field) + BAY_BOTTOM_TAIL);
}

function lineBayLabel(index: number): string {
  return `Pole SN ${index + 1}`;
}

function devicePathWeight(device: DeviceV1): number {
  switch (device.powerPathPosition) {
    case DevicePowerPathPositionV1.UPSTREAM:
      return 10;
    case DevicePowerPathPositionV1.MIDSTREAM:
      return 20;
    case DevicePowerPathPositionV1.DOWNSTREAM:
      return 30;
    case DevicePowerPathPositionV1.OFF_PATH:
    default:
      return 90;
  }
}

function deviceTypeWeight(device: DeviceV1): number {
  switch (device.deviceType) {
    case DeviceTypeV1.DS:
      return 10;
    case DeviceTypeV1.CB:
    case DeviceTypeV1.LOAD_SWITCH:
    case DeviceTypeV1.FUSE:
      return 20;
    case DeviceTypeV1.CT:
      return 30;
    case DeviceTypeV1.VT:
      return 40;
    case DeviceTypeV1.CABLE_HEAD:
      return 50;
    case DeviceTypeV1.ES:
      return 60;
    case DeviceTypeV1.RELAY:
      return 80;
    default:
      return 90;
  }
}

function sortFieldDevices(left: DeviceV1, right: DeviceV1): number {
  return (
    devicePathWeight(left) - devicePathWeight(right)
    || deviceTypeWeight(left) - deviceTypeWeight(right)
    || left.id.localeCompare(right.id)
  );
}

function gpzFieldDevices(field: GpzFieldAnnotationV1): readonly DeviceV1[] {
  const devices = field.detail?.devices ?? [];
  return [...devices]
    .filter((device) => device.fieldId === field.fieldId)
    .sort(sortFieldDevices);
}

function deviceKind(device: DeviceV1): ApparatusKind {
  switch (device.deviceType) {
    case DeviceTypeV1.CB:
    case DeviceTypeV1.LOAD_SWITCH:
    case DeviceTypeV1.FUSE:
      return 'breaker';
    case DeviceTypeV1.ES:
      return 'earthing-switch';
    case DeviceTypeV1.CT:
      return 'ct';
    case DeviceTypeV1.VT:
      return 'vt';
    case DeviceTypeV1.RELAY:
      return 'relay';
    case DeviceTypeV1.CABLE_HEAD:
      return 'termination';
    default:
      return 'disconnector';
  }
}

function deviceLabel(device: DeviceV1): string {
  switch (device.deviceType) {
    case DeviceTypeV1.CB:
      return 'CB';
    case DeviceTypeV1.DS:
      return 'DS';
    case DeviceTypeV1.ES:
      return 'Uziem.';
    case DeviceTypeV1.CT:
      return 'PP';
    case DeviceTypeV1.VT:
      return 'PN';
    case DeviceTypeV1.RELAY:
      return 'Zab.';
    case DeviceTypeV1.CABLE_HEAD:
      return 'Głow.';
    case DeviceTypeV1.LOAD_SWITCH:
      return 'Rozł.';
    case DeviceTypeV1.FUSE:
      return 'Bez.';
    default:
      return 'Aparat';
  }
}

function MissingApparatusMarker({ x, y, fieldId }: { x: number; y: number; fieldId: string }) {
  return (
    <g data-testid={`gpz-missing-apparatus-${fieldId}`} data-sld-role="missing-field-apparatus">
      <rect
        x={x - 32}
        y={y}
        width={64}
        height={48}
        rx={2}
        fill="rgba(245, 158, 11, 0.08)"
        stroke="#F59E0B"
        strokeWidth={1.2}
        strokeDasharray="4 3"
      />
      <text
        x={x}
        y={y + 18}
        textAnchor="middle"
        fill="#FBBF24"
        fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
        fontSize={9}
        fontWeight={700}
      >
        brak
      </text>
      <text
        x={x}
        y={y + 33}
        textAnchor="middle"
        fill="#FBBF24"
        fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
        fontSize={9}
        fontWeight={700}
      >
        aparatury
      </text>
    </g>
  );
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
  const devices = gpzFieldDevices(field);
  const powerPathDevices = devices.filter((device) =>
    device.electricalRole !== DeviceElectricalRoleV1.PROTECTION
    && device.deviceType !== DeviceTypeV1.ES,
  );
  const earthingDevices = devices.filter((device) => device.deviceType === DeviceTypeV1.ES);
  const protectionDevices = devices.filter((device) => device.electricalRole === DeviceElectricalRoleV1.PROTECTION);
  const apparatusStackHeight = Math.max(1, Math.min(powerPathDevices.length, 5)) * TILE_HEIGHT
    + Math.max(0, Math.min(powerPathDevices.length, 5) - 1) * TILE_GAP;
  const verticalExitY = Math.max(exitY(field), yTop + apparatusStackHeight + BAY_BOTTOM_TAIL);
  const earthTapY = yTop + apparatusStackHeight + 28;
  const earthX = axisX + EARTH_BRANCH_OFFSET;
  const earthY = earthTapY + 8;
  const showResultBlock = Boolean(resultValues);

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
            x={axisX - 50}
            y={field.busTap.y - 10}
            width={100}
            height={verticalExitY - field.busTap.y + 24}
            rx={2}
            ry={2}
            fill="rgba(37, 99, 235, 0.10)"
            stroke="#3B82F6"
            strokeWidth={1.4}
          />
          <rect
            x={axisX - 43}
            y={yTop - 9}
            width={86}
            height={apparatusStackHeight + 18}
            rx={2}
            ry={2}
            fill="none"
            stroke="#60A5FA"
            strokeWidth={1.6}
            strokeDasharray="5 4"
          />
          <circle cx={axisX} cy={field.busTap.y} r={6} fill="#60A5FA" stroke={WIRE} strokeWidth={1.5} />
        </g>
      )}
      {bayNumber && <BayNumberLabel x={axisX} y={field.busTap.y - 34} label={bayNumber} />}
      <circle cx={axisX} cy={field.busTap.y} r={5} fill={WIRE} />
      <line x1={axisX} y1={field.busTap.y} x2={axisX} y2={verticalExitY} stroke={WIRE} strokeWidth={3} />

      {powerPathDevices.length === 0 ? (
        <MissingApparatusMarker x={axisX} y={yTop} fieldId={field.fieldId} />
      ) : (
        powerPathDevices.slice(0, 5).map((device, index) => (
          <SwitchTile
            key={device.id}
            x={tileX}
            y={yTop + index * (TILE_HEIGHT + TILE_GAP)}
            label={deviceLabel(device)}
            kind={deviceKind(device)}
            state="unknown"
            testId={`gpz-device-${field.fieldId}-${device.id}`}
          />
        ))
      )}

      {earthingDevices.length > 0 && (
        <>
          <line x1={axisX} y1={earthTapY} x2={earthX} y2={earthTapY} stroke={WIRE} strokeWidth={3} />
          <line x1={earthX} y1={earthTapY} x2={earthX} y2={earthY} stroke={WIRE} strokeWidth={3} />
          {earthingDevices.slice(0, 1).map((device) => (
            <SwitchTile
              key={device.id}
              x={earthX - TILE_WIDTH / 2}
              y={earthY}
              label={deviceLabel(device)}
              kind="earthing-switch"
              state="unknown"
              testId={`gpz-device-${field.fieldId}-${device.id}`}
            />
          ))}
          <GroundSymbol x={earthX} y={earthY + TILE_HEIGHT} />
        </>
      )}

      {protectionDevices.length > 0 && (
        <g data-sld-role="gpz-field-protection">
          {protectionDevices.slice(0, 2).map((device, index) => (
            <SwitchTile
              key={device.id}
              x={axisX + 50}
              y={yTop + index * (TILE_HEIGHT + TILE_GAP)}
              label={deviceLabel(device)}
              kind="relay"
              state="unknown"
              testId={`gpz-device-${field.fieldId}-${device.id}`}
            />
          ))}
        </g>
      )}

      <circle
        data-testid={`sld-port-marker-${field.fieldId}-TRUNK_OUT`}
        cx={axisX}
        cy={verticalExitY}
        r={4.5}
        fill="#2563EB"
        stroke={WIRE}
        strokeWidth={1.2}
        pointerEvents="none"
        data-sld-role="port-marker"
        data-sld-port-role="BAY_SN_OUT"
        data-sld-port-id="TRUNK_OUT"
        data-voltage-domain="SN"
      >
        <title>Zacisk wyjściowy pola SN</title>
      </circle>
      <circle
        data-testid={`sld-port-${field.fieldId}-TRUNK_OUT`}
        cx={axisX}
        cy={verticalExitY}
        r={12}
        fill="transparent"
        stroke={PORT_STROKE}
        strokeWidth={1}
        style={{ cursor: 'crosshair' }}
        aria-label="Zacisk wyjściowy pola SN"
        data-sld-role="port-hotspot"
        data-sld-port-role="BAY_SN_OUT"
        data-sld-port-id="TRUNK_OUT"
        data-voltage-domain="SN"
        onClick={(event) => {
          event.stopPropagation();
          onTrunkOutPortClick?.(field);
        }}
        onMouseEnter={() => onTrunkOutPortHover?.(field)}
        onMouseLeave={() => onTrunkOutPortHover?.(null)}
      >
        <title>Zacisk wyjściowy pola SN</title>
      </circle>

      {showTechnicalLabels && (
        <text
          x={axisX}
          y={verticalExitY + 18}
          textAnchor="middle"
          fill={MUTED_WIRE}
          fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
          fontSize={10}
        >
          {field.designation}
        </text>
      )}
      {showResultBlock && (
        <FieldResultBlock
          fieldId={field.fieldId}
          x={axisX - 50}
          y={verticalExitY + 36}
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
      <BayNumberLabel x={(leftX + rightX) / 2} y={busY - 22} label="Sprzęgło" />
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
    const leftBusStart = firstAxis - 76;
    const leftBusEnd = hasCoupler && couplerLeftX !== null ? couplerLeftX : lastAxis + 76;
    const rightBusStart = hasCoupler && couplerRightX !== null ? couplerRightX : null;
    const rightBusEnd = hasCoupler ? lastAxis + 76 : null;
    const minX = Math.min(leftBusStart, ...(rightBusStart !== null ? [rightBusStart] : []));
    const maxX = Math.max(leftBusEnd, ...(rightBusEnd !== null ? [rightBusEnd] : []));
    const fieldBottomY = sortedFields.reduce(
      (maxY, field) => Math.max(maxY, stackBottom(field) + 86),
      busY + 176,
    );
    const frameX = minX - 64;
    const frameY = busY - 92;
    const frameWidth = maxX - minX + 128;
    const frameHeight = fieldBottomY - frameY + 12;
    const transformerAxisX = minX - 30;

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
        x: minX - 30,
        y: busY - 34,
        width: maxX - minX + 60,
        height: fieldBottomY - (busY - 34) + 16,
      },
      frame: {
        x: frameX,
        y: frameY,
        width: frameWidth,
        height: frameHeight,
      },
      transformerAxisX,
    };
  }, [fields, sections]);

  if (layout.sortedFields.length === 0) {
    return null;
  }

  const leftSection = sections[0] ?? null;
  const rightSection = sections[1] ?? null;

  return (
    <g data-sld-role="gpz-switchgear-canonical" data-testid="gpz-switchgear-canonical">
      <rect
        x={layout.frame.x}
        y={layout.frame.y}
        width={layout.frame.width}
        height={layout.frame.height}
        rx={2}
        ry={2}
        fill={SWITCHGEAR_FRAME}
        stroke={SWITCHGEAR_FRAME_STROKE}
        strokeWidth={1.2}
      />
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
        x={layout.frame.x + 12}
        y={layout.frame.y + 20}
        fill={LABEL_CYAN}
        fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
        fontSize={10}
        fontWeight={800}
        letterSpacing={1.4}
      >
        GPZ / ROZDZIELNIA SN
      </text>
      <g data-sld-role="gpz-incoming-context" pointerEvents="none">
        <line
          x1={layout.transformerAxisX}
          y1={layout.busY - 72}
          x2={layout.transformerAxisX}
          y2={layout.busY}
          stroke={MUTED_WIRE}
          strokeWidth={2.2}
          strokeDasharray="7 5"
        />
        <line
          x1={layout.transformerAxisX}
          y1={layout.busY}
          x2={layout.leftBusStart}
          y2={layout.busY}
          stroke={MUTED_WIRE}
          strokeWidth={2.2}
        />
        <text
          x={layout.transformerAxisX + 18}
          y={layout.busY - 56}
          fill={MUTED_WIRE}
          fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
          fontSize={10}
        >
          Zasilanie WN/SN
        </text>
      </g>
      <line
        x1={layout.leftBusStart}
        y1={layout.busY}
        x2={layout.leftBusEnd}
        y2={layout.busY}
        stroke={WIRE}
        strokeWidth={3}
        data-testid={leftSection ? `gpz-bus-section-${leftSection.sectionId}` : 'gpz-bus-section-left'}
      />
      {layout.hasCoupler && (
        <text
          x={(layout.leftBusStart + layout.leftBusEnd) / 2}
          y={layout.busY - 9}
          textAnchor="middle"
          fill={MUTED_WIRE}
          fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
          fontSize={10}
        >
          Sekcja SN 1
        </text>
      )}
      {layout.hasCoupler && layout.rightBusStart !== null && layout.rightBusEnd !== null && (
        <>
          <line
            x1={layout.rightBusStart}
            y1={layout.busY}
            x2={layout.rightBusEnd}
            y2={layout.busY}
            stroke={WIRE}
            strokeWidth={3}
            data-testid={rightSection ? `gpz-bus-section-${rightSection.sectionId}` : 'gpz-bus-section-right'}
          />
          <text
            x={(layout.rightBusStart + layout.rightBusEnd) / 2}
            y={layout.busY - 9}
            textAnchor="middle"
            fill={MUTED_WIRE}
            fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
            fontSize={10}
          >
            Sekcja SN 2
          </text>
        </>
      )}

      {layout.sortedFields.map((field, index) => {
        const label = lineBayLabel(index);
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
    bayNumber={bayNumber ?? '1'}
    showTechnicalLabels={showTechnicalLabels}
    selected={selected}
    resultValues={resultValues}
    onTrunkOutPortClick={onTrunkOutPortClick}
    onTrunkOutPortHover={onTrunkOutPortHover}
  />
);
