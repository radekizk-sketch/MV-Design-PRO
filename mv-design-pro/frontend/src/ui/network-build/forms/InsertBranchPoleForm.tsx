import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { fetchBranchPointTypes } from '../../catalog/api';
import { TypePicker } from '../../catalog/TypePicker';
import type { BranchPointCatalogType } from '../../catalog/types';
import { useAppStateStore } from '../../app-state';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { validateCatalogFirst } from './catalogFirstRules';
import { normalizeCatalogBinding, normalizeSwitchState } from './catalogPayload';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';

function formatSwitchKind(kind: string | undefined): string {
  switch ((kind ?? '').toUpperCase()) {
    case 'ODLACZNIK':
      return 'Odłącznik';
    case 'ROZLACZNIK':
      return 'Rozłącznik';
    default:
      return kind ?? 'Łącznik';
  }
}

export function InsertBranchPoleForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);

  const [name, setName] = useState((context?.name as string) ?? 'Słup rozgałęźny SN');
  const [ratio, setRatio] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogTypes, setCatalogTypes] = useState<BranchPointCatalogType[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<BranchPointCatalogType | null>(null);

  const segmentId = useMemo(
    () => (context?.segment_id as string) ?? (context?.segment_ref as string) ?? '',
    [context],
  );
  const switchState = useMemo(
    () => normalizeSwitchState(context?.switch_state),
    [context],
  );

  useEffect(() => {
    let cancelled = false;

    fetchBranchPointTypes('BRANCH_POLE')
      .then((items) => {
        if (!cancelled) {
          setCatalogTypes(items);
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Nie udało się pobrać katalogu słupów.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectCatalog = useCallback(
    (catalogId: string) => {
      const nextCatalog = catalogTypes.find((item) => item.id === catalogId) ?? null;
      setSelectedCatalog(nextCatalog);
      if (nextCatalog) {
        setName((current) => current.trim() || nextCatalog.name);
      }
    },
    [catalogTypes],
  );

  const onSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!activeCaseId) {
        return;
      }

      const payload = {
        segment_id: segmentId,
        name: name.trim() || selectedCatalog?.name || 'Słup rozgałęźny SN',
        switch_state: switchState,
        insert_at: { mode: 'RATIO', value: ratio },
        catalog_binding: normalizeCatalogBinding(selectedCatalog?.id ?? null, 'mv_branch_points'),
      };

      const validationError = validateCatalogFirst('insert_branch_pole_on_segment_sn', payload);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      await executeDomainOperation(activeCaseId, 'insert_branch_pole_on_segment_sn', payload);
      closeForm();
    },
    [activeCaseId, closeForm, executeDomainOperation, name, ratio, segmentId, selectedCatalog, switchState],
  );

  return (
    <form className="space-y-4 p-4" data-testid="insert-branch-pole-form" onSubmit={onSubmit}>
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Wstaw słup rozgałęźny</h3>
        <p className="mt-1 text-xs text-gray-500">Operacja katalog-first dla obiektu pośredniego SN.</p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <label className="block text-xs text-gray-600">
        Odcinek SN
        <input className="mt-1 w-full rounded border px-2 py-1 text-xs" value={segmentId} readOnly />
      </label>

      <label className="block text-xs text-gray-600">
        Nazwa
        <input
          className="mt-1 w-full rounded border px-2 py-1 text-xs"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="block text-xs text-gray-600">
        Pozycja (0-1)
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          className="mt-1 w-full rounded border px-2 py-1 text-xs"
          value={ratio}
          onChange={(event) => setRatio(Number(event.target.value))}
        />
      </label>

      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-slate-700">Typ katalogowy</div>
            <div className="text-[11px] text-slate-500">Wymagany do utworzenia słupa rozgałęźnego.</div>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
          >
            Wybierz z katalogu
          </button>
        </div>

        {selectedCatalog && (
          <div
            className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-700"
            data-testid="branch-pole-catalog-summary"
          >
            <div className="font-semibold text-slate-900">{selectedCatalog.name}</div>
            <div className="mt-1">
              {formatSwitchKind(selectedCatalog.switch_device_kind)} / {selectedCatalog.switch_rated_current_a ?? '-'} A
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-xs text-white">
          Wstaw słup
        </button>
        <button type="button" onClick={closeForm} className="rounded border px-3 py-1 text-xs">
          Anuluj
        </button>
      </div>

      <TypePicker
        category="BRANCH_POLE"
        currentTypeId={selectedCatalog?.id ?? null}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectType={(catalogId) => handleSelectCatalog(catalogId)}
      />
    </form>
  );
}
