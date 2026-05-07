/**
 * ConnectRingForm — formularz domknięcia pierścienia + ustawienia NOP.
 *
 * 2-etapowy wrapper:
 *  1. RingCloseModal — połączenie terminali i zamknięcie pętli
 *  2. NOPModal — wybór punktu normalnie otwartego
 *
 * Integruje się z snapshotStore.executeDomainOperation + networkBuildStore.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo, useState } from 'react';
import { RingCloseModal, type RingCloseFormData } from '../../topology/modals/RingCloseModal';
import { NOPModal, type NOPFormData, type NOPCandidate } from '../../topology/modals/NOPModal';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { validateCatalogFirst } from './catalogFirstRules';
import {
  normalizeCatalogBinding,
  normalizeSegmentKind,
  normalizeSegmentNamespace,
} from './catalogPayload';

type FormStage = 'ring' | 'nop';

export function ConnectRingForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const [stage, setStage] = useState<FormStage>('ring');
  const [ringData, setRingData] = useState<RingCloseFormData | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const terminalA = useMemo(
    () => ({
      id: (
        (context?.terminalA_id as string)
        ?? (context?.terminal_a_id as string)
        ?? (context?.from_bus_ref as string)
        ?? ''
      ).trim(),
      label: (context?.terminalA_label as string) ?? 'Zacisk A',
    }),
    [context],
  );

  const terminalB = useMemo(
    () => ({
      id: (
        (context?.terminalB_id as string)
        ?? (context?.terminal_b_id as string)
        ?? (context?.to_bus_ref as string)
        ?? ''
      ).trim(),
      label: (context?.terminalB_label as string) ?? 'Zacisk B',
    }),
    [context],
  );

  const nopCandidates = useMemo<NOPCandidate[]>(() => {
    const raw = context?.nop_candidates;
    if (Array.isArray(raw)) return raw as NOPCandidate[];
    return [];
  }, [context]);

  const handleRingSubmit = useCallback(
    async (data: RingCloseFormData) => {
      if (!activeCaseId) return;
      const catalogNamespace = normalizeSegmentNamespace(data.segment_kind);
      const catalogBinding = normalizeCatalogBinding(data.catalog_ref, catalogNamespace);
      const payload = {
        from_bus_ref: terminalA.id,
        to_bus_ref: terminalB.id,
        segment: {
          rodzaj: normalizeSegmentKind(data.segment_kind),
          dlugosc_m: data.length_m,
          catalog_binding: catalogBinding ?? undefined,
        },
      };
      const validationError = validateCatalogFirst('connect_secondary_ring_sn', payload);
      if (validationError) {
        setCatalogError(validationError);
        return;
      }
      setCatalogError(null);
      await executeDomainOperation(activeCaseId, 'connect_secondary_ring_sn', payload);
      setRingData(data);
      setStage('nop');
    },
    [activeCaseId, executeDomainOperation, terminalA, terminalB],
  );

  const handleNopSubmit = useCallback(
    async (data: NOPFormData) => {
      if (!activeCaseId) return;
      await executeDomainOperation(activeCaseId, 'set_normal_open_point', {
        switch_ref: data.nop_element_ref,
      });
      closeForm();
    },
    [activeCaseId, executeDomainOperation, closeForm],
  );

  if (stage === 'nop' && ringData) {
    return (
      <div className="h-full overflow-y-auto" data-testid="connect-ring-nop-form">
        <div className="px-4 py-2 bg-green-50 border-b border-green-200">
          <p className="text-xs text-green-700 font-medium">
            Pierścień połączony — teraz ustaw punkt NOP
          </p>
        </div>
        <NOPModal
          isOpen={true}
          ringLabel={`${terminalA.label} ↔ ${terminalB.label}`}
          candidates={nopCandidates}
          currentNopId={null}
          onSubmit={handleNopSubmit}
          onCancel={closeForm}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" data-testid="connect-ring-form">
      {catalogError && (
        <p className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-200">{catalogError}</p>
      )}
      <RingCloseModal
        isOpen={true}
        terminalA={terminalA}
        terminalB={terminalB}
        onSubmit={handleRingSubmit}
        onCancel={closeForm}
      />
    </div>
  );
}
