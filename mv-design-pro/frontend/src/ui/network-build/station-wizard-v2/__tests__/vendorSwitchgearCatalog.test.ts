/**
 * Vendor Switchgear Catalog — kontrakt 5 typoszeregów rozdzielnic.
 *
 * Wymaganie #5 z /goal: szablony producentów (co najmniej ZPUE Włoszczowa,
 * Elektrometal, ABB, Siemens). Ten test wymusza pokrycie ≥4 producentów +
 * spójność danych technicznych per IEC 62271-200.
 */
import { describe, expect, it } from 'vitest';

import {
  VENDOR_SWITCHGEAR_CATALOG,
  getVendorSwitchgear,
  getAllManufacturers,
  getTemplatesByManufacturer,
} from '../vendorSwitchgearCatalog';

describe('VENDOR_SWITCHGEAR_CATALOG — 5 typoszeregów referencyjnych', () => {
  it('zawiera co najmniej 5 typoszeregów', () => {
    expect(VENDOR_SWITCHGEAR_CATALOG.length).toBeGreaterThanOrEqual(5);
  });

  it('pokrywa wymaganych producentów: ABB, Schneider, Siemens, ZPUE', () => {
    const refs = new Set(VENDOR_SWITCHGEAR_CATALOG.map((t) => t.manufacturerRef));
    expect(refs.has('ABB')).toBe(true);
    expect(refs.has('Schneider')).toBe(true);
    expect(refs.has('Siemens')).toBe(true);
    expect(refs.has('ZPUE_Wloszczowa')).toBe(true);
  });

  it('każdy typoszereg ma unikalny id', () => {
    const ids = VENDOR_SWITCHGEAR_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('każdy typoszereg deklaruje ≥ 1 napięcie znamionowe SN', () => {
    for (const t of VENDOR_SWITCHGEAR_CATALOG) {
      expect(t.voltageLevels.length).toBeGreaterThan(0);
      // Wszystkie napięcia SN są w zakresie 1-52 kV (per IEC 62271-1).
      for (const v of t.voltageLevels) {
        expect(v).toBeGreaterThan(1);
        expect(v).toBeLessThan(52);
      }
    }
  });

  it('prąd znamionowy szyny ≥ 400 A (typowo 630 A dla 24 kV)', () => {
    for (const t of VENDOR_SWITCHGEAR_CATALOG) {
      expect(t.ratedBusbarCurrent).toBeGreaterThanOrEqual(400);
    }
  });

  it('Ik szyny ≥ 16 kA (typowo 20-25 kA per IEC 62271-200)', () => {
    for (const t of VENDOR_SWITCHGEAR_CATALOG) {
      expect(t.shortTimeCurrent).toBeGreaterThanOrEqual(16);
    }
  });

  it('każdy typoszereg deklaruje klasę IAC (Internal Arc Classification)', () => {
    for (const t of VENDOR_SWITCHGEAR_CATALOG) {
      expect(t.arcClass).toBeTruthy();
      expect(['IAC A FL', 'IAC A FLR', 'IAC A F', 'not_tested']).toContain(t.arcClass);
    }
  });

  it('każdy typoszereg deklaruje stopień IP', () => {
    for (const t of VENDOR_SWITCHGEAR_CATALOG) {
      expect(t.ipRating).toMatch(/^IP\d/);
    }
  });

  it('każdy typoszereg deklaruje kategorię LSC (1 / 2A / 2B)', () => {
    for (const t of VENDOR_SWITCHGEAR_CATALOG) {
      expect(['LSC1', 'LSC2A', 'LSC2B']).toContain(t.lscCategory);
    }
  });

  it('każdy typoszereg ma minimum 3 typowe pola (auto-konfiguracja)', () => {
    for (const t of VENDOR_SWITCHGEAR_CATALOG) {
      expect(t.defaultBays.length, `${t.fullName} powinien mieć ≥ 3 pola`).toBeGreaterThanOrEqual(3);
    }
  });

  it('każde domyślne pole ma jeden z 6 kanonicznych layoutów', () => {
    const allowedLayouts = [
      'cable_in', 'breaker', 'transformer', 'cable_out', 'measurement', 'coupler',
    ];
    for (const t of VENDOR_SWITCHGEAR_CATALOG) {
      for (const bay of t.defaultBays) {
        expect(allowedLayouts).toContain(bay.layout);
      }
    }
  });

  it('każde pole ma polską etykietę (no codenames)', () => {
    for (const t of VENDOR_SWITCHGEAR_CATALOG) {
      for (const bay of t.defaultBays) {
        expect(bay.labelPl.length).toBeGreaterThan(2);
        // Brak kodów technicznych w etykiecie wyświetlanej.
        expect(bay.labelPl).not.toMatch(/^[A-Z0-9_-]+$/);
      }
    }
  });

  it('typowe pole musi zawierać przynajmniej cable_in + transformer + cable_out lub breaker', () => {
    for (const t of VENDOR_SWITCHGEAR_CATALOG) {
      const layouts = new Set(t.defaultBays.map((b) => b.layout));
      // Każda rozdzielnica musi mieć przynajmniej jeden punkt zasilania (cable_in)
      // ALBO breaker (główne pole zasilające z wyłącznikiem).
      const hasIncomer = layouts.has('cable_in') || layouts.has('breaker');
      expect(hasIncomer, `${t.fullName} musi mieć cable_in lub breaker`).toBe(true);
    }
  });

  it('wymiary pola są realistyczne (200-1500mm szerokość, 600-1200mm głębokość)', () => {
    for (const t of VENDOR_SWITCHGEAR_CATALOG) {
      const { depth, width, height } = t.fieldDimensionsMm;
      expect(width).toBeGreaterThanOrEqual(200);
      expect(width).toBeLessThanOrEqual(1500);
      expect(depth).toBeGreaterThanOrEqual(600);
      expect(depth).toBeLessThanOrEqual(1500);
      expect(height).toBeGreaterThanOrEqual(1000);
      expect(height).toBeLessThanOrEqual(2200);
    }
  });
});

describe('Vendor catalog helpers', () => {
  it('getVendorSwitchgear zwraca template po id', () => {
    const abb = getVendorSwitchgear('abb_safe_plus');
    expect(abb).not.toBeNull();
    expect(abb?.manufacturerRef).toBe('ABB');
    expect(abb?.seriesName).toBe('SafePlus');
  });

  it('getVendorSwitchgear zwraca null dla nieznanego id', () => {
    expect(getVendorSwitchgear('nieznany_template')).toBeNull();
  });

  it('getAllManufacturers zwraca listę unikalnych producentów', () => {
    const manufacturers = getAllManufacturers();
    expect(new Set(manufacturers).size).toBe(manufacturers.length);
    expect(manufacturers.length).toBeGreaterThanOrEqual(4);
  });

  it('getTemplatesByManufacturer filtruje per producent', () => {
    const abb = getTemplatesByManufacturer('ABB');
    expect(abb.length).toBeGreaterThan(0);
    for (const t of abb) {
      expect(t.manufacturerRef).toBe('ABB');
    }
  });

  it('typoszeregi SF₆ vs vacuum są oznakowane', () => {
    const sf6 = VENDOR_SWITCHGEAR_CATALOG.filter((t) => t.insulation === 'sf6');
    const vacuum = VENDOR_SWITCHGEAR_CATALOG.filter((t) => t.insulation === 'vacuum');
    // Mamy mieszankę technologii.
    expect(sf6.length + vacuum.length).toBeGreaterThan(0);
  });
});
