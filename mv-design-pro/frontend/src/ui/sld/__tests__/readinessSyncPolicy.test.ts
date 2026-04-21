import { describe, expect, it } from 'vitest';

import { resolveReadinessRefreshDecision } from '../readinessSyncPolicy';

describe('readinessSyncPolicy', () => {
  it('pomija fetch gotowości, gdy refresh snapshotu nie zwraca migawki', () => {
    expect(resolveReadinessRefreshDecision(null)).toEqual({ kind: 'skip' });
    expect(resolveReadinessRefreshDecision(undefined)).toEqual({ kind: 'skip' });
  });

  it('używa rewizji ENM, gdy migawka ją zawiera', () => {
    expect(
      resolveReadinessRefreshDecision({
        header: { revision: 17 },
      }),
    ).toEqual({ kind: 'by_revision', revision: 17 });
  });

  it('pozwala na fallback tylko dla rzeczywistej migawki bez rewizji', () => {
    expect(resolveReadinessRefreshDecision({ header: {} })).toEqual({ kind: 'fallback' });
    expect(resolveReadinessRefreshDecision({})).toEqual({ kind: 'fallback' });
  });
});
