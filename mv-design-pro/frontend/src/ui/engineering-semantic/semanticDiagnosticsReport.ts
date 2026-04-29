import type {
  EngineeringDiagnosticsProjection,
  EngineeringElement,
  EngineeringSemanticModel,
  LegacySemanticMapping,
  SemanticDiagnosticsReport,
  SldBaseProjectionViewModel,
} from './types';

export interface SemanticDiagnosticsReportInput {
  enmElementRefIds: string[];
  semanticModel: EngineeringSemanticModel;
  diagnosticsProjection: EngineeringDiagnosticsProjection;
  sldViewModel: SldBaseProjectionViewModel | null;
  legacyMappings?: LegacySemanticMapping[];
}

export function buildSemanticDiagnosticsReport({
  enmElementRefIds,
  semanticModel,
  diagnosticsProjection,
  sldViewModel,
  legacyMappings = [],
}: SemanticDiagnosticsReportInput): SemanticDiagnosticsReport {
  const semanticElementIds = new Set(semanticModel.elements.map((element) => element.refId));
  const symbols = sldViewModel?.symbols ?? [];
  const blockedSymbolIds = new Set(
    symbols
      .filter((symbol) => symbol.renderClass === 'BLOKADA_SEMANTYCZNA' || symbol.visibilityStatus === 'BLOKADA_SEMANTYCZNA')
      .map((symbol) => symbol.elementRefId),
  );

  return {
    schemaVersion: 'v12-semantic-diagnostics-report-v8',
    projectRefId: semanticModel.projectRefId,
    semanticHash: semanticModel.semanticHash,
    diagnosticsHash: diagnosticsProjection.diagnosticsHash,
    generatedAt: new Date(0).toISOString(),
    totals: {
      enmElements: enmElementRefIds.length,
      semanticElements: semanticModel.elements.length,
      sldSymbols: symbols.length,
      violations: diagnosticsProjection.violations.length,
      legacyMappings: legacyMappings.length,
    },
    enmElementsWithoutSemanticElement: stableUnique(
      enmElementRefIds.filter((refId) => !semanticElementIds.has(refId)),
    ),
    semanticElementsWithoutRole: stableUnique(
      semanticModel.elements
        .filter((element) => !element.engineeringRole)
        .map((element) => element.refId),
    ),
    semanticElementsWithoutPorts: stableUnique(
      semanticModel.elements
        .filter((element) => requiresPorts(element) && element.ports.length === 0)
        .map((element) => element.refId),
    ),
    semanticElementsWithoutNetworkPosition: stableUnique(
      semanticModel.elements
        .filter((element) => !element.networkPosition || element.networkPosition.projectRefId !== semanticModel.projectRefId)
        .map((element) => element.refId),
    ),
    semanticElementsWithoutCatalogOrEquivalent: stableUnique(
      semanticModel.elements
        .filter((element) => element.completeness !== 'MODEL_TECHNICZNY_PELNY')
        .map((element) => element.refId),
    ),
    enmElementsNotProductionRenderable: stableUnique([
      ...enmElementRefIds.filter((refId) => !semanticElementIds.has(refId)),
      ...Array.from(blockedSymbolIds),
    ]),
    elementsRenderedAsSketch: stableUnique(
      symbols
        .filter((symbol) => symbol.renderClass === 'PLANOWANY_SZKIC')
        .map((symbol) => symbol.elementRefId),
    ),
    elementsRenderedAsSemanticBlock: stableUnique([
      ...Array.from(blockedSymbolIds),
      ...diagnosticsProjection.violations
        .filter((violation) => violation.severity === 'BLOKADA_RENDERU' && violation.elementRefId)
        .map((violation) => violation.elementRefId as string),
    ]),
    legacyMappings: [...legacyMappings].sort((left, right) => left.enmRefId.localeCompare(right.enmRefId)),
    legacySilentPromotionRefIds: assertNoSilentLegacyPromotion(legacyMappings),
  };
}

export function assertNoSilentLegacyPromotion(legacyMappings: LegacySemanticMapping[]): string[] {
  return stableUnique(
    legacyMappings
      .filter((mapping) => (
        mapping.status !== 'ZMAPOWANY_PELNIE'
        && (
          mapping.completeness === 'MODEL_TECHNICZNY_PELNY'
          || mapping.canRenderProduction
          || mapping.canCalculate
          || mapping.canReport
        )
      ))
      .map((mapping) => mapping.enmRefId),
  );
}

function requiresPorts(element: EngineeringElement): boolean {
  return [
    'MV_BAY',
    'MV_CABLE_SEGMENT',
    'LV_CABLE_SEGMENT',
    'MV_OVERHEAD_SEGMENT',
    'TRANSFORMER',
    'CONVERTER',
    'SOURCE',
    'LV_LOAD',
    'BUSBAR_SECTION',
  ].includes(element.elementKind);
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
