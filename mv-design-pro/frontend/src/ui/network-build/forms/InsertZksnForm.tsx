import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { fetchBranchPointTypes } from '../../catalog/api';
import { TypePicker } from '../../catalog/TypePicker';
import type { BranchPointCatalogType } from '../../catalog/types';
import { useAppStateStore } from '../../app-state';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { validateCatalogFirst } from './catalogFirstRules';
import { normalizeCatalogBinding, normalizeSwitchState } from './catalogPayload';
import { branchPointSelectionFromMaterialization } from './branchPointSelection';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { useSelectionStore } from '../../selection/store';
import type { Branch, EnergyNetworkModel } from '../../../types/enm';
import { validateTrunkSegmentOrigin } from '../semanticValidator';

function describeZksnVariant(branchPortsCount: number): string {
  return branchPortsCount >= 2 ? 'Odgałęźny 2-portowy' : 'Przelotowy 1-portowy';
}

function branchRef(branch: Branch): string {
  return branch.ref_id || branch.id;
}

function findSegment(
  snapshot: EnergyNetworkModel | null | undefined,
  segmentId: string,
): Branch | undefined {
  return snapshot?.branches?.find((branch) => branchRef(branch) === segmentId || branch.id === segmentId);
}

function isRawTechnicalLabel(value: string | undefined | null): boolean {
  if (!value) return true;
  return /(^|\/)(seg|ref|hash|bp)(\/|$)/i.test(value) || /[a-f0-9]{24,}/i.test(value);
}

function publicSegmentLabel(segment: Branch | undefined, fallback: string): string {
  const name = segment?.name?.trim();
  return name && !isRawTechnicalLabel(name) ? name : fallback;
}

function initialInsertRatio(context: Record<string, unknown> | null | undefined): number {
  const explicitPosition = Number(context?.position_on_segment);
  if (Number.isFinite(explicitPosition)) {
    return Math.min(1, Math.max(0, explicitPosition));
  }
  const insertAt = context?.insert_at;
  if (insertAt && typeof insertAt === 'object') {
    const value = Number((insertAt as Record<string, unknown>).value);
    if (Number.isFinite(value)) {
      return Math.min(1, Math.max(0, value));
    }
  }
  return context?.placement_mode === 'ENDPOINT_APPEND' ? 1 : 0.5;
}

function zksnSegmentIssue(
  snapshot: EnergyNetworkModel | null | undefined,
  segmentId: string,
): string | null {
  if (!segmentId || !snapshot?.branches) return null;
  const segment = findSegment(snapshot, segmentId);
  if (!segment) {
    return 'Nie znaleziono wybranego odcinka w modelu sieci.';
  }
  if (segment.type !== 'cable') {
    return 'ZKSN można wstawić tylko w torze kablowym SN. Dla linii napowietrznej wybierz słup rozgałęźny albo przejście kablowo-napowietrzne.';
  }
  return null;
}

export function InsertZksnForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);

  const [name, setName] = useState((context?.name as string) ?? 'ZKSN SN');
  const [ratio, setRatio] = useState(() => initialInsertRatio(context));
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogTypes, setCatalogTypes] = useState<BranchPointCatalogType[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<BranchPointCatalogType | null>(null);

  const segmentId = useMemo(
    () => (context?.segment_id as string) ?? (context?.segment_ref as string) ?? '',
    [context],
  );
  const selectedSegment = useMemo(
    () => findSegment(snapshot, segmentId),
    [snapshot, segmentId],
  );
  const segmentLabel = useMemo(
    () => publicSegmentLabel(selectedSegment, selectedSegment?.type === 'cable' ? 'Kabel SN' : 'Odcinek SN'),
    [selectedSegment],
  );
  const segmentIssue = useMemo(
    () => zksnSegmentIssue(snapshot, segmentId),
    [snapshot, segmentId],
  );
  const switchState = useMemo(
    () => normalizeSwitchState(context?.switch_state),
    [context],
  );
  const requestedBranchPortsCount = useMemo(() => {
    const value = Number(context?.branch_ports_count ?? 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }, [context]);
  const branchPortsCount = selectedCatalog?.branch_ports_count ?? requestedBranchPortsCount;
  const submitDisabled = !activeCaseId || !segmentId || !selectedCatalog || Boolean(segmentIssue);

  useEffect(() => {
    let cancelled = false;

    fetchBranchPointTypes('ZKSN')
      .then((items) => {
        if (!cancelled) {
          setCatalogTypes(items);
          const preferredCatalog =
            items.find((item) => item.branch_ports_count === requestedBranchPortsCount) ?? items[0] ?? null;
          if (preferredCatalog) {
            setSelectedCatalog((current) => current ?? preferredCatalog);
            setName((current) => current.trim() || preferredCatalog.name);
          } else {
            setError('Katalog ZKSN nie zawiera kompletnego wariantu rozdzielnicy SN.');
          }
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Nie udało się pobrać katalogu ZKSN.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestedBranchPortsCount]);

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
      if (segmentIssue) {
        setError(segmentIssue);
        return;
      }

      const payload = {
        segment_id: segmentId,
        name: name.trim() || selectedCatalog?.name || 'ZKSN SN',
        branch_ports_count: branchPortsCount,
        switch_state: switchState,
        insert_at: { mode: 'RATIO', value: ratio },
        catalog_binding: normalizeCatalogBinding(selectedCatalog?.id ?? null, 'mv_branch_points'),
      };

      const validationError = validateCatalogFirst('insert_zksn_on_segment_sn', payload);
      if (validationError) {
        setError(validationError);
        return;
      }

      // ZKSN jest cable-only — w torze kablowym wyprowadzenia kolejnych
      // odcinków mogą być wyłącznie kablowe. Twardy guard pilnujący kontraktu
      // ZKSN (STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD §3).
      const semanticResult = validateTrunkSegmentOrigin({
        branchKind: 'cable_sn',
        originKind: 'pole_liniowe_kablowe_zksn',
      });
      if (!semanticResult.ok) {
        setError(`${semanticResult.messagePl} ${semanticResult.suggestedFixPl}`);
        return;
      }

      setError(null);
      const previousSnapshot = snapshot;
      const response = await executeDomainOperation(activeCaseId, 'insert_zksn_on_segment_sn', payload);
      if (!response) {
        setError('Nie udało się wstawić ZK SN.');
        return;
      }
      if (response.error) {
        setError(response.error);
        return;
      }
      const createdSelection = branchPointSelectionFromMaterialization(
        response,
        'zksn',
        name.trim() || selectedCatalog?.name || 'ZK SN',
        previousSnapshot,
      );
      if (!createdSelection) {
        setError(
          'Operacja nie wskazała utworzonego ZK SN. Wybierz odcinek kablowy i ponów operację z katalogu.',
        );
        return;
      }
      selectElement(createdSelection);
      centerSldOnElement(createdSelection.id);
      closeForm();
      openRouteSurface('E-14', {
        entityRef: createdSelection.id,
        entityType: 'zksn',
        subjectKind: 'entity',
        subjectRef: createdSelection.id,
        titlePl: createdSelection.name,
        route: 'sld',
        openMode: 'replace_right_panel',
        supportsMiniSld: true,
        payload: {
          source: 'operation_result',
          selectedName: createdSelection.name,
          selectedType: createdSelection.type,
        },
      });
    },
    [
      activeCaseId,
      branchPortsCount,
      centerSldOnElement,
      closeForm,
      executeDomainOperation,
      name,
      openRouteSurface,
      ratio,
      segmentId,
      segmentIssue,
      selectElement,
      selectedCatalog,
      snapshot,
      switchState,
    ],
  );

  return (
    <form className="space-y-4 p-4" data-testid="insert-zksn-form" onSubmit={onSubmit}>
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Wstaw ZKSN</h3>
        <p className="mt-1 text-xs text-gray-500">ZKSN jest rozdzielnicą SN z polami kablowymi, bez transformatora SN/nN.</p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <label className="block text-xs text-gray-600">
        Odcinek SN
        <input className="mt-1 w-full rounded border px-2 py-1 text-xs" value={segmentLabel} readOnly />
      </label>
      {segmentIssue && (
        <p
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-800"
          data-testid="zksn-segment-issue"
        >
          {segmentIssue}
        </p>
      )}

      <label className="block text-xs text-gray-600">
        Nazwa
        <input
          className="mt-1 w-full rounded border px-2 py-1 text-xs"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="block text-xs text-gray-600">
        Wariant ZKSN
        <input
          className="mt-1 w-full rounded border px-2 py-1 text-xs"
          value={describeZksnVariant(branchPortsCount)}
          readOnly
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
            <div className="text-xs font-medium text-slate-700">Typ katalogowy ZKSN</div>
            <div className="text-[11px] text-slate-500">Wariant determinuje liczbę portów odgałęzienia.</div>
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
            data-testid="zksn-catalog-summary"
          >
            <div className="font-semibold text-slate-900">{selectedCatalog.name}</div>
            <div className="mt-1">{describeZksnVariant(selectedCatalog.branch_ports_count)}</div>
          </div>
        )}
        {!selectedCatalog && (
          <p
            className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
            data-testid="zksn-catalog-required"
          >
            Wybierz wariant katalogowy ZK SN przed zapisem. ZK SN jest rozdzielnicą SN z polami kablowymi i portami,
            nie pustym symbolem na trasie.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          data-testid="insert-zksn-submit"
          disabled={submitDisabled}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-200"
        >
          Wstaw ZKSN
        </button>
        <button type="button" onClick={closeForm} className="rounded border px-3 py-1 text-xs">
          Anuluj
        </button>
      </div>

      <TypePicker
        category="ZKSN"
        currentTypeId={selectedCatalog?.id ?? null}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectType={(catalogId) => handleSelectCatalog(catalogId)}
      />
    </form>
  );
}
