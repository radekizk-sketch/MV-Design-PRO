import type { AnySldSymbol, Connection as RenderConnection } from '../sld-editor/types';
import type { CanonicalAnnotationsV1 } from './core/layoutResult';

export function hasCanonicalGpzSwitchgear(
  canonicalAnnotations: CanonicalAnnotationsV1 | null | undefined,
): boolean {
  return Boolean(
    (canonicalAnnotations?.gpzSections?.length ?? 0) > 0
      || (canonicalAnnotations?.gpzFeederFields?.length ?? 0) > 0,
  );
}

function collectCanonicalIds(canonicalAnnotations: CanonicalAnnotationsV1 | null | undefined) {
  const rootBusIds = new Set<string>();
  const sourceNodeIds = new Set<string>();
  const fieldNodeIds = new Set<string>();

  for (const section of canonicalAnnotations?.gpzSections ?? []) {
    rootBusIds.add(section.rootBusId);
    for (const sourceNodeId of section.sourceNodeIds) {
      sourceNodeIds.add(sourceNodeId);
    }
  }

  for (const field of canonicalAnnotations?.gpzFeederFields ?? []) {
    fieldNodeIds.add(field.fieldId);
    fieldNodeIds.add(field.feederNodeId);
  }

  return { rootBusIds, sourceNodeIds, fieldNodeIds };
}

export function collectGpzSwitchgearSuppressedSymbolIds(
  symbols: readonly AnySldSymbol[],
  canonicalAnnotations: CanonicalAnnotationsV1 | null | undefined,
): ReadonlySet<string> {
  if (!hasCanonicalGpzSwitchgear(canonicalAnnotations)) {
    return new Set<string>();
  }

  const { rootBusIds, sourceNodeIds, fieldNodeIds } = collectCanonicalIds(canonicalAnnotations);
  const suppressed = new Set<string>();

  const suppressSymbol = (symbol: AnySldSymbol) => {
    suppressed.add(symbol.id);
    suppressed.add(symbol.elementId);
  };

  for (const symbol of symbols) {
    if (symbol.elementType === 'Bus' && (rootBusIds.has(symbol.id) || rootBusIds.has(symbol.elementId))) {
      suppressSymbol(symbol);
      continue;
    }

    if (fieldNodeIds.has(symbol.id) || fieldNodeIds.has(symbol.elementId)) {
      suppressSymbol(symbol);
      continue;
    }

    if (
      symbol.elementType === 'Source'
      && (
        sourceNodeIds.has(symbol.id)
        || sourceNodeIds.has(symbol.elementId)
        || rootBusIds.has(symbol.connectedToNodeId)
      )
    ) {
      suppressSymbol(symbol);
    }
  }

  return suppressed;
}

export function shouldSuppressForGpzSwitchgear(
  symbol: AnySldSymbol,
  suppressedIds: ReadonlySet<string>,
): boolean {
  return suppressedIds.has(symbol.id) || suppressedIds.has(symbol.elementId);
}

export function filterConnectionsForGpzSwitchgear(
  connections: readonly RenderConnection[],
  suppressedIds: ReadonlySet<string>,
): RenderConnection[] {
  if (suppressedIds.size === 0) {
    return [...connections];
  }

  return connections.filter(
    (connection) =>
      !suppressedIds.has(connection.fromSymbolId)
      && !suppressedIds.has(connection.toSymbolId)
      && !(connection.elementId && suppressedIds.has(connection.elementId)),
  );
}
