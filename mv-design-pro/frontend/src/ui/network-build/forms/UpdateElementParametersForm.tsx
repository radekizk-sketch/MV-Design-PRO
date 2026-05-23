import { useCallback, useMemo, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';

interface ManualOverrideEntry {
  key: string;
  value: string;
  reason: string;
}

function parseValue(raw: string): string | number | boolean | null {
  const trimmed = raw.trim();
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return raw;
}

function findElement(snapshot: Record<string, unknown> | null, elementRef: string): Record<string, unknown> | null {
  if (!snapshot || !elementRef) {
    return null;
  }

  const collections = [
    'branches',
    'transformers',
    'branch_points',
    'generators',
    'substations',
    'loads',
    'sources',
    'switches',
  ] as const;

  for (const collectionName of collections) {
    const collection = snapshot[collectionName];
    if (!Array.isArray(collection)) {
      continue;
    }

    const match = collection.find((item) => {
      if (typeof item !== 'object' || item === null) {
        return false;
      }
      const record = item as Record<string, unknown>;
      return record.ref_id === elementRef || record.id === elementRef;
    });

    if (match && typeof match === 'object') {
      return match as Record<string, unknown>;
    }
  }

  return null;
}

export function UpdateElementParametersForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const snapshot = useSnapshotStore((state) => state.snapshot as Record<string, unknown> | null);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);

  const elementRef = (context?.element_ref as string) ?? '';
  const field = (context?.field as string) ?? '';
  const element = useMemo(() => findElement(snapshot, elementRef), [elementRef, snapshot]);

  const [parameterName, setParameterName] = useState(field || '');
  const [parameterValue, setParameterValue] = useState((context?.value as string) ?? '');
  const [manualEquivalent, setManualEquivalent] = useState(Boolean(context?.manual_equivalent));
  const [entries, setEntries] = useState<ManualOverrideEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!activeCaseId || !elementRef) {
      return false;
    }

    if (manualEquivalent) {
      return entries.every((entry) => entry.key.trim() && entry.value.trim());
    }

    return Boolean(parameterName.trim());
  }, [activeCaseId, elementRef, entries, manualEquivalent, parameterName]);

  const addEntry = useCallback(() => {
    setEntries((previous) => [...previous, { key: '', value: '', reason: '' }]);
  }, []);

  const updateEntry = useCallback(
    (index: number, fieldName: keyof ManualOverrideEntry, value: string) => {
      setEntries((previous) =>
        previous.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, [fieldName]: value } : entry,
        ),
      );
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !activeCaseId) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (manualEquivalent) {
        const overrides = entries
          .filter((entry) => entry.key.trim() && entry.value.trim())
          .map((entry) => ({
            key: entry.key.trim(),
            value: parseValue(entry.value),
            reason: entry.reason.trim() || null,
          }));

        const parameterPayload = overrides.reduce<Record<string, unknown>>(
          (accumulator, entry) => {
            accumulator[entry.key] = entry.value;
            return accumulator;
          },
          {
            source_mode: 'EKSPERCKI_RECZNY',
            catalog_namespace: null,
            parameter_source: 'OVERRIDE',
            materialized_params: null,
            overrides,
          },
        );

        await executeDomainOperation(activeCaseId, 'update_element_parameters', {
          element_ref: elementRef,
          parameters: parameterPayload,
        });
      } else {
        await executeDomainOperation(activeCaseId, 'update_element_parameters', {
          element_ref: elementRef,
          updates: {
            [parameterName.trim()]: parseValue(parameterValue),
          },
        });
      }

      closeForm();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nie udało się zaktualizować parametrów');
    } finally {
      setIsSubmitting(false);
    }
  }, [activeCaseId, canSubmit, closeForm, elementRef, entries, executeDomainOperation, manualEquivalent, parameterName, parameterValue]);

  return (
    <div className="h-full overflow-y-auto space-y-3 p-4" data-testid="update-element-parameters-form">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Edycja parametrów elementu</h3>
        <p className="mt-1 text-[11px] text-gray-500">
          Element: <span className="font-medium text-gray-700">{elementRef || '—'}</span>
        </p>
        {element && (
          <p className="text-[11px] text-gray-500">
            Źródło parametrów: <span className="font-medium text-gray-700">{String(element.parameter_source ?? element.source_mode ?? 'nieznane')}</span>
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-[11px] font-medium text-gray-700">
        <input title="manual equivalent toggle"
          checked={manualEquivalent}
          data-testid="manual-equivalent-toggle"
          onChange={(event) => setManualEquivalent(event.target.checked)}
          type="checkbox"
        />
        Umowa równoważna ręczna
      </label>

      {manualEquivalent ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="manual-equivalent-section">
          <p className="text-[11px] text-slate-600">
            Zapis ręczny ustawia `source_mode=EKSPERCKI_RECZNY` oraz komplet override&apos;ów z uzasadnieniem.
          </p>

          {entries.map((entry, index) => (
            <div key={`override-${index}`} className="grid gap-2 md:grid-cols-3">
              <input title="Pole edytowalne (zob. opis kolumny / wiersza)"
                className="rounded border border-gray-300 px-2.5 py-1.5 text-xs"
                data-testid={`manual-equivalent-key-${index}`}
                placeholder="Klucz"
                value={entry.key}
                onChange={(event) => updateEntry(index, 'key', event.target.value)}
              />
              <input title="Pole edytowalne (zob. opis kolumny / wiersza)"
                className="rounded border border-gray-300 px-2.5 py-1.5 text-xs"
                data-testid={`manual-equivalent-value-${index}`}
                placeholder="Wartość"
                value={entry.value}
                onChange={(event) => updateEntry(index, 'value', event.target.value)}
              />
              <input title="Pole edytowalne (zob. opis kolumny / wiersza)"
                className="rounded border border-gray-300 px-2.5 py-1.5 text-xs"
                data-testid={`manual-equivalent-reason-${index}`}
                placeholder="Uzasadnienie"
                value={entry.reason}
                onChange={(event) => updateEntry(index, 'reason', event.target.value)}
              />
            </div>
          ))}

          <button
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
            data-testid="manual-equivalent-add-entry"
            onClick={addEntry}
            type="button"
          >
            Dodaj wpis override
          </button>
        </div>
      ) : (
        <>
          <label className="block">
            <span className="text-[11px] font-medium text-gray-700">Parametr</span>
            <input title="Parametr"
              value={parameterName}
              onChange={(event) => setParameterName(event.target.value)}
              placeholder="np. tap_position"
              className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-xs"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-gray-700">Wartość</span>
            <input title="Wartość"
              value={parameterValue}
              onChange={(event) => setParameterValue(event.target.value)}
              placeholder="np. 2, true, null"
              className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-xs"
            />
          </label>

          <p className="text-[10px] text-gray-500">Konwersja: liczby/bool/null wykrywane automatycznie.</p>
        </>
      )}

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {isSubmitting ? 'Zapisywanie…' : 'Zapisz parametry'}
        </button>
        <button type="button" onClick={closeForm} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600">
          Anuluj
        </button>
      </div>
    </div>
  );
}

export default UpdateElementParametersForm;
