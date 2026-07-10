/**
 * SLD V3 F6b — `SldCanvasV3`: kanwa React renderująca `SceneV3` z
 * `buildSceneV3` (SLD_CAD_SPEC_V3 §6 „Hierarchia graficzna", §7 „Kontrakt
 * LOD"; REBUILD_PLAN_V3 F6b). Zero fizyki, zero mutacji modelu — WYŁĄCZNIE
 * mapowanie danych już policzonych przez `scene/buildScene.ts` na SVG +
 * kamera (pan/zoom/pinch) + LOD wynikające ze skali kamery + nakładka
 * energizacji (kolor, spec §6 P5 — geometria bez zmian).
 *
 * Warstwy (spec §6, kolejność rysowania — segmenty pod symbolami pod
 * etykietami, jak `CompositionPreview`/`compose/preview.tsx`, ten sam wzorzec
 * mapowania): segments → symbols → labels, wewnątrz `sheet/Frame.tsx`
 * (`SheetFrame` — ramka arkusza, strefy, legenda, spec §2/§10).
 *
 * Kamera: patrz nagłówek `canvas/camera.ts` (reuse v2 `ViewportController`
 * dla matematyki pan/zoom/fit; własna histereza LOD 3-poziomowa; własny
 * pointer/pinch wiring — v2 nie ma ani eksportowanego hooka kamery, ani
 * obsługi dotyku, patrz STOP-notatka tam).
 *
 * Nakładka stanu: patrz `canvas/overlay.ts` (`SldV3Overlay` — kontrakt
 * czytelny, bez integracji z solver companion w tej dostawie, STOP-notatka
 * tam).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../scene/buildScene';
import { SYMBOL_DEFS } from '../symbols/defs';
import { SYMBOL_GLYPHS, V3_STROKE_BASE } from '../symbols/glyphs';
import { LABEL_TYPOGRAPHY } from '../core/text';
import type { OwnedLabel } from '../layout/labels';
import { SEGMENT_STROKE_WIDTH, pointsToPath, type PreviewElementMeta, type PreviewSegment, type PreviewSymbol } from '../compose/preview';
import { SheetFrame } from '../sheet/Frame';
import {
  boundingBoxOfRect,
  cameraReducer,
  cameraViewBox,
  computeInitialCameraState,
  pointerDistance,
  pointerMidpoint,
} from './camera';
import type { SldV3Overlay } from './overlay';

const SLD_V3_BACKGROUND = '#0B0F14';
/** Nakładka energizacji (spec §6 P5): kolor akcentu, NIE geometria. */
const OVERLAY_ENERGIZED_STROKE = '#2ECC71';
const OVERLAY_DEENERGIZED_STROKE = '#5B6B76';
/** Wrażliwość zoomu kółkiem — kalibracja wizualna (spec nie podaje liczby;
 *  jeden „tick" typowej myszy, deltaY≈100, daje ~16% zmiany skali). */
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

export interface SldCanvasV3Props {
  readonly snapshot: EnergyNetworkModel;
  readonly width: number;
  readonly height: number;
  /** Nakładka wyników solvera (energizacja) — patrz `canvas/overlay.ts`.
   *  Brak = rysunek bazowy mono, bez nakładki koloru. */
  readonly overlay?: SldV3Overlay;
  /** Klik w symbol — `testId` z `PreviewSymbol.meta.testId` (lub fallback
   *  deterministyczny indeksem, gdy scena go nie niesie). */
  readonly onElementClick?: (testId: string) => void;
  /** Escape hatch (test/harness/embedding, np. Results Browser centrujący na
   *  konkretnym LOD): nadpisuje LOD wynikające z kamery. Domyślnie (brak
   *  propa) LOD wynika z progów zoomu kamery (spec §7) — zachowanie
   *  produkcyjne. */
  readonly lodOverride?: SceneLod;
}

function strokeForEnergization(energized: boolean | undefined): string | undefined {
  if (energized === true) return OVERLAY_ENERGIZED_STROKE;
  if (energized === false) return OVERLAY_DEENERGIZED_STROKE;
  return undefined;
}

function symbolTestId(symbol: PreviewSymbol, index: number): string {
  return symbol.meta?.testId ?? `sld-v3-symbol-${index}`;
}

function segmentTestId(segment: PreviewSegment, index: number): string {
  return segment.meta?.testId ?? `sld-v3-segment-${index}`;
}

function parityKeysOf(meta: PreviewElementMeta | undefined): string | undefined {
  if (!meta) return undefined;
  if (meta.parityKeys && meta.parityKeys.length > 0) return meta.parityKeys.join(' ');
  return meta.parityKey;
}

function SceneSymbolNode(props: {
  readonly symbol: PreviewSymbol;
  readonly index: number;
  readonly overlay: SldV3Overlay | undefined;
  readonly onElementClick: ((testId: string) => void) | undefined;
}): JSX.Element {
  const { symbol, index, overlay, onElementClick } = props;
  const def = SYMBOL_DEFS[symbol.symbolId];
  const Glyph = SYMBOL_GLYPHS[symbol.symbolId];
  const testId = symbolTestId(symbol, index);
  const stroke = strokeForEnergization(overlay?.energizedByTestId[testId]);
  return (
    <g
      data-testid={testId}
      data-parity-key={parityKeysOf(symbol.meta)}
      onClick={onElementClick ? () => onElementClick(testId) : undefined}
      style={onElementClick ? { cursor: 'pointer' } : undefined}
    >
      {/* Cel kliku powiększony do bboxa symbolu (ergonomia — glify IEC bywają
       *  wąskie, np. odłącznik 16×24 rysowany kreską). Zero widocznego stylu. */}
      <rect x={symbol.x} y={symbol.y} width={def.width} height={def.height} fill="transparent" />
      <Glyph x={symbol.x} y={symbol.y} state={symbol.state} stroke={stroke} />
    </g>
  );
}

function SceneSegmentNode(props: {
  readonly segment: PreviewSegment;
  readonly index: number;
  readonly overlay: SldV3Overlay | undefined;
}): JSX.Element | null {
  const { segment, index, overlay } = props;
  if (segment.points.length < 2) return null;
  const testId = segmentTestId(segment, index);
  const kind = segment.meta?.kind ?? 'sn';
  const strokeWidth = SEGMENT_STROKE_WIDTH[kind];
  const strokeDasharray = segment.meta?.dashed ? '4 3' : kind === 'leader' ? '3 2' : undefined;
  const stroke = strokeForEnergization(overlay?.energizedByTestId[testId]) ?? V3_STROKE_BASE;
  return (
    <path
      data-testid={testId}
      data-parity-key={parityKeysOf(segment.meta)}
      d={pointsToPath(segment.points)}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
    />
  );
}

function SceneLabelNode(props: { readonly label: OwnedLabel; readonly index: number }): JSX.Element {
  const { label, index } = props;
  const typo = LABEL_TYPOGRAPHY[label.labelClass];
  const cx = label.rect.x + label.rect.width / 2;
  const cy = label.rect.y + label.rect.height / 2;
  const textTransform = label.rotated ? `rotate(-90, ${cx}, ${cy})` : undefined;
  return (
    <g
      data-testid={`sld-v3-label-${index}`}
      data-owner-ref={label.ownerRef}
      data-owner-kind={label.ownerKind}
      data-slot-index={label.slotIndex}
    >
      {label.leader && (
        <path
          d={pointsToPath([label.leader.from, label.leader.to])}
          fill="none"
          stroke={V3_STROKE_BASE}
          strokeWidth={SEGMENT_STROKE_WIDTH.leader}
          strokeDasharray="2 2"
        />
      )}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={textTransform}
        fill={V3_STROKE_BASE}
        fontFamily="sans-serif"
        fontSize={typo.fontSize}
        fontWeight={typo.fontWeight}
      >
        {label.text}
      </text>
    </g>
  );
}

/** Rozmiar arkusza (spec §2/§10) obejmujący cały bbox sceny — margines GRID
 *  jak w F4/F5 (przestrzeń z treści, nie stała, P1). */
function sheetSizeFor(scene: SceneV3): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(scene.bbox.x + scene.bbox.width, 0),
    height: Math.max(scene.bbox.y + scene.bbox.height, 0),
  };
}

/** Punkt kliencki (page) → lokalny względem SVG (rect-relative) — `zoomToCursor`
 *  (v2 `ViewportController`, reużyta) zakłada „screen" = piksele WEWNĄTRZ
 *  elementu, nie page-absolute (ten sam wzorzec co `SldCanvasV2.handleWheel`:
 *  `e.clientX - rect.left`). W jsdom (testy) `getBoundingClientRect()` zwraca
 *  zera, więc lokalny punkt = kliencki — zero wpływu na testy. */
function toLocalPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): { x: number; y: number } {
  if (!svg) return { x: clientX, y: clientY };
  const rect = svg.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/**
 * Kanwa v3: renderuje `SceneV3` (`buildSceneV3`) do SVG. Kamera (pan/zoom/
 * pinch) steruje LOD progami zoomu (histereza, `canvas/camera.ts`) — scena
 * per LOD cache'owana `useMemo`. Interakcja minimalna: klik w symbol woła
 * `onElementClick`; brak własnej selekcji/CAD-edycji (poza zakresem F6b).
 */
export function SldCanvasV3(props: SldCanvasV3Props): JSX.Element {
  const { snapshot, width, height, overlay, onElementClick, lodOverride } = props;

  // Bbox dopasowania kamery: LOD 2 (najpełniejsza scena) — niezależne od tego,
  // jaki LOD jest faktycznie renderowany na starcie (skala startowa dopiero
  // po fit-cie decyduje o LOD renderowanym, patrz `computeInitialCameraState`).
  const fitBbox = useMemo(() => boundingBoxOfRect(buildSceneV3(snapshot, 2).bbox), [snapshot]);
  const viewportSize = useMemo(() => ({ width, height }), [width, height]);

  const [camera, dispatch] = useReducer(
    cameraReducer,
    { bbox: fitBbox, viewportSize },
    (arg) => computeInitialCameraState(arg.bbox, arg.viewportSize),
  );

  const effectiveLod: SceneLod = lodOverride ?? camera.lod;
  const scene = useMemo(() => buildSceneV3(snapshot, effectiveLod), [snapshot, effectiveLod]);
  const sheetSize = useMemo(() => sheetSizeFor(scene), [scene]);
  const viewBox = cameraViewBox(camera.transform, viewportSize);

  // Pointer tracking (pan 1 dotyk/mysz, pinch 2 dotyki) — Pointer Events
  // unifikują mysz/dotyk/pen, jeden kod ścieżki (patrz `canvas/camera.ts`
  // nagłówek: v2 nie ma żadnej obsługi dotyku, budowane od zera).
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistance = useRef<number | null>(null);
  const panAnchor = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    // Optional chaining: jsdom (testy) nie implementuje Pointer Capture API.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = Array.from(pointers.current.values());
    if (active.length === 2) {
      pinchDistance.current = pointerDistance([active[0], active[1]]);
      panAnchor.current = null;
    } else if (active.length === 1) {
      panAnchor.current = active[0];
    }
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = Array.from(pointers.current.values());
    if (active.length === 2 && pinchDistance.current != null) {
      const distance = pointerDistance([active[0], active[1]]);
      const factor = distance / pinchDistance.current;
      const midpoint = pointerMidpoint([active[0], active[1]]);
      dispatch({ type: 'zoom', cursor: toLocalPoint(svgRef.current, midpoint.x, midpoint.y), factor });
      pinchDistance.current = distance;
    } else if (active.length === 1 && panAnchor.current) {
      const delta = { x: active[0].x - panAnchor.current.x, y: active[0].y - panAnchor.current.y };
      dispatch({ type: 'pan', delta });
      panAnchor.current = active[0];
    }
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    pinchDistance.current = null;
    const remaining = Array.from(pointers.current.values());
    panAnchor.current = remaining.length === 1 ? remaining[0] : null;
  }, []);

  // Wheel: listener NATYWNY (nie JSX `onWheel`) z `passive: false` — jak w
  // `SldCanvasV2.handleWheel` (v2/canvas/SldCanvasV2.tsx) — React dołącza
  // syntetyczny `onWheel` jako passive, co uniemożliwia `preventDefault()`
  // (ostrzeżenie w konsoli, strona i tak przewija się pod kanwą).
  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
    const cursor = toLocalPoint(svgRef.current, event.clientX, event.clientY);
    dispatch({ type: 'zoom', cursor, factor });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return (
    <svg
      ref={svgRef}
      data-testid="sld-canvas-v3"
      data-scene-lod={effectiveLod}
      width={width}
      height={height}
      viewBox={viewBox}
      style={{ background: SLD_V3_BACKGROUND, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <SheetFrame width={sheetSize.width} height={sheetSize.height} scaleLabel="wg kamery">
        <g data-testid="sld-v3-segments">
          {scene.segments.map((segment, index) => (
            <SceneSegmentNode key={`segment-${index}`} segment={segment} index={index} overlay={overlay} />
          ))}
        </g>
        <g data-testid="sld-v3-symbols">
          {scene.symbols.map((symbol, index) => (
            <SceneSymbolNode key={`symbol-${index}`} symbol={symbol} index={index} overlay={overlay} onElementClick={onElementClick} />
          ))}
        </g>
        <g data-testid="sld-v3-labels">
          {scene.labels.map((label, index) => (
            <SceneLabelNode key={`label-${index}`} label={label} index={index} />
          ))}
        </g>
      </SheetFrame>
    </svg>
  );
}
