/*
 * Publiczny interfejs okna „Rozpływ mocy — napięcia szyn" (ui2/wyniki/rozplyw,
 * karta E8.1) — pierwsza konkretyzacja wspólnego wzorca ekranu analizy.
 */

export { TabelaSzyn } from './TabelaSzyn';
export type { TabelaSzynProps } from './TabelaSzyn';
export { TabelaGalezi } from './TabelaGalezi';
export type { TabelaGaleziProps } from './TabelaGalezi';
export { EkranRozplywu } from './EkranRozplywu';
export type { EkranRozplywuProps } from './EkranRozplywu';
export { ProfilNapiecChart } from './ProfilNapiecChart';
// UWAGA: `KOLUMNY_GALEZI`/`naWierszeGalezi` NIE są re-eksportowane stąd — te same
// nazwy istnieją już w `ui2/wyniki/porownanie` (kolumny/wiersze porównania A/B
// gałęzi, inna semantyka) i barrel nadrzędny `ui2/wyniki/index.ts` robi
// `export *` z obu modułów; re-eksport tutaj powodowałby kolizję nazw (TS2308).
// Dostęp: import bezpośrednio z `./adapters/rozplywAdapter` (jak w testach).
export {
  KOLUMNY_SZYN,
  KLUCZ_SZYNA,
  KLUCZ_GALAZ,
  naWierszeSzyn,
  naZalozeniaRozplywu,
  naProfilNapiec,
  naSumeStratGalezi,
  useWynikRozplywu,
} from './adapters/rozplywAdapter';
export type {
  PunktProfilu,
  WynikRozplywu,
  PodsumowanieStratGalezi,
} from './adapters/rozplywAdapter';
export {
  ROZPLYW_STRINGS,
  NAPIECIE_MIN_PU,
  NAPIECIE_MAX_PU,
  napiecePozaZakresem,
} from './strings';
