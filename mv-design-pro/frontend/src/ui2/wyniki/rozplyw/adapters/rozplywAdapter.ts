/*
 * Adapter okna „Rozpływ mocy — napięcia szyn" (karta E8.1). Mapuje REALNY kształt
 * wyniku rozpływu na model wspólnego wzorca ekranu analizy. Read-only; zero fizyki,
 * zero mutacji, zero wołań API z tego pliku.
 *
 * ŹRÓDŁO DANYCH — realny kontrakt (mapowanie plik:linia, karta §2 „zero zgadywania"):
 * - Wynik rozpływu: `PowerFlowResultV1` (`ui/power-flow-results/types.ts:108-118`).
 *   Wiersze szyn: `bus_results: PowerFlowBusResult[]`
 *   (`types.ts:60-67` → pola bus_id, v_pu, angle_deg, p_injected_mw, q_injected_mvar).
 *   Skalary do ZAŁOŻEŃ: `base_mva`, `tolerance_used`, `slack_bus_id`,
 *   `iterations_count`, `converged` (`types.ts:108-118`).
 * - Store read-only: `usePowerFlowResultsStore.results` (`ui/power-flow-results/store.ts:44`),
 *   `runHeader.id` (`store.ts:41`, `PowerFlowRunHeader.id` `types.ts:28`).
 *
 * TODO-KARTA (ograniczenia — brak źródła w kontrakcie read-only, karta §2 „NIE zgaduj"):
 * 1. Świeżość (FreshnessBadge) wymaga LICZBOWEJ rewizji modelu z chwili liczenia.
 *    `PowerFlowResultV1`/`PowerFlowRunHeader` NIE niosą liczbowej rewizji — jedynie
 *    `result_status` (enum FRESH/OUTDATED, `types.ts:204-209`) i `input_hash`
 *    (`types.ts:34`). Mapowanie enum→liczba byłoby zgadywaniem → nagłówek TabelaSzyn
 *    NIE podaje rewizji (badge pominięty). Numeryczną świeżość dostarczy karta
 *    integracyjna (spięcie ze snapshot store'em modelu).
 * 2. Populacja store'u (`selectRun`/`loadResults`, `store.ts:109-184`) należy do
 *    okna inspektora rozpływu; ten adapter wyłącznie CZYTA `results` (read-only).
 *
 * DOWÓD PER-WARTOŚĆ (karta K3 / C1 — domknięcie `dowodRef`): wielkości tabel
 * (napięcia, kąty, moce, straty) pochodzą WPROST z wyników przebiegu rozpływu,
 * a ich wywód WHITE BOX niesie ślad tego przebiegu (zakładka „Dowód obliczeń").
 * Ref dowodu = identyfikator elementu z kontraktu (`bus_id`/`branch_id`) — jak we
 * wzorcu zwarciowym (`zwarciaModel.ts`: `element_id ?? target_id`); przygotowany
 * pod fokus kroku po `TraceStep.element_id` (TODO E9.x w `DowodPrzebiegu`).
 * Wcześniejsza decyzja E8.1 (komórki bez `dowodRef`, bo brak `evidence_ref`
 * per szyna) została nadpisana kartą K3: kryterium jest realne odwołanie
 * elementowe w kontrakcie, nie osobne pole dowodowe.
 *
 * DOPEŁNIENIE E8.3 (tabela GAŁĘZI): wiersze z `branch_results: PowerFlowBranchResult[]`
 * (`types.ts:75-83` → branch_id, p_from_mw, q_from_mvar, p_to_mw, q_to_mvar,
 * losses_p_mw, losses_q_mvar). DECYZJA ws. kolumny głównej (karta §2 „ZBADAJ"):
 * kontrakt nie niesie nazwy PL gałęzi — WYŁĄCZNIE `branch_id` (surowy identyfikator
 * elementu sieci, analogicznie do numeru katalogowego). Kolumna główna pokazuje
 * `branch_id` bez zmian/tłumaczenia — identyfikatory elementów sieci są dopuszczone
 * jako oznaczenia techniczne (MODEL_INTERAKCJI §2.7, jak oznaczenia katalogowe),
 * nie są to swobodne literały UI wymagające tłumaczenia na PL.
 */

import type {
  PowerFlowBranchResult,
  PowerFlowBusResult,
  PowerFlowResultV1,
} from '../../../../ui/power-flow-results/types';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
// Typy pozycji walidacji energetycznej (R3-A / K1-G2) — WYŁĄCZNIE typy (import
// type-only, zero wołań API z tego pliku); klient GET żyje w `jakosc/api.ts`.
import type { StatusWalidacji, WalidacjaItem } from '../../jakosc/api';
import type {
  DefinicjaKolumny,
  WartoscKomorki,
  WierszTabeli,
  WierszZalozenia,
} from '../../wzorzec';
import {
  ROZPLYW_STRINGS,
  fmtBaza,
  fmtKat,
  fmtMoc,
  fmtObciazenie,
  fmtPU,
  fmtStrataKvar,
  fmtStrataKw,
  fmtTolerancja,
  napiecePozaZakresem,
  NAPIECIE_MAX_PU,
  NAPIECIE_MIN_PU,
} from '../strings';

// ---------------------------------------------------------------------------
// Kolumny tabeli szyn (deklaratywne — jednostka w nagłówku, „jednostki zawsze")
// ---------------------------------------------------------------------------

export const KLUCZ_SZYNA = 'szyna';

export const KOLUMNY_SZYN: DefinicjaKolumny[] = [
  { klucz: KLUCZ_SZYNA, etykieta: ROZPLYW_STRINGS.kolSzyna, wyrownanie: 'lewo' },
  { klucz: 'napiecie', etykieta: ROZPLYW_STRINGS.kolNapiecie, jednostka: ROZPLYW_STRINGS.jednPU, mono: true },
  { klucz: 'kat', etykieta: ROZPLYW_STRINGS.kolKat, jednostka: ROZPLYW_STRINGS.jednStopnie, mono: true },
  { klucz: 'pCzynna', etykieta: ROZPLYW_STRINGS.kolMocCzynna, jednostka: ROZPLYW_STRINGS.jednMW, mono: true },
  { klucz: 'pBierna', etykieta: ROZPLYW_STRINGS.kolMocBierna, jednostka: ROZPLYW_STRINGS.jednMvar, mono: true },
];

// ---------------------------------------------------------------------------
// Mapowania czyste (bez React) — fixture 1:1 z kontraktem `PowerFlowResultV1`
// ---------------------------------------------------------------------------

/** Punkt profilu napięcia dla wykresu (jedna szyna). */
export interface PunktProfilu {
  szyna: string;
  napiecie: number;
}

/** Mapuje wiersze szyn na wiersze tabeli wzorca (kolejność ze źródła zachowana).
 * `dowodRef` = `bus_id` (K3/C1): 2× klik na wielkości wynikowej otwiera dowód
 * WHITE BOX przebiegu rozpływu — realne odwołanie z kontraktu, zero fabrykacji. */
export function naWierszeSzyn(busResults: PowerFlowBusResult[]): WierszTabeli[] {
  return busResults.map((r) => ({
    [KLUCZ_SZYNA]: { wartosc: r.bus_id },
    napiecie: {
      wartosc: fmtPU(r.v_pu),
      sortKey: r.v_pu,
      ostrzezenie: napiecePozaZakresem(r.v_pu),
      dowodRef: r.bus_id,
    },
    kat: { wartosc: fmtKat(r.angle_deg), sortKey: r.angle_deg, dowodRef: r.bus_id },
    pCzynna: { wartosc: fmtMoc(r.p_injected_mw), sortKey: r.p_injected_mw, dowodRef: r.bus_id },
    pBierna: { wartosc: fmtMoc(r.q_injected_mvar), sortKey: r.q_injected_mvar, dowodRef: r.bus_id },
  }));
}

/** Buduje sekcję ZAŁOŻENIA z parametrów przebiegu (WHITE BOX, W-602). */
export function naZalozeniaRozplywu(wynik: PowerFlowResultV1): WierszZalozenia[] {
  return [
    { etykieta: ROZPLYW_STRINGS.zalMocBazowa, wartosc: fmtBaza(wynik.base_mva), jednostka: ROZPLYW_STRINGS.jednMVA },
    { etykieta: ROZPLYW_STRINGS.zalTolerancja, wartosc: fmtTolerancja(wynik.tolerance_used) },
    { etykieta: ROZPLYW_STRINGS.zalSzynaBilansujaca, wartosc: wynik.slack_bus_id },
    { etykieta: ROZPLYW_STRINGS.zalLiczbaIteracji, wartosc: wynik.iterations_count },
    {
      etykieta: ROZPLYW_STRINGS.zalZbieznosc,
      wartosc: wynik.converged ? ROZPLYW_STRINGS.zbieznoscTak : ROZPLYW_STRINGS.zbieznoscNie,
    },
    {
      etykieta: ROZPLYW_STRINGS.zalPrzedzialNapiecia,
      wartosc: `${fmtPU(NAPIECIE_MIN_PU)}–${fmtPU(NAPIECIE_MAX_PU)}`,
      jednostka: ROZPLYW_STRINGS.jednPU,
      uwaga: ROZPLYW_STRINGS.zalPrzedzialNapieciaUwaga,
    },
  ];
}

/** Punkty profilu napięcia do wykresu (kolejność szyn ze źródła). */
export function naProfilNapiec(busResults: PowerFlowBusResult[]): PunktProfilu[] {
  return busResults.map((r) => ({ szyna: r.bus_id, napiecie: r.v_pu }));
}

// ---------------------------------------------------------------------------
// Kolumny tabeli gałęzi (karta E8.3 — dopełnienie W-603)
// ---------------------------------------------------------------------------

export const KLUCZ_GALAZ = 'galaz';

/** Klucz kolumny werdyktu obciążalności (R3-A / K1-G2). */
export const KLUCZ_OBCIAZENIE = 'obciazenie';

export const KOLUMNY_GALEZI: DefinicjaKolumny[] = [
  { klucz: KLUCZ_GALAZ, etykieta: ROZPLYW_STRINGS.kolGalaz, wyrownanie: 'lewo' },
  { klucz: 'pPoczatek', etykieta: ROZPLYW_STRINGS.kolPPoczatek, jednostka: ROZPLYW_STRINGS.jednMW, mono: true },
  { klucz: 'qPoczatek', etykieta: ROZPLYW_STRINGS.kolQPoczatek, jednostka: ROZPLYW_STRINGS.jednMvar, mono: true },
  { klucz: 'pKoniec', etykieta: ROZPLYW_STRINGS.kolPKoniec, jednostka: ROZPLYW_STRINGS.jednMW, mono: true },
  { klucz: 'qKoniec', etykieta: ROZPLYW_STRINGS.kolQKoniec, jednostka: ROZPLYW_STRINGS.jednMvar, mono: true },
  { klucz: 'stratyP', etykieta: ROZPLYW_STRINGS.kolStratyP, jednostka: ROZPLYW_STRINGS.jednKW, mono: true },
  { klucz: 'stratyQ', etykieta: ROZPLYW_STRINGS.kolStratyQ, jednostka: ROZPLYW_STRINGS.jednKvar, mono: true },
  // R3-A (K1-G2): werdykt obciążalności z walidacji energetycznej backendu —
  // ostatnia kolumna danych, bezpośrednio przy kolumnie decyzji („Popraw w modelu").
  { klucz: KLUCZ_OBCIAZENIE, etykieta: ROZPLYW_STRINGS.kolObciazenie, jednostka: ROZPLYW_STRINGS.jednProcent, mono: true },
];

// ---------------------------------------------------------------------------
// Werdykt obciążalności gałęzi (karta R3-A / K1-G2)
// ---------------------------------------------------------------------------
// Kontrakt `PowerFlowBranchResult` (FROZEN) NIE niesie obciążalności — werdykt
// KONSUMUJEMY z istniejącego endpointu walidacji energetycznej
// (`GET /api/quality/energy-validation?run_id=`, klient: `jakosc/api.ts`):
// pozycje `check_type=BRANCH_LOADING|TRANSFORMER_LOADING` kluczowane
// `target_id`=`branch_id` (mapowanie gruntowane backendem —
// `analysis/energy_validation/builder.py`, patrz `jakosc/jakoscModel.ts:219-241`).
// ZERO fizyki w UI: `observed_value` [%] i status (PASS/WARNING/FAIL/NOT_COMPUTED)
// pochodzą WYŁĄCZNIE z backendu; adapter wyłącznie formatuje.
// Komórka obciążenia NIE niesie `dowodRef`: wartość liczy builder walidacji,
// nie solver rozpływu — ref do śladu przebiegu byłby dowodem INNEJ wielkości
// (reguła K3/R2-A: wywód buildera, `white_box`, żyje w szczególe pozycji okna
// „Jakość wyników", nie w śladzie przebiegu).

/** Pozycja obciążalności dla gałęzi — projekcja pozycji walidacji energetycznej. */
export interface PozycjaObciazenia {
  /** Rodzaj kontroli — rozróżnia gałąź liniową od transformatora (akcja naprawcza). */
  checkType: 'BRANCH_LOADING' | 'TRANSFORMER_LOADING';
  /** Obciążenie [%] policzone przez backend (null = nie policzono). */
  observedValue: number | null;
  /** Werdykt backendu — jedyne źródło ostrzeżenia (WARNING/FAIL). */
  status: StatusWalidacji;
}

/**
 * Buduje mapę `branch_id` → pozycja obciążalności z pozycji walidacji
 * energetycznej. Czysta funkcja: filtruje wyłącznie kontrole obciążalności,
 * pozostałe rodzaje (napięcie, straty, bilans biernej) pomija. Przy duplikacie
 * `target_id` wygrywa PIERWSZA pozycja (deterministycznie, kolejność źródła).
 */
export function naMapeObciazen(
  items: readonly WalidacjaItem[],
): Map<string, PozycjaObciazenia> {
  const mapa = new Map<string, PozycjaObciazenia>();
  for (const it of items) {
    if (it.check_type !== 'BRANCH_LOADING' && it.check_type !== 'TRANSFORMER_LOADING') continue;
    if (mapa.has(it.target_id)) continue;
    mapa.set(it.target_id, {
      checkType: it.check_type,
      observedValue: it.observed_value,
      status: it.status,
    });
  }
  return mapa;
}

/**
 * Komórka „Obciążenie [%]" z pozycji walidacji (czysta funkcja, testowalna
 * fixture'ami). Uczciwe stany (R3-A): brak pozycji dla gałęzi lub brak wartości
 * → kreska bez werdyktu; `ostrzezenie` WYŁĄCZNIE z werdyktu backendu
 * (WARNING/FAIL) — zero progów po stronie UI.
 */
export function komorkaObciazenia(poz: PozycjaObciazenia | undefined): WartoscKomorki {
  if (!poz) return { wartosc: ROZPLYW_STRINGS.kreska };
  const ostrzezenie = poz.status === 'WARNING' || poz.status === 'FAIL';
  if (poz.observedValue === null) {
    // Pozycja bez wartości (np. NOT_COMPUTED) — kreska; werdykt backendu zachowany.
    return ostrzezenie
      ? { wartosc: ROZPLYW_STRINGS.kreska, ostrzezenie: true }
      : { wartosc: ROZPLYW_STRINGS.kreska };
  }
  return {
    wartosc: fmtObciazenie(poz.observedValue),
    sortKey: poz.observedValue,
    ...(ostrzezenie ? { ostrzezenie: true } : {}),
  };
}

/** Mapuje wiersze gałęzi na wiersze tabeli wzorca (kolejność ze źródła zachowana).
 * Straty (MW/Mvar w kontrakcie) prezentowane w kW/kvar — skalowanie jednostki
 * prezentacji, patrz `fmtStrataKw`/`fmtStrataKvar` w `strings.ts`; `sortKey`
 * niesie tę samą (skalowaną) wartość liczbową, więc sortowanie i wyświetlana
 * jednostka są spójne. `dowodRef` = `branch_id` (K3/C1) — jak `naWierszeSzyn`.
 * R3-A (parametr addytywny): `obciazenia` = mapa `branch_id` → pozycja
 * obciążalności z walidacji energetycznej; brak mapy (null/undefined — walidacja
 * niedostępna) → kolumna „Obciążenie" z kreskami, tabela działa jak dotąd. */
export function naWierszeGalezi(
  branchResults: PowerFlowBranchResult[],
  obciazenia?: ReadonlyMap<string, PozycjaObciazenia> | null,
): WierszTabeli[] {
  return branchResults.map((r) => ({
    [KLUCZ_GALAZ]: { wartosc: r.branch_id },
    pPoczatek: { wartosc: fmtMoc(r.p_from_mw), sortKey: r.p_from_mw, dowodRef: r.branch_id },
    qPoczatek: { wartosc: fmtMoc(r.q_from_mvar), sortKey: r.q_from_mvar, dowodRef: r.branch_id },
    pKoniec: { wartosc: fmtMoc(r.p_to_mw), sortKey: r.p_to_mw, dowodRef: r.branch_id },
    qKoniec: { wartosc: fmtMoc(r.q_to_mvar), sortKey: r.q_to_mvar, dowodRef: r.branch_id },
    stratyP: {
      wartosc: fmtStrataKw(r.losses_p_mw),
      sortKey: r.losses_p_mw * 1000,
      dowodRef: r.branch_id,
    },
    stratyQ: {
      wartosc: fmtStrataKvar(r.losses_q_mvar),
      sortKey: r.losses_q_mvar * 1000,
      dowodRef: r.branch_id,
    },
    [KLUCZ_OBCIAZENIE]: komorkaObciazenia(obciazenia?.get(r.branch_id)),
  }));
}

/** Podsumowanie strat gałęzi (wiersz sumy pod tabelą, karta E8.3). */
export interface PodsumowanieStratGalezi {
  stratyPKw: string;
  stratyQKvar: string;
}

/** Suma strat czynnych/biernych po wszystkich gałęziach wyniku — arytmetyka
 * PREZENTACJI (proste sumowanie już policzonych przez solver wartości), NIE
 * fizyka: solver dostarcza straty per gałąź, tu wyłącznie się je sumuje
 * i skaluje jednostkę (MW/Mvar → kW/kvar, jak `naWierszeGalezi`). */
export function naSumeStratGalezi(branchResults: PowerFlowBranchResult[]): PodsumowanieStratGalezi {
  const sumaPMw = branchResults.reduce((acc, r) => acc + r.losses_p_mw, 0);
  const sumaQMvar = branchResults.reduce((acc, r) => acc + r.losses_q_mvar, 0);
  return {
    stratyPKw: fmtStrataKw(sumaPMw),
    stratyQKvar: fmtStrataKvar(sumaQMvar),
  };
}

// ---------------------------------------------------------------------------
// Hook read-only (spięcie ze store'em wyników rozpływu)
// ---------------------------------------------------------------------------

/** Projekcja read-only: wynik rozpływu + identyfikator przebiegu (dla nagłówka). */
export interface WynikRozplywu {
  wynik: PowerFlowResultV1 | null;
  runId: string | null;
}

/** Czyta wynik rozpływu ze store'u (read-only) — bez wołań API z tego pliku. */
export function useWynikRozplywu(): WynikRozplywu {
  const wynik = usePowerFlowResultsStore((s) => s.results);
  const runId = usePowerFlowResultsStore((s) => s.runHeader?.id ?? null);
  return { wynik, runId };
}
