import { describe, expect, it } from 'vitest';

import { gpzStructureIssues } from '../ontology';
import type { GpzSemanticStructure } from '../types';

describe('GPZ supply short-circuit model requirement', () => {
  it('requires supplyShortCircuitModelRefId for simplified GPZ', () => {
    const gpz: GpzSemanticStructure = {
      gpzRefId: 'gpz-1',
      modelKind: 'UPROSZCZONY_PARAMETRY_NA_SZYNIE_SN',
      supplyNodeRefId: 'source-1',
      supplyShortCircuitModelRefId: null,
      hvMvTransformers: [],
      mvSwitchgearRefId: 'switchgear-1',
      busbarSystemRefId: 'busbar-system-1',
      busbarSectionRefs: ['busbar-a'],
      incomingBayRefs: [],
      outgoingBayRefs: [],
      couplerBayRefs: [],
      measurementBayRefs: [],
      sourceBayRefs: [],
      groundingModelRefId: null,
    };

    expect(gpzStructureIssues(gpz)).toContain('SEM-GPZ-002');
  });
});
