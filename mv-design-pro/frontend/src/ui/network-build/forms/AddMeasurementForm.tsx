import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCtTypes, fetchVtTypes } from '../../catalog/api';
import type { CTCatalogType, VTCatalogType } from '../../catalog/types';
import { useAppStateStore } from '../../app-state';
import {
  buildFieldReadModelOptions,
  resolveFieldReadModelItem,
} from '../../field/fieldReadModelSelectors';
import { useFieldReadModel } from '../../field/useFieldReadModel';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationForm, useNetworkBuildStore } from '../networkBuildStore';
import { validateCatalogFirst } from './catalogFirstRules';

type MeasurementCatalogType = CTCatalogType | VTCatalogType;
type MeasurementOperation = 'add_ct' | 'add_vt';

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getMeasurementOperation(op: string | undefined): MeasurementOperation {
  return op === 'add_vt' ? 'add_vt' : 'add_ct';
}

export function AddMeasurementForm() {
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeForm = useActiveOperationForm();
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const fieldReadModel = useFieldReadModel();
  const context = activeForm?.context as Record<string, unknown> | undefined;
  const operation = getMeasurementOperation(activeForm?.op);
  const isCt = operation === 'add_ct';

  const [catalogEntries, setCatalogEntries] = useState<MeasurementCatalogType[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bayOptions = useMemo(
    () => buildFieldReadModelOptions(fieldReadModel.data.fields, snapshot),
    [fieldReadModel.data.fields, snapshot],
  );
  const initialBayRef = useMemo(
    () => resolveFieldReadModelItem(fieldReadModel.data.fields, context)?.bay_ref ?? '',
    [context, fieldReadModel.data.fields],
  );

  const [bayRef, setBayRef] = useState(initialBayRef);
  const [catalogRef, setCatalogRef] = useState('');
  const [ratioPrimary, setRatioPrimary] = useState('');
  const [ratioSecondary, setRatioSecondary] = useState(isCt ? '5' : '100');
  const [accuracyClass, setAccuracyClass] = useState('0.5');
  const [burdenVa, setBurdenVa] = useState('');

  useEffect(() => {
    setBayRef(initialBayRef || bayOptions[0]?.ref_id || '');
  }, [bayOptions, initialBayRef]);

  useEffect(() => {
    setCatalogRef(readString(context?.catalog_item_id) || readString(context?.catalog_ref));
  }, [context]);

  useEffect(() => {
    setRatioPrimary('');
    setRatioSecondary(isCt ? '5' : '100');
    setAccuracyClass('0.5');
    setBurdenVa('');
  }, [isCt]);

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      try {
        const entries = isCt ? await fetchCtTypes() : await fetchVtTypes();
        if (!active) return;
        setCatalogEntries(entries);
        setCatalogError(null);
      } catch (error) {
        if (!active) return;
        setCatalogError(
          error instanceof Error
            ? error.message
            : 'Nie udalo sie pobrac katalogu przekladnikow.',
        );
      }
    };

    void loadCatalog();

    return () => {
      active = false;
    };
  }, [isCt]);

  useEffect(() => {
    const selectedCatalog = catalogEntries.find((entry) => entry.id === catalogRef);
    if (!selectedCatalog) {
      return;
    }

    if (isCt) {
      const entry = selectedCatalog as CTCatalogType;
      setRatioPrimary(String(entry.ratio_primary_a));
      setRatioSecondary(String(entry.ratio_secondary_a));
      setAccuracyClass(entry.accuracy_class ?? '0.5');
      setBurdenVa(entry.burden_va != null ? String(entry.burden_va) : '');
      return;
    }

    const entry = selectedCatalog as VTCatalogType;
    setRatioPrimary(String(entry.ratio_primary_v));
    setRatioSecondary(String(entry.ratio_secondary_v));
    setAccuracyClass(entry.accuracy_class ?? '0.5');
    setBurdenVa('');
  }, [catalogEntries, catalogRef, isCt]);

  const selectedBayInfo = useMemo(
    () => bayOptions.find((option) => option.ref_id === bayRef) ?? null,
    [bayOptions, bayRef],
  );

  const selectedCatalog = useMemo(
    () => catalogEntries.find((entry) => entry.id === catalogRef) ?? null,
    [catalogEntries, catalogRef],
  );

  const canSubmit = Boolean(activeCaseId && bayRef && catalogRef.trim() && ratioPrimary.trim());

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId) {
      setSubmitError('Brak aktywnego przypadku obliczeniowego.');
      return;
    }
    if (!bayRef) {
      setSubmitError('Wybierz pole SN, do ktorego ma zostac dodany przekladnik.');
      return;
    }
    if (!catalogRef.trim()) {
      setSubmitError(isCt
        ? 'Wybierz typ przekladnika pradowego z katalogu.'
        : 'Wybierz typ przekladnika napieciowego z katalogu.');
      return;
    }

    const primary = Number(ratioPrimary);
    const secondary = Number(ratioSecondary);
    const burden = burdenVa.trim() ? Number(burdenVa) : null;

    if (!Number.isFinite(primary) || primary <= 0) {
      setSubmitError('Podaj poprawna wartosc przekladni pierwotnej.');
      return;
    }
    if (!Number.isFinite(secondary) || secondary <= 0) {
      setSubmitError('Podaj poprawna wartosc przekladni wtorniej.');
      return;
    }
    if (burdenVa.trim() && (!Number.isFinite(burden) || burden == null || burden < 0)) {
      setSubmitError('Moc obciazeniowa musi byc liczba nieujemna.');
      return;
    }

    const payload: Record<string, unknown> = {
      bay_ref: bayRef,
      catalog_ref: catalogRef.trim(),
      catalog_binding: {
        catalog_namespace: isCt ? 'CT' : 'VT',
        catalog_item_id: catalogRef.trim(),
      },
      accuracy_class: accuracyClass.trim() || undefined,
      burden_va: burden,
    };

    if (isCt) {
      payload.ratio_primary_a = primary;
      payload.ratio_secondary_a = secondary;
    } else {
      payload.ratio_primary_v = primary;
      payload.ratio_secondary_v = secondary;
    }

    const validationError = validateCatalogFirst(operation, payload);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await executeDomainOperation(activeCaseId, operation, payload);
      if (response?.error) {
        setSubmitError(response.error);
        return;
      }
      closeForm();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Nie udalo sie dodac przekladnika do pola.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    accuracyClass,
    activeCaseId,
    bayRef,
    burdenVa,
    catalogRef,
    closeForm,
    executeDomainOperation,
    isCt,
    operation,
    ratioPrimary,
    ratioSecondary,
  ]);

  return (
    <div className="h-full overflow-y-auto bg-white" data-testid={isCt ? 'add-ct-form' : 'add-vt-form'}>
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {isCt ? 'Dodaj przekladnik pradowy CT' : 'Dodaj przekladnik napieciowy VT'}
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Kanoniczny formularz pola SN w trybie katalog-first.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kontekst pola</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-medium text-slate-700">Pole SN</span>
              <select
                value={bayRef}
                onChange={(event) => setBayRef(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">- wybierz -</option>
                {bayOptions.map((option) => (
                  <option key={option.ref_id} value={option.ref_id}>
                    {option.station_name} / {option.name} / {option.bay_role}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-700">
                {isCt ? 'Przekladnik pradowy z katalogu' : 'Przekladnik napieciowy z katalogu'}
              </span>
              <select
                value={catalogRef}
                onChange={(event) => setCatalogRef(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">- wybierz -</option>
                {catalogEntries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.manufacturer ? `${entry.manufacturer} / ${entry.name}` : entry.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedBayInfo && (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Stacja</div>
                <div className="mt-1 text-xs font-medium text-slate-800">{selectedBayInfo.station_name}</div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Szyna</div>
                <div className="mt-1 text-xs font-medium text-slate-800">{selectedBayInfo.bus_name}</div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Dane znamionowe
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-medium text-slate-700">
                {isCt ? 'Przekladnia pierwotna [A]' : 'Przekladnia pierwotna [V]'}
              </span>
              <input
                type="number"
                min="0"
                step="any"
                value={ratioPrimary}
                onChange={(event) => setRatioPrimary(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-700">
                {isCt ? 'Przekladnia wtornia [A]' : 'Przekladnia wtornia [V]'}
              </span>
              <input
                type="number"
                min="0"
                step="any"
                value={ratioSecondary}
                onChange={(event) => setRatioSecondary(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-700">Klasa dokladnosci</span>
              <input
                type="text"
                value={accuracyClass}
                onChange={(event) => setAccuracyClass(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-700">Moc obciazeniowa [VA]</span>
              <input
                type="number"
                min="0"
                step="any"
                value={burdenVa}
                onChange={(event) => setBurdenVa(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          {selectedCatalog && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <div className="font-medium">{selectedCatalog.name}</div>
              <div className="mt-1">Producent: {selectedCatalog.manufacturer ?? '-'}</div>
            </div>
          )}

          {catalogError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {catalogError}
            </div>
          )}
        </section>

        {submitError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {submitError}
          </div>
        )}

        {bayOptions.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Brak pol SN w aktywnym modelu. Dodanie przekladnika wymaga istniejacego pola.
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting || bayOptions.length === 0}
            className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {isSubmitting
              ? (isCt ? 'Dodawanie CT...' : 'Dodawanie VT...')
              : (isCt ? 'Dodaj CT' : 'Dodaj VT')}
          </button>
          <button
            type="button"
            onClick={closeForm}
            className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddMeasurementForm;
