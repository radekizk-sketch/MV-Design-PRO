import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ISSUE_CODES,
} from '../../contracts/shared';
import {
  HELPER_SURFACE_CODES,
  ROUTE_ALIAS_CODES,
  SCREEN_CODES,
} from '../../contracts/frontend-shell';
import {
  ACTIVE_DOC_ROOTS,
  ACTIVE_GENERATOR_REGISTRY,
  ANALYSIS_MODULE_MATRIX,
  ARCHIVE_DOC_ROOTS,
  BENCHMARK_REGISTRY,
  DEFAULT_LOCK_SCOPE_BY_SCREEN,
  EXPORT_POLICY_MATRIX,
  HELPER_SURFACE_REGISTRY,
  ISSUE_MATRIX,
  PERFORMANCE_BUDGET_MATRIX,
  SCREEN_MATRIX,
  SCREEN_REGISTRY,
  SCREEN_TRANSITIONS,
  SURFACE_COMMIT_MATRIX,
} from '../../contracts/verification';

describe('workspace contracts V12.5', () => {
  it('covers every E-00..E-34 screen in registry, matrix and transitions', () => {
    expect(Object.keys(SCREEN_REGISTRY).sort()).toEqual([...SCREEN_CODES].sort());
    expect(Object.keys(SCREEN_MATRIX).sort()).toEqual([...SCREEN_CODES].sort());
    expect(Object.keys(SCREEN_TRANSITIONS).sort()).toEqual([...SCREEN_CODES].sort());
  });

  it('keeps registry and screen matrix metadata aligned', () => {
    for (const screenCode of SCREEN_CODES) {
      const definition = SCREEN_REGISTRY[screenCode];
      const matrixEntry = SCREEN_MATRIX[screenCode];
      const transition = SCREEN_TRANSITIONS[screenCode];

      expect(matrixEntry.titlePl).toBe(definition.titlePl);
      expect(matrixEntry.surfaceKind).toBe(definition.surfaceKind);
      expect(transition).toBeDefined();
      expect(transition.invalidRouteFallback).toBeDefined();
      expect(transition.allowedOpenFrom.length).toBeGreaterThan(0);
    }
  });

  it('keeps E-28..E-34 screens route-managed, read-only and analysis-context-bound', () => {
    for (const screenCode of ['E-28', 'E-29', 'E-30', 'E-31', 'E-32', 'E-33', 'E-34'] as const) {
      const matrixEntry = SCREEN_MATRIX[screenCode];
      const transition = SCREEN_TRANSITIONS[screenCode];
      const moduleSpec = ANALYSIS_MODULE_MATRIX[screenCode];

      expect(matrixEntry.requiresAnalysisCaseContext).toBe(true);
      expect(moduleSpec.minimumCaseInputReadinessRequired).not.toBeNull();
      expect(moduleSpec.requiredEntities.length).toBeGreaterThan(0);
      expect(moduleSpec.requiredResultFamilies.length).toBeGreaterThan(0);
      expect(moduleSpec.invalidIfMissing.length).toBeGreaterThan(0);
      expect(moduleSpec.blocksReportProfiles.length).toBeGreaterThan(0);
      expect(transition.closeReturnsTo).toBeTruthy();
    }
  });

  it('keeps helper surfaces capability-limited and side-effect free', () => {
    expect(Object.keys(HELPER_SURFACE_REGISTRY).sort()).toEqual([...HELPER_SURFACE_CODES].sort());

    const expectedCapabilities = {
      variants_runs: ['read_context', 'select_context', 'open_canonical_surface'],
      catalog_picker: ['read_context', 'pick_catalog_item', 'open_canonical_surface'],
      catalog_admin: ['read_context', 'pick_catalog_item'],
      case_context: ['read_context', 'select_context', 'open_canonical_surface'],
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

  it('keeps canonical titles, helper labels and shell aliases separated', () => {
    expect(SCREEN_REGISTRY['E-07'].titlePl).toBe('Zakres i warunki obliczeń');
    expect(SCREEN_REGISTRY['E-09'].titlePl).toBe('Historia modelu i obliczeń');
    expect(SCREEN_REGISTRY['E-12'].titlePl).toBe('Stacja transformatorowa - widok podstawowy');
    expect(HELPER_SURFACE_REGISTRY.variants_runs.titlePl).toBe('Zakresy obliczeń i wyniki');
    expect(HELPER_SURFACE_REGISTRY.case_context.titlePl).toBe('Warunki obliczeń');
    expect(ROUTE_ALIAS_CODES).toEqual(['sld', 'network_build', 'analysis', 'report']);
    expect(HELPER_SURFACE_CODES).not.toContain('sld');
    expect(HELPER_SURFACE_CODES).not.toContain('analysis' as never);
  });

  it('keeps policy matrices pointing only at registered screens and export kinds', () => {
    const knownScreens = new Set(SCREEN_CODES);

    for (const screenCode of Object.keys(SURFACE_COMMIT_MATRIX)) {
      expect(knownScreens.has(screenCode as (typeof SCREEN_CODES)[number])).toBe(true);
    }

    for (const screenCode of Object.keys(DEFAULT_LOCK_SCOPE_BY_SCREEN)) {
      expect(knownScreens.has(screenCode as (typeof SCREEN_CODES)[number])).toBe(true);
    }

    expect(Object.keys(EXPORT_POLICY_MATRIX).sort()).toEqual(['csv', 'docx', 'json', 'pdf', 'whitebox_package', 'xlsx']);
    expect(Object.keys(ISSUE_MATRIX).sort()).toEqual([...CANONICAL_ISSUE_CODES].sort());
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
      expect(transition.invalidRouteFallback).toBeDefined();
    }
  });

  it('keeps docs, generators, budgets and benchmarks aligned with the hard cut', () => {
    expect(ACTIVE_DOC_ROOTS).not.toContain('docs/spec');
    expect(ARCHIVE_DOC_ROOTS).toContain('docs/spec');
    expect(Object.keys(ACTIVE_GENERATOR_REGISTRY).sort()).toEqual([
      'export_pipeline',
      'report_generator',
      'verification_runner',
      'whitebox_renderer',
    ]);
    expect(Object.keys(BENCHMARK_REGISTRY).sort()).toEqual(['cigre_mv_der', 'mv_oberrhein_radial']);
    expect(Object.values(PERFORMANCE_BUDGET_MATRIX).every((entry) => entry.threshold > 0)).toBe(true);
  });
});
