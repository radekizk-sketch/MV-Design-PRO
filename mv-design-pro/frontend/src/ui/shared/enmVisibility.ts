import type { Bus, EnergyNetworkModel } from '../../types/enm';

export const INLINE_TERMINAL_VISUAL_ROLE = 'INLINE_TERMINAL';

type MinimalBusLike = Pick<Bus, 'tags' | 'meta' | 'ref_id'> & Partial<Pick<Bus, 'id' | 'name'>>;

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
