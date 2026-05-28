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
import type { Branch, DomainOpResponseV1, EnergyNetworkModel } from '../../../types/enm';
import { validateTrunkSegmentOrigin } from '../semanticValidator';

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

function responseCreatedBranchPole(response: DomainOpResponseV1 | null | undefined): boolean {
  const createdElementIds = new Set(response?.changes?.created_element_ids ?? []);
  return Boolean(
    response?.snapshot?.branch_points?.some((branchPoint) => (
      branchPoint.branch_point_type === 'branch_pole'
      && (
        createdElementIds.size === 0
        || createdElementIds.has(branchPoint.id)
        || createdElementIds.has(branchPoint.ref_id)
      )
    )),
  );
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

function branchPoleSegmentIssue(
  snapshot: EnergyNetworkModel | null | undefined,
  segmentId: string,
): string | null {
  if (!segmentId || !snapshot?.branches) return null;
  const segment = findSegment(snapshot, segmentId);
  if (!segment) {
    return 'Nie znaleziono wybranego odcinka w modelu sieci.';
  }
  if (segment.type !== 'line_overhead') {
    return 'Słup rozgałęźny SN można wstawić tylko w torze linii napowietrznej. Dla kabla SN wybierz ZKSN albo stację z polem liniowym.';
  }
  return null;
}

export function InsertBranchPoleForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);

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
  const selectedSegment = useMemo(
    () => findSegment(snapshot, segmentId),
    [snapshot, segmentId],
  );
  const segmentLabel = useMemo(
    () => publicSegmentLabel(
      selectedSegment,
      selectedSegment?.type === 'line_overhead' ? 'Linia napowietrzna SN' : 'Odcinek SN',
    ),
    [selectedSegment],
  );
  const segmentIssue = useMemo(
    () => branchPoleSegmentIssue(snapshot, segmentId),
    [snapshot, segmentId],
  );
  const switchState = useMemo(
    () => normalizeSwitchState(context?.switch_state),
    [context],
  );
  const submitDisabled = !activeCaseId || !segmentId || !selectedCatalog || Boolean(segmentIssue);

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
      if (segmentIssue) {
        setError(segmentIssue);
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

      // Słup rozgałęźny jest węzłem linii napowietrznej — wyprowadzenie z
      // niego prowadzimy linią napowietrzną. Twardy guard kontraktu słupa
      // (STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD §4).
      const semanticResult = validateTrunkSegmentOrigin({
        branchKind: 'overhead_line_sn',
        originKind: 'slup',
      });
      if (!semanticResult.ok) {
        setError(`${semanticResult.messagePl} ${semanticResult.suggestedFixPl}`);
        return;
      }

      setError(null);
      const previousSnapshot = snapshot;
      const response = await executeDomainOperation(activeCaseId, 'insert_branch_pole_on_segment_sn', payload);
      if (!response) {
        setError('Nie udało się wstawić słupa rozgałęźnego.');
        return;
      }
      if (response.error) {
        setError(response.error);
        return;
      }
      if (!responseCreatedBranchPole(response)) {
        setError(
          'Operacja nie utworzyła słupa rozgałęźnego w modelu sieci. Sprawdź typ odcinka i wariant katalogowy.',
        );
        return;
      }
      const createdSelection = branchPointSelectionFromMaterialization(
        response,
        'branch_pole',
        name.trim() || selectedCatalog?.name || 'Słup rozgałęźny SN',
        previousSnapshot,
      );
      if (!createdSelection) {
        setError(
          'Operacja nie wskazała utworzonego słupa rozgałęźnego. Wybierz linię napowietrzną i ponów operację z katalogu.',
        );
        return;
      }
      selectElement(createdSelection);
      centerSldOnElement(createdSelection.id);
      closeForm();
      openRouteSurface('E-15', {
        entityRef: createdSelection.id,
        entityType: 'branch_pole',
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
    <form
      className="space-y-4 p-4"
      data-testid="insert-branch-pole-form"
      data-segment-ref={segmentId}
      onSubmit={onSubmit}
    >
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Wstaw słup rozgałęźny</h3>
        <p className="mt-1 text-xs text-gray-500">Słup jest węzłem linii napowietrznej SN, nie polem stacji ani ZKSN.</p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <label className="block text-xs text-gray-600">
        Odcinek SN
        <input className="mt-1 w-full rounded border px-2 py-1 text-xs" value={segmentLabel} readOnly />
      </label>
      {segmentIssue && (
        <p
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-800"
          data-testid="branch-pole-segment-issue"
        >
          {segmentIssue}
        </p>
      )}

      <label className="block text-xs text-gray-600">
        Nazwa
        <input title="Nazwa"
          className="mt-1 w-full rounded border px-2 py-1 text-xs"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="block text-xs text-gray-600">
        Pozycja (0-1)
        <input title="Pozycja (0-1)"
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
            <div className="text-[11px] text-slate-500">Wymagany do utworzenia węzła linii napowietrznej.</div>
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
        {!selectedCatalog && (
          <p
            className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
            data-testid="branch-pole-catalog-required"
          >
            Wybierz typ katalogowy słupa przed zapisem. Słup rozgałęźny nie może być zapisany jako pusty punkt trasy.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          data-testid="insert-branch-pole-submit"
          disabled={submitDisabled}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-200"
        >
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
