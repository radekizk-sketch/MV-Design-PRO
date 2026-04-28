import { describe, expect, it } from 'vitest';

import {
  withDiagnosticsHash,
  withInputHash,
  withOverlayHash,
  withResultHash,
  withSemanticHash,
  withViewHash,
} from '../projections';
import type {
  CalculationInputSnapshot,
  EngineeringSemanticModel,
  ResultBinding,
  SldBaseProjectionViewModel,
  SldOverlayProjection,
} from '../types';

const reportEligibility = {
  RAPORT_TECHNICZNY: 'RAPORTOWALNY',
  RAPORT_OSD: 'RAPORTOWALNY',
  RAPORT_AUDYTOWY: 'RAPORTOWALNY',
  RAPORT_ZGODNOSCI_ZRODLA: 'NIE_DOTYCZY',
  RAPORT_ZABEZPIECZEN: 'NIE_DOTYCZY',
} as const;

function semanticModel(overrides: Partial<EngineeringSemanticModel> = {}): EngineeringSemanticModel {
  return withSemanticHash({
    schemaVersion: 'v12-semantic-v8',
    projectRefId: 'project-1',
    modelId: 'model-1',
    enmSnapshotRef: 'enm-1',
    catalogSnapshotRef: 'catalog-full-1',
    usedCatalogMaterializationHash: 'mat-used-1',
    semanticVersion: 'v8',
    ontologyVersion: 'v8',
    ontologyHash: 'ontology-1',
    roleRegistryHash: 'roles-1',
    connectionRuleRegistryHash: 'connections-1',
    generatedAt: '2026-04-28T10:00:00Z',
    elements: [],
    connections: [],
    physicalTopologyGraph: {
      graphId: 'physical-1',
      elementRefs: [],
      connectionRefs: [],
    },
    earthingContexts: [],
    ...overrides,
  });
}

describe('engineering semantic projections', () => {
  it('nie zmienia semanticHash po zmianie renderera lub layoutu SLD', () => {
    const model = semanticModel();
    const baseView: Omit<SldBaseProjectionViewModel, 'viewHash'> = {
      schemaVersion: 'v12-sld-view-v1',
      projectRefId: 'project-1',
      semanticHash: model.semanticHash,
      rendererRegistryHash: 'renderer-a',
      layoutRegistryHash: 'layout-a',
      lodPolicyHash: 'lod-a',
      symbols: [],
      routes: [],
      labels: [],
    };

    expect(withViewHash(baseView).viewHash).not.toBe(withViewHash({
      ...baseView,
      rendererRegistryHash: 'renderer-b',
    }).viewHash);
    expect(semanticModel().semanticHash).toBe(model.semanticHash);
  });

  it('zmiana nieuzytego katalogu nie zmienia semanticHash, a zmiana materializacji uzytej zmienia', () => {
    const model = semanticModel({ catalogSnapshotRef: 'catalog-full-a' });
    expect(semanticModel({ catalogSnapshotRef: 'catalog-full-b' }).semanticHash).toBe(model.semanticHash);
    expect(semanticModel({ usedCatalogMaterializationHash: 'mat-used-2' }).semanticHash).not.toBe(model.semanticHash);
  });

  it('diagnosticsHash jest odseparowany od semanticHash i ignoruje redakcje komunikatu', () => {
    const model = semanticModel();
    const diagnostic = withDiagnosticsHash({
      schemaVersion: 'v12-diagnostics-v1',
      projectRefId: 'project-1',
      semanticHash: model.semanticHash,
      diagnosticsRuleRegistryHash: 'diag-rules-1',
      generatedAt: '2026-04-28T10:00:00Z',
      violations: [{
        code: 'SEM-SLD-001',
        severity: 'BLOKADA_RENDERU',
        elementRefId: 'x-1',
        messagePl: 'A',
        technicalCausePl: 'A',
        repairActionPl: 'A',
        repairActions: [],
        affectedAreas: ['SLD'],
      }],
    });

    expect(withDiagnosticsHash({
      ...diagnostic,
      generatedAt: '2026-04-28T11:00:00Z',
      violations: [{
        ...diagnostic.violations[0],
        messagePl: 'B',
        technicalCausePl: 'B',
        repairActionPl: 'B',
      }],
    }).diagnosticsHash).toBe(diagnostic.diagnosticsHash);
  });

  it('CalculationInputSnapshot wymaga typu analizy, hash przypadku i ustawien solvera', () => {
    const snapshot: Omit<CalculationInputSnapshot, 'inputHash'> = {
      schemaVersion: 'v12-input-v1',
      projectRefId: 'project-1',
      inputSnapshotRefId: 'input-1',
      semanticHash: 'sem-1',
      catalogSnapshotRef: 'catalog-1',
      materializationRefs: ['mat-1'],
      caseRefId: 'case-1',
      caseHash: 'case-hash-1',
      variantRefId: 'variant-1',
      variantHash: 'variant-hash-1',
      switchingSnapshotRefId: 'switching-1',
      switchingSnapshotHash: 'switching-hash-1',
      analysisType: 'ROZPLYW_NR',
      solverKind: 'NR',
      solverSettingsHash: 'solver-settings-1',
      assumptionsHash: 'assumptions-1',
      calculationGraphHash: 'calc-graph-1',
      generatedAt: '2026-04-28T10:00:00Z',
    };

    expect(withInputHash(snapshot).inputHash).not.toHaveLength(0);
    expect(withInputHash(snapshot).inputHash).not.toBe(withInputHash({
      ...snapshot,
      analysisType: 'ZWARCIE_3F',
    }).inputHash);
  });

  it('ResultBinding utrzymuje pelny lancuch element-wynik-proof-raport', () => {
    const result: Omit<ResultBinding, 'resultHash'> = {
      schemaVersion: 'v12-result-v1',
      projectRefId: 'project-1',
      resultId: 'result-1',
      elementRefId: 'bay-1',
      semanticHash: 'sem-1',
      inputSnapshotRefId: 'input-1',
      inputHash: 'input-hash-1',
      caseRefId: 'case-1',
      caseHash: 'case-hash-1',
      variantRefId: 'variant-1',
      variantHash: 'variant-hash-1',
      switchingSnapshotRefId: 'switching-1',
      switchingSnapshotHash: 'switching-hash-1',
      catalogSnapshotRef: 'catalog-1',
      usedCatalogMaterializationHash: 'mat-used-1',
      analysisType: 'ROZPLYW_NR',
      resultKind: 'MOC',
      qualityState: 'PELNA',
      freshnessState: 'AKTUALNY',
      proofRefId: 'proof-1',
      reportEligibility,
    };

    expect(withResultHash(result)).toMatchObject({
      elementRefId: 'bay-1',
      semanticHash: 'sem-1',
      inputSnapshotRefId: 'input-1',
      proofRefId: 'proof-1',
    });
  });

  it('SldOverlayProjection zalezy od baseViewHash i resultHash', () => {
    const overlay: Omit<SldOverlayProjection, 'overlayHash'> = {
      schemaVersion: 'v12-sld-overlay-v1',
      projectRefId: 'project-1',
      overlayId: 'overlay-1',
      semanticHash: 'sem-1',
      baseViewHash: 'view-1',
      resultSetRefId: 'resultset-1',
      resultHash: 'result-1',
      inputSnapshotRefId: 'input-1',
      overlayKind: 'MOC_PQ',
      markers: [],
      labels: [],
    };

    expect(withOverlayHash(overlay).overlayHash).not.toBe(withOverlayHash({
      ...overlay,
      resultHash: 'result-2',
    }).overlayHash);
    expect(withOverlayHash(overlay).overlayHash).not.toBe(withOverlayHash({
      ...overlay,
      baseViewHash: 'view-2',
    }).overlayHash);
  });
});
