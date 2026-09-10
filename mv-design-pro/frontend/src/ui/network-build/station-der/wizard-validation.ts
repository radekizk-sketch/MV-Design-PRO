/**
 * Walidacje + deterministyczne ID dla AddDerWizard.
 * Wzmocnienie po audycie systemowym:
 *  - generateDeterministicDerId: fnv1a hash zamiast Date.now()
 *  - validateWizardSelections: catalog_refs muszą istnieć w katalogu
 */

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
  readonly pccLabel: string;
  /**
   * Karta FAB-K: punkt przyłączenia SN — szyna ISTNIEJĄCA w modelu, wymagana
   * gdy `connectionSide==='dedicated_transformer'`. Zastępuje dawne `bayName`
   * (etykieta tekstowa fabrykująca pseudo-referencję w UI).
   */
  readonly snConnectionBusRef: string | null;
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
  /**
   * Katalog urządzeń DER (PV/BESS/FW) pochodzi WYŁĄCZNIE z backendu (karta FAB-I)
   * — wołający MUSI przekazać identyfikatory faktycznie zaoferowane projektantowi
   * (lista z `fetchDerConverterTypes`). Bez tego pola żaden `deviceCatalogRef` nie
   * przejdzie walidacji: brak listy zastępczej w tym module, tak jak nie ma jej
   * już w kreatorze.
   */
  readonly allowedDeviceCatalogIds?: readonly string[];
  /** Karta FAB-J: identyfikatory pakietów baterii BESS z `/api/catalog/bess-battery-types`. */
  readonly allowedBatteryCatalogIds?: readonly string[];
  /** Karta FAB-J: `operator_id` z `GET /api/ncrfg-tests/catalog` (pse/energa/tauron/enea/pge). */
  readonly allowedNcRfgOperatorIds?: readonly string[];
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

  // Punkt przyłączenia SN (karta FAB-K) — WYŁĄCZNIE dla dedicated_transformer;
  // musi wskazywać element ISTNIEJĄCY w modelu (backend odrzuca 422 bez niego —
  // `generator.sn_connection_bus_missing`), więc kreator nie może pozwolić na
  // zapis bez tego pola.
  if (selections.connectionSide === 'dedicated_transformer' && !selections.snConnectionBusRef) {
    errors.push('Punkt przyłączenia SN (szyna stacji / ZK SN / słup rozgałęźny / odgałęzienie) jest wymagany.');
  }

  // Device catalog (per kind) — WYŁĄCZNIE backend (karta FAB-I). Katalog lokalny
  // (`catalogs.ts`) NIE jest już drugim źródłem prawdy o poprawności wyboru: ten
  // sam mechanizm, który dawał kreatorowi fabrykowaną listę zastępczą, tu dawałby
  // przejście walidacji dla urządzenia, którego backend nigdy nie zaoferował.
  if (!selections.deviceCatalogRef) {
    errors.push('Wybór urządzenia z katalogu jest wymagany.');
  } else {
    const allowedDeviceCatalogIds = new Set(context.allowedDeviceCatalogIds ?? []);
    if (!allowedDeviceCatalogIds.has(selections.deviceCatalogRef)) {
      errors.push(
        `Urządzenie "${selections.deviceCatalogRef}" nie istnieje w katalogu backendu dla DER ${derKind}.`,
      );
    }
  }

  // Bateria BESS — WYŁĄCZNIE `/api/catalog/bess-battery-types` (karta FAB-J).
  if (derKind === 'BESS') {
    const allowedBatteryCatalogIds = new Set(context.allowedBatteryCatalogIds ?? []);
    if (!selections.batteryCatalogRef) {
      errors.push('BESS wymaga wyboru baterii z katalogu.');
    } else if (!allowedBatteryCatalogIds.has(selections.batteryCatalogRef)) {
      errors.push(`Bateria "${selections.batteryCatalogRef}" nie istnieje w katalogu backendu.`);
    }
  }

  // Profil NC RfG — WYŁĄCZNIE operatorzy z `GET /api/ncrfg-tests/catalog` (karta FAB-J).
  const allowedNcRfgOperatorIds = new Set(context.allowedNcRfgOperatorIds ?? []);
  if (!selections.ncRfgProfileRef) {
    errors.push('Profil NC RfG operatora jest wymagany.');
  } else if (!allowedNcRfgOperatorIds.has(selections.ncRfgProfileRef)) {
    errors.push(`Profil NC RfG "${selections.ncRfgProfileRef}" nie istnieje w katalogu backendu.`);
  }

  // LVRT / HVRT — karta FAB-J: backend niesie JEDNĄ parę krzywych ride-through
  // na operatora (`NcRfgOperatorItem.ride_through`), więc krzywa wybrana NIE
  // JEST niezależną decyzją — musi być tym samym operatorem, co profil NC RfG
  // (kreator ustawia ją automatycznie razem z profilem, patrz AddDerWizard).
  if (!selections.lvrtCurveRef) {
    errors.push('Krzywa LVRT jest wymagana.');
  } else if (selections.lvrtCurveRef !== selections.ncRfgProfileRef) {
    errors.push('Krzywa LVRT musi pochodzić z tego samego operatora co profil NC RfG.');
  }

  if (!selections.hvrtCurveRef) {
    errors.push('Krzywa HVRT jest wymagana.');
  } else if (selections.hvrtCurveRef !== selections.ncRfgProfileRef) {
    errors.push('Krzywa HVRT musi pochodzić z tego samego operatora co profil NC RfG.');
  }

  return { ok: errors.length === 0, errors };
}
