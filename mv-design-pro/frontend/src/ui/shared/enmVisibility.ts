import type { Bus, EnergyNetworkModel } from '../../types/enm';

export const INLINE_TERMINAL_VISUAL_ROLE = 'INLINE_TERMINAL';

type MinimalBusLike = Pick<Bus, 'tags' | 'meta' | 'ref_id'> & Partial<Pick<Bus, 'id' | 'name'>>;
type MinimalBranchLike = {
  type?: unknown;
  tags?: unknown;
  meta?: unknown;
  ref_id?: unknown;
  id?: unknown;
  name?: unknown;
  length_km?: unknown;
  lengthKm?: unknown;
  length?: unknown;
  catalog_namespace?: unknown;
};

function normalizeBusToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isInlineHelperBus(bus: MinimalBusLike): boolean {
  const tags = Array.isArray(bus.tags) ? bus.tags : [];
  if (tags.includes('helper_bus') || tags.includes('topology_terminal')) {
    return true;
  }

  const meta = bus.meta ?? {};
  if (
    meta.visual_role === INLINE_TERMINAL_VISUAL_ROLE
    || meta.render_on_sld === false
    || meta.show_in_project_tree === false
  ) {
    return true;
  }

  const refId = normalizeBusToken(bus.ref_id);
  const id = normalizeBusToken(bus.id);
  const name = normalizeBusToken(bus.name);

  return (
    refId.includes('/downstream')
    || refId.includes('/upstream')
    || refId.includes('/switch_node')
    || refId.includes('/switch_node_2')
    || id.includes('/downstream')
    || id.includes('/upstream')
    || id.includes('/switch_node')
    || id.includes('/switch_node_2')
    || name.includes('downstream')
    || name.includes('upstream')
    || name.includes('wnstream')
  );
}

export function isOperationalBus(bus: MinimalBusLike): boolean {
  return !isInlineHelperBus(bus);
}

export function isTerrainSnSegment(branch: MinimalBranchLike): boolean {
  const type = normalizeBusToken(branch.type);
  if (type !== 'cable' && type !== 'line_overhead') {
    return false;
  }

  const tags = Array.isArray(branch.tags) ? branch.tags.map(normalizeBusToken) : [];
  const meta = (branch.meta && typeof branch.meta === 'object')
    ? branch.meta as Record<string, unknown>
    : {};
  if (
    meta.render_on_sld === false
    || meta.show_in_project_tree === false
    || meta.internal === true
    || meta.is_internal === true
    || tags.includes('apparatus')
    || tags.includes('field_terminal')
    || tags.includes('internal_branch')
  ) {
    return false;
  }

  const rawLength = branch.length_km ?? branch.lengthKm ?? branch.length;
  const lengthKm = typeof rawLength === 'number' ? rawLength : Number(rawLength);
  if (!Number.isFinite(lengthKm) || lengthKm <= 0) {
    return false;
  }

  const namespace = normalizeBusToken(branch.catalog_namespace);
  if (namespace && namespace !== 'kabel_sn' && namespace !== 'linia_sn') {
    return false;
  }

  const ref = normalizeBusToken(branch.ref_id);
  const id = normalizeBusToken(branch.id);
  const name = normalizeBusToken(branch.name);
  return (
    ref.startsWith('seg/')
    || id.startsWith('seg/')
    || name.includes('odcinek')
    || name.includes('kabel')
    || name.includes('linia')
  );
}

export function publicBusName(bus: MinimalBusLike): string {
  const currentName = typeof bus.name === 'string' && bus.name.trim() ? bus.name.trim() : '';
  if (!isInlineHelperBus(bus)) {
    return currentName || String(bus.ref_id ?? bus.id ?? 'Szyna SN');
  }

  const refId = normalizeBusToken(bus.ref_id);
  const id = normalizeBusToken(bus.id);
  if (refId.includes('/downstream') || id.includes('/downstream')) {
    return 'Zacisk końcowy odcinka SN';
  }
  if (refId.includes('/upstream') || id.includes('/upstream')) {
    return 'Zacisk początkowy odcinka SN';
  }
  if (currentName && !normalizeBusToken(currentName).includes('wnstream')) {
    return currentName;
  }
  return 'Zacisk techniczny układu SN';
}

export function findOperationalBus(
  snapshot: EnergyNetworkModel | null,
  refOrId: string | null | undefined,
): Bus | null {
  if (!snapshot || typeof refOrId !== 'string' || !refOrId.trim()) {
    return null;
  }

  const match = (snapshot.buses ?? []).find(
    (bus) => bus.ref_id === refOrId || bus.id === refOrId,
  );
  return match && isOperationalBus(match) ? match : null;
}
