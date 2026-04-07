import { useCallback, useMemo } from 'react';

import { useAppStateStore } from '../../app-state';
import { NOPModal, type NOPCandidate, type NOPFormData } from '../../topology/modals/NOPModal';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';

export function SetNormalOpenPointForm() {
  const context = useNetworkBuildStore((s) => s.activeOperationForm?.context);
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const currentNopId =
    (context?.current_nop_id as string) ??
    (context?.currentNopId as string) ??
    null;
  const ringLabel =
    (context?.ring_label as string) ??
    (context?.ringLabel as string) ??
    'Aktywny pierscien SN';

  const candidates = useMemo<NOPCandidate[]>(() => {
    const rawCandidates = context?.nop_candidates ?? context?.nopCandidates;
    if (Array.isArray(rawCandidates) && rawCandidates.length > 0) {
      return rawCandidates as NOPCandidate[];
    }

    const switchRef =
      (context?.switch_ref as string) ??
      (context?.switchRef as string) ??
      null;

    if (!switchRef) {
      return [];
    }

    return [
      {
        id: switchRef,
        label:
          (context?.switch_label as string) ??
          (context?.switchLabel as string) ??
          switchRef,
        elementType:
          (context?.switch_type as string) ??
          (context?.switchType as string) ??
          'SWITCH',
      },
    ];
  }, [context]);

  const handleSubmit = useCallback(
    async (data: NOPFormData) => {
      if (!activeCaseId) {
        return;
      }

      await executeDomainOperation(activeCaseId, 'set_normal_open_point', {
        nop_element_ref: data.nop_element_ref,
        nop_type: data.nop_type,
        reason: data.reason,
      });
      closeForm();
    },
    [activeCaseId, closeForm, executeDomainOperation],
  );

  return (
    <div className="h-full overflow-y-auto" data-testid="set-normal-open-point-form">
      <NOPModal
        isOpen={true}
        ringLabel={ringLabel}
        candidates={candidates}
        currentNopId={currentNopId}
        onSubmit={handleSubmit}
        onCancel={closeForm}
      />
    </div>
  );
}
