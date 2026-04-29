/**
 * InspectorResolver — dynamiczny inspektor właściwości podłączony do modelu.
 *
 * Reaguje na selekcję elementu (selectionStore) i pobiera dane
 * z snapshotStore. Renderuje kanoniczny inspektor inżynierski
 * z jawnym kontraktem edycji przez operacje domenowe.
 */

import { useCallback, useMemo } from 'react';

import { useAppStateStore } from '../app-state';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { useSelectionStore } from '../selection';
import type { ElementType } from '../types';
import type { EnergyNetworkModel } from '../../types/enm';
import {
  buildSemanticInspectorCardModel,
  type EngineeringSemanticModelForInspector,
} from '../engineering-semantic/semanticInspectorAdapter';
import { projectEnergyNetworkModelToSemantic } from '../engineering-semantic/enmAdapter';
import { EngineeringInspector } from '../property-grid/EngineeringInspector';
import { useSnapshotStore } from '../topology/snapshotStore';
import { EmptyInspectorPanel } from './EmptyInspectorPanel';
import { SemanticInspectorCard } from './SemanticInspectorCard';

function findElementInSnapshot(
  snapshot: EnergyNetworkModel | null,
  elementId: string,
): { data: Record<string, unknown>; name: string } | null {
  if (!snapshot) return null;

  const bus = (snapshot.buses ?? []).find((item) => item.ref_id === elementId);
  if (bus) {
    return {
      name: bus.name,
      data: {
        ref_id: bus.ref_id,
        name: bus.name,
        voltage_kv: bus.voltage_kv,
        phase_system: bus.phase_system,
        zone: bus.zone,
        frequency_hz: bus.frequency_hz ?? snapshot.header.defaults.frequency_hz,
        u_min_pu: bus.nominal_limits?.u_min_pu,
        u_max_pu: bus.nominal_limits?.u_max_pu,
        grounding_type: bus.grounding?.type,
      },
    };
  }

  const branch = (snapshot.branches ?? []).find((item) => item.ref_id === elementId);
  if (branch) {
    const baseData: Record<string, unknown> = {
      ref_id: branch.ref_id,
      name: branch.name,
      from_bus_ref: branch.from_bus_ref,
      to_bus_ref: branch.to_bus_ref,
      status: branch.status,
      type_ref: branch.catalog_ref,
    };

    if ('length_km' in branch) {
      Object.assign(baseData, {
        length_km: branch.length_km,
        r_ohm_per_km: branch.r_ohm_per_km,
        x_ohm_per_km: branch.x_ohm_per_km,
        in_a: branch.rating?.in_a,
        ith_ka: branch.rating?.ith_ka,
        idyn_ka: branch.rating?.idyn_ka,
      });
      if ('insulation' in branch) {
        Object.assign(baseData, {
          insulation: branch.insulation,
        });
      }
    }

    return { name: branch.name, data: baseData };
  }

  const transformer = (snapshot.transformers ?? []).find((item) => item.ref_id === elementId);
  if (transformer) {
    return {
      name: transformer.name,
      data: {
        ref_id: transformer.ref_id,
        name: transformer.name,
        hv_bus_ref: transformer.hv_bus_ref,
        lv_bus_ref: transformer.lv_bus_ref,
        sn_mva: transformer.sn_mva,
        uhv_kv: transformer.uhv_kv,
        ulv_kv: transformer.ulv_kv,
        uk_percent: transformer.uk_percent,
        pk_kw: transformer.pk_kw,
        p0_kw: transformer.p0_kw,
        i0_percent: transformer.i0_percent,
        vector_group: transformer.vector_group,
        tap_position: transformer.tap_position,
        tap_min: transformer.tap_min,
        tap_max: transformer.tap_max,
        type_ref: transformer.catalog_ref,
      },
    };
  }

  const source = (snapshot.sources ?? []).find((item) => item.ref_id === elementId);
  if (source) {
    return {
      name: source.name,
      data: {
        ref_id: source.ref_id,
        name: source.name,
        bus_ref: source.bus_ref,
        model: source.model,
        sk3_mva: source.sk3_mva,
        ik3_ka: source.ik3_ka,
        r_ohm: source.r_ohm,
        x_ohm: source.x_ohm,
        rx_ratio: source.rx_ratio,
        c_max: source.c_max,
        c_min: source.c_min,
        type_ref: source.catalog_ref,
      },
    };
  }

  const load = (snapshot.loads ?? []).find((item) => item.ref_id === elementId);
  if (load) {
    return {
      name: load.name,
      data: {
        ref_id: load.ref_id,
        name: load.name,
        bus_ref: load.bus_ref,
        p_mw: load.p_mw,
        q_mvar: load.q_mvar,
        model: load.model,
        quantity: load.quantity,
        type_ref: load.catalog_ref,
      },
    };
  }

  const generator = (snapshot.generators ?? []).find((item) => item.ref_id === elementId);
  if (generator) {
    return {
      name: generator.name,
      data: {
        ref_id: generator.ref_id,
        name: generator.name,
        bus_ref: generator.bus_ref,
        gen_type: generator.gen_type,
        p_mw: generator.p_mw,
        q_mvar: generator.q_mvar,
        connection_variant: generator.connection_variant,
        type_ref: generator.catalog_ref,
      },
    };
  }

  return null;
}

function readSemanticModelFromSnapshot(snapshot: EnergyNetworkModel | null): EngineeringSemanticModelForInspector | null {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const candidate = snapshot as EnergyNetworkModel & {
    engineeringSemanticModel?: EngineeringSemanticModelForInspector;
    semanticModel?: EngineeringSemanticModelForInspector;
  };

  return (
    candidate.engineeringSemanticModel
    ?? candidate.semanticModel
    ?? projectEnergyNetworkModelToSemantic(snapshot)
  );
}

function elementTypeFromSemanticCard(
  card: ReturnType<typeof buildSemanticInspectorCardModel>,
): ElementType | null {
  if (card.status !== 'SEMANTYKA_OK') {
    return null;
  }

  switch (card.engineeringRole) {
    case 'GPZ_SUPPLY_NODE':
      return 'Source';
    case 'LINE_FEEDER_BAY':
    case 'INCOMING_SUPPLY_BAY':
    case 'TRANSFORMER_BAY':
    case 'MEASUREMENT_BAY':
    case 'COUPLER_BAY':
    case 'SOURCE_CONNECTION_BAY':
    case 'RESERVE_BAY':
      return 'BaySN';
    case 'MV_CABLE_SEGMENT':
    case 'MV_OVERHEAD_SEGMENT':
      return 'LineBranch';
    case 'HV_MV_TRANSFORMATION_NODE':
    case 'MV_LV_TRANSFORMER':
      return 'TransformerBranch';
    case 'BUSBAR_SYSTEM':
    case 'BUSBAR_SECTION':
      return 'Bus';
    case 'CIRCUIT_BREAKER':
    case 'LOAD_BREAK_SWITCH':
    case 'LINE_DISCONNECTOR':
    case 'BUSBAR_DISCONNECTOR':
    case 'EARTHING_SWITCH':
      return 'Switch';
    case 'LV_LOAD_NODE':
      return 'Load';
    case 'PV_INVERTER':
      return 'PVInverter';
    case 'BESS_CONVERTER':
      return 'BESSInverter';
    case 'WIND_SOURCE':
      return 'Generator';
    case 'CURRENT_TRANSFORMER':
    case 'VOLTAGE_TRANSFORMER':
      return 'Measurement';
    case 'PROTECTION_RELAY':
      return 'ProtectionAssignment';
    default:
      break;
  }

  switch (card.elementKind) {
    case 'GPZ':
    case 'SOURCE':
      return 'Source';
    case 'MV_BAY':
      return 'BaySN';
    case 'MV_CABLE_SEGMENT':
    case 'MV_OVERHEAD_SEGMENT':
    case 'LV_CABLE_SEGMENT':
      return 'LineBranch';
    case 'TRANSFORMER':
      return 'TransformerBranch';
    case 'BUSBAR_SYSTEM':
    case 'BUSBAR_SECTION':
      return 'Bus';
    case 'SWITCHGEAR_DEVICE':
      return 'Switch';
    case 'LV_LOAD':
      return 'Load';
    case 'MEASUREMENT':
      return 'Measurement';
    case 'PROTECTION_RELAY':
      return 'ProtectionAssignment';
    default:
      return null;
  }
}

function semanticSegmentKind(
  card: ReturnType<typeof buildSemanticInspectorCardModel>,
): 'overhead' | 'cable' | null {
  if (card.status !== 'SEMANTYKA_OK') {
    return null;
  }
  if (card.engineeringRole === 'MV_OVERHEAD_SEGMENT' || card.elementKind === 'MV_OVERHEAD_SEGMENT') {
    return 'overhead';
  }
  if (card.engineeringRole === 'MV_CABLE_SEGMENT' || card.elementKind === 'MV_CABLE_SEGMENT') {
    return 'cable';
  }
  return null;
}

export function InspectorResolver() {
  const selectedElements = useSelectionStore((state) => state.selectedElements);
  const activeMode = useSelectionStore((state) => state.mode);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);

  const selected = selectedElements[0] ?? null;

  const semanticModel = useMemo(() => {
    return readSemanticModelFromSnapshot(snapshot);
  }, [snapshot]);

  const resolved = useMemo(() => {
    if (!selected || !snapshot) {
      return null;
    }
    return findElementInSnapshot(snapshot, selected.id);
  }, [selected, snapshot]);

  const semanticCard = useMemo(
    () =>
      buildSemanticInspectorCardModel({
        semanticModel,
        elementRefId: selected?.id ?? null,
        fallbackVisualLabel: selected?.type ?? null,
      }),
    [semanticModel, selected?.id, selected?.type],
  );

  const semanticElementType = useMemo(
    () => elementTypeFromSemanticCard(semanticCard),
    [semanticCard],
  );

  const catalogInfo = useMemo(() => {
    if (!resolved || !semanticElementType) {
      return null;
    }

    const typeRef =
      typeof resolved.data.type_ref === 'string' && resolved.data.type_ref.trim().length > 0
        ? resolved.data.type_ref.trim()
        : typeof resolved.data.equipment_type_ref === 'string'
          && resolved.data.equipment_type_ref.trim().length > 0
          ? resolved.data.equipment_type_ref.trim()
          : null;

    if (!typeRef) {
      return null;
    }

    const namespaceByType: Partial<Record<ElementType, string>> = {
      Bus: 'SZYNA_SN',
      LineBranch: 'KABEL_SN',
      TransformerBranch: 'TRAFO_SN_NN',
      Source: 'ZRODLO_SN',
      Switch: 'APARATURA_SN',
      Load: 'ODBIOR_NN',
    };

    return {
      namespace: namespaceByType[semanticElementType] ?? 'ELEMENT_TECHNICZNY',
      typeId: typeRef,
      typeName: typeRef,
      version:
        typeof resolved.data.catalog_version === 'string' && resolved.data.catalog_version.trim().length > 0
          ? resolved.data.catalog_version.trim()
          : 'BRAK',
      isMaterialized: true,
      hasDrift: false,
    };
  }, [resolved, semanticElementType]);

  const selectedBranch = useMemo(() => {
    if (!selected || !snapshot) {
      return null;
    }
    return (snapshot.branches ?? []).find((item) => item.ref_id === selected.id) ?? null;
  }, [selected, snapshot]);

  const selectedSegmentKind = useMemo(
    () => semanticSegmentKind(semanticCard),
    [semanticCard],
  );

  const branchActions = useMemo(() => {
    if (!selectedBranch || !selectedSegmentKind) {
      return [];
    }

    const actions: Array<{
      id: string;
      label: string;
      context: Record<string, unknown>;
    }> = [];

    actions.push({
      id: 'insert_station_on_segment_sn',
      label: 'Wstaw stację',
      context: { segment_ref: selectedBranch.ref_id },
    });

    if (selectedSegmentKind === 'overhead') {
      actions.push({
        id: 'insert_branch_pole_on_segment_sn',
        label: 'Wstaw słup rozgałęźny',
        context: { segment_ref: selectedBranch.ref_id },
      });
    }

    if (selectedSegmentKind === 'cable') {
      actions.push({
        id: 'insert_zksn_on_segment_sn',
        label: 'Wstaw ZKSN',
        context: { segment_ref: selectedBranch.ref_id },
      });
    }

    actions.push({
      id: 'insert_section_switch_sn',
      label: 'Wstaw łącznik',
      context: {
        segmentRef: selectedBranch.ref_id,
        segmentLabel: selectedBranch.name,
      },
    });

    return actions;
  }, [selectedBranch, selectedSegmentKind]);

  const handleFieldChange = useCallback(
    (fieldKey: string, value: unknown) => {
      if (!selected || !activeCaseId) {
        return;
      }

      void executeDomainOperation(activeCaseId, 'update_element_parameters', {
        element_ref: selected.id,
        parameters: {
          [fieldKey]: value,
        },
      });
    },
    [activeCaseId, executeDomainOperation, selected],
  );

  const handleDeleteElement = useCallback(() => {
    if (!selected || !activeCaseId) {
      return;
    }

    void executeDomainOperation(activeCaseId, 'delete_element', {
      element_ref: selected.id,
    });
  }, [activeCaseId, executeDomainOperation, selected]);

  if (!selected || !resolved) {
    if (selected) {
      return (
        <div
          className="flex h-full flex-col bg-scada-panel text-scada-text"
          data-testid="inspector-semantic-missing"
        >
          <SemanticInspectorCard card={semanticCard} />
          <div className="flex-1 overflow-auto p-4">
            <section className="rounded border border-scada-border bg-scada-surface p-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
                Inspektor techniczny
              </h3>
              <p className="mt-2 text-[12px] leading-snug text-scada-muted">
                Zaznaczony obiekt nie ma kompletnej projekcji inspektora. Karta semantyczna
                pokazuje blokade i akcje naprawcza bez zgadywania funkcji z typu UI.
              </p>
            </section>
          </div>
        </div>
      );
    }

    return (
      <EmptyInspectorPanel
        selectedElement={null}
        isReadOnly={activeMode === 'RESULT_VIEW'}
      />
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="inspector-engineering">
      <SemanticInspectorCard card={semanticCard} />
      <div className="min-h-[220px] flex-1 overflow-auto" data-testid="sld-engineering-inspector-wrapper">
        <EngineeringInspector
          elementId={selected.id}
          elementType={semanticElementType}
          elementData={resolved.data}
          catalogInfo={catalogInfo}
          onFieldChange={handleFieldChange}
          onDeleteElement={handleDeleteElement}
        />
      </div>
      {branchActions.length > 0 && (
        <div className="border-t border-scada-border bg-scada-surface p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-scada-muted">
            Operacje odcinka
          </div>
          <div className="flex flex-wrap gap-2">
            {branchActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => openOperationForm(action.id as never, action.context)}
                className="rounded border border-scada-border bg-scada-bg px-2.5 py-1.5 text-xs font-medium text-scada-text hover:bg-scada-active hover:text-scada-sn"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
