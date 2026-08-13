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
import { resolveSelectedElementFromSnapshot } from '../../../ui/shared/selectionResolution';
import { wskazanieOperacji } from '../../../ui/topology/wskazanieOperacji';
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

/** Wyłuskuje ref nowo utworzonego/wskazanego elementu z odpowiedzi operacji.
 *  Reguła pierwszeństwa mieszka w `ui/topology/wskazanieOperacji.ts` — TYM
 *  SAMYM źródle, z którego czyta kotwica kamery (karta B-2), żeby inspektor i
 *  kadr nie mogły wskazać dwóch różnych obiektów. */
export function refZOperacji(response: DomainOpResponseV1 | null): string | null {
  return wskazanieOperacji(response?.selection_hint, response?.changes)?.kandydaci[0] ?? null;
}

/**
 * Ref do SELEKCJI — pierwszy kandydat z odpowiedzi (wskazanie backendu, potem
 * elementy utworzone), który jest ROZWIĄZYWALNY w migawce modelu z tej samej
 * odpowiedzi (K9-A, naprawa u źródła). Wskazanie niekanoniczne (np. ref
 * specyfikacji pola w metadanych stacji) wybierane wprost wywalało selekcję:
 * kanonikalizacja selekcji zeruje wybór i SKŁADA stos powierzchni, zamykając
 * otwarty kreator w trakcie pracy — podsumowanie po zapisie nigdy nie było
 * widoczne w żywej aplikacji. Brak kandydata kanonicznego ⇒ null (bez selekcji).
 */
export function kanonicznyRefZOperacji(response: DomainOpResponseV1 | null): string | null {
  if (!response) return null;
  // Lista kandydatów z JEDNEGO źródła reguły (`ui/topology/wskazanieOperacji.ts`)
  // — tej samej, z której czyta kotwica kamery (karta B-2).
  const kandydaci = wskazanieOperacji(response.selection_hint, response.changes)?.kandydaci ?? [];
  if (kandydaci.length === 0) return null;
  const snapshot = response.snapshot ?? null;
  // Bez migawki w odpowiedzi nie da się kanonikalizować — zachowujemy dotychczasowe
  // wskazanie (żaden znany dostawca nie zwraca selection_hint bez migawki).
  if (!snapshot) return kandydaci[0];
  for (const ref of kandydaci) {
    if (resolveSelectedElementFromSnapshot(snapshot, ref)) return ref;
  }
  return null;
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
      // WYŁĄCZNIE ref kanoniczny w migawce odpowiedzi — selekcja niekanoniczna
      // składa stos powierzchni i zamyka otwarty kreator (patrz kanonicznyRefZOperacji).
      const ref = kanonicznyRefZOperacji(response);
      if (ref) {
        // Typ ze wskazania backendu dotyczy refu ze wskazania; dla kandydata
        // zastępczego (element utworzony) typ nadaje kreator (fallback).
        const typZeWskazania =
          ref === response?.selection_hint?.element_id
            ? response?.selection_hint?.element_type
            : null;
        const typ = mapujTypElementu(typZeWskazania, fallback.type);
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
