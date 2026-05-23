import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAppStateStore } from '../../app-state';
import { fetchProtectionDeviceTypes } from '../../catalog/api';
import { buildCatalogBinding } from '../../catalog/catalogBinding';
import type { ProtectionDeviceType } from '../../catalog/types';
import {
  buildControlDeviceOptions,
  measurementCountsForField,
} from '../../field/fieldControlSelectors';
import {
  buildFieldReadModelOptions,
  resolveFieldReadModelItem,
} from '../../field/fieldReadModelSelectors';
import { useFieldReadModel } from '../../field/useFieldReadModel';
import { useActiveOperationForm, useNetworkBuildStore } from '../networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { validateCatalogFirst } from './catalogFirstRules';

type RelayType =
  | 'NADPRADOWY'
  | 'ZIEMNOZWARCIOWY'
  | 'KIERUNKOWY_NADPRADOWY'
  | 'ODLEGLOSCIOWY'
  | 'ROZNICOWY'
  | 'NIESTANDARDOWY';

const RELAY_TYPE_LABELS: Record<RelayType, string> = {
  NADPRADOWY: 'Nadprądowy',
  ZIEMNOZWARCIOWY: 'Ziemnozwarciowy',
  KIERUNKOWY_NADPRADOWY: 'Kierunkowy nadprądowy',
  ODLEGLOSCIOWY: 'Odległościowy',
  ROZNICOWY: 'Różnicowy',
  NIESTANDARDOWY: 'Niestandardowy',
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function AddRelayForm() {
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeForm = useActiveOperationForm();
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const fieldReadModel = useFieldReadModel();
  const context = activeForm?.context as Record<string, unknown> | undefined;

  const [catalogEntries, setCatalogEntries] = useState<ProtectionDeviceType[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bayOptions = useMemo(
    () => buildFieldReadModelOptions(fieldReadModel.data.fields, snapshot),
    [fieldReadModel.data.fields, snapshot],
  );
  const initialFieldItem = useMemo(
    () => resolveFieldReadModelItem(fieldReadModel.data.fields, context),
    [context, fieldReadModel.data.fields],
  );
  const initialBayRef = initialFieldItem?.bay_ref ?? '';

  const [bayRef, setBayRef] = useState(initialBayRef);
  const [relayType, setRelayType] = useState<RelayType>('NADPRADOWY');
  const [catalogItemId, setCatalogItemId] = useState('');
  const [breakerRef, setBreakerRef] = useState('');

  useEffect(() => {
    setBayRef(initialBayRef || bayOptions[0]?.ref_id || '');
  }, [bayOptions, initialBayRef]);

  useEffect(() => {
    setRelayType((readString(context?.relay_type) as RelayType) || 'NADPRADOWY');
    setCatalogItemId(readString(context?.catalog_item_id) || readString(context?.catalog_ref));
  }, [context]);

  const selectedFieldItem = useMemo(
    () => fieldReadModel.itemsByBayRef.get(bayRef) ?? null,
    [bayRef, fieldReadModel.itemsByBayRef],
  );

  const canonicalBreakerOptions = useMemo(
    () => buildControlDeviceOptions(selectedFieldItem),
    [selectedFieldItem],
  );

  useEffect(() => {
    const explicitBreakerRef = readString(context?.breaker_ref);
    if (explicitBreakerRef) {
      setBreakerRef(explicitBreakerRef);
      return;
    }
    const elementRef = readString(context?.element_ref);
    if (elementRef && canonicalBreakerOptions.some((option) => option.ref_id === elementRef)) {
      setBreakerRef(elementRef);
      return;
    }
    setBreakerRef(canonicalBreakerOptions[0]?.ref_id ?? '');
  }, [canonicalBreakerOptions, context]);

  useEffect(() => {
    let active = true;

    void fetchProtectionDeviceTypes()
      .then((items) => {
        if (!active) return;
        setCatalogEntries(items);
        setCatalogError(null);
      })
      .catch((error) => {
        if (!active) return;
        setCatalogError(error instanceof Error ? error.message : 'Nie udało się pobrać katalogu zabezpieczeń.');
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedBayInfo = useMemo(
    () => bayOptions.find((option) => option.ref_id === bayRef) ?? null,
    [bayOptions, bayRef],
  );

  const breakerOptions = useMemo(() => {
    return canonicalBreakerOptions.map((option) => ({
      ref_id: option.ref_id,
      name: option.name,
      type: option.kind,
    }));
  }, [canonicalBreakerOptions]);

  const measurementSummary = useMemo(() => {
    return measurementCountsForField(selectedFieldItem);
  }, [selectedFieldItem]);

  const selectedCatalog = useMemo(
    () => catalogEntries.find((item) => item.id === catalogItemId) ?? null,
    [catalogEntries, catalogItemId],
  );

  const canSubmit = Boolean(activeCaseId && bayRef && catalogItemId.trim());

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId) {
      setSubmitError('Wybierz zakres obliczeń przed zapisem zabezpieczenia.');
      return;
    }
    if (!bayRef) {
      setSubmitError('Wybierz pole SN, do którego ma zostać dodane zabezpieczenie.');
      return;
    }
    if (!catalogItemId.trim()) {
      setSubmitError('Wybierz typ zabezpieczenia z katalogu.');
      return;
    }

    const payload = {
      bay_ref: bayRef,
      breaker_ref: breakerRef || undefined,
      relay_type: relayType,
      catalog_item_id: catalogItemId.trim(),
      catalog_ref: catalogItemId.trim(),
      catalog_binding: buildCatalogBinding('ZABEZPIECZENIE', catalogItemId.trim()),
      protection: {
        catalog_item_id: catalogItemId.trim(),
        catalog_item_version: '2024.1',
      },
    };

    const validationError = validateCatalogFirst('add_relay', payload);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await executeDomainOperation(activeCaseId, 'add_relay', payload);
      if (!response) {
        setSubmitError(
          useSnapshotStore.getState().error ?? 'Nie udało się dodać zabezpieczenia.',
        );
        return;
      }
      if (response?.error) {
        setSubmitError(response.error);
        return;
      }
      closeForm();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Nie udało się dodać zabezpieczenia.');
    } finally {
      setIsSubmitting(false);
    }
  }, [activeCaseId, bayRef, breakerRef, catalogItemId, closeForm, executeDomainOperation, relayType]);

  return (
    <div className="h-full overflow-y-auto bg-[#07111c] text-[#d7ecff]" data-testid="add-relay-form">
      <div className="border-b border-[#1f3a50] bg-[#0b1624] px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Dodaj zabezpieczenie SN</h3>
        <p className="mt-1 text-[11px] text-[#8fb8d8]">
          Katalog-first dla pola SN z poziomu schematu jednokreskowego.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <section className="rounded-lg border border-[#1f3a50] bg-[#0b1624] p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-300">Kontekst pola</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-[11px] font-medium text-[#b8d6ef]">Pole SN</span>
              <select title="Pole SN"
                value={bayRef}
                onChange={(event) => setBayRef(event.target.value)}
                className="mt-1 w-full rounded-md border border-[#2d4a63] bg-[#050c14] px-3 py-2 text-sm text-white"
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
              <span className="text-[11px] font-medium text-[#b8d6ef]">Aparat powiązany</span>
              <select title="Aparat powiązany"
                value={breakerRef}
                onChange={(event) => setBreakerRef(event.target.value)}
                className="mt-1 w-full rounded-md border border-[#2d4a63] bg-[#050c14] px-3 py-2 text-sm text-white"
              >
                <option value="">- bez powiązania -</option>
                {breakerOptions.map((option) => (
                  <option key={option.ref_id} value={option.ref_id}>
                    {option.name} ({option.type})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-[#b8d6ef]">Rodzina ochrony</span>
              <select title="Rodzina ochrony"
                value={relayType}
                onChange={(event) => setRelayType(event.target.value as RelayType)}
                className="mt-1 w-full rounded-md border border-[#2d4a63] bg-[#050c14] px-3 py-2 text-sm text-white"
              >
                {Object.entries(RELAY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedBayInfo && (
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded border border-[#25445d] bg-[#08111d] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-[#6f9fc4]">Stacja</div>
                <div className="mt-1 text-xs font-medium text-white">{selectedBayInfo.station_name}</div>
              </div>
              <div className="rounded border border-[#25445d] bg-[#08111d] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-[#6f9fc4]">Szyna</div>
                <div className="mt-1 text-xs font-medium text-white">{selectedBayInfo.bus_name}</div>
              </div>
              <div className="rounded border border-[#25445d] bg-[#08111d] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-[#6f9fc4]">Pomiar</div>
                <div className="mt-1 text-xs font-medium text-white">CT: {measurementSummary.ct} / VT: {measurementSummary.vt}</div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[#1f3a50] bg-[#0b1624] p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-300">Typ katalogowy</div>
          <label className="mt-3 block">
            <span className="text-[11px] font-medium text-[#b8d6ef]">Zabezpieczenie z katalogu</span>
            <select title="Zabezpieczenie z katalogu"
              value={catalogItemId}
              onChange={(event) => setCatalogItemId(event.target.value)}
              className="mt-1 w-full rounded-md border border-[#2d4a63] bg-[#050c14] px-3 py-2 text-sm text-white"
            >
              <option value="">- wybierz -</option>
              {catalogEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.manufacturer ? `${entry.manufacturer} / ${entry.name}` : entry.name}
                </option>
              ))}
            </select>
          </label>

          {selectedCatalog && (
            <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
              <div className="font-medium">{selectedCatalog.name}</div>
              <div className="mt-1">
                Producent: {selectedCatalog.manufacturer ?? selectedCatalog.vendor ?? '-'}
                {selectedCatalog.model ? ` | Model: ${selectedCatalog.model}` : ''}
              </div>
            </div>
          )}

          {catalogError && (
            <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {catalogError}
            </div>
          )}
        </section>

        {submitError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {submitError}
          </div>
        )}

        {bayOptions.length === 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
            Najpierw dodaj pole SN, aby skonfigurować zabezpieczenie.
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting || bayOptions.length === 0}
            className="rounded-md bg-[#00a8d8] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {isSubmitting ? 'Dodawanie...' : 'Dodaj zabezpieczenie'}
          </button>
          <button
            type="button"
            onClick={closeForm}
            className="rounded-md border border-[#2d4a63] px-3 py-2 text-xs text-[#b8d6ef]"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddRelayForm;
