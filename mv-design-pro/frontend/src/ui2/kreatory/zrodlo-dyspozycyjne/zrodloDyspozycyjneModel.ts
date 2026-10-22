/**
 * Model kreatora „Źródło dyspozycyjne nN (agregat / UPS)" — ui2, kreatory/rama.
 *
 * Dodaje agregat prądotwórczy albo UPS do rozdzielni nN. Zapis = operacja domenowa
 * `add_genset_nn` albo `add_ups_nn`; ładunek = DOKŁADNIE to, co handler czyta
 * (`enm/domain_operations_v2.py`): `bus_nn_ref`, `station_ref`, `placement`,
 * `existing_field_ref`, `source_field` {`field_name`, `source_field_kind`,
 * `catalog_binding` aparatu APARAT_NN} oraz `genset_spec` / `ups_spec` z tabliczki.
 * Rodzaj i stan aparatu pola wynikają z pozycji katalogu aparatu, napięcie pola —
 * z szyny; katalog źródła nie istnieje (parametry z tabliczki, ZASADA NR 4).
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';

export type DispatchableKind = 'GENSET' | 'UPS';
export type SourcePlacement = 'NEW_FIELD' | 'EXISTING_FIELD';
export type GensetOperationMode = 'PRACA_CIAGLA' | 'PRACA_AWARYJNA' | 'PRACA_SZCZYTOWA' | 'WYLACZONE';
export type GensetFuelType = 'DIESEL' | 'GAZ' | 'BIOPALIWO' | 'INNY';
export type UpsOperationMode = 'ONLINE' | 'LINE_INTERACTIVE' | 'OFFLINE' | 'WYLACZONE';
export type UpsBatteryType = 'LI_ION' | 'VRLA' | 'NICD' | 'INNY';

export interface ZrodloDyspozycyjneFormData {
  bus_nn_ref: string;
  placement: SourcePlacement;
  existing_field_ref: string | null;
  // Nowe pole przyłączeniowe (placement=NEW_FIELD): aparat z katalogu APARAT_NN
  new_field_switch_catalog_ref: string | null;
  new_field_name: string;
  // Parametry źródła (tabliczka)
  rated_power_kw: number | null;
  // Agregat
  rated_voltage_kv: number | null;
  power_factor: number | null;
  genset_operation_mode: GensetOperationMode | null;
  fuel_type: GensetFuelType | null;
  // UPS
  backup_time_min: number | null;
  ups_operation_mode: UpsOperationMode | null;
  battery_type: UpsBatteryType | null;
  source_name: string;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: ZrodloDyspozycyjneFormData = {
  bus_nn_ref: '',
  placement: 'NEW_FIELD',
  existing_field_ref: null,
  new_field_switch_catalog_ref: null,
  new_field_name: '',
  rated_power_kw: null,
  rated_voltage_kv: null,
  power_factor: null,
  genset_operation_mode: null,
  fuel_type: null,
  backup_time_min: null,
  ups_operation_mode: null,
  battery_type: null,
  source_name: '',
};

export interface KontekstZrodla {
  station_ref: string | null;
  station_label: string;
}

/** Rodzaj źródła z nazwy operacji domenowej. */
export function rodzajZOperacji(op: string | undefined): DispatchableKind {
  return op === 'add_ups_nn' ? 'UPS' : 'GENSET';
}

export function walidujFormularz(data: ZrodloDyspozycyjneFormData, kind: DispatchableKind): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.bus_nn_ref.trim()) {
    errors.push({ field: 'bus_nn_ref', message: 'Wybierz szynę nN przyłączenia źródła.' });
  }
  if (data.placement === 'EXISTING_FIELD' && !data.existing_field_ref) {
    errors.push({ field: 'existing_field_ref', message: 'Wybór pola przyłączeniowego jest wymagany.' });
  }
  if (data.rated_power_kw === null || data.rated_power_kw <= 0) {
    errors.push({ field: 'rated_power_kw', message: 'Moc znamionowa (kW) musi być > 0.' });
  }
  if (kind === 'GENSET') {
    if (data.rated_voltage_kv === null || data.rated_voltage_kv <= 0) {
      errors.push({ field: 'rated_voltage_kv', message: 'Napięcie znamionowe (kV) musi być > 0.' });
    }
    if (data.power_factor === null || data.power_factor <= 0 || data.power_factor > 1) {
      errors.push({ field: 'power_factor', message: 'Współczynnik mocy musi być w zakresie (0, 1].' });
    }
    if (!data.genset_operation_mode) {
      errors.push({ field: 'genset_operation_mode', message: 'Tryb pracy agregatu jest wymagany.' });
    }
  } else {
    if (data.backup_time_min === null || data.backup_time_min <= 0) {
      errors.push({ field: 'backup_time_min', message: 'Czas podtrzymania (min) musi być > 0.' });
    }
    if (!data.ups_operation_mode) {
      errors.push({ field: 'ups_operation_mode', message: 'Tryb pracy UPS jest wymagany.' });
    }
  }
  return errors;
}

/** Specyfikacja nowego pola źródłowego (tylko placement=NEW_FIELD) — klucze czytane przez
 *  `_append_converter_field_if_needed` (ta sama droga co pole źródła przekształtnikowego). */
function zbudujPoleZrodlowe(
  data: ZrodloDyspozycyjneFormData,
  kind: DispatchableKind,
): Record<string, unknown> | null {
  if (data.placement !== 'NEW_FIELD') return null;
  return {
    source_field_kind: kind === 'GENSET' ? 'AGREGAT' : 'UPS',
    field_name: data.new_field_name.trim() || null,
    catalog_binding: normalizeCatalogBinding(data.new_field_switch_catalog_ref, 'APARAT_NN') ?? null,
  };
}

export function zbudujPayload(
  data: ZrodloDyspozycyjneFormData,
  kind: DispatchableKind,
  kontekst: KontekstZrodla,
): Record<string, unknown> {
  const wspolne = {
    bus_nn_ref: data.bus_nn_ref,
    station_ref: kontekst.station_ref,
    placement: data.placement,
    existing_field_ref: data.placement === 'EXISTING_FIELD' ? data.existing_field_ref : null,
    source_field: zbudujPoleZrodlowe(data, kind),
  };
  const sourceName = data.source_name.trim() || null;
  if (kind === 'GENSET') {
    return {
      ...wspolne,
      genset_spec: {
        rated_power_kw: data.rated_power_kw,
        rated_voltage_kv: data.rated_voltage_kv,
        power_factor: data.power_factor,
        operation_mode: data.genset_operation_mode,
        fuel_type: data.fuel_type,
        source_name: sourceName,
      },
    };
  }
  return {
    ...wspolne,
    ups_spec: {
      rated_power_kw: data.rated_power_kw,
      backup_time_min: data.backup_time_min,
      operation_mode: data.ups_operation_mode,
      battery_type: data.battery_type,
      source_name: sourceName,
    },
  };
}

export function operacjaDla(kind: DispatchableKind): 'add_genset_nn' | 'add_ups_nn' {
  return kind === 'GENSET' ? 'add_genset_nn' : 'add_ups_nn';
}
