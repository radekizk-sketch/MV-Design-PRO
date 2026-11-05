/**
 * Nazwane odmowy braku pakietu danych właściciela w raporcie zgodności
 * referencyjnej (karta OD-17a). Backend (`reference_engine.evaluate_enm`)
 * ocenia pakiet operatora wskazanego w przypadku; gdy rejestr go nie ma, raport
 * niesie rekord `braki_pakietow` zamiast cichego braku pakietu — ten komponent
 * pokazuje jego zdanie dla projektanta. Warstwa niczego nie liczy i nie mapuje
 * statusów na teksty: treść pochodzi wyłącznie z `komunikat_pl` backendu.
 *
 * Dodatek karty GPZ-DANE-ANALIZ: pakiet OSD wybiera operator sieci MODELU (warunki
 * przyłączenia). Model bez operatora sieci nie ma pakietu OSD do oceny — raport niesie wtedy
 * zdanie `brak_operatora_sieci_pl` (backend), pokazane tu obok braków pakietów.
 */

import type { RekordBrakuPakietu } from './api';
import './referencje.css';

interface BrakiPakietowDanychProps {
  braki: readonly RekordBrakuPakietu[] | undefined;
  /** Zdanie backendu o braku operatora sieci w modelu (`brak_operatora_sieci_pl`). */
  brakOperatoraSieci?: string | null;
  klasa?: string;
}

export function BrakiPakietowDanych({ braki, brakOperatoraSieci, klasa }: BrakiPakietowDanychProps) {
  if ((!braki || braki.length === 0) && !brakOperatoraSieci) return null;
  return (
    <ul className={klasa ?? 'mvd-ref-braki-pakietow'} role="note" data-testid="mvd-braki-pakietow">
      {brakOperatoraSieci ? (
        <li data-testid="mvd-brak-operatora-sieci">{brakOperatoraSieci}</li>
      ) : null}
      {(braki ?? []).map((brak) => (
        <li key={brak.kod} data-testid={`mvd-brak-pakietu-${brak.rodzaj}`}>
          {brak.komunikat_pl}
        </li>
      ))}
    </ul>
  );
}
