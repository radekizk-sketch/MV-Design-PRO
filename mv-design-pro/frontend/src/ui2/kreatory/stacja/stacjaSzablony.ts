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
  // Pole pomiarowe szablonu nie ma odpowiednika w kontrakcie pól SN operacji —
  // backend traktuje je jak pole odpływowe (rola LINIA_ODG w modelu stacji).
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

/** Aparat proponowany przez szablon (pierwsza pozycja domyślna listy szablonu). */
export function aparatSzablonu(szablon: StationTemplateFull | null): string | null {
  const opcje = szablon?.schema?.sn_bay_apparatus_options ?? [];
  if (opcje.length === 0) return null;
  const domyslna = opcje.find((o) => o.default) ?? opcje[0];
  return domyslna?.catalog_ref ?? null;
}

/** Zabezpieczenie proponowane przez szablon (readout do kroku pomiarów). */
export function zabezpieczenieSzablonu(szablon: StationTemplateFull | null): string | null {
  const opcje = szablon?.schema?.sn_bay_protection_options ?? [];
  return opcje[0]?.device_catalog_ref ?? null;
}

/** Przekładnik prądowy proponowany przez szablon. */
export function ctSzablonu(szablon: StationTemplateFull | null): string | null {
  const opcje = szablon?.schema?.ct_options ?? [];
  if (opcje.length === 0) return null;
  return (opcje.find((o) => o.default) ?? opcje[0]).catalog_ref;
}

/** Przekładnik napięciowy proponowany przez szablon. */
export function vtSzablonu(szablon: StationTemplateFull | null): string | null {
  const opcje = szablon?.schema?.vt_options ?? [];
  if (opcje.length === 0) return null;
  return (opcje.find((o) => o.default) ?? opcje[0]).catalog_ref;
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
  vtRef: string | null;
  przekaznikRef: string | null;
}

/**
 * Buduje wypełnienie formularza z pary (definicja szablonu, podgląd `preview`).
 * Podgląd jest źródłem wartości EFEKTYWNYCH (po kaskadzie producenta), definicja
 * — źródłem list wyboru (aparat/CT/VT/zabezpieczenie).
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
    vtRef: vtSzablonu(szablon),
    przekaznikRef:
      podglad?.effective_config?.protection_relay_ref ?? zabezpieczenieSzablonu(szablon),
  };
}
