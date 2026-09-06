/*
 * Publiczny interfejs WSPÓLNEGO WZORCA EKRANU ANALIZY (ui2/wyniki/wzorzec,
 * karta E8.1). Fundament wszystkich okien wyników U3/U4 — reużywany przez
 * konkretne analizy (np. `ui2/wyniki/rozplyw`).
 */

export { EkranAnalizy } from './EkranAnalizy';
export { TabelaWynikow } from './TabelaWynikow';
export { SekcjaZalozen } from './SekcjaZalozen';
export { SladWywodu } from './SladWywodu';
export type { KrokWywodu } from './SladWywodu';
export { SladSekcyjny } from './SladSekcyjny';
export type {
  SekcjaWywodu,
  PozycjaWalidacji,
  StatusPozycjiWalidacji,
  WalidacjaWywodu,
} from './SladSekcyjny';
export { WZORZEC_STRINGS } from './strings';
export { usePoprawWModelu } from './usePoprawWModelu';
export { akcjaNaprawcza, AKCJA_GENERYCZNA } from './akcjeNaprawcze';
export type { RodzajPrzekroczenia, AkcjaNaprawcza, CelAkcjiNaprawczej } from './akcjeNaprawcze';
export {
  AKCJE_STANU_ZEROWEGO_STRINGS,
  useAkcjaDodajZrodloOze,
  useAkcjaOtworzDokumentacje,
  useAkcjaPorownajWarianty,
  useAkcjaPrzejdzDoPrzypadkow,
  useAkcjaPrzejdzDoSchematu,
  useAkcjaUruchomObliczenie,
} from './akcjeStanuZerowego';
export type { AkcjaStanuZerowego } from './akcjeStanuZerowego';
export { PrzyciskAkcjiStanu } from './PrzyciskAkcjiStanu';
export type {
  EkranAnalizyProps,
  NaglowekAnalizy,
  WierszZalozenia,
  WartoscKomorki,
  DefinicjaKolumny,
  WierszTabeli,
  WyrownanieKolumny,
  KierunekSortowania,
  StanSortowania,
} from './wzorzecModel';
