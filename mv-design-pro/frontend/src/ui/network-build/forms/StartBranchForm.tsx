import { useCallback, useMemo, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { useSelectionStore } from '../../selection';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { CatalogTypeField } from './CatalogTypeField';
import { OperationFormShell } from './OperationFormShell';
import {
  buildSegmentCatalogBinding,
  getSegmentCatalogConfig,
  type SegmentSelectionKind,
} from './catalogBinding';
import { applySelectionHint } from './applySelectionHint';

export function StartBranchForm() {
  const context = useNetworkBuildStore((s) => s.activeOperationForm?.context);
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);

  const fromRef = useMemo(
    () => (context?.fromRef as string | undefined) ?? (context?.from_ref as string | undefined) ?? null,
    [context],
  );
  const fromBusRef = useMemo(
    () =>
      (context?.fromBusRef as string | undefined) ??
      (context?.from_bus_ref as string | undefined) ??
      null,
    [context],
  );
  const sourceLabel = useMemo(
    () => (context?.sourceLabel as string | undefined) ?? fromRef ?? fromBusRef ?? 'brak źródła',
    [context, fromBusRef, fromRef],
  );

  const [segmentKind, setSegmentKind] = useState<SegmentSelectionKind>('KABEL_SN');
  const [segmentName, setSegmentName] = useState('');
  const [lengthM, setLengthM] = useState('180');
  const [catalogTypeId, setCatalogTypeId] = useState<string | null>(null);
  const [catalogTypeName, setCatalogTypeName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kindConfig = getSegmentCatalogConfig(segmentKind);

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId) {
      setError('Brak aktywnego przypadku obliczeniowego.');
      return;
    }
    if (!fromRef && !fromBusRef) {
      setError('Brak legalnego źródła odgałęzienia. Wskaż port BRANCH albo stację z wolnym polem odgałęźnym.');
      return;
    }
    const parsedLengthM = Number(lengthM);
    if (!Number.isFinite(parsedLengthM) || parsedLengthM <= 0) {
      setError('Podaj dodatnią długość odgałęzienia.');
      return;
    }
    if (!catalogTypeId) {
      setError('Wybór katalogu odgałęzienia jest obowiązkowy.');
      return;
    }

    setError(null);
    const catalogBinding = buildSegmentCatalogBinding(segmentKind, catalogTypeId);
    const response = await executeDomainOperation(activeCaseId, 'start_branch_segment_sn', {
      from_ref: fromRef ?? undefined,
      from_bus_ref: fromBusRef ?? undefined,
      catalog_binding: catalogBinding,
      segment: {
        rodzaj: kindConfig.domainKind,
        dlugosc_m: parsedLengthM,
        name: segmentName.trim() || undefined,
        catalog_ref: catalogTypeId,
        catalog_binding: catalogBinding,
      },
    });

    if (!response || response.error) {
      setError(response?.error ?? 'Nie udało się utworzyć odgałęzienia.');
      return;
    }

    applySelectionHint({ response, selectElement, centerSldOnElement });
    closeForm();
  }, [
    activeCaseId,
    catalogTypeId,
    centerSldOnElement,
    closeForm,
    executeDomainOperation,
    fromBusRef,
    fromRef,
    kindConfig.domainKind,
    lengthM,
    segmentKind,
    segmentName,
    selectElement,
  ]);

  return (
    <div className="h-full" data-testid="start-branch-form">
      <OperationFormShell
        title="Rozpoczęcie odgałęzienia SN"
        description="Odgałęzienie może wystartować tylko z legalnego portu BRANCH lub z kontekstu, który backend umie rozwiązać do takiego portu."
        submitLabel="Dodaj odgałęzienie"
        error={error}
        onCancel={closeForm}
        onSubmit={() => {
          void handleSubmit();
        }}
      >
        <div className="space-y-4">
          <div className="rounded border border-chrome-200 bg-chrome-50 px-3 py-2 text-[11px] text-chrome-700">
            <div>
              <span className="font-semibold">Źródło odgałęzienia:</span> {sourceLabel}
            </div>
            {fromRef && (
              <div className="mt-1">
                <span className="font-semibold">Port kanoniczny:</span> {fromRef}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                Rodzaj odgałęzienia
              </span>
              <select
                value={segmentKind}
                onChange={(event) => {
                  setSegmentKind(event.target.value as SegmentSelectionKind);
                  setCatalogTypeId(null);
                  setCatalogTypeName(null);
                }}
                className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
              >
                <option value="KABEL_SN">Kabel SN</option>
                <option value="LINIA_NAPOWIETRZNA">Linia napowietrzna SN</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                Długość [m]
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={lengthM}
                onChange={(event) => setLengthM(event.target.value)}
                className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
              Nazwa odgałęzienia
            </span>
            <input
              type="text"
              value={segmentName}
              onChange={(event) => setSegmentName(event.target.value)}
              placeholder="np. Odgałęzienie do stacji T-05"
              className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
            />
          </label>

          <CatalogTypeField
            testId="start-branch-catalog-field"
            label="Typ z katalogu"
            category={kindConfig.category}
            selectedTypeId={catalogTypeId}
            selectedTypeName={catalogTypeName}
            helperText="Odgałęzienie jest pełnoprawnym elementem technicznym SN i musi powstać z wybranego katalogu."
            error={!catalogTypeId && error?.includes('katalogu') ? error : null}
            onSelect={(typeId, typeName) => {
              setCatalogTypeId(typeId);
              setCatalogTypeName(typeName);
              setError(null);
            }}
          />
        </div>
      </OperationFormShell>
    </div>
  );
}

export default StartBranchForm;
