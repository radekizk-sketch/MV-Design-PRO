import type { EnergyNetworkModel, Substation, Transformer } from '../../types/enm';

const BLOCK_TRANSFORMER_TOKEN_RE = /(^|[\s_/.-])(block|blokowy|blok|dedicated|dedykowany)([\s_/.-]|$)/u;

function nonEmptyRef(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function transformerRefs(transformer: Transformer): string[] {
  return [transformer.ref_id, transformer.id].filter(nonEmptyRef);
}

function stationRefs(station: Substation): Set<string> {
  return new Set([station.ref_id, station.id].filter(nonEmptyRef));
}

function collectStationBusRefs(
  snapshot: EnergyNetworkModel,
  station: Substation,
): Set<string> {
  const refs = new Set((station.bus_refs ?? []).filter(nonEmptyRef));
  const stationRefSet = stationRefs(station);

  for (const bus of snapshot.buses ?? []) {
    const record = bus as typeof bus & { readonly substation_ref?: string | null };
    if (record.substation_ref && stationRefSet.has(record.substation_ref)) {
      if (bus.ref_id) refs.add(bus.ref_id);
      if (bus.id) refs.add(bus.id);
    }
  }

  return refs;
}

export function collectDerBlockTransformerRefs(
  snapshot: EnergyNetworkModel | null | undefined,
): Set<string> {
  const refs = new Set<string>();
  for (const generator of snapshot?.generators ?? []) {
    const record = generator as typeof generator & {
      readonly blocking_transformer_ref?: string | null;
    };
    if (nonEmptyRef(record.blocking_transformer_ref)) {
      refs.add(record.blocking_transformer_ref);
    }
  }
  return refs;
}

export function isStationDistributionTransformer(
  transformer: Transformer,
  blockTransformerRefs: ReadonlySet<string>,
): boolean {
  if (transformerRefs(transformer).some((ref) => blockTransformerRefs.has(ref))) {
    return false;
  }

  const record = transformer as unknown as Record<string, unknown>;
  const catalogBinding = record.catalog_binding as Record<string, unknown> | undefined;
  const meta = record.meta as Record<string, unknown> | undefined;
  const tokens = [
    transformer.name,
    record.role,
    record.transformer_role,
    record.connection_variant,
    catalogBinding?.catalog_namespace,
    catalogBinding?.catalog_item_id,
    meta?.role,
    meta?.transformer_role,
    meta?.connection_variant,
    meta?.solution_kind,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return !BLOCK_TRANSFORMER_TOKEN_RE.test(tokens);
}

export function selectStationDistributionTransformers(
  snapshot: EnergyNetworkModel | null | undefined,
  station: Substation | null | undefined,
): Transformer[] {
  if (!snapshot || !station) return [];

  const explicitRefs = new Set((station.transformer_refs ?? []).filter(nonEmptyRef));
  const busRefs = collectStationBusRefs(snapshot, station);
  const blockTransformerRefs = collectDerBlockTransformerRefs(snapshot);

  return (snapshot.transformers ?? []).filter((transformer) => {
    if (!isStationDistributionTransformer(transformer, blockTransformerRefs)) {
      return false;
    }

    const refs = transformerRefs(transformer);
    if (refs.some((ref) => explicitRefs.has(ref))) {
      return true;
    }

    if (explicitRefs.size > 0) {
      return false;
    }

    return busRefs.has(transformer.hv_bus_ref) || busRefs.has(transformer.lv_bus_ref);
  });
}

export function selectStationDistributionTransformerRefs(
  snapshot: EnergyNetworkModel | null | undefined,
  station: Substation | null | undefined,
): string[] {
  const selected = selectStationDistributionTransformers(snapshot, station)
    .map((transformer) => transformer.ref_id ?? transformer.id)
    .filter(nonEmptyRef)
    .sort();
  if (selected.length > 0 || !station) {
    return selected;
  }

  const blockTransformerRefs = collectDerBlockTransformerRefs(snapshot);
  return (station.transformer_refs ?? [])
    .filter(nonEmptyRef)
    .filter((ref) => !blockTransformerRefs.has(ref))
    .filter((ref) => !BLOCK_TRANSFORMER_TOKEN_RE.test(ref.toLowerCase()))
    .sort();
}
