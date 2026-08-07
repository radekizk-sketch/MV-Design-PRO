/*
 * Kafel „Import z arkusza (XLSX)" (pulpit W-101) — stałe wejście do okna importu
 * sieci z arkusza operatora (etap E1: zlecenie i dane wejściowe).
 *
 * Do karty XLSX-IMPORT końcówka `POST /api/import/xlsx` nie miała w całym
 * froncie ŻADNEGO wołającego: projektant z arkuszem od operatora nie miał
 * gdzie kliknąć.
 *
 * Kafel jest w pełni sterowany propsami (jak reszta kafli pulpitu) — otwarcie
 * okna należy do przestrzeni, nie do kafla.
 */

import { Kafel } from './Kafel';
import { PULPIT_STRINGS } from './strings';

export function KafelArkusza({ onKlik }: { onKlik: () => void }) {
  return (
    <Kafel tytul={PULPIT_STRINGS.arkuszTytul} onKlik={onKlik} ariaLabel={PULPIT_STRINGS.arkuszAkcja}>
      <p className="mvd-kafel-pusty-opis">{PULPIT_STRINGS.arkuszOpis}</p>
    </Kafel>
  );
}
