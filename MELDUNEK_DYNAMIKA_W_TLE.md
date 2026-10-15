# MELDUNEK — karta DYNAMIKA-W-TLE (bieg `DYNAMIKA_RMS` i każdy bieg kanoniczny poza żądaniem HTTP)

Gałąź wynikowa: `claude/mv-design-pro-twin-audit-u4lhy0-karta-dynamika-w-tle` (baza `f3c435b6`).
Czubek kodu przed tym meldunkiem: `f778591f`. Integrator pomija ten plik przy scalaniu.

## 1. Wynik

Karta wykonana w pełnym zakresie decyzji O-57 pkt 2 (plan A/B, wiersz O-57) i szkicu §0
(`docs/plan/KARTY_OTWARTE_2026-09.md`, sekcja „DYNAMIKA-W-TLE”):

1. Bieg kanoniczny (rozpływ, rozpływ niesymetryczny, zwarcie, stan fazowy, bieg czasowy
   `dynamika_rms`, zabezpieczenia, V12.6, seria biegów) **nie wykonuje się w żądaniu HTTP**.
   `POST …/execute` zleca bieg wykonawcy w procesie API (`backend/src/application/execution/wykonawca.py`:
   jeden wątek roboczy, jeden ciężki bieg naraz, kolejka FIFO), odpowiada **202** ze stanem
   `QUEUED` (albo stanem bieżącym, gdy bieg był już zlecony lub zakończony), a klient odpytuje
   `GET /api/execution/runs/{id}` do `DONE`/`FAILED`/`CANCELLED` — tak jak dotąd klient E-32.
2. **Stan biegu utrwalony w rejestrze** `canonical_runs`: `CREATED → QUEUED → RUNNING →
   FINISHED | FAILED | CANCELLED` (`domain/execution.py`: `StanBiegu`, `RunStatus`,
   `STANY_KONCOWE_BIEGU`, `STANY_W_TOKU_BIEGU`; `enm/canonical_analysis.py::STATUS_WYKONAWCZY`).
   Przejęcie do kolejki (`claim_for_queue`, CREATED → QUEUED) i do wykonania
   (`claim_for_execution`, CREATED/QUEUED → RUNNING) są atomowe (jeden `UPDATE` z warunkiem);
   drugi `POST …/execute` na tym samym biegu nie zleca nic i oddaje stan bieżący. Seria biegów
   (`run_batches`) ma te same stany i to samo atomowe przejęcie (`RunBatchRepository.claim`) —
   dawny odczyt statusu + osobny zapis RUNNING był TOCTOU tej samej klasy.
3. **Postęp** (`PostepBiegu`: wykonane / razem / jednostka / krok / ułamek) mierzony w punktach
   przerwania i oddawany w polu `postep` kontraktu biegu: bieg czasowy — czas symulacji
   wobec horyzontu po każdym przyjętym kroku całkowania; zwarcie — punkty zwarcia; seria —
   pozycje. Postęp żyje w pamięci wykonawcy (zapis po każdym z 5 000 kroków byłby kosztem
   biegu; po restarcie procesu bieg jest osierocony, więc postęp nie ma znaczenia).
4. **Anulowanie**: `POST /api/execution/runs/{id}/cancel`, `POST /api/execution/batches/{id}/cancel`.
   Bieg w kolejce (albo CREATED) — natychmiast `CANCELLED` z wyjaśnieniem
   (`POWOD_ANULOWANIA_PRZED_STARTEM`, atomowe `cancel_before_start`). Bieg w toku — flaga
   sprawdzana w punkcie przerwania; bieg czasowy przerywany **między krokami całkowania** przez
   nadzorcę rdzenia (`network_model/solvers/dynamika/przerwanie.py`, pole
   `SilnikDynamiki.nadzorca` — hak addytywny, nadzorca nie widzi stanów ani napięć), zwarcie —
   między punktami zwarcia, seria — między pozycjami. Stan `CANCELLED` niesie wyjaśnienie z chwilą
   `t` i liczbą kroków; **wynik częściowy nie istnieje** (`raw_result` puste, szeregi czasowe
   niezapisane, `GET …/results` → 409, `…/results/dynamika` → 404). Bieg w toku bez punktów
   przerwania (rozpływ NR w rdzeniu FROZEN, stan fazowy, zabezpieczenia, V12.6) odmawia
   anulowania **nazwanym powodem** (409) — nie udaje, że przerwał.
5. **Restart procesu**: `lifespan` API zamyka biegi i serie osierocone w `QUEUED`/`RUNNING` jako
   `FAILED` z przyczyną „restart procesu API” (kolejka nie jest trwała i tego nie udaje).
6. **Determinizm**: bieg w tle (z nadzorcą postępu w rdzeniu) daje wynik `resultset_dynamic_v2`
   i szeregi czasowe **bit w bit** równe biegowi synchronicznemu `execute_run` bez kontekstu —
   przypięte testem (`tests/api/test_wykonawca_biegow.py::test_bieg_w_tle_daje_wynik_bit_w_bit_rowny_biegowi_synchronicznemu`;
   jedyne wyłączone pola to tożsamość rekordu `run_id`/`run_ref`/`proof_pack_ref`/`result_hash`
   i pomiar zegara `czas_obliczen_s`). Rdzeń dynamiki i kontrakty FROZEN — zero zmian liczbowych
   (`solvers/dynamika/silnik.py`: dwie linie wywołania nadzorcy po `kroki += 1`).
7. **Front**: ekran E-32 pokazuje stan kolejki, pasek postępu (`role="progressbar"`,
   `aria-valuenow`, ułamek w `data-ulamek`, opis „x z y s symulacji”) i przycisk **„Anuluj bieg”**
   (natywny klik); stan `CANCELLED` z wyjaśnieniem backendu, bez wyniku. Każdy klient `execute`
   (`ui2/spaces/obliczenia`, legacy `runStore`, OLTC, auto-bieg OZE, audyt 2 stacji, serie,
   V12.6, SSCI, przycisk zabezpieczeń) odpytuje do stanu końcowego bez limitu prób (dawny limit
   24 × 750 ms = 18 s zostawiał projektanta bez wyniku przy biegu zwarciowym sieci 50 stacji).
   Przestrzeń „Obliczenia” i panel serii mają przyciski „Anuluj”.
8. **Celery / Redis / MongoDB skasowane** (0 zadań, 0 konsumentów — pomiar poniżej) z bramką
   wskrzeszenia `check_dynamika_w_tle_queue_resurrection` (`scripts/legacy_public_path_guard.py`:
   moduł, import AST, zależność `pyproject`, usługa compose; testy iniekcji w
   `scripts/test_legacy_public_path_guard.py`). `docker-compose.yml`: 3 usługi.
9. **PERF-DYN-0** wykonany (§3). Polityka wątków BLAS obrazu Dockera i compose: `OPENBLAS_NUM_THREADS=1`,
   `OMP_NUM_THREADS=1`, `MKL_NUM_THREADS=1` — z pomiaru, nie z założenia.

## 2. Dowody (bramki na czubku `f778591f`, `OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1`, host 4 CPU)

| Bramka | Wynik | RC |
|---|---|---|
| Pełna regresja backendu `pytest -m "not pandapower and not andes"` | 10 failed, 27018 passed, 37 deselected, 8 warnings, 6 errors (1:18:29); czerwone pliki: `tests/domain/test_rejestr_kodow_bram_katalogowych.py`, `tests/enm/migrations/test_nn_field_specs_promocja_aparat.py`, `tests/enm/test_nazwy_jedno_zrodlo.py`, `tests/test_protection_settings_w3c2_identity.py` — patrz czerwień bazy niżej | 1 |
| Pełny vitest `--no-file-parallelism` | pliki: 1 failed | 887 passed (888); testy: 2 failed | 13012 passed | 14 todo (13028) (30.5 min); czerwone: `src/ui/sld/v3/canvas/__tests__/menuBudowyNaKanwie.test.tsx` (2/24) — bieg na `53c01359` (od niego do czubka po stronie frontu zmienił się wyłącznie `harness-fixtures/generated/dynamika_scena_wyniki.json`; trzy pliki vitest czytające tę fixturę: 50 passed osobno); pierwszy pełny bieg (na `259bcba7`): 886/888 plików, 13 011 passed, 3 failed = 2 × `menuBudowyNaKanwie` (czerwień bazy) + 1 × `study-cases/__tests__/types.test.ts` (kolory stanów — naprawione w `53c01359`) | 1 |
| `npm run type-check` | zielony (w łańcuchu strażników na `17b7a221`; od niego do czubka zmieniły się tylko dwa PNG i dwa wiersze rejestrów) | 0 |
| `npm run lint` | zielony (w łańcuchu strażników na `17b7a221`) | 0 |
| `python ../scripts/guardy_z_ci.py` (z `backend/`) | 113 pozycji zielonych, testy własne strażników: 3386 passed (7.3 min); czerwone: `tsconfig_gate_guard` (bieg na `17b7a221`; różnica do czubka `f778591f`: dwa zrzuty PNG E-32, wiersz rejestru kart i wiersz rejestru planu A/B — `docs_guard` RC=0 po tych zmianach) | 1 |
| e2e `dynamika-rms-flow.spec.ts` na realnym backendzie (4 testy, w tym pasek postępu rośnie → wynik; „Anuluj bieg”) | 4 passed w biegu 19 speców niżej (wcześniej osobno na `cb338977`: 4 passed, 1,3 min) | 0 |
| e2e specy z przepisanym `execute` na realnym backendzie (19 speców) | 48 passed (7,1 min) — bieg po naprawie klasy `results/index` (commit `5fa571fa`, §5); pierwszy bieg 10 speców na `259bcba7`: 30 passed, 2 failed (`industrial-template-mass-flow`: `trace` 409 przed końcem biegu; `porownanie-zwarc-delty`: bieg zabezpieczeń na biegu SC w stanie RUNNING) — obie czerwienie z tej samej klasy, naprawione u źródła | 0 |
| Testy wykonawcy `tests/api/test_wykonawca_biegow.py` (iloczyn cech) | 14 passed | 0 |

**Czerwień bazy** (zmierzona na `f3c435b6` w osobnym drzewie `/home/user/baza`, ta sama komenda):
pełna regresja backendu — 16 czerwonych = dokładnie lista partii 6 z karty, NIE naprawiane tu:
`tests/domain/test_rejestr_kodow_bram_katalogowych.py` (1), `tests/enm/test_nazwy_jedno_zrodlo.py` (1),
`tests/enm/migrations/test_nn_field_specs_promocja_aparat.py` (8), `tests/test_protection_settings_w3c2_identity.py`
(6 błędów fikstury w płytkim klonie); `tsconfig_gate_guard` 81 > 80 (zmierzone identycznie na bazie i na czubku).
Czerwień bazy wykryta dodatkowo (poza listą karty), zmierzona na `f3c435b6` tą samą komendą, identyczna:
pełny vitest — `src/ui/sld/v3/canvas/__tests__/menuBudowyNaKanwie.test.tsx` 2/24 (S9-5 B: „stacja na kanwie
prowadzi ciąg dalej” — pozycja `continue-trunk` nieaktywna; „pokrycie łańcucha ≥ 15 stacji” — 0 stacji z wejściem
budowy); ostatnia zmiana pliku: karta POLE-ZAJĘTE `85f49af6` (2026-09-25, partia 6). Asercje deterministyczne,
nie czasowe. NIE naprawiane tu (karta: czerwień bazy partii 6 mierzona osobno, nie naprawiana).
Pozostała czerwień regresji backendu na czubku = dokładnie lista partii 6 (zbiór plików powyżej).

## 3. PERF-DYN-0 (skrypt `backend/scripts/perf_dyn_0.py`, ta sama ścieżka co bieg projektanta: `create_run` → `execute_run`)

Maszyna: kontener sesji, 4 CPU, load average przed pomiarem 0,35 / 0,47 / 0,37 (bez obcego
obciążenia; pomiar wykonany PRZED uruchomieniem regresji), Python 3.11.15, numpy 1.26.4,
`DATABASE_URL` plikowy SQLite w katalogu tymczasowym.

| Sieć | Szyny / gałęzie / stacje | Źródła dynamiczne | Horyzont, krok | Wątki BLAS | Rozpływ punktu pracy | Bieg dynamiki (`execute_run`, z zapisem szeregów) | Rdzeń (`czas_obliczen_s`) | Kroki |
|---|---|---|---|---|---|---|---|---|
| złota G00 (`tests/reference_networks/sld_substrate_52s.py`): 52 stacje + GPZ | 514 / 460 / 54 | 5 × PV GFL `default_pv_gfl` | 10 s, 0,002 s stały | 1 | 1,153 s | **42,117 s** | 33,258 s | 5 000 |
| złota G00 | 514 / 460 / 54 | 5 × PV GFL | 10 s, 0,002 s | domyślne (4) | 1,051 s | **40,505 s** | 32,353 s | 5 000 |
| scena harnessu (`dynamika_projektanta`, ta sama co fixtury E-32) | 10 / 7 / 2 | 1 × PV GFL | 0,3 s, 0,002 s | 1 | 0,374 s | 0,920 s | 0,880 s | 150 |
| scena harnessu | 10 / 7 / 2 | 1 × PV GFL | 0,3 s, 0,002 s | domyślne (4) | 0,377 s | 0,904 s | 0,861 s | 150 |

Scenariusz sieci złotej: zwarcie 3F w połowie gałęzi najdalszej (liczbą gałęzi) od szyny GPZ,
`X_f = 2 Ω`, usunięte izolacją w 0,15 s + wyłączenie gałęzi; magazyny i turbiny wiatrowe G00
zdjęte z migawki pomiaru (magazyn nie ma danych tabliczki wymaganych przez rdzeń — karta
KATALOG-DYNAMIKI-BRAKI; turbina typu 1/2 nie ma modelu elektrycznego), 5 źródeł = wymaganie
karty W6-2 §0 pkt 9.

Wnioski: budżet W6-2 §0 pkt 9 (10 s symulacji sieci 50 stacji z 5 źródłami ≤ 60 s) jest
**dotrzymany** przy obu ustawieniach wątków (42,1 s / 40,5 s); zysk z wątków BLAS to 4 % —
w szumie pomiaru (rdzeń liczy układy rzadkie i małe operacje gęste), a nadsubskrypcja przy obcym
obciążeniu kosztowała w karcie WATKI-BLAS-E2E 866 s zamiast 6 s. **Polityka obrazu Dockera:
jeden wątek BLAS** (zapisana w `backend/Dockerfile` i `docker-compose.yml` z uzasadnieniem).
Koszt poza rdzeniem (≈ 9 s na 42 s): adapter wejścia + zapis 5 000 próbek × kanały do
`canonical_run_time_series`. Bieg kontrolny h/2 Pakietu E karty AB-1b.2 (koszt ≈ 3×) mieści się
w budżecie tylko w tle — dokładnie po to jest ta karta.

Obserwacja rdzenia (poza kartą, nic nie zmieniano w rdzeniu): na tej sieci zwarcie 3F
`X_f = 1 Ω` (wartość sceny harnessu) kończy się odmową `dynamika.reinicjalizacja_niezbiezna`
(re-inicjalizacja algebry po zdarzeniu, 30 nawrotów, residuum ≈ 0,016–0,019) zarówno przy GPZ,
jak i na końcu odgałęzienia; `X_f ≥ 2 Ω` zbiega. Do rozstrzygnięcia w torze R (AB-1b.2 /
AB-1b.3b), nie tu.

## 4. Inwentarz klasy (KLASA, NIE INSTANCJA): „ciężkie obliczenie wykonywane synchronicznie w żądaniu HTTP”

Pomiar na bazie `f3c435b6` (eksplorator, AST 349 tras): żadna trasa nie była asynchroniczna
(0 `BackgroundTasks`, 0 `202`, `celery_app.py` bez importerów). Klasa dzieli się na trzy
podklasy wg tego, czy obliczenie ma **tożsamość i stan w rejestrze biegów**:

| Podklasa | Trasy (plik) | Decyzja w tej karcie | Uzasadnienie |
|---|---|---|---|
| A. Bieg persystowany w `canonical_runs` | `POST /api/execution/runs/{id}/execute` (`api/execution_runs.py`, wszystkie rodzaje: PF, PF_UNBALANCED, SC_*, PHASE_STATE_SN, DYNAMIKA_RMS); `POST /power-flow-runs/{id}/execute` (`api/power_flow_runs.py`); `POST /protection-runs/{id}/execute` (`api/protection_runs.py`); `POST /api/cases/{case}/runs/v126/{rodzaj}` (`api/v126_academic.py`, create + execute w jednym POST) | **TEN SAM wykonawca** — 202 + odpytywanie, anulowanie, zamiatanie po restarcie | Jeden mechanizm (`execute_run`), jeden rejestr stanu, jeden klient odpytujący; rozdzielenie „dynamika w tle, reszta w żądaniu” byłoby drugą ścieżką tej samej fizyki (zwarcie sieci 50 stacji: 6–171 s w żądaniu — pomiary CONVERGENCE_EVIDENCE) |
| A′. Seria biegów `run_batches` | `POST /api/execution/batches/{id}/execute` (`api/batch_execution.py`, N × `execute_run` sekwencyjnie) | **TEN SAM wykonawca** (zlecenie serii = jedno zlecenie kolejki, pozycje liczone w wątku roboczym); naprawione przy okazji: TOCTOU przejęcia serii i brak zamiatania serii osieroconych (`zamknij_osierocone_serie` w `lifespan`) | Seria = N ciężkich biegów; miała własny stan RUNNING bez atomowego przejęcia i bez zamiatania — ta sama klasa defektu, którą `canonical_runs` już zamknął |
| B. Warianty w pamięci bez rejestru stanu (wynik w odpowiedzi) | `GET /api/insights/n-1-contingency`; `GET /api/oze-analysis/{hosting-capacity, pq-area, compensation-sizing, osd-response, frt-trajectories, frt-sequence}`; `POST /api/oze-analysis/{connection-study, compliance-certificate, osd-application}[.docx/.pdf]`; `GET/POST /api/ncrfg-tests/…`; `POST /api/quality/state-estimation`; `GET /analysis-runs/{id}/results/short-circuit/{pasmo, rozplyw}`; `GET /analysis-runs/{id}/{nastawy, nastawy/dopasowanie, pakiet-dowodowy-nastaw}`; `GET /api/quality/{conductor-thermal-withstand, design-verdict}` | **NIE w tej karcie** — pozostają synchroniczne | Nie mają tożsamości ani stanu w rejestrze (wynik pochodny liczony na żądanie z zapisanego biegu bazowego albo z migawki; `GET` z definicji oddaje wynik w odpowiedzi); przeniesienie ich do tła wymaga rejestru zadań dla wyników niebędących biegami — to nowy kontrakt (tożsamość, trwałość, odpytywanie, kasacja), czyli karta ENDPOINTY-BEZ-KONSUMENTA / W10-2, nie „zdolność kontekstu wykonania”. Koszty z repo: `pasmo` ≈ 1 bieg SC, `rozplyw` 1,6 s/punkt, `nastawy` 2 × SC + PF, hosting/PQ do kilkudziesięciu × PF |
| C. Lekkie wywołania solverów w żądaniu (formuła, jedna pętla zwarcia, Zbus) | `api/grid_source_preview.py`, `api/fault_loop.py`, `api/equipment_checks.py`, `api/nn_proof.py`, `api/proof_pack.py`, `api/enm.py` (pętla zwarcia, ekwiwalent, SWZ) | **NIE** | Milisekundy; nie są biegami |

Decyzja: wykonawca obsługuje całą podklasę A + A′ (jeden mechanizm, jedna kolejka, jeden
rejestr stanu). Podklasa B jest nazwana w inwentarzu z kosztami i trafia do kart, które mają dla
niej kontrakt (nie odkładam jej „na potem” — to inny byt: wynik pochodny bez tożsamości biegu).

Przy okazji usunięte z tej samej klasy „zadeklarowana infrastruktura bez konsumenta”: Celery
(0 `@app.task`/`shared_task`, 0 importerów), Redis (jedyny czytelnik `REDIS_URL` — Celery),
MongoDB (`motor` — 0 importów, `MONGODB_URL` bez czytelnika).

## 5. Testy jako iloczyn cech

`tests/api/test_wykonawca_biegow.py` (14 testów, realna ścieżka HTTP + wykonawca w tle):
{bieg krótki (rozpływ), bieg długi (bieg czasowy ≈ 1 500 kroków)} × {zakończony, anulowany przed
startem (z kolejki i z CREATED), anulowany w toku między krokami całkowania, przerwany restartem
(w kolejce i w toku — przez `lifespan`), odmowa solwera, błąd programu} × {jeden bieg, dwa zlecone
naraz (jeden RUNNING + jeden QUEUED, FIFO, anulowanie kolejki przy pierwszym liczącym)}; odmowy
nazwane: anulowanie biegu zakończonego (409), biegu w toku bez punktów przerwania (409), nieznany
bieg (404); drugie zlecenie tego samego biegu nie liczy drugi raz; pin „rodzaje z punktami
przerwania = wykonawcy czytający kontekst” (z kodu, nie z listy); kontekst wykonania jako jedyne
źródło anulowania i postępu; wątek roboczy po błędzie programu (wyjątek leci dalej, nie jest
połykany; wątek zastępczy dokańcza kolejkę i przyjmuje nowe zlecenia); parytet bit w bit.

Rozszerzone istniejące: `tests/enm/test_przejecie_biegu_atomowe.py` (przejęcie do kolejki
atomowe, QUEUED → RUNNING, stany nieprzejmowalne do kolejki, zamiatanie QUEUED po restarcie),
`tests/api/test_wspolbieznosc_biegow.py` (sonda `GET /api/health` wraca, gdy bieg stoi w oknie
solvera, a K-1 biegów ma JAWNY stan QUEUED; wykonanie szeregowe — dyspozytor nigdy dwa razy naraz),
`tests/test_batch_execution.py` (seria przez wykonawcę; błąd programu w pozycji = FAILED z nazwą
błędu, bez 500 w żądaniu, bo żądania już nie ma), `tests/api/test_odmowa_danych_422.py`,
`tests/domain/test_stan_biegu.py`, testy V12.6 (zlecenie 202 + odpytywanie), strażnik wskrzeszenia
(18 testów iniekcji). Front: atrapy vitest ekranów V12.6/SSCI/OLTC/dynamiki/przycisku zabezpieczeń
odtwarzają kontrakt 202 + odpytywanie (obcy słownik `DONE` w odpytywaniu zabezpieczeń kończy pętlę
i jest błędem, jak dotąd). E2E realny backend: `dynamika-rms-flow.spec.ts` — 4 testy (dwa nowe:
pasek postępu rośnie → wynik; „Anuluj bieg” → `CANCELLED` z wyjaśnieniem, bez wyniku, rejestr
biegów bez wyniku), pomocnicy `frontend/e2e/biegi.ts` w 18 specach z przepisanym `execute`.

**Klasa wykryta pełnym biegiem e2e (po pierwszym biegu bramek):** 13 speców czekało na gotowość biegu
pętlą „`GET /api/analysis-runs/{id}/results/index` odpowiada 200” — ta końcówka odpowiada 200 także dla
biegu w toku (indeks bez wierszy), więc pętla nigdy nie była bramką gotowości: przy synchronicznym
`execute` była martwa, przy biegu w tle przepuszczała spec do `trace` (409) albo do biegu zabezpieczeń na
biegu SC w stanie RUNNING (409). Dwie czerwienie e2e na `259bcba7` to dwie instancje tej klasy; naprawa
obejmuje całą klasę (inwentarz grepem `results/index` w `e2e/*.spec.ts`: `critical-run-flow`,
`deep-link-wyniki`, `gotowosc-po-biegu`, `import-arkusza-do-wynikow`, `industrial-template-mass-flow`,
`kd4-zrzuty-screenshot`, `kd6-zrzuty-screenshot`, `ogniwo-zwarcie-aparatura`, `parytety-fala2`,
`pasma-rozplywu-jakosc`, `porownanie-zwarc-delty`, `s913-porownanie-z-kanwy`, `swiezosc-po-edycji-modelu`)
— każdy spec czeka na stan `DONE` biegu jednym pomocnikiem `wykonajBiegDoKonca`, lokalne pętle skasowane
(commit `5fa571fa`); 48/48 testów 19 speców zielone na realnym backendzie. Samej końcówki `results/index`
nie zmieniałem: indeks opisuje bieg w każdym stanie (nagłówek biegu + tabele z `row_count`), a ekrany
wyników kluczują po stanie biegu, nie po obecności indeksu.

**Pełna regresja backendu** (trzeci bieg, na `259bcba7` + drzewo) wykryła poza listą partii 6 trzy braki tej
karty, naprawione u źródła w `17b7a221`: (a) trasa `POST /api/cases/{case}/runs/v126/{rodzaj}` zlecała bieg
w tle, ale dekorator nie miał `status_code=202` (10 testów oczekujących 202; trzy testy widma przekształtnika
asertowały 200 — ujednolicone na 202, bo pomocnik `uruchom_v126` oddaje odpowiedź zlecenia po doczekaniu
końca biegu); (b) słownik polskich nazw stanów przebiegu `STANY_PRZEBIEGU_PL` bez `QUEUED`/`CANCELLED`
(test „każdy stan ma polską nazwę”); (c) fixtura harnessu `dynamika_scena_wyniki.json` niosła odcisk
implementacji pakietu `dynamika` sprzed haka nadzorcy (skrót ŹRÓDEŁ pakietu, nie wyników) — przeliczona
narzędziem repo `scripts/eksport_fixtur_harnessu.py --tylko dynamika_scena_wyniki`, `--sprawdz` zielony;
jedyna różnica poza polami nieprzenośnymi (skróty, residua rzędu 1e-12) to ten odcisk — wyniki liczbowe
w tolerancji testu, co jest drugim, niezależnym dowodem „zero zmian liczbowych w rdzeniu”.

**Pełny vitest** wykrył jeden test tej karty: `study-cases/__tests__/types.test.ts` „distinct colors” —
`RUN_STATUS_COLORS` dostał QUEUED/CANCELLED w kolorze PENDING; naprawa u źródła (własne kolory: bursztyn
dla kolejki, łupek dla anulowanego; test obejmuje sześć stanów), commit `53c01359`.

Pomocnicy testów (jedno miejsce odpytywania): `backend/tests/utils/biegi.py` (`wykonaj_bieg`,
`wykonaj_bieg_zabezpieczen`, `wykonaj_bieg_rozplywu`, `wykonaj_serie`, `uruchom_v126`,
`poczekaj_na_stan_koncowy`, `poczekaj_na_wykonawce`; także `run_short_circuit_now`/`run_power_flow_now`
przeniesione z `enm/canonical_analysis.py`, gdzie miały wyłącznie wołających testowych;
`run_phase_state_now` bez wołających skasowany), `frontend/e2e/biegi.ts`.

Baza testowa backendu (`tests/conftest.py::_izolowana_baza_przebiegow`): z `mode=memory&cache=shared`
na **plik SQLite w `tmp_path` z WAL** — wspólny cache pamięci ma blokady na poziomie tabeli między
połączeniami (`SQLITE_LOCKED: database table is locked`), których `busy_timeout` nie obejmuje;
z wątkiem wykonawcy piszącym rejestr i wątkiem żądania odpytującym ten sam rejestr każdy test API
czerwieniał losowo na blokadzie tabeli, nie na defekcie produktu. Koszt: pomiar fixture sprzed karty
mówił 29 s vs 80 s na 531 testach; zestaw 340 testów celowanych tej karty: 84 s. Kształt bazy jest
teraz ten sam, co tor dev/e2e/produkcyjny.

## 6. Pliki gorące (O-57 pkt 12) — zakres zmian

* `enm/canonical_analysis.py`: `STATUS_WYKONAWCZY` (+QUEUED, +CANCELLED), `execute_run(…, kontekst)`
  z gałęzią `CANCELLED` (bez wyniku częściowego), `_wykonaj_analize_biegu(…, kontekst)`
  (dyspozytor podaje kontekst wykonawcom z punktami przerwania), `_execute_dynamika_rms(run, kontekst)`
  + most `_NadzorcaBieguDynamiki`, `_execute_short_circuit(…, kontekst)` z punktem przerwania między
  punktami zwarcia (8 linii w pętli), `POWOD_ANULOWANIA_W_TOKU`; kasacja `run_*_now`. Zero zmian
  w fizyce, w kształcie wyników i w `wykonaj_bieg_w_pamieci`.
* `domain/canonical_operations.py`: nietknięty.
* Migawka OpenAPI: przegenerowana generatorem (`scripts/generuj_snapshot_openapi.py`): nowe trasy
  `…/cancel` ×2, `RunResponse.postep`, `PostepResponse`, `V126RunResponse.deterministic_hash|null`
  + `error_message`, kody 202 na `execute` i na `POST …/runs/v126/{rodzaj}`, enumy stanów.
* Piny strażników: `mypy_ratchet` 223/34 bez zmian; `tsconfig_gate` 81 (czerwień bazy, nie dotykana);
  `test_solver_input_substitute_guard` — pin POMIAREM: pola kontraktów 4116 → 4126 (+10: `PostepBiegu`,
  `KontekstWykonania`, rekord zlecenia wykonawcy, `SilnikDynamiki.nadzorca`), pliki 561 → 563
  (+`solvers/dynamika/przerwanie.py`, +`application/execution/{__init__,wykonawca}.py`, −`api/celery_app.py`),
  zapadka długu i wykluczenia BEZ ZMIAN, PASS (zero podstawień);
  `polykanie_wyjatkow`, `topology_single_impl`, `api_lifecycle` (macierz: 2 nowe trasy aktywne),
  `legacy_public_path` (nowa bramka wskrzeszenia) — zielone.

## 7. Czego nie zrobiono i dlaczego

* Podklasa B inwentarza (warianty w pamięci bez rejestru) pozostaje synchroniczna — powód w §4
  (inny byt: wynik pochodny bez tożsamości biegu; wymaga nowego kontraktu rejestru zadań).
* Anulowanie biegu w toku dla rozpływu, stanu fazowego, zabezpieczeń i V12.6 — odmawiane nazwanym
  powodem (409), bo ich rdzenie (FROZEN, B-01) nie mają punktów przerwania między krokami; dodanie
  punktu przerwania do iteracji NR wymaga zmiany rdzenia B-01 (lista §12.2) — nie w tej karcie.
  Anulowanie PRZED startem działa dla każdego rodzaju.
* Postęp dla rozpływu/stanu fazowego/zabezpieczeń/V12.6 — `postep: null` (uczciwy brak pomiaru,
  nie fabrykowany pasek).
* Odmowa `dynamika.reinicjalizacja_niezbiezna` przy `X_f = 1 Ω` na sieci złotej — obserwacja rdzenia
  zapisana w §3 i w rejestrze planu, nie naprawiana (rdzeń dynamiki poza zakresem karty: „bez zmian
  liczbowych”).
* Czerwień bazy partii 6 (lista w §2, w tym dodatkowo wykryty `menuBudowyNaKanwie.test.tsx`) —
  nienaprawiana zgodnie z kartą.
* Zrzuty PNG w `docs/audit/visual/flow-ekspert/**` i `docs/sld/audyt-2026-08/**` odświeżone przez specy
  e2e innych kart (17 plików) przywrócone do HEAD — nie są produktem tej karty, a ich wymiana bez oględzin
  właściciela (B-02) byłaby szumem binarnym.

## 8. Commity na gałęzi

```
f778591f DYNAMIKA-W-TLE (10): wiersz rejestru planu A/B §7 z dowodami bramek na czubku (regresja, vitest, strażniki, e2e, PERF-DYN-0)
332df027 DYNAMIKA-W-TLE (9): zrzuty E-32 z e2e harnessu na przeliczonej fixturze (materiał B-02, oba motywy); wiersz rejestru kart z pełnym zakresem e2e
17b7a221 DYNAMIKA-W-TLE (8): POST …/runs/v126/{rodzaj} odpowiada 202 (zlecenie w tle), polskie nazwy stanów QUEUED/CANCELLED, fixtura harnessu dynamiki z nowym odciskiem implementacji rdzenia
53c01359 DYNAMIKA-W-TLE (7): własny kolor stanów QUEUED i CANCELLED w historii biegów (test „distinct colors" obejmuje sześć stanów)
5fa571fa DYNAMIKA-W-TLE (6): specy e2e czekają na stan DONE biegu zamiast na 200 z results/index (cała klasa: 13 speców, jeden pomocnik biegi.ts); black na wykonawcy biegów
259bcba7 DYNAMIKA-W-TLE (5): format strażnika ścieżek publicznych wg konfiguracji black backendu; pin testu strażnika podstawień (+10 pól kontraktu wykonawcy i postępu, +3/-1 plików)
77ad0264 DYNAMIKA-W-TLE (4): strażniki łańcucha CI — cykl życia końcówek cancel, wątek roboczy bez połykania błędu programu, typy, jedna topologia; pomocnicy run_*_now w testach; dokumenty
a38b92c5 DYNAMIKA-W-TLE (3): atrapy vitest ekranu dynamiki i przycisku zabezpieczeń na kontrakt kolejki, ruff/black
cb338977 DYNAMIKA-W-TLE (2): kasacja Celery/Redis/MongoDB z bramką wskrzeszenia, polityka wątków BLAS z PERF-DYN-0, e2e postępu i anulowania, atrapy testów na 202 + odpytywanie
0cfd2371 DYNAMIKA-W-TLE (1): wykonawca biegów w procesie — 202 + odpytywanie, kolejka, anulowanie, postęp, kasacja Celery
```
