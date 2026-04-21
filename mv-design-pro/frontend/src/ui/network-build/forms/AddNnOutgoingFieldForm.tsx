import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationForm, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { catalogRefFromInput, normalizeCatalogBinding } from './catalogPayload';
import { CatalogPicker, type CatalogEntry } from '../../topology/modals/CatalogPicker';
import { fetchLvApparatusTypes } from '../../catalog/api';
import type { LVApparatusType } from '../../catalog/types';
import {
  listNnBusOptions,
  resolveBusNnRef,
  resolveStationRef,
  stationLabel,
} from './enmResolvers';

type FieldIntent = 'FEEDER' | 'SOURCE';

export function AddNnOutgoingFieldForm() {
  const activeForm = useActiveOperationForm() as
    | { op: 'add_nn_outgoing_field'; context?: Record<string, unknown> }
    | null;
  const context = activeForm?.context;
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);

  const stationRef = useMemo(
    () => resolveStationRef(context, snapshot),
    [context, snapshot],
  );
  const busOptions = useMemo(() => listNnBusOptions(snapshot, stationRef), [snapshot, stationRef]);
  const resolvedBusRef = useMemo(
    () => resolveBusNnRef(context, snapshot),
    [context, snapshot],
  );
  const initialCatalogRef = useMemo(
    () => catalogRefFromInput(context?.catalog_binding) ?? catalogRefFromInput(context?.catalog_ref) ?? '',
    [context],
  );
  const intent = useMemo<FieldIntent>(() => {
    return context?.field_role === 'SOURCE' ? 'SOURCE' : 'FEEDER';
  }, [context?.field_role]);
  const sourceFieldKind = useMemo(() => {
    const kind = typeof context?.source_field_kind === 'string' ? context.source_field_kind.trim() : '';
    return kind || 'PV';
  }, [context]);

  const [busNnRef, setBusNnRef] = useState(resolvedBusRef ?? busOptions[0]?.ref_id ?? '');
  const [fieldName, setFieldName] = useState(
    intent === 'SOURCE' ? 'Pole źródłowe nN' : 'Odpływ nN',
  );
  const [catalogItemId, setCatalogItemId] = useState(initialCatalogRef);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
  const [catalogFetchError, setCatalogFetchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setBusNnRef(resolvedBusRef ?? busOptions[0]?.ref_id ?? '');
  }, [resolvedBusRef, busOptions]);

  useEffect(() => {
    setCatalogItemId(initialCatalogRef);
  }, [initialCatalogRef]);

  useEffect(() => {
    setFieldName(intent === 'SOURCE' ? 'Pole źródłowe nN' : 'Odpływ nN');
  }, [intent]);

  useEffect(() => {
    let active = true;

    void fetchLvApparatusTypes()
      .then((types) => {
        if (!active) {
          return;
        }
        setCatalogEntries(
          types.map((item: LVApparatusType) => ({
            id: item.id,
            name: item.name,
            manufacturer: item.manufacturer,
            summary: `Un ${item.u_n_kv} kV, In ${item.i_n_a} A`,
          })),
        );
        setCatalogFetchError(null);
      })
      .catch((catalogError) => {
        if (!active) {
          return;
        }
        setCatalogEntries([]);
        setCatalogFetchError(
          catalogError instanceof Error
            ? catalogError.message
            : 'Nie udało się pobrać katalogu aparatury nN.',
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedBus = useMemo(
    () => busOptions.find((bus) => bus.ref_id === busNnRef) ?? null,
    [busOptions, busNnRef],
  );

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId) {
      setError('Brak aktywnego przypadku obliczeniowego.');
      return;
    }
    if (!stationRef) {
      setError('Nie udało się ustalić stacji dla nowego pola nN.');
      return;
    }
    if (!busNnRef) {
      setError('Wybierz szynę nN, do której ma zostać dodane pole.');
      return;
    }
    if (!catalogItemId.trim()) {
      setError('Wskaż aparat nN z katalogu albo uzupełnij identyfikator katalogowy.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const payload = intent === 'SOURCE'
        ? {
            station_ref: stationRef,
            bus_nn_ref: busNnRef,
            field_role: 'SOURCE',
            source_field_kind: sourceFieldKind,
            field_name: fieldName.trim() || undefined,
            catalog_binding: normalizeCatalogBinding(catalogItemId, 'APARAT_NN') ?? undefined,
          }
        : {
            station_ref: stationRef,
            bus_nn_ref: busNnRef,
            field_name: fieldName.trim() || undefined,
            field_role: 'FEEDER',
            catalog_binding: normalizeCatalogBinding(catalogItemId, 'APARAT_NN') ?? undefined,
          };

      await executeDomainOperation(activeCaseId, 'add_nn_outgoing_field', payload);
      closeForm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : intent === 'SOURCE'
            ? 'Nie udało się dodać pola źródłowego nN.'
            : 'Nie udało się dodać pola nN.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeCaseId,
    busNnRef,
    catalogItemId,
    closeForm,
    executeDomainOperation,
    fieldName,
    intent,
    sourceFieldKind,
    stationRef,
  ]);

  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="add-nn-outgoing-field-form">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {intent === 'SOURCE' ? 'Nowe pole źródłowe nN' : 'Nowy odpływ nN'}
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Stacja: <span className="font-medium text-slate-700">{stationLabel(snapshot, stationRef)}</span>
        </p>
      </div>

      <div className="space-y-4 p-4">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}
        {catalogFetchError && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {catalogFetchError} Możesz tymczasowo wpisać identyfikator katalogowy ręcznie.
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Kontekst
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700">
            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Obiekt</div>
              <div className="mt-1 font-medium text-slate-800">
                {intent === 'SOURCE' ? 'Pole źródłowe nN' : 'Odpływ nN'}
              </div>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Katalog</div>
              <div className="mt-1 font-medium text-slate-800">
                {catalogItemId.trim() || 'Wymagany wybór katalogu'}
              </div>
            </div>
          </div>
        </div>

        <label className="block">
          <span className="text-[11px] font-medium text-slate-700">Szyna nN</span>
          <select
            value={busNnRef}
            onChange={(event) => setBusNnRef(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— wybierz —</option>
            {busOptions.map((bus) => (
              <option key={bus.ref_id} value={bus.ref_id}>
                {bus.name} ({bus.voltage_kv} kV)
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-slate-700">Nazwa pola</span>
          <input
            value={fieldName}
            onChange={(event) => setFieldName(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={intent === 'SOURCE' ? 'np. Pole PV nN #1' : 'np. Odpływ nN #3'}
          />
        </label>

        {intent === 'SOURCE' && (
          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">Rodzina pola źródłowego</span>
            <select
              value={sourceFieldKind}
              disabled
              className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600"
            >
              <option value={sourceFieldKind}>{sourceFieldKind}</option>
            </select>
          </label>
        )}

        {catalogEntries.length > 0 ? (
          <CatalogPicker
            label="Aparat nN z katalogu"
            entries={catalogEntries}
            selectedId={catalogItemId}
            onChange={(id) => setCatalogItemId(id)}
            required
          />
        ) : (
          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">Identyfikator aparatu z katalogu</span>
            <input
              value={catalogItemId}
              onChange={(event) => setCatalogItemId(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
              placeholder="np. nn_mccb_630a"
            />
          </label>
        )}
        <span className="block text-[10px] text-slate-500">
          Jeśli wejście pochodzi z bramki katalogowej, wybór katalogu będzie już uzupełniony.
        </span>

        {selectedBus && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
            <div className="font-semibold">Podsumowanie wykonania</div>
            <div className="mt-1">
              System utworzy nowe pole dla szyny <span className="font-medium">{selectedBus.name}</span> i
              oznaczy wyniki sieci jako nieaktualne.
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-slate-200 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Dodawanie…' : intent === 'SOURCE' ? 'Dodaj pole źródłowe' : 'Dodaj pole nN'}
          </button>
          <button
            type="button"
            onClick={closeForm}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddNnOutgoingFieldForm;
