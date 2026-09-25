/*
 * Dane odniesienia analiz specjalistycznych (katalog `GET /api/catalog/v126/{namespace}`,
 * `backend/src/api/v126_academic.py::get_v126_catalog`) w języku projektanta (karta #145).
 *
 * Panel „Dane odniesienia" pokazywał katalog SPŁASZCZONY do ścieżek kontraktu
 * (`[0].u_m_kv`, `individual_percent.5`, `element: linia_napowietrzna_sn`, `GFM_droop`) —
 * klucze i kody zamiast wielkości. Tu każda przestrzeń katalogu ma jawną prezentację:
 * polska nazwa wielkości, wartość z jednostką, polska nazwa elementu albo trybu z map
 * TYPOWANYCH unią kodów. Klucz spoza map nie trafia na ekran jako kod — kompletność map
 * wobec odpowiedzi backendu przypina `__tests__/odniesienia.test.ts` na fiksturze
 * `harness-fixtures/generated/katalogi_odniesien_v126.json` (eksport tą samą funkcją,
 * którą woła końcówka), więc nowy klucz w backendzie zapala czerwień, zanim zniknie
 * z ekranu po cichu.
 *
 * Zero fizyki: wartości są przepisywane, nie liczone.
 */

import { AKADEMICKIE_STRINGS as S, fmtWartosc } from './strings';

/** Jeden wiersz prezentacji danych odniesienia. */
export interface WierszOdniesienia {
  readonly etykieta: string;
  readonly wartosc: string;
}

/** Przestrzenie katalogu wskazywane przez karty analiz (`katalog_odniesienia`). */
export type PrzestrzenOdniesien =
  | 'harmonic-limits'
  | 'insulation-levels'
  | 'reliability-defaults'
  | 'converter-modes';

type KluczLimituHarmonicznych =
  | 'thdu_pnen50160_percent'
  | 'thdu_ieee519_percent'
  | 'tdd_ieee519_default_percent';

const LIMITY_HARMONICZNYCH: Readonly<Record<KluczLimituHarmonicznych, string>> = {
  thdu_pnen50160_percent: S.odnThduPnEn50160,
  thdu_ieee519_percent: S.odnThduIeee519,
  tdd_ieee519_default_percent: S.odnTddIeee519,
};

type ElementNiezawodnosci =
  | 'linia_napowietrzna_sn'
  | 'kabel_sn'
  | 'transformator_sn_nn'
  | 'pole_sn';

const ELEMENTY_NIEZAWODNOSCI: Readonly<Record<ElementNiezawodnosci, string>> = {
  linia_napowietrzna_sn: S.odnElementLinia,
  kabel_sn: S.odnElementKabel,
  transformator_sn_nn: S.odnElementTransformator,
  pole_sn: S.odnElementPole,
};

type TrybPrzeksztaltnika = 'GFL' | 'GFM_droop' | 'VSM' | 'Grid_Supporting';

const TRYBY_PRZEKSZTALTNIKA: Readonly<Record<TrybPrzeksztaltnika, string>> = {
  GFL: S.odnTrybGfl,
  GFM_droop: S.odnTrybGfmStatyzm,
  VSM: S.odnTrybVsm,
  Grid_Supporting: S.odnTrybWspierajacy,
};

function jestObiektem(wartosc: unknown): wartosc is Record<string, unknown> {
  return typeof wartosc === 'object' && wartosc !== null && !Array.isArray(wartosc);
}

function klucz<T extends string>(mapa: Readonly<Record<T, unknown>>, kod: unknown): T | null {
  return typeof kod === 'string' && Object.prototype.hasOwnProperty.call(mapa, kod) ? (kod as T) : null;
}

function wartoscZJednostka(wartosc: unknown, jednostka: string): string {
  return `${fmtWartosc(wartosc)} ${jednostka}`;
}

function limityHarmonicznych(items: unknown): WierszOdniesienia[] {
  if (!jestObiektem(items)) return [];
  const wiersze: WierszOdniesienia[] = [];
  (Object.keys(LIMITY_HARMONICZNYCH) as KluczLimituHarmonicznych[]).forEach((kod) => {
    if (kod in items) {
      wiersze.push({ etykieta: LIMITY_HARMONICZNYCH[kod], wartosc: wartoscZJednostka(items[kod], '%') });
    }
  });
  const indywidualne = items.individual_percent;
  if (jestObiektem(indywidualne)) {
    Object.keys(indywidualne)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((rzad) => {
        wiersze.push({
          etykieta: S.odnHarmonicznaRzedu(rzad),
          wartosc: wartoscZJednostka(indywidualne[rzad], '%'),
        });
      });
  }
  return wiersze;
}

function poziomyIzolacji(items: unknown): WierszOdniesienia[] {
  if (!Array.isArray(items)) return [];
  return items.filter(jestObiektem).map((poziom) => ({
    etykieta: S.odnPoziomIzolacji(fmtWartosc(poziom.u_m_kv)),
    wartosc: S.odnPoziomIzolacjiWartosc(fmtWartosc(poziom.bil_kv), fmtWartosc(poziom.short_duration_50hz_kv)),
  }));
}

function niezawodnosc(items: unknown): WierszOdniesienia[] {
  if (!Array.isArray(items)) return [];
  return items.filter(jestObiektem).flatMap((pozycja) => {
    const element = klucz(ELEMENTY_NIEZAWODNOSCI, pozycja.element);
    if (element === null) return [];
    const intensywnosc =
      'lambda_per_km_year' in pozycja
        ? wartoscZJednostka(pozycja.lambda_per_km_year, S.odnJednostkaNaKmRok)
        : wartoscZJednostka(pozycja.lambda_per_year, S.odnJednostkaNaRok);
    return [
      {
        etykieta: ELEMENTY_NIEZAWODNOSCI[element],
        wartosc: S.odnNiezawodnoscWartosc(intensywnosc, wartoscZJednostka(pozycja.mttr_h, 'h')),
      },
    ];
  });
}

function trybyPrzeksztaltnika(items: unknown): WierszOdniesienia[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((kod) => {
    const tryb = klucz(TRYBY_PRZEKSZTALTNIKA, kod);
    return tryb === null ? [] : [{ etykieta: S.odnTrybEtykieta, wartosc: TRYBY_PRZEKSZTALTNIKA[tryb] }];
  });
}

const PREZENTACJA_ODNIESIEN: Readonly<Record<PrzestrzenOdniesien, (items: unknown) => WierszOdniesienia[]>> = {
  'harmonic-limits': limityHarmonicznych,
  'insulation-levels': poziomyIzolacji,
  'reliability-defaults': niezawodnosc,
  'converter-modes': trybyPrzeksztaltnika,
};

/**
 * Wiersze danych odniesienia przestrzeni `przestrzen` w języku projektanta; `null`
 * dla przestrzeni bez prezentacji (panel mówi to wprost, zamiast pokazać klucze).
 */
export function wierszeOdniesien(przestrzen: string, items: unknown): WierszOdniesienia[] | null {
  const prezentacja = klucz(PREZENTACJA_ODNIESIEN, przestrzen);
  if (prezentacja === null) return null;
  return PREZENTACJA_ODNIESIEN[prezentacja](items);
}
