/**
 * domainOps tests (R53) — weryfikacja whitelist kanonicznych operacji.
 *
 * Bug #1 z R53: brakowało 4 nowych ops w CANONICAL_OPERATION_NAMES,
 * przez co wizard wywołania (executeDomainOperation) ZAWSZE szły fallback'iem.
 * Backend ops R49-R50 były nieużyteczne.
 *
 * Te testy są bramą regresji.
 */

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_OPERATION_NAMES,
  isCanonicalOpName,
  assertCanonicalOpName,
} from '../domainOps';

describe('domainOps canonical names whitelist (R53 Bug #1 fix)', () => {
  describe('R49+R50 ops zarejestrowane jako canonical', () => {
    it('create_station_complete jest canonical (Wizard E-13 mode=create)', () => {
      expect(isCanonicalOpName('create_station_complete')).toBe(true);
      expect(CANONICAL_OPERATION_NAMES).toContain('create_station_complete');
    });

    it('update_station_complete jest canonical (Wizard E-13 mode=edit)', () => {
      expect(isCanonicalOpName('update_station_complete')).toBe(true);
      expect(CANONICAL_OPERATION_NAMES).toContain('update_station_complete');
    });

    it('configure_bay jest canonical (E-11 BayEditor)', () => {
      expect(isCanonicalOpName('configure_bay')).toBe(true);
      expect(CANONICAL_OPERATION_NAMES).toContain('configure_bay');
    });

    it('configure_cable jest canonical (E-12 LineSegmentInline)', () => {
      expect(isCanonicalOpName('configure_cable')).toBe(true);
      expect(CANONICAL_OPERATION_NAMES).toContain('configure_cable');
    });

    it('assertCanonicalOpName NIE rzuca dla 4 nowych ops', () => {
      expect(() => assertCanonicalOpName('create_station_complete')).not.toThrow();
      expect(() => assertCanonicalOpName('update_station_complete')).not.toThrow();
      expect(() => assertCanonicalOpName('configure_bay')).not.toThrow();
      expect(() => assertCanonicalOpName('configure_cable')).not.toThrow();
    });
  });

  describe('Niekanoniczne nazwy nadal odrzucane', () => {
    it('Wymyślona nazwa rzuca exception', () => {
      expect(() => assertCanonicalOpName('totally_made_up_op')).toThrow(/Niekanoniczna/);
    });

    it('Kebab-case wariant odrzucony (R49 fix: musi być snake_case)', () => {
      expect(isCanonicalOpName('create-station-complete')).toBe(false);
      expect(isCanonicalOpName('configure-bay')).toBe(false);
    });
  });

  describe('Wszystkie 26 oryginalnych ops zachowane (regresja)', () => {
    it('zachowano add_grid_source_sn, continue_trunk, etc.', () => {
      const expectedExisting = [
        'add_grid_source_sn',
        'add_sn_bay',
        'continue_trunk_segment_sn',
        'insert_station_on_segment_sn',
        'insert_branch_pole_on_segment_sn',
        'add_transformer_sn_nn',
        'assign_catalog_to_element',
        'add_converter_source',
        'add_ct',
        'add_vt',
        'add_relay',
        'delete_element',
        'refresh_snapshot',
      ];
      for (const op of expectedExisting) {
        expect(isCanonicalOpName(op)).toBe(true);
      }
    });

    it('Liczba kanonicznych ops to 26 oryginalnych + 4 nowych = 30', () => {
      expect(CANONICAL_OPERATION_NAMES.length).toBe(30);
    });
  });
});
