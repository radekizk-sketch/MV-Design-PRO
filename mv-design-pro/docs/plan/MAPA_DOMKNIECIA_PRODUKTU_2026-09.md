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
7. **Aneks rodzin przekrojowych A–L (§3a, polecenie właściciela 2026-09-09):** 12 rodzin, 128 wierszy
   z dowodem. Najważniejsze nowe fakty: import/eksport CIM/CGMES kompletny (1843 linie, 46 testów) bez trasy
   i ekranu (8 #13); wzorzec „dobór = filtr katalogowy, nie wymiarowanie" wspólny dla kabli, transformatorów
   i ograniczników; nowa klasa K-H „mechanizm pełny, dane śladowe" (certyfikaty PTPiREE 1/176, pakiety OSD 1/4)
   → OD-17; cztery nowe stałe bez proweniencji (widmo harmoniczne, udar, TOV, MCOV·2,8), z których jedna leży
   poza B-01 i wchodzi do kolejki jako W2-C; predykat „element wymaga katalogu" w dwóch miejscach. Korekty §3:
   8 #13 (nowy), 10 #14, 12 #2, 12 #10 (§6 poz. 13–19).

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
| 8 | SLD / CAD / GIS | layout, 54 symbole, nakładki, eksport 5 formatów, portal nN, determinizm CI | semantyka SLD tylko w kliencie (6831 linii); backendowy silnik i SLD ORM martwe; nadpisania w pamięci bez konsumenta; CAD round-trip i GIS BRAK; import/eksport CGMES bez trasy i ekranu (8 #13) | DO-PRZEPROJEKTOWANIA / BRAK | W1 (kasacje), W7, W12 |
| 9 | Optimization & Reliability | N-1 pełny re-solve, straty, OLTC studia, wrażliwość, porównania | ranking N-1/hosting/straty w v126 na błędnym prądzie gałęzi; restoration/NOP/koszty/wielokryterialna/warianty BRAK | ZDUPLIKOWANE / BRAK | W3, W10, OD-16 |
| 10 | Reporting / WHITE BOX / Compliance | ślad, 18 pakietów, ZIP dowodowy, raporty żywe, porównania, dziennik, rewizje, świeżość, Reference Engine | legacy raporty 8 plików/3574 linii martwe; `qu_regulation` bez konsumenta; BOM tylko DER-SN; pakiet do podpisu i rejestr założeń BRAK; V12.6 dowód równoległy | DO-KASACJI / BRAK | W1, W3, W10 |
| 11 | Commissioning / As-built | zgodność powykonawcza U/P/Q, estymacja WLS | brak cyklu życia, trwałości, dokumentu, iniekcji wtórnej, FAT/SAT, kalibracji, COMTRADE | BRAK | W11 |
| 12 | MCP Engineering Control Plane | REST 310 ścieżek / 329 operacji (po W1), transakcje ENM (lock + rollback), dziennik, rewizje | MCP BRAK; uprawnienia BRAK (decyzja 2026-08-05 vs misja §15 — OD-13); CAS nieużywany; rollback nie jest operacją; NBA E6–E8, cel/DoD, role BRAK | BRAK / CZĘŚCIOWE | W9, W12 |

Rodziny przekrojowe A–L (§3a) nie zmieniają macierzy domen: każda ich luka jest przypisana do wycinków §8
(rozszerzenia zakresu oznaczone „+ aneks 3a").

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
| 7 | BESS jako magazyn energii (SOC, MWh, sprawność, dyspozycja w czasie) | CZĘŚCIOWE (tabliczka) / BRAK (stan energii) | `enm/models.py:493-538` (tylko `p_mw`/`q_mvar`/`limits`), `BaySourceEndpoint.operating_mode` opisowy (1298-1306); tabliczka z katalogu `ui2/oze/pulpit/SekcjaMagazynu.tsx:1-6` | brak pól stanu magazynu w ENM; każda analiza traktuje BESS jak źródło o stałym P/Q (aneks 3a.I: `bess_mode`/`soc_min_percent`/`soc_max_percent` strukturalne i walidowane, ale bez czytelnika; pojemność nameplate w katalogu `capacity_kwh` — brak dotyczy stanu dynamicznego) | wysoka |
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
| 22 | Import XLSX → projekt | ISTNIEJE-ZWERYFIKOWANE (W1) | `application/xlsx_import/service.py:27-30,216-257` zapis wyłącznie `Network*ORM` (0 wystąpień `enm`); `POST /api/import/xlsx` (`api/xlsx_import.py:99-131`); ekran `ui2/spaces/projekt/arkusz/EkranImportuArkusza.tsx` (381) nawigujący do projektu; `tests/test_xlsx_import.py:291` asercjuje tylko model legacy; `enm/store.py:221-260` tworzy pusty ENM przy pierwszym dotknięciu | zaimportowana sieć niewidoczna dla 29 tras `/enm/**`, 24 kreatorów, biegów, SLD, raportów — inżynier wprowadza dane drugi raz ręcznie | wysoka — **W1 (2026-09-09):** import → `SiecZArkusza` → `enm/kompilator_grafu.py` → ENM projektu + katalog projektu (`PROJEKTOWY_V1`, proweniencja wiersza); `enm_hash` w odpowiedzi; e2e `import-arkusza-do-wynikow.spec.ts` |
| 24 | Katalog typów — tabele w bazie (`LineTypeORM`, `CableTypeORM`, `TransformerTypeORM`, `SwitchEquipmentTypeORM`, `InverterTypeORM`, `ProtectionDeviceTypeORM`; `infrastructure/persistence/models.py:311-351`) | ZDUPLIKOWANE (trzecia prawda katalogu) | pisane przez `application/catalog_governance/service.py:262-289,544-657` (`uow.wizard.upsert_*`); czytane WYŁĄCZNIE przez `application/protection_analysis/catalog_lookup.py:63-81` (typy zabezpieczeń, z fallbackiem na katalog statyczny); `api/catalog.py:252-356` i operacje domenowe (`enm/domain_operations.py:2628` `_get_catalog_safe` → `get_default_mv_catalog`, `lru_cache`, wyłącznie moduły statyczne `network_model/catalog/*.py`) nigdy ich nie czytają | typ linii/kabla/transformatora zaimportowany przez governance nie istnieje dla kreatorów ani biegów; W1 rozstrzyga: jedna droga typów użytkownika (typy projektu w ENM z proweniencją) i kasacja tabel martwych wobec toru obliczeń | wysoka |
| 23 | JEDNA PRAWDA SIECI (ocena systemowa) | ZREALIZOWANE (W1) | legacy ORM 6 tabel (`infrastructure/persistence/models.py:226-398`): pisarz `xlsx_import` (tylko legacy), `application/project_archive/service.py:49-50,298-299` (podwójny zapis), `application/catalog_governance/service.py:301` (czyta `NetworkBranchORM.params_jsonb["type_ref"]`), repozytoria `network_repository.py`/`snapshot_repository.py`/`network_wizard_repository.py` | CV-4.4 niewykonane; naprawa = W1 | wysoka — **W1 (2026-09-09):** 19 tabel legacy (nie 6 — pomiar) zmigrowane (`migracja_legacy_db.py`) i skasowane; pin 15 tabel + bramka wskrzeszenia w `legacy_public_path_guard` |

### 3.2 Domena 2 — Network Design

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| 1 | Kreatory budowy sieci (24) | ISTNIEJE-ZWERYFIKOWANE | `ui2/kreatory/**` (24 katalogi wołające `executeDomainOperation`; 54 pliki testów / 659 `it(`); dry-run `kreatory/stacja/stacjaPodglad.ts:1-13` | — | wysoka |
| 2 | Dobór kompensacji mocy biernej | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/dobor_kompensacji.py` (567; 21 testów) | — | wysoka |
| 3 | Dobór CT/VT | CZĘŚCIOWE | `domain/dobor_przekladnika.py` (907); UI `ui/network-build/station-der/DoborPrzekladnikowSekcja.tsx` | tylko pole wytwórcy; kryterium ALF uproszczone (domena 4 #3) | wysoka |
| 4 | Dobór toru SN dla DER (kabel/TR/grupa) | ISTNIEJE-ZWERYFIKOWANE | `network_model/solvers/der_selection_preview.py` (706; 25 testów); `api/der_sn_documents.py` | jedyny dobór z rankingiem i odrzuconymi kandydatami | wysoka |
| 5 | Dobór aparatu / obwodu nN | BEZ-KONSUMENTA | `application/analyses/nn_device_selection.py` (791; 45 testów); `GET …/enm/nn-device-selection` (`api/enm.py:60,464`) | 0 ekranów w `ui`/`ui2` | wysoka |
| 6 | Dobór przekroju przewodu/kabla SN | BRAK | `grep dobierz_przekroj\|dobor_przekroju\|dobor_kabla\|dobor_linii backend/src` = 0; istnieje tylko sprawdzenie ΔU/obciążalności | inżynier dobiera przekrój poza systemem | wysoka |
| 7 | Silnik syntezy projektu / studium z rankingiem (`design_synth`) | SKASOWANE (W1) | `application/analyses/design_synth/pipeline.py:94` „Deterministic placeholder proposal. No solver execution."; klucz `BoundaryNode` (143); 0 tras API, 0 UI; 3 repozytoria `design_*_repository.py`; martwy klucz `run_registry.py:25` | następca: realne dobory (#2–#4) + W10 | wysoka — **W1 (2026-09-09):** `design_synth/**`, 3 repozytoria, 3 tabele, klucz rejestru; kanoniczny JSON → `application/analyses/kanon_json.py` |
| 8 | `NetworkWizardService` (CRUD legacy) | SKASOWANE (W1) | `application/network_wizard/service.py` (2228) — 0 tras mutujących; jedyne użycie `api/catalog.py:133-134` (gettery katalogu zabezpieczeń) | następca: `/enm/domain-ops` + `step_controller.py` (na ENM, żywy w `api/enm.py:982-1068`) | wysoka — **W1 (2026-09-09):** `service.py`/`dtos.py`/`errors.py`/`exporters/`/`importers/` + `wizard_runtime/**`; gettery katalogu zabezpieczeń → `ProtectionCatalogRepository` |
| 9 | Szablony stacji (10 archetypów) | ISTNIEJE-ZWERYFIKOWANE | `application/station_templates/` (1137; 60 testów); kreator stacji | — | wysoka |
| 10 | Wzorce referencyjne (raporty normatywne) | ISTNIEJE-ZWERYFIKOWANE | `application/reference_patterns/` (2708); `api/reference_patterns.py` 6 tras; `ui2/referencje/` (21 `it(`) | — | wysoka |
| 11 | Mapa procesu E1–E8 + następna najlepsza akcja | CZĘŚCIOWE | `ui2/proces/nastepnaAkcja.ts` (232; drabina R1–R6, 26 testów), `etapy.ts` | NBA milczy dla E6–E8 (`nastepnaAkcja.ts:42-49`) | wysoka |
| 12 | Werdykt projektowy | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/werdykt_projektowy.py` (990); `api/quality_analysis_runs.py` | — | wysoka |
| 13 | Gotowość inżynierska | ISTNIEJE-ZWERYFIKOWANE | `api/enm.py:266,649,708`; 115/115 kodów z `fix_navigation` (`domain/canonical_operations.py`, guard `readiness_codes_guard.py` w CI) | — | wysoka |
| 14 | `application/designer/` | SKASOWANE (W1) | 7 plików / 206 linii, 0 importerów, angielskie etykiety akcji (`actions.py:22-26`) | — | wysoka — **W1 (2026-09-09):** skasowany z testami |
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
| 23 | Martwe: `domain/protection_report_model.py`, `domain/protection_coordination_v1.py` (446), `enm/migrations/v_ports_001.py` | SKASOWANE (W1) | 0 konsumentów produkcyjnych (tylko własne testy) | W1 (przegląd martwego kodu) | wysoka — **W1 (2026-09-09):** wszystkie trzy skasowane razem z własnymi testami; `PROTECTION_SYSTEM_CANONICAL.md` skorygowany |
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
| 2 | Backendowy silnik projekcji SLD | SKASOWANE (W1) | `application/sld/**` (10 plików) + `network_model/sld_projection.py` (233); 103 testy; jedyny importer `network_wizard/service.py` (martwy wobec API) | decyzja architekta: projektuje legacy `NetworkSnapshot`, nie ENM — nie jest bazą dla W7 | wysoka — **W1 (2026-09-09):** `application/sld/**`, `sld_projection.py`, `api/sld.py` skasowane (103 testy razem z kodem); dokumenty SLD skorygowane |
| 3 | Persystencja diagramu SLD (ORM) | SKASOWANE (W1) | `SldDiagramORM`/`SldNodeSymbolORM`/`SldBranchSymbolORM`/`SldAnnotationORM` (`models.py:651-688`), `sld_repository.py` (224); jedyny pisarz `network_wizard/service.py:1049…1400`; `api/sld.py:26` overlay po `diagram_id` nieosiągalny z realnymi danymi | — | wysoka — **W1 (2026-09-09):** 4 tabele SLD + `sld_repository.py` + `GET /analysis-runs/{id}/overlay` skasowane; martwa klasa nakładki w `ui/results-inspector` też |
| 4 | Nadpisania geometrii (drag, trasy) | BEZ-KONSUMENTA | `api/sld_overrides.py:108` magazyn w pamięci procesu; 12 testów; 0 FE | utrata poprawek przy restarcie | wysoka |
| 5 | Auto-layout | ISTNIEJE-ZWERYFIKOWANE | `engine/sld-layout/{layoutEngine,lodController,topologyTree}.ts`; SLD Determinism CI | — | wysoka |
| 6 | Biblioteka symboli | ISTNIEJE-ZWERYFIKOWANE | `ui/sld/canonical_symbols/` 54 SVG + `ports.json`; kontrakt `symbolContract.test.ts` | — | wysoka |
| 7 | Styl CAD nN (L2) | ISTNIEJE-ZWERYFIKOWANE | `ui/sld/v3/cad/{CadSymbol.tsx,cadSymbolRegistry.ts}` | to styl rysunku, nie interoperacyjność CAD | wysoka |
| 8 | Arkusze, tabliczka, legenda | ISTNIEJE-ZWERYFIKOWANE | `ui/sld/v3/sheet/`, `export/sheetTitleBlock.tsx` | — | średnia-wysoka |
| 9 | Nakładki wyników/zabezpieczeń | ISTNIEJE-ZWERYFIKOWANE | `ui/sld-overlay/` (18 plików; guard `overlay_no_physics_guard`) | — | wysoka |
| 10 | Eksport SVG/PDF/DXF/CIM/IEC 61850 | ISTNIEJE-ZWERYFIKOWANE | `ui/sld/v3/export/` (`EXPORT_BUILDERS` wymusza 5 formatów); `SldCanvasV3Workspace.tsx:193` | — | wysoka |
| 11 | CAD interoperacyjność (import DXF, tożsamość bloków, round-trip, konflikty) | BRAK | backend 0 trafień `dxf`/`zwcad`; frontend tylko eksport | — | wysoka |
| 12 | GIS | BRAK | 0 trafień `geojson`/`shapefile`/`wgs84`/`epsg` | — | wysoka |
| 13 | Import / eksport CIM/CGMES (EQ + TP) | BEZ-KONSUMENTA | `infrastructure/cgmes/` (8 plików z `__init__.py`) + `application/cgmes/service.py` = 1843 linie (`export_cgmes`/`import_cgmes`); 46 testów `tests/cgmes/` (round-trip); 0 tras API, 0 konsumentów FE (aneks 3a.K K2, 2026-09-09) | trasa + ekran w archiwum projektu → W12 | wysoka |
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
| 6 | Legacy raporty SC/PF/analysis-run DOCX/PDF | SKASOWANE (W1) | `network_model/reporting/{short_circuit,power_flow,analysis_run}_report_{docx,pdf}.py` + `export_{docx,pdf}.py` — 8 plików / 3574 linii / 39 testów bez konsumenta (`tests/test_export_reports.py`) | następca: `api/analysis_run_exports.py` (1848) + `api/power_flow_comparisons.py`; raporty zabezpieczeń (`protection_report_*`) są ŻYWE — nie kasować | wysoka — **W1 (2026-09-09):** wszystkie 8 modułów z tej komórki skasowane (0 importerów w `src`) + 4 eksportery tej samej klasy (`export_jsonl`, `export_manifest`, `power_flow_export`, `short_circuit_export`) i 4 pliki testów; zostają `protection_report_*` (konsument `api/protection_coordination.py`), `czcionki`, `missing_value`, `docx_determinism` |
| 7 | Live raport biegu (JSON/DOCX/PDF) | ISTNIEJE-ZWERYFIKOWANE | `api/analysis_runs.py:387-486` | — | wysoka |
| 8 | Porównania A/B (rozpływ, zabezpieczenia, zwarcia) | ISTNIEJE-ZWERYFIKOWANE | `api/{power_flow_comparisons,protection_comparisons,zwarcia_porownania}.py`; `ui2/wyniki/porownanie/` z `PanelProweniencji.tsx` | — | wysoka |
| 9 | Proweniencja parametru w edytorze | CZĘŚCIOWE | `solver_input/provenance.py` (`SourceKind`, `FieldQuality`); brak wskaźnika przy polu w kreatorach `ui2` | — | średnia |
| 10 | Dziennik zmian (przyczyna) | ISTNIEJE-ZWERYFIKOWANE | `enm/dziennik_zmian.py`; `ui2/freshness/{dziennikApi,ListaZmianOdBiegu,PanelCoSieZmienilo}` | — | wysoka |
| 11 | Rewizje z integralnością | ISTNIEJE-ZWERYFIKOWANE | domena 1 #13 | — | wysoka |
| 12 | Świeżość wyniku/dowodu/raportu | ISTNIEJE-ZWERYFIKOWANE | 12 ekranów; 39 testów | — | wysoka |
| 13 | Dokumenty OSD | ISTNIEJE-ZWERYFIKOWANE | domena 5 #16 | — | wysoka |
| 14 | Zgodność z wymaganiami OSD (Reference Engine) | CZĘŚCIOWE (KOREKTA §6 poz. 15) | `reference_engine/compliance.py` (674); 8 pakietów, w tym jeden OSD: `osd_enea` (`osd_energa`/`osd_tauron`/`osd_pge` — 0 trafień w repo); `GET /cases/{id}/reference/compliance`; `ui2/referencje/`, `ui2/spaces/gotowosc/SekcjaZgodnosciReferencyjnej.tsx`, `ui2/spaces/model/ZgodnoscReferencyjna.tsx`, `ui/enm-inspector/ReferencePanel.tsx`; 42 testy | pakiety pozostałych OSD = dane z IRiESD (K-H) → OD-17 | wysoka |
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
| 2 | Powierzchnia zdolności REST | ISTNIEJE-ZWERYFIKOWANE | 310 ścieżek / 329 operacji / 227 schematów (`backend/schemas/openapi_snapshot.json`, pomiar 2026-09-09 po W1; przed W1: 350 tras) / 61 modułów `api/*.py`; `router_mount_guard.py` (3 routery świadomie odstawione: `archive_diff`, `incremental_archive`, `cloud_backup`) | — | wysoka |
| 3 | Transakcyjność | CZĘŚCIOWE | `enm/store.py` (RLock per twin, atomowy zapis, wycofanie); `POST /enm/domain-ops` jedyna droga zapisu w produkcji (`api/enm.py:1333-1338`); CAS `snapshot_base_hash` nieużywany przez klientów (`api/enm.py:1216,1236`) | brak ochrony przed zgubioną aktualizacją między sesjami | wysoka |
| 4 | Uprawnienia / perymetr | BRAK | `api/middleware.py` (tylko request-id), `dependencies.py`; 0 tras chronionych; decyzja właściciela 2026-08-05 (`PLAN_PRZEBUDOWY_10X_2026-07.md:203-225`) | konflikt z misją §15 — OD-13 | wysoka |
| 5 | Proweniencja | ISTNIEJE (domena 10 #9) | — | — | średnia |
| 6 | Rollback do rewizji jako operacja | CZĘŚCIOWE | odczyt+weryfikacja tak; `enm/store.py:455 restore_enm` tylko dla importu archiwum; `PUT /enm` wyłączony w produkcji; brak ekranu rewizji z akcją | — | wysoka |
| 7 | Audytowalność | ISTNIEJE-ZWERYFIKOWANE | dziennik z przyczyną; `audit_trail` w odpowiedzi `domain-ops` | — | wysoka |
| 8 | Niezależna weryfikacja (mechanizm) | ISTNIEJE-ZWERYFIKOWANE | `solver_diff_guard.py`; `KlasaWyroczni.INDEPENDENTLY_VERIFIED`/`NORMATIVE` w `tests/golden/registry.py` | pokrycie nierówne (#12) | wysoka |
| 9 | Następna najlepsza akcja | CZĘŚCIOWE | jeden silnik `ui2/proces/nastepnaAkcja.ts`; `fixActionRouting.ts` (poziom kodu, reużyty) | E6–E8 milczy | wysoka |
| 10 | Cel projektu / Definition of Done | CZĘŚCIOWE (UI bez zdolności śledzenia) | `ui2/spaces/projekt/otworz/CelProjektu.tsx` (4 kafle; 8 testów `celProjektu.test.tsx` + 11 `otworzProjekt.test.tsx` — KOREKTA §6 poz. 14); `api/projects.py::ProjectCreate` bez pola celu; 0 trackera DoD | pokryte 2–4 z ~8 celów misji | wysoka |
| 11 | Role inżynierskie jako projekcje stanu | BRAK | 0 trafień w `ui2` (persony tylko w audytach) | — | wysoka |
| 12 | Projekty akceptacyjne A–F (misja §24) | CZĘŚCIOWE, nierówne | rejestr `tests/golden/registry.py`: A=G02 PARTIAL (`critical-run-flow.spec.ts`), B=G03 PARTIAL (N-1 na innej fikturze), C=G06 PARTIAL + INDEPENDENTLY_VERIFIED (`critical-oze-evidence.spec.ts`), D=G04 PARTIAL, E=G01 **NOT_BUILT** (w rejestrze nazwana „pierwszy vertical slice"), F=G11 **NOT_BUILT** | C > A > D ≈ B > E ≈ F | wysoka |
| 13 | Propagacja znanych danych (misja §19) | CZĘŚCIOWE (próbka) | `ui2/kreatory/pole/KreatorPolaSn.tsx` + `stacja/stacjaModel.ts` (`snVoltageOdczyt`) | zweryfikowano 1 z 23 kreatorów | niska |

---

## 3a. Rodziny zdolności przekrojowych A–L (aneks właściciela, 2026-09-09)

Dopisane na polecenie właściciela („Dopisz brakujące capability families"). Metoda ta sama, co w §3:
cztery równoległe badania tylko-odczyt repo (A–C, D–F, G–I, J–L; ścieżki i liczby z dysku w dniu
2026-09-09, po kasacji legacy W1), klasyfikacja i przypisanie do wycinków — decyzja architekta.
Rodziny są przekrojowe wobec 12 domen §3: wiersz rodziny NIE powiela wiersza domeny, lecz nazywa
zdolność z perspektywy toku pracy inżyniera i wskazuje, gdzie w §3/§8 leży jej los. Zdolność bez
wiersza tutaj ani w §3 = brak w produkcie (misja §28).

### 3a.A Rodzina A — Engineering workflow / UX acceptance (tok pracy i odbiór ekranów)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| A1 | Mapa procesu E1–E8 i „następna najlepsza akcja" z realnych danych | CZĘŚCIOWE | `ui2/proces/etapy.ts:42-68`, `nastepnaAkcja.ts:154-232` (drabina R1–R6, czysta funkcja), `procesAdapter.ts:20-30` (realne store'y); konsumenci `PulpitProjektu.tsx:124`, `HubDokumentacji.tsx:326`, `PanelGotowosci.tsx:215`; 5 plików testów | NBA liczy się tylko dla E1/E3/E4/E5; nigdy nie wskazuje E2 ani E6–E8 (jawnie: „reguła topuje na E5") — prowadzenie kończy się na wynikach; = 12 #9 | wysoka |
| A2 | Bramki etapów / DoD per etap i klasa projektu A–F | BRAK | 0 trafień `klasa projektu`/`DoD` w kodzie; `domain/project_design_mode.py:6-8` = enum SN/NN (2 wartości), 0 konsumentów FE; „DoD" istnieje tylko jako bramki faz programu UI/UX (`docs/uiux/AUDYT_BRAMEK_U2_U5_2026-08.md`) | klasa projektu i DoD per etap nie istnieją w kodzie ani kanonie; = 12 #10, W9 | wysoka |
| A3 | Gotowość inżynierska: kody z nawigacją naprawczą | ISTNIEJE-ZWERYFIKOWANE | `domain/canonical_operations.py`: 115 `ReadinessCodeSpec` = 115 `fix_navigation` (policzone), `GET /api/readiness/registry`; `ui2/spaces/gotowosc/PanelGotowosci.tsx`; 132 testy backend + 8 plików FE | — | wysoka |
| A4 | Uczciwe stany zerowe i komunikaty odmowy | ISTNIEJE-ZWERYFIKOWANE | jeden wzorzec `ui2/wyniki/wzorzec/PrzyciskAkcjiStanu.tsx:1-32`, 28 realnych konsumentów (dowód, werdykt, porównanie, jakość, zwarcia, estymacja, OZE) | — | wysoka |
| A5 | Stała strona oceny właściciela (zrzuty żywej aplikacji, oba motywy) i pętla ux-feedback | CZĘŚCIOWE | `frontend/e2e/ux-feedback-loop.spec.ts` (mock backend), `creator-screenshot.spec.ts`, `wszystkie-sceny-screenshot.spec.ts`; `docs/audit/visual/ocena-2026-07/` 7 PNG, ostatni commit 2026-07-24 | brak „stałej strony oceny" z reguły 8 dyrektyw właściciela; zrzuty statyczne od lipca; W1 DoD #11 (zrzuty do B-02) dostarczane kanałem sesji, nie repo (PNG niecommitowane) | wysoka |
| A6 | Onboarding, pomoc, cofnij/ponów, powiadomienia | CZĘŚCIOWE | `ui2/legacy/LegacyChrome.tsx:14-22`, mount `ui2/AppRoot.tsx:324`; `LegacyChrome.tsx:79`: `<div className="sr-only" aria-hidden="true"><UndoRedoButtons/></div>` — cofnij/ponów działa tylko z Ctrl+Z/Y, bez widocznej kontrolki (także dla czytników ekranu) | jawna kontrolka cofnij/ponów w powłoce ui2 → W9 | wysoka |
| A7 | E2E ścieżki krytycznej na realnym backendzie w CI | ISTNIEJE-ZWERYFIKOWANE | 5 speców `e2e/critical-*.spec.ts`; `test:e2e:real` = 2 z nich (`package.json:31`), `test:e2e` = 90 speców, `playwright-run.mjs:10-11` wymusza realny backend; workflowy `frontend-e2e-smoke.yml`, `frontend-e2e-full.yml` | + W1: `e2e/import-arkusza-do-wynikow.spec.ts` (klasa A przez import) | wysoka |
| A8 | Role użytkownika / projekcje widoku | BRAK | 0 trafień `UserRole`/`current_user`/`require_role` w `backend/src` (44 trafienia `rola` = pole elektryczne) | = 12 (uprawnienia BRAK, OD-13); role jako projekcje → W9 | wysoka |
| A9 | Dostępność i klawiatura | CZĘŚCIOWE | 433 atrybuty `aria-*` w `ui2/**` (18 rodzajów), 28 `onKeyDown` w 15 plikach; `ui2/shell/__tests__/shellA11y.test.tsx` (5) | 0 trafień `axe-core`/`jest-axe` — brak zautomatyzowanego audytu WCAG → W9 | wysoka |
| A10 | Historia zmian modelu widoczna w UI | ISTNIEJE-ZWERYFIKOWANE | `enm/dziennik_zmian.py`, `GET /{case_id}/enm/rewizje/{rewizja}` (`api/enm.py:184`), `ui2/freshness/PanelCoSieZmienilo.tsx`, `ListaZmianOdBiegu.tsx`; 39 testów | zakres: „co unieważniło TEN wynik"; brak samodzielnego ekranu dziennika decyzji projektanta → W9 (razem z rollback 12 #6) | wysoka |

Wycinki: A1/A2/A6/A8/A9 → **W9** (tok pracy inżyniera — rozszerzenie zakresu: NBA E2/E6–E8, klasa
projektu + DoD, kontrolka cofnij/ponów, role jako projekcje, audyt axe w CI); A5 → obowiązek każdego
wycinka UI (reguła 8) — w tej sesji zrzuty W1 do B-02 kanałem sesji; A10 → W9 (ekran dziennika/rewizji
z rollbackiem).

### 3a.B Rodzina B — End-to-end supply cascade (kaskada zasilania WN → GPZ → SN → SN/nN → nN → odbiór)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| B1 | Identyfikacja ścieżki zasilania szyny | ZDUPLIKOWANE | backend `network_model/core/topologia.py:135-196` (`przeglad_wszerz_od`, `sciezka_do`), `enm/topology.py:70-132`; frontend WŁASNY BFS `ui/sld/v2/canvas/SupplyPathHighlighter.ts:1-40` (zero wywołania backendu), 8 testów | dwie implementacje tej samej topologii operatorskiej, nigdy wzajemnie nieweryfikowane; SLD ma czytać `TopologyView` z backendu (W7: projekcja ENM → SLD) | wysoka |
| B2 | Widoczność ścieżki zasilania na SLD | CZĘŚCIOWE | `SupplyPathHighlighter.ts`, `SupplyPathLegend.tsx` zamontowane w `SldCanvasV3Workspace.tsx`; 14 testów jednostkowych; e2e `sld-supply-path-visibility.spec.ts` = mock backend, pusty model | e2e na realnym modelu z danymi (podświetlenie ścieżki) → W7 | wysoka |
| B3 | Spójność poziomów napięć wzdłuż kaskady | ISTNIEJE-ZWERYFIKOWANE | `enm/validator.py:53-55, 1601-1633` — kod `E020` BLOCKER (przejście pasm tylko transformatorem), `E003` (wyspy bez źródła) → gotowość | — | wysoka |
| B4 | Kaskada zwarciowa SN → nN w jednym biegu | ISTNIEJE-ZWERYFIKOWANE | `tests/network_model/solvers/test_sc_lv_min_max.py:1-16` (GPZ 250 MVA → kabel SN → TR 15/0,4 → nN, jeden `NetworkGraph`, ręczny rachunek IEC 60909 ±1 %); `fault_loop_builder.py` konsumowany przez `application/analyses/fault_loop/service.py` (940), `api/fault_loop.py`, `nn_device_selection.py`, `swz/service.py` | nagłówek `fault_loop_builder.py:1-24` „STATUS: SCAFFOLDING (MVP)" nieaktualny wobec użycia — plik leży w `network_model/solvers/` (B-01): korekta komentarza dopisana do OD-15 (e) | wysoka |
| B5 | Kaskada zabezpieczeń SN ↔ nN (selektywność przekaźnik SN vs MCB/gG nN) | BRAK | tor SN (`application/protection_settings`, `analysis/protection_insight`, `protection_curves_it`) i tor nN (`solvers/protection_lv_curves.py` → `lv_circuit_verification`, `nn_device_selection`, `swz/werdykt`) — 0 importów krzyżowych w obu kierunkach | żaden moduł nie liczy selektywności między poziomami; = 4 #8–#16 rozszerzone → W4 | wysoka |
| B6 | Profil napięcia wzdłuż ścieżki (ΔU per odcinek) | BEZ-KONSUMENTA | backend `analysis/voltage_profile/*` + `application/analyses/voltage_profile_view.py` → `GET /api/quality/voltage-profile` (`api/quality_analysis_runs.py:172-194`, `node_ref`, dekompozycja); frontend `ui/voltage-profile/{VoltageProfileChart,VoltageHeatmap,…}` — 0 wywołań trasy w `frontend/src`, 0 importów komponentu poza folderem; `ReadinessSection.tsx:42` tylko etykieta | dwa gotowe światy, które nigdy się nie spotkały; wpięcie w ekran „Jakość" ui2 albo kasacja komponentów zastanych → W6 | wysoka |
| B7 | Agregacja obciążeń w górę kaskady (obciążenie stacji z odbiorów nN) | BACKEND-BEZ-TOKU-PRACY | `api/audit2_station_config.py:65` (W1: z ENM `Load.bus_ref` → `Substation.bus_refs`), wołana tylko z `POST …/_validate-all` (`:248`); 0 wywołań `validate-all` w `frontend/src` | trasa walidacji zbiorczej audytu 2 bez klienta; wpięcie w E5 (gotowość stacji) → W9 | wysoka |
| B8 | Granica przyłączenia (`analysis/boundary`) | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/granice_sieci.py` → `GET /api/insights/network-boundary` (`api/analysis_insights.py:88-91`); `ui2/spaces/gotowosc/SekcjaGranicySieci.tsx` w `PanelGotowosci.tsx:229` | — | wysoka |
| B9 | E2E jednym scenariuszem SN + stacja SN/nN + bieg + wyniki | ISTNIEJE-ZWERYFIKOWANE | `e2e/critical-run-flow.spec.ts:192-246` (magistrala SN → stacja SN/nN z transformatorem → obliczenia → wyniki), realny backend w obu workflowach | — | wysoka |
| B10 | Rozpływ per wyspa, wiele GPZ | ISTNIEJE-ZWERYFIKOWANE | `enm/rozplyw_wysp.py` (196), `enm/assembler.py:375,627` (`source.multiple_grid_sources_in_island`), `domain/canonical_operations.py:748`; wyrocznia `tests/golden/wyrocznie/test_pandapower_wyspy.py` (4), `tests/enm/test_rozplyw_per_wyspa.py` (12) | pierścień z dwóch GPZ zamknięty = jawna odmowa (3 #4, §5 poz. 9) → W10 (`NetworkVariation`/analiza pierścieni) | wysoka |

Wycinki: B1/B2 → **W7** (SLD czyta `TopologyView` backendu; kasacja własnego BFS klienta); B5 → **W4**
(selektywność SN↔nN jako część modelu zabezpieczeń); B6 → **W6** (profil napięcia w ekranie „Jakość");
B7 → **W9**; B4 docstring → OD-15 (e) (B-01).

### 3a.C Rodzina C — Switching operations (operacje łączeniowe)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| C1 | Model łącznika w ENM (stan, rodzaj) | ISTNIEJE-ZWERYFIKOWANE | `enm/models.py:189-198` (`BranchBase.status: closed/open`), `:291-296` (`SwitchBranch.type: switch/breaker/bus_coupler/disconnector`) | — | wysoka |
| C2 | Operacje domenowe otwórz / zamknij / w ruchu | CZĘŚCIOWE | operacje z łącznikiem w `domain/canonical_operations.py`: `add_nn_switch_device` (:584), `connect_secondary_ring_sn` (:122), `insert_section_switch_sn` (:114), `set_normal_open_point` (:130) — 4 razem; `enm/domain_operations.py:8063-8103` ustawia WYŁĄCZNIE `status="open"`; 0 trafień operacji zamykającej; przeniesienie NOP nie zamyka starego (8074-8080) | brak operacji `close`/`set_switch_state` — łącznik raz otwarty nie wraca; = §5 poz. 8 → W5 (stan łączeniowy jedna prawda) | wysoka |
| C3 | Punkt normalnie otwarty pierścienia (NOP) | ISTNIEJE-ZWERYFIKOWANE | `enm/domain_operations.py:7948` (`connect_secondary_ring_sn`), `:8063` (`set_normal_open_point`), `ui2/kreatory/pierscien/KreatorPierscienia.tsx`; 11 testów | — | wysoka |
| C4 | Stany łączników w scenariuszu operacyjnym | CZĘŚCIOWE | `enm/scenariusze.py:232-404` (`OperatingScenario`, `apply_scenario`); docstring :20-24: stany łączników, zaczepy, tryby źródeł, profile, tryby DER/BESS „NIE wchodzą, dopóki nie ma konsumenta"; pola: `out_of_service`, `setpoints`, `gen_scaling`, `injections`, `probe_shunts`, `fault_spec`; 44 testy | żadna analiza przez scenariusz nie odzwierciedla konfiguracji łączeniowej (tylko wyłączenia) → W5 (stany łączników w scenariuszu) | wysoka |
| C5 | N-1 / kontyngencje | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/kontyngencje_n1.py` (919), `api/analysis_insights.py:99-111`, `ui2/wyniki/kontyngencje/EkranKontyngencji.tsx`; 43 testy + FE | kontyngencja = usunięcie gałęzi z migawki, nie stan łącznika (`scenariusze.py:31`) — nie jest dowodem dla C2/C4 | wysoka |
| C6 | Programy / sekwencje łączeniowe i blokady | CZĘŚCIOWE | `enm/interlock_rules.py:1-35` — jedna reguła (uziemnik ↔ tor główny, IEC 62271; walidator `W034`, Reference Engine `iec62271.interlock.es_vs_main`); 27 testów; 0 trafień „program/sekwencja łączeniowa" | brak wieloetapowego programu łączeniowego z zezwoleniami → W10 (plan łączeniowy, §5 poz. 8) | wysoka |
| C7 | Odtwarzanie zasilania (restoration, FDIR) | BRAK | 0 trafień backendu; `ui/protection-coordination/automationTypes.ts:126-169` (`FdirPhase`) + `AutomationPanel.tsx` bez konsumenta; `station_templates/templates/sekcyjne.py:82-86` „SZR" = tekst katalogowy | = 9 #3; kasacja widma `AutomationPanel` (K-F) + zdolność → W10 | wysoka |
| C8 | Stan łącznika na SLD i przełączanie z SLD | CZĘŚCIOWE | `ui/sld/v3/cad/cadSymbolRegistry.ts:64` (`closed/open/unknown`); `ui/sld/shared/sldActionExecutor.ts:497` `'set-switch-state' → 'set_normal_open_point'` (realna operacja); `ACTION_ROADMAP_HINT_PL['set-switch-state'] = 'Zmiana stanu łącznika: Etap 6 roadmapy.'` (~:139) — martwy, nieosiągalny komunikat obok działającej ścieżki; `api/sld_overrides.py` tylko geometria | etykieta obiecuje „zmianę stanu", dostarcza „otwórz jako NOP" (C2); martwy hint = fabrykacja statusu (K-C) → naprawa w tej sesji (W2-B), pełna zmiana stanu → W5; W2-B (0095dca6, 2026-09-09): tabela `ACTION_ROADMAP_HINT_PL` skasowana w całości (24 wpisy → 0: 19 martwych hintów, 5 przekierowań zamienionych na nawigację do realnych kart), `dead_click_guard` bez kategorii „toast roadmapy"; pełna zmiana stanu łącznika nadal → W5 | wysoka |
| C9 | Persystencja stanów łączeniowych | ISTNIEJE-ZWERYFIKOWANE (po W1) | `SwitchingStateORM`/`network_switching_states` skasowane w W1 (`migracja_legacy_db.py:36-37`, pierwsza tabela listy; `domain/project_archive.py:16-19`); jedyny nośnik: `BranchBase.status` w ENM przez `enm/store.py`; 0 czytelników/pisarzy tabeli | „stan łączeniowy 2" z §1 → 1 (W1); badanie wykonano na drzewie w trakcie regresji — potwierdzenie = wynik pełnej regresji W1-B | wysoka |
| C10 | Dziennik operacji łączeniowych | CZĘŚCIOWE | zdarzenia `NOP_SET`, `RING_CONNECTED` (`enm/domain_operations.py:8098-8100`, `enm/domain_event_types.py`) w ogólnym dzienniku ENM; prezentacja tylko przez `PanelCoSieZmienilo.tsx` | brak dedykowanego rejestru/filtra przełączeń → W9 (ekran dziennika) | wysoka |
| C11 | Wpływ stanu łącznika na bieg PF/SC | ISTNIEJE-ZWERYFIKOWANE | `network_model/core/graph.py:46-47,142,162,378` — Ybus tylko z gałęzi `in_service` i łączników CLOSED, wspólne dla PF i SC | — | wysoka |

Wycinki: C2/C4/C8 (pełna zmiana stanu, stany w scenariuszu) → **W5**; C6/C7 → **W10** (plan łączeniowy,
odtwarzanie); C10 → **W9**; C8 martwy hint → **W2-B** (ta sesja). Klasa K-D dostaje nową instancję
(etykieta akcji SLD obiecująca więcej niż operacja), K-F — `AutomationPanel`/`FdirPhase`.

### 3a.D Rodzina D — Uncertainty & method cross-validation (niepewność i walidacja krzyżowa metod)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| D1 | Wyrocznie niezależne (pandapower/MATPOWER) z proweniencją | CZĘŚCIOWE | `tests/golden/registry.py:26-73` (`KlasaWyroczni`, 17 wpisów rejestru), `tests/golden/wyrocznie/pandapower.py`, `proweniencja_k7.json` (wersja pandapower, hash ENM, c_min/c_max); 13 + 12 testów | większość z 17 sieci `REGRESSION_ONLY`; proweniencja wyroczni żyje tylko w testach — koperta biegu API nie niesie „zweryfikowano wyrocznią X" (0 trafień w `api/execution_runs.py`) → W8 (OD-3) + koperta biegu z odniesieniem do wyroczni klasy sieci | wysoka |
| D2 | Walidacja krzyżowa metod rozpływu NR / GS / FD | BEZ-KONSUMENTA | dispatch `enm/canonical_analysis.py:2193-2236`, `enm/assembler.py:838-847` (`solver_method`); 79 testów solverów; jedyny selektor `ui/study-cases/CaseConfigPage.tsx:71-75` = sierota (0 importów, `handleSave` = komentarz) | metoda rozpływu jako opcja biegu w `ui2/spaces/obliczenia` + porównanie NR↔FD w ekranie „Jakość"; kasacja sieroty (K-D) → W3 | wysoka |
| D3 | Strażnik integralności solverów (`solver_diff_guard`) | ISTNIEJE-ZWERYFIKOWANE | `scripts/solver_diff_guard.py:1-130` (SHA-256 7 plików FROZEN vs `guard_references/solver_hashes.json`), CI `p0-extended-guards.yml:202` | to strażnik B-01 (kod), nie porównanie wyników liczbowych między metodami — nazwa w rodzinie nie zmienia natury | wysoka |
| D4 | Granice zdrowego rozsądku wyników | ISTNIEJE-ZWERYFIKOWANE | `analysis/sanity_bounds/short_circuit_bounds.py` (133), `GET /api/quality/sanity-bounds`, `ui2/wyniki/jakosc/EkranJakosci.tsx`; 96 testów | tylko zwarcia; brak pasm dla rozpływu (napięcia, obciążenia, straty) → W3 | wysoka |
| D5 | Analiza wrażliwości | ISTNIEJE-ZWERYFIKOWANE | `analysis/sensitivity/builder.py` (596) + `analysis/lf_sensitivity/builder.py` (418) scalone w `application/analyses/wrazliwosc_rozplywu.py:14,44`; `GET /api/insights/sensitivity`; `ui2/wyniki/wrazliwosc/EkranWrazliwosci.tsx`; 44 + 9 testów | — (nie duplikat: dwa różne przedmioty wrażliwości) | wysoka |
| D6 | Zbieżność, tolerancja, jakość biegu | ISTNIEJE-ZWERYFIKOWANE | `application/analyses/diagnoza_przebiegu.py:208-215`, 3 trasy `api/diagnostics.py:76-106`, `ui2/spaces/obliczenia/diagnoza/PanelDiagnozy.tsx:169-210`; 47 testów | — | wysoka |
| D7 | Obwiednia min/max zwarć (c_min/c_max, S''kQmin) jako pasmo metody | CZĘŚCIOWE | `enm/models.py:421-422`, `enm/mapping.py:170-277`, `enm/zrodlo_zwarcie.py`; wyrocznia `test_pandapower_k7_sk_min.py`; UI: kreator źródła (dane), `BilansIEC.tsx` (jeden scenariusz naraz), selektor c per bieg w sierocie `CaseConfigPage.tsx` | brak ekranu pasma (MIN i MAX obok siebie z jednego przypadku) → W3 | wysoka |
| D8 | Niepewność danych wejściowych i jej propagacja | ZDUPLIKOWANE | jedyna propagacja: `network_model/solvers/v126_academic.py:1990-2085` (Monte Carlo hostingu, beta/normalny, 95 %, ziarno z hashu; 28 testów) w duplikacie akademickim; kanoniczna ścieżka `application/analyses/hosting_capacity.py` → `ui2/oze/zdolnosc/EkranZdolnosci.tsx` deterministyczna; 0 trafień tolerancji parametrów w `network_model/catalog` (poza pasmami czasów wyłączenia nN) | = 9 (ranking v126); konsolidacja: opcja „z niepewnością" w kanonicznym hostingu → W3; tolerancje katalogowe → OD (dane producentów, razem z OD-16) | wysoka |
| D9 | Niepewność pomiarów w estymacji WLS | ISTNIEJE-ZWERYFIKOWANE | `solvers/state_estimation_wls.py:94-100,707` (wagi 1/σ²), `POST /api/quality/state-estimation`, `ui2/wyniki/estymacja/EkranEstymacji.tsx:296-307` (σ per pomiar); 37 + 27 testów | σ zawsze ręczne — brak klas dokładności CT/VT jako źródła domyślnego → W11 | wysoka |
| D10 | Parytet assemblera między maszynami | CZĘŚCIOWE | `tests/golden/parytet_assemblera/{harness,test_parytet_assemblera,zlote_hashe}` (+ `parytet_scenariuszy/p11/benchmarkow`, 32 testy); harness nazywa granicę: surowy wynik i ślad nieprzenośne, porównanie = szkielet + liczby z tolerancją | `python-tests.yml` tylko `ubuntu-latest` — parytet między maszynami nie jest ćwiczony macierzą CI → program 10x (bramki CI), nie wycinek produktu | wysoka |
| D11 | Dowody „dwie drogi = ten sam wynik" | ISTNIEJE-ZWERYFIKOWANE | „bit w bit" w 15 plikach testów, „parytet" w 64 — dominująca metoda dowodzenia refaktorów | — | wysoka |

Wycinki: D2/D4/D7/D8 → **W3**; D1 → **W8** (koperta biegu z wyrocznią); D9 → **W11**; D10 → program 10x.

### 3a.E Rodzina E — Dimensional proof checking (kontrola wymiarowa dowodów)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| E1 | Weryfikacja jednostek w kroku dowodu | ISTNIEJE-ZWERYFIKOWANE | `application/proof_engine/unit_verifier.py` (521; `UnitDimension` :20-64, `UNIT_DIMENSIONS` 33 jednostki, `UnitVerifier.verify_equation` :440, `verify_step` :503); `types.py:325-350` (`ProofStep.unit_check`); 6 użyć w `proof_generator.py` | tabela wymiarów bez temperatury (0 wpisów °C/K przy 33 jednostkach) — kroki cieplne (K wg IEC 60949, starzenie, korekcja R(θ)) bez pełnej kontroli wymiarowej → W10 | wysoka |
| E2 | Rejestr równań z jednostkami symboli | ISTNIEJE-ZWERYFIKOWANE | `equation_registry.py` (3632; `SymbolDefinition.unit`, `EquationDefinition.unit_derivation`, `types.py:136-182`); `test_equation_registry_import.py` | — | wysoka |
| E3 | Własna analiza wymiarowa zamiast biblioteki | ISTNIEJE-ZWERYFIKOWANE | 0 trafień `pint`/`Quantity` w `src` i `pyproject.toml`; własne `UnitDimension` z 6 wymiarami bazowymi | decyzja: zostaje własna (prostota, zero zależności); rozszerzenie o temperaturę = E1 | wysoka |
| E4 | Testy kontroli wymiarowej | ISTNIEJE-ZWERYFIKOWANE | `tests/proof_engine/` 23 pliki, 310 testów; „unit" w 12 plikach (najgęściej `test_proof_engine.py` 30×) | — | wysoka |
| E5 | Konwersje jednostek w łańcuchu danych | CZĘŚCIOWE | `network_model/pochodne/wielkosci_pochodne.py` (303; funkcje z sufiksem jednostki); pomiar 2026-09-09: surowe `*1000`/`/1000` — 29 w `network_model/solvers/**` (FROZEN), **252 poza solverami i `pochodne/`** (application/api/enm) | skalowanie jednostek jest rozproszone i nienazwane poza solverami; rodzina „skalowanie jednostek" w `backend_no_physics_guard` + jedno miejsce (`pochodne/jednostki.py`) → W3 | wysoka |
| E6 | Jednostki w kontraktach wyników | ISTNIEJE-ZWERYFIKOWANE | `domain/result_contract_v1.py:106` (`OverlayMetricV1.unit`), `schemas/resultset_v1_schema.json:203-227` (`unit` WYMAGANE), guard `resultset_v1_schema_guard.py` | — | wysoka |
| E7 | Formatowanie jednostek w raportach i UI | CZĘŚCIOWE | `ui/results-inspector/traceValue.ts:41-100` (`unit` z backendu), słowniki per ekran `ui2/wyniki/*/strings.ts` (np. `ZWARCIA_STRINGS.jednKA`); `network_model/reporting/missing_value.py::format_wynik` formatuje BRAK wartości, nie jednostki | brak jednego formatera jednostek (rozproszenie per ekran) → W10 (dokumenty) | wysoka |
| E8 | Metadane jednostek w katalogu | CZĘŚCIOWE | `network_model/catalog/types.py:531,550` (`ui_fields: (pole, etykieta_pl, jednostka)`) — tylko część typów; większość `mv_*_catalog.py` niesie jednostkę wyłącznie w nazwie pola (`r_ohm_per_km`) | `ui_fields` z jednostką dla każdego typu katalogowego → W10 (BOM/dokumenty) | wysoka |
| E9 | Kontrola wymiarowa w surowym śladzie WHITE BOX | CZĘŚCIOWE — ROZSTRZYGNIĘTE | `network_model/whitebox/tracer.py:8-16` (`WhiteBoxStep` bez pola `unit`); jednostkę dokłada Proof Engine (E1) przy interpretacji śladu | zmiana śladu wymagałaby edycji solverów FROZEN (B-01); kanoniczne miejsce kontroli wymiarowej = dowód (E1) — bez zmian | wysoka |

Uwaga do wcześniejszych założeń badania: `scripts/physics_label_guard.py` pilnuje reguły catalog-first
w modalach `ui/topology`, nie jednostek; `format_wynik` formatuje brak danych — oba nazwane tu, żeby
nikt nie liczył ich jako kontroli wymiarowej. Wycinki: E1 (temperatura), E7, E8 → **W10**; E5 → **W3**.

### 3a.F Rodzina F — Cable system engineering (inżynieria systemów kablowych)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| F1 | Katalog kabli SN i nN | ISTNIEJE-ZWERYFIKOWANE | `CableType` (`catalog/types.py:745-800`: R/X/C, In, Ik1s, izolacja, materiał, przekrój, temperatury, r0/x0/b0, żyła powrotna) — 89 pozycji `mv_cable_line_catalog.py`; `LVCableType` (`:2176-2230`) — 17 pozycji `mv_auxiliary_catalog.py`; 203 testy | — | wysoka |
| F2 | Obciążalność z warunkami ułożenia | ISTNIEJE-ZWERYFIKOWANE | `solvers/cable_ampacity_derating.py` (:67,204,303,429; IEC 60364-5-52 / 60287), `GET /api/solver/cable-laying-conditions`, `POST …/cable-rated-current-preview` (`api/grid_source_preview.py:310,779`), `ui2/kreatory/odcinek-nn/KreatorOdcinkaNn.tsx`; 183 testy | nazwa modułu tras `grid_source_preview.py` myląca (hostuje podglądy kabli/trafo) — porządek w W10 | wysoka |
| F3 | Starzenie termiczne kabla | ISTNIEJE-ZWERYFIKOWANE | `solvers/equipment_checks/cable_thermal_aging.py` (:57-152), `api/equipment_checks.py`, `ui2/kryteria/wyposazenieApi.ts`; 28 testów | — | wysoka |
| F4 | Spadek napięcia | ISTNIEJE-ZWERYFIKOWANE | `solvers/cable_voltage_drop.py` (:22-155), kreator nN, `SldDetailDrawer.tsx`, `LvDomainView.tsx`, pakiet VDROP (`proof_engine/packs/vdrop.py`); 24 testy | — | wysoka |
| F5 | Wytrzymałość zwarciowa cieplna (I²t, K wg IEC 60949) | ISTNIEJE-ZWERYFIKOWANE | `solvers/conductor_thermal_withstand.py` (:133-429, ślad WHITE BOX), `GET /api/quality/conductor-thermal-withstand{,/proof}`, `ui2/wyniki/jakosc/PanelDowoduCieplnego.tsx`; 36 testów | — | wysoka |
| F6 | Dobór przekroju kabla/linii | BRAK | 0 trafień `dobierz_przekroj`/`dobor_kabla` w `src`; normy 60364-5-52/60287 tylko jako obciążalność danego przekroju | = 2 #6, §5 poz. 1 → W10 | wysoka |
| F7 | Tory równoległe (`n_parallel`) | ISTNIEJE-ZWERYFIKOWANE | `enm/models.py:288,364,513,1617-1655` (jedna reguła odczytu), 9 konsumentów, `tests/enm/test_liczba_torow_n_parallel.py` (15) | — | wysoka |
| F8 | Mufy, głowice, końcówki (`CableJoint`) | UI-BEZ-ZDOLNOŚCI | `enm/models.py:811-827` (`CableJoint`: 4 typy, `position_km`, `catalog_ref`), pole `Cable.cable_joints`; typy/etykiety SLD (`ui/sld/v3/symbols/defs.ts`, `resultLabels.ts`); 0 operacji domenowych dodających mufę, 0 tras | element danych bez drogi wejścia → W11 (dokumentacja ułożenia / as-built) | wysoka |
| F9 | Uziemienie ekranu, żyła powrotna, napięcia indukowane | CZĘŚCIOWE | żyła powrotna liczona realnie w pętli zwarcia nN (`fault_loop_builder.py:60-117`, `fault_loop_iec60364.py:165-243`); uziemienie ekranu = etykieta `earthing_role` (`enm/models.py:1075-1084`) bez fizyki; 0 trafień napięć indukowanych | model uziemienia ekranu (jedno-/dwustronne) → W5; napięcia indukowane i straty w ekranach (IEC 60287-1-1) → W10 razem z doborem przekroju | wysoka |
| F10 | Trasy kablowe i długości z GIS | BRAK | `length_km` skalar ręczny (`enm/models.py:203,234`); 0 trafień geometrii trasy | = 8 #12 → W12 | wysoka |
| F11 | Korekcja temperaturowa rezystancji | ISTNIEJE-ZWERYFIKOWANE | `application/solvers/lv_temperature_correction.py` (155; IEC 60909 R(θ)), `pochodne/wielkosci_pochodne.py:237`; konsumenci assembler, `short_circuit_binding.py`, `fault_loop/route.py`; 59 testów | — | wysoka |
| F12 | Straty w kablach | ISTNIEJE-ZWERYFIKOWANE | `solvers/power_flow_result.py:70-117,238-248` (FROZEN), 5 konsumentów ui2 | — | wysoka |
| F13 | Zestawienie kabli / BOM | CZĘŚCIOWE | `application/analyses/lista_materialowa.py`, `GET /api/der-sn/{case_id}/bom` — tylko zakres wniosku OZE-SN; 9 testów | = 10 #15, §5 poz. 25 → W10 | wysoka |
| F14 | Materiały i przekroje w katalogu | ISTNIEJE-ZWERYFIKOWANE | `conductor_material` (`types.py:574-785`), 49 AL / 25 CU w `mv_cable_line_catalog.py` | — | wysoka |

Wycinki: F6/F9 (indukowane)/F13 → **W10**; F8 → **W11**; F9 (uziemienie ekranu) → **W5**; F10 → **W12**.

### 3a.G Rodzina G — Transformer engineering (inżynieria transformatorów)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| G1 | Katalog transformatorów WN/SN i SN/nN z zaczepami | ISTNIEJE-ZWERYFIKOWANE | `catalog/types.py:990-1082` (`TransformerType`: Sn, uk, Pk, P0, i0, grupa, zaczepy); `mv_transformer_catalog.py` 192 pozycje (34 statyczne + 142 generowane PV/BESS/FW + 16 polskich producentów); `TAP_CHANGER_CATALOG` 4 pozycje (`audit2_catalogs.py:275-306`); `GET /api/catalog/transformer-types`, `GET /api/v1/catalog/audit2/tap-changers`; `ui2/kreatory/transformator/KreatorTransformatoraSnNn.tsx`; 71 testów | — | wysoka |
| G2 | OLTC w rozpływie; studia zaczepów (sweep, profil roczny, optymalizacja) | ISTNIEJE-ZWERYFIKOWANE | `solvers/power_flow_oltc.py` (282), `power_flow_oltc_studies.py` (985) → `enm/canonical_analysis.py:2239-2531`; `POST /api/execution/study-cases/{id}/runs` (`oltc_study`); `ui2/wyniki/oltc/EkranBadanOltc.tsx`; 86 testów backend + 28 FE | = 9 #7 (prawdziwa `optimize_tap_positions`) | wysoka |
| G3 | Straty transformatora ΔP(β) = P0 + β²·Pk | ZDUPLIKOWANE | kanon `solvers/equipment_checks/transformer_losses.py:53-161` → `POST /api/solver/transformer-losses` → `ui2/kryteria/SekcjaKartyKatalogu.tsx:162-252` (28 testów); duplikat `v126_academic.py::_opf_loss_lcc` (~:2126): `p0_kw + pk_kw*0.45**2` z zaszytym β = 0,45 i `oltc_tap_position: 0` (:2173) → kafel OPF/LCC w `ui2/wyniki/akademickie` | dwie liczby strat tej samej sieci; = §1 pkt 4 „straty/OLTC ×2", 9 #7; K-B → W3 | wysoka |
| G4 | Prąd załączania (udar magnesujący), blokada 2. harmonicznej | CZĘŚCIOWE | jedyna implementacja `v126_academic.py:1781-1866` (`_transient`): krotność `inrush_multiple_in` = parametr żądania (domyślnie 8,0), `second_harmonic_percent = 63.0/inrush_multiple` — wzór bez cytowanej normy; kafel „Stany przejściowe i napięcie powrotne" (`prezentacja.ts:530-540`); 6 testów całego modułu | brak modelu z nasycenia rdzenia i kąta załączenia; domyślne 8,0 i 63/k = nowa instancja K-C (moduł V12.6 → OD-15(d)); wynik projektowy (blokada 87T) → W6 razem z H3 | wysoka |
| G5 | Obciążalność cieplna i starzenie transformatora (IEC 60076-7, hot-spot) | BRAK | 0 trafień `60076-7`/`hot spot`; `loadability_pu` (`enm/domain_ops_models.py:1178-1181`) = sufit walidacyjny mocy TR blokowego DER, nie model termiczny | K-G; warunkiem wstępnym jest profil obciążenia (QSTS, 3 #9) → W6 | wysoka |
| G6 | Grupa połączeń i model składowej zerowej | CZĘŚCIOWE | `enm/zero_sequence_transformer.py` (383; tablica połączeń wg IEC 60909-0) → `enm/mapping.py:544-583` → `enm/assembler.py:965`; 62 testy; `vector_group` edytowalny tylko w warstwie zastanej `StationConfigTransformerCard.tsx:255-256`, w `ui2/kreatory/transformator/` dziedziczony z katalogu | walidacja słownika IEC 60076 i `neutral_accessible` pochodne = F-4 → W5 (CV-5) | wysoka |
| G7 | Korekcja K_T i udział transformatora w zwarciu | ISTNIEJE-ZWERYFIKOWANE | `solvers/short_circuit_iec60909.py:358-410` (K_T = 0,95·c_max/(1 + 0,6·x_T), IEC 60909-0); 53 testy | FROZEN (B-01) — tylko opis | wysoka |
| G8 | Praca równoległa transformatorów | CZĘŚCIOWE | `Transformer.n_parallel` (`enm/models.py:288`; jedna reguła `:1614-1657`: Z/n, Sn·n) → `enm/mapping.py:1147-1153`; kreator stacji `transformer_units`; 15 testów; karta G-STK-6 | tylko N identycznych jednostek; jednostki o różnych uk%/przekładniach (prądy wyrównawcze, podział obciążenia) da się zamodelować jako osobne elementy, ale brak nazwanego sprawdzenia warunków pracy równoległej → W10 | wysoka |
| G9 | Podgląd prądów znamionowych | ISTNIEJE-ZWERYFIKOWANE | `solvers/transformer_rated_currents.py`; `POST /api/solver/transformer-rated-currents-preview`; kreator transformatora; 5 + 10 testów | — | wysoka |
| G10 | Dobór / wymiarowanie transformatora z obciążenia | CZĘŚCIOWE | backend 0 trafień; FE `stacjaModel.ts:415-427` (`doborTransformatorow` — „wyłącznie porównanie napięć katalogowych — ZERO fizyki"), `KreatorStacjiSnNn.tsx:370-401` (`rekomendowanyTrafoRef`); 58 testów FE | wzorzec „dobór = filtr katalogowy" (identyczny jak H2 i F6): brak wymiarowania z mocy szczytowej, jednoczesności i N-1 → W10 razem z doborem przekroju | wysoka |
| G11 | Transformatory trójuzwojeniowe | BRAK | 0 trafień w backendzie, froncie i testach; kanon `PRODUCT_CAPABILITY_CONSTITUTION.md:40` nazywa je „przyszłość" — roszczenie zgodne z kodem | K-G; wymaga T-2 (terminale, CV-5) — poza kolejką W1–W12 do decyzji zakresu (GPZ 110/SN/SN) | wysoka |
| G12 | Regulacja napięcia (`voltage_setpoint_kv`, pasmo martwe) | ISTNIEJE-ZWERYFIKOWANE | `core/branch.py:585`, `enm/models.py:340`; `power_flow_oltc.py:137,180-184`, `_studies.py:314-423`; operacja `transformer_voltage_setpoint_kv` (`enm/domain_operations.py:2963-2965`); kreator | — | wysoka |
| G13 | Zabezpieczenie różnicowe 87T / Buchholz | BRAK | 0 obliczeń; „Buchholz" = etykieta w `catalog/bay_templates.py:120,127`; „87T" = etykieta-wymóg `domain/der_protection_functions.py:322-334`; jedyny ślad liczbowy `inrush.blocking_87t_recommended` (G4) | = 4 #13 → W4 | wysoka |
| G14 | Zaczepy w imporcie i migracji | ISTNIEJE-ZWERYFIKOWANE (W1) | import XLSX czyta `zaczep_min/zaczep_max/zaczep_krok_pct` (`xlsx_import/importer.py:1200-1202`) → `enm/kompilator_grafu.py:395-450`; 63 testy; migracja legacy wymusza `tap_min = tap_max = 0` (`application/migracja_legacy.py:186-190`, udokumentowane: legacy ORM nie niósł zaczepów; pomiar: 0 wierszy legacy) | potwierdzenie = §9 §4 (meldunek W1) | wysoka |

Wycinki: G3 → **W3** (K-B); G4 → OD-15(d) (stałe) + **W6** (wynik projektowy); G5 → **W6**; G6 → **W5**; G8/G10 → **W10**;
G13 → **W4**; G11 → K-G poza kolejką (kanon: „przyszłość").

### 3a.H Rodzina H — Insulation coordination / surge protection (koordynacja izolacji i ochrona przepięciowa)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| H1 | Katalog ograniczników przepięć | ISTNIEJE-ZWERYFIKOWANE | `SurgeArresterType` (`types.py:1708-1737`: Um, MCOV, Ur, Ures 10 kA, TOV 10 s, klasa energetyczna, BIL chronionego); `mv_surge_arrester_catalog.py` 13 pozycji (PN-EN 60099-4); `GET /api/catalog/surge-arrester-types`; `ui2/kreatory/ogranicznik/KreatorOgranicznikaSn.tsx`; 9 + 11 testów | — | wysoka |
| H2 | Dobór ogranicznika (MCOV z warunków sieci, Ur, klasa) | CZĘŚCIOWE | filtr napięciowy ±30 % `api/catalog.py:1064-1096` (`_auto_populate_surge_arresters`); `ogranicznikModel.ts:1-9` („margines BIL liczy solver"); TOV i napięcie obniżone podstawiane `mcov·2,8`, gdy brak karty — dług NAZWANY w `scripts/solver_input_substitute_guard.py:828-832` („jedyna z dziewięciu długów karty, którą bramka widzi; osiem pozostałych to nagie stałe w działaniu") | brak obliczenia wymaganego MCOV ze współczynnika zwarcia doziemnego (Z0/Z1 sieci, IEC 60099-5) — wzorzec „dobór = filtr" → W10; fallback 2,8× = K-C → kasacja razem z H5 | wysoka |
| H3 | Koordynacja izolacji IEC 60071 (BIL, margines ochronny) | CZĘŚCIOWE | most `solver_input/v126_contracts.py:216-270` (`build_v126_insulation_from_enm`); `v126_academic.py:1652-1725` (tabela 12/17,5/24/36 kV → 75/95/125/170 kV zgodna z IEC 60071-1; margines (BIL − U_res)/U_res); `POST /api/cases/{id}/runs/v126/insulation_coordination`; kafel „Koordynacja izolacji" w `ui2/wyniki/akademickie`; ta sama tabela zaszyta drugi raz w `api/v126_academic.py:290-293`; 32 testy | jedyna implementacja żyje w module V12.6 obok długu H5; 0 trafień „60071"/„BIL" w `PRODUCT_CAPABILITY_CONSTITUTION.md` (zdolność poza taksonomią kanonu); tabela ×2 → jedno źródło; przeniesienie pod kanoniczny solver i ekran „Kryteria" → W6 | wysoka |
| H4 | Poziomy izolacji per pozycja katalogowa (BIL/LIWL aparatów, kabli, transformatorów) | CZĘŚCIOWE | `SwitchEquipmentType.u_m_kv`, `CableType.voltage_rating_kv` — tylko klasa napięciowa; BIL z tabeli generycznej wg Um (H3) | brak pola BIL/LIWL per pozycja (różnice producentów w tej samej klasie) — K-H (dane) → OD-17 | wysoka |
| H5 | Przepięcia dorywcze TOV i detekcja doziemna w V12.6 | DO-PRZEPROJEKTOWANIA | `v126_academic.py:1608-1620` (binarna klasyfikacja isolated/earthed zamiast współczynnika z Z1/Z2/Z0), TOV = Um·1,4 lub Um·1,15 bez normy; `earth_fault_detection` (:1723-1780): `u0_start_percent = 5.0`, `p0_set_w = 1.0`, `i5_multiplier = 3.0` | = §1 pkt 3, K-C (instancja 5,0/1,0/3,0 nazwana; doprecyzowanie: także 1,4/1,15 i 2,8) → OD-15(d); prezentacja bez wartości domyślnych → W2 | wysoka |
| H6 | Odległość ochronna ogranicznika | BRAK | 0 trafień; propozycja niewdrożona `docs/uiux/PROPOZYCJE_ROZSZERZEN_2026-07.md:91` (P34) | K-G → W10 (razem z doborem ogranicznika) | wysoka |
| H7 | Przepięcia piorunowe / łączeniowe (LIWL / SIWL) | CZĘŚCIOWE — ROZSTRZYGNIĘTE | LIWL przez BIL (H3); SIWL 0 trafień — wg IEC 60071-1 wymagane dla Um ≥ 245 kV (zakres II), poza zakresem napięć produktu | brak SIWL nie jest luką; bez zmian | wysoka |
| H8 | Ogranicznik jako aparat pola w ENM i na SLD | ISTNIEJE-ZWERYFIKOWANE | `enm/models.py:1029-1061` (`BayPrimaryDevice.kind = SURGE_ARRESTER`, „rysowany wyłącznie gdy pochodzi z danych"); operacja `add_surge_arrester_sn` (`api/domain_ops_policy.py:741,1014`); symbol `surge_arrester_10ka`; 9 testów | — | wysoka |
| H9 | Pakiet dowodowy koordynacji izolacji / sprawdzenia ogranicznika | BRAK | 0 trafień w `application/proof_engine/packs/` (11 plików) i `solvers/equipment_checks/` (4); jedyny ślad `trace.add("iec60071_arrester_margin")` wewnątrz V12.6 | K-G; pakiet dowodowy = warunek przejścia H3 do kanonu → W6 | wysoka |
| H10 | Ekran doboru ogranicznika | ISTNIEJE-ZWERYFIKOWANE | `KreatorOgranicznikaSn.tsx` (375) + `ogranicznikModel.ts` (106); zapis `field_spec` czytany przez read-model pola (H8) i most V12.6 (H3); 11 testów FE | — | wysoka |

Wycinki: H2/H6 → **W10**; H3/H9 → **W6** (koordynacja izolacji pod kanoniczny solver i Proof Engine, poza V12.6); H4 → OD-17
(dane); H5 → OD-15(d) + **W2** (prezentacja); H7 rozstrzygnięte.

### 3a.I Rodzina I — BESS operation strategies (strategie pracy magazynów energii)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| I1 | Model BESS w ENM (SOC, energia, sprawność) | CZĘŚCIOWE (pola zapisywane, nieczytane) | `Generator.gen_type = "bess"` z `p_mw`/`q_mvar`/`limits` (`enm/models.py:493-508`); `bess_mode`, `soc_min_percent`, `soc_max_percent` w `BaySourceEndpoint` (`enm/domain_ops_models.py:1286-1288`) zapisywane do `materialized_params` (`domain_operations_v2.py:4201,4329-4331`) i walidowane (`bess.soc_limits_invalid`, `canonical_operations.py:2046-2060`); 0 czytelników w solverach i analizach | = 1 #7, 5 #3 (doprecyzowanie: pola strukturalne, nie tylko opisowe; pojemność nameplate w katalogu `capacity_kwh` — brak dotyczy stanu dynamicznego); roszczenie `PRODUCT_CAPABILITY_CONSTITUTION.md:42` „stan BESS: WSPIERA TERAZ" sprzeczne z kodem — poprawione (§6 poz. 17) → W6 | wysoka |
| I2 | Katalogi przekształtnika (PCS) i baterii | ISTNIEJE-ZWERYFIKOWANE | `BESSInverterType` (`types.py:3733-3814`: p_charge_kw, p_discharge_kw, un_kv, s_n_kva), `BESSBatteryType` (`:1481-1530`: chemia, capacity_kwh, U_dc, C-rate); `GET /api/catalog/bess-inverter-types`, `bess-battery-types`; `derRemoteCatalogs.ts:137-162` → `AddDerWizard.tsx`; 49 testów | — | wysoka |
| I3 | Strategie pracy (peak shaving, arbitraż, FCR/aFRR/mFRR, autokonsumpcja, wsparcie napięcia, wyspa) | CZĘŚCIOWE | `audit2_catalogs.py:83-244` (`BessOperationModeItem`, 9 kodów — pomiar, `requires_four_quadrant`/`requires_grid_forming`); walidacja zgodności PCS z trybem `proof_engine/packs/audit2_validation.py:88-92`; wybór w `AddDerWizard.tsx`; 41 testów | selektor + lista kontrolna, bez dyspozycji P(t)/SOC(t) dla żadnego z 9 trybów — K-D (wybór bez skutku liczbowego) → W6 | wysoka |
| I4 | Rozpływ w czasie (QSTS) dla magazynu | BRAK | 0 trafień `time_profile_ref`/`run_time_series_power_flow` (skasowane w CV-3.2); `load_profile_ref` zapisywany (`domain_ops_models.py:1340`, `domain_operations_v2.py:2559`), 0 odczytów — pole osierocone; jedyny tor wielookresowy = `oltc_annual_profile` (G2) z listą w żądaniu | = 1 #9, 3 #9, 9 #15; `load_profile_ref` → konsument albo kasacja (K-E) → W6 | wysoka |
| I5 | Limity ładowania / rozładowania, degradacja | CZĘŚCIOWE | `p_charge_kw`/`p_discharge_kw` w `MaterializationContract.solver_fields`; do sieci trafia tylko `p_discharge_kw` jako `p_mw` (`enm/domain_operations.py:5414`); degradacja 0 trafień (jedyna „degradacja" w repo = starzenie izolacji kabla) | ładowanie jako odbiór (znak P) nieosiągalne bez scenariusza/profilu → W6; krzywe degradacji = dane producenta (K-H) → OD-17 | wysoka |
| I6 | Ekrany BESS (pulpit OZE, kreator źródła, konfigurator stacji) | ISTNIEJE-ZWERYFIKOWANE (wprowadzanie danych) | `ui2/oze/pulpit/SekcjaMagazynu.tsx` (150; „Zero fizyki", tabliczka), `KreatorZrodlaOze.tsx:1110-1179` (wariant BESS), `AddDerWizard.tsx`, `StationConfiguratorSurface.tsx:1271`; 46 testów FE | ekran uczciwy (tabliczka, nie wynik); dane trybu/SOC nieskonsumowane (I1) | wysoka |
| I7 | Analizy z udziałem BESS | CZĘŚCIOWE | BESS tylko jako element zbioru DER w `grid_strength.py:31` (SCR/WSCR); 0 trafień „bess" w `hosting_capacity.py`, `reactive_adequacy.py` | żadna analiza nie używa pojemności/SOC (np. hosting z magazynem w czasie) → W6 | wysoka |
| I8 | Wymagania NC RfG / PTPiREE dla magazynów | ISTNIEJE-ZWERYFIKOWANE — ROZSTRZYGNIĘTE | `audit2_catalogs.py:66-74` dokumentuje: Rozporządzenie (UE) 2016/631 nie nakłada odrębnych wymagań dla magazynów ponad progi typów A–D; profile `nc_rfg/*.yaml` bez rozróżnienia technologii | świadoma decyzja zgodna z rozporządzeniem, nie luka; bez zmian | wysoka |
| I9 | Stan energii magazynu w scenariuszu operacyjnym | BRAK | `enm/scenariusze.py` (824): 0 trafień „soc"/„bess"; docstring :20-24 nazywa tryby DER/BESS jako świadomie nieobjęte „dopóki nie ma konsumenta" | zależy od I1/I4 → W6 | wysoka |

Wycinki: I1/I3/I4/I5/I7/I9 → **W6** (rozszerzenie zakresu „BESS jako magazyn": ładowanie jako odbiór, dyspozycja trybów,
SOC w scenariuszu, `load_profile_ref` konsument albo kasacja); I5 degradacja → OD-17; I8 rozstrzygnięte.

### 3a.J Rodzina J — Inverter model validation (walidacja modeli falowników)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| J1 | Modele falownika w solverach (PF Q(U)/cosφ(P), SC k_sc, FRT/HVRT, DFIG) | CZĘŚCIOWE | PF `solvers/power_flow_inverter.py:49-90` z ENM `Generator.meta` przez `enm/assembler.py:260-354`; SC `core/inverter.py:13-38` (Ik = k_sc·In), k_sc z katalogu albo założenie 1,1 z proweniencją (`enm/mapping.py:676-759`); DFIG crowbar `machine_sc_iec60909.py:329-390`; FRT `frt_hvrt/engine.py:39-40,65,67` stałe tp = 0,1, tiq = 0,02, K = 2,0 dla każdego urządzenia — kontrakt FROZEN `FrtHvrtSolverInput` (`contracts.py:10-27`) nie ma pola na katalog `der_dynamic` (`InverterDynamicProfile.tp_s/tq_s`), który istnieje; 45 + 19 + 71 testów | = 5 #10, OD-15(b): katalog dynamiki DER bez konsumenta w torze FRT (K-E) → W6 po OD-15(b) | wysoka |
| J2 | Katalog przekształtników (PV/BESS/wiatr: k_sc, Q(U), cosφ(P)) | ISTNIEJE-ZWERYFIKOWANE | `mv_converter_catalog.py` (1364; 176 pozycji — pomiar `get_all_converter_types()`); `ConverterType` (`types.py:1216-1288`); dwie trasy odczytu (`pv-/bess-inverter-types` i `converter-types`) tego samego katalogu — bez duplikacji fizyki; kreator OZE, `AddDerWizard` | pola `sc_pq_split`/`sc_transient_k`/`sc_sustained_k` (`types.py:1282-1284`) = 0 odwołań w solverach (= 5 #9) | wysoka |
| J3 | Certyfikaty PTPiREE (wykaz WiPWC 1.2/1.3) | CZĘŚCIOWE (mechanizm pełny, dane śladowe) | `ptpiree_wykaz_snapshot.json` 6887 rekordów; `match_ptpiree_certificate()` (`mv_ptpiree_catalog.py:330-407`); `annotate_with_ptpiree_status()` w `get_all_converter_types()` i przy tworzeniu generatora (`domain_operations_v2.py:4042-4067`); readiness `der.inverter_certificate_unlinked` (WARNING); `GET /api/catalog/ptpiree/{manifest,generator-certificates}`; `DerSurfaces.tsx:743-1029`; 46 testów | 1 zmierzone dopasowanie katalog ↔ wykaz (`test_most_certyfikatu_ptpiree.py:28-29`); pozostałe 175 pozycji katalogu (nazwy ilustracyjne) nie mają czego wiązać — K-H → OD-17 (katalog przekształtników zasilany z wykazu) | wysoka |
| J4 | Testy zgodności NC RfG / PTPiREE (macierz per DER, zgodność przekrojowa per przypadek) | CZĘŚCIOWE | `solvers/ncrfg_ptpiree/engine.py` (972, FROZEN), 5 profili OSD; `POST /api/ncrfg-tests/run`, `GET /catalog`, `GET /cases/{id}/compliance`; `ui2/oze/macierz/MacierzNcRfg.tsx` → `/catalog` + `/run`; 12 + 51 testów | trasa przekrojowa per przypadek bez konsumenta FE (0 trafień w `ui2/oze`) = 5 #12 (K-E) → W3 | wysoka |
| J5 | Krzywe regulacji Q(U)/cosφ(P) i trajektoria FRT | CZĘŚCIOWE | FRT: `ui2/oze/frt/WykresTrajektoriiChart.tsx:157` z realnego biegu (`frt_trajektorie.py`); Q(U)/cosφ(P): `ui2/kreatory/zrodlo-oze/WykresyNcRfg.tsx` (246; SVG kreślony z nastaw użytkownika, jawnie „ZERO fizyki sieci") = podgląd prawa sterowania, nie wynik; `ui2/oze/krzywe/` = obwiednia P–Q (`pq_area.py`), nie krzywe regulacji | brak wykresu „Q wstrzyknięte w biegu vs prawo Q(U)" (= 5 #1: `PowerFlowResult` nie niesie trybu ani limitu Q) → W3 | wysoka |
| J6 | Ochrona LoM / anti-islanding | CZĘŚCIOWE — ROZSTRZYGNIĘTE | `application/analyses/ochrona_lom.py` (671; ROCOF 81R, wektor 78, 81U/O wg NC RfG); `GET /api/oze-analysis/lom-protection`; `ui2/oze/lom/EkranLom.tsx`; 23 + 18 testów | IEC 62116 (procedura badania anti-islanding) tylko jako etykieta `standard_compliance` (`der_dynamic/models.py:90`) — to badanie typu producenta potwierdzane certyfikatem (J3), nie zdolność projektanta sieci; = 5 #11 (koordynacja z SPZ → W4) | wysoka |
| J7 | Walidacja modelu wobec pomiarów (powykonawcza) | CZĘŚCIOWE | `application/analyses/zgodnosc_powykonawcza.py` (520); `POST /api/quality/as-built-compliance` (bezstanowe); `ui2/wyniki/odbior/EkranOdbioru.tsx`; 35 testów + FE | bez trwałości, dokumentu i e2e = domena 11 → W11 | wysoka |
| J8 | Proweniencja parametrów falownika w biegu | ISTNIEJE-ZWERYFIKOWANE | `Generator.source_mode` (KATALOG/MIGRACJA/EKSPERCKI_RECZNY); `InverterSource.k_sc_zrodlo` (KATALOG/ZALOZENIE) do śladu WHITE BOX (`mapping.py:807-823`); readiness `inverter.k_sc_assumed` (WARNING) / `inverter.k_sc_missing` (BLOCKER) | predykat „element wymaga katalogu" w dwóch miejscach: `wymaga_referencji_katalogowej` (gałęzie) i E009 (`enm/validator.py:697-760`: linie, kable, transformatory, źródła — bez `Generator`, dla którego obowiązuje osobny kod k_sc) — reguła „predykaty parami" → jedno źródło prawdy → W3 | wysoka |
| J9 | Widmo harmoniczne falownika | CZĘŚCIOWE (po W2-C; dane widm = OD-17) | W2-C (daf303a3, 2026-09-09): `solver_input/v126_contracts.py` bez literałów — widmo z karty `ConverterType.harmonic_spectrum_percent` albo z jawnego wejścia `parameters.harmonic_spectra` (proweniencja KATALOG/RĘCZNE w payloadzie), droop P(f)/Q(U) i tryb GFM z karty (`control_mode`), moc z `sn_mva`; brak widma → źródło pominięte z kodem `generator.harmonic_spectrum_missing` (WARNING), brak karty/mocy → `generator.converter_card_missing` (BLOCKER); `pominiete_zrodla` w odpowiedzi i panel „Źródła harmoniczne" w `ui2/wyniki/akademickie`; pomiar na substracie 52s: 16/16 fabrykowanych źródeł → 0/16, 16/16 przekształtników nadal w wejściu; testy backend 863 celowanych + FE 124 | żadna z pozycji katalogu przekształtników nie niesie dziś widma producenta (pin 0 do OD-17) — analiza harmonicznych z falowników liczy się tylko po podaniu widm z karty lub ręcznie; = K-H | wysoka |
| J10 | Normy modeli (PTPiREE, IEC 61400-27, IEC 62116, EN 50549) | CZĘŚCIOWE | PTPiREE (J3) i IEC 61400-27 (`der_dynamic/defaults.py:123-199`, 4 typy WT z `source_reference`) sterują danymi; IEC 62116 i EN 50549 tylko etykiety (`der_dynamic/models.py:90`, `application/stability/voltage_trajectory.py:14-15` — moduł fasadowy 6 #2) | = J6 (rozstrzygnięte), 6 #2 (W2/W6) | wysoka |

Wycinki: J1 → OD-15(b) + **W6**; J4/J5/J8 → **W3**; J7 → **W11**; J9 → **W2-C** (ta kolejka); J3 → OD-17; J2 = 5 #9;
J6/J10 rozstrzygnięte.

### 3a.K Rodzina K — Interoperability / topology healing (wymiana danych i naprawa topologii)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| K1 | Formaty wymiany: XLSX, ZIP, JSON ENM, DXF, SVG/PDF, CIM/CGMES, GIS | CZĘŚCIOWE | XLSX → ENM (1 #22, W1); ZIP 3.0.0 (`domain/project_archive.py:50`, `ui2/spaces/projekt/archiwum/`); `GET /{case_id}/enm` (`api/enm.py:137`), `PUT` wyłączony w produkcji (12 #6); DXF tylko eksport (`ui/sld/v2/export/exportDxf.ts`); SVG/PDF/DXF/IEC 61850/CIM eksport SLD (8 #10); CGMES → K2; GIS BRAK (8 #12, F10) | jedyny import modelu = XLSX i ZIP; import CIM/CGMES gotowy bez trasy (K2) | wysoka |
| K2 | Import / eksport CIM/CGMES (EQ + TP) | BEZ-KONSUMENTA | `infrastructure/cgmes/` (8 plików z `__init__.py`) + `application/cgmes/service.py` (278) = 1843 linie (`export_cgmes`/`import_cgmes`); 46 testów (`tests/cgmes/`, round-trip); 0 tras API (`grep cgmes backend/src/api` = 0), 0 konsumentów FE (poza napisem `layoutEngine.ts:625`) | fakt nieobecny w §3 (8 #11/#12 mówią o DXF/GIS) → nowy wiersz 8 #13; nie kasować: kompletny, przetestowany backend; trasa + ekran w archiwum projektu → W12 | wysoka |
| K3 | Walidator topologii ENM | ISTNIEJE-ZWERYFIKOWANE | `enm/validator.py` (2075; 41 unikalnych kodów E/W/I — pomiar: E001 brak źródła, E002 brak szyn, E003 wyspa, E004 szyna bez napięcia, E005 R = X = 0, E006 TR bez uk, E007 TR HV = LV, E030 bez portu, …); `network_model/validation/semantic_rules.py` jako post-hook po każdej operacji (`semantic_issues`); `GET …/enm/validate`, `readiness`; `SemanticIssuesBanner.tsx`; 36 testów semantic + `tests/enm/**` | — | wysoka |
| K4 | Naprawa topologii („fix actions") | POZORNIE-ISTNIEJE | `FixAction.action_type` ∈ {OPEN_MODAL, NAVIGATE_TO_ELEMENT, SELECT_CATALOG, ADD_MISSING_DEVICE} — wyłącznie nawigacja; E003 tylko `suggested_fix` tekstowy; 0 trafień `auto_fix`/`heal`/`napraw(` w `backend/src` | nazwa obiecuje automatyzm, którego nie ma (K-D) → terminologia „napraw" → „przejdź do" w W9; automatyczne scalanie/łączenie wysp NIE jest celem (projektant decyduje) — rozstrzygnięte | wysoka |
| K5 | Wyspy, osierocone punkty rozgałęzienia, wiszące gałęzie, duplikaty | CZĘŚCIOWE | wyspy: `enm/topology.py:70` (`Wyspa`), `assembler.py:524,562-572` (`source.multiple_grid_sources_in_island`), E003; osierocone punkty rozgałęzienia: `semantic_rules.py:307-345` (`semantic.branch_point_orphan`); duplikaty: tylko zapobieganie przy zapisie (`OP_REF_DUPLICATE` BLOCKER, `enm/topology_ops.py:160-838`); „wiszące gałęzie" 0 trafień (najbliżej E005/E030) | skan modelu po imporcie (duplikaty, gałąź donikąd) → W12 razem z K2 | wysoka |
| K6 | Scalanie szyn / elementów | CZĘŚCIOWE | jedyna operacja `merge_nn_segments` (`domain_operations_v2.py:3359-3487`: dwa odcinki nN tego samego typu przez szynę pośrednią, z blokadami); `merge_bus` 0 trafień | scalanie szyn SN i segmentów różnych typów → W12 (healing po imporcie) | wysoka |
| K7 | Identyfikatory zewnętrzne i proweniencja importu | CZĘŚCIOWE | `source_reference` per wiersz: XLSX `arkusz:{plik}#{arkusz}:{wiersz}` (`xlsx_import/importer.py:1140,1204`), legacy `legacy:<źródło>:<element>` (`migracja_legacy.py:16,152,191`); `external_id` 0 trafień | ślad jednokierunkowy (skąd), bez indeksu odwrotnego (element ENM dla ID zewnętrznego) — potrzebny przy re-imporcie/aktualizacji (round-trip CGMES/DXF) → W12 | wysoka |
| K8 | Bramka katalogowa wszystkich dróg wejścia | ISTNIEJE-ZWERYFIKOWANE | `catalog/governance.py:53-70` (`wymaga_referencji_katalogowej`) używana przez ZIP (`project_archive/service.py:61,940`, komentarz antyduplikacyjny), XLSX i ręczne przez E009 (`validator.py:697-727`); testy XLSX + archiwum + pin W1 | = J8 (predykat ×2 → W3) | wysoka |
| K9 | Round-trip determinizm (ZIP, XLSX) | ISTNIEJE-ZWERYFIKOWANE | ZIP: 76 testów w 3 plikach (`test_roundtrip_export_import_export_is_bit_identical`, `test_archive_hash_itself_is_verified_not_only_sections`); XLSX: `test_ten_sam_arkusz_daje_ten_sam_odcisk_modelu` (z 63); wyrocznia `tests/golden/wyrocznie/test_pandapower_import_arkusza.py` (job CI pandapower) | — | wysoka |
| K10 | Kontrakt API / OpenAPI i cykl życia tras | ISTNIEJE-ZWERYFIKOWANE | `backend/schemas/openapi_snapshot.json` 4.0.0: 310 ścieżek / 329 operacji / 227 schematów (pomiar 2026-09-09 po W1); 61 modułów `api/*.py`; `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md` (statusy per trasa); `router_mount_guard.py`; test aktualności snapshotu | korekta 12 #2 (350 tras / 63 moduły z bazy a701152f → po kasacjach W1) | wysoka |

Wycinki: K2/K5/K6/K7 → **W12** (rozszerzenie: CGMES trasa + ekran, healing po imporcie, indeks tożsamości zewnętrznej);
K4 terminologia → **W9**.

### 3a.L Rodzina L — Project-wide requirements traceability (śledzenie wymagań w skali projektu)

| # | Zdolność | Klasyfikacja | Dowód | Brakuje / uwaga | Pewność |
|---|---|---|---|---|---|
| L1 | Cel projektu / klasa projektu / DoD | CZĘŚCIOWE (UI bez zdolności) | `CelProjektu.tsx` (60; 4 kafle; „bez nawigacji ani trwałości"); `ProjectCreate` bez pola celu (`api/projects.py:46-60`); 8 testów `celProjektu.test.tsx` + 11 `otworzProjekt.test.tsx` | = 12 #10 (korekta liczby testów), A2 → W9 | wysoka |
| L2 | Rejestr wymagań OSD (Reference Engine, pakiety) | CZĘŚCIOWE | `reference_engine/compliance.py` (674); 8 pakietów (`iec62271`, `iec60617`, `abb_unigear`, `abb_safering`, `siemens_8djh`, `schneider_sm6`, `elektrometal_e2alpha`, `osd_enea`); `GET /api/reference/packs`, `/cases/{id}/reference/compliance`; konsumenci FE: `ui2/referencje/`, `ui2/spaces/gotowosc/SekcjaZgodnosciReferencyjnej.tsx`, `ui2/spaces/model/ZgodnoscReferencyjna.tsx`, `ui/enm-inspector/ReferencePanel.tsx`; 42 testy + API | tylko 1 z 4 OSD (`osd_energa/tauron/pge` 0 trafień) — korekta 10 #14; pakiety pozostałych OSD = dane z IRiESD (K-H) → OD-17 | wysoka |
| L3 | Kontekst przypadku analizy (bramka jakości, zakres stosowalności, odtwarzalność) | ISTNIEJE-ZWERYFIKOWANE | `api/analysis_case_context.py:116` + `api/v125_contracts.py` (`quality_gate` G0–G4, `applicability_scope`, `reproducibility`, `proof_pack_ref`); `WorkspaceSurfaceRouter.tsx:228,1169,1630,2617` (wiersze „Bramka jakości", „Wersja układu", „Wersja katalogu") | konsument w warstwie zastanej `ui/workspace`; przy migracji ekranów do ui2 wiersze kontekstu muszą przejść → W9 | wysoka |
| L4 | Magazyn dokumentów projektu | ISTNIEJE-ZWERYFIKOWANE | `DocumentRecordORM` (`models.py:518`), `document_store_repository.py`, `doc_type` 6 rodzajów (RAPORT, DOWOD, STUDIUM_OZE, ARCHIWUM, RAPORT_ZGODNOSCI, LISTA_MATERIALOWA); `GET /api/projects/{id}/documents`, `/documents/{id}/content`; `ui2/spaces/dokumentacja/api.ts:37-40`; 12 testów | — | wysoka |
| L5 | Dziennik i audyt zmian modelu | ISTNIEJE-ZWERYFIKOWANE | `enm/dziennik_zmian.py` (451), `enm/rewizje.py` (393), `audit_trail` w odpowiedzi domain-ops (`domain_operations.py:3329`); `ui2/freshness/*` | = 1 #13, 10 #10, 12 #7, A10 | wysoka |
| L6 | Rejestr założeń projektowych | BRAK | 0 trafień `rejestr założeń`/`AssumptionRegistry`; najbliżej `ConnectionConditions` (3 pola, `enm/models.py:126-137`, 1 #16) | = 10 #18, §5 poz. 4 → W10 | wysoka |
| L7 | Pakiet do podpisu | BRAK (spec bez kodu) | `docs/export/PAKIET_PROJEKTU_DO_PODPISU.md` (BINDING 1.0, 2026-02-17); 0 trafień w `backend/src` | = 10 #17, §5 poz. 25 → W10 | wysoka |
| L8 | Dokumenty OSD (wniosek, odpowiedź, studium, certyfikat) | ISTNIEJE-ZWERYFIKOWANE | 4 moduły `application/analyses/{wniosek_osd,odpowiedz_osd,dokument_studium,certyfikat_zgodnosci}.py` (638/445/775/477); trasy `api/oze_analysis_runs.py` (DOCX/PDF); `ui2/oze/{wniosek,osd,studium}`; 105 testów | — (potwierdza §6 poz. 4) | wysoka |
| L9 | Macierz wymaganie → analiza → dowód → raport | BRAK | 0 trafień `requirement_id`/`macierz wymag`; ogniwo analiza → dowód → raport istnieje (`proof_ref`/`case_ref` w 11 plikach, L3/L10); brak obiektu wymagania | K-G → W10 (wymaganie = pozycja DoD klasy projektu z odnośnikiem do biegu i dowodu; DoD z W9) | wysoka |
| L10 | Proweniencja rewizji w raportach | ISTNIEJE-ZWERYFIKOWANE | `enm/envelope.py:76-101` (`RevisionEnvelope` z `.spojna`); `api/analysis_run_exports.py:1559` („Wersja modelu … Hash wejścia …"); 19 testów | — | wysoka |

Wycinki: L1/L3 → **W9**; L6/L7/L9 → **W10**; L2 → OD-17 (dane OSD).

### 3a.M Wnioski przekrojowe rodzin A–L (KLASA, NIE INSTANCJA)

1. **„Dobór = filtr katalogowy, nie wymiarowanie" jest wzorcem systemowym**, nie punktowym: kable (F6, BRAK),
   transformatory (G10, filtr napięć „ZERO fizyki"), ograniczniki (H2, filtr ±30 %). Jedno miejsce naprawy:
   W10 dostaje „dobór z warunków sieci" jako jedną zdolność o trzech przedmiotach.
2. **Nowa klasa K-H „mechanizm pełny, dane śladowe":** certyfikaty PTPiREE (1 zmierzone dopasowanie na 176
   pozycji katalogu, J3), pakiety OSD (1 z 4 operatorów, L2), BIL per pozycja (H4), tolerancje katalogowe (D8),
   krzywe degradacji (I5). Kod jest zweryfikowany, wynik dla użytkownika pusty. To decyzja o źródłach danych,
   nie karta kodu → OD-17 (§7).
3. **Katalog istnieje, kontrakt go nie przyjmuje:** `der_dynamic` (IEC 61400-27) nie zasila FRT, bo
   `FrtHvrtSolverInput` jest FROZEN bez pola (J1); pola `sc_*` przekształtnika bez czytelnika (J2 = 5 #9).
   Instancje K-E po stronie kontraktu, rozstrzygane w OD-15(b) i W6.
4. **Cztery nowe stałe bez proweniencji (K-C):** widmo harmoniczne 5/7/11/13 (J9, poza B-01 → W2-C), udar 8,0
   i 63/k (G4), TOV 1,4/1,15 (H5), `mcov·2,8` (H2). Kod sam nazywa dziewięć długów karty V12.6
   (`solver_input_substitute_guard.py:828-832`), z których bramka widzi jeden.
5. **Predykaty parami:** „element wymaga katalogu" w dwóch miejscach (`wymaga_referencji_katalogowej` vs E009,
   J8/K8); ścieżka zasilania BFS ×2 (B1); tabela BIL ×2 (H3). Instancje K-A → W3/W7/W6.
6. **Wybór bez skutku (K-D):** tryb pracy BESS (I3), etykieta „zmiana stanu łącznika" (C8), „naprawa" = nawigacja
   (K4), krzywa Q(U) z nastaw zamiast z biegu (J5).
7. **Największy nowy fakt:** CGMES (K2) — 1843 linie, 46 testów, round-trip, zero tras i zero ekranów; nieobecny
   w §3. Dopisany jako 8 #13 i przypisany do W12 (nie do kasacji).
8. **Rozstrzygnięte bez zmian (nie są długiem):** SIWL poza zakresem napięć (H7), NC RfG bez odrębnych reguł
   dla magazynów (I8), IEC 62116 jako badanie typu producenta (J6), kontrola wymiarowa w dowodzie, nie w śladzie
   (E9), autonaprawa topologii nie jest celem (K4).

---
## 4. Klasy defektów przekrojowych (KLASA, NIE INSTANCJA)

| Klasa | Instancje (inwentarz zmierzony) | Wycinek |
|---|---|---|
| **K-A Druga prawda sieci** | legacy ORM `network_*` 6 tabel + 3 pisarze/czytelnicy; import XLSX tylko do legacy; ZIP podwójny zapis; `catalog_governance` czyta legacy; `NetworkWizardService`; SLD ORM + `api/sld.py`; stan łączeniowy ×2; uziemienie ×6; tabele katalogu w bazie pisane przez governance, nieczytane przez operacje domenowe (1 #24); N-1 na innej fikturze niż G03; semantyka SLD w kliencie bez ścieżki backendowej; + aneks 3a: predykat „element wymaga katalogu" ×2 (J8/K8), BFS ścieżki zasilania ×2 (B1), tabela BIL ×2 (H3) | W1 (ORM, XLSX, ZIP, governance, wizard, SLD ORM), W5 (uziemienie, stan łączeniowy), W7 (SLD), W8 (G03) |
| **K-B Fizyka poza solverami / duplikaty fizyki** | IDMT ×5; metodyka nastaw ×3; ALF ×2; hosting ×2; ranking N-1 ×2; straty/OLTC ×2; `_branch_current_a`; `source_compliance` vs NC RfG; stabilność fasadowa vs `stability_rms`; Pst w `application/`; guard `backend_no_physics_guard.py` bez rodzin IDMT/prądu gałęzi | W3 (adaptery, kasacje, rodziny guarda), W6 (RMS, Pst), OD-15(d) (v126) |
| **K-C Wartości bez proweniencji / fasady** | stabilność 10°/75°/28°/0,97/0,99 + τ=0,3; `_earth_fault_detection` 5,0/1,0/3,0; FRT 0,1/0,02/2,0; asymetria ≠ VUF; `spz=None`, `arc_protection_enabled: False`; `design_synth` placeholder; `oltc_tap_position: 0`; `frequency_hz` i katalogi ACME (M0-4, częściowo domknięte); + aneks 3a: widmo harmoniczne 5/7/11/13 (J9, poza B-01), udar 8,0 i 63/k (G4), TOV 1,4/1,15 (H5), `mcov·2,8` (H2), martwy hint „Etap 6 roadmapy" (C8) — NAPRAWIONE 2026-09-09: widmo 5/7/11/13 + droop + tryb GFM + Sn (W2-C `daf303a3`), martwy hint i cała tabela hintów (W2-B `0095dca6`), stabilność bez scenariusza (W2 pkt 1 `347ee904`) | W2 (prezentacja/aplikacja), OD-15 (rdzenie), W4 (SPZ) |
| **K-D Martwe kliknięcia / UI bez zdolności** | macierz DER „Uruchom obliczenia"; `EditProtectionModal` z dyspozytora SLD; selektor GS/FD w osieroconym `CaseConfigPage.tsx`; `EarthingSystemSelector.tsx`; TT/IT wybieralne bez fizyki; + aneks 3a: tryb pracy BESS bez skutku liczbowego (I3), „naprawa" = nawigacja (K4), krzywa Q(U) z nastaw zamiast z biegu (J5), `AutomationPanel`/`FdirPhase` bez konsumenta (C7) | W2, W5 |
| **K-E Backend bez toku pracy** | `nn_device_selection`; NC RfG przekrojowa; `qu_regulation`; `/api/fault-loop/compute`; `ground_fault_bridge`; `sld_overrides`; `archive_diff`/`incremental_archive`/`cloud_backup`; `validate_selectivity`; `power_flow_unbalanced`; `stability_rms`; GS/FD; pola `sc_*` DER; grid-forming; + aneks 3a: CGMES 1843 linie/46 testów/0 tras (K2), profil napięcia (B6), `validate-all` audytu 2 (B7), `load_profile_ref` (I4), `der_dynamic` w torze FRT (J1), NR/GS/FD bez selektora (D2) | W1, W3, W5, W6, W7, W8, W10 |
| **K-F Martwy kod** | `NetworkWizardService` (2228); `application/designer/` (206); `design_synth/` (557 + 3 repozytoria + klucz rejestru); legacy raporty (8/3574/39); `protection_report_model.py`; `protection_coordination_v1.py`; `v_ports_001.py`; `EarthingSystemSelector.tsx`; `application/sld/**` + `sld_projection.py` + SLD ORM; `/api/fault-loop/compute`; `application/reference_networks/**` (K2, po przeniesieniu jądra); + aneks 3a: `CaseConfigPage.tsx` (D2), `AutomationPanel`/`automationTypes.ts` (C7), `ui/voltage-profile/*` jeśli nie wpięte w W6 (B6), `ui/project-archive` (skasowane w W1) | W1 (przegląd kasacyjny z guardem wskrzeszenia), W3, W5 |
| **K-G Brakujące ogniwa łańcucha** | dobór przekroju; BOM projektu; pakiet do podpisu; rejestr założeń; koszty; `NetworkVariation`; restoration/NOP; model fazowy; TT/IT/RCD; 67/67N/21/87/25/50BF/grupy/TRIP; cykl życia; iniekcja wtórna; COMTRADE; CAD round-trip; GIS; MCP; role; DoD; QSTS; BESS SOC; EN 50160; + aneks 3a: selektywność SN↔nN (B5), zamykanie łącznika (C2), koperta wyroczni (D1), temperatura w kontroli wymiarowej (E1), obciążalność cieplna TR (G5), 3-uzwojeniowe (G11), odległość ochronna (H6), pakiet dowodowy izolacji (H9), QSTS BESS (I4), macierz wymagań (L9) | W4–W12 |
| **K-H Mechanizm pełny, dane śladowe** (aneks 3a) | certyfikaty PTPiREE: 1 zmierzone dopasowanie na 176 pozycji katalogu (J3); pakiety OSD: 1 z 4 operatorów (L2); BIL/LIWL per pozycja katalogowa (H4); tolerancje katalogowe (D8); krzywe degradacji baterii (I5) — kod zweryfikowany, wynik dla użytkownika pusty | OD-17 (źródła danych), nie karta kodu |

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

Aneks 3a (2026-09-09): 29. Selektywność przekaźnik SN ↔ aparat nN liczona ręcznie (B5). 30. Zamknięcie
łącznika / pełna zmiana stanu łączeniowego w modelu (C2, C8). 31. Profil napięcia wzdłuż ścieżki gotowy w
backendzie, nieosiągalny z UI (B6). 32. Pasmo MIN/MAX zwarć z jednego przypadku i metoda rozpływu jako opcja
biegu (D7, D2). 33. Propagacja niepewności danych wejściowych poza modułem akademickim (D8). 34. Obciążalność
cieplna i wymiarowanie transformatora z obciążenia (G5, G10). 35. Dobór ogranicznika z warunków sieci i
odległość ochronna (H2, H6). 36. Wymiana CIM/CGMES bez trasy (K2). 37. Macierz wymaganie → analiza → dowód
→ raport (L9).

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
| 13 | Mapa 12 #2 (a701152f): „350 tras / 63 moduły" | Pomiar 2026-09-09 po kasacjach W1: 310 ścieżek / 329 operacji / 227 schematów (`openapi_snapshot.json`), 61 modułów `api/*.py` | 12 #2 i §2 w. 12 poprawione; aneks 3a.K K10 |
| 14 | Mapa 12 #10: `CelProjektu.tsx` „17 testów" | Zmierzono: 8 `it(` w `celProjektu.test.tsx` + 11 w `otworzProjekt.test.tsx` | 12 #10 poprawiony; aneks 3a.L L1 |
| 15 | Mapa 10 #14: „pakiety `osd_{enea,energa,tauron,pge}`" | **Fałsz dla 3 z 4:** w repo istnieje wyłącznie `reference_engine/packs/osd_enea` (`osd_energa`/`osd_tauron`/`osd_pge` — 0 trafień) | 10 #14 → CZĘŚCIOWE; aneks 3a.L L2; dane OSD → OD-17 |
| 16 | Mapa 8 #11/#12 (CAD/GIS) milczą o CIM/CGMES | `infrastructure/cgmes/` + `application/cgmes/service.py` (1843 linie, 46 testów) istnieją bez trasy i ekranu — pominięte w badaniu bazowym | nowy wiersz 8 #13 (BEZ-KONSUMENTA → W12); aneks 3a.K K2 |
| 17 | `docs/architecture/PRODUCT_CAPABILITY_CONSTITUTION.md:42`: „stan BESS: WSPIERA TERAZ" | **Fałsz.** `bess_mode`/`soc_min_percent`/`soc_max_percent` są zapisywane i walidowane składniowo, ale nie ma ich czytelnika w żadnym solverze ani analizie (aneks 3a.I I1) | kanon poprawiony w tym commicie; 1 #7 doprecyzowany |
| 18 | Mapa 1 #7: „`BaySourceEndpoint.operating_mode` opisowy" | Doprecyzowanie: pola trybu i granic SOC są strukturalne (`domain_ops_models.py:1286-1288`, readiness `bess.soc_limits_invalid`), pojemność nameplate jest w katalogu (`capacity_kwh`); brak dotyczy stanu dynamicznego, nie tabliczki | 1 #7 uzupełniony |
| 19 | `network_model/solvers/fault_loop_builder.py:1-24`: „STATUS: SCAFFOLDING (MVP)" | Nieaktualne: moduł ma 4 żywych konsumentów (`fault_loop/service.py`, `api/fault_loop.py`, `nn_device_selection.py`, `swz/service.py`) — aneks 3a.B B4 | plik pod B-01: korekta komentarza dopisana do OD-15 (e) |

---

## 7. Decyzje wymagające właściciela (nowe: OD-13…OD-17; stan OD-2/OD-3)

| ID | Pytanie | Dlaczego nie da się rozstrzygnąć samodzielnie |
|---|---|---|
| OD-13 | **MCP i uprawnienia vs decyzja 2026-08-05 „narzędzie jednostanowiskowe, auth/perymetr poza zakresem".** Misja §15 (2026-09-09, nadrzędna) wymaga MCP z „permissions". Propozycja architekta: MCP jako lokalna płaszczyzna sterowania (te same operacje domenowe, ten sam dziennik/rewizje/CAS) BEZ uwierzytelniania sieciowego, z uprawnieniami jako zakresem narzędzi agenta (read / propose / apply), nie jako tożsamością użytkownika | konflikt dwóch decyzji właściciela — rozstrzyga właściciel |
| OD-14 | **Impedancja zwarcia Zf w rdzeniu FROZEN IEC 60909 (B-01).** Parametr addytywny `z_f` w `short_circuit_core.compute_equivalent_impedance` i czterech metodach `compute_*_short_circuit`; parytet bit w bit dla `z_f = 0` (golden 336/168); model i UI już istnieją (3 #15) | edycja `network_model/solvers/**` |
| OD-15 | **Pakiet B-01 „zero fabrykacji w rdzeniach"** (jedna zgoda, parytet per pozycja): (a) `v126_academic.py::_earth_fault_detection` — nastawy jako wejście jawne albo pominięte z powodem; (b) `frt_hvrt/engine.py` — `tp/tiq/K` z katalogu `der_dynamic` (resolver istnieje) z proweniencją w śladzie, brak = odmowa nazwana; (c) `phase_state_sn.py` — VUF wg składowych symetrycznych jako pole addytywne obok dzisiejszego wskaźnika; (d) kasacja rodzajów V12.6 zduplikowanych z torem kanonicznym (`reliability_contingency` ranking, `hosting_capacity` MC, `opf_loss_lcc`) po ich wycofaniu z prezentacji w W3; (e) W-6 `RI` → `LONG_TIME_INVERSE` w `protection_iec60255.py` bez zmiany liczb | każda pozycja = edycja `network_model/solvers/**` |
| OD-16 | **Dane kosztowe (CAPEX/OPEX) katalogu:** źródło (cenniki producentów, wskaźniki OSD, własne), format (pole katalogu per typ, waluta, data), zasada aktualizacji — bez tego W10 (model kosztowy, porównanie wariantów, wielokryterialna) nie ma danych | dane spoza repo |
| OD-17 | **Źródła danych zewnętrznych dla klasy K-H „mechanizm pełny, dane śladowe" (aneks 3a):** (a) katalog przekształtników zasilany realnymi modelami z wykazu PTPiREE (dziś 1 zmierzone dopasowanie na 176 pozycji o nazwach ilustracyjnych — J3); (b) pakiety Reference Engine dla pozostałych OSD (Energa, Tauron, PGE) z IRiESD (dziś tylko ENEA — L2); (c) karty producentów z BIL/LIWL per pozycja (H4), tolerancjami parametrów (D8) i krzywymi degradacji baterii (I5). Kod i UI są gotowe; bez danych wynik dla użytkownika jest pusty | dane spoza repo (licencje wykazów, praca redakcyjna na IRiESD, karty producentów) |
| OD-2 (stan) | Projekty w legacy ORM przed kasacją | **Rozstrzygnięte technicznie w W1:** migracja jednorazowa legacy → ENM przez ten sam kompilator co import XLSX, wykonana przed kasacją tabel; żaden projekt nie ginie — decyzja właściciela niepotrzebna |
| OD-3 (stan) | Publikowane wyrocznie dla G01 (sieć kompensowana) | **Nadal otwarte** — blokuje część wyroczni W8; propozycja: IEC 60909-3 (przykłady liczbowe) + analityczne wzory zamknięte już przypięte w rejestrze (`_ANALITYCZNA_G01`) jako wyrocznia pierwsza, literaturowa druga |

Uzupełnienie OD-15 (aneks 3a, 2026-09-09): (e) korekta nieaktualnego nagłówka „STATUS: SCAFFOLDING (MVP)" w
`network_model/solvers/fault_loop_builder.py:1-24` (moduł ma 4 żywych konsumentów) — zmiana wyłącznie
komentarza, ale plik leży pod B-01; (f) do pozycji (d) dochodzą stałe V12.6: udar 8,0 i 63/k (G4), TOV
1,4/1,15 (H5), `mcov·2,8` przy braku karty ogranicznika (H2). Widmo harmoniczne 5/7/11/13 (J9) leży w
`solver_input/v126_contracts.py:490` — poza B-01, więc NIE wymaga zgody: W2-C.

---

## 8. Kolejność wycinków W1–W12 (decyzja architekta; misja §29: zależność → ryzyko → wartość, pionowo)

| W | Wycinek | Zakres (klasy defektów) | Domeny | Zależy od | Dlaczego w tym miejscu | Mapowanie na W-8 / CV |
|---|---|---|---|---|---|---|
| **W1** | **Jedna prawda sieci od pierwszego bajtu** | K-A (ORM, XLSX, ZIP, governance, wizard, SLD ORM), K-F (przegląd kasacyjny), e2e klasy A przez import | 1, 2, 8, 10 | — (aktywna granica CV-4) | jedyna wada, przez którą dane użytkownika znikają; domyka aktywną granicę CV-4 bez jej przerywania (§29) | CV-4.4 + K2 (jądro przeniesione) — roadmapa §4 w. 5–6 |
| **W2** | **Zero fabrykacji — uczciwość ekranów** (agent, równolegle) | K-C/K-D poza rdzeniami: stabilność (odmowa bez scenariusza, formularz, etykieta), macierz DER, dyspozytor SLD bez martwej edycji, etykieta asymetrii, prezentacja nastaw doziemnych; + aneks 3a: W2-B martwy hint `set-switch-state` (C8), W2-C widmo harmoniczne z karty albo nazwana odmowa (J9), prezentacja V12.6 bez wartości domyślnych (H5) | 3, 4, 5, 6 | — (frontend + `application`/`enm`, bez granic CV) | fabrykacja widoczna dla inżyniera dziś; tanie, mechaniczne, bez B-01 | poza CV (misja §4) |
| **W3** | **Konwergencja duplikatów fizyki** | K-B: IDMT ×5 → adapter na solver kanoniczny (tor `protection_sn` przez `protection/curves`), metodyka ×3 → jedna, `source_compliance` → NC RfG, wycofanie z prezentacji duplikatów V12.6, kasacja legacy raportów i `line_overcurrent_setting`, rodziny IDMT/prądu gałęzi w guardzie; + aneks 3a: metoda rozpływu jako opcja biegu + porównanie NR↔FD (D2), pasma rozpływu (D4), ekran pasma MIN/MAX (D7), opcja niepewności w kanonicznym hostingu (D8), skalowanie jednostek w jednym miejscu + rodzina guarda (E5), straty TR ×2 (G3), zgodność przekrojowa NC RfG w UI (J4), wykres Q z biegu (J5), jeden predykat „element wymaga katalogu" (J8/K8) | 3, 4, 5, 9, 10 | W1 (kasacje bez kolizji) | usuwa rozjazd, który guard dziś nie widzi; niski sprzęg z modelem | D-3 (część) — roadmapa §4 w. 10; **karta: `KARTA_W3_KONWERGENCJA_FIZYKI_2026-09.md`** (rozstrzygnięcia §0, podkarty A–I, fale 1–3; 2026-09-09) |
| **W4** | **Zabezpieczenia jako część modelu** | `update_relay_settings` realny, SPZ z pisarzem, zapis nastaw z koordynacji do `BayProtectionControlUnit`, edycja z SLD przez `ui2/kreatory/przekaznik`, potem 67/67N (RCA, polaryzacja, admitancyjne), 21, 87T, 25, 50BF, grupy nastaw, TRIP matrix, `ProtectionCapabilityRegistry` (ADR-022); + aneks 3a: selektywność SN↔nN (B5), 87T (G13), koordynacja LoM z SPZ (J6) | 4 | W5 (typowany `Bay`) | nastawy poza modelem = druga prawda; funkcje kierunkowe warunkują G01 | D-3 — roadmapa §4 w. 10 |
| **W5** | **Model fazowy i uziemienie** (= CV-5) | `PhaseSet` na terminalu, `Load` fazowy, `EarthingSystem`/`NeutralGrounding` jedna reprezentacja (6 → 1), `meta.field_specs` → typowany `Bay`, rozpływ niesymetryczny dla projektu, TT/IT/RCD, kasacja `EarthingSystemSelector`/`fault-loop/compute`, stan łączeniowy jedna prawda; + aneks 3a: pełna zmiana stanu łącznika i stany łączników w scenariuszu (C2/C4/C8), uziemienie ekranu kabla (F9), walidacja `vector_group` F-4 (G6) | 1, 7 | W1 | fundament pod G01, nN i W4 | CV-5 — roadmapa §4 w. 8 |
| **W6** | **Dynamika, czas i jakość energii** | `stability_rms` end-to-end (scenariusz z modelu, katalog `der_dynamic`, grid-forming), QSTS (profile roczne, straty roczne), BESS SOC/energia/sprawność/harmonogram, VUF, EN 50160 raport zintegrowany, harmoniczne pod „Jakość", Pst do solverów; + aneks 3a: koordynacja izolacji pod kanoniczny solver + pakiet dowodowy (H3/H9), udar i obciążalność cieplna TR wg IEC 60076-7 (G4/G5), BESS: ładowanie jako odbiór, dyspozycja trybów, SOC w scenariuszu, `load_profile_ref` konsument albo kasacja (I1/I3/I4/I5/I7/I9), `der_dynamic` → FRT po OD-15(b) (J1), profil napięcia w ekranie „Jakość" (B6) | 5, 6, 1 | W3, OD-15 | zastępuje fasadę prawdziwą fizyką; domyka BESS jako magazyn | poza CV (misja §8–§9) |
| **W7** | **SLD jako projekcja ENM** (D-1 + „pełne SLD") | projekcja semantyczna backend ENM → `SldSemanticGraphV1` z pinem reguły 6, klient jako renderer, trwałe nadpisania geometrii w ENM (`branch_ref` + `waypoints[]`), kasacja `application/sld/**` + `sld_projection.py`, rewizje rysunku; + aneks 3a: SLD czyta `TopologyView` backendu, kasacja BFS klienta, e2e ścieżki zasilania na realnym modelu (B1/B2) | 8 | W5 (terminale) | „rysunek nigdy jako druga prawda"; W-2: nie przed CV-4.4 | D-1 + w. 11 |
| **W8** | **Sieć kompensowana G01 end-to-end** (= CV-6) | budowa G01 komendami, Y0 z uziemieniem z modelu, Ic/Petersen z modelu stacji, most SC_1F → U_dot/U_krok z geometrii uziomu, 51N/67N/admitancyjne, wyrocznie (OD-3), e2e klasy E jako bramka CI; + aneks 3a: koperta biegu z odniesieniem do wyroczni klasy sieci (D1) | 3, 4, 7 | W4, W5 | klasa akceptacyjna E nazwana „pierwszym wycinkiem" od miesięcy, NOT_BUILT | CV-6 — roadmapa §4 w. 9 |
| **W9** | **Tok pracy inżyniera** | cel projektu trwały z DoD per klasa (A–F), NBA dla E6–E8 z realnych danych (dokumentacja, uzgodnienia), role jako projekcje (filtr widoku), rollback do rewizji jako operacja domenowa z dziennikiem, CAS włączony w kliencie; + aneks 3a: NBA E2/E6–E8 (A1), klasa projektu + DoD (A2/L1), kontrolka cofnij/ponów (A6), role jako projekcje (A8), audyt axe w CI (A9), ekran dziennika/rewizji (A10/C10), agregacja obciążeń w E5 (B7), terminologia „napraw" → „przejdź do" (K4), wiersze kontekstu przypadku w ui2 (L3) | 12, 2 | W1 | zamyka §17–§23 misji | poza CV |
| **W10** | **Wyniki projektowania jako dokumenty** | dobór przekroju kabla/linii (IEC 60364-5-52 / IEC 60287 / obciążalność SN z katalogu), BOM całego projektu, pakiet do podpisu (spec BINDING), rejestr założeń, `NetworkVariation` (as-is → wariant → porównanie, klasa F), model kosztowy (OD-16), restoration/NOP; + aneks 3a: temperatura w kontroli wymiarowej (E1), formater i metadane jednostek (E7/E8), BOM kabli i napięcia indukowane (F13/F9), warunki pracy równoległej i wymiarowanie TR z obciążenia (G8/G10), dobór ogranicznika z k_e i odległość ochronna (H2/H6), rejestr założeń, pakiet do podpisu, macierz wymagań (L6/L7/L9), plan łączeniowy i odtwarzanie (C6/C7) | 2, 9, 10, 1 | W1, W9, OD-16 | usuwa większość „wyjść do Excela" | poza CV |
| **W11** | **Commissioning / as-built** | stany cyklu życia, trwałość odbioru + dokument, iniekcja wtórna (czas zadziałania vs nastawa), FAT/SAT, kalibracja, as-built → linia bazowa, COMTRADE (jeśli uzasadnione); + aneks 3a: klasy dokładności CT/VT jako σ estymacji (D9), mufy/głowice (F8), trwałość odbioru powykonawczego (J7) | 11 | W4, W9 | domena bez implementacji | poza CV |
| **W12** | **CAD round-trip, GIS, MCP** | import DXF z tożsamością bloków, konflikty, rewizje; GIS (WGS84/EPSG, trasy); MCP nad operacjami domenowymi (OD-13); + aneks 3a: CGMES trasa + ekran (K2), healing po imporcie: duplikaty, gałąź donikąd, scalanie szyn (K5/K6), indeks tożsamości zewnętrznej (K7), trasy GIS (F10) | 8, 12 | W7, W9, OD-13 | integracje zewnętrzne na końcu łańcucha | poza CV |

Roadmapa §4 w. 7 (ponowna ocena D-1) rozstrzygnięta: D-1 = W7 po W5. Roadmapa §4 w. 5 A5 (`power-flow-runs/*`)
nadal po OD-8. DT-12 (wykonanie biegów) bez zmian.
Aneks 3a: D10 (parytet assemblera między maszynami — macierz CI) → program 10x, nie wycinek produktu;
G11 (transformatory trójuzwojeniowe) → poza kolejką W1–W12 do decyzji zakresu (kanon: „przyszłość").

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

### §4 Meldunek wykonania W1 (W1 (2026-09-09)) — UCZCIWOŚĆ

Wykonane (dowód: commit W1 na `fable-cv3`, `../evidence/CONVERGENCE_EVIDENCE.md` §E/§F/§G):
§0.1–0.3 (kompilator `enm/kompilator_grafu.py` z jądra `_kernel.py`, katalog projektu `enm/katalog_projektu.py`, import XLSX → ENM z `enm_hash`, zero wartości domyślnych);
§0.4 migracja przy starcie (`migracja_legacy_db.py`) — dla **19 tabel** (inwentarz §1 mówił o 6: tabele typów katalogu, SLD i `design_*` dzieliły ten sam mechanizm, więc weszły w tę samą kasację); pomiar przed kasacją: 0 wierszy w każdej z 19 tabel bazy deweloperskiej;
§1 wszystkie wiersze poza dwoma: (a) `application/reference_networks/**` (K2) — jądro przeniesione, kasacja biblioteki/builderów = karta K2 CV-4.3 (po przeniesieniu builderów ENM benchmarków do `tests/golden/`), (b) diff rewizji ENM — wybrano KASACJĘ (końcówka `GET /cases/{id}/enm/diff` + `diagnostics/diff.py` + `fetchEnmDiff`/`EnmDiffView`/zakładka „Rewizje”), bo żaden tok pracy nie wołał diffu (widok montowany z `report={null}`), a porównanie rewizji ENM ma własną żywą ścieżkę (`enm/rewizje.py`, `useRewizjeSwiezosci`); nowy diff bez konsumenta byłby fantomem.
Korekty roszczeń: legacy raporty — 8 plików z mapy potwierdzone martwe (0 importerów w `src`, tylko własne testy) i skasowane; ta sama klasa objęła 4 kolejne eksportery bez konsumenta (`export_jsonl`, `export_manifest` w `reporting/` — żywy jest `domain/export_manifest.py`, `power_flow_export`, `short_circuit_export`) + 4 pliki testów (`test_export_reports`, `test_power_flow_export`, `test_short_circuit_export`, `e2e/test_pf_exports_deterministic`), `reporting/__init__.py` bez martwych eksportów; `design_synth` — narzędzia kanonicznego JSON były żywe (23 importerów w `src`) i zostały przeniesione do `application/analyses/kanon_json.py`. Poza planem, ta sama klasa (końcówka bez konsumenta → martwy klient): `GET /analysis-runs/{id}/overlay` + klasa nakładki `ui/results-inspector` (`fetchSldOverlay`/`loadSldOverlay`/`SldOverlay`/`hydrateResultsView`, użycie wyłącznie w testach) skasowane.
DoD §2: 1–9 i 12–13 spełnione; 10 (CI 9/9) i 11 (zrzuty B-02 do oceny właściciela) — po pushu; 5 wyrocznia: hash ENM importu == hash sieci zbudowanej wprost (`tests/test_xlsx_import.py`), PF/SC na zaimportowanej sieci vs pandapower (`tests/golden/wyrocznie/test_pandapower_import_arkusza.py`).

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

### §1 Meldunek wykonania W2 (2026-09-09) — UCZCIWOŚĆ

Wykonane: pkt 1–5 karty jako 5 commitów agenta (`347ee904`, `9af981fa`, `eae0317c`, `b0b55faf`, `cb185748`
na gałęzi; cherry-pick z trailerem sesji), plus dwie karty klasowe z aneksu §3a: **W2-B** (`0095dca6`,
`3d37f2e3`: kasacja `ACTION_ROADMAP_HINT_PL` — 24 klucze zinwentaryzowane: 19 martwych hintów, 5
przekierowań = nawigacja; etykieta `show-sc-data`) i **W2-C** (`daf303a3`: wejście V12.6 bez literałów —
widmo/droop/tryb/Sn z karty katalogowej albo nazwana odmowa; 2 nowe kody gotowości). Odbiór architekta:
`9bebcb9d` (słownik kodów gotowości 118, trzy `routeState` bez `route` naprawione, dług typów poza bramką
127 → 126) oraz naprawa CI `ba1b7dc8` (zapadki po scaleniu W2: 6 budżetów zastępników `run.*`, słownik 116,
mock stabilności) — zapis w evidence §A/§G (łańcuch przedpushowy pominął `guardy_z_ci` na drzewie
połączonym; reguła naprawiona).

Poza kartą, nazwane: (a) zdanie „Pełna integracja z układem pracy sieci (E-05) — Etap 6 roadmapy" w formularzu
NOP `InfrastructureSurfaces.tsx` — usunięte przy odbiorze (`grep "Etap [0-9] roadmapy" frontend/src` poza
testami = 0); (b) 0 pozycji katalogu przekształtników z widmem producenta — dane (OD-17), nie kod;
(c) `mcov·2,8` i stałe udaru/TOV leżą w `network_model/solvers/v126_academic.py` (B-01) — OD-15(d)(f).

Weryfikacja odbioru (drzewo `9bebcb9d` + korekta NOP, 2026-09-09 18:28–19:24 UTC): pytest 12 850 passed /
1 skipped / 1 xfailed; mypy 736; pandapower 41; `guardy_z_ci` 89/89 + lint 4/4 + 640 self-testów po ponownym
przypięciu pól kontraktów (3530 → 3539, W2-C); vitest 895 plików / 12 153 passed (14 todo); e2e realny backend
3/3. Wiersze §3 zaktualizowane: 3a.C C8, 3a.J J9, §4 K-C.

---

## 11. Utrzymanie mapy

Każdy wycinek po odbiorze aktualizuje: wiersze tabel §3, których dotyczy (klasyfikacja + nowy dowód),
klasy §4, listę §5, kolejność §8 (stan) i wpis w `../evidence/CONVERGENCE_EVIDENCE.md`. Nowa zdolność bez
wiersza w §3 = brak w produkcie (misja §28: CLAIMED ≠ ACCEPTED). Liczby w tym dokumencie są datowane
2026-09-09; przy każdej aktualizacji mierzone na nowo, nie przepisywane. Aneks §3a (rodziny A–L) podlega tym samym zasadom: wiersz rodziny aktualizuje się razem z wierszem §3, do którego odsyła.
