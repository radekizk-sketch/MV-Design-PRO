/**
 * Walidacje + deterministyczne ID dla AddDerWizard.
 * Wzmocnienie po audycie systemowym:
 *  - generateDeterministicDerId: fnv1a hash zamiast Date.now()
 *  - validateWizardSelections: catalog_refs muszą istnieć w katalogu
 */

import {
  BESS_BATTERY_CATALOG,
  BESS_PCS_CATALOG,
  HVRT_CURVE_CATALOG,
  LV_VOLTAGE_LEVEL_CATALOG,
  LVRT_CURVE_CATALOG,
  NC_RFG_PROFILE_CATALOG,
  PV_INVERTER_CATALOG,
  WIND_TURBINE_CATALOG,
} from './catalogs';
import type { DerKindUnified } from './types';

/**
 * 32-bit FNV-1a hash deterministyczny (taki sam jak w HierarchicalLayout).
 */
function fnv1a32(str: string): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface DeterministicIdInput {
  readonly projectId: string;
  readonly stationId: string;
  readonly derKind: DerKindUnified;
  readonly derName: string;
  readonly pccLabel: string;
}

/**
 * Generuje deterministyczne ID DER z parametrów. Te same parametry → to samo ID.
 * Format: `der_{kind}_{station}_{hash8}`.
 */
export function generateDeterministicDerId(input: DeterministicIdInput): string {
  const seed = `${input.projectId}|${input.stationId}|${input.derKind}|${input.derName}|${input.pccLabel}`;
  const hash = fnv1a32(seed);
  const stationShort = input.stationId.slice(0, 12).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `der_${input.derKind.toLowerCase()}_${stationShort}_${hash}`;
}

export interface WizardSelections {
  readonly connectionSide: string | null;
  readonly voltageLevelRef: string | null;
  readonly pccLabel: string;
  readonly bayName: string;
  readonly deviceCatalogRef: string | null;
  readonly batteryCatalogRef: string | null;
  readonly ncRfgProfileRef: string | null;
  readonly lvrtCurveRef: string | null;
  readonly hvrtCurveRef: string | null;
  readonly derName: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export interface WizardValidationContext {
  readonly allowedDeviceCatalogIds?: readonly string[];
}

/**
 * Waliduje selekcje wizardu — sprawdza obecność catalog_refs w katalogach.
 * Chroni przed manipulacją selections w devtools.
 */
export function validateWizardSelections(
  selections: WizardSelections,
  derKind: DerKindUnified,
  context: WizardValidationContext = {},
): ValidationResult {
  const errors: string[] = [];

  // Nazwa DER
  if (!selections.derName.trim()) {
    errors.push('Nazwa DER nie może być pusta.');
  }

  // PCC label
  if (!selections.pccLabel.trim()) {
    errors.push('Etykieta PCC nie może być pusta.');
  }

  // Voltage level (tylko nN)
  if (selections.connectionSide === 'nN') {
    if (!selections.voltageLevelRef || !LV_VOLTAGE_LEVEL_CATALOG.find((l) => l.id === selections.voltageLevelRef)) {
      errors.push('Wybrany poziom napięcia nN nie istnieje w katalogu LvVoltageLevelCatalog.');
    }
  }

  // Device catalog (per kind)
  if (!selections.deviceCatalogRef) {
    errors.push('Wybór urządzenia z katalogu jest wymagany.');
  } else {
    const deviceCatalog =
      derKind === 'PV' ? PV_INVERTER_CATALOG
      : derKind === 'BESS' ? BESS_PCS_CATALOG
      : WIND_TURBINE_CATALOG;
    const allowedDeviceCatalogIds = new Set([
      ...deviceCatalog.map((device) => device.id),
      ...(context.allowedDeviceCatalogIds ?? []),
    ]);
    if (!allowedDeviceCatalogIds.has(selections.deviceCatalogRef)) {
      errors.push(
        `Urządzenie "${selections.deviceCatalogRef}" nie istnieje w katalogu dla DER ${derKind}.`,
      );
    }
  }

  // Bateria BESS
  if (derKind === 'BESS') {
    if (!selections.batteryCatalogRef) {
      errors.push('BESS wymaga wyboru baterii z katalogu.');
    } else if (!BESS_BATTERY_CATALOG.find((b) => b.id === selections.batteryCatalogRef)) {
      errors.push(`Bateria "${selections.batteryCatalogRef}" nie istnieje w katalogu.`);
    }
  }

  // Profil NC RfG
  if (!selections.ncRfgProfileRef) {
    errors.push('Profil NC RfG operatora jest wymagany.');
  } else if (!NC_RFG_PROFILE_CATALOG.find((p) => p.id === selections.ncRfgProfileRef)) {
    errors.push(`Profil NC RfG "${selections.ncRfgProfileRef}" nie istnieje w katalogu.`);
  }

  // LVRT curve
  if (!selections.lvrtCurveRef) {
    errors.push('Krzywa LVRT jest wymagana.');
  } else if (!LVRT_CURVE_CATALOG.find((c) => c.id === selections.lvrtCurveRef)) {
    errors.push(`Krzywa LVRT "${selections.lvrtCurveRef}" nie istnieje w katalogu.`);
  }

  // HVRT curve
  if (!selections.hvrtCurveRef) {
    errors.push('Krzywa HVRT jest wymagana.');
  } else if (!HVRT_CURVE_CATALOG.find((c) => c.id === selections.hvrtCurveRef)) {
    errors.push(`Krzywa HVRT "${selections.hvrtCurveRef}" nie istnieje w katalogu.`);
  }

  return { ok: errors.length === 0, errors };
}
