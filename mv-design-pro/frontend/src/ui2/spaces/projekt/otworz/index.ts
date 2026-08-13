/*
 * Publiczne API ekranu „Nowy / otwórz projekt" (W-102, karta E2.2). Wpięcie
 * do AppRoot/AppShell (renderowanie w warsztacie, przekazanie realnych
 * projektów/callbacków) = karta zarządcy — tu wyłącznie eksport komponentów,
 * adaptera-szkieletu i tekstów.
 */

export { OtworzProjekt, type OtworzProjektProps } from './OtworzProjekt';
export { OtworzProjektKontener } from './OtworzProjektKontener';
export { CelProjektu, type CelProjektuId, type CelProjektuProps } from './CelProjektu';
export { ListaProjektow, type ListaProjektowProps } from './ListaProjektow';

export {
  mapujProjekty,
  type ProjektWiersz,
} from './adapters/projektyAdapter';

export { OTWORZ_STRINGS, PRZYKLADY, type PrzykladDane } from './strings';
