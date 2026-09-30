> **MATERIAŁ SUROWY — KOŃCOWA BRAMKA ADWERSARIALNA (§12 mandatu domknięcia), NIE JEST DECYZJĄ.**
> Niezależna próba obalenia zahartowanego pakietu, 2026-09-08. Wynik: **3 FAIL / 4 PASS**,
> w tym **nowe P0** (L1 fałszywa — MV ma trzy niedokończone magazyny prezentacji).
> Wszystkie zarzuty zweryfikowałem osobiście i naniosłem korekty w dokumentach wiążących
> oraz w kodzie. Rejestr korekt: `DONOR_AUDIT_CHECKPOINT.md` **CP-8 / F-31…F-33**.
> Gdzie ten plik jest sprzeczny z dokumentami wiążącymi — **tamte wygrywają**.

# EVALUATOR_FINAL — bramka adwersaryjna pakietu audytu donorów

**Data:** 2026-09-08 · **Drzewo:** `/home/user/MV-Design-PRO/mv-design-pro` · **HEAD:** `da6ea6e7c`
**Zakres:** siedem punktów kontrolnych + audyt kodu i testów dodanych w tej sesji.
**Metoda:** każde twierdzenie sprawdzone plikiem+linią albo wykonanym poleceniem/iniekcją.
`donor-raw/**` traktowane jako NIEWIĄŻĄCE (zgodnie z hierarchią pakietu) — nie użyte jako dowód.

## Werdykt zbiorczy

| # | Punkt | Werdykt |
|---|---|---|
| 1 | TOP-3 wynikają z realnych luk | **FAIL** — L1 jest fałszywa jak napisana (L5, L6 potwierdzone) |
| 2 | Czy została jeszcze karta-duplikat | **FAIL** — trzeci duplikat znaleziony: **D-1** |
| 3 | Czy przeżyła obalona liczba | **FAIL** — blok **F-10** bez znacznika wycofania |
| 4 | Spójność modelu statusów `CanonicalRun` | **PASS z defektem** (druga, nieprzypięta kopia mapowania) |
| 5 | Presentation Store a prymat ENM | **PASS dla projektu**, P1 dla zderzenia z istniejącym magazynem |
| 6 | Licencje wobec SHA z §3 | **PASS** — 11/11 zweryfikowane w klonach |
| 7 | Czy naprawy Zero-Debt rozlały zakres | **PASS** — zakres minimalny; lista plików w mandacie była niepełna |

---

## P0-A · L1 JEST FAŁSZYWA, A KARTA D-1 TO TRZECI DUPLIKAT (punkty 1 i 2)

Audyt orzeka (L1, F-5, D-1 TOP-1 P0): *„Brak trwałego magazynu placement/route … `application/sld/`
liczy układ, nie przechowuje"*. **To nieprawda.** MV ma dziś **trzy** niezależne, częściowe
realizacje dokładnie tego, co karta D-1 proponuje zbudować od zera. Żadna nie jest wymieniona
w pakiecie — `grep -rn "geometry_overrides\|sld_overrides\|sld_node_symbols" docs/architecture/`
zwraca **pusto**, łącznie z `donor-raw/`.

**(1) Kontrakt nadpisań geometrii + ŻYWE API, persystencja tylko w pamięci.**
- `backend/src/domain/geometry_overrides.py` (303 linie): `ProjectGeometryOverridesV1`,
  `GeometryOverrideItemV1{element_id, scope, operation, payload}`,
  `OverrideScopeV1 = NODE|BLOCK|FIELD|LABEL|EDGE_CHANNEL`,
  `OverrideOperationV1 = MOVE_DELTA|REORDER_FIELD|MOVE_LABEL`,
  `canonicalize_overrides`, `compute_overrides_hash`, `validate_overrides`
  (walidacja po `known_node_ids`/`known_block_ids` = wykrywanie zerwanej referencji).
- `backend/src/api/sld_overrides.py` (245 linii) — router **ZAMONTOWANY**
  (`api/main.py:187`); potwierdzone wyliczeniem tras aplikacji:
  `GET/PUT /api/study-cases/{case_id}/sld-overrides`, `…/validate`, `…/reset`.
- **Persystencja to `_overrides_store: dict[...] = {}`** (`api/sld_overrides.py:108`)
  z komentarzem `# In production this would use a repository/DB.` (:106).
- **Zero konsumentów we froncie:** `grep -rn "sld-overrides" frontend/src frontend/e2e` → pusto.

To jest, co do funkcji, **kontrakt Presentation Store z §2.1 architektury** — klucz po
`element_id`, brak danych elektrycznych, powiązanie ze `snapshot_hash`, postać kanoniczna,
własny hasz, `reset` (kasowalność), wykrywanie zerwanej referencji. Brakuje **wyłącznie**
trwałości i wpięcia w `buildSceneV3`.

**(2) Trwały magazyn rozmieszczenia i tras — z migracją, repozytorium i archiwum projektu.**
- `models.py:663` `SldNodeSymbolORM(node_id, x, y, label)` — rozmieszczenie,
  `models.py:675` `SldBranchSymbolORM(branch_id, from_node_id, to_node_id, points_jsonb)` — trasa,
  `models.py:651` `SldDiagramORM`, `models.py:688` `SldAnnotationORM`.
- Migracja `src/infrastructure/migrations/004_sld_symbols.sql`.
- Repozytorium `repositories/sld_repository.py` (`save`/`get`/`update_payload`/`_sync_symbols`),
  wystawione jako `UnitOfWork.sld` (`unit_of_work.py:69`).
- **Żywe ścieżki produkcyjne:** `application/network_wizard/service.py:1049, 1081, 1099`
  (zapis i przebudowa układu), `api/sld.py:45`, `api/analysis_runs.py:153`,
  `application/project_archive/service.py:409-434, 1080-1134` (eksport/import ZIP).

**(3) Typy nadpisań we froncie, zduplikowane i bez konsumentów.**
`ui/workspace/types.ts:377-406` (`GeometryOverrideRetentionPolicy`, `GeometryOverrideBinding`,
`GeometryOverrideImpact`) oraz **druga kopia** `ui/contracts/shared.ts:220-235`.
Konsumentów poza plikami definicji: **zero**.

**Skutki:**
1. **L1 wymaga przepisania.** Realna luka nie brzmi „brak magazynu", tylko: *„istnieją trzy
   częściowe magazyny — jeden trwały, ale związany z legacy `network_nodes` i wizardem, jeden
   z pełnym kontraktem, lecz z persystencją w słowniku procesu, i typy we froncie bez
   konsumenta — a żaden nie jest wpięty w scenę v3 z ENM"*.
2. **D-1 jest trzecim duplikatem w tym audycie** (po eksporcie DXF i lokalnym wycinku sieci).
   Wykonana jak napisana, utworzyłaby **czwartą** realizację. To dokładnie błąd
   KLASA-NIE-INSTANCJA i wprost zakazane przez ZASADĘ NR 3 („dwie ścieżki tej samej fizyki").
   Karta musi zmienić charakter z „zbuduj agregat" na „skonsoliduj trzy istniejące i wepnij
   jeden w `buildSceneV3`", z inwentarzem klasy w §0 karty.
3. **Nowy dług Zero-Debt, nienazwany w pakiecie:** `/api/study-cases/{id}/sld-overrides` to
   ŻYWY endpoint, który przyjmuje `PUT`, oddaje `200` z haszem i **gubi wszystko przy restarcie
   procesu** (a przy wielu workerach — także między żądaniami). Dla wołającego jest nieodróżnialny
   od zapisu trwałego. To fantom w rozumieniu dyrektywy właściciela nr 3, tylko odwrócony:
   nie kontrolka bez backendu, lecz backend obiecujący trwałość, której nie ma.
4. **D-8 traci połowę uzasadnienia:** „jawny porządek prezentacji pola" już istnieje jako
   `OverrideScopeV1.FIELD` + `OverrideOperationV1.REORDER_FIELD`. Zostaje wyłącznie **strona**
   (góra/dół szyny) — i tę część D-8 opisuje poprawnie (`Bay` w `enm/models.py:949-993` ma
   `bay_number`, nie ma strony; `BayPrimaryDevice.placement`/`section_side` (`:1051-1052`)
   dotyczą aparatu w polu, nie pola przy szynie).

## Punkt 1 — pozostałe luki: POTWIERDZONE

- **L5 — POTWIERDZONA dosłownie.** `application/analyses/protection/coordination/analyzer.py:545`:
  `# Compare adjacent devices (assuming ordered downstream to upstream)`, dalej
  `downstream = devices[i]` / `upstream = devices[i+1]`. Wyprowadzenie z topologii istnieje:
  `application/analyses/protection/czas_wylaczenia_galezi.py:195::znajdz_aparat_chroniacy`.
  Zawężenie karty D-3 („przepiąć, nie budować") jest trafne.
- **L6 — POTWIERDZONA dosłownie.** `grep -rn "pandapower.__version__" backend/src backend/tests`
  → **pusto**. Referencje deklarują 3.4.0 (`expected/ieee_{9,14,39}bus.json:3,4,6`), CI instaluje
  `pandapower==3.5.4` (`.github/workflows/python-tests.yml:238`), nic tego nie porównuje.

## P0-B · Punkt 3 — obalona teza przeżyła w bloku F-10

Sweep z **F-23** deklaruje: *„Sweep powtórzony — poza tekstem korekt nie ma już starej liczby"*.
**Nieprawda.** `DONOR_AUDIT_CHECKPOINT.md:152-176` (blok **F-10**) stoi **bez jakiegokolwiek
znacznika wycofania** (`grep -n "WYCOFAN\|OBALON\|CZĘŚCIOWO"` → trafienia w 7, 353, 355, 378, 558;
**żadnego przed 353**), a F-18 taki znacznik dostał. F-10 twierdzi jako stan bieżący:
- „Nawet powtórzone dla każdego węzła daje to **rząd 1-2 s, nie 171 s**" (:163),
- „dominujący koszt … **leży poza rdzeniem algebry liniowej** … **Nie zdiagnozowane.**" (:165-166),
- „wąskie gardło **nie jest udowodnione** jako matematyka solvera" (:173).

Wszystkie trzy obala **F-19** — którego własny tytuł brzmi „**F-10 i F-18 BYŁY BŁĘDNE**".
Czytelnik wchodzący w CP-2 dostaje obalone zdania bez ostrzeżenia.

**Dlaczego sweep to przepuścił — i to jest ważniejsze od samego znaleziska:** szukano
**łańcuchów znaków** („0,4 s", „~0,2 %", „niezdiagnozowana"), a F-10 niesie **tę samą tezę
innymi liczbami** (4,31 ms, 315×315, „1-2 s") i innym słowem („Nie zdiagnozowane"). To ten sam
błąd KLASA-NIE-INSTANCJA, tym razem w warstwie dokumentów.
**Naprawa:** nagłówek F-10 opatrzyć „**WYCOFANE PRZEZ F-19**" i przekreślić trzy zdania wyżej.

Poza tym punkt 3 jest czysty: wszystkie pozostałe wystąpienia obalonych liczb są albo w
`donor-raw/**` (niewiążące, to tam je obalono), albo przekreślone/oznaczone, albo stoją w
tabelach „było → jest". Prawdziwe wartości są **spójne** we wszystkich czterech dokumentach
kanonicznych (1530 / 5 na węzeł / 306 / 1,758 s ≈ 3 % / 59,14 s / ~26-32 % / ~28 %); zastrzeżenie
„59,14 s w procesie ≠ 170 866,7 ms po HTTP" powtórzone tam, gdzie trzeba.

## Punkt 4 — model statusów: spójny, ale z niepilnowaną drugą kopią

**Zgadzam się z rozstrzygnięciem.** Zweryfikowane:
- `enm/canonical_analysis.py` zapisuje wyłącznie `CREATED` (:943), `RUNNING` (:1195),
  `FINISHED` (:1100, :1201), `FAILED` (:1206); `to_execution_dict` (:537-542) odwzorowuje
  dokładnie te cztery. `PENDING` występuje **tylko** jako wartość wyjściowa HTTP.
- `VALIDATED` — jedyne trafienie to `domain/analysis_run.py:11` (`AnalysisRunStatus`, legacy R2).
  Żaden test ani zapis nie traktuje go jako stanu `CanonicalRun`. Pozostałe `"PENDING"` w testach
  (`test_execution_api.py:191`, `test_execution_domain.py:168`,
  `test_fault_scenarios_run_integration.py:193`) asertują **odpowiedź HTTP** — poprawnie.

**Defekt, którego nikt nie pilnuje:** `application/analyses/diagnoza_przebiegu.py:79-88` trzyma
**drugą kopię** mapowania `_STATUS_WYKONAWCZY` z komentarzem *„JEDNO źródło prawdy wspólne z
`CanonicalRun.to_execution_dict`"* — a to **kopia literalna**, nie wspólna referencja. Użyta przez
`.get(run.status, run.status)` (:170), czyli przy rozjeździe **nie wywala, tylko cicho przepuszcza
status domenowy do pola prezentacyjnego**. Nowy pin `test_kazdy_status_domenowy_ma_odwzorowanie_http`
sprawdza wyłącznie `to_execution_dict`. To „deklaracja bez testu" (reguła KLASA pkt 4) i „dwa
warunki, które dziś się zgadzają" (pkt 3). **Naprawa jednolinijkowa:** `diagnoza_przebiegu`
importuje mapowanie z `canonical_analysis`, a pin obejmuje oba.

## Punkt 5 — prymat ENM: projekt czysty, zderzenie z rzeczywistością nie

Sam kontrakt z §2.1 nie zagraża prymatowi ENM: klucz po `ref_id`, treść wyłącznie
`{x, y, rotation, arkusz}` i `waypoints[]`, kierunek zależności jednostronny, zapisywane tylko
wierzchołki wewnętrzne, hasz nietknięty, całość kasowalna. Rozdział trasa/połączenie utrzymany.
Zgadzam się także z korektą F-20 (odrzucenie stoi na DT-1/3.4/DT-14, nie na niemożliwości
technicznej — precedens `connection_conditions` w `hash.py:270-278` jest realny).

**Ale ryzyko jest o klasę większe, niż pakiet zakłada** — i wynika z P0-A. Istniejący trwały
magazyn **już łamie regułę, której D-1 ma pilnować**: `SldBranchSymbolORM` (`models.py:681-682`)
przechowuje `from_node_id` **i** `to_node_id` obok `branch_id`, czyli **topologię w warstwie
prezentacji**. Skoro tabela istnieje, naturalną drogą wdrożenia D-1 będzie jej rozszerzenie — i
wtedy drugie źródło prawdy topologicznej wchodzi tylnymi drzwiami, mimo poprawnego projektu na
papierze. Karta musi to nazwać wprost i albo zdjąć te dwie kolumny, albo świadomie odciąć się od
tej tabeli.

## Punkt 6 — licencje: PASS, 11/11

Klony obecne (`…/scratchpad/donor/src/`). Wszystkie SHA zgodne z §3 co do znaku, treść licencji
sprawdzona w plikach, nie w README:

| Donor | SHA w repo klonu | Plik | Werdykt |
|---|---|---|---|
| TENSA | `caca7d5` ✔ | `LICENSE` „GNU GPL Version 3, 29 June 2007"; brak „any later version" | **GPL-3.0** ✔ |
| GElectrical | `47082c7` ✔ | `LICENSE` GPL v3 + `gelectrical/**` „(at your option) any later version" | **GPL-3.0-or-later** ✔ |
| pso (Sandia) | `44fe954` ✔ | `LICENSE`: nagłówek NTESS/DE-NA0003525 **nad** pełnym GPL v3 (675 linii) | **GPL-3.0** ✔ |
| VoltWeave | `0384b23` ✔ | MIT | ✔ |
| sldeditor | `9e1bba0` ✔ | MIT | ✔ |
| xyflow `0a1f957` MIT · pandapower `fd7346f` BSD-3 · oxigrid `1f46bc6` Apache-2.0 · power-grid-model `e50f161` MPL-2.0 · powsybl-diagram `952186b` MPL-2.0 · elkjs `cc80083` EPL-2.0 | wszystkie ✔ | | ✔ |

Nagłówek Sandii bywa mylący (wygląda jak licencja własna) — audyt sklasyfikował go poprawnie.
Potwierdzam też brak `LICENSE` w MV i brak pola `license` w `pyproject.toml`/`package.json`,
czyli podstawa blokera **B-LIC** stoi.

## Punkt 7 — zakres napraw: PASS (lista w mandacie była niepełna)

`git diff 5adc958d..HEAD -- '*.py'` obejmuje **dziesięć** plików, nie osiem z mandatu. Dwa
dodatkowe — `api/reference_networks.py` i `application/reference_networks/pandapower_bridge.py`
— oraz `expected/pp_simple_four_bus.json` to **wyłącznie zmiany komentarzy/komunikatów** będące
konsekwencją kasacji `regenerate_expected_values.py`; bez nich zostałyby wiszące instrukcje
kierujące do nieistniejącego skryptu. To **wymagane** domknięcie, nie rozlanie zakresu.
Sprawdziłem osobno: w `pp_simple_four_bus.json` zmieniono **tylko** `source_note`; wszystkie
wartości liczbowe (`v_pu`, `angle_deg`, `rtol`) są nietknięte — dane normatywne nie ruszone.

Ocena poszczególnych zmian: `execute_run` — konieczna i minimalna (usuwa TOCTOU, warunek wejścia
przeniesiony w całości do repozytorium, brak drugiego predykatu). `claim_for_execution` /
`fail_orphaned_running` — minimalne, `UPDATE … WHERE … NOT IN` + `rowcount`, bez nadmiarowych
abstrakcji. `api/main.py` — 8 linii, wymagane, bo bez zamiatania atomowe przejęcie zostawiałoby
osierocone biegi w `RUNNING` na zawsze. Guard i kasacja skryptu — uzasadnione (Z6).
**Nie znalazłem ani jednej zmiany, która wykracza poza potrzebę.**

Drobiazgi (nie blokujące): literówka `melodwal` → `meldowal`
(`scripts/solver_output_drift_guard.py:82`); polskie zdanie wstawione do angielskiego
`source_note` w pliku JSON.

---

# Audyt adwersaryjny NOWYCH testów i kodu

Uruchomione: `poetry run pytest tests/enm/test_przejecie_biegu_atomowe.py
tests/enm/test_polityka_hash_kolekcji.py -q` → **14 passed, 1 skipped**.
Z `MV_TEST_POSTGRES_URL=postgresql+psycopg://postgres@127.0.0.1:5432/mvtest` → **13 passed**
(pominięty test faktycznie się uruchamia). Regresja szersza
(`tests/enm/ tests/test_execution_api.py tests/test_execution_domain.py
tests/infrastructure/persistence/ tests/api/test_wspolbieznosc_biegow.py`) → **2098 passed,
1 skipped**. Nie znalazłem testu przechodzącego z powodu obejścia realnej ścieżki.

## Co się broni

- **Test postgresowy pomija, a nie udaje zielonego — sprawdzone dwustronnie.** Z błędnym URL
  (`…:5433/nieistnieje`) kończy się **FAILED** (`psycopg … OperationalError`), więc nie ma cichego
  odpadnięcia do SQLite. Po przebiegu wiersze **są w Postgresie**: bezpośrednie zapytanie do
  `mvtest` daje `[('FAILED',1), ('FINISHED',6), ('RUNNING',3)]`. Dowód F-25 jest realny.
- **Wyścig testowany realnie.** `threading.Barrier` + 8 wątków + sonda śpiąca 50 ms; baza plikowa
  zamiast `mode=memory&cache=shared` z uzasadnieniem różnicy modelu blokad
  (`SQLITE_LOCKED` vs `SQLITE_BUSY`) — to jest właściwa diagnoza, nie obejście.
- **`test_kazdy_status_domenowy_ma_odwzorowanie_http` czyta REALNE ŹRÓDŁO**, nie listę wpisaną
  ręcznie: `inspect.getsource(ca)` + regeksy `run\.status = "…"` / `status="…",`, przeciw
  `inspect.getsource(ca.CanonicalRun.to_execution_dict)`, z asercją „zbiór niepusty" chroniącą
  przed utratą kontaktu z kodem. Zgodne z opisem w CP-7.
- **Poprawka GUID jest poprawna dla obu dialektów i niczego nie maskuje.**
  `models.py:33-38` ustawia dla PostgreSQL `PG_UUID(as_uuid=True)` (sterownik oddaje `UUID`),
  dla reszty `String(36)` (oddaje `str`). Nowa gałąź `isinstance(value, UUID) → return value`
  obsługuje pierwszy przypadek, `UUID(value)` drugi. Wejście nieoczekiwane (np. `bytes`, `int`)
  nadal **podnosi wyjątek**, nie jest cicho połykane — brak `try/except`, brak fallbacku na `None`.
  `process_bind_param` zwraca `str` w obie strony i przechodzi na Postgresie (dowiedzione
  przebiegiem). **Naprawa merytorycznie bez zarzutu.**

## Zarzuty — trzy, wszystkie potwierdzone iniekcją

### Z-1 (P1). Pin jednego procesu **nie łapie kształtu, który sam deklaruje jako (a)**
`test_zamiatanie_stoi_na_zalozeniu_jednego_procesu_api` obiecuje w docstringu pokrycie trzech
kształtów wieloprocesowości, w tym „(a) wiele workerów w jednym kontenerze (`uvicorn --workers`,
`gunicorn`)". `--workers`/`gunicorn` sprawdzane są **wyłącznie w `backend/Dockerfile`**, a
`docker-compose.yml` — który test i tak otwiera — przeszukiwany jest tylko pod `replicas:`,
`scale:` i `container_name`.

Iniekcje wykonane:

| Iniekcja | Oczekiwane | Faktyczne |
|---|---|---|
| `deploy: replicas: 3` w `docker-compose.yml` | FAILED | **FAILED** ✔ |
| nowa `list[...]` w `EnergyNetworkModel` | FAILED | **FAILED** ✔ |
| `command: uvicorn … --workers 4` w `docker-compose.yml` | FAILED | **PASSED** ✘ |

W compose `command:` **nadpisuje** `CMD` z Dockerfile'a (dziś
`Dockerfile:41` → `uvicorn … --reload`), więc to jest **realna, jednolinijkowa droga** do
uruchomienia wielu workerów bez zapalenia pinu — a wtedy globalny
`UPDATE … WHERE status='RUNNING'` przy starcie drugiego workera **wywala bieg trwający
w pierwszym** (okno liczone w minutach). **Naprawa:** dołożyć do pętli po `docker-compose.yml`
wzorce `--workers` i `gunicorn`, tak jak są sprawdzane w Dockerfile.

### Z-2 (P2). `test_polityka_hash_kolekcji` **over-claima**: zamyka `list`, nie „kolekcje"
Docstring i karta D-11 twierdzą, że zbiór wyjątków jest ZAMKNIĘTY i „każda **nowa** kolekcja poza
`_ELEMENT_KEYS` wywala test". Wykrywanie stoi na heurystyce łańcuchowej
`"list" in str(pole.annotation).lower()`. Iniekcja `testowe_krotki: tuple[Bus, ...] = ()` do
`EnergyNetworkModel` → **2 passed** (test milczy), choć `model_dump()` zserializuje krotkę do
listy i jej `id` wejdą do hasza dokładnie tak jak w `line_runs`. Tak samo uciekną
`Sequence[...]`, `frozenset[...]` i alias typu. Liczby z F-28 potwierdzam pomiarem (16 kolekcji
listowych / 14 w `_ELEMENT_KEYS` / poza polityką `connection_nodes`, `line_runs` / 0 wpisów
martwych) — zarzut dotyczy **zasięgu pinu, nie liczb**. To ta sama pomyłka co wyżej: iniekcję
zrobiono na instancji (`list`), nie na klasie. **Naprawa:** sprawdzać `get_origin`/`get_args`
adnotacji zamiast `str(...)`.

### Z-3 (P1). Dialekt produkcyjny **nadal nie ma pokrycia w CI** — klasa defektu F-26 otwarta
`grep -rn "MV_TEST_POSTGRES_URL" .github/ mv-design-pro/` → **pusto**. Żaden workflow nie ustawia
tej zmiennej, a `tests/conftest.py:111-119` wymusza SQLite. Skutek: jedyny test dotykający
PostgreSQL jest w CI **zawsze pomijany**, więc naprawiony właśnie defekt (`GUID` wywalający
`AttributeError` przy **każdym** odczycie na Postgresie) **wróciłby niezauważony**. F-26 sam
diagnozuje przyczynę — „niewidoczne w testach, bo `conftest.py` wymusza SQLite" — i naprawia
instancję, zostawiając przyczynę nietkniętą. To jest ta sama klasa, przed którą ostrzega
konstytucja. **Naprawa:** usługa `postgres:16` w `python-tests.yml` + `MV_TEST_POSTGRES_URL`
w środowisku joba (compose już definiuje taki serwis, więc koszt jest mały).

### Drobne (bez rangi)
- Test postgresowy **nie sprząta po sobie** — zostawione wiersze widoczne w `mvtest`
  (`RUNNING: 3` z wcześniejszych przebiegów). Dziś nieszkodliwe (każdy przebieg ma świeży
  `uuid4`), ale gdyby `test_osierocony_bieg_w_running_jest_zamykany_przy_starcie`
  (asercja `zamkniete == 1`) objęto Postgresem, byłby czerwony przez cudze śmieci.
- `test_stany_konczace_sa_nieprzejmowalne` i `test_kazdy_status_domenowy_ma_odwzorowanie_http`
  wykrywają wyłącznie **literały** `run.status = "X"` w module `ca`. Status zapisany stałą
  (`run.status = STATUS_CANCELLED`) albo — co bardziej prawdopodobne — **z poziomu repozytorium**
  (wzorzec ustanowiony właśnie przez `claim_for_execution`/`fail_orphaned_running`) ucieknie obu
  pinom. Karta **D-4** doda dokładnie taki nowy stan końcowy; warto rozszerzyć regeks o
  `canonical_run_repository.py`, zanim D-4 ruszy.

---

## Czego NIE weryfikowałem

- Nie powtarzałem audytu donorów ani przeglądu repozytoriów donorów (poza licencjami i SHA).
- Nie weryfikowałem pomiarów profilu (1530 / 59,14 s / ~26-32 % / ~28 %) własnym `cProfile` —
  sprawdziłem wyłącznie ich **spójność między dokumentami** i brak obalonych wariantów.
- Nie uruchamiałem pełnej regresji backendu ani frontendu (vitest, type-check, guardy) —
  zakres skupiony na plikach tej sesji plus otoczenie.
- Nie oceniałem merytorycznie B-01-RI ani zawartości `donor-raw/**`.
