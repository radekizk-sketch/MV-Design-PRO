/*
 * Dostawca WKŁADÓW ZWARCIOWYCH (R3-B / K3-G3, FLOW EKSPERT+ runda 3).
 *
 * Zamyka pozycję 1 historii domknięcia w `zwarciaModel.ts`: sekcja „Wkłady" miała
 * pass-through bez dostawcy danych. Realny dostawca = endpoint `POST /api/proof/sc3f/contributions`
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
  ShortCircuitResults,
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
 * Stan ODCZYTU danych jednego punktu zwarcia (wkłady albo rozpływ gałęziowy) —
 * wspólny dla obu dostawców per punkt. `wczytywanie` i `blad` to stany zapytania,
 * NIE stany danych: sekcja nie wolno w nich pokazać „dane niedostępne w tym
 * przebiegu" (KONTRAKT_WERDYKTU_WYJASNIALNEGO — odczyt w toku ≠ brak danych,
 * błąd odczytu ≠ brak danych). `gotowe` = odczyt zakończony albo niepotrzebny
 * (dane w polu wiersza, starszy wynik bez flagi dostępności).
 */
export type OdczytPunktuZwarcia = 'gotowe' | 'wczytywanie' | 'blad';

/** Stan dostawcy wkładów dla punktu — rozłączne stany, jedna dana pochodna. */
export type StanWkladowZwarciowych =
  /** Brak punktu albo brak migawki modelu — nie ma czego pobrać (uczciwy brak). */
  | { readonly odczyt: 'niezlecony' }
  | { readonly odczyt: 'wczytywanie' }
  | { readonly odczyt: 'blad' }
  | { readonly odczyt: 'gotowe'; readonly dane: WkladyZWywodem };

/**
 * Hook dostawcy wkładów dla aktywnego punktu zwarcia. Pobiera na zmianę punktu,
 * cache per punkt W OBRĘBIE JEDNEJ migawki modelu (zmiana migawki unieważnia
 * cache — wkłady liczone są z bieżącej migawki, więc wpis innej migawki byłby
 * wynikiem innej sieci). Stany rozłączne (`StanWkladowZwarciowych`):
 * `niezlecony` = brak punktu/migawki, `wczytywanie` = zapytanie w toku, `blad` =
 * błąd pobrania (HTTP/sieć), `gotowe` = odpowiedź (`wklady: []` = sieć bez maszyn
 * wirujących — backend zwraca pustą listę deterministycznie).
 * `punkt = null` wyłącza pobieranie (dostawca zewnętrzny przez props ma pierwszeństwo).
 */
export function useWkladyZwarciowe(punkt: string | null): StanWkladowZwarciowych {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const [cache, setCache] = useState<{
    readonly zrodlo: EnergyNetworkModel | null;
    readonly wpisy: Readonly<Record<string, WkladyZWywodem | 'blad'>>;
  }>({ zrodlo: null, wpisy: {} });
  const wpisy = cache.zrodlo === snapshot ? cache.wpisy : null;

  useEffect(() => {
    if (!punkt || !snapshot) return;
    if (wpisy && punkt in wpisy) return;
    let anulowane = false;
    const zapisz = (wpis: WkladyZWywodem | 'blad') =>
      setCache((c) => ({
        zrodlo: snapshot,
        wpisy: { ...(c.zrodlo === snapshot ? c.wpisy : {}), [punkt]: wpis },
      }));
    fetchWkladyZwarciowe(snapshot, punkt)
      .then((odpowiedz) => {
        if (!anulowane)
          zapisz({
            wklady: naWklady(odpowiedz),
            wywod: odpowiedz.wywod ?? [],
            wywodSekcje: odpowiedz.wywod_sekcje ?? [],
            walidacjaIec: odpowiedz.walidacja_iec ?? [],
          });
      })
      .catch(() => {
        // Błąd pobrania ROZPOZNANY (stan `blad`), nie wchłonięty w „dane niedostępne".
        if (!anulowane) zapisz('blad');
      });
    return () => {
      anulowane = true;
    };
  }, [punkt, snapshot, wpisy]);

  if (!punkt || !snapshot) return { odczyt: 'niezlecony' };
  const wpis = wpisy?.[punkt];
  if (wpis === undefined) return { odczyt: 'wczytywanie' };
  if (wpis === 'blad') return { odczyt: 'blad' };
  return { odczyt: 'gotowe', dane: wpis };
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
  /**
   * Stan odczytu punktu: `wczytywanie` i `blad` rozpoznane OSOBNO od „brak danych"
   * (`flows`/`trace` `null` starszego wyniku) — uczciwy stan, nie cisza.
   */
  readonly odczyt: OdczytPunktuZwarcia;
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
 *   kreska), `odczyt: 'gotowe'`,
 * - pobieranie w toku → `flows`/`trace` `null`, `odczyt: 'wczytywanie'` — sekcje
 *   pokazują stan odczytu, NIE „niedostępny w tym przebiegu" (odczyt w toku ≠ brak),
 * - błąd pobrania (HTTP/sieć) → `odczyt: 'blad'`, `flows`/`trace` `null` — obie
 *   sekcje pokazują KOMUNIKAT BŁĘDU, nie ciszę (karta WB-ROZPLYW, W4d),
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
  // Klucz = przebieg × punkt: wpis należy do biegu, z którego powstał (ten sam
  // punkt innego biegu to inny rozpływ — zero przecieku między przebiegami).
  const klucz = runId && punkt ? `${runId}::${punkt}` : null;

  useEffect(() => {
    if (!runId || !punkt || !klucz || inline !== null || !dostepny) return;
    if (klucz in cache) return;
    let anulowane = false;
    fetchRozplywZwarciowy(runId, punkt)
      .then((odpowiedz) => {
        if (!anulowane)
          setCache((c) => ({
            ...c,
            [klucz]: {
              flows: [...(odpowiedz.branch_contributions ?? [])],
              trace: odpowiedz.branch_flow_trace ? [...odpowiedz.branch_flow_trace] : null,
            },
          }));
      })
      .catch(() => {
        // Błąd pobrania (HTTP/sieć) — ROZPOZNANY, nie po cichu wchłonięty w
        // „brak danych": sekcja śladu (karta WB-ROZPLYW) pokazuje komunikat błędu.
        if (!anulowane) setCache((c) => ({ ...c, [klucz]: 'blad' }));
      });
    return () => {
      anulowane = true;
    };
  }, [runId, punkt, klucz, inline, dostepny, cache]);

  if (inline !== null) return { flows: inline, trace: null, odczyt: 'gotowe' };
  if (!klucz || !dostepny) return { flows: null, trace: null, odczyt: 'gotowe' };
  const wpis = cache[klucz];
  if (wpis === undefined) return { flows: null, trace: null, odczyt: 'wczytywanie' };
  if (wpis === 'blad') return { flows: null, trace: null, odczyt: 'blad' };
  return { flows: wpis.flows, trace: wpis.trace, odczyt: 'gotowe' };
}

// ---------------------------------------------------------------------------
// Pasmo MIN/MAX zwarcia z JEDNEGO przypadku (karta W3-G3, aneks D7,
// mapa domknięcia 3 #12) — dostawca `GET …/results/short-circuit/pasmo`.
// ---------------------------------------------------------------------------

/** Kontekst przypadku strony pasma — podzbiór pól konsumowanych (świeżość). */
export interface AnalysisCaseContextPasma {
  readonly rewizja_modelu?: number | null;
}

/**
 * Jedna strona pasma (MAX albo MIN) — kształt 1:1 odpowiedzi backendu
 * (`api/canonical_run_views.py::_strona_pasma_zwarcia`). `run_id` obecny
 * WYŁĄCZNIE dla `zrodlo === 'biegu_zapisanego'` — strona `'obliczony_na_zadanie'`
 * dzieli identyfikator z kotwicą po stronie backendu, więc go tu NIE dostaje
 * (zero fabrykacji niezależnej tożsamości biegu).
 */
export interface StronaPasmaOdpowiedz {
  readonly zrodlo: 'biegu_zapisanego' | 'obliczony_na_zadanie';
  readonly run_id: string | null;
  readonly bieg_bazowy_id: string;
  readonly wynik: ShortCircuitResults;
  readonly analysis_case_context: AnalysisCaseContextPasma;
}

/** Kształt 1:1 odpowiedzi `GET …/results/short-circuit/pasmo`. */
export interface PasmoZwarciaOdpowiedz {
  readonly run_id_kotwicy: string;
  readonly scenariusz_kotwicy: 'MAX' | 'MIN';
  readonly typ_zwarcia_kotwicy: string;
  readonly brakujacy_scenariusz: 'MAX' | 'MIN' | null;
  readonly powod_niedostepnosci: string | null;
  readonly powod_niedostepnosci_pl: string | null;
  readonly max: StronaPasmaOdpowiedz | null;
  readonly min: StronaPasmaOdpowiedz | null;
}

/** Pobiera pasmo MIN/MAX zwarcia dla biegu kotwicy (dowolny scenariusz). */
export async function fetchPasmoZwarcia(runId: string): Promise<PasmoZwarciaOdpowiedz> {
  const response = await fetch(`/api/analysis-runs/${runId}/results/short-circuit/pasmo`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as PasmoZwarciaOdpowiedz;
}

/** Stan uczciwy pasma MIN/MAX — jedna dana pochodna na cały czas życia hooka. */
export type StanPasmaZwarcia =
  | { readonly rodzaj: 'brak-biegu' }
  | { readonly rodzaj: 'wczytywanie' }
  | { readonly rodzaj: 'blad' }
  | { readonly rodzaj: 'gotowe'; readonly dane: PasmoZwarciaOdpowiedz };

/**
 * Hook dostawcy pasma MIN/MAX dla biegu KOTWICY (dowolny scenariusz — nie
 * musi być MAX). Cache per `runId` na życie ekranu (deterministyczny bieg →
 * deterministyczna odpowiedź), jak `useWkladyZwarciowe`/`useRozplywZwarciowy`
 * obok. `runId = null` → `'brak-biegu'` (ekran jeszcze bez przebiegu — stan
 * pusty CAŁEGO okna już to obsługuje, sekcja się nie montuje).
 */
export function usePasmoZwarcia(runId: string | null): StanPasmaZwarcia {
  const [cache, setCache] = useState<Record<string, PasmoZwarciaOdpowiedz | 'blad'>>({});

  useEffect(() => {
    if (!runId || runId in cache) return;
    let anulowane = false;
    fetchPasmoZwarcia(runId)
      .then((dane) => {
        if (!anulowane) setCache((c) => ({ ...c, [runId]: dane }));
      })
      .catch(() => {
        if (!anulowane) setCache((c) => ({ ...c, [runId]: 'blad' }));
      });
    return () => {
      anulowane = true;
    };
  }, [runId, cache]);

  if (!runId) return { rodzaj: 'brak-biegu' };
  const wpis = cache[runId];
  if (wpis === undefined) return { rodzaj: 'wczytywanie' };
  if (wpis === 'blad') return { rodzaj: 'blad' };
  return { rodzaj: 'gotowe', dane: wpis };
}
