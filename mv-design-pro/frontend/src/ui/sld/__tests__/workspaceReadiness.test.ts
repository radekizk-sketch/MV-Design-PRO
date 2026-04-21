import { describe, expect, it } from 'vitest';

import {
  countWorkspaceSymbols,
  deriveSldEmptyState,
  resolveOperationalSldEmptyState,
  resolveOperationalWorkspaceBlockState,
  resolveWorkspaceBlockState,
} from '../workspaceReadiness';

describe('workspaceReadiness', () => {
  it('normalizuje brak snapshotu do operacyjnej blokady modelu lub źródła, a NO_SNAPSHOT zachowuje tylko po wymuszeniu', () => {
    const emptyState = deriveSldEmptyState({
      hasActiveCase: true,
      hasSnapshot: false,
      sourceCount: 0,
      symbolCount: 0,
    });
    const operationalEmptyState = resolveOperationalSldEmptyState({
      hasActiveCase: true,
      hasSnapshot: false,
      sourceCount: 0,
      symbolCount: 0,
    });
    const forcedEmptyState = deriveSldEmptyState({
      forceEmptyState: 'NO_SNAPSHOT',
      hasActiveCase: true,
      hasSnapshot: false,
      sourceCount: 0,
      symbolCount: 0,
    });
    const blockState = resolveWorkspaceBlockState({
      hasActiveCase: true,
      hasSnapshot: false,
      sourceCount: 0,
      symbolCount: 0,
    });
    const operationalBlockState = resolveOperationalWorkspaceBlockState({
      hasActiveCase: true,
      hasSnapshot: false,
      sourceCount: 0,
      symbolCount: 0,
    });
    const forcedBlockState = resolveWorkspaceBlockState({
      forceEmptyState: 'NO_SNAPSHOT',
      hasActiveCase: true,
      hasSnapshot: false,
      sourceCount: 0,
      symbolCount: 0,
    });

    expect(emptyState).toBe('NO_MODEL');
    expect(operationalEmptyState).toBe('NO_MODEL');
    expect(forcedEmptyState).toBe('NO_SNAPSHOT');
    expect(blockState?.reason).toBe('NO_SOURCE');
    expect(operationalBlockState?.reason).toBe('NO_SOURCE');
    expect(forcedBlockState?.reason).toBe('NO_SNAPSHOT');
  });

  it('blokuje warsztat jako brak źródła dla pustego modelu ze snapshotem', () => {
    const emptyState = deriveSldEmptyState({
      hasActiveCase: true,
      hasSnapshot: true,
      sourceCount: 0,
      symbolCount: 0,
    });
    const blockState = resolveWorkspaceBlockState({
      hasActiveCase: true,
      hasSnapshot: true,
      sourceCount: 0,
      symbolCount: 0,
    });

    expect(emptyState).toBe('NO_MODEL');
    expect(blockState?.reason).toBe('NO_SOURCE');
    expect(blockState?.title).toBe('Brak źródła zasilania');
  });

  it('nie blokuje warsztatu, gdy snapshot ma źródło i rzeczywistą topologię', () => {
    const emptyState = deriveSldEmptyState({
      hasActiveCase: true,
      hasSnapshot: true,
      sourceCount: 1,
      symbolCount: 3,
    });
    const blockState = resolveWorkspaceBlockState({
      hasActiveCase: true,
      hasSnapshot: true,
      sourceCount: 1,
      symbolCount: 3,
    });

    expect(emptyState).toBeNull();
    expect(blockState).toBeNull();
  });

  it('traktuje model source-only jako brak modelu do obliczeń', () => {
    const emptyState = deriveSldEmptyState({
      hasActiveCase: true,
      hasSnapshot: true,
      sourceCount: 1,
      symbolCount: 1,
    });
    const blockState = resolveWorkspaceBlockState({
      hasActiveCase: true,
      hasSnapshot: true,
      sourceCount: 1,
      symbolCount: 1,
    });

    expect(emptyState).toBe('NO_MODEL');
    expect(blockState?.reason).toBe('NO_MODEL');
  });

  it('liczy tylko strukturalne elementy modelu, a nie same szyny rysunkowe', () => {
    const symbolCount = countWorkspaceSymbols({
      sources: [{ ref_id: 'source_1' }],
      buses: [{ ref_id: 'bus_1' }, { ref_id: 'bus_2' }],
      branches: [],
      substations: [],
      transformers: [],
      generators: [],
    });

    expect(symbolCount).toBe(1);

    const blockState = resolveWorkspaceBlockState({
      hasActiveCase: true,
      hasSnapshot: true,
      sourceCount: 1,
      symbolCount,
    });

    expect(blockState?.reason).toBe('NO_MODEL');
  });
});
