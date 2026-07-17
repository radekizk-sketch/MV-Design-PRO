/**
 * Zakładka „Właściwości" przestrzeni „Model sieci" (E5.x).
 *
 * Przejęte okno właściwości elementu: renderuje ISTNIEJĄCY `PropertyGridContainer`
 * z `ui/property-grid` (reuse całego modułu jak powierzchnia). Kontrakt:
 * - selekcja: wspólny store `ui/selection` (`selectedElements`),
 * - dane: snapshot ENM ze store `ui/topology/snapshotStore` (surowe rekordy),
 * - zapis: WYŁĄCZNIE istniejąca operacja domenowa `update_element_parameters`
 *   (ta sama ścieżka co InspectorEngineeringView / UpdateElementParametersForm) —
 *   zero nowych ścieżek mutacji, zero fizyki.
 *
 * Uczciwy stan pusty PL bez selekcji; multi-edit gdy zaznaczono wiele elementów
 * (container automatycznie wybiera `PropertyGridMultiEdit`).
 */
import { useCallback, useMemo } from 'react';

import { PropertyGridContainer, type ElementData } from '../../../ui/property-grid';
import { useSelectionStore } from '../../../ui/selection';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useAppStateStore } from '../../../ui/app-state';
import type { EnergyNetworkModel } from '../../../types/enm';
import { MODEL_WARSZTAT_STRINGS as T } from './strings';

/** Kolekcje ENM przeszukiwane w poszukiwaniu surowego rekordu elementu. */
const KOLEKCJE_ELEMENTOW = [
  'buses',
  'branches',
  'transformers',
  'sources',
  'loads',
  'generators',
  'substations',
  'bays',
  'junctions',
  'corridors',
  'measurements',
  'protection_assignments',
  'branch_points',
] as const;

/** Surowy rekord elementu ze snapshotu (dane dla property grida). */
function znajdzDaneElementu(
  snapshot: EnergyNetworkModel | null,
  refOrId: string,
): Record<string, unknown> {
  if (!snapshot) return {};
  const model = snapshot as unknown as Record<string, unknown>;
  for (const kolekcja of KOLEKCJE_ELEMENTOW) {
    const lista = model[kolekcja];
    if (!Array.isArray(lista)) continue;
    const rekord = (lista as Array<Record<string, unknown>>).find(
      (el) => el.ref_id === refOrId || el.id === refOrId,
    );
    if (rekord) return rekord;
  }
  return {};
}

export function WlasciwosciModelu() {
  const selectedElements = useSelectionStore((s) => s.selectedElements);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const elementy = useMemo<ElementData[]>(
    () =>
      selectedElements.map((el) => ({
        id: el.id,
        type: el.type,
        name: el.name,
        data: znajdzDaneElementu(snapshot, el.id),
      })),
    [selectedElements, snapshot],
  );

  // Zapis parametru — istniejąca operacja domenowa (ta sama ścieżka co reszta UI).
  const zapiszParametr = useCallback(
    (elementId: string, fieldKey: string, value: unknown) => {
      if (!activeCaseId) return;
      void executeDomainOperation(activeCaseId, 'update_element_parameters', {
        element_ref: elementId,
        parameters: { [fieldKey]: value },
      });
    },
    [activeCaseId, executeDomainOperation],
  );

  const zapiszParametrPojedynczy = useCallback(
    (fieldKey: string, value: unknown) => {
      const pierwszy = elementy[0];
      if (!pierwszy) return;
      zapiszParametr(pierwszy.id, fieldKey, value);
    },
    [elementy, zapiszParametr],
  );

  if (elementy.length === 0) {
    return (
      <div
        className="mvd-model-wlasciwosci-pusto"
        data-testid="mvd-model-wlasciwosci-pusto"
      >
        {T.wlasciwosciStanPusty}
      </div>
    );
  }

  const pierwszy = elementy[0];

  return (
    <div className="mvd-model-wlasciwosci" data-testid="mvd-model-wlasciwosci">
      <PropertyGridContainer
        projectId={activeCaseId ?? ''}
        elementId={pierwszy.id}
        elementType={pierwszy.type}
        elementName={pierwszy.name}
        elementData={pierwszy.data}
        elements={elementy}
        onFieldChange={zapiszParametrPojedynczy}
        onFieldChangeMulti={zapiszParametr}
      />
    </div>
  );
}
