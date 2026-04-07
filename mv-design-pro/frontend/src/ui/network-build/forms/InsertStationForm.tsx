import { useCallback, useMemo, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { useSelectionStore } from '../../selection';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { CatalogTypeField } from './CatalogTypeField';
import { OperationFormShell } from './OperationFormShell';
import { buildTransformerCatalogBinding } from './catalogBinding';
import { applySelectionHint } from './applySelectionHint';

type StationSemanticType = 'terminal' | 'inline' | 'branch' | 'sectional';

const STATION_TYPE_OPTIONS: Array<{
  value: StationSemanticType;
  label: string;
  helper: string;
}> = [
  {
    value: 'terminal',
    label: 'Stacja końcowa',
    helper: 'Wejście SN + pole transformatorowe. Dla końcówek magistrali.',
  },
  {
    value: 'inline',
    label: 'Stacja przelotowa',
    helper: 'Wejście SN + wyjście SN + pole transformatorowe.',
  },
  {
    value: 'branch',
    label: 'Stacja odgałęźna',
    helper: 'Wejście SN + wyjście SN + pole odgałęźne + transformator.',
  },
  {
    value: 'sectional',
    label: 'Stacja sekcyjna',
    helper: 'Układ sekcyjny bez ringu i NOP w tym etapie. Architektura pozostaje zgodna na później.',
  },
];

function buildStationSnFields(stationType: StationSemanticType): string[] {
  switch (stationType) {
    case 'terminal':
      return ['IN', 'TR'];
    case 'branch':
      return ['IN', 'OUT', 'FEEDER', 'TR'];
    case 'sectional':
      return ['IN', 'OUT', 'COUPLER', 'TR'];
    case 'inline':
    default:
      return ['IN', 'OUT', 'TR'];
  }
}

export function InsertStationForm() {
  const context = useNetworkBuildStore((s) => s.activeOperationForm?.context);
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);

  const segmentRef = useMemo(
    () => (context?.segmentRef as string | undefined) ?? (context?.segment_ref as string | undefined) ?? null,
    [context],
  );
  const segmentLabel = useMemo(
    () => (context?.segmentLabel as string | undefined) ?? segmentRef ?? 'brak odcinka',
    [context, segmentRef],
  );

  const [stationType, setStationType] = useState<StationSemanticType>('inline');
  const [stationName, setStationName] = useState('Stacja SN/nN');
  const [insertRatio, setInsertRatio] = useState(String((context?.insertRatio as number | undefined) ?? 0.5));
  const [snVoltageKv, setSnVoltageKv] = useState('15');
  const [nnVoltageKv, setNnVoltageKv] = useState('0.4');
  const [nnFeederCount, setNnFeederCount] = useState('2');
  const [transformerCatalogId, setTransformerCatalogId] = useState<string | null>(null);
  const [transformerCatalogName, setTransformerCatalogName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stationTypeHelper = STATION_TYPE_OPTIONS.find((option) => option.value === stationType)?.helper ?? '';

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId) {
      setError('Brak aktywnego przypadku obliczeniowego.');
      return;
    }
    if (!segmentRef) {
      setError('Brak odcinka magistrali do wstawienia stacji.');
      return;
    }

    const parsedInsertRatio = Number(insertRatio);
    const parsedSnVoltageKv = Number(snVoltageKv);
    const parsedNnVoltageKv = Number(nnVoltageKv);
    const parsedNnFeederCount = Number(nnFeederCount);

    if (!Number.isFinite(parsedInsertRatio) || parsedInsertRatio <= 0 || parsedInsertRatio >= 1) {
      setError('Pozycja wstawienia musi być współczynnikiem z zakresu (0, 1).');
      return;
    }
    if (!Number.isFinite(parsedSnVoltageKv) || parsedSnVoltageKv <= 0) {
      setError('Podaj dodatnie napięcie SN stacji.');
      return;
    }
    if (!Number.isFinite(parsedNnVoltageKv) || parsedNnVoltageKv <= 0) {
      setError('Podaj dodatnie napięcie nN stacji.');
      return;
    }
    if (!Number.isInteger(parsedNnFeederCount) || parsedNnFeederCount < 0) {
      setError('Liczba odpływów nN musi być liczbą całkowitą nieujemną.');
      return;
    }
    if (!transformerCatalogId) {
      setError('Wybór katalogu transformatora jest obowiązkowy.');
      return;
    }

    setError(null);
    const transformerCatalogBinding = buildTransformerCatalogBinding(transformerCatalogId);
    const response = await executeDomainOperation(activeCaseId, 'insert_station_on_segment_sn', {
      segment_ref: segmentRef,
      station_type: stationType,
      insert_at: {
        mode: 'RATIO',
        value: parsedInsertRatio,
      },
      station: {
        station_type: stationType,
        station_role: 'STACJA_SN_NN',
        station_name: stationName.trim() || undefined,
        sn_voltage_kv: parsedSnVoltageKv,
        nn_voltage_kv: parsedNnVoltageKv,
      },
      sn_fields: buildStationSnFields(stationType),
      transformer: {
        create: true,
        transformer_catalog_ref: transformerCatalogId,
        model_type: 'DWU_UZWOJENIOWY',
        tap_changer_present: false,
        catalog_binding: transformerCatalogBinding,
      },
      nn_block: {
        create_nn_bus: true,
        main_breaker_nn: true,
        outgoing_feeders_nn_count: parsedNnFeederCount,
        outgoing_feeders_nn: Array.from({ length: parsedNnFeederCount }, () => ({
          feeder_role: 'ODPLYW_NN',
          catalog_bindings: null,
        })),
      },
      catalog_binding: transformerCatalogBinding,
    });

    if (!response || response.error) {
      setError(response?.error ?? 'Nie udało się wstawić stacji w odcinek.');
      return;
    }

    applySelectionHint({ response, selectElement, centerSldOnElement });
    closeForm();
  }, [
    activeCaseId,
    centerSldOnElement,
    closeForm,
    executeDomainOperation,
    insertRatio,
    nnFeederCount,
    nnVoltageKv,
    segmentRef,
    selectElement,
    snVoltageKv,
    stationName,
    stationType,
    transformerCatalogId,
  ]);

  return (
    <div className="h-full" data-testid="insert-station-form">
      <OperationFormShell
        title="Wstawienie stacji w odcinek SN"
        description="Stacja jest pełnym bytem technicznym: segment dzieli się deterministycznie, a transformator musi mieć twarde pochodzenie katalogowe."
        submitLabel="Wstaw stację"
        error={error}
        onCancel={closeForm}
        onSubmit={() => {
          void handleSubmit();
        }}
      >
        <div className="space-y-4">
          <div className="rounded border border-chrome-200 bg-chrome-50 px-3 py-2 text-[11px] text-chrome-700">
            <div>
              <span className="font-semibold">Odcinek:</span> {segmentLabel}
            </div>
            <div className="mt-1">
              <span className="font-semibold">Pozycja wstawienia:</span> współczynnik podziału odcinka
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
              Typ układu stacji
            </span>
            <select
              value={stationType}
              onChange={(event) => setStationType(event.target.value as StationSemanticType)}
              className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
            >
              {STATION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px] text-chrome-500">{stationTypeHelper}</p>
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                Nazwa stacji
              </span>
              <input
                type="text"
                value={stationName}
                onChange={(event) => setStationName(event.target.value)}
                className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                Współczynnik podziału odcinka
              </span>
              <input
                type="number"
                min="0.05"
                max="0.95"
                step="0.05"
                value={insertRatio}
                onChange={(event) => setInsertRatio(event.target.value)}
                className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                Napięcie SN [kV]
              </span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={snVoltageKv}
                onChange={(event) => setSnVoltageKv(event.target.value)}
                className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                Napięcie nN [kV]
              </span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={nnVoltageKv}
                onChange={(event) => setNnVoltageKv(event.target.value)}
                className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                Odpływy nN
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={nnFeederCount}
                onChange={(event) => setNnFeederCount(event.target.value)}
                className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <CatalogTypeField
            testId="insert-station-transformer-catalog-field"
            label="Transformator SN/nN z katalogu"
            category="TRANSFORMER"
            selectedTypeId={transformerCatalogId}
            selectedTypeName={transformerCatalogName}
            helperText="Transformator jest twardą bramką tej operacji. Bez katalogu backend odrzuci zmianę Snapshotu."
            error={!transformerCatalogId && error?.includes('katalogu transformatora') ? error : null}
            onSelect={(typeId, typeName) => {
              setTransformerCatalogId(typeId);
              setTransformerCatalogName(typeName);
              setError(null);
            }}
          />
        </div>
      </OperationFormShell>
    </div>
  );
}

export default InsertStationForm;
