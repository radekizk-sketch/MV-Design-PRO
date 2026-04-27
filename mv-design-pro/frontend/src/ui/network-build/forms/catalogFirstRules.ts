/**
 * Reguły Catalog-First dla aktywnych operacji tworzenia elementów technicznych.
 *
 * Formularze FE mają emitować kanoniczne payloady:
 * - segmenty: segment.catalog_binding
 * - stacje na odcinku: transformer.catalog_binding
 * - transformatory, łączniki i GPZ: payload.catalog_binding
 * - źródła przekształtnikowe: kanonicznie add_converter_source
 *
 * Kompatybilność:
 * - stare payloady PV/BESS nadal są rozpoznawane przy imporcie historii lub
 *   przy otwieraniu starszych snapshotów, ale NIE stanowią już osobnych ścieżek UI
 */

import { isCanonicalOpName } from '../../../types/domainOps';

type Payload = Record<string, unknown>;

function asPayload(value: unknown): Payload | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return value as Payload;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasCatalogBinding(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return isNonEmptyString(record.catalog_item_id);
}

function hasManualGridSourceEquivalent(payload: Payload): boolean {
  const manualEquivalent = asPayload(payload.manual_equivalent);
  if (manualEquivalent === null) {
    return false;
  }

  const positive = (value: unknown): boolean =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  const nonNegative = (value: unknown): boolean =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const voltageKv = manualEquivalent.voltage_kv ?? payload.voltage_kv;
  const shortCircuitMode =
    typeof (manualEquivalent.short_circuit_mode ?? payload.short_circuit_mode) === 'string'
      ? String(manualEquivalent.short_circuit_mode ?? payload.short_circuit_mode)
          .trim()
          .toUpperCase()
      : 'SHORT_CIRCUIT_POWER';

  if (!positive(voltageKv)) {
    return false;
  }

  if (shortCircuitMode === 'IMPEDANCE') {
    const rOhm = manualEquivalent.r_ohm ?? payload.r_ohm;
    const xOhm = manualEquivalent.x_ohm ?? payload.x_ohm;
    return nonNegative(rOhm) && positive(xOhm);
  }

  const sk3Mva = manualEquivalent.sk3_mva ?? payload.sk3_mva;
  const rxRatio = manualEquivalent.rx_ratio ?? payload.rx_ratio;
  return positive(sk3Mva) && positive(rxRatio);
}

function hasCatalogInSegment(payload: Payload): boolean {
  const segment = asPayload(payload.segment);
  return segment !== null && hasCatalogBinding(segment.catalog_binding);
}

function hasLegacyPvCatalog(payload: Payload): boolean {
  const pvSpec = asPayload(payload.pv_spec);
  return pvSpec !== null && isNonEmptyString(pvSpec.catalog_item_id);
}

function hasLegacyBessCatalog(payload: Payload): boolean {
  const bessSpec = asPayload(payload.bess_spec);
  return (
    bessSpec !== null &&
    isNonEmptyString(bessSpec.inverter_catalog_id) &&
    isNonEmptyString(bessSpec.storage_catalog_id)
  );
}

function hasConverterCatalog(payload: Payload): boolean {
  return (
    isNonEmptyString(payload.converter_catalog_id)
    || isNonEmptyString(payload.catalog_ref)
    || isNonEmptyString(payload.catalog_item_id)
    || hasCatalogBinding(payload.catalog_binding)
    || hasLegacyPvCatalog(payload)
    || hasLegacyBessCatalog(payload)
  );
}

function hasRelayCatalog(payload: Payload): boolean {
  const protection = asPayload(payload.protection);
  return (
    (protection !== null && isNonEmptyString(protection.catalog_item_id))
    || isNonEmptyString(payload.catalog_item_id)
    || isNonEmptyString(payload.catalog_ref)
  );
}

function hasConverterCatalog(payload: Payload): boolean {
  return (
    isNonEmptyString(payload.converter_catalog_id)
    || isNonEmptyString(payload.catalog_ref)
    || isNonEmptyString(payload.catalog_item_id)
    || hasCatalogBinding(payload.catalog_binding)
    || hasLegacyPvCatalog(payload)
    || hasLegacyBessCatalog(payload)
  );
}

function hasRelayCatalog(payload: Payload): boolean {
  const protection = asPayload(payload.protection);
  return (
    (protection !== null && isNonEmptyString(protection.catalog_item_id))
    || isNonEmptyString(payload.catalog_item_id)
    || isNonEmptyString(payload.catalog_ref)
  );
}

const REQUIRED_CATALOG_MESSAGE: Record<string, string> = {
  continue_trunk_segment_sn:
    'Wybierz typ linii lub kabla z katalogu przed utworzeniem odcinka.',
  start_branch_segment_sn:
    'Wybierz typ odgalezienia z katalogu przed utworzeniem odcinka.',
  insert_station_on_segment_sn:
    'Wybierz transformator z katalogu przed wstawieniem stacji.',
  insert_branch_pole_on_segment_sn:
    'Wybierz typ slupa rozgaleznego z katalogu przed wstawieniem.',
  insert_zksn_on_segment_sn: 'Wybierz typ ZKSN z katalogu przed wstawieniem.',
  add_transformer_sn_nn: 'Wybierz transformator z katalogu przed dodaniem do stacji.',
  insert_section_switch_sn: 'Wybierz aparat z katalogu przed wstawieniem łącznika.',
  connect_secondary_ring_sn: 'Wybierz typ kabla lub linii pierścienia z katalogu przed domknięciem pętli.',
  add_grid_source_sn: 'Wybierz źródło systemowe z katalogu przed utworzeniem zasilania GPZ.',
  add_converter_source: 'Wybierz typ źródła przekształtnikowego z katalogu przed dodaniem źródła.',
  add_ct: 'Wybierz przekładnik prądowy z katalogu przed dodaniem go do pola SN.',
  add_vt: 'Wybierz przekładnik napięciowy z katalogu przed dodaniem go do pola SN.',
  add_relay: 'Wybierz zabezpieczenie z katalogu przed dodaniem go do pola SN.',
};

function normalizeCatalogFirstOperation(op: string): string {
  return isCanonicalOpName(op) ? op : op;
}

/**
 * Zwraca komunikat błędu walidacji Catalog-First albo null.
 */
export function validateCatalogFirst(op: string, payload: Payload): string | null {
  const normalizedOp = normalizeCatalogFirstOperation(op);

  switch (normalizedOp) {
    case 'continue_trunk_segment_sn':
    case 'start_branch_segment_sn':
    case 'connect_secondary_ring_sn':
      return hasCatalogInSegment(payload) ? null : REQUIRED_CATALOG_MESSAGE[normalizedOp];
    case 'insert_station_on_segment_sn': {
      const transformer = asPayload(payload.transformer);
      return transformer !== null && hasCatalogBinding(transformer.catalog_binding)
        ? null
        : REQUIRED_CATALOG_MESSAGE[normalizedOp];
    }
    case 'insert_branch_pole_on_segment_sn':
    case 'insert_zksn_on_segment_sn':
    case 'insert_section_switch_sn':
      return hasCatalogBinding(payload.catalog_binding)
        ? null
        : REQUIRED_CATALOG_MESSAGE[normalizedOp];
    case 'add_grid_source_sn':
      return hasCatalogBinding(payload.catalog_binding) || hasManualGridSourceEquivalent(payload)
        ? null
        : REQUIRED_CATALOG_MESSAGE[normalizedOp];
    case 'add_transformer_sn_nn':
      return hasCatalogBinding(payload.catalog_binding)
        ? null
        : REQUIRED_CATALOG_MESSAGE[normalizedOp];
    case 'add_converter_source':
      return hasConverterCatalog(payload) ? null : REQUIRED_CATALOG_MESSAGE[normalizedOp];
    case 'add_ct':
    case 'add_vt':
      return hasCatalogBinding(payload.catalog_binding)
        || isNonEmptyString(payload.catalog_ref)
        || isNonEmptyString(payload.catalog_item_id)
        ? null
        : REQUIRED_CATALOG_MESSAGE[normalizedOp];
    case 'add_relay':
      return hasRelayCatalog(payload) ? null : REQUIRED_CATALOG_MESSAGE[normalizedOp];
    default:
      return null;
  }
}
