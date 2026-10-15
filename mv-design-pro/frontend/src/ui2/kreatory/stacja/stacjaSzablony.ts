/**
 * Krok 0 kreatora stacji — start z szablonu biblioteki stacji (K9-B).
 *
 * Reużywa ISTNIEJĄCY klient `ui/network-build/station-templates/api.ts`
 * (biblioteka szablonów backendu: kategorie, schemat edytowalny, podgląd
 * `preview`). Szablon WYPEŁNIA formularz kreatora — nic nie jest zamrażane:
 * każde pole pozostaje edytowalne w kolejnych krokach.
 *
 * ZERO fabrykacji: mapujemy wyłącznie wartości, które backend realnie zwraca
 * (referencje katalogowe, liczby pól/odpływów, role pól, aparat pola z B-12).
 * Nic nie jest liczone w UI.
 */

import type {
  CatalogChoice,
  PreviewTemplateResult,
  StationTemplateFull,
} from '../../../ui/network-build/station-templates/api';
import type { SnFieldRole, TypStacji } from './stacjaModel';

/** Kategorie szablonów pokazywane w kroku „Szablon" (kolejność prezentacji). */
export const KATEGORIE_SZABLONOW: readonly string[] = [
  'typowa_sn_nn',
  'prosument_pv',
  'farma_pv',
  'bess',
  'hybrydowa',
  'przemyslowa',
  'slupowa',
  'zksn_wnetrzowa',
  'wiatrowa',
  'sekcyjna',
];

/** Role pól szablonu → role kontraktu operacji (parytet z backendem). */
const ROLA_SZABLONU_NA_ROLE_POLA: Record<string, SnFieldRole> = {
  IN: 'LINIA_IN',
  LINIA_IN: 'LINIA_IN',
  OUT: 'LINIA_OUT',
  LINIA_OUT: 'LINIA_OUT',
  FEEDER: 'LINIA_ODG',
  LINIA_ODG: 'LINIA_ODG',
  TR: 'TRANSFORMATOROWE',
  TRANSFORMATOROWE: 'TRANSFORMATOROWE',
  COUPLER: 'SPRZEGLO',
  SPRZEGLO: 'SPRZEGLO',
  // DŁUG NAZWANY (rejestr POMIAR-ODG pkt 4, POMIAR-RODZAJ): backend ZNA rolę
  // POMIAROWE (wraz z rodzajem pomiaru i bramą tranzytu), ale słownik ról
  // kreatora stacji (`SnFieldRole`) jeszcze jej nie niesie — do czasu osobnej
  // karty rozszerzenia kreator DEGRADUJE pole pomiarowe szablonu do roli
  // odpływowej (stacja powstaje BEZ układu pomiarowego).
  MEASUREMENT: 'LINIA_ODG',
};

/** Rodzaj stacji z podglądu szablonu (backend zwraca semantykę 1:1). */
export function typStacjiZSzablonu(stationType: string): TypStacji | null {
  if (stationType === 'terminal' || stationType === 'inline') return stationType;
  if (stationType === 'branch' || stationType === 'sectional') return stationType;
  return null;
}

/** Pole SN wyprowadzone z podglądu szablonu (rola + jawny aparat). */
export interface PoleZSzablonu {
  field_role: SnFieldRole;
  apparatus_catalog_ref: string | null;
}

/**
 * Pola SN z podglądu szablonu. Źródłem jest `effective_config.sn_fields`
 * (B-12 — role + JAWNIE wskazany aparat). Gdy backend nie poda pól, zwracamy
 * pustą listę (uczciwy brak, kreator zostawia domyślne pola rodzaju stacji).
 */
export function polaZPodgladu(podglad: PreviewTemplateResult | null): PoleZSzablonu[] {
  const pola = podglad?.effective_config?.sn_fields ?? [];
  return pola
    .map((pole) => ({
      field_role: ROLA_SZABLONU_NA_ROLE_POLA[String(pole.field_role).toUpperCase()] ?? null,
      apparatus_catalog_ref: pole.apparatus_catalog_ref || null,
    }))
    .filter((pole): pole is PoleZSzablonu => pole.field_role !== null);
}

/**
 * Propozycja z listy wyboru szablonu: pozycja JAWNIE oznaczona przez autora szablonu
 * (`default`) albo jedyna pozycja listy. Kilka pozycji bez oznaczenia = wybór projektanta
 * (dawniej pierwsza z listy).
 */
function propozycjaListy(opcje: readonly CatalogChoice[]): string | null {
  const domyslne = opcje.filter((o) => o.default);
  if (domyslne.length === 1) return domyslne[0].catalog_ref;
  return opcje.length === 1 ? opcje[0].catalog_ref : null;
}

/** Aparat proponowany przez szablon (oznaczony albo jedyny). */
export function aparatSzablonu(szablon: StationTemplateFull | null): string | null {
  return propozycjaListy(szablon?.schema?.sn_bay_apparatus_options ?? []);
}

/**
 * Zabezpieczenie proponowane przez szablon — WYŁĄCZNIE jedyna opcja listy szablonu.
 * Lista kilku przekaźników różnych producentów to wybór projektanta; podgląd backendu
 * (`protection_relay_ref`) bierze pierwszą z nich, więc nie jest jednoznacznym źródłem.
 */
export function zabezpieczenieSzablonu(szablon: StationTemplateFull | null): string | null {
  const opcje = szablon?.schema?.sn_bay_protection_options ?? [];
  return opcje.length === 1 ? opcje[0].device_catalog_ref : null;
}

/** Przekładnik prądowy proponowany przez szablon (oznaczony albo jedyny). */
export function ctSzablonu(szablon: StationTemplateFull | null): string | null {
  return propozycjaListy(szablon?.schema?.ct_options ?? []);
}

/** Wypełnienie formularza z szablonu — wartości pochodzą wyłącznie z backendu. */
export interface WypelnienieZSzablonu {
  templateId: string;
  templateName: string;
  stationType: TypStacji | null;
  transformerRef: string | null;
  transformerCount: number | null;
  nnFeedersCount: number | null;
  pola: PoleZSzablonu[];
  aparatRef: string | null;
  ctRef: string | null;
  przekaznikRef: string | null;
  /** Producent rozdzielnicy SN z efektywnej konfiguracji szablonu (rejestr producentów). */
  producentRef: string | null;
}

/**
 * Buduje wypełnienie formularza z pary (definicja szablonu, podgląd `preview`).
 * Podgląd jest źródłem wartości EFEKTYWNYCH (po kaskadzie producenta), definicja
 * — źródłem list wyboru (aparat/CT/zabezpieczenie). Przekładnik napięciowy nie jest
 * proponowany: VT dobiera projektant per pole (szablon nie wie, które pole go ma).
 */
export function wypelnienieZSzablonu(
  szablon: StationTemplateFull,
  podglad: PreviewTemplateResult | null,
): WypelnienieZSzablonu {
  const pola = polaZPodgladu(podglad);
  return {
    templateId: szablon.id,
    templateName: szablon.name_pl,
    stationType: podglad ? typStacjiZSzablonu(podglad.station_type) : null,
    transformerRef: podglad?.effective_config?.transformer_ref ?? null,
    transformerCount: podglad?.effective_config?.transformer_count ?? null,
    nnFeedersCount: podglad?.effective_config?.nn_feeders_count ?? null,
    pola,
    aparatRef: aparatSzablonu(szablon),
    ctRef: ctSzablonu(szablon),
    przekaznikRef: zabezpieczenieSzablonu(szablon),
    producentRef: podglad?.effective_config?.sn_manufacturer || null,
  };
}
