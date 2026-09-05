# MV-DESIGN-PRO — RAPORT FAZY KONWERGENCJI CV-0 → CV-4.2b (kontrakt MAX PLATFORM §42, format A–J)

**Status:** RAPORT ZAMKNIĘTY dla fazy od konstytucji (2026-09-04, `c8331423`) do szczytu `c5f769de` (2026-09-05, 22:28 UTC). Dokument żywy z dowodami bieżącymi: `CONVERGENCE_EVIDENCE.md` (§A CI, §E karty, §F dowody, §G ustalenia adwersaryjne, §H P0/P1, §I decyzje właściciela). Architektura: `../architecture/CANONICAL_TWIN_ARCHITECTURE.md`; kolejność: `../architecture/CONVERGENCE_ROADMAP.md`; decyzje: `../architecture/DECISION_FREEZE_REGISTER.md`.
**Zasada raportu (§42, „UCZCIWOŚĆ"):** każda liczba pochodzi z pomiaru (log CI, wynik pytest/vitest, guard, grep), nie z deklaracji; „zielone przez pominięcie" nie jest dowodem; to, czego nie zrobiono, jest nazwane wprost razem z powodem.

---

## A. CURRENT FACTUAL STATE — stan faktyczny (pomiar na `c5f769de`)

| Element | Pomiar |
|---|---|
| Gałąź / HEAD | `claude/mv-design-pro-twin-audit-u4lhy0` @ `c5f769de` (wypchnięty 2026-09-05 22:36 UTC; 160 commitów od konstytucji `c8331423`); `main` @ `7e84753a` (#473) — **bez ochrony gałęzi** (OD-1), na `main` E2E full i SLD Determinism czerwone od #472 |
| Drzewa robocze | czyste; główny checkout, `fable-cv3`, `fable-cv4` = `c5f769de`; drzewa agentów po odbiorze (FAB-L, CV-4.1b, CV-4.2, FAB-M) scalone cherry-pickiem, bez pracy niescalonej |
| Kontrakt HTTP | 47 routerów w `api/main.py`; OpenAPI **317 ścieżek / 227 schematów** (`backend/schemas/openapi_snapshot.json`, test aktualności i determinizmu; regeneracja po CV-4.2b bez dryfu) |
| Regresja backendu | pełny `pytest tests/ -m "not pandapower"`: **10 956 passed / 0 failed / 0 skipped** (1 082 s) na drzewie CV-4.2b; 649 plików testów / 8 871 funkcji testowych; walidacja krzyżowa z pandapower (10 testów) w osobnym jobie CI z własnym venv |
| Frontend | 889 plików testów vitest; `tsc --noEmit` 0; `eslint . --max-warnings 0` 0 (odbiór FAB-M); bramka `tsconfig_gate_guard` **128/128** błędów poza bramką (budżet = pomiar), wyciszenia 1/1 |
| E2E (Playwright) | 90 speców; E2E full = 414 testów na realnym backendzie (run 348 na `e006be21`), E2E smoke = ścieżka krytyczna |
| Guardy | 83 skrypty `scripts/*_guard.py`; **86 wywołań guardów z workflowów CI** (`guardy_z_ci.py`) + lint jak CI (`black`/`ruff` dla `src`, `tests`, `../scripts`) 4/4 + **558 testów własnych guardów** — komplet zielony lokalnie na drzewie `c5f769de` |
| mypy | `mypy src` (strict, plugin pydantic) na `c5f769de`: **0 błędów, 775 plików** |
| Własność modelu (runtime) | ENM per **PROJEKT**: klucz twin (`application/twin_key.py`), jeden tłumacz `case_id → project_id` (`api/klucz_twin_dep.py`), migracja modeli zastanych per przypadek z manifestem (dziennik idzie ZA modelem); zapadka `enm_store_key_guard` = 1 plik / 1 wywołanie (zapis tymczasowy w imporcie archiwum, droga poprawna) |
| Rewizje / scenariusze | `enm/rewizje.py` (migawka per rewizja, `checkout(n)`, bez limitu wpisów), `enm/envelope.py` (`RevisionEnvelope` na biegu; świeżość WYPROWADZANA, zero pisarzy statusu), `enm/scenariusze.py` (`OperatingScenario`, `apply_scenario → EffectiveNetworkSnapshot`, magazyn scenariuszy nazwanych append-only, `bieg_wariantu`, `wykonaj_bieg_w_pamieci`) |
| Rejestr biegów | **R1** `canonical_runs` — jedyny rejestr (zabezpieczenia jako `analysis_type="protection_sn"`); serie w `run_batches` (SQL); porównania A/B rozpływ/zwarcia/zabezpieczenia czytają R1 przez jedynego producenta `ResultSetV1` |
| Granica obliczeniowa | `enm/assembler.py` (779 linii): `zloz_wejscie_rozplywu` / `zloz_wejscie_zwarcia` — jedyny producent wejścia PF/SC dla toru kanonicznego, kontraktu P11 i wariantów w pamięci; assembler jest funkcją bez bazy (CV-4.2b); zapadka `solver_input_assembler_guard` **3 pliki / 16 konstrukcji**, wyłącznie `application/reference_networks/**` (CV-4.3) |
| Legacy żywe (zmierzone grepem) | (1) ORM `network_snapshots/nodes/branches/sources/loads`, `network_switching_states`, `operating_cases` (C5), `sld_*` — 6 plików konsumentów w `src`: `network_repository`, `snapshot_repository`, `models`, `xlsx_import/service`, `catalog_governance/service`, `project_archive/service`; (2) tabela `analysis_runs` + `analysis_runs_index` jako zależność legacy kreatora (serwis skasowany); (3) E2 — 3 równoległe wejścia uruchomienia: `POST /cases/{id}/runs/{short-circuit,power-flow}` (`api/enm.py`), `POST /power-flow-runs/{id}/execute`, `POST /cases/{id}/runs/v126/{type}` (wszystkie delegują do `canonical_analysis` z fabryką UoW wołającego po CV-4.2b, ale są osobnymi trasami); (4) R4 w pamięci: `_runs` (V12.6), `_coordination_results` (koordynacja zabezpieczeń), `_interpretation_cache` (interpretacja rozpływu); (5) dialekt słownikowy benchmarków `BENCHMARK_DICT_ZASTANE = {G07: 1, B-BENCH: 12}` (P9 własny NR); (6) `meta.field_specs` (CV-5) |
| Rejestr sieci wzorcowych | 17 wierszy (G00…G15 + B-BENCH): 2 ANALYTICAL, 2 PUBLISHED_BENCHMARK, 13 REGRESSION_ONLY; złote pliki parytetu: assembler 264 wpisów, scenariusze 28, P11 132 |

**CI na `c5f769de` (9 workflowów; pomiar z GitHub Actions):**

| Workflow | Run | Stan |
|---|---|---|
| Python tests | 4886 | **zielony** (`33996381217`, zakończony 22:52 UTC) |
| Frontend checks | 3367 | **zielony** (`33996381234`, zakończony 23:01 UTC) |
| Frontend E2E full | 350 | **zielony** (`33996381215`, 414 testów na realnym backendzie, zakończony 23:06 UTC) |
| Frontend E2E smoke | 2528 | zielony |
| Docs Integrity Guard | 3511 | zielony |
| Physics Label Guard | 1580 | zielony |
| Architectural And Repo Hygiene | 3134 | zielony |
| P0 Extended Guards | 1581 | zielony |
| SLD Determinism Guards | 3416 | zielony |

Historia zieleni w fazie (pełne 9/9 na szczycie): `ef9d6790`/`e2a0dc17` (pierwszy raz na gałęzi), `325d7994`, `58367464`, `51cdb9df`, `15e8cb0d`; każda czerwień między nimi sklasyfikowana (§34) i naprawiona u źródła — szczegóły `CONVERGENCE_EVIDENCE.md` §A. Zakazy respektowane w całej fazie: zero `skip`/`continue-on-error`, zero podniesionych tolerancji, zero zaktualizowanych goldenów bez dowodu semantycznego (parytet PRZED/PO), zero skasowanych testów bez przepisania intencji na kanon.

---

## B. ARCHITECTURAL VERDICT — werdykt architektoniczny

**Repozytorium NIE jest jeszcze na architekturze docelowej. Aktywna granica: CV-4 (granica obliczeniowa).** CV-0 (zaufanie CI), CV-1 (własność projektu), CV-2 (rewizje i koperta), CV-3 (scenariusze i jeden rejestr biegów) są domknięte na poziomie rdzenia + przepięcia konsumentów + kasacji procedurą + guarda przeciw wskrzeszeniu; CV-4 jest w połowie (assembler PF/SC istnieje i jest jedynym producentem dla toru kanonicznego; pozostają sieci referencyjne, własny NR, `TopologyService`, legacy ORM).

| Byt | Werdykt | Dowód |
|---|---|---|
| `EnergyNetworkModel` | **KANON** — Canonical Project Twin, własność PROJEKTU | CV-1 (`9667235a`, `a71bd91c`/`4ab4baec`, ADV-CV1 `26542b66`); inwarianty I-1…I-13; guard `enm_store_key_guard` |
| `ModelRevision` + `RevisionEnvelope` | **KANON** — migawka per rewizja, koperta na biegu, świeżość wyprowadzana | CV-2 (`9f5fe90e`, CV-2-W `d8fb25de`/`2a5cb667`/`a79700b8`); `checkout(n).hash == dziennik[n].hash` dla rejestru sieci; guardy `provenance_constant_guard`, `result_status_writer_guard` (budżet 0) |
| `OperatingScenario` + `apply_scenario` | **KANON** — jedna delta migawki, jedna fabryka wariantu, jeden dyspozytor | CV-3.1 (`e1bc25f1`), CV-3-W (D1–D6, parytet 28/28 bit w bit), C6-PERSIST (`f53b780a`); guard `scenario_copy_guard` (zapadka 19 → 0) |
| `CanonicalRun` (R1) + `run_batches` | **KANON** — jedyny rejestr biegów i serii | CV-3.3-B/B2/C; R2 serwis, R3 tabele, E3, E2-widmo, E4 w pamięci skasowane |
| `enm/assembler.py` | **KANON** (PF/SC) — jedyny producent wejścia solvera dla toru kanonicznego, P11 i wariantów w pamięci; bez bazy | CV-4.1 (`4b65cb14`/`4b9311ea`/`148f8de5`), CV-4.1b, CV-4.2, CV-4.2b; parytet 264 wpisów; guard `solver_input_assembler_guard` (zapadka 7/31 → 3/16) |
| rdzenie solverów `network_model/solvers/**` | **FROZEN (B-01)** — nietknięte w całej fazie; defekty fizyki numerycznej obsłużone w WYKONAWCACH (§35, kwalifikacja topologiczna) | CV-4.1 krok 0, CI-PARYTET-5; propozycja odmowy rdzenia → OD-6 |
| `network_model/core` | **Derived Immutable IR** — budowany z migawki efektywnej przez `enm/mapping.py` + assembler | C.1/C.2 konstytucji; A3-04 (PV z modelu) zrealizowane |
| legacy ORM `network_*`/`sld_*`/`operating_cases` (C5) | **DELETE procedurą** — nierozpoczęte (wymaga OD-2: dane użytkowników w legacy ORM) | 6 plików konsumentów w `src` (sekcja A) |
| sieci referencyjne `application/reference_networks/**` (P6–P10, S5, S6, własny NR + Ybus) | **STRANGLE → DELETE** — nierozpoczęte (CV-4.3) | zapadka assemblera 3/16; `BENCHMARK_DICT_ZASTANE` {G07: 1, B-BENCH: 12} |
| `TopologyService` | **KONSOLIDACJA** — nierozpoczęta (pomiar CV-4.0: 18 implementacji topologii / 15 definicji krawędzi) | CV-4.3 |
| E2 sieroty (3 trasy uruchomienia) | **STRANGLE → DELETE** — delegują do kanonu, trasy nadal osobne | sekcja A |
| R4 resztki w pamięci (`_runs` V12.6, `_coordination_results`, `_interpretation_cache`) | **CONSOLIDATE → R1 / magazyn projektu** — nierozpoczęte | sekcja A |
| SLD | **projekcja twin** — nierozpoczęte poza akceptacją v3 i lokalnością (SLD-LOC); klient nadal liczy topologię SN (`enmToSldAdapter`) | program SLD (B-02 właściciela) |

**Rejestr decyzji (`DECISION_FREEZE_REGISTER.md`) po tej fazie:** DT-2 (Project owns ENM) i DT-6 (`ModelRevision` + `RevisionEnvelope`) spełniają wszystkie pięć warunków §39 (dowód implementacji, wyrocznia — inwarianty/parytet hashy rewizji, wiersz rejestru, przegląd adwersaryjny §38, bramka CI) → **FROZEN** (zmiana statusu w tym raporcie); DT-7 (scenariusze) pozostaje EVIDENCE-GATED — `OperatingScenario`/`apply_scenario` zrealizowane i przejrzane adwersaryjnie, ale `NetworkVariation` (wariant jako komendy) nie istnieje jeszcze jako byt (żaden konsument go dziś nie wymaga; powstaje razem z pierwszym konsumentem, nie „na zapas"); DT-8 (IR pochodny, jeden assembler, `TopologyService`) EVIDENCE-GATED (assembler PF/SC tak; `TopologyService` i benchmarki nie); DT-11 (kwantyzacja 9 cyfr) EVIDENCE-GATED z lekcją pięciu rund CI-PARYTET (sekcja G); DT-15/DT-16 EVIDENCE-GATED bez zmian.

**Definition of Done programu (§40, 24 kryteria) po tej fazie:** DONE 7 (1, 2, 7, 8, 12, 13, 19), CZĘŚCIOWO 9 (3, 9, 10, 15, 16, 17, 18, 23, 24), NIE 6 (4, 5, 6, 11, 14, 21), OWNER ACTION 1 (20), TAK projektowo 1 (22) — tabela z dowodami: `CONVERGENCE_EVIDENCE.md` §D (zaktualizowana w tym raporcie).

---

## C. CAPABILITY IMPACT — wpływ na zdolności produktu

Zdolności, które po tej fazie są REALNE (mapowanie na `../architecture/PRODUCT_CAPABILITY_CONSTITUTION.md` §2 i macierz 27 wierszy, 27/27 „NIE BLOKUJE", 3 warunkowe):

1. **Jedna prawda o sieci projektu** — wszystkie przypadki obliczeniowe projektu liczą TEN SAM model; wariant/N-1/hosting/PQ/odpowiedź OSD nie mogą rozjechać się na kopiach per przypadek (A. modelowanie, N-1, optymalizacja). Wcześniej: kopia ENM per `case_id`, pusty model domyślny fabrykowany dla dowolnego identyfikatora (ADV-CV1: 3 obalenia naprawione u źródła).
2. **Lineage i świeżość wyniku wyprowadzane, nie zapisywane** — każdy bieg niesie kopertę (rewizja, hash migawki, odcisk katalogu, hash opcji); „aktualny/nieaktualny" liczone z koperty z nazwaną przyczyną (`model-zmieniony`, `katalog-zmieniony`, `SCENARIUSZ_ZMIENIONY`…); zero pisarzy statusu (dokumentacja, RfG, porównania między rewizjami).
3. **Scenariusze pracy jako typowane nadpisania z proweniencją** — N-1 (kontyngencje), hosting capacity, obszar PQ, odpowiedź OSD, studia zwarciowe (trwałe, z lokalizacją BUS/NODE honorowaną w solverze) na JEDNEJ funkcji `apply_scenario`; wyniki bit-identyczne przed/po migracji (28 złotych hashy).
4. **Fizyka rozpływu z modelu, nie z opcji** — generator w regulacji napięcia (AVR synchroniczny, falownik `voltage_control`) jest węzłem PV w rozpływie NR z granicami Q z migawki (A3-04; wcześniej ZAWSZE PQ, `pv_bus_ids=[]`); odmowy jawne (dwa regulatory na jednej szynie, szyna SLACK jako PV); walidator bramkuje profilem NC RfG; kreator OZE i karta techniczna pokazują tryb bez cichego resetu.
5. **Uczciwy wynik zwarciowy w wyspach bez zasilania** — wiersz węzła bez impedancji do odniesienia (wyspa nN zasilana tylko falownikiem) jest `not_reportable` z powodem topologicznym (IEC 60909-0 §4.2/§6.8) i liczbami `None`, zamiast κ ≈ 3·10¹², i_p ≈ 2·10¹⁴ A, I_th = ∞; rozpływ oddaje `None` + `non_finite_fields` dla węzłów nierozwiązanych zamiast `NaN`.
6. **Konfiguracja audytu 2 stacji widoczna dla biegu** — jedna baza dla wszystkich wejść wykonania (końcówka ogólna, PF, biegi natychmiastowe, serie, warianty w pamięci, nastawy); wcześniej konfiguracja zapisana przez API bywała dla biegu niewidoczna (druga baza z `DATABASE_URL` w tym samym procesie); kontrakt P11 (`solver_input`) buduje wejście z REALNEJ migawki (wcześniej z pustego grafu — fabrykacja klasy P12 bez wiedzy dzwoniącego).
7. **Zabezpieczenia w jednym rejestrze biegów** — bieg zabezpieczeń jako `CanonicalRun`, porównanie A/B zabezpieczeń osiągalne w ui2 obok rozpływu i zwarć, z proweniencją obu biegów; serie biegów trwałe (status PARTIAL zamiast zatrzymania na pierwszej awarii).
8. **Katalogi wyłącznie z backendu, zero fizyki w UI** — katalog przekaźników bez fikcyjnych marek (profile referencyjne), DER/BESS/PV/wiatr/tryby BESS/przełączniki zaczepów/uziemienie punktu neutralnego SN/wkładki SN/modele dynamiczne DER/profile NC RfG z krzywymi LVRT/HVRT/transformatory GPZ i dedykowane — z API; `computeKappa` (równoległa fizyka zwarciowa w kliencie) skasowane; klasyfikacja modułu NC RfG w backendzie (z zastrzeżeniem OD-5: progi YAML = maksima NC RfG, nie progi URE 2018).
9. **Łańcuch danych DER domknięty** — `materialized_params` jedynym źródłem zapisu/odczytu wiązań (wiązania nie znikają po odświeżeniu), jawny wybór przekształtnika (backend 422 zamiast cichego domyślnego), punkt przyłączenia SN jako element modelu, `k_sc` falownika z katalogu albo jako zarejestrowane założenie ze śladem White Box.
10. **Zaufanie do bramek** — CI 9/9 z naprawami u źródła; polityka przenośności wyniku między maszynami (sekcja G); 86 guardów CI z zapadkami w obie strony; snapshot OpenAPI diffowalny; pełna regresja bez pominięć (0 skipped).

Zdolności, które NADAL NIE są możliwe (uczciwie, z adresem):
- **Zwarcia doziemne z typowanym uziemieniem i fazami nN (ABCN/PEN/PE)** — 6 reprezentacji uziemienia, fizyka nie czyta żadnej; brak `PhaseSet`/`EarthingSystem`/`NeutralGrounding` → CV-5 (F-1…F-4, T-2). GPZ nie ma dziś ustawianego `hv_neutral` (P1-6).
- **Sieć G01 end-to-end** (kompensowana SN + stacja + nN + PV, EDIT → REPORT) → CV-6; wyrocznie G01 → OD-3.
- **Zwarcia na sieci M w budżecie czasu** — B4 G00 = 376 794 ms przy budżecie 1 s (377×), `raw_result` 108 MB → P0-5/P1-10 (faktoryzacja rzadka + kolumny selektywne w rdzeniu = B-01; ślad per węzeł jako artefakt na żądanie).
- **Benchmarki IEEE/CIGRE torem kanonicznym** — 12 + `oze_pv_bess` istnieją tylko w dialekcie słownikowym własnego NR (P9) → CV-4.3 (P1-3).
- **Lokalizacja zwarcia na gałęzi (BRANCH/BRANCH_POINT)** — kod gotowości `fault.location_on_branch_requires_assembler` do czasu wsparcia w assemblerze (CV-4.x).
- **SLD jako projekcja twin** — klient nadal liczy topologię SN; werdykt wizualny wyłącznie właściciela (B-02).
- **Jedno ownership nastaw zabezpieczeń** (per przypadek i w modelu) i jeden katalog zabezpieczeń (P1-5: trzy prawdy o przekaźnikach) → ADR-022 po CV-5.

---

## D. IMPLEMENTATION COMPLETED — co wdrożono w tej fazie (z commitami i dowodem)

| Wycinek / karta | Commity (gałąź) | Treść | Dowód odbioru |
|---|---|---|---|
| **CV-0 zaufanie CI** — CI-A/B/C/D, KLUCZE_ROZPLYWU, CI-ARCHIWUM, E2E-FIX(1/2), E2E-DER, E2E-S95, E2E-RUNNER, E2E-FULL-FIX(1/2), FE-HIGIENA(1/2), PANDAPOWER-DEP, SKIP-INWENTARZ, lint jak CI | `06a9e0f1`, `9b96ebcc`, `ee0ec472`, `b349377b`, `1e9f21c5`, `15e8cb0d`, `40fa31bf`, `314c644b`/`cd1547b2`/`56025be6`, `8bb6589a`, `f62f7891`, `9756f445`/`87584ddc`, `51cdb9df`, `660295de`, `cda1878a`, `cd8bc602`, `7c9ab168`, `f016e4cb`/`f8a3972b`, `c5f769de` (część lint) | każda czerwona bramka sklasyfikowana (§34) i naprawiona u źródła: 11 podstawień liczb, dług typów 658 → 128, martwy test workflowu, regresja gotowości po #472, ładunek per gałąź 105 MB, harnessy bez `QueryClientProvider`, adopcja cudzych serwerów przez Playwright, 5 skipów pandapower nigdy nieuruchamianych, 6 skipów klasy „biblioteka niedostępna", `black --check ../scripts` poza lokalną bramką | CI 9/9 na `ef9d6790`/`e2a0dc17`, `325d7994`, `58367464`, `51cdb9df`, `15e8cb0d`; pełna regresja 10 987 passed / 0 skipped (SKIP-INWENTARZ) |
| **CV-0 determinizm i rejestry** — kontrakt liczb (M0-2), rejestr sieci w kodzie, snapshot OpenAPI, PERF-0, SUB-52s, SLD-LOC | `7a4c2e8d`, `0c506744`, `0cb1c8d0`, `47d809a9`, `536b0e11`, `caa92911`/`2024fb4b` | kwantyzacja 9 cyfr + tryb ścisły niefinitów; rejestr G00…G15 + B-BENCH z klasami wyroczni i zapadką pokrycia; kontrakt HTTP diffowalny; baseline B1–B10 (S/M); substrat 52 stacji obliczalny (21 → 0 BLOCKER); lokalność pionowa kotwic stacji (9/9 pionowe = 0) | `tests/golden/test_registry.py`; `tests/perf` 7; `accept:sld-v3` ALL PASS |
| **CV-0 fabrykacje** — FAB-A…FAB-M, E2E-DER, GUARD-SUB(1/2), WB-2, WB-ROZPLYW, FIX-ACTION-KASACJA | `f49d7f18`, `021423bf`, `ff394efb`, `ab0c5e93`, `eefab9a0`, `27e8a44b`/`0d549d4a`/`98ad6b6a`, `2239ce9c`, `670c77c5`, `4ee77f56`/`54cb5356`, `a16b8e26`, `0346a527`/`cb2e242e`, `7c478519`/`10d9d33f`/`957e8da6`/`c953e831`, `e6b87f36`/`f8b93d6c`, `c16c497d`, `0f4c3a59`, `22cd5f49`, `08ba0f4e`, `acd2862c`, `efa19e09`/`b5e53a37` | klasa A6-12 (ciche podstawienia) w 3 częściach + guard podstawień z 5 korzeniami i formą H; katalogi z backendu (tabliczka GPZ, DER, BESS, tap, uziemienie, wkładki, modele dynamiczne, NC RfG); fantomy pól DER (4) skasowane; `k_sc` z katalogu/założenia; fantom `fix_action_id` (103/108 kodów) skasowany; jedna funkcja rozpakowania śladu White Box (5 kopii) | wiersze §E `CONVERGENCE_EVIDENCE.md`; parytet identyfikatorów harnessu (pytest) |
| **CV-1 własność projektu** — rdzeń, CV-1-G, CV-1-W, ADV-CV1 | `9667235a`, `3bfaa2c7`, `a71bd91c`/`4ab4baec`, `26542b66` | magazyn ENM kluczem projektu, fasada, tłumacz, migracja per-case z manifestem, 121 plików wiring, guard klucza (zapadka 18/74 → 1/1), 14 prób obalenia (3 defekty realne naprawione), inwarianty I-1…I-13 | pełny pytest 10 759 (+5) passed, mypy 0; §G |
| **CV-2 rewizje i koperta** — rdzeń, CV-2-W, OW-8 | `9f5fe90e`, `d8fb25de`/`2a5cb667`/`a79700b8`, `f3b634d6` | migawka per rewizja + `checkout`, koperta na biegu, świeżość wyprowadzana, kasacja H1/H2/H3 + 13 pisarzy statusu + 2 końcówek, ładunek komendy w dzienniku, ekran świeżości | 5 044 passed (rdzeń), 66 plików wiring; `checkout(n).hash` = dziennik dla rejestru; §G (2 przeglądy) |
| **CV-3 scenariusze i jeden rejestr biegów** — CV-3.1, PARITY-CV3, CV-3-W, C6-PERSIST, CV-3.2 (C2/C3/C4/P24+), CV-3.3-A/A2/B/B2/C | `e1bc25f1`, `1cae2f84`, `dc5fedd0`/`9faa78c7`/`498f4260`, `f53b780a`, `a1a703fd`/`f4f020f4`, `d5c45fb2`/`9fc5ff56`, `585d10f1`/`d53decb2`, `e9e7c645`/`6f814f71`, `554f7aa3`/`97271345`/`a3b31fef`/`e65782b6`, `3d480e8b`, `6d30e663`/`f15ed18e` | `OperatingScenario` + `apply_scenario` + magazyn + koperta v2; migracja D1–D6 (parytet 28/28); scenariusze zwarciowe trwałe; kasacje C2/C3/C4/P24+/E3/E2-widmo/R2/R3/E4-w-pamięci; porównania A/B na R1; ekran porównań ui2 z zabezpieczeniami; serie w `run_batches` | pełne regresje 10 930 (CV-3.3-C); snapshot OpenAPI 318 → 315 → 317; §G (CV-3.1) |
| **CV-4 granica obliczeniowa (część)** — CV-4.1, CI-PARYTET-1…5, CV-4.1b, CV-4.2, CV-4.2b | `4b65cb14`/`4b9311ea`/`148f8de5`, `5793a3e0`/`158d9831`/`40e49c22`/`e0cff8de`/`0d76d43c`, `c5dc110f`/`3a7cd8fd`/`dd28a5e8`/`396c397d`, `52f39980`/`a2936c57`/`866595ce`/`469af0a1`, `c5f769de` | `enm/assembler.py` wycięty 1:1 z wykonawców (parytet 252/252 bit w bit PRZED/PO); §35 finitowość w wykonawcach; harness parytetu przenośny między maszynami; PV z modelu (A3-04); kasacja P2/S4, P5, P12, P13 + P11 przez assembler; jedna baza dla biegów, repozytorium konfiguracji audytu 2, guard wskrzeszenia | pełne regresje 10 934 / 10 912 / 10 956; parytet 264 wpisów + P11 132; guardy 86/86 + 558 |

---

## E. DELETED LEGACY — skasowane ścieżki (procedura 7 kroków; każda z dowodem parytetu i guardem)

| Byt | Karta / commit | Dowód parytetu / zero konsumentów | Guard przeciw wskrzeszeniu |
|---|---|---|---|
| H1 pola hashy `ENMHeader` nigdy nie wypełniane; H2 stałe proweniencji (`"1.0.0"`, `"catalog_v1"`); H3 etykiety-stałe `variant_ref` | CV-2 `9f5fe90e` | hash modelu bez zmian (pola wykluczone z odcisku); golden nietknięte | `provenance_constant_guard` |
| 13 pisarzy statusu wyniku w 7 warstwach + 2 końcówki HTTP `invalidate*` + klient FE | CV-2-W `d8fb25de`… | status przypadku wyprowadzany z biegów w każdej odpowiedzi API | `result_status_writer_guard` (budżet 0) |
| `LIMIT_WPISOW` dziennika (obcinanie historii) | CV-2 | rewizje append-only, `checkout` dla całego rejestru | testy CV-2 |
| D1–D6 prywatne delty migawki (`deepcopy` w N-1, hosting, PQ, OSD, zwarcia, seria) | CV-3-W `dc5fedd0`/`9faa78c7`/`498f4260` | 28 złotych hashy sprzed migracji bez zmian | `scenario_copy_guard` (zapadka 19 → 0) |
| C2 `domain/study_case_engine.py` (623) + test (1 163) | CV-3.2 `a1a703fd` | 0 importów w `src`; intencja przeniesiona na I-S6 | `legacy_public_path_guard` (`FORBIDDEN_ENGINE_CLASS_NAMES`) |
| C3 9 operacji domenowych v2 `study_cases[]` (zapis w próżnię) + osierocony `CANONICAL_OPS` | CV-3.2 `a1a703fd` | 0 importerów; rejestr operacji, guard dialogów, komunikaty FE oczyszczone | `FORBIDDEN_DOMAIN_OP_NAMES` |
| C4 `application/study_scenario/**` (611), `analysis/scenario_comparison/**` (345), P24+ `analysis/reporting/pdf/**` (830) | CV-3.2 `d5c45fb2` | 0 wołających poza własnym re-eksportem, 0 tras HTTP, 0 wzmianek w kanonie (pomiar przed kasacją) | `FORBIDDEN_C4_*` |
| E3 `application/execution_engine/**` (1 189 linii), E2-widmo `api/unified_runs.py` + `analysis_dispatch/**` (trasy `/api/runs/*`), martwe podmoduły R2 (1 618) | CV-3.3-A `585d10f1` | 15 plików konsumentów zmierzonych grepem po kasacji; 33 testy fizyki przepisane na kanon na tej samej sieci | `FORBIDDEN_IMPORTS`/`FORBIDDEN_NAMES`; MACIERZ API „usunięty" |
| klaster `result_mapping` (LF→ResultSetV1, protection→overlay) + `AnalysisKind` | CV-3.3-A2 `e9e7c645` | decyzja per moduł; STOP B-01 na zamrożonych `*_to_resultset_v1` SC/Protection | `resultset_v1_schema_guard` |
| R2 `AnalysisRunService` (+ P3/S3 `c_factor=1.0` domyślne), R3 `study_runs`/`study_results` (migracja 010), `ProtectionAnalysisService` | CV-3.3-B `554f7aa3`… | porównania czytają R1; import ZIP buduje `CanonicalRun`; 0 konsumentów produkcyjnych | `legacy_public_path_guard`; `readiness_consumption_guard` (emiter `source.connection_missing` przeniesiony do walidatora) |
| E4 `_batches`/`_case_batches`/`_pinned_hashes` w pamięci | CV-3.3-C `6d30e663` | kontrakt HTTP 4 końcówek addytywny; FE `batchStore` bez zmian semantyki | testy trwałości serii |
| martwe strony `ui/{power-flow,protection}-comparison/*Page.tsx` | CV-3.3-B2 `3d480e8b` | jeden ekran porównań w ui2 | vitest ekranu |
| fantom `fix_action_id` (28 plików, 103/108 kodów bez dyspozytora) | FIX-ACTION-KASACJA `efa19e09` | `fix_navigation` obowiązkowa, zamknięty zbiór 10 paneli | `fix_action_completeness_guard` |
| P2/S4 `network_wizard/service.py::build_power_flow_input`/`build_short_circuit_input` + 6 pomocników + DTO `ShortCircuitInput` (2 481 → 2 228 linii) | CV-4.2 `52f39980` | 0 wywołań produkcyjnych (grep po kasacji) | `FORBIDDEN_CV42_*`; `solver_input_assembler_guard` |
| P5 `application/power_flow_input_builder.py` + test parity P2↔P5 (1 032) | CV-4.2 `52f39980` | fizyka pokryta niezależnie na kanonie (4 testy `tests/enm`) | jw. |
| P12 `POST /api/cases/audit2-power-flow` (`pq=[]`, `slack-stub`) | CV-4.2 `52f39980` | konsument FE przepięty na bieg kanoniczny (`/api/execution/...`, `audit2_applied`); MACIERZ API „usunięty"; snapshot OpenAPI | `api_lifecycle_guard`, `route_prefix_guard` |
| P13 `domain/load_flow_input.py` + `load_flow_validation.py` (tylko testy) | CV-4.2 `52f39980` | 0 konsumentów | `FORBIDDEN_CV42_CLASS_NAMES` |
| assembler z własnym silnikiem z `DATABASE_URL` (`_uow_factory_biezacy`, `_maybe_load_audit2_extensions`) + zapas w `_execute_protection`; 7 zapytań ORM `StationAudit2ConfigORM` poza persystencją; zapytanie ORM w `catalog_governance` | CV-4.2b `c5f769de` | pełna regresja 10 956; testy klasy {brak pary, pół pary, zły UUID, brak fabryki, para bez zapisu, para z zapisem} × {PF, SC} | `FORBIDDEN_CV42B_FUNCTION_NAMES` |
| frontend: `ACME/REX` (5 urządzeń → profile referencyjne), fantom nastaw `SldDetailDrawer`, `SldTitleBlock` v2 z kryptonimem, `DER_CATALOG_OPTIONS` (18 `catalog_ref`), fallback `AddDerWizard` (3×97), `catalogs.ts` (−1 116 linii FAB-J; BESS/tap/uziemienie/DER zwarciowe/`computeKappa`/dynamiczne FAB-L), `protection-catalogs.ts` (674 → 72 linie), `CATALOG_FIXTURES` harnessu (18 tras) | FAB-A/B/F/I/J/L/M, E2E-FULL-FIX | parytet katalogów backend↔front testami pytest (30 + 7 + fuse-id) | `test_audit2_katalogi_parytet.py`, `test_creator_harness_katalogi_parytet.py`, `no_codenames_guard` (klasa `K<cyfry>`) |

Nie skasowane (świadomie, z powodem): legacy ORM `network_*` (OD-2 — dane użytkowników), `analysis_runs` tabela (zależność kreatora → razem z ORM), E2 sieroty (3 trasy — konsument FE do zmierzenia w CV-4.3), R4 resztki (`_runs` V12.6, `_coordination_results`, `_interpretation_cache` → magazyn projektu / R1), `canonical_run_repository` z własnym silnikiem (jedyny uchwyt do `canonical_runs`, unifikacja = decyzja rejestru CV-2), sieci referencyjne P6–P10 (CV-4.3).

---

## F. ENGINEERING EVIDENCE — dowody inżynierskie (liczby z pomiaru)

- **Pełne regresje backendu** (`pytest tests/ -m "not pandapower"`, CI parity): CV-1-W 10 759; SKIP-INWENTARZ 10 987 / 0 skipped; CV-4.1 10 934; CV-3.3-C 10 930; CV-4.2 + CV-4.1b 10 912; FAB-L 10 929; CV-4.2b **10 956 / 0 failed / 0 skipped** (1 082 s). Różnice liczb = kasacje testów legacy przepisanych na kanon + nowe testy klasy.
- **mypy** `src` (strict): 0 błędów w każdym odbiorze fazy (809 → 776 plików po kasacjach); pomiar na `c5f769de`: **0 błędów, 775 plików** (`Success: no issues found`).
- **Parytet assemblera** (`tests/golden/parytet_assemblera`): 264 wpisy (252 sieci rejestru × {PF, SC 3F max/min, 1F, 2F, 2FG} + 12 G06 z PV) — szkielet dokładnie + liczby kontraktu w tolerancji (1e-9 + 2e-6·|a|, ATOL 1e-6) + mapa skrótów poddrzew (8 836); PRZED (`4b65cb14`, sprzed wycięcia) == PO 252/252 dowiedziony pięciokrotnie pod kolejnymi widokami parytetu.
- **Parytet scenariuszy** (`parytet_scenariuszy`): 28 złotych hashy D1–D6 zebranych PRZED migracją, bit w bit po (30 testów).
- **Parytet P11** (`parytet_p11`): 132 wpisy kontraktu `LoadFlowPayload`/`ShortCircuitPayload` po przepięciu na assembler.
- **Rewizje**: `checkout(n).hash == dziennik[n].hash` dla całego rejestru sieci; iniekcja awarii po każdym z 5 kroków zapisu × 2 sieci (§G).
- **Wyrocznie**: 12 benchmarków IEEE/CIGRE (pandapower) — walidacja krzyżowa 10 testów biegnie w osobnym jobie CI (wcześniej 5 skipów NIGDY nieuruchamianych); 2 sieci ANALYTICAL, 2 PUBLISHED_BENCHMARK, 13 REGRESSION_ONLY (rejestr).
- **Wydajność (PERF-0, `47d809a9`)**: B4 zwarcie G00 (315 szyn, 54 transformatory) 376 794 ms przy budżecie 1 s; B3 rozpływ 5 100 ms przy 200 ms; B1 topologia 110 ms przy 30 ms; `raw_result` SC G00 = 108 MB / 549 k liczb (P0-5, P1-10 — otwarte).
- **Determinizm**: kontrakt liczb 9 cyfr + tryb ścisły; §35 finitowość PF/SC w wykonawcach (252 biegi); polityka przenośności między maszynami (sekcja G); SLD v3 acceptance 410 PASS; hash sceny substratu 52s `bc10e5ac`.
- **Guardy i zapadki (tylko w dół, z pomiaru)**: `tsconfig_gate` 658 → 128 (wyciszenia 39 → 1); `solver_input_substitute_guard` z 5 korzeniami + forma H (zapadka `ZASTANE_ZASTEPNIKI` przeliczana z pomiaru przy każdej karcie); `enm_store_key` 18/74 → 1/1; `scenario_copy` 19 → 0; `solver_input_assembler` 7 plików/31 → 3/16; `result_status_writer` budżet 0; `BENCHMARK_DICT_ZASTANE` {G07: 1, B-BENCH: 12}; blokery substratu 52s 21 → 0; 86 guardów CI + lint 4 + 558 testów własnych.
- **Frontend**: `tsc` 0, `eslint` 0 (cały projekt) w każdym odbiorze; vitest gate-scope FAB-K 273 plików / 3 196, FAB-L 248 / 2 899 (+ pełny lokalny bieg po zmianie hooka współdzielonego); e2e na własnych portach (świeża baza per bieg): FAB-K 48, CV-3.3-B 19+2, FAB-L 10, FAB-M/E2E-FULL-FIX-2 19.
- **CI**: 5 szczytów 9/9 w fazie (sekcja A) + stan na `c5f769de` (tabela A); pandapower job zielony od `7c9ab168`.

---

## G. ADVERSARIAL FINDINGS — ustalenia adwersaryjne (§38) i lekcje klasy

| Granica | Próba obalenia | Wynik |
|---|---|---|
| CV-1 „PROJECT owns ENM" (ADV-CV1, 14 prób) | eksport archiwum w świeżym procesie; dispatch nN; migracja dziennika; bramka własna; współbieżność (11 prób) | **3 obalenia, naprawione u źródła**: archiwum bez sekcji ENM (`_collect_enm` czystą funkcją klucza), dispatch nN FABRYKOWAŁ pusty model i zapisywał go pod kluczem projektu, dziennik promowanego przypadku odkładany do `legacy_przypadki/` (dziura wyglądająca na kompletną historię); bramka `enm_store_key_guard` czerwona na HEAD po własnej naprawie (zapadka nieobniżona) — naprawione; współbieżność się broni (I-8…I-13), blokada w procesie nazwana |
| CV-2 rewizje | iniekcja awarii po każdym z 5 kroków zapisu × 2 sieci; sierota > HEAD; migawka obca; magazyn sprzed rejestru; import; migracja | **broni się** (stan = ostatnia rewizja spójna); po drodze POTWIERDZONA hipoteza o teście wycofania iniektującym awarię globalnie — test naprawiony |
| CV-2 świeżość | koperta niespójna, bieg bez koperty, ta sama rewizja inny hash, katalog inny, brak modelu | **broni się** — OUTDATED z nazwaną przyczyną w każdym wariancie; FRESH tylko przy zgodnej rewizji + hashu + odcisku |
| CV-3.1 scenariusze | `snapshot_hash` koperty dla scenariusza z nadpisaniami; wariant na biegu-scenariuszu; guard R4 vs kopia obronna | (1) **obalone i naprawione**: koperta identyfikuje BAZĘ + scenariusz (I-S2/I-S3); (2) `bieg_wariantu` odmawia składania scenariuszy z nazwą; (3) guard rozróżnia kopię do odczytu |
| CV-4.1 „wynik kanoniczny PF/SC jest kontraktem liczb" | 252 biegi rejestru przez `kwantyzuj_kontrakt` (tryb ścisły) | **obalone, naprawione w wykonawcach** (solver FROZEN nietknięty): `NaN` w U wysp nN, κ ≈ 3·10¹², I_th = ∞ → `None` + `non_finite_fields`, wiersz `not_reportable` z powodem; propozycja odmowy rdzenia → OD-6 |
| CV-4.1 „hash surowego wyniku solvera jest przenośny między maszynami" (CI-PARYTET 1–5, runy 4871/4873/4875/4876/4877) | CI GitHub vs bieg lokalny, sonda z zaburzeniem 10⁻¹² na `np.linalg.inv` | **obalone pięciokrotnie, naprawione u źródła harnessu**: (1) zera fizyczne i reszty NR przy 9 cyfrach = szum BLAS; (2) surowy wynik nieprzenośny przy ŻADNEJ siatce (złe uwarunkowanie wzmacnia szum do 10⁻⁸); (3) liczby w NAPISACH śladu White Box i w `proof_ref` (sha256 wyniku) niosą ten sam szum; (4) kształt śladu zależy od progu zerowego w solverze (`if i_a <= 0`); (5) kwalifikacja „niefizyczny" po liczbach jest funkcją maszyny przy osobliwej Y-bus. **Lekcja klasy (do ADR-018/§35):** między maszynami porównywalne są WYŁĄCZNIE części wyniku będące funkcją WEJŚCIA (szkielet bez śladu solwera, liczby kontraktu w tolerancji); każdy próg na liczbie solvera (zero, pasmo, finitowość) jest funkcją szumu, gdy dane leżą przy progu — kwalifikacje dyskretne wyprowadzać z topologii/danych, nie z wyniku |
| CV-4.2 „P11 ma parytet BEFORE/AFTER" | pomiar stanu sprzed karty | **twierdzenie niewykonalne**: `_get_graph_for_case` ZAWSZE zwracał pusty graf — P11 HTTP był fabrykacją klasy P12 bez wiedzy dzwoniącego; udowodniono niezmiennik (logika składania payloadu niezmieniona, złote hashe P11 z realnej migawki) |
| CV-4.2b „CV-3.3-B naprawiła klasę własnego silnika" | grep klasy po odbiorze | **obalone**: naprawiona INSTANCJA (`_execute_protection`); assembler i 7 zapytań ORM poza persystencją nadal czytały drugą bazę — klasa domknięta w `c5f769de` z guardem |
| FAB-K łańcuch DER | e2e `critical-oze-evidence` na realnym backendzie | **obalenie przez test, nie inspekcję**: bramka certyfikatu PTPiREE blokowała moduł Z REALNYM certyfikatem; wiązania znikały po odświeżeniu (zapis `materialized_params` vs odczyt `meta`) |
| Metodyka odbioru (Zero-Debt) | „regresja CI" na 9 katalogach vs `testpaths` całego `tests/` | **obalone** (run 4868: 47 czerwonych w korzeniu `tests/`) → odtąd pełny `tests/` przed każdym pushem; edycja plików worktree W TRAKCIE pełnego pytest daje fałszywe czerwone (drzewo zamrożone na czas biegu); worktree agenta powstaje z `origin/main` (120+ commitów za głową) → pierwszy krok karty `git reset --hard <SHA>`; lokalna bramka odbioru bez `black --check ../scripts` przepuściła 2 czerwone runy (4879/4881) → lint jak CI w `guardy_z_ci.py` z testem własnym |
| Rejestr kodów gotowości | inwentarz `fix_action_id` | 103/108 kodów bez dyspozytora, 76/83 identyfikatorów bez wystąpienia poza definicją — fantom skasowany |

---

## H. REMAINING P0/P1 — pozostałe ryzyka (stan po fazie; pełna tabela `CONVERGENCE_EVIDENCE.md` §H)

| ID | Ryzyko | Stan po fazie | Adres |
|---|---|---|---|
| P0-1 | `main` bez ochrony gałęzi; #472 scalony z czerwonym CI | **OTWARTE — OWNER ACTION** (OD-1) | §B dowodów |
| P0-2 | ENM per `case_id` | **ZAMKNIĘTE** (CV-1 + ADV-CV1) | — |
| P0-3 | fabrykacje użytkowe (fikcyjny katalog, fantom nastaw, `c_factor=1.0` w torze legacy) | **ZAMKNIĘTE** (FAB-A/B; P3/S3 skasowane w CV-3.3-B); klasa cichych podstawień pod guardem z zapadką (dług mierzony, schodzi z każdą kartą) | GUARD-SUB zapadka |
| P0-4 | 12 czerwonych e2e od #472 | **ZAMKNIĘTE** (CI-D + KLUCZE_ROZPLYWU) | — |
| P0-5 | wydajność zwarć sieci M: 376 794 ms przy budżecie 1 s | **OTWARTE** — naprawa = faktoryzacja rzadka + kolumny selektywne w rdzeniu (B-01, pakiet dowodowy) | CV-4.x/PERF, B-01 |
| P1-1 | wiele rejestrów i wejść biegów | **CZĘŚCIOWO**: 1 rejestr (R1 + `run_batches`); zostają 3 trasy E2 i R4 resztki (`_runs`, `_coordination_results`, `_interpretation_cache`) | CV-4.3 (trasy), magazyn projektu (R4) |
| P1-2 | uziemienie: 6 reprezentacji, fizyka nie czyta | OTWARTE | CV-5 F-3 |
| P1-3 | benchmarki tylko w dialekcie P9 | OTWARTE (zapadka {G07: 1, B-BENCH: 12}) | CV-4.3 |
| P1-4 | substrat 52s nieobliczalny | **ZAMKNIĘTE** (SUB-52s 21 → 0 BLOCKER); wydajność walidatora → P1-7 | — |
| P1-5 | trzy prawdy o przekaźnikach | OTWARTE (picker zawężony do katalogu kanonicznego) | ADR-022 po CV-5 |
| P1-6 | `hv_neutral` GPZ nieustawiane, walidator milczy | OTWARTE | CV-5 F-3 |
| P1-7 | walidator O(N³) przy budowie sieci (5 287 × `_szyny_stacji`) | OTWARTE | karta walidatora (indeks per stacja) |
| P1-8 | próg wall-clock w teście jednostkowym `kosztSceny.test.ts` | OTWARTE (po SLD-LOC ten sam plik) | karta FE |
| P1-9 | fallback statyczny `AddDerWizard` | **ZAMKNIĘTE** (FAB-I) | — |
| P1-10 | `raw_result` SC 108 MB (ślad per węzeł w wyniku) | OTWARTE | ślad jako artefakt na żądanie (addytywnie do FROZEN) |
| P2-1 | `k_sc = 1.1` w martwej wyspie legacy `network_model/core/generator.py` | OTWARTE — kasacja z torem legacy | CV-4.3 |
| NOWE (ta faza) | `canonical_run_repository` z własnym silnikiem z `DATABASE_URL` (jedyny uchwyt do `canonical_runs`, nie druga prawda) | nazwane, poza klasą CV-4.2b | decyzja rejestru CV-2 (unifikacja pod fabrykę UoW) |
| NOWE (ta faza) | `DerWiazaniaEditor` bez pickera modelu dynamicznego (mechanizm `TypeCategory` zamknięty na katalog generyczny; zdolność osiągalna przez kreator OZE) | nazwane w FAB-L | rozszerzenie `TypeCategory` (karta FE) |

---

## I. OWNER DECISIONS — decyzje właściciela (wszystkie OTWARTE; szczegóły `CONVERGENCE_EVIDENCE.md` §I)

| ID | Pytanie | Skutek braku decyzji |
|---|---|---|
| OD-1 | ochrona gałęzi `main` (uprawnienia administratora) | kolejne scalenia z czerwonym CI możliwe |
| OD-2 | czy istnieją projekty użytkowników w legacy ORM `network_*` (XLSX/wizard) wymagające eksportu przed kasacją | kasacja legacy ORM (CV-4.3/C5) nierozpoczęta — krok 3 procedury (data export) wymaga odpowiedzi |
| OD-3 | źródło wyroczni `PUBLISHED_BENCHMARK` dla G01 | G01 pozostaje bez wyroczni niezależnej (CV-6) |
| OD-4 | retencja rewizji (pruning nieodwołanych, jawny, z manifestem) vs pełna historia | pełna historia bez wyjątku (stan obecny) |
| OD-5 | progi mocy modułów NC RfG: YAML (maksima NC RfG: A/B 1 MW, B/C 50 MW) vs URE 2018 (200 kW / 10 MW / 75 MW) | klasyfikacja w kreatorze i `POST …/generators` podąża za YAML |
| OD-6 | odmowa rdzenia IEC 60909 (B-01) dla R/X < 0 albo κ poza [1,02; 2,0] zamiast wyniku niefizycznego | wykonawca oznacza wiersz jako nieraportowalny; rdzeń nadal produkuje liczby poza normą |

---

## J. NEXT VERTICAL SLICE — następny wycinek: **CV-4.3 „benchmarki i sieci referencyjne torem kanonicznym; `TopologyService`"**

Cel (jednym zdaniem): każda sieć rejestru i każdy benchmark liczy się WYŁĄCZNIE przez `enm/assembler.py` z ENM, a topologia ma jedną implementację — po czym `solver_input_assembler_guard.ZASTANE` i `BENCHMARK_DICT_ZASTANE` są puste.

Zakres (kolejność wykonania, każdy krok z parytetem PRZED/PO):
1. **Benchmarki jako ENM** — 12 IEEE/CIGRE + `oze_pv_bess` (dialekt słownikowy P9) przebudowane komendami domenowymi na `EnergyNetworkModel`; wyrocznia: wyniki PF/SC przez P1/S1 identyczne z własnym NR w tolerancji ZADEKLAROWANEJ per benchmark (i z pandapower dla 10 testów krzyżowych); `BENCHMARK_DICT_ZASTANE` {G07: 1, B-BENCH: 12} → {} (test własny pinuje 0).
2. **Kasacja P6–P8, S5, S6, P9 (własny NR + własny Ybus), P10 (BFS)** procedurą 7 kroków; `frozen_solver_input.py`, `sld_substrate_power_flow.py`, `station_archetype_substrate.py` przepięte na `zloz_wejscie_*`; zapadka assemblera 3/16 → 0 i pusta lista `ZASTANE` (docelowo z docstringu guarda); `legacy_public_path_guard` + nazwy; `P2-1` (`k_sc = 1.1` w martwej wyspie) kasowany razem.
3. **`TopologyService` — jedna implementacja** (konsolidacja, nie nowy byt, §C.2.2): pomiar CV-4.0 (18 implementacji topologii / 15 definicji krawędzi backend + klient) → jedna funkcja `TopologyView` (osiągalność, wyspy, slack per wyspa — A3-05, stan łączników, energizacja) konsumowana przez assembler, walidator, SLD (scena z backendu) i analizy; parytet: identyczne wyspy/energizacja dla całego rejestru PRZED/PO; guard: druga implementacja union-find/BFS poza `TopologyService` = czerwony.
4. **`backend_no_physics_guard`** (rodziny wielkości: √3, κ, exp(−3R/X), I²t, R·(1+α(θ−20)), P/(√3·U·cosφ)) poza `network_model/solvers` = czerwony z PUSTĄ allowlistą — pomiar CV-4.0: 108 linii fizyki poza solverami → 0 (przeniesienie do solverów addytywnie albo kasacja z dowodem zerowego konsumenta).
5. **E2 sieroty** — pomiar konsumenta FE trzech tras uruchomienia; przepięcie na `/api/execution/...` z tym samym wynikiem; trasy zdjęte (MACIERZ API, snapshot OpenAPI).

Granica wykonawcza: `enm/assembler.py`, `enm/mapping.py`, `enm/topologia*` (nowy moduł konsolidujący), `application/reference_networks/**` (kasacja), `tests/golden/registry.py` + parytet, `scripts/{solver_input_assembler,legacy_public_path,backend_no_physics}_guard.py`. Poza granicą: rdzenie solverów (B-01), legacy ORM C5 (czeka na OD-2 — krok 3 procedury), CV-5.

Definicja ukończenia (mierzalna): pełny `pytest tests/ -m "not pandapower"` 0 failed / 0 skipped; job pandapower zielony; `ZASTANE` assemblera = {} i `BENCHMARK_DICT_ZASTANE` = {} pinowane testami własnymi; parytet assemblera 264+ wpisów bez różnic + wpisy benchmarków z wyrocznią; 86+ guardów CI + lint + testy własne zielone; snapshot OpenAPI przeliczony; mypy 0; `CANONICAL_TWIN_ARCHITECTURE.md` C.2.2/C.2.3 wiersze P6–P10/S5/S6 → ZREALIZOWANE z datą i pomiarem; `CONVERGENCE_ROADMAP.md` wiersz CV-4.3; `CONVERGENCE_EVIDENCE.md` §E/§F/§G (przegląd adwersaryjny granicy topologii); CI 9/9 na szczycie. Dopiero potem: CV-4.4 legacy ORM procedurą (po OD-2) → CV-5.
