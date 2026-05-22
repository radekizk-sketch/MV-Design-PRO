/**
 * ContinueTrunkForm — formularz kontynuacji magistrali SN.
 *
 * Wrapper inline nad TrunkContinueModal z ui/topology/modals/.
 * Integruje się z snapshotStore.executeDomainOperation + networkBuildStore.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrunkContinueModal,
  type TrunkContinueFormData,
  type TrunkNextStep,
} from '../../topology/modals/TrunkContinueModal';
import type { CatalogEntry } from '../../topology/modals/CatalogPicker';
import {
  fetchCableTypes,
  fetchLineTypes,
  getCatalogErrorMessage,
} from '../../catalog/api';
import type { CableType, LineType } from '../../catalog/types';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { validateCatalogFirst } from './catalogFirstRules';
import {
  catalogRefFromInput,
  normalizeCatalogBinding,
  normalizeSegmentKind,
  normalizeSegmentNamespace,
} from './catalogPayload';
import { useSelectionStore } from '../../selection';
import type { ElementType } from '../../types';
import { buildOperationContext } from '../operationContext';
import type { NetworkBuildOperationName } from '../networkBuildStore';
import type { DomainOpResponseV1 } from '../../../types/enm';
import type { Branch } from '../../../types/enm';
import { resolveTrunkOriginKind } from '../trunkOriginResolver';
import { validateTrunkSegmentOrigin, type TrunkBranchKind } from '../semanticValidator';

function nextOperationForStep(step: TrunkNextStep): NetworkBuildOperationName {
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

function createdSegmentRef(
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

function createdEndpointBusRef(
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

function scheduleNextOperationForm(
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

function cableCoreCount(item: CableType, designation: string): number | undefined {
  return item.number_of_cores
    ?? (/[-_]1c[-_]/i.test(item.base_type_id ?? item.id) || /\b1\s*[xX×]\s*\d+/i.test(designation) ? 1 : undefined);
}

function normalizeCableDesignation(value: string): string {
  return value.replace(/(\d)\s*[xX×]\s*(\d)/g, '$1×$2').replace(/\s+/g, ' ').trim();
}

function stripOperatorCatalogPrefix(value: string): string {
  return value
    .replace(/^\s*ENEA\s+Operator\s+standard\s*[-–—]\s*/i, '')
    .replace(/^\s*ENEA\s+Operator\s*[-–—]\s*/i, '')
    .trim();
}

function cleanCablePhaseSetLabel(item: CableType): string {
  const designation = normalizeCableDesignation(item.trade_name ?? item.name);
  const coreCount = cableCoreCount(item, designation);
  const section = Number.isFinite(item.cross_section_mm2)
    ? item.cross_section_mm2.toLocaleString('pl-PL', { maximumFractionDigits: 0 })
    : '?';
  if (coreCount === 1) return `układ 3 × 1×${section} mm²`;
  if (coreCount === 3) return `kabel 3×${section} mm²`;
  return `przekrój ${section} mm²`;
}

function cleanCableReturnConductorLabel(item: CableType): string | null {
  const section = item.return_conductor_cross_section_mm2;
  if (section === null || section === undefined || !Number.isFinite(section)) return null;
  const material = item.return_conductor_material?.trim()
    ? ` ${item.return_conductor_material.trim().toUpperCase()}`
    : '';
  return `żyła powrotna${material} ${section.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} mm²`;
}

function ensureCableSectionUnit(value: string): string {
  return value.replace(
    /\b(1\s*×\s*\d{2,4}\s*\/\s*\d{1,3})(?!\s*mm(?:2|²)?)/iu,
    (_match, designation: string) => `${designation.replace(/\s+/g, '')} mm²`,
  );
}

function cleanCatalogReturnDesignation(rawName: string, item: CableType): string {
  const normalized = normalizeCableDesignation(rawName);
  if (/\b\d{2,4}\s*\/\s*\d{1,3}\b/u.test(normalized)) {
    return ensureCableSectionUnit(normalized);
  }
  const section = item.return_conductor_cross_section_mm2;
  if (section === null || section === undefined || !Number.isFinite(section)) return normalized;
  const returnSection = section.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
  return normalized.replace(
    /\b1\s*×\s*(\d{2,4})(\s*mm(?:2|²))?\b/u,
    (_match, phaseSection: string, unit: string | undefined) =>
      `1×${phaseSection}/${returnSection}${unit ?? ' mm²'}`,
  );
}

function cleanCablePublicName(item: CableType): string {
  const rawName = cleanCatalogReturnDesignation(
    stripOperatorCatalogPrefix((item.trade_name || item.name).trim()),
    item,
  );
  const normalized = normalizeCableDesignation(rawName);
  const coreCount = cableCoreCount(item, normalized);
  const singleCoreName = normalized.replace(/\b1\s*×\s*(\d{2,4})/gu, '1×$1');
  if (coreCount !== 1 || /^3\s*×\s+/i.test(normalized)) {
    return normalized.replace(/\b([13])\s*×\s*(\d{2,4})/gu, '$1×$2');
  }
  return `3 × ${singleCoreName}`;
}

function cleanCableManufacturer(item: CableType): string | undefined {
  const manufacturer = item.manufacturer?.trim();
  if (!manufacturer || /operator/i.test(manufacturer)) return undefined;
  return manufacturer;
}

function cleanCableStandard(item: CableType): string | undefined {
  const standard = item.standard?.trim();
  if (!standard) return undefined;
  const withoutOperator = standard
    .replace(/\bENEA\s+Operator\s*\/\s*/i, '')
    .replace(/\bENEA\s+Operator\b/i, '')
    .replace(/\s*\/\s*\/\s*/g, ' / ')
    .trim();
  return withoutOperator || undefined;
}

function cablePhaseSetLabel(item: CableType): string {
  return cableEngineeringPhaseSetLabel(item);
}

function cableEngineeringPhaseSetLabel(item: CableType): string {
  return cleanCablePhaseSetLabel(item);
}

function cableReturnConductorLabel(item: CableType): string | null {
  return cleanCableReturnConductorLabel(item);
}

function cablePublicName(item: CableType): string {
  return cleanCablePublicName(item);
}

function cableEntry(item: CableType): CatalogEntry {
  const phaseSetLabel = cablePhaseSetLabel(item);
  const returnConductorLabel = cableReturnConductorLabel(item);
  return {
    id: item.id,
    name: cablePublicName(item),
    manufacturer: cleanCableManufacturer(item),
    summary: [
      `${item.voltage_rating_kv} kV`,
      phaseSetLabel,
      returnConductorLabel,
      `Iz ${item.rated_current_a} A`,
    ].filter(Boolean).join(', '),
    voltage_rating_kv: item.voltage_rating_kv,
    cross_section_mm2: item.cross_section_mm2,
    rated_current_a: item.rated_current_a,
    r_ohm_per_km: item.r_ohm_per_km,
    x_ohm_per_km: item.x_ohm_per_km,
    c_nf_per_km: item.c_nf_per_km,
    max_temperature_c: item.max_temperature_c,
    number_of_cores: item.number_of_cores,
    return_conductor_cross_section_mm2: item.return_conductor_cross_section_mm2,
    return_conductor_material: item.return_conductor_material,
    return_conductor_r_ohm_per_km_20c: item.return_conductor_r_ohm_per_km_20c,
    return_conductor_jth_1s_a_per_mm2: item.return_conductor_jth_1s_a_per_mm2,
    return_conductor_ith_1s_a: item.return_conductor_ith_1s_a,
    phase_set_label: phaseSetLabel,
    insulation_type: item.insulation_type,
    conductor_material: item.conductor_material,
    standard: cleanCableStandard(item),
  };
}

function lineEntry(item: LineType): CatalogEntry {
  return {
    id: item.id,
    name: item.name,
    manufacturer: item.manufacturer,
    summary: `${item.voltage_rating_kv} kV, ${item.cross_section_mm2} mm2, Iz ${item.rated_current_a} A`,
    voltage_rating_kv: item.voltage_rating_kv,
    cross_section_mm2: item.cross_section_mm2,
    rated_current_a: item.rated_current_a,
    r_ohm_per_km: item.r_ohm_per_km,
    x_ohm_per_km: item.x_ohm_per_km,
    b_us_per_km: item.b_us_per_km,
    max_temperature_c: item.max_temperature_c,
    conductor_material: item.conductor_material,
    standard: item.standard,
  };
}

function canUseElementRefAsFieldRef(elementType: string): boolean {
  return ['BaySN', 'FieldSN', 'LineBaySN', 'SNBay', 'Bay'].includes(elementType);
}

function canResolveElementAsTrunkStart(
  elementType: string,
): elementType is Extract<ElementType, 'Station' | 'LineBranch'> {
  return elementType === 'Station' || elementType === 'LineBranch';
}

export function ContinueTrunkForm() {
  const rawContext = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const logicalViews = useSnapshotStore((s) => s.logicalViews);
  const selectedElement = useSelectionStore((s) => s.selectedElements[0] ?? null);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const context = useMemo(() => {
    const rawElementRef = ((rawContext?.element_ref as string) ?? '').trim();
    const rawElementType = (
      (rawContext?.element_type as string)
      ?? (rawContext?.elementType as string)
      ?? ''
    ).trim();
    const hasExplicitStart = Boolean(
      ((rawContext?.terminalId as string) ?? '').trim()
      || ((rawContext?.terminal_id as string) ?? '').trim()
      || ((rawContext?.from_terminal_id as string) ?? '').trim()
      || ((rawContext?.field_ref as string) ?? '').trim(),
    );
    if (hasExplicitStart) {
      return rawContext;
    }

    const fallbackElementRef = selectedElement?.id ?? rawElementRef;
    const fallbackElementType = selectedElement?.type ?? rawElementType;
    if (!fallbackElementRef || !canResolveElementAsTrunkStart(fallbackElementType)) {
      return rawContext;
    }

    const selectionContext = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: fallbackElementRef,
      elementType: fallbackElementType,
      snapshot,
      logicalViews,
      extraContext: {
        ...(rawContext?.segment_kind ? { segment_kind: rawContext.segment_kind } : {}),
        ...(typeof rawContext?.length_m === 'number' ? { length_m: rawContext.length_m } : {}),
        ...(rawContext?.catalog_binding ? { catalog_binding: rawContext.catalog_binding } : {}),
      },
    });
    const hasResolvedStart = Boolean(
      ((selectionContext.terminalId as string) ?? '').trim()
      || ((selectionContext.terminal_id as string) ?? '').trim()
      || ((selectionContext.from_terminal_id as string) ?? '').trim()
    );
    return hasResolvedStart ? { ...rawContext, ...selectionContext } : rawContext;
  }, [logicalViews, rawContext, selectedElement, snapshot]);

  const trunkId = ((context?.trunkId as string) ?? (context?.trunk_id as string) ?? '').trim();
  const terminalId = (
    (context?.terminalId as string)
    ?? (context?.terminal_id as string)
    ?? (context?.from_terminal_id as string)
    ?? ''
  ).trim();
  const terminalPortId = (
    (context?.terminal_port_id as string)
    ?? (context?.port_id as string)
    ?? ''
  ).trim();
  const terminalName = ((context?.terminal_name as string) ?? '').trim();
  const terminalVoltageLabel = ((context?.terminal_voltage_label as string) ?? '').trim();
  const explicitFieldRef = ((context?.field_ref as string) ?? '').trim();
  const elementRef = ((context?.element_ref as string) ?? '').trim();
  const elementType = (
    (context?.element_type as string)
    ?? (context?.elementType as string)
    ?? ''
  ).trim();
  const fieldRef =
    explicitFieldRef
    || (elementRef && canUseElementRefAsFieldRef(elementType) ? elementRef : '');
  const hasTrunkStartRef = terminalId.length > 0 || fieldRef.length > 0;
  const displayTerminalPortId = terminalPortId || (terminalId && !fieldRef ? 'trunk_end' : '');
  const missingCaseReason = 'Skonfiguruj aktywny zakres obliczeń przed zapisem odcinka SN.';
  const missingStartReason =
    !activeCaseId
      ? missingCaseReason
      : !hasTrunkStartRef && elementType === 'Station'
      ? 'Wybrana stacja nie ma wolnego portu wyjściowego SN. Wybierz stację na końcu ciągu albo głowicę odpływową pola SN.'
      : 'Brak głowicy pola SN albo wolnego końca ciągu.';
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [segmentCatalogError, setSegmentCatalogError] = useState<string | null>(null);
  const [segmentCatalogLoading, setSegmentCatalogLoading] = useState(true);
  const [cableCatalogEntries, setCableCatalogEntries] = useState<CatalogEntry[]>([]);
  const [lineCatalogEntries, setLineCatalogEntries] = useState<CatalogEntry[]>([]);

  useEffect(() => {
    let active = true;
    setSegmentCatalogLoading(true);
    void Promise.all([fetchCableTypes(), fetchLineTypes()])
      .then(([cableTypes, lineTypes]) => {
        if (!active) return;
        setCableCatalogEntries(cableTypes.map(cableEntry));
        setLineCatalogEntries(lineTypes.map(lineEntry));
        setSegmentCatalogError(null);
      })
      .catch((error) => {
        if (!active) return;
        setCableCatalogEntries([]);
        setLineCatalogEntries([]);
        setSegmentCatalogError(getCatalogErrorMessage(error));
      })
      .finally(() => {
        if (active) {
          setSegmentCatalogLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const initialData = useMemo<Partial<TrunkContinueFormData>>(() => {
    if (!context) return {};
    const segmentContext = context.segment as Record<string, unknown> | undefined;
    const segmentKind = context.segment_kind as TrunkContinueFormData['segment_kind'] | undefined;
    const lengthM = typeof context.length_m === 'number' ? context.length_m : undefined;
    const catalogRef = (
      catalogRefFromInput(segmentContext?.catalog_binding)
      ?? catalogRefFromInput(context.catalog_binding)
      ?? undefined
    );
    return {
      ...(segmentKind ? { segment_kind: segmentKind } : {}),
      ...(lengthM !== undefined ? { length_m: lengthM } : {}),
      ...(catalogRef !== undefined ? { catalog_ref: catalogRef } : {}),
    };
  }, [context]);

  const handleSubmit = useCallback(
    async (data: TrunkContinueFormData) => {
      if (!activeCaseId) {
        setCatalogError(missingCaseReason);
        return;
      }
      if (!hasTrunkStartRef) {
        setCatalogError(missingStartReason);
        return;
      }
      const catalogNamespace = normalizeSegmentNamespace(data.segment_kind);
      const catalogBinding = normalizeCatalogBinding(data.catalog_ref, catalogNamespace);
      const payload = {
        ...(trunkId ? { trunk_id: trunkId } : {}),
        ...(fieldRef ? { field_ref: fieldRef } : {}),
        ...(terminalId ? { from_terminal_id: terminalId } : {}),
        segment: {
          rodzaj: normalizeSegmentKind(data.segment_kind),
          dlugosc_m: data.length_m,
          name: data.notes.trim() || undefined,
          catalog_binding: catalogBinding ?? undefined,
        },
      };
      const validationError = validateCatalogFirst('continue_trunk_segment_sn', payload);
      if (validationError) {
        setCatalogError(validationError);
        return;
      }
      const originKind = resolveTrunkOriginKind(snapshot, {
        ...context,
        field_ref: fieldRef,
        terminal_id: terminalId,
      });
      if (originKind) {
        const branchKind: TrunkBranchKind = data.segment_kind === 'LINIA_NAPOWIETRZNA'
          ? 'overhead_line_sn'
          : 'cable_sn';
        const semanticResult = validateTrunkSegmentOrigin({ branchKind, originKind });
        if (!semanticResult.ok) {
          setCatalogError(`${semanticResult.messagePl} ${semanticResult.suggestedFixPl}`);
          return;
        }
      }
      setCatalogError(null);
      const previousSnapshot = snapshot;
      const response = await executeDomainOperation(activeCaseId, 'continue_trunk_segment_sn', payload);
      if (!response) {
        const operationError = useSnapshotStore.getState().error;
        if (operationError) {
          setCatalogError(operationError);
          return;
        }
        setCatalogError('Nie udało się wykonać operacji domenowej odcinka SN.');
        return;
      }
      if (response.error) {
        setCatalogError(response.error);
        return;
      }
      const nextSegmentRef = createdSegmentRef(response, previousSnapshot, terminalId || fieldRef);
      const nextEndpointBusRef = createdEndpointBusRef(response, nextSegmentRef);
      const nextTerminal = response.logical_views?.terminals?.find(
        (terminal) => terminal.element_id === nextEndpointBusRef,
      );
      const nextTrunkId = nextTerminal?.trunk_id ?? trunkId;
      const nextOperation = nextOperationForStep(data.next_step);
      if (!nextSegmentRef || !nextEndpointBusRef) {
        setCatalogError(
          'Odcinek SN został utworzony, ale aplikacja nie wskazała jego końca. Wybierz nowy odcinek na SLD i zakończ go stacją, ZK SN albo słupem.',
        );
        return;
      }
      const nextContext =
        nextOperation === 'continue_trunk_segment_sn'
          ? {
              trunk_id: nextTrunkId,
              trunkId: nextTrunkId,
              from_terminal_id: nextEndpointBusRef,
              terminal_id: nextEndpointBusRef,
              terminalId: nextEndpointBusRef,
              terminal_port_id: nextTerminal?.port_id ?? 'trunk_end',
              port_id: nextTerminal?.port_id ?? 'trunk_end',
              from_bus_ref: nextEndpointBusRef,
              terminal_name: 'Koniec nowego odcinka SN',
              terminal_voltage_label: terminalVoltageLabel || 'SN',
              element_ref: nextSegmentRef || nextEndpointBusRef,
              element_type: 'LineBranch',
              default_termination: 'continue',
            }
          : {
              segment_id: nextSegmentRef,
              segment_ref: nextSegmentRef,
              segmentRef: nextSegmentRef,
              endpoint_bus_ref: nextEndpointBusRef,
              terminal_id: nextEndpointBusRef,
              terminalId: nextEndpointBusRef,
              terminal_port_id: nextTerminal?.port_id ?? 'trunk_end',
              corridor_ref: nextTrunkId,
              trunk_id: nextTrunkId,
              run_ref: nextTrunkId,
              placement_mode: 'ENDPOINT_APPEND',
              endpoint_role: 'TO_BUS',
              position_on_segment: 1,
              element_ref: nextSegmentRef,
              element_type: 'LineBranch',
            };
      selectElement({
        id: nextSegmentRef,
        type: 'LineBranch',
        name: 'Nowy odcinek SN',
      });
      closeForm();
      scheduleNextOperationForm(openOperationForm, nextOperation, nextContext);
    },
    [
      activeCaseId,
      closeForm,
      context,
      executeDomainOperation,
      fieldRef,
      hasTrunkStartRef,
      missingCaseReason,
      missingStartReason,
      openOperationForm,
      selectElement,
      snapshot,
      terminalId,
      terminalVoltageLabel,
      trunkId,
    ],
  );

  return (
    <div className="h-full overflow-y-auto bg-[#07141f]" data-testid="continue-trunk-form">
      {catalogError && (
        <p className="border-b border-rose-500/30 bg-rose-950/40 px-4 py-2 text-xs text-rose-100">
          {catalogError}
        </p>
      )}
      <TrunkContinueModal
        isOpen={true}
        mode="create"
        trunkId={trunkId}
        terminalId={terminalId || fieldRef}
        terminalPortId={displayTerminalPortId}
        terminalName={terminalName}
        terminalVoltageLabel={terminalVoltageLabel}
        initialData={initialData}
        cableCatalogEntries={cableCatalogEntries}
        lineCatalogEntries={lineCatalogEntries}
        catalogLoading={segmentCatalogLoading}
        catalogLoadError={segmentCatalogError}
        submitDisabled={!activeCaseId || !hasTrunkStartRef}
        submitDisabledReason={!activeCaseId || !hasTrunkStartRef ? missingStartReason : null}
        onSubmit={handleSubmit}
        onCancel={closeForm}
      />
    </div>
  );
}
