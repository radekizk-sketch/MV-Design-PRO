/**
 * SldSemanticMinimap — V12 § 5.7 — Semantyczna mini-mapa dużych sieci
 *
 * Cel:
 * - Wyświetla strukturę sieci (nie kopię rysunku) jako abstrahowaną miniaturę.
 * - Pokazuje aktualną ramkę widoku (viewport) na tle całości.
 * - Umożliwia szybką nawigację — klik = zmiana środka widoku.
 *
 * Architektura:
 * - Renderuje tylko ELEMENTY SZKIELETOWE (Bus, Station, ZKSN, BranchPole, LineBranch)
 *   sprowadzone do prostych punktów i linii — nie kopiuje pełnych symboli.
 * - Brak obliczeń fizycznych. Brak mutacji ENM. Tylko rzut geometrii z symbolsów.
 * - Reaguje wyłącznie na zmiany symboli i viewportu (nie na zmiany modelu).
 * - Wymiary mini-mapy są stałe (180 × 120 px) — przyszłe resizable nie wymaga zmian interfejsu.
 *
 * DETERMINISTYCZNOŚĆ:
 * - Ten sam zestaw symboli + viewport → identyczna mini-mapa.
 * - Brak losowości, brak animacji CPU.
 */

import React, { useMemo, useCallback } from 'react';
import type { AnySldSymbol } from '../sld-editor/types';
import type { ViewportState } from './types';
import { calculateSymbolsBounds } from './types';
import { isElementInSkeletonView } from './sldLayerFiltersStore';
import type { ElementType } from '../types';

const MINIMAP_W = 180;
const MINIMAP_H = 120;
const MINIMAP_PADDING = 6;
const SKELETON_TYPES: ReadonlySet<ElementType> = new Set([
  'Bus', 'BusNN', 'Station', 'ZKSN', 'BranchPole', 'Source', 'LineBranch',
  'Terminal', 'NOP', 'SecondaryLink',
]);

function isMiniSymbol(s: AnySldSymbol): boolean {
  return SKELETON_TYPES.has(s.elementType as ElementType) || isElementInSkeletonView(s.elementType as ElementType);
}

export interface SldSemanticMinimapProps {
  symbols: AnySldSymbol[];
  viewport: ViewportState;
  canvasWidth: number;
  canvasHeight: number;
  onNavigate: (worldX: number, worldY: number) => void;
  className?: string;
}

export function SldSemanticMinimap({
  symbols,
  viewport,
  canvasWidth,
  canvasHeight,
  onNavigate,
  className = '',
}: SldSemanticMinimapProps) {
  const skeletonSymbols = useMemo(
    () => symbols.filter(isMiniSymbol),
    [symbols],
  );

  const bounds = useMemo(
    () => calculateSymbolsBounds(skeletonSymbols.length > 0 ? skeletonSymbols : symbols),
    [skeletonSymbols, symbols],
  );

  // Skalowanie: cały świat → obszar minimapy
  const scale = useMemo(() => {
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    const availW = MINIMAP_W - 2 * MINIMAP_PADDING;
    const availH = MINIMAP_H - 2 * MINIMAP_PADDING;
    const s = Math.min(availW / bounds.width, availH / bounds.height);
    return {
      s,
      offX: MINIMAP_PADDING - bounds.minX * s + (availW - bounds.width * s) / 2,
      offY: MINIMAP_PADDING - bounds.minY * s + (availH - bounds.height * s) / 2,
    };
  }, [bounds]);

  // Ramka aktualnego viewportu w przestrzeni mini-mapy
  const viewRect = useMemo(() => {
    if (!scale) return null;
    // Narożnik lewego górnego kąta widoku w przestrzeni świata
    const worldLeft = -viewport.offsetX / viewport.zoom;
    const worldTop = -viewport.offsetY / viewport.zoom;
    const worldRight = worldLeft + canvasWidth / viewport.zoom;
    const worldBottom = worldTop + canvasHeight / viewport.zoom;

    return {
      x: worldLeft * scale.s + scale.offX,
      y: worldTop * scale.s + scale.offY,
      w: (worldRight - worldLeft) * scale.s,
      h: (worldBottom - worldTop) * scale.s,
    };
  }, [scale, viewport, canvasWidth, canvasHeight]);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!scale) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const miniX = e.clientX - rect.left;
      const miniY = e.clientY - rect.top;
      const worldX = (miniX - scale.offX) / scale.s;
      const worldY = (miniY - scale.offY) / scale.s;
      onNavigate(worldX, worldY);
    },
    [scale, onNavigate],
  );

  if (!scale || skeletonSymbols.length === 0) return null;

  return (
    <div
      className={`pointer-events-auto select-none overflow-hidden rounded border border-scada-border bg-scada-panel/90 shadow-md ${className}`}
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
      data-testid="sld-semantic-minimap"
      title="Mini-mapa sieci — kliknij, aby przejść do miejsca"
    >
      <svg
        width={MINIMAP_W}
        height={MINIMAP_H}
        style={{ cursor: 'crosshair', display: 'block' }}
        aria-label="Semantyczna mini-mapa sieci"
        onClick={handleClick}
        data-testid="sld-minimap-svg"
      >
        {/* Tło */}
        <rect x={0} y={0} width={MINIMAP_W} height={MINIMAP_H} fill="#1a1f2e" />

        {/* Symbole szkieletowe */}
        {skeletonSymbols.map((s) => {
          const mx = s.position.x * scale.s + scale.offX;
          const my = s.position.y * scale.s + scale.offY;
          const isBus = s.elementType === 'Bus';
          const isGpz = s.elementType === 'Source';
          return (
            <rect
              key={s.id}
              x={mx - (isBus || isGpz ? 3 : 1.5)}
              y={my - (isBus || isGpz ? 2 : 1.5)}
              width={isBus || isGpz ? 6 : 3}
              height={isBus || isGpz ? 4 : 3}
              fill={isGpz ? '#f59e0b' : isBus ? '#60a5fa' : '#94a3b8'}
              data-testid={`minimap-sym-${s.id}`}
            />
          );
        })}

        {/* Ramka widoku */}
        {viewRect && (
          <rect
            x={Math.max(1, viewRect.x)}
            y={Math.max(1, viewRect.y)}
            width={Math.max(4, Math.min(viewRect.w, MINIMAP_W - 2))}
            height={Math.max(4, Math.min(viewRect.h, MINIMAP_H - 2))}
            fill="rgba(96,165,250,0.12)"
            stroke="#60a5fa"
            strokeWidth={1.5}
            strokeDasharray="3 2"
            data-testid="minimap-viewport-rect"
          />
        )}

        {/* Etykieta */}
        <text
          x={4}
          y={MINIMAP_H - 4}
          fontSize={8}
          fill="#94a3b8"
          fontFamily="monospace"
          data-testid="minimap-label"
        >
          mini-mapa
        </text>
      </svg>
    </div>
  );
}

export default SldSemanticMinimap;
