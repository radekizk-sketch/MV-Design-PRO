import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCK_SCOPE_BY_SCREEN,
  EXPORT_POLICY_MATRIX,
  HELPER_SURFACE_CODES,
  HELPER_SURFACE_REGISTRY,
  ISSUE_MATRIX,
  SCREEN_CODES,
  SCREEN_MATRIX,
  SCREEN_TRANSITIONS,
  SURFACE_COMMIT_POLICY_MATRIX,
  SURFACE_REGISTRY,
} from '../types';

describe('workspace contracts V12.5', () => {
  it('covers every E-00..E-34 screen in registry, matrix and transitions', () => {
    expect(Object.keys(SURFACE_REGISTRY).sort()).toEqual([...SCREEN_CODES].sort());
    expect(Object.keys(SCREEN_MATRIX).sort()).toEqual([...SCREEN_CODES].sort());
    expect(Object.keys(SCREEN_TRANSITIONS).sort()).toEqual([...SCREEN_CODES].sort());
  });

  it('keeps registry and screen matrix metadata aligned', () => {
    for (const screenCode of SCREEN_CODES) {
      const definition = SURFACE_REGISTRY[screenCode];
      const matrixEntry = SCREEN_MATRIX[screenCode];
      const transition = SCREEN_TRANSITIONS[screenCode];

      expect(matrixEntry.titlePl).toBe(definition.titlePl);
      expect(matrixEntry.surfaceKind).toBe(definition.surfaceKind);
      expect(matrixEntry.sizeClass).toBe(definition.sizeClass);
      expect(matrixEntry.supportsMiniSld).toBe(definition.supportsMiniSld);
      expect(transition.screenCode).toBe(screenCode);
      expect(transition.invalidRouteFallback).toBeDefined();

      if (matrixEntry.allowedTabIds.length === 0) {
        expect(matrixEntry.defaultTabId).toBeNull();
      } else {
        expect(matrixEntry.defaultTabId).not.toBeNull();
        expect(matrixEntry.allowedTabIds).toContain(matrixEntry.defaultTabId);
      }

      if (matrixEntry.requiresAnalysisCaseContext) {
        expect(matrixEntry.prerequisiteCodes).toContain('analysis_case_context');
      } else {
        expect(matrixEntry.prerequisiteCodes).not.toContain('analysis_case_context');
      }
    }
  });

  it('keeps E-28..E-34 screens route-managed, read-only and analysis-context-bound', () => {
    for (const screenCode of ['E-28', 'E-29', 'E-30', 'E-31', 'E-32', 'E-33', 'E-34'] as const) {
      const matrixEntry = SCREEN_MATRIX[screenCode];
      const transition = SCREEN_TRANSITIONS[screenCode];

      expect(matrixEntry.saveMode).toBe('read_only');
      expect(matrixEntry.historyPolicy).toBe('push_new_entry');
      expect(matrixEntry.requiresAnalysisCaseContext).toBe(true);
      expect(matrixEntry.prerequisiteCodes).toContain('analysis_case_context');
      expect(transition.allowedOpenTargets).toEqual([]);
      expect(transition.invalidRouteFallback).toBe('E-06');
      expect(transition.closeReturnsTo).toBe('parent');
    }

    expect(SCREEN_TRANSITIONS['E-31'].allowedOpenFrom).toContain('case_context');
    expect(SCREEN_TRANSITIONS['E-32'].allowedOpenFrom).toContain('E-27');
  });

  it('keeps helper surfaces capability-limited and side-effect free', () => {
    expect(Object.keys(HELPER_SURFACE_REGISTRY).sort()).toEqual([...HELPER_SURFACE_CODES].sort());

    const expectedCapabilities = {
      variants_runs: ['read_context', 'select_context', 'open_canonical_surface'],
      catalog_picker: ['read_context', 'pick_catalog_item', 'open_canonical_surface'],
      catalog_admin: ['read_context', 'pick_catalog_item'],
      case_context: ['read_context', 'select_context', 'open_canonical_surface'],
      switchgear_wizard: ['read_context', 'open_canonical_surface'],
    } as const;

    for (const helperCode of HELPER_SURFACE_CODES) {
      const helper = HELPER_SURFACE_REGISTRY[helperCode];

      expect(helper.mayWriteModel).toBe(false);
      expect(helper.mayOwnResults).toBe(false);
      expect(helper.mayOwnReportState).toBe(false);
      expect(helper.allowedCapabilities).toEqual(expectedCapabilities[helperCode]);
      expect(new Set(helper.allowedCapabilities).size).toBe(helper.allowedCapabilities.length);
    }
  });

  it('keeps policy matrices pointing only at registered screens and export kinds', () => {
    const knownScreens = new Set(SCREEN_CODES);

    for (const screenCode of Object.keys(SURFACE_COMMIT_POLICY_MATRIX)) {
      expect(knownScreens.has(screenCode as (typeof SCREEN_CODES)[number])).toBe(true);
    }

    for (const screenCode of Object.keys(DEFAULT_LOCK_SCOPE_BY_SCREEN)) {
      expect(knownScreens.has(screenCode as (typeof SCREEN_CODES)[number])).toBe(true);
    }

    expect(Object.keys(EXPORT_POLICY_MATRIX).sort()).toEqual(['csv', 'docx', 'json', 'pdf', 'whitebox_package', 'xlsx']);
    expect(ISSUE_MATRIX['docs.archived_source_referenced']?.blocksReport).toBe(true);
  });

  it('keeps transition references within known screen/helper codes', () => {
    const knownTargets = new Set([...SCREEN_CODES, ...HELPER_SURFACE_CODES]);

    for (const screenCode of SCREEN_CODES) {
      const transition = SCREEN_TRANSITIONS[screenCode];
      for (const source of transition.allowedOpenFrom) {
        expect(knownTargets.has(source)).toBe(true);
      }
      for (const target of transition.allowedOpenTargets) {
        expect(knownTargets.has(target)).toBe(true);
      }
      for (const step of transition.forcedIntermediateSteps) {
        expect(knownTargets.has(step)).toBe(true);
      }
      if (transition.closeReturnsTo !== 'parent') {
        expect(knownTargets.has(transition.closeReturnsTo)).toBe(true);
      }
      expect(knownTargets.has(transition.invalidRouteFallback)).toBe(true);
    }
  });
});
