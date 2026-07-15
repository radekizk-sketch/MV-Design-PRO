/*
 * Kafel „wkrótce" (W-101) — placeholder dla kafli, których danych NIE MA w
 * store'ach read-only (karta §3: „kafel bez danych źródłowych = stan »wkrótce«,
 * nigdy pusta dziura"; karta §2/§4: NIE zgaduj).
 *
 * TODO-KARTA (brak źródła danych): audyt W-101 przewiduje kafle „Postęp wg celu"
 * (cel projektu / kamienie milowe) oraz „Bilans przyłączeniowy" (moc przyłączeniowa
 * vs. zainstalowana OZE). Żaden ze store'ów read-only nie niesie modelu celu
 * projektu ani bilansu mocy przyłączeniowej — kafle pozostają w stanie „wkrótce"
 * do czasu wprowadzenia źródła w kolejnych fazach programu.
 */

import { Kafel } from './Kafel';
import { PULPIT_STRINGS } from './strings';

export function KafelWkrotce({ tytul }: { tytul: string }) {
  return (
    <Kafel tytul={tytul} wyszarzony>
      <p className="mvd-kafel-wkrotce">{PULPIT_STRINGS.wkrotce}</p>
    </Kafel>
  );
}
