import { withViewHash } from './projections';
import type { AnySldSymbol, Connection } from '../sld-editor/types';
import type {
  EngineeringElement,
  EngineeringSemanticModel,
  SldBaseProjectionViewModel,
  SldRoute,
  SldSymbolInstance,
} from './types';

export interface BuildSldBaseProjectionOptions {
  projectRefId?: string;
  rendererRegistryHash?: string;
  layoutRegistryHash?: string;
  lodPolicyHash?: string;
}

export function buildSldBaseProjectionFromSemantic(
  model: EngineeringSemanticModel,
  symbols: readonly AnySldSymbol[],
  connections: readonly Connection[],
  options: BuildSldBaseProjectionOptions = {},
): SldBaseProjectionViewModel {
  const elementByRef = new Map(model.elements.map((element) => [element.refId, element] as const));
  const semanticConnectionByElementRef = buildConnectionIndex(model);

  const sldSymbols: SldSymbolInstance[] = symbols
    .map((symbol) => toSldSymbolInstance(symbol, elementByRef.get(symbol.elementId), model.semanticHash))
    .filter((symbol): symbol is SldSymbolInstance => symbol !== null)
    .sort((left, right) => left.symbolId.localeCompare(right.symbolId));

  const routes: SldRoute[] = connections
    .map((connection) => {
      const semanticConnection = semanticConnectionByElementRef.get(connection.elementId ?? connection.id);
      if (!semanticConnection) {
        return null;
      }
      return {
        routeId: connection.id,
        connectionId: semanticConnection.connectionId,
        semanticHash: model.semanticHash,
        pathPoints: connection.path,
        routeClass: semanticConnection.connectionKind === 'POWIAZANIE_RAPORTOWE'
          ? 'TOR_LOGICZNY'
          : semanticConnection.connectionKind,
      } satisfies SldRoute;
    })
    .filter((route): route is SldRoute => route !== null)
    .sort((left, right) => left.routeId.localeCompare(right.routeId));

  return withViewHash({
    schemaVersion: 'v12-sld-view-v1',
    projectRefId: options.projectRefId ?? model.projectRefId,
    semanticHash: model.semanticHash,
    rendererRegistryHash: options.rendererRegistryHash ?? 'renderer-registry-v1',
    layoutRegistryHash: options.layoutRegistryHash ?? 'layout-registry-v1',
    lodPolicyHash: options.lodPolicyHash ?? 'lod-policy-v1',
    symbols: sldSymbols,
    routes,
    labels: symbols
      .map((symbol) => ({
        labelId: `${symbol.id}:label`,
        elementRefId: symbol.elementId,
        text: symbol.elementName,
      }))
      .sort((left, right) => left.labelId.localeCompare(right.labelId)),
  });
}

export function assertSldSymbolCopiesMatchSemanticModel(
  model: EngineeringSemanticModel,
  projection: SldBaseProjectionViewModel,
): string[] {
  const elementByRef = new Map(model.elements.map((element) => [element.refId, element] as const));
  const issues: string[] = [];
  for (const symbol of projection.symbols) {
    const element = elementByRef.get(symbol.elementRefId);
    if (!element) {
      issues.push(`SEM-SLD-001:${symbol.elementRefId}`);
      continue;
    }
    if (symbol.elementKind !== element.elementKind || symbol.engineeringRole !== element.engineeringRole) {
      issues.push(`SEM-SLD-ROLE-COPY:${symbol.elementRefId}`);
    }
  }
  return issues;
}

function toSldSymbolInstance(
  symbol: AnySldSymbol,
  element: EngineeringElement | undefined,
  semanticHash: string,
): SldSymbolInstance | null {
  if (!element) {
    return null;
  }
  return {
    symbolId: symbol.id,
    elementRefId: element.refId,
    semanticHash,
    elementKind: element.elementKind,
    engineeringRole: element.engineeringRole,
    visibilityStatus: 'WIDOCZNY',
    renderClass: element.completeness === 'SZKIC_LOGICZNY' ? 'PLANOWANY_SZKIC' : 'PRODUKCYJNY_TECHNICZNY',
    rendererKey: `${element.elementKind}:${element.engineeringRole}`,
    lodLevel: 'LOD_3',
  };
}

function buildConnectionIndex(model: EngineeringSemanticModel) {
  const index = new Map<string, EngineeringSemanticModel['connections'][number]>();
  for (const connection of model.connections) {
    const ownerRefs = [
      connection.connectionId.split(':conn:')[0],
      connection.fromPortId.split(':')[0],
      connection.toPortId.split(':')[0],
    ].filter(Boolean);
    for (const ownerRef of ownerRefs) {
      if (!index.has(ownerRef)) {
        index.set(ownerRef, connection);
      }
    }
    index.set(connection.connectionId, connection);
  }
  return index;
}
