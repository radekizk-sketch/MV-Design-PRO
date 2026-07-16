/*
 * Publiczny interfejs okna „Obszar bezpiecznej pracy P–Q" (ui2/oze/obszar, karta
 * P30). Warstwa prezentacji: pasma pracy, kryteria wiążące i liczby biegów
 * pochodzą wyłącznie z backendu (NOT-A-SOLVER). Nazwy adapterów sufiksowane
 * `Obszar`, bo barrel OZE robi `export *` — sufiks zapobiega kolizji nazw (TS2308).
 */

export { EkranObszaruPQ } from './EkranObszaruPQ';
export type { EkranObszaruPQProps } from './EkranObszaruPQ';
export { WykresObszaruChart } from './WykresObszaruChart';
export {
  rodzajGranicyPL,
  elementGranicy,
  wartoscGranicy,
  progGranicy,
  opisGranicy,
  brakPasma,
  punktyObszaru,
  kolumnyTabeliObszaru,
  wierszeTabeliObszaru,
  krokiSladuObszar,
} from './obszarModel';
export type { PunktObszaru } from './obszarModel';
export { OBSZAR_STRINGS } from './strings';
