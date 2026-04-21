import { useCallback, useMemo, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { useSnapshotStore, selectBusOptions } from '../../topology/snapshotStore';
import { validateCatalogFirst } from './catalogFirstRules';
import { catalogRefFromInput, normalizeCatalogBinding } from './catalogPayload';
import {
  TransformerStationEditor,
  type TransformerStationFormData,
} from './shared/TransformerStationEditor';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';

function isBlockedTransformerContext(
  context: Record<string, unknown> | undefined,
  snapshot: unknown,
): boolean {
  const model = snapshot as {
    substations?: Array<{ ref_id?: string; id?: string; station_type?: string }>;
    buses?: Array<{ ref_id?: string; voltage_kv?: number }>;
  } | null;
  const stationRef = (context?.station_ref as string) ?? '';
  const hvBusRef = (context?.hv_bus_ref as string) ?? '';
  const lvBusRef = (context?.lv_bus_ref as string) ?? '';

  if (!stationRef || !hvBusRef || !lvBusRef) {
    return true;
  }

  const station = model?.substations?.find(
    (item) => item.ref_id === stationRef || item.id === stationRef,
  );
  if (station?.station_type === 'gpz') {
    return true;
  }

  const hvBus = model?.buses?.find((item) => item.ref_id === hvBusRef);
  const lvBus = model?.buses?.find((item) => item.ref_id === lvBusRef);
  if (!hvBus || !lvBus) {
    return true;
  }

  const hvVoltage = Number(hvBus.voltage_kv ?? 0);
  const lvVoltage = Number(lvBus.voltage_kv ?? 0);
  return !Number.isFinite(hvVoltage) || !Number.isFinite(lvVoltage) || hvVoltage <= lvVoltage;
}

export function AddTransformerForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const busOptions = useMemo(() => selectBusOptions(snapshot), [snapshot]);
  const isBlocked = useMemo(
    () => isBlockedTransformerContext(context, snapshot),
    [context, snapshot],
  );

  const initialData = useMemo<Partial<TransformerStationFormData>>(() => {
    if (!context) {
      return {};
    }

    return {
      ref_id: (context.ref_id as string) ?? '',
      name: (context.name as string) ?? '',
      hv_bus_ref: (context.hv_bus_ref as string) ?? '',
      lv_bus_ref: (context.lv_bus_ref as string) ?? '',
      tap_position: (context.tap_position as number) ?? 0,
      catalog_ref:
        catalogRefFromInput(context.catalog_binding)
        ?? catalogRefFromInput(context.transformer_catalog_ref)
        ?? catalogRefFromInput(context.catalog_ref)
        ?? '',
      parameter_source: 'CATALOG',
      overrides: [],
    };
  }, [context]);

  const handleSubmit = useCallback(
    async (data: TransformerStationFormData) => {
      if (!activeCaseId) {
        return;
      }

      const payload = {
        ref_id: data.ref_id,
        name: data.name,
        hv_bus_ref: data.hv_bus_ref,
        lv_bus_ref: data.lv_bus_ref,
        tap_position: data.tap_position,
        catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'TRAFO_SN_NN') ?? undefined,
        station_ref: (context?.station_ref as string) ?? undefined,
      };

      const validationError = validateCatalogFirst('add_transformer_sn_nn', payload);
      if (validationError) {
        setCatalogError(validationError);
        return;
      }

      setCatalogError(null);
      await executeDomainOperation(activeCaseId, 'add_transformer_sn_nn', payload);
      closeForm();
    },
    [activeCaseId, closeForm, context, executeDomainOperation],
  );

  return (
    <div className="h-full overflow-y-auto" data-testid="add-transformer-form">
      {isBlocked ? (
        <div
          className="m-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          data-testid="add-transformer-block"
        >
          <h3 className="font-semibold">Blokada operacji</h3>
          <p className="mt-2">
            Transformator SN/nN nie nalezy do ukladu GPZ lub zrodla systemowego.
          </p>
        </div>
      ) : (
        <>
          {catalogError && (
            <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">
              {catalogError}
            </p>
          )}
          <TransformerStationEditor
            isOpen={true}
            mode="create"
            embedded={true}
            hideHeader={true}
            initialData={initialData}
            busOptions={busOptions}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </>
      )}
    </div>
  );
}
