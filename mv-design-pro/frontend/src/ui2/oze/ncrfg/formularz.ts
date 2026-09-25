/*
 * Formularz wejścia biegu „co-jeśli" NC RfG — pola 1:1 z `contracts.NcRfgPtpireeModuleInput`
 * i `enm/nastawy_modulu.NastawyZabezpieczenModulu` (karta AB-1a Pakiet D2 §2, §8).
 *
 * Ograniczenia pól liczbowych są LUSTREM ograniczeń pydantic (`Field(gt=…, ge=…, le=…)`,
 * `FiniteFloat`); test `formularz.test.ts` porównuje je z `backend/schemas/openapi_snapshot.json`
 * (ta sama prawda, żadnej drugiej). Walidacja po stronie klienta NIE ocenia modułu — wyłącznie
 * blokuje wysłanie żądania, które backend odrzuciłby 422, i nazywa pole z brakiem.
 * Jednostki wynikają z nazw pól kontraktu (`_kw`, `_hz`, `_percent`, `_s`, `_pu`, `_deg`).
 */

import { POLA_NASTAW, type NastawyZabezpieczenModulu, type PoleNastawy } from './typy';

/** Pola liczbowe wejścia modułu wypełniane w formularzu (moc i napięcie idą z modelu). */
export const POLA_LICZBOWE_WEJSCIA = [
  'p_min_kw',
  'droop_percent',
  'dead_band_hz',
  'ramp_rate_pct_per_min',
  'cos_phi_min',
  'q_range_pct_pn_min',
  'q_range_pct_pn_max',
  'reactive_current_gain',
  'p_recovery_time_s',
  'harmonic_thdu_percent',
  'cease_generation_time_s',
] as const;

export type PoleLiczboweWejscia = (typeof POLA_LICZBOWE_WEJSCIA)[number];

/** Ograniczenie pola liczbowego — lustro `Field(gt=…, ge=…, le=…)` backendu. */
export interface Ograniczenie {
  /** Wartość musi być większa od (`exclusiveMinimum`). */
  readonly gt?: number;
  /** Wartość nie mniejsza od (`minimum`). */
  readonly ge?: number;
  /** Wartość nie większa od (`maximum`). */
  readonly le?: number;
}

/** `contracts.NcRfgPtpireeModuleInput` — ograniczenia pól liczbowych formularza. */
export const OGRANICZENIA_WEJSCIA: Readonly<Record<PoleLiczboweWejscia, Ograniczenie>> = {
  p_min_kw: { ge: 0 },
  droop_percent: { gt: 0 },
  dead_band_hz: { ge: 0 },
  ramp_rate_pct_per_min: { gt: 0 },
  cos_phi_min: { gt: 0, le: 1 },
  q_range_pct_pn_min: {},
  q_range_pct_pn_max: {},
  reactive_current_gain: { ge: 0 },
  p_recovery_time_s: { ge: 0 },
  harmonic_thdu_percent: { ge: 0 },
  cease_generation_time_s: { gt: 0 },
};

/** `enm/nastawy_modulu.NastawyZabezpieczenModulu` — ograniczenia pól nastaw. */
export const OGRANICZENIA_NASTAW: Readonly<Record<PoleNastawy, Ograniczenie>> = {
  u_min_pu: { ge: 0 },
  u_min_czas_s: { ge: 0 },
  u_max_pu: { gt: 0 },
  u_max_czas_s: { ge: 0 },
  f_min_hz: { gt: 0 },
  f_min_czas_s: { ge: 0 },
  f_max_hz: { gt: 0 },
  f_max_czas_s: { ge: 0 },
  rocof_hz_s: { gt: 0 },
  rocof_czas_s: { ge: 0 },
  przesuniecie_fazy_deg: { gt: 0, le: 180 },
};

/** Etykiety pól liczbowych wejścia (z jednostką z nazwy pola kontraktu). */
export const ETYKIETY_POL_WEJSCIA: Readonly<Record<PoleLiczboweWejscia, string>> = {
  p_min_kw: 'Moc minimalna [kW]',
  droop_percent: 'Statyzm P(f) [%]',
  dead_band_hz: 'Strefa nieczułości [Hz]',
  ramp_rate_pct_per_min: 'Szybkość zmiany mocy [%/min]',
  cos_phi_min: 'Minimalny współczynnik mocy cosφ',
  q_range_pct_pn_min: 'Zakres Q — dolna granica [p.u. P_n]',
  q_range_pct_pn_max: 'Zakres Q — górna granica [p.u. P_n]',
  reactive_current_gain: 'Wzmocnienie prądu biernego k',
  p_recovery_time_s: 'Czas odbudowy mocy czynnej po zwarciu [s]',
  harmonic_thdu_percent: 'Współczynnik THD napięcia [%]',
  cease_generation_time_s: 'Czas zaprzestania generacji na polecenie (T12) [s]',
};

/** Etykiety pól nastaw zabezpieczeń (słownik Banku Nastaw, jednostki z nazw pól). */
export const ETYKIETY_POL_NASTAW: Readonly<Record<PoleNastawy, string>> = {
  u_min_pu: 'U< — próg [p.u. U_n]',
  u_min_czas_s: 'U< — czas [s]',
  u_max_pu: 'U> — próg [p.u. U_n]',
  u_max_czas_s: 'U> — czas [s]',
  f_min_hz: 'f< — próg [Hz]',
  f_min_czas_s: 'f< — czas [s]',
  f_max_hz: 'f> — próg [Hz]',
  f_max_czas_s: 'f> — czas [s]',
  rocof_hz_s: 'RoCoF — próg [Hz/s]',
  rocof_czas_s: 'RoCoF — czas [s]',
  przesuniecie_fazy_deg: 'Skok wektora — próg [°]',
};

/** Wynik parsowania pola: wartość (`null` = pole puste) albo nazwany błąd. */
export type WynikPola =
  | { readonly stan: 'ok'; readonly wartosc: number | null }
  | { readonly stan: 'blad'; readonly komunikat: string };

/**
 * Parsuje wartość pola formularza wobec ograniczenia kontraktu. Puste = `null` (backend:
 * „brak danej", ocena niewykonana z nazwanym brakiem — nigdy wartość typowa).
 */
export function parsujPole(tekst: string, ograniczenie: Ograniczenie): WynikPola {
  const przyciete = tekst.trim().replace(',', '.');
  if (przyciete === '') return { stan: 'ok', wartosc: null };
  const liczba = Number(przyciete);
  if (!Number.isFinite(liczba)) {
    return { stan: 'blad', komunikat: 'wymagana liczba skończona' };
  }
  if (ograniczenie.gt !== undefined && !(liczba > ograniczenie.gt)) {
    return { stan: 'blad', komunikat: `wartość musi być większa od ${ograniczenie.gt}` };
  }
  if (ograniczenie.ge !== undefined && !(liczba >= ograniczenie.ge)) {
    return { stan: 'blad', komunikat: `wartość nie może być mniejsza od ${ograniczenie.ge}` };
  }
  if (ograniczenie.le !== undefined && !(liczba <= ograniczenie.le)) {
    return { stan: 'blad', komunikat: `wartość nie może być większa od ${ograniczenie.le}` };
  }
  return { stan: 'ok', wartosc: liczba };
}

/** Stan „moduł istniejący" (art. 4) w formularzu: trzy jawne stany, `null` = nieustalone. */
export type StanModuluIstniejacego = 'nieustalone' | 'tak' | 'nie';

export function modulIstniejacyZeStanu(stan: StanModuluIstniejacego): boolean | null {
  switch (stan) {
    case 'nieustalone':
      return null;
    case 'tak':
      return true;
    case 'nie':
      return false;
  }
}

/** Dane nastaw w formularzu: wartości tekstowe i źródło nastaw. */
export interface FormularzNastaw {
  readonly wartosci: Readonly<Record<PoleNastawy, string>>;
  readonly zrodlo: string;
}

export const PUSTE_NASTAWY: FormularzNastaw = {
  wartosci: Object.fromEntries(POLA_NASTAW.map((pole) => [pole, ''])) as Record<PoleNastawy, string>,
  zrodlo: '',
};

/** Wynik budowy nastaw: `null` (brak nastaw w formularzu), obiekt kontraktu albo błędy pól. */
export type WynikNastaw =
  | { readonly stan: 'ok'; readonly nastawy: NastawyZabezpieczenModulu | null }
  | { readonly stan: 'blad'; readonly bledy: Readonly<Partial<Record<PoleNastawy | 'zrodlo_pl', string>>> };

/**
 * Buduje `NastawyZabezpieczenModulu` z formularza z regułami walidatora backendu:
 * źródło obowiązkowe, gdy podano choć jedną wartość; `u_min_pu < u_max_pu` i
 * `f_min_hz < f_max_hz`, gdy obie wartości pary są podane. Brak wartości → `null`.
 */
export function zbudujNastawy(formularz: FormularzNastaw): WynikNastaw {
  const bledy: Partial<Record<PoleNastawy | 'zrodlo_pl', string>> = {};
  const wartosci: Partial<Record<PoleNastawy, number | null>> = {};
  for (const pole of POLA_NASTAW) {
    const wynik = parsujPole(formularz.wartosci[pole], OGRANICZENIA_NASTAW[pole]);
    if (wynik.stan === 'blad') bledy[pole] = wynik.komunikat;
    else wartosci[pole] = wynik.wartosc;
  }
  const podane = POLA_NASTAW.filter((pole) => wartosci[pole] !== null && wartosci[pole] !== undefined);
  const zrodlo = formularz.zrodlo.trim();
  if (podane.length > 0 && zrodlo === '') {
    bledy.zrodlo_pl =
      'podaj źródło nastaw (nastawnik zabezpieczenia, karta nastaw albo dokument projektu)';
  }
  for (const [dolna, gorna] of [
    ['u_min_pu', 'u_max_pu'],
    ['f_min_hz', 'f_max_hz'],
  ] as const) {
    const d = wartosci[dolna];
    const g = wartosci[gorna];
    if (typeof d === 'number' && typeof g === 'number' && !(d < g)) {
      bledy[gorna] = `próg górny musi leżeć powyżej progu dolnego (${ETYKIETY_POL_NASTAW[dolna]})`;
    }
  }
  if (Object.keys(bledy).length > 0) return { stan: 'blad', bledy };
  if (podane.length === 0 && zrodlo === '') return { stan: 'ok', nastawy: null };
  return {
    stan: 'ok',
    nastawy: {
      ...(Object.fromEntries(POLA_NASTAW.map((pole) => [pole, wartosci[pole] ?? null])) as Record<
        PoleNastawy,
        number | null
      >),
      zrodlo_pl: zrodlo === '' ? null : zrodlo,
    },
  };
}
