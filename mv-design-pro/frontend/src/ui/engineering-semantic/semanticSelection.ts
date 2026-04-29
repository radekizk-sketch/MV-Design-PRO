import type { ElementType, SelectedElement } from '../types';
import type { SemanticContextMenuElement } from './semanticContextActions';
import type {
  EngineeringElement,
  EngineeringElementKind,
  EngineeringSemanticModel,
} from './types';

export function buildSemanticElementMap(
  semanticModel: EngineeringSemanticModel | null | undefined,
): Map<string, EngineeringElement> {
  return new Map((semanticModel?.elements ?? []).map((element) => [element.refId, element]));
}

export function findSemanticElement(
  semanticModel: EngineeringSemanticModel | null | undefined,
  elementRef: string,
): EngineeringElement | null {
  return semanticModel?.elements.find((element) => element.refId === elementRef) ?? null;
}

export function mapSemanticElementKindToElementType(elementKind: EngineeringElementKind): ElementType {
  switch (elementKind) {
    case 'GPZ':
    case 'SOURCE':
      return 'Source';
    case 'BUSBAR_SYSTEM':
    case 'BUSBAR_SECTION':
      return 'Bus';
    case 'MV_BAY':
      return 'BaySN';
    case 'MV_CABLE_SEGMENT':
    case 'MV_OVERHEAD_SEGMENT':
      return 'LineBranch';
    case 'TRANSFORMER':
      return 'TransformerBranch';
    case 'SWITCHGEAR_DEVICE':
      return 'Switch';
    case 'MEASUREMENT':
      return 'Measurement';
    case 'PROTECTION_RELAY':
      return 'ProtectionAssignment';
    case 'MV_LV_STATION':
    case 'MV_SWITCHING_STATION':
      return 'Station';
    case 'BRANCH_POINT_SN':
      return 'BranchPole';
    case 'CONVERTER':
      return 'Generator';
    case 'LV_LOAD':
      return 'Load';
    default:
      return 'Bus';
  }
}

export function createSemanticSelectedElement(
  elementId: string,
  fallbackType: ElementType,
  elementName: string,
  semanticModel: EngineeringSemanticModel | null | undefined,
  semanticElementByRef: ReadonlyMap<string, EngineeringElement> = buildSemanticElementMap(semanticModel),
): SelectedElement {
  const semanticElement = semanticElementByRef.get(elementId);
  const resolvedElementType = semanticElement
    ? mapSemanticElementKindToElementType(semanticElement.elementKind)
    : fallbackType;

  return {
    id: elementId,
    type: resolvedElementType,
    name: elementName,
    semanticHash: semanticElement ? semanticModel?.semanticHash : undefined,
    semanticElementKind: semanticElement?.elementKind,
    semanticEngineeringRole: semanticElement?.engineeringRole,
    semanticCompleteness: semanticElement?.completeness,
    semanticVoltageDomain: semanticElement?.voltageDomain,
    semanticDataQualityState: semanticElement?.dataQualityState,
  };
}

export function createSemanticContextMenuElement(
  element: EngineeringElement | undefined,
  semanticModel: EngineeringSemanticModel | null | undefined,
): SemanticContextMenuElement | undefined {
  if (!element) {
    return undefined;
  }

  return {
    refId: element.refId,
    engineeringRole: element.engineeringRole,
    elementKind: element.elementKind,
    semanticHash: semanticModel?.semanticHash,
  };
}
