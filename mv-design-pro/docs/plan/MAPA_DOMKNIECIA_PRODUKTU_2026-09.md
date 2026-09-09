# MAPA DOMKNIĘCIA PRODUKTU — 2026-09 (granica faktyczna 12 domen z dowodów repo)

**Status:** KANONICZNY, ŻYWY — wynik kroku „START NOW" misji właściciela
(`MISJA_DOMKNIECIA_PRODUKTU_2026-09.md` §32). Podlega misji; w zakresie kolejności wycinków
uszczegóławia szkielet W-8 z `../architecture/CONVERGENCE_ROADMAP.md` §4 (mapowanie: §8 tego dokumentu).
Każdy wycinek aktualizuje wiersze, których dotyczy; wiersz bez dowodu (ścieżka:linie, test, konsument)
jest CLAIMED, nie ACCEPTED (misja §28).

**Baza pomiaru:** drzewo `a701152f` (sześć równoległych badań tylko-odczyt, 2026-09-09 11:40–12:05 UTC,
karta wspólna: cel, reguły, legenda), korekty i decyzje architekta na `105a1113` (2026-09-09 12:10–12:40 UTC).

**Metoda:** repo > specy > rejestr. Każda zdolność ma dowód w kodzie (moduł, symbol, trasa HTTP, ekran,
plik testu). Dokumenty (`INWENTARZ_FUNKCJI_2026-07.md`, `docs/twin/*`, `docs/architecture/*`,
`docs/evidence/*`, `CLAUDE.md`) potraktowano jako ROSZCZENIA i zweryfikowano w kodzie; rozjazdy nazwano
w §6. Liczby testów mierzone `grep -c "def test_"` / `it(`, nie przebiegiem — nie dowodzą, że testy
przechodzą (dowodem przebiegu jest `../evidence/CONVERGENCE_EVIDENCE.md` §A/§F). Konsument = realny import
i wywołanie w torze API/UI, nie obecność klasy. Pewność per wiersz: wysoka (łańcuch przeczytany do
końca), średnia (część łańcucha), niska (tylko obecność plików).

**Legenda klasyfikacji (dokładnie jedna per zdolność, misja §2):** `ISTNIEJE-ZWERYFIKOWANE` (kod + test +
konsument w torze użytkownika + wyrocznia/kontrakt) · `POZORNIE-ISTNIEJE` (nazwa/ekran/dokument bez realnej
zdolności) · `CZĘŚCIOWE` (działa w części przypadków — brakująca część nazwana) · `ZDUPLIKOWANE` (dwie
ścieżki tej samej fizyki/prawdy) · `BEZ-KONSUMENTA` (backend bez wpięcia w tor użytkownika) ·
`UI-BEZ-ZDOLNOŚCI` (ekran/kontrolka bez realnego backendu) · `BACKEND-BEZ-TOKU-PRACY` (API/solver bez
użytecznego toku pracy inżyniera) · `BRAK` · `DO-PRZEPROJEKTOWANIA` (łamie kanon / niepoprawny model) ·
`DO-KASACJI` (martwe / zastąpione — następca wskazany).

**Uczciwość:** to statyczna analiza jednego punktu w czasie. Klasyfikacje „BEZ-KONSUMENTA" i
„DO-KASACJI" są zweryfikowane grepem wyczerpującym w chwili badania i mogą się zmienić z kolejnym
commitem (precedens: `protection_coordination` przeszło z BEZ-KONSUMENTA do ISTNIEJE między 2026-08-08
a 2026-08-13). Nic w tym dokumencie nie jest samocertyfikacją: werdykt wizualny SLD (B-02) i zgody na
edycję rdzeni FROZEN (B-01) pozostają przy właścicielu.

---

## 1. Streszczenie dla właściciela

1. **Rdzeń produktu jest realny i zweryfikowany niezależnie:** ENM z operacjami domenowymi (24 kreatory,
   115/115 kodów gotowości z nawigacją naprawczą pod guardem CI), rewizje z odciskiem (DT-6 FROZEN),
   jeden assembler wejścia PF/SC, rozpływ NR z wyspami i OLTC (pandapower/MATPOWER ≤ 4·10⁻⁵ p.u.),
   zwarcia IEC 60909 3F/1F/2F/2FG z min/max i proweniencją wyroczni, N-1 pełnym re-solve, ślad WHITE BOX,
   18 typów pakietów dowodowych, świeżość wyników w 12 ekranach, pętla zwarcia nN TN z 105 testami,
   portal domeny nN na SLD, eksport SLD w 5 formatach.
2. **Największa pojedyncza wada (P0): druga prawda sieci żyje i jest zasilana z UI.** Import XLSX
   (`POST /api/import/xlsx`, ekran `ui2/spaces/projekt/arkusz`) zapisuje wyłącznie legacy ORM
   `network_*`; ENM jest tworzony PUSTY przy pierwszym dotknięciu, więc zaimportowana sieć nie istnieje
   dla kreatorów, biegów, SLD ani raportów. Legacy ORM ma 6 tabel i 3 żywych pisarzy/czytelników,
   `NetworkWizardService` (2228 linii) nie ma trasy mutującej, backendowy silnik SLD (11 plików,
   103 testy) nie ma konsumenta, uziemienie ma 6 reprezentacji, stan łączeniowy 2.
3. **Druga wada (P0): fabrykacje prezentowane jako wynik inżynierski.** Ekran „Stabilność dynamiczna"
   progoduje liczby zaszyte w kodzie (10°/75°/28°/0,97/0,99 p.u.), a prawdziwy solver RMS ma zero
   konsumentów; nastawy detekcji doziemień w module akademickim to literały bez proweniencji; stałe
   czasowe FRT jednakowe dla każdego urządzenia; wskaźnik asymetrii nie jest VUF; przycisk „Uruchom
   obliczenia" macierzy DER nie robi nic; edycja nastaw przekaźnika z SLD prowadzi do nieistniejącego
   komponentu i wyłączonego stubu.
4. **Duplikaty fizyki:** IDMT ×5 (tor kanoniczny `protection_sn` liczy krzywą w `application/`),
   metodyka nastaw ×3, ALF ×2, hosting capacity ×2, ranking N-1 ×2, straty/OLTC ×2 — cztery z nich
   w `v126_academic.py` na prądzie gałęzi liczonym z mocy jednej szyny (fizycznie błędnym dla gałęzi
   nieliściowych). Guard fizyki poza solverami istnieje i biegnie w CI (korekta raportu C), ale jego
   rodziny wzorców nie obejmują IDMT ani prądu gałęzi.
5. **Brakujące ogniwa łańcucha inżyniera (BRAK):** dobór przekroju kabla/linii, zestawienie urządzeń
   projektu, pakiet do podpisu (spec BINDING bez kodu), rejestr założeń, model kosztowy, warianty
   modernizacji (`NetworkVariation`), odtwarzanie zasilania/NOP, model fazowy nN, TT/IT/RCD, funkcje
   67/67N/21/87/25/50BF, grupy nastaw, cykl życia projektu, iniekcja wtórna, COMTRADE, CAD round-trip,
   GIS, warstwa MCP, role, cel projektu jako DoD.
6. **Decyzja architekta (§8):** kolejność W1 → W2 (równolegle) → W3 → W5 → W4 → W8 → W6 → W7 → W9 → W10
   → W11 → W12. Pierwszy wycinek **W1 „jedna prawda sieci od pierwszego bajtu"** (= CV-4.4 rozszerzone:
   import XLSX → ENM przez jeden kompilator grafu, migracja jednorazowa legacy → ENM, kasacja legacy ORM
   i martwych klastrów, guard wskrzeszenia, e2e klasy A przez import). Decyzje wymagające właściciela: §7.

---

## 2. Macierz 12 domen

| # | Domena (misja) | Rdzeń zweryfikowany | Luki najwyższej wagi | Klasa dominująca luk | Wycinek |
|---|---|---|---|---|---|
| 1 | Digital Twin / ENM | model, operacje, rewizje, scenariusze, koperta, katalog | import XLSX omija ENM; legacy ORM 6 tabel; `NetworkVariation` BRAK; BESS bez stanu energii; uziemienie ×6 | ZDUPLIKOWANE / DO-PRZEPROJEKTOWANIA | W1, W5, W6, W10 |
| 2 | Network Design | kreatory, szablony stacji, dobory DER/kompensacji/CT-VT, werdykt, gotowość | dobór przekroju BRAK; dobór aparatu nN bez UI; `design_synth`/`designer`/`NetworkWizardService` martwe; NBA milczy E6–E8 | BRAK / DO-KASACJI | W1, W9, W10 |
| 3 | PF / SC / Earth Fault | NR+wyspy+OLTC z wyrocznią; SC 4 typy min/max; Y0 z B0 | Zf (B-01); PF z dwoma źródłami w wyspie; Z1/Z2/Z0 tylko w śladzie; brak wyroczni G01 (OD-3); nastawy doziemne zaszyte | CZĘŚCIOWE / DO-PRZEPROJEKTOWANIA | W2, W3, W8, OD-14/15 |
| 4 | Protection & Measurement | CT/VT burden, TCC, czułość, selektywność, koordynacja, raporty | IDMT ×5; nastawy poza modelem (stub `update_relay_settings`, SPZ bez pisarza); 67/67N/21/87/25/50BF/grupy/TRIP BRAK | ZDUPLIKOWANE / BRAK | W3, W4 |
| 5 | OZE / BESS / RfG | tryby DER, adekwatność Q, siła sieci, NC RfG 5 profili, dokumenty OSD, kompensacja | BESS bez SOC; grid-forming bez konsumenta; hosting ×2; `source_compliance` osierocone; macierz DER martwy klik; FRT stałe zaszyte | CZĘŚCIOWE / ZDUPLIKOWANE | W2, W3, W6 |
| 6 | Power Quality & Dynamics | flicker, SSCI, harmoniczne (18 rzędów), ekran Jakość | stabilność dynamiczna = fasada progowa; RMS bez konsumenta; asymetria ≠ VUF; brak raportu EN 50160; harmoniczne pod „akademickimi" | DO-PRZEPROJEKTOWANIA | W2, W6 |
| 7 | LV / Earthing | pętla TN, SWZ, aparaty nN, ΔU, pakiet dowodowy obwodu, portal nN | model fazowy BRAK; rozpływ niesymetryczny tylko sieci referencyjne; TT/IT/RCD BRAK; most SC_1F→U_dot bez konsumenta; IEEE 80 odcięte od modelu stacji | BRAK / BEZ-KONSUMENTA | W5, W8 |
| 8 | SLD / CAD / GIS | layout, 54 symbole, nakładki, eksport 5 formatów, portal nN, determinizm CI | semantyka SLD tylko w kliencie (6831 linii); backendowy silnik i SLD ORM martwe; nadpisania w pamięci bez konsumenta; CAD round-trip i GIS BRAK | DO-PRZEPROJEKTOWANIA / BRAK | W1 (kasacje), W7, W12 |
| 9 | Optimization & Reliability | N-1 pełny re-solve, straty, OLTC studia, wrażliwość, porównania | ranking N-1/hosting/straty w v126 na błędnym prądzie gałęzi; restoration/NOP/koszty/wielokryterialna/warianty BRAK | ZDUPLIKOWANE / BRAK | W3, W10, OD-16 |
| 10 | Reporting / WHITE BOX / Compliance | ślad, 18 pakietów, ZIP dowodowy, raporty żywe, porównania, dziennik, rewizje, świeżość, Reference Engine | legacy raporty 8 plików/3574 linii martwe; `qu_regulation` bez konsumenta; BOM tylko DER-SN; pakiet do podpisu i rejestr założeń BRAK; V12.6 dowód równoległy | DO-KASACJI / BRAK | W1, W3, W10 |
| 11 | Commissioning / As-built | zgodność powykonawcza U/P/Q, estymacja WLS | brak cyklu życia, trwałości, dokumentu, iniekcji wtórnej, FAT/SAT, kalibracji, COMTRADE | BRAK | W11 |
| 12 | MCP Engineering Control Plane | REST 350 tras, transakcje ENM (lock + rollback), dziennik, rewizje | MCP BRAK; uprawnienia BRAK (decyzja 2026-08-05 vs misja §15 — OD-13); CAS nieużywany; rollback nie jest operacją; NBA E6–E8, cel/DoD, role BRAK | BRAK / CZĘŚCIOWE | W9, W12 |

---

## 3. Tabele zdolności per domena

Skróty ścieżek: `backend/src/` pomijane dla modułów backendu; `frontend/src/` dla frontendu.

### 3.1 Domena 1 — Digital Twin / ENM

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Magazyn ENM per projekt (fasada case→project) | CZĘŚCIOWE | `enm/store.py:216-303`, `enm/klucz_twin.py`, migracja `enm/store.py:722-806`; 29 tras `api/enm.py` | nie jedyne miejsce zapisu topologii — #22/#23 | wysoka |
| 2 | Aktywa i łączność (Bus/Branch) | ISTNIEJE-ZWERYFIKOWANE | `enm/models.py:175-315`, `enm/topology.py` (513), `enm/topology_ops.py` (1101); `GET /enm/topology` | — | wysoka |
| 3 | Stacje, rozdzielnice, pola (25 klas pola) | ISTNIEJE-ZWERYFIKOWANE | `enm/models.py:863-1463`; kreatory `stacja`/`pole`/`pole-nn`/`rozdzielnica-nn`/`aparat-nn` | — | wysoka |
| 4 | Transformatory + OLTC | ISTNIEJE-ZWERYFIKOWANE | `enm/models.py:324-386`, `enm/pole_transformatorowe.py` (335) | — | wysoka |
| 5 | Źródła i odbiory | ISTNIEJE-ZWERYFIKOWANE | `enm/models.py:386-449` | — | wysoka |
| 6 | DER jako `Generator.gen_type` + `connection_variant` | ISTNIEJE-ZWERYFIKOWANE | `enm/models.py:493-616` (walidator wariantu przyłączenia); e2e `kreator-oze-max.spec.ts` | — | wysoka |
| 7 | BESS jako magazyn energii (SOC, MWh, sprawność, dyspozycja w czasie) | CZĘŚCIOWE (tabliczka) / BRAK (stan energii) | `enm/models.py:493-538` (tylko `p_mw`/`q_mvar`/`limits`), `BaySourceEndpoint.operating_mode` opisowy (1298-1306); tabliczka z katalogu `ui2/oze/pulpit/SekcjaMagazynu.tsx:1-6` | brak pól stanu magazynu w ENM; każda analiza traktuje BESS jak źródło o stałym P/Q | wysoka |
| 8 | Pomiary CT/VT | ISTNIEJE-ZWERYFIKOWANE | `enm/models.py:617-696,1092-1130`; `domain/dobor_przekladnika.py` (907; 42 testy) | — | wysoka |
| 9 | Zabezpieczenia w twinie (przypisanie, nastawy) | CZĘŚCIOWE | `enm/models.py:696-738,1153-1298`; koordynacja `application/protection_settings/{engine,batch_run}.py` bez `set_enm`/operacji domenowej (0 wystąpień) | nastawy policzone przez koordynację nie wracają do `BayProtectionControlUnit` | wysoka |
| 10 | Stan łączeniowy | ZDUPLIKOWANE | ENM `SwitchBranch`/`BaySwitchState` (`enm/models.py:291,1013`) vs `SwitchingStateORM` (`infrastructure/persistence/models.py:391-398`; konsumenci `project_archive/service.py`, `network_wizard_repository.py`) | dwie trwałe reprezentacje jednego faktu | wysoka |
| 11 | Fazy (jawny model ABCN) | BRAK | `Bus.phase_system: Literal["3ph"]` (`enm/models.py:178`), `Load` bez fazy (430-441); DT-4 PROPOSED, `ADR-015` PROPOSED | fundament pod asymetrię/prąd w N/prosumentów 1-fazowych nie istnieje | wysoka |
| 12 | Punkt neutralny i uziemienie | ZDUPLIKOWANE (6 reprezentacji) | (a) `domain/grounding.py` 0 użyć; (b) `GroundingConfig` na `Bus`/`Transformer` (`enm/models.py:21-24,180,359-360`) — czytane przez Y0 (`enm/zero_sequence_transformer.py:262-278`); (c) `BayEarthFaultPath.earth_electrode_resistance_ohm`/`earth_return_split_factor` (1404-1411) — 0 pisarzy (`application/field_read_model.py:1278-1309` zawsze `None`); (d) `Substation.meta["nn_earthing_system"]`; (e) `solver_input/v126_contracts.py:142-156` osobny formularz; (f) `EarthingGroundFaultPackInput.earthing_mode` wolny tekst | DT-5 PROPOSED; R_u stacji nigdy nie trafia do fizyki | wysoka |
| 13 | Rewizje modelu (dziennik, migawki, checkout) | ISTNIEJE-ZWERYFIKOWANE (DT-6 FROZEN) | `enm/rewizje.py` (393), `enm/dziennik_zmian.py` (451); `GET /enm/rewizje/{n}` 404/409 (`api/enm.py:184-219`); 18+8+19 testów | brak: przywrócenie do rewizji jako operacja, autor wpisu, status cyklu życia (domeny 11/12) | wysoka |
| 14 | Warianty sieci (`NetworkVariation`) | BRAK | 0 klas w `backend/src`; porównanie tylko `StudyCase`↔`StudyCase` (`application/study_case/service.py:331`) | projekt akceptacyjny F (modernizacja: as-is → wariant → porównanie) niewykonalny na modelu | wysoka |
| 15 | Scenariusze operacyjne (`OperatingScenario`, `apply_scenario`) | ISTNIEJE-ZWERYFIKOWANE | `enm/scenariusze.py` (824); 7+ konsumentów analitycznych; 25 testów + parytet rodzin | — | wysoka |
| 16 | Założenia projektu | CZĘŚCIOWE | `ConnectionConditions` 3 pola (`enm/models.py:126-137`); kafel `ui2/spaces/projekt/KafelPrzylaczenia.tsx` | brak rejestru założeń normatywnych (domena 10 #18) | wysoka |
| 17 | Proweniencja wartości (`parameter_source`, `source_mode`, `materialized_params`) | ISTNIEJE-ZWERYFIKOWANE | `enm/pole_katalogowe.py`, `enm/catalog_completion.py` (785); ~30 plików testów | brak wizualizacji jakości pola w edytorze (domena 10 #9) | wysoka |
| 18 | Wiązanie katalogowe | ISTNIEJE-ZWERYFIKOWANE | guardy `catalog_binding/enforcement/gate`; `network_model/catalog/` 46 plików | — | wysoka |
| 19 | Rejestr biegów i wykonanie | ISTNIEJE-ZWERYFIKOWANE | `api/execution_runs.py` (5 tras), `enm/canonical_analysis.py` (3928) | — | wysoka |
| 20 | Koperta rewizji i świeżość | ISTNIEJE-ZWERYFIKOWANE | `enm/envelope.py`, `application/result_freshness.py`; `ui2/freshness/` w 12 ekranach | luka nazwana w kodzie `ui2/freshness/opisSwiezosci.ts:17` | wysoka |
| 21 | Jeden assembler ES→TV→IR | CZĘŚCIOWE (DT-8 EVIDENCE-GATED) | `enm/assembler.py` (1046) jedyny producent wejścia PF/SC toru kanonicznego (guard `solver_input_assembler_guard`) | otwarte: K2 kasacja `application/reference_networks/**`, `TopologyService` 18 implementacji | średnia |
| 22 | Import XLSX → projekt | DO-PRZEPROJEKTOWANIA (**P0**) | `application/xlsx_import/service.py:27-30,216-257` zapis wyłącznie `Network*ORM` (0 wystąpień `enm`); `POST /api/import/xlsx` (`api/xlsx_import.py:99-131`); ekran `ui2/spaces/projekt/arkusz/EkranImportuArkusza.tsx` (381) nawigujący do projektu; `tests/test_xlsx_import.py:291` asercjuje tylko model legacy; `enm/store.py:221-260` tworzy pusty ENM przy pierwszym dotknięciu | zaimportowana sieć niewidoczna dla 29 tras `/enm/**`, 24 kreatorów, biegów, SLD, raportów — inżynier wprowadza dane drugi raz ręcznie | wysoka |
| 24 | Katalog typów — tabele w bazie (`LineTypeORM`, `CableTypeORM`, `TransformerTypeORM`, `SwitchEquipmentTypeORM`, `InverterTypeORM`, `ProtectionDeviceTypeORM`; `infrastructure/persistence/models.py:311-351`) | ZDUPLIKOWANE (trzecia prawda katalogu) | pisane przez `application/catalog_governance/service.py:262-289,544-657` (`uow.wizard.upsert_*`); czytane WYŁĄCZNIE przez `application/protection_analysis/catalog_lookup.py:63-81` (typy zabezpieczeń, z fallbackiem na katalog statyczny); `api/catalog.py:252-356` i operacje domenowe (`enm/domain_operations.py:2628` `_get_catalog_safe` → `get_default_mv_catalog`, `lru_cache`, wyłącznie moduły statyczne `network_model/catalog/*.py`) nigdy ich nie czytają | typ linii/kabla/transformatora zaimportowany przez governance nie istnieje dla kreatorów ani biegów; W1 rozstrzyga: jedna droga typów użytkownika (typy projektu w ENM z proweniencją) i kasacja tabel martwych wobec toru obliczeń | wysoka |
| 23 | JEDNA PRAWDA SIECI (ocena systemowa) | ZDUPLIKOWANE (**P0**) | legacy ORM 6 tabel (`infrastructure/persistence/models.py:226-398`): pisarz `xlsx_import` (tylko legacy), `application/project_archive/service.py:49-50,298-299` (podwójny zapis), `application/catalog_governance/service.py:301` (czyta `NetworkBranchORM.params_jsonb["type_ref"]`), repozytoria `network_repository.py`/`snapshot_repository.py`/`network_wizard_repository.py` | CV-4.4 niewykonane; naprawa = W1 | wysoka |

### 3.2 Domena 2 — Network Design

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Kreatory budowy sieci (24) | ISTNIEJE-ZWERYFIKOWANE | `ui2/kreatory/**` (24 katalogi wołające `executeDomainOperation`; 54 pliki testów / 659 `it(`); dry-run `kreatory/stacja/stacjaPodglad.ts:1-13` | — | wysoka |
| 2 | Dobór kompensacji mocy biernej | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/dobor_kompensacji.py` (567; 21 testów) | — | wysoka |
| 3 | Dobór CT/VT | CZĘŚCIOWE | `domain/dobor_przekladnika.py` (907); UI `ui/network-build/station-der/DoborPrzekladnikowSekcja.tsx` | tylko pole wytwórcy; kryterium ALF uproszczone (domena 4 #3) | wysoka |
| 4 | Dobór toru SN dla DER (kabel/TR/grupa) | ISTNIEJE-ZWERYFIKOWANE | `network_model/solvers/der_selection_preview.py` (706; 25 testów); `api/der_sn_documents.py` | jedyny dobór z rankingiem i odrzuconymi kandydatami | wysoka |
| 5 | Dobór aparatu / obwodu nN | BEZ-KONSUMENTA | `application/analyses/nn_device_selection.py` (791; 45 testów); `GET …/enm/nn-device-selection` (`api/enm.py:60,464`) | 0 ekranów w `ui`/`ui2` | wysoka |
| 6 | Dobór przekroju przewodu/kabla SN | BRAK | `grep dobierz_przekroj\|dobor_przekroju\|dobor_kabla\|dobor_linii backend/src` = 0; istnieje tylko sprawdzenie ΔU/obciążalności | inżynier dobiera przekrój poza systemem | wysoka |
| 7 | Silnik syntezy projektu / studium z rankingiem (`design_synth`) | POZORNIE-ISTNIEJE → DO-KASACJI | `application/analyses/design_synth/pipeline.py:94` „Deterministic placeholder proposal. No solver execution."; klucz `BoundaryNode` (143); 0 tras API, 0 UI; 3 repozytoria `design_*_repository.py`; martwy klucz `run_registry.py:25` | następca: realne dobory (#2–#4) + W10 | wysoka |
| 8 | `NetworkWizardService` (CRUD legacy) | DO-KASACJI | `application/network_wizard/service.py` (2228) — 0 tras mutujących; jedyne użycie `api/catalog.py:133-134` (gettery katalogu zabezpieczeń) | następca: `/enm/domain-ops` + `step_controller.py` (na ENM, żywy w `api/enm.py:982-1068`) | wysoka |
| 9 | Szablony stacji (10 archetypów) | ISTNIEJE-ZWERYFIKOWANE | `application/station_templates/` (1137; 60 testów); kreator stacji | — | wysoka |
| 10 | Wzorce referencyjne (raporty normatywne) | ISTNIEJE-ZWERYFIKOWANE | `application/reference_patterns/` (2708); `api/reference_patterns.py` 6 tras; `ui2/referencje/` (21 `it(`) | — | wysoka |
| 11 | Mapa procesu E1–E8 + następna najlepsza akcja | CZĘŚCIOWE | `ui2/proces/nastepnaAkcja.ts` (232; drabina R1–R6, 26 testów), `etapy.ts` | NBA milczy dla E6–E8 (`nastepnaAkcja.ts:42-49`) | wysoka |
| 12 | Werdykt projektowy | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/werdykt_projektowy.py` (990); `api/quality_analysis_runs.py` | — | wysoka |
| 13 | Gotowość inżynierska | ISTNIEJE-ZWERYFIKOWANE | `api/enm.py:266,649,708`; 115/115 kodów z `fix_navigation` (`domain/canonical_operations.py`, guard `readiness_codes_guard.py` w CI) | — | wysoka |
| 14 | `application/designer/` | DO-KASACJI | 7 plików / 206 linii, 0 importerów, angielskie etykiety akcji (`actions.py:22-26`) | — | wysoka |
| 15 | Pętla wynik → „Popraw w modelu" | CZĘŚCIOWE | `ui2/wyniki/wzorzec/` (wg `FLOW_PROJEKTANTA_2026-07.md` §3) | łańcuch nieprześledzony do końca w tym badaniu | niska |
| 16 | N-1 / rozbudowa / warianty | CZĘŚCIOWE | `kontyngencje_n1.py`, `hosting_capacity.py` | brak obiektu wariantu i rankingu rozbudowy (domena 1 #14) | średnia |
| 17 | Projektowanie nN (4 kreatory) | CZĘŚCIOWE | kreatory wpięte (#1); dobór aparatu bez UI (#5); `ENGINEERING_FRICTION_REGISTER.md` EF-021/022 | punkt wejścia przepływu nN do sprawdzenia w W5 | niska-średnia |

### 3.3 Domena 3 — Power Flow / Short Circuit / Earth Fault

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Rozpływ NR | ISTNIEJE-ZWERYFIKOWANE | `network_model/solvers/power_flow_newton*.py`; wyrocznia `tests/golden/wyrocznie/test_pandapower_blizniaki_matpower.py` (case9/14/39 ≤ 4·10⁻⁵ p.u.) | — | wysoka |
| 2 | Wybór metody GS/FD | BEZ-KONSUMENTA | solvery + 36/43 testy; selektor tylko w `ui/study-cases/CaseConfigPage.tsx:72-76,225-232` (nieimportowany); `ui2/spaces/obliczenia/uruchomObliczenie.ts:165-167` bez `solver_input`; assembler domyślnie NR (`enm/assembler.py:838-840`) | brak klikalnej drogi do GS/FD | wysoka |
| 3 | Wyspy (rozpływ per wyspa) | ISTNIEJE-ZWERYFIKOWANE | `enm/assembler.py:600-650`, `enm/rozplyw_wysp.py`; 12 testów + wyrocznia pandapower | — | wysoka |
| 4 | Dwa źródła sieciowe w jednej wyspie (PF) | CZĘŚCIOWE | odmowa nazwana `source.multiple_grid_sources_in_island` (`enm/assembler.py:625-628`; OD-7) | pierścień zasilany z dwóch GPZ bez rozwarcia nie jest liczony | wysoka |
| 5 | Zwarcie z wieloma źródłami (superpozycja) | ISTNIEJE-ZWERYFIKOWANE | `short_circuit_iec60909.py` (wkłady sumowane); wyrocznia pandapower | — | wysoka |
| 6 | Granice Q węzłów PV | ISTNIEJE-ZWERYFIKOWANE | `power_flow_newton_internal.py:813-828`; `tests/enm/test_generator_voltage_control_e2e.py` (6) | ryzyko OD-11 (granice egzekwowane per iteracja) — B-01 | wysoka |
| 7 | OLTC pętla automatyczna | ISTNIEJE-ZWERYFIKOWANE | `power_flow_oltc.py`; 13+6+7 testów; `ui2/wyniki/oltc/` | — | wysoka |
| 8 | OLTC studia (sweep / profil roczny / optymalizacja) | ISTNIEJE-ZWERYFIKOWANE | `power_flow_oltc_studies.py` (36 testów) | — | wysoka |
| 9 | Szeregi czasowe P/Q całej sieci (QSTS) | CZĘŚCIOWE | `Load.load_profile` istnieje (`enm/domain_ops_models.py:1340`); jedyny konsument wielookresowy = studium OLTC z listą w opcjach (`enm/canonical_analysis.py:2270`) | brak rozpływu godzina po godzinie dla strat rocznych/napięć w czasie | wysoka |
| 10 | Tryby DER Q_CONST/COSPHI/COSPHI_P/Q(U) + LFSM | ISTNIEJE-ZWERYFIKOWANE | `power_flow_inverter.py:49-54,76`; assembler 632-648; 45 testów | brak śladu trybu/limitu Q w wyniku FROZEN (domena 5 #1) | wysoka |
| 11 | IEC 60909 3F/1F/2F/2FG | ISTNIEJE-ZWERYFIKOWANE | `short_circuit_iec60909.py:1070,1212,1315,1414`; 36 testów + golden asymetryczne | — | wysoka |
| 12 | Min/max (S''kQ, c_min/c_max) | ISTNIEJE-ZWERYFIKOWANE | K7; wyrocznia `test_pandapower_k7_sk_min.py` z rekordem proweniencji | — | wysoka |
| 13 | Z1/Z2/Z0 w wyniku | CZĘŚCIOWE | kontrakt `to_dict()` bez z1/z2/z0; ekran `ui2/wyniki/skladowe/model.ts:1-40` czyta ze śladu | pola addytywne kontraktu — B-01 | wysoka |
| 14 | Wkłady sieć/falownik/maszyna (DFIG crowbar) | ISTNIEJE-ZWERYFIKOWANE | `machine_sc_iec60909.py` (19 testów); `enm/mapping.py` klasyfikacja typów | — | wysoka |
| 15 | Impedancja zwarcia Zf | CZĘŚCIOWE | model `domain/fault_scenario.py:198-296` + UI `PanelScenariuszy.tsx:231-240`; rdzeń `short_circuit_core.py:67-111` bez Zf; blokada `ELIG_BINDING_UNSUPPORTED_FAULT_IMPEDANCE` (`application/fault_scenario_service.py:546-561`) | fizyka Zf w rdzeniu FROZEN — OD-14 (B-01) | wysoka |
| 16 | Sieć składowej zerowej (izolowana/kompensowana/rezystor) | CZĘŚCIOWE | `enm/mapping.py:345-540` (B0 bocznik π, `zero_sequence_transformer.py`, odmowa przy Y0 osobliwej 566-580) | brak wyroczni pełnosieciowej (OD-3); IR (`network_model/core`) bez reprezentacji uziemienia — solver nie różnicuje sposobu uziemienia (domena 4 #7) | wysoka |
| 17 | Dobór uziemienia punktu neutralnego (Ic, Petersen, NER) | ISTNIEJE (bez wyroczni niezależnej) | `network_model/solvers/v126_academic.py:1299-1420` (21 testów); ekran „Analizy akademickie" | dwie niepowiązane liczby: Z0 z rdzenia FROZEN vs Ic z modułu akademickiego | średnia |
| 18 | Napięcie dotykowe/krokowe stacji SN | BEZ-KONSUMENTA / BRAK (U_s) | most `application/analyses/earthing/ground_fault_bridge.py` (151) — 0 konsumentów API/UI; U_s nieliczone (`:18-20`) | domena 7 #13–#15 | wysoka |
| 19 | Wyjścia dla zabezpieczeń doziemnych (metoda, nastawy) | DO-PRZEPROJEKTOWANIA | `v126_academic.py:1731-1775` `_earth_fault_detection`: `u0_start=5.0`, `p0_set_w=1.0`, `i5_multiplier=3.0` literały bez proweniencji, 0 testów wartości | fabrykacja nastaw w rdzeniu — OD-15; prezentacja W2 | wysoka |

### 3.4 Domena 4 — Protection & Measurement

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Fizyka IDMT IEC 60255-151 | ZDUPLIKOWANE ×5 | (1) `network_model/solvers/protection_iec60255.py:370-598` KEEP → adapter `protection/curves/iec_curves.py`; (2) `domain/protection_engine_v1.py:483-560`; (3) `application/protection_analysis/engine.py:191-227` — **tor kanoniczny `protection_sn`** (`enm/canonical_analysis.py:1796`); (4) `application/analyses/protection/overcurrent/calculator.py:121-124`; (5) `enm/domain_operations_v2.py:95-116` | stałe dziś identyczne (0,14/0,02) — rozjazd nieuchronny bez guarda; `backend_no_physics_guard.py` istnieje (§6) ale nie zna IDMT | wysoka |
| 2 | Metodyka nastaw nadprądowych | ZDUPLIKOWANE ×3 | `application/protection_settings/engine.py:211+` (Hoppel/IRiESD) · `overcurrent/calculator.py:9-13` (inny endpoint/ekran) · `line_overcurrent_setting/` (1880; konsument tylko generator wzorców) | — | wysoka |
| 3 | Kryterium ALF / nasycenie CT | ZDUPLIKOWANE ×2 | `domain/dobor_przekladnika.py:252-253` (bez obciążenia wtórnego) vs `equipment_checks/ct_burden_saturation.py` (pełne ALF_eff) | prosty check może dać PASS tam, gdzie pełny FAIL | wysoka |
| 4 | Bilans obciążenia CT / spadek VT | ISTNIEJE-ZWERYFIKOWANE | `equipment_checks/{ct_burden_saturation,vt_burden_voltage_drop}.py` (42 testy); `ui2/kryteria/SekcjaBilansuCtVt.tsx` | — | wysoka |
| 5 | Dobór CT/VT | CZĘŚCIOWE | jak domena 2 #3 | tylko pole wytwórcy | wysoka |
| 6 | 50/51 | ISTNIEJE-ZWERYFIKOWANE (fizyka zduplikowana) | model + `czas_wylaczenia_*` + koordynacja + `ui2/wyniki/koordynacja` | — | wysoka |
| 7 | 50N/51N | CZĘŚCIOWE | `FUNCTION_TYPE_MAP` (`application/field_read_model.py:53-61`), wejście 3I0 | 3I0 z solvera nieróżnicującego uziemienia (`short_circuit_iec60909.py` 0 wystąpień `isolated`/`petersen`) | wysoka |
| 8 | 67/67N | BRAK | flaga `is_directional: bool` (`enm/models.py:83`) bez RCA/polaryzacji/sektora; 0 kryterium kierunkowego | — | wysoka |
| 9 | Y0>/G0>/B0> (admitancyjne) | BRAK | 0 trafień | — | wysoka |
| 10 | 27/59 ogólne | BRAK | brak w `function_type` (`enm/models.py:57-71`) | — | wysoka |
| 11 | 81U/81O/81R/78 | CZĘŚCIOWE | tylko kontekst LoM (`application/analyses/ochrona_lom.py`); 78 zawsze INFO (`:190-198`) | nie jako ogólna funkcja pola | wysoka |
| 12 | 21/21N | BRAK | 0 trafień `distance_relay`/`zone1` | — | wysoka |
| 13 | 87/87T/87BB/87L | BRAK | tylko etykieta w `der_protection_functions.py:327,371-374`; fragment `blocking_87t_recommended` (`v126_academic.py:1858`) | — | wysoka |
| 14 | 79 SPZ | BEZ-KONSUMENTA (zapis) | `SpzState` (`enm/models.py:1185`), `BayProtectionControlUnit.spz` (1225-1232); `field_read_model.py:780` `spz=None` zawsze; 0 operacji zapisu; ekran read-only `ui2/model/zabezpieczenia-automatyka/EkranZabezpieczenAutomatyki.tsx:17-19` | koordynacja LoM×SPZ zawsze INFO | wysoka |
| 15 | 50BF, 25 | BRAK (flagi obecności) | `field_read_model.py:774-780` (`arc_protection_enabled: False` zaszyte), `Bay.requires_synchrocheck` (1305) | brak logiki czasowej LRW, brak fizyki synchronizmu | wysoka |
| 16 | Grupy nastaw, TRIP matrix | BRAK | 0 trafień `setting_group`/`trip_matrix` | — | wysoka |
| 17 | TCC, czułość, selektywność, bieg koordynacji | ISTNIEJE-ZWERYFIKOWANE | `coordination/analyzer.py` (920); `api/protection_coordination.py:337-442,461,512,532`; `ui/protection-coordination/` w `ui2/wyniki/koordynacja/EkranKoordynacji.tsx:24,99` | — | wysoka |
| 18 | Edycja nastaw po utworzeniu przekaźnika | POZORNIE-ISTNIEJE | `update_relay_settings` stub `relay.legacy_write_disabled` (`enm/domain_operations_v2.py:1061-1076`); `modules/sld/cdse/modalDispatcher.ts:98` → `EditProtectionModal` (0 plików) | jedyna droga = skasuj i dodaj przekaźnik | wysoka |
| 19 | Zapis nastaw z koordynacji do modelu | BRAK | domena 1 #9 | — | wysoka |
| 20 | Raport koordynacji PDF/DOCX, pakiet nastaw | ISTNIEJE-ZWERYFIKOWANE | `network_model/reporting/protection_report_{pdf,docx}.py` (żywe: `api/protection_coordination.py:597-691`); `application/proof_engine/pakiet_nastaw.py` (`api/analysis_runs.py:621`) | — | wysoka |
| 21 | IEC 61850 / SCL | CZĘŚCIOWE | `ui/sld/v2/export/exportIec61850.ts` (107) — szkielet SCD po stronie klienta | brak IED/LDevice/LNode, importu, backendu | wysoka |
| 22 | Etykieta krzywej „RI" | DO-PRZEPROJEKTOWANIA (B-01, W-6) | `protection_iec60255.py:17,50,72,80,88` (formuła LTI pod nazwą RI); adapter `iec_curves.py:57,66` już LTI | wykonanie pod B-01 — OD-15(e) | wysoka |
| 23 | Martwe: `domain/protection_report_model.py`, `domain/protection_coordination_v1.py` (446), `enm/migrations/v_ports_001.py` | DO-KASACJI | 0 konsumentów produkcyjnych (tylko własne testy) | W1 (przegląd martwego kodu) | wysoka |
| 24 | Blokady łącznikowe | ISTNIEJE (inna zdolność) | `enm/interlock_rules.py` | to blokady manewrowe, nie logika zabezpieczeń (ZSI/blocking) | wysoka |

### 3.5 Domena 5 — OZE / BESS / RfG

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | PV w ENM + rozpływ | CZĘŚCIOWE | `enm/models.py:493-538`, `power_flow_inverter.py:49-90`; kreator `ui2/kreatory/zrodlo-oze/` | `PowerFlowResult` nie niesie, który tryb zadziałał ani czy limit Q osiągnięto | wysoka |
| 2 | Energetyka wiatrowa | CZĘŚCIOWE | `gen_type` `wind_inverter`/`fw_pmsg`/`fw_dfig`/`fw_scig`; katalog 20 turbin (`network_model/catalog/wind_turbines/catalog.py`) | brak krzywej mocy (prędkość wiatru → P) | średnia |
| 3 | BESS jako magazyn | CZĘŚCIOWE / BRAK | domena 1 #7 | SOC, pojemność, sprawność, harmonogram | wysoka |
| 4 | Grid-forming / grid-following | BACKEND-BEZ-TOKU-PRACY | `catalog/der_dynamic/models.py:20`, `mv_converter_catalog.py:726,1047,1066`, `audit2_catalogs.py:105,1229-1236`; jedyny konsument `stability_rms` (bez konsumenta) | rozpływ nie zna trybu voltage-source | wysoka |
| 5 | Q(U), cosφ(P), LFSM P(f) | ISTNIEJE-ZWERYFIKOWANE | `power_flow_inverter.py:93-108`; 45 testów | — | wysoka |
| 6 | Adekwatność mocy biernej | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/reactive_adequacy.py`; `GET /api/oze-analysis/reactive-adequacy`; `ui2/oze/pulpit/SekcjaAdekwatnosciQ.tsx` | — | wysoka |
| 7 | Siła sieci (SCR/WSCR) | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/grid_strength.py` czyta wynik biegu SC; `ui2/oze/pulpit/SekcjaSilySieci.tsx` | — | wysoka |
| 8 | Hosting capacity | ZDUPLIKOWANE | (a) `application/analyses/hosting_capacity.py` (pełny rozpływ; 35 testów; `ui2/oze/zdolnosc`) vs (b) `v126_academic.py:1978-2077` (Monte Carlo, wrażliwość lokalna bez sprzężenia sieciowego; testy tylko izolacji RNG) | dwie liczby bez uzgodnienia | wysoka |
| 9 | Rozszerzony model wkładu zwarciowego DER | BEZ-KONSUMENTA | `network_model/catalog/types.py:303-306,347-353,1277` (`sc_pq_split`, `sc_transient_k`, `sc_sustained_k`) — 0 odwołań w `src`/`tests` | pola katalogu, których nic nie czyta | wysoka |
| 10 | FRT / HVRT | ISTNIEJE-ZWERYFIKOWANE (z zastrzeżeniem) | `network_model/solvers/frt_hvrt/engine.py`; adaptery `frt_trajektorie.py`, `frt_sekwencja.py`; `ui2/oze/frt/` | stałe `tp=0.1`, `tiq=0.02`, `K=2.0` (`engine.py:39-40,65`) jednakowe dla każdego urządzenia — OD-15(b) | wysoka |
| 11 | Ochrona przed pracą wyspową (LoM) | CZĘŚCIOWE | `ochrona_lom.py` (446); `ui2/oze/lom/` | koordynacja z SPZ strukturalnie niemożliwa (spz=None) | wysoka |
| 12 | NC RfG / PTPiREE macierz | CZĘŚCIOWE | `ncrfg_ptpiree/engine.py` (972); 5 profili operatorów; `ui2/oze/macierz/` | `GET /api/ncrfg-tests/cases/{case_id}/compliance` (przekrojowa) bez UI | wysoka |
| 13 | `source_compliance` | BACKEND-BEZ-TOKU-PRACY / ZDUPLIKOWANE wobec #12 | `application/compliance/source_compliance.py` (322); `_execute_source_compliance`; 0 plików `ui2` | trzecia ścieżka FRT/Q(U)/cosφ(P) | wysoka |
| 14 | Macierz gotowości DER (przycisk „Uruchom obliczenia") | UI-BEZ-ZDOLNOŚCI (martwy klik) | `ui/network-build/station-der/macierzAnaliz.ts:58-61,118,154` → `MacierzAnalizSekcja.tsx:18,38,93` (`onDzialanie?`) → `ui/workspace/surfaces/DerSurfaces.tsx:1313` bez propa; osiągalne przez `ui2/legacy/LegacyInspektor.tsx:20,35` | W2 | wysoka |
| 15 | Warunki przyłączenia OSD | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/warunki_przylaczenia.py`; `GET /api/quality/connection-conditions`; `ui2/wyniki/jakosc/` | — | średnia-wysoka |
| 16 | Dokumenty OSD (wniosek, certyfikat, studium, odpowiedź) | ISTNIEJE-ZWERYFIKOWANE | 6 modułów w `api/oze_analysis_runs.py:41-89`; `ui2/oze/{osd,wniosek,studium}`; PDF wniosku ma konsumenta `ui2/oze/wniosek/EkranWniosku.tsx` + `ui2/oze/api.ts` (KOREKTA §6) | — | wysoka |
| 17 | Kompensacja, obszar i pokrycie P-Q | ISTNIEJE-ZWERYFIKOWANE | `dobor_kompensacji.py`, `pq_area.py`, `pq_coverage.py`; `ui2/oze/{kompensacja,obszar,krzywe}` | — | wysoka |

### 3.6 Domena 6 — Power Quality & Dynamics

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Migotanie (Pst/Plt, RVC) | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/migotanie.py` (każda stała z cytatem IEC/TR 61000-3-7); Sk'' z biegu SC; `GET /api/quality/flicker` | formuła w `application/` (litera reguły NOT-A-SOLVER) — przeniesienie bez zmiany liczb w W6 | wysoka |
| 2 | Stabilność dynamiczna / RMS | DO-PRZEPROJEKTOWANIA (**P0 fabrykacja**) | (a) prawdziwy solver `network_model/solvers/stability_rms/engine.py:292` — 0 konsumentów poza własnym pakietem; (b) tor produkcyjny `enm/canonical_analysis.py:1471-1489` buduje `FaultClearScenario` z `run.options` z domyślnymi 10°/75°/28°/0,97/0,99; `application/stability/dynamic_stability.py:142-179` = progi; `voltage_trajectory.py:57-103` krzywa szablonowa τ=0,3 s; ekran `ui2/wyniki/stabilnosc/EkranStabilnosci.tsx` bez formularza scenariusza; jedyny twórca biegu `creator-harness-main.tsx:3916-3922` | werdykt STABLE/UNSTABLE niezależny od sieci — W2 (uczciwość) + W6 (RMS) | wysoka |
| 3 | SSCI / PLL | ISTNIEJE-ZWERYFIKOWANE | `v126_academic.py:540-786` (Cespedes-Sun, `pll_bandwidth_hz` z katalogu); `ui2/wyniki/ssci/` | — | wysoka |
| 4 | Harmoniczne / THD / TDD / rezonans | CZĘŚCIOWE | `v126_academic.py:240-520` (18 rzędów, limity EN 50160 / IEEE 519) | brak interharmonicznych; ekran „akademicki", nie „Jakość"; odwzorowanie kondensatorów/filtrów w skanie niezweryfikowane | wysoka/niska |
| 5 | Rozruch silników | CZĘŚCIOWE | `v126_academic.py:149-150,1882` (statyczny) | brak modelu dynamicznego (moment, czas rozruchu) | wysoka |
| 6 | Ekran „Jakość" (sanity, energia, profil, arc flash, estymacja) | ISTNIEJE-ZWERYFIKOWANE | `api/quality_analysis_runs.py:43-56`; `ui2/wyniki/jakosc/EkranJakosci.tsx` (107 testów) | nazwa „jakość" = kontrola wiarygodności wyniku, nie PQ | wysoka |
| 7 | Asymetria (napięcia/prądu/strat per faza) | CZĘŚCIOWE | `network_model/solvers/phase_state_sn.py:85-238` — odchylenie od średniej faz, nie VUF (`|U2|/|U1|`) | etykieta w UI sugeruje wskaźnik normatywny — W2 (etykieta), OD-15(c) (VUF w rdzeniu) | wysoka |
| 8 | ROCOF (df/dt sieci) | CZĘŚCIOWE | tylko jako nastawa 81R (LoM) | symulacja wymaga #2 | wysoka |
| 9 | Praca wyspowa (zachowanie wyspy) | CZĘŚCIOWE | wymóg ochrony (LoM) tak; dynamika wyspy nie | zależne od #2 | średnia |
| 10 | Zintegrowany raport EN 50160 / IEC 61000 | BRAK | 6 plików z progiem `50160` lokalnie, 0 agregatorów | — | wysoka |
| 11 | Zdarzenia PQ z pomiaru (zapady/wzrosty/przerwy) | BRAK | trafienia tylko w scenariuszach FRT | narzędzie projektowe — niski priorytet | wysoka |

### 3.7 Domena 7 — LV / Earthing

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Model fazowy nN (L1/L2/L3/N/PE/PEN) | BRAK | domena 1 #11; `ADR-015` PROPOSED | — | wysoka |
| 2 | Rozpływ niesymetryczny (BFS 3-fazowy, VUF, prąd w N) | BEZ-KONSUMENTA | `network_model/solvers/power_flow_unbalanced.py` (522); jedyny konsument `application/reference_networks/library.py:273,285`; nie w `application/solvers/solver_capability_registry.py` | inżynier nie policzy asymetrii własnej sieci | wysoka |
| 3 | Pętla zwarcia TN (IEC 60364-4-41) | ISTNIEJE-ZWERYFIKOWANE | `fault_loop_iec60364.py`, `fault_loop_builder.py`, `application/analyses/fault_loop/{route,service}.py` (105 testów, krzyżowa z IEC 60909); `api/enm.py:326-361`; `ui2/inspector/SekcjaPetlaZwarcia.tsx` | — | wysoka |
| 4 | Pętla TT / IT | BRAK | `fault_loop_iec60364.py:189-200` `NotImplementedError`; serwis zwraca „nie dotyczy" (`fault_loop/service.py:76-84`) | kreator pozwala wybrać TT/IT (#11) | wysoka |
| 5 | `POST /api/fault-loop/compute` (ręczne R+X) | BACKEND-BEZ-TOKU-PRACY → DO-KASACJI | `api/fault_loop.py` (140): 0 testów, 0 FE | następca: #3 (ekstrakcja z modelu) | średnia |
| 6 | SWZ (werdykt 3-stanowy) | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/swz/{service,werdykt}.py`; `GET …/enm/swz` | dziedziczy ograniczenie TN | średnia-wysoka |
| 7 | Dobór/koordynacja aparatów nN (MCB/MCCB/gG) | ISTNIEJE-ZWERYFIKOWANE | `protection_lv_curves.py` (796; tablice normatywne), `nn_circuit_sheet.py` (1064), `nn_device_selection.py`; 153 testy | dobór bez UI (domena 2 #5) | wysoka |
| 8 | Spadki napięć nN | ISTNIEJE-ZWERYFIKOWANE | `cable_voltage_drop.py` (hand-calc) | — | wysoka |
| 9 | Pakiet dowodowy obwodu nN | ISTNIEJE-ZWERYFIKOWANE | `packs/lv_circuit_verification.py` (1045) + binding; `api/nn_proof.py:99,186,273`; `ui/sld/v2/proof/NnCircuitProofPanel.tsx` | — | średnia-wysoka |
| 10 | Widok domeny nN (SN→TR→nN→odbiór) | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/lv_domain/**` (2631 linii); `api/enm.py:364-444`; `ui/sld/v3/lv-domain/LvDomainView.tsx` (1530); e2e 2 speców | — | wysoka |
| 11 | Wybór układu sieci nN | CZĘŚCIOWE / DO-KASACJI (bliźniak) | zapis `Substation.meta["nn_earthing_system"]`, walidator E063 (`enm/validator.py:1953-1983`); żywy `ui2/kreatory/stacja`; martwy `ui/topology/EarthingSystemSelector.tsx` (0 importerów) | — | wysoka |
| 12 | Uziemienie — reprezentacje | ZDUPLIKOWANE ×6 | domena 1 #12 | — | wysoka |
| 13 | Most SC_1F → napięcie dotykowe | BEZ-KONSUMENTA | `earthing/ground_fault_bridge.py:65-150`; 8 testów; 0 API/UI | R_u nigdy nie pisane (1 #12 c) | wysoka |
| 14 | Napięcie krokowe w łańcuchu modelu | BRAK | `ground_fault_bridge.py:18-20` (dług nazwany) | liczone tylko w #15 | wysoka |
| 15 | Projekt uziemienia siatki IEEE 80 / EN 50522 | ISTNIEJE-ZWERYFIKOWANE (odcięte od modelu) | `v126_academic.py:1190-1286` (Sverak, GPR, U_t/U_s, werdykt); formularz `V126EarthingInput` | nie czyta danych stacji z ENM | wysoka |
| 16 | Petersen / NER | ISTNIEJE-ZWERYFIKOWANE (formularz osobny) | `v126_academic.py:1288-1397+` (21 testów) | — | wysoka |
| 17 | RCD | BRAK | 0 trafień poza komentarzem `fault_loop_iec60364.py:26-28` | — | wysoka |
| 18 | Eksport arkusza nN (XLSX/CSV) | BRAK | 0 w `nn_circuit_sheet.py`/`api/enm.py` | — | średnia |

### 3.8 Domena 8 — SLD / CAD / GIS

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Semantyka SLD SN z ENM | DO-PRZEPROJEKTOWANIA | klient: `ui/sld/v2/canvas/enmToSldAdapter.ts` (6831), `ui/sld/v3/electrical/terminalGraph.ts:190`, `station-rozdzielnia/autolayout/network/sldNetwork53.ts` (987) | logika domenowa w warstwie prezentacji bez niezależnej ścieżki backendowej | wysoka |
| 2 | Backendowy silnik projekcji SLD | BEZ-KONSUMENTA → DO-KASACJI | `application/sld/**` (10 plików) + `network_model/sld_projection.py` (233); 103 testy; jedyny importer `network_wizard/service.py` (martwy wobec API) | decyzja architekta: projektuje legacy `NetworkSnapshot`, nie ENM — nie jest bazą dla W7 | wysoka |
| 3 | Persystencja diagramu SLD (ORM) | DO-KASACJI | `SldDiagramORM`/`SldNodeSymbolORM`/`SldBranchSymbolORM`/`SldAnnotationORM` (`models.py:651-688`), `sld_repository.py` (224); jedyny pisarz `network_wizard/service.py:1049…1400`; `api/sld.py:26` overlay po `diagram_id` nieosiągalny z realnymi danymi | — | wysoka |
| 4 | Nadpisania geometrii (drag, trasy) | BEZ-KONSUMENTA | `api/sld_overrides.py:108` magazyn w pamięci procesu; 12 testów; 0 FE | utrata poprawek przy restarcie | wysoka |
| 5 | Auto-layout | ISTNIEJE-ZWERYFIKOWANE | `engine/sld-layout/{layoutEngine,lodController,topologyTree}.ts`; SLD Determinism CI | — | wysoka |
| 6 | Biblioteka symboli | ISTNIEJE-ZWERYFIKOWANE | `ui/sld/canonical_symbols/` 54 SVG + `ports.json`; kontrakt `symbolContract.test.ts` | — | wysoka |
| 7 | Styl CAD nN (L2) | ISTNIEJE-ZWERYFIKOWANE | `ui/sld/v3/cad/{CadSymbol.tsx,cadSymbolRegistry.ts}` | to styl rysunku, nie interoperacyjność CAD | wysoka |
| 8 | Arkusze, tabliczka, legenda | ISTNIEJE-ZWERYFIKOWANE | `ui/sld/v3/sheet/`, `export/sheetTitleBlock.tsx` | — | średnia-wysoka |
| 9 | Nakładki wyników/zabezpieczeń | ISTNIEJE-ZWERYFIKOWANE | `ui/sld-overlay/` (18 plików; guard `overlay_no_physics_guard`) | — | wysoka |
| 10 | Eksport SVG/PDF/DXF/CIM/IEC 61850 | ISTNIEJE-ZWERYFIKOWANE | `ui/sld/v3/export/` (`EXPORT_BUILDERS` wymusza 5 formatów); `SldCanvasV3Workspace.tsx:193` | — | wysoka |
| 11 | CAD interoperacyjność (import DXF, tożsamość bloków, round-trip, konflikty) | BRAK | backend 0 trafień `dxf`/`zwcad`; frontend tylko eksport | — | wysoka |
| 12 | GIS | BRAK | 0 trafień `geojson`/`shapefile`/`wgs84`/`epsg` | — | wysoka |
| 13 | GPZ — kompozycja pól | CZĘŚCIOWE | `ui/sld/v3/compose/gpz.ts`; 14 kluczy `DEFERRED_GPZ_PARITY_KEYS` (P1-11: 12 dekoracja SCADA, 2 detal glifu) | — | wysoka |
| 14 | Stany łączeniowe na symbolu (w tym NIEZNANY) | ISTNIEJE-ZWERYFIKOWANE | `cadSymbolRegistry.ts` `CadSwitchState` | — | średnia-wysoka |
| 15 | Portal nN na kanwie SN | ISTNIEJE-ZWERYFIKOWANE | domena 7 #10 | — | wysoka |
| 16 | Determinizm wizualny w CI | ISTNIEJE-ZWERYFIKOWANE (dyscyplina) | `.github/workflows/sld-determinism.yml`; 15 speców `e2e/sld-*.spec.ts` | werdykt wizualny = B-02 | średnia |
| 17 | Rewizje rysunku (odrębne od modelu) | BRAK | — | — | średnia |

### 3.9 Domena 9 — Optimization & Reliability

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Kontyngencje N-1 | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/kontyngencje_n1.py` (pełny re-solve, `build_energy_validation_view`; 43 testy); `ui2/wyniki/kontyngencje/` | — | wysoka |
| 2 | Niezawodność (SAIDI/SAIFI) + ranking N-1 | ZDUPLIKOWANE / DO-PRZEPROJEKTOWANIA | `v126_academic.py:1069-1180`; `_branch_current_a` (1060-1067) = S szyny docelowej/(√3·U); testy tylko `saidi>=0` (`test_v126_academic_solver.py:149-152`) | fizycznie błędne dla gałęzi nieliściowych; brak ostrzeżenia w UI | wysoka |
| 3 | Odtwarzanie zasilania (restoration) | BRAK | 0 trafień | — | wysoka |
| 4 | Optymalizacja NOP / rekonfiguracja | BRAK | katalog `analysis/optimization/` nie istnieje | — | wysoka |
| 5 | Ranking słabych punktów w stanie normalnym | CZĘŚCIOWE | tylko w kontekście N-1 | — | średnia |
| 6 | Straty (obliczenie) | ISTNIEJE-ZWERYFIKOWANE | `power_flow_result.py:99-117,237-262`; `ui2/wyniki/rozplyw/TabelaGalezi.tsx` | — | wysoka |
| 7 | Optymalizacja strat | POZORNIE-ISTNIEJE / ZDUPLIKOWANE | `v126_academic.py:2114-2178` `_opf_loss_lcc`: `oltc_tap_position: 0` zaszyte, NOP nieoceniany; prawdziwa `optimize_tap_positions` (domena 3 #8) | — | wysoka |
| 8 | Planer wzmocnień | DO-KASACJI | `design_synth` (domena 2 #7) | — | wysoka |
| 9 | Alternatywy punktów przyłączenia | BRAK | 0 trafień | — | wysoka |
| 10 | Hosting capacity | ZDUPLIKOWANE | domena 5 #8 | — | wysoka |
| 11 | Optymalizacja wielokryterialna | BRAK | 0/9 klas z `docs/twin/MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md` (PROPOZYCJA) | — | wysoka |
| 12 | Model ekonomiczny / CAPEX | BRAK | 0 pól kosztu w `network_model/catalog/**` | OD-16 (źródło danych) | wysoka |
| 13 | Wrażliwość ∂U/∂P, ∂U/∂Q | ISTNIEJE | `analysis/sensitivity/`, `analysis/lf_sensitivity/` (perturbacje) | metoda droższa niż jakobian | średnia |
| 14 | Porównanie wariantów (UI) | ISTNIEJE-ZWERYFIKOWANE | `ui2/wyniki/porownanie/` (153 testy vitest, e2e) | — | wysoka |
| 15 | Symulacja roczna / QSTS | BRAK | domena 3 #9 | — | wysoka |

### 3.10 Domena 10 — Reporting / WHITE BOX / Compliance

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Ślad WHITE BOX | ISTNIEJE-ZWERYFIKOWANE | `GET /analysis-runs/{id}/trace[/summary]`; `ui/proof/TraceViewer.tsx` reużywany przez `ui2/wyniki/dowod/**` | — | wysoka |
| 2 | Pakiety dowodowe (18 typów `ProofType`) | ISTNIEJE-ZWERYFIKOWANE | `application/proof_engine/` (13 031 + `packs/` 4783 linii); 310 testów | — | wysoka |
| 3 | `Q_U_REGULATION` pack | BEZ-KONSUMENTA | `packs/qu_regulation.py` (407); 23 testy; 0 wpięć API/UI | — | wysoka |
| 4 | `PROTECTION_OVERCURRENT` (`protection_settings`) pack | ISTNIEJE-ZWERYFIKOWANE | `pakiet_nastaw.py:23`; `GET /analysis-runs/{id}/pakiet-dowodowy-nastaw` | KOREKTA inwentarza 2026-08-08 (§6) | wysoka |
| 5 | Pakiet dowodowy biegu (ZIP z odciskiem) | ISTNIEJE-ZWERYFIKOWANE | `pakiet_biegu.py` (619); `api/analysis_runs.py:557,568`; `ui2/wyniki/dowod/PakietDowodowy.tsx` | — | wysoka |
| 6 | Legacy raporty SC/PF/analysis-run DOCX/PDF | DO-KASACJI | `network_model/reporting/{short_circuit,power_flow,analysis_run}_report_{docx,pdf}.py` + `export_{docx,pdf}.py` — 8 plików / 3574 linii / 39 testów bez konsumenta (`tests/test_export_reports.py`) | następca: `api/analysis_run_exports.py` (1848) + `api/power_flow_comparisons.py`; raporty zabezpieczeń (`protection_report_*`) są ŻYWE — nie kasować | wysoka |
| 7 | Live raport biegu (JSON/DOCX/PDF) | ISTNIEJE-ZWERYFIKOWANE | `api/analysis_runs.py:387-486` | — | wysoka |
| 8 | Porównania A/B (rozpływ, zabezpieczenia, zwarcia) | ISTNIEJE-ZWERYFIKOWANE | `api/{power_flow_comparisons,protection_comparisons,zwarcia_porownania}.py`; `ui2/wyniki/porownanie/` z `PanelProweniencji.tsx` | — | wysoka |
| 9 | Proweniencja parametru w edytorze | CZĘŚCIOWE | `solver_input/provenance.py` (`SourceKind`, `FieldQuality`); brak wskaźnika przy polu w kreatorach `ui2` | — | średnia |
| 10 | Dziennik zmian (przyczyna) | ISTNIEJE-ZWERYFIKOWANE | `enm/dziennik_zmian.py`; `ui2/freshness/{dziennikApi,ListaZmianOdBiegu,PanelCoSieZmienilo}` | — | wysoka |
| 11 | Rewizje z integralnością | ISTNIEJE-ZWERYFIKOWANE | domena 1 #13 | — | wysoka |
| 12 | Świeżość wyniku/dowodu/raportu | ISTNIEJE-ZWERYFIKOWANE | 12 ekranów; 39 testów | — | wysoka |
| 13 | Dokumenty OSD | ISTNIEJE-ZWERYFIKOWANE | domena 5 #16 | — | wysoka |
| 14 | Zgodność z wymaganiami OSD (Reference Engine) | ISTNIEJE-ZWERYFIKOWANE | `reference_engine/compliance.py`, pakiety `osd_{enea,energa,tauron,pge}`; `GET /cases/{id}/reference/compliance`; `ui2/referencje/` | — | wysoka |
| 15 | Zestawienie urządzeń (BOM) | CZĘŚCIOWE | `application/analyses/lista_materialowa.py` — tylko tor DER-SN (`GET /api/der-sn/{case_id}/bom`) | brak BOM całego projektu/stacji | wysoka |
| 16 | Eksport SLD (rysunek) | ISTNIEJE-ZWERYFIKOWANE | domena 8 #10 | — | wysoka |
| 17 | Pakiet projektu do podpisu | BRAK (spec bez kodu) | `docs/export/PAKIET_PROJEKTU_DO_PODPISU.md` (BINDING v1.0) — 0 trafień w `api/`/`application/` | — | wysoka |
| 18 | Rejestr założeń | BRAK | 0 trafień; `ProofStep` bez pola założeń | — | wysoka |
| 19 | Raport as-built / arc flash | ISTNIEJE-ZWERYFIKOWANE | `api/quality_analysis_runs.py` (`/as-built-compliance`, `/arc-flash/report`) | as-built bezstanowe (domena 11) | średnia |
| 20 | V12.6 „akademicki" dowód/raport | ZDUPLIKOWANE (architektura równoległa) | `v126_academic.py` + `api/v126_academic.py` + `application/v126_artifacts.py` nie importują `application/proof_engine` | — | wysoka |

### 3.11 Domena 11 — Commissioning / As-built

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Cykl życia projektu (DESIGN→…→OPERATIONAL BASELINE) | BRAK | 0 trafień `project_stage`/`lifecycle`; E1–E8 to etapy pracy w narzędziu | — | wysoka |
| 2 | Zgodność powykonawcza (pomiar U/P/Q vs model) | ISTNIEJE-ZWERYFIKOWANE / CZĘŚCIOWE jako odbiór | `application/analyses/zgodnosc_powykonawcza.py` (520; 35 testów); `POST /api/quality/as-built-compliance` bezstanowe; `ui2/wyniki/odbior/EkranOdbioru.tsx` (29 testów); 0 e2e | brak trwałości, dokumentu, innych wielkości niż U/P/Q | wysoka |
| 3 | Sprawdzenia zabezpieczeń, iniekcja wtórna, FAT/SAT, kalibracja | BRAK | 0 trafień | — | wysoka |
| 4 | Weryfikacja zainstalowanego urządzenia | BRAK | `protection_vendors.py::VerificationStatus` = wiarygodność danych katalogowych, inne znaczenie | — | wysoka |
| 5 | As-built → linia bazowa (rewizje z semantyką, autor) | CZĘŚCIOWE | `enm/rewizje.py`, `envelope.py`, `dziennik_zmian.py` (`WpisDziennika` bez autora) | — | wysoka |
| 6 | Protokół odbioru / karta pomiarowa | BRAK | — | — | wysoka |
| 7 | Import COMTRADE / zdarzeń | BRAK | 0 trafień poza misją | — | wysoka |
| 8 | Estymacja stanu WLS | ISTNIEJE-ZWERYFIKOWANE (wyrocznia syntetyczna) | `network_model/solvers/state_estimation_wls.py` (37 testów); `ui2/wyniki/estymacja/` | bezstanowa; brak walidacji na danych SCADA/PMU (nazwane w docstringu) | wysoka |

### 3.12 Domena 12 — MCP Engineering Control Plane i tok pracy

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Warstwa MCP / agentowa | BRAK | 0 trafień w `backend/src` i `frontend/src` | — | wysoka |
| 2 | Powierzchnia zdolności REST | ISTNIEJE-ZWERYFIKOWANE | 350 tras / 63 moduły; `router_mount_guard.py` (3 routery świadomie odstawione: `archive_diff`, `incremental_archive`, `cloud_backup`) | — | wysoka |
| 3 | Transakcyjność | CZĘŚCIOWE | `enm/store.py` (RLock per twin, atomowy zapis, wycofanie); `POST /enm/domain-ops` jedyna droga zapisu w produkcji (`api/enm.py:1333-1338`); CAS `snapshot_base_hash` nieużywany przez klientów (`api/enm.py:1216,1236`) | brak ochrony przed zgubioną aktualizacją między sesjami | wysoka |
| 4 | Uprawnienia / perymetr | BRAK | `api/middleware.py` (tylko request-id), `dependencies.py`; 0 tras chronionych; decyzja właściciela 2026-08-05 (`PLAN_PRZEBUDOWY_10X_2026-07.md:203-225`) | konflikt z misją §15 — OD-13 | wysoka |
| 5 | Proweniencja | ISTNIEJE (domena 10 #9) | — | — | średnia |
| 6 | Rollback do rewizji jako operacja | CZĘŚCIOWE | odczyt+weryfikacja tak; `enm/store.py:455 restore_enm` tylko dla importu archiwum; `PUT /enm` wyłączony w produkcji; brak ekranu rewizji z akcją | — | wysoka |
| 7 | Audytowalność | ISTNIEJE-ZWERYFIKOWANE | dziennik z przyczyną; `audit_trail` w odpowiedzi `domain-ops` | — | wysoka |
| 8 | Niezależna weryfikacja (mechanizm) | ISTNIEJE-ZWERYFIKOWANE | `solver_diff_guard.py`; `KlasaWyroczni.INDEPENDENTLY_VERIFIED`/`NORMATIVE` w `tests/golden/registry.py` | pokrycie nierówne (#12) | wysoka |
| 9 | Następna najlepsza akcja | CZĘŚCIOWE | jeden silnik `ui2/proces/nastepnaAkcja.ts`; `fixActionRouting.ts` (poziom kodu, reużyty) | E6–E8 milczy | wysoka |
| 10 | Cel projektu / Definition of Done | CZĘŚCIOWE (UI bez zdolności śledzenia) | `ui2/spaces/projekt/otworz/CelProjektu.tsx` (4 kafle; 17 testów); `api/projects.py::ProjectCreate` bez pola celu; 0 trackera DoD | pokryte 2–4 z ~8 celów misji | wysoka |
| 11 | Role inżynierskie jako projekcje stanu | BRAK | 0 trafień w `ui2` (persony tylko w audytach) | — | wysoka |
| 12 | Projekty akceptacyjne A–F (misja §24) | CZĘŚCIOWE, nierówne | rejestr `tests/golden/registry.py`: A=G02 PARTIAL (`critical-run-flow.spec.ts`), B=G03 PARTIAL (N-1 na innej fikturze), C=G06 PARTIAL + INDEPENDENTLY_VERIFIED (`critical-oze-evidence.spec.ts`), D=G04 PARTIAL, E=G01 **NOT_BUILT** (w rejestrze nazwana „pierwszy vertical slice"), F=G11 **NOT_BUILT** | C > A > D ≈ B > E ≈ F | wysoka |
| 13 | Propagacja znanych danych (misja §19) | CZĘŚCIOWE (próbka) | `ui2/kreatory/pole/KreatorPolaSn.tsx` + `stacja/stacjaModel.ts` (`snVoltageOdczyt`) | zweryfikowano 1 z 23 kreatorów | niska |

---

## 4. Klasy defektów przekrojowych (KLASA, NIE INSTANCJA)

| Klasa | Instancje (inwentarz zmierzony) | Wycinek |
|---|---|---|
| **K-A Druga prawda sieci** | legacy ORM `network_*` 6 tabel + 3 pisarze/czytelnicy; import XLSX tylko do legacy; ZIP podwójny zapis; `catalog_governance` czyta legacy; `NetworkWizardService`; SLD ORM + `api/sld.py`; stan łączeniowy ×2; uziemienie ×6; tabele katalogu w bazie pisane przez governance, nieczytane przez operacje domenowe (1 #24); N-1 na innej fikturze niż G03; semantyka SLD w kliencie bez ścieżki backendowej | W1 (ORM, XLSX, ZIP, governance, wizard, SLD ORM), W5 (uziemienie, stan łączeniowy), W7 (SLD), W8 (G03) |
| **K-B Fizyka poza solverami / duplikaty fizyki** | IDMT ×5; metodyka nastaw ×3; ALF ×2; hosting ×2; ranking N-1 ×2; straty/OLTC ×2; `_branch_current_a`; `source_compliance` vs NC RfG; stabilność fasadowa vs `stability_rms`; Pst w `application/`; guard `backend_no_physics_guard.py` bez rodzin IDMT/prądu gałęzi | W3 (adaptery, kasacje, rodziny guarda), W6 (RMS, Pst), OD-15(d) (v126) |
| **K-C Wartości bez proweniencji / fasady** | stabilność 10°/75°/28°/0,97/0,99 + τ=0,3; `_earth_fault_detection` 5,0/1,0/3,0; FRT 0,1/0,02/2,0; asymetria ≠ VUF; `spz=None`, `arc_protection_enabled: False`; `design_synth` placeholder; `oltc_tap_position: 0`; `frequency_hz` i katalogi ACME (M0-4, częściowo domknięte) | W2 (prezentacja/aplikacja), OD-15 (rdzenie), W4 (SPZ) |
| **K-D Martwe kliknięcia / UI bez zdolności** | macierz DER „Uruchom obliczenia"; `EditProtectionModal` z dyspozytora SLD; selektor GS/FD w osieroconym `CaseConfigPage.tsx`; `EarthingSystemSelector.tsx`; TT/IT wybieralne bez fizyki | W2, W5 |
| **K-E Backend bez toku pracy** | `nn_device_selection`; NC RfG przekrojowa; `qu_regulation`; `/api/fault-loop/compute`; `ground_fault_bridge`; `sld_overrides`; `archive_diff`/`incremental_archive`/`cloud_backup`; `validate_selectivity`; `power_flow_unbalanced`; `stability_rms`; GS/FD; pola `sc_*` DER; grid-forming | W1, W3, W5, W6, W7, W8, W10 |
| **K-F Martwy kod** | `NetworkWizardService` (2228); `application/designer/` (206); `design_synth/` (557 + 3 repozytoria + klucz rejestru); legacy raporty (8/3574/39); `protection_report_model.py`; `protection_coordination_v1.py`; `v_ports_001.py`; `EarthingSystemSelector.tsx`; `application/sld/**` + `sld_projection.py` + SLD ORM; `/api/fault-loop/compute`; `application/reference_networks/**` (K2, po przeniesieniu jądra) | W1 (przegląd kasacyjny z guardem wskrzeszenia), W3, W5 |
| **K-G Brakujące ogniwa łańcucha** | dobór przekroju; BOM projektu; pakiet do podpisu; rejestr założeń; koszty; `NetworkVariation`; restoration/NOP; model fazowy; TT/IT/RCD; 67/67N/21/87/25/50BF/grupy/TRIP; cykl życia; iniekcja wtórna; COMTRADE; CAD round-trip; GIS; MCP; role; DoD; QSTS; BESS SOC; EN 50160 | W4–W12 |

---

## 5. Wyjścia do Excela (misja §16) — skonsolidowane

1. Dobór przekroju kabla/linii SN (2 #6). 2. Dobór aparatu obwodu nN mimo gotowego backendu (2 #5).
3. Import XLSX prowadzi donikąd — dane wprowadzane drugi raz (1 #22). 4. Rejestr założeń normatywnych
(10 #18). 5. Nastawy z koordynacji nie wracają do modelu; edycja nastaw niemożliwa (4 #18, #19).
6. Warianty modernizacji bez obiektu wariantu (1 #14). 7. Porównania kosztowe (9 #12). 8. Plan łączeniowy
po awarii i wybór NOP (9 #3, #4). 9. Rozpływ pierścienia zasilanego z dwóch GPZ (3 #4). 10. Zwarcie przez
impedancję przejścia (3 #15). 11. Napięcie krokowe / dotykowe z realnych danych stacji (7 #13–#15).
12. Symulacja roczna sieci (3 #9). 13. Nastawy zabezpieczeń doziemnych sieci kompensowanej (3 #19).
14. Funkcje 67/67N/21/87/25/50BF i grupy nastaw (4 #8–#16). 15. Katalog IED w trzech „prawdach" (4 #2).
16. Cykl życia obiektu, iniekcja wtórna, protokoły prób, trwałość odbioru, COMTRADE, kalibracja (11).
17. Regulacja falownika bez śladu limitu Q (5 #1). 18. Rozpływ niesymetryczny własnej sieci nN (7 #2).
19. BESS bez bilansu energii (1 #7). 20. Stabilność dynamiczna realna (6 #2). 21. Harmoniczne DER z
raportem EN 50160 (6 #4, #10). 22. Zgodność przekrojowa NC RfG (5 #12). 23. Pętla TT/IT i RCD (7 #4,
#17). 24. Arkusz obliczeń nN bez eksportu (7 #18). 25. Zestawienie urządzeń projektu i pakiet do podpisu
(10 #15, #17). 26. NBA milczy dla E6–E8, cel projektu bez DoD (12 #9, #10). 27. Rollback modelu bez
przycisku (12 #6). 28. Wymiana z CAD (ZWCAD) jednokierunkowa, GIS brak (8 #11, #12).

---

## 6. Korekty roszczeń (dokumentów i raportów badawczych) — UCZCIWOŚĆ w obie strony

| # | Roszczenie | Weryfikacja 2026-09-09 | Skutek |
|---|---|---|---|
| 1 | Raport C: „`scripts/backend_no_physics_guard.py` NIE ISTNIEJE, nie ma go w `guardy_z_ci.py` ani w workflowach" | **Fałsz.** Plik istnieje (13,6 kB), biegnie w `.github/workflows/p0-extended-guards.yml:180`, a `guardy_z_ci.py` czyta workflowy dynamicznie (`guardy_z_workflowow()`), więc jest w zestawie przedpushowym. **Prawdziwa część:** rodziny wzorców guarda (√3, κ, I²t, R_θ, Z=U²/S, S/cosφ, Q=P·tgφ — K4) nie obejmują IDMT ani prądu gałęzi z mocy | wiersz 4 #1 skorygowany; rozszerzenie rodzin w W3 |
| 2 | Raport E (z ewidencji CI-A): „`application/solvers/lv_temperature_correction.py` liczy R_θ poza pakietem-liściem" | **Nieaktualne.** Plik importuje `rezystancja_w_temperaturze` z `network_model.pochodne` (`:30`) — przepięcie K4 | brak długu |
| 3 | `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` (2026-08-08): „`protection_settings` i `qu_regulation` bez konsumenta" | **Połowicznie nieaktualne:** `protection_settings` ma konsumenta (`pakiet_nastaw.py:23`, `GET …/pakiet-dowodowy-nastaw`); `qu_regulation` nadal bez konsumenta | 10 #3/#4 |
| 4 | Inwentarz (przejęte przez raport D): „PDF wniosku OSD i certyfikatu bez konsumenta frontendowego" | **Fałsz** dla wniosku: `ui2/oze/wniosek/EkranWniosku.tsx`, `ui2/oze/api.ts` wołają `osd-application`/`compliance-certificate` | 5 #16 |
| 5 | `CLAUDE.md` „Development Commands": `npm run test:e2e` = „mock backend" | **Fałsz.** `frontend/scripts/playwright-run.mjs:9-12` wymusza `PLAYWRIGHT_REAL_BACKEND=1`; 90 speców na realnym backendzie (sekcja CI/CD tego samego pliku miała rację) | `CLAUDE.md` poprawiony w tym commicie |
| 6 | `.github/workflows/frontend-e2e-full.yml` komentarz: „82 pliki e2e" | Zmierzono 90 (`ls frontend/e2e/*.spec.ts`) | komentarz poprawiony |
| 7 | `CONVERGENCE_ROADMAP.md:43` odsyła do `PRODUCT_CAPABILITY_MODEL.md` | Plik nie istnieje (zastąpiony przez `PRODUCT_CAPABILITY_CONSTITUTION.md` + `CAPABILITY_ARCHITECTURE_MATRIX.md`) | odsyłacz poprawiony |
| 8 | `docs/sld/SLD_SEMANTIC_MODEL_CANONICAL_V1.md` „Egzekucja reguły 6" (spisana 2026-09-09): piny na `sld_projection.py` i `application/sld/dtos.py` | **Piny prawdziwe dla martwego kodu.** Oba moduły nie mają produkcyjnego konsumenta; żywa ścieżka (klient) nie ma węzła granicznego z konstrukcji ENM (`pcc_zero_guard`) | nota korekcyjna dopisana do kanonu; pin na żywej ścieżce w W7 |
| 9 | Raport A cytuje z roadmapy K1: „`ieee_14bus` rozbiega katastroficznie" jako otwarte ryzyko | **Nieaktualne:** naprawione w CI-PARYTET-6 (baza impedancji linii, `u_set_pu`, zaczepy case39) — zgodność z pandapower ≤ 4·10⁻⁵ p.u. (`../evidence/CONVERGENCE_EVIDENCE.md` §E) | brak długu |
| 10 | `CLAUDE.md` liczby: „~5,400 backend test functions; ~7,350 frontend tests (537 files); 79 guard scripts" | Zmierzono 2026-09-09: 9 080 `def test_`; 10 581 `it(`/`test(` w 892 plikach; 86 guardów + 35 self-testów | `CLAUDE.md` zaktualizowany |
| 11 | `tests/golden/registry.py:110` G01 „pierwszy vertical slice §31" przy `NOT_BUILT` | Prawdziwe co do stanu; nazwa odnosi się do §31 planu migracji (CV-6), nie do kolejności tej mapy | G01 = W8 (po W5/W4) |
| 12 | Raport A: `ADR-015`/DT-4 „DO-PRZEPROJEKTOWANIA" vs raport E „BRAK" dla modelu fazowego | Jedna klasyfikacja: **BRAK** (klasa `PhaseSet` nie istnieje; DO-PRZEPROJEKTOWANIA dotyczy granicy `3ph`, która zostanie zdjęta razem z wprowadzeniem modelu) | 1 #11, 7 #1 |

---

## 7. Decyzje wymagające właściciela (nowe: OD-13…OD-16; stan OD-2/OD-3)

| ID | Pytanie | Dlaczego nie da się rozstrzygnąć samodzielnie |
|---|---|---|
| OD-13 | **MCP i uprawnienia vs decyzja 2026-08-05 „narzędzie jednostanowiskowe, auth/perymetr poza zakresem".** Misja §15 (2026-09-09, nadrzędna) wymaga MCP z „permissions". Propozycja architekta: MCP jako lokalna płaszczyzna sterowania (te same operacje domenowe, ten sam dziennik/rewizje/CAS) BEZ uwierzytelniania sieciowego, z uprawnieniami jako zakresem narzędzi agenta (read / propose / apply), nie jako tożsamością użytkownika | konflikt dwóch decyzji właściciela — rozstrzyga właściciel |
| OD-14 | **Impedancja zwarcia Zf w rdzeniu FROZEN IEC 60909 (B-01).** Parametr addytywny `z_f` w `short_circuit_core.compute_equivalent_impedance` i czterech metodach `compute_*_short_circuit`; parytet bit w bit dla `z_f = 0` (golden 336/168); model i UI już istnieją (3 #15) | edycja `network_model/solvers/**` |
| OD-15 | **Pakiet B-01 „zero fabrykacji w rdzeniach"** (jedna zgoda, parytet per pozycja): (a) `v126_academic.py::_earth_fault_detection` — nastawy jako wejście jawne albo pominięte z powodem; (b) `frt_hvrt/engine.py` — `tp/tiq/K` z katalogu `der_dynamic` (resolver istnieje) z proweniencją w śladzie, brak = odmowa nazwana; (c) `phase_state_sn.py` — VUF wg składowych symetrycznych jako pole addytywne obok dzisiejszego wskaźnika; (d) kasacja rodzajów V12.6 zduplikowanych z torem kanonicznym (`reliability_contingency` ranking, `hosting_capacity` MC, `opf_loss_lcc`) po ich wycofaniu z prezentacji w W3; (e) W-6 `RI` → `LONG_TIME_INVERSE` w `protection_iec60255.py` bez zmiany liczb | każda pozycja = edycja `network_model/solvers/**` |
| OD-16 | **Dane kosztowe (CAPEX/OPEX) katalogu:** źródło (cenniki producentów, wskaźniki OSD, własne), format (pole katalogu per typ, waluta, data), zasada aktualizacji — bez tego W10 (model kosztowy, porównanie wariantów, wielokryterialna) nie ma danych | dane spoza repo |
| OD-2 (stan) | Projekty w legacy ORM przed kasacją | **Rozstrzygnięte technicznie w W1:** migracja jednorazowa legacy → ENM przez ten sam kompilator co import XLSX, wykonana przed kasacją tabel; żaden projekt nie ginie — decyzja właściciela niepotrzebna |
| OD-3 (stan) | Publikowane wyrocznie dla G01 (sieć kompensowana) | **Nadal otwarte** — blokuje część wyroczni W8; propozycja: IEC 60909-3 (przykłady liczbowe) + analityczne wzory zamknięte już przypięte w rejestrze (`_ANALITYCZNA_G01`) jako wyrocznia pierwsza, literaturowa druga |

---

## 8. Kolejność wycinków W1–W12 (decyzja architekta; misja §29: zależność → ryzyko → wartość, pionowo)

| W | Wycinek | Zakres (klasy defektów) | Domeny | Zależy od | Dlaczego w tym miejscu | Mapowanie na W-8 / CV |
|---|---|---|---|---|---|---|
| **W1** | **Jedna prawda sieci od pierwszego bajtu** | K-A (ORM, XLSX, ZIP, governance, wizard, SLD ORM), K-F (przegląd kasacyjny), e2e klasy A przez import | 1, 2, 8, 10 | — (aktywna granica CV-4) | jedyna wada, przez którą dane użytkownika znikają; domyka aktywną granicę CV-4 bez jej przerywania (§29) | CV-4.4 + K2 (jądro przeniesione) — roadmapa §4 w. 5–6 |
| **W2** | **Zero fabrykacji — uczciwość ekranów** (agent, równolegle) | K-C/K-D poza rdzeniami: stabilność (odmowa bez scenariusza, formularz, etykieta), macierz DER, dyspozytor SLD bez martwej edycji, etykieta asymetrii, prezentacja nastaw doziemnych | 3, 4, 5, 6 | — (frontend + `application`/`enm`, bez granic CV) | fabrykacja widoczna dla inżyniera dziś; tanie, mechaniczne, bez B-01 | poza CV (misja §4) |
| **W3** | **Konwergencja duplikatów fizyki** | K-B: IDMT ×5 → adapter na solver kanoniczny (tor `protection_sn` przez `protection/curves`), metodyka ×3 → jedna, `source_compliance` → NC RfG, wycofanie z prezentacji duplikatów V12.6, kasacja legacy raportów i `line_overcurrent_setting`, rodziny IDMT/prądu gałęzi w guardzie | 3, 4, 5, 9, 10 | W1 (kasacje bez kolizji) | usuwa rozjazd, który guard dziś nie widzi; niski sprzęg z modelem | D-3 (część) — roadmapa §4 w. 10 |
| **W4** | **Zabezpieczenia jako część modelu** | `update_relay_settings` realny, SPZ z pisarzem, zapis nastaw z koordynacji do `BayProtectionControlUnit`, edycja z SLD przez `ui2/kreatory/przekaznik`, potem 67/67N (RCA, polaryzacja, admitancyjne), 21, 87T, 25, 50BF, grupy nastaw, TRIP matrix, `ProtectionCapabilityRegistry` (ADR-022) | 4 | W5 (typowany `Bay`) | nastawy poza modelem = druga prawda; funkcje kierunkowe warunkują G01 | D-3 — roadmapa §4 w. 10 |
| **W5** | **Model fazowy i uziemienie** (= CV-5) | `PhaseSet` na terminalu, `Load` fazowy, `EarthingSystem`/`NeutralGrounding` jedna reprezentacja (6 → 1), `meta.field_specs` → typowany `Bay`, rozpływ niesymetryczny dla projektu, TT/IT/RCD, kasacja `EarthingSystemSelector`/`fault-loop/compute`, stan łączeniowy jedna prawda | 1, 7 | W1 | fundament pod G01, nN i W4 | CV-5 — roadmapa §4 w. 8 |
| **W6** | **Dynamika, czas i jakość energii** | `stability_rms` end-to-end (scenariusz z modelu, katalog `der_dynamic`, grid-forming), QSTS (profile roczne, straty roczne), BESS SOC/energia/sprawność/harmonogram, VUF, EN 50160 raport zintegrowany, harmoniczne pod „Jakość", Pst do solverów | 5, 6, 1 | W3, OD-15 | zastępuje fasadę prawdziwą fizyką; domyka BESS jako magazyn | poza CV (misja §8–§9) |
| **W7** | **SLD jako projekcja ENM** (D-1 + „pełne SLD") | projekcja semantyczna backend ENM → `SldSemanticGraphV1` z pinem reguły 6, klient jako renderer, trwałe nadpisania geometrii w ENM (`branch_ref` + `waypoints[]`), kasacja `application/sld/**` + `sld_projection.py`, rewizje rysunku | 8 | W5 (terminale) | „rysunek nigdy jako druga prawda"; W-2: nie przed CV-4.4 | D-1 + w. 11 |
| **W8** | **Sieć kompensowana G01 end-to-end** (= CV-6) | budowa G01 komendami, Y0 z uziemieniem z modelu, Ic/Petersen z modelu stacji, most SC_1F → U_dot/U_krok z geometrii uziomu, 51N/67N/admitancyjne, wyrocznie (OD-3), e2e klasy E jako bramka CI | 3, 4, 7 | W4, W5 | klasa akceptacyjna E nazwana „pierwszym wycinkiem" od miesięcy, NOT_BUILT | CV-6 — roadmapa §4 w. 9 |
| **W9** | **Tok pracy inżyniera** | cel projektu trwały z DoD per klasa (A–F), NBA dla E6–E8 z realnych danych (dokumentacja, uzgodnienia), role jako projekcje (filtr widoku), rollback do rewizji jako operacja domenowa z dziennikiem, CAS włączony w kliencie | 12, 2 | W1 | zamyka §17–§23 misji | poza CV |
| **W10** | **Wyniki projektowania jako dokumenty** | dobór przekroju kabla/linii (IEC 60364-5-52 / IEC 60287 / obciążalność SN z katalogu), BOM całego projektu, pakiet do podpisu (spec BINDING), rejestr założeń, `NetworkVariation` (as-is → wariant → porównanie, klasa F), model kosztowy (OD-16), restoration/NOP | 2, 9, 10, 1 | W1, W9, OD-16 | usuwa większość „wyjść do Excela" | poza CV |
| **W11** | **Commissioning / as-built** | stany cyklu życia, trwałość odbioru + dokument, iniekcja wtórna (czas zadziałania vs nastawa), FAT/SAT, kalibracja, as-built → linia bazowa, COMTRADE (jeśli uzasadnione) | 11 | W4, W9 | domena bez implementacji | poza CV |
| **W12** | **CAD round-trip, GIS, MCP** | import DXF z tożsamością bloków, konflikty, rewizje; GIS (WGS84/EPSG, trasy); MCP nad operacjami domenowymi (OD-13) | 8, 12 | W7, W9, OD-13 | integracje zewnętrzne na końcu łańcucha | poza CV |

Roadmapa §4 w. 7 (ponowna ocena D-1) rozstrzygnięta: D-1 = W7 po W5. Roadmapa §4 w. 5 A5 (`power-flow-runs/*`)
nadal po OD-8. DT-12 (wykonanie biegów) bez zmian.

---

## 9. Karta W1 — „Jedna prawda sieci od pierwszego bajtu" (Fable, worktree `fable-cv3`)

### §0 Rozstrzygnięcia (wiążące)

1. Każde wejście danych sieci (arkusz XLSX, archiwum ZIP, stary projekt w bazie) kończy się w ENM
   przez operacje domenowe (`enm.domain_operations.execute_domain_operation`) — nigdy słownikiem ENM
   składanym ręcznie, nigdy w legacy ORM.
2. **Jeden kompilator grafu węzeł–gałąź → operacje domenowe.** Jądro
   `application/reference_networks/enm_builders/_kernel.py` (633 linii: `zbuduj_topologie` — BFS od
   źródła przez `network_model.core.topologia.przeglad_wszerz_od`, `continue_trunk_segment_sn` /
   `start_branch_segment_sn` / `connect_secondary_ring_sn`, `dodaj_zrodlo_slack`, `dodaj_transformator`,
   `dodaj_obciazenie`, `dodaj_generator_*`, `dodaj_bocznik`, promocja `bus_name`) przenosi się 1:1 do
   `enm/kompilator_grafu.py` i staje się JEDYNYM kompilatorem dla: importu XLSX, migracji legacy,
   builderów benchmarków (do K2), testów. Zero nowej fizyki, zero drugiej implementacji.
3. **Zero fabrykacji danych arkusza.** Parametry jawne z arkusza (R/X/B na km, Sn/uk/Pk/grupa,
   Sk/Ik/RX/U_pu, P/Q) materializują się jako pozycje katalogu użytkownika (niemutowalne, proweniencja
   `arkusz:<plik>:<arkusz>:<wiersz>`) przez istniejący mechanizm governance typów i są wiązane
   `catalog_ref` — nigdy parametry wstrzykiwane wprost (reguła 10 CLAUDE.md; precedens K1:
   `mv_benchmark_catalog`). Wiersz bez wymaganych danych → błąd importu z odniesieniem do wiersza, nie
   wartość domyślna.
4. **Migracja jednorazowa przed kasacją (OD-2):** przy starcie (`infrastructure/persistence/db.py` po
   `create_all`) każdy `ProjectORM` z `NetworkSnapshotORM` bez ENM → kompilator → `set_enm` + wpis
   dziennika „Model odtworzony z migawki legacy (W1)"; po udanej migracji `DROP TABLE IF EXISTS` dla
   6 tabel legacy (idempotentnie). Bez warstwy kompatybilności na stałe.
5. Granice: zero zmian w `network_model/solvers/**` (B-01); kontrakty FROZEN i determinizm ref_id
   nietknięte (ten sam arkusz = ten sam hash ENM; golden 336/168 bez zmian liczb); praca wyłącznie
   w worktree `fable-cv3` z pełną regresją przed pushem.

### §1 Inwentarz klasy (zmierzony 2026-09-09 — pełna lista miejsc tego samego mechanizmu)

| Miejsce | Rola dziś | Los w W1 |
|---|---|---|
| `application/xlsx_import/service.py` (365) | pisarz legacy (`_zapisz_elementy` 208-268, `_zapisz_migawke` 269-294) | przepisany: `importuj()` → `SiecZArkusza` → kompilator → ENM w jednej transakcji z projektem/przypadkiem; odpowiedź niesie `enm_hash` i liczby z ENM |
| `application/xlsx_import/importer.py` (908) | parser/walidator arkuszy | bez zmian (kontrakt kolumn zachowany) |
| `api/xlsx_import.py` (146) | `POST /api/import/xlsx[/preview]` | kontrakt addytywny (`enm_hash`, `case_id`); podgląd = dry-run kompilatora |
| `ui2/spaces/projekt/arkusz/EkranImportuArkusza.tsx` (381) | ekran importu | po sukcesie nawigacja do modelu z hash; test na realnym kształcie odpowiedzi |
| `tests/test_xlsx_import.py` (621) | asercje na legacy | przepisane na ENM (parytet hash z siecią zbudowaną wprost) |
| `application/project_archive/service.py` | podwójny zapis (49-50, 298-299) | wyłącznie ENM; format archiwum wersja +1; import starszych ZIP czyta sekcję ENM (już obecną) |
| `application/catalog_governance/service.py:301` | czyta `NetworkBranchORM.params_jsonb["type_ref"]` | czyta `catalog_ref` gałęzi z ENM |
| `infrastructure/persistence/models.py:226-398` | 6 klas ORM (`network_snapshots/nodes/branches/sources/loads/switching_states`) | kasacja po migracji; pin liczby tabel |
| `infrastructure/persistence/repositories/{network_repository,snapshot_repository,network_wizard_repository}.py` | repozytoria legacy | kasacja |
| `application/network_wizard/service.py` (2228) + `dtos.py` | CRUD legacy; gettery katalogu zabezpieczeń dla `api/catalog.py:133-134` | kasacja; gettery przepięte na moduł katalogu wprost; `step_controller.py`/`validator.py`/`schema.py` (na ENM, żywe w `api/enm.py:982-1068`) zostają |
| `application/sld/**` (10) + `network_model/sld_projection.py` + SLD ORM (`models.py:651-688`) + `sld_repository.py` + `api/sld.py` + odczyt w `api/analysis_runs.py:153` | martwy silnik + persystencja pisana tylko przez kasowany wizard | kasacja (W7 buduje projekcję na ENM od nowa, nie na tym kodzie); 103 testy usunięte razem z kodem |
| `application/designer/` (206), `application/analyses/design_synth/` (557) + `design_{spec,proposal,evidence}_repository.py` + klucz `run_registry.py:25` | martwe / atrapa | kasacja |
| `domain/protection_report_model.py`, `domain/protection_coordination_v1.py`, `enm/migrations/v_ports_001.py` | martwe | kasacja |
| `network_model/reporting/{short_circuit,power_flow,analysis_run}_report_{docx,pdf}.py`, `export_{docx,pdf}.py` + `tests/test_export_reports.py` | martwe (8/3574/39) | kasacja (raporty zabezpieczeń zostają) |
| `application/reference_networks/**` | K2 (jądro w środku) | po przeniesieniu jądra: kasacja `library.py`/`builders/`/`computation.py`; buildery ENM benchmarków przeniesione do `tests/golden/` |
| `enm/store.py:221-260` | pusty ENM przy pierwszym dotknięciu | zostaje (nowy projekt) — po W1 nie ma źródła, które by go omijało |
| `api/diagnostics.py:107-149` (`GET …/enm/diff` po ID migawek legacy `uow.snapshots`) + `ui/enm-inspector/{api,EnmDiffView}.ts(x)` (widok montowany w `EnmInspectorPage.tsx:206` z `report={null}` — nigdy nie woła diffu) | diff migawek legacy | diff dwóch REWIZJI ENM (`enm/rewizje.py::wczytaj_rewizje`) tym samym kontraktem odpowiedzi; widok podpięty do realnego wywołania albo skasowany razem z martwym wywołaniem |
| `api/audit2_station_config.py:63-110` (`_aggregate_loads_per_station_for_project` czyta `project.active_network_snapshot_id` → `uow.snapshots`) | agregacja odbiorów per stacja z migawki legacy | ta sama agregacja z ENM (`Load.bus_ref` → stacja przez `enm/topology.py`), zero wartości z legacy |
| `application/wizard_runtime/**` (`service.py:38-180` czyta/pisze `uow.snapshots`; 0 konsumentów w `api/` i `frontend/src`; 2 pliki testów) | martwy runtime kreatora na migawkach legacy | kasacja z testami |
| tabele katalogu w bazie (1 #24): `uow.wizard.upsert_*_type`, `list_*_types`, `SwitchEquipmentAssignmentORM` (`api/catalog.py:839-893` `type-ref`/`equipment-type` — 0 konsumentów FE) | trzecia prawda katalogu + przypisania typów łączników per projekt legacy | typy użytkownika jako sekcja ENM (`header.catalog_local`, proweniencja, hash addytywny) czytana przez `get_default_mv_catalog` nakładką per model; `catalog_lookup` na jednej drodze; kasacja tabel `LineTypeORM`/`CableTypeORM`/`TransformerTypeORM`/`SwitchEquipmentTypeORM`/`InverterTypeORM`/`SwitchEquipmentAssignmentORM` po pomiarze konsumentów; `ProtectionDeviceTypeORM` — decyzja po pomiarze (jedyny czytelnik: zabezpieczenia) |
| komentarze: `network_model/core/branch.py:307`, `application/analysis_run/result_invalidator.py:14` | odsyłacze do wizarda | aktualizacja treści |

### §2 Definition of Done (13 warunków misji §28)

1. **Funkcja:** arkusz klasy A (sieć promieniowa SN z odgałęzieniem, TR, źródło, odbiory) importuje
   się do ENM i jest widoczny w kreatorach, gotowości, biegu PF/SC, SLD i raporcie bez żadnej ręcznej
   dodatkowej edycji. 2. **Model kanoniczny:** tylko ENM. 3. **Brak konkurencyjnej prawdy:** 0 tabel
   `network_*`, 0 klas ORM, guard wskrzeszenia (`legacy_public_path_guard`: nazwy tabel/klas/modułów
   + pin liczby tabel `models.py`). 4. **Realne przypadki:** arkusz G02 z rejestru jako fikstura XLSX +
   dotychczasowe fikstury importu. 5. **Wyrocznia:** hash ENM z importu == hash ENM tej samej sieci
   zbudowanej operacjami wprost (bit w bit); wyniki PF/SC biegu na zaimportowanej sieci == golden tej
   sieci zbudowanej kreatorem. 6. **Testy backendu:** importer, kompilator (iloczyn cech: {drzewo,
   pierścień, wiele źródeł, transformator HV/LV, brak danych} × {z katalogiem, bez katalogu}),
   migracja (baza z legacy → ENM → tabele znikają), archiwum, governance, kasacje. 7. **Testy frontendu:**
   ekran importu na realnym kształcie odpowiedzi. 8. **E2E realny backend:** nowy spec
   `e2e/import-arkusza-do-wynikow.spec.ts` (import → gotowość → bieg → wyniki → SLD) + `critical-*`.
   9. **Guardy:** komplet `guardy_z_ci` + rozszerzony guard wskrzeszenia + `router_mount_guard`
   (kasacja `api/sld.py`). 10. **CI zdalne 9/9.** 11. **Weryfikacja UI na realnym toku pracy:** zrzuty
   importu → modelu → SLD (oba motywy) do oceny właściciela (B-02). 12. **Dokumentacja odzwierciedla
   stan:** `CANONICAL_TWIN_ARCHITECTURE.md` (C5, CV-4.4), `INWENTARZ_FUNKCJI`, roadmapa §4 w. 5–6,
   evidence §E/§F/§G, ta mapa (wiersze 1 #22/#23, 2 #7/#8/#14, 8 #2/#3, 10 #6). 13. **Ograniczenia
   jawne:** arkusz niesie topologię SN węzeł–gałąź + TR SN/nN + źródła + odbiory (bez pól nN, bez
   zabezpieczeń) — reszta przez kreatory; TT/IT nie dotyczy importu.

### §3 Weryfikacja przed pushem (kolejność, kody wyjścia łapane bezpośrednio)

pełny `tests/` (`-m "not pandapower"`, parytet CI) → wyrocznia pp-venv (`-m pandapower`) →
`guardy_z_ci.py` → snapshot OpenAPI (`git status` po `generuj_snapshot_openapi.py`) → mypy → pełny vitest
→ `type-check`/`lint` → e2e realny backend (`critical-run-flow`, `critical-oze-evidence`, nowy spec) →
commit z trailerami sesji → push z ponowieniami → CI 9/9 → evidence.

---

## 10. Karta W2 — „Zero fabrykacji — uczciwość ekranów" (agent, worktree, równolegle z W1)

Zakres (poza `network_model/solvers/**`): (1) stabilność dynamiczna — `_execute_dynamic_stability`
bez wartości domyślnych: brak jawnego scenariusza = odmowa nazwana z `fix_navigation`; ekran
`ui2/wyniki/stabilnosc` z formularzem scenariusza (pola = kontrakt `FaultClearScenario`) i etykietą
„ocena progowa scenariusza zadanego, bez symulacji RMS"; `voltage_trajectory.py` τ jako parametr jawny
scenariusza; harness `creator-harness-main.tsx:3916-3922` zgodny; (2) macierz DER — wiersze osi
FRT/HVRT/NC RfG prowadzą do ekranów, gdzie analiza realnie biega (`ui2/oze/frt`, `ui2/oze/macierz`),
przycisk bez handlera znika; (3) dyspozytor SLD `modules/sld/cdse/modalDispatcher.ts:98` bez mapowania na
nieistniejący `EditProtectionModal` (realna edycja = W4); (4) etykieta wskaźnika asymetrii
w `ui2/wyniki/stan-fazowy` = „odchylenie od średniej faz [%]" (nie VUF); (5) prezentacja
`_earth_fault_detection` w `ui2/wyniki/akademickie` — metoda z uzasadnieniem tak, trzy nastawy bez
proweniencji nierenderowane z powodem (OD-15a). Każda pozycja: test na realnej ścieżce (natywny klik),
`dead_click_guard`, `dialog_completeness_guard`, `ui_no_physics_guard`, `no_codenames_guard`,
`forbidden_ui_terms_guard`; vitest katalogów dotkniętych; `type-check`/`lint` 0; commit BEZ push
(Fable weryfikuje i cherry-pickuje). Karta pełna: scratchpad sesji `karta_w2_zero_fabrykacji.md`.

---

## 11. Utrzymanie mapy

Każdy wycinek po odbiorze aktualizuje: wiersze tabel §3, których dotyczy (klasyfikacja + nowy dowód),
klasy §4, listę §5, kolejność §8 (stan) i wpis w `../evidence/CONVERGENCE_EVIDENCE.md`. Nowa zdolność bez
wiersza w §3 = brak w produkcie (misja §28: CLAIMED ≠ ACCEPTED). Liczby w tym dokumencie są datowane
2026-09-09; przy każdej aktualizacji mierzone na nowo, nie przepisywane.
