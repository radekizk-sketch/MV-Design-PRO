/*
 * Publiczne API przestrzeni „Projekt" (pulpit W-101, karta E2.1). Wpięcie do
 * AppRoot/AppShell (renderowanie w warsztacie) = karta zarządcy — tu wyłącznie
 * eksport komponentów, adaptera read-only i tekstów.
 */

export { PulpitProjektu, type PulpitProjektuProps } from './PulpitProjektu';
export { OtworzProjektKontener } from './otworz/OtworzProjektKontener';
export { EkranArchiwum, type EkranArchiwumProps } from './archiwum';
export { KafelModelu } from './KafelModelu';
export { KafelGotowosci } from './KafelGotowosci';
export { KafelOstatniegoPrzebiegu } from './KafelOstatniegoPrzebiegu';
export { KafelSpojnosci } from './KafelSpojnosci';
export { KafelWkrotce } from './KafelWkrotce';
export { KafelArchiwum } from './KafelArchiwum';
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
