/**
 * Wariant przyłączenia źródła (`Generator.connection_variant`) — JEDEN słownik opisów.
 *
 * Kody kanoniczne i ich aliasy z backendu (`enm/domain_operations_v2.py` normalizuje
 * `LV_BEHIND_STATION_TRANSFORMER` → `nn_side`, `DEDICATED_MV_CONNECTION` → `block_transformer`;
 * `domain/generator_validation.py` grupuje je tak samo) mają ten sam opis. Wcześniej trzy
 * ekrany miały własne `switch` z różną treścią: nagłówek inspektora znał 2 z 5 kodów i resztę
 * wypisywał surowo, karta zbiorcza opisywała `block_transformer` jako „po stronie nN stacji”
 * (odwrotnie niż model). Kod spoza unii daje uczciwe zdanie (`etykietaZeSlownika`).
 */

import type { GeneratorConnectionVariant } from '../../../types/enm';
import { etykietaZeSlownika } from '../../../ui2/wyniki/wzorzec/slownikWyliczen';

export const WARIANT_PRZYLACZENIA_PL: Readonly<Record<GeneratorConnectionVariant, string>> = {
  nn_side: 'po stronie nN stacji',
  LV_BEHIND_STATION_TRANSFORMER: 'po stronie nN stacji',
  block_transformer: 'po stronie SN przez transformator blokowy',
  DEDICATED_MV_CONNECTION: 'po stronie SN przez transformator blokowy',
  SOURCE_CONNECTION_STATION: 'stacja przyłączeniowa źródła',
};

/** Opis wariantu przyłączenia; `null` dla wariantu niewskazanego w modelu. */
export function wariantPrzylaczeniaPl(wariant: string | null | undefined): string | null {
  if (!wariant) return null;
  return etykietaZeSlownika(WARIANT_PRZYLACZENIA_PL, wariant);
}
