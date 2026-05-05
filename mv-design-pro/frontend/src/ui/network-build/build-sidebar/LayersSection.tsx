/**
 * LayersSection — toggleable warstwy widoczności (PR-13).
 *
 * Brief 2 §4 sekcja 3 + brief 1 §10 — 13 warstw z DEFAULT_LAYER_VISIBILITY.
 */

import {
  DEFAULT_LAYER_VISIBILITY,
  LAYER_LABELS_PL,
  type SldLayerId,
} from '../../sld/v2/lod/LodPolicy';

export interface LayersSectionProps {
  readonly visibility: Partial<Record<SldLayerId, boolean>>;
  readonly onToggle: (layer: SldLayerId, visible: boolean) => void;
}

const LAYER_ORDER: readonly SldLayerId[] = [
  'equipment',
  'labels',
  'ports',
  'measurements',
  'results-pf',
  'results-voltage',
  'results-sc',
  'stability',
  'missing-data',
  'protection',
  'der',
  'topology',
  'alarms',
];

export function LayersSection(props: LayersSectionProps): JSX.Element {
  const { visibility, onToggle } = props;
  const merged = { ...DEFAULT_LAYER_VISIBILITY, ...visibility };

  return (
    <div data-testid="layers-section" className="flex flex-col py-1">
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Warstwy widoczności
      </div>
      <div className="flex flex-col px-2 py-1">
        {LAYER_ORDER.map((id) => {
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
