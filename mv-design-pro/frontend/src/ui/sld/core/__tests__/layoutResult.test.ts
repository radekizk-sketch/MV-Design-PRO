import { describe, expect, it } from 'vitest';

import {
  LAYOUT_RESULT_VERSION,
  canonicalizeLayoutResult,
  computeLayoutResultHash,
  type CanonicalAnnotationsV1,
  type GpzSectionV1,
  type LayoutResultV1,
} from '../layoutResult';

function makeSection(sectionId: string, rootBusId: string, order: number, centerX: number): GpzSectionV1 {
  return {
    sectionId,
    rootBusId,
    order,
    bounds: { x: centerX - 20, y: 40, width: 40, height: 14 },
    busbar: { x: centerX - 20, y: 48, width: 40, height: 6 },
    centerX,
    fieldIds: [`field_${sectionId}`],
    sourceNodeIds: [`src_${sectionId}`],
    leftCouplerEdgeId: null,
    rightCouplerEdgeId: null,
  };
}

function makeResult(gpzSections: readonly GpzSectionV1[]): LayoutResultV1 {
  const canonicalAnnotations: CanonicalAnnotationsV1 = {
    trunkNodes: [],
    trunkSegments: [],
    branchPoints: [],
    stationChains: [],
    gpzSections,
    gpzFeederFields: [],
    inlineBranchObjects: [],
  };

  return {
    version: LAYOUT_RESULT_VERSION,
    nodePlacements: [],
    edgeRoutes: [],
    switchgearBlocks: [],
    catalogRefs: [],
    relayBindings: [],
    validationErrors: [],
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    hash: 'semantic-test',
    canonicalAnnotations,
  };
}

describe('layoutResult gpzSections contract', () => {
  it('canonicalizeLayoutResult sorts gpzSections deterministically by order then sectionId', () => {
    const result = makeResult([
      makeSection('section_b', 'bus_root', 1, 260),
      makeSection('section_a', 'bus_root', 0, 180),
    ]);

    const canonical = canonicalizeLayoutResult(result);
    expect(canonical.canonicalAnnotations?.gpzSections?.map((section) => section.sectionId)).toEqual([
      'section_a',
      'section_b',
    ]);
  });

  it('computeLayoutResultHash ignores gpzSections order after canonicalization', () => {
    const ordered = makeResult([
      makeSection('section_a', 'bus_root', 0, 180),
      makeSection('section_b', 'bus_root', 1, 260),
    ]);
    const permuted = makeResult([
      makeSection('section_b', 'bus_root', 1, 260),
      makeSection('section_a', 'bus_root', 0, 180),
    ]);

    expect(computeLayoutResultHash(ordered)).toBe(computeLayoutResultHash(permuted));
  });

  it('computeLayoutResultHash ignores internal gpzSections array order after canonicalization', () => {
    const base = makeResult([
      {
        ...makeSection('section_a', 'bus_root', 0, 180),
        fieldIds: ['field_b', 'field_a'],
        sourceNodeIds: ['src_b', 'src_a'],
      },
    ]);
    const permuted = makeResult([
      {
        ...makeSection('section_a', 'bus_root', 0, 180),
        fieldIds: ['field_a', 'field_b'],
        sourceNodeIds: ['src_a', 'src_b'],
      },
    ]);

    expect(computeLayoutResultHash(base)).toBe(computeLayoutResultHash(permuted));
  });

  it('computeLayoutResultHash changes when gpzSections content changes', () => {
    const base = makeResult([
      makeSection('section_a', 'bus_root', 0, 180),
    ]);
    const modified = makeResult([
      makeSection('section_a', 'bus_root', 0, 180),
      makeSection('section_b', 'bus_root', 1, 260),
    ]);

    expect(computeLayoutResultHash(base)).not.toBe(computeLayoutResultHash(modified));
  });
});
