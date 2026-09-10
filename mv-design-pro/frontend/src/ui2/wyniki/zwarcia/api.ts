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
import type {
  ShortCircuitBranchFlow,
  ShortCircuitRow,
  TraceStep,
} from '../../../ui/results-inspector/types';
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

/**
 * Kształt 1:1 odpowiedzi endpointu rozpływu jednego punktu zwarcia
 * (`build_short_circuit_rozplyw`, `enm/canonical_analysis.py:2500-2533`).
 *
 * `branch_flow_trace` (karta WB-ROZPLYW, TH-1): ślad WHITE BOX podziału prądu
 * zwarciowego źródła zastępczego (Thevenin/sieć nadrzędna) po gałęziach —
 * kroki `WhiteBoxTracer` (`network_model/whitebox/tracer.py`), TA SAMA klasa
 * ładunku i to samo źródło co `branch_contributions` (`pobierz_slad_rozplywu_biegu`,
 * jeden dostawca). `null` = uczciwy brak: bieg policzony bez wkładów, punkt
 * nieznany albo zapis sprzed dodania kolumny śladu — NIEZALEŻNE od nullowości
 * `branch_contributions` (dokumentuje WYŁĄCZNIE podział Thevenina; superpozycja
 * falownikowa nie ma śladu, więc `branch_contributions` bywa niepusty przy
 * `branch_flow_trace: []`, gdy punkt nie ma wkładu sieci zastępczej).
 */
export interface RozplywOdpowiedz {
  readonly run_id: string;
  readonly target_id: string;
  readonly branch_contributions: readonly ShortCircuitBranchFlow[] | null;
  readonly branch_flow_trace: readonly TraceStep[] | null;
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

/** Wpis rozpływu + śladu WYŁĄCZNIE po udanym pobraniu (rozróżnienie od `'blad'`). */
interface WpisRozplywu {
  readonly flows: ShortCircuitBranchFlow[];
  readonly trace: TraceStep[] | null;
}

/**
 * Rozpływ gałęziowy JEDNEGO punktu zwarcia + jego ślad WHITE BOX podziału
 * prądu (karta WB-ROZPLYW, TH-1) — para zwracana przez `useRozplywZwarciowy`.
 * `blad`/`flows`/`trace` pochodzą z JEDNEGO wywołania endpointu (jedno źródło
 * prawdy dla obu — nie dwa niezależne stany, które mogłyby się rozjechać).
 */
export interface RozplywZeSladem {
  readonly flows: ShortCircuitBranchFlow[] | null;
  readonly trace: TraceStep[] | null;
  /** Błąd pobrania (HTTP/sieć) rozpoznany OSOBNO od „brak danych" — uczciwy stan, nie cisza. */
  readonly blad: boolean;
}

/**
 * Hook dostawcy rozpływu gałęziowego + śladu WHITE BOX podziału prądu (TH-1)
 * dla wybranego wiersza wyniku zwarciowego (V12K-281, K13; karta WB-ROZPLYW).
 * Wiersze zbiorcze backendu nie niosą już rozpływu (iloczyn źródło×gałąź per
 * wiersz dawał odpowiedź 730 MB dla 50 stacji) — dane JEDNEGO punktu (wkłady
 * ORAZ ślad — ta sama odpowiedź, jedno wywołanie) pobierane są tym hookiem,
 * cache per punkt na życie ekranu (deterministyczny przebieg → deterministyczna
 * odpowiedź).
 *
 * Stany uczciwe:
 * - wiersz z danymi w polu (mock/starszy pełny zapis) → `flows` wprost, bez
 *   wołania; `trace` niedostępny tą ścieżką (`ShortCircuitRow` nie niesie
 *   śladu) → `null`,
 * - flaga dostępności nieprawdziwa → `flows`/`trace` `null` (starszy wynik —
 *   kreska), `blad: false`,
 * - pobieranie w toku → `flows`/`trace` `null`, `blad: false` (jak dotąd),
 * - błąd pobrania (HTTP/sieć) → `blad: true`, `flows`/`trace` `null` — sekcja
 *   śladu pokazuje KOMUNIKAT BŁĘDU, nie ciszę (karta WB-ROZPLYW, W4d),
 * - odpowiedź: `branch_contributions` `[]` = policzono, brak prądu w gałęziach;
 *   `branch_flow_trace` `[]` = policzono, brak kroków podziału Thevenina dla
 *   tego punktu (ślad dokumentuje WYŁĄCZNIE tę rodzinę wkładu — niezależne od
 *   nullowości/pustości `flows`, patrz `RozplywOdpowiedz`); `branch_flow_trace`
 *   `null` = zapis sprzed dodania kolumny śladu (uczciwy brak, nie pusta lista).
 */
export function useRozplywZwarciowy(runId: string | null, row: ShortCircuitRow | null): RozplywZeSladem {
  const [cache, setCache] = useState<Record<string, WpisRozplywu | 'blad'>>({});
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
          setCache((c) => ({
            ...c,
            [punkt]: {
              flows: [...(odpowiedz.branch_contributions ?? [])],
              trace: odpowiedz.branch_flow_trace ? [...odpowiedz.branch_flow_trace] : null,
            },
          }));
      })
      .catch(() => {
        // Błąd pobrania (HTTP/sieć) — ROZPOZNANY, nie po cichu wchłonięty w
        // „brak danych": sekcja śladu (karta WB-ROZPLYW) pokazuje komunikat błędu.
        if (!anulowane) setCache((c) => ({ ...c, [punkt]: 'blad' }));
      });
    return () => {
      anulowane = true;
    };
  }, [runId, punkt, inline, dostepny, cache]);

  if (inline !== null) return { flows: inline, trace: null, blad: false };
  if (!punkt || !dostepny) return { flows: null, trace: null, blad: false };
  const wpis = cache[punkt];
  if (wpis === 'blad') return { flows: null, trace: null, blad: true };
  return { flows: wpis?.flows ?? null, trace: wpis?.trace ?? null, blad: false };
}
