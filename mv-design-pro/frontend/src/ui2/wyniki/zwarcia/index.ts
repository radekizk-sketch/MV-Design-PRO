/*
 * Publiczny interfejs okna „Wyniki zwarciowe" (ui2/wyniki/zwarcia, karta E8.2) —
 * druga konkretyzacja wspólnego wzorca ekranu analizy.
 */

export { EkranZwarc } from './EkranZwarc';
export type { EkranZwarcProps } from './EkranZwarc';
export { WkladyZwarciowe } from './WkladyZwarciowe';
export type { WkladyZwarcioweProps } from './WkladyZwarciowe';
export { WykresIkssChart } from './WykresIkssChart';
export { WykresZwarc } from './WykresZwarc';
export { WykresUdzialowChart } from './WykresUdzialowChart';
export {
  KOLUMNY_ZWARC,
  KLUCZ_PUNKT,
  KOLUMNY_WKLADOW,
  KLUCZ_WKLAD,
  KONFIG_WYKRESU_ZWARC,
  WIELKOSCI_WYKRESU,
  filtrujWierszeWkladow,
  mapujWierszZwarcia,
  naWierszeZwarc,
  naZalozeniaZwarc,
  naPozycjeSzczegoluWkladu,
  naSlupkiIkss,
  naSlupkiUdzialow,
  naSlupkiWielkosci,
  naWierszeWkladow,
  useWynikZwarciowy,
} from './zwarciaModel';
export type {
  WkladZwarciowy,
  SzczegolWkladu,
  SlupekIkss,
  SlupekUdzialu,
  WielkoscWykresu,
  WynikZwarciowy,
} from './zwarciaModel';
export {
  ZWARCIA_STRINGS,
  rodzajZwarciaPL,
  typMaszynyPL,
  uwagiZwarciaPL,
  fmtKA,
  fmtMVA,
  fmtProcent,
} from './strings';
