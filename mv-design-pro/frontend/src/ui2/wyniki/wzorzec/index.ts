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
export { WZORZEC_STRINGS, etykietaPrzebieguWyniku, formatZnacznikaCzasu } from './strings';
export { InformacjeAudytowe } from './InformacjeAudytowe';
export { ZapisTechniczny, type ZapisTechnicznyProps } from './ZapisTechniczny';
export { etykietaZeSlownika } from './slownikWyliczen';
export {
  NAZWY_SEGMENTOW,
  SEGMENT_MASZYNOWY,
  etykietaZapasowaRefu,
  nazwaObiektuZMigawki,
  tlumaczSegment,
  useNazwaObiektu,
} from './useNazwaObiektu';
export type { NazwaObiektu } from './useNazwaObiektu';
export type { WierszInformacjiAudytowych, InformacjeAudytoweProps } from './InformacjeAudytowe';
export { KartaWerdyktu, type KartaWerdyktuProps } from './KartaWerdyktu';
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
export type { AkcjaStanuZerowego, NadpisanieAkcjiBiegu } from './akcjeStanuZerowego';
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
