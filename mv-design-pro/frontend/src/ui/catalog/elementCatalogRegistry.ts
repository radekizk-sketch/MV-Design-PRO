import type { TreeNodeType } from '../types';
import type { CatalogNamespace, TypeCategory } from './types';

export const ELEMENT_TYPE_TO_NAMESPACE: Readonly<Record<string, CatalogNamespace>> = {
  line_overhead: 'LINIA_SN',
  cable: 'KABEL_SN',
  source: 'ZRODLO_SN',
  Source: 'ZRODLO_SN',
  transformer: 'TRAFO_SN_NN',
  circuit_breaker: 'APARAT_SN',
  disconnector: 'APARAT_SN',
  load_switch: 'APARAT_SN',
  fuse: 'APARAT_SN',
  lv_breaker: 'APARAT_NN',
  lv_switch: 'APARAT_NN',
  lv_fuse: 'APARAT_NN',
  lv_cable: 'KABEL_NN',
  ct: 'CT',
  vt: 'VT',
  load: 'OBCIAZENIE',
  pv_inverter: 'ZRODLO_NN_PV',
  bess_inverter: 'ZRODLO_NN_BESS',
  protection_device: 'ZABEZPIECZENIE',
  relay: 'ZABEZPIECZENIE',
} as const;

export const NAMESPACE_TO_PICKER_CATEGORY: Readonly<Record<CatalogNamespace, TypeCategory>> = {
  LINIA_SN: 'LINE',
  KABEL_SN: 'CABLE',
  ZRODLO_SN: 'SYSTEM_SOURCE',
  TRAFO_SN_NN: 'TRANSFORMER',
  APARAT_SN: 'MV_APPARATUS',
  APARAT_NN: 'LV_APPARATUS',
  KABEL_NN: 'LV_CABLE',
  CT: 'CT',
  VT: 'VT',
  OBCIAZENIE: 'LOAD',
  ZRODLO_NN_PV: 'PV_INVERTER',
  ZRODLO_NN_BESS: 'BESS_INVERTER',
  ZABEZPIECZENIE: 'PROTECTION_DEVICE',
  NASTAWY_ZABEZPIECZEN: 'PROTECTION_DEVICE',
  CONVERTER: 'CONVERTER',
  INVERTER: 'CONVERTER',
  mv_branch_points: 'BRANCH_POLE',
} as const;

export const NAMESPACE_TO_TREE_NODE: Readonly<Partial<Record<CatalogNamespace, TreeNodeType>>> = {
  LINIA_SN: 'LINE_TYPES',
  KABEL_SN: 'CABLE_TYPES',
  ZRODLO_SN: 'ELEMENT',
  TRAFO_SN_NN: 'TRANSFORMER_TYPES',
  APARAT_SN: 'SWITCH_EQUIPMENT_TYPES',
} as const;

export const NAMESPACE_LABEL_PL: Readonly<Record<CatalogNamespace, string>> = {
  LINIA_SN: 'Typy linii napowietrznych',
  KABEL_SN: 'Typy kabli SN',
  ZRODLO_SN: 'Typy zasilania systemowego SN',
  TRAFO_SN_NN: 'Typy transformatorów SN/nN',
  APARAT_SN: 'Typy aparatury SN',
  APARAT_NN: 'Typy aparatury nN',
  KABEL_NN: 'Typy kabli nN',
  CT: 'Typy przekładników prądowych',
  VT: 'Typy przekładników napięciowych',
  OBCIAZENIE: 'Typy obciążeń',
  ZRODLO_NN_PV: 'Typy falowników PV',
  ZRODLO_NN_BESS: 'Typy falowników BESS',
  ZABEZPIECZENIE: 'Typy zabezpieczeń',
  NASTAWY_ZABEZPIECZEN: 'Szablony nastaw zabezpieczeń',
  CONVERTER: 'Typy konwerterów',
  INVERTER: 'Typy inwerterów',
  mv_branch_points: 'Typy punktów rozgałęzienia SN',
} as const;

export const TREE_NODE_TO_NAMESPACE: Readonly<Partial<Record<TreeNodeType, CatalogNamespace>>> =
  Object.fromEntries(
    Object.entries(NAMESPACE_TO_TREE_NODE).map(([namespace, treeNode]) => [
      treeNode,
      namespace as CatalogNamespace,
    ]),
  );

export const PICKER_CATEGORY_TO_NAMESPACE: Readonly<Partial<Record<TypeCategory, CatalogNamespace>>> =
  Object.fromEntries(
    Object.entries(NAMESPACE_TO_PICKER_CATEGORY)
      .filter(([namespace]) => !['NASTAWY_ZABEZPIECZEN', 'CONVERTER', 'INVERTER'].includes(namespace))
      .map(([namespace, category]) => [category, namespace as CatalogNamespace]),
  );

export function getNamespaceForElement(enmElementType: string): CatalogNamespace | undefined {
  return ELEMENT_TYPE_TO_NAMESPACE[enmElementType];
}

export function getPickerCategory(namespace: CatalogNamespace): TypeCategory {
  return NAMESPACE_TO_PICKER_CATEGORY[namespace];
}

export function getPickerCategoryForElement(enmElementType: string): TypeCategory | undefined {
  const namespace = getNamespaceForElement(enmElementType);
  return namespace ? getPickerCategory(namespace) : undefined;
}

export function requiresCatalogBinding(enmElementType: string): boolean {
  return enmElementType in ELEMENT_TYPE_TO_NAMESPACE;
}

export function getNamespaceLabelPl(namespace: CatalogNamespace): string {
  return NAMESPACE_LABEL_PL[namespace];
}

export function getNamespaceForTreeNode(treeNodeType: TreeNodeType): CatalogNamespace | undefined {
  return TREE_NODE_TO_NAMESPACE[treeNodeType] as CatalogNamespace | undefined;
}

export const CATALOG_TREE_NAMESPACES: readonly CatalogNamespace[] = [
  'LINIA_SN',
  'KABEL_SN',
  'ZRODLO_SN',
  'TRAFO_SN_NN',
  'APARAT_SN',
] as const;

export interface CatalogTreeEntry {
  namespace: CatalogNamespace;
  treeNodeType: TreeNodeType;
  labelPl: string;
  pickerCategory: TypeCategory;
}

export function getCatalogTreeEntries(): CatalogTreeEntry[] {
  return CATALOG_TREE_NAMESPACES.map((namespace) => ({
    namespace,
    treeNodeType: NAMESPACE_TO_TREE_NODE[namespace]!,
    labelPl: NAMESPACE_LABEL_PL[namespace],
    pickerCategory: NAMESPACE_TO_PICKER_CATEGORY[namespace],
  }));
}
