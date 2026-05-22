import { describe, expect, it } from 'vitest';

import { buildTraceSummaryRows, formatContractValue, resolveSurfaceRunId } from '../analysisRunContract';
import type { WorkspaceSurfaceDescriptor } from '../types';

function surface(
  patch: Partial<WorkspaceSurfaceDescriptor>,
): WorkspaceSurfaceDescriptor {
  return {
    surfaceId: 'surface-1',
    screenCode: 'E-37',
    surfaceKind: 'raportowy',
    sizeClass: 'C',
    stackLevel: 1,
    entityType: null,
    entityRef: null,
    subjectKind: 'report',
    subjectRef: null,
    parentSurfaceId: null,
    tabId: null,
    titlePl: 'Raport',
    breadcrumbs: [],
    supportsMiniSld: true,
    openMode: 'expand_workspace',
    routeState: {
      route: 'report',
      payload: {},
    },
    ...patch,
  };
}

describe('resolveSurfaceRunId', () => {
  it('nie traktuje zaznaczonego obiektu jako identyfikatora obliczenia', () => {
    const runId = resolveSurfaceRunId(
      surface({
        entityRef: 'gpz/source/main',
        subjectKind: 'report',
        subjectRef: null,
        routeState: {
          route: 'report',
          payload: {},
        },
      }),
      null,
    );

    expect(runId).toBeNull();
  });

  it('używa runId z payloadu powierzchni przed aktywnym runem', () => {
    const runId = resolveSurfaceRunId(
      surface({
        entityRef: 'gpz/source/main',
        subjectKind: 'report',
        subjectRef: null,
        routeState: {
          route: 'report',
          payload: { runId: 'run-z-payloadu' },
        },
      }),
      'run-aktywny',
    );

    expect(runId).toBe('run-z-payloadu');
  });
});

describe('formatContractValue', () => {
  it('mapuje techniczne tokeny kontraktu na etykiety dla projektanta', () => {
    expect(formatContractValue('read_only')).toBe('tylko odczyt');
    expect(formatContractValue('FINISHED')).toBe('zakończone');
    expect(formatContractValue('VALID')).toBe('aktualne');
    expect(formatContractValue('SC')).toBe('zwarcie SN');
    expect(formatContractValue('REPORT')).toBe('raport');
    expect(formatContractValue('short circuit sn')).toBe('zwarcie SN');
    expect(formatContractValue('SCREPORT')).toBe('raport zwarciowy SN');
    expect(formatContractValue('json')).toBe('JSON');
    expect(formatContractValue('v1')).toBe('wersja 1');
    expect(formatContractValue('v12_5_export_artifact/1.0')).toBe('generator eksportu V12.5');
    expect(formatContractValue('solver_tolerance/default')).toBe('domyślna tolerancja solvera');
    expect(formatContractValue(['SC', 'REPORT'])).toBe('zwarcie SN, raport');
    expect(formatContractValue(['SCREPORT', 'short_circuit_sn'])).toBe('raport zwarciowy SN, zwarcie SN');
  });
});

describe('buildTraceSummaryRows', () => {
  it('nie pokazuje placeholdera konfiguracji dla zakonczonego sladu bez czasu i ostrzezen', () => {
    const rows = buildTraceSummaryRows({
      count: 896,
      firstStep: 'Zk',
      lastStep: 'Sk',
      phases: ['Ib', 'Ikss'],
      durationMs: null,
      warnings: [],
    });

    expect(rows.find((row) => row.label === 'Czas trwania [ms]')?.value)
      .toBe('Nie rejestrowano czasu wykonania');
    expect(rows.find((row) => row.label === 'Ostrzeżenia')?.value)
      .toBe('Brak ostrzeżeń');
    expect(rows.map((row) => row.value)).not.toContain('Do konfiguracji');
  });
});
