/**
 * LayersSection — toggleable warstwy widoczności.
 *
 * Brief 2 §4 sekcja 3 + brief 1 §10 — warstwy UX z layerToggle.ts.
 *
 * UWAGA (PR-Q konsolidacji warstw): używa LayerId (UX warstwy z briefa
 * SLD_INDUSTRIAL_SPEC § 5.2) zamiast SldLayerId (warstwy renderera).
 * Mapowanie LayerId → SldLayerId odbywa się w mapLayerStateToRenderVisibility
 * (frontend/src/ui/sld/v2/lod/layerMapping.ts) — wywoływane przez
 * SldWorkspaceContainer przed przekazaniem layerVisibility do SldCanvasV2.
 */

import { LAYER_IDS, LAYER_LABELS_PL, type LayerId } from '../../sld/v2/lod/layerToggle';

export interface LayersSectionProps {
  readonly visibility: Partial<Record<LayerId, boolean>>;
  readonly onToggle: (layer: LayerId, visible: boolean) => void;
}

/**
 * Domyślny stan widoczności dla brakujących wartości w visibility prop.
 * Convention: każda warstwa OFF dopóki rodzic nie poda explicit value.
 */
const DEFAULT_OFF: Partial<Record<LayerId, boolean>> = {};

export function LayersSection(props: LayersSectionProps): JSX.Element {
  const { visibility, onToggle } = props;
  const merged = { ...DEFAULT_OFF, ...visibility };

  return (
    <div data-testid="layers-section" className="flex flex-col py-1">
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Warstwy widoczności
      </div>
      <div className="flex flex-col px-2 py-1">
        {LAYER_IDS.map((id) => {
          const visible = merged[id] ?? false;
          return (
            <label
              key={id}
              data-testid={`layer-toggle-${id}`}
              data-visible={visible}
              className="flex cursor-pointer items-center gap-2 px-1 py-1 text-xs hover:bg-scada-hover-nav"
            >
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => onToggle(id, e.target.checked)}
                className="h-3 w-3 accent-scada-sn"
              />
              <span className={visible ? 'text-scada-text' : 'text-scada-muted'}>
                {LAYER_LABELS_PL[id]}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
