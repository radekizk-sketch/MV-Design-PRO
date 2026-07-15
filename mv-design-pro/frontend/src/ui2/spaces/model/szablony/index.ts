/*
 * Publiczne API przeglądarki szablonów stacji (W-203, karta E3.1). Wpięcie do
 * przestrzeni „Model sieci" (renderowanie w warsztacie, kreator stacji) =
 * karta zarządcy/integracyjna — tu wyłącznie eksport komponentu, modułów
 * pomocniczych i tekstów.
 */

export { PrzegladarkaSzablonow, type PrzegladarkaSzablonowProps } from './PrzegladarkaSzablonow';
export { KafelSzablonu, type KafelSzablonuProps } from './KafelSzablonu';
export { SzczegolySzablonu, type SzczegolySzablonuProps } from './SzczegolySzablonu';
export {
  PorownanieSzablonow,
  zbudujWierszePorownania,
  type PorownanieSzablonowProps,
  type WierszPorownania,
} from './PorownanieSzablonow';
export {
  FiltrySzablonow,
  FILTRY_PUSTE,
  filtrujSzablony,
  filtryAktywne,
  liczbaPolSN,
  pasujeFraza,
  pasujeLiczbaPol,
  type FiltrySzablonowProps,
  type FiltrySzablonowStan,
} from './FiltrySzablonow';
export {
  KOLEJNOSC_ROL,
  ROLA_LABEL,
  kategorieRoli,
  rolaDlaKategorii,
  zbudujDrzewkoRol,
  type RolaId,
  type WezelKategorii,
  type WezelRoli,
} from './GrupyRol';
export { SZABLONY_STRINGS } from './strings';
export {
  pobierzKategorieSzablonow,
  pobierzSzablon,
  pobierzSzablony,
  type BayRoleSpec,
  type CatalogChoice,
  type CategoriesResponse,
  type CategoryEntry,
  type DerKindSpec,
  type ListResponse,
  type ProtectionRelaySpec,
  type StationTemplateFull,
  type StationTemplateSummary,
  type TemplateParamFloat,
  type TemplateParamInt,
  type TemplateSchema,
} from './api/szablonyClient';
