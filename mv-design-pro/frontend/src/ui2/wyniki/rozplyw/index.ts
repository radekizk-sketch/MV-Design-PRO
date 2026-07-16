/*
 * Publiczny interfejs okna „Rozpływ mocy — napięcia szyn" (ui2/wyniki/rozplyw,
 * karta E8.1) — pierwsza konkretyzacja wspólnego wzorca ekranu analizy.
 */

export { TabelaSzyn } from './TabelaSzyn';
export type { TabelaSzynProps } from './TabelaSzyn';
export { ProfilNapiecChart } from './ProfilNapiecChart';
export {
  KOLUMNY_SZYN,
  KLUCZ_SZYNA,
  naWierszeSzyn,
  naZalozeniaRozplywu,
  naProfilNapiec,
  useWynikRozplywu,
} from './adapters/rozplywAdapter';
export type { PunktProfilu, WynikRozplywu } from './adapters/rozplywAdapter';
export {
  ROZPLYW_STRINGS,
  NAPIECIE_MIN_PU,
  NAPIECIE_MAX_PU,
  napiecePozaZakresem,
} from './strings';
