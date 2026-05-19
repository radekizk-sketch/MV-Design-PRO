import { useCallback, useEffect, useMemo, useState } from 'react';
import { GensetModal, type GensetFormData } from '../../topology/modals/GensetModal';
import { UPSModal, type UPSFormData } from '../../topology/modals/UPSModal';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationForm, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { fetchLvApparatusTypes, fetchSourceSystemTypes } from '../../catalog/api';
import type { LVApparatusType, SourceSystemCatalogType } from '../../catalog/types';
import {
  listNnBusOptions,
  listNnSourceFieldOptions,
  resolveBusNnRef,
  resolveStationRef,
  stationLabel,
} from './enmResolvers';

type DispatchableKind = 'GENSET' | 'UPS';

function buildSourceField(
  kind: DispatchableKind,
  data: GensetFormData | UPSFormData,
): Record<string, unknown> | null {
  if (data.placement !== 'NEW_FIELD') {
    return null;
  }

  return {
    source_field_kind: kind === 'GENSET' ? 'AGREGAT' : 'UPS',
    switch_spec: {
      switch_kind: data.new_field_switch_kind,
      normal_state: data.new_field_switch_state,
      catalog_binding: data.new_field_switch_catalog_ref
        ? {
            catalog_namespace: 'APARAT_NN',
            catalog_item_id: data.new_field_switch_catalog_ref,
            catalog_item_version: '2024.1',
          }
        : null,
    },
    voltage_nn_kv: data.new_field_voltage_nn_kv,
    field_name: data.new_field_name,
    field_label: data.new_field_name,
  };
}

export function AddDispatchableSourceForm() {
  const activeForm = useActiveOperationForm();
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const context = activeForm?.context as Record<string, unknown> | undefined;

  const kind: DispatchableKind = activeForm?.op === 'add_ups_nn' ? 'UPS' : 'GENSET';
  const stationRef = useMemo(
    () => resolveStationRef(context, snapshot),
    [context, snapshot],
  );
  const busOptions = useMemo(() => listNnBusOptions(snapshot, stationRef), [snapshot, stationRef]);
  const initialBusRef = useMemo(
    () => resolveBusNnRef(context, snapshot),
    [context, snapshot],
  );
  const [busNnRef, setBusNnRef] = useState(initialBusRef ?? busOptions[0]?.ref_id ?? '');
  const fieldOptions = useMemo(
    () => listNnSourceFieldOptions(snapshot, stationRef, busNnRef),
    [busNnRef, snapshot, stationRef],
  );

  const initialExistingFieldRef = useMemo(() => {
    if (typeof context?.existing_field_ref === 'string' && context.existing_field_ref.trim()) {
      return context.existing_field_ref.trim();
    }
    if (typeof context?.feeder_ref === 'string' && context.feeder_ref.trim()) {
      return context.feeder_ref.trim();
    }
    return '';
  }, [context]);

  const [catalogEntries, setCatalogEntries] = useState<SourceSystemCatalogType[]>([]);
  const [switchCatalogEntries, setSwitchCatalogEntries] = useState<LVApparatusType[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    setBusNnRef(initialBusRef ?? busOptions[0]?.ref_id ?? '');
  }, [initialBusRef, busOptions]);

  useEffect(() => {
    let active = true;

    void Promise.all([fetchSourceSystemTypes(), fetchLvApparatusTypes()])
      .then(([sourceTypes, lvTypes]) => {
        if (!active) {
          return;
        }
        setCatalogEntries(sourceTypes);
        setSwitchCatalogEntries(lvTypes);
        setCatalogError(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setCatalogError(
          error instanceof Error
            ? error.message
            : 'Nie udało się pobrać katalogów agregatu/UPS lub aparatury nN.',
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const handleCreateSourceField = useCallback(() => {
    openOperationForm('add_nn_outgoing_field', {
      station_ref: stationRef,
      bus_nn_ref: busNnRef,
      field_role: 'SOURCE',
      source_field_kind: kind === 'GENSET' ? 'AGREGAT' : 'UPS',
    });
  }, [busNnRef, kind, openOperationForm, stationRef]);

  const handleGensetSubmit = useCallback(async (data: GensetFormData) => {
    if (!activeCaseId || !busNnRef) {
      setCatalogError('Wybierz szynę nN przed dodaniem agregatu.');
      return;
    }

    await executeDomainOperation(activeCaseId, 'add_genset_nn', {
      bus_nn_ref: busNnRef,
      station_ref: stationRef,
      placement: data.placement,
      existing_field_ref: data.placement === 'EXISTING_FIELD' ? data.existing_field_ref : null,
      source_field: buildSourceField('GENSET', data),
      genset_spec: {
        catalog_item_id: data.catalog_item_id,
        rated_power_kw: data.rated_power_kw,
        rated_voltage_kv: data.rated_voltage_kv,
        power_factor: data.power_factor,
        operation_mode: data.operation_mode,
        fuel_type: data.fuel_type,
        source_name: data.source_name,
      },
    });
    closeForm();
  }, [activeCaseId, busNnRef, closeForm, executeDomainOperation, stationRef]);

  const handleUpsSubmit = useCallback(async (data: UPSFormData) => {
    if (!activeCaseId || !busNnRef) {
      setCatalogError('Wybierz szynę nN przed dodaniem UPS.');
      return;
    }

    await executeDomainOperation(activeCaseId, 'add_ups_nn', {
      bus_nn_ref: busNnRef,
      station_ref: stationRef,
      placement: data.placement,
      existing_field_ref: data.placement === 'EXISTING_FIELD' ? data.existing_field_ref : null,
      source_field: buildSourceField('UPS', data),
      ups_spec: {
        catalog_item_id: data.catalog_item_id,
        rated_power_kw: data.rated_power_kw,
        backup_time_min: data.backup_time_min,
        operation_mode: data.operation_mode,
        battery_type: data.battery_type,
        source_name: data.source_name,
      },
    });
    closeForm();
  }, [activeCaseId, busNnRef, closeForm, executeDomainOperation, stationRef]);

  const initialData = useMemo(() => ({
    placement: initialExistingFieldRef ? 'EXISTING_FIELD' as const : 'NEW_FIELD' as const,
    existing_field_ref: initialExistingFieldRef || null,
  }), [initialExistingFieldRef]);

  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="add-dispatchable-source-form">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {kind === 'GENSET' ? 'Nowy agregat nN' : 'Nowy UPS nN'}
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Stacja: <span className="font-medium text-slate-700">{stationLabel(snapshot, stationRef)}</span>
        </p>
      </div>

      <div className="space-y-4 p-4">
        {(catalogError || fieldOptions.length === 0) && (
          <div className={`rounded-md px-3 py-2 text-xs ${catalogError ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-amber-200 bg-amber-50 text-amber-800'}`}>
            {catalogError ?? 'Na tej szynie nN nie ma jeszcze pola przyłączeniowego dla agregatu lub UPS.'}
            {!catalogError && (
              <button type="button" onClick={handleCreateSourceField} className="ml-3 rounded-md border border-amber-300 bg-white px-2 py-1 font-medium text-amber-900">
                Dodaj pole przyłączeniowe
              </button>
            )}
          </div>
        )}

        <label className="block">
          <span className="text-[11px] font-medium text-slate-700">Szyna nN</span>
          <select value={busNnRef} onChange={(event) => setBusNnRef(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">— wybierz —</option>
            {busOptions.map((bus) => (
              <option key={bus.ref_id} value={bus.ref_id}>
                {bus.name} ({bus.voltage_kv} kV)
              </option>
            ))}
          </select>
        </label>

        {kind === 'GENSET' ? (
          <GensetModal
            isOpen={true}
            mode="create"
            embedded={true}
            hideHeader={true}
            initialData={initialData}
            fieldOptions={fieldOptions}
            catalogEntries={catalogEntries.map((item) => ({
              id: item.id,
              name: item.name,
              manufacturer: item.manufacturer,
              summary: `Un ${item.voltage_rating_kv} kV, Sk'' ${item.sk3_mva} MVA`,
            }))}
            switchCatalogEntries={switchCatalogEntries.map((item) => ({
              id: item.id,
              name: item.name,
              manufacturer: item.manufacturer,
              summary: `Un ${item.u_n_kv} kV, In ${item.i_n_a} A`,
            }))}
            onSubmit={handleGensetSubmit}
            onCancel={closeForm}
          />
        ) : (
          <UPSModal
            isOpen={true}
            mode="create"
            embedded={true}
            hideHeader={true}
            initialData={initialData}
            fieldOptions={fieldOptions}
            catalogEntries={catalogEntries.map((item) => ({
              id: item.id,
              name: item.name,
              manufacturer: item.manufacturer,
              summary: `Un ${item.voltage_rating_kv} kV, Sk'' ${item.sk3_mva} MVA`,
            }))}
            switchCatalogEntries={switchCatalogEntries.map((item) => ({
              id: item.id,
              name: item.name,
              manufacturer: item.manufacturer,
              summary: `Un ${item.u_n_kv} kV, In ${item.i_n_a} A`,
            }))}
            onSubmit={handleUpsSubmit}
            onCancel={closeForm}
          />
        )}
      </div>
    </div>
  );
}

export default AddDispatchableSourceForm;
