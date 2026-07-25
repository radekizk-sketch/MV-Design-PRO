/**
 * D2 (RECENZJA_DER_SN_DOBORY_2026-07): model DOBORU toru DER-SN dla kreatora — CZYSTA
 * logika prezentacji propozycji z backendu. ZERO fizyki/doboru w UI: żądanie budujemy
 * z parametrów falowników i toru, a propozycje (TR blokowy, kabel SN, aparat pola SN)
 * przychodzą gotowe z `/api/solver/der-selection-preview`.
 *
 * „Zastosuj propozycję" = payload z propozycji: przenosi ref-y katalogowe i napięcia
 * z propozycji do `DerSnFormData` (kontrakt `der_topology` backendu). Odstępstwo od
 * propozycji (wybór ręczny inny/gorszy) daje OSTRZEŻENIE — twarde walidacje D1 dalej
 * bronią przed niemożliwym po stronie backendu.
 */

import type { ConverterType } from '../../../ui/catalog/types';
import type {
  DerSelectionPreviewRequest,
  DerSelectionPreviewResponse,
  ReactiveCharacter,
} from './derSelectionApi';
import type { DerSnFormData } from './zrodloOzeModel';

/** Parametry doboru sterowane przez projektanta (rezerwy/jednoczesność/ΔU). */
export interface ParametryDoboru {
  cableLengthKm: number;
  cosPhi?: number | null;
  simultaneityFactor?: number;
  loadabilityPu?: number;
  transformerReservePu?: number;
  cableReservePu?: number;
  fieldReservePu?: number;
  maxDeltaUPct?: number;
  /** V12K-203: charakter mocy biernej falownika w sprawdzanym przypadku pracy toru. */
  reactiveCharacter?: ReactiveCharacter;
}

/**
 * Zbuduj żądanie doboru z katalogu falownika + kontekstu toru. ΣP = Pmax·liczba jednostek
 * (moc pozorną z cosφ liczy backend). Napięcie strony nN = wyjście falownika (Un katalogu).
 */
export function zbudujZapytanieDoboru(
  converter: ConverterType,
  quantity: number,
  snBusVoltageKv: number,
  params: ParametryDoboru,
): DerSelectionPreviewRequest {
  const jednostki = Math.max(1, Math.trunc(quantity) || 1);
  const request: DerSelectionPreviewRequest = {
    sum_active_power_mw: converter.pmax_mw * jednostki,
    inverter_output_kv: converter.un_kv,
    sn_bus_voltage_kv: snBusVoltageKv,
    cable_length_km: params.cableLengthKm,
  };
  if (params.cosPhi != null) request.cos_phi = params.cosPhi;
  if (params.simultaneityFactor != null) request.simultaneity_factor = params.simultaneityFactor;
  if (params.loadabilityPu != null) request.loadability_pu = params.loadabilityPu;
  if (params.transformerReservePu != null) request.transformer_reserve_pu = params.transformerReservePu;
  if (params.cableReservePu != null) request.cable_reserve_pu = params.cableReservePu;
  if (params.fieldReservePu != null) request.field_reserve_pu = params.fieldReservePu;
  if (params.maxDeltaUPct != null) request.max_delta_u_pct = params.maxDeltaUPct;
  if (params.reactiveCharacter != null) request.reactive_character = params.reactiveCharacter;
  return request;
}

/**
 * Czy charakter mocy biernej może w tym przypadku cokolwiek zmienić.
 *
 * Przy cos φ = 1 mocy biernej NIE MA (sin φ = 0), więc człon X·sinφ zeruje się i
 * wybór poboru/oddawania Q nie wpływa na ΔU ani na dobór przekroju. Kreator musi to
 * powiedzieć wprost — inaczej kontrolka wyglądałaby na działającą, nie działając
 * (reguła zakazu kontrolek pozornych). To NIE jest fizyka w UI: żadnej wartości tu
 * nie liczymy, tylko rozpoznajemy przypadek zdegenerowany wejścia.
 */
export function charakterQMaZnaczenie(cosPhi: number | null | undefined): boolean {
  return cosPhi != null && cosPhi > 0 && cosPhi < 1;
}

/** Czy odpowiedź niesie komplet propozycji (TR + kabel + pole) gotowy do zastosowania. */
export function propozycjaKompletna(response: DerSelectionPreviewResponse): boolean {
  return Boolean(
    response.transformer.proposal &&
      response.cable?.proposal &&
      response.field_apparatus?.proposal,
  );
}

/**
 * Zastosuj propozycję do formularza toru (payload z propozycji): ref-y katalogowe TR/
 * kabla/aparatu + napięcia strony SN/nN + moc TR. Pozostałe pola bez zmian (addytywnie).
 */
export function zastosujPropozycje(
  data: DerSnFormData,
  response: DerSelectionPreviewResponse,
): DerSnFormData {
  const tr = response.transformer.proposal;
  const cable = response.cable?.proposal ?? null;
  const field = response.field_apparatus?.proposal ?? null;
  const next: DerSnFormData = { ...data };
  if (tr) {
    next.block_transformer_catalog_ref = tr.catalog_ref;
    next.block_transformer_rated_power_mva = tr.sn_mva;
    next.block_transformer_primary_voltage_kv = tr.primary_kv;
    next.block_transformer_secondary_voltage_kv = tr.secondary_kv;
    // D3 wym. 7: grupa połączeń z propozycji (spójna z typem katalogowym TR).
    next.block_transformer_vector_group = tr.vector_group;
    // Wyjście falownika = strona nN TR blokowego (spójność napięć wg D1).
    next.inverter_output_voltage_kv = tr.secondary_kv;
  }
  if (cable) {
    next.mv_cable_catalog_ref = cable.catalog_ref;
  }
  if (field) {
    next.mv_field_apparatus_catalog_ref = field.catalog_ref;
  }
  return next;
}

/**
 * Ostrzeżenia odstępstwa: wybór ręczny w formularzu różni się od propozycji systemu.
 * Informacyjne (nie blokują) — twarde walidacje D1 bronią przed niemożliwym w backendzie.
 */
export function odstepstwaPropozycji(
  data: DerSnFormData,
  response: DerSelectionPreviewResponse,
): string[] {
  const warnings: string[] = [];
  const tr = response.transformer.proposal;
  const cable = response.cable?.proposal ?? null;
  const field = response.field_apparatus?.proposal ?? null;

  if (
    tr &&
    data.block_transformer_catalog_ref &&
    data.block_transformer_catalog_ref !== tr.catalog_ref
  ) {
    warnings.push(
      `Wybrany transformator blokowy różni się od propozycji systemu (${tr.name}, ` +
        `${tr.sn_mva} MVA).`,
    );
  }
  if (
    cable &&
    data.mv_cable_catalog_ref &&
    data.mv_cable_catalog_ref !== cable.catalog_ref
  ) {
    warnings.push(
      `Wybrany kabel SN różni się od propozycji systemu (${cable.name}, ` +
        `${cable.cross_section_mm2} mm²).`,
    );
  }
  if (
    field &&
    data.mv_field_apparatus_catalog_ref &&
    data.mv_field_apparatus_catalog_ref !== field.catalog_ref
  ) {
    warnings.push(
      `Wybrany aparat pola SN różni się od propozycji systemu (${field.name}, ` +
        `In ${field.in_a} A).`,
    );
  }
  return warnings;
}

/**
 * Komunikaty ❌ z backendu (brak kandydata / za mały przekrój / przekroczony ΔU) —
 * zebrane do prezentacji w kroku doboru. Zero fizyki w UI: treść pochodzi z backendu.
 */
export function komunikatyBledow(response: DerSelectionPreviewResponse): string[] {
  const messages: string[] = [];
  if (response.transformer.error_pl) messages.push(response.transformer.error_pl);
  if (response.cable?.error_pl) messages.push(response.cable.error_pl);
  if (response.field_apparatus?.error_pl) messages.push(response.field_apparatus.error_pl);
  return messages;
}
