# Meldunek karty SZYBKIE-TESTY — przyspieszenie testów bez utraty determinizmu

Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-szybkie-testy`, baza `615f3b24` (partia 6),
drzewo wynikowe kodu `73629deb` (po scaleniu z PARTIA-6-BACKEND `65b00094` w `01b6cb78`
i po wydzieleniu kroku budżetów czasu procesora). Maszyna pomiarowa: kontener 4 vCPU, 15 GB RAM, bez obcego
obciążenia (load average w logach biegów); pomiary przed i po w tych samych warunkach, z
`OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1` i prywatnym `--basetemp` poza drzewem.

## 1. Wynik i dowód

| Bieg | Przed | Po | Przyspieszenie | Wynik równoległy = sekwencyjny |
|---|---|---|---|---|
| Pełny backend `-m "not pandapower and not andes"` | 5 015 s (1 proces, host A, 2026-09-30) · 5 873 s (1 proces, host B, 2026-10-15, drzewo `2000e4d5`) | `-n 4 --dist loadfile`: 1 645 s i 1 591 s (host B, `2000e4d5`) · 1 352 s (host A) | 3,57–3,69× (ten sam host) | TAK — 27 064 × passed w biegu sekwencyjnym i w obu równoległych, 0 różnic identyfikatorów i statusów (junit) |
| Pełny vitest (887 plików) | 1 753,9 s (`--no-file-parallelism`, pula wątków, czyste drzewo bazy) | 682,5 s i 753,9 s (pula procesów `forks`) | 2,3–2,6× | TAK — per plik i per test identycznie (jedyna różnica: nowy plik `pulaTestow.test.ts`, 2 passed) |
| `scripts/guardy_z_ci.py` | 854,8 s (runner bazy, sekwencyjnie) | 309,3 s i 318,7 s (4 procesy, samotesty `-n 4`) | 2,7× | samotesty: 3 332 → 3 352 passed (nowe samotesty karty) |
| Pełne e2e (realny backend, `workers: 1`) | 1 925 s jeden bieg (511 przypadków) | 4 shardy LPT: 472,7 / 418,6 / 397,6 / 417,2 s (host A); po strażniku drzewa 576–595 s (host B, `2dc8215c`) | najwolniejszy shard 3,2–4,1× krótszy | TAK — suma shardów = bieg pełny: 511 przypadków, rozłączne, 0 różnic statusu; po `2dc8215c` drzewo czyste |

`nproc` i `uptime` są w nagłówku i stopce każdego logu biegu. Uwaga pomiarowa: `nproc` pod
`OMP_NUM_THREADS=1` zwraca 1 — liczba rdzeni zapisywana jest przez `nproc --all`.

**CI (GitHub Actions, ubuntu-latest 4 vCPU)** — przed: przebieg na `a2ab18fc` (2026-09-30),
po: przebiegi na `fcf59e0b` i `2000e4d5`:

| Krok / job | Przed | Po |
|---|---|---|
| `Run pytest` | 68,5 min | 37,5 min (`fcf59e0b`), 38,8 min (`2000e4d5`) — 27 064 passed |
| Samotesty strażników (`pytest -n auto ../scripts`) | 6,8 min | 3,3 min |
| Job `pytest` (ścieżka krytyczna workflowu Python) | 79 min | 45 min |
| vitest w `frontend-checks` | 24,4 min (12 shardów kolejno) | 14,1 min (jeden bieg, pula procesów) |
| Job `frontend` | 27,7 min | 16,4 min |
| E2E full | 1 job, krok 25,1 min | 4 joby równolegle, kroki 7,6–9,6 min (joby 10,0–11,4 min) |

Zajętość runnerów (trzy joby testowe razem): przed 79 + 27,7 + 25,8 ≈ 132,5 runner-min, po
45 + 16,4 + 41,1 ≈ 102,5 runner-min. E2E zużywa więcej runner-minut (4 × setup ≈ +15 min), ale
skraca ścieżkę krytyczną o ~15 min; backend i vitest oszczędzają ~45 runner-min.

`Python tests` na `2000e4d5` — **zielony** (pytest, samotesty, lint, mutacje, ANDES, pandapower,
PostgreSQL). Naprawy czerwieni bazy należą do PARTIA-6-BACKEND (§5 pkt 1); na polecenie
właściciela gałąź karty jest z nią **scalona** (`01b6cb78`, fuzja bez konfliktów). Dowody na
drzewie scalonym: `guardy_z_ci.py` — KOMPLET ZIELONY (343 s, w tym `tsconfig_gate_guard` 80/80);
pełny backend `-n 4 --dist loadfile` — **27 078 passed, 0 failed** (1 860 s); vitest — wyłącznie
znana czerwień bazy z §4. Po `73629deb` ponownie `guardy_z_ci.py` — 3 352 samotestów passed,
KOMPLET ZIELONY. Pozostałe czerwone joby CI to joby czerwone także na CI bazy `615f3b24`
(sprawdzone przez check-runs bazy), z identycznym zbiorem czerwieni — patrz §4.

## 2. Co zrobiono (commity kodu)

- `3725a08d` — migawka WIP `061bbed6` przeniesiona na bazę bez konfliktów: `pytest-xdist` w dev,
  vitest `pool: 'forks'` (pomocnik czasu procesora odmawia pomiaru poza wątkiem głównym procesu,
  `pulaTestow.test.ts` przypina pulę), równoległy runner `guardy_z_ci.py` z samotestami,
  workflowy CI, CLAUDE.md.
- `91b51007` — **izolacja procesów pytest pod xdist** (inwentarz §3) + jeden wątek BLAS na worker.
- `43ed0301`, `0a5f7a88` — `scripts/e2e_shardy.py` (LPT wg `frontend/e2e/czasy_specow.json`),
  samotest, wpięcie w `frontend-e2e-full.yml`; zamknięta lista `NARZEDZIA_CI` w `guardy_z_ci.py`
  (inaczej runner uruchamiałby narzędzie kroku jako strażnika z argumentami `${{ … }}`).
- `fcf59e0b` — polecenia i liczby z pomiaru w CLAUDE.md, STAN_REPO §7 G, regule biegów
  `KARTY_OTWARTE_2026-09.md`, definicjach wykonawców `.claude/agents/worker*.md`.
- `4cd7d6e7`, `2dc8215c`, `64971f48`, `65584f80` — rozstrzygnięcia z §5.
- `2000e4d5` — poprawka mojego testu wątków BLAS po czerwieni CI: w workerze załadowane są DWIE
  biblioteki OpenBLAS (numpy i scipy), test sprawdza teraz każdą.
- `01b6cb78` — scalenie z PARTIA-6-BACKEND (`65b00094`), polecenie właściciela.
- `73629deb` — testy budżetu czasu procesora w osobnym kroku sekwencyjnym vitest (§5 pkt 6).

Dobór `-n` i `--dist` z pomiaru: suma czasów testów 4 709 s w 789 plikach, najdłuższy plik
561,5 s (`walidacja_fizyczna/test_bramki.py`) < 1/4 sumy, więc LPT po plikach daje teoretycznie
ten sam makespan co po testach (1 177 s przy n = 4). `--dist loadfile` zachowuje fikstury modułowe
(TestClient z lifespanem) i łańcuchy kroków w jednym pliku (`e2e/test_nn_full_chain.py`) — bez
`xdist_group` i bez wykluczeń. `-n 4` = liczba rdzeni (CI: `-n auto`).

## 3. Inwentarz defektów izolacji (klasa: stan współdzielony przez procesy)

Pomiar przed naprawą: `-n 4 --dist loadfile` — 22 czerwone testy, których bieg jednoprocesowy nie
ma (`e2e/test_nn_full_chain.py` ×15, `api/test_station_templates_apply_api.py` ×2,
`application/test_fikstury_enm_generowane.py` ×2, `enm/test_short_circuit_migracja_e3_golden.py`,
`api/test_solver_input_audit2_integration.py`, `test_fault_scenarios_api.py`); w logu
`No such file or directory: '/tmp/enm-store-pytest-…/<klucz>.json'`. Narzędzia: grep
`os.getenv` w `backend/src` + rejestr zapisów hakiem audytu PEP 578 w biegu równoległym
(68 460 operacji zapisu poza `--basetemp`; wszystkie poza magazynami — nazwy losowe) + kontrola
plików w drzewie po biegu (SQLite otwiera plik z biblioteki C, hak go nie widzi).

| Miejsce (źródło) | Mechanizm współdzielenia | Naprawa |
|---|---|---|
| `tests/conftest.py` (dawne l. 26–49) + `enm/store.py:144`, `enm/dziennik_zmian.py:154`, `enm/rewizje.py:84`, `enm/scenariusze.py:1289` (`ENM_STORE_DIR`) | kontroler xdist importuje `conftest.py` i eksportuje katalog; workery dziedziczą zmienną i brały ją za „wskazaną z zewnątrz” → jeden magazyn ENM dla 4 procesów, `reset_enm_store()` jednego kasował model drugiego | znacznik `<ZMIENNA>_PYTEST_PID`: proces widzący obcy PID tworzy własny katalog; wartość bez znacznika (spoza pytest) honorowana |
| `application/station_templates/user_store.py:44` (`STATION_USER_TEMPLATES_DIR`) | jak wyżej | jak wyżej |
| `api/main.py:79`, `infrastructure/persistence/repositories/canonical_run_repository.py:137` (`DATABASE_URL`, domyślnie `./mv_design_pro.db`) | fikstury MODUŁOWE z lifespanem API (`test_fault_scenarios_api.py`, `test_fault_scenarios_run_integration.py`, `test_batch_execution.py`, `enm/test_brak_katalogu_aparatu_nn_os_analiz.py`, `e2e/test_nn_full_chain.py`) startują przed fikstura per test i pisały do `backend/mv_design_pro.db` W DRZEWIE repo — wspólny plik workerów, trwały między biegami | baza sesji w katalogu procesu; per test nadal `_izolowana_baza_przebiegow`; po biegach pliku w drzewie brak (sprawdzone) |
| `api/cloud_backup.py:65` (`CLOUD_BACKUP_BUCKET`, domyślnie `/tmp/mv-design-pro-backups`) | katalog wspólny dla procesów i biegów na maszynie | katalog na proces |
| `api/celery_app.py:7` (`REDIS_URL`) | poza klasą — testy nie łączą się z Redisem | bez zmiany |
| wątki OpenBLAS (numpy i scipy) | 4 workery × 4 wątki na 4 rdzeniach; wynik czasu i kolejność sumowania zależne od obciążenia | `setdefault(OPENBLAS_NUM_THREADS/OMP_NUM_THREADS, "1")` w workerze przed importem numpy |

Testy (`backend/tests/ci/test_izolacja_procesow_testowych.py`): iloczyn {4 zmienne} × {brak,
z zewnątrz, obcy PID, własny PID}; wartość sesji bieżącego procesu poza drzewem repo; liczba wątków
KAŻDEJ załadowanej biblioteki OpenBLAS odczytana z biblioteki (`/proc/self/maps` + symbol
`*openblas_get_num_threads*`). Iniekcja: bez bloku wątków — 1 failed / 21.

Przypadek NIE będący defektem izolacji: `ci/test_fikstura_dialektu_produkcyjnego.py` czerwony w
jednym biegu, bo edytowałem `conftest.py` w trakcie biegu (`inspect.getsource` czytał nowy plik
z liniami starego modułu); osobno 12 passed, w biegach końcowych zielony.

## 4. Czerwień bazy (nie tej karty) — ten sam status w obu trybach

- vitest: `menuBudowyNaKanwie` ×2, `pathInvariants` ×1 (lokalnie i w CI; po scaleniu krok
  główny: 880 plików, 3 failed / 12 790 passed, 789 s).
- vitest, testy budżetu czasu procesora (8 plików, 193 testy): **niestabilne także w biegu
  całkowicie sekwencyjnym** — po scaleniu w biegu z pulą procesów `buildScene.p1Recenzja`
  („H ~500 stacji, 3×LOD w budżecie 30 000 ms”) wyszedł ponad próg; w trzech biegach samego
  kroku sekwencyjnego `--mode budzety` po 1, 2 i 1 przekroczeniu (30 252–33 730 ms przy progu
  30 000 ms; jeden test ilorazowy 3,007 przy progu 3). Budżety stoją na granicy możliwości
  maszyny 4 vCPU niezależnie od równoległości — to defekt budżetów/wydajności sceny SLD (obszar
  kart SLD), nie izolacji testów. Progu nie podniosłem (zakaz karty); szczegóły §5 pkt 6.
- akceptacja SLD v3 (`npm run accept:sld-v3`): `menu_chain_probe` LOD 0 „stacji=0” — czerwona
  także na czystym drzewie `615f3b24` (sprawdzone lokalnie) i na CI bazy.
- e2e: 8 przypadków (`sld-pa-powerflow-tor` N-2/N-3, `tr2w-bez-pola` ×3, scena „koordynacja”
  ×3) — identycznie w biegu pełnym, w shardach lokalnie i w shardach CI.

## 5. Rozstrzygnięcia architekta (2026-10-15)

1. **Naprawy czerwieni bazy oddane karcie PARTIA-6-BACKEND** (`65b00094`, właściciel obszaru,
   naprawa szersza — cała klasa martwych zapasów kodu odmowy). Commit `4cd7d6e7` przywraca cztery
   pliki do stanu `615f3b24`; zostaje tylko poprawka tej karty `main([])` w
   `backend/tests/ci/test_guardy_z_ci.py`. Dowód: próbna fuzja z gałęzią PARTIA-6-BACKEND bez
   konfliktów; na drzewie scalonym `tsconfig_gate_guard` 80/80 OK, testy celowane backendu
   234 passed pod `-n 4`, `szynyStacjiKonsumenci.test.ts` 24 passed. Sama ta gałąź ma w tych
   miejscach stan bazy (`guardy_z_ci.py`: jedyna czerwień `tsconfig_gate_guard` 81 > 80 z pliku
   bazy, moje nowe pliki e2e dokładają 0 błędów typów).
2. **Bieg e2e nie zmienia drzewa repozytorium** (`2dc8215c`): jedno źródło katalogu zrzutów
   `e2e/katalogZrzutow.ts` wpięte we wszystkie 54 deklaracje; zrzuty do `docs/` wyłącznie przy
   `ZRZUTY_DO_DOKUMENTACJI=1`; strażnik klasy w `globalTeardown` (`e2e/straznikDrzewa.ts`) oblewa
   bieg, który zmienił drzewo jakąkolwiek drogą. Dowody: iniekcja — RC=1 z nazwanymi ścieżkami;
   pełne e2e w 4 shardach na `2dc8215c` — 511 dotychczasowych przypadków z tym samym statusem,
   8 nowych zielonych, zero zgłoszeń strażnika, `git status` po biegu pusty (wcześniej ~220
   nadpisanych PNG).
3. **Liczba procesów vitest zostaje domyślna** (`65584f80`): 4 procesy dały 702,6 s wobec
   777,2 s, ale w biegu z konfiguracji dwa testy budżetu czasu procesora wyszły ponad próg
   (30 675 / 30 654 ms przy 30 000 ms) — wynik zależny od obciążenia, wbrew karcie.
4. **Joby ANDES, pandapower i mutacji zostają jednoprocesowe** — nie leżą na ścieżce krytycznej
   (10–18 min wobec 45 min joba pytest); xdist w izolowanych venv bez dowodu równości byłby
   ryzykiem bez zysku czasu workflowu.
5. **Committer `radek.izk@gmail.com` w `3725a08d` i `0d8a80c5` zostaje** — zakaz przepisywania
   historii ma pierwszeństwo.
6. **Testy budżetu czasu procesora w osobnym kroku sekwencyjnym** (`73629deb`). Zbiór plików
   wyprowadzany z JEDNEGO źródła — `plikiBudzetuCzasu()` w `vite.config.ts` (każdy plik testów
   importujący `src/test/czasProcesora.ts`); krok główny je wyklucza, krok `vitest run --mode
   budzety` uruchamia tylko je, plik po pliku (`fileParallelism: false`). Pomocnik odmawia
   pomiaru poza tym trybem i poza wątkiem głównym procesu, więc nowy test budżetu nie może
   trafić do puli równoległej po cichu. `npm test`/`test:ci` uruchamiają oba kroki i zwracają
   błąd, gdy zawiedzie którykolwiek; CI `frontend-checks` ma osobny krok. Przypięte testem
   `src/test/__tests__/plikiBudzetuCzasu.test.ts` (inwentarz 8 plików, odmowa w kroku głównym,
   ta sama stała trybu w konfiguracji i pomocniku). Wynik: krok sekwencyjny ~253 s; niestabilność
   progu nadal występuje (§4) — rozdzielenie usuwa wpływ równoległości, ale nie naprawia budżetów
   ustawionych na granicy wydajności maszyny; to zostaje jawnie nazwane, nie zamaskowane.

## 6. Ograniczenia pomiarów (uczciwie)

- Pomiary 2026-09-30 i 2026-10-15 pochodzą z dwóch hostów 4 vCPU (kontener uruchamiany ponownie);
  każde porównanie przed/po w tabelach jest z tego samego hosta i tego samego dnia.
- Krok budżetów czasu procesora jest niestabilny także sekwencyjnie (§4, §5 pkt 6) — porównania
  równoległy = sekwencyjny w §1 dotyczą zbioru poza tym krokiem i biegów, w których budżety
  przeszły.
- CI: joby czekają w kolejce runnerów konta, więc czas całego przebiegu workflowu zależy od
  kolejki; porównuję czasy kroków i jobów.
