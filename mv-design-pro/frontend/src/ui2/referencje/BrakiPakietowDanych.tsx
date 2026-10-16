/**
 * Nazwane odmowy braku pakietu danych właściciela w raporcie zgodności
 * referencyjnej (karta OD-17a). Backend (`reference_engine.evaluate_enm`)
 * ocenia pakiet operatora wskazanego w przypadku; gdy rejestr go nie ma, raport
 * niesie rekord `braki_pakietow` zamiast cichego braku pakietu — ten komponent
 * pokazuje jego zdanie dla projektanta. Warstwa niczego nie liczy i nie mapuje
 * statusów na teksty: treść pochodzi wyłącznie z `komunikat_pl` backendu.
 */

import type { RekordBrakuPakietu } from './api';
import './referencje.css';

interface BrakiPakietowDanychProps {
  braki: readonly RekordBrakuPakietu[] | undefined;
  klasa?: string;
}

export function BrakiPakietowDanych({ braki, klasa }: BrakiPakietowDanychProps) {
  if (!braki || braki.length === 0) return null;
  return (
    <ul className={klasa ?? 'mvd-ref-braki-pakietow'} role="note" data-testid="mvd-braki-pakietow">
      {braki.map((brak) => (
        <li key={brak.kod} data-testid={`mvd-brak-pakietu-${brak.pakiet}`}>
          {brak.komunikat_pl}
        </li>
      ))}
    </ul>
  );
}
