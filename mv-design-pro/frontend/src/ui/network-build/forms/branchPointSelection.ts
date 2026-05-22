import type {
  BranchPointSN,
  DomainOpResponseV1,
  EnergyNetworkModel,
} from '../../../types/enm';
import type { ElementType, SelectedElement } from '../../types';

type BranchPointKind = BranchPointSN['branch_point_type'];

function branchPointRef(branchPoint: BranchPointSN): string {
  return branchPoint.ref_id || branchPoint.id;
}

function elementTypeFromBranchPointKind(kind: BranchPointKind): ElementType {
  return kind === 'zksn' ? 'ZKSN' : 'BranchPole';
}

function publicBranchPointName(branchPoint: BranchPointSN, fallbackName: string): string {
  const name = branchPoint.name?.trim();
  if (name && !name.includes('bp/') && !name.includes('/')) return name;
  return branchPoint.branch_point_type === 'zksn' ? 'ZK SN' : fallbackName;
}

function findBranchPoint(
  snapshot: EnergyNetworkModel | null | undefined,
  elementId: string,
  expectedKind: BranchPointKind,
): BranchPointSN | null {
  return (
    snapshot?.branch_points?.find((branchPoint) => (
      branchPoint.branch_point_type === expectedKind
      && (branchPointRef(branchPoint) === elementId || branchPoint.id === elementId)
    ))
    ?? null
  );
}

export function branchPointSelectionFromMaterialization(
  response: DomainOpResponseV1,
  expectedKind: BranchPointKind,
  fallbackName: string,
  previousSnapshot: EnergyNetworkModel | null | undefined,
): SelectedElement | null {
  const hintedId = response.selection_hint?.element_id;
  if (hintedId) {
    const hinted = findBranchPoint(response.snapshot, hintedId, expectedKind);
    if (hinted) {
      return {
        id: branchPointRef(hinted),
        type: elementTypeFromBranchPointKind(expectedKind),
        name: publicBranchPointName(hinted, fallbackName),
      };
    }
  }

  const createdRefs = new Set(response.changes?.created_element_ids ?? []);
  const previousRefs = new Set(
    (previousSnapshot?.branch_points ?? []).map((branchPoint) => branchPointRef(branchPoint)),
  );

  const createdBranchPoint = (response.snapshot?.branch_points ?? []).find((branchPoint) => {
    if (branchPoint.branch_point_type !== expectedKind) return false;
    const ref = branchPointRef(branchPoint);
    return createdRefs.has(ref) || createdRefs.has(branchPoint.id) || !previousRefs.has(ref);
  });

  if (!createdBranchPoint) return null;

  return {
    id: branchPointRef(createdBranchPoint),
    type: elementTypeFromBranchPointKind(expectedKind),
    name: publicBranchPointName(createdBranchPoint, fallbackName),
  };
}
