/**
 * Logika łańcuchowania flow magistrali SN (współdzielona przez kreator ui2
 * „Wyprowadź magistralę SN"). Czyste funkcje: wskazanie nowo utworzonego
 * odcinka i jego końca oraz zbudowanie kontekstu KOLEJNEJ operacji domenowej.
 *
 * ZERO fizyki, ZERO stanu — wyłącznie odczyt odpowiedzi operacji domenowej.
 * Wydzielone z retirowanego `ContinueTrunkForm`, aby „następny krok" flow był
 * realną operacją (a nie dekoracyjnym tekstem) i był testowalny w izolacji.
 */

import type { Branch, DomainOpResponseV1 } from '../../types/enm';
import type { NetworkBuildOperationName } from './networkBuildStore';

/** Następny krok flow po utworzeniu odcinka. */
export type TrunkNextStep = 'station' | 'zksn' | 'branch_pole' | 'continue';

export function nextOperationForStep(step: TrunkNextStep): NetworkBuildOperationName {
  switch (step) {
    case 'station':
      return 'insert_station_on_segment_sn';
    case 'zksn':
      return 'insert_zksn_on_segment_sn';
    case 'branch_pole':
      return 'insert_branch_pole_on_segment_sn';
    case 'continue':
      return 'continue_trunk_segment_sn';
  }
}

function branchRef(branch: Branch | undefined): string | undefined {
  return branch?.ref_id || branch?.id || undefined;
}

function isBranchConnectedToStart(branch: Branch, startRef: string): boolean {
  if (!startRef) return false;
  const endpointAPort = 'endpoint_a_port' in branch ? branch.endpoint_a_port : null;
  const endpointBPort = 'endpoint_b_port' in branch ? branch.endpoint_b_port : null;
  return (
    branch.from_bus_ref === startRef
    || branch.to_bus_ref === startRef
    || endpointAPort?.port_id === startRef
    || endpointBPort?.port_id === startRef
  );
}

/** Wskazuje ref nowo utworzonego odcinka (selection_hint → created_ids → nowe gałęzie). */
export function createdSegmentRef(
  response: DomainOpResponseV1 | null,
  previousSnapshot: DomainOpResponseV1['snapshot'] | null | undefined,
  startRef: string,
): string {
  const createdIds = response?.changes?.created_element_ids ?? [];
  const branches = response?.snapshot?.branches ?? [];
  const hintedElement = response?.selection_hint?.element_id;
  if (response?.selection_hint?.element_type === 'LineBranch' && hintedElement) {
    return hintedElement;
  }
  const previousBranchRefs = new Set(
    (previousSnapshot?.branches ?? [])
      .map((branch) => branchRef(branch))
      .filter(Boolean),
  );
  const newBranches = branches.filter((branch) => {
    const ref = branchRef(branch);
    return Boolean(ref) && !previousBranchRefs.has(ref);
  });
  const newConnectedBranch = newBranches.find((branch) => isBranchConnectedToStart(branch, startRef));
  return (
    createdIds.find((id) => branches.some((branch) => branch.ref_id === id || branch.id === id))
    ?? createdIds.find((id) => id.startsWith('seg/'))
    ?? branchRef(newConnectedBranch)
    ?? branchRef(newBranches[0])
    ?? ''
  );
}

/** Wskazuje ref szyny końcowej nowo utworzonego odcinka. */
export function createdEndpointBusRef(
  response: DomainOpResponseV1 | null,
  segmentRef: string,
): string {
  const hintedElement = response?.selection_hint?.element_id;
  if (response?.selection_hint?.element_type === 'bus' && hintedElement) {
    return hintedElement;
  }
  const branch = response?.snapshot?.branches?.find(
    (candidate) => candidate.ref_id === segmentRef || candidate.id === segmentRef,
  );
  return branch?.to_bus_ref ?? '';
}

export interface NextContextInput {
  nextOperation: NetworkBuildOperationName;
  nextSegmentRef: string;
  nextEndpointBusRef: string;
  nextTrunkId: string;
  nextPortId: string;
  terminalVoltageLabel: string;
}

/** Buduje kontekst KOLEJNEJ operacji domenowej (kontynuacja ciągu vs wstawienie elementu). */
export function buildNextContext(input: NextContextInput): Record<string, unknown> {
  const {
    nextOperation,
    nextSegmentRef,
    nextEndpointBusRef,
    nextTrunkId,
    nextPortId,
    terminalVoltageLabel,
  } = input;
  if (nextOperation === 'continue_trunk_segment_sn') {
    return {
      trunk_id: nextTrunkId,
      trunkId: nextTrunkId,
      from_terminal_id: nextEndpointBusRef,
      terminal_id: nextEndpointBusRef,
      terminalId: nextEndpointBusRef,
      terminal_port_id: nextPortId,
      port_id: nextPortId,
      from_bus_ref: nextEndpointBusRef,
      terminal_name: 'Koniec nowego odcinka SN',
      terminal_voltage_label: terminalVoltageLabel || 'SN',
      element_ref: nextSegmentRef || nextEndpointBusRef,
      element_type: 'LineBranch',
      default_termination: 'continue',
    };
  }
  return {
    segment_id: nextSegmentRef,
    segment_ref: nextSegmentRef,
    segmentRef: nextSegmentRef,
    endpoint_bus_ref: nextEndpointBusRef,
    terminal_id: nextEndpointBusRef,
    terminalId: nextEndpointBusRef,
    terminal_port_id: nextPortId,
    corridor_ref: nextTrunkId,
    trunk_id: nextTrunkId,
    run_ref: nextTrunkId,
    placement_mode: 'ENDPOINT_APPEND',
    endpoint_role: 'TO_BUS',
    position_on_segment: 1,
    element_ref: nextSegmentRef,
    element_type: 'LineBranch',
  };
}

/** Odracza otwarcie formularza kolejnej operacji o jedną klatkę (po zamknięciu bieżącego). */
export function scheduleNextOperationForm(
  openOperationForm: (op: NetworkBuildOperationName, context?: Record<string, unknown>) => void,
  nextOperation: NetworkBuildOperationName,
  nextContext: Record<string, unknown>,
): void {
  const open = () => openOperationForm(nextOperation, nextContext);
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.setTimeout(open, 0));
    return;
  }
  setTimeout(open, 0);
}
