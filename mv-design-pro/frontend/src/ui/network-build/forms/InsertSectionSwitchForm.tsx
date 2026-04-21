/**
 * InsertSectionSwitchForm — formularz wstawiania łącznika sekcyjnego.
 *
 * Wrapper inline nad SectionSwitchModal z ui/topology/modals/.
 * Integruje się z snapshotStore.executeDomainOperation + networkBuildStore.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useState } from 'react';
import {
  SectionSwitchModal,
  type SectionSwitchFormData,
} from '../../topology/modals/SectionSwitchModal';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { validateCatalogFirst } from './catalogFirstRules';
import { normalizeCatalogBinding, normalizeSwitchState } from './catalogPayload';

export function InsertSectionSwitchForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const segmentRef = ((context?.segmentRef as string) ?? (context?.segment_id as string) ?? (context?.segment_ref as string) ?? '').trim();
  const segmentLabel = (context?.segmentLabel as string) ?? segmentRef;

  const handleSubmit = useCallback(
    async (data: SectionSwitchFormData) => {
      if (!activeCaseId) return;
      const catalogBinding = normalizeCatalogBinding(data.catalog_ref, 'APARAT_SN');
      const payload = {
        segment_id: data.segment_ref,
        switch_name: data.name,
        switch_type: data.switch_kind,
        normal_state: normalizeSwitchState(data.switch_state),
        insert_at: {
          mode: 'RATIO',
          value: data.position_on_segment,
        },
        catalog_binding: catalogBinding ?? undefined,
      };
      const validationError = validateCatalogFirst('insert_section_switch_sn', payload);
      if (validationError) {
        setCatalogError(validationError);
        return;
      }
      setCatalogError(null);
      await executeDomainOperation(activeCaseId, 'insert_section_switch_sn', payload);
      closeForm();
    },
    [activeCaseId, executeDomainOperation, closeForm],
  );

  return (
    <div className="h-full overflow-y-auto" data-testid="insert-section-switch-form">
      {catalogError && (
        <p className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-200">{catalogError}</p>
      )}
      <SectionSwitchModal
        isOpen={true}
        segmentRef={segmentRef}
        segmentLabel={segmentLabel}
        onSubmit={handleSubmit}
        onCancel={closeForm}
      />
    </div>
  );
}
