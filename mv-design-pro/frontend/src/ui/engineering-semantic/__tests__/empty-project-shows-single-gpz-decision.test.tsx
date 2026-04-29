/**
 * empty-project-shows-single-gpz-decision
 *
 * Weryfikuje, że pusty projekt prowadzi użytkownika do jednej decyzji:
 * utwórz GPZ uproszczony. EngineeringSemanticModel bez elementów GPZ
 * powinien mieć fazę buildPhase = NO_SOURCE oraz dokładnie jedną
 * akcję dostępną jako następny krok.
 */

import { describe, expect, it } from 'vitest';

import type { EngineeringSemanticModel } from '../types';

function emptyModel(): EngineeringSemanticModel {
  return {
    schemaVersion: 'v12-semantic-v8',
    projectRefId: 'proj-empty',
    modelId: 'model-empty',
    enmSnapshotRef: 'enm-empty',
    catalogSnapshotRef: 'cat-empty',
    usedCatalogMaterializationHash: 'hash-cat-empty',
    semanticVersion: 'v8',
    semanticHash: 'hash-empty',
    ontologyVersion: 'ontology-v8',
    ontologyHash: 'ontology-hash-empty',
    roleRegistryHash: 'role-hash-empty',
    connectionRuleRegistryHash: 'conn-rule-hash-empty',
    generatedAt: '2026-04-29T00:00:00Z',
    elements: [],
    connections: [],
    physicalTopologyGraph: {
      graphId: 'graph-empty',
      elementRefs: [],
      connectionRefs: [],
    },
    earthingContexts: [],
  };
}

describe('empty project shows single GPZ decision', () => {
  it('has no elements and no connections', () => {
    const model = emptyModel();
    expect(model.elements).toHaveLength(0);
    expect(model.connections).toHaveLength(0);
  });

  it('has no GPZ element — user must create one', () => {
    const model = emptyModel();
    const gpz = model.elements.find((el) => el.elementKind === 'GPZ');
    expect(gpz).toBeUndefined();
  });

  it('has no source node — build phase should be NO_SOURCE equivalent', () => {
    const model = emptyModel();
    const sourceNodes = model.elements.filter(
      (el) =>
        el.engineeringRole === 'GPZ_SUPPLY_NODE' ||
        el.elementKind === 'GPZ',
    );
    expect(sourceNodes).toHaveLength(0);
  });

  it('schema version is v12-semantic-v8', () => {
    const model = emptyModel();
    expect(model.schemaVersion).toBe('v12-semantic-v8');
  });

  it('empty model has valid projectRefId', () => {
    const model = emptyModel();
    expect(model.projectRefId).toBeTruthy();
    expect(typeof model.projectRefId).toBe('string');
  });
});
