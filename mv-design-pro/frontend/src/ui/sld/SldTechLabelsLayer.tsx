/**
 * SLD Technical Labels Layer — BLOK 7 (UX PRO++)
 *
 * Warstwa etykiet technicznych na schemacie SLD.
 * Wyświetla dane operacyjne bezpośrednio przy elementach.
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results as Overlay (never modifies model)
 * - ui_canonical_parity.md: CANONICAL/Canonical-grade technical labels
 *
 * ETYKIETY:
 * - LineBranch:        typ (CABLE/LINE) • obciążenie% (jeśli wyniki)
 * - TransformerBranch: obciążenie% (jeśli wyniki)
 * - Switch:            "NOP" dla otwartych łączników w pętli
 * - Source:            tryb pracy (Slack/PQ)
 * - Bus:               napięcie kV (jeśli wyniki)
 *
 * RULES:
 * - READ-ONLY: brak mutacji modelu
 * - pointer-events-none (kliknięcia przelotowe)
 * - Deterministyczne sortowanie po elementId
 */

import { useMemo } from 'react';
import type { AnySldSymbol } from '../sld-editor/types';
import type { ViewportState } from './types';
import { mapPositionToScreen } from './overlayUtils';
import { useResultsInspectorStore } from '../results-inspector/store';

// =============================================================================
// Stałe stylistyczne
// =============================================================================

/** Kolor tła etykiety - dark SCADA, bez jasnych nalepek na schemacie */
const LABEL_BG = 'rgba(2, 9, 18, 0.92)';
/** Kolor obramowania etykiety */
const LABEL_BORDER = 'rgba(56, 189, 248, 0.42)';
/** Kolor czcionki — domyślny */
const LABEL_COLOR_DEFAULT = '#DDE8F2';
/** Kolor czcionki — obciążenie wysokie (>80%) */
const LABEL_COLOR_HIGH = '#F87171';
/** Kolor czcionki — obciążenie umiarkowane (50-80%) */
const LABEL_COLOR_MED = '#FBBF24';
/** Kolor czcionki — OK (<50%) */
const LABEL_COLOR_OK = '#34D399';
/** Kolor etykiety NOP */
const LABEL_COLOR_NOP = '#FBBF24';
/** Rozmiar czcionki px */
const FONT_SIZE = 10;
/** Padding etykiety px */
const PADDING = 3;
/** Promień zaokrąglenia etykiety */
const BORDER_RADIUS = 2;
/** Min zoom do wyświetlania etykiet */
const MIN_ZOOM_FOR_LABELS = 0.5;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Kolor dla wartości procentowej obciążenia.
 */
function loadingColor(pct: number): string {
  if (pct >= 80) return LABEL_COLOR_HIGH;
  if (pct >= 50) return LABEL_COLOR_MED;
  return LABEL_COLOR_OK;
}

/**
 * Formatuje obciążenie z kolorem.
 */
function formatLoadingLabel(pct: number): string {
  return `${pct.toFixed(0)}%`;
}

// =============================================================================
// Typy
// =============================================================================

interface TechLabelData {
  elementId: string;
  x: number;
  y: number;
  lines: Array<{ text: string; color: string }>;
}

// =============================================================================
// Props
// =============================================================================

export interface SldTechLabelsLayerProps {
  /** Symbole do wyświetlenia etykiet */
  symbols: AnySldSymbol[];
  /** Stan viewportu (pan/zoom) */
  viewport: ViewportState;
  /** Szerokość canvasa px */
  width: number;
  /** Wysokość canvasa px */
  height: number;
  /** Czy warstwa widoczna */
  visible?: boolean;
}

// =============================================================================
// Główny komponent
// =============================================================================

/**
 * Warstwa etykiet technicznych na SLD.
 * Renderuje się jako SVG absolutnie pozycjonowany nad kanwasem.
 */
export function SldTechLabelsLayer({
  symbols,
  viewport,
  width,
  height,
  visible = true,
}: SldTechLabelsLayerProps) {
  // Pobierz wyniki z store (opcjonalne — etykiety działają bez wyników)
  const sldOverlay = useResultsInspectorStore((state) => state.sldOverlay);

  // Mapy wyników (jeśli dostępne)
  // SldOverlayBranch: symbol_id | branch_id -> loading_pct
  const branchLoadingMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!sldOverlay) return map;
    for (const b of sldOverlay.branches) {
      const loading = b.loading_pct;
      if (loading !== undefined) {
        if (b.symbol_id) map.set(b.symbol_id, loading);
        if (b.branch_id) map.set(b.branch_id, loading);
      }
    }
    return map;
  }, [sldOverlay]);

  // SldOverlayBus: symbol_id | node_id -> u_kv
  const busVoltageMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!sldOverlay) return map;
    for (const b of sldOverlay.nodes) {
      const uKv = b.u_kv;
      if (uKv !== undefined) {
        if (b.symbol_id) map.set(b.symbol_id, uKv);
        if (b.node_id) map.set(b.node_id, uKv);
      }
    }
    return map;
  }, [sldOverlay]);

  // Buduj dane etykiet — deterministycznie sortowane po elementId
  const labels = useMemo((): TechLabelData[] => {
    if (!visible || viewport.zoom < MIN_ZOOM_FOR_LABELS) return [];

    const sorted = [...symbols].sort((a, b) => a.elementId.localeCompare(b.elementId));
    const result: TechLabelData[] = [];

    for (const symbol of sorted) {
      const screenPos = mapPositionToScreen(symbol.position, viewport);
      const lines: Array<{ text: string; color: string }> = [];

      if (symbol.elementType === 'LineBranch') {
        const loadPct = branchLoadingMap.get(symbol.elementId);
        if (loadPct !== undefined) {
          lines.push({ text: formatLoadingLabel(loadPct), color: loadingColor(loadPct) });
        }
      } else if (symbol.elementType === 'TransformerBranch') {
        // Obciążenie transformatora
        const loadPct = branchLoadingMap.get(symbol.elementId);
        if (loadPct !== undefined) {
          lines.push({ text: `TR ${formatLoadingLabel(loadPct)}`, color: loadingColor(loadPct) });
        }
      } else if (symbol.elementType === 'Switch') {
        const sw = symbol as { switchState?: string; switchType?: string };
        // NOP — Normal Open Point (otwarty łącznik w układzie pętlowym)
        if (sw.switchState === 'OPEN') {
          lines.push({ text: 'NOP', color: LABEL_COLOR_NOP });
        }
      } else if (symbol.elementType === 'Bus') {
        // Napięcie szyny z wyników
        const voltKv = busVoltageMap.get(symbol.elementId);
        if (voltKv !== undefined) {
          lines.push({ text: `${voltKv.toFixed(2)} kV`, color: LABEL_COLOR_DEFAULT });
        }
      } else if (symbol.elementType === 'Source') {
        // Źródło ma kartę/inspektor; nie pokazujemy pływających etykiet bez wyników.
      }

      if (lines.length === 0) continue;

      // Pozycja etykiety — przesunięta w prawo od elementu
      const OFFSET_X = 12 * viewport.zoom;
      const OFFSET_Y = -8 * viewport.zoom;

      result.push({
        elementId: symbol.elementId,
        x: screenPos.x + OFFSET_X,
        y: screenPos.y + OFFSET_Y,
        lines,
      });
    }

    return result;
  }, [symbols, viewport, visible, branchLoadingMap, busVoltageMap]);

  if (!visible || viewport.zoom < MIN_ZOOM_FOR_LABELS) return null;

  return (
    <svg
      data-testid="sld-tech-labels-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {labels.map((label) => {
        const lineHeight = FONT_SIZE + 2;
        const textWidth = Math.max(...label.lines.map((l) => l.text.length)) * 6;
        const boxWidth = textWidth + PADDING * 2;
        const boxHeight = label.lines.length * lineHeight + PADDING * 2;

        return (
          <g
            key={label.elementId}
            data-testid={`sld-tech-label-${label.elementId}`}
            transform={`translate(${label.x},${label.y})`}
          >
            {/* Tło etykiety */}
            <rect
              x={0}
              y={0}
              width={boxWidth}
              height={boxHeight}
              fill={LABEL_BG}
              stroke={LABEL_BORDER}
              strokeWidth={0.5}
              rx={BORDER_RADIUS}
              ry={BORDER_RADIUS}
            />
            {/* Linie tekstu */}
            {label.lines.map((line, idx) => (
              <text
                key={idx}
                x={PADDING}
                y={PADDING + (idx + 1) * lineHeight - 2}
                fontFamily="'Consolas', 'Courier New', monospace"
                fontSize={FONT_SIZE}
                fontWeight={idx === 0 ? 'normal' : 'bold'}
                fill={line.color}
              >
                {line.text}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default SldTechLabelsLayer;
