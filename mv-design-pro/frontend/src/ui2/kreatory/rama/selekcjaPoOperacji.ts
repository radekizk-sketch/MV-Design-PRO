/**
 * Wielokierunkowe wiązanie kreatora ze schematem (V12K-073).
 *
 * Po udanej operacji domenowej każdy kreator ui2 MUSI zaznaczyć nowo utworzony
 * element w warstwie selekcji — dzięki temu:
 *  - schemat SLD centruje i podświetla świeży element (selection_hint.zoom_to),
 *  - property-grid / inspektor otwiera się na tym elemencie (selectElement → propertyGridOpen),
 *  - drzewo topologii i pozostałe widoki synchronizują się przez wspólny store selekcji.
 *
 * ZERO fabrykacji: ref i typ elementu pochodzą z odpowiedzi backendu
 * (`selection_hint` → `changes.created_element_ids`), nie z domysłu UI. Fallback
 * `type`/`name` służy wyłącznie, gdy backend nie zwróci wskazania (obronnie).
 */
import { useCallback } from 'react';

import { navigateToSld } from '../../../ui/navigation/routes';
import { useSelectionStore } from '../../../ui/selection';
import type { DomainOpResponseV1 } from '../../../types/enm';
import type { ElementType } from '../../../ui/types';

/**
 * Mapowanie `selection_type` z backendu (słownik domenowy) na `ElementType`
 * warstwy prezentacji. Klucze odpowiadają `selection_type` przekazywanym w
 * `_success_response` (domain_operations[_v2].py).
 */
const MAPA_TYPU_BACKEND: Record<string, ElementType> = {
  substation: 'Station',
  station: 'Station',
  bus: 'Bus',
  branch: 'LineBranch',
  branch_point: 'BranchPole',
  switch: 'Switch',
  transformer: 'TransformerBranch',
  measurement: 'Measurement',
  protection: 'ProtectionAssignment',
  load: 'Load',
  bay: 'BaySN',
  generator: 'Generator',
  shunt_capacitor: 'Load',
};

/** Mapuje `selection_type` backendu na `ElementType`; przy braku — fallback kreatora. */
export function mapujTypElementu(
  raw: string | null | undefined,
  fallback: ElementType,
): ElementType {
  if (raw && raw in MAPA_TYPU_BACKEND) {
    return MAPA_TYPU_BACKEND[raw];
  }
  return fallback;
}

/** Wyłuskuje ref nowo utworzonego/wskazanego elementu z odpowiedzi operacji. */
export function refZOperacji(response: DomainOpResponseV1 | null): string | null {
  return (
    response?.selection_hint?.element_id
    ?? response?.changes?.created_element_ids?.[0]
    ?? null
  );
}

export interface SelekcjaFallback {
  /** Typ elementu użyty, gdy backend nie zwróci `selection_hint.element_type`. */
  type: ElementType;
  /** Nazwa wyświetlana elementu w inspektorze/drzewie. */
  name: string;
}

/**
 * Hook wiążący kreator ze schematem po zapisie. Zwraca funkcję, którą kreator
 * wywołuje w miejsce samego `navigateToSld()` po sukcesie operacji domenowej.
 */
export function useSelekcjaPoOperacji(): (
  response: DomainOpResponseV1 | null,
  fallback: SelekcjaFallback,
) => void {
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);

  return useCallback(
    (response: DomainOpResponseV1 | null, fallback: SelekcjaFallback) => {
      const ref = refZOperacji(response);
      if (ref) {
        const typ = mapujTypElementu(response?.selection_hint?.element_type, fallback.type);
        selectElement({ id: ref, type: typ, name: fallback.name });
        if (response?.selection_hint?.zoom_to !== false) {
          centerSldOnElement(ref);
        }
      }
      navigateToSld();
    },
    [centerSldOnElement, selectElement],
  );
}
