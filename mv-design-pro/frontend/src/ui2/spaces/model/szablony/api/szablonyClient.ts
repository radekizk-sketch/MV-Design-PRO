/*
 * Cienki klient biblioteki szablonów stacji (przeglądarka E3.1, W-203).
 * Owija ISTNIEJĄCY klient `ui/network-build/station-templates/api.ts` (K30-16/
 * K30-20/K30-27) — zero drugiej implementacji `fetch`, zero nowych typów:
 * kształt danych 1:1 z odpowiedzi backendu (`backend/src/api/station_templates.py`,
 * zweryfikowane wprost w kodzie: `list_station_templates` — station_templates.py:187-207,
 * `list_categories` — station_templates.py:210-226, `get_station_template` —
 * station_templates.py:229-235; pola typów z `application/station_templates/schema.py`
 * `_schema_to_dict`/`to_dict`, schema.py:171-268).
 *
 * Ta karta korzysta WYŁĄCZNIE z endpointów odczytu (lista/kategorie/szczegół).
 * Zastosowanie szablonu (`POST /{id}/apply`) pozostaje poza zakresem — karta §3:
 * „sama aplikacja szablonu = istniejący endpoint apply, wywołanie w karcie
 * integracyjnej" — dlatego `applyStationTemplate`/`previewStationTemplate` NIE
 * są tu reeksportowane; przeglądarka wystawia wyłącznie callback `onZastosuj`.
 */

export {
  fetchStationTemplateCategories as pobierzKategorieSzablonow,
  fetchStationTemplate as pobierzSzablon,
  fetchStationTemplates as pobierzSzablony,
} from '../../../../../ui/network-build/station-templates/api';

export type {
  BayRoleSpec,
  CatalogChoice,
  CategoriesResponse,
  CategoryEntry,
  DerKindSpec,
  ListResponse,
  ProtectionRelaySpec,
  StationTemplateFull,
  StationTemplateSummary,
  TemplateParamFloat,
  TemplateParamInt,
  TemplateSchema,
} from '../../../../../ui/network-build/station-templates/api';
