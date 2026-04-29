import type { AnySldSymbol, Connection as RenderConnection } from '../sld-editor/types';
import type {
  EngineeringElement,
  EngineeringSemanticModel,
  SldBaseProjectionViewModel,
  SldRenderClass,
  SldRoute,
  SldSymbolInstance,
} from './types';
import { normalizeForDeterministicHash, stableHash } from './semanticHashPolicy';

function symbolRenderClass(element: EngineeringElement | undefined): SldRenderClass {
  if (!element) return 'BLOKADA_SEMANTYCZNA';
  return element.completeness === 'SZKIC_LOGICZNY' ? 'PLANOWANY_SZKIC' : 'PRODUKCYJNY_TECHNICZNY';
}

function routeClass(connection: RenderConnection): SldRoute['routeClass'] {
  if (connection.connectionType === 'source' || connection.connectionType === 'load') return 'TOR_MOCY';
  return 'TOR_MOCY';
}

export function buildSldBaseProjectionViewModel(
  semanticModel: EngineeringSemanticModel | null,
  symbols: AnySldSymbol[],
  connections: RenderConnection[],
): SldBaseProjectionViewModel | null {
  if (!semanticModel) return null;

  const elementsByRef = new Map(semanticModel.elements.map((element) => [element.refId, element]));
  const symbolsView: SldSymbolInstance[] = symbols.map((symbol) => {
    const elementRef = symbol.elementId ?? symbol.id;
    const element = elementsByRef.get(elementRef);
    return {
      symbolId: symbol.id,
      elementRefId: elementRef,
      semanticHash: semanticModel.semanticHash,
      elementKind: element?.elementKind ?? 'BUSBAR_SECTION',
      engineeringRole: element?.engineeringRole ?? 'BUSBAR_SECTION',
      visibilityStatus: element ? 'WIDOCZNY' : 'BLOKADA_SEMANTYCZNA',
      renderClass: symbolRenderClass(element),
      rendererKey: `renderer:${element?.engineeringRole ?? 'BLOKADA_SEMANTYCZNA'}`,
      lodLevel: 'LOD_3',
    };
  });

  const semanticConnectionIds = new Set(semanticModel.connections.map((connection) => connection.connectionId));
  const routes: SldRoute[] = connections.flatMap((connection) => {
    const connectionId = semanticConnectionIds.has(connection.id)
      ? connection.id
      : semanticModel.connections.find((candidate) => candidate.connectionId.includes(connection.elementId ?? connection.id))?.connectionId
        ?? null;
    if (!connectionId) return [];
    return [{
      routeId: connection.id,
      connectionId,
      semanticHash: semanticModel.semanticHash,
      pathPoints: connection.path,
      routeClass: routeClass(connection),
    }];
  });

  const viewCore = normalizeForDeterministicHash({
    semanticHash: semanticModel.semanticHash,
    rendererRegistryHash: 'sld-renderer-registry-v8',
    layoutRegistryHash: 'sld-layout-registry-v8',
    lodPolicyHash: 'sld-lod-policy-v8',
    symbols: symbolsView,
    routes,
  });

  return {
    schemaVersion: 'v12-sld-view-v8',
    projectRefId: semanticModel.projectRefId,
    semanticHash: semanticModel.semanticHash,
    rendererRegistryHash: 'sld-renderer-registry-v8',
    layoutRegistryHash: 'sld-layout-registry-v8',
    lodPolicyHash: 'sld-lod-policy-v8',
    viewHash: stableHash(viewCore),
    symbols: symbolsView,
    routes,
    labels: [],
  };
}

export function assertSldSymbolRoleCopiesMatchSemanticModel(
  viewModel: SldBaseProjectionViewModel,
  semanticModel: EngineeringSemanticModel,
): string[] {
  const elementsByRef = new Map(semanticModel.elements.map((element) => [element.refId, element]));
  return viewModel.symbols.flatMap((symbol) => {
    const element = elementsByRef.get(symbol.elementRefId);
    if (!element) return [];
    if (element.elementKind !== symbol.elementKind || element.engineeringRole !== symbol.engineeringRole) {
      return [`${symbol.symbolId}:${symbol.elementRefId}`];
    }
    return [];
  });
}
