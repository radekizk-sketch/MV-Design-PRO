import { useCallback, useMemo, useState } from 'react';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { normalizeCatalogBinding } from './catalogPayload';
import type { CatalogNamespace } from '../../catalog/types';

export function AssignCatalogForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const elementRef = (context?.element_ref as string) ?? '';
  const suggestedField = (context?.field as string) ?? 'catalog_item_id';
  const catalogNamespace = (context?.catalog_namespace as CatalogNamespace | undefined) ?? null;

  const [catalogItemId, setCatalogItemId] = useState((context?.catalog_item_id as string) ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => Boolean(activeCaseId && elementRef && catalogItemId.trim()), [activeCaseId, elementRef, catalogItemId]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !activeCaseId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const catalogBinding = normalizeCatalogBinding(catalogItemId.trim(), catalogNamespace);
      if (!catalogBinding) {
        setError('Brak jawnej przestrzeni katalogowej dla przypięcia elementu.');
        return;
      }
      await executeDomainOperation(activeCaseId, 'assign_catalog_to_element', {
        element_ref: elementRef,
        catalog_binding: catalogBinding,
        source_mode: 'KATALOG',
      });
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się przypisać katalogu');
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, activeCaseId, executeDomainOperation, elementRef, catalogItemId, closeForm]);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3" data-testid="assign-catalog-form">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Przypisanie katalogu</h3>
        <p className="text-[11px] text-gray-500 mt-1">Element: <span className="font-medium text-gray-700">{elementRef || '—'}</span></p>
      </div>

      <label className="block">
        <span className="text-[11px] font-medium text-gray-700">Identyfikator pozycji katalogowej</span>
        <input title="Identyfikator pozycji katalogowej"
          value={catalogItemId}
          onChange={(e) => setCatalogItemId(e.target.value)}
          placeholder="np. kabel_sn_3x120_al"
          className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-xs"
        />
      </label>

      <p className="text-[10px] text-gray-500">Pole docelowe: {suggestedField}</p>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {isSubmitting ? 'Przypisywanie…' : 'Przypisz katalog'}
        </button>
        <button type="button" onClick={closeForm} className="px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600">
          Anuluj
        </button>
      </div>
    </div>
  );
}

export default AssignCatalogForm;
