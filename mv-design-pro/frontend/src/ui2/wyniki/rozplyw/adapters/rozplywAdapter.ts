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
 * 2. Dowód per-wartość (2× klik → dowodRef): `bus_results` NIE niosą odwołania do
 *    dowodu; `evidence_ref` istnieje wyłącznie w warstwie interpretacji
 *    (`VoltageFinding.evidence_ref`, `types.ts:250`), a `proof_pack_ref` na
 *    nagłówku (`types.ts:40`) dotyczy CAŁEGO przebiegu, nie pojedynczej szyny →
 *    komórki napięć bez `dowodRef` (semantyka 2× klik pozostaje w kontrakcie wzorca,
 *    zademonstrowana w testach wzorca). Per-szynowy dowód = osobna karta (warstwa
 *    interpretacji rozpływu).
 * 3. Populacja store'u (`selectRun`/`loadResults`, `store.ts:109-184`) należy do
 *    okna inspektora rozpływu; ten adapter wyłącznie CZYTA `results` (read-only).
 */

import type {
  PowerFlowBusResult,
  PowerFlowResultV1,
} from '../../../../ui/power-flow-results/types';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import type { DefinicjaKolumny, WierszTabeli, WierszZalozenia } from '../../wzorzec';
import {
  ROZPLYW_STRINGS,
  fmtBaza,
  fmtKat,
  fmtMoc,
  fmtPU,
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

/** Mapuje wiersze szyn na wiersze tabeli wzorca (kolejność ze źródła zachowana). */
export function naWierszeSzyn(busResults: PowerFlowBusResult[]): WierszTabeli[] {
  return busResults.map((r) => ({
    [KLUCZ_SZYNA]: { wartosc: r.bus_id },
    napiecie: {
      wartosc: fmtPU(r.v_pu),
      sortKey: r.v_pu,
      ostrzezenie: napiecePozaZakresem(r.v_pu),
    },
    kat: { wartosc: fmtKat(r.angle_deg), sortKey: r.angle_deg },
    pCzynna: { wartosc: fmtMoc(r.p_injected_mw), sortKey: r.p_injected_mw },
    pBierna: { wartosc: fmtMoc(r.q_injected_mvar), sortKey: r.q_injected_mvar },
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
