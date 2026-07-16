/*
 * Publiczny interfejs okna „Porównanie przebiegów" (ui2/wyniki/porownanie,
 * karta E12.1 / W-609) — konkretyzacja wspólnego wzorca ekranu analizy dla
 * porównania A/B rozpływu mocy.
 */

export { EkranPorownania } from './EkranPorownania';
export type { EkranPorownaniaProps } from './EkranPorownania';
export {
  KOLUMNY_SZYN_DIFF,
  KOLUMNY_GALEZI,
  KOLUMNY_RANKINGU,
  KLUCZ_PROBLEM,
  mapaWagElementow,
  naWierszeSzynDiff,
  naWierszeGalezi,
  naWierszeRankingu,
  naZalozeniaPorownania,
  etykietaPrzebiegu,
} from './porownanieModel';
export {
  POROWNANIE_STRINGS,
  WAGA_PL,
  KOD_PROBLEMU_PL,
  rodzajProblemuPL,
  wagaPL,
  zbieznoscPL,
  fmtNapiecie,
  fmtKat,
  fmtMoc,
  fmtDeltaMoc,
  fmtData,
} from './strings';
