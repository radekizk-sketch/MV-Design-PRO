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

function createdSegmentRef(response: DomainOpResponseV1 | null): string {
  const createdIds = response?.changes?.created_element_ids ?? [];
  const branches = response?.snapshot?.branches ?? [];
  return (
    createdIds.find((id) => branches.some((branch) => branch.ref_id === id || branch.id === id))
    ?? createdIds.find((id) => id.startsWith('seg/'))
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

function cableEntry(item: CableType): CatalogEntry {
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
    c_nf_per_km: item.c_nf_per_km,
    max_temperature_c: item.max_temperature_c,
    insulation_type: item.insulation_type,
    conductor_material: item.conductor_material,
    standard: item.standard,
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
  const missingStartReason =
    !hasTrunkStartRef && elementType === 'Station'
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
      if (!activeCaseId || !hasTrunkStartRef) return;
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
      setCatalogError(null);
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
      const nextSegmentRef = createdSegmentRef(response);
      const nextEndpointBusRef = createdEndpointBusRef(response, nextSegmentRef);
      const nextTerminal = response.logical_views?.terminals?.find(
        (terminal) => terminal.element_id === nextEndpointBusRef,
      );
      const nextTrunkId = nextTerminal?.trunk_id ?? trunkId;
      const nextOperation = nextOperationForStep(data.next_step);
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
      closeForm();
      if (nextSegmentRef || nextEndpointBusRef) {
        openOperationForm(nextOperation, nextContext);
      }
    },
    [
      activeCaseId,
      closeForm,
      executeDomainOperation,
      fieldRef,
      hasTrunkStartRef,
      openOperationForm,
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
        submitDisabled={!hasTrunkStartRef}
        submitDisabledReason={!hasTrunkStartRef ? missingStartReason : null}
        onSubmit={handleSubmit}
        onCancel={closeForm}
      />
    </div>
  );
}
