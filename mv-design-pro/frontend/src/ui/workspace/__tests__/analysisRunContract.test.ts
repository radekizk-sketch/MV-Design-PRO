import { describe, expect, it } from 'vitest';

import { resolveSurfaceRunId } from '../analysisRunContract';
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
