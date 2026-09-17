# SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW

Status: wiazacy dla aktywnego kodu.

Kod:
- `backend/src/network_model/catalog/types.py`
- `backend/src/network_model/catalog/materialization.py`
- `backend/src/network_model/catalog/repository.py`
- `backend/src/network_model/catalog/governance.py`
- `backend/src/application/catalog_governance/service.py`
- `backend/src/api/catalog.py`
- `backend/src/api/domain_ops_policy.py`
- `backend/src/enm/domain_operations.py`
- `backend/src/enm/domain_operations_v2.py`

Kontrakt katalogowy:
- kanoniczny binding to `CatalogBinding(catalog_namespace, catalog_item_id, catalog_item_version, materialize, snapshot_mapping_version)`,
- polityka API wykonuje preflight katalogowy przed `POST /api/cases/{case_id}/enm/domain-ops`,
- aktywna lista operacji objetych bramka katalogowa jest utrzymywana w `backend/src/api/domain_ops_policy.py`.

Stan aktywny:
- domyslny katalog MV jest budowany przez `get_default_mv_catalog()`,
- aktywnie czytane namespace i typy obejmuja co najmniej: linie SN, kable SN, transformatory SN/nN, aparaty SN, zrodla systemowe GPZ, PV, BESS,
- `add_grid_source_sn` jest objete ta sama bramka katalogowa co glowny tor SN,
- kontrakty materializacji sa zdefiniowane szerzej niz aktualnie wypelniony katalog; czesc namespace pozostaje pusta w repozytorium domyslnym, w szczegolnosci obszar ochrony.

Materializacja:
- dla odcinkow SN `continue_trunk_segment_sn`, `start_branch_segment_sn` i `connect_secondary_ring_sn` zapisuje `materialized_params` na elemencie oraz kopiuje pola solverowe do instancji,
- dla transformatorow `insert_station_on_segment_sn`, `add_transformer_sn_nn` i `assign_catalog_to_element` zapisuje `materialized_params` oraz pola `sn_mva`, `uk_percent`, `uhv_kv`, `ulv_kv`,
- dla zrodel SN `add_grid_source_sn` zapisuje `materialized_params` oraz pola solverowe `voltage_rating_kv`, `sk3_mva`, `ik3_ka`, `rx_ratio` (scenariusz MAX) oraz `sk3_min_mva`, `ik3_min_ka`, `rx_ratio_min` (scenariusz MIN, CV-4.3 K7, IEC 60909-0:2016 §6.2.1 eq. 6 z c_min — 3 pola opcjonalne, `None` = OSD nie podal danych warunkow przylaczenia dla scenariusza minimalnego; razem 7 pol solverowych),
- dla PV i BESS materializacja jest wykonywana w `domain_operations_v2.py` i utrwalana na generatorze,
- `assign_catalog_to_element` wykonuje rematerializacje dla branches, transformers i sources; proba usuniecia katalogu z elementu technicznego zwraca `catalog.clear_forbidden`,
- odpowiedz operacji domenowej zwraca dodatkowo przekroj `materialized_params` dla UI,
- `parameter_source` i jawne nadpisania parametrow sa utrwalane w snapshot tam, gdzie operacja lub aktualizacja wprowadza stan `OVERRIDE`.

Granice aktualnego wdrozenia:
- `insert_section_switch_sn` nie wykonuje pelnej, analogicznej materializacji rozcietych odcinkow i odcinka lacznika,
- `branch_points`, `CT`, `VT` i `relay` przechowuja `catalog_ref`, ale nie maja tak samo domknietej sciezki materializacji jak odcinki, transformatory, zrodla SN, PV i BESS,
- solver nie czyta koperty odpowiedzi `materialized_params`; korzysta z pol instancyjnych ustawionych podczas operacji,
- (zamkniete w W1, 2026-09-09) koncowki `type-ref`/`equipment-type` w `backend/src/api/catalog.py`, ktore obchodzily kanoniczny tor `domain-ops`, skasowane razem z biblioteka typow w bazie — wiazanie typu wylacznie przez operacje domenowe.

Governance biblioteki typow (spisane 2026-09-09, karta ARCHIWUM-CANONICAL-COMPLIANCE-2;
skorygowane tego samego dnia karta W1 — z faktycznego zachowania kodu, repo > specy):
- biblioteka typow sieci w bazie (P13b: manifest/eksport/import/odcisk `TypeLibraryManifest`,
  `TypeLibraryExport`, `compute_fingerprint`, `sort_types_deterministically`, HTTP
  `GET /api/catalog/export` / `POST /api/catalog/import`) oraz tabele `line_types`,
  `cable_types`, `transformer_types`, `switch_equipment_types`, tabela typow falownikow,
  `switch_equipment_assignments` SKASOWANE w W1 — jedyny konsument koncowek eksportu/importu
  (dwa przyciski w `ui/catalog/TypeLibraryBrowser.tsx`) skasowany razem z nimi; w bazie
  deweloperskiej 0 wierszy w kazdej tabeli. Jedyna
  prawda typow: katalog statyczny (`network_model/catalog/`) + katalog projektu w ENM
  (`enm/katalog_projektu.py`, status `PROJEKTOWY_V1` — import arkusza XLSX, migracja
  legacy), wiazanie elementu z typem wylacznie przez `catalog_ref` w operacjach domenowych;
  bramka wskrzeszenia: `scripts/legacy_public_path_guard.py::check_w1_legacy_persistence_resurrection`,
- bramka katalogowa (ktory rodzaj elementu wymaga referencji katalogowej, na ktorej
  osi cyklu zycia — tworzenie w operacji domenowej / walidacja modelu ENM / import z
  pliku zewnetrznego) ma JEDNO zrodlo prawdy (karta W3-I, 2026-09-09):
  `network_model/catalog/governance.py::wymagalnosc_katalogu(rodzaj, *, parameter_source=None,
  gen_type=None) -> WymagalnoscKatalogu` (pola `tworzenie`/`walidacja`/`import_`/`kod_walidacji`,
  poziomy `BLOCKER`/`WARNING`/`NIE`). Normalizuje nazewnictwo ENM (`cable`/`line_overhead`/
  `transformer`/`source`/`generator`/`load`/`switch`/`breaker`/`fuse`/`measurement`/
  `protection`/`shunt_capacitor`) i rdzenia (`CABLE`/`LINE`/`TRANSFORMER`). Wyjatek
  `parameter_source == "MANUAL_EQUIVALENT"` zdejmuje wymog dla zrodla na WSZYSTKICH
  trzech osiach (K1.2: zrodlo z jawnym Sk''/RX bez pozycji katalogowej); `gen_type` steruje
  osiami `walidacja`/`import_` generatora wedlug `enm/mapping.py::FULL_CONVERTER_SC_GEN_TYPES`
  (IMPORTOWANY, nie kopiowany — inny zbior niz `enm/models.py::GEN_TYPES_PRZEKSZTALTNIKOWE`,
  ktory odpowiada na INNE pytanie: czy generator jest DER). Konsumenci (walidator ENM — kod
  E009 dla galezi/transformatorow/zrodel, kod NOWY W010 dla generatorow przeksztaltnikowych;
  bramka importu archiwum ZIP; `infrastructure/cgmes/cgmes_importer.py::_elements_without_catalog`;
  `application/xlsx_import/importer.py` — asercja w `_waliduj_typy`; `enm/v2_projection.py` —
  ostrzezenie migracji generatora `V12-MIG-GEN-002` i `readiness_status`;
  `application/calculation_readiness/service.py` — kod gotowosci `inverter.k_sc_missing`;
  `application/eligibility_service.py::_check_catalog_refs` — bramka eligibility SC_3F/SC_1F/
  SC_2F/LOAD_FLOW/FAULT_LOOP_NN/SWZ_NN, SIODMY konsument, znaleziony dopiero przy weryfikacji
  DoD karty W3-I, nienazwany w jej tresci) CZYTAJA
  te funkcje zamiast trzymac wlasny predykat — transformator (tworzenie/walidacja/import
  BLOCKER) rozstrzyga TA SAMA tabela, nie osobno `domain_ops_policy`. Brama operacji
  (`api/domain_ops_policy.py::CATALOG_REQUIRED_OPERATIONS`, `enm/domain_operations_v2.py::
  V2_CATALOG_GATE_INVENTORY`) zostaje kluczowana OPERACJA (kontrakt payloadow, inny ksztalt
  problemu), ale ma test parytetu z tabela (rozjazdy `add_load_sn`/`add_generator_sn` NAZWANE
  jawnie, nie ukryte); pin:
  `tests/network_model/catalog/test_governance.py` (tabela jako iloczyn cech: rodzaj × os ×
  `catalog_ref` × `parameter_source` × `gen_type`),
  `tests/network_model/catalog/test_governance_konsumenci_czytaja_tabele.py` (po jednym
  teście na kazdego z szesciu konsumentow, monkeypatch poziomu),
  `tests/api/test_katalog_predykat_operacje_parytet.py` (parytet brama operacji ↔ tabela),
  `tests/cgmes/test_cgmes_katalog_predykat.py` (naprawa wyjatku MANUAL_EQUIVALENT w CGMES),
- governance biblioteki zabezpieczen (P14b): manifest niemutowalny i deterministyczny,
  eksport sortuje typy (nazwa -> id) przed odciskiem SHA-256, import MERGE (domyslny)
  wylacznie dodaje nowe typy (istniejacy `id` pomijany, konflikt raportowany), REPLACE
  zastepuje biblioteke — egzekwuje: `governance.py::ImportMode`, `ProtectionLibraryManifest`,
  `ProtectionLibraryExport.to_canonical_json`, `compute_protection_fingerprint`,
  `sort_protection_types_deterministically`,
  `application/catalog_governance/service.py::CatalogGovernanceService.export_protection_library`
  / `.import_protection_library` nad repozytorium
  `infrastructure/persistence/repositories/protection_catalog_repository.py`; pin:
  `tests/test_protection_library.py::test_protection_export_deterministic_fingerprint`,
  `test_protection_import_merge_adds_new_skips_existing`,
  `test_protection_import_merge_detects_conflicts`.

Poza zakresem powyzszej sekcji (zaimplementowane w innych modulach, nie w
`governance.py` ani jego wywolaniach): typ jako referencja na instancji (`type_ref`),
precedencja override>type_ref>instance i struktura pol LineType/CableType/TransformerType
— patrz `network_model/catalog/resolver.py`, `types.py`, `core/branch.py` oraz Catalog
Binding Rule w `CLAUDE.md`. Archiwalna pozycja BEZ dedykowanego testu na poziomie
governance: "typy wspoldzielone miedzy projektami" (w zarchiwizowanej liscie CT-002
status byl VERIFY, nigdy niepotwierdzony) — celowo NIE wpisana tu jako regula.

Niemutowalnosc typow katalogowych i brak edycji w UI (spisane 2026-09-09, karta
ARCHIWUM-CANONICAL-COMPLIANCE-2):
- kazdy rekord typu katalogowego jest `@dataclass(frozen=True)`; proba nadpisania pola
  rzuca `FrozenInstanceError` w czasie wykonania — egzekwuje:
  `network_model/catalog/types.py` (naglowek modulu: "All types are FROZEN
  (immutable)"; m.in. `LineType`, `CableType`, `TransformerType`, `SwitchEquipmentType`,
  `ConverterType` i pozostale klasy typow w tym pliku); pin:
  `tests/test_catalog_layer.py::test_catalog_types_are_frozen`,
- `backend/src/api/catalog.py` wystawia dla definicji typow wylacznie odczyt
  (kilkadziesiat endpointow `GET .../*-types`); zero `PUT`/`PATCH` na definicje typu —
  jedyne zapisy zwiazane z katalogiem to import calej biblioteki (wyzej, dodaje/pomija
  cale rekordy, nie edytuje pol) i przypisanie/odlaczenie `type_ref` NA ELEMENCIE SIECI
  (`POST`/`DELETE .../branches/{id}/type-ref`, `.../transformers/{id}/type-ref`,
  `.../switches/{id}/equipment-type` — zmienia, ktory typ element referencjonuje, nie
  tresc typu) — egzekwowane brakiem operacji zapisu w `api/catalog.py` dla definicji typu,
- `frontend/src/ui/catalog/api.ts` lustrzanie: wylacznie `fetchXTypes()` (GET) oraz
  `exportTypeLibrary`/`importTypeLibrary` (biblioteka jako calosc); zero funkcji edycji
  pojedynczego typu — patrz `docs/ui/UI_CATALOG_ENGINEERING_WORKFLOW.md` sekcja
  "Readonly — uzasadnienie",
- proba odlaczenia katalogu od elementu TECHNICZNEGO (materializowanego), ktory go
  wymaga, jest odrzucana kodem `catalog.clear_forbidden` — pokrewna bramka chroniaca
  integralnosc danych katalogowych przed usunieciem bez zastapienia — egzekwuje:
  `enm/domain_operations.py::assign_catalog_to_element`; pin:
  `tests/enm/test_catalog_materialization_persistence.py::test_reject_clear_catalog_for_physical_branch`,
  `tests/enm/test_domain_operations_flexible_sequences.py::test_sequence_reject_clear_and_reassign_catalog_keeps_snapshot_contract_valid`.

## Zalacznik: Moc regul katalogu (klasy) i przeglad wiarygodnosci

Karta KATALOG-NIEZMIENNIKI (2026-09-17). Katalog mial 33 twarde bramki rekordu
rozsiane po pieciu modulach (`types.py` 22, `audit2_catalogs.py` 7,
`lv_disconnection_times_iec60364_4_41.py` 2, `lv_ampacity_iec60364_5_52.py` 2) i
ZADNA nie mowila, na czym stoi. Regula, ktora dzis przechodzi na wszystkich
rekordach, nie jest przez to prawem fizyki: odrzucilaby pierwszy poprawny rekord
spoza dotychczasowego zbioru. Zrodlo prawdy o mocy regul:
`backend/src/network_model/catalog/niezmienniki_katalogu.py`.

### Szesc klas mocy

| Klasa | Znaczenie | Moc |
|---|---|---|
| `KONIECZNOSC_FIZYCZNA` | Zlamanie opisuje wielkosc, ktora nie moze istniec (moc ujemna, zbior pusty). | TWARDA |
| `WYMOG_NORMOWY` | Relacja ZDEFINIOWANA w normie; `podstawa` nazywa norme i jej miejsce. | TWARDA |
| `OGRANICZENIE_ZAKRESU_PRODUKTU` | Granica dziedziny produktu, nie fizyki. | TWARDA |
| `NIESKLASYFIKOWANA` | Bramka egzekwowana twardo, ale BEZ decyzji o podstawie — rozdziela moc od twierdzenia. | TWARDA |
| `WIARYGODNOSC` | Relacja typowa, nie konieczna — sygnal „do przegladu". | MIEKKA |
| `REGULA_ZA_MOCNA` | Klasa HISTORYCZNA: regula zdegradowana, z obowiazkowa `klasa_docelowa`. | MIEKKA |

Zbior klas twardych jest wymieniony JAWNIE (`KLASY_TWARDE`), a nie liczony jako
dopelnienie — dopelnienie wciagneloby kazda nowa klase na strone „odmawiaj".

### Egzekwowanie wyprowadzone z rejestru

Kazda twarda bramka rekordu katalogu przechodzi przez
`odmowa_twarda(kod, komunikat)`, ktora sprawdza, ze kod ISTNIEJE w rejestrze
`REGULY_KATALOGU` i ma klase twarda; odmowa (`OdmowaKatalogu`, podklasa
`ValueError`) niesie `.kod`. Zdanie „kazda twarda regula katalogu jest nazwana"
ma dwa mechanizmy, nie deklaracje:

- `scripts/niezmienniki_katalogu_guard.py` (AST): zero `raise ValueError` w
  `types.py` i zero w funkcjach walidacji rekordu (`__post_init__`, `from_dict`,
  `validate_*`, `_validate_*`) w calym `network_model/catalog/**`; kazdy literal
  kodu w `odmowa_twarda` musi istniec w rejestrze i byc twardy. Jedyne
  wylaczenie: modul definiujacy `odmowa_twarda`.
- `tests/network_model/catalog/test_niezmienniki_obie_strony.py`: KAZDY kod
  twardy ma PARE przypadkow — rekord jawnie niepoprawny odrzucany z wlasciwym
  kodem ORAZ rekord nietypowy, lecz legalny, ktory przechodzi. Zbior kodow w
  testach musi byc rowny zbiorowi kodow twardych rejestru.

Kody: `KAT-T-001` … `KAT-T-033` (twarde), `KAT-W-001` … `KAT-W-006`
(wiarygodnosc). Nazwe reguly wolno przeredagowac, kodu nie.

### Reguly wiarygodnosci — dlaczego NIE sa bramkami

| Kod | Regula | Dlaczego nie twarda |
|---|---|---|
| `KAT-W-001` | R0 >= R1 przewodu | R0 zalezy od konstrukcji zyly powrotnej i drogi powrotu przez ziemie — nierownosc nie jest uniwersalna. |
| `KAT-W-002` | P0 < Pk transformatora | Typowe dla transformatorow rozdzielczych, nie koniecznosc matematyczna; odwrocenie pary zwykle znaczy zamienione kolumny przy imporcie. |
| `KAT-W-003` | Icw <= Icu aparatu SN | Icw i Icu to ODDZIELNE wielkosci znamionowe (IEC 62271-100); globalna nierownosc po rodzinie nie ma podstawy normowej. |
| `KAT-W-004` | Icw <= Icu aparatu nN | IEC 60947-2 definiuje Ics jako % Icu (§ 4.3.5.2.2), ale dla Icw takiej definicji NIE MA (§ 4.3.5.4). |
| `KAT-W-005` | 0 < R/X < 1 zrodla | Rownowaznik rezystancyjny moze miec R/X >= 1; to granica zakresu, nie fizyki. |
| `KAT-W-006` | 0 < i0 % < 10 transformatora | Zakres rozsadny dla rozdzielczych, nie uniwersalny; gorna granica byla kontrola jednostki. |

POMIAR NA TYM DRZEWIE (2026-09-17): zadna z tych szesciu relacji NIE BYLA u nas
twarda bramka, wiec nie bylo defektu falszywego odrzucania do naprawienia.
Wartosc karty to (a) nazwanie mocy istniejacych 33 bramek i (b) przeglad
wiarygodnosci jako zdolnosc produktu.

### Przeglad wiarygodnosci jako zdolnosc produktu

`GET /api/catalog/przeglad-wiarygodnosci` i
`GET /api/catalog/przeglad-wiarygodnosci/{rodzina}` licza odstepstwa dla KAZDEJ
rodziny, w ktorej regula ma sens (aparaty nN, aparaty SN, transformatory, linie
SN, kable SN, kable nN, zrodla systemowe). Rodziny, w ktorych zadna regula sensu
nie ma, sa wymienione OSOBNO z powodem (`RODZINY_BEZ_REGUL`) — rodzina pominieta
milczeniem bylaby nierozroznialna od przeoczonej.

Wynik niesie POKRYCIE per regula: ile pozycji faktycznie policzono i ile
pominieto, z nazwanym powodem. Bez tego licznika „zero odstepstw" jest
nierozroznialne od „reguly nie dalo sie policzyc".

ZAKRES REGUL Z POMIARU, NIE Z PRZYKLADU. `KAT-W-003`/`KAT-W-004` licza sie
wylacznie dla aparatu o DODATNIEJ zdolnosci wylaczania: 13 pozycji SN
(odlaczniki, rozlaczniki, uziemniki) ma `breaking_capacity_ka = 0`, bo z
definicji nie przerywaja pradu zwarciowego — zestawianie ich pradu
krotkotrwalego ze zdolnoscia, ktorej nie maja, dawaloby 13 pozycji szumu.

Ekran: sekcja „Pozycje do przegladu” w przegladarce biblioteki typow
(`frontend/src/ui/catalog/PozycjeDoPrzegladu.tsx`) — kod reguly, identyfikator
pozycji, wartosci, uzasadnienie z backendu i zdanie wprost: sygnal do przegladu
karty producenta, nie odmowa. Zero fizyki we froncie.

## Zalacznik: Gotowosc katalogow — POMIAR, nie deklaracja

Karta KATALOG-NIEZMIENNIKI (2026-09-17). Zdanie „katalog jest gotowy" bylo dotad
ETYKIETA wpisana do rekordu (`catalog_status = PRODUKCYJNY_V1`) i nikt nie liczyl,
ile pol kontraktu ten rekord faktycznie niesie ani skad pochodza jego dane.
Etykieta bez pomiaru jest grozniejsza niz jej brak, bo wylacza czujnosc: pozycja
oznaczona jako produkcyjna, ktorej brakuje polowy pol opcjonalnych, wyglada tak
samo jak kompletna.

Tabela nizej jest GENEROWANA z rejestrow repozytorium katalogu
(`backend/scripts/inwentarz_katalogow.py`, rejestry SUROWE — razem z rekordami
benchmarkow, ktore listy widoczne dla projektanta pomijaja). Co mierzy kolumna:

- **Pozycji / Produkcyjnych** — liczebnosc rodziny i liczba rekordow o statusie
  `PRODUKCYJNY_V1`.
- **Pol opcjonalnych w kontrakcie** — pola dataclass, ktore MOGA byc puste
  (metadane katalogu wylaczone). Pole bez wartosci domyslnej jest wypelnione w
  100 % z definicji konstruktora i niczego nie mierzy.
- **Wypelnienie pol opcjonalnych** — udzial pol niepustych wsrod wszystkich
  mozliwych (pozycje x pola opcjonalne). Liczba NIE jest ocena: rodzina moze
  legalnie nie niesc pol, ktorych producent nie podaje.
- **Pozycji z proweniencja** — proweniencja STRUKTURALNA: niepuste
  `source_reference` albo pole dokumentu obecne w kontrakcie rodziny (numer
  dokumentu, adres zrodla, data publikacji, norma, numer katalogowy). Nigdy po
  regexie w tresci: regex przypisalby proweniencje zdaniu w opisie.
- **Pola bez ani jednej wartosci** — pole ISTNIEJE w kontrakcie, konsument moze go
  zazadac, a nie niesie go ZADNA pozycja rodziny. To najostrzejszy sygnal braku:
  srednie wypelnienie rozpuszcza go w liczbie zbiorczej. Pomiar 2026-09-17 pokazuje
  tu wprost brak `k_sc` w calej rodzinie `converter` (176 pozycji) i `pv-inverter`
  (66 pozycji) — udzial zwarciowy przeksztaltnika wolno wpisac WYLACZNIE z karty
  producenta z proweniencja (wzorzec ABB Emax 2: wyciag przypiety SHA-256), wiec do
  czasu pozyskania takiego zrodla rekordy zostaja bez tego pola, a blokada doboru
  opartego na domyslce jest poprawnym stanem, nie defektem.
- **Duplikaty id** — wiazanie katalogowe wskazujace na dwie pozycje jest defektem,
  nie niuansem.

Miernik NIE wprowadza etykiety „gotowy/niegotowy" ani progu — podaje liczby,
decyzje podejmuje czlowiek.

<!-- GENEROWANE: gotowosc katalogow — poczatek -->

> Tabela jest GENEROWANA z rejestrów repozytorium katalogu przez
> `backend/scripts/inwentarz_katalogow.py`. Nie edytuj jej ręcznie —
> aktualności pilnuje `scripts/inwentarz_katalogow_guard.py`.

| Rodzina | Pozycji | Produkcyjnych | Pól opcjonalnych w kontrakcie | Wypełnienie pól opcjonalnych [%] | Pozycji z proweniencją | Pola bez ani jednej wartości | Duplikaty id |
|---|---:|---:|---:|---:|---:|---|---|
| `bess-battery` | 2 | 0 | 0 | — | 2 | brak | brak |
| `bess-inverter` | 64 | 0 | 15 | 26,9 | 64 | `k_sc`, `ptpiree_certificate_condition`, `ptpiree_certificate_ref`, `ptpiree_document_acceptance_date`, `ptpiree_document_number`, `ptpiree_ppm_scope`, `ptpiree_publication_date`, `ptpiree_source_url`, `ptpiree_wipwc_version`, `ptpiree_wos_version` | brak |
| `cable` | 63 | 62 | 18 | 45,7 | 63 | `b0_siemens_per_km`, `ith_1s_a`, `z0_reference_bonding` | brak |
| `converter` | 176 | 0 | 51 | 20,6 | 176 | `cosphi`, `cosphi_p_points`, `droop_p_f_percent`, `droop_q_u_percent`, `f0_hz`, `harmonic_spectrum_percent`, `k_sc`, `lfsm_deadband_hz`, `lfsm_droop_pct`, `p_achievable_mw`, `p_connection_mw`, `ptpiree_certificate_condition`, `ptpiree_wos_version`, `qu_deadband_high_pu`, `qu_deadband_low_pu`, `qu_q_max_mvar`, `qu_q_min_mvar`, `qu_slope_pu_per_pu`, `sc_pq_split`, `sc_sustained_k`, `sc_transient_k` | brak |
| `ct` | 12 | 0 | 7 | 60,7 | 12 | `idyn_ka_peak`, `rct_ohm` | brak |
| `line` | 153 | 25 | 14 | 10,7 | 153 | `b0_siemens_per_km`, `base_type_id`, `ith_1s_a`, `manufacturer`, `trade_name` | brak |
| `load` | 3 | 0 | 4 | 58,3 | 3 | `profile_id` | brak |
| `lv-apparatus` | 18 | 18 | 15 | 55,9 | 18 | `curve_ref`, `ics_ka`, `poles`, `trip_unit` | brak |
| `lv-breaker-mcb` | 60 | 0 | 2 | 0,0 | 60 | `manufacturer`, `poles` | brak |
| `lv-cable` | 17 | 0 | 14 | 78,6 | 17 | `ith_1s_a`, `r0_ohm_per_km`, `x0_ohm_per_km` | brak |
| `lv-fuse-link` | 30 | 0 | 3 | 33,3 | 30 | `i2t_prearc_a2s`, `manufacturer` | brak |
| `mv-apparatus` | 48 | 45 | 7 | 52,4 | 48 | `break_time_s`, `i_dyn_ka`, `making_capacity_ka` | brak |
| `protection-curve` | 8 | 0 | 2 | 100,0 | 8 | brak | brak |
| `protection-device` | 12 | 0 | 6 | 79,2 | 12 | brak | brak |
| `protection-setting-template` | 8 | 0 | 2 | 100,0 | 8 | brak | brak |
| `ptpiree-certificate` | 6887 | 6887 | 3 | 100,0 | 6887 | brak | brak |
| `pv-inverter` | 66 | 0 | 18 | 39,6 | 66 | `k_sc`, `ptpiree_certificate_condition`, `ptpiree_wos_version` | brak |
| `shunt-capacitor` | 6 | 0 | 2 | 50,0 | 6 | `manufacturer` | brak |
| `source-system` | 22 | 22 | 12 | 75,0 | 22 | `ik3_min_ka`, `rx_ratio_min`, `sk3_min_mva` | brak |
| `surge-arrester` | 12 | 0 | 3 | 100,0 | 12 | brak | brak |
| `switch-equipment` | 48 | 45 | 4 | 85,4 | 48 | brak | brak |
| `synchronous-generator` | 22 | 0 | 1 | 0,0 | 22 | `manufacturer` | brak |
| `transformer` | 212 | 50 | 5 | 96,2 | 212 | brak | brak |
| `vt` | 13 | 0 | 7 | 90,1 | 13 | brak | brak |

Rodzin objętych pomiarem: 24. Pozycji łącznie: 7962, w tym produkcyjnych: 7154. Pozycji z proweniencją strukturalną: 7962.

Rodziny bez ani jednej pozycji: brak.

Rodziny z duplikatami identyfikatorów: brak.

<!-- GENEROWANE: gotowosc katalogow — koniec -->
