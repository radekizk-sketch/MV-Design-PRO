# MV-DESIGN-PRO — PLAN MIGRACJI DO DIGITAL TWIN (FAZA F; mandat §161–§166)

**Status:** PROPOZYCJA (do przeglądu właściciela; **nic z tego planu nie zostało rozpoczęte** — §180 STOP)
**Data:** 2026-09-02 · **Gałąź:** `claude/mv-design-pro-twin-audit-u4lhy0` · **HEAD audytu:** `a1ab2959`
**Wejścia:** synteza audytu `MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md` (TOP 30, rejestry), architektura docelowa (FAZA B), workflow (FAZA C), symulacja i optymalizacja (FAZA D), prezentacja (FAZA E), zabezpieczenia, wydajność, wersjonowanie.
**Zasady mandatu:** §161 (strangler: stara ścieżka / nowa ścieżka / most / testy / cutover / usunięcie), §163–§165 (trzy pionowe wycinki), §166 (bramki jakości ≥ 9/10 per obszar), §167 (testy nie mogą maskować defektów). Zasady właściciela: bez warstw kompatybilności i migracji „na zawsze" — most żyje tylko do cutoveru, potem kasacja; werdykt wizualny SLD (B-02) i edycja zamrożonego rdzenia (B-01) należą do właściciela.

---

## 0. Zasady planu

1. **Nie big-bang.** Każdy wycinek dostarcza działającą ścieżkę użytkownika end-to-end (UI + backend + testy), z mostem do starej ścieżki tylko na czas przełączenia; wycinek kończy się **kasacją** starej ścieżki (inaczej powstaje trzecia prawda).
2. **Najpierw pomiar, potem przebudowa (M0).** CI zielone i wymagane (required checks), hash kanoniczny niezależny od platformy, zapadki spłacone, rejestr sieci wzorcowych i moduł inwariantów, snapshot OpenAPI, benchmark — bez tego żaden „zielony" nie jest dowodem (A10-01/02/09/10).
3. **Rdzenie FROZEN nietknięte** (IEC 60909, NR) poza jawnymi ADR z bramką B-01 (Ith z n≠1, slack rozproszony, algebra rzadka — `MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` §11).
4. **Reguła KLASA, NIE INSTANCJA** obowiązuje w każdym wycinku: inwentarz miejsc przed naprawą, test jako iloczyn cech, predykaty parami, obietnica bez testu = defekt.
5. **Zero fabrykacji w trakcie migracji:** wycinek nie może wprowadzić `no_module`, stubów ani domyślnych wartości zamiast danych; brak danych = jawny brak z kodem gotowości.
6. **Jeden kanon dokumentów:** w trakcie migracji nie powstają nowe dokumenty „BINDING" poza `docs/twin/` i ADR; karty/meldunki poza `docs/` (A10-14).
7. **Każdy wycinek ma właściciela merytorycznego, bramkę jakości (§5) i kryterium cutover z pomiarem**; scalanie przez Fable po niezależnej weryfikacji (dyrektywa 9).

---

## 1. Fazy i kryteria wyjścia

| Faza | Cel | Kryterium wyjścia (mierzalne) |
|---|---|---|
| **M0 Stabilizacja i pomiar** | wiarygodne CI, hash, rejestry, benchmark, kasacja fabrykacji widocznych dla użytkownika | 8/8 workflowów zielone na `main` + required checks; 18/18 scenariuszy nN identyczny hash CI vs lokalnie; 0 przekroczonych zapadek; rejestr sieci G01–G17 w kodzie; `tests/invariants/` po rejestrze; snapshot OpenAPI; benchmark S/M/L z budżetami; fantom nastaw i nazwy „ACME/REX" usunięte; `no_module` → `NIE_DO_USTALENIA` |
| **M1 Fundament persystencji i biegów** | jeden magazyn modelu z rewizjami, jeden rejestr biegów, zero magazynów in-memory, Postgres/Alembic | `GET /model/revisions`, checkout rewizji odtwarza hash; 1 tabela biegów; restart procesu nie gubi scenariuszy/serii/overrides/konfiguracji; import XLSX widoczny dla obliczeń |
| **M2 Rdzeń twin (model)** | terminale/ConnectivityNode, `TopologyService`, `EffectiveState`, scenariusze-delty, graf zależności, rewizja katalogu, model fazowy nN, typowane wyposażenie pól, `GridConnectionPoint`, dekompozycja DER | 20 implementacji topologii → 1; 6 modeli scenariusza → 1; inwalidacja selektywna wg macierzy; `meta.field_specs` = 0 czytelników; 0 wartości `??`-domyślnych stanu |
| **M3 Symulacja** | `CanonicalNetworkSnapshot` + assembler + orkiestrator + jądro rzadkie + solver nN 4-przewodowy; fizyka wyłącznie w solverach; ślad v2 | 10 builderów PF/7 ścieżek SC → 1 assembler; `backend_no_physics_guard` zielony z pustą allowlistą; budżety S/M spełnione; N-1 M < 10 s |
| **M4 Decyzje inżynierskie** | zabezpieczenia (IED/grupy/trip matrix, jedna fizyka, TCC z modelu, trace), `ConstraintEngine`, moduły doboru, `WorkflowEngine`/NBA/Command Center, rejestr dokumentów ze świeżością | test §181 przechodzi 14/14 na sieci rejestru; 8/8 klas doboru z kandydatami; 100 % FAIL z remedium; 14 typów dokumentów §124 z gotowością i OUTDATED |
| **M5 Prezentacja** | scena semantyczna z backendu (SN i nN), jedna geometria per LOD, pakiet symboli R3 (B-02), polityki CAD/SCADA/ENGINEERING, arkusz, DXF z backendu, kasacja martwego SLD | projekcja SN w kliencie = 0 LOC; jeden rejestr symboli; werdykt właściciela B-02 ≥ 9/10; −54 tys. LOC SLD |
| **M6 Powłoka i workflow UI** | jedna nawigacja, jeden inspektor, akcje obiektowe, wejście nN, profile ról, usunięcie martwego kodu i pliku danych | −80 tys. LOC + −134 tys. LOC danych; `dead_click_guard` obejmuje ui2 i paletę; 0 ślepych zaułków |
| **M7 Dokumentacja i higiena** | 755 → ~100 dokumentów żywych, STAN_REPO/drzewa generowane z pomiarów, jeden AGENTS.md, ADR renumeracja | guard „dokument żywy cytuje istniejące ścieżki" zielony; `CLAUDE.md` bez liczb |

Fazy M2–M4 są współbieżne w wycinkach pionowych (§3), nie sekwencyjne „warstwa po warstwie" — każdy wycinek przecina wszystkie warstwy.

---

## 2. Wycinki migracji (§161): stara ścieżka → nowa → most → testy → cutover → usunięcie

| ID | Wycinek | Stara ścieżka (dowód) | Nowa ścieżka | Most (tymczasowy) | Testy (bramka) | Cutover (kryterium) | Usunięcie |
|---|---|---|---|---|---|---|---|
| M0-1 | CI zielone i wymagane | 5/8 workflowów czerwone (A10-01) | naprawa 5 przyczyn; `poetry run` dla guardów; globy zamiast list plików; required checks | — | `guardy_z_ci.py` = CI; guard „yml nie wskazuje nieistniejących plików" | 8/8 zielone 3 dni z rzędu | `run_all_guards.sh` (67/67) |
| M0-2 | Hash kanoniczny cross-platform | 7/18 scenariuszy nN inny hash w CI (A10-02) | kanoniczna serializacja (sort_keys, precyzja zadeklarowana, bez `repr` float) | — | golden hash liczony w CI; test dwóch środowisk | 18/18 identyczne | fixtury JSON generowane w CI, nie z laptopa |
| M0-3 | Zapadki spłacone | tsconfig 658/531, `solver_input_substitute` +11, toast 15, parytet 1 (A10-17) | naprawa u źródła (11 podstawień liczb = fabrykacje) | — | guardy zielone | 0 przekroczeń | — |
| M0-4 | Fabrykacje widoczne dla użytkownika | fantom nastaw (`SldDetailDrawer.tsx:1833`), „ABB REX-100…" (`ACME_REX*`), `no_module` ×6, `frequency_hz=50.0`, „Wkrótce" (A4-03/13/16/17, EF-002) | stan zerowy z `protection-view`; katalog IED bez fikcji; `NIE_DO_USTALENIA`; usunięcie pól bez dostawcy | — | test stanu zerowego; test „brak fikcyjnych identyfikatorów w katalogu" | brak fabrykacji w UI | testy pinujące fantom |
| M0-5 | Rejestr sieci wzorcowych + inwarianty + OpenAPI + benchmark | 3 niezgodne listy, 264 buildery, guardy „determinizmu" bez solvera (A10-05/06/09) | `tests/golden/registry.py` (G01–G17, §4), `tests/invariants/` parametryzowane po rejestrze, snapshot OpenAPI, benchmark S/M/L | — | test klasy: każda sieć rejestru → walidator, PF, SC, projekcja SN i nN, eksport JSON | rejestr jedynym źródłem fixtur integracyjnych | `sldNetwork53`, ręczne `*.enm.json` w v3 (po migracji) |
| M1-1 | Magazyn rewizji + aktor | tylko bieżąca rewizja + dziennik ≤500 + pełny snapshot per bieg (A9-07) | `RevisionStore` (delty komend + migawki co k), `GET /model/revisions`, checkout, diff; `actor` w każdej komendzie | `set_enm` zapisuje jednocześnie do pliku i do `RevisionStore` (predykaty parami) | „N operacji → N rewizji → checkout k = hash_k"; test parytetu plik ↔ store | biegi cytują `model_revision` zamiast kopii ENM | plik `.enm_store/*.json` jako magazyn; `snapshot_json` w biegach |
| M1-2 | Jeden rejestr biegów | `canonical_runs` + `analysis_runs` + `study_runs`/`study_results` + `_runs` V12.6 (A9-02) | `Run` (rodzaj analizy jako pole) w `canonical_runs`; porównania A/B po `run_id` | adapter porównań czyta `canonical_runs` | „bieg z UI → porównanie A/B 200"; test FK na Postgresie | porównania PF/zabezpieczeń/`comparison` na jednej tabeli | `analysis_runs*`, `study_runs`, `study_results`, `AnalysisRunService`, `AnalysisDispatchService`, `unified_runs.py`, `execution_engine`, `_runs` |
| M1-3 | Magazyny in-memory → trwałe | 7 słowników w zamontowanym API (A9-03) | tabele: scenariusze, serie, overrides SLD, konfiguracje rozdzielnic, wyniki koordynacji (jako `Run`), cache interpretacji (jawny) | — | „restart procesu → zasób czytelny" per magazyn | 0 słowników modułowych | słowniki |
| M1-4 | Import XLSX → ENM; kasacja legacy SQL modelu | XLSX zapisuje do `network_*` niewidocznych dla obliczeń (A9-01, A1-01) | `XlsxNetworkImporter` → komendy domenowe ENM z bramą katalogową | — | e2e „XLSX → PF/SC na złotej sieci" | import widoczny w `topology/summary` | `network_wizard/` (4 083), `NetworkRepository`, `SnapshotRepository`, tabele `network_*`, `network_snapshots`, `sld_*`, `operating_cases`, trasy `solver-input`/`eligibility` legacy |
| M1-5 | Postgres, Alembic, jeden silnik, FK, indeksy | `create_all`, 9 martwych SQL, dwa silniki, brak FK (A9-14) | Alembic; `Engine` z `app.state`; `PRAGMA foreign_keys` w dev | — | „migracja z pustej bazy = schemat"; test jednego silnika | CI z usługą postgres | `infrastructure/migrations/*.sql`, cache silnika w `canonical_run_repository.py` |
| M2-1 | Terminale i `TopologyService` | 20 implementacji topologii, 4 definicje krawędzi, `Port/ConnectionNode` bez egzekwowania (A2-01, A1-03) | `Terminal`/`ConnectivityNode` wyprowadzone z ENM (adapter read-side) → `TopologyService` (CN→TN, wyspy, energizacja, ścieżki) jako jedyny dostawca | stare funkcje delegują do serwisu (test tożsamości wyników na rejestrze) | iloczyn: {stan łącznika × typ aparatu × NOP × sprzęgło} × {SN, nN}; równość krawędzi sceny = graf | 1 implementacja; frontend nie liczy energizacji (`SupplyPathHighlighter` → dane z backendu) | 19 implementacji, `enm/topology.py` stub, `SupplyPathHighlighter` logika |
| M2-2 | `EffectiveState` + scenariusze-delty | 9 reprezentacji stanu, 6 modeli scenariusza, 7 fantomowych operacji STUDY_CASE (A2-02/03/04) | `EffectiveStateResolver` (11 warstw, jawna precedencja), `Scenario{deltas[]}` z 23 rodzajami, `VariantBranch` | `StudyCaseConfig` mapowany na `Scenario` | test precedencji (warstwa × atrybut); izolacja scenariusza od bazy (klasa) | jeden model scenariusza | 5 modeli, fantomowe operacje, `study_scenario` |
| M2-3 | Graf zależności i inwalidacja selektywna | all-or-nothing; macierz tylko w dokumencie (A2-05/11) | `AttributeClass` → analizy/dokumenty; `Freshness` per bieg i dokument | invalidator legacy woła graf | test: każda klasa × analiza wg macierzy | „Przelicz nieaktualne" ≤ 30 % planu | `result_invalidator` all-or-nothing |
| M2-4 | Rewizja katalogu i provenance parametru | wersja literałowa „2024.1", 3 kopie danych, override bez semantyki, klient pisze provenance (A6-01…07) | `CatalogRevision`, `CatalogBinding{revision}`, `ParameterProvenance`, jedna kopia wartości (materializacja jako widok) | drift detection na nowym mechanizmie | test: rebind katalogu × override × brak danych | brak `materialized_params` w modelu | 2 kopie danych, 12 słowników jakości → 1 |
| M2-5 | Model fazowy nN i uziemienia jako encje | brak L/N/PE/PEN, 6 reprezentacji uziemienia, TN-C-S cichy, 0/17 kabli z r0/x0 (A1-04, A11-02…05) | `PhaseCode`, `EarthingSystem`, żyły PE/N/PEN, szyna PE/N, dane r0/x0 z katalogu (brak = brak) | — | iloczyn: układ sieci × żyły × TR | jedna fizyka Ik1 nN (IEC 60909 składowe) z jednymi danymi | pętla „konwencjonalna" jako druga fizyka; cichy default |
| M2-6 | Typowane wyposażenie pól (write-side) | `meta.field_specs`/`nn_field_specs` aktywną prawdą; typowane klasy „legacy write-disabled" (A1-02) | komendy zapisu do `Bay`/urządzeń/`Measurement`/`ProtectionDevice` | projekcja `field_specs` z obiektów (tylko odczyt) | test parytetu: read-model Bay v10 z obiektów == dotychczasowy | 0 czytelników `meta.field_specs` | worek `meta` dla pól |
| M2-7 | `GridConnectionPoint` i dekompozycja DER | 12 ról punktu przyłączenia, `Generator`+`meta`, tryby jako stringi w 12 wariantach (A5-01/03/06) | `PowerElectronicsConnection`+`PhotovoltaicUnit/BatteryUnit`+`ControlMode`; `GridConnectionPoint` na terminalu (obiekt umowny); `pcc_zero_guard` strukturalny | adapter z `Generator` | test: tryby Q aktywne w rozpływie; wniosek OSD i werdykt czytają ten sam obiekt | strumień OZE bez drugiego store | `synchronizacjaZModelu.ts`, słowniki stringowe trybu |
| M3-1 | Snapshot kanoniczny + assembler | 10 builderów PF / 7 ścieżek SC, c=1.0 rozjazd (A3-01) | `CanonicalNetworkSnapshot` + `SolverInputAssembler` (widoki) | stare buildery = cienkie wywołania assemblera (test tożsamości) | golden wejścia solverów bit-identyczne per sieć rejestru | 1 assembler | 9 builderów PF, 6 ścieżek SC, 4 Ybus |
| M3-2 | Jądro rzadkie | gęsta algebra (A3-10) | `simulation/kernel/admittance.py` + `splu`; kolumny selektywne SC | — | tożsamość numeryczna z tolerancją zadeklarowaną; benchmark | budżety S/M | gęste ścieżki |
| M3-3 | Orkiestrator i zadania | 5 torów uruchomienia, synchronicznie, Celery 0 zadań (A3-02, A9-10) | `SolverOrchestrator` (DAG, cache, pula procesów, 202+status) | `/api/execution/*` woła orkiestrator | K=10 przepustowość; PARTIAL przy awarii; determinizm między procesami | jeden tor uruchomienia | `enm/runs/*`, `power-flow-runs/execute`, `unified /api/runs`, `batch_execution_service`, Celery/Redis/Mongo w compose |
| M3-4 | Solver nN 4-przewodowy | FDLF nie zbiega na kablach nN; rozpływ niesymetryczny odcięty (A3-03, A11-11) | nowy solver current-injection/BFS ABCN (decyzja S-Q1) | — | walidacja z pandapower/OpenDSS na sieci wzorcowej nN | rozpływ nN w planie wymaganym | BFS-wyspa |
| M3-5 | V12.6 los per analiza | 14 analiz z ukrytymi domyślnymi (A3-06) | wg tabeli w architekturze symulacji §5.10 (wpiąć / przenieść / usunąć) | — | brak wejść domyślnych: test iniekcji | 0 fantomowych domyślnych | analizy usunięte |
| M3-6 | Fizyka poza solverami | proof engine (21 wyrażeń), arc flash, flicker, IDMT ×4, R_θ (A3-08, A4-01) | przeniesienie do `simulation/solvers`; konsumenci formatują | — | golden dowody bit-identyczne przed/po | `backend_no_physics_guard` zielony | duplikaty |
| M3-7 | Ślad v2 | 2 404 LOC bez konsumenta (A3-12) | wpiąć jako jedyny format śladu (decyzja S-Q5) albo usunąć | — | guard determinizmu na realnych biegach rejestru | — | ślady inline lub trace_v2 |
| M4-1 | Zabezpieczenia jako obiekty + jedna fizyka + TCC z modelu + trace | A4-01…08 | `MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md` §2–§4 | `ProtectionConfig.overrides` → grupy nastaw (migracja z markerem) | „zapis nastawy ⇒ TCC ∧ view ∧ czas ∧ karta" (parami); trace iloczyn cech | E-28 czyta model | P1, P4, P8, P12, `protection_report_model`, `protection_analysis_runs.py`, `element-assignment.ts` |
| M4-2 | `ConstraintEngine` + moduły doboru + rekomendacje | dobór tylko DER/kompensacja; werdykt 10 kryteriów (EF-037/048) | `analysis/{constraints,sizing,optimization,recommendations}` | `werdykt_projektowy` jako ewaluator | test klasy doboru × brak danych; tożsamość z DER/nN/kompensacją | 8/8 klas doboru | logika doboru w UI (`stacjaModel.ts`, `ocenaDoboru`), `design_synth`, `analysis/recommendations` |
| M4-3 | `WorkflowEngine`, NBA, Command Center, fix-action executor, rejestr założeń, zapotrzebowanie | 5 silników NBA, akcja = nawigacja, 2 z 8 biegów (A8-04, EF-045/046/029) | FAZA C §2–§3 | NBA legacy deleguje | test §181 na sieci rejestru (14 ogniw) + KPI | 1 NBA | 4 silniki, `useLegacyOrchestrator` fragmenty |
| M4-4 | Rejestr dokumentów, zestawienia, świeżość, pakiet | 5 generatorów, brak 4 schedule, magazyn bez hasha (A9-20, A10-11) | `DocumentType` rejestr §124, `DocumentRecord{model_revision, run_refs}`, generatory zestawień, `DocumentPackage` | adapter nad generatorami PDF/DOCX (KEEP) | „zmiana kabla → dokument OUTDATED"; goldeny zestawień | hub = pakiet | 5 punktów wejścia → 1 |
| M5-1 | Scena semantyczna SN z backendu + `LayoutDocument` | projekcja SN 100 % w kliencie (A7-01) | `SceneSemanticsV1` SN (jak nN 3.0.0), nadpisania geometrii per widok | klient renderuje obie sceny (SN backend, SN klient) za flagą — porównanie krawędzi | równość krawędzi sceny = graf na całym rejestrze; determinizm hash sceny | scena SN z backendu domyślna | 35,3 tys. LOC projekcji SN w kliencie |
| M5-2 | Pakiet symboli R3 + jedna geometria per LOD | 2 rodziny symboli, 3 sceny per LOD (A7-02/05/07) | `ElectricalCadSymbolRegistry` (jeden), `SLD_SYMBOL_SYSTEM_PLAN.md` — **zatwierdzenie właściciela przed migracją renderera (B-02)** | — | snapshot symboli; LOD jako filtr | werdykt B-02 ≥ 9/10 | drugi rejestr, martwa biblioteka SVG |
| M5-3 | Kasacja martwego SLD | ~54 tys. LOC (v2 JSX bez montażu, `engine/sld-layout`, harnessy, backend SLD v1 + diagram w DB) (A7-03/11/14) | — | — | testy kontraktowe z workflowa SLD na żywym kodzie | — | wymienione + krok CI na nieistniejącym teście |
| M5-4 | Polityki CAD/SCADA/ENGINEERING, arkusz, DXF z backendu | brak trybów; DXF minimalny w kliencie; tylko A3 (A7-04/08, A9-17) | `PresentationPolicy`, `SheetDocument`, generator DXF z tej samej sceny | — | golden DXF/PDF per sieć rejestru | SLD w hubie dokumentów | eksport kliencki DXF |
| M6-1 | Powłoka: jedna nawigacja, jeden inspektor, akcje obiektowe, martwy kod | A8-01/02/03/05/07/08 | FAZA C §5; usunięcie 80 tys. LOC + pliku 134 tys. LOC | — | `dead_click_guard` ui2+paleta; e2e natywne kliki | 0 ślepych zaułków | `useLegacyOrchestrator`, 6 inspektorów, `TopologyPanel`, `traceExportApi`, `comparison/api.ts:62-100`, harnessy |
| M6-2 | Store'y i kontrakty | 29 store'ów; ręczne lustro 1 642 linii (A8-10/11) | warstwy stanu; klient generowany z OpenAPI | — | test diffu schematu | — | ręczne typy |
| M6-3 | Wejście nN i profile ról | kreatory nN bez wejścia; 3 tryby bez ról (A11-01, EF-021, EF-053) | akcje w kanwie/drzewie nN + inspektor; profile §168 | — | test §181 dla profilu projektanta nN | nN projektowalne end-to-end | — |
| M7-1 | Dokumentacja | 755 md, 87 kanonów SLD, 3 hierarchie (A10-03/04/14) | `docs/twin/` + SPEC_* + domain + ADR; STAN_REPO generowany; jeden AGENTS.md | — | guard ścieżek cytowanych; guard „nowy plik ma status i wpis w INDEX" | 100 żywych | 464 archiwum, 191 kasacja (decyzja Q3 A10) |

---

## 3. Trzy pionowe wycinki (§163–§165) — pierwsze przejścia przez wszystkie warstwy

Każdy wycinek jest realizowany po M0 i M1-1/M1-2 (bez rewizji i jednego rejestru biegów nie da się dowieść propagacji), przecina M2–M5 i kończy się testem e2e na sieci rejestru z natywnymi klikami (§167).

### 3.1 §163 — Projekt obwodu nN od transformatora do odbioru
Kroki: stacja (TR z kandydatów) → rozdzielnica nN (szyna L/N/PE, układ sieci jako encja) → obwód (kabel z kandydatów: Ib/Iz′/ΔU/I²t/SWZ) → aparat (`nn_device_selection` w UI) → odbiór z profilu → plan analiz nN (pętla, SWZ per odcinek, rozpływ 4-przewodowy) → werdykt z remediami → zmiana kabla → propagacja → arkusz obwodów + pakiet dowodowy + SLD nN z tabliczką. Dowodzi: model fazowy, uziemienia jako encje, jedna fizyka Ik1, dobór z kandydatami, trace nN, dokumenty ze świeżością, wejście nN w powłoce.

### 3.2 §164 — Wstawienie stacji SN na odcinku z pełnym wyposażeniem
Kroki: ciąg SN (kabel z kandydatów) → `ImpactPreview` wstawienia (ΔU, ΔIk, unieważnienia) → wstawienie (podział, dziedziczenie katalogu, terminale) → pola z aparatem/CT (rdzenie)/VT/IED z grupą nastaw i trip matrix → propozycja nastaw z biegów → TCC toru z modelu → koordynacja/czułość w werdykcie → N-1 pierścienia → SLD SN z backendu (scena semantyczna) + widok stacji → zestawienia (TR, pola, CT/VT, nastawy). Dowodzi: terminale, `TopologyService`, scenariusze-delty (N-1), zabezpieczenia jako obiekty, scena SN z backendu, inwalidacja selektywna (zmiana nastawy nie unieważnia rozpływu).

### 3.3 §165 — PV/BESS w punkcie przyłączenia
Kroki: warunki OSD → `GridConnectionPoint` na terminalu → `PowerElectronicsConnection` + `PhotovoltaicUnit/BatteryUnit` z `ControlMode` z katalogu → dobór toru (istniejący wzorzec na wspólnym kontrakcie) → plan: LF z trybami Q aktywnymi, SC z wkładem z karty, zdolność (threshold finder), obszar PQ, FRT/HVRT/RMS zamiast `no_module`, LoM×SPZ → werdykt RfG jako bieg z rewizją → wniosek OSD z punktem z modelu → zmiana parametru modułu → RfG OUTDATED → przeliczenie. Dowodzi: dekompozycja DER, punkt przyłączenia jako obiekt umowny (rozstrzygnięcie konfliktu §44), jedna prawda parametrów modułu, unieważnienie wyników zgodności.

---

## 4. Rejestr sieci wzorcowych G01–G17 (propozycja; lista §146 nie występuje w repo — A10 Q1)

| ID | Sieć | Źródło dziś | Pokrycie docelowe (solver / SLD SN / SLD nN / dokumenty / e2e) |
|---|---|---|---|
| G01 | SN promieniowa (GPZ + odcinki + stacje) | `builders.py:51` (GN_01) | wszystkie |
| G02 | SN z odgałęzieniem | `builders.py:139` | wszystkie |
| G03 | SN pierścień + NOP | `builders.py:248`; `golden_network_sn.py` | + N-1, optymalizacja NOP |
| G04 | SN+nN+OZE (PV+BESS przez TR) | `builders.py:349`; substrat 52s; `nn_full_chain` | + §163/§165 |
| G05 | SN+nN+OZE+zabezpieczenia | `builders.py:501` | + §164, TCC, trace |
| G06 | dynamika/stabilność (StudyCase) | tylko dokument; `test_dynamic_stability.py` na własnej sieci | RMS/FRT |
| G07 | duża sieć ≥ 50 stacji (skala SLD i M) | `sld_substrate_52s.py` (**nieobliczalna** — do naprawy: źródło) | benchmark M, SLD |
| G08 | stacja nN 1 TR / 2 TR ze sprzęgłem | scenariusze nN 01–03 | nN |
| G09 | wyspy nN (grid-following/forming/unknown) | scenariusze 07–09 | + solver wyspowy |
| G10 | sieć zwarciowa pełna 3F/1F/2F/2FZ z Z0 | V12-GN-001 (`sc_asymmetrical`) | SC |
| G11 | izolowany/kompensowany punkt neutralny | częściowo (`v126`) | 67N/Y0>, U0> — NOWA sieć |
| G12 | asymetria obciążenia (stan fazowy) | V12-GN-003 | rozpływ nN 4-przewodowy |
| G13 | FRT / PV+BESS+FW | V12-GN-004; `test_pvbess_hybrid_g4_physics.py` | RfG |
| G14 | SPZ/FDIR automatyka | `test_automation_trace.py` (ślad, nie sieć) | SPZ×LoM — NOWA sieć |
| G15 | benchmark IEEE/CIGRE | 12 builderów `application/reference_networks/builders/` | walidacja solverów |
| G16 | N-1 kontyngencje | `cgmes/golden_enm.py` | N-1 na G03/G07 (nie osobna sieć) |
| G17 | RfG/PTPiREE (DER typy A–D) | `test_ncrfg_ptpiree_solver.py` (własne dane) | na G04/G13 |
| G00 | **sieć L** (≈2 000 szyn SN+nN: pierścienie, ≥150 stacji z nN, DER, 2 GPZ) — generator deterministyczny | brak | benchmark L, test skali |

Rejestr w kodzie (`tests/golden/registry.py`: id, builder, hash ENM, pokrycie) generuje jeden dokument; `reference_networks_guard` czyta rejestr; test klasy: każda sieć → walidator, PF, SC, projekcje SN/nN, eksport JSON dla frontendu.

---

## 5. Bramki jakości (§166) — ≥ 9/10 per obszar, każda pozycja z dowodem

Punktacja: 10 kryteriów per obszar, każde 0/1 z dowodem (test klasy, guard, pomiar, werdykt właściciela); obszar przechodzi przy ≥ 9. Liczba zielonych testów **nie jest** kryterium (A10-13: 10 513 zielonych przy SLD 6/10).

| Obszar | Kryteria (skrót) |
|---|---|
| Model i tożsamość | 1 magazyn modelu · rewizje adresowalne · terminale w każdej gałęzi · własność portu = 1 (klasa) · 0 worków `meta` z aktywną prawdą · model fazowy nN · uziemienia jako encje · `ref_id` w każdym artefakcie (bez uuid5 w kontraktach) · lifecycle assetu · hash cross-platform |
| Topologia i stan | 1 `TopologyService` · `EffectiveState` z precedencją · scenariusze-delty (1 model) · izolacja scenariusza (klasa) · inwalidacja wg macierzy (klasa) · NOP jedna prawda · wyspy SN i nN z solvera · undo/redo komend · warianty jako gałęzie · N-1 w silniku scenariuszy |
| Symulacja | 1 assembler · 0 fizyki poza solverami (guard) · jądro rzadkie · orkiestrator z DAG/cache/zadaniami · rozpływ nN 4-przewodowy · szyny PV/slack rozproszony · budżety S/M/L · ślad jednego formatu · rejestr zdolności z stosowalnością · 0 domyślnych wejść (iniekcja) |
| Zabezpieczenia | 1 fizyka krzywych · nastawy w modelu (grupy) · trip matrix + CBF · 67/67N kierunek · TCC z modelu · trace per element (SN+nN, FUSE) · selektywność/czułość w werdykcie · katalog IED bez fikcji · profile OSD · inwalidacja po nastawach |
| DER i punkt przyłączenia | dekompozycja PEC/PV/BESS · tryby Q aktywne w LF · `GridConnectionPoint` obiektem · wkład SC z karty · wyspy z DER · RfG jako bieg z rewizją (bez `no_module`) · 1 store parametrów · threshold finder na terminalu · PQ liczone (nie fabrykowane) · LoM×SPZ |
| Katalogi i dane | rewizja pozycji · pinowanie w wiązaniu · 1 kopia wartości · provenance per parametr · override z semantyką · jednostki przez `UnitSystem` · 0 cichych fallbacków (guard) · rejestr założeń · jakość danych 1 słownik · klient nie pisze provenance |
| SLD/CAD/SCADA | scena SN i nN z backendu · 1 rejestr symboli (R3 zatwierdzony) · 1 geometria per LOD · polityki CAD/SCADA/ENGINEERING · edycja layoutu zachowana · arkusz/tabliczka/rewizja · DXF/PDF z backendu · nawigacja bez ślepych zaułków · determinizm sceny · **werdykt właściciela B-02 ≥ 9/10** |
| Workflow i UI | test §181 14/14 · 1 NBA z definicją gotowego · 1 inspektor · akcje obiektowe · fix-action wykonuje · 8/8 doborów z kandydatami · 100 % FAIL z remedium · 1 nawigacja · profile ról · 0 martwego kodu w bundlu (guard) |
| API i persystencja | 1 rejestr biegów · 0 in-memory · Postgres/Alembic/FK · snapshot OpenAPI + klient generowany · trasa ↔ konsument (guard) · 202/status dla zadań · `If-Match` · aktor w komendach · retencja/GC · 0 tras 501 |
| Dokumenty i testy | 14 typów §124 · gotowość per dokument · OUTDATED po zmianie · rejestr sieci G01–G17 · `tests/invariants/` po rejestrze · benchmark w CI · guardy determinizmu na realnych biegach · CI wymagane i zielone · 100 dokumentów żywych · STAN_REPO generowany |

---

## 6. KEEP / REPLACE / DELETE (skrót z LOC; szczegóły w audycie §8–§9)

### 6.1 KEEP (fundament twin — z dowodem testów)
`enm/store.py` (współbieżność, rollback), `dziennik_zmian.py`, `enm/hash.py`, `result_freshness.py`, `canonical_analysis.py` (jeden tor — do przepięcia na orkiestrator), `project_archive` (ZIP z odciskami), `infrastructure/cgmes/*`, `lv_domain/projection_v1.py` (3.0.0 — wzorzec projekcji), 18 scenariuszy nN + substrat 52s, `test_nn_full_chain.py`, solvery FROZEN + `protection_iec60255/lv_curves` + `fault_loop` + `swz` + `nn_device_selection` + `dobor_przekladnika` + `equipment_checks` + `der_protection_functions` + `ochrona_lom` + `protection_settings`, `der_selection_preview` (wzorzec doboru), `dry_run` stacji, NBA (`nastepnaAcja.ts` semantyka), gotowość wg celów, diagnoza biegu, generator raportu z bramą, `geometry_overrides.py`, `protectionMarking.ts`, Reference Engine rodzin rozdzielnic, guardy klasy (`enm_contract_parity`, `success_toast`, `mypy_ratchet`, `api_lifecycle`, `router_mount`, `ui_no_physics` z testem allowlisty), `MACIERZ_INVALIDACJI.md` jako specyfikacja testu.

### 6.2 REPLACE (nowa ścieżka z mostem)
`domain_operations.py` 9 864 + `_v2` 6 666 → pakiet komend per rodzina (≤ 800 LOC/moduł, rejestr = jedno źródło); `field_read_model.py` 1 342 → projekcja z obiektów; 10 builderów PF / 7 SC → assembler; 20 topologii → `TopologyService`; 6 modeli scenariusza → `Scenario`; `werdykt_projektowy` → ewaluatory; E-28 → TCC z modelu; hub dokumentów → pakiet; 7 inspektorów → 1; 5 NBA → 1; 29 store'ów → warstwy; ręczne lustro typów → generowane; SLD SN kliencki → scena z backendu; `hosting_capacity` ×2 → `ThresholdFinder`; `lf_sensitivity` → pochodne z Jacobianu.

### 6.3 DELETE (po cutoverze; LOC zmierzone w audytach)
Backend ≈ 15,6 tys.: `symphony/` 810 (obce domenie), `network_wizard/` 4 083 (+572 repo), `analysis_run/` 3 181, `execution_engine/` 1 189, `analysis_dispatch`+`unified_run_dispatch`+`api/unified_runs` 889, `cgmes` bez API 1 689 (→ KEEP po wpięciu API — decyzja), `ncrfg_compliance/` 457 (`no_module`), `lifecycle/` 199, `designer/` 206, `read_models/` 378, `wizard_runtime/` 293, `validation_problem/` 229, `trace_export/` 224, `report_readiness/` 83 (→ wchłonąć), niezamontowane API 2 070 (+`cloud_backup` 917 — decyzja backup), `v125_contracts.py` 461, 9 plików SQL, Celery; łańcuch PR-26…31 zabezpieczeń ≈ 2,5 tys., `protection_report_model.py` 359, `line_overcurrent_setting` 1 800 (scalić), `validate_selectivity`, backend SLD v1 + diagram w DB, `enm/topology.py` stub.
Frontend ≈ 80 tys. nieosiągalnego + 134 193 LOC danych + SLD ≈ 54 tys. (v2 JSX 12,9 tys. bez montażu, `engine/sld-layout` 1 537, harnessy 20,9 tys., martwa biblioteka SVG, drugi rejestr symboli) + `TopologyPanel`, `traceExportApi.ts`, `comparison/api.ts:62-100`, `sldNetwork53`, `EdytowalnaTabela`, `element-assignment.ts`, fantom nastaw w `SldDetailDrawer`.
Dokumenty: 191 do kasacji, 464 do archiwum (A10 §2; zgoda właściciela Q3).

---

## 7. Ryzyka i mitigacje

| Ryzyko | Mitigacja |
|---|---|
| Migracja rdzenia modelu (M2) zmienia hashe → wszystkie wyniki OUTDATED | rewizja „migracja formatu" z jawnym wpisem; test odtworzenia hashy dla rejestru sieci przed/po; dokumenty wydane zachowują cytowaną rewizję |
| Dwie prawdy w trakcie mostu (stara i nowa ścieżka) | most = delegacja + test tożsamości; termin kasacji w wycinku; guard „most bez daty wygaszenia = czerwień" |
| Rdzenie FROZEN | zmiany tylko przez ADR z B-01; `solver_diff_guard` + golden; nowe funkcje jako rozszerzenia z testem tożsamości dla przypadku bazowego |
| Werdykt wizualny | pakiet symboli R3 i scena z backendu prezentowane właścicielowi przed migracją renderera; wyrocznie referencyjne właściciela w repo (A10 Q5) |
| Regresja wydajności przy rzadkiej algebrze/równoległości | benchmark nocny z progiem 20 %; tolerancje determinizmu jawne |
| Zbyt duże PR | wycinek = seria małych PR z zielonym CI wymaganym; scalanie po niezależnej weryfikacji |
| Utrata pracy użytkowników przy kasacji tabel legacy | eksport ZIP przed M1-4; potwierdzenie właściciela, że nie ma projektów w `network_*` (A9 Q3) |

---

## 8. Decyzje wymagające właściciela (kolejność i zakres)

| ID | Decyzja | Rekomendacja |
|---|---|---|
| F-D1 | Zgoda na kolejność M0 → M1 → wycinki pionowe (§3) równolegle z M2–M5 → M6 → M7 | tak |
| F-D2 | Zgoda na kasację tabel legacy bez migracji danych (dyrektywa „bez kompatybilności wstecznej") po potwierdzeniu braku projektów użytkowników | tak, po eksporcie ZIP |
| F-D3 | Zgoda na 191 kasacji i 464 archiwizacji dokumentów (A10 §2) | tak; jedna hierarchia |
| F-D4 | Lista sieci G01–G17 (§4) i sieć L (G00) | przyjąć propozycję |
| F-D5 | Bramki §5 jako warunek scalenia każdego wycinka; werdykt B-02 jako pozycja obowiązkowa obszaru SLD | tak |
| F-D6 | Zakres wersji 1 twin: co poza (21/64/87BB; 61850/SCL; GIS jako pola addytywne bez trybu geo; niezawodność bez danych) | zgodnie z decyzjami w dokumentach obszarowych |
| F-D7 | Orkiestracja wykonawców: wycinek = karta z §0 rozstrzygnięć + bramka; scalanie przez koordynatora po niezależnej weryfikacji | tak (dyrektywa 9) |
