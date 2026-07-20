/**
 * Model kreatora „Dodaj źródło OZE/DER" (add_converter_source) — ui2, opcja MAX.
 *
 * CZYSTA logika przeniesiona z legacy `AddConverterSourceForm` (Opcja 1: podmiana
 * dostawcy prezentacji, kontrakt payloadu 1:1). ZERO fizyki: moc/prąd/Q liczy backend
 * (PF falownika po G-OZE-PF honoruje control_mode); ten moduł buduje żądanie operacji
 * domenowej i interpretuje kompletność wejść.
 *
 * Pola mapują 1:1 na `AddConverterSourcePayload` (backend): source_technology,
 * connection_variant, station_ref, bus_nn_ref, placement, source_field, source_name,
 * quantity, control_mode, power_setpoint_mw, q_min/max_mvar, bess_mode, soc_min/max,
 * blocking_transformer_ref, catalog_binding, materialized_params. Regulacja (control_mode
 * / Q) jest realnie konsumowana przez kanoniczny rozpływ mocy falownika (V12K-052).
 *
 * Powiązanie NC RfG (krzywe P(f)/Q(U)/FRT, flagi island/black_start/POD) NIE jest
 * utrwalane przez tę operację (kontrakt backendu) — to osobny łańcuch (karta G-OZE-B).
 * Certyfikat PTPiREE spływa z pól katalogu falownika (ConverterType.ptpiree_*).
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import type { ConverterType } from '../../../ui/catalog/types';

const CANONICAL_CATALOG_VERSION = 'v12.5';

export type TechnologiaOze = 'PV' | 'BESS' | 'FW';
export type WariantPrzylaczenia = 'nn_side' | 'block_transformer';
export type UmiejscowieniePola = 'NEW_FIELD' | 'EXISTING_FIELD';
export type TrybRegulacji = 'STALY_COS_PHI' | 'Q_OD_U' | 'P_OD_U' | 'WYLACZONE';
export type TrybBess = 'PEAK_SHAVING' | 'ARBITRAGE' | 'BACKUP' | 'GRID_SERVICES';
export type ConverterCatalogNamespace = 'ZRODLO_NN_PV' | 'ZRODLO_NN_BESS' | 'CONVERTER';

/** Konfiguracja technologii — etykieta, rodzaj pola, rodzaj katalogu. */
export interface KonfiguracjaTechnologii {
  readonly label: string;
  readonly shortLabel: string;
  readonly fieldKind: TechnologiaOze;
  readonly catalogKind: 'PV' | 'BESS' | 'WIND';
  readonly defaultName: string;
}

export const TECHNOLOGIE: Record<TechnologiaOze, KonfiguracjaTechnologii> = {
  PV: { label: 'Fotowoltaika', shortLabel: 'PV', fieldKind: 'PV', catalogKind: 'PV', defaultName: 'Blok PV' },
  BESS: { label: 'Magazyn energii', shortLabel: 'BESS', fieldKind: 'BESS', catalogKind: 'BESS', defaultName: 'Blok BESS' },
  FW: { label: 'Elektrownia wiatrowa', shortLabel: 'FW', fieldKind: 'FW', catalogKind: 'WIND', defaultName: 'Blok FW' },
};

/** Opcje = kontrakt danych: `value` to kod backendu, `label` polska etykieta UI. */
export const TECHNOLOGIA_OPCJE: ReadonlyArray<{ value: TechnologiaOze; label: string }> = [
  { value: 'PV', label: 'Fotowoltaika (PV)' },
  { value: 'BESS', label: 'Magazyn energii (BESS)' },
  { value: 'FW', label: 'Elektrownia wiatrowa (FW)' },
];

export const WARIANT_OPCJE: ReadonlyArray<{ value: WariantPrzylaczenia; label: string }> = [
  { value: 'nn_side', label: 'Bezpośrednio do szyny nN' },
  { value: 'block_transformer', label: 'Przez transformator blokowy' },
];

export const REGULACJA_OPCJE: ReadonlyArray<{ value: TrybRegulacji; label: string }> = [
  { value: 'STALY_COS_PHI', label: 'Stały współczynnik mocy cosφ' },
  { value: 'Q_OD_U', label: 'Regulacja Q(U) — napięciowo-jałowa' },
  { value: 'P_OD_U', label: 'Regulacja P(U) — ograniczanie mocy od napięcia' },
  { value: 'WYLACZONE', label: 'Bez regulacji (źródło pasywne)' },
];

export const BESS_OPCJE: ReadonlyArray<{ value: TrybBess; label: string }> = [
  { value: 'PEAK_SHAVING', label: 'Ścinanie szczytów (peak shaving)' },
  { value: 'ARBITRAGE', label: 'Arbitraż energetyczny' },
  { value: 'BACKUP', label: 'Zasilanie rezerwowe (backup)' },
  { value: 'GRID_SERVICES', label: 'Usługi systemowe (grid services)' },
];

const TECHNOLOGIA_LABEL = new Map(TECHNOLOGIA_OPCJE.map((o) => [o.value, o.label]));
const WARIANT_LABEL = new Map(WARIANT_OPCJE.map((o) => [o.value, o.label]));
const REGULACJA_LABEL = new Map(REGULACJA_OPCJE.map((o) => [o.value, o.label]));
const BESS_LABEL = new Map(BESS_OPCJE.map((o) => [o.value, o.label]));

export const technologiaLabel = (v: TechnologiaOze): string => TECHNOLOGIA_LABEL.get(v) ?? '';
export const wariantLabel = (v: WariantPrzylaczenia): string => WARIANT_LABEL.get(v) ?? '';
export const regulacjaLabel = (v: TrybRegulacji): string => REGULACJA_LABEL.get(v) ?? '';
export const bessLabel = (v: TrybBess): string => BESS_LABEL.get(v) ?? '';

/** Katalog OZE per technologia (namespace bindowania). */
export function converterCatalogNamespace(technology: TechnologiaOze): ConverterCatalogNamespace {
  if (technology === 'PV') return 'ZRODLO_NN_PV';
  if (technology === 'BESS') return 'ZRODLO_NN_BESS';
  return 'CONVERTER';
}

export interface KontekstOze {
  station_ref?: string;
  station_label?: string;
  bus_nn_ref?: string;
  existing_field_ref?: string;
}

/** Transformator blokowy (kandydat) — z snapshotu stacji. */
export interface TransformatorBlokowy {
  readonly ref_id: string;
  readonly name: string;
  readonly lv_bus_ref: string;
  readonly sn_mva: number;
  readonly uhv_kv?: number | null;
  readonly ulv_kv?: number | null;
}

export interface OzeFormData {
  source_technology: TechnologiaOze;
  connection_variant: WariantPrzylaczenia;
  placement: UmiejscowieniePola;
  source_name: string;
  new_field_name: string;
  quantity: number;
  converter_catalog_ref: string | null;
  apparatus_catalog_ref: string | null;
  blocking_transformer_ref: string | null;
  control_mode: TrybRegulacji;
  power_setpoint_mw: number | null;
  q_min_mvar: number | null;
  q_max_mvar: number | null;
  // V12K-062 (G-OZE-B): statyzm P(f)/LFSM [%Pn/%f] — realnie konsumowany przez kanoniczny PF.
  frequency_droop_percent: number | null;
  bess_mode: TrybBess;
  soc_min_percent: number | null;
  soc_max_percent: number | null;
}

export interface BladPolaOze {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: OzeFormData = {
  source_technology: 'PV',
  connection_variant: 'nn_side',
  placement: 'NEW_FIELD',
  source_name: '',
  new_field_name: '',
  quantity: 1,
  converter_catalog_ref: null,
  apparatus_catalog_ref: null,
  blocking_transformer_ref: null,
  control_mode: 'STALY_COS_PHI',
  power_setpoint_mw: null,
  q_min_mvar: null,
  q_max_mvar: null,
  frequency_droop_percent: null,
  bess_mode: 'PEAK_SHAVING',
  soc_min_percent: null,
  soc_max_percent: null,
};

function parseQuantity(value: number): number {
  return Math.max(1, Math.trunc(value) || 1);
}

export function maKontekst(kontekst: KontekstOze): boolean {
  return Boolean(kontekst.station_ref?.trim());
}

/** Kandydaci transformatora blokowego = transformatory stacji z szyną nN. */
export function transformatoryBlokowe(
  transformers: readonly TransformatorBlokowy[],
): TransformatorBlokowy[] {
  return transformers.filter((t) => Boolean(t.lv_bus_ref?.trim()));
}

export function walidujFormularz(data: OzeFormData, kontekst: KontekstOze): BladPolaOze[] {
  const errors: BladPolaOze[] = [];
  if (!data.converter_catalog_ref?.trim()) {
    errors.push({ field: 'converter_catalog_ref', message: 'Wybierz układ PV/BESS/FW z katalogu.' });
  }
  if (data.connection_variant === 'nn_side') {
    if (!kontekst.bus_nn_ref?.trim()) {
      errors.push({ field: 'bus_nn_ref', message: 'Wskaż szynę nN rozdzielni dla przyłączenia bezpośredniego.' });
    }
    if (data.placement === 'EXISTING_FIELD' && !kontekst.existing_field_ref?.trim()) {
      errors.push({ field: 'existing_field_ref', message: 'Wskaż istniejące pole odpływowe nN.' });
    }
    if (data.placement === 'NEW_FIELD' && !data.apparatus_catalog_ref?.trim()) {
      errors.push({ field: 'apparatus_catalog_ref', message: 'Dobierz aparat nN dla nowego pola źródłowego.' });
    }
  } else if (!data.blocking_transformer_ref?.trim()) {
    errors.push({ field: 'blocking_transformer_ref', message: 'Wybierz transformator blokowy SN/nN.' });
  }
  const qMin = data.q_min_mvar;
  const qMax = data.q_max_mvar;
  if (qMin !== null && qMax !== null && qMin > qMax) {
    errors.push({ field: 'q_max_mvar', message: 'Zakres mocy biernej: Q min nie może przekraczać Q max.' });
  }
  if (data.source_technology === 'BESS') {
    const socMin = data.soc_min_percent;
    const socMax = data.soc_max_percent;
    if (socMin !== null && (socMin < 0 || socMin > 100)) {
      errors.push({ field: 'soc_min_percent', message: 'Stan naładowania SOC min musi mieścić się w 0–100%.' });
    }
    if (socMax !== null && (socMax < 0 || socMax > 100)) {
      errors.push({ field: 'soc_max_percent', message: 'Stan naładowania SOC max musi mieścić się w 0–100%.' });
    }
    if (socMin !== null && socMax !== null && socMin > socMax) {
      errors.push({ field: 'soc_max_percent', message: 'SOC min nie może przekraczać SOC max.' });
    }
  }
  return errors;
}

/** Tabliczka katalogowa falownika → materialized_params (kontrakt solvera). */
export function materializedParams(
  converter: ConverterType,
  power_setpoint_mw: number | null,
): Record<string, unknown> {
  return {
    catalog_item_id: converter.id,
    catalog_item_version: CANONICAL_CATALOG_VERSION,
    sn_mva: converter.sn_mva,
    pmax_mw: converter.pmax_mw,
    un_kv: converter.un_kv,
    qmin_mvar: converter.qmin_mvar ?? null,
    qmax_mvar: converter.qmax_mvar ?? null,
    cosphi_min: converter.cosphi_min ?? null,
    cosphi_max: converter.cosphi_max ?? null,
    e_kwh: converter.e_kwh ?? null,
    power_setpoint_mw,
    ptpiree_certificate_ref: converter.ptpiree_certificate_ref ?? null,
    ptpiree_document_number: converter.ptpiree_document_number ?? null,
    ptpiree_wos_version: converter.ptpiree_wos_version ?? null,
    ptpiree_source_url: converter.ptpiree_source_url ?? null,
  };
}

export function zbudujPayload(
  data: OzeFormData,
  kontekst: KontekstOze,
  converter: ConverterType,
  transformer: TransformatorBlokowy | null,
): Record<string, unknown> {
  const tech = TECHNOLOGIE[data.source_technology];
  const isBlock = data.connection_variant === 'block_transformer';
  const quantity = parseQuantity(data.quantity);
  const nominalPowerMw = converter.pmax_mw * quantity;
  const qMin = data.q_min_mvar ?? converter.qmin_mvar ?? null;
  const qMax = data.q_max_mvar ?? converter.qmax_mvar ?? null;
  const pSetpoint = data.power_setpoint_mw ?? nominalPowerMw ?? converter.pmax_mw;
  const targetBusRef = isBlock ? transformer?.lv_bus_ref ?? '' : kontekst.bus_nn_ref ?? '';

  return {
    source_technology: data.source_technology,
    connection_variant: data.connection_variant,
    station_ref: kontekst.station_ref,
    bus_nn_ref: targetBusRef,
    placement: isBlock ? undefined : data.placement,
    existing_field_ref:
      !isBlock && data.placement === 'EXISTING_FIELD' ? kontekst.existing_field_ref : undefined,
    source_field:
      !isBlock && data.placement === 'NEW_FIELD'
        ? {
            field_name: data.new_field_name.trim() || undefined,
            source_field_kind: tech.fieldKind,
            catalog_binding: normalizeCatalogBinding(data.apparatus_catalog_ref, 'APARAT_NN') ?? undefined,
          }
        : undefined,
    source_name: data.source_name.trim() || tech.defaultName,
    quantity,
    control_mode: data.control_mode,
    power_setpoint_mw: pSetpoint,
    q_min_mvar: qMin,
    q_max_mvar: qMax,
    frequency_droop_percent: data.frequency_droop_percent ?? undefined,
    bess_mode: data.source_technology === 'BESS' ? data.bess_mode : undefined,
    soc_min_percent:
      data.source_technology === 'BESS' ? data.soc_min_percent ?? undefined : undefined,
    soc_max_percent:
      data.source_technology === 'BESS' ? data.soc_max_percent ?? undefined : undefined,
    blocking_transformer_ref: isBlock ? transformer?.ref_id ?? undefined : undefined,
    catalog_binding:
      normalizeCatalogBinding(data.converter_catalog_ref, converterCatalogNamespace(data.source_technology)) ??
      undefined,
    materialized_params: materializedParams(converter, pSetpoint),
  };
}

/** Etykieta pozycji katalogu falownika. */
export function etykietaKonwertera(item: ConverterType): string {
  return `${item.name} · Un ${item.un_kv} kV · S ${item.sn_mva.toFixed(3)} MVA · Pmax ${item.pmax_mw.toFixed(3)} MW`;
}
