/*
 * Publiczny interfejs klienta zgodności NC RfG / PTPiREE na kontrakcie V2 (karta AB-1a
 * Pakiet D2): typy 1:1 z backendem, jeden klient HTTP, formularz biegu „co-jeśli", reguła
 * operatora i wspólne komponenty prezentacji rekordów.
 */

export * from './typy';
export * from './api';
export * from './formularz';
export * from './operator';
export * from './daneModulu';
export { SekcjaDanychModulu, type SekcjaDanychModuluProps } from './SekcjaDanychModulu';
export { WyborOperatora, type WyborOperatoraProps } from './WyborOperatora';
export {
  BrakiDokumentu,
  DowodCertyfikatuOpis,
  ListaRekordowWymagan,
  NaglowekModuluNcRfg,
  OpisDokumentuWarstwy,
  OpisKlasyfikacji,
  OpisPodstawy,
  SekcjaModuluDokumentu,
} from './komponenty';
export {
  DANE_MODULU_STRINGS,
  ETYKIETY_FLAG_DEKLARACJI,
  NCRFG_STRINGS,
  liczbaPl,
  nazwaTechnologii,
  opisZrodlaDanych,
} from './strings';
export {
  BRAK_MOCY_PL,
  BRAK_NAPIECIA_PL,
  kluczKlasyfikacji,
  krotkiOpisKlasyfikacji,
  useKlasyfikacjeModulow,
  type StanKlasyfikacji,
  type ZapytanieKlasyfikacji,
} from './klasyfikacja';
