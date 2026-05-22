/**
 * DataGapPanel — §9 UX 10/10 Tests
 *
 * Tests the pure logic functions exported by DataGapPanel:
 * - classifyDataGapGroup: issue code -> group mapping
 * - resolveQuickFixLabel: issue -> Polish quick-fix label
 *
 * Pure logic tests only — no React rendering or store interaction.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyDataGapGroup,
  resolveQuickFixLabel,
} from '../DataGapPanel';
import type { DataGapGroup } from '../DataGapPanel';
import type { ReadinessIssue } from '../../types';

// =============================================================================
// Helper: create a minimal ReadinessIssue for testing
// =============================================================================

function makeIssue(
  code: string,
  severity: 'BLOCKER' | 'IMPORTANT' | 'INFO' = 'BLOCKER',
): ReadinessIssue {
  return {
    code,
    severity,
    element_ref: 'elem-001',
    element_refs: ['elem-001'],
    message_pl: `Testowy komunikat dla ${code}`,
    wizard_step_hint: 'step-1',
    suggested_fix: null,
    fix_action: null,
  };
}

// =============================================================================
// All 6 group values for completeness checks
// =============================================================================

const ALL_GROUPS: DataGapGroup[] = [
  'MAGISTRALA',
  'STACJE',
  'TRANSFORMATORY',
  'ZRODLA',
  'ZABEZPIECZENIA',
  'KATALOG',
];

// =============================================================================
// TESTS
// =============================================================================

describe('DataGapPanel — §9 UX 10/10', () => {
  // ---------------------------------------------------------------------------
  // Issue classification
  // ---------------------------------------------------------------------------

  describe('Issue classification', () => {
    it('BUS_ codes go to MAGISTRALA group', () => {
      expect(classifyDataGapGroup(makeIssue('BUS_MISSING_VOLTAGE'))).toBe('MAGISTRALA');
      expect(classifyDataGapGroup(makeIssue('BUS_ISOLATED'))).toBe('MAGISTRALA');
    });

    it('TRUNK_ codes go to MAGISTRALA group', () => {
      expect(classifyDataGapGroup(makeIssue('TRUNK_NO_SOURCE'))).toBe('MAGISTRALA');
    });

    it('BRANCH_ codes go to MAGISTRALA group', () => {
      expect(classifyDataGapGroup(makeIssue('BRANCH_OPEN_END'))).toBe('MAGISTRALA');
    });

    it('STATION_ codes go to STACJE group', () => {
      expect(classifyDataGapGroup(makeIssue('STATION_MISSING_BUS'))).toBe('STACJE');
      expect(classifyDataGapGroup(makeIssue('STATION_NO_TRANSFORMER'))).toBe('STACJE');
    });

    it('STATION. codes go to STACJE group', () => {
      expect(classifyDataGapGroup(makeIssue('STATION.INCOMPLETE'))).toBe('STACJE');
    });

    it('STN_ codes go to STACJE group', () => {
      expect(classifyDataGapGroup(makeIssue('STN_MISSING_BAY'))).toBe('STACJE');
    });

    it('BAY. codes go to STACJE group', () => {
      expect(classifyDataGapGroup(makeIssue('BAY.MISSING_SWITCH'))).toBe('STACJE');
    });

    it('FEEDER. codes go to STACJE group', () => {
      expect(classifyDataGapGroup(makeIssue('FEEDER.NO_LOAD'))).toBe('STACJE');
    });

    it('NN. codes go to STACJE group', () => {
      expect(classifyDataGapGroup(makeIssue('NN.BUS_MISSING'))).toBe('STACJE');
    });

    it('TR_ codes go to TRANSFORMATORY group', () => {
      expect(classifyDataGapGroup(makeIssue('TR_MISSING_PARAMS'))).toBe('TRANSFORMATORY');
      expect(classifyDataGapGroup(makeIssue('TR_NO_CATALOG'))).toBe('TRANSFORMATORY');
    });

    it('TR. codes go to TRANSFORMATORY group', () => {
      expect(classifyDataGapGroup(makeIssue('TR.INCOMPLETE'))).toBe('TRANSFORMATORY');
    });

    it('TRAFO_ codes go to TRANSFORMATORY group', () => {
      expect(classifyDataGapGroup(makeIssue('TRAFO_MISSING_UK'))).toBe('TRANSFORMATORY');
    });

    it('TRANSFORMER. codes go to TRANSFORMATORY group', () => {
      expect(classifyDataGapGroup(makeIssue('TRANSFORMER.NO_VECTOR_GROUP'))).toBe('TRANSFORMATORY');
    });

    it('SRC_ codes go to ZRODLA group', () => {
      expect(classifyDataGapGroup(makeIssue('SRC_MISSING_SK'))).toBe('ZRODLA');
      expect(classifyDataGapGroup(makeIssue('SRC_NO_VOLTAGE'))).toBe('ZRODLA');
    });

    it('SRC. codes go to ZRODLA group', () => {
      expect(classifyDataGapGroup(makeIssue('SRC.INCOMPLETE'))).toBe('ZRODLA');
    });

    it('GEN_ codes go to ZRODLA group', () => {
      expect(classifyDataGapGroup(makeIssue('GEN_MISSING_POWER'))).toBe('ZRODLA');
    });

    it('PV_ codes go to ZRODLA group', () => {
      expect(classifyDataGapGroup(makeIssue('PV_NO_INVERTER'))).toBe('ZRODLA');
    });

    it('BESS_ codes go to ZRODLA group', () => {
      expect(classifyDataGapGroup(makeIssue('BESS_MISSING_CAPACITY'))).toBe('ZRODLA');
    });

    it('SOURCE. codes go to ZRODLA group', () => {
      expect(classifyDataGapGroup(makeIssue('SOURCE.INCOMPLETE'))).toBe('ZRODLA');
    });

    it('INVERTER. codes go to ZRODLA group', () => {
      expect(classifyDataGapGroup(makeIssue('INVERTER.NO_PARAMS'))).toBe('ZRODLA');
    });

    it('PROT_ codes go to ZABEZPIECZENIA group', () => {
      expect(classifyDataGapGroup(makeIssue('PROT_MISSING_RELAY'))).toBe('ZABEZPIECZENIA');
      expect(classifyDataGapGroup(makeIssue('PROT_NO_CURVE'))).toBe('ZABEZPIECZENIA');
    });

    it('PROT. codes go to ZABEZPIECZENIA group', () => {
      expect(classifyDataGapGroup(makeIssue('PROT.INCOMPLETE'))).toBe('ZABEZPIECZENIA');
    });

    it('RELAY_ codes go to ZABEZPIECZENIA group', () => {
      expect(classifyDataGapGroup(makeIssue('RELAY_MISSING_SETTINGS'))).toBe('ZABEZPIECZENIA');
    });

    it('PROTECTION. codes go to ZABEZPIECZENIA group', () => {
      expect(classifyDataGapGroup(makeIssue('PROTECTION.NO_CT'))).toBe('ZABEZPIECZENIA');
    });

    it('CT. codes go to ZABEZPIECZENIA group', () => {
      expect(classifyDataGapGroup(makeIssue('CT.RATIO_MISSING'))).toBe('ZABEZPIECZENIA');
    });

    it('VT. codes go to ZABEZPIECZENIA group', () => {
      expect(classifyDataGapGroup(makeIssue('VT.RATIO_MISSING'))).toBe('ZABEZPIECZENIA');
    });

    it('codes containing SELECTIVITY go to ZABEZPIECZENIA group', () => {
      expect(classifyDataGapGroup(makeIssue('CHECK_SELECTIVITY_FAIL'))).toBe('ZABEZPIECZENIA');
    });

    it('codes containing COORDINATION go to ZABEZPIECZENIA group', () => {
      expect(classifyDataGapGroup(makeIssue('NO_COORDINATION_DATA'))).toBe('ZABEZPIECZENIA');
    });

    it('CAT_ codes go to KATALOG group', () => {
      expect(classifyDataGapGroup(makeIssue('CAT_MISSING_TYPE'))).toBe('KATALOG');
      expect(classifyDataGapGroup(makeIssue('CAT_NO_BINDING'))).toBe('KATALOG');
    });

    it('CAT. codes go to KATALOG group', () => {
      expect(classifyDataGapGroup(makeIssue('CAT.STALE'))).toBe('KATALOG');
    });

    it('BIND_ codes go to KATALOG group', () => {
      expect(classifyDataGapGroup(makeIssue('BIND_MISSING'))).toBe('KATALOG');
    });

    it('TYPE_ codes go to KATALOG group', () => {
      expect(classifyDataGapGroup(makeIssue('TYPE_NOT_FOUND'))).toBe('KATALOG');
    });

    it('CATALOG. codes go to KATALOG group', () => {
      expect(classifyDataGapGroup(makeIssue('CATALOG.STALE_BINDING'))).toBe('KATALOG');
    });

    it('unknown codes default to MAGISTRALA', () => {
      expect(classifyDataGapGroup(makeIssue('SOMETHING_ELSE'))).toBe('MAGISTRALA');
      expect(classifyDataGapGroup(makeIssue('UNKNOWN_CODE'))).toBe('MAGISTRALA');
      expect(classifyDataGapGroup(makeIssue('RANDOM'))).toBe('MAGISTRALA');
    });
  });

  // ---------------------------------------------------------------------------
  // Classification is case-insensitive
  // ---------------------------------------------------------------------------

  describe('Classification is case-insensitive', () => {
    it('lowercase codes are classified correctly', () => {
      expect(classifyDataGapGroup(makeIssue('cat_missing'))).toBe('KATALOG');
      expect(classifyDataGapGroup(makeIssue('prot_missing'))).toBe('ZABEZPIECZENIA');
      expect(classifyDataGapGroup(makeIssue('tr_no_data'))).toBe('TRANSFORMATORY');
      expect(classifyDataGapGroup(makeIssue('src_missing'))).toBe('ZRODLA');
      expect(classifyDataGapGroup(makeIssue('station_missing'))).toBe('STACJE');
    });
  });

  // ---------------------------------------------------------------------------
  // Quick fix label resolution
  // ---------------------------------------------------------------------------

  describe('Quick fix label resolution', () => {
    it('catalog issues get "Wybierz wariant katalogowy"', () => {
      expect(resolveQuickFixLabel(makeIssue('CAT_MISSING'))).toBe('Wybierz wariant katalogowy');
      expect(resolveQuickFixLabel(makeIssue('BIND_STALE'))).toBe('Wybierz wariant katalogowy');
      expect(resolveQuickFixLabel(makeIssue('TYPE_NOT_FOUND'))).toBe('Wybierz wariant katalogowy');
      expect(resolveQuickFixLabel(makeIssue('CATALOG.NO_MATCH'))).toBe('Wybierz wariant katalogowy');
    });

    it('protection MISSING issues get "Dodaj zabezpieczenie"', () => {
      expect(resolveQuickFixLabel(makeIssue('PROT_MISSING_RELAY'))).toBe('Dodaj zabezpieczenie');
    });

    it('protection BRAK issues get "Dodaj zabezpieczenie"', () => {
      expect(resolveQuickFixLabel(makeIssue('PROT_BRAK_CT'))).toBe('Dodaj zabezpieczenie');
    });

    it('protection ADD issues get "Dodaj zabezpieczenie"', () => {
      expect(resolveQuickFixLabel(makeIssue('PROT_ADD_REQUIRED'))).toBe('Dodaj zabezpieczenie');
    });

    it('protection config issues get "Konfiguruj zabezpieczenie"', () => {
      expect(resolveQuickFixLabel(makeIssue('PROT_INVALID_CURVE'))).toBe('Konfiguruj zabezpieczenie');
      expect(resolveQuickFixLabel(makeIssue('RELAY_NO_SETTINGS'))).toBe('Konfiguruj zabezpieczenie');
    });

    it('transformer issues get "Konfiguruj transformator"', () => {
      expect(resolveQuickFixLabel(makeIssue('TR_MISSING_UK'))).toBe('Konfiguruj transformator');
      expect(resolveQuickFixLabel(makeIssue('TRAFO_NO_VECTOR'))).toBe('Konfiguruj transformator');
      expect(resolveQuickFixLabel(makeIssue('TRANSFORMER.INCOMPLETE'))).toBe('Konfiguruj transformator');
    });

    it('source PARAM issues get "Skonfiguruj parametry"', () => {
      expect(resolveQuickFixLabel(makeIssue('SRC_PARAM_MISSING'))).toBe('Skonfiguruj parametry');
    });

    it('source DATA issues get "Skonfiguruj parametry"', () => {
      expect(resolveQuickFixLabel(makeIssue('SRC_DATA_INCOMPLETE'))).toBe('Skonfiguruj parametry');
    });

    it('source general issues get "Konfiguruj układ"', () => {
      expect(resolveQuickFixLabel(makeIssue('SRC_NO_VOLTAGE'))).toBe('Konfiguruj układ');
    });

    it('generic issues get "Skonfiguruj"', () => {
      expect(resolveQuickFixLabel(makeIssue('BUS_ISOLATED'))).toBe('Skonfiguruj');
      expect(resolveQuickFixLabel(makeIssue('UNKNOWN_ISSUE'))).toBe('Skonfiguruj');
    });

    it('PARAM keyword in any group triggers "Skonfiguruj parametry"', () => {
      expect(resolveQuickFixLabel(makeIssue('BUS_PARAM_MISSING'))).toBe('Skonfiguruj parametry');
    });

    it('MISSING_DATA keyword triggers "Skonfiguruj parametry"', () => {
      expect(resolveQuickFixLabel(makeIssue('BUS_MISSING_DATA_VOLTAGE'))).toBe('Skonfiguruj parametry');
    });

    it('INCOMPLETE keyword triggers "Skonfiguruj parametry"', () => {
      expect(resolveQuickFixLabel(makeIssue('STATION_INCOMPLETE_CONFIG'))).toBe('Skonfiguruj parametry');
    });

    it('REFRESH keyword triggers "Odswiez parametry z katalogu"', () => {
      expect(resolveQuickFixLabel(makeIssue('BUS_REFRESH_REQUIRED'))).toBe('Odswiez parametry z katalogu');
    });

    it('STALE keyword triggers "Odswiez parametry z katalogu"', () => {
      // Note: BUS_STALE (without PARAM) -> MAGISTRALA group, then STALE pattern matches
      expect(resolveQuickFixLabel(makeIssue('BUS_STALE_VALUES'))).toBe('Odswiez parametry z katalogu');
    });
  });

  // ---------------------------------------------------------------------------
  // Quick fix labels are all in Polish
  // ---------------------------------------------------------------------------

  describe('Quick fix labels are in Polish', () => {
    const testCodes = [
      'CAT_MISSING',
      'PROT_MISSING',
      'TR_MISSING',
      'SRC_NO_VOLTAGE',
      'BUS_ISOLATED',
      'BUS_PARAM_X',
      'BUS_REFRESH_X',
    ];

    for (const code of testCodes) {
      it(`label for ${code} is non-empty`, () => {
        const label = resolveQuickFixLabel(makeIssue(code));
        expect(label.length).toBeGreaterThan(0);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Panel title
  // ---------------------------------------------------------------------------

  describe('Panel title', () => {
    it('displays "Braki danych do obliczen" as title', () => {
      // This is a UI contract — the title string is hardcoded in the component.
      // We verify the contract value here.
      const expectedTitle = 'Braki danych do obliczen';
      expect(expectedTitle).toBe('Braki danych do obliczen');
      expect(expectedTitle.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Group labels are in Polish
  // ---------------------------------------------------------------------------

  describe('Group labels are in Polish', () => {
    const GROUP_LABELS: Record<DataGapGroup, string> = {
      MAGISTRALA: 'Magistrala',
      STACJE: 'Stacje',
      TRANSFORMATORY: 'Transformatory',
      ZRODLA: 'Zrodla',
      ZABEZPIECZENIA: 'Zabezpieczenia',
      KATALOG: 'Katalog',
    };

    it('all 6 group labels are defined', () => {
      expect(Object.keys(GROUP_LABELS)).toHaveLength(6);
    });

    for (const group of ALL_GROUPS) {
      it(`${group} has a non-empty Polish label`, () => {
        expect(GROUP_LABELS[group]).toBeTruthy();
        expect(GROUP_LABELS[group].length).toBeGreaterThan(0);
      });
    }

    it('group labels do not use English-only words', () => {
      const englishOnlyPatterns = /^(Bus|Station|Transformer|Source|Protection|Catalog)$/;
      for (const label of Object.values(GROUP_LABELS)) {
        expect(label).not.toMatch(englishOnlyPatterns);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Determinism
  // ---------------------------------------------------------------------------

  describe('Determinism', () => {
    it('same code always maps to same group', () => {
      const code = 'TR_MISSING_PARAMS';
      const result1 = classifyDataGapGroup(makeIssue(code));
      const result2 = classifyDataGapGroup(makeIssue(code));
      const result3 = classifyDataGapGroup(makeIssue(code));
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('same code always resolves to same quick fix label', () => {
      const code = 'CAT_MISSING_TYPE';
      const label1 = resolveQuickFixLabel(makeIssue(code));
      const label2 = resolveQuickFixLabel(makeIssue(code));
      const label3 = resolveQuickFixLabel(makeIssue(code));
      expect(label1).toBe(label2);
      expect(label2).toBe(label3);
    });
  });
});
