import { describe, expect, it } from 'vitest';

import { buildEngineeringDiagnosticsProjection } from '../diagnostics';
import {
  assertNoSilentLegacyPromotion,
  buildSemanticDiagnosticsReport,
} from '../semanticDiagnosticsReport';
import type {
  EngineeringDiagnosticsProjection,
  LegacySemanticMapping,
  SldBaseProjectionViewModel,
} from '../types';
import { defaultReportEligibility } from '../types';
import { busbarElement, semanticModel } from './contractTestFixtures';

const reportEligibility = defaultReportEligibility('NIERAPORTOWALNY_BRAK_DANYCH');

describe('semantic diagnostics report', () => {
  it('compares ENM, semantic projection, SLD renderability and legacy mapping status', () => {
    const sketchElement = {
      ...busbarElement,
      refId: 'segment-sketch',
      elementKind: 'MV_CABLE_SEGMENT' as const,
      engineeringRole: 'MV_CABLE_SEGMENT' as const,
      completeness: 'SZKIC_LOGICZNY' as const,
      ports: [],
    };
    const model = {
      ...semanticModel,
      elements: [busbarElement, sketchElement],
      physicalTopologyGraph: {
        ...semanticModel.physicalTopologyGraph,
        elementRefs: [busbarElement.refId, sketchElement.refId],
      },
    };
    const diagnosticsProjection = buildEngineeringDiagnosticsProjection(model) as EngineeringDiagnosticsProjection;
    const sldViewModel: SldBaseProjectionViewModel = {
      schemaVersion: 'v12-sld-view-v8',
      projectRefId: model.projectRefId,
      semanticHash: model.semanticHash,
      rendererRegistryHash: 'renderer-v8',
      layoutRegistryHash: 'layout-v8',
      lodPolicyHash: 'lod-v8',
      viewHash: 'view-1',
      routes: [],
      labels: [],
      symbols: [{
        symbolId: 'symbol-sketch',
        elementRefId: sketchElement.refId,
        semanticHash: model.semanticHash,
        elementKind: 'MV_CABLE_SEGMENT',
        engineeringRole: 'MV_CABLE_SEGMENT',
        visibilityStatus: 'WIDOCZNY',
        renderClass: 'PLANOWANY_SZKIC',
        rendererKey: 'renderer:MV_CABLE_SEGMENT',
        lodLevel: 'LOD_3',
      }, {
        symbolId: 'symbol-blocked',
        elementRefId: 'legacy-without-role',
        semanticHash: model.semanticHash,
        elementKind: 'BUSBAR_SECTION',
        engineeringRole: 'BUSBAR_SECTION',
        visibilityStatus: 'BLOKADA_SEMANTYCZNA',
        renderClass: 'BLOKADA_SEMANTYCZNA',
        rendererKey: 'renderer:BLOKADA_SEMANTYCZNA',
        lodLevel: 'LOD_3',
      }],
    };
    const legacyMappings: LegacySemanticMapping[] = [{
      enmRefId: 'legacy-without-role',
      semanticElementRefId: null,
      status: 'WYMAGA_DECYZJI_UZYTKOWNIKA',
      completeness: 'SZKIC_LOGICZNY',
      reportEligibility,
      canRenderProduction: false,
      canCalculate: false,
      canReport: false,
      recognizedFields: [],
      missingFields: ['engineeringRole'],
      violationCodes: ['SEM-SLD-001'],
    }];

    const report = buildSemanticDiagnosticsReport({
      enmElementRefIds: [busbarElement.refId, sketchElement.refId, 'legacy-without-role'],
      semanticModel: model,
      diagnosticsProjection,
      sldViewModel,
      legacyMappings,
    });

    expect(report.enmElementsWithoutSemanticElement).toEqual(['legacy-without-role']);
    expect(report.semanticElementsWithoutCatalogOrEquivalent).toEqual(['segment-sketch']);
    expect(report.semanticElementsWithoutPorts).toEqual(['bus-1', 'segment-sketch']);
    expect(report.enmElementsNotProductionRenderable).toEqual(['legacy-without-role']);
    expect(report.elementsRenderedAsSketch).toEqual(['segment-sketch']);
    expect(report.elementsRenderedAsSemanticBlock).toEqual(['legacy-without-role']);
    expect(report.legacyMappings).toEqual(legacyMappings);
    expect(report.legacySilentPromotionRefIds).toEqual([]);
  });

  it('blocks silent promotion of partial legacy mapping to full technical model', () => {
    expect(assertNoSilentLegacyPromotion([{
      enmRefId: 'legacy-partial',
      semanticElementRefId: 'element-1',
      status: 'ZMAPOWANY_CZESCIOWO',
      completeness: 'MODEL_TECHNICZNY_PELNY',
      reportEligibility: defaultReportEligibility('RAPORTOWALNY'),
      canRenderProduction: true,
      canCalculate: true,
      canReport: true,
      recognizedFields: ['engineeringRole'],
      missingFields: ['catalogMaterializationRef'],
      violationCodes: ['SEM-CATALOG-001'],
    }])).toEqual(['legacy-partial']);
  });
});
