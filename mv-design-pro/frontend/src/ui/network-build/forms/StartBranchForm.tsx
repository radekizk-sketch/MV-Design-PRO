import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { useSelectionStore } from '../../selection';
import { validateCatalogFirst } from './catalogFirstRules';
import {
  catalogRefFromInput,
  normalizeCatalogBinding,
  normalizeSegmentKind,
  normalizeSegmentNamespace,
} from './catalogPayload';
import { resolveBranchSourceContextFromOperation } from '../operationContextResolvers';
import { resolveTrunkOriginKind } from '../trunkOriginResolver';
import { validateTrunkSegmentOrigin, type TrunkBranchKind } from '../semanticValidator';
import type { Branch, DomainOpResponseV1 } from '../../../types/enm';

type SegmentType = 'cable' | 'line_overhead';

const SEGMENT_TYPE_OPTIONS: Array<{ value: SegmentType; label: string }> = [
  { value: 'cable', label: 'Kabel SN' },
  { value: 'line_overhead', label: 'Linia napowietrzna SN' },
];

function branchRef(branch: Branch | undefined): string | undefined {
  return branch?.ref_id || branch?.id || undefined;
}

function branchTouchesSource(branch: Branch, sourceRef: string): boolean {
  if (!sourceRef) return false;
  const endpointAPort = 'endpoint_a_port' in branch ? branch.endpoint_a_port : null;
  const endpointBPort = 'endpoint_b_port' in branch ? branch.endpoint_b_port : null;
  return (
    branch.from_bus_ref === sourceRef
    || branch.to_bus_ref === sourceRef
    || endpointAPort?.port_id === sourceRef
    || endpointBPort?.port_id === sourceRef
  );
}

function createdBranchSegmentRef(
  response: DomainOpResponseV1 | null,
  previousSnapshot: DomainOpResponseV1['snapshot'] | null | undefined,
  sourceRef: string,
): string {
  const hintedElement = response?.selection_hint?.element_id;
  if (response?.selection_hint?.element_type === 'LineBranch' && hintedElement) {
    return hintedElement;
  }
  const branches = response?.snapshot?.branches ?? [];
  const createdIds = response?.changes?.created_element_ids ?? [];
  const previousBranchRefs = new Set(
    (previousSnapshot?.branches ?? [])
      .map((branch) => branchRef(branch))
      .filter(Boolean),
  );
  const newBranches = branches.filter((branch) => {
    const ref = branchRef(branch);
    return Boolean(ref) && !previousBranchRefs.has(ref);
  });
  const connectedBranch = newBranches.find((branch) => branchTouchesSource(branch, sourceRef));
  return (
    createdIds.find((id) => branches.some((branch) => branch.id === id || branch.ref_id === id))
    ?? createdIds.find((id) => id.startsWith('seg/'))
    ?? branchRef(connectedBranch)
    ?? branchRef(newBranches[0])
    ?? ''
  );
}

function publicBranchPortLabel(portLabel: string | null | undefined): string {
  if (!portLabel) return 'port boczny odgałęzienia';
  if (portLabel.startsWith('BRANCH')) return 'port boczny odgałęzienia';
  return portLabel;
}

function segmentTypeFromContext(context: Record<string, unknown> | undefined): SegmentType {
  const segmentContext = context?.segment as Record<string, unknown> | undefined;
  const candidate =
    segmentContext?.rodzaj
    ?? segmentContext?.type
    ?? context?.segment_type
    ?? context?.segment_kind;
  return normalizeSegmentKind(candidate) === 'LINIA_NAPOWIETRZNA' ? 'line_overhead' : 'cable';
}

function forcedSegmentTypeForSource(sourceType: string): SegmentType | null {
  if (sourceType === 'ZKSN') return 'cable';
  if (sourceType === 'Słup rozgałęźny') return 'line_overhead';
  return null;
}

function forcedSegmentHint(sourceType: string): string | null {
  if (sourceType === 'ZKSN') {
    return 'ZKSN jest rozdzielnicą SN w torze kablowym. Odgałęzienie z ZKSN prowadź odcinkiem kablowym.';
  }
  if (sourceType === 'Słup rozgałęźny') {
    return 'Słup rozgałęźny jest węzłem linii napowietrznej. Odgałęzienie ze słupa prowadź linią napowietrzną SN.';
  }
  return null;
}

const CATALOG_NUMBER_FORMAT_PL = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });

function segmentContextString(
  segmentContext: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = segmentContext?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function segmentContextNumber(
  segmentContext: Record<string, unknown> | undefined,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = segmentContext?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function inferCableType(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/[-_]+/g, ' ');
  const match = normalized.match(/\b(NA2XS2Y|N2XS2Y|XRUHAKXS|YHAKXS|YHKXS|YAKXS)\b/u);
  return match?.[1] ?? null;
}

function inferSection(value: string | null, pattern: RegExp): number | null {
  if (!value) return null;
  const match = value.match(pattern);
  const raw = match?.[1];
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function inferCableReturnSection(value: string | null): number | null {
  return inferSection(value, /\b1\s*[x×]\s*\d{2,4}\s*\/\s*(\d{1,3})/iu)
    ?? inferSection(value, /\b(?:na2xs2y|n2xs2y|xruhakxs|yhakxs|yhkxs|yakxs)[-\s_]*\d{2,4}[-_/](\d{1,3})\b/iu);
}

function inferCableWorkingSection(value: string | null): number | null {
  return inferSection(value, /\b1\s*[x×]\s*(\d{2,4})/iu)
    ?? inferSection(value, /\b(?:na2xs2y|n2xs2y|xruhakxs|yhakxs|yhkxs|yakxs)[-\s_]*(\d{2,4})(?:[-_/]\d{1,3})?\b/iu);
}

function inferOverheadMaterial(value: string | null): string | null {
  if (!value) return null;
  if (/\bal[-_\s]*st\b/iu.test(value)) return 'Al/St';
  if (/\bafl(?:[-_\s]*6)?\b/iu.test(value)) return 'AFL-6';
  if (/\bal\b/iu.test(value)) return 'Al';
  if (/\bcu\b/iu.test(value)) return 'Cu';
  if (/\bst\b/iu.test(value)) return 'St';
  return null;
}

function inferOverheadSection(value: string | null): number | null {
  return inferSection(value, /\bline[-_\s]+base[-_\s]+(?:al|cu|st|al[-_\s]*st|afl(?:[-_\s]*6)?)[-_\s]+(\d{2,4})\b/iu)
    ?? inferSection(value, /\b(?:base\s+)?(?:al|cu|st|al[-\s]*st|afl(?:[-\s]*6)?)\s*(\d{2,4})\b/iu);
}

function normalizeCatalogDisplayText(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value
    .replace(/^cable[-_\s]+(?:enea[-_\s]+operator[-_\s]+)?/iu, '')
    .replace(/^line[-_\s]+base[-_\s]+/iu, '')
    .replace(/^enea[-_\s]+operator[-_\s]+/iu, '')
    .trim();
  if (!trimmed || /^(?:cable|line)-/iu.test(trimmed)) return null;
  return trimmed
    .replace(/\s*[xX]\s*/gu, '×')
    .replace(/\bmm2\b/giu, 'mm²')
    .replace(/\s+/gu, ' ');
}

function publicCatalogLabel(
  segmentType: SegmentType,
  catalogRef: string,
  segmentContext: Record<string, unknown> | undefined,
): string {
  const explicitLabel = segmentContextString(segmentContext, [
    'catalog_label',
    'display_label',
    'type_label',
    'type_designation',
    'trade_name',
    'designation',
    'name',
  ]);
  const candidate = explicitLabel ?? catalogRef;

  if (segmentType === 'line_overhead') {
    const section = segmentContextNumber(segmentContext, ['cross_section_mm2', 'section_mm2'])
      ?? inferOverheadSection(candidate);
    const material = segmentContextString(segmentContext, ['conductor_material', 'material'])
      ?.replace(/^AL$/i, 'Al')
      ?? inferOverheadMaterial(candidate);
    if (section && material) {
      return `Linia napowietrzna ${material} ${CATALOG_NUMBER_FORMAT_PL.format(section)} mm²`;
    }
    return normalizeCatalogDisplayText(candidate) ?? 'Linia napowietrzna SN z katalogu';
  }

  const cableType = inferCableType(candidate) ?? inferCableType(catalogRef);
  const workingSection = segmentContextNumber(segmentContext, ['cross_section_mm2', 'section_mm2'])
    ?? inferCableWorkingSection(candidate);
  const returnSection = segmentContextNumber(segmentContext, ['return_conductor_cross_section_mm2'])
    ?? inferCableReturnSection(candidate);
  if (cableType && workingSection) {
    const screen = returnSection ? `/${CATALOG_NUMBER_FORMAT_PL.format(returnSection)}` : '';
    return `3 × ${cableType} 1×${CATALOG_NUMBER_FORMAT_PL.format(workingSection)}${screen} mm²`;
  }
  return normalizeCatalogDisplayText(candidate) ?? 'Kabel SN z katalogu';
}

export function StartBranchForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);
  const [lengthKm, setLengthKm] = useState('1');
  const [catalogRef, setCatalogRef] = useState('');
  const [segmentType, setSegmentType] = useState<SegmentType>(() => segmentTypeFromContext(context));
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const sourceContext = useMemo(
    () => resolveBranchSourceContextFromOperation(snapshot, context),
    [snapshot, context],
  );
  const forcedSegmentType = useMemo(
    () => forcedSegmentTypeForSource(sourceContext.sourceType),
    [sourceContext.sourceType],
  );
  const effectiveSegmentType = forcedSegmentType ?? segmentType;
  const isSegmentTypeLocked = forcedSegmentType != null;
  const segmentTypeOptions = useMemo(
    () => (
      isSegmentTypeLocked
        ? SEGMENT_TYPE_OPTIONS.filter((option) => option.value === effectiveSegmentType)
        : SEGMENT_TYPE_OPTIONS
    ),
    [effectiveSegmentType, isSegmentTypeLocked],
  );
  const forcedSegmentMessage = useMemo(
    () => forcedSegmentHint(sourceContext.sourceType),
    [sourceContext.sourceType],
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
  const catalogProvidedByContext = Boolean(initialCatalogRef);
  const catalogDisplayLabel = useMemo(
    () => publicCatalogLabel(effectiveSegmentType, (catalogRef || initialCatalogRef).trim(), segmentContext),
    [catalogRef, effectiveSegmentType, initialCatalogRef, segmentContext],
  );

  const initialSegmentType = useMemo(() => segmentTypeFromContext(context), [context]);

  useEffect(() => {
    setSegmentType(forcedSegmentType ?? initialSegmentType);
  }, [forcedSegmentType, initialSegmentType]);

  useEffect(() => {
    setCatalogRef(initialCatalogRef);
  }, [initialCatalogRef]);

  const hasCanonicalSource = sourceContext.fromRef.trim().length > 0;
  const missingSourceMessage = hasCanonicalSource ? null : 'Wskaż jawne źródło odgałęzienia';
  const publicSourceLabel = `${sourceContext.sourceName} - ${publicBranchPortLabel(sourceContext.portLabel)}`;

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId || !hasCanonicalSource) {
      return;
    }

    const parsedLengthKm = Number(lengthKm);
    if (!Number.isFinite(parsedLengthKm) || parsedLengthKm <= 0) {
      setCatalogError('Długość odgałęzienia musi być większa od zera.');
      return;
    }

    if (effectiveSegmentType !== 'line_overhead' && effectiveSegmentType !== 'cable') {
      setCatalogError('Odgałęzienie SN można rozpocząć wyłącznie jako kabel albo linię napowietrzną.');
      return;
    }

    const effectiveCatalogRef = (catalogRef || initialCatalogRef).trim();
    const catalogBinding = normalizeCatalogBinding(
      effectiveCatalogRef,
      normalizeSegmentNamespace(effectiveSegmentType),
    );
    const payload = {
      from_ref: sourceContext.fromRef,
      segment: {
        rodzaj: normalizeSegmentKind(effectiveSegmentType),
        dlugosc_m: Math.round(parsedLengthKm * 1000),
        catalog_binding: catalogBinding ?? undefined,
      },
    };
    const validationError = validateCatalogFirst('start_branch_segment_sn', payload);
    if (validationError) {
      setCatalogError(validationError);
      return;
    }

    const originKind = resolveTrunkOriginKind(snapshot, {
      ...context,
      from_ref: sourceContext.fromRef,
      source_type_label: sourceContext.sourceType,
    });
    if (originKind) {
      const branchKind: TrunkBranchKind = effectiveSegmentType === 'line_overhead'
        ? 'overhead_line_sn'
        : 'cable_sn';
      const semanticResult = validateTrunkSegmentOrigin({ branchKind, originKind });
      if (!semanticResult.ok) {
        setCatalogError(`${semanticResult.messagePl} ${semanticResult.suggestedFixPl}`);
        return;
      }
    }

    setCatalogError(null);
    const previousSnapshot = snapshot;
    const response = await executeDomainOperation(activeCaseId, 'start_branch_segment_sn', payload);
    if (!response) {
      const operationError = useSnapshotStore.getState().error;
      setCatalogError(operationError || 'Nie udało się rozpocząć odgałęzienia SN.');
      return;
    }
    if (response.error) {
      setCatalogError(response.error);
      return;
    }
    const createdSegmentRef = createdBranchSegmentRef(response, previousSnapshot, sourceContext.fromRef);
    if (!createdSegmentRef) {
      setCatalogError(
        'Odgałęzienie SN zostało utworzone, ale aplikacja nie wskazała nowego odcinka. Wybierz nowy odcinek na SLD i zakończ go układem katalogowym.',
      );
      return;
    }
    selectElement({
      id: createdSegmentRef,
      type: 'LineBranch',
      name: 'Nowe odgałęzienie SN',
    });
    centerSldOnElement(createdSegmentRef);
    closeForm();
  }, [
    activeCaseId,
    catalogRef,
    centerSldOnElement,
    closeForm,
    context,
    executeDomainOperation,
    hasCanonicalSource,
    initialCatalogRef,
    lengthKm,
    effectiveSegmentType,
    snapshot,
    selectElement,
    sourceContext.fromRef,
    sourceContext.sourceType,
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
            <span className="mb-1 block font-medium text-slate-700">Punkt startu odgałęzienia</span>
            <input title="Punkt startu odgałęzienia"
              type="text"
              value={publicSourceLabel}
              readOnly
              className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Typ źródła</span>
            <input title="Typ źródła"
              type="text"
              value={sourceContext.sourceType}
              readOnly
              className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Nazwa źródła</span>
            <input title="Nazwa źródła"
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
            <select title="Rodzina odcinka"
              aria-label="Rodzina odcinka"
              value={effectiveSegmentType}
              onChange={(event) => setSegmentType(event.target.value as SegmentType)}
              disabled={isSegmentTypeLocked}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {segmentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {forcedSegmentMessage && (
              <span className="mt-1 block text-[11px] font-medium text-amber-700">
                {forcedSegmentMessage}
              </span>
            )}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Długość [km]</span>
            <input title="Długość [km]"
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
            {catalogProvidedByContext ? (
              <input title="Typ katalogowy"
                type="text"
                data-testid="branch-catalog-display"
                value={catalogDisplayLabel}
                readOnly
                className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              />
            ) : (
              <input title="Typ katalogowy"
                type="text"
                placeholder="np. XRUHAKXS-3x95"
                value={catalogRef}
                onChange={(event) => setCatalogRef(event.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            )}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Zakończenie odgałęzienia</span>
            <input title="Zakończenie odgałęzienia"
              type="text"
              value="Wolny zacisk trasy SN - zakończ stacją, ZK SN albo słupem w następnym kroku"
              readOnly
              className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            />
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
