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

  const addId = (target: Set<string>, value: string | null | undefined) => {
    if (typeof value === 'string' && value.length > 0) {
      target.add(value);
    }
  };

  for (const section of canonicalAnnotations?.gpzSections ?? []) {
    addId(rootBusIds, section.rootBusId);
    for (const sourceNodeId of section.sourceNodeIds) {
      addId(sourceNodeIds, sourceNodeId);
    }
  }

  for (const field of canonicalAnnotations?.gpzFeederFields ?? []) {
    addId(rootBusIds, field.rootBusId);
    addId(fieldNodeIds, field.fieldId);
    addId(fieldNodeIds, field.feederNodeId);
    for (const section of field.detail?.busSections ?? []) {
      addId(rootBusIds, section.id);
    }
    for (const detailField of field.detail?.fields ?? []) {
      addId(fieldNodeIds, detailField.id);
      addId(rootBusIds, detailField.busSectionId);
      addId(fieldNodeIds, detailField.catalogRef?.elementId);
      addId(fieldNodeIds, detailField.terminals.incomingNodeId);
      addId(fieldNodeIds, detailField.terminals.outgoingNodeId);
      addId(fieldNodeIds, detailField.terminals.branchNodeId);
      addId(fieldNodeIds, detailField.terminals.generatorNodeId);
      for (const deviceId of detailField.deviceIds) {
        addId(fieldNodeIds, deviceId);
      }
    }
    for (const device of field.detail?.devices ?? []) {
      addId(fieldNodeIds, device.id);
      addId(fieldNodeIds, device.fieldId);
      addId(fieldNodeIds, device.catalogRef?.elementId);
      addId(fieldNodeIds, device.logicalBindings.boundCbId);
      for (const ctInputId of device.logicalBindings.ctInputIds) {
        addId(fieldNodeIds, ctInputId);
      }
    }
    for (const anchor of field.detail?.deviceAnchors ?? []) {
      addId(fieldNodeIds, anchor.deviceId);
      addId(fieldNodeIds, anchor.fieldId);
    }
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
  const canonicalIds = () => new Set([...rootBusIds, ...sourceNodeIds, ...fieldNodeIds]);
  const isCanonicalId = (value: string | null | undefined) => (
    typeof value === 'string' && canonicalIds().has(value)
  );
  const isCanonicalEndpoint = (value: string | null | undefined) => (
    typeof value === 'string'
    && (rootBusIds.has(value) || sourceNodeIds.has(value) || fieldNodeIds.has(value))
  );

  for (const symbol of symbols) {
    if (symbol.elementType === 'Source' && symbol.connectedToNodeId) {
      rootBusIds.add(symbol.connectedToNodeId);
      sourceNodeIds.add(symbol.id);
      sourceNodeIds.add(symbol.elementId);
    }
  }

  for (const symbol of symbols) {
    if (isCanonicalId(symbol.id) || isCanonicalId(symbol.elementId)) {
      suppressSymbol(symbol);
      continue;
    }

    if (symbol.elementType === 'Bus' && (rootBusIds.has(symbol.id) || rootBusIds.has(symbol.elementId))) {
      suppressSymbol(symbol);
      continue;
    }

    if (symbol.elementType === 'Source') {
      suppressSymbol(symbol);
      continue;
    }

    if (symbol.elementType === 'Switch') {
      if (isCanonicalEndpoint(symbol.fromNodeId) || isCanonicalEndpoint(symbol.toNodeId)) {
        suppressSymbol(symbol);
        continue;
      }
      const switchName = symbol.elementName.toLocaleLowerCase('pl-PL');
      if (switchName.includes('sprzęg') || switchName.includes('sprzeg')) {
        suppressSymbol(symbol);
        continue;
      }
    }

    if (symbol.elementType === 'TransformerBranch') {
      if (isCanonicalEndpoint(symbol.fromNodeId) || isCanonicalEndpoint(symbol.toNodeId)) {
        suppressSymbol(symbol);
      }
    }

    if (symbol.elementType === 'LineBranch') {
      if (isCanonicalEndpoint(symbol.fromNodeId) || isCanonicalEndpoint(symbol.toNodeId)) {
        suppressSymbol(symbol);
      }
    }

    if (
      (symbol.elementType === 'Measurement'
        || symbol.elementType === 'ProtectionAssignment'
        || symbol.elementType === 'Relay')
      && isCanonicalEndpoint(symbol.connectedToNodeId)
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

  return connections.filter((connection) => {
    const fromSuppressed = suppressedIds.has(connection.fromSymbolId);
    const toSuppressed = suppressedIds.has(connection.toSymbolId);
    const elementSuppressed = connection.elementId ? suppressedIds.has(connection.elementId) : false;

    return !fromSuppressed && !toSuppressed && !elementSuppressed;
  });
}
