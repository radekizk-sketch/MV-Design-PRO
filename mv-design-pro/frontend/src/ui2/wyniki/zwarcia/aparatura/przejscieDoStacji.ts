/**
 * Przejście „brak aparatury w konfiguracji" → konfigurator stacji (KD-4).
 *
 * REUŻYCIE istniejącego toru otwarcia konfiguratora stacji (wzorzec
 * `SnSegmentSurface`: selekcja + centrowanie + `openRouteSurface('E-13')` z
 * zakładką rozdzielnicy SN). Nie powstaje żaden nowy tor nawigacji — akcja
 * naprawcza prowadzi tam, gdzie ta dana faktycznie się wpisuje.
 */

import { useCallback } from 'react';

import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../../ui/selection';
import { pokazElementNaSchemacie } from '../../../shell/zaznaczElementModelu';

export function useOtworzKonfiguracjeStacji(): (stationRef: string) => void {
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);

  const selectElement = useSelectionStore((s) => s.selectElement);

  return useCallback(
    (stationRef: string) => {
      // Jedna droga wejścia na schemat (karta SLD-SKALA-I-NAWIGACJA, część W).
      if (!pokazElementNaSchemacie(stationRef, 'weryfikacja-aparatury')) {
        selectElement({ id: stationRef, type: 'Station', name: stationRef });
      }
      openRouteSurface('E-13', {
        entityRef: stationRef,
        entityType: 'station',
        subjectKind: 'entity',
        subjectRef: stationRef,
        tabId: 'rozdzielnica-sn',
        route: 'sld',
        openMode: 'replace_right_panel',
        supportsMiniSld: true,
      });
    },
    [openRouteSurface, selectElement],
  );
}
