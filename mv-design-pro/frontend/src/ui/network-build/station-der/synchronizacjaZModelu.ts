/**
 * Synchronizacja warsztatu wytwórców DER z MODELEM (jeden punkt w powłoce).
 *
 * DEFEKT, KTÓRY TO ZAMYKA (zmierzony na żywej aplikacji, 2026-08-05): wytwórca
 * zapisany kreatorem źródła OZE (operacja domenowa `add_converter_source`)
 * trafiał do modelu, ale NIE do `useStationDerStore` — jedynym miejscem, które
 * ten store zasilało, był kreator stacji (`AddDerWizard.attachDer`). Ekrany
 * strumienia OZE czytające `selectAllDers` (macierz zgodności NC RfG, pulpit
 * instalacji OZE, krzywe P–Q, walidacja falownika) pokazywały wtedy „Brak
 * modułów wytwórczych do oceny" przy generatorze obecnym w modelu, a po
 * odświeżeniu strony znikały także wytwórcy dodani kreatorem stacji.
 *
 * ZAKRES: hook czyta migawkę (`useSnapshotStore`) i aktywny projekt
 * (`useAppStateStore`) i przekazuje odwzorowanie do akcji store'u. Zero fizyki,
 * zero mutacji modelu — wyłącznie odczyt migawki (CLAUDE.md, warstwa
 * PREZENTACJI).
 */

import { useEffect } from 'react';

import { useAppStateStore } from '../../app-state';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useStationDerStore } from './store';
import { deryZModelu } from './zModelu';

/**
 * Wpina wytwórców z migawki do warsztatu przy każdej zmianie modelu.
 * Wołany JEDEN raz — w korzeniu powłoki (`ui2/AppRoot`).
 */
export function useSynchronizacjaDerZModelu(): void {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const synchronizuj = useStationDerStore((s) => s.synchronizujZModelu);

  useEffect(() => {
    if (!snapshot) return;
    synchronizuj(deryZModelu(snapshot, activeProjectId));
  }, [snapshot, activeProjectId, synchronizuj]);
}
