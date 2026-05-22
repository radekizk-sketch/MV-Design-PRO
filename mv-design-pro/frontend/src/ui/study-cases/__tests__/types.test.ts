/**
 * Study Cases Types Tests
 *
 * Tests for type constants, default values, and label mappings.
 * Validates:
 * - DEFAULT_STUDY_CASE_CONFIG contains valid IEC 60909 defaults
 * - RESULT_STATUS_LABELS covers all status values
 * - RESULT_STATUS_TOOLTIPS covers all status values
 * - CONFIG_FIELD_LABELS covers all config fields
 * - ANALYSIS_TYPE_LABELS covers all analysis types
 * - RUN_STATUS_LABELS and RUN_STATUS_COLORS cover all run statuses
 * - Polish labels are present (non-empty strings)
 * - No project codenames in labels
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STUDY_CASE_CONFIG,
  RESULT_STATUS_LABELS,
  RESULT_STATUS_TOOLTIPS,
  CONFIG_FIELD_LABELS,
  ANALYSIS_TYPE_LABELS,
  RUN_STATUS_LABELS,
  RUN_STATUS_COLORS,
} from '../types';
import type {
  StudyCaseConfig,
  StudyCaseResultStatus,
  ExecutionAnalysisType,
  RunStatus,
} from '../types';

// ---------------------------------------------------------------------------
// DEFAULT_STUDY_CASE_CONFIG
// ---------------------------------------------------------------------------

describe('DEFAULT_STUDY_CASE_CONFIG', () => {
  it('should have valid c_factor_max for IEC 60909', () => {
    // IEC 60909: c_max = 1.10 for MV networks
    expect(DEFAULT_STUDY_CASE_CONFIG.c_factor_max).toBe(1.10);
  });

  it('should have valid c_factor_min for IEC 60909', () => {
    // IEC 60909: c_min = 0.95 for MV networks
    expect(DEFAULT_STUDY_CASE_CONFIG.c_factor_min).toBe(0.95);
  });

  it('should have standard base MVA', () => {
    expect(DEFAULT_STUDY_CASE_CONFIG.base_mva).toBe(100.0);
  });

  it('should have reasonable max iterations', () => {
    expect(DEFAULT_STUDY_CASE_CONFIG.max_iterations).toBeGreaterThan(0);
    expect(DEFAULT_STUDY_CASE_CONFIG.max_iterations).toBeLessThanOrEqual(1000);
  });

  it('should have positive tolerance', () => {
    expect(DEFAULT_STUDY_CASE_CONFIG.tolerance).toBeGreaterThan(0);
    expect(DEFAULT_STUDY_CASE_CONFIG.tolerance).toBeLessThan(1);
  });

  it('should include motor contribution by default', () => {
    expect(DEFAULT_STUDY_CASE_CONFIG.include_motor_contribution).toBe(true);
  });

  it('should include inverter contribution by default', () => {
    expect(DEFAULT_STUDY_CASE_CONFIG.include_inverter_contribution).toBe(true);
  });

  it('should have positive thermal time', () => {
    expect(DEFAULT_STUDY_CASE_CONFIG.thermal_time_seconds).toBeGreaterThan(0);
  });

  it('should have all expected config fields', () => {
    const expectedFields: (keyof StudyCaseConfig)[] = [
      'c_factor_max',
      'c_factor_min',
      'base_mva',
      'max_iterations',
      'tolerance',
      'include_motor_contribution',
      'include_inverter_contribution',
      'thermal_time_seconds',
    ];
    for (const field of expectedFields) {
      expect(DEFAULT_STUDY_CASE_CONFIG).toHaveProperty(field);
    }
  });
});

// ---------------------------------------------------------------------------
// RESULT_STATUS_LABELS
// ---------------------------------------------------------------------------

describe('RESULT_STATUS_LABELS', () => {
  const ALL_STATUSES: StudyCaseResultStatus[] = ['NONE', 'FRESH', 'OUTDATED'];

  it('should have labels for all result statuses', () => {
    for (const status of ALL_STATUSES) {
      expect(RESULT_STATUS_LABELS[status]).toBeDefined();
      expect(typeof RESULT_STATUS_LABELS[status]).toBe('string');
      expect(RESULT_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it('should contain Polish text (non-ASCII or recognized Polish words)', () => {
    // Check for Polish words commonly used
    expect(RESULT_STATUS_LABELS.NONE).toContain('Wyniki');
    expect(RESULT_STATUS_LABELS.FRESH).toContain('aktualne');
    expect(RESULT_STATUS_LABELS.OUTDATED).toContain('nieaktualne');
  });
});

// ---------------------------------------------------------------------------
// RESULT_STATUS_TOOLTIPS
// ---------------------------------------------------------------------------

describe('RESULT_STATUS_TOOLTIPS', () => {
  const ALL_STATUSES: StudyCaseResultStatus[] = ['NONE', 'FRESH', 'OUTDATED'];

  it('should have tooltips for all result statuses', () => {
    for (const status of ALL_STATUSES) {
      expect(RESULT_STATUS_TOOLTIPS[status]).toBeDefined();
      expect(typeof RESULT_STATUS_TOOLTIPS[status]).toBe('string');
      expect(RESULT_STATUS_TOOLTIPS[status].length).toBeGreaterThan(0);
    }
  });

  it('should have longer tooltips than labels (more detailed)', () => {
    for (const status of ALL_STATUSES) {
      expect(RESULT_STATUS_TOOLTIPS[status].length).toBeGreaterThan(
        RESULT_STATUS_LABELS[status].length
      );
    }
  });
});

// ---------------------------------------------------------------------------
// CONFIG_FIELD_LABELS
// ---------------------------------------------------------------------------

describe('CONFIG_FIELD_LABELS', () => {
  it('should have labels for all config fields', () => {
    const configFields: (keyof StudyCaseConfig)[] = [
      'c_factor_max',
      'c_factor_min',
      'base_mva',
      'max_iterations',
      'tolerance',
      'include_motor_contribution',
      'include_inverter_contribution',
      'thermal_time_seconds',
    ];

    for (const field of configFields) {
      expect(CONFIG_FIELD_LABELS[field]).toBeDefined();
      expect(typeof CONFIG_FIELD_LABELS[field]).toBe('string');
      expect(CONFIG_FIELD_LABELS[field].length).toBeGreaterThan(0);
    }
  });

  it('should not contain project codenames', () => {
    const WZORZEC_NAZW_KODOWYCH = /\bP\d{1,3}\b/;
    for (const label of Object.values(CONFIG_FIELD_LABELS)) {
      expect(label).not.toMatch(WZORZEC_NAZW_KODOWYCH);
    }
  });
});

// ---------------------------------------------------------------------------
// ANALYSIS_TYPE_LABELS
// ---------------------------------------------------------------------------

describe('ANALYSIS_TYPE_LABELS', () => {
  const ALL_TYPES: ExecutionAnalysisType[] = [
    'SC_3F',
    'SC_1F',
    'SC_2F',
    'SC_2F_G',
    'LOAD_FLOW',
    'PHASE_STATE_SN',
    'DYNAMIC_STABILITY',
    'SOURCE_COMPLIANCE',
  ];

  it('should have labels for all analysis types', () => {
    for (const type of ALL_TYPES) {
      expect(ANALYSIS_TYPE_LABELS[type]).toBeDefined();
      expect(typeof ANALYSIS_TYPE_LABELS[type]).toBe('string');
      expect(ANALYSIS_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
  });

  it('should contain Polish analysis descriptions', () => {
    expect(ANALYSIS_TYPE_LABELS.SC_3F).toContain('warcie');
    expect(ANALYSIS_TYPE_LABELS.SC_1F).toContain('warcie');
    expect(ANALYSIS_TYPE_LABELS.SC_2F).toContain('warcie');
    expect(ANALYSIS_TYPE_LABELS.SC_2F_G).toContain('warcie');
    expect(ANALYSIS_TYPE_LABELS.LOAD_FLOW).toContain('mocy');
    expect(ANALYSIS_TYPE_LABELS.PHASE_STATE_SN).toContain('Stan');
    expect(ANALYSIS_TYPE_LABELS.DYNAMIC_STABILITY).toContain('dynamiczna');
    expect(ANALYSIS_TYPE_LABELS.SOURCE_COMPLIANCE).toContain('Zgodność');
  });
});

// ---------------------------------------------------------------------------
// RUN_STATUS_LABELS
// ---------------------------------------------------------------------------

describe('RUN_STATUS_LABELS', () => {
  const ALL_STATUSES: RunStatus[] = ['PENDING', 'RUNNING', 'DONE', 'FAILED'];

  it('should have labels for all run statuses', () => {
    for (const status of ALL_STATUSES) {
      expect(RUN_STATUS_LABELS[status]).toBeDefined();
      expect(typeof RUN_STATUS_LABELS[status]).toBe('string');
      expect(RUN_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// RUN_STATUS_COLORS
// ---------------------------------------------------------------------------

describe('RUN_STATUS_COLORS', () => {
  const ALL_STATUSES: RunStatus[] = ['PENDING', 'RUNNING', 'DONE', 'FAILED'];

  it('should have CSS color classes for all run statuses', () => {
    for (const status of ALL_STATUSES) {
      expect(RUN_STATUS_COLORS[status]).toBeDefined();
      expect(typeof RUN_STATUS_COLORS[status]).toBe('string');
      // Should be a Tailwind text color class
      expect(RUN_STATUS_COLORS[status]).toMatch(/^text-/);
    }
  });

  it('should use distinct colors for each status', () => {
    const colors = Object.values(RUN_STATUS_COLORS);
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(colors.length);
  });
});
