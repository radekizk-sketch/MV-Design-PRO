import type { CatalogNamespace, TypeCategory } from '../../catalog/types';
import { buildCatalogBinding } from '../../sld/catalogDefaults';

export type SegmentSelectionKind = 'KABEL_SN' | 'LINIA_NAPOWIETRZNA';

interface SegmentCatalogConfig {
  category: TypeCategory;
  namespace: CatalogNamespace;
  domainKind: 'KABEL' | 'LINIA_NAPOWIETRZNA';
}

const SEGMENT_CATALOG_CONFIG: Record<SegmentSelectionKind, SegmentCatalogConfig> = {
  KABEL_SN: {
    category: 'CABLE',
    namespace: 'KABEL_SN',
    domainKind: 'KABEL',
  },
  LINIA_NAPOWIETRZNA: {
    category: 'LINE',
    namespace: 'LINIA_SN',
    domainKind: 'LINIA_NAPOWIETRZNA',
  },
};

export function getSegmentCatalogConfig(kind: SegmentSelectionKind): SegmentCatalogConfig {
  return SEGMENT_CATALOG_CONFIG[kind];
}

export function buildSegmentCatalogBinding(kind: SegmentSelectionKind, catalogItemId: string) {
  const config = getSegmentCatalogConfig(kind);
  return buildCatalogBinding(config.namespace, catalogItemId);
}

export function buildTransformerCatalogBinding(catalogItemId: string) {
  return buildCatalogBinding('TRAFO_SN_NN', catalogItemId);
}
