/**
 * Rejestr parametrów maszyn wirujących — odpowiedź `GET /api/catalog/maszyny-wirujace/wartosci-robocze`
 * (`rejestr_maszyn_do_formularza`, backend `network_model/catalog/wartosci_robocze.py`) zapisana
 * w `fixtures/rejestr_maszyn_wirujacych.json`. Fikstura jest RÓWNA odpowiedzi backendu — pilnuje
 * tego `tests/application/test_parametry_robocze_maszyn.py::test_fikstura_rejestru_maszyn_frontu_rowna_backendowi`
 * (regeneracja: polecenie w nagłówku tego testu), więc testy frontu nie zostaną zielone na
 * rejestrze, którego backend już nie ma.
 */

import type { RejestrMaszynWirujacych } from '../../../../ui/catalog/types';
import { czyRejestrMaszyn } from '../wartosciRoboczeMaszyny';
import rejestr from './fixtures/rejestr_maszyn_wirujacych.json';

/**
 * Fikstura przechodzi przez TEN SAM strażnik postaci odpowiedzi co kreator
 * (`czyRejestrMaszyn`, KreatorEdycjiParametrow) — import JSON poszerza literały rodzin do `string`,
 * więc przypisanie wprost nie typuje się; rzutowanie ukryłoby rozjazd postaci, strażnik go zgłasza.
 */
function rejestrZFikstury(dane: unknown): RejestrMaszynWirujacych {
  if (!czyRejestrMaszyn(dane)) {
    throw new Error('Fikstura rejestru maszyn wirujących nie ma postaci odpowiedzi backendu.');
  }
  return dane;
}

export const REJESTR_MASZYN = rejestrZFikstury(rejestr);
