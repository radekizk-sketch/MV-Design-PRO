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
import type { ShortCircuitBranchFlow, ShortCircuitRow } from '../../../ui/results-inspector/types';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { KrokWywodu, PozycjaWalidacji, SekcjaWywodu } from '../wzorzec';
import type { WkladZwarciowy } from './zwarciaModel';

/** Kształt 1:1 pozycji odpowiedzi backendu (`MachinePartialContribution.to_dict`). */
export interface WkladZrodlaOdpowiedz {
  readonly source_id: string;
  readonly source_name: string;
  readonly ikss_partial_a: number;
  // Szczegół maszynowy IEC 60909 §6.6 (karta W-A F2, addytywnie) — endpoint
  // zwraca komplet od V12K-114 (machine_sc_iec60909.py:115-131); pola opcjonalne
  // dla starszych odpowiedzi (uczciwy brak zamiast fabrykacji).
  readonly machine_type?: string;
  readonly ir_a?: number;
  readonly ratio_ik_ir?: number;
  readonly mu?: number;
  readonly q?: number;
  readonly ib_a?: number;
  /** Wywód dyplomowy TEJ maszyny ({tekst, latex} budowane w solverze). */
  readonly wywod?: readonly KrokWywodu[];
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
    // Szczegół maszynowy (karta W-A F2): wyłącznie z pól odpowiedzi (zero
    // fabrykacji) — starsza odpowiedź bez machine_type → szczegół nieobecny.
    szczegol:
      c.machine_type === undefined
        ? undefined
        : {
            typMaszyny: c.machine_type,
            irKA: c.ir_a !== undefined ? c.ir_a / 1000 : null,
            stosunekIkIr: c.ratio_ik_ir ?? null,
            mu: c.mu ?? null,
            q: c.q ?? null,
            ibKA: c.ib_a !== undefined ? c.ib_a / 1000 : null,
            wywod: c.wywod ?? [],
          },
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

// ---------------------------------------------------------------------------
// Dostawca ROZPŁYWU GAŁĘZIOWEGO na żądanie (V12K-281, K13)
// ---------------------------------------------------------------------------

/** Kształt 1:1 odpowiedzi endpointu rozpływu jednego punktu zwarcia. */
export interface RozplywOdpowiedz {
  readonly run_id: string;
  readonly target_id: string;
  readonly branch_contributions: readonly ShortCircuitBranchFlow[] | null;
}

/** Pobiera rozpływ gałęziowy JEDNEGO punktu zwarcia (ref węzła w zapytaniu). */
export async function fetchRozplywZwarciowy(
  runId: string,
  targetId: string,
): Promise<RozplywOdpowiedz> {
  const response = await fetch(
    `/api/analysis-runs/${runId}/results/short-circuit/rozplyw?target_id=${encodeURIComponent(targetId)}`,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as RozplywOdpowiedz;
}

/**
 * Hook dostawcy rozpływu gałęziowego dla wybranego wiersza wyniku zwarciowego
 * (V12K-281, K13). Wiersze zbiorcze backendu nie niosą już rozpływu (iloczyn
 * źródło×gałąź per wiersz dawał odpowiedź 730 MB dla 50 stacji) — dane JEDNEGO
 * punktu pobierane są tym hookiem, cache per punkt na życie ekranu
 * (deterministyczny przebieg → deterministyczna odpowiedź).
 *
 * Stany uczciwe (jak dotąd w sekcji rozpływu):
 * - wiersz z danymi w polu (mock/starszy pełny zapis) → dane wprost, bez wołania,
 * - flaga dostępności nieprawdziwa → `null` (starszy wynik bez rozpływu — kreska),
 * - pobieranie w toku / błąd → `null` (sekcja pokazuje stan „niedostępny"),
 * - odpowiedź z pustą listą → `[]` (policzono, brak prądu w gałęziach).
 */
export function useRozplywZwarciowy(
  runId: string | null,
  row: ShortCircuitRow | null,
): ShortCircuitBranchFlow[] | null {
  const [cache, setCache] = useState<Record<string, ShortCircuitBranchFlow[] | null>>({});
  const inline = row?.branch_contributions ?? null;
  const dostepny = row?.branch_contributions_available === true;
  const punkt = row?.target_id ?? null;

  useEffect(() => {
    if (!runId || !punkt || inline !== null || !dostepny) return;
    if (punkt in cache) return;
    let anulowane = false;
    fetchRozplywZwarciowy(runId, punkt)
      .then((odpowiedz) => {
        if (!anulowane)
          setCache((c) => ({ ...c, [punkt]: [...(odpowiedz.branch_contributions ?? [])] }));
      })
      .catch(() => {
        // Błąd pobrania → brak wpisu → sekcja pokazuje stan „niedostępny".
      });
    return () => {
      anulowane = true;
    };
  }, [runId, punkt, inline, dostepny, cache]);

  if (inline !== null) return inline;
  if (!punkt || !dostepny) return null;
  return cache[punkt] ?? null;
}
