/**
 * LayerTogglePanel — Iter 9 (per audit SCADA iter 4: "BRAK panelu 13 warstw").
 *
 * Pure presentational component dla panelu 13 warstw SLD (SLD_INDUSTRIAL_SPEC § 5.2).
 * Renderuje listę warstw z checkboxami w stylu SCADA/WinCC.
 *
 * INVARIANTS:
 * - Pure component (state przekazywany z parenta — Single Model Rule).
 * - NO physics, NO model mutation (presentation only).
 * - Polskie etykiety 100% (per V12K canon).
 * - Deterministic ordering (LAYER_IDS readonly tuple).
 *
 * Reference:
 * - frontend/src/ui/sld/v2/lod/layerToggle.ts (state machine + LAYER_IDS)
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 5.2 (13 warstw toggle'owalnych)
 * - docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md AC-08 (LOD wzmacnia znaczenie)
 */

import { useMemo } from 'react';

import type { LodLevel } from './LodPolicy';
import {
  LAYER_IDS,
  LAYER_LABELS_PL,
  isLayerVisible,
  type LayerId,
  type LayerState,
} from './layerToggle';

export interface LayerTogglePanelProps {
  /** Bieżący stan warstw (overrides). */
  readonly state: LayerState;
  /** Bieżący LOD (driver dla defaultów). */
  readonly currentLod: LodLevel;
  /** Callback gdy użytkownik kliknie checkbox warstwy. */
  readonly onToggleLayer: (layerId: LayerId) => void;
  /** Opcjonalny callback dla reset all. */
  readonly onResetAll?: () => void;
  /** Opcjonalny className zewnętrzny. */
  readonly className?: string;
}

/**
 * Panel 13 warstw SLD — SCADA-grade toggle UI.
 *
 * Layout: nagłówek (Warstwy + reset CTA) + lista 13 wierszy
 * (checkbox + etykieta PL). Highlight aktualnego LOD jako badge.
 */
export function LayerTogglePanel({
  state,
  currentLod,
  onToggleLayer,
  onResetAll,
  className,
}: LayerTogglePanelProps) {
  const layers = useMemo(
    () =>
      LAYER_IDS.map((id) => ({
        id,
        label: LAYER_LABELS_PL[id],
        visible: isLayerVisible(state, id, currentLod),
        overridden: state.overrides[id] !== null,
      })),
    [state, currentLod],
  );

  return (
    <section
      className={[
        'flex flex-col gap-1 rounded border border-scada-border bg-scada-panel/95 p-2 text-[11px] text-scada-text shadow-lg',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Panel warstw schematu jednokreskowego"
      data-testid="sld-layer-toggle-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b border-scada-border pb-1">
        <span className="font-semibold uppercase tracking-wider text-scada-muted">
          Warstwy ({LAYER_IDS.length})
        </span>
        <span
          className="rounded border border-scada-border bg-scada-surface px-1.5 py-0.5 font-mono-eng text-[10px] text-scada-muted"
          aria-label={`Bieżący poziom szczegółowości: LOD ${currentLod}`}
        >
          LOD {currentLod}
        </span>
        {onResetAll && (
          <button
            type="button"
            onClick={onResetAll}
            className="rounded border border-scada-border px-1.5 py-0.5 text-[10px] text-scada-muted hover:bg-scada-hover-nav hover:text-scada-text"
            data-testid="sld-layer-toggle-reset"
          >
            Reset
          </button>
        )}
      </header>

      <ul className="flex flex-col gap-px">
        {layers.map((layer) => (
          <li key={layer.id}>
            <label
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-scada-hover-nav"
              data-testid={`sld-layer-toggle-${layer.id}`}
            >
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={() => onToggleLayer(layer.id)}
                className="h-3 w-3 cursor-pointer accent-cyan-400"
                aria-label={`Warstwa ${layer.label}`}
              />
              <span
                className={layer.visible ? 'text-scada-text' : 'text-scada-muted'}
              >
                {layer.label}
              </span>
              {layer.overridden && (
                <span
                  className="ml-auto font-mono-eng text-[9px] text-amber-300"
                  aria-label="Ręczne nadpisanie"
                  title="Warstwa nadpisana ręcznie (różna od domyślnej dla LOD)"
                >
                  ✱
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
