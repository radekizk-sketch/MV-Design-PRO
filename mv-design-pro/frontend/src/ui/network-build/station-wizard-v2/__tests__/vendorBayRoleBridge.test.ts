/**
 * Kontrakt bridge'a: vendor catalog layout → domain FieldRole.
 *
 * Test wymusza że każdy CanonicalBayLayout w vendor catalog ma poprawne
 * mapowanie do istniejącego FIELD_ROLE oraz że auto-konfiguracja pól po
 * wyborze rozdzielnicy producenta zwraca poprawny apparatus stack per
 * IEC 60617 (bez duplikowania logiki).
 */
import { describe, expect, it } from 'vitest';

import {
  VENDOR_LAYOUT_TO_FIELD_ROLE,
  vendorLayoutToFieldRole,
  autoConfigureBaysFromVendor,
} from '../vendorBayRoleBridge';
import {
  VENDOR_SWITCHGEAR_CATALOG,
  getVendorSwitchgear,
} from '../vendorSwitchgearCatalog';
import { FIELD_ROLE, ALL_FIELD_ROLES } from '../../../sld/v2/domain/apparatusContracts';

describe('vendor layout → FieldRole mapping', () => {
  it('6 layoutów ma deterministyczne mapowanie do FieldRole', () => {
    expect(Object.keys(VENDOR_LAYOUT_TO_FIELD_ROLE)).toHaveLength(6);
  });

  it('cable_in → LINE_IN', () => {
    expect(vendorLayoutToFieldRole('cable_in')).toBe(FIELD_ROLE.LINE_IN);
  });

  it('cable_out → LINE_OUT', () => {
    expect(vendorLayoutToFieldRole('cable_out')).toBe(FIELD_ROLE.LINE_OUT);
  });

  it('breaker → LINE_BRANCH', () => {
    expect(vendorLayoutToFieldRole('breaker')).toBe(FIELD_ROLE.LINE_BRANCH);
  });

  it('transformer → TRANSFORMER', () => {
    expect(vendorLayoutToFieldRole('transformer')).toBe(FIELD_ROLE.TRANSFORMER);
  });

  it('measurement → MEASUREMENT', () => {
    expect(vendorLayoutToFieldRole('measurement')).toBe(FIELD_ROLE.MEASUREMENT);
  });

  it('coupler → COUPLER', () => {
    expect(vendorLayoutToFieldRole('coupler')).toBe(FIELD_ROLE.COUPLER);
  });

  it('każda zmapowana wartość jest poprawnym FieldRole z domeny', () => {
    for (const role of Object.values(VENDOR_LAYOUT_TO_FIELD_ROLE)) {
      expect(ALL_FIELD_ROLES).toContain(role);
    }
  });
});

describe('autoConfigureBaysFromVendor — integracja vendor catalog z renderem', () => {
  it('ABB SafePlus zwraca 4 pola z apparatus stack', () => {
    const template = getVendorSwitchgear('abb_safe_plus');
    expect(template).not.toBeNull();
    if (!template) return;

    const bays = autoConfigureBaysFromVendor(template);
    expect(bays).toHaveLength(4);

    // Pierwsza pozycja to cable_in (kabel z GPZ).
    expect(bays[0].layout).toBe('cable_in');
    expect(bays[0].fieldRole).toBe(FIELD_ROLE.LINE_IN);
    // LINE_IN ma stack DS + CB + ES per apparatusStackForRole.
    expect(bays[0].apparatusStack).toEqual(['DS', 'CB', 'ES']);
  });

  it('Schneider RM6 ma pole transformatorowe z apparatus stack', () => {
    const template = getVendorSwitchgear('schneider_rm6');
    expect(template).not.toBeNull();
    if (!template) return;

    const bays = autoConfigureBaysFromVendor(template);
    const trBay = bays.find((b) => b.layout === 'transformer');
    expect(trBay).toBeDefined();
    expect(trBay?.fieldRole).toBe(FIELD_ROLE.TRANSFORMER);
    // Stack TR bay (per apparatusStackForRole) zawiera FUSE/SD + ES (kabel
    // do TR), bez CT/CB (TR ma własną logikę poniżej).
    expect(trBay?.apparatusStack.length).toBeGreaterThan(0);
  });

  it('Siemens 8DJH ma pole pomiarowe MEASUREMENT', () => {
    const template = getVendorSwitchgear('siemens_8djh');
    expect(template).not.toBeNull();
    if (!template) return;

    const bays = autoConfigureBaysFromVendor(template);
    const meas = bays.find((b) => b.layout === 'measurement');
    expect(meas).toBeDefined();
    expect(meas?.fieldRole).toBe(FIELD_ROLE.MEASUREMENT);
  });

  it('ZPUE Rotoblok auto-konfiguruje 4 pola z polskimi etykietami', () => {
    const template = getVendorSwitchgear('zpue_rotoblok');
    expect(template).not.toBeNull();
    if (!template) return;

    const bays = autoConfigureBaysFromVendor(template);
    for (const bay of bays) {
      expect(bay.labelPl).toBeTruthy();
      // Polskie etykiety: nie technical codes (powinny zawierać spację /
      // pełne słowo per vendor catalog test).
      expect(bay.labelPl.length).toBeGreaterThan(2);
    }
  });

  it('Eaton Xiria zachowuje designation z vendor catalog', () => {
    const template = getVendorSwitchgear('eaton_xiria');
    expect(template).not.toBeNull();
    if (!template) return;

    const bays = autoConfigureBaysFromVendor(template);
    const designations = bays.map((b) => b.designation);
    // Designation: C / V / T (per Eaton karta katalogowa).
    expect(designations).toContain('C');
    expect(designations).toContain('V');
    expect(designations).toContain('T');
  });

  it('każdy template w katalogu daje poprawnie zmapowane apparatus stacks', () => {
    for (const template of VENDOR_SWITCHGEAR_CATALOG) {
      const bays = autoConfigureBaysFromVendor(template);
      expect(
        bays.length,
        `${template.fullName} musi auto-konfigurować ≥ 1 pole`,
      ).toBeGreaterThan(0);
      for (const bay of bays) {
        expect(
          bay.apparatusStack.length,
          `Pole ${bay.layout} w ${template.fullName} musi mieć apparatus stack`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('apparatus stack dla cable_in to dokładnie [DS, CB, ES] (per IEC 60617)', () => {
    const cableIns = VENDOR_SWITCHGEAR_CATALOG.flatMap((t) =>
      autoConfigureBaysFromVendor(t).filter((b) => b.layout === 'cable_in'),
    );
    expect(cableIns.length).toBeGreaterThan(0);
    for (const bay of cableIns) {
      expect(bay.apparatusStack).toEqual(['DS', 'CB', 'ES']);
    }
  });
});

describe('Cross-vendor consistency — apparatus stacks są spójne per FieldRole', () => {
  it('wszystkie cable_in (ABB/Schneider/Siemens/Eaton/ZPUE) mają identyczny stack', () => {
    const stacks = VENDOR_SWITCHGEAR_CATALOG
      .flatMap((t) => autoConfigureBaysFromVendor(t))
      .filter((b) => b.layout === 'cable_in')
      .map((b) => b.apparatusStack.join(','));
    // Wszystkie identyczne (jeden stack dla LINE_IN per IEC).
    const uniqueStacks = new Set(stacks);
    expect(uniqueStacks.size).toBe(1);
  });

  it('wszystkie cable_out mają identyczny stack', () => {
    const stacks = VENDOR_SWITCHGEAR_CATALOG
      .flatMap((t) => autoConfigureBaysFromVendor(t))
      .filter((b) => b.layout === 'cable_out')
      .map((b) => b.apparatusStack.join(','));
    if (stacks.length > 0) {
      const uniqueStacks = new Set(stacks);
      expect(uniqueStacks.size).toBe(1);
    }
  });

  it('wszystkie breaker mają identyczny stack', () => {
    const stacks = VENDOR_SWITCHGEAR_CATALOG
      .flatMap((t) => autoConfigureBaysFromVendor(t))
      .filter((b) => b.layout === 'breaker')
      .map((b) => b.apparatusStack.join(','));
    if (stacks.length > 0) {
      const uniqueStacks = new Set(stacks);
      expect(uniqueStacks.size).toBe(1);
    }
  });
});
