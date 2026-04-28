import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  assertEngineeringSemanticModelCoreOnly,
  assertSemanticPolicyInputs,
  assertSldRoutesReferenceEngineeringConnections,
} from '../architectureGuards';
import { withDiagnosticsHash } from '../projections';
import type { EngineeringSemanticViolation } from '../types';
import { baseView, productionConnection, semanticModel, sldRoute } from './fixtures';

const semanticModelSourcePath = fileURLToPath(new URL('../types.ts', import.meta.url));

function diagnosticViolation(overrides: Partial<EngineeringSemanticViolation> = {}): EngineeringSemanticViolation {
  return {
    code: 'SEM-BAY-001',
    severity: 'BLOKADA_RENDERU',
    elementRefId: 'bay-1',
    messagePl: 'Pole transformatorowe nie moze wyprowadzac odcinka SN.',
    technicalCausePl: 'Funkcja pola transformatorowego prowadzi do transformatora, nie do magistrali terenowej.',
    repairActionPl: 'Zmien funkcje pola albo wybierz pole odpływowe liniowe.',
    repairActions: [{
      actionId: 'OPEN_SEMANTIC_MAPPING',
      labelPl: 'Otworz mapowanie semantyczne',
      targetElementRefId: 'bay-1',
      domainOperationKind: 'ASSIGN_SEMANTIC_ROLE',
      opensScreenId: 'DIAGNOSTYKA_SEMANTYCZNA',
      opensInspectorSection: 'Karta semantyczna',
      requiredPermission: 'semantic:edit',
      visibilityPolicy: 'POKAZ_JAKO_ZABLOKOWANA',
    }],
    affectedAreas: ['SLD', 'MENU', 'INSPEKTOR'],
    params: {
      bayFunction: 'TRANSFORMATOROWE',
      attemptedAction: 'ADD_MV_SEGMENT',
    },
    ...overrides,
  };
}

describe('architecture guards for local semantic bans', () => {
  it('blocks SldRoute.pathPoints as topology when EngineeringConnection is missing', () => {
    const routeOnlyView = baseView({
      routes: [sldRoute({
        connectionId: 'missing-connection',
        pathPoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      })],
    });

    expect(assertSldRoutesReferenceEngineeringConnections(semanticModel(), routeOnlyView)).toEqual([
      expect.objectContaining({
        code: 'ARCH-SLD-ROUTE-001',
        context: 'SldBaseProjectionViewModel.routes.route-1',
      }),
    ]);
  });

  it('allows SldRoute only as a view route of an existing EngineeringConnection', () => {
    const connection = productionConnection();
    const model = semanticModel({
      connections: [connection],
      physicalTopologyGraph: {
        graphId: 'physical-1',
        elementRefs: [],
        connectionRefs: [connection.connectionId],
      },
    });
    const view = baseView({ routes: [sldRoute({ connectionId: connection.connectionId })] });

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

  it('keeps diagnostics as a separate projection outside the EngineeringSemanticModel type', () => {
    const source = readFileSync(semanticModelSourcePath, 'utf8');
    const engineeringSemanticModelBlock = source.match(/export interface EngineeringSemanticModel \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(engineeringSemanticModelBlock).toContain('semanticHash');
    expect(engineeringSemanticModelBlock).not.toContain('violations');
    expect(engineeringSemanticModelBlock).not.toContain('diagnosticsHash');
  });

  it('keeps projection hashes independent from audit timestamps and UI diagnostic text', () => {
    const first = withDiagnosticsHash({
      schemaVersion: 'v12-diagnostics-v1',
      projectRefId: 'project-1',
      semanticHash: 'sem-1',
      diagnosticsRuleRegistryHash: 'diagnostics-rules-v8',
      generatedAt: '2026-04-28T10:00:00Z',
      violations: [diagnosticViolation()],
    });
    const second = withDiagnosticsHash({
      ...first,
      diagnosticsHash: undefined,
      generatedAt: '2026-04-28T11:30:00Z',
      violations: [diagnosticViolation({
        messagePl: 'Zmieniony tekst redakcyjny.',
        technicalCausePl: 'Inny opis przyczyny, bez zmiany kodu i parametrow.',
        repairActionPl: 'Inny opis akcji naprawczej.',
      })],
    });

    expect(second.diagnosticsHash).toBe(first.diagnosticsHash);
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
