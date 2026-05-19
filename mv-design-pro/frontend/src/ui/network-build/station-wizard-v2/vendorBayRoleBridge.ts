/**
 * Bridge: vendor catalog `CanonicalBayLayout` → domain `FieldRole`.
 *
 * Vendor switchgear catalog używa 6 kanonicznych layoutów dla pól:
 *   cable_in / breaker / transformer / cable_out / measurement / coupler
 *
 * Domain renderer (apparatusContracts.ts) używa `FIELD_ROLE` z 9 wartościami:
 *   LINE_IN / LINE_OUT / LINE_BRANCH / TRANSFORMER / COUPLER /
 *   MEASUREMENT / GPZ_LINE_BAY / RMU_LINE / RMU_TRANSFORMER
 *
 * Ten plik dostarcza deterministyczne mapowanie 1:1 dla auto-konfiguracji
 * pól po wyborze rozdzielnicy w wizardzie. Bridge umożliwia ponowne użycie
 * istniejącego `apparatusStackForRole()` z `MiniBlockBayLayout.ts` bez
 * duplikowania logiki apparatus stack per IEC 60617.
 */
import { FIELD_ROLE, type FieldRole } from '../../sld/v2/domain/apparatusContracts';
import { apparatusStackForRole } from '../../sld/v2/renderer/MiniBlockBayLayout';
import type {
  CanonicalBayLayout,
  VendorBayTemplate,
  VendorSwitchgearTemplate,
} from './vendorSwitchgearCatalog';

/**
 * Mapowanie vendor layout → domain FieldRole.
 *
 * Reguły:
 * - cable_in   → LINE_IN     (pole kablowe zasilające z magistrali / GPZ)
 * - cable_out  → LINE_OUT    (pole kablowe odpływowe — kontynuacja ringu)
 * - breaker    → LINE_BRANCH (pole z wyłącznikiem dla odpływu / DER)
 * - transformer → TRANSFORMER (pole transformatorowe SN/nN)
 * - measurement → MEASUREMENT (pole pomiarowe — VT, opcjonalnie CT)
 * - coupler    → COUPLER     (sprzęgło sekcyjne / longitudinal)
 */
export const VENDOR_LAYOUT_TO_FIELD_ROLE: Readonly<Record<CanonicalBayLayout, FieldRole>> = {
  cable_in:    FIELD_ROLE.LINE_IN,
  cable_out:   FIELD_ROLE.LINE_OUT,
  breaker:     FIELD_ROLE.LINE_BRANCH,
  transformer: FIELD_ROLE.TRANSFORMER,
  measurement: FIELD_ROLE.MEASUREMENT,
  coupler:     FIELD_ROLE.COUPLER,
};

/** Tłumaczenie pojedynczego layoutu na FieldRole. */
export function vendorLayoutToFieldRole(layout: CanonicalBayLayout): FieldRole {
  return VENDOR_LAYOUT_TO_FIELD_ROLE[layout];
}

/**
 * Auto-konfiguracja: dla wybranego template producenta zwraca listę
 * pól ze stack-iem apparatusów per IEC 60617 (gotowy do renderowania
 * w MiniBlockBayLayout).
 *
 * Użycie: gdy operator wybierze ABB SafePlus w kroku 2 Kreatora,
 * krok 3 dostaje gotową listę 4 pól z poprawnym apparatus stack-iem
 * (zamiast losowego zestawienia symboli).
 */
export interface AutoConfiguredBay {
  readonly layout: CanonicalBayLayout;
  readonly fieldRole: FieldRole;
  readonly designation: string;
  readonly labelPl: string;
  readonly apparatusStack: ReturnType<typeof apparatusStackForRole>;
}

export function autoConfigureBaysFromVendor(
  template: VendorSwitchgearTemplate,
): readonly AutoConfiguredBay[] {
  return template.defaultBays.map((bay: VendorBayTemplate): AutoConfiguredBay => {
    const fieldRole = vendorLayoutToFieldRole(bay.layout);
    return {
      layout: bay.layout,
      fieldRole,
      designation: bay.designation,
      labelPl: bay.labelPl,
      apparatusStack: apparatusStackForRole(fieldRole),
    };
  });
}
