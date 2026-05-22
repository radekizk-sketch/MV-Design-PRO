/**
 * Layer mapping — most między dwoma systemami warstw SLD.
 *
 * System 1: LayerId (layerToggle.ts) — 14 warstw "UX" z SLD_INDUSTRIAL_SPEC § 5.2.
 *           Co user widzi w LayerTogglePanel: 'Obwód mocy', 'Zabezpieczenia',
 *           'Wyniki obliczeń', 'Etykiety', itp.
 *
 * System 2: SldLayerId (LodPolicy.ts) — 14 warstw renderera SldCanvasV2.
 *           Niskopoziomowe kategorie elementów: equipment, labels, results-pf,
 *           results-sc, der, topology, alarms, missing-data, itp.
 *
 * Dwa systemy mają różną semantykę:
 *  - LayerId = "co user kontroluje" (operator perspective, brief SCADA)
 *  - SldLayerId = "co renderer rysuje" (rendering pipeline)
 *
 * LAYER_RENDER_MAPPING wiąże te systemy: 1 UX warstwa → N render warstw.
 *
 * mapLayerStateToRenderVisibility() przekształca LayerState (UX state)
 * w Partial<Record<SldLayerId, boolean>> przekazywany do SldCanvasV2.
 *
 * Warstwy renderera NIE objęte mapowaniem (stability, der, alarms,
 * missing-data, topology) używają DEFAULT_LAYER_VISIBILITY i są kontrolowane
 * wewnętrznie przez SldCanvasV2 (nie przez LayerTogglePanel).
 */

import type { LodLevel, SldLayerId } from './LodPolicy';
import { isLayerVisible, type LayerId, type LayerState } from './layerToggle';

/**
 * Mapowanie 1:N — pojedyncza warstwa UX może kontrolować wiele warstw
 * renderera. Np. "Wyniki obliczeń" (results-overlay) kontroluje 3 warstwy
 * renderera: results-pf + results-voltage + results-sc.
 */
export const LAYER_RENDER_MAPPING: Readonly<Record<LayerId, readonly SldLayerId[]>> = {
  // Bezpośrednie 1:1
  protection: ['protection'],
  metering: ['measurements'],
  ports: ['ports'],
  spine: ['spine'],

  // Obwód mocy = equipment + DER (źródła rozproszone są częścią obwodu mocy)
  power: ['equipment', 'der'],

  // Auxiliary circuits są częścią equipment renderera
  control: ['equipment'],

  // Etykiety = labels + missing-data (informacje wizualne o brakach)
  annotations: ['labels', 'missing-data'],

  // Wymiary techniczne - rozszerzenie etykiet
  dimensions: ['labels'],

  // Legenda - element labels
  legend: ['labels'],

  // Wyniki obliczeń = wszystkie 3 warstwy results-* + stability (wynik analizy)
  'results-overlay': ['results-pf', 'results-voltage', 'results-sc', 'stability'],

  // Specjalizowane warstwy wyników
  'fault-flow': ['results-sc'],
  'power-flow': ['results-pf'],

  // Siatka i granice = topologia + alarms (markery alarmów na strefach)
  grid: ['topology'],
  boundaries: ['topology', 'alarms'],
};

/**
 * Wszystkie 14 warstw renderera (SldLayerId) są kontrolowane przez UX
 * (LayerTogglePanel) - dzięki rozszerzonemu LAYER_RENDER_MAPPING każda
 * warstwa renderera ma co najmniej jedną mapującą warstwę UX.
 *
 * Mapowanie:
 *  - equipment ← power, control
 *  - labels ← annotations, dimensions, legend
 *  - ports ← ports
 *  - measurements ← metering
 *  - results-pf ← results-overlay, power-flow
 *  - results-voltage ← results-overlay
 *  - results-sc ← results-overlay, fault-flow
 *  - stability ← results-overlay
 *  - missing-data ← annotations
 *  - protection ← protection
 *  - der ← power
 *  - topology ← grid, boundaries
 *  - alarms ← boundaries
 *  - spine ← spine
 */
export const USER_CONTROLLED_RENDER_LAYERS: ReadonlySet<SldLayerId> = new Set<SldLayerId>([
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
  'spine',
]);

/**
 * Przekształca LayerState (UX) w widoczność warstw renderera.
 *
 * Logika OR: dla każdej warstwy renderera, sprawdź czy KTÓRAKOLWIEK z UX
 * warstw mapujących na nią jest widoczna. Jeśli tak — warstwa renderera
 * widoczna. Jeśli żadna — niewidoczna.
 *
 * Zwraca tylko klucze z USER_CONTROLLED_RENDER_LAYERS. Pozostałe warstwy
 * renderera nie są w wyniku (SldCanvasV2 użyje DEFAULT_LAYER_VISIBILITY).
 */
export function mapLayerStateToRenderVisibility(
  state: LayerState,
  currentLod: LodLevel,
): Partial<Record<SldLayerId, boolean>> {
  const out: Partial<Record<SldLayerId, boolean>> = {};

  for (const [layerId, renderLayers] of Object.entries(LAYER_RENDER_MAPPING) as [
    LayerId,
    readonly SldLayerId[],
  ][]) {
    const visible = isLayerVisible(state, layerId, currentLod);
    for (const renderLayer of renderLayers) {
      if (!USER_CONTROLLED_RENDER_LAYERS.has(renderLayer)) continue;
      // OR logic — warstwa renderera widoczna gdy choć jedna mapująca UX warstwa widoczna.
      out[renderLayer] = (out[renderLayer] ?? false) || visible;
    }
  }

  return out;
}
