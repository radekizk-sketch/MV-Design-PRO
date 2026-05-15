/**
 * CableRunRenderer - renderer ciagu liniowego SN.
 *
 * Renderuje tor kabla/linii jako obiekt klikany, ale widoczna kreska jest
 * rozcinana na portach stacji. To utrzymuje poprawna semantyke: kabel dochodzi
 * do pola wejsciowego stacji i wychodzi z pola wyjsciowego, zamiast przechodzic
 * przez srodek stacji.
 */

import {
  COLOR_FIELD_TRUNK_ENERGIZED,
  STROKE_BRANCH_LINE_PX,
  STROKE_TRUNK_LINE_PX,
  STROKE_DASHED_RING_DASH_PX,
} from '../theme/tokens';

export interface CableRunStationPortGap {
  readonly stationId: string;
  readonly y: number;
  readonly inputX: number;
  readonly outputX: number | null;
}

export interface CableRunSegmentLabel {
  readonly segmentRef: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

/**
 * K30-33: hint o wariancie kabla SN (izolacja + materiał żyły).
 * Renderer używa go do per-segment koloru/grubości — odróżnia EPR Al od
 * XLPE Cu od papierowego, zgodnie z PN-HD 620 S2 / IEC 60502-2.
 */
export interface CableSegmentVariantHint {
  readonly insulation: 'XLPE' | 'EPR' | 'PVC' | 'PAPER' | 'OVERHEAD' | 'UNKNOWN';
  readonly conductor: 'Al' | 'Cu' | 'AlSt' | 'UNKNOWN';
}

export interface CableRunSegmentPath {
  readonly segmentRef: string;
  readonly pathPoints: ReadonlyArray<{ x: number; y: number }>;
  readonly variant?: CableSegmentVariantHint;
}

export interface CableRunRendererProps {
  readonly id: string;
  readonly runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  /** Punkty sciezki ciagu (ortogonalne L-shape przez kanal Y). */
  readonly pathPoints: ReadonlyArray<{ x: number; y: number }>;
  readonly segmentKind: 'cable_sn' | 'overhead_line_sn';
  readonly segmentRefs?: readonly string[];
  readonly segmentPaths?: readonly CableRunSegmentPath[];
  readonly label?: string;
  readonly segmentLabels?: readonly CableRunSegmentLabel[];
  readonly pendingEndpoint?: boolean;
  /** True gdy któryś z segmentów ma brakujący endpoint_a_port lub
   *  endpoint_b_port — wymaga ręcznego domknięcia w E-12 (segment SN).
   *  Renderer pokazuje czerwony marker „brak portu" i dashed stroke. */
  readonly missingEndpointPort?: boolean;
  readonly stationPortGaps?: readonly CableRunStationPortGap[];
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
  /** LOD 0-1 → pokaż tylko główną etykietę, nie segmentLabels (AC-06 label declutter). */
  readonly lod?: number;
  /** K30-41: napięcie ciągu [kV] z `inferRunVoltageKv` w adapterze. Renderer
   *  dobiera tint stroke (gdy brak per-segment variant rendering) zgodnie
   *  z konwencją dyspozytorską OSD i rysuje voltage chip przy starcie ciągu. */
  readonly voltageKv?: number | null;
  /** K30-45: obciążenie kabla [%] względem ampacity (I_actual/I_max × 100).
   *  Wynika z LF results (I) podzielonego przez catalog ampacity (I_max).
   *  Renderer rysuje loading chip + opcjonalny overload red overlay:
   *   - ≤ 60% → green chip
   *   - 60-80% → amber chip
   *   - 80-100% → orange chip
   *   - > 100% → red chip + red dashed overlay (THERMAL OVERLOAD)
   *  Brak → chip pomijany. */
  readonly loadingPct?: number | null;
}

export function CableRunRenderer(props: CableRunRendererProps): JSX.Element | null {
  const {
    id,
    runKind,
    pathPoints,
    segmentKind,
    segmentRefs = [],
    segmentPaths = [],
    label,
    segmentLabels = [],
    pendingEndpoint,
    missingEndpointPort,
    stationPortGaps = [],
    selected,
    onClick,
    lod,
    voltageKv,
    loadingPct,
  } = props;
  // AC-06: Na LOD 0-1 ukrywamy szczegółowe etykiety segmentów żeby uniknąć
  // nakładania się etykiet. Główna etykieta (label) pozostaje widoczna.
  const visibleSegmentLabels = lod !== undefined && lod < 2 ? [] : segmentLabels;
  if (pathPoints.length < 2) return null;

  const strokeWidth = runKind === 'branch'
    ? STROKE_BRANCH_LINE_PX
    : STROKE_TRUNK_LINE_PX;

  const isDashed = runKind === 'ring' || runKind === 'loop';
  const isOverhead = segmentKind === 'overhead_line_sn';

  // Brakujący port endpointu → dashed warning stroke nad zwykłym dasharray.
  const dasharray = missingEndpointPort
    ? '5 4'
    : isDashed
      ? STROKE_DASHED_RING_DASH_PX
      : isOverhead
        ? '12 4'
        : undefined;
  // K30-41: voltage-based default stroke (gdy brak per-segment variant).
  // Variant rendering ma pierwszeństwo (K30-33 cable type identity). Tutaj
  // tylko jako fallback dla uniform path.
  const voltageBaseStroke = cableColorForVoltage(voltageKv ?? null);
  const strokeColor = missingEndpointPort
    ? '#FF6B6B'
    : selected
      ? '#35C7FF'
      : voltageBaseStroke;

  const hitPath = pathPoints
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');
  // K30-33: jeśli segmentPaths mają hint wariantu, renderujemy per-segment
  // stroke odróżniający izolację/materiał. Fallback do uniform stroke
  // gdy hint nie jest dostępny (backward-compat).
  const variantSegments = segmentPaths.filter(
    (sp): sp is CableRunSegmentPath & { variant: CableSegmentVariantHint } =>
      sp.variant !== undefined,
  );
  const useVariantRendering = variantSegments.length > 0;
  const visiblePaths = useVariantRendering
    ? []
    : buildVisibleCablePaths(pathPoints, stationPortGaps);
  const labelPoint = label && visibleSegmentLabels.length === 0
    ? findLongestHorizontalSegmentMidpoint(pathPoints)
    : null;
  const terminalPoint = pathPoints[pathPoints.length - 1];
  // K30-42: power flow direction arrow — kierunek z start → end pathPoints.
  // Renderowane na najdłuższym horizontal segmencie w midpoincie. Pomaga
  // operatorowi natychmiast zidentyfikować kierunek zasilania (upstream →
  // downstream), kluczowe w dispatcher operations.
  const flowArrow = computeFlowArrowMarker(pathPoints);
  const readableSegmentLabels = declutterSegmentLabels(
    visibleSegmentLabels
      .map((segmentLabel) => avoidStationLabelCollision(segmentLabel, stationPortGaps))
      .map((segmentLabel) => (
        pendingEndpoint && terminalPoint
          ? avoidPendingEndpointLabelCollision(segmentLabel, terminalPoint)
          : segmentLabel
      )),
  );

  return (
    <g
      data-testid={`sld-v2-run-${id}`}
      data-connection-ref={id}
      data-element-kind="cable_run"
      data-element-id={id}
      data-run-kind={runKind}
      data-segment-kind={segmentKind}
    >
      <path
        d={hitPath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth + 8, 12)}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      />
      <polyline
        points={pathPoints.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth + 10, 14)}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      />
      {(segmentPaths.length > 0
        ? segmentPaths
        : segmentRefs.map((segmentRef) => ({ segmentRef, pathPoints }))).map((segmentPath) => (
        <g
          key={`${id}-segment-hitbox-${segmentPath.segmentRef}`}
          data-testid={`sld-v2-run-${id}-segment-hitbox-${segmentPath.segmentRef}`}
          data-connection-ref={segmentPath.segmentRef}
          data-element-kind="cable_run"
          data-element-id={segmentPath.segmentRef}
        >
          <polyline
            points={segmentPath.pathPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(strokeWidth + 12, 16)}
            onClick={onClick ? (e) => { e.stopPropagation(); onClick(segmentPath.segmentRef); } : undefined}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
          />
        </g>
      ))}
      {visiblePaths.map((visiblePath, index) => (
        <path
          key={`${id}-visible-${index}`}
          data-testid={`sld-v2-run-${id}-visible-${index}`}
          d={visiblePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={selected ? strokeWidth + 1 : strokeWidth}
          strokeDasharray={dasharray}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      ))}
      {useVariantRendering && variantSegments.map((segmentPath) => {
        const variantStyle = cableVariantStyle(segmentPath.variant);
        const segmentVisiblePaths = buildVisibleCablePaths(
          segmentPath.pathPoints,
          stationPortGaps,
        );
        const segStroke = missingEndpointPort
          ? '#FF6B6B'
          : selected
            ? '#35C7FF'
            : variantStyle.stroke;
        const segDasharray = missingEndpointPort
          ? '5 4'
          : isDashed
            ? STROKE_DASHED_RING_DASH_PX
            : variantStyle.dasharray ?? (isOverhead ? '12 4' : undefined);
        const segWidth = (selected ? strokeWidth + 1 : strokeWidth) + variantStyle.widthDelta;
        return segmentVisiblePaths.map((vp, vpIdx) => (
          <path
            key={`${id}-variant-${segmentPath.segmentRef}-${vpIdx}`}
            data-testid={`sld-v2-run-${id}-variant-${segmentPath.segmentRef}-${vpIdx}`}
            data-cable-insulation={segmentPath.variant.insulation}
            data-cable-conductor={segmentPath.variant.conductor}
            d={vp}
            fill="none"
            stroke={segStroke}
            strokeWidth={segWidth}
            strokeDasharray={segDasharray}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ));
      })}
      {/* IEC 60617 junction dots — małe kółka w miejscach przyłączenia do szyny stacji.
          Potwierdzają galwaniczne połączenie kabel→port stacji (brak kółka = brak połączenia). */}
      {!missingEndpointPort && stationPortGaps.map((gap) => (
        <g
          key={`${id}-junction-${gap.stationId}`}
          data-testid={`sld-v2-run-${id}-junction-${gap.stationId}`}
          pointerEvents="none"
        >
          <circle
            cx={gap.inputX}
            cy={gap.y}
            r={3}
            fill={selected ? '#35C7FF' : strokeColor}
            pointerEvents="none"
          />
          {gap.outputX !== null && (
            <circle
              cx={gap.outputX}
              cy={gap.y}
              r={3}
              fill={selected ? '#35C7FF' : strokeColor}
              pointerEvents="none"
            />
          )}
        </g>
      ))}
      {/* K30-7: ring/loop closure indicator — small circle z text przy endpoincie */}
      {(runKind === 'ring' || runKind === 'loop') && !missingEndpointPort && (
        <g
          data-testid={`sld-v2-run-${id}-ring-indicator`}
          data-run-kind={runKind}
          pointerEvents="none"
        >
          <circle
            cx={terminalPoint.x}
            cy={terminalPoint.y - 22}
            r={12}
            fill="#0A0E14"
            stroke="#FFD166"
            strokeWidth={1.6}
          />
          <text
            x={terminalPoint.x}
            y={terminalPoint.y - 18}
            textAnchor="middle"
            fill="#FFD166"
            fontFamily="sans-serif"
            fontSize={9}
            fontWeight={900}
            letterSpacing={0.5}
          >
            {runKind === 'ring' ? 'RING' : 'LOOP'}
          </text>
        </g>
      )}
      {missingEndpointPort && (
        <g
          data-testid={`sld-v2-run-${id}-missing-port-marker`}
          data-warning="connection_port_missing"
          pointerEvents="none"
        >
          <circle
            cx={pathPoints[0].x}
            cy={pathPoints[0].y}
            r={6}
            fill="#0B141B"
            stroke="#FF6B6B"
            strokeWidth={1.5}
          />
          <text
            x={pathPoints[0].x}
            y={pathPoints[0].y + 3}
            textAnchor="middle"
            fill="#FF6B6B"
            className="select-none text-[9px] font-bold"
          >
            !
          </text>
          <circle
            cx={pathPoints[pathPoints.length - 1].x}
            cy={pathPoints[pathPoints.length - 1].y}
            r={6}
            fill="#0B141B"
            stroke="#FF6B6B"
            strokeWidth={1.5}
          />
          <text
            x={pathPoints[pathPoints.length - 1].x}
            y={pathPoints[pathPoints.length - 1].y + 3}
            textAnchor="middle"
            fill="#FF6B6B"
            className="select-none text-[9px] font-bold"
          >
            !
          </text>
        </g>
      )}
      {label && labelPoint && (
        <text
          data-testid={`sld-v2-run-${id}-label`}
          x={labelPoint.x}
          y={labelPoint.y - 10}
          textAnchor="middle"
          fill="#DDF7FF"
          stroke="#050810"
          strokeWidth={3}
          paintOrder="stroke"
          className="select-none text-[11px] font-semibold"
          pointerEvents="none"
        >
          {label}
        </text>
      )}
      {/* K30-41: voltage-class chip przy starcie ciągu — kwadracik w kolorze
          klasy napięcia (WN/SN/nN) z tekstem "{kV} kV". Pomaga zidentyfikować
          klasę napięcia ciągu niezależnie od per-segment variant rendering. */}
      {voltageKv != null && voltageKv > 0 && (
        <g
          data-testid={`sld-v2-run-${id}-voltage-chip`}
          data-voltage-kv={voltageKv}
          pointerEvents="none"
          transform={`translate(${pathPoints[0].x + 6}, ${pathPoints[0].y - 12})`}
        >
          <rect
            x={0}
            y={-7}
            width={32}
            height={13}
            rx={2}
            fill={voltageBaseStroke}
            opacity={0.85}
          />
          <text
            x={16}
            y={3}
            textAnchor="middle"
            fill="#0A0E14"
            fontFamily="sans-serif"
            fontSize={9}
            fontWeight={800}
            letterSpacing={0.3}
          >
            {voltageKv >= 1
              ? `${Math.round(voltageKv)} kV`
              : `${(voltageKv * 1000).toFixed(0)} V`}
          </text>
        </g>
      )}
      {/* K30-45: cable loading chip near voltage chip — pokazuje % ampacity.
          Pomijany gdy missingEndpointPort lub loadingPct nieobecne. */}
      {loadingPct != null && Number.isFinite(loadingPct) && loadingPct > 0 && !missingEndpointPort && (() => {
        const cls = classifyCableLoading(loadingPct);
        const x0 = pathPoints[0].x + 44;
        const y0 = pathPoints[0].y - 12;
        return (
          <g
            data-testid={`sld-v2-run-${id}-loading-chip`}
            data-loading-pct={loadingPct.toFixed(1)}
            data-loading-class={cls.label}
            pointerEvents="none"
            transform={`translate(${x0}, ${y0})`}
          >
            <rect x={0} y={-7} width={42} height={13} rx={2} fill={cls.color} opacity={0.85} />
            <text
              x={21}
              y={3}
              textAnchor="middle"
              fill="#0A0E14"
              fontFamily="sans-serif"
              fontSize={9}
              fontWeight={800}
            >
              {`I ${loadingPct.toFixed(0)}%`}
            </text>
          </g>
        );
      })()}
      {/* K30-45: cable overload overlay — gdy loadingPct > 100, narysuj dashed
          red overlay nad cablem sygnalizujący THERMAL OVERLOAD. */}
      {loadingPct != null && Number.isFinite(loadingPct) && loadingPct > 100 && !missingEndpointPort && !useVariantRendering && (
        <path
          data-testid={`sld-v2-run-${id}-overload-overlay`}
          d={hitPath}
          fill="none"
          stroke="#FF333D"
          strokeWidth={strokeWidth + 2}
          strokeDasharray="4 4"
          strokeLinecap="round"
          opacity={0.5}
          pointerEvents="none"
        />
      )}
      {/* K30-42: power flow direction arrow at midpoint of longest horizontal
          segment. Pomocne dla operatora — natychmiast widać direction
          zasilania (upstream→downstream). Pomijamy gdy missingEndpointPort
          (warning state) lub pendingEndpoint (incomplete connection). */}
      {flowArrow && !missingEndpointPort && !pendingEndpoint && (
        <polygon
          data-testid={`sld-v2-run-${id}-flow-arrow`}
          data-flow-direction={flowArrow.direction}
          points={
            flowArrow.direction === 'right'
              ? `${flowArrow.x - 5},${flowArrow.y - 4} ${flowArrow.x + 5},${flowArrow.y} ${flowArrow.x - 5},${flowArrow.y + 4}`
              : `${flowArrow.x + 5},${flowArrow.y - 4} ${flowArrow.x - 5},${flowArrow.y} ${flowArrow.x + 5},${flowArrow.y + 4}`
          }
          fill={selected ? '#35C7FF' : voltageBaseStroke}
          stroke="#05070A"
          strokeWidth={0.6}
          opacity={0.92}
          pointerEvents="none"
        />
      )}
      {readableSegmentLabels.map((segmentLabel) => (
        <text
          key={`${id}-segment-label-${segmentLabel.segmentRef}`}
          data-testid={`sld-v2-run-${id}-segment-label-${segmentLabel.segmentRef}`}
          x={segmentLabel.x}
          y={segmentLabel.y}
          textAnchor="middle"
          fill="#DDF7FF"
          stroke="#050810"
          strokeWidth={3}
          paintOrder="stroke"
          className="select-none text-[11px] font-semibold"
          pointerEvents="none"
        >
          {segmentLabel.text}
        </text>
      ))}
      {pendingEndpoint && terminalPoint && (
        <g
          data-testid={`sld-v2-run-${id}-pending-end`}
          onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
          style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
          <rect
            x={terminalPoint.x - 28}
            y={terminalPoint.y - 17}
            width={210}
            height={40}
            rx={3}
            fill="transparent"
            stroke="transparent"
            pointerEvents="all"
          />
          <rect
            x={terminalPoint.x - 20}
            y={terminalPoint.y - 11}
            width={40}
            height={22}
            rx={2}
            fill="#0B141B"
            stroke="#FFD166"
            strokeWidth={1.4}
            strokeDasharray="4 3"
          />
          <line
            x1={terminalPoint.x - 13}
            y1={terminalPoint.y}
            x2={terminalPoint.x + 13}
            y2={terminalPoint.y}
            stroke="#FFD166"
            strokeWidth={1.4}
          />
          <line
            x1={terminalPoint.x}
            y1={terminalPoint.y - 7}
            x2={terminalPoint.x}
            y2={terminalPoint.y + 7}
            stroke="#FFD166"
            strokeWidth={1.2}
          />
          <text
            x={terminalPoint.x + 28}
            y={terminalPoint.y - 4}
            fill="#FFD166"
            stroke="#050810"
            strokeWidth={3}
            paintOrder="stroke"
            className="select-none text-[10px] font-semibold"
            pointerEvents="none"
          >
            Wybierz kolejny obiekt
          </text>
          <text
            x={terminalPoint.x + 28}
            y={terminalPoint.y + 9}
            fill="#DDF7FF"
            stroke="#050810"
            strokeWidth={3}
            paintOrder="stroke"
            className="select-none text-[9px] font-medium"
            pointerEvents="none"
          >
            stacja / ZK SN / słup / ciąg
          </text>
        </g>
      )}
    </g>
  );
}

type Point = { x: number; y: number };

function buildVisibleCablePaths(
  points: readonly Point[],
  gaps: readonly CableRunStationPortGap[],
): string[] {
  if (gaps.length === 0) {
    return [points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ')];
  }

  const paths: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.x === b.x && a.y === b.y) continue;
    if (a.y !== b.y) {
      paths.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
      continue;
    }

    for (const interval of cutHorizontalInterval(a, b, gaps)) {
      if (interval.from === interval.to) continue;
      paths.push(`M ${interval.from} ${a.y} L ${interval.to} ${a.y}`);
    }
  }

  return paths.length > 0
    ? paths
    : [points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ')];
}

function cutHorizontalInterval(
  a: Point,
  b: Point,
  gaps: readonly CableRunStationPortGap[],
): Array<{ from: number; to: number }> {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const cuts = gaps
    .filter((gap) => Math.abs(gap.y - a.y) <= 0.5)
    .map((gap) => ({
      from: clamp(Math.min(gap.inputX, gap.outputX ?? maxX), minX, maxX),
      to: clamp(gap.outputX === null ? maxX : Math.max(gap.inputX, gap.outputX), minX, maxX),
    }))
    .filter((cut) => cut.to > cut.from)
    .sort((left, right) => left.from - right.from);

  if (cuts.length === 0) {
    return [{ from: a.x, to: b.x }];
  }

  const intervals: Array<{ from: number; to: number }> = [];
  let cursor = minX;
  for (const cut of cuts) {
    if (cut.from > cursor) {
      intervals.push({ from: cursor, to: cut.from });
    }
    cursor = Math.max(cursor, cut.to);
  }
  if (cursor < maxX) {
    intervals.push({ from: cursor, to: maxX });
  }

  if (a.x <= b.x) return intervals;
  return intervals.reverse().map((interval) => ({ from: interval.to, to: interval.from }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function avoidStationLabelCollision(
  label: CableRunSegmentLabel,
  gaps: readonly CableRunStationPortGap[],
): CableRunSegmentLabel {
  const collidingGap = gaps.find((gap) => {
    const stationMidX = gap.outputX === null ? gap.inputX : (gap.inputX + gap.outputX) / 2;
    return Math.abs(label.y - gap.y) <= 24 && Math.abs(label.x - stationMidX) <= 128;
  });
  if (!collidingGap) return label;
  return {
    ...label,
    y: Math.min(label.y - 34, collidingGap.y - 72),
  };
}

function avoidPendingEndpointLabelCollision(
  label: CableRunSegmentLabel,
  terminalPoint: Point,
): CableRunSegmentLabel {
  const isNearPendingEndpoint =
    Math.abs(label.y - terminalPoint.y) <= 34
    && Math.abs(label.x - terminalPoint.x) <= 190;
  if (!isNearPendingEndpoint) return label;
  return {
    ...label,
    y: terminalPoint.y - 30,
  };
}

function declutterSegmentLabels(
  labels: readonly CableRunSegmentLabel[],
): CableRunSegmentLabel[] {
  const placed: CableRunSegmentLabel[] = [];
  return labels.map((label) => {
    let candidate = label;
    let attempts = 0;
    while (placed.some((other) => segmentLabelsOverlap(candidate, other)) && attempts < 6) {
      candidate = {
        ...candidate,
        y: candidate.y - 20,
      };
      attempts += 1;
    }
    placed.push(candidate);
    return candidate;
  });
}

function segmentLabelsOverlap(
  left: CableRunSegmentLabel,
  right: CableRunSegmentLabel,
): boolean {
  const leftHalfWidth = estimateLabelWidth(left.text) / 2;
  const rightHalfWidth = estimateLabelWidth(right.text) / 2;
  return (
    Math.abs(left.y - right.y) < 18
    && Math.abs(left.x - right.x) < leftHalfWidth + rightHalfWidth + 12
  );
}

function estimateLabelWidth(text: string): number {
  return Math.max(52, Math.min(220, text.length * 7.2));
}

/**
 * K30-41: kolor stroke kabla per voltage class. Konwencja dyspozytorska OSD
 * (analogicznie do `busColorForVoltage` w StationOnRunRenderer):
 * - ≥ 100 kV (WN)         → #E74C3C (czerwień)
 * - 12-30 kV (SN)          → #13C45A (energized green kanon)
 * - 5-10 kV (SN niskie)    → #0A8D43 (głębsza zieleń)
 * - 0.2-1 kV (nN)          → #7DD3FC (chłodny błękit)
 * - inne / brak            → COLOR_FIELD_TRUNK_ENERGIZED (back-compat)
 */
function cableColorForVoltage(kv: number | null): string {
  if (kv == null || !Number.isFinite(kv) || kv <= 0) return COLOR_FIELD_TRUNK_ENERGIZED;
  if (kv >= 100) return '#E74C3C';
  if (kv >= 12) return COLOR_FIELD_TRUNK_ENERGIZED;
  if (kv >= 5) return '#0A8D43';
  if (kv >= 0.2) return '#7DD3FC';
  return COLOR_FIELD_TRUNK_ENERGIZED;
}

/**
 * K30-33: mapuje wariant kabla (izolacja + materiał) na styl renderingu.
 *
 * Per IEC 60617 sam symbol kabla jest taki sam dla wszystkich typów, ale
 * w industrial SLD (ABB/DIgSILENT) różne odcinki kolorowane są tonalnie
 * dla odróżnienia generacji / standardu. Tu używamy subtelnych odcieni:
 * - XLPE Al → bazowy zielony (#13C45A) — najczęstszy nowy kabel
 * - XLPE Cu → zielony z +0.6 px szerokości (Cu ma większą amperowość)
 * - EPR Al/Cu → ciepły gold (#FFD166) — kabel średnio-elastyczny
 * - PVC → chłodny niebieski (#7DD3FC) — starszy/wewn.
 * - PAPER → szary (#A8B5BD) + dashed (papier olej, generacja PE)
 */
function cableVariantStyle(
  variant: CableSegmentVariantHint,
): { stroke: string; widthDelta: number; dasharray?: string } {
  const conductorBonus = variant.conductor === 'Cu' ? 0.6 : 0;
  switch (variant.insulation) {
    case 'XLPE':
      return { stroke: COLOR_FIELD_TRUNK_ENERGIZED, widthDelta: conductorBonus };
    case 'EPR':
      return { stroke: '#FFD166', widthDelta: conductorBonus };
    case 'PVC':
      return { stroke: '#7DD3FC', widthDelta: conductorBonus };
    case 'PAPER':
      return { stroke: '#A8B5BD', widthDelta: conductorBonus, dasharray: '6 3' };
    case 'OVERHEAD':
      return { stroke: COLOR_FIELD_TRUNK_ENERGIZED, widthDelta: conductorBonus, dasharray: '12 4' };
    case 'UNKNOWN':
    default:
      return { stroke: COLOR_FIELD_TRUNK_ENERGIZED, widthDelta: conductorBonus };
  }
}

/**
 * K30-45: klasyfikator cable loading (I/I_max %):
 * - ≤ 60% → green (normal)
 * - 60-80% → amber (warning)
 * - 80-100% → orange (high)
 * - > 100% → red (THERMAL OVERLOAD — needs immediate action)
 */
function classifyCableLoading(pct: number): { color: string; label: string } {
  if (pct <= 60) return { color: '#13C45A', label: 'normal' };
  if (pct <= 80) return { color: '#FFD166', label: 'warning' };
  if (pct <= 100) return { color: '#FF8B5C', label: 'high' };
  return { color: '#FF333D', label: 'overload' };
}

/**
 * K30-42: oblicza pozycję + kierunek strzałki przepływu mocy dla ciągu.
 * Strzałka rysowana w midpoincie najdłuższego horizontal segmentu, kierunek
 * wynika z order pathPoints (start → end). Industrial SLD convention:
 * cable run = upstream → downstream, strzałka pokazuje kierunek zasilania.
 *
 * Returns null gdy nie ma horizontal segmentu wystarczającej długości
 * (min 20 px — zbyt krótki nie mieści strzałki estetycznie).
 */
function computeFlowArrowMarker(
  points: readonly Point[],
): { x: number; y: number; direction: 'right' | 'left' } | null {
  let best: { x: number; y: number; direction: 'right' | 'left'; length: number } | null = null;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (Math.abs(start.y - end.y) > 0.5) continue;
    const length = Math.abs(end.x - start.x);
    if (length < 20) continue;
    if (!best || length > best.length) {
      best = {
        x: (start.x + end.x) / 2,
        y: start.y,
        direction: end.x >= start.x ? 'right' : 'left',
        length,
      };
    }
  }
  return best ? { x: best.x, y: best.y, direction: best.direction } : null;
}

function findLongestHorizontalSegmentMidpoint(points: readonly Point[]): Point | null {
  let best: { x: number; y: number; length: number } | null = null;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (Math.abs(start.y - end.y) > 0.5) continue;
    const length = Math.abs(end.x - start.x);
    if (length <= 0) continue;
    if (!best || length > best.length) {
      best = {
        x: (start.x + end.x) / 2,
        y: start.y,
        length,
      };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}
