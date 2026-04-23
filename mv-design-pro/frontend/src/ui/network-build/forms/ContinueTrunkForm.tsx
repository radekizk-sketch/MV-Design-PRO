/**
 * ContinueTrunkForm — formularz kontynuacji magistrali SN.
 *
 * Wrapper inline nad TrunkContinueModal z ui/topology/modals/.
 * Integruje się z snapshotStore.executeDomainOperation + networkBuildStore.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  TrunkContinueModal,
  type TrunkContinueFormData,
} from '../../topology/modals/TrunkContinueModal';
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

export function ContinueTrunkForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const trunkId = ((context?.trunkId as string) ?? (context?.trunk_id as string) ?? '').trim();
  const terminalId = (
    (context?.terminalId as string)
    ?? (context?.terminal_id as string)
    ?? (context?.from_terminal_id as string)
    ?? ''
  ).trim();
  const terminalPortId = (
    (context?.terminal_port_id as string)
    ?? (context?.port_id as string)
    ?? ''
  ).trim();
  const terminalName = ((context?.terminal_name as string) ?? '').trim();
  const terminalVoltageLabel = ((context?.terminal_voltage_label as string) ?? '').trim();
  const segmentKind = (
    typeof context?.segment_kind === 'string' ? context.segment_kind.trim().toUpperCase() : ''
  ) as TrunkContinueFormData['segment_kind'] | '';
  const hasCanonicalTerminal = terminalId.length > 0;
  const hasSegmentFamily =
    segmentKind === 'KABEL_SN' || segmentKind === 'LINIA_NAPOWIETRZNA';
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const initialData = useMemo<Partial<TrunkContinueFormData>>(() => {
    if (!context) return {};
    const segmentContext = context.segment as Record<string, unknown> | undefined;
      const lengthM = typeof context.length_m === 'number' ? context.length_m : undefined;
    const catalogRef = (
      catalogRefFromInput(segmentContext?.catalog_binding)
      ?? catalogRefFromInput(context.catalog_binding)
      ?? undefined
    );
      return {
      ...(hasSegmentFamily ? { segment_kind: segmentKind } : {}),
      ...(lengthM !== undefined ? { length_m: lengthM } : {}),
      ...(catalogRef !== undefined ? { catalog_ref: catalogRef } : {}),
    };
  }, [context, hasSegmentFamily, segmentKind]);

  const handleSubmit = useCallback(
    async (data: TrunkContinueFormData) => {
      if (!activeCaseId || !hasCanonicalTerminal) {
        return;
      }
      if (!hasSegmentFamily) {
        setCatalogError('Najpierw wybierz rodzine odcinka SN w kroku E-06.');
        return;
      }
      const catalogNamespace = normalizeSegmentNamespace(data.segment_kind);
      const catalogBinding = normalizeCatalogBinding(data.catalog_ref, catalogNamespace);
      const payload = {
        ...(trunkId ? { trunk_id: trunkId } : {}),
        from_terminal_id: terminalId,
        segment: {
          rodzaj: normalizeSegmentKind(data.segment_kind),
          dlugosc_m: data.length_m,
          name: data.notes.trim() || undefined,
          catalog_binding: catalogBinding ?? undefined,
        },
      };
      const validationError = validateCatalogFirst('continue_trunk_segment_sn', payload);
      if (validationError) {
        setCatalogError(validationError);
        return;
      }
      setCatalogError(null);
      await executeDomainOperation(activeCaseId, 'continue_trunk_segment_sn', payload);
      closeForm();
    },
    [
      activeCaseId,
      closeForm,
      executeDomainOperation,
      hasCanonicalTerminal,
      hasSegmentFamily,
      terminalId,
      trunkId,
    ],
  );

  return (
    <div className="h-full overflow-y-auto bg-[#07141f]" data-testid="continue-trunk-form">
      {catalogError && (
        <p className="border-b border-rose-500/30 bg-rose-950/40 px-4 py-2 text-xs text-rose-100">
          {catalogError}
        </p>
      )}
      <TrunkContinueModal
        isOpen={true}
        mode="create"
        trunkId={trunkId}
        terminalId={terminalId}
        terminalPortId={terminalPortId}
        terminalName={terminalName}
        terminalVoltageLabel={terminalVoltageLabel}
        initialData={initialData}
        submitDisabled={!hasCanonicalTerminal || !hasSegmentFamily}
        submitDisabledReason={
          !hasCanonicalTerminal
            ? 'Brak jawnego terminala magistrali.'
            : !hasSegmentFamily
              ? 'Najpierw wybierz rodzine odcinka SN.'
              : null
        }
        lockSegmentKind={hasSegmentFamily}
        onSubmit={handleSubmit}
        onCancel={closeForm}
      />
    </div>
  );
}
