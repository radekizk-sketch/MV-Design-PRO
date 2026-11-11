/**
 * Pola pomiarowe SN stacji — krok „Pola pomiarowe” konfiguratora stacji, wprost z modelu
 * (`Bay.funkcja_pomiaru` / `Bay.rodzaj_pomiaru`, kontrakt `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`
 * §5). Zastępuje dawne liczniki „Liczniki: 0 / Telepomiary: 0” — stałe bez źródła w modelu.
 *
 * Etykiety z tego samego słownika co kreator pola SN (`wyborPomiaruLabel`), więc wybór zapisany
 * w kreatorze i odczyt w konfiguratorze mają jedno brzmienie. Pole bez deklaracji pomiaru jest
 * jawnym brakiem, nie domysłem.
 */
import type { Bay } from '../../../types/enm';
import { canonicalFieldRole } from '../../sld/v2/station-rozdzielnia/contract';
import { wyborPomiaruLabel, type WyborPomiaru } from '../../../ui2/kreatory/pole/polaSnModel';

export interface PolePomiaroweWiersz {
  readonly bayId: string;
  readonly designation: string;
  readonly pomiarPl: string;
  readonly przekladnikiCt: number;
  readonly przekladnikiVt: number;
}

export const BRAK_DEKLARACJI_POMIARU_PL = 'pomiar niezadeklarowany w modelu';

const RODZAJE_UKLADU: ReadonlySet<string> = new Set<WyborPomiaru>([
  'PODSTAWOWY',
  'REZERWOWY',
  'ROWNOWAZNY',
  'KONTROLNY',
]);

function pomiarPola(bay: Pick<Bay, 'funkcja_pomiaru' | 'rodzaj_pomiaru'>): string {
  if (bay.funkcja_pomiaru === 'NAPIECIA_SZYN') return wyborPomiaruLabel('NAPIECIA_SZYN');
  if (
    bay.funkcja_pomiaru === 'UKLAD_ENERGII'
    && typeof bay.rodzaj_pomiaru === 'string'
    && RODZAJE_UKLADU.has(bay.rodzaj_pomiaru)
  ) {
    return wyborPomiaruLabel(bay.rodzaj_pomiaru as WyborPomiaru);
  }
  return BRAK_DEKLARACJI_POMIARU_PL;
}

export function polaPomiaroweStacji(
  pola: readonly { readonly bay: Bay; readonly oznaczenie: string }[],
  przekladniki: readonly { readonly bay_ref?: string | null; readonly measurement_type: 'CT' | 'VT' }[],
): readonly PolePomiaroweWiersz[] {
  return pola
    .filter(({ bay }) => canonicalFieldRole(bay.field_role ?? bay.bay_role) === 'POMIAROWE')
    .map(({ bay, oznaczenie }) => {
      const wPolu = przekladniki.filter((m) => m.bay_ref === bay.ref_id);
      return {
        bayId: bay.ref_id,
        designation: oznaczenie,
        pomiarPl: pomiarPola(bay),
        przekladnikiCt: wPolu.filter((m) => m.measurement_type === 'CT').length,
        przekladnikiVt: wPolu.filter((m) => m.measurement_type === 'VT').length,
      };
    });
}
