# MV-DESIGN-PRO — PLAN WYDAJNOŚCI I SKALOWANIA (mandat §143–§144; pakiet §179 poz. 14)

**Status:** PROPOZYCJA (do przeglądu właściciela; nic nie jest wdrożone)
**Data:** 2026-09-02 · **Gałąź:** `claude/mv-design-pro-twin-audit-u4lhy0` · **HEAD audytu:** `a1ab2959`
**Źródła dowodowe:** A9 (pomiary ścieżki zapisu/odczytu ENM, synchroniczne solvery, GIL, Celery 0 zadań, brak benchmarków), A3-10 (algebra gęsta, SC O(N·n³), N-1), A2-09/A2-11 (N-1 bez cache, brak grafu zależności), A7-07 (trzy geometrie per LOD, brak wirtualizacji), A8-01/A8-02 (≈80 tys. LOC martwego kodu w bundlu, plik danych 134 193 LOC), A10-01/A10-23 (CI 8,6–25,9 min, brak budżetów), `docs/plan/10X_WSP_INWENTARZ.md` (pomiary współbieżności K=10).
**Relacja:** budżety solverów — `MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` §10 (ten dokument je przejmuje i rozszerza o API, model, UI, CI); persystencja — `MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md` §6; inwalidacja selektywna — `MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §22.

---

## 0. Stan zmierzony (ground truth)

| Operacja | Pomiar | Warunki | Dowód |
|---|---|---|---|
| `get_enm` (odczyt modelu przez API) | **0,355 s** | 54 stacje, 315 szyn, 260 gałęzi, JSON 0,78 MB; każdy odczyt = migracje + `complete_catalog_defaults` (0,258 s) + ZAPIS | A9 §3.4 |
| `set_enm` | 0,41 s | j.w. | A9 §3.4 |
| `compute_enm_hash` / `ENMValidator.validate` | 0,029 s / 0,083 s | j.w. | A9 §3.4 |
| PF NR / SC (sieć minimalna) | 102,7 ms / 91,3 ms | `10X_WSP_INWENTARZ.md:41-44` | A9-10 |
| PF NR (substrat 315 szyn) | ≈0,4 s (76 % czasu = składanie jakobianu, gęste) | rejestr konfliktów N1-WYDAJNOSC | A3-10 |
| N-1 | 0,472 s/kontyngencję (serwis) · 2,64 s/kontyngencję przez API · 374,7 s / 142 kontyngencje | sekwencyjnie, synchronicznie, bez cache faktoryzacji | A9-10, A2-09, EF-044 |
| SC wszystkie węzły | O(N·n³): inwersja per węzeł | gęsta algebra | A3-10 |
| K=10 równoległych biegów | 1,81× **wolniej** niż szeregowo (GIL); p95 `/api/health` 294,8 ms pod obciążeniem | handlery `def` w puli wątków; solvery w żądaniu HTTP | A9-10 |
| Kolejka zadań | Celery zdefiniowany, **0 zadań**; MongoDB/Redis 0 importów | compose deklaruje 6 usług | A9-13 |
| Lista biegów | filtrowanie w Pythonie po pobraniu całej listy; brak indeksów `case_id/created_at` | `analysis_runs.py:90-107` | A9 §9 pkt 7 |
| Snapshot per bieg | pełna kopia ENM (0,78 MB) w `canonical_runs.snapshot_json`; brak GC/retencji | — | A9 §9 pkt 4 |
| Bundle frontendu | plik danych PTPiREE 134 193 LOC dublujący JSON backendu; ≈80 tys. LOC nieosiągalnego kodu; ~12,9 tys. LOC JSX v2 bez montażu; harnessy 20,9 tys. LOC | A8-01/02, A7-03/14 |
| SLD SN | projekcja 100 % w kliencie (35,3 tys. LOC TS), trzy geometrie per LOD (3 sceny), brak wirtualizacji, wydajność dowodzona tylko w jsdom | A7-01/07 |
| Sklepy stanu | 29 store'ów Zustand; 2 prawdy nawigacji; orkiestrator 938 LOC na `hashchange` | A8-03 |
| CI | Python tests 8,6–9,2 min; Frontend checks 12,9–25,9 min; E2E full 20–63 min; pełny pytest lokalnie 710 s (10 523 testów); 0 benchmarków w CI | A10 §6, A9-23 |

Największy zmierzony substrat obliczalny: 315 węzłów (N-1). Substrat SLD 52 stacji nie jest obliczalny („wyspa odcięta od źródła") — brak sieci referencyjnej L.

---

## 1. Budżety (cel wersji 1 twin; bramka CI z progiem regresji 20 %)

Sieci wzorcowe: **S** ≈ 50 szyn (kilka stacji), **M** ≈ 315 szyn (substrat 53 stacji, obliczalny), **L** ≈ 2 000 szyn SN+nN (obszar OSD: ~150 stacji z nN) — generowane deterministycznie z rejestru sieci (plan migracji §4).

| Operacja | S | M | L | Uwagi |
|---|---|---|---|---|
| odczyt modelu (rewizja z cache) | < 5 ms | < 20 ms | < 100 ms | bez zapisu, bez migracji |
| komenda domenowa (walidacja + zapis rewizji + inwalidacja selektywna) | < 100 ms | < 300 ms | < 1 s | bez przeliczeń |
| projekcja topologii (`TopologyService`) | < 5 ms | < 30 ms | < 200 ms | inkrementalnie po zmianie łącznika |
| projekcja SLD (scena semantyczna SN lub nN) | < 20 ms | < 100 ms | < 500 ms | backend |
| PF NR | < 50 ms | < 200 ms | < 2 s | rzadka algebra |
| SC 3F/1F/2F/2FZ wszystkie węzły | < 100 ms | < 1 s | < 10 s | faktoryzacja + kolumny selektywne |
| N-1 pełne | < 1 s | < 10 s | < 120 s | równolegle, ciepły start |
| plan „wymagane analizy" (LF max/min + SC max/min + nastawy + koordynacja + cieplne) | < 2 s | < 15 s | < 3 min | jako zadanie z postępem |
| QSTS 24 pkt | < 1 s | < 5 s | < 60 s | — |
| rozpływ nN 4-przewodowy (stacja) | < 20 ms | — | — | per stacja; L: 150 stacji < 3 s |
| generacja pakietu dokumentów (raport PDF + zestawienia) | < 5 s | < 20 s | < 2 min | bez przeliczeń |
| pierwsze wyrenderowanie SLD (M) | — | < 1 s | < 3 s | scena z backendu, LOD, wirtualizacja |
| interakcja kanwy (pan/zoom/selekcja) | 60 fps | 60 fps | ≥ 30 fps | culling |
| K=10 równoległych biegów | przepustowość ≥ min(K, rdzenie) × szeregowa; p95 odczytów stabilne | | | procesy, nie wątki |

---

## 1a. Macierz budżetów wydajności (wymóg właściciela §C.6) — dziesięć osobnych pozycji

Budżet zbiorczy „operacja użytkownika < X" ukrywa regresję w jednej warstwie za zapasem w innej. Dlatego mierzymy i bramkujemy **dziesięć osobnych pozycji**, każda z własnym pomiarem, własnym progiem i własnym testem regresji. Pozycja bez pomiaru = pozycja nieodebrana.

| # | Pozycja | Co mierzy (jednostka pomiaru) | S | M | L | Bramka CI |
|---|---|---|---|---|---|---|
| B1 | `topology` | `TopologyService`: CN → TN, wyspy, spójność po zmianie łącznika | < 5 ms | < 30 ms | < 200 ms | regresja > 20 % = czerwony |
| B2 | `snapshot assembly` | `CanonicalNetworkSnapshot`: rozwiązanie stanu efektywnego + materializacja parametrów + hash | < 20 ms | < 80 ms | < 500 ms | regresja > 20 % |
| B3 | `LF` | rozpływ mocy NR na składowej zgodnej (bez montażu migawki) | < 50 ms | < 200 ms | < 2 s | regresja > 20 % |
| B4 | `SC` | zwarcia 3F/1F/2F/2FZ we wszystkich węzłach (faktoryzacja + kolumny) | < 100 ms | < 1 s | < 10 s | regresja > 20 % |
| B5 | `ABCN nN` | rozpływ 4-przewodowy nN per stacja (solver fazowy) | < 20 ms | < 20 ms/stacja | < 3 s (150 stacji) | regresja > 20 % |
| B6 | `scenario batch` | wsad scenariuszy (N-1, QSTS, warianty) — przepustowość i p95 | 1 s / N-1 | 10 s / N-1 | 120 s / N-1 | przepustowość ≥ min(K, rdzenie) × szeregowa |
| B7 | `projection SN` | scena semantyczna SN z backendu (bez rysowania) | < 20 ms | < 100 ms | < 500 ms | regresja > 20 % |
| B8 | `projection nN` | scena semantyczna nN (portal, obwody odbiorcze) per stacja | < 15 ms | < 15 ms/stacja | < 2 s (150 stacji) | regresja > 20 % |
| B9 | `dense renderer` | pierwsze wyrenderowanie i interakcja kanwy przy gęstej scenie | 60 fps | < 1 s / 60 fps | < 3 s / ≥ 30 fps | budżet klatki w teście kanwy |
| B10 | `document generation` | pakiet dokumentów (PDF/A + XLSX + wektor), bez przeliczeń | < 5 s | < 20 s | < 2 min | regresja > 20 % |

Zasady macierzy: (1) każdy pomiar jest izolowany — B3 nie zawiera B2, B7 nie zawiera B1; (2) baseline mierzony na tej samej maszynie CI, w tym samym trybie, minimum 5 powtórzeń, raportowana mediana i p95; (3) przekroczenie budżetu jest defektem wydajności z kartą naprawczą, nie powodem do podniesienia progu; (4) podniesienie progu wymaga decyzji właściciela z uzasadnieniem fizycznym (większa sieć referencyjna, nowa fizyka), nigdy „bo tak wyszło"; (5) pozycje B1–B10 są mierzone także w konfiguracji równoległej, żeby wykryć degradację p95 pod obciążeniem.

---

## 2. Plan per warstwa

### 2.1 Model i persystencja (A9-07/08/09/14)
1. **Odczyt bez zapisu:** `get_enm` = czysty odczyt; migracje formatu jednorazowo przy podniesieniu wersji nagłówka (wsadowo, z rewizją „migracja"); `complete_catalog_defaults` wykonywane w komendzie zapisu, nie przy odczycie. Test: „odczyt nie zmienia rewizji"; pin czasu względnego odczyt ≤ 5 % zapisu.
2. **Cache modelu per rewizja** (w procesie, klucz = hash rewizji; LRU na N rewizji); projekcje (topologia, protection-view, scena SLD) memoizowane per (rewizja, scenariusz).
3. **Magazyn rewizji** (`RevisionStore`): delty komend + migawki co k rewizji (delta z `archive_diff` — istnieje); `canonical_runs.snapshot_json` zastąpiony referencją do rewizji (0,78 MB × liczba biegów → 0); retencja i GC artefaktów biegów wg polityki (decyzja W-D4).
4. **Postgres jako docelowa baza** (SQLite tylko dev/test), Alembic, jeden `Engine`, FK egzekwowane, indeksy `(case_id, created_at)`, `(project_id, revision)`; listowanie z paginacją w SQL, nie w Pythonie.
5. **Współbieżność:** optymistyczna kontrola wersji (`If-Match: revision` → 409 przy rozjeździe) na każdej komendzie; blokada doradcza w DB przy >1 procesie roboczym (dziś `RLock` tylko w procesie).

### 2.2 Solvery (A3-10; szczegóły w architekturze symulacji §4)
1. Wspólne jądro admitancji (`simulation/kernel/admittance.py`) i **algebra rzadka** (`scipy.sparse` + `splu`); jakobian składany wektorowo (dziś 76 % czasu PF).
2. SC: jedna faktoryzacja Z/Y na scenariusz + kolumny selektywne (`splu.solve` na wektorach jednostkowych) zamiast inwersji per węzeł; 4 typy zwarć z tych samych kolumn składowych.
3. N-1/what-if: ciepły start z rozwiązania bazowego; modyfikacje rzędu 1 (Woodbury / aktualizacja faktoryzacji) dla wyłączenia gałęzi; równolegle per kontyngencja w puli procesów; determinizm: wynik niezależny od kolejności (test bit-identyczności między przebiegami — decyzja o tolerancji per solver, S-Q4 w architekturze symulacji).
4. Rozpływ nN 4-przewodowy: BFS/current-injection na stacji (setki węzłów) — koszt pomijalny; wspólny snapshot z SN (equivalent Thevenina upstream z cache).
5. Rejestr zdolności z polem `performance_budget`; benchmark per solver.

### 2.3 Orkiestrator i zadania (A9-10, A3-02)
1. `SolverOrchestrator` uruchamia plan jako **zadania** (`POST …/runs` → 202 + `plan_id`; `GET /runs/{id}` → QUEUED/RUNNING/PARTIAL/FINISHED/FAILED z postępem i anulowaniem); UI ma już polling (`pollRunStatus`).
2. Wykonanie za **abstrakcją `ExecutionBackend`** (korekta właściciela D-07): `LocalProcessPoolExecutionBackend` (rozmiar puli = rdzenie − 1, w kontenerze API) jako implementacja wersji 1 oraz `WorkerQueueExecutionBackend` jako implementacja późniejsza, wpinana bez zmiany `SolverOrchestrator`, kontraktu biegu i żadnego solvera. Nieużywane dziś Celery/Redis (0 zadań) znikają z obecnego produktu jako martwa infrastruktura — to usunięcie kodu, nie zamknięcie scenariusza kolejki. Solvery są czyste (brak stanu globalnego) — warunek równoległości wspólny dla obu backendów; ten sam zestaw testów determinizmu przechodzi na każdym backendzie.
3. Cache wyników po `(snapshot_hash, delta_hash, solver_id, solver_version, settings_hash, catalog_revision_set)`; trafienie = ten sam `run_id` (semantyka „w pamięci" zachowana dla what-if).
4. DAG per scenariusz: LF/SC równolegle, analizy zależne (nastawy, koordynacja, cieplne) po nich; scenariusze równolegle.
5. Awarie: `PARTIAL` z listą FAILED; nigdy cichy sukces; limity czasu per zadanie z budżetu.

### 2.4 Inwalidacja selektywna i przeliczenie przyrostowe (A2-05/A2-11)
Graf klas atrybutów (FAZA B §22): zmiana etykiety nie unieważnia rozpływu; zmiana nastawy nie unieważnia SC; zmiana katalogu kabla unieważnia LF/SC/cieplne/koordynację (ten odcinek i zależne). „Przelicz nieaktualne" = zbiór STALE z grafu. Cel: po typowej edycji (zmiana typu jednego kabla) plan przeliczenia ≤ 30 % pełnego planu.

### 2.5 API i read-modele (A9-04/12)
1. Read-modele materializowane per rewizja (topologia, protection-view, field-view, scena SLD, rejestr przekroczeń) — liczone raz, serwowane z cache z `ETag = hash(rewizja, scenariusz)`.
2. `ResultSetV2` kolumnowy (tablice per wielkość), rozpływ gałęziowy w osobnej tabeli (istnieje — KEEP); kompresja odpowiedzi; paginacja list.
3. Kontrolery ≤ 200 LOC; renderowanie raportów poza żądaniem (zadanie).
4. Snapshot OpenAPI w repo + generowany klient TS (`openapi-typescript`) — mniejszy bundle niż ręczne lustro 1 642 linii + 172 typy.

### 2.6 Frontend (A8, A7)
1. Usunięcie pliku danych 134 193 LOC (dane z backendu, lazy) i ≈80 tys. LOC nieosiągalnego kodu; code-splitting per przestrzeń; jedna prawda nawigacji (bez orkiestratora `hashchange` 938 LOC).
2. SLD: scena z backendu (SN i nN), **jedna geometria** z LOD jako filtrem widoczności (nie trzy sceny), culling/wirtualizacja elementów poza kadrem, layout w web workerze, memoizowane selektory; pomiar w przeglądarce (Playwright, nie jsdom) na sieci M i L: pierwsze wyrenderowanie i fps.
3. Konsolidacja 29 store'ów do modelu warstw (projekt/rewizja/scenariusz/wyniki/UI) — mniej subskrypcji, mniej przerysowań; „Wyniki" bez montowania 32 zakładek naraz.
4. Formularze: kreatory ładują katalog z backendu z filtrami (nie osadzone katalogi w UI — A6-09).

### 2.7 CI i testy (A10-01/A10-23)
1. Sharding pytest (4 shardy → ~3 min) i vitest; guardy backendowe w jednym środowisku (`poetry run`); E2E full nocne, smoke na PR.
2. **Benchmark nocny** (`pytest-benchmark` lub własny harness `perf_counter`) na S/M/L: PF, SC, N-1, plan wymagany, projekcje, komenda domenowa, odczyt modelu; wynik jako JSON w artefakcie i porównanie z budżetem; regresja > 20 % = czerwień.
3. Test przepustowości K=10 (dziś jeden chwiejny test) jako test klasy w benchmarku, nie w suicie jednostkowej.
4. Sieć L w rejestrze sieci wzorcowych (generator deterministyczny) — warunek pomiaru skali.

---

## 3. Metoda pomiaru

- Harness: ta sama maszyna CI (runner klasy stałej), 5 powtórzeń, mediana; wynik z hashem sieci i wersją solvera; JSON w artefakcie; porównanie z `perf_budgets.json` w repo.
- Profil: `cProfile`/`py-spy` dla PF/SC na M (dziś wiadomo tylko o 76 % w jakobianie); pamięć (`tracemalloc`) dla L (Y-bus rzadki: nnz ≈ 4·gałęzie; gęsta 2000×2000 complex = 64 MB per macierz — nieakceptowalne przy inwersji per węzeł).
- Frontend: Playwright `performance.now()`/`requestAnimationFrame` na sieci M/L: czas do pierwszej sceny, fps przy pan/zoom, pamięć.

---

## 4. Determinizm przy równoległości

Bieg w procesie roboczym musi dać bit-identyczny wynik jak w procesie API (test klasy na rejestrze sieci: hash wyniku × {proces API, pula, dwa różne procesy}); ciepły start N-1 z tolerancją zadeklarowaną per solver (`determinism_tolerance` w rejestrze zdolności) albo bit-identyczność (decyzja S-Q4). Hash kanoniczny niezależny od platformy (A10-02 — warunek wstępny; dziś 7/18 scenariuszy nN ma inny hash w CI niż lokalnie).

---

## 5. Kolejność wdrożenia (skrót; pełna w planie migracji)

| Krok | Zakres | Efekt mierzalny |
|---|---|---|
| P-0 | hash kanoniczny cross-platform; rejestr sieci S/M/L; benchmark nocny z budżetami; snapshot OpenAPI | pomiar zamiast deklaracji |
| P-1 | odczyt bez zapisu + cache rewizji; paginacja SQL; indeksy | `get_enm` M: 0,355 s → < 20 ms |
| P-2 | jądro rzadkie PF/SC; faktoryzacja + kolumny selektywne | PF M < 200 ms; SC M < 1 s |
| P-3 | zadania + pula procesów + cache orkiestratora; N-1 równolegle z ciepłym startem | N-1 M: 374,7 s → < 10 s; K=10 skaluje |
| P-4 | inwalidacja selektywna + „przelicz nieaktualne" | plan po edycji ≤ 30 % pełnego |
| P-5 | frontend: usunięcie martwego kodu i pliku danych; jedna geometria; wirtualizacja; scena z backendu | pierwsze wyrenderowanie M < 1 s; bundle −50 % |
| P-6 | Postgres/Alembic/FK; retencja artefaktów; delty rewizji | brak wzrostu 0,78 MB/bieg |

---

## 6. Decyzje wymagające właściciela

| ID | Decyzja | Rekomendacja |
|---|---|---|
| W-D1 | Topologia wdrożenia: narzędzie lokalne (1 użytkownik) czy serwer wielostanowiskowy OSD | zaprojektować pod serwer (procesy robocze, Postgres, `If-Match`), uruchamiać lokalnie w compose |
| W-D2 | Zadania: pula procesów w API (rekomendacja) vs Celery/Redis (istnieją w compose, 0 zadań) | pula procesów; usunąć Celery/Redis/MongoDB z compose |
| W-D3 | Postgres obowiązkowy (FK, JSONB, indeksy) — SQLite tylko dev/test | tak |
| W-D4 | Retencja artefaktów biegów (np. ostatnie N biegów per przypadek + biegi cytowane przez dokumenty wydane) | N = 20 + cytowane; reszta GC |
| W-D5 | Budżety z §1 jako bramka CI (próg regresji 20 %) — akceptacja wartości | tak; korekta po pierwszym pomiarze na sieci L |
| W-D6 | Determinizm N-1 z ciepłym startem: bit-identyczność vs tolerancja per solver | tolerancja zadeklarowana w rejestrze zdolności, testowana |
