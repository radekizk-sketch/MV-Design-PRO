/*
 * Publiczny interfejs okna „Wyniki zwarciowe" (ui2/wyniki/zwarcia, karta E8.2) —
 * druga konkretyzacja wspólnego wzorca ekranu analizy.
 */

export { EkranZwarc } from './EkranZwarc';
export type { EkranZwarcProps } from './EkranZwarc';
export { WkladyZwarciowe } from './WkladyZwarciowe';
export type { WkladyZwarcioweProps } from './WkladyZwarciowe';
export { WykresIkssChart } from './WykresIkssChart';
export {
  KOLUMNY_ZWARC,
  KLUCZ_PUNKT,
  KOLUMNY_WKLADOW,
  KLUCZ_WKLAD,
  mapujWierszZwarcia,
  naWierszeZwarc,
  naZalozeniaZwarc,
  naSlupkiIkss,
  naWierszeWkladow,
  useWynikZwarciowy,
} from './zwarciaModel';
export type { WkladZwarciowy, SlupekIkss, WynikZwarciowy } from './zwarciaModel';
export {
  ZWARCIA_STRINGS,
  rodzajZwarciaPL,
  uwagiZwarciaPL,
  fmtKA,
  fmtMVA,
  fmtProcent,
} from './strings';
