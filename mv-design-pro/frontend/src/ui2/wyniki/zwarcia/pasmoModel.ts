/*
 * Model i adapter sekcji „Pasmo MIN/MAX" (karta W3-G3, aneks D7, mapa
 * domknięcia 3 #12) — oba scenariusze c_max/c_min JEDNEGO przypadku obok
 * siebie. Read-only; zero fizyki, zero mutacji, zero wołań API z tego pliku
 * (dostawca danych: `pasmo/../api.ts::usePasmoZwarcia`).
 *
 * PAROWANIE WIERSZY jest prezentacją (dopasowanie po `target_id`, sortowanie),
 * NIE fizyką — żadna wartość liczbowa nie jest tu przeliczana, wyłącznie
 * zestawiona obok siebie (karta §Granice: "prezentowany surowo").
 *
 * `dowodRef` CELOWO POMINIĘTY na komórkach tej tabeli: „Dowód obliczeń"
 * (`onOtworzDowod`) jest zakresu JEDNEGO aktywnego przebiegu — strona pasma
 * bywa INNYM, niezależnym biegiem (zapisany sąsiad przypadku) albo w ogóle
 * biegiem bez własnego `run_id` (policzony na żądanie), więc 2× klik
 * prowadziłby do dowodu NIEWŁAŚCIWEGO biegu (zero fabrykacji nawigacji).
 */

import type { ExecutionAnalysisType } from '../../../ui/study-cases/types';
import type { ShortCircuitRow } from '../../../ui/results-inspector/types';
import type { DefinicjaKolumny, WartoscKomorki, WierszTabeli } from '../wzorzec';
import {
  ZWARCIA_STRINGS,
  fmtKA,
  fmtKappa,
  fmtMVA,
  fmtOhm,
  rodzajZwarciaPL,
} from './strings';

// ---------------------------------------------------------------------------
// Mapowanie typu zwarcia biegu -> rodzaj analizy (dla akcji „Uruchom brakujący
// scenariusz" — TEN SAM tor co przycisk „Oblicz", `ui2/spaces/obliczenia`).
// ---------------------------------------------------------------------------

const TYP_ZWARCIA_NA_ANALYSIS_TYPE: Record<string, ExecutionAnalysisType> = {
  '3F': 'SC_3F',
  '1F': 'SC_1F',
  '2F': 'SC_2F',
  '2F+Z': 'SC_2F_G',
};

/** Mapuje typ zwarcia kotwicy (`typ_zwarcia_kotwicy`) na rodzaj biegu —
 * nierozpoznany typ (starszy/inny token) spada na SC_3F, jak `_normalize_solver_input`
 * backendu (domyślne '3F' dla braku rozpoznania). */
export function typZwarciaNaAnalysisType(typ: string): ExecutionAnalysisType {
  return TYP_ZWARCIA_NA_ANALYSIS_TYPE[typ.trim().toUpperCase()] ?? 'SC_3F';
}

// ---------------------------------------------------------------------------
// Parowanie wierszy MAX/MIN po target_id (kolejność deterministyczna: sort id).
// ---------------------------------------------------------------------------

/** Para wierszy (MAX, MIN) tego samego punktu zwarcia — którakolwiek strona
 * może brakować (`null`), gdy ta strona pasma jest niedostępna. */
export interface WierszPasma {
  readonly targetId: string;
  readonly targetName: string;
  readonly faultType: string | null;
  readonly max: ShortCircuitRow | null;
  readonly min: ShortCircuitRow | null;
}

/** Paruje wiersze obu stron pasma po `target_id` — unia identyfikatorów (żaden
 * punkt obecny WYŁĄCZNIE w jednej stronie nie ginie), kolejność deterministyczna. */
export function sparujWierszePasma(
  maxRows: readonly ShortCircuitRow[] | undefined,
  minRows: readonly ShortCircuitRow[] | undefined,
): WierszPasma[] {
  const mapaMax = new Map((maxRows ?? []).map((wiersz) => [wiersz.target_id, wiersz] as const));
  const mapaMin = new Map((minRows ?? []).map((wiersz) => [wiersz.target_id, wiersz] as const));
  const identyfikatory = Array.from(new Set([...mapaMax.keys(), ...mapaMin.keys()])).sort();
  return identyfikatory.map((targetId) => {
    const wierszMax = mapaMax.get(targetId) ?? null;
    const wierszMin = mapaMin.get(targetId) ?? null;
    return {
      targetId,
      targetName: wierszMax?.target_name ?? wierszMin?.target_name ?? targetId,
      faultType: wierszMax?.fault_type ?? wierszMin?.fault_type ?? null,
      max: wierszMax,
      min: wierszMin,
    };
  });
}

// ---------------------------------------------------------------------------
// Kolumny tabeli pasma (deklaratywne — pary MAX/MIN dla każdej wielkości już
// niesionej przez wynik, aneks D7: "Ik″ max/min per szyna, ip, Ith i inne
// wielkości już niesione przez wynik" — pełny bilans IEC 60909, jak w tabeli
// głównej, żeby nie spłycać pasma do trzech wielkości).
// ---------------------------------------------------------------------------

export const KLUCZ_PASMO = 'identyfikator';

export const KOLUMNY_PASMO: DefinicjaKolumny[] = [
  { klucz: 'punkt', etykieta: ZWARCIA_STRINGS.kolPunkt, wyrownanie: 'lewo' },
  { klucz: 'rodzaj', etykieta: ZWARCIA_STRINGS.kolRodzaj, wyrownanie: 'lewo' },
  { klucz: 'ikssMax', etykieta: ZWARCIA_STRINGS.pasmoKolIkssMax, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'ikssMin', etykieta: ZWARCIA_STRINGS.pasmoKolIkssMin, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'ipMax', etykieta: ZWARCIA_STRINGS.pasmoKolIpMax, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'ipMin', etykieta: ZWARCIA_STRINGS.pasmoKolIpMin, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'ithMax', etykieta: ZWARCIA_STRINGS.pasmoKolIthMax, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'ithMin', etykieta: ZWARCIA_STRINGS.pasmoKolIthMin, jednostka: ZWARCIA_STRINGS.jednKA, mono: true },
  { klucz: 'skMax', etykieta: ZWARCIA_STRINGS.pasmoKolSkMax, jednostka: ZWARCIA_STRINGS.jednMVA, mono: true },
  { klucz: 'skMin', etykieta: ZWARCIA_STRINGS.pasmoKolSkMin, jednostka: ZWARCIA_STRINGS.jednMVA, mono: true },
  {
    klucz: 'rkMax',
    etykieta: ZWARCIA_STRINGS.pasmoKolRkMax,
    jednostka: ZWARCIA_STRINGS.jednOhm,
    mono: true,
    tylkoEkspercki: true,
  },
  {
    klucz: 'rkMin',
    etykieta: ZWARCIA_STRINGS.pasmoKolRkMin,
    jednostka: ZWARCIA_STRINGS.jednOhm,
    mono: true,
    tylkoEkspercki: true,
  },
  {
    klucz: 'xkMax',
    etykieta: ZWARCIA_STRINGS.pasmoKolXkMax,
    jednostka: ZWARCIA_STRINGS.jednOhm,
    mono: true,
    tylkoEkspercki: true,
  },
  {
    klucz: 'xkMin',
    etykieta: ZWARCIA_STRINGS.pasmoKolXkMin,
    jednostka: ZWARCIA_STRINGS.jednOhm,
    mono: true,
    tylkoEkspercki: true,
  },
  {
    klucz: 'zkMax',
    etykieta: ZWARCIA_STRINGS.pasmoKolZkMax,
    jednostka: ZWARCIA_STRINGS.jednOhm,
    mono: true,
    tylkoEkspercki: true,
  },
  {
    klucz: 'zkMin',
    etykieta: ZWARCIA_STRINGS.pasmoKolZkMin,
    jednostka: ZWARCIA_STRINGS.jednOhm,
    mono: true,
    tylkoEkspercki: true,
  },
  { klucz: 'xrMax', etykieta: ZWARCIA_STRINGS.pasmoKolXRMax, mono: true, tylkoEkspercki: true },
  { klucz: 'xrMin', etykieta: ZWARCIA_STRINGS.pasmoKolXRMin, mono: true, tylkoEkspercki: true },
  { klucz: 'kappaMax', etykieta: ZWARCIA_STRINGS.pasmoKolKappaMax, mono: true, tylkoEkspercki: true },
  { klucz: 'kappaMin', etykieta: ZWARCIA_STRINGS.pasmoKolKappaMin, mono: true, tylkoEkspercki: true },
  {
    klucz: KLUCZ_PASMO,
    etykieta: ZWARCIA_STRINGS.kolIdentyfikator,
    mono: true,
    wyrownanie: 'lewo',
    tylkoEkspercki: true,
  },
];

/** Komórka wielkości pasma: `null` → kreska (bez dowodu — patrz nagłówek pliku). */
function komorkaPasma(wartosc: number | null | undefined, format: (n: number) => string): WartoscKomorki {
  if (wartosc === null || wartosc === undefined) {
    return { wartosc: ZWARCIA_STRINGS.kreska, sortKey: Number.NEGATIVE_INFINITY };
  }
  return { wartosc: format(wartosc), sortKey: wartosc };
}

/** Mapuje pary wierszy (MAX, MIN) na wiersze tabeli wzorca (kolejność: parowanie). */
export function naWierszePasma(pary: readonly WierszPasma[]): WierszTabeli[] {
  return pary.map((para) => ({
    punkt: { wartosc: para.targetName },
    rodzaj: { wartosc: rodzajZwarciaPL(para.faultType) },
    ikssMax: komorkaPasma(para.max?.ikss_ka, fmtKA),
    ikssMin: komorkaPasma(para.min?.ikss_ka, fmtKA),
    ipMax: komorkaPasma(para.max?.ip_ka, fmtKA),
    ipMin: komorkaPasma(para.min?.ip_ka, fmtKA),
    ithMax: komorkaPasma(para.max?.ith_ka, fmtKA),
    ithMin: komorkaPasma(para.min?.ith_ka, fmtKA),
    skMax: komorkaPasma(para.max?.sk_mva, fmtMVA),
    skMin: komorkaPasma(para.min?.sk_mva, fmtMVA),
    rkMax: komorkaPasma(para.max?.rk_ohm, fmtOhm),
    rkMin: komorkaPasma(para.min?.rk_ohm, fmtOhm),
    xkMax: komorkaPasma(para.max?.xk_ohm, fmtOhm),
    xkMin: komorkaPasma(para.min?.xk_ohm, fmtOhm),
    zkMax: komorkaPasma(para.max?.zk_ohm, fmtOhm),
    zkMin: komorkaPasma(para.min?.zk_ohm, fmtOhm),
    xrMax: komorkaPasma(para.max?.xr_ratio, fmtKappa),
    xrMin: komorkaPasma(para.min?.xr_ratio, fmtKappa),
    kappaMax: komorkaPasma(para.max?.kappa, fmtKappa),
    kappaMin: komorkaPasma(para.min?.kappa, fmtKappa),
    [KLUCZ_PASMO]: { wartosc: para.targetId },
  }));
}

// ---------------------------------------------------------------------------
// Świeżość PARY (różne rewizje obu stron) — porównanie DWÓCH liczb już
// dostarczonych przez backend (`analysis_case_context.rewizja_modelu` per
// strona); front nie liczy fizyki, wyłącznie `!==` na dwóch liczbach — TA SAMA
// klasa porównania co reszta `ui2/freshness` (rewizjaDanej vs rewizjaModelu),
// zastosowana symetrycznie do PARY biegów zamiast do pary (dana, model).
// ---------------------------------------------------------------------------

/** Wynik porównania świeżości pary — `null`, gdy którakolwiek rewizja nieznana
 * (starszy bieg bez nagłówka rewizji) — uczciwy brak, nie fałszywe "zgodne". */
export interface SwiezoscParyPasma {
  readonly zgodne: boolean;
  readonly starsza: number;
  readonly nowsza: number;
}

export function swiezoscParyPasma(
  rewizjaMax: number | null | undefined,
  rewizjaMin: number | null | undefined,
): SwiezoscParyPasma | null {
  if (typeof rewizjaMax !== 'number' || typeof rewizjaMin !== 'number') return null;
  return {
    zgodne: rewizjaMax === rewizjaMin,
    starsza: Math.min(rewizjaMax, rewizjaMin),
    nowsza: Math.max(rewizjaMax, rewizjaMin),
  };
}
