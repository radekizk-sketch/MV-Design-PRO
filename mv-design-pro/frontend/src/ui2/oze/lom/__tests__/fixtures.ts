/*
 * Fixtures okna „Praca wyspowa" (ochrona LoM, karta U4 P46). Widoki WYGENEROWANE przez
 * backend (`backend/tests/uczciwosc/generuj_fixtury_ocen_fe.py`, parytet pilnuje
 * `test_fixtury_ocen_fe.py`) funkcją końcówki `build_ochrona_lom_view` — kształty, rekordy
 * werdyktu (porównań, pól i sieci), etykiety i wywody 1:1 z backendem, nic składanego ręcznie.
 *
 * `trzy_pola`: pole PV bez funkcji LoM, pole BESS z nastawą 81R poniżej okna i zwłoką 0,3 s,
 * pole FW z progiem 81U na krawędzi okna oraz moduł PV bez pola przyłączeniowego (kolejność
 * pól = sortowanie backendu po identyfikatorze). `pusty`: sieć bez modułów wytwórczych.
 * `pole_bez_sprawdzen`: pole BEZ porównań (stan obronny rekordu pola) obok pola FW — złożone
 * tymi samymi funkcjami rekordu pola, liczników i wymagania sieci.
 */

import type { WidokOchronyLom } from '../../api';
import type { RekordOcenyNiewykonanej } from '../../../wyniki/wzorzec/OcenaNiewykonana';
import widokiOchronyLom from './widokiOchronyLom.json';

const WIDOKI = widokiOchronyLom as unknown as {
  readonly trzy_pola: WidokOchronyLom;
  readonly pusty: WidokOchronyLom;
  readonly pole_bez_sprawdzen: WidokOchronyLom;
};

/** Pełny widok LoM z trzema polami i modułem bez pola. */
export function widokOchronyLomFixture(): WidokOchronyLom {
  return WIDOKI.trzy_pola;
}

/** Widok bez pól i bez modułów bez pola — uczciwy stan „brak pól". */
export function widokLomPustyFixture(): WidokOchronyLom {
  return WIDOKI.pusty;
}

/** Widok z polem BEZ porównań (rekord `NIE_OCENIONO`, dawniej „OK") i polem FW z porównaniami. */
export function widokPoleBezSprawdzenFixture(): WidokOchronyLom {
  return WIDOKI.pole_bez_sprawdzen;
}

/** Rekord `NIE_OCENIONO` pola bez porównań — z widoku wygenerowanego przez backend. */
export const OCENA_POLA_BEZ_SPRAWDZEN = WIDOKI.pole_bez_sprawdzen.fields[0]
  .ocena as RekordOcenyNiewykonanej;

/** Pole widoku po nazwie (kolejność pól wyznacza backend). */
export function poleWidoku(widok: WidokOchronyLom, nazwa: string) {
  const pole = widok.fields.find((p) => p.bay_name === nazwa);
  if (pole === undefined) throw new Error(`brak pola ${nazwa} w widoku`);
  return pole;
}
