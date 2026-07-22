/**
 * Model kreatora „Źródło dyspozycyjne nN (agregat / UPS)" — ui2, kreatory/rama.
 *
 * Dodaje agregat prądotwórczy albo UPS do rozdzielni nN. Katalog-first
 * (SYSTEM_ZRODLOWY dla agregatu/UPS, APARAT_NN dla aparatu pola). Zapis =
 * operacja domenowa `add_genset_nn` albo `add_ups_nn`. Kontrakt payloadu bez
 * zmian względem legacy `AddDispatchableSourceForm` (GensetModal / UPSModal).
 */

export type DispatchableKind = 'GENSET' | 'UPS';
export type SourcePlacement = 'NEW_FIELD' | 'EXISTING_FIELD';
export type NNSwitchKind = 'WYLACZNIK' | 'ROZLACZNIK' | 'BEZPIECZNIK';
export type NNSwitchState = 'OTWARTY' | 'ZAMKNIETY';
export type GensetOperationMode = 'PRACA_CIAGLA' | 'PRACA_AWARYJNA' | 'PRACA_SZCZYTOWA' | 'WYLACZONE';
export type GensetFuelType = 'DIESEL' | 'GAZ' | 'BIOPALIWO' | 'INNY';
export type UpsOperationMode = 'ONLINE' | 'LINE_INTERACTIVE' | 'OFFLINE' | 'WYLACZONE';
export type UpsBatteryType = 'LI_ION' | 'VRLA' | 'NICD' | 'INNY';

export interface ZrodloDyspozycyjneFormData {
  bus_nn_ref: string;
  placement: SourcePlacement;
  existing_field_ref: string | null;
  // Nowe pole przyłączeniowe (placement=NEW_FIELD)
  new_field_switch_kind: NNSwitchKind | null;
  new_field_switch_state: NNSwitchState | null;
  new_field_switch_catalog_ref: string | null;
  new_field_voltage_nn_kv: number | null;
  new_field_name: string;
  // Parametry źródła
  catalog_item_id: string | null;
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
  new_field_switch_kind: null,
  new_field_switch_state: null,
  new_field_switch_catalog_ref: null,
  new_field_voltage_nn_kv: null,
  new_field_name: '',
  catalog_item_id: null,
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
  if (data.placement === 'NEW_FIELD') {
    if (!data.new_field_switch_kind) {
      errors.push({ field: 'new_field_switch_kind', message: 'Rodzaj aparatu pola jest wymagany.' });
    }
    if (!data.new_field_switch_state) {
      errors.push({ field: 'new_field_switch_state', message: 'Stan normalny aparatu jest wymagany.' });
    }
    if (data.new_field_voltage_nn_kv === null || data.new_field_voltage_nn_kv <= 0) {
      errors.push({ field: 'new_field_voltage_nn_kv', message: 'Napięcie nN (kV) musi być > 0.' });
    }
  }
  if (!data.catalog_item_id) {
    errors.push({ field: 'catalog_item_id', message: kind === 'UPS' ? 'Katalog UPS jest wymagany.' : 'Katalog agregatu jest wymagany.' });
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

/** Buduje specyfikację nowego pola źródłowego (tylko placement=NEW_FIELD). */
function zbudujPoleZrodlowe(
  data: ZrodloDyspozycyjneFormData,
  kind: DispatchableKind,
): Record<string, unknown> | null {
  if (data.placement !== 'NEW_FIELD') return null;
  return {
    source_field_kind: kind === 'GENSET' ? 'AGREGAT' : 'UPS',
    switch_spec: {
      switch_kind: data.new_field_switch_kind,
      normal_state: data.new_field_switch_state,
      catalog_binding: data.new_field_switch_catalog_ref
        ? {
            catalog_namespace: 'APARAT_NN',
            catalog_item_id: data.new_field_switch_catalog_ref,
            catalog_item_version: '2024.1',
          }
        : null,
    },
    voltage_nn_kv: data.new_field_voltage_nn_kv,
    field_name: data.new_field_name.trim() || null,
    field_label: data.new_field_name.trim() || null,
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
        catalog_item_id: data.catalog_item_id,
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
      catalog_item_id: data.catalog_item_id,
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
