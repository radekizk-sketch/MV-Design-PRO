import { describe, expect, it } from 'vitest';

import {
  assertEngineeringSemanticModelCoreOnly,
  assertSemanticPolicyInputs,
  assertSldRoutesReferenceEngineeringConnections,
  normalizeProjectionForGuardHash,
} from '../architectureGuards';

function semanticModel(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'v12-semantic-v8',
    projectRefId: 'project-1',
    modelId: 'model-1',
    semanticHash: 'sem-1',
    generatedAt: '2026-04-28T10:00:00Z',
    elements: [],
    connections: [],
    physicalTopologyGraph: {
      graphId: 'physical-1',
      connectionRefs: [],
      elementRefs: [],
    },
    earthingContexts: [],
    ...overrides,
  };
}

describe('architecture guards for local semantic bans', () => {
  it('blocks SldRoute.pathPoints as topology when EngineeringConnection is missing', () => {
    const routeOnlyView = {
      semanticHash: 'sem-1',
      routes: [{
        routeId: 'route-1',
        connectionId: 'missing-connection',
        pathPoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      }],
    };

    expect(assertSldRoutesReferenceEngineeringConnections(semanticModel(), routeOnlyView)).toEqual([
      expect.objectContaining({
        code: 'ARCH-SLD-ROUTE-001',
        context: 'SldBaseProjectionViewModel.routes.route-1',
      }),
    ]);
  });

  it('allows SldRoute only as a view route of an existing EngineeringConnection', () => {
    const model = semanticModel({
      connections: [{ connectionId: 'conn-1' }],
      physicalTopologyGraph: {
        graphId: 'physical-1',
        connectionRefs: ['conn-1'],
        elementRefs: [],
      },
    });
    const view = {
      semanticHash: 'sem-1',
      routes: [{
        routeId: 'route-1',
        connectionId: 'conn-1',
        pathPoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      }],
    };

    expect(assertSldRoutesReferenceEngineeringConnections(model, view)).toEqual([]);
  });

  it('guards EngineeringSemanticModel against embedded diagnostics and projection hashes', () => {
    expect(assertEngineeringSemanticModelCoreOnly(semanticModel())).toEqual([]);
    expect(assertEngineeringSemanticModelCoreOnly({
      ...semanticModel(),
      diagnosticsHash: 'diag-1',
      violations: [],
    })).toEqual([
      expect.objectContaining({ code: 'ARCH-SEMANTIC-CORE-001', context: 'EngineeringSemanticModel.violations' }),
      expect.objectContaining({ code: 'ARCH-SEMANTIC-CORE-001', context: 'EngineeringSemanticModel.diagnosticsHash' }),
    ]);
  });

  it('treats diagnostics as a separate projection from EngineeringSemanticModel', () => {
    const diagnosticsProjection = {
      schemaVersion: 'v12-diagnostics-v1',
      projectRefId: 'project-1',
      semanticHash: 'sem-1',
      diagnosticsRuleRegistryHash: 'diagnostics-rules-v8',
      diagnosticsHash: 'diag-1',
      generatedAt: '2026-04-28T10:00:00Z',
      violations: [{
        code: 'SEM-BAY-001',
        severity: 'BLOKADA_RENDERU',
        elementRefId: 'bay-1',
        messagePl: 'Pole transformatorowe nie moze wyprowadzac odcinka SN.',
        technicalCausePl: 'Funkcja pola prowadzi do transformatora, nie do magistrali.',
        repairActionPl: 'Wybierz pole odpływowe liniowe.',
        repairActions: [{ actionId: 'OPEN_SEMANTIC_MAPPING' }],
        affectedAreas: ['SLD', 'MENU'],
      }],
    };

    expect(assertEngineeringSemanticModelCoreOnly(diagnosticsProjection)).toEqual([
      expect.objectContaining({ code: 'ARCH-SEMANTIC-CORE-001', context: 'EngineeringSemanticModel.violations' }),
      expect.objectContaining({ code: 'ARCH-SEMANTIC-CORE-001', context: 'EngineeringSemanticModel.diagnosticsHash' }),
    ]);
  });

  it('normalizes projection hash inputs without audit timestamps and UI diagnostic text', () => {
    const first = normalizeProjectionForGuardHash({
      code: 'SEM-BAY-001',
      severity: 'BLOKADA_RENDERU',
      elementRefId: 'bay-1',
      generatedAt: '2026-04-28T10:00:00Z',
      messagePl: 'Tekst redakcyjny A',
      technicalCausePl: 'Przyczyna A',
      repairActionPl: 'Akcja A',
      repairActions: [{ actionId: 'OPEN_SEMANTIC_MAPPING', labelPl: 'Otworz A' }],
      affectedAreas: ['MENU', 'SLD'],
    });
    const second = normalizeProjectionForGuardHash({
      code: 'SEM-BAY-001',
      severity: 'BLOKADA_RENDERU',
      elementRefId: 'bay-1',
      generatedAt: '2026-04-28T11:30:00Z',
      messagePl: 'Tekst redakcyjny B',
      technicalCausePl: 'Przyczyna B',
      repairActionPl: 'Akcja B',
      repairActions: [{ actionId: 'OPEN_SEMANTIC_MAPPING', labelPl: 'Otworz B' }],
      affectedAreas: ['SLD', 'MENU'],
    });

    expect(second).toEqual(first);
  });

  it('blocks menu or inspector policies based on a bare ElementType', () => {
    const localPolicy = `
      type ElementType = 'bay' | 'segment';
      interface ContextMenuPolicy {
        elementType: ElementType;
        actions: string[];
      }
    `;

    expect(assertSemanticPolicyInputs(localPolicy, 'ContextMenuPolicy')).toEqual([
      expect.objectContaining({
        code: 'ARCH-POLICY-001',
        context: 'ContextMenuPolicy',
      }),
    ]);
  });

  it('allows menu or inspector policies that receive semantic context', () => {
    const semanticPolicy = `
      import type { EngineeringElement } from '../engineering-semantic';
      interface ContextMenuPolicy {
        element: EngineeringElement;
        semanticHash: string;
        actions: string[];
      }
    `;

    expect(assertSemanticPolicyInputs(semanticPolicy, 'ContextMenuPolicy')).toEqual([]);
  });
});
