# Inwentarz blokad na pętli zdarzeń — oś współbieżności programu 10x

Status: WYKONAWCZY (karta 10X-WSPÓŁBIEŻNOŚĆ)
Data pomiaru: 2026-08-05
Zakres: `mv-design-pro/backend/src/api/**`, `src/infrastructure/**`
Nadrzędny plan: `docs/plan/PLAN_PRZEBUDOWY_10X_2026-07.md` (§1 diagnoza, §3 miara „done")

---

## 1. Metoda — mierzone, nie zgadywane

Diagnoza §1 planu mówiła: „sync SQLAlchemy/IO/solvery CPU na event-loopie,
0× `run_in_threadpool` → żądania serializują się". Inwentarz potwierdza obie
części, ale **precyzuje zakres defektu** — i to jest jego główny wynik.

**Kluczowe rozróżnienie, którego diagnoza nie robiła.** FastAPI wykonuje końcówkę
zdefiniowaną jako `def` w PULI WĄTKÓW automatycznie (Starlette → `anyio`
worker thread). Blokujące wnętrze takiej końcówki **nie zatrzymuje pętli
zdarzeń**. Problemem są WYŁĄCZNIE końcówki `async def` z blokującym wnętrzem —
te wykonują się na pętli i blokują cały proces na czas swojej pracy.

Policzone przejściem po AST (`@router.<metoda>` / `@app.<metoda>` +
`ast.AsyncFunctionDef` vs `ast.FunctionDef`, zliczanie `Await`/`AsyncFor`/`AsyncWith`
bez schodzenia do funkcji zagnieżdżonych), nie gre­pem — dekoratory bywają
wielolinijkowe i grep je gubił (grep dawał 275 końcówek, AST daje 356).

| Miara | Liczba |
|---|---|
| Końcówki HTTP ogółem | **356** |
| `def` (już w puli wątków — POPRAWNE, poza zakresem) | **295** |
| `async def` | **61** |
| `async def` bez ani jednego `await` | 55 |
| `async def` z `await` (upload plików) | 6 |
| Wywołań `run_in_threadpool` w `src/` przed zmianą | **0** |

Zatem: z 356 końcówek defekt dotyczy **61**, a nie wszystkich. Z tych 61
blokuje realnie **46**.

---

## 2. Czym blokują — zmierzone koszty

Pomiar: `TestClient`, sieć SN 2 szyny / 1 kabel / 1 źródło GPZ / 1 odbiór
(model MINIMALNY — na sieci projektowej koszty są wielokrotnie wyższe),
mediana z 5 powtórzeń, SQLite w pamięci ze wspólnym cache.

| Operacja | Mediana | Rodzaj blokady |
|---|---|---|
| `POST /runs/power-flow` | **102,7 ms** | solver CPU (Newton-Raphson) + sync SQLAlchemy |
| `POST /runs/short-circuit` | **91,3 ms** | solver CPU (IEC 60909) + sync SQLAlchemy |
| `GET /enm/readiness` | 41,5 ms | IO pliku modelu + walidacja CPU |
| `GET /enm/validate` | 39,8 ms | IO pliku modelu + walidacja CPU |
| `GET /wizard/state` | 39,2 ms | IO pliku modelu + walidacja CPU |
| `GET /enm` | 39,3 ms | IO pliku modelu (`.enm_store/*.json`) |
| `GET /enm/topology/summary` | 39,3 ms | IO pliku modelu + budowa grafu |
| `GET /api/health` | 2,4 ms | sync SQLAlchemy (`engine.connect()` + `SELECT 1`) |

**Znalezisko uboczne — dominujący składnik kosztu odczytów.** Każdy odczyt
modelu płaci ~37 ms za `get_default_mv_catalog()` (budowa pełnego katalogu z
17 zestawów rekordów przy KAŻDYM wywołaniu, przez
`enm.store.get_enm → complete_catalog_defaults`). To jest ~95% czasu
`GET /enm`. Dług NIE jest naprawiany w tej karcie (oś współbieżności dotyczy
tego, GDZIE ten koszt się wykonuje, a nie jego wielkości) — wpisany do §6.

---

## 3. Grupa 1 — końcówki `async def` bez `await`, z blokującym wnętrzem (40)

**Mechanizm naprawy: zamiana `async def` → `def`.** Uzasadnienie: końcówka nie
używa `await` ani razu, więc nie ma czego przenosić do `run_in_threadpool` —
całe ciało jest blokujące. Zamiana na `def` oddaje je puli wątków Starlette
w całości, **bez restrukturyzacji kodu**, czyli bez ryzyka zmiany treści
odpowiedzi, kodów błędów czy kolejności pól. `run_in_threadpool` wymagałby
opakowania ciała w funkcję pomocniczą — więcej zmian, ten sam efekt.

Priorytet **P1** = ścieżka biegu analiz i zapisu modelu (wg karty).

| Plik:linia | Końcówka | Blokada | Prio |
|---|---|---|---|
| `api/enm.py:732` | `run_power_flow` | solver PF + DB (102,7 ms) | **P1** |
| `api/enm.py:146` | `put_enm` | zapis modelu (IO pliku) | **P1** |
| `api/enm.py:511` | `topology_ops` | odczyt→zapis modelu pod blokadą | **P1** |
| `api/enm.py:590` | `topology_ops_batch` | odczyt→zapis modelu pod blokadą | **P1** |
| `api/enm.py:976` | `domain_ops` | odczyt→zapis modelu pod blokadą | **P1** |
| `api/enm.py:782` | `wizard_apply_step` | odczyt→zapis modelu pod blokadą | **P1** |
| `api/generators.py:439` | `create_der_generator` | odczyt→zapis modelu pod blokadą | **P1** |
| `api/generators.py:518` | `set_der_bindings` | odczyt→zapis modelu pod blokadą | **P1** |
| `api/reference_patterns.py:194` | `run_pattern` | wzorzec odniesienia: IO + CPU | **P1** |
| `api/reference_patterns.py:243` | `run_pattern_with_fixture` | wzorzec odniesienia: IO + CPU | **P1** |
| `api/enm.py:103` | `get_enm` | IO pliku modelu (39,3 ms) | P2 |
| `api/enm.py:110` | `get_enm_v2_projection` | IO pliku + projekcja | P2 |
| `api/enm.py:118` | `get_dziennik_zmian` | IO pliku modelu + dziennika | P2 |
| `api/enm.py:160` | `validate_enm` | IO pliku + walidacja (39,8 ms) | P2 |
| `api/enm.py:169` | `get_enm_topology` | IO pliku modelu | P2 |
| `api/enm.py:185` | `get_enm_readiness` | IO pliku + walidacja (41,5 ms) | P2 |
| `api/enm.py:231` | `get_enm_protection_view` | IO pliku modelu | P2 |
| `api/enm.py:238` | `get_enm_field_view` | IO pliku modelu | P2 |
| `api/enm.py:245` | `get_station_fault_loop` | IO pliku + pętla zwarcia | P2 |
| `api/enm.py:268` | `post_wytrzymalosc_aparatury` | IO pliku + DB (`uow`) | P2 |
| `api/enm.py:333` | `get_engineering_readiness` | IO pliku + walidacja | P2 |
| `api/enm.py:392` | `get_analysis_eligibility` | IO pliku + walidacja | P2 |
| `api/enm.py:425` | `get_topology_summary` | IO pliku + graf (39,3 ms) | P2 |
| `api/enm.py:767` | `get_wizard_state` | IO pliku + walidacja (39,2 ms) | P2 |
| `api/enm.py:840` | `wizard_can_proceed` | IO pliku + walidacja | P2 |
| `api/generators.py:663` | `get_der_protection_functions` | IO pliku modelu | P2 |
| `api/generators.py:732` | `get_der_readiness` | IO pliku modelu | P2 |
| `api/generators.py:794` | `get_der_instrument_transformers` | IO pliku modelu | P2 |
| `api/reference_engine.py:49` | `get_reference_compliance` | IO pliku modelu | P2 |
| `api/diagnostics.py:91` | `get_diagnostics` | DB (`uow_factory`) + CPU | P2 |
| `api/diagnostics.py:108` | `get_preflight` | DB (`uow_factory`) + CPU | P2 |
| `api/diagnostics.py:126` | `get_enm_diff` | DB (`uow_factory`) | P2 |
| `api/solver_input.py:248` | `get_solver_input` | DB (`uow_factory`) | P2 |
| `api/solver_input.py:343` | `get_eligibility` | budowa katalogu (37,3 ms) | P2 |
| `api/domain_operations.py:112` | `execute_domain_operation` | budowa katalogu (37,3 ms) | P2 |
| `api/domain_operations.py:226` | `materialize_binding` | budowa katalogu (37,3 ms) | P2 |
| `api/health.py:25` | `health_check` | sync SQLAlchemy (2,4 ms) | P2 |
| `api/reference_patterns.py:177` | `list_pattern_fixtures` | glob katalogu + parsowanie N plików JSON | P2 |
| `api/reference_patterns.py:275` | `export_pattern_result_pdf` | IO + generowanie PDF (reportlab) | P3 |
| `api/reference_patterns.py:435` | `export_pattern_result_docx` | IO + generowanie DOCX (python-docx) | P3 |

---

## 4. Grupa 2 — końcówki `async def` z prawdziwym `await` i blokującym ogonem (6)

**Mechanizm naprawy: `fastapi.concurrency.run_in_threadpool` na ogonie.**
Uzasadnienie: `await file.read()` / `await request.json()` to **poprawne**
oczekiwanie asynchroniczne na treść żądania — końcówka MUSI zostać
`async def`, bo `def` nie może tego wykonać. Blokujące jest dopiero to, co
następuje PO odczycie: rozpakowanie ZIP, parsowanie XLSX, zapisy do bazy,
bieg solvera. Tylko ten ogon idzie do puli wątków.

| Plik:linia | Końcówka | `await` | Blokujący ogon | Prio |
|---|---|---|---|---|
| `api/enm.py:668` | `run_short_circuit` | `request.json()` | solver SC + DB (91,3 ms) | **P1** |
| `api/project_archive.py:132` | `import_project` | `file.read()` | rozpakowanie ZIP + zapisy DB | P2 |
| `api/project_archive.py:184` | `preview_archive` | `file.read()` | rozpakowanie ZIP | P2 |
| `api/incremental_archive.py:279` | `import_incremental` | `file.read()` | deserializacja delty + zapisy DB | P2 |
| `api/archive_diff.py:164` | `compare_archive_files` | 2× `file.read()` | 2× rozpakowanie ZIP + porównanie | P2 |
| `api/xlsx_import.py:15` | `import_xlsx` | `file.read()` | parsowanie XLSX + zapisy DB | P2 |

---

## 5. Grupa 3 — świadomie zostawione jako `async def` (15)

Te końcówki **nie blokują**: czytają stałe modułowe albo słownik w pamięci
procesu, bez IO, bez bazy, bez pracy CPU wartej pomiaru (poniżej 1 ms).
Przeniesienie ich do puli wątków dołożyłoby narzut przełączenia kontekstu
**bez żadnego zysku**, a dodatkowo uczyniłoby współbieżnymi globalne słowniki
`_overrides_store` / `_config_store`, które dziś są bezpieczne właśnie dlatego,
że pętla zdarzeń je serializuje. Zostawienie ich jest decyzją, nie przeoczeniem.

| Plik:linia | Końcówka | Dlaczego nie blokuje |
|---|---|---|
| `api/main.py:166` | `root` | zwraca literał |
| `api/main.py:172` | `health_check` | zwraca literał |
| `api/main.py:178` | `readiness_check` | zwraca literał |
| `api/reference_engine.py:22` | `list_packs` | rejestr w pamięci (`REFERENCE_PACK_REGISTRY`) |
| `api/reference_engine.py:39` | `get_pack` | rejestr w pamięci |
| `api/reference_patterns.py:159` | `list_patterns` | stałe metadane modułu |
| `api/domain_operations.py:204` | `validate_binding` | walidacja słownika, bez katalogu |
| `api/domain_operations.py:254` | `list_operations` | rejestr operacji w pamięci |
| `api/sld_overrides.py:185` | `get_sld_overrides` | słownik w pamięci |
| `api/sld_overrides.py:194` | `put_sld_overrides` | słownik w pamięci |
| `api/sld_overrides.py:210` | `validate_sld_overrides` | walidacja w pamięci |
| `api/sld_overrides.py:240` | `reset_sld_overrides` | słownik w pamięci |
| `api/switchgear_config.py:201` | `get_config` | słownik w pamięci |
| `api/switchgear_config.py:212` | `put_config` | słownik w pamięci |
| `api/switchgear_config.py:225` | `validate_config` | walidacja w pamięci |

---

## 6. Znaleziska uboczne — stan współdzielony, który offload czyni współbieżnym

Offload przenosi końcówki do puli wątków, więc kod dotąd serializowany przez
pętlę zdarzeń staje się naprawdę równoległy. Przegląd stanu globalnego:

| Miejsce | Stan | Ocena |
|---|---|---|
| `enm/store.py` | `_enm_store`, `_blokady_przypadkow` | **BEZPIECZNE** — `threading.RLock` na przypadek, cały cykl odczyt→zapis w sekcji krytycznej (naprawa D4, 2026-08-01) |
| `infrastructure/persistence/repositories/canonical_run_repository.py:111-136` | `_cached_engine`, `_cached_session_factory`, `_cached_database_url` | **DEFEKT — leniwy cache bez blokady** (naprawiany w tej karcie, §7) |
| `api/sld_overrides.py`, `api/switchgear_config.py` | `_overrides_store`, `_config_store` | bezpieczne — końcówki zostają na pętli zdarzeń (§5) |
| `api/incremental_archive.py` | `_last_fingerprints`, `_last_full_archive`, `_export_history` | **DEFEKT — cykl odczyt→przeliczenie→zapis bez blokady** (naprawiony, §7 pkt 2) |
| silnik SQLite dla pliku bazy | `QueuePool` + `check_same_thread=False` | **BEZPIECZNE** — pula jest wielowątkowa |
| silnik SQLite w pamięci (`mode=memory&cache=shared`, tor testowy) | `SingletonThreadPool` + `check_same_thread=True` | **PUŁAPKA, NIE DEFEKT** — strażnik wątku jest tu zabezpieczeniem; jego zdjęcie wywraca proces (§7 pkt 3) |

**Dług NIE naprawiany w tej karcie (wymaga osobnego pomiaru i decyzji):**
`get_default_mv_catalog()` buduje pełny katalog przy każdym wywołaniu
(~37 ms), co dominuje koszt wszystkich odczytów modelu. Naprawa (memoizacja
niezmiennego katalogu) należy do osi wydajności, nie współbieżności — i musi
osobno udowodnić, że katalog jest faktycznie niezmienny w czasie życia procesu.

---

## 7. Naprawy stanu współdzielonego wymuszone przez offload

1. **`canonical_run_repository.get_canonical_run_session_factory()`** — leniwa
   inicjalizacja trzech zmiennych modułu bez blokady. Dwa wątki widzące pusty
   cache tworzą DWA silniki i dwa razy wykonują `init_db`; gorzej — gałąź
   zmiany adresu bazy woła `_cached_engine.dispose()` na silniku, z którego
   inny wątek właśnie korzysta. Naprawa: `threading.Lock` wokół całej
   sekwencji sprawdź-utwórz-podmień, z powtórzonym sprawdzeniem pod blokadą.
   Test: `tests/infrastructure/persistence/test_silnik_wspolbiezny.py`.

2. **`api/incremental_archive.py`** — eksport i import przyrostowy prowadzą ten
   sam cykl odczyt→przeliczenie→zapis na trzech słownikach modułu. Wyścig
   **istniał już przed tą kartą**: `POST /export/incremental` jest zdefiniowany
   jako `def`, więc od zawsze biegł w puli wątków. Dwa równoległe eksporty
   liczyły deltę względem tej samej bazy, a zapisywał ostatni — kolejna delta
   powstawała więc względem punktu odniesienia, którego w stanie nie ma, czyli
   MILCZAŁA o realnie zmienionych sekcjach. Offload importu dokłada drugiego
   mutującego. Naprawa: `threading.RLock` na projekt wokół całego cyklu w obu
   końcówkach.

3. **`infrastructure/persistence/db.create_engine_from_url()` — PRÓBA WYCOFANA,
   i to jest wynik wart zapisania.** Pierwotnie „naprawiono" tu szum w logach
   (`sqlite3.ProgrammingError` przy `dispose()` bazy w pamięci) przez
   `check_same_thread=False`. Pod prawdziwą wielowątkowością okazało się to
   groźne: `SingletonThreadPool` przy przekroczeniu rozmiaru zamyka połączenia
   NALEŻĄCE DO INNYCH WĄTKÓW, a ze zdjętym strażnikiem to zamknięcie **się
   udaje** — proces kończy się **segmentation fault** w warstwie C `sqlite3`
   (zmierzone przy K=10). Strażnik działał tam jak zabezpieczenie: przy
   `check_same_thread=True` zamknięcie po prostu się nie udaje, jest logowane,
   a używane połączenie przeżywa.

   Właściwe rozwiązanie leżało gdzie indziej: **test współbieżności biegnie na
   bazie PLIKOWEJ** — tej samej konfiguracji co produkcja (`QueuePool`, WAL,
   30-sekundowy budżet oczekiwania) — zamiast na skrócie ze wspólnym cache w
   pamięci, którego produkcja nigdy nie używa. Wspólny cache przełącza SQLite na
   blokady NA POZIOMIE TABELI, a `busy_timeout` ich nie obejmuje: równolegli
   pisarze dostawali natychmiastowe `database table is locked`. Test mierzący
   współbieżność nie może biec na silniku, którego produkcja nie ma — mierzyłby
   ograniczenie skrótu testowego. Pułapkę pilnuje przypięty test
   `test_baza_w_pamieci_zachowuje_straznika_watku`.

---

## 8. Miara „done" (§3 planu) — i co pomiar zmienił w jej definicji

Test: `backend/tests/api/test_wspolbieznosc_biegow.py` (5 przypadków).

### 8.1 Czego offload NIE daje — wynik pomiaru, nie ustępstwo

Karta zakładała kryterium „bieg równoległy NIE wolniejszy niż sekwencyjny".
**Pomiar pokazał, że to kryterium jest fizycznie nieosiągalne** i dlaczego:

| Obciążenie (K=10, 4 rdzenie) | Szeregowo | Równolegle | Stosunek |
|---|---|---|---|
| biegi zwarciowe (solver) | 0,965 s | 1,746 s | **1,81×** |
| odczyty modelu (`/enm/readiness`) | 0,417 s | 0,772 s | **1,85×** |
| trywialny `/api/health` | 0,029 s | 0,036 s | **1,23×** |

Spowolnienie dotyczy **nawet trywialnego `/api/health`**, co wyklucza
rywalizację o bazę jako przyczynę. Powodem jest GIL: cała ta praca to bajtkod
Pythona, a GIL dopuszcza jeden wątek naraz — K wątków dokłada wyłącznie koszt
przełączania. **Offload nie zwiększa i nie może zwiększyć przepustowości
liczenia.** Prawdziwe zrównoleglenie wymagałoby procesów (osobna decyzja, poza
tą osią).

Kryterium przepustowości zostało więc zamienione na **próg 3,0×**, który nie
udaje zysku, a łapie regresje strukturalne niezależne od GIL: konwój na
blokadzie, ponawianie transakcji po zakleszczeniu, przypadkową globalną sekcję
krytyczną wokół biegu.

### 8.2 Co offload daje — i to jest miara z §3 planu

Plan §3 mówi „**stabilne p95 API przy K=10 równoległych biegach**" — czyli
opóźnienie, nie przepustowość. To jest dokładnie to, co offload naprawia.

Zmierzone po naprawie (K=10 biegów zwarciowych w locie, sonda `GET /api/health`):

| Miara | Wartość |
|---|---|
| pojedynczy bieg bez obciążenia | 133,5 ms |
| `/api/health` w spokoju (mediana) | 2,9 ms |
| czas całej partii K=10 | 2,148 s |
| `/api/health` pod obciążeniem — p50 | **17,2 ms** |
| `/api/health` pod obciążeniem — p95 | **294,8 ms** (0,14 czasu partii) |

Przed offloadem sonda **nie przechodzi w ogóle**: przy cofniętym offloadzie
jednej końcówki biegu zdążyła wykonać **1 zapytanie** w całej partii, a jego
opóźnienie wyniosło 865 ms (czyli czekała na koniec biegu).

### 8.3 Zestaw asercji

1. `test_biegi_rownolegle_sa_deterministyczne` — K=10 zadań mieszanych:
   (a) wszystkie 200, (b) odcisk **fizyki** identyczny z biegiem szeregowym,
   (c) próg przepustowości 3,0× (§8.1).
2. `test_lekkie_zadanie_przechodzi_w_trakcie_biegow[rozpływ|zwarcie]` — miara
   §3: p95 sondy < połowa czasu partii, **osobno dla każdej końcówki biegu**.
3. `test_odczyt_nie_czeka_na_bieg_analizy[rozpływ|zwarcie]` — najostrzejsza
   postać: lekki odczyt kończy się PRZED równoległym biegiem.

**Progi są względne**, nie milisekundowe — ten sam kod na wolniejszym runnerze
CI daje ten sam wynik.

**Dlaczego per końcówka (reguła KLASA, NIE INSTANCJA).** Pomiar zbiorczy
przechodzi także wtedy, gdy offload cofnięto na JEDNEJ końcówce, bo druga wciąż
go ma — iniekcja karty właśnie tak przeszła. Dopiero parametryzacja po rodzaju
biegu ją złapała.

**Usunięte kryterium — uczciwość pomiaru.** Pierwotna asercja „okna czasowe
zadań zachodzą na siebie" została WYCOFANA zamiast poprawiona: okno widziane
przez klienta obejmuje czas oczekiwania w kolejce, więc żądania zakolejkowane i
wykonane szeregowo mają okna zachodzące tak samo jak wykonane równolegle. Taki
pomiar nie potrafi rozróżnić tych sytuacji — nie może więc być bramką i
zostawienie go byłoby fałszywą pewnością.
