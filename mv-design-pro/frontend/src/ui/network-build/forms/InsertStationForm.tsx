/**
 * InsertStationForm - formularz wstawiania stacji transformatorowej na segment.
 *
 * Wrapper inline nad TransformerStationModal z ui/topology/modals/.
 * Integruje sie z snapshotStore.executeDomainOperation + networkBuildStore.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  TransformerStationEditor,
  type TransformerStationFormData,
} from './shared/TransformerStationEditor';
import { useSnapshotStore, selectBusOptions } from '../../topology/snapshotStore';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { validateCatalogFirst } from './catalogFirstRules';
import { catalogRefFromInput, normalizeCatalogBinding } from './catalogPayload';
import {
  formatStationTypeLabelPl,
  normalizeTopologicalStationKind,
  type TopologicalStationKind,
} from '../../shared/stationTypeLabels';

function buildDefaultSnFields(stationKind: TopologicalStationKind) {
  const createField = (
    fieldRole: 'LINIA_IN' | 'LINIA_OUT' | 'LINIA_ODG' | 'TRANSFORMATOROWE' | 'SPRZEGLO',
  ) => ({
    field_role: fieldRole,
    catalog_bindings: null,
  });

  switch (stationKind) {
    case 'terminal':
      return [createField('LINIA_IN'), createField('TRANSFORMATOROWE')];
    case 'branch':
      return [
        createField('LINIA_IN'),
        createField('LINIA_OUT'),
        createField('LINIA_ODG'),
        createField('TRANSFORMATOROWE'),
      ];
    case 'sectional':
      return [
        createField('LINIA_IN'),
        createField('LINIA_OUT'),
        createField('SPRZEGLO'),
        createField('TRANSFORMATOROWE'),
      ];
    case 'inline':
    default:
      return [
        createField('LINIA_IN'),
        createField('LINIA_OUT'),
        createField('TRANSFORMATOROWE'),
      ];
  }
}

const FIELD_ROLE_LABELS: Record<string, string> = {
  LINIA_IN: 'Pole liniowe wejściowe',
  LINIA_OUT: 'Pole liniowe wyjściowe',
  LINIA_ODG: 'Pole odgałęźne',
  TRANSFORMATOROWE: 'Pole transformatorowe',
  SPRZEGLO: 'Pole sprzęgłowe',
};

function clampOutgoingFeederCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(8, Math.trunc(value)));
}

function estimateReadiness(
  stationKind: TopologicalStationKind,
  hasPv: boolean,
  hasBess: boolean,
): number {
  const base: Record<TopologicalStationKind, number> = {
    terminal: 78,
    inline: 82,
    branch: 80,
    sectional: 76,
  };
  return Math.min(92, base[stationKind] + (hasPv ? 4 : 0) + (hasBess ? 4 : 0));
}

export function InsertStationForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [outgoingFeederCount, setOutgoingFeederCount] = useState(2);
  const [includePv, setIncludePv] = useState(false);
  const [includeBess, setIncludeBess] = useState(false);

  const busOptions = useMemo(() => selectBusOptions(snapshot), [snapshot]);

  const initialData = useMemo<Partial<TransformerStationFormData>>(() => {
    if (!context) return {};
    const transformerContext = context.transformer as Record<string, unknown> | undefined;
    return {
      ref_id: (context.ref_id as string) ?? '',
      name: (context.name as string) ?? '',
      hv_bus_ref: (context.hv_bus_ref as string) ?? '',
      lv_bus_ref: (context.lv_bus_ref as string) ?? '',
      catalog_ref: (
        catalogRefFromInput(transformerContext?.catalog_binding)
        ?? catalogRefFromInput(context.catalog_binding)
      ) ?? '',
    };
  }, [context]);

  const segmentId = ((context?.segment_id as string) ?? (context?.segment_ref as string) ?? '').trim();
  const positionOnSegment = (context?.position_on_segment as number) ?? 0.5;
  const stationKind = useMemo(
    () => normalizeTopologicalStationKind(
      (context?.station as Record<string, unknown> | undefined)?.station_type
      ?? context?.station_type,
    ),
    [context],
  );
  const stationTypeLabelPl = useMemo(
    () => formatStationTypeLabelPl(stationKind),
    [stationKind],
  );
  const snFieldPreview = useMemo(
    () => buildDefaultSnFields(stationKind).map((field) => FIELD_ROLE_LABELS[field.field_role] ?? field.field_role),
    [stationKind],
  );
  const readinessEstimate = useMemo(
    () => estimateReadiness(stationKind, includePv, includeBess),
    [includeBess, includePv, stationKind],
  );

  const handleSubmit = useCallback(
    async (data: TransformerStationFormData) => {
      if (!activeCaseId) return;
      const hvBusVoltage = busOptions.find((option) => option.ref_id === data.hv_bus_ref)?.voltage_kv;
      const lvBusVoltage = busOptions.find((option) => option.ref_id === data.lv_bus_ref)?.voltage_kv;
      if (hvBusVoltage == null || lvBusVoltage == null) {
        setCatalogError('Nie udało się ustalić napięć szyn stacji. Wybierz poprawne szyny GN i DN.');
        return;
      }
      const transformerBinding = normalizeCatalogBinding(data.catalog_ref, 'TRAFO_SN_NN');
      const normalizedOutgoingFeederCount = clampOutgoingFeederCount(outgoingFeederCount);
      const outgoingFeeders = [
        ...Array.from({ length: normalizedOutgoingFeederCount }, () => ({
          feeder_role: 'ODPLYW_NN' as const,
          catalog_bindings: null,
        })),
        ...(includePv
          ? [{ feeder_role: 'ZRODLO_NN_PV' as const, catalog_bindings: null }]
          : []),
        ...(includeBess
          ? [{ feeder_role: 'ZRODLO_NN_BESS' as const, catalog_bindings: null }]
          : []),
      ];
      const payload = {
        segment_id: segmentId || undefined,
        name: data.name,
        station_type: stationKind,
        insert_at: {
          mode: 'RATIO',
          value: positionOnSegment,
        },
        station: {
          station_type: stationKind,
          station_role: 'STACJA_SN_NN',
          station_name: data.name.trim() || data.ref_id.trim() || undefined,
          sn_voltage_kv: hvBusVoltage,
          nn_voltage_kv: lvBusVoltage,
        },
        sn_fields: buildDefaultSnFields(stationKind),
        transformer: {
          create: true,
          catalog_binding: transformerBinding ?? undefined,
          model_type: 'DWU_UZWOJENIOWY',
          tap_changer_present: data.tap_position !== 0,
        },
        nn_block: {
          create_nn_bus: true,
          main_breaker_nn: true,
          outgoing_feeders_nn_count: outgoingFeeders.length,
          outgoing_feeders_nn: outgoingFeeders,
        },
        options: {
          create_transformer_field: true,
          create_default_fields: true,
          create_nn_bus: true,
        },
      };
      const validationError = validateCatalogFirst('insert_station_on_segment_sn', payload);
      if (validationError) {
        setCatalogError(validationError);
        return;
      }
      setCatalogError(null);
      await executeDomainOperation(activeCaseId, 'insert_station_on_segment_sn', payload);
      closeForm();
    },
    [
      activeCaseId,
      busOptions,
      closeForm,
      executeDomainOperation,
      includeBess,
      includePv,
      outgoingFeederCount,
      positionOnSegment,
      segmentId,
      stationKind,
    ],
  );

  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="insert-station-form">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Wstawienie stacji SN/nN</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Osadzenie {stationTypeLabelPl.toLowerCase()} na wskazanym odcinku magistrali bez opuszczania schematu.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kontekst osadzenia</div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Segment</div>
              <div className="mt-1 text-xs font-medium text-slate-800">{segmentId || '-'}</div>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Pozycja</div>
              <div className="mt-1 text-xs font-medium text-slate-800">{positionOnSegment.toFixed(2)}</div>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Typ stacji</div>
              <div className="mt-1 text-xs font-medium text-slate-800">{stationTypeLabelPl}</div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tryb prosty stacji</div>
              <p className="mt-1 text-xs text-slate-600">
                Wariant katalogowy tworzy pełną stację SN/nN z domyślnymi polami SN, transformatorem i blokiem nN.
              </p>
            </div>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Gotowość szacunkowa: ~{readinessEstimate}%
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block" htmlFor="insert-station-outgoing-feeders">
              <span className="text-[11px] font-medium text-slate-700">Liczba odpływów nN</span>
              <input
                id="insert-station-outgoing-feeders"
                type="number"
                min={1}
                max={8}
                value={outgoingFeederCount}
                onChange={(event) => setOutgoingFeederCount(clampOutgoingFeederCount(Number(event.target.value)))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[11px] font-medium text-slate-700">Domyślne pola SN</div>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {snFieldPreview.map((label) => (
                  <li key={label}>- {label}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-md border border-slate-200 px-3 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={includePv}
                onChange={(event) => setIncludePv(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block font-medium text-slate-900">Dodaj przygotowanie pod PV po stronie nN</span>
                <span className="mt-1 block text-xs text-slate-500">
                  Formularz utworzy dodatkowy odpływ źródłowy nN dla wariantu PV.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-md border border-slate-200 px-3 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={includeBess}
                onChange={(event) => setIncludeBess(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block font-medium text-slate-900">Dodaj przygotowanie pod BESS po stronie nN</span>
                <span className="mt-1 block text-xs text-slate-500">
                  Formularz utworzy dodatkowy odpływ źródłowy nN dla wariantu magazynu energii.
                </span>
              </span>
            </label>
          </div>
        </section>

        {catalogError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">{catalogError}</p>
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
      </div>
    </div>
  );
}
