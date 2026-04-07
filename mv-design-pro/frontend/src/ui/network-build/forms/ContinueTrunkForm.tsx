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

const SEGMENT_KIND_OPTIONS: Array<{ value: SegmentSelectionKind; label: string; helper: string }> = [
  {
    value: 'KABEL_SN',
    label: 'Kabel SN',
    helper: 'Dla magistrali kablowej system materializuje parametry z katalogu kabla SN.',
  },
  {
    value: 'LINIA_NAPOWIETRZNA',
    label: 'Linia napowietrzna SN',
    helper: 'Dla magistrali napowietrznej wymagany jest katalog linii SN.',
  },
];

export function ContinueTrunkForm() {
  const context = useNetworkBuildStore((s) => s.activeOperationForm?.context);
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);

  const fromTerminalId = useMemo(
    () =>
      (context?.fromTerminalId as string | undefined) ??
      (context?.from_terminal_id as string | undefined) ??
      null,
    [context],
  );
  const terminalLabel = useMemo(
    () => (context?.terminalLabel as string | undefined) ?? fromTerminalId ?? 'brak kontekstu',
    [context, fromTerminalId],
  );
  const trunkId = useMemo(
    () => (context?.trunkId as string | undefined) ?? (context?.trunk_id as string | undefined) ?? null,
    [context],
  );

  const [segmentKind, setSegmentKind] = useState<SegmentSelectionKind>('KABEL_SN');
  const [segmentName, setSegmentName] = useState('');
  const [lengthM, setLengthM] = useState('250');
  const [catalogTypeId, setCatalogTypeId] = useState<string | null>(null);
  const [catalogTypeName, setCatalogTypeName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedKindConfig = getSegmentCatalogConfig(segmentKind);
  const selectedKindHelper = SEGMENT_KIND_OPTIONS.find((option) => option.value === segmentKind)?.helper ?? '';

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId) {
      setError('Brak aktywnego przypadku obliczeniowego.');
      return;
    }
    if (!fromTerminalId) {
      setError('Brak terminala źródłowego magistrali. Wybierz otwarty koniec sieci.');
      return;
    }
    const parsedLengthM = Number(lengthM);
    if (!Number.isFinite(parsedLengthM) || parsedLengthM <= 0) {
      setError('Podaj dodatnią długość odcinka magistrali.');
      return;
    }
    if (!catalogTypeId) {
      setError('Wybór katalogu odcinka jest obowiązkowy.');
      return;
    }

    setError(null);
    const catalogBinding = buildSegmentCatalogBinding(segmentKind, catalogTypeId);
    const response = await executeDomainOperation(activeCaseId, 'continue_trunk_segment_sn', {
      trunk_id: trunkId ?? undefined,
      from_terminal_id: fromTerminalId,
      catalog_binding: catalogBinding,
      segment: {
        rodzaj: selectedKindConfig.domainKind,
        dlugosc_m: parsedLengthM,
        name: segmentName.trim() || undefined,
        catalog_ref: catalogTypeId,
        catalog_binding: catalogBinding,
      },
    });

    if (!response || response.error) {
      setError(response?.error ?? 'Nie udało się dodać kolejnego odcinka magistrali.');
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
    fromTerminalId,
    lengthM,
    segmentKind,
    segmentName,
    selectElement,
    selectedKindConfig.domainKind,
    trunkId,
  ]);

  return (
    <div className="h-full" data-testid="continue-trunk-form">
      <OperationFormShell
        title="Kontynuacja magistrali SN"
        description="Nowy odcinek magistrali powstaje wyłącznie z jawnie wybranego katalogu. Bez katalogu odcinek techniczny nie istnieje."
        submitLabel="Dodaj odcinek"
        error={error}
        onCancel={closeForm}
        onSubmit={() => {
          void handleSubmit();
        }}
      >
        <div className="space-y-4">
          <div className="rounded border border-chrome-200 bg-chrome-50 px-3 py-2 text-[11px] text-chrome-700">
            <div>
              <span className="font-semibold">Punkt startowy:</span> {terminalLabel}
            </div>
            {trunkId && (
              <div className="mt-1">
                <span className="font-semibold">Magistrala:</span> {trunkId}
              </div>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
              Rodzaj odcinka
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
              {SEGMENT_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <CatalogTypeField
            testId="continue-trunk-catalog-field"
            label="Typ z katalogu"
            category={selectedKindConfig.category}
            selectedTypeId={catalogTypeId}
            selectedTypeName={catalogTypeName}
            helperText={selectedKindHelper}
            error={!catalogTypeId && error?.includes('katalogu') ? error : null}
            onSelect={(typeId, typeName) => {
              setCatalogTypeId(typeId);
              setCatalogTypeName(typeName);
              setError(null);
            }}
          />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                Długość odcinka [m]
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

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                Nazwa odcinka
              </span>
              <input
                type="text"
                value={segmentName}
                onChange={(event) => setSegmentName(event.target.value)}
                placeholder="np. Magistrala SN - odcinek 04"
                className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>
      </OperationFormShell>
    </div>
  );
}

export default ContinueTrunkForm;
