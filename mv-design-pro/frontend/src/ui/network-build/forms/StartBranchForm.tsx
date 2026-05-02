import { useCallback, useMemo, useState } from 'react';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { validateCatalogFirst } from './catalogFirstRules';
import {
  catalogRefFromInput,
  normalizeCatalogBinding,
  normalizeSegmentKind,
  normalizeSegmentNamespace,
} from './catalogPayload';
import { resolveBranchSourceContextFromOperation } from '../operationContextResolvers';

interface BusOption {
  ref_id: string;
  name: string;
  voltage_kv: number;
}

function createBusOptions(snapshot: {
  buses?: Array<{ ref_id?: string; id?: string; name?: string; voltage_kv?: number }>;
} | null): BusOption[] {
  if (!snapshot?.buses) {
    return [];
  }

  return snapshot.buses
    .filter((bus): bus is { ref_id?: string; id?: string; name?: string; voltage_kv: number } => (
      typeof bus?.voltage_kv === 'number'
    ))
    .map((bus) => ({
      ref_id: bus.ref_id ?? bus.id ?? '',
      name: bus.name ?? bus.ref_id ?? bus.id ?? 'Nieznana szyna',
      voltage_kv: bus.voltage_kv,
    }))
    .filter((bus) => bus.ref_id.trim().length > 0);
}

export function StartBranchForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const [lengthKm, setLengthKm] = useState('1');
  const [catalogRef, setCatalogRef] = useState('');
  const [segmentType, setSegmentType] = useState<'cable' | 'line_overhead'>('cable');
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const busOptions = useMemo(() => createBusOptions(snapshot), [snapshot]);
  const sourceContext = useMemo(
    () => resolveBranchSourceContextFromOperation(snapshot, context),
    [snapshot, context],
  );

  const segmentContext = useMemo(
    () => context?.segment as Record<string, unknown> | undefined,
    [context],
  );

  const initialCatalogRef = useMemo(
    () => (
      catalogRefFromInput(segmentContext?.catalog_binding)
      ?? catalogRefFromInput(context?.catalog_binding)
      ?? ''
    ),
    [context, segmentContext],
  );

  const hasCanonicalSource = sourceContext.fromRef.trim().length > 0;
  const missingSourceMessage = hasCanonicalSource ? null : 'Brak jawnego źródła odgałęzienia';

  const selectedTargetBus = useMemo(() => {
    const explicit = typeof context?.to_bus_ref === 'string' ? context.to_bus_ref.trim() : '';
    if (explicit) {
      return explicit;
    }
    return busOptions[0]?.ref_id ?? '';
  }, [busOptions, context]);

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId || !hasCanonicalSource) {
      return;
    }

    const parsedLengthKm = Number(lengthKm);
    if (!Number.isFinite(parsedLengthKm) || parsedLengthKm <= 0) {
      setCatalogError('Długość odgałęzienia musi być większa od zera.');
      return;
    }

    if (segmentType !== 'line_overhead' && segmentType !== 'cable') {
      setCatalogError('Odgałęzienie SN można rozpocząć wyłącznie jako kabel albo linię napowietrzną.');
      return;
    }

    const effectiveCatalogRef = (catalogRef || initialCatalogRef).trim();
    const catalogBinding = normalizeCatalogBinding(
      effectiveCatalogRef,
      normalizeSegmentNamespace(segmentType),
    );
    const payload = {
      from_ref: sourceContext.fromRef,
      segment: {
        rodzaj: normalizeSegmentKind(segmentType),
        dlugosc_m: Math.round(parsedLengthKm * 1000),
        catalog_binding: catalogBinding ?? undefined,
      },
    };
    const validationError = validateCatalogFirst('start_branch_segment_sn', payload);
    if (validationError) {
      setCatalogError(validationError);
      return;
    }

    setCatalogError(null);
    await executeDomainOperation(activeCaseId, 'start_branch_segment_sn', payload);
    closeForm();
  }, [
    activeCaseId,
    catalogRef,
    closeForm,
    executeDomainOperation,
    hasCanonicalSource,
    initialCatalogRef,
    lengthKm,
    segmentType,
    sourceContext.fromRef,
  ]);

  return (
    <div className="h-full overflow-y-auto rounded-lg border border-slate-200 bg-white" data-testid="start-branch-form">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">Rozpocznij odgałęzienie SN</h2>
        <p className="mt-1 text-sm text-slate-500">
          Kanoniczny start odgałęzienia wymaga jawnego zacisku odgałęźnego oraz wyboru rodziny odcinka.
        </p>
      </div>

      {catalogError && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{catalogError}</p>
      )}

      {missingSourceMessage && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {missingSourceMessage}
        </p>
      )}

      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Źródło odgałęzienia</span>
            <input
              type="text"
              value={sourceContext.fromRef}
              readOnly
              className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Typ źródła</span>
            <input
              type="text"
              value={sourceContext.sourceType}
              readOnly
              className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Nazwa źródła</span>
            <input
              type="text"
              value={sourceContext.sourceName}
              readOnly
              className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Rodzina odcinka</span>
            <select
              value={segmentType}
              onChange={(event) => setSegmentType(event.target.value as 'cable' | 'line_overhead')}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="cable">Kabel SN</option>
              <option value="line_overhead">Linia napowietrzna SN</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Długość [km]</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="np. 0.85"
              value={lengthKm}
              onChange={(event) => setLengthKm(event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Typ katalogowy</span>
            <input
              type="text"
              placeholder="np. XRUHAKXS-3x95"
              value={catalogRef}
              onChange={(event) => setCatalogRef(event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Szyna docelowa</span>
            <select
              value={selectedTargetBus}
              disabled
              className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            >
              <option value="">— wybierz —</option>
              {busOptions.map((bus) => (
                <option key={bus.ref_id} value={bus.ref_id}>
                  {bus.name} ({bus.voltage_kv} kV)
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          onClick={closeForm}
          className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Anuluj
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasCanonicalSource}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Rozpocznij odgałęzienie
        </button>
      </div>
    </div>
  );
}
