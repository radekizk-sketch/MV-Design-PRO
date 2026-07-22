/*
 * Dostawca WKŁADÓW ZWARCIOWYCH (R3-B / K3-G3, FLOW EKSPERT+ runda 3).
 *
 * Domyka TODO-KARTĘ 1 z `zwarciaModel.ts`: sekcja „Wkłady" miała pass-through
 * bez dostawcy danych. Realny dostawca = endpoint `POST /api/proof/sc3f/contributions`
 * (rozbicie maszynowe μ/q/i_b liczone serwerowo przez TEN SAM solver co pakiet
 * dowodowy SC3F — `compute_machine_contributions`, IEC 60909-0:2016 §6.6).
 * ZERO fizyki w UI: jedyna operacja to skalowanie jednostki prezentacji A → kA
 * (jak MW → kW w rozpływie). Endpoint przyjmuje ref ENM szyny (target_id wyniku
 * SC) — tożsamość rozwiązywana po stronie serwera.
 */

import { useEffect, useState } from 'react';

import type { EnergyNetworkModel } from '../../../types/enm';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { KrokWywodu, PozycjaWalidacji, SekcjaWywodu } from '../wzorzec';
import type { WkladZwarciowy } from './zwarciaModel';

/** Kształt 1:1 pozycji odpowiedzi backendu (`MachinePartialContribution.to_dict`). */
export interface WkladZrodlaOdpowiedz {
  readonly source_id: string;
  readonly source_name: string;
  readonly ikss_partial_a: number;
}

/** Kształt 1:1 odpowiedzi (`MachineShortCircuitResult.to_dict`, pola konsumowane). */
export interface WkladyOdpowiedz {
  readonly contributions: readonly WkladZrodlaOdpowiedz[];
  /** Wywód prezentacyjny {tekst, latex} z backendu (zasada KaTeX; addytywny). */
  readonly wywod?: readonly KrokWywodu[];
  /** Wywód SEKCYJNY (ZWARCIA-PRO F3 pkt 8; addytywny) — ta sama treść pogrupowana. */
  readonly wywod_sekcje?: readonly SekcjaWywodu[];
  /** Checklista walidacji metody IEC 60909 (pkt 10; addytywna). */
  readonly walidacja_iec?: readonly PozycjaWalidacji[];
}

/** Wkłady + wywód dla punktu — para zwracana przez hooka dostawcy. */
export interface WkladyZWywodem {
  readonly wklady: WkladZwarciowy[];
  readonly wywod: readonly KrokWywodu[];
  readonly wywodSekcje: readonly SekcjaWywodu[];
  readonly walidacjaIec: readonly PozycjaWalidacji[];
}

/** Pobiera wkłady zwarciowe źródeł dla punktu (ref ENM szyny). */
export async function fetchWkladyZwarciowe(
  snapshot: EnergyNetworkModel,
  faultNodeRef: string,
): Promise<WkladyOdpowiedz> {
  const response = await fetch('/api/proof/sc3f/contributions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot, fault_node_id: faultNodeRef }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as WkladyOdpowiedz;
}

/** Projekcja odpowiedzi backendu → wiersze sekcji wkładów (skalowanie A → kA). */
export function naWklady(odpowiedz: WkladyOdpowiedz): WkladZwarciowy[] {
  return odpowiedz.contributions.map((c) => ({
    id: c.source_id,
    zrodlo: c.source_name,
    pradKA: c.ikss_partial_a / 1000,
  }));
}

/**
 * Hook dostawcy wkładów dla aktywnego punktu zwarcia. Pobiera na zmianę punktu,
 * cache per punkt na życie ekranu (deterministyczny snapshot → deterministyczna
 * odpowiedź). Stany uczciwe: `null` = dane niedostępne (brak snapshotu / błąd /
 * w trakcie pobierania — istniejący stan „dane niedostępne" sekcji), `[]` =
 * sieć bez maszyn wirujących (backend zwraca pustą listę deterministycznie).
 * `punkt = null` wyłącza pobieranie (dostawca zewnętrzny przez props ma pierwszeństwo).
 */
export function useWkladyZwarciowe(punkt: string | null): WkladyZWywodem | null {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const [cache, setCache] = useState<Record<string, WkladyZWywodem>>({});

  useEffect(() => {
    if (!punkt || !snapshot) return;
    if (cache[punkt]) return;
    let anulowane = false;
    fetchWkladyZwarciowe(snapshot, punkt)
      .then((odpowiedz) => {
        if (!anulowane)
          setCache((c) => ({
            ...c,
            [punkt]: {
              wklady: naWklady(odpowiedz),
              wywod: odpowiedz.wywod ?? [],
              wywodSekcje: odpowiedz.wywod_sekcje ?? [],
              walidacjaIec: odpowiedz.walidacja_iec ?? [],
            },
          }));
      })
      .catch(() => {
        // Błąd pobrania → pozycja bez wpisu → sekcja pokazuje „dane niedostępne".
      });
    return () => {
      anulowane = true;
    };
  }, [punkt, snapshot, cache]);

  if (!punkt) return null;
  return cache[punkt] ?? null;
}
