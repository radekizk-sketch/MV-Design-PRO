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
import { resolveTransformerOperationContextFromOperation } from '../operationContextResolvers';

function transformerContextBlockReason(
  context: Record<string, unknown> | undefined,
  snapshot: unknown,
): string | null {
  const resolved = resolveTransformerOperationContextFromOperation(snapshot as never, context);
  if (!resolved.isAllowed) {
    return resolved.blockReason ?? 'Wybierz stację SN/nN z kompletną parą szyn SN i nN.';
  }

  const model = snapshot as {
    substations?: Array<{ ref_id?: string; id?: string; station_type?: string }>;
    buses?: Array<{ ref_id?: string; voltage_kv?: number }>;
  } | null;
  const stationRef = resolved.stationRef ?? '';
  const hvBusRef = resolved.hvBusRef ?? '';
  const lvBusRef = resolved.lvBusRef ?? '';

  if (!stationRef || !hvBusRef || !lvBusRef) {
    return 'Wybierz stację SN/nN z kompletną parą szyn SN i nN.';
  }

  const station = model?.substations?.find(
    (item) => item.ref_id === stationRef || item.id === stationRef,
  );
  if (station?.station_type === 'gpz') {
    return 'Transformator SN/nN nie należy do układu GPZ ani źródła systemowego.';
  }

  const hvBus = model?.buses?.find((item) => item.ref_id === hvBusRef);
  const lvBus = model?.buses?.find((item) => item.ref_id === lvBusRef);
  if (!hvBus || !lvBus) {
    return 'Nie znaleziono szyny SN albo szyny nN wskazanej dla transformatora.';
  }

  const hvVoltage = Number(hvBus.voltage_kv ?? 0);
  const lvVoltage = Number(lvBus.voltage_kv ?? 0);
  if (!Number.isFinite(hvVoltage) || !Number.isFinite(lvVoltage) || hvVoltage <= lvVoltage) {
    return 'Para szyn transformatora ma niepoprawne poziomy napięć SN/nN.';
  }
  return null;
}

export function AddTransformerForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const busOptions = useMemo(() => selectBusOptions(snapshot), [snapshot]);
  const transformerContext = useMemo(
    () => resolveTransformerOperationContextFromOperation(snapshot as never, context),
    [context, snapshot],
  );
  const blockReason = useMemo(
    () => transformerContextBlockReason(context, snapshot),
    [context, snapshot],
  );

  const initialData = useMemo<Partial<TransformerStationFormData>>(() => {
    if (!context) {
      return {};
    }

    return {
      ref_id: (context.ref_id as string) ?? '',
      name: (context.name as string) ?? `Transformator ${transformerContext.stationName}`,
      hv_bus_ref: (context.hv_bus_ref as string) ?? transformerContext.hvBusRef ?? '',
      lv_bus_ref: (context.lv_bus_ref as string) ?? transformerContext.lvBusRef ?? '',
      tap_position: (context.tap_position as number) ?? 0,
      catalog_ref:
        catalogRefFromInput(context.catalog_binding)
        ?? catalogRefFromInput(context.transformer_catalog_ref)
        ?? catalogRefFromInput(context.catalog_ref)
        ?? '',
      parameter_source: 'CATALOG',
      overrides: [],
    };
  }, [context, transformerContext.hvBusRef, transformerContext.lvBusRef, transformerContext.stationName]);

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
      {blockReason ? (
        <div
          className="m-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          data-testid="add-transformer-block"
        >
          <h3 className="font-semibold">Blokada operacji</h3>
          <p className="mt-2">{blockReason}</p>
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
