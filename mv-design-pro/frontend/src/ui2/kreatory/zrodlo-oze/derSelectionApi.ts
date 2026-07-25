/**
 * D2 (RECENZJA_DER_SN_DOBORY_2026-07): klient końcówki kaskadowego DOBORU toru DER-SN.
 *
 * Fizyka i dobór liczą się WYŁĄCZNIE w backendzie (WHITE BOX solverów pomocniczych) —
 * warstwa prezentacji tylko wysyła parametry falowników/toru i prezentuje gotowe
 * propozycje (TR blokowy, kabel SN, aparat pola SN) z pełnym śladem. Wzorzec zgodny
 * z `transformerRatedCurrentsApi.ts`. Kontrakt 1:1 z `DerSelectionPreviewResponse`.
 */

import type { ReactiveCharacter } from '../../../ui/network-build/forms/cableVoltageDropApi';

export type { ReactiveCharacter };

export interface DerSelectionPreviewRequest {
  sum_active_power_mw: number;
  inverter_output_kv: number;
  sn_bus_voltage_kv: number;
  cable_length_km: number;
  cos_phi?: number | null;
  simultaneity_factor?: number;
  loadability_pu?: number;
  transformer_reserve_pu?: number;
  cable_reserve_pu?: number;
  field_reserve_pu?: number;
  max_delta_u_pct?: number;
  /**
   * V12K-203: charakter mocy biernej falownika. Kierunek mocy CZYNNEJ nie jest tu
   * wyborem — tor DER oddaje moc do sieci („generation" po stronie backendu), więc
   * ΔU jest WZROSTEM napięcia. Wyborem projektanta jest, czy falownik POBIERA moc
   * bierną (regulacja Q(U) tłumi wzrost), czy ją ODDAJE (wzrost największy).
   */
  reactive_character?: ReactiveCharacter;
  /**
   * V12K-207 (F-K7): warunki UŁOŻENIA kabla. Pominięcie = warunki katalogowe (wynik
   * jak dotąd). Obciążalność katalogowa obowiązuje dla warunków odniesienia producenta;
   * w ziemi, w wiązce i w grupie kabel przenosi MNIEJ, więc dobór bez korekty jest
   * optymistyczny. Nazwy zestawów i współczynniki pochodzą z backendu.
   */
  laying_conditions?: CableLayingConditions;
}

/** Opis warunków ułożenia: nazwa zestawu albo współczynniki własne z opisem. */
export interface CableLayingConditions {
  set_name: string;
  f_grunt?: number;
  f_wiazka?: number;
  f_grupa?: number;
  opis_pl?: string;
}

/** Jeden nazwany zestaw warunków ułożenia (z udokumentowaną podstawą). */
export interface CableLayingConditionsSet {
  name: string;
  label_pl: string;
  f_grunt: number;
  f_wiazka: number;
  f_grupa: number;
  total: number;
  basis: string;
  assumption_pl: string;
}

export interface CableLayingConditionsCatalog {
  sets: CableLayingConditionsSet[];
  custom_name: string;
  default_name: string;
  /** POWÓD krótkiej listy — bez niego wyglądałaby na kompletną tablicę norm. */
  limitation_pl: string;
}

export interface RejectedCandidate {
  catalog_ref: string;
  name: string;
  reason_code: string;
  reason_pl: string;
}

export interface BlockTransformerProposal {
  catalog_ref: string;
  name: string;
  sn_mva: number;
  primary_kv: number;
  secondary_kv: number;
  uk_percent: number | null;
  vector_group: string | null;
}

export interface BlockTransformerSelection {
  proposal: BlockTransformerProposal | null;
  required_apparent_power_mva: number;
  effective_load_mva: number;
  rejected: RejectedCandidate[];
  error_code: string | null;
  error_pl: string | null;
  /** D3 wym. 7: realne układy połączeń dla klasy napięcia toru (z katalogu, nie hardcode). */
  available_vector_groups?: string[];
  formula_ref: string;
}

export interface CableProposal {
  catalog_ref: string;
  name: string;
  cross_section_mm2: number;
  rated_current_a: number;
  /** ΔU ze znakiem: wartość ujemna = WZROST napięcia (typowo przy generacji). */
  delta_u_v: number;
  delta_u_pct: number;
  /** V12K-203: znak nazwany przez backend — prezentacja nie interpretuje znaku sama. */
  is_voltage_rise?: boolean;
  /**
   * V12K-207: obciążalność SKORYGOWANA warunkami ułożenia (A) i sumaryczny współczynnik.
   * Dwie liczby obok siebie — UI niczego nie domnaża, bo mnożenie jest doborem.
   */
  effective_ampacity_a?: number;
  derating_total?: number;
}

export interface CableSelection {
  proposal: CableProposal | null;
  required_ampacity_a: number;
  max_delta_u_pct: number;
  rejected: RejectedCandidate[];
  error_code: string | null;
  error_pl: string | null;
  formula_ref: string;
  /** V12K-203: echo przypadku pracy toru, dla którego sprawdzono ΔU kandydatów. */
  flow_direction?: string;
  reactive_character?: ReactiveCharacter;
  /**
   * V12K-207: warunki ułożenia, dla których policzono obciążalność, i JAWNE założenie
   * do śladu. Echo przychodzi także przy braku propozycji — projektant musi wiedzieć,
   * że zamiast szukać grubszego kabla może poprawić warunki ułożenia trasy.
   */
  derating_set?: string;
  derating_total?: number;
  derating_assumption_pl?: string;
}

export interface FieldApparatusProposal {
  catalog_ref: string;
  name: string;
  equipment_kind: string;
  un_kv: number;
  in_a: number;
  ik_ka: number | null;
}

export interface FieldApparatusSelection {
  proposal: FieldApparatusProposal | null;
  required_current_a: number;
  rejected: RejectedCandidate[];
  error_code: string | null;
  error_pl: string | null;
  formula_ref: string;
}

export interface DerSelectionPreviewResponse {
  sum_apparent_power_mva: number;
  transformer_current_a: number | null;
  transformer: BlockTransformerSelection;
  cable: CableSelection | null;
  field_apparatus: FieldApparatusSelection | null;
}

export async function fetchDerSelectionPreview(
  payload: DerSelectionPreviewRequest,
  options: { signal?: AbortSignal } = {},
): Promise<DerSelectionPreviewResponse> {
  const response = await fetch('/api/solver/der-selection-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readSolverError(response));
  }

  return response.json() as Promise<DerSelectionPreviewResponse>;
}

/**
 * Lista warunków ułożenia kabla (V12K-207). Kreator NIE MOŻE mieć własnej listy —
 * wartości współczynników są danymi doborowymi o udokumentowanej podstawie, nie
 * tekstem interfejsu.
 */
export async function fetchCableLayingConditions(
  options: { signal?: AbortSignal } = {},
): Promise<CableLayingConditionsCatalog> {
  const response = await fetch('/api/solver/cable-laying-conditions', {
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(await readSolverError(response));
  }
  return response.json() as Promise<CableLayingConditionsCatalog>;
}

async function readSolverError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === 'string' && data.detail.trim().length > 0) {
      return `Solver doboru toru DER odrzucił dane: ${data.detail}`;
    }
  } catch {
    // Treść błędu jest opcjonalna; komunikat poniżej wystarcza operatorowi.
  }

  return 'Podgląd doboru toru DER niedostępny — backend solvera nie odpowiedział.';
}
