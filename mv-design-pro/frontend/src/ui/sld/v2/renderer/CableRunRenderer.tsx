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

export interface CableRunSegmentEndpointResult {
  readonly segmentRef: string;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly severity?: 'INFO' | 'WARNING' | 'IMPORTANT' | 'CRITICAL' | string | null;
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
  /** True gdy któryś z segmentów nie ma realnego terminala ENM
   *  (`from_bus_ref` / `to_bus_ref`). Brak samej geometrii portu nie jest
   *  pokazywany projektantowi jako przerwana topologia. */
  readonly missingEndpointPort?: boolean;
  readonly stationPortGaps?: readonly CableRunStationPortGap[];
  readonly selected?: boolean;
  readonly selectedSegmentRefs?: readonly string[];
  readonly onClick?: (id: string) => void;
  /** LOD 0-1 -> etykieta ciagu; LOD 2+ -> etykiety odcinkow. */
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
  /** Wynik obliczen przy koncu kazdego odcinka. Dane sa przekazywane z
   *  warstwy wynikow/backendu; renderer nie wyznacza fizyki. */
  readonly segmentEndpointResults?: readonly CableRunSegmentEndpointResult[];
  /** Aktualna skala viewportu SLD. Uzywana do czytelnosci symboli topologii. */
  readonly viewportScale?: number;
  /** K30-105: ciąg pod napięciem per SupplyPath (z source). Renderer
   *  rysuje strzałkę kierunku przepływu mocy (▷) na midpoincie segmentów
   *  per IEC 60617. Default false → brak strzałek (neutral / unknown). */
  readonly energized?: boolean;
  /** True gdy ciag zawiera NMO / otwarty punkt z SupplyPathHighlighter. */
  readonly containsOpenPoint?: boolean;
  /** Presentation-only guide for stations that are placed but not bound to a real SN segment. */
  readonly topologyGuide?: boolean;
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
    selectedSegmentRefs = [],
    onClick,
    lod,
    voltageKv,
    loadingPct,
    segmentEndpointResults = [],
    viewportScale,
    energized = false,
    containsOpenPoint = false,
    topologyGuide = false,
  } = props;
  // LOD 0-1 pokazuje przebieg sieci bez natloku opisow. Parametry
  // poszczegolnych odcinkow SN pojawiaja sie od LOD 2.
  const visibleSegmentLabels = lod !== undefined && lod < 2 ? [] : segmentLabels;
  if (pathPoints.length < 2) return null;
  const effectiveOnClick = topologyGuide ? undefined : onClick;
  const pendingEndpointTargetId = segmentRefs[segmentRefs.length - 1] ?? id;
  const selectedSegmentRefSet = new Set(selectedSegmentRefs);

  const strokeWidth = runKind === 'branch'
    ? STROKE_BRANCH_LINE_PX
    : STROKE_TRUNK_LINE_PX;

  const isDashed = runKind === 'ring' || runKind === 'loop';
  const isOverhead = segmentKind === 'overhead_line_sn';

  // Brakujący port endpointu → dashed warning stroke nad zwykłym dasharray.
  const dasharray = topologyGuide
    ? '8 5'
    : missingEndpointPort
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
  const strokeColor = topologyGuide
    ? '#FFD166'
    : missingEndpointPort
      ? '#FF6B6B'
      : selected
        ? '#35C7FF'
        : voltageBaseStroke;

  const hitPath = pathPoints
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');
  // K30-33: gdy adapter poda segmentPaths, każdy odcinek musi zostać narysowany.
  // Wcześniej obecność choć jednego wariantu katalogowego ukrywała odcinki bez
  // `variant`, przez co stacje wyglądały jak wiszące bez połączeń.
  const useSegmentPathRendering = segmentPaths.length > 0;
  const renderSegmentPaths = useSegmentPathRendering
    ? segmentPaths.map((segmentPath) => ({
        ...segmentPath,
        pathPoints: snapSegmentPathToCurrentStationPorts(segmentPath.pathPoints, stationPortGaps),
      }))
    : [];
  const visiblePaths = useSegmentPathRendering
    ? []
    : buildVisibleCablePaths(pathPoints, stationPortGaps);
  const runLabel = label && lod === 0
    ? overviewRunLabel(runKind)
    : label;
  const labelPoint = runLabel && visibleSegmentLabels.length === 0
    ? findLongestHorizontalSegmentMidpoint(pathPoints)
    : null;
  const terminalPoint = pathPoints[pathPoints.length - 1];
  const pendingEndpointLabel = pendingEndpointLabels(segmentKind);
  // K30-42: power flow direction arrow — kierunek z start → end pathPoints.
  // Renderowane na najdłuższym horizontal segmencie w midpoincie. Pomaga
  // operatorowi natychmiast zidentyfikować kierunek zasilania (upstream →
  // downstream), kluczowe w dispatcher operations.
  const flowArrow = computeFlowArrowMarker(pathPoints);
  const flowArrowSize = topologyDirectionArrowSize(viewportScale);
  const showTopologyDirectionArrows =
    !topologyGuide
    && !missingEndpointPort
    && pathPoints.length >= 2
    && (energized || lod === 0 || lod === 1);
  const readableSegmentLabels = declutterSegmentLabels(
    visibleSegmentLabels
      .map((segmentLabel) => avoidStationLabelCollision(segmentLabel, stationPortGaps))
      .map((segmentLabel) => (
        pendingEndpoint && terminalPoint
          ? avoidPendingEndpointLabelCollision(segmentLabel, terminalPoint)
          : segmentLabel
      )),
  );
  const showDetailedSegmentBadges =
    lod === undefined
    || lod >= 2
    || Boolean(selected)
    || selectedSegmentRefs.length > 0
    || segmentEndpointResults.length > 0;
  const segmentBadgePaths = renderSegmentPaths.length > 0
    ? renderSegmentPaths
    : segmentRefs.map((segmentRef) => ({
      segmentRef,
      pathPoints,
      variant: undefined,
    }));
  const readableSegmentTypeBadges = showDetailedSegmentBadges
    ? declutterSegmentTypeBadges(
      segmentBadgePaths.map((segmentPath, index) => {
        const point = segmentTypeBadgePoint(segmentPath.pathPoints, index);
        return {
          segmentRef: segmentPath.segmentRef,
          text: segmentTypeBadgeText(segmentKind, segmentPath.variant),
          x: point.x,
          y: point.y,
        };
      }),
    )
    : [];
  const readableEndpointResults = showDetailedSegmentBadges
    ? declutterSegmentEndpointResults(segmentEndpointResults)
    : [];

  return (
    <g
      data-testid={`sld-v2-run-${id}`}
      data-connection-ref={id}
      data-element-kind="cable_run"
      data-element-id={id}
      data-run-kind={runKind}
      data-segment-kind={segmentKind}
      data-energized={energized ? 'true' : 'false'}
      data-flow-role={energized ? 'supply-path' : undefined}
      data-supply-path-role={energized ? (runKind === 'branch' ? 'branch' : 'main_run') : 'not_energized'}
      data-open-point={containsOpenPoint ? 'true' : undefined}
      data-topology-guide={topologyGuide ? 'true' : undefined}
    >
      <path
        d={hitPath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth + 8, 12)}
        pointerEvents="stroke"
        onClick={effectiveOnClick ? (e) => { e.stopPropagation(); effectiveOnClick(id); } : undefined}
        style={{ cursor: effectiveOnClick ? 'pointer' : 'default' }}
      />
      <polyline
        points={pathPoints.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth + 10, 14)}
        pointerEvents="stroke"
        onClick={effectiveOnClick ? (e) => { e.stopPropagation(); effectiveOnClick(id); } : undefined}
        style={{ cursor: effectiveOnClick ? 'pointer' : 'default' }}
      />
      {(renderSegmentPaths.length > 0
        ? renderSegmentPaths
        : segmentRefs.map((segmentRef) => ({ segmentRef, pathPoints }))).map((segmentPath) => {
        const segmentSelected = selectedSegmentRefSet.has(segmentPath.segmentRef);
        const hitRects = buildPositiveHitRects(segmentPath.pathPoints, Math.max(strokeWidth + 12, 16));
        return (
          <g
            key={`${id}-segment-hitbox-${segmentPath.segmentRef}`}
            data-testid={`sld-v2-run-${id}-segment-hitbox-${segmentPath.segmentRef}`}
            data-connection-ref={segmentPath.segmentRef}
            data-element-kind="cable_run"
            data-element-id={segmentPath.segmentRef}
            data-selected={segmentSelected ? 'true' : undefined}
          >
            {hitRects.map((rect, rectIndex) => (
              <rect
                key={`${segmentPath.segmentRef}-hit-rect-${rectIndex}`}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                fill="transparent"
                pointerEvents="all"
                onClick={effectiveOnClick ? (e) => { e.stopPropagation(); effectiveOnClick(segmentPath.segmentRef); } : undefined}
                style={{ cursor: effectiveOnClick ? 'pointer' : 'default' }}
              />
            ))}
            <polyline
              points={segmentPath.pathPoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(strokeWidth + 12, 16)}
              pointerEvents="stroke"
              onClick={effectiveOnClick ? (e) => { e.stopPropagation(); effectiveOnClick(segmentPath.segmentRef); } : undefined}
              style={{ cursor: effectiveOnClick ? 'pointer' : 'default' }}
            />
          </g>
        );
      })}
      {visiblePaths.map((visiblePath, index) => (
        energized && !topologyGuide && !missingEndpointPort ? (
          <path
            key={`${id}-supply-underlay-${index}`}
            data-testid={`sld-v2-run-${id}-supply-path-${index}`}
            data-flow-role="supply-path"
            data-supply-path="true"
            d={visiblePath}
            fill="none"
            stroke={runKind === 'branch' ? '#5BB8FF' : '#13C45A'}
            strokeWidth={strokeWidth + 7}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.18}
            pointerEvents="none"
          />
        ) : null
      ))}
      {useSegmentPathRendering && energized && !topologyGuide && !missingEndpointPort && renderSegmentPaths.flatMap((segmentPath) => (
        buildVisibleCablePaths(segmentPath.pathPoints, stationPortGaps).map((vp, vpIdx) => (
          <path
            key={`${id}-supply-underlay-${segmentPath.segmentRef}-${vpIdx}`}
            data-testid={`sld-v2-run-${id}-supply-path-${segmentPath.segmentRef}-${vpIdx}`}
            data-flow-role="supply-path"
            data-supply-path="true"
            d={vp}
            fill="none"
            stroke={runKind === 'branch' ? '#5BB8FF' : '#13C45A'}
            strokeWidth={strokeWidth + 7}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.18}
            pointerEvents="none"
          />
        ))
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
      {useSegmentPathRendering && renderSegmentPaths.map((segmentPath) => {
        const variantStyle = segmentPath.variant
          ? cableVariantStyle(segmentPath.variant)
          : null;
        const segmentExactSelected = selectedSegmentRefSet.has(segmentPath.segmentRef);
        const segmentHighlighted = Boolean(selected || segmentExactSelected);
        const segmentVisiblePaths = buildVisibleCablePaths(
          segmentPath.pathPoints,
          stationPortGaps,
        );
        const segStroke = topologyGuide
          ? '#FFD166'
          : missingEndpointPort
            ? '#FF6B6B'
            : segmentHighlighted
              ? '#35C7FF'
              : variantStyle?.stroke ?? strokeColor;
        const segDasharray = topologyGuide
          ? '8 5'
          : missingEndpointPort
            ? '5 4'
            : isDashed
              ? STROKE_DASHED_RING_DASH_PX
              : variantStyle?.dasharray ?? (isOverhead ? '12 4' : undefined);
        const segWidth = (segmentHighlighted ? strokeWidth + 1 : strokeWidth) + (variantStyle?.widthDelta ?? 0);
        return segmentVisiblePaths.map((vp, vpIdx) => (
          <path
            key={`${id}-segment-${segmentPath.segmentRef}-${vpIdx}`}
            data-testid={
              segmentPath.variant
                ? `sld-v2-run-${id}-variant-${segmentPath.segmentRef}-${vpIdx}`
                : `sld-v2-run-${id}-segment-${segmentPath.segmentRef}-${vpIdx}`
            }
            data-cable-insulation={segmentPath.variant?.insulation}
            data-cable-conductor={segmentPath.variant?.conductor}
            data-selected={segmentExactSelected ? 'true' : undefined}
            data-selected-segment={segmentExactSelected ? segmentPath.segmentRef : undefined}
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
      {/* IEC 60617-4 junction symbols — distinct dla:
          - galvanic połączenie (terminal switchgear port): filled circle
          - mufa kablowa pass-through (joint pomiędzy segmentami): hollow
            circle z grubszą obwódką. K30-107: dispatcher OSD widzi
            że stacja jest pośrednia (pass-through) vs końcowa. */}
      {!missingEndpointPort && stationPortGaps.map((gap) => {
        // Pass-through station has BOTH input + output ports → mufa (hollow).
        // Terminal station has only input → switchgear connection (filled).
        const isPassThrough = gap.outputX !== null;
        const junctionKind = isPassThrough ? 'mufa' : 'galwaniczne';
        const fillColor = isPassThrough ? '#0A0E14' : (selected ? '#35C7FF' : strokeColor);
        const strokeWidthVal = isPassThrough ? 1.4 : 0.8;
        return (
          <g
            key={`${id}-junction-${gap.stationId}`}
            data-testid={`sld-v2-run-${id}-junction-${gap.stationId}`}
            data-junction-kind={junctionKind}
            pointerEvents="none"
          >
            <circle
              cx={gap.inputX}
              cy={gap.y}
              r={4}
              fill={fillColor}
              stroke={isPassThrough ? (selected ? '#35C7FF' : strokeColor) : '#0A0E14'}
              strokeWidth={strokeWidthVal}
              pointerEvents="none"
            />
            {gap.outputX !== null && (
              <circle
                cx={gap.outputX}
                cy={gap.y}
                r={4}
                fill={fillColor}
                stroke={isPassThrough ? (selected ? '#35C7FF' : strokeColor) : '#0A0E14'}
                strokeWidth={strokeWidthVal}
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}
      {/* K30-106: cable head termination (głowica kablowa) per IEC 60617-4 —
          triangle ▲ na początku i końcu ciągu kablowego (segmentKind=cable_sn
          only — overhead lines don't have terminations). Operator widzi
          że kabel jest podłączony przez głowicę (nie zwykły mufa pass-through). */}
      {segmentKind === 'cable_sn' && !topologyGuide && !missingEndpointPort && pathPoints.length >= 2 && (lod === undefined || lod >= 2) && (
        <g data-testid={`sld-v2-run-${id}-cable-heads`} pointerEvents="none">
          {[pathPoints[0], pathPoints[pathPoints.length - 1]].map((p, i) => (
            <polygon
              key={`${id}-head-${i}`}
              points={`${p.x - 4},${p.y - 4} ${p.x + 4},${p.y - 4} ${p.x},${p.y + 4}`}
              fill={strokeColor}
              stroke="#0A0E14"
              strokeWidth={0.6}
              opacity={0.9}
            />
          ))}
        </g>
      )}
      {/* K30-105: power flow direction arrows (▷) per IEC 60617 — pokazuje
          operatorowi OSD kierunek przepływu mocy ze źródła do odbiorów.
          Render: jedna strzałka na każdej parze sąsiednich pathPoints
          przy LOD≥2 i energized=true. Strzałka skierowana zgodnie z
          orientacją pathPoints (source → load). */}
      {showTopologyDirectionArrows && (
        <g
          data-testid={`sld-v2-run-${id}-direction-arrows`}
          data-topology-arrow-scale={(flowArrowSize / 5).toFixed(2)}
          pointerEvents="none"
        >
          {pathPoints.slice(0, -1).map((p, i) => {
            const next = pathPoints[i + 1];
            const mx = (p.x + next.x) / 2;
            const my = (p.y + next.y) / 2;
            const dx = next.x - p.x;
            const dy = next.y - p.y;
            const segLen = Math.sqrt(dx * dx + dy * dy);
            // Skip very short segments to avoid clutter
            if (segLen < 20) return null;
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const arrowSize = flowArrowSize * 0.8;
            return (
              <g
                key={`${id}-arrow-${i}`}
                transform={`translate(${mx}, ${my}) rotate(${angle})`}
              >
                <polygon
                  points={`${-arrowSize},${-arrowSize} ${arrowSize},0 ${-arrowSize},${arrowSize}`}
                  fill={strokeColor}
                  opacity={0.85}
                />
              </g>
            );
          })}
        </g>
      )}
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
      {containsOpenPoint && !topologyGuide && !missingEndpointPort && terminalPoint && (
        <g
          data-testid={`sld-v2-run-${id}-nmo-open-point`}
          data-element-kind="open_point_marker"
          data-open-point="true"
          transform={`translate(${terminalPoint.x}, ${terminalPoint.y - 24})`}
          pointerEvents="none"
        >
          <circle r={11} fill="#3A0C0C" stroke="#FF333D" strokeWidth={1.7} />
          <line x1={-6} y1={0} x2={6} y2={0} stroke="#FF333D" strokeWidth={2.4} transform="rotate(-35)" />
          <text
            x={0}
            y={18}
            textAnchor="middle"
            fill="#FFB3B3"
            fontFamily="sans-serif"
            fontSize={8}
            fontWeight={900}
            paintOrder="stroke"
            stroke="#05070A"
            strokeWidth={2}
          >
            NMO
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
      {/* K30-53: IEC 60617 cable head triangle przy starcie trunk — anchor
          visualny "głowica kabla". Industrial convention: kable wchodzą w pole
          przez głowicę. Rysujemy tylko gdy main_trunk (nie branch) i brak
          missingEndpointPort warning. */}
      {!topologyGuide && !missingEndpointPort && runKind === 'main_trunk' && pathPoints.length > 0 && (
        <g
          data-testid={`sld-v2-run-${id}-cable-head`}
          data-anchor="trunk-start"
          data-symbol-canon="cable_head_triangle"
          data-port-binding="trunk-start-head"
          pointerEvents="none"
          transform={`translate(${pathPoints[0].x}, ${pathPoints[0].y})`}
        >
          {/* Triangle pointing UP (cable comes from below) — IEC 60617 cable head canonical */}
          <polygon
            points="0,-6 -5,4 5,4"
            fill={selected ? '#35C7FF' : strokeColor}
            stroke="#0A0E14"
            strokeWidth={0.8}
            opacity={0.95}
            data-symbol-canon="cable_head_triangle"
          />
        </g>
      )}
      {runLabel && labelPoint && (
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
          {runLabel}
        </text>
      )}
      {/* K30-41: voltage-class chip przy starcie ciągu — kwadracik w kolorze
          klasy napięcia (WN/SN/nN) z tekstem "{kV} kV". Pomaga zidentyfikować
          klasę napięcia ciągu niezależnie od per-segment variant rendering.
          K30-51: LOD gate ≥2 (zoom-in) — przy zoom-out chip clutters trunk. */}
      {voltageKv != null && voltageKv > 0 && !topologyGuide && (lod === undefined || lod >= 2) && (
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
      {loadingPct != null && Number.isFinite(loadingPct) && loadingPct > 0 && !topologyGuide && !missingEndpointPort && (lod === undefined || lod >= 2) && (() => {
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
      {loadingPct != null && Number.isFinite(loadingPct) && loadingPct > 100 && !topologyGuide && !missingEndpointPort && !useSegmentPathRendering && (
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
      {flowArrow && !topologyGuide && !missingEndpointPort && !pendingEndpoint && (
        <polygon
          data-testid={`sld-v2-run-${id}-flow-arrow`}
          data-flow-direction={flowArrow.direction}
          data-topology-arrow-scale={(flowArrowSize / 5).toFixed(2)}
          points={
            flowArrow.direction === 'right'
              ? `${flowArrow.x - flowArrowSize},${flowArrow.y - flowArrowSize * 0.8} ${flowArrow.x + flowArrowSize},${flowArrow.y} ${flowArrow.x - flowArrowSize},${flowArrow.y + flowArrowSize * 0.8}`
              : `${flowArrow.x + flowArrowSize},${flowArrow.y - flowArrowSize * 0.8} ${flowArrow.x - flowArrowSize},${flowArrow.y} ${flowArrow.x + flowArrowSize},${flowArrow.y + flowArrowSize * 0.8}`
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
      {readableSegmentTypeBadges.map((segmentLabel) => (
        <g
          key={`${id}-segment-type-${segmentLabel.segmentRef}`}
          data-testid={`sld-v2-run-${id}-segment-type-${segmentLabel.segmentRef}`}
          data-segment-ref={segmentLabel.segmentRef}
          data-segment-kind={segmentKind}
          transform={`translate(${segmentLabel.x}, ${segmentLabel.y})`}
          pointerEvents="none"
        >
          <rect
            x={-estimateLabelWidth(segmentLabel.text) / 2 - 7}
            y={-10}
            width={estimateLabelWidth(segmentLabel.text) + 14}
            height={18}
            rx={3}
            fill="#071018"
            stroke={segmentKind === 'overhead_line_sn' ? '#7DD3FC' : '#13C45A'}
            strokeWidth={1.1}
            opacity={0.94}
          />
          <text
            x={0}
            y={3}
            textAnchor="middle"
            fill="#DDF7FF"
            fontFamily="sans-serif"
            fontSize={9}
            fontWeight={800}
            letterSpacing={0.2}
          >
            {segmentLabel.text}
          </text>
        </g>
      ))}
      {readableEndpointResults.map((result) => {
        const color = resultSeverityColor(result.severity);
        const width = Math.max(92, Math.min(180, result.text.length * 6.6 + 18));
        return (
          <g
            key={`${id}-segment-end-result-${result.segmentRef}`}
            data-testid={`sld-v2-run-${id}-segment-end-result-${result.segmentRef}`}
            data-segment-ref={result.segmentRef}
            data-result-anchor="segment-end"
            transform={`translate(${result.x}, ${result.y})`}
            pointerEvents="none"
          >
            <line x1={0} y1={0} x2={0} y2={14} stroke={color} strokeWidth={1} opacity={0.75} />
            <rect
              x={-width / 2}
              y={14}
              width={width}
              height={20}
              rx={3}
              fill="#071018"
              stroke={color}
              strokeWidth={1.2}
              opacity={0.96}
            />
            <text
              x={0}
              y={28}
              textAnchor="middle"
              fill="#F4FBFF"
              fontFamily="monospace"
              fontSize={9}
              fontWeight={800}
            >
              {result.text}
            </text>
          </g>
        );
      })}
      {pendingEndpoint && terminalPoint && (
        <g
          data-testid={`sld-v2-run-${id}-pending-end`}
          data-pending-target-ref={pendingEndpointTargetId}
          data-pending-action-label={pendingEndpointLabel.title}
          data-pending-action-detail={pendingEndpointLabel.detail}
          aria-label={`${pendingEndpointLabel.title}: ${pendingEndpointLabel.detail}`}
          onClick={effectiveOnClick ? (e) => { e.stopPropagation(); effectiveOnClick(pendingEndpointTargetId); } : undefined}
          style={{ cursor: effectiveOnClick ? 'pointer' : 'default' }}
        >
          <rect
            x={terminalPoint.x - 28}
            y={terminalPoint.y - 17}
            width={56}
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
        </g>
      )}
    </g>
  );
}


function pendingEndpointLabels(
  segmentKind: CableRunRendererProps['segmentKind'],
): { title: string; detail: string } {
  if (segmentKind === 'overhead_line_sn') {
    return {
      title: 'Zakończ linię napowietrzną SN',
      detail: 'słup rozgałęźny / stacja słupowa / kolejny odcinek',
    };
  }
  return {
    title: 'Zakończ kabel SN',
    detail: 'stacja SN/nN / ZK SN / kolejny odcinek kablowy',
  };
}

type Point = { x: number; y: number };

function buildPositiveHitRects(
  points: readonly Point[],
  minThickness: number,
): Array<{ x: number; y: number; width: number; height: number }> {
  const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
  const halfThickness = Math.max(6, minThickness / 2);
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const horizontal = Math.abs(start.y - end.y) <= Math.abs(start.x - end.x);
    rects.push({
      x: minX - (horizontal ? 0 : halfThickness),
      y: minY - (horizontal ? halfThickness : 0),
      width: Math.max(maxX - minX, 1) + (horizontal ? 0 : halfThickness * 2),
      height: Math.max(maxY - minY, 1) + (horizontal ? halfThickness * 2 : 0),
    });
  }
  return rects;
}

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

const STATION_PORT_SNAP_TOLERANCE_PX = 80;

function snapSegmentPathToCurrentStationPorts(
  points: readonly Point[],
  gaps: readonly CableRunStationPortGap[],
): readonly Point[] {
  if (points.length < 2 || gaps.length === 0) return points;
  return points.map((point, index) => {
    const previous = points[index - 1];
    const next = points[index + 1];
    const isHorizontalEndpoint =
      (previous !== undefined && Math.abs(previous.y - point.y) <= 0.5)
      || (next !== undefined && Math.abs(next.y - point.y) <= 0.5);
    if (!isHorizontalEndpoint) return point;
    const snappedX = nearestStationPortBoundaryX(point, gaps);
    return snappedX === null ? point : { ...point, x: snappedX };
  });
}

function nearestStationPortBoundaryX(
  point: Point,
  gaps: readonly CableRunStationPortGap[],
): number | null {
  let best: { x: number; distance: number } | null = null;
  for (const gap of gaps) {
    if (Math.abs(gap.y - point.y) > 0.5) continue;
    const boundaries = gap.outputX === null
      ? [gap.inputX]
      : [Math.min(gap.inputX, gap.outputX), Math.max(gap.inputX, gap.outputX)];
    for (const boundary of boundaries) {
      const distance = Math.abs(point.x - boundary);
      if (distance > STATION_PORT_SNAP_TOLERANCE_PX) continue;
      if (!best || distance < best.distance) best = { x: boundary, distance };
    }
  }
  return best?.x ?? null;
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
    const yOffsets = segmentLabelCandidateOffsets(labels.length);
    for (const yOffset of yOffsets) {
      candidate = { ...label, y: label.y + yOffset };
      if (!placed.some((other) => segmentLabelsOverlap(candidate, other))) {
        break;
      }
    }
    if (placed.some((other) => segmentLabelsOverlap(candidate, other))) {
      const overflowOffset = -20 * (placed.length + 1);
      candidate = { ...label, y: label.y + overflowOffset };
    }
    placed.push(candidate);
    return candidate;
  });
}

function segmentLabelCandidateOffsets(labelCount: number): number[] {
  const laneCount = Math.max(8, labelCount * 2 + 2);
  const offsets: number[] = [0];
  for (let lane = 1; lane <= laneCount; lane += 1) {
    offsets.push(-20 * lane, 20 * lane);
  }
  return offsets;
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

function segmentTypeBadgeText(
  segmentKind: CableRunRendererProps['segmentKind'],
  variant: CableSegmentVariantHint | undefined,
): string {
  const medium = segmentKind === 'overhead_line_sn' ? 'Linia nap. SN' : 'Kabel SN';
  if (!variant) return medium;
  const parts: string[] = [];
  if (variant.insulation !== 'UNKNOWN') parts.push(variant.insulation);
  if (variant.conductor !== 'UNKNOWN') parts.push(variant.conductor);
  return parts.length > 0 ? `${medium} · ${parts.join(' ')}` : medium;
}

function segmentTypeBadgePoint(
  points: readonly Point[],
  index: number,
): CableRunSegmentLabel {
  const midpoint = findLongestHorizontalSegmentMidpoint(points)
    ?? (points.length >= 2
      ? { x: (points[0].x + points[points.length - 1].x) / 2, y: (points[0].y + points[points.length - 1].y) / 2 }
      : { x: 0, y: 0 });
  const laneOffset = index % 2 === 0 ? -26 : 48;
  return {
    segmentRef: '',
    text: '',
    x: midpoint.x,
    y: midpoint.y + laneOffset,
  };
}

function declutterSegmentTypeBadges(
  labels: readonly CableRunSegmentLabel[],
): CableRunSegmentLabel[] {
  const placed: CableRunSegmentLabel[] = [];
  return labels.map((label) => {
    let candidate = label;
    for (const offset of [0, -20, 20, -40, 40, -60, 60]) {
      candidate = { ...label, y: label.y + offset };
      if (!placed.some((other) => segmentLabelsOverlap(candidate, other))) break;
    }
    placed.push(candidate);
    return candidate;
  });
}

function declutterSegmentEndpointResults(
  results: readonly CableRunSegmentEndpointResult[],
): CableRunSegmentEndpointResult[] {
  const placed: CableRunSegmentEndpointResult[] = [];
  return results.map((result, index) => {
    let candidate = { ...result, y: result.y + (index % 2 === 0 ? 0 : 26) };
    for (const offset of [0, 26, -26, 52, -52, 78]) {
      candidate = { ...result, y: result.y + offset };
      const overlaps = placed.some((other) => (
        Math.abs(candidate.y - other.y) < 26
        && Math.abs(candidate.x - other.x) < 118
      ));
      if (!overlaps) break;
    }
    placed.push(candidate);
    return candidate;
  });
}

function resultSeverityColor(
  severity: CableRunSegmentEndpointResult['severity'],
): string {
  if (severity === 'CRITICAL') return '#FF6B6B';
  if (severity === 'IMPORTANT') return '#FF8B5C';
  if (severity === 'WARNING') return '#FFD166';
  return '#7EE0B5';
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

function overviewRunLabel(runKind: CableRunRendererProps['runKind']): string {
  switch (runKind) {
    case 'branch':
      return 'Odgałęzienie SN';
    case 'ring':
      return 'Pierścień SN';
    case 'loop':
      return 'Pętla SN';
    case 'main_trunk':
    default:
      return 'Magistrala SN';
  }
}

function topologyDirectionArrowSize(viewportScale: number | null | undefined): number {
  if (viewportScale === null || viewportScale === undefined || !Number.isFinite(viewportScale) || viewportScale <= 0) {
    return 5;
  }
  return 5 * Math.min(4, Math.max(1, 0.9 / viewportScale));
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
