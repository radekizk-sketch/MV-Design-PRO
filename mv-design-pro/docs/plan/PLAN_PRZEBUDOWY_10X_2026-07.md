# PLAN PRZEBUDOWY DO KLASY 10x — MV-DESIGN-PRO (2026-07)

Status: ZATWIERDZONY DO REALIZACJI W ZAKRESIE ZAWĘŻONYM (2026-08-05; decyzje §9:
poz. 1–2 rozstrzygnięte DECYZJĄ WŁAŚCICIELA — oś wdrażalności i ekspozycja
sieciowa WYCOFANE, system pozostaje na localhost; poz. 3–5 rozstrzygnięte przez
architekta na mocy pełnomocnictwa — szczegóły pod każdą decyzją w §9)
Autor: sesja inżynierska Claude, na bazie audytu principal-level 2026-06 (ocena B−, 30 findingów z file:line)
Zakres: odpowiedź na zlecenie „Rebuild our entire codebase from scratch. The old version is your spec.
Turn it into a development plan for building a 10x better version. Write tests that capture everything
it currently does, then loop until the new version passes all of them."

---

## 0. Werdykt inżynierski (przeczytaj najpierw)

**Dosłowny rebuild od zera całego kodu jest — na dowodach — najdroższą i najbardziej ryzykowną drogą
do celu „10x lepszy", i NIE rekomenduję go.** Ten dokument robi dokładnie to, o co poprosiłeś
(plan rozwoju + testy charakteryzacyjne + pętla do zielonego), ale kroi program tak, żeby te same
rygory dały wynik 10x **bez** wyrzucania najcenniejszego aktywa repo. Powody są w §2; jeżeli po ich
lekturze nadal chcesz clean-room v2, §8 zawiera uczciwie wycenioną ścieżkę i bramki go/no-go.

Kluczowa obserwacja audytu 2026-06: **prawie każda luka to problem OKABLOWANIA, nie architektury** —
konfiguracje, guardy, infrastruktura Celery/Redis i głębia testów już istnieją; trzeba je podłączyć
i uczynić blokującymi. Rdzeń fizyczny jest znakomity; peryferia (security, egzekwowanie, współbieżność)
odstają o klasę. To definiuje kształt programu: **przebudowa wycinkami (strangler) na zamrożonych
szwach testowych**, z pełnym rebuildem tylko tam, gdzie stare jest cienkie albo realnie zgniłe.

---

## 1. Stan faktyczny (zweryfikowany w żywym klonie, 2026-07-02)

| Aktywa (nie wyrzucać) | Dowód |
|---|---|
| Solver IEC 60909 weryfikowany analitycznie do `rel=1e-12` | `backend/tests/test_short_circuit_iec60909.py` |
| ~5 413 funkcji testowych backendu (5 710 zebranych), 660 ENM, 385 proof-engine | `backend/tests/` (policzalne) |
| 537 plików / 7 350 testów frontendu, kontrakty determinizmu SLD | pełny bieg vitest 2026-06 |
| Złote sieci, zamrożone hashe wyników, harness screenshotowy | `tests/golden/`, `frontend/screenshot-harness.html` |
| Wymuszona izolacja warstwy solverów (import-level) | audyt §2, potwierdzone narzędziowo |
| Zero martwego kodu (vulture, confidence 90) | audyt §2 |
| Kanon V12.xx + 79 guardów + 6 wiążących spec systemowych | `docs/v12xx/`, `scripts/*guard*.py` (79 plików) |

| Długi (to one blokują „10x") | Dowód (żywy klon) |
|---|---|
| **Zero auth na całym API** — 35 routerów, 0 trafień `get_current_user/OAuth2/HTTPBearer/api_key` | `backend/src/api/main.py` (35× include_router) |
| Sekrety-atrapy + `DEBUG=true` w jedynym artefakcie deployu | `docker-compose.yml:15-16,61` |
| Teatr egzekwowania: 79 guardów, w CI odpalane ~32; mypy (300 błędów w 70 plikach), ruff, black — **nie bramkowane** dla backendu | audyt §2/§3; `.github/workflows/` |
| God-file: `enm/domain_operations.py` = **6 906 linii**, dispatcher połyka wyjątki, zero logowania | `backend/src/enm/domain_operations.py:6875-6895` |
| Async-fasada: sync SQLAlchemy/IO/solvery CPU na event-loopie, 0× `run_in_threadpool` → żądania serializują się | `backend/src/api/enm.py:502,563`; `infrastructure/persistence/db.py:12-17` |
| `import_graph_guard.py` nie robi analizy grafu importów (regex na 3 plikach) → brak ochrony przed cyklami | `scripts/import_graph_guard.py:10-144` |
| Dryf dokumentacji: README wskazuje ARCHIWALNE `docs/spec/` jako źródło prawdy; guardy liczników psują CI przy zwykłym dodaniu testu | `README.md:13`; incydent CI 2026-06 (naprawiony `90933c96`) |

---

## 2. Dlaczego dosłowny big-bang rewrite przegrywa (4 argumenty)

1. **Paradoks akceptacji.** Warunek „nowa wersja przechodzi WSZYSTKIE dotychczasowe testy" oznacza,
   że ~13 000 testów — które kodują granice modułów, API wyników (FROZEN), hashe determinizmu i
   semantykę kanonu — wymusi zbieżność nowego systemu z... starym. Po miesiącach pracy wyjdzie ten
   sam system, tylko z nowymi błędami. „10x" nie powstaje z przepisania 1:1; powstaje ze zmiany
   wąskich gardeł (§3), a te są zlokalizowane i tanie.
2. **Wyrzucenie wiedzy wbudowanej.** 700k SLOC zawiera lata poprawek fizyki, przypadków brzegowych
   sieci SN i zgodności z PowerFactory, zakodowanych w złotych sieciach i testach analitycznych.
   Clean-room musi tę wiedzę odzyskiwać błąd po błędzie (klasyczny efekt drugiego systemu).
3. **Ruchoma specyfikacja.** Rebuild przy działającym produkcie = freeze funkcjonalny na kwartały
   albo ściganie dryfującej specyfikacji. Oba warianty są droższe niż całe M0–M3 z audytu.
4. **Ekonomia.** Uczciwa wycena parytetu funkcjonalnego: 12–24 osobomiesiące inżynierskie minimum
   (fizyka + walidacja + 13k testów portowanych + UI przemysłowe SLD), przy ryzyku regresji fizyki
   niemierzalnym do końca programu. Alternatywa (§4–§6) osiąga osie 10x w tygodniach.

**Wniosek:** „stare jako spec + testy charakteryzacyjne + pętla do zielonego" — TAK, dokładnie tak
pracujemy (§7). „Od zera całość" — NIE; od zera budujemy wyłącznie wycinki wskazane w §5/F1, gdzie
stary kod jest cienki (perymetr API) albo gdzie zawartość ma ujemną wartość (posypka wyjątków).

---

## 3. Definicja „10x" — mierzalne osie (bez metryk to slogan)

| Oś | Dziś (dowód) | Cel 10x | Pomiar „done" |
|---|---|---|---|
| Współbieżność | wszystkie żądania serializują się na event-loopie | N równoległych solve bez degradacji | test obciążeniowy: p95 latencji API stabilne przy K=10 równoległych przebiegach |
| Wdrażalność/bezpieczeństwo | 0 auth, sekrety w repo, DEBUG=true | uwierzytelnione mutacje, sekrety w env, prod-compose | 0 nieuwierzytelnionych endpointów mutujących (test-walker po OpenAPI) |
| Egzekwowanie jakości | 32/79 guardów, mypy 300 błędów niebramkowane | 100% guardów tier-1 blokujących; mypy no-new-errors → burn-down | CI czerwone na nowy błąd mypy; rejestr tieringu guardów |
| Modyfikowalność rdzenia | god-file 6 906 linii, wyjątki połykane | moduły ≤800 linii, błędy propagowane + logowane | czas bezpiecznej zmiany operacji domenowej; 0 połkniętych wyjątków (test) |
| Widoczność poprawności | walidator może paść „cicho" | strukturalne błędy + logi + telemetria | test charakteryzacyjny ścieżek błędów (§4.3) |
| Jakość produktu (SLD/UX) | klasa wzorca SCADA osiągnięta w overview (sesja 2026-06) | pełne domknięcie SLD-v2, LOD płynne na dużych sieciach | budżety klatek + testy kontraktowe v2 |

---

## 4. Harness charakteryzacyjny — „testy, które łapią wszystko, co system robi dziś"

**Większość już istnieje** (to jest właśnie ukryty skarb repo). Realna praca to 4 luki na szwach:

1. **Charakteryzacja powierzchni API (KRYTYCZNE, przed jakąkolwiek chirurgią).** Dziś ~153 testy API
   na 35 routerów. Dodać: (a) snapshot OpenAPI zamrożony w repo + test diffu; (b) golden
   request→response dla każdego endpointu mutującego i każdego uruchamiającego analizę
   (fixture: złote sieci). Efekt: dowolna przebudowa wnętrza jest mierzalna na szwie.
2. **Scenariuszowe goldeny E2E.** N referencyjnych projektów → wszystkie analizy → zamrożone hashe
   ResultSet/proof (rozszerzenie istniejących `tests/golden/` + determinism-suites o pełny
   przebieg „projekt→wyniki→eksport").
3. **Charakteryzacja ścieżek błędów `domain_operations`.** Najpierw ZAMROZIĆ dzisiejsze zachowanie
   (co dziś wraca jako „brak problemów" mimo wyjątku), potem świadomie zmienić kontrakt (F2) —
   z wpisem w rejestrze zmian, nie po cichu.
4. **Goldeny wizualne frontu.** Harness screenshotowy już działa (pętla SLD 2026-06); dodać
   zamrożone rendery kanonicznych widoków (overview/stacja/GPZ) jako artefakty porównawcze CI
   (progowe porównanie, nie pixel-perfect).

**Reguła programu: żaden wycinek nie jest przebudowywany, dopóki jego szew nie ma charakteryzacji.**

---

## 5. Program przebudowy (strangler; pętla per wycinek; zero bytów równoległych)

Zasada z kanonu repo obowiązuje w całym programie: **żadnych shadow-modeli i duplikatów ścieżek** —
nowy wycinek zastępuje stary w tym samym PR, w którym stary znika (przełącznik = szew testowy,
nie feature-flag żyjący miesiącami).

### F0 — Siatka bezpieczeństwa (≈1 tydzień) [w większości = M0 audytu]
Bramkowanie mypy (baseline no-new-errors metodą stash→baseline→pop, sprawdzoną 2026-06), ruff/black
w CI, tiering guardów (tier-1 blokujące w CI, tier-2 nightly, tier-3 do kasacji z uzasadnieniem),
naprawa semantyki guardów liczników (≥N zamiast ==N), luki charakteryzacyjne §4.1–4.4.

### F1 — Perymetr: JEDYNA strefa uczciwego „from scratch" (≈1–2 tygodnie) [= M1 audytu]
Stary perymetr jest cienki — tu rebuild jest tani i słuszny: dependency auth (klucz API /
`secrets.compare_digest`, allowlista read-only), sekrety→env + `DEBUG=false` + prod-compose,
offload blokującej pracy (`asyncio.to_thread` / de-async czystych handlerów; uwaga na UoW w wątku
i lock per aktywny case), usunięcie nieużywanych zależności z CVE (jose/passlib/ecdsa).

### F2 — Rdzeń: kontenment → ekstrakcja (≈2–4 tygodnie)
`domain_operations.py`: najpierw logging + kontrakt błędów (charakteryzacja §4.3 przed i po),
potem podział na rodziny operacji za zamrożonym szwem; realny guard cykli importów
(import-linter/grimp zamiast regexowej atrapy); burn-down mypy w 3 hotspotach
(`domain_operations.py` 44, `equation_registry.py` 22, `catalog/types.py` 19).

### F3 — Podsystemy wg go/no-go (ciągłe, per wycinek)
Kandydaci do przebudowy-w-miejscu (każdy: charakteryzacja → rebuild → stare znika w tym samym PR):
persystencja (async-native), dispatch analiz, konsolidacja SLD v1→v2 (v2 wygrał wizualnie — pętla
2026-06 dowiozła klasę wzorca SCADA; v1 do wygaszenia po parytecie kontraktów), eksporty.

### F4 — Delty produktowe 10x
Cele wydajnościowe z §3 (duże sieci, LOD, wirtualizacja), tryb wielu użytkowników (auth z F1 +
współbieżność z F1), domknięcia przemysłowe SLD z backlogu K30.

---

## 6. Tabele zadań

### F0 (6 zadań)
| # | Zadanie | Akceptacja | Effort |
|---|---|---|---|
| F0.1 | Baseline mypy + bramka no-new-errors w CI | canary-PR z nowym błędem = czerwone CI | M |
| F0.2 | ruff+black w CI backendu | job blokujący | S |
| F0.3 | Tiering 79 guardów (rejestr + wpięcie tier-1) | 100% tier-1 blokujących; lista tier-3 do kasacji | M |
| F0.4 | Semantyka ≥N w guardach liczników doc | dodanie testu nie psuje CI | S |
| F0.5 | Charakteryzacja §4.1–4.4 | snapshot OpenAPI + goldeny E2E + testy ścieżek błędów w repo | L |
| F0.6 | **WYKONANE 2026-07-25 (V12K-199).** Reanimacja workflowu „P0 Extended Guards" — padał tracebackiem na 3. z 15 kroków (guardy delta-owe wołały `git diff origin/main...HEAD` i `git diff HEAD~1` z `check=True`, a checkout bez `fetch-depth: 0` nie ma żadnego z tych refów), więc **12 guardów nigdy się w CI nie wykonało**: overlay no-physics, determinizm trace i scenariuszy, terminologia UI, forbidden terms, mojibake, kanon V12.xx, kontrakt severity, schemat ResultSet, port binding. Pomiar: 561 biegów workflowu, w próbce 30 najnowszych zero sukcesów; zero biegów na `main`. | wspólny helper `scripts/guard_diff_base.py` (fail-closed z przyczyną, nigdy wyjątek) + `fetch-depth: 0` + test regresyjny odtwarzający klon głębokości 1; wszystkie 15 kroków zielone lokalnie | S |

### F1 (6 zadań)
| # | Zadanie | Akceptacja | Effort |
|---|---|---|---|
| F1.1 | Dependency auth na mutacjach | walker OpenAPI: 0 otwartych mutacji | M |
| F1.2 | Sekrety→env, DEBUG=false, prod-compose | brak sekretów w repo (skan) | S |
| F1.3 | Offload solver/DB z event-loopu | test K=10 równoległych solve, p95 stabilne | L |
| F1.4 | Usunięcie CVE-deps nieużywanych | lockfile bez jose/passlib/ecdsa | S |
| F1.5 | README→właściwy kanon (hierarchia CLAUDE.md) | docs_guard zielony; sekcja source-of-truth poprawna | S |
| F1.6 | Port 8000/18000 — spójność docs/compose | smoke lokalny | S |

### F2 (4 zadania ramowe)
F2.1 logging+kontrakt błędów dispatchera (M); F2.2 podział god-file na rodziny operacji za szwem
(XL→rozbić per rodzina); F2.3 import-linter z kontraktami warstw (M); F2.4 burn-down 85 błędów mypy
w 3 hotspotach (L).

### F3/F4 — planowane per go/no-go po F2 (każdy wycinek wchodzi wyłącznie z charakteryzacją szwu).

---

## 7. Protokół pętli („loop until green" — dokładnie to, o co prosiłeś)

Per wycinek, w tej kolejności, bez wyjątków:
1. RED: napisz/rozszerz charakteryzację szwu (stare zachowanie zamrożone).
2. BUILD: przebuduj wycinek (nowy kod zastępuje stary w tym samym PR).
3. GREEN — pełne bramki, nie scoped (lekcja z incydentu CI 2026-06): pełny vitest (537 plików),
   pełny pytest, type-check, eslint, mypy-delta-0, guardy tier-1, guard liczników doc.
4. RENDER-AND-LOOK dla zmian wizualnych (harness screenshotowy + self-audyt vs wzorzec).
5. COMMIT z dowodem w opisie (liczby testów, hashe goldenów).
6. Powtarzaj do wyczerpania listy wycinków fazy; plateau/ryzyko regresji → STOP z raportem.

Ten protokół jest już zwalidowany w tym repo: pętla SLD 2026-06 dowiozła 11 commitów do klasy
wzorca SCADA z zerem regresji na pełnych bramkach.

---

## 8. Opcja clean-room v2 (jeśli mimo dowodów — decyzja właściciela)

Uczciwa cena: 12–24 osobomiesiące do parytetu; freeze produktu albo koszt dual-run; port 13k testów;
ryzyka: efekt drugiego systemu, ruchoma specyfikacja, niemierzalna do końca regresja fizyki.
**Bramki go/no-go, które by ją uzasadniały** (dziś żadna nie jest spełniona): (a) nieusuwalna wada
stosu (np. konieczność zmiany platformy/licencji), (b) pivot produktowy unieważniający kanon V12.xx,
(c) koszt utrzymania rdzenia > koszt odtworzenia (audyt pokazuje odwrotność: rdzeń jest zdrowy).
Jeśli kiedyś wejdzie: startować od §4 (charakteryzacja) i §3 (osie), nigdy od pustego repo.

---

## 9. Decyzje właściciela (blokują start) — ROZSTRZYGNIĘTE 2026-08-05

Pełnomocnictwo: dyrektywa właściciela 2026-08-05 („ty jesteś architektem i master
developerem projektu, podejmuj decyzje w zgodzie z wiedzą inżyniera energetyka").
Rozstrzygnięcia architekta:

1. **Ranking osi 10x** z §3 (co jest pierwsze: współbieżność? wdrażalność? velocity rdzenia?).
   **DECYZJA WŁAŚCICIELA (2026-08-05, nadpisuje wcześniejsze rozstrzygnięcie
   architekta): oś WDRAŻALNOŚCI (auth, sekrety poza repo, DEBUG off, perymetr)
   WYCOFANA Z ZAKRESU PROGRAMU — „nie robimy tego".** Obowiązujący ranking
   pozostałych osi: (1) współbieżność (odciążenie event-loopu — responsywność
   i ochrona determinizmu przy równoległych biegach analiz w jednej sesji),
   (2) velocity rdzenia (god-file, import-linter, mypy — praca ciągła w tle,
   nie brama).
2. **Ekspozycja sieciowa API** — czy wychodzimy poza localhost (zakres F1.1)?
   **DECYZJA WŁAŚCICIELA (2026-08-05): NIE — nie wychodzimy poza localhost.**
   System pozostaje narzędziem jednostanowiskowym; zakres F1.1 (auth/perymetr)
   NIE wchodzi do realizacji. Zadania F0/F1 dotyczące auth, sekretów i ekspozycji
   są poza programem do odwołania przez właściciela.
3. **Zgoda na program strangler F0→F4 zamiast big-bang** (rekomendacja tego planu) — albo świadome
   uruchomienie §8 z akceptacją wyceny.
   **DECYZJA: STRANGLER F0→F4.** Big-bang odrzucony: przepisanie od zera ryzykuje
   regresję zweryfikowanej fizyki (IEC 60909/60255, rozpływy, dowody) — dokładnie
   tego, co stanowi wartość systemu. Spójne z całą praktyką repo (zapadki, guardy,
   kontrakty FROZEN).
4. Timeline konsolidacji SLD v1→v2 (wpływa na F3).
   **DECYZJA: konsolidacja SLD wchodzi PO domknięciu audytu bramek U2–U5 (karta
   U-AUDYT), jako warunek wejścia w F3; fazy F0–F2 startują niezależnie i nie
   czekają na SLD.** Program SLD S1–S8 jest zamknięty w rejestrze, więc konsolidacja
   to porządkowanie toru renderowania, nie przebudowa funkcji.
5. Polityka długu mypy: freeze (F0.1) + burn-down hotspotów (F2.4) — potwierdzić budżet.
   **DECYZJA: POTWIERDZONA — freeze już obowiązuje (zapadka mypy_ratchet_guard,
   próg 20 błędów / 14 plików, wzrost = czerwona bramka); burn-down wyłącznie
   regułą zero-debt (plik dotknięty w karcie schodzi z listy błędów) plus
   pojedyncze karty hotspotów przy okazji fal F2 — bez odrębnego sprintu typowania.**
