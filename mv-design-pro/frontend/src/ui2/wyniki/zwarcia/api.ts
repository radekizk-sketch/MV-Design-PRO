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
  ImpedancjaPrzejsciaBiegu,
  KonfiguracjaBieguZwarcia,
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
  // Karta SC-IB-ITH-ZRODLA: `null` = nieobliczone — maszyna wymaga krzywej zaniku μ/q,
  // a bieg nie ma czasu wyłączenia t_b (t_min); nigdy 0.
  readonly mu?: number | null;
  readonly q?: number | null;
  readonly ib_a?: number | null;
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

/**
 * Parametry biegu, z którymi backend liczy wkłady punktu — ZAPISANE na biegu wyświetlanym
 * na ekranie (`konfiguracja_biegu` odpowiedzi wyników), nigdy z aktywnego przypadku.
 *
 * Karta WSPÓŁCZYNNIK-C (O-59): końcówka wkładów dobiera c z tabeli 1 IEC 60909-0 dla
 * pasma węzła i scenariusza OGLĄDANEGO biegu (`scenariusz` wymagany, `nadpisanie_c`
 * z uzasadnieniem) — żądanie bez scenariusza jest odmową 422. Karta OD-14: `impedancja`
 * = Z_f biegu przez impedancję przejścia (brak = bieg metaliczny). Karta SC-IB-ITH-ZRODLA:
 * `tMinS` = czas wyłączenia t_b biegu (t_min krzywych μ, q); `null` = bieg bez t_b — backend
 * nie podstawia już stałej 0,10 s, tylko zwraca μ/q/Ib maszyn jako nieobliczone.
 */
export interface ParametryWkladowBiegu {
  readonly scenariusz: 'MAX' | 'MIN';
  readonly nadpisanieC: { readonly wartosc: number; readonly uzasadnienie: string } | null;
  readonly tMinS: number | null;
  readonly impedancja?: ImpedancjaPrzejsciaBiegu;
}

/**
 * Parametry wkładów z konfiguracji ZAPISANEJ na biegu — sam odczyt, bez fizyki.
 *
 * `null` (uczciwy brak, sekcja „dane niedostępne"): bieg nie zapisał scenariusza
 * (starszy artefakt) albo zapisał nadpisanie c bez wartości lub uzasadnienia — wtedy
 * wkładów TEGO biegu nie da się odtworzyć, a domyślne „MAX" byłoby domysłem.
 */
export function parametryWkladowZKonfiguracji(
  konfiguracja: KonfiguracjaBieguZwarcia | null | undefined,
): ParametryWkladowBiegu | null {
  const scenariusz = konfiguracja?.scenariusz;
  if (!konfiguracja || (scenariusz !== 'MAX' && scenariusz !== 'MIN')) return null;
  const c = konfiguracja.c_factor;
  let nadpisanieC: ParametryWkladowBiegu['nadpisanieC'] = null;
  if (c?.tryb === 'nadpisanie') {
    if (c.wartosc === null || c.uzasadnienie === null) return null;
    nadpisanieC = { wartosc: c.wartosc, uzasadnienie: c.uzasadnienie };
  }
  const tMinS = konfiguracja.breaking_time_seconds?.wartosc ?? null;
  return konfiguracja.impedancja_przejscia
    ? { scenariusz, nadpisanieC, tMinS, impedancja: konfiguracja.impedancja_przejscia }
    : { scenariusz, nadpisanieC, tMinS };
}

/**
 * Pobiera wkłady zwarciowe źródeł dla punktu (ref ENM szyny) z parametrami biegu.
 *
 * Pole `fault_impedance` występuje WYŁĄCZNIE dla biegu przez Z_f (karta OD-14) — żądanie
 * biegu metalicznego go nie niesie.
 */
export async function fetchWkladyZwarciowe(
  snapshot: EnergyNetworkModel,
  faultNodeRef: string,
  parametry: ParametryWkladowBiegu,
): Promise<WkladyOdpowiedz> {
  const { impedancja } = parametry;
  const response = await fetch('/api/proof/sc3f/contributions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snapshot,
      fault_node_id: faultNodeRef,
      scenariusz: parametry.scenariusz,
      nadpisanie_c: parametry.nadpisanieC,
      ...(parametry.tMinS === null ? {} : { t_min_s: parametry.tMinS }),
      ...(impedancja
        ? { fault_impedance: { r_f_ohm: impedancja.r_f_ohm, x_f_ohm: impedancja.x_f_ohm } }
        : {}),
    }),
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
            ibKA: c.ib_a === undefined || c.ib_a === null ? null : c.ib_a / 1000,
            wywod: c.wywod ?? [],
          },
  }));
}

/**
 * Hook dostawcy wkładów dla aktywnego punktu zwarcia. Pobiera na zmianę punktu
 * albo parametrów biegu, cache per (punkt × parametry biegu) na życie ekranu
 * (deterministyczny snapshot → deterministyczna odpowiedź). Stany uczciwe: `null` =
 * dane niedostępne (brak snapshotu / brak parametrów biegu / błąd / w trakcie
 * pobierania — istniejący stan „dane niedostępne" sekcji), `[]` = sieć bez maszyn
 * wirujących (backend zwraca pustą listę deterministycznie). `punkt = null` wyłącza
 * pobieranie (dostawca zewnętrzny przez props ma pierwszeństwo).
 */
export function useWkladyZwarciowe(
  punkt: string | null,
  parametry: ParametryWkladowBiegu | null,
): WkladyZWywodem | null {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const [cache, setCache] = useState<Record<string, WkladyZWywodem>>({});
  // Klucz pamięci podręcznej = punkt × scenariusz × nadpisanie c × Z_f biegu: ten sam
  // punkt dwóch biegów o innym c albo innej Z_f to dwa różne wyniki wkładów.
  const klucz = punkt === null || parametry === null ? null : kluczWkladow(punkt, parametry);
  // Zależności efektu to WARTOŚCI parametrów, nie obiekt: każde odświeżenie wyniku biegu
  // daje nowy obiekt konfiguracji o tych samych wartościach — zależność od obiektu
  // anulowała pobieranie w toku i ponawiała to samo żądanie (karta OD-14).
  const scenariusz = parametry?.scenariusz;
  const cWartosc = parametry?.nadpisanieC?.wartosc;
  const cUzasadnienie = parametry?.nadpisanieC?.uzasadnienie;
  const rF = parametry?.impedancja?.r_f_ohm;
  const xF = parametry?.impedancja?.x_f_ohm;
  const tMinS = parametry?.tMinS ?? null;

  useEffect(() => {
    if (!punkt || !snapshot || klucz === null || scenariusz === undefined) return;
    if (cache[klucz]) return;
    let anulowane = false;
    const parametryZadania: ParametryWkladowBiegu = {
      scenariusz,
      nadpisanieC:
        cWartosc === undefined || cUzasadnienie === undefined
          ? null
          : { wartosc: cWartosc, uzasadnienie: cUzasadnienie },
      tMinS,
      ...(rF === undefined || xF === undefined
        ? {}
        : { impedancja: { r_f_ohm: rF, x_f_ohm: xF, poza_zakresem_iec60909: true as const } }),
    };
    fetchWkladyZwarciowe(snapshot, punkt, parametryZadania)
      .then((odpowiedz) => {
        if (!anulowane)
          setCache((c) => ({
            ...c,
            [klucz]: {
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
  }, [punkt, snapshot, cache, klucz, scenariusz, cWartosc, cUzasadnienie, tMinS, rF, xF]);

  if (klucz === null) return null;
  return cache[klucz] ?? null;
}

/** Klucz wkładów punktu dla parametrów biegu (bez fizyki — sam zapis wartości). */
export function kluczWkladow(punkt: string, parametry: ParametryWkladowBiegu): string {
  const c = parametry.nadpisanieC
    ? `|c:${parametry.nadpisanieC.wartosc}:${parametry.nadpisanieC.uzasadnienie}`
    : '';
  const zf = parametry.impedancja
    ? `|zf:${parametry.impedancja.r_f_ohm}:${parametry.impedancja.x_f_ohm}`
    : '';
  const tb = parametry.tMinS === null ? '' : `|tb:${parametry.tMinS}`;
  return `${punkt}|${parametry.scenariusz}${c}${tb}${zf}`;
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
