/*
 * Publiczny interfejs okna „Zdolność przyłączeniowa" (ui2/oze/zdolnosc, karta P2).
 * Warstwa prezentacji: rodzaj kryterium, wartości i progi pochodzą wyłącznie
 * z backendu (NOT-A-SOLVER). Nazwy adapterów prefiksowane tematycznie, bo barrel
 * OZE robi `export *` — prefiks zapobiega kolizji nazw.
 */

export { EkranZdolnosci } from './EkranZdolnosci';
export type { EkranZdolnosciProps } from './EkranZdolnosci';
export { WykresZdolnosciChart } from './WykresZdolnosciChart';
export {
  elementKryterium,
  etykietaWezla,
  istotnoscScenariusza,
  progKryterium,
  rodzajKryteriumPL,
  slupkiZdolnosci,
  statusScenariuszaPL,
  wartoscKryterium,
} from './zdolnoscModel';
// Uwaga: `wybierzPrzebiegRozplywu` NIE jest re-eksportowane przez barrel OZE —
// nazwa koliduje z eksportem `pulpit` (TS2308 przy `export *`). Selektor jest
// dostępny bezpośrednio z `./zdolnoscModel` (używany przez ekran i testy).
export type { SlupekZdolnosci } from './zdolnoscModel';
export { ZDOLNOSC_STRINGS } from './strings';
