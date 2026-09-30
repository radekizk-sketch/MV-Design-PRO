/*
 * Dane modułu NC RfG zapisywane w MODELU generatora (plan AB O-50 pkt 5–6): status modułu
 * istniejącego (art. 4), data umowy przyłączeniowej, nastawy zabezpieczeń modułu i deklaracje
 * modułu. JEDEN formularz dla obu pisarzy (kreator źródła OZE → `add_converter_source`,
 * edycja parametrów generatora → `update_element_parameters`) i jedna budowa pól, lustro
 * JEDNEGO walidatora backendu `enm/deklaracje_modulu.py::pola_nc_rfg_generatora`.
 *
 * Walidacja po stronie klienta NIE ocenia modułu — blokuje wyłącznie zapis, który backend
 * odrzuciłby kodem `generator.*_invalid`, i nazywa pole. Każda kontrolka ↔ jedno pole
 * kontraktu (`Generator.modul_istniejacy`, `.data_umowy_przylaczeniowej`,
 * `.nastawy_zabezpieczen`, `.deklaracje_modulu`). Brak danej = `null` (nigdy wartość typowa);
 * flaga deklaracji ma TRZY stany: nie zadeklarowano (`null`), tak (`true`), nie (`false`).
 */

import type { DeklaracjeModulu, Generator, NastawyZabezpieczenModulu } from '../../../types/enm';
import {
  OGRANICZENIA_WEJSCIA,
  PUSTE_NASTAWY,
  parsujPole,
  zbudujNastawy,
  type FormularzNastaw,
  type StanModuluIstniejacego,
} from './formularz';
import { POLA_NASTAW, type PoleNastawy } from './typy';

/** Flagi deklaracji modułu (`DeklaracjeModulu`, kolejność kontraktu) — wszystkie trójstanowe. */
export const POLA_FLAG_DEKLARACJI = [
  'has_scada_communication',
  'has_disturbance_recorder',
  'active_power_control_enabled',
  'stop_generation_enabled',
  'reduction_generation_enabled',
  'island_operation_required',
  'island_operation_capable',
  'black_start_required',
  'black_start_capable',
  'power_oscillation_damping_required',
  'power_oscillation_damping_enabled',
] as const satisfies readonly (keyof DeklaracjeModulu)[];

export type PoleFlagiDeklaracji = (typeof POLA_FLAG_DEKLARACJI)[number];

/** Pola liczbowe deklaracji modułu (`DeklaracjeModulu`, kolejność kontraktu). */
export const POLA_LICZBOWE_DEKLARACJI = [
  'p_min_kw',
  'ramp_rate_pct_per_min',
  'reactive_current_gain',
  'p_recovery_time_s',
  'harmonic_thdu_percent',
  'cease_generation_time_s',
] as const satisfies readonly (keyof DeklaracjeModulu)[];

export type PoleLiczboweDeklaracji = (typeof POLA_LICZBOWE_DEKLARACJI)[number];

/** Stan flagi w formularzu: jawne trzy stany kontraktu. */
export type StanFlagi = 'nieustalone' | 'tak' | 'nie';

export function flagaZeStanu(stan: StanFlagi): boolean | null {
  switch (stan) {
    case 'nieustalone':
      return null;
    case 'tak':
      return true;
    case 'nie':
      return false;
  }
}

export function stanZFlagi(wartosc: boolean | null | undefined): StanFlagi {
  if (wartosc === true) return 'tak';
  if (wartosc === false) return 'nie';
  return 'nieustalone';
}

/** Formularz danych modułu NC RfG generatora (wartości tekstowe pól liczbowych). */
export interface FormularzDanychModulu {
  readonly modulIstniejacy: StanModuluIstniejacego;
  /** Data umowy `RRRR-MM-DD` albo pusty łańcuch (nieustalona). */
  readonly dataUmowy: string;
  readonly nastawy: FormularzNastaw;
  readonly flagi: Readonly<Record<PoleFlagiDeklaracji, StanFlagi>>;
  readonly liczby: Readonly<Record<PoleLiczboweDeklaracji, string>>;
  readonly zrodloDeklaracji: string;
}

export const PUSTE_DANE_MODULU: FormularzDanychModulu = {
  modulIstniejacy: 'nieustalone',
  dataUmowy: '',
  nastawy: PUSTE_NASTAWY,
  flagi: Object.fromEntries(POLA_FLAG_DEKLARACJI.map((pole) => [pole, 'nieustalone'])) as Record<
    PoleFlagiDeklaracji,
    StanFlagi
  >,
  liczby: Object.fromEntries(POLA_LICZBOWE_DEKLARACJI.map((pole) => [pole, ''])) as Record<
    PoleLiczboweDeklaracji,
    string
  >,
  zrodloDeklaracji: '',
};

/** Liczba do pola tekstowego formularza (brak danej = pole puste, nigdy wartość typowa). */
export function tekstLiczby(wartosc: number | null | undefined): string {
  return typeof wartosc === 'number' && Number.isFinite(wartosc) ? String(wartosc) : '';
}

/** Pola generatora czytane przez formularz (podzbiór lustra `types/enm.ts::Generator`). */
export type DaneModuluGeneratora = Pick<
  Generator,
  'modul_istniejacy' | 'data_umowy_przylaczeniowej' | 'nastawy_zabezpieczen' | 'deklaracje_modulu'
>;

/** Formularz wypełniony danymi zapisanymi w modelu (odczyt 1:1, brak danej = pole puste). */
export function formularzDanychModuluZModelu(generator: DaneModuluGeneratora): FormularzDanychModulu {
  const nastawy = generator.nastawy_zabezpieczen ?? null;
  const deklaracje = generator.deklaracje_modulu ?? null;
  return {
    modulIstniejacy:
      generator.modul_istniejacy === true
        ? 'tak'
        : generator.modul_istniejacy === false
          ? 'nie'
          : 'nieustalone',
    dataUmowy: generator.data_umowy_przylaczeniowej ?? '',
    nastawy: {
      wartosci: Object.fromEntries(
        POLA_NASTAW.map((pole) => [pole, tekstLiczby(nastawy?.[pole])]),
      ) as Record<PoleNastawy, string>,
      zrodlo: nastawy?.zrodlo_pl ?? '',
    },
    flagi: Object.fromEntries(
      POLA_FLAG_DEKLARACJI.map((pole) => [pole, stanZFlagi(deklaracje?.[pole])]),
    ) as Record<PoleFlagiDeklaracji, StanFlagi>,
    liczby: Object.fromEntries(
      POLA_LICZBOWE_DEKLARACJI.map((pole) => [pole, tekstLiczby(deklaracje?.[pole])]),
    ) as Record<PoleLiczboweDeklaracji, string>,
    zrodloDeklaracji: deklaracje?.zrodlo_pl ?? '',
  };
}

/** Pola NC RfG generatora w postaci kontraktu (`POLA_NC_RFG_GENERATORA` backendu). */
export interface PolaNcRfgGeneratora {
  readonly modul_istniejacy: boolean | null;
  readonly data_umowy_przylaczeniowej: string | null;
  readonly nastawy_zabezpieczen: NastawyZabezpieczenModulu | null;
  readonly deklaracje_modulu: DeklaracjeModulu | null;
}

/** Klucze błędów formularza: pola nastaw, pola deklaracji, źródła i data umowy. */
export type PoleBleduDanychModulu =
  | PoleNastawy
  | PoleLiczboweDeklaracji
  | 'zrodlo_pl'
  | 'zrodlo_deklaracji'
  | 'data_umowy_przylaczeniowej';

export type WynikDanychModulu =
  | { readonly stan: 'ok'; readonly pola: PolaNcRfgGeneratora }
  | { readonly stan: 'blad'; readonly bledy: Readonly<Partial<Record<PoleBleduDanychModulu, string>>> };

const WZORZEC_DATY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Data kalendarzowa `RRRR-MM-DD` (także dzień istniejący w miesiącu) — lustro `DataUmowy`. */
export function jestDataKalendarzowa(tekst: string): boolean {
  const m = WZORZEC_DATY.exec(tekst);
  if (!m) return false;
  const [rok, miesiac, dzien] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(rok, miesiac - 1, dzien));
  return (
    data.getUTCFullYear() === rok && data.getUTCMonth() === miesiac - 1 && data.getUTCDate() === dzien
  );
}

/**
 * Buduje pola NC RfG generatora z formularza regułami jednego walidatora backendu: data umowy
 * wyłącznie `RRRR-MM-DD`; nastawy — źródło przy podanej wartości, pary progów uporządkowane;
 * deklaracje — liczby w dziedzinie kontraktu, źródło przy podanej wartości. Formularz pusty →
 * pola `null` (stan „nieustalone", nigdy wartość typowa).
 */
export function zbudujPolaNcRfgGeneratora(f: FormularzDanychModulu): WynikDanychModulu {
  const bledy: Partial<Record<PoleBleduDanychModulu, string>> = {};
  const data = f.dataUmowy.trim();
  if (data !== '' && !jestDataKalendarzowa(data)) {
    bledy.data_umowy_przylaczeniowej = 'data kalendarzowa w zapisie RRRR-MM-DD';
  }
  const nastawy = zbudujNastawy(f.nastawy);
  if (nastawy.stan === 'blad') Object.assign(bledy, nastawy.bledy);

  const liczby: Partial<Record<PoleLiczboweDeklaracji, number | null>> = {};
  for (const pole of POLA_LICZBOWE_DEKLARACJI) {
    const wynik = parsujPole(f.liczby[pole], OGRANICZENIA_WEJSCIA[pole]);
    if (wynik.stan === 'blad') bledy[pole] = wynik.komunikat;
    else liczby[pole] = wynik.wartosc;
  }
  const flagi = Object.fromEntries(
    POLA_FLAG_DEKLARACJI.map((pole) => [pole, flagaZeStanu(f.flagi[pole])]),
  ) as Record<PoleFlagiDeklaracji, boolean | null>;
  const podane =
    POLA_FLAG_DEKLARACJI.some((pole) => flagi[pole] !== null) ||
    POLA_LICZBOWE_DEKLARACJI.some((pole) => liczby[pole] !== null && liczby[pole] !== undefined);
  const zrodlo = f.zrodloDeklaracji.trim();
  if (podane && zrodlo === '') {
    bledy.zrodlo_deklaracji =
      'podaj źródło deklaracji (karta katalogowa, deklaracja wytwórcy albo dokument projektu)';
  }
  if (Object.keys(bledy).length > 0 || nastawy.stan === 'blad') return { stan: 'blad', bledy };

  const deklaracje: DeklaracjeModulu | null =
    podane || zrodlo !== ''
      ? {
          ...flagi,
          ...(Object.fromEntries(
            POLA_LICZBOWE_DEKLARACJI.map((pole) => [pole, liczby[pole] ?? null]),
          ) as Record<PoleLiczboweDeklaracji, number | null>),
          zrodlo_pl: zrodlo === '' ? null : zrodlo,
        }
      : null;
  return {
    stan: 'ok',
    pola: {
      modul_istniejacy:
        f.modulIstniejacy === 'tak' ? true : f.modulIstniejacy === 'nie' ? false : null,
      data_umowy_przylaczeniowej: data === '' ? null : data,
      nastawy_zabezpieczen: nastawy.nastawy,
      deklaracje_modulu: deklaracje,
    },
  };
}

/**
 * Pola NC RfG do ładunku ZAPISU NOWEGO wytwórcy (`add_converter_source`, `POST …/generators`):
 * wyłącznie podane wartości — brak danej = pole nieobecne (backend zapisuje stan
 * „nieustalone", nigdy wartość typową). Formularz z błędem nie daje pól (zapis blokuje
 * wołający na podstawie `zbudujPolaNcRfgGeneratora`).
 */
export function polaNcRfgDoPayloadu(formularz: FormularzDanychModulu): Partial<PolaNcRfgGeneratora> {
  const wynik = zbudujPolaNcRfgGeneratora(formularz);
  if (wynik.stan !== 'ok') return {};
  return Object.fromEntries(
    Object.entries(wynik.pola).filter(([, wartosc]) => wartosc !== null),
  ) as Partial<PolaNcRfgGeneratora>;
}

/** Pola NC RfG, które różnią się od stanu modelu (zapis wyłącznie zmienionych danych). */
export function zmienionePolaNcRfg(
  pola: PolaNcRfgGeneratora,
  model: DaneModuluGeneratora,
): Partial<PolaNcRfgGeneratora> {
  const zapisModelu = zbudujPolaNcRfgGeneratora(formularzDanychModuluZModelu(model));
  if (zapisModelu.stan !== 'ok') return pola;
  const wynik: Partial<Record<keyof PolaNcRfgGeneratora, unknown>> = {};
  for (const klucz of Object.keys(pola) as (keyof PolaNcRfgGeneratora)[]) {
    if (JSON.stringify(pola[klucz]) !== JSON.stringify(zapisModelu.pola[klucz])) {
      wynik[klucz] = pola[klucz];
    }
  }
  return wynik as Partial<PolaNcRfgGeneratora>;
}
