# MV-DESIGN-PRO — INDEPENDENT WORK SHADOW REVIEW

Data: 2026-09-13. Tryb: adversarial, evidence-based; READ-ONLY wobec kodu produkcyjnego. Zmieniono wyłącznie dozwolone pliki raportowe. Checkpoint oznacza wykonanie przeglądu, nie akceptację ani zamknięcie niewykonanych kontroli.

## REVIEW RANGE

- REVIEW_BASE_SHA: `367a81a17e478f9dbea6f6b0a03bf191ba9318ba`
- REVIEW_HEAD_SHA: `3cfc75a11729aeec01b0b5ea8dfb258a622c3e06`
- Rodzic HEAD: `7ec36075378168e446018330d4dc1ad68779cd14`
- Merge base zakresu: `367a81a17e478f9dbea6f6b0a03bf191ba9318ba`
- Branch: `claude/max-dynamic-audit-kzbivg`
- PR: NONE. PR #475 pozostaje otwarty dla starszej gałęzi `claude/opus5-dynamic-physics-audit-fixes`, HEAD `1e96202535abb0acfb123ebac8a49dae430e792c`; nie obejmuje badanego HEAD.

Delta zawiera commity raportowe oraz trzy zmiany wykonawcze: kwantyzację wyłącznie eksportowanych fixtures nN, wydzielenie `branch_flow_trace` z ciężkiego wiersza biegu i naprawę manifestu/drabiny kwalifikacji integratorów. Nie reaudytowano całego repozytorium.

## EXECUTIVE VERDICT

**REJECT CURRENT DELTA**

P1-DELTA-39 i P2-DELTA-40 są naprawione dla dokładnych wcześniejszych reprodukcji: manifest wymaga teraz 4 metod × 4 kroki, odrzuca nieznane/duplikaty/zero/ujemne/NaN/Inf, a rząd jest liczony na trzech parach sąsiednich z oczekiwaniem przypiętym poza rejestrem implementacji. Niezależnie wykonana populacja 16/16 ma dodatnie, skończone błędy i oczekiwane rzędy na gładkim przypadku SMIB.

Klasa false-positive pozostaje jednak otwarta. Pole `zbiegl` nie ma sprawdzanego typu: tekst `"false"` jest prawdziwy w Pythonie. Komplet 16 rekordów z `zbiegl="false"` przechodzi zarówno selekcję danych, jak i listę pozycji niezbieżnych, dając `ZAKWALIFIKOWANE`. Brak pól `zbiegl` albo `blad_max_vs_odniesienie` powoduje niekontrolowany `KeyError` zamiast jawnego werdyktu fail-closed.

Wydzielenie `branch_flow_trace` zachowuje wspólny klucz `(run_id, fault_node_id)`, tę samą transakcję i uczciwe `None` dla starych danych; nie znaleziono nowego błędu fizycznego ani energetycznego w tej zmianie. Automatyczne DDL podczas `init_db` ma jednak wyścig między procesami.

Warstwa dynamiczna pozostaje `UNVALIDATED_MODEL`; nie jest `VALIDATED_SIMULATION`, dowodem NC RfG, produkcyjnym ani regulacyjnym dowodem.

## LEVELS OF VERIFICATION

- IMPLEMENTED: TAK dla manifestu 16 pozycji, czterostopniowej drabiny, kwantyzacji fixtures i wydzielonego śladu.
- SOFTWARE-VERIFIED: CZĘŚCIOWO; wykonano bezpośrednie sondy Python i rzeczywistą drabinę. `pytest` nie jest dostępny w runtime.
- MATHEMATICALLY VERIFIED: TAK dla wzoru rzędu i jego użycia na zmierzonych dodatnich błędach gładkiego przypadku; NIE dla całej dynamiki.
- NUMERICALLY VERIFIED: CZĘŚCIOWO; rzędy gładkiego SMIB wspierane pomiarem, ale parser dowodu daje false-positive.
- PHYSICALLY SUPPORTED: BEZ NOWEGO DOWODU MODELU; delta nie zmienia równań urządzeń.
- PHYSICALLY VALIDATED: NIE.
- PRODUCTION-READY: NIE dla dynamiki i kwalifikacji.
- REGULATORY-EVIDENCE-READY: NIE.

## NEW P0/P1

### P1-DELTA-41 — tekstowe `zbiegl="false"` ustanawia pozytywną kwalifikację

- Subsystem: research qualification / numerical evidence contract.
- Claim under test: pełny manifest oraz walidacja dziedziny uniemożliwiają zakwalifikowanie niezbieżnych wyników.
- Independent evidence: `kwalifikacja.py:465` używa prawdziwości obiektu (`if not pozycja.get("zbiegl")`), a `kwalifikacja.py:595` robi to samo przy wykrywaniu niezbieżności. Nie ma warunku `type(zbiegl) is bool`. Niepusty tekst `"false"` jest prawdziwy.
- Reproduction:

```bash
cd mv-design-pro
PYTHONPATH=backend/research:backend python - <<'PY'
from kwalifikacja import _luki_kwalifikacji, _braki_kwalifikacji, KROKI_DRABINY_KWALIFIKACJI_S
e={
 'euler_jawny':{.008:8.099443e-2,.004:3.328120e-2,.002:1.513408e-2,.001:7.223967e-3},
 'euler_niejawny':{.008:3.930221e-2,.004:2.315824e-2,.002:1.262421e-2,.001:6.597803e-3},
 'trapez_niejawny':{.008:6.411643e-4,.004:1.604116e-4,.002:4.010749e-5,.001:1.002742e-5},
 'rk4':{.008:3.692011e-7,.004:2.303647e-8,.002:1.438481e-9,.001:8.975262e-11}}
p=[{'integrator':m,'krok_s':h,'zbiegl':'false','blad_max_vs_odniesienie':e[m][h]}
   for m in e for h in KROKI_DRABINY_KWALIFIKACJI_S]
r={'mutacje':{'przezyly_krytyczne':[],'liczba_mutacji':13},
   'trajektoria_vs_andes':{'stan':'WYKONANE','status':'zgodne_w_granicach_wzorca'},
   'czas_krytyczny_zwarcia':{'stan':'WYKONANE','zgodne':True},
   'porownanie_integratorow':{'stan':'WYKONANE','pozycje':p},
   'residua_inicjalizacji':{'najgorsza_norma_pochodnej':8.3267e-17}}
l,b=_luki_kwalifikacji(r),_braki_kwalifikacji(r)
print(l,b,'ODRZUCONE' if l else ('NIEKOMPLETNE' if b else 'ZAKWALIFIKOWANE'))
PY
```

Wynik zmierzony: `[] [] ZAKWALIFIKOWANE`.

- Why it matters: ręcznie skonstruowany lub zdeserializowany obiekt dowodowy może kodować porażkę literalnie jako `"false"`, a bramka odczyta go jako sukces. Jest to bezpośredni false-positive łańcucha evidence → verdict.
- Existing Opus tests: NIE. Testy używają wyłącznie właściwych wartości logicznych.
- Expected engineering property: `zbiegl` musi należeć do jawnego typu/domeny; tylko dokładne `True` może wejść do oceny rzędu. Każdy inny typ/wartość musi dać kontrolowane `ODRZUCONE` lub `NIEKOMPLETNE`.
- Acceptance test: pełny iloczyn 16 pozycji z `"false"`, `"true"`, `1`, `0`, `None` i brakiem pola nie może uzyskać kwalifikacji; brak pola nie może kończyć nieobsłużonym wyjątkiem.
- Resolution: **SOL CAN RESOLVE**.

## NEW P2

### P2-DELTA-42 — automatyczne dodawanie kolumn w `init_db` nie jest bezpieczne między procesami

- Subsystem: persistence/schema evolution.
- Evidence: `db.py:88-106` wykonuje osobno `inspect/get_columns`, a następnie `ALTER TABLE ADD COLUMN`; blokada repozytorium jest procesowa i nie obejmuje dwóch instancji aplikacji. Dwa procesy mogą oba zobaczyć brak kolumny, po czym drugi dostaje `duplicate column`.
- Independent reproduction równoważnej sekwencji SQLite (bariera po odczycie schematu): dwa procesy zwróciły `[('OK',''), ('OperationalError','duplicate column name: branch_flow_trace_json')]`.
- Impact: wyścig dostępności przy równoległym starcie/rolling deployment; nie zmienia wyniku fizycznego, dlatego P2, ale przeczy produkcyjnej odporności migracji.
- Existing tests: NIE; sprawdzają sekwencyjną idempotencję jednego procesu.
- Acceptance test: dwa niezależne procesy inicjalizujące starą bazę równocześnie kończą sukcesem, a schemat zawiera jedną poprawną kolumnę i zachowane dane.
- Resolution: **SOL CAN RESOLVE**.

## PHYSICS SCORE

**UNRESOLVED DLA MODELI / SUPPORTED DLA BRAKU ZMIANY.** Delta nie zmienia równań maszyny, DER, BESS, AVR/governora ani zdarzeń. Wynik drabiny potwierdza zachowanie algorytmu na jednym gładkim SMIB, nie fizyczną adekwatność modelu. Wydzielenie śladu zwarciowego nie zmienia jego liczb ani adresowania punktu.

## MATHEMATICS SCORE

**PARTIALLY SUPPORTED.** Dla każdej pary dodatnich błędów i kroków zastosowano poprawny estymator `p=log(e2/e1)/log(h2/h1)`. Manifest oczekiwanego rzędu jest teraz odrębny od metadanych integratora. Nie ma nowej niezależnej analizy DAE, limiterów ani modeli urządzeń.

## NUMERICAL SCORE

**PARTIALLY SUPPORTED.** Niezależny bieg 4 metod × 4 kroki dał:

- Euler jawny: `p = 1.06694, 1.13691, 1.28312`; błąd przy 1 ms `7.22397e-3 rad`.
- Euler niejawny: `p = 0.93614, 0.87533, 0.76309`; błąd `6.59780e-3 rad`.
- trapez: `p = 1.99992, 1.99983, 1.99892`; błąd `1.00274e-5 rad`.
- RK4: `p = 4.00245, 4.00130, 4.00242`; błąd `8.97526e-11 rad`.

To wspiera teoretyczne rzędy na odcinku gładkim. Nie obejmuje zdarzeń ani przejść ograniczników. P1-DELTA-41 refutuje odporność samego werdyktu kwalifikacyjnego.

## ENERGY / NETWORK SCORE

**UNRESOLVED DLA DELTY.** Nie zmieniono równań energii/KCL/PQ/per-unit. Nie powtórzono pełnego bilansu BESS ani lokalnych residuów wszystkich szyn. Wydzielony `branch_flow_trace` pozostaje diagnostyką, nie niezależnym bilansem sieciowym.

## CATALOG ENGINEERING SCORE

**UNRESOLVED DLA DELTY.** Brak zmian danych katalogowych. Kwantyzacja dotyczy eksportowanych fixtures prezentacyjno-regresyjnych, nie rekordów katalogu ani wyników produkcyjnych. Kompletność `57/57` nadal nie oznacza produkcyjnej weryfikacji 23 rodzin ani proweniencji producenta.

## REVIEW OF OTHER DELTA CLAIMS

### Kwantyzacja fixtures nN

Zakres jest ograniczony do skryptu eksportu i wygenerowanych fixtures. Odcisk jest liczony po tej samej skwantowanej treści. Pięć cyfr znaczących usuwa wskazany szum `5.3e-12` z dużym zapasem, a test autora wymaga wykrycia każdej niezerowej zmiany względnej `1e-3`. Nie jest to dowód dokładności solvera ani prawo do kwantyzacji produkcyjnego wyniku. W tym ograniczonym znaczeniu claim deterministycznych fixtures jest **SUPPORTED**.

### Wydzielenie `branch_flow_trace`

Ślad oraz wkłady są rozdzielane razem, zapisywane w tym samym wierszu kluczowanym `(run_id,fault_node_id)` i tej samej transakcji. Odczyt starych rekordów zwraca `None`, nie pusty ślad. Nie znaleziono false-positive fizycznego/evidence wynikającego z samego wydzielenia. Testów persistence nie wykonano z powodu braku SQLAlchemy/pytest w runtime; ocena jest statyczna plus kontrprzykład DDL z P2-DELTA-42.

## CI DELTA

Dla dokładnego `3cfc75a11729aeec01b0b5ea8dfb258a622c3e06` GitHub zwrócił 0 workflow runs i 0 commit statuses (`state=pending`, `total_count=0`). Gałąź nie ma PR. PR #475 nadal wskazuje `1e962025...`. Deklaracja „wszystko zielone” nie ma dla badanego HEAD niezależnego potwierdzenia GitHub.

Lokalnie:

- `python -m pytest ...` → `No module named pytest`.
- jednokomendowa `research/kwalifikacja.py` wykonała się w `28.581 s`, jawnie podała brak ANDES i pandapower, `0/13` wiarygodnych zabić (sondy niewiarygodne z powodu braku pytest), `status_kwalifikacji=ODRZUCONE`; zachowanie fail-closed jest poprawne.
- niezależna drabina 16 pozycji została wykonana bez pytest; wartości podano wyżej.

Nie potwierdzono deklarowanych `12 063 + 11 989 + 866` testów ani `16/16` mutacji w tym runtime. W aktualnym katalogu kwalifikacji widocznych jest 13 mutacji.

## MUTATION STATUS

- Poprzedni mutant „brak metody/kroku”: **KILLED** — manifest zgłasza brak.
- Poprzednie mutanty `error=0`, `error<0`, NaN/Inf, nieznana metoda i duplikat: **KILLED**.
- Rozjazd oczekiwanego rzędu manifest/rejestr: **KILLED** przez jawną kontrolę.
- `zbiegl="false"` w pełnych 16 rekordach: **SURVIVED** — `ZAKWALIFIKOWANE`.
- Brak `zbiegl`: **KILLED BY EXCEPTION**, ale wynik to niekontrolowany `KeyError`, nie prawidłowy werdykt.
- Brak `blad_max_vs_odniesienie`: **KILLED BY EXCEPTION**, analogicznie `KeyError`.
- Pełna kampania autora: **NOT REPRODUCED**; lokalnie wszystkie 13 sond sklasyfikowano `SONDA_NIEWIARYGODNA`, a nie `KILLED`, ponieważ brak pytest. Uprząż poprawnie nie liczy wyjątku środowiskowego jako zabicia.

## PRIOR FINDINGS — STATUS

### Zamknięte lub ograniczone

- P1-DELTA-39: **CLOSED FOR EXACT PRIOR REPRODUCTIONS**; manifest 16 pozycji i dziedzina błędu działają. Klasa walidacji schematu pozostaje otwarta jako P1-DELTA-41.
- P2-DELTA-40: **CLOSED FOR SMOOTH BENCHMARK**; cztery kroki i trzy ilorazy są wykonane, oczekiwany rząd przypięty osobno.
- P1-DELTA-35/36: wcześniejsze dokładne reprodukcje pozostają zamknięte.
- P0-DELTA-24 (proweniencja tylko z MAX) i P0-DELTA-25 (NaN w dalszym wierszu SC): IMPLEMENTED/STATICALLY VERIFIED; pełny runtime nadal nierozstrzygnięty.
- P1-DELTA-26, P1-DELTA-27, P1-DELTA-33/34: dokładne reprodukcje pozostają zamknięte; P2-DELTA-37 nadal otwarty.

### Nadal otwarte P0/P1/P2

- P1-DELTA-28: historyczny wynik może otrzymać odcisk bieżącej implementacji przy konsumpcji.
- P2-DELTA-37: NaN w parametrach BESS może ominąć ochronę granicy kroku.
- P2-DELTA-38: dokumentacja/deklaracje mówiły 16/16, wykonywalny katalog kwalifikacji ma 13 mutacji.
- Re-inicjalizacja i zależność od historii po zwarciu/topologii: wcześniejszy `max Delta x0=1.09421789`.
- Pełna kontrola NaN/Inf wejść i wyników.
- Bazy BESS/per-unit i bilans energii po obu granicach SOC.
- Tożsamość eventów i równoległych gałęzi poza naprawionym przypadkiem jednego toru.
- Samodzielnie konstruowane evidence/FRT, kompletność czasu i brakujące kanały.
- AVR/governor/PSS, nasycenie, anti-windup i zwalnianie ograniczników.
- Schemat DAE rozdzielony kontra jednoczesny i podłoga porównania ANDES.
- Produkcyjna proweniencja katalogów, CT/VT, zabezpieczenia i topologia SN–TR–nN.
- Kolizja kodu `SI-115` jako luka śledzenia.

## UNRESOLVED PROFESSORIAL QUESTIONS

1. Czy kontrakt raportu ma formalny schemat typów przed obliczeniem werdyktu, czy dowolny `dict` pozostaje akceptowany? **SOL CAN RESOLVE**.
2. Jaki rząd i tolerancję wymaga się osobno na zdarzeniach oraz przejściach limiterów? **SOL CAN RESOLVE**.
3. Jaka część podłogi ANDES wynika z semantyki zdarzenia/adaptacyjnego kroku, a jaka z różnicy modelu? **SOL CAN RESOLVE**.
4. Jak ma być wersjonowana i synchronizowana ewolucja schematu bazy w wieloprocesowym wdrożeniu? **SOL CAN RESOLVE**.
5. Jak trwale związać historyczny wynik z odciskiem implementacji, która go policzyła? **SOL CAN RESOLVE**.

## ASTRA ESCALATION

Brak. P1-DELTA-41 jest jednoznacznie odtwarzalny; nie istnieją dwie wiarygodne interpretacje matematyczne. **SOL CAN RESOLVE**.

## EXACT REPRODUCTIONS AND EVIDENCE

```bash
git rev-parse HEAD
# 3cfc75a11729aeec01b0b5ea8dfb258a622c3e06
git show -s --format='%P' HEAD
# 7ec36075378168e446018330d4dc1ad68779cd14
git merge-base 367a81a17e478f9dbea6f6b0a03bf191ba9318ba HEAD
# 367a81a17e478f9dbea6f6b0a03bf191ba9318ba

cd mv-design-pro
PYTHONPATH=backend/research:backend python research/kwalifikacja.py
# status_kwalifikacji=ODRZUCONE; czas 28.581 s;
# ANDES/Pandapower POMINIETA; mutacje 0/13, SONDA_NIEWIARYGODNA (brak pytest).

PYTHONPATH=backend/research:backend python - <<'PY'
import math
from kwalifikacja import _porownanie_integratorow
p=_porownanie_integratorow(False)['pozycje']
for m in sorted({x['integrator'] for x in p}):
 v=sorted((x['krok_s'],x['blad_max_vs_odniesienie']) for x in p if x['integrator']==m)
 o=[math.log(e2/e1)/math.log(h2/h1) for (h1,e1),(h2,e2) in zip(v,v[1:])]
 print(m,v[0][1],o)
PY
```

Reprodukcja P1-DELTA-41 znajduje się w jego karcie. Reprodukcja P2-DELTA-42 użyła dwóch procesów SQLite zsynchronizowanych barierą po `PRAGMA table_info` i przed identycznym `ALTER TABLE ADD COLUMN`; jeden zakończył sukcesem, drugi `OperationalError: duplicate column name: branch_flow_trace_json`.

Repozytorium wykonawcze nie zostało zmodyfikowane. Raport przygotowano w odłączonym worktree wyłącznie w dozwolonej ścieżce audytu.

## REVIEWER CHECKPOINT

`LAST_VERIFIED_SHA = 3cfc75a11729aeec01b0b5ea8dfb258a622c3e06`

`pending_from_base` pozostaje otwarte dla wszystkich niewykonanych kontroli i wcześniejszych problemów wymienionych powyżej. Checkpoint nie oznacza akceptacji.
