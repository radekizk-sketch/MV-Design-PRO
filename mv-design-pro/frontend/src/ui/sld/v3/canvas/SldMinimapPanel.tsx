/**
 * SLD V3 — panel MINIMAPY (nawigatora kanwy), K11-B §0.1.
 *
 * Komponent CZYSTO PREZENTACYJNY: dostaje policzone kształty i prostokąt kadru
 * (`canvas/minimap.ts` — cała geometria tam, testowalna bez DOM) i zamienia
 * gest wskazania na PUNKT PANELU, który wołający przelicza na punkt świata i
 * podaje kamerze jako `{ type: 'center' }`. Zero fizyki, zero geometrii sceny,
 * zero wiedzy o modelu sieci.
 *
 * Ścieżka NATYWNA (CLAUDE.md §5 „test maskujący defekt produktu"): obsługa
 * stoi na Pointer Events z `setPointerCapture`, tak jak kanwa
 * (`SldCanvasV3.handlePointerMove`) — klik i przeciągnięcie to ten sam gest o
 * różnej długości, więc jedna ścieżka kodu obsługuje oba (klik = wciśnięcie
 * bez ruchu). Dzięki temu spec e2e klikający natywnie ćwiczy dokładnie ten
 * kod, którego używa projektant.
 */
import { useCallback, useRef } from 'react';
import type { MinimapProjection, MinimapRect, MinimapShape } from './minimap';

export interface SldMinimapPanelProps {
  readonly projection: MinimapProjection;
  readonly shapes: readonly MinimapShape[];
  /** Prostokąt bieżącego kadru kamery w pikselach panelu. */
  readonly frame: MinimapRect;
  /** Punkt WSKAZANY w panelu (piksele panelu) — wołający przelicza na świat. */
  readonly onNavigate: (point: { readonly x: number; readonly y: number }) => void;
}

/** Kolory nawigatora: neutralna szarość szkieletu + akcent kadru. Świadomie
 *  NIE z `theme/colorTokens` sceny (napięciowa paleta rysunku) — minimapa jest
 *  kontrolką powłoki, nie rysunkiem technicznym; klasy Tailwind `scada-*` dają
 *  jej ten sam język co pozostałe doki kanwy w OBU motywach. */
const MINIMAP_FRAME_STROKE = '#4EA1FF';

export function SldMinimapPanel(props: SldMinimapPanelProps): JSX.Element {
  const { projection, shapes, frame, onNavigate } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);

  const pointFromEvent = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const bounds = svg.getBoundingClientRect();
    return { x: clientX - bounds.left, y: clientY - bounds.top };
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragging.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const point = pointFromEvent(event.clientX, event.clientY);
      if (point) onNavigate(point);
    },
    [onNavigate, pointFromEvent],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging.current) return;
      event.preventDefault();
      const point = pointFromEvent(event.clientX, event.clientY);
      if (point) onNavigate(point);
    },
    [onNavigate, pointFromEvent],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  return (
    <section
      className="flex flex-col gap-1 rounded border border-scada-border bg-scada-panel/95 p-2 shadow-lg"
      data-testid="sld-v3-minimap-panel"
      aria-label="Nawigator schematu — podgląd całej sieci z bieżącym kadrem"
    >
      <header className="font-mono-eng text-[10px] font-semibold uppercase tracking-wider text-scada-muted">
        Nawigator
      </header>
      <svg
        ref={svgRef}
        data-testid="sld-v3-minimap-svg"
        width={projection.width}
        height={projection.height}
        viewBox={`0 0 ${projection.width} ${projection.height}`}
        className="cursor-crosshair touch-none select-none rounded-sm bg-scada-surface"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <clipPath id="sld-v3-minimap-clip">
            <rect x={0} y={0} width={projection.width} height={projection.height} />
          </clipPath>
        </defs>
        <g clipPath="url(#sld-v3-minimap-clip)" className="text-scada-muted">
          {shapes.map((shape, index) =>
            'points' in shape ? (
              <polyline
                key={`minimap-segment-${index}`}
                points={shape.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="currentColor"
                strokeWidth={shape.kind === 'trunk' ? 1.4 : 0.7}
                opacity={shape.kind === 'trunk' ? 0.95 : 0.6}
              />
            ) : (
              <rect
                key={`minimap-symbol-${index}`}
                x={shape.rect.x}
                y={shape.rect.y}
                width={shape.rect.width}
                height={shape.rect.height}
                fill="currentColor"
                opacity={shape.kind === 'station' ? 0.9 : 0.45}
              />
            ),
          )}
          {/* Prostokąt bieżącego kadru — jedyny element „stanu" nawigatora;
              liczbowo pochodzi WPROST z `viewBox` kamery (patrz
              `worldRectToMinimap`), więc jest sprawdzalny asercją e2e. */}
          <rect
            data-testid="sld-v3-minimap-frame"
            data-frame-x={frame.x}
            data-frame-y={frame.y}
            data-frame-width={frame.width}
            data-frame-height={frame.height}
            x={frame.x}
            y={frame.y}
            width={Math.max(frame.width, 2)}
            height={Math.max(frame.height, 2)}
            fill={MINIMAP_FRAME_STROKE}
            fillOpacity={0.12}
            stroke={MINIMAP_FRAME_STROKE}
            strokeWidth={1.5}
          />
        </g>
      </svg>
    </section>
  );
}
