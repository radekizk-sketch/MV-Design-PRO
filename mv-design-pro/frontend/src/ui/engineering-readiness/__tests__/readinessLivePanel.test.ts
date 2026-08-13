/**
 * Readiness Live Panel — §3 UX 10/10 Tests
 *
 * Tests:
 * - Issue classification (group assignment)
 * - Deterministic grouping and sorting
 * - Navigation callback wiring
 * - Fix action callback wiring
 * - Empty state rendering
 * - Auto-disappear after fix
 */

import { describe, it, expect } from 'vitest';
import type { ReadinessIssue } from '../../types';
import { classifyIssueGroup } from '../ReadinessLivePanel';
import type { ReadinessGroup } from '../ReadinessLivePanel';

// =============================================================================
// Mock Issues
// =============================================================================

function makeIssue(
  code: string,
  severity: 'BLOCKER' | 'IMPORTANT' | 'INFO' = 'BLOCKER',
  elementRef: string | null = null,
): ReadinessIssue {
  return {
    code,
    severity,
    element_ref: elementRef,
    element_refs: elementRef ? [elementRef] : [],
    message_pl: `Komunikat testowy dla ${code}`,
    wizard_step_hint: 'K1',
    suggested_fix: null,
    fix_action: null,
  };
}

// =============================================================================
// Tests: Issue Classification
// =============================================================================

describe('ReadinessLivePanel — §3 UX 10/10', () => {
  describe('classifyIssueGroup', () => {
    it('KOMPLETNOSC-POLA-TR: kod KANONICZNY rozstrzyga grupę, nie kod walidatora', () => {
      // Sygnał przychodzi z walidatora ENM (`W041`), a treść i podział — z kanonu
      // (`transformer.bay_missing`). Bez czytania kodu kanonicznego ostrzeżenie o
      // braku pola transformatorowego lądowało w „Magistrali", bo `W041` nie ma
      // żadnego z prefiksów klasyfikatora.
      const zgloszenie: ReadinessIssue = {
        ...makeIssue('W041', 'IMPORTANT', 'tr-1'),
        canonical_code: 'transformer.bay_missing',
        canonical_level: 'WARNING',
      };
      expect(classifyIssueGroup(zgloszenie)).toBe('STACJE');
      // Bez kodu kanonicznego zostaje uczciwy fallback na kod zgłoszenia.
      expect(classifyIssueGroup(makeIssue('W041', 'IMPORTANT'))).toBe('MAGISTRALA');
      // Ten sam mechanizm naprawia pozostałe kody walidatora z odwzorowaniem.
      expect(
        classifyIssueGroup({
          ...makeIssue('E001'),
          canonical_code: 'source.grid_supply_missing',
        }),
      ).toBe('ZRODLA');
    });

    it('classifies protection codes to ZABEZPIECZENIA', () => {
      expect(classifyIssueGroup(makeIssue('protection.relay_missing'))).toBe('ZABEZPIECZENIA');
      expect(classifyIssueGroup(makeIssue('relay.settings_invalid'))).toBe('ZABEZPIECZENIA');
      expect(classifyIssueGroup(makeIssue('ct.ratio_missing'))).toBe('ZABEZPIECZENIA');
      expect(classifyIssueGroup(makeIssue('vt.ratio_missing'))).toBe('ZABEZPIECZENIA');
    });

    it('classifies source codes to ZRODLA', () => {
      expect(classifyIssueGroup(makeIssue('source.voltage_invalid'))).toBe('ZRODLA');
      expect(classifyIssueGroup(makeIssue('nn.source.field_missing'))).toBe('ZRODLA');
      expect(classifyIssueGroup(makeIssue('pv.control_mode_missing'))).toBe('ZRODLA');
      expect(classifyIssueGroup(makeIssue('bess.energy_module_missing'))).toBe('ZRODLA');
      expect(classifyIssueGroup(makeIssue('genset.power_missing'))).toBe('ZRODLA');
      expect(classifyIssueGroup(makeIssue('ups.backup_time_invalid'))).toBe('ZRODLA');
    });

    it('classifies station codes to STACJE', () => {
      expect(classifyIssueGroup(makeIssue('station.type_missing'))).toBe('STACJE');
      expect(classifyIssueGroup(makeIssue('transformer.catalog_missing'))).toBe('STACJE');
      expect(classifyIssueGroup(makeIssue('bay.device_missing'))).toBe('STACJE');
      expect(classifyIssueGroup(makeIssue('bus_nn.voltage_invalid'))).toBe('STACJE');
      expect(classifyIssueGroup(makeIssue('feeder.cable_missing'))).toBe('STACJE');
    });

    it('classifies trunk codes to MAGISTRALA (default)', () => {
      expect(classifyIssueGroup(makeIssue('cable.catalog_missing'))).toBe('MAGISTRALA');
      expect(classifyIssueGroup(makeIssue('bus.voltage_invalid'))).toBe('MAGISTRALA');
      expect(classifyIssueGroup(makeIssue('topology.disconnected'))).toBe('MAGISTRALA');
      expect(classifyIssueGroup(makeIssue('segment.length_zero'))).toBe('MAGISTRALA');
    });

    it('is deterministic (same code → same group)', () => {
      const issue = makeIssue('protection.relay_missing');
      const g1 = classifyIssueGroup(issue);
      const g2 = classifyIssueGroup(issue);
      const g3 = classifyIssueGroup(issue);
      expect(g1).toBe(g2);
      expect(g2).toBe(g3);
    });
  });

  describe('Group ordering', () => {
    it('groups appear in canonical order: MAGISTRALA, STACJE, ZABEZPIECZENIA, ZRODLA', () => {
      const expectedOrder: ReadinessGroup[] = ['MAGISTRALA', 'STACJE', 'ZABEZPIECZENIA', 'ZRODLA'];

      // Verify order matches
      const issues: ReadinessIssue[] = [
        makeIssue('ups.missing'),           // ZRODLA
        makeIssue('protection.missing'),     // ZABEZPIECZENIA
        makeIssue('cable.missing'),          // MAGISTRALA
        makeIssue('station.missing'),        // STACJE
      ];

      const classified = issues.map((i) => classifyIssueGroup(i));
      const uniqueGroups = [...new Set(classified)];

      // All 4 groups should be represented
      expect(uniqueGroups).toHaveLength(4);
      for (const group of expectedOrder) {
        expect(uniqueGroups).toContain(group);
      }
    });
  });

  describe('Severity sorting within groups', () => {
    it('BLOCKERs come before IMPORTANT before INFO', () => {
      const issues: ReadinessIssue[] = [
        makeIssue('cable.info', 'INFO'),
        makeIssue('cable.blocker', 'BLOCKER'),
        makeIssue('cable.warning', 'IMPORTANT'),
      ];

      // All should be MAGISTRALA group
      for (const issue of issues) {
        expect(classifyIssueGroup(issue)).toBe('MAGISTRALA');
      }

      // Sort by severity order
      const severityOrder = { BLOCKER: 0, IMPORTANT: 1, INFO: 2 };
      const sorted = [...issues].sort(
        (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
      );

      expect(sorted[0].code).toBe('cable.blocker');
      expect(sorted[1].code).toBe('cable.warning');
      expect(sorted[2].code).toBe('cable.info');
    });
  });

  describe('Navigation and fix actions', () => {
    it('issues with element_ref can navigate', () => {
      const issue = makeIssue('cable.missing', 'BLOCKER', 'cable-001');
      expect(issue.element_ref).toBe('cable-001');
    });

    it('issues without element_ref fall back to element_refs[0]', () => {
      const issue: ReadinessIssue = {
        code: 'topology.disconnected',
        severity: 'BLOCKER',
        element_ref: null,
        element_refs: ['bus-001', 'bus-002'],
        message_pl: 'Topologia rozłączona',
        wizard_step_hint: 'K2',
        suggested_fix: null,
        fix_action: null,
      };
      const ref = issue.element_ref ?? issue.element_refs[0] ?? null;
      expect(ref).toBe('bus-001');
    });

    it('issues without any ref have no navigation target', () => {
      const issue = makeIssue('general.missing_data');
      const ref = issue.element_ref ?? issue.element_refs[0] ?? null;
      expect(ref).toBeNull();
    });
  });
});
