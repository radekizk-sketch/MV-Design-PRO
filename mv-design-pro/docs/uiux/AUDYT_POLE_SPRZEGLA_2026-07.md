# AUDYT WIELOWARSTWOWY: pole sprzęgła i pola stacji „do ostatniego klika" (2026-07-21)

**Status:** BINDING (dyrektywa właściciela 2026-07-21 „zbadaj dogłębnie wielowarstwowo pole
sprzęgła w powiązaniu z szablonami pól i schematem i wszystkim o czym zapominasz — wymagany
audyt do ostatniego klika end to end"). Kontekst: po G-STK-5 (dwusekcyjna stacja + realne
sprzęgło `bus_coupler`) sprawdzamy, czy pole SPRZĘGŁO jest naprawdę powiązane przez WSZYSTKIE
warstwy, czy zostały luki.

## Trasa pola przez warstwy (SPRZĘGŁO / COUPLER i pozostałe pola stacji)

| Warstwa | Stan | Uwaga |
|---------|------|-------|
| Kreator ui2 (emisja `sn_fields`) | ✅ | `buildStationSnFields` emituje per pole `{field_role, manufacturer_ref, switchgear_family_ref, bay_template_ref}`; `SN_FIELD_ROLE_TO_BAY_KIND[SPRZEGLO]=sprzeglowe_poprzeczne`; `rolePolaStacji('sectional')` zawiera SPRZEGLO. |
| Katalog szablonów pól | ✅ | `BAY_TEMPLATE_COUPLER` (bay_role COUPLER, porty sn_coupler left/right); `BAY_PROTECTION_CODES_BY_ROLE["COUPLER"]=["51","50"]`; `protection_codes_for_bay_role`. |
| **Operacja `insert_station_on_segment_sn`** | ❌ **LUKA** | Pętla pól czyta TYLKO `field_role` + `apparatus_catalog_ref`. **Gubi** `bay_template_ref`, `switchgear_family_ref`, `manufacturer_ref`, `protection_ref` z kreatora i **NIE materializuje** `protection_codes`. G-POLE-R (V12K-058) + kody zabezpieczeń zrobiono dla `add_sn_bay` i częściowo `append`, ale NIE dla GŁÓWNEJ ścieżki tworzenia stacji (świadomy podział). |
| Operacja `append_station_on_endpoint` | ◐ | Propaguje refy producenta (manufacturer/family/template) per pole; materializuje TR protection_codes (twardo), ale nie przez wspólny resolver dla pozostałych ról. |
| Read-model pola (`field_read_model`) | ✅ (czeka na dane) | KONSUMUJE `spec.protection_codes` (l. 318), `spec.bay_template_ref` (l. 319), obsługuje SPRZĘGŁO (`_assign_coupler_sides`, `coupler_fields_count`). Przy pustych polach z insert → puste wiązanie i brak kodów. |
| SLD (rendering) | wątek SLD | `SectionRenderer` jest GPZ-only (PR-5b). Read-model daje COUPLER-boki; rendering DWÓCH sekcji szyny stacji + glifu sprzęgła należy do wątku SLD (karta cross-thread). |

## Znaleziska (dyspozycja)

| ID | Defekt | Dyspozycja |
|----|--------|-----------|
| **PS-1** | `insert_station_on_segment_sn` gubi wiązanie szablonu producenta pól (`bay_template_ref`/`switchgear_family_ref`/`manufacturer_ref`) — dotyczy WSZYSTKICH pól (IN/OUT/TR/**SPRZĘGŁO**/FEEDER). Kreator wybiera szablon, backend go wyrzuca → read-model/SLD bez wiązania (phantom w drugą stronę: wybór UI ignorowany przez backend). | **NAPRAWA** — parytet z `append`/`add_sn_bay`: przenieś refy na field_spec. |
| **PS-2** | `insert_station_on_segment_sn` NIE materializuje `protection_codes` pól (COUPLER→["51","50"], TR→transformatorowe, OZE→NC RfG). Read-model konsumuje `protection_codes`, ale insert daje puste → brak glifów/koordynacji zabezpieczeń pola. | **NAPRAWA** — `_resolve_bay_template_protection_codes(manufacturer, template, bay_role)` per pole (reużycie, zero fabrykacji). |
| **PS-3** | ~~Rendering SLD dwusekcyjnej stacji~~ — **WERYFIKACJA: NIE była luką.** `SectionRenderer` jest GPZ-only, ale STACJA renderuje się przez `MiniBlockRmuRenderer`, który JEST w pełni sekcyjno-świadomy: `deriveFootprintType('sectional')→'mv_lv_sectional'` (l.168) → szyna „cellular" (2 równoległe linie, IEC 60617 segregated busbars, K30-127) + pole sprzęgła jako kolumna „SPR" (`FIELD_ROLE.COUPLER→'SPR'`, l.1544) + `sectionSide`. Napędzane `substation.station_type='sectional'` z G-STK-5. | **BEZ ZMIAN** — potwierdzone 89 testami SLD (miniBlockRmu 70 + footprints 19). Błędna wcześniejsza diagnoza „cross-thread" skorygowana. |
| **PS-4** | `append` materializuje TR protection_codes twardo (nie przez wspólny resolver) — niespójność z insert po naprawie. | ✅ **NAPRAWIONE** — petla pol append liczy `protection_codes` wspólnym `_resolve_bay_template_protection_codes` dla wszystkich rol (LINIA_IN→51/50/51N, TR→87T/…). |

## Weryfikacja SLD „do ostatniego klika" (2026-07-21)
Głęboki rekonesans SLD potwierdził: pełny łańcuch stacji sekcyjnej JUŻ renderuje się poprawnie —
`ENM substation.station_type='sectional'` (G-STK-5) → `deriveFootprintType→mv_lv_sectional` →
`MiniBlockRmuRenderer`: szyna cellular (segregated) + kolumna pola sprzęgła „SPR" + `sectionSide`.
Pole sprzęgła (bay_role COUPLER) trafia do kolumn SLD z read-modelu (`_assign_coupler_sides`).
Testy: 89 SLD (miniBlockRmu + footprints) zielone. **Zero luki rendering** — jedyne realne braki to
PS-1/PS-2 (insert szablon+kody, NAPRAWIONE) i PS-4 (append spójność, NAPRAWIONE).

## Zasada
Kontrolka kreatora (wybór szablonu pola, w tym SPRZĘGŁA) MUSI mapować na realne, konsumowane
pole modelu — inaczej to phantom „w drugą stronę" (UI wybiera, backend ignoruje). Naprawa PS-1/PS-2
domyka pole sprzęgła (i wszystkie pola stacji z podziału) „do ostatniego klika": kreator →
field_spec z szablonem + kodami → read-model → SLD/koordynacja.
