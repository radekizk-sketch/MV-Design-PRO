/**
 * SwitchgearConfigV1 — Konfiguracja rozdzielnicy (pola/aparaty/katalogi/ochrona).
 *
 * RUN #3I COMMIT 1: Kontrakt TS 1:1 z backendem (domain/switchgear_config.py).
 *
 * CANONICAL CONTRACT (BINDING):
 * - Immutable (readonly).
 * - Deterministic: sortowanie po id, kanoniczny hash (SHA-256), permutation invariant.
 * - ZAKAZ auto-uzupelnien: brak danych -> FixAction (stabilny kod PL).
 * - ZAKAZ domyslnych parametrow urzadzen — brak = ValidationIssue + FixAction.
 * - PV/BESS zawsze przez transformator (SN/nN lub blokowy).
 * - catalogRef wymagany dla kazdego aparatu — brak -> CATALOG_REF_MISSING.
 *
 * ALIGNMENT:
 * - backend: domain/switchgear_config.py
 * - frontend: fieldDeviceContracts.ts (PoleTypeV1, AparatTypeV1, FieldRoleV1, DeviceTypeV1)
 */

import {
  type DeviceTypeV1,
  DeviceTypeV1 as DT,
  type FieldRoleV1,
  FieldRoleV1 as FR,
  type PoleTypeV1,
  type AparatTypeV1,
} from './fieldDeviceContracts';

// =============================================================================
// VERSION
// =============================================================================

export const SWITCHGEAR_CONFIG_VERSION = '1.0' as const;

// =============================================================================
// CONFIG ISSUE SEVERITY
// =============================================================================

export const ConfigIssueSeverity = {
  BLOCKER: 'BLOCKER',
  WARNING: 'WARNING',
} as const;

export type ConfigIssueSeverity =
  (typeof ConfigIssueSeverity)[keyof typeof ConfigIssueSeverity];

// =============================================================================
// VALIDATION ISSUE
// =============================================================================

export interface ConfigValidationIssueV1 {
  readonly code: string;
  readonly severity: ConfigIssueSeverity;
  readonly messagePl: string;
  readonly elementId: string | null;
  readonly fieldId: string | null;
  readonly deviceId: string | null;
}

// =============================================================================
// FIX ACTION TYPE
// =============================================================================

export const FixActionType = {
  NAVIGATE_TO_WIZARD_FIELD: 'NAVIGATE_TO_WIZARD_FIELD',
  NAVIGATE_TO_WIZARD_DEVICE: 'NAVIGATE_TO_WIZARD_DEVICE',
  NAVIGATE_TO_WIZARD_CATALOG_PICKER: 'NAVIGATE_TO_WIZARD_CATALOG_PICKER',
  NAVIGATE_TO_WIZARD_PROTECTION: 'NAVIGATE_TO_WIZARD_PROTECTION',
} as const;

export type FixActionType =
  (typeof FixActionType)[keyof typeof FixActionType];

// =============================================================================
// FIX ACTION
// =============================================================================

export interface ConfigFixActionV1 {
  readonly code: string;
  readonly action: FixActionType;
  readonly messagePl: string;
  readonly stationId: string;
  readonly fieldId: string | null;
  readonly deviceId: string | null;
}

// =============================================================================
// CATALOG BINDING V1
// =============================================================================

export interface CatalogBindingV1 {
  readonly deviceId: string;
  readonly catalogId: string;
  readonly catalogName: string;
  readonly manufacturer: string | null;
  readonly catalogVersion: string | null;
}

// =============================================================================
// PROTECTION BINDING V1
// =============================================================================

export interface ProtectionBindingV1 {
  readonly relayDeviceId: string;
  readonly cbDeviceId: string;
}

// =============================================================================
// DEVICE CONFIG V1
// =============================================================================

export interface DeviceConfigV1 {
  readonly deviceId: string;
  readonly fieldId: string;
  readonly deviceType: DeviceTypeV1;
  readonly aparatType: AparatTypeV1;
}

// =============================================================================
// FIELD CONFIG V1
// =============================================================================

export interface FieldConfigV1 {
  readonly fieldId: string;
  readonly poleType: PoleTypeV1;
  readonly fieldRole: FieldRoleV1;
  readonly busSectionId: string | null;
}

// =============================================================================
// SWITCHGEAR CONFIG V1
// =============================================================================

export interface SwitchgearConfigV1 {
  readonly configVersion: string;
  readonly stationId: string;
  readonly fields: readonly FieldConfigV1[];
  readonly devices: readonly DeviceConfigV1[];
  readonly catalogBindings: readonly CatalogBindingV1[];
  readonly protectionBindings: readonly ProtectionBindingV1[];
}

// =============================================================================
// VALIDATION RESULT
// =============================================================================

export interface SwitchgearConfigValidationResultV1 {
  readonly valid: boolean;
  readonly issues: readonly ConfigValidationIssueV1[];
  readonly fixActions: readonly ConfigFixActionV1[];
}

// =============================================================================
// VALIDATION CODES (stable PL — 1:1 with backend)
// =============================================================================

export const SwitchgearConfigValidationCode = {
  CATALOG_REF_MISSING: 'catalog.ref_missing',
  FIELD_MISSING_REQUIRED_DEVICE: 'field.missing_required_device',
  DEVICE_MISSING_REQUIRED_PARAMETER: 'device.missing_required_parameter',
  PROTECTION_BINDING_MISSING: 'protection.binding_missing',
  PV_BESS_TRANSFORMER_MISSING: 'pv_bess.transformer_missing',
  FIELD_DUPLICATE_ID: 'field.duplicate_id',
  DEVICE_DUPLICATE_ID: 'device.duplicate_id',
  DEVICE_ORPHAN: 'device.orphan_no_field',
  CATALOG_BINDING_ORPHAN: 'catalog_binding.orphan_no_device',
  PROTECTION_BINDING_ORPHAN: 'protection_binding.orphan_no_device',
} as const;

export type SwitchgearConfigValidationCode =
  (typeof SwitchgearConfigValidationCode)[keyof typeof SwitchgearConfigValidationCode];

// =============================================================================
// REQUIRED DEVICES per FieldRole (1:1 with backend)
// =============================================================================

export const REQUIRED_DEVICES: Record<FieldRoleV1, readonly DeviceTypeV1[]> = {
  [FR.GPZ_LINE_BAY]: [DT.DS, DT.CB, DT.CT, DT.RELAY, DT.ES, DT.CABLE_HEAD],
  [FR.LINE_IN]: [DT.CB, DT.CABLE_HEAD],
  [FR.LINE_OUT]: [DT.CB, DT.CABLE_HEAD],
  [FR.LINE_BRANCH]: [DT.CB, DT.CABLE_HEAD],
  [FR.TRANSFORMER_SN_NN]: [DT.CB, DT.CT, DT.RELAY, DT.TRANSFORMER_DEVICE, DT.CABLE_HEAD],
  [FR.MEASUREMENT_SN]: [DT.VT],
  [FR.PV_SN]: [DT.CB, DT.CT, DT.RELAY, DT.GENERATOR_PV, DT.CABLE_HEAD],
  [FR.BESS_SN]: [DT.CB, DT.CT, DT.RELAY, DT.GENERATOR_BESS, DT.CABLE_HEAD],
  [FR.FW_SN]: [DT.CB, DT.CT, DT.VT, DT.RELAY, DT.GENERATOR_FW, DT.CABLE_HEAD],
  [FR.COUPLER_SN]: [DT.DS, DT.CB],
  [FR.BUS_TIE]: [DT.DS, DT.CB],
  [FR.MAIN_NN]: [DT.ACB],
  [FR.FEEDER_NN]: [DT.FUSE],
  [FR.PV_NN]: [DT.ACB, DT.CT, DT.RELAY, DT.GENERATOR_PV],
  [FR.BESS_NN]: [DT.ACB, DT.CT, DT.RELAY, DT.GENERATOR_BESS],
};

// PV/BESS SN field roles that require transformer
export const PV_BESS_SN_ROLES: ReadonlySet<FieldRoleV1> = new Set([
  FR.PV_SN,
  FR.BESS_SN,
]);

// =============================================================================
// CANONICAL SERIALIZATION
// =============================================================================

/**
 * Kanonizuje konfiguracje — sortuje deterministycznie.
 *
 * Sortowanie:
 * - fields: po fieldId
 * - devices: po deviceId
 * - catalogBindings: po deviceId
 * - protectionBindings: po relayDeviceId, cbDeviceId
 */
export function canonicalizeConfig(config: SwitchgearConfigV1): SwitchgearConfigV1 {
  return {
    configVersion: config.configVersion,
    stationId: config.stationId,
    fields: [...config.fields].sort((a, b) => a.fieldId.localeCompare(b.fieldId)),
    devices: [...config.devices].sort((a, b) => a.deviceId.localeCompare(b.deviceId)),
    catalogBindings: [...config.catalogBindings].sort((a, b) =>
      a.deviceId.localeCompare(b.deviceId),
    ),
    protectionBindings: [...config.protectionBindings].sort((a, b) => {
      const cmp = a.relayDeviceId.localeCompare(b.relayDeviceId);
      return cmp !== 0 ? cmp : a.cbDeviceId.localeCompare(b.cbDeviceId);
    }),
  };
}

/**
 * Serializuje konfiguracje do kanonicznego JSON (klucze posortowane).
 *
 * Format identyczny z backendem: sort_keys=True, separators=(",", ":").
 */
function configToCanonicalJson(config: SwitchgearConfigV1): string {
  const canonical = canonicalizeConfig(config);
  const data = {
    catalog_bindings: canonical.catalogBindings.map(b => ({
      catalog_id: b.catalogId,
      catalog_name: b.catalogName,
      catalog_version: b.catalogVersion,
      device_id: b.deviceId,
      manufacturer: b.manufacturer,
    })),
    config_version: canonical.configVersion,
    devices: canonical.devices.map(d => ({
      aparat_type: d.aparatType,
      device_id: d.deviceId,
      device_type: d.deviceType,
      field_id: d.fieldId,
    })),
    fields: canonical.fields.map(f => ({
      bus_section_id: f.busSectionId,
      field_id: f.fieldId,
      field_role: f.fieldRole,
      pole_type: f.poleType,
    })),
    protection_bindings: canonical.protectionBindings.map(p => ({
      cb_device_id: p.cbDeviceId,
      relay_device_id: p.relayDeviceId,
    })),
    station_id: canonical.stationId,
  };
  return JSON.stringify(data);
}

// =============================================================================
// HASHING (SHA-256 — parity z backendem)
// =============================================================================

/**
 * Rotate right (32-bit).
 */
function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** SHA-256 round constants. */
const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * SHA-256 synchroniczny (pure JS) — deterministyczny hash zgodny z backendem.
 *
 * Zastepuje FNV-1a. Parzystosc z Python hashlib.sha256 potwierdzona testami.
 */
function sha256Sync(message: string): string {
  // Encode UTF-8
  const encoder = new TextEncoder();
  const utf8 = encoder.encode(message);

  // Pre-processing: padding
  const bitLength = utf8.length * 8;
  const paddedLength = Math.ceil((utf8.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(utf8);
  padded[utf8.length] = 0x80;

  // Append length as 64-bit big-endian (high 32 bits = 0 for messages < 2^32 bits)
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLength - 4, bitLength, false);

  // Initial hash values
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  // Process each 512-bit block
  const w = new Int32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getInt32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(v => (v >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

/**
 * Oblicza deterministyczny SHA-256 hash konfiguracji.
 *
 * Permutation invariant: kolejnosc pol/aparatow nie wplywa na hash.
 * Kanoniczny JSON z posortowanymi kluczami, format identyczny z backendem.
 */
export function computeConfigHash(config: SwitchgearConfigV1): string {
  const json = configToCanonicalJson(config);
  return sha256Sync(json);
}

// =============================================================================
// EMPTY CONFIG FACTORY
// =============================================================================

export function emptyConfig(stationId: string): SwitchgearConfigV1 {
  return {
    configVersion: SWITCHGEAR_CONFIG_VERSION,
    stationId,
    fields: [],
    devices: [],
    catalogBindings: [],
    protectionBindings: [],
  };
}
