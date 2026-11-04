/**
 * Rekordy sprawdzeń zgodności referencyjnej wygenerowane z backendu
 * (`backend/tests/uczciwosc/generuj_fixtury_ocen_fe.py::_oceny_referencyjne`, parytet
 * `test_fixtury_ocen_fe.py`) — testy ekranów nie budują rekordów ręcznie.
 */
import type { ReferenceComplianceCheck } from '../api';
import rekordy from './rekordyReferencyjne.json';

/** Sprawdzenie spełnione (pole zgodne z profilem pola). */
export const SPRAWDZENIE_ZGODNE = rekordy.zgodne as unknown as ReferenceComplianceCheck;
/** Sprawdzenie naruszone (kolejność toru głównego niezgodna z kanonem profilu). */
export const SPRAWDZENIE_NIEZGODNE = rekordy.niezgodne as unknown as ReferenceComplianceCheck;

/** Kopia sprawdzenia przypisana do innego elementu i pakietu (filtry ekranów). */
export function sprawdzenieDla(
  wzor: ReferenceComplianceCheck,
  elementRef: string,
  packId: string,
): ReferenceComplianceCheck {
  return {
    ...wzor,
    element_ref: elementRef,
    pack_id: packId,
    ocena: {
      ...wzor.ocena,
      kryterium_id: `${wzor.ocena.kryterium_id}@${elementRef}`,
      przedmiot: { ...wzor.ocena.przedmiot, element_ref: elementRef },
    },
  };
}
