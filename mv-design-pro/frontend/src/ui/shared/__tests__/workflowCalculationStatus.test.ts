/**
 * WorkflowCalculationStatus (R55) — testy jednostkowe.
 *
 * Weryfikuje:
 * - Kompletność 7 stanów (żaden nie jest undefined)
 * - Polskie etykiety (nie są puste, nie zawierają anglicyzmów z listy)
 * - Kolory (poprawny format Tailwind)
 * - resultStatusToWorkflowStatus — mapowanie z ResultStatus
 */

import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_STATUS_LABEL,
  WORKFLOW_STATUS_SHORT,
  WORKFLOW_STATUS_COLOR,
  resultStatusToWorkflowStatus,
  type WorkflowCalculationStatus,
} from '../formatPolishValue';

const ALL_STATES: WorkflowCalculationStatus[] = [
  'idle',
  'blocked',
  'ready',
  'running',
  'calculated',
  'stale',
  'error',
];

describe('WorkflowCalculationStatus — kompletność etykiet', () => {
  it('WORKFLOW_STATUS_LABEL zawiera wszystkie 7 stanów', () => {
    for (const status of ALL_STATES) {
      expect(WORKFLOW_STATUS_LABEL[status]).toBeTruthy();
    }
  });

  it('WORKFLOW_STATUS_SHORT zawiera wszystkie 7 stanów', () => {
    for (const status of ALL_STATES) {
      expect(WORKFLOW_STATUS_SHORT[status]).toBeTruthy();
    }
  });

  it('WORKFLOW_STATUS_COLOR zawiera wszystkie 7 stanów', () => {
    for (const status of ALL_STATES) {
      expect(WORKFLOW_STATUS_COLOR[status]).toBeTruthy();
    }
  });
});

describe('WorkflowCalculationStatus — polskie etykiety', () => {
  const FORBIDDEN_ANGLICISMS = [
    'readiness', 'status', 'calculation', 'blocked', 'idle', 'running', 'stale',
  ];

  it('etykiety nie zawierają anglicyzmów ze strefy UI', () => {
    for (const status of ALL_STATES) {
      const label = WORKFLOW_STATUS_LABEL[status].toLowerCase();
      for (const term of FORBIDDEN_ANGLICISMS) {
        expect(label, `Status '${status}' zawiera anglicyzm '${term}'`).not.toContain(term);
      }
    }
  });

  it('etykiety nie są puste', () => {
    for (const status of ALL_STATES) {
      expect(WORKFLOW_STATUS_LABEL[status].trim().length, `Status '${status}' ma pustą etykietę`).toBeGreaterThan(0);
      expect(WORKFLOW_STATUS_SHORT[status].trim().length, `Status '${status}' ma pustą krótką etykietę`).toBeGreaterThan(0);
    }
  });

  it('idle ma etykietę "Brak obliczeń"', () => {
    expect(WORKFLOW_STATUS_LABEL['idle']).toBe('Brak obliczeń');
  });

  it('calculated ma etykietę "Wyniki aktualne"', () => {
    expect(WORKFLOW_STATUS_LABEL['calculated']).toBe('Wyniki aktualne');
  });

  it('stale ma etykietę "Wyniki nieaktualne"', () => {
    expect(WORKFLOW_STATUS_LABEL['stale']).toBe('Wyniki nieaktualne');
  });

  it('blocked ma etykietę "Dane niekompletne"', () => {
    expect(WORKFLOW_STATUS_LABEL['blocked']).toBe('Dane niekompletne');
  });

  it('running ma etykietę "Obliczenia w toku"', () => {
    expect(WORKFLOW_STATUS_LABEL['running']).toBe('Obliczenia w toku');
  });
});

describe('resultStatusToWorkflowStatus', () => {
  it('FRESH bez blokerów → calculated', () => {
    expect(resultStatusToWorkflowStatus('FRESH', false)).toBe('calculated');
  });

  it('FRESH z blokerami → calculated (wyniki zwracają pierwszeństwo)', () => {
    expect(resultStatusToWorkflowStatus('FRESH', true)).toBe('calculated');
  });

  it('OUTDATED → stale (niezależnie od blokerów)', () => {
    expect(resultStatusToWorkflowStatus('OUTDATED', false)).toBe('stale');
    expect(resultStatusToWorkflowStatus('OUTDATED', true)).toBe('stale');
  });

  it('NONE bez blokerów → idle', () => {
    expect(resultStatusToWorkflowStatus('NONE', false)).toBe('idle');
  });

  it('NONE z blokerami → blocked', () => {
    expect(resultStatusToWorkflowStatus('NONE', true)).toBe('blocked');
  });
});

describe('WorkflowCalculationStatus — kolory', () => {
  it('calculated ma kolor zielony (emerald)', () => {
    expect(WORKFLOW_STATUS_COLOR['calculated']).toContain('emerald');
  });

  it('error ma kolor czerwony (red)', () => {
    expect(WORKFLOW_STATUS_COLOR['error']).toContain('red');
  });

  it('blocked ma kolor bursztynowy (amber)', () => {
    expect(WORKFLOW_STATUS_COLOR['blocked']).toContain('amber');
  });

  it('stale ma kolor pomarańczowy (orange)', () => {
    expect(WORKFLOW_STATUS_COLOR['stale']).toContain('orange');
  });

  it('running ma animację pulse', () => {
    expect(WORKFLOW_STATUS_COLOR['running']).toContain('animate-pulse');
  });
});
