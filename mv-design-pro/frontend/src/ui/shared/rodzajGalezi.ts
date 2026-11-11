/**
 * Nazwa rodzaju gałęzi modelu (`Branch.type`) dla projektanta — JEDEN słownik frontu.
 *
 * Konsumenci: karta techniczna elementu, przegląd łączników, inspektor ui2, inspektor
 * inżynierski. Pełność względem unii `Branch['type']` wymusza typ `Record`; listę rodzajów
 * trzyma `types/rodzajeGalezi.ts` (`RODZAJE_GALEZI`). Parytet nazw z backendem
 * (`enm/slownik_komunikatow.py`: `NAZWY_RODZAJOW_GALEZI_PL`, ta sama nazwa z wielką literą
 * na początku) przypina wyrocznia harnessu `rodzaje_wielkosci_zwarciowych_aparatury.json`
 * (`nazwy_galezi`), test `ui/shared/__tests__/rodzajGalezi.test.ts`.
 */
import type { RodzajGalezi } from '../../types/rodzajeGalezi';

export const RODZAJ_GALEZI_PL: Readonly<Record<RodzajGalezi, string>> = {
  line_overhead: 'Linia napowietrzna',
  cable: 'Kabel',
  switch: 'Łącznik',
  breaker: 'Wyłącznik',
  bus_coupler: 'Sprzęgło szyn',
  disconnector: 'Odłącznik',
  fuse: 'Bezpiecznik',
};
