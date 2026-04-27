import React, { useMemo } from 'react';
import type { GpzFieldAnnotationV1, GpzSectionV1 } from './core/layoutResult';

const WIRE = '#F8FAFC';
const MUTED_WIRE = '#CBD5E1';
const BACKDROP = '#1F2933';
const BACKDROP_STROKE = '#334155';
const CLOSED_FILL = '#16A34A';
const OPEN_FILL = '#DC2626';
const PORT_STROKE = 'rgba(96, 165, 250, 0.24)';

const TILE_WIDTH = 44;
const TILE_HEIGHT = 34;
const TILE_GAP = 1;
const BAY_STACK_OFFSET = 34;
const BAY_BOTTOM_TAIL = 58;
const EARTH_BRANCH_OFFSET = 56;

export interface GpzFieldBlockRendererProps {
  field: GpzFieldAnnotationV1;
  color?: string;
  showTechnicalLabels?: boolean;
  bayNumber?: string;
  onTrunkOutPortClick?: (field: GpzFieldAnnotationV1) => void;
  onTrunkOutPortHover?: (field: GpzFieldAnnotationV1 | null) => void;
}

export interface GpzSwitchgearRendererProps {
  sections: readonly GpzSectionV1[];
  fields: readonly GpzFieldAnnotationV1[];
  showTechnicalLabels?: boolean;
  onFieldClick?: (field: GpzFieldAnnotationV1) => void;
  onFieldDoubleClick?: (field: GpzFieldAnnotationV1) => void;
  onTrunkOutPortClick?: (field: GpzFieldAnnotationV1) => void;
  onTrunkOutPortHover?: (field: GpzFieldAnnotationV1 | null) => void;
}

type SwitchState = 'closed' | 'open';
type ApparatusKind = 'disconnector' | 'breaker' | 'earthing-switch';

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

function CurrentValues({ x, y }: { x: number; y: number }) {
  return (
    <g
      fill={WIRE}
      fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
      fontSize={19}
      fontWeight={600}
    >
      <text x={x} y={y}>I1 = 0.00 A</text>
      <text x={x} y={y + 28}>I2 = 0.00 A</text>
      <text x={x} y={y + 56}>I3 = 0.00 A</text>
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
  onTrunkOutPortClick,
  onTrunkOutPortHover,
}: GpzFieldBlockRendererProps) {
  const axisX = field.axisX;
  const tileX = axisX - TILE_WIDTH / 2;
  const yTop = stackTop(field);
  const yQ1 = yTop + TILE_HEIGHT + TILE_GAP;
  const yBottomDs = yQ1 + TILE_HEIGHT + TILE_GAP;
  const verticalExitY = exitY(field);
  const earthTapY = yBottomDs + TILE_HEIGHT + 28;
  const earthX = axisX + EARTH_BRANCH_OFFSET;
  const earthY = earthTapY + 8;

  return (
    <g
      data-sld-role="gpz-feeder-field"
      data-field-id={field.fieldId}
      data-element-id={field.fieldId}
      data-element-type="BaySN"
      data-element-name={field.designation}
      data-testid={`gpz-line-bay-${field.fieldId}`}
    >
      {bayNumber && <BayNumberLabel x={axisX} y={field.busTap.y - 22} label={bayNumber} />}
      <circle cx={axisX} cy={field.busTap.y} r={5} fill={WIRE} />
      <line x1={axisX} y1={field.busTap.y} x2={axisX} y2={yTop} stroke={WIRE} strokeWidth={3} />
      <line x1={axisX} y1={yTop + TILE_HEIGHT} x2={axisX} y2={yQ1} stroke={WIRE} strokeWidth={3} />
      <line x1={axisX} y1={yQ1 + TILE_HEIGHT} x2={axisX} y2={yBottomDs} stroke={WIRE} strokeWidth={3} />
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
      <SwitchTile
        x={tileX}
        y={yBottomDs}
        kind="disconnector"
        state="closed"
        testId={`gpz-device-${field.fieldId}-DS-DOWNSTREAM`}
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
        <title>Port wyjścia pola SN</title>
      </circle>

      {showTechnicalLabels && (
        <text
          x={axisX}
          y={verticalExitY + 24}
          textAnchor="middle"
          fill={MUTED_WIRE}
          fontFamily="'JetBrains Mono', 'Fira Code', Menlo, monospace"
          fontSize={10}
        >
          {field.designation}
        </text>
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
    const maxExitY = sortedFields.reduce((maxY, field) => Math.max(maxY, exitY(field) + 62), busY + 250);

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
  }, [fields, sections]);

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
              onTrunkOutPortClick={onTrunkOutPortClick}
              onTrunkOutPortHover={onTrunkOutPortHover}
            />
          </g>
        );
      })}

      {layout.hasCoupler && layout.couplerLeftX !== null && layout.couplerRightX !== null && (
        <>
          <CouplerRenderer leftX={layout.couplerLeftX} rightX={layout.couplerRightX} busY={layout.busY} />
          <CurrentValues x={layout.couplerLeftX - 2} y={layout.busY + 178} />
        </>
      )}
    </g>
  );
};

export const GpzFieldBlockRenderer: React.FC<GpzFieldBlockRendererProps> = ({
  field,
  showTechnicalLabels = false,
  bayNumber,
  onTrunkOutPortClick,
  onTrunkOutPortHover,
}) => (
  <CanonicalLineBay
    field={field}
    bayNumber={bayNumber ?? field.designation}
    showTechnicalLabels={showTechnicalLabels}
    onTrunkOutPortClick={onTrunkOutPortClick}
    onTrunkOutPortHover={onTrunkOutPortHover}
  />
);
