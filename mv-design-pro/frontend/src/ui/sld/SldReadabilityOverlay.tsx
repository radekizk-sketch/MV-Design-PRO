/**
 * SldReadabilityOverlay — V12 § 5.7
 *
 * Pasywna warstwa widoczności na canvasie SLD.
 * Oblicza per-element opacity i visibility bazując na:
 *   1. Paśmie LOD (zoom → LodBand → ElementImportance threshold)
 *   2. Filtrze warstwowym (aktywny SldLayerFilter)
 *   3. Trybie szkieletowym (skeletonView: bool)
 *
 * ZASADY:
 * - Komponent NIE renderuje symboli — zwraca mapę ID → opacity.
 * - Geometria (pozycja x, y, routing) pozostaje niezmieniona.
 * - Gdy filtr = WSZYSTKO i skeletonView = false i band = PELNY → wszystko widoczne.
 * - Elementy „wyciszone" otrzymują opacity = 0.15 (nie 0 — widoczne ale nieistotne).
 * - Elementy niewidoczne wg LOD otrzymują opacity = 0 (ukryte całkowicie).
 *
 * Użycie:
 *   const { getOpacity } = useSldReadabilityOverlay(symbols, viewport);
 *   // w rendererze: style={{ opacity: getOpacity(symbol.id, symbol.elementType) }}
 */

import { useMemo } from 'react';
import type { AnySldSymbol } from '../sld-editor/types';
import type { ViewportState } from './types';
import type { ElementType } from '../types';
import { getLodBand, isElementVisibleAtLod } from './sldDetailLevel';
import { getSldLodLevel } from './SldLevelOfDetailEngine';
import { useSldLayerFiltersStore, elementMatchesLayerFilter, isElementInSkeletonView } from './sldLayerFiltersStore';

export type ReadinessMap = ReadonlyMap<string, boolean>;

export interface SldReadabilityOverlayResult {
  /** Zwraca opacity 0–1 dla danego elementu. */
  getOpacity: (symbolId: string, elementType: ElementType) => number;
  /** Aktualne pasmo LOD. */
  lodBand: ReturnType<typeof getLodBand>;
  /** Kanoniczny poziom szczegółowości SLD LOD-0..LOD-7. */
  lodLevel: ReturnType<typeof getSldLodLevel>;
  /** Czy tryb szkieletowy aktywny. */
  isSkeletonView: boolean;
}

/** Opacity gdy element jest wyciszony (filtr warstwowy lub LOD). */
const MUTED_OPACITY = 0.12;
/** Opacity gdy element w widoku szkieletowym nie należy do szkieletu. */
const SKELETON_MUTED_OPACITY = 0.08;

export function useSldReadabilityOverlay(
  _symbols: AnySldSymbol[],
  viewport: ViewportState,
  readinessMap?: ReadinessMap,
): SldReadabilityOverlayResult {
  const { layerFilter, skeletonView } = useSldLayerFiltersStore();
  const zoom = viewport.zoom;

  const lodBand = useMemo(() => getLodBand(zoom), [zoom]);
  const lodLevel = useMemo(() => getSldLodLevel({ zoom }), [zoom]);

  const getOpacity = useMemo(() => {
    return (symbolId: string, elementType: ElementType): number => {
      void symbolId; // id reserved for future per-element state

      // 1. Tryb szkieletowy — priorytet najwyższy
      if (skeletonView && !isElementInSkeletonView(elementType)) {
        return SKELETON_MUTED_OPACITY;
      }

      // 2. LOD — ukryj całkowicie poniżej progu
      if (!isElementVisibleAtLod(elementType, lodBand)) {
        return 0;
      }

      // 3. Filtr warstwowy — wycisz niezgodne
      const hasReadiness = readinessMap?.get(symbolId) ?? false;
      if (!elementMatchesLayerFilter(elementType, layerFilter, hasReadiness)) {
        return MUTED_OPACITY;
      }

      return 1;
    };
  }, [lodBand, layerFilter, skeletonView, readinessMap]);

  return { getOpacity, lodBand, lodLevel, isSkeletonView: skeletonView };
}
