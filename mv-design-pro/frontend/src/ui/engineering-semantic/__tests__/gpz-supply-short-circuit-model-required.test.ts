import { describe, expect, it } from 'vitest';

import type { GpzSemanticStructure } from '../types';

describe('GPZ simplified supply short-circuit model', () => {
  it('requires short-circuit model reference for simplified GPZ', () => {
    const structure = {
      gpzRefId: 'gpz-1',
      modelKind: 'UPROSZCZONY_PARAMETRY_NA_SZYNIE_SN',
      supplyNodeRefId: 'source-1',
      supplyShortCircuitModelRefId: 'sk-model-1',
      hvMvTransformers: [],
      mvSwitchgearRefId: 'swg-1',
      busbarSystemRefId: 'bus-system-1',
      busbarSectionRefs: ['bus-1'],
      incomingBayRefs: [],
      outgoingBayRefs: ['bay-l1'],
      couplerBayRefs: [],
      measurementBayRefs: [],
      sourceBayRefs: [],
      groundingModelRefId: 'grounding-1',
    } satisfies GpzSemanticStructure;

    expect(structure.supplyShortCircuitModelRefId).toBe('sk-model-1');
  });
});
