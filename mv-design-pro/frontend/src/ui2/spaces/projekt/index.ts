/*
 * Publiczne API przestrzeni „Projekt" (pulpit W-101, karta E2.1). Wpięcie do
 * AppRoot/AppShell (renderowanie w warsztacie) = karta zarządcy — tu wyłącznie
 * eksport komponentów, adaptera read-only i tekstów.
 */

export { PulpitProjektu, type PulpitProjektuProps } from './PulpitProjektu';
export { OtworzProjektKontener } from './otworz/OtworzProjektKontener';
export { EkranArchiwum, type EkranArchiwumProps } from './archiwum';
export { EkranImportuArkusza, type EkranImportuArkuszaProps } from './arkusz';
export { KafelModelu } from './KafelModelu';
export { KafelGotowosci } from './KafelGotowosci';
export { KafelOstatniegoPrzebiegu } from './KafelOstatniegoPrzebiegu';
export { KafelSpojnosci } from './KafelSpojnosci';
// `KafelWkrotce` USUNIĘTY (karta PULPIT-NBA §0.4 — zakaz zaślepek).
export { KafelArchiwum } from './KafelArchiwum';
export { KafelArkusza } from './KafelArkusza';
export { ListaPrzypadkow } from './ListaPrzypadkow';
export { Kafel, KafelWiersz, Tag, type WariantTagu } from './Kafel';

export {
  usePulpitStan,
  useModelKafel,
  useGotowoscKafel,
  useOstatniPrzebiegKafel,
  useSpojnoscKafel,
  usePrzypadkiWiersze,
  mapujModel,
  mapujGotowosc,
  mapujOstatniPrzebieg,
  mapujSpojnosc,
  mapujPrzypadki,
  type StanPulpitu,
  type ModelKafel,
  type GotowoscKafel,
  type OstatniPrzebiegKafel,
  type SpojnoscKafel,
  type AktualnoscWynikow,
  type PrzypadekWiersz,
} from './pulpitAdapter';

export {
  PULPIT_STRINGS,
  STATUS_WYNIKOW_LABEL,
  rewizjaModeluLabel,
  odciskKrotki,
  formatCzasPrzebiegu,
} from './strings';
