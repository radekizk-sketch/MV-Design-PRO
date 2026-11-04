/**
 * Pole, do którego należy kliknięty obiekt warstwy adnotacji zabezpieczeń (karta
 * UX-04/POLE-LINIOWE-WZORZEC: „klik w blok przekaźnika otwiera zakładkę »Zabezpieczenia
 * i automatyka«").
 *
 * Adnotacja zabezpieczeń nie jest obiektem modelu (menu kontekstowe jej odmawia —
 * `canvasMenuSubject.ts`, kod `adnotacja`), ale KAŻDY jej element należy do pola: okrąg
 * przekaźnika (`ownerRef` = ref pola), wiersze bloku (`<pole>#protection-codes-full[-n]`,
 * `<pole>#zrodlo-u0[-n]`), linia wyłączania (`<pole>#trip-line`), linie pomiarowe i miernik.
 * Klik w dowolny z nich prowadzi do karty TEGO pola, do sekcji zabezpieczeń — jedna reguła dla
 * całej klasy obiektów warstwy (GPZ i stacje), bez listy przyrostków.
 *
 * Zwraca `Bay.ref_id` albo `null`, gdy obiekt nie jest adnotacją zabezpieczeń albo człon refu
 * przed `#` nie jest polem modelu (uczciwy brak — klik idzie dotychczasową ścieżką).
 */
import type { EnergyNetworkModel } from '../../../../types/enm';
import type { PreviewElementKind } from '../compose/preview';

export function poleAdnotacjiZabezpieczen(
  meta: { readonly ownerRef?: string; readonly elementKind?: PreviewElementKind } | undefined,
  snapshot: Pick<EnergyNetworkModel, 'bays'> | null,
): string | null {
  if (meta?.elementKind !== 'protectionAnnotation' || !meta.ownerRef) return null;
  const refPola = meta.ownerRef.split('#')[0];
  return (snapshot?.bays ?? []).some((b) => b.ref_id === refPola) ? refPola : null;
}

/** Id sekcji karty pola, do której prowadzi klik w adnotację zabezpieczeń
 *  (`kartaTechnicznaElementu.ts::sekcjaZabezpieczenIAutomatyki`). */
export const SEKCJA_ZABEZPIECZEN_KARTY_POLA = 'zabezpieczenia';
