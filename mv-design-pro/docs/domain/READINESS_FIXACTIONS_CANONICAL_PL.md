# Kanoniczny słownik kodów gotowości i akcji naprawczych

> **Status**: BINDING (dokument wiążący)
> **Język**: Polski
> **Data utworzenia**: 2026-02-17
> **Wersja**: 2.0

---

## Cel dokumentu

Niniejszy dokument definiuje **kompletny słownik kodów gotowości** (Readiness Codes) stosowanych w systemie MV-DESIGN-PRO. Każdy kod opisuje konkretny problem uniemożliwiający lub utrudniający przeprowadzenie analizy sieci SN/nN.

Dla każdego kodu zdefiniowano:
- **Obszar** (Area) -- kategoria funkcjonalna
- **Priorytet** (Priority) -- kolejność prezentacji i naprawy (1 = najwyższy)
- **Poziom** (Level) -- BLOCKER / WARNING / INFO
- **Komunikat PL** -- treść wyświetlana użytkownikowi (w języku polskim)
- **Nawigacja naprawcza** (Fix Navigation) -- jedyna, obowiązkowa ścieżka do miejsca naprawy w interfejsie (panel / zakładka / modal / pole); każdy kod, niezależnie od poziomu, musi ją mieć

Ten rejestr nie zna dziś oddzielnego identyfikatora "akcji naprawczej" -- pole `fix_action_id` zostało skasowane (karta FIX-ACTION-KASACJA, `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-338: identyfikator nie miał żadnego wykonawcy w systemie). `fix_navigation` jest jedyną realną ścieżką naprawczą.

Sekcje **"Kompletny słownik kodów gotowości"** i **"Podsumowanie statystyczne"** poniżej są GENEROWANE z rejestru `backend/src/domain/canonical_operations.py::READINESS_CODES` skryptem `scripts/generuj_slownik_kodow_gotowosci.py` -- nie edytuj ich ręcznie, zmiana zostanie nadpisana przy następnym uruchomieniu generatora. Rozjazd dokumentu z rejestrem jest czerwony w CI (`scripts/readiness_dictionary_guard.py`, workflow `python-tests.yml`).

---

## Poziomy walidacji

| Poziom | Znaczenie |
|--------|-----------|
| **BLOCKER** | Blokuje uruchomienie analizy. Musi być naprawiony przed obliczeniami. |
| **WARNING** | Nie blokuje analizy, ale sygnalizuje potencjalny problem. Zalecana naprawa. |
| **INFO** | Informacja kontekstowa. Nie wymaga akcji naprawczej. |

---

## Obszary (Areas)

| Obszar | Opis |
|--------|------|
| SOURCES | Źródła zasilania (GPZ, generatory, źródła nN) |
| TOPOLOGY | Topologia sieci (szyny, magistrale, pierścienie) |
| CATALOGS | Katalogi elementów (typy kabli, transformatorów, aparatów) |
| STATIONS | Stacje SN/nN |
| GENERATORS | Źródła rozproszone (PV, BESS, UPS, agregaty, OZE) |
| PROTECTION | Ochrona (przekładniki, przekaźniki, selektywność) |
| ANALYSIS | Analiza i Study Case |

---

<!-- GENEROWANE: slownik kodow gotowosci — poczatek -->

## Kompletny słownik kodów gotowości

Wszystkie **115** kody z `domain/canonical_operations.py::READINESS_CODES`, posortowane po obszarze, priorytecie i kodzie. Kolumny odpowiadają polom `ReadinessCodeSpec` 1:1 — brak tu żadnej wartości spoza rejestru.

| Kod | Obszar | Priorytet | Poziom | Komunikat PL | Nawigacja naprawcza |
|-----|--------|-----------|--------|--------------|----------------------|
| `nn.source.field_missing` | SOURCES | 1 | BLOCKER | Źródło nN nie jest przypięte do pola źródłowego | panel: `inspector`, tab: `pole`, focus: `field_ref` |
| `nn.source.parameters_missing` | SOURCES | 1 | BLOCKER | Źródło nN nie ma wymaganych parametrów elektrycznych | panel: `inspector`, tab: `parametry`, focus: `rated_power` |
| `nn.source.switch_missing` | SOURCES | 1 | BLOCKER | Pole źródłowe nN nie posiada aparatu łączeniowego | panel: `inspector`, tab: `pole`, focus: `switch_kind` |
| `source.grid_supply_missing` | SOURCES | 1 | BLOCKER | Brak źródła zasilania sieciowego (GPZ) | panel: `wizard`, modal: `add_grid_source` |
| `source.sk3_invalid` | SOURCES | 1 | BLOCKER | Nieprawidłowa moc zwarciowa źródła Sk3 | panel: `inspector`, tab: `parametry`, focus: `sk3_mva` |
| `source.sk_min_inconsistent` | SOURCES | 1 | BLOCKER | Minimalna moc zwarciowa źródła przekracza maksymalną (S''kQmin > S''kQmax albo I''kQmin > I''kQmax) — dane warunków przyłączenia są sprzeczne | panel: `inspector`, tab: `parametry`, focus: `sk3_min_mva` |
| `source.u_set_pu_out_of_range` | SOURCES | 1 | BLOCKER | Napięcie zadane szyny bilansującej źródła leży poza pasmem 0,8–1,2 p.u. — podaj nastawę w p.u. napięcia znamionowego szyny albo ją usuń | panel: `inspector`, tab: `parametry`, focus: `u_set_pu` |
| `source.voltage_invalid` | SOURCES | 1 | BLOCKER | Nieprawidłowe napięcie źródła zasilania | panel: `inspector`, tab: `parametry`, focus: `voltage_kv` |
| `connection.power_flow_missing` | SOURCES | 2 | WARNING | Brak zbieżnego biegu rozpływu — uruchom analizę rozpływu mocy, by ocenić warunki przyłączenia | panel: `analizy`, tab: `rozplyw` |
| `connection.power_limit_missing` | SOURCES | 2 | WARNING | Brak mocy przyłączeniowej z warunków OSD — uzupełnij, by ocenić moc w punkcie przyłączenia | panel: `projekt`, tab: `przylaczenie`, focus: `moc_przylaczeniowa_mw` |
| `source.connection_missing` | SOURCES | 2 | BLOCKER | Źródło zasilania nie jest podłączone do szyny | panel: `inspector`, tab: `polaczenia` |
| `source.multiple_grid_sources_in_island` | SOURCES | 2 | BLOCKER | Dwa lub więcej źródeł sieciowych w jednej wyspie — rozpływ mocy wymaga jednej szyny bilansującej na wyspę (otwórz sprzęgło albo pozostaw jedno źródło sieciowe w wyspie) | panel: `inspector`, tab: `polaczenia` |
| `connection.cos_phi_required_missing` | SOURCES | 3 | WARNING | Brak wymaganego cosφ z warunków OSD — uzupełnij, by ocenić współczynnik mocy w punkcie przyłączenia | panel: `projekt`, tab: `przylaczenie`, focus: `wymagany_cos_phi` |
| `nn.measurement.required_missing` | SOURCES | 3 | WARNING | Źródło nN nie ma przypisanego punktu pomiaru energii | panel: `inspector`, tab: `pomiary`, focus: `measurement_point` |
| `source.sk_min_missing` | SOURCES | 3 | WARNING | Źródło sieciowe nie ma minimalnej mocy zwarciowej S''kQmin — scenariusz MIN liczony z impedancji dla S''kQmax (założenie niekonserwatywne dla czułości zabezpieczeń); wprowadź S''kQmin albo I''kQmin z warunków przyłączenia | panel: `inspector`, tab: `parametry`, focus: `sk3_min_mva` |
| `ring.endpoints_missing` | TOPOLOGY | 2 | BLOCKER | Pierścień nie ma zdefiniowanych punktów końcowych | panel: `sld` |
| `trunk.segment_missing` | TOPOLOGY | 2 | BLOCKER | Magistrala nie ma żadnego segmentu | panel: `sld` |
| `trunk.terminal_missing` | TOPOLOGY | 2 | BLOCKER | Magistrala nie ma terminala końcowego | panel: `sld` |
| `ring.nop_required` | TOPOLOGY | 3 | BLOCKER | Pierścień SN wymaga punktu normalnie otwartego (NOP) | panel: `sld`, modal: `set_normal_open_point` |
| `trunk.segment_length_invalid` | TOPOLOGY | 3 | BLOCKER | Nieprawidłowa długość odcinka (musi być > 0) | panel: `inspector`, tab: `parametry`, focus: `length_m` |
| `trunk.segment_length_missing` | TOPOLOGY | 3 | BLOCKER | Odcinek nie ma zdefiniowanej długości | panel: `inspector`, tab: `parametry`, focus: `length_m` |
| `catalog.binding_invalid` | CATALOGS | 1 | BLOCKER | Wiązanie katalogowe ma niewłaściwą postać albo nie niesie identyfikatora pozycji katalogowej | panel: `inspector`, tab: `katalog`, modal: `MODAL_ZMIEN_TYP_Z_KATALOGU` |
| `catalog.binding_required` | CATALOGS | 1 | BLOCKER | Element techniczny wymaga wiązania z katalogiem | panel: `inspector`, tab: `katalog`, modal: `MODAL_ZMIEN_TYP_Z_KATALOGU` |
| `catalog.binding_version_missing` | CATALOGS | 1 | BLOCKER | Brak wersji katalogu w wiązaniu elementu obliczeniowego | panel: `inspector`, tab: `katalog`, modal: `MODAL_ZMIEN_TYP_Z_KATALOGU` |
| `catalog.clear_forbidden` | CATALOGS | 1 | BLOCKER | Element techniczny nie może istnieć bez przypięcia katalogowego — zamiast czyścić wiązanie wskaż pozycję zastępczą | panel: `inspector`, tab: `katalog`, modal: `CatalogPicker` |
| `catalog.element_missing` | CATALOGS | 1 | BLOCKER | Przypisanie katalogu nie wskazało elementu modelu | panel: `inspector`, tab: `katalog` |
| `catalog.element_not_found` | CATALOGS | 1 | BLOCKER | Element wskazany do przypisania katalogu nie istnieje w modelu | panel: `inspector`, tab: `katalog` |
| `catalog.item_id_missing` | CATALOGS | 1 | BLOCKER | Brak identyfikatora rekordu katalogu w wiązaniu elementu | panel: `inspector`, tab: `katalog`, modal: `CatalogPicker` |
| `catalog.item_missing` | CATALOGS | 1 | BLOCKER | Przypisanie katalogu nie wskazało pozycji katalogowej | panel: `inspector`, tab: `katalog`, modal: `CatalogPicker` |
| `catalog.item_not_found` | CATALOGS | 1 | BLOCKER | Wskazana pozycja katalogowa nie istnieje w katalogu — wskaż pozycję istniejącą albo uzupełnij rekord katalogowy; operacja nie przyjmie tabliczki z formularza | panel: `inspector`, tab: `katalog`, modal: `CatalogPicker` |
| `catalog.namespace_mismatch` | CATALOGS | 1 | BLOCKER | Kategoria katalogu nie pasuje do rodzaju elementu — wskaż pozycję właściwej kategorii | panel: `inspector`, tab: `katalog`, modal: `CatalogPicker` |
| `catalog.namespace_missing` | CATALOGS | 1 | BLOCKER | Brak kategorii katalogu w wiązaniu elementu | panel: `inspector`, tab: `katalog`, modal: `CatalogPicker` |
| `catalog.namespace_required` | CATALOGS | 1 | BLOCKER | Nie da się ustalić kategorii katalogu dla elementu — bez kategorii nie ma czego sprawdzić w katalogu, więc element nie może deklarować pochodzenia katalogowego | panel: `inspector`, tab: `katalog`, modal: `CatalogPicker` |
| `catalog.ref_missing` | CATALOGS | 1 | BLOCKER | Element nie ma wskazanej referencji katalogowej | panel: `inspector`, tab: `katalog`, modal: `CatalogPicker` |
| `catalog.ref_required` | CATALOGS | 1 | BLOCKER | Segment lub transformator wymaga referencji katalogowej przed utworzeniem | panel: `inspector`, tab: `katalog`, modal: `CatalogPicker` |
| `catalog.unknown_namespace` | CATALOGS | 1 | BLOCKER | Nieznana kategoria katalogu — brama nie dobiera kategorii za projektanta; wskaż kategorię, która istnieje w katalogu | panel: `inspector`, tab: `katalog`, modal: `CatalogPicker` |
| `import.catalog_mapping_required` | CATALOGS | 1 | BLOCKER | Import wymaga mapowania katalogowego: elementy bez przypisanego katalogu muszą zostać zmapowane przed dalszą edycją | panel: `catalog_mapper`, modal: `IMPORT_CATALOG_MAPPING` |
| `nn.source.catalog_missing` | CATALOGS | 1 | BLOCKER | Źródło nN nie ma przypisanego katalogu urządzenia | panel: `inspector`, tab: `katalog`, modal: `MODAL_ZMIEN_TYP_Z_KATALOGU` |
| `catalog.binding_missing` | CATALOGS | 2 | BLOCKER | Element obliczeniowy nie ma przypisanego katalogu | panel: `inspector`, tab: `katalog`, modal: `MODAL_ZMIEN_TYP_Z_KATALOGU` |
| `catalog.gate_result_mismatch` | CATALOGS | 2 | BLOCKER | Model zapisałby dla wskazanej pozycji katalogowej inne wartości niż zmaterializowane przez bramę katalogową — operacja odrzucona, model bez zmian | panel: `inspector`, tab: `katalog` |
| `catalog.materialization_failed` | CATALOGS | 2 | BLOCKER | Materializacja parametrów z katalogu nie powiodła się | panel: `inspector`, tab: `katalog` |
| `catalog.materialization_incomplete` | CATALOGS | 2 | BLOCKER | Materializacja katalogu nie dała wszystkich parametrów wymaganych przez solver — uzupełnij rekord katalogowy albo wskaż pozycję kompletną | panel: `inspector`, tab: `katalog` |
| `catalog.materialization_required` | CATALOGS | 2 | BLOCKER | Wiązanie wyłącza materializację, a element techniczny musi brać parametry z katalogu | panel: `inspector`, tab: `katalog` |
| `catalog.nameplate_mismatch` | CATALOGS | 2 | BLOCKER | Dane tabliczki z formularza przeczą pozycji katalogowej — liczby pochodzą z katalogu, więc wybierz pozycję o właściwych parametrach | panel: `inspector`, tab: `katalog`, modal: `CatalogPicker` |
| `conductor.fault_current_missing` | CATALOGS | 2 | WARNING | Brak prądu cieplnego z biegu SC — uruchom analizę zwarciową, by sprawdzić wytrzymałość zwarciową przekroju | panel: `analizy`, tab: `zwarciowa` |
| `conductor.thermal_data_missing` | CATALOGS | 2 | WARNING | Brak wytrzymałości cieplnej przewodu w katalogu (Ith/Jth dla 1 s) — uzupełnij pozycję katalogową | panel: `katalog`, tab: `kable`, focus: `ith_1s_a` |
| `ct.rated_burden_missing` | CATALOGS | 2 | WARNING | Brak mocy znamionowej przekładnika prądowego w katalogu — uzupełnij pozycję katalogową | panel: `katalog`, tab: `ct`, focus: `burden_va` |
| `protection.curve_library_ref_broken` | CATALOGS | 2 | WARNING | Powiązanie pozycji katalogowej z biblioteką charakterystyk wskazuje wpis, którego w bibliotece nie ma — dane katalogu wymagają poprawy | panel: `katalog`, tab: `zabezpieczenia` |
| `transformer.vector_group_missing` | CATALOGS | 2 | BLOCKER | Grupa połączeń transformatora nieznana — analizy doziemne/niesymetryczne (składowa zerowa) nie mogą wyznaczyć układu bez tej danej | panel: `katalog`, tab: `transformatory`, focus: `vector_group` |
| `vt.rated_burden_missing` | CATALOGS | 2 | WARNING | Brak mocy znamionowej uzwojenia przekładnika napięciowego w katalogu — uzupełnij pozycję katalogową | panel: `katalog`, tab: `vt`, focus: `burden_va` |
| `cable.insulation_data_missing` | CATALOGS | 3 | WARNING | Brak typu izolacji lub temperatury znamionowej kabla w katalogu — bez nich nie da się ocenić starzenia izolacji | panel: `katalog`, tab: `kable`, focus: `insulation_type` |
| `cable.operating_temperature_missing` | CATALOGS | 3 | WARNING | Brak temperatury pracy żyły — podaj ją, by ocenić względne starzenie izolacji | panel: `inspector`, tab: `parametry`, focus: `temperatura_pracy_c` |
| `ct.accuracy_limit_missing` | CATALOGS | 3 | WARNING | Klasa przekładnika prądowego nie niesie współczynnika granicznego (rdzeń pomiarowy albo klasa nierozpoznana) — kryterium nasycenia nie ma zastosowania | panel: `katalog`, tab: `ct`, focus: `accuracy_class` |
| `ct.winding_resistance_missing` | CATALOGS | 3 | WARNING | Brak rezystancji uzwojenia wtórnego przekładnika — współczynnik graniczny policzono wariantem uproszczonym (wynik optymistyczny) | panel: `katalog`, tab: `ct`, focus: `rct_ohm` |
| `load.catalog_missing` | CATALOGS | 3 | WARNING | Obciążenie nie ma przypisanego katalogu | panel: `inspector`, tab: `katalog`, modal: `MODAL_ZMIEN_TYP_Z_KATALOGU` |
| `load.power_zero` | CATALOGS | 3 | WARNING | Moc czynna obciążenia wynosi 0 kW | panel: `inspector`, tab: `parametry`, focus: `p_kw` |
| `nn.cable_catalog_missing` | CATALOGS | 3 | WARNING | Kabel nN nie ma przypisanego katalogu | panel: `inspector`, tab: `katalog`, modal: `MODAL_ZMIEN_TYP_Z_KATALOGU` |
| `nn.switch.catalog_ref_missing` | CATALOGS | 3 | WARNING | Aparat łączeniowy pola nN nie ma przypisanego katalogu | panel: `inspector`, tab: `katalog`, modal: `MODAL_ZMIEN_TYP_Z_KATALOGU` |
| `protection.curve_library_missing` | CATALOGS | 3 | WARNING | Ta pozycja katalogowa zabezpieczenia nie ma odpowiednika w bibliotece charakterystyk czasowo-prądowych — koordynacja wymaga wyrobu z biblioteki | panel: `katalog`, tab: `zabezpieczenia` |
| `transformer.catalog_missing` | CATALOGS | 3 | BLOCKER | Transformator nie ma przypisanego katalogu | panel: `inspector`, tab: `katalog`, modal: `select_catalog` |
| `transformer.loading_factor_missing` | CATALOGS | 3 | WARNING | Brak współczynnika obciążenia transformatora — bez niego nie da się policzyć strat w punkcie pracy | panel: `inspector`, tab: `parametry`, focus: `beta` |
| `transformer.loss_data_missing` | CATALOGS | 3 | WARNING | Brak strat jałowych lub obciążeniowych transformatora w katalogu — uzupełnij pozycję katalogową | panel: `katalog`, tab: `transformatory`, focus: `p0_kw` |
| `trunk.catalog_missing` | CATALOGS | 3 | BLOCKER | Odcinek SN nie ma przypisanego katalogu | panel: `inspector`, tab: `katalog`, modal: `select_catalog` |
| `vt.winding_category_missing` | CATALOGS | 3 | WARNING | Nierozpoznana klasa uzwojenia przekładnika napięciowego — bez kategorii (pomiarowe/zabezpieczeniowe) nie ma limitu zmiany napięcia | panel: `katalog`, tab: `vt`, focus: `accuracy_class` |
| `transformer.no_load_params_missing` | CATALOGS | 4 | WARNING | Brak prądu jałowego (I0) lub strat jałowych (P0) transformatora — gałąź magnesująca nie jest uwzględniona w rozpływie mocy | panel: `katalog`, tab: `transformatory`, focus: `i0_percent` |
| `nn.voltage_missing` | STATIONS | 1 | BLOCKER | Napięcie szyny nN nie jest określone | panel: `inspector`, tab: `parametry`, focus: `voltage_nn_kv` |
| `nn.bus_missing` | STATIONS | 2 | BLOCKER | Stacja wymaga szyny nN | panel: `inspector`, tab: `nn` |
| `station.type_invalid` | STATIONS | 2 | BLOCKER | Nieprawidłowy typ stacji | panel: `inspector`, tab: `parametry` |
| `station.voltage_missing` | STATIONS | 2 | BLOCKER | Stacja nie ma zdefiniowanego napięcia | panel: `inspector`, tab: `parametry`, focus: `voltage_kv` |
| `transformer.connection_missing` | STATIONS | 2 | BLOCKER | Transformator nie ma zdefiniowanego połączenia | panel: `inspector`, tab: `polaczenia` |
| `apparatus.nn_catalog_missing` | STATIONS | 3 | BLOCKER | Aparat nN nie ma przypisanego katalogu | panel: `inspector`, tab: `katalog`, modal: `MODAL_ZMIEN_TYP_Z_KATALOGU` |
| `apparatus.sn_catalog_missing` | STATIONS | 3 | BLOCKER | Aparat SN nie ma przypisanego katalogu | panel: `inspector`, tab: `katalog`, modal: `MODAL_ZMIEN_TYP_Z_KATALOGU` |
| `earthing.electrode_data_missing` | STATIONS | 3 | WARNING | Brak danych uziomu (Z_E, r) — uzupełnij, by policzyć napięcia dotykowe/krokowe | panel: `inspector`, tab: `uziemienie`, focus: `earth_electrode` |
| `nn.main_breaker_missing` | STATIONS | 3 | BLOCKER | Szyna nN wymaga wyłącznika głównego | panel: `inspector`, tab: `nn` |
| `station.required_field_missing` | STATIONS | 3 | BLOCKER | Stacja nie ma wymaganego pola SN | panel: `inspector`, tab: `pola` |
| `transformer.bay_missing` | STATIONS | 3 | WARNING | Transformator jest połączony elektrycznie z szyną SN, lecz nie posiada kompletnej konfiguracji pola transformatorowego po stronie SN | panel: `inspector`, tab: `pola` |
| `station.nn_outgoing_min_1` | STATIONS | 4 | WARNING | Stacja powinna mieć co najmniej 1 odpływ nN | panel: `inspector`, tab: `nn`, modal: `add_nn_outgoing` |
| `oze.bess_no_transformer` | GENERATORS | 1 | BLOCKER | Źródło BESS nie ma transformatora w ścieżce zasilania (zakaz przyłączenia do SN bez transformatora) | panel: `inspector`, tab: `transformator`, modal: `MODAL_WSTAW_STACJE_SN_NN_WARIANT_2` |
| `oze.nn_bus_required` | GENERATORS | 1 | BLOCKER | Źródło OZE wymaga szyny nN w stacji | panel: `inspector`, tab: `nn` |
| `oze.pv_no_transformer` | GENERATORS | 1 | BLOCKER | Źródło PV nie ma transformatora w ścieżce zasilania (zakaz przyłączenia do SN bez transformatora) | panel: `inspector`, tab: `transformator`, modal: `MODAL_WSTAW_STACJE_SN_NN_WARIANT_2` |
| `oze.transformer_required` | GENERATORS | 1 | BLOCKER | Źródło OZE wymaga transformatora w ścieżce zasilania | panel: `inspector`, tab: `transformator` |
| `bess.energy_module_missing` | GENERATORS | 2 | BLOCKER | Falownik BESS nie ma przypisanego modułu magazynu energii | panel: `inspector`, tab: `katalog`, modal: `MODAL_ZMIEN_TYP_Z_KATALOGU` |
| `bess.soc_limits_invalid` | GENERATORS | 2 | BLOCKER | Ograniczenia SOC magazynu BESS są nieprawidłowe (min >= max albo poza zakresem 0-100%) | panel: `inspector`, tab: `parametry`, focus: `soc_min_percent` |
| `der.dynamic_profile_missing` | GENERATORS | 2 | BLOCKER | Rodzaj źródła DER nie ma mapowania na profil dynamiczny — stabilność RMS i FRT/LVRT/HVRT nie mogą zbudować modelu tego generatora | panel: `inspector`, tab: `parametry`, focus: `gen_type` |
| `der.inverter_certificate_unlinked` | GENERATORS | 2 | WARNING | Przetwornica źródła DER nie ma powiązanego certyfikatu PTPiREE — wniosek do OSD może zostać odrzucony. Ostateczna akceptacja przyłączeniowa pozostaje po stronie właściwego OSD | panel: `inspector`, tab: `katalog` |
| `generator.q_missing` | GENERATORS | 2 | BLOCKER | Moc bierna generatora (Q) nie jest znana ani wyprowadzalna z karty katalogowej — rozpływ mocy nie może przyjąć jej za zero | panel: `inspector`, tab: `parametry`, focus: `q_mvar` |
| `generator.voltage_control_not_permitted` | GENERATORS | 2 | BLOCKER | Profil NC RfG operatora nie dopuszcza trybu regulacji napięcia (voltage_control) — zmień tryb regulacji albo profil operatora | panel: `inspector`, tab: `parametry`, focus: `control_mode` |
| `generator.voltage_control_profile_missing` | GENERATORS | 2 | BLOCKER | Generator w trybie regulacji napięcia nie ma profilu NC RfG operatora (albo wskazany profil nie istnieje w katalogu) — tryb wymaga profilu dopuszczającego regulację napięcia | panel: `inspector`, tab: `parametry`, focus: `nc_rfg_profile_ref` |
| `generator.voltage_setpoint_missing` | GENERATORS | 2 | BLOCKER | Generator w trybie regulacji napięcia nie ma kompletnej nastawy — wymagana nastawa napięcia u_set_pu w paśmie [0,9; 1,1] pu oraz granice mocy biernej q_min_mvar < q_max_mvar | panel: `inspector`, tab: `parametry`, focus: `u_set_pu` |
| `inverter.k_sc_missing` | GENERATORS | 2 | BLOCKER | Konwerter (PV/BESS/wiatrowy) nie ma żadnej referencji katalogowej — zwarcia nie mogą zweryfikować tabliczki znamionowej źródła | panel: `inspector`, tab: `katalog` |
| `oze.card_field_not_accepted` | GENERATORS | 2 | BLOCKER | Pole karty falownika ma wartość oszacowaną lub domyślną i wymaga świadomej akceptacji inżyniera przed dołączeniem do pakietu OSD | panel: `inspector`, tab: `karta_falownika` |
| `pv.control_mode_missing` | GENERATORS | 2 | BLOCKER | Falownik PV nie ma określonego trybu regulacji | panel: `inspector`, tab: `regulacja`, focus: `control_mode` |
| `ups.backup_time_invalid` | GENERATORS | 2 | BLOCKER | Czas podtrzymania UPS jest nieprawidłowy (musi być > 0) | panel: `inspector`, tab: `parametry`, focus: `backup_time_min` |
| `der.inverter_certificate_conditional` | GENERATORS | 3 | WARNING | Certyfikat PTPiREE przetwornicy DER jest powiązany warunkowo — rekord wykazu niesie notę o warunkach, którą trzeba potwierdzić przed warunkami przyłączenia | panel: `inspector`, tab: `katalog` |
| `der.dynamic_profile_default` | GENERATORS | 4 | WARNING | Profil dynamiczny źródła DER pochodzi z wartości domyślnej katalogu (nie z jawnego wskazania) — sprawdź, czy pasuje do rzeczywistego urządzenia | panel: `inspector`, tab: `katalog` |
| `genset.fuel_type_missing` | GENERATORS | 4 | INFO | Agregat nie ma określonego rodzaju paliwa | panel: `inspector`, tab: `parametry`, focus: `fuel_type` |
| `inverter.k_sc_assumed` | GENERATORS | 4 | WARNING | Udział zwarciowy falownika (k_sc) nie jest podany w karcie katalogowej konwertera — przyjęto wartość domyślną IEC 60909 (1,1) zamiast zmierzonej | panel: `inspector`, tab: `katalog` |
| `conductor.fault_duration_missing` | PROTECTION | 2 | WARNING | Brak czasu wyłączenia zabezpieczenia — bez niego nie da się sprawdzić, czy przekrój wytrzyma zwarcie | panel: `analizy`, tab: `zabezpieczenia` |
| `ct.secondary_circuit_missing` | PROTECTION | 2 | WARNING | Brak danych obwodu wtórnego przekładnika prądowego (długość, przekrój) — uzupełnij, by policzyć bilans mocy wtórnej | panel: `wizard`, tab: `pomiary`, focus: `ct_obwod_wtorny` |
| `vt.secondary_circuit_missing` | PROTECTION | 2 | WARNING | Brak danych obwodu wtórnego przekładnika napięciowego (długość, przekrój) — uzupełnij, by policzyć zmianę napięcia obwodu | panel: `wizard`, tab: `pomiary`, focus: `vt_obwod_wtorny` |
| `ct.required_alf_missing` | PROTECTION | 3 | WARNING | Brak wymaganego współczynnika granicznego z funkcji zabezpieczeniowych pola — bez niego kryterium nasycenia nie ma odniesienia | panel: `analizy`, tab: `zabezpieczenia` |
| `protection.ct_required` | PROTECTION | 3 | BLOCKER | Przekaźnik wymaga przekładnika prądowego (CT) | panel: `inspector`, tab: `zabezpieczenia` |
| `protection.fault_current_missing` | PROTECTION | 3 | WARNING | Brak prądu zwarciowego z biegu SC — uruchom analizę zwarciową, by wyznaczyć nastawy bezzwłoczne I>> (50/50N) i ziemnozwarciowe (51N) | panel: `analizy`, tab: `zwarciowa` |
| `protection.nominal_current_missing` | PROTECTION | 3 | WARNING | Brak prądu znamionowego pola — uzupełnij, by wyznaczyć nastawę rozruchową I> (51) | panel: `inspector`, tab: `parametry`, focus: `in_a` |
| `protection.vt_required` | PROTECTION | 3 | BLOCKER | Pole wymaga przekładnika napięciowego (VT) | panel: `inspector`, tab: `zabezpieczenia` |
| `protection.settings_incomplete` | PROTECTION | 4 | WARNING | Nastawy przekaźnika niekompletne | panel: `inspector`, tab: `nastawy` |
| `analysis.blocked_by_readiness` | ANALYSIS | 1 | BLOCKER | Analiza zablokowana przez niezaspokojone wymagania gotowości | panel: `readiness` |
| `study_case.missing_base_snapshot` | ANALYSIS | 1 | BLOCKER | Przypadek obliczeniowy nie ma bazowego zrzutu stanu | panel: `case_manager` |
| `fault.location_on_branch_requires_assembler` | ANALYSIS | 2 | BLOCKER | Zwarcie w punkcie na gałęzi wymaga rozdzielenia modelu w miejscu zwarcia (adapter obliczeniowy) — nieobsługiwane; wybierz lokalizację na węźle | panel: `analizy`, tab: `zwarciowa` |
| `oltc.deadband_missing` | ANALYSIS | 2 | WARNING | Przełącznik zaczepów nie ma pasma nieczułości regulatora — bez niego nie wiadomo, jaka odchyłka napięcia jest jeszcze dopuszczalna | panel: `inspector`, tab: `regulacja`, focus: `deadband_kv` |
| `oltc.target_voltage_missing` | ANALYSIS | 2 | WARNING | Badanie doboru zaczepów nie ma napięcia docelowego — podaj napięcie, które ma być utrzymywane na szynie regulowanej | panel: `analizy`, tab: `oltc`, focus: `napiecie_cel` |
| `verdict.input_data_missing` | ANALYSIS | 2 | WARNING | Brak danych wejściowych kryterium — uzupełnij dane wskazane w pozycji werdyktu | panel: `gotowosc` |
| `verdict.run_failed` | ANALYSIS | 2 | WARNING | Bieg zakończył się błędem — kryterium nie ma na czym się oprzeć | panel: `analizy` |
| `verdict.run_missing` | ANALYSIS | 2 | WARNING | Brak zakończonego biegu wymaganego przez kryterium — uruchom obliczenia, by je ocenić | panel: `analizy` |
| `verdict.run_stale` | ANALYSIS | 2 | WARNING | Model zmienił się po biegu — wynik nie opisuje bieżącego modelu; uruchom obliczenia ponownie | panel: `analizy` |

## Podsumowanie statystyczne

| Poziom | Liczba kodów |
|--------|---------------|
| BLOCKER | 71 |
| WARNING | 43 |
| INFO | 1 |
| **Razem** | **115** |

| Obszar | Liczba kodów |
|--------|---------------|
| SOURCES | 15 |
| TOPOLOGY | 6 |
| CATALOGS | 44 |
| STATIONS | 12 |
| GENERATORS | 20 |
| PROTECTION | 9 |
| ANALYSIS | 9 |
| **Razem** | **115** |

<!-- GENEROWANE: slownik kodow gotowosci — koniec -->

---

## Zasady stosowania

### Kolejność prezentacji

Kody gotowości są prezentowane użytkownikowi według:
1. **Poziom** -- BLOCKER przed WARNING przed INFO
2. **Priorytet** -- niższy numer = wyższy priorytet (1 jest najważniejszy)
3. **Obszar** -- alfabetycznie w ramach tego samego priorytetu

### Nawigacja naprawcza (Fix Navigation)

- Każdy kod, niezależnie od poziomu (BLOCKER/WARNING/INFO), ma niepusty `fix_navigation` -- jest to JEDYNA ścieżka naprawcza w rejestrze
- Nawigacja otwiera odpowiedni panel / zakładkę / modal w interfejsie użytkownika
- Pole `focus` (jeśli zdefiniowane) wskazuje konkretne pole formularza do uzupełnienia
- Wartość `panel` pochodzi z zamkniętego, mierzonego zbioru pilnowanego przez `scripts/readiness_codes_guard.py::ZNANE_PANELE` -- nowa wartość panelu jest świadomą zmianą kontraktu nawigacji, nie literówką

### Blokada analizy

- Obecność **jakiegokolwiek** kodu BLOCKER uniemożliwia uruchomienie analizy
- Kod `analysis.blocked_by_readiness` jest kodem nadrzędnym -- pojawia się automatycznie, gdy istnieją inne BLOCKERy
- Kody WARNING nie blokują analizy, ale są raportowane w wynikach

### Integracja z interfejsem

Schemat nawigacji (`Fix Navigation`) używa następującego formatu -- tylko klucze faktycznie obecne w danym kodzie są wypełnione, pozostałe są po prostu pominięte (nie ma wartości `null`):

```
panel: <nazwa_panelu>, tab: <nazwa_zakladki>, modal: <nazwa_modalu>, focus: <nazwa_pola>
```

Gdzie:
- `panel` -- główny panel interfejsu (patrz zamknięty zbiór `ZNANE_PANELE` wyżej)
- `tab` -- zakładka wewnątrz panelu (opcjonalna)
- `modal` -- okno modalne do otwarcia (opcjonalne)
- `focus` -- pole formularza do podświetlenia (opcjonalne)

---

## Historia zmian

| Data | Wersja | Opis |
|------|--------|------|
| 2026-02-17 | 1.0 | Utworzenie dokumentu -- kompletny słownik 35 kodów gotowości |
| 2026-09-09 | 1.1 | CV-4.3 K7 (karta K7-DOCS/PERYFERIA): dodano `source.sk_min_missing` (WARNING) i `source.sk_min_inconsistent` (BLOCKER) -- scenariusz MIN danych zwarciowych źródła sieciowego (IEC 60909-0:2016 §6.2.1 eq. 6 z c_min). Ten wpis NIE zamykał pełnej zgodności dokumentu z `domain/canonical_operations.py::READINESS_CODES` (rejestr miał wtedy więcej pozycji niż ten słownik -- rekoncyliacja całości była wtedy nazwana jako odrębne zadanie). |
| 2026-09-09 | 2.0 | Karta READINESS-DOC (naprawa KLASY, nie instancji dryfu z wersji 1.1): sekcje "Kompletny słownik kodów gotowości" i "Podsumowanie statystyczne" są odtąd GENEROWANE z rejestru skryptem `scripts/generuj_slownik_kodow_gotowosci.py` i pilnowane w CI przez `scripts/readiness_dictionary_guard.py` (workflow `python-tests.yml`, ten sam krok co `readiness_codes_guard.py`) -- rozjazd dokumentu z rejestrem jest teraz czerwony, nie cichy. Usunięto pojęcie "Fix Action ID" / "akcja naprawcza (lub null)" (skasowane kartą FIX-ACTION-KASACJA -- nie miało żadnego wykonawcy w systemie); `fix_navigation` jest jedyną, obowiązkową ścieżką naprawczą dla KAŻDEGO kodu. Dokument doprowadzony do stanu rejestru: 114 kodów, wszystkie 7 wartości `ReadinessArea` reprezentowane. Naprawiono przy okazji defekt rejestru wykryty tą kartą: 12 komunikatów `message_pl` bloku "Źródła nN" (karta F-K6, V12K-206) było zapisanych bez polskich znaków diakrytycznych -- poprawione w `domain/canonical_operations.py`, przypięte testem `backend/tests/domain/test_rejestr_kodow_komunikaty_pl.py`. |
| 2026-09-09 | 2.1 | CV-4.3 K7 (odbiór kart, ta sama sesja): rejestr +1 kod `source.u_set_pu_out_of_range` (BLOCKER, napięcie zadane szyny bilansującej `Source.u_set_pu` poza pasmem 0,8–1,2 p.u.; emiter walidator ENM `sources.u_set_pu_out_of_range`) -- sekcje generowane przeliczone generatorem: 115 kodów. |
