import { describe, expect, it } from 'vitest';

import type { SldOverlayProjection } from '../types';

describe('SLD overlay projection base view hash', () => {
  it('binds overlay markers to a concrete base SLD view hash', () => {
    const overlay = {
      schemaVersion: 'v12-sld-overlay-v8',
      projectRefId: 'project-1',
      overlayId: 'overlay-1',
      semanticHash: 'semantic-1',
      baseViewHash: 'view-1',
      resultSetRefId: 'result-set-1',
      resultHash: 'result-1',
      inputSnapshotRefId: 'input-1',
      overlayKind: 'ZWARCIA',
      overlayHash: 'overlay-hash',
      markers: [{ markerId: 'm1', elementRefId: 'bay-1' }],
      labels: [],
    } satisfies SldOverlayProjection;

    expect(overlay.baseViewHash).toBe('view-1');
  });
});
