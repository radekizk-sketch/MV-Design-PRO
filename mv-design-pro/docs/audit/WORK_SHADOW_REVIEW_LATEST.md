# MV-DESIGN-PRO — INDEPENDENT WORK SHADOW REVIEW

Data: 2026-09-13. Tryb: adversarial, evidence-based; READ-ONLY wobec kodu produkcyjnego. Zmieniono wyłącznie dozwolone pliki raportowe. Checkpoint oznacza wykonanie przeglądu, nie akceptację całej gałęzi ani zamknięcie zakresu `pending_from_base`.

## REVIEW RANGE

- REVIEW_BASE_SHA: `3cfc75a11729aeec01b0b5ea8dfb258a622c3e06`
- REVIEW_HEAD_SHA: `a6ee782cfb8b7735a389a4b3ae64287031ae1333`
- Rodzic HEAD: `6931a935a0e262358e825664d42d3defeb843375`
- Merge base zakresu: `3cfc75a11729aeec01b0b5ea8dfb258a622c3e06`
- Branch: `claude/max-dynamic-audit-kzbivg`
- PR: NONE. PR #475 pozostaje otwarty dla starszej gałęzi `claude/opus5-dynamic-physics-audit-fixes`, HEAD `1e96202535abb0acfb123ebac8a49dae430e792c`.

Zmiany wykonawcze po bazie: `f70df04e` — jawne zawężenie typów przy mapowaniu A→kA w pakiecie dowodowym aparatury; `a6ee782c` — naprawy P1-DELTA-41 i P2-DELTA-42. Pozostałe commity w zakresie są raportowe/scalające. Nie reaudytowano repozytorium poza zależnościami zmienionych miejsc.

## EXECUTIVE VERDICT

**ACCEPT CONDITIONALLY**

Oba dokładne znaleziska ostatniej recenzji zostały naprawione i niezależnie sfalsyfikowane ponownymi kontrprzykładami. Komplet 16 pozycji z `zbiegl="false"`, `"true"`, `1` albo `None` jest teraz odrzucany; tylko dokładne logiczne `True` kwalifikuje. Brak pola `zbiegl` albo błędu daje kontrolowany werdykt, nie `KeyError`.

Naprawa wyścigu DDL po błędzie `ALTER` wykonuje świeży odczyt schematu i tłumi wyjątek wyłącznie wtedy, gdy inny proces rzeczywiście utworzył oczekiwaną kolumnę. To zamyka dokładny wyścig bez dopasowywania komunikatu i bez fail-open dla ogólnej awarii DDL.

Warunki akceptacji: brak niezależnego uruchomienia testów SQLAlchemy/pytest i brak CI dla dokładnego HEAD uniemożliwiają poziom SOFTWARE-VERIFIED całej delty. Akceptacja dotyczy wyłącznie obecnych napraw, nie całej gałęzi. Dynamika nadal jest `UNVALIDATED_MODEL`; wcześniejsze P0/P1 pozostają otwarte. Nie wolno nadawać statusu `VALIDATED_SIMULATION`, produkcyjnego, regulacyjnego ani dowodu NC RfG.

## LEVELS OF VERIFICATION

- IMPLEMENTED: TAK dla P1-DELTA-41, P2-DELTA-42 i jawnego zawężenia typów A→kA.
- SOFTWARE-VERIFIED: CZĘŚCIOWO; niezależne sondy Python dla kwalifikacji wykonane, testów pytest/persistence/API nie wykonano z powodu brakujących zależności.
- MATHEMATICALLY VERIFIED: BEZ ZMIANY; delta nie zmienia równań ani estymacji rzędu.
- NUMERICALLY VERIFIED: SUPPORTED dla domeny flagi kwalifikacji; brak nowej weryfikacji metod całkowania.
- PHYSICALLY SUPPORTED: BEZ NOWEGO DOWODU; mapowanie A→kA zachowuje współczynnik `1/1000` i odmawia wartości nieliczbowych.
- PHYSICALLY VALIDATED: NIE.
- PRODUCTION-READY: NIE dla dynamiki; migracja DDL wymaga jeszcze wykonania w pełnym środowisku.
- REGULATORY-EVIDENCE-READY: NIE.

## NEW P0/P1

Brak nowych P0/P1 w badanej delcie.

## NEW P2

Brak nowego P2. Zastrzeżenie do P2-DELTA-42 pozostaje wyłącznie zakresowe: runtime nie zawiera SQLAlchemy, więc kodu migracji i testu dwuprocesowego nie uruchomiono bezpośrednio. Analiza kodu potwierdza jednak zachowanie fail-closed.

## INDEPENDENT VERIFICATION OF FIXES

### P1-DELTA-41 — CLOSED FOR EXACT REPRODUCTION

Uruchomiono ten sam pełny iloczyn 4 metod × 4 kroki z siedmioma wariantami:

| wariant `zbiegl` / pola | wynik | luki | wyjątek |
|---|---:|---:|---:|
| dokładne `True` | `ZAKWALIFIKOWANE` | 0 | nie |
| `"false"` | `ODRZUCONE` | 16 | nie |
| `"true"` | `ODRZUCONE` | 16 | nie |
| `1` | `ODRZUCONE` | 16 | nie |
| `None` | `ODRZUCONE` | 16 | nie |
| brak `zbiegl` | `ODRZUCONE` | 16 | nie |
| brak `blad_max_vs_odniesienie` | `ODRZUCONE` | 16 | nie |

Kod używa wartownika `_BRAK`, następnie wymaga `zbiegl is True`. Własne, nieosłonięte przebiegi po `p["zbiegl"]` i `p["blad_max_vs_odniesienie"]`, które powodowały `KeyError`, zostały usunięte. Testy autora obejmują dziewięć niedozwolonych wartości/typów, oba brakujące pola i stronę pozytywną.

### P2-DELTA-42 — CLOSED BY LOGIC; RUNTIME PARTIAL

W kodzie sprzed naprawy sekwencja `inspect → ALTER TABLE ADD COLUMN` była podatna na TOCTOU. Niezależny model SQLite z barierą przed odczytem schematu, odpowiadający pozycji bariery testu autora, wykonano 50 razy; każdy bieg dał jeden `OK` i jeden `OperationalError`, więc wyścig jest rzeczywisty i odtwarzalny.

Nowy kod łapie `SQLAlchemyError`, ponownie odczytuje kolumny z nowego inspektora i:

- gdy kolumna istnieje — uznaje, że konkurencyjny proces osiągnął cel;
- gdy kolumny nie ma — ponownie zgłasza oryginalny wyjątek.

Nie znaleziono ścieżki, która tłumiłaby awarię bez potwierdzenia stanu. Test autora sprawdza także pojedynczą kolumnę, zachowanie starego wiersza i `None` dla nowego pola. W tym runtime brak SQLAlchemy uniemożliwił bezpośrednie wykonanie testu.

### Mapowanie wielkości zwarciowych A→kA

`f70df04e` odrzuca `bool` i wartości nieliczbowe, zachowuje `None` jako uczciwy brak i dla `int|float` stosuje `float(wartosc)/1000.0`. Jest to właściwe wymiarowo. Nie dodano wartości zastępczej ani domyślnej. Import produkcyjnego modułu nie był możliwy w runtime (`networkx` nie jest zainstalowany), więc ocena jest statyczna.

## PHYSICS SCORE

**UNRESOLVED DLA MODELI / SUPPORTED DLA MAPOWANIA JEDNOSTEK.** Delta nie zmienia modeli maszyny, DER, BESS, sieci ani zdarzeń. Konwersja A→kA jest fizycznie poprawna, a typy nieliczbowe nie są fabrykowane jako wartości zwarciowe. To nie waliduje źródła ani proweniencji samego wyniku.

## MATHEMATICS SCORE

**PARTIALLY SUPPORTED, BEZ NOWEJ ZMIANY MODELU.** Warunek `zbiegl is True` jest poprawnym domknięciem dziedziny logicznej. Delta nie zmienia wzoru rzędu, równań DAE, regulatorów, ograniczników ani bilansów.

## NUMERICAL SCORE

**PARTIALLY SUPPORTED.** Usunięto false-positive kwalifikacji wynikający z niejawnej prawdziwości typów oraz wyjątki przy brakujących polach. Nie powtórzono drabiny integratorów, ponieważ jej kod nie zmienił się względem zweryfikowanego `3cfc75a1`; poprzedni pomiar gładkiego SMIB pozostaje ważny tylko dla tego zakresu. Zdarzenia i przejścia limiterów nadal są nierozstrzygnięte.

## ENERGY / NETWORK SCORE

**UNRESOLVED DLA DELTY.** Brak zmian w bilansie BESS, KCL, P/Q, Ybus i per-unit. Nie powtórzono audytu energii ani lokalnych residuów. Wcześniejsze problemy pozostają w `pending_from_base`.

## CATALOG ENGINEERING SCORE

**UNRESOLVED DLA DELTY.** Brak zmian katalogowych. `57/57` kompletności szablonów nadal nie jest dowodem produkcyjnej weryfikacji 23 rodzin ani proweniencji producenta.

## CI DELTA

Dla dokładnego `a6ee782cfb8b7735a389a4b3ae64287031ae1333` GitHub zwrócił 0 workflow runs i 0 commit statuses (`state=pending`, `total_count=0`). Gałąź nie ma PR; PR #475 nadal wskazuje starszy HEAD `1e962025...`. Deklarowane przez Opusa wyniki `62 passed`, `1750 passed`, `13/13` oraz zielone guardy nie mają niezależnego potwierdzenia z CI dla badanego SHA.

Lokalnie:

- kontrprzykłady kwalifikacji wykonano bezpośrednio i uzyskano wyniki z tabeli;
- `pytest`, SQLAlchemy, networkx, ANDES i pandapower nie są dostępne, więc nie udaje się wykonania pełnego zestawu;
- nie klasyfikuje się braku zależności jako regresji kodu.

## MUTATION STATUS

- `zbiegl="false"`: **KILLED** — 16 jawnych luk, `ODRZUCONE`.
- `zbiegl="true"`: **KILLED**.
- `zbiegl=1`: **KILLED**, mimo że `1 == True`; użycie `is True` poprawnie rozróżnia typ.
- `zbiegl=None`: **KILLED**.
- brak `zbiegl`: **KILLED BY VERDICT**, bez wyjątku.
- brak błędu: **KILLED BY VERDICT**, bez wyjątku.
- dokładne `True`: **ACCEPTED BY GATE** — kontrola przeciw stałemu odrzucaniu.
- wyścig DDL na kodzie sprzed naprawy: **REPRODUCED 50/50** w równoważnej sekwencji SQLite.
- pełna kampania 13 mutacji autora: **NOT REPRODUCED** w tym runtime.

## PRIOR FINDINGS — STATUS

### Zamknięte lub ograniczone

- P1-DELTA-41: **CLOSED FOR EXACT REPRODUCTION**.
- P2-DELTA-42: **CLOSED BY CODE LOGIC; DIRECT SQLALCHEMY RUNTIME PENDING**.
- P1-DELTA-39 i P2-DELTA-40: wcześniejsze dokładne reprodukcje pozostają zamknięte.
- P1-DELTA-35/36, P1-DELTA-26/27/33/34: wcześniejsze dokładne reprodukcje pozostają zamknięte w opisanym zakresie.
- P0-DELTA-24 i P0-DELTA-25: IMPLEMENTED/STATICALLY VERIFIED; pełny runtime nadal nierozstrzygnięty.

### Nadal otwarte P0/P1/P2

- P1-DELTA-28: historyczny wynik może otrzymać odcisk bieżącej implementacji przy konsumpcji.
- P2-DELTA-37: NaN w parametrach BESS może ominąć ochronę granicy kroku.
- P2-DELTA-38: deklaracje 16/16 kontra wykonywalny katalog kwalifikacji 13 mutacji.
- Re-inicjalizacja i zależność od historii po zwarciu/topologii: wcześniejszy `max Delta x0=1.09421789`.
- Pełna kontrola NaN/Inf wejść i wyników.
- Bazy BESS/per-unit i bilans energii po obu granicach SOC.
- Tożsamość eventów i równoległych gałęzi poza naprawionym przypadkiem jednego toru.
- Samodzielnie konstruowane evidence/FRT, kompletność czasu i brakujące kanały.
- AVR/governor/PSS, nasycenie, anti-windup i zwalnianie ograniczników.
- Schemat DAE rozdzielony kontra jednoczesny oraz podłoga porównania ANDES.
- Produkcyjna proweniencja katalogów, CT/VT, zabezpieczenia i topologia SN–TR–nN.
- Kolizja kodu `SI-115` jako luka śledzenia.

## UNRESOLVED PROFESSORIAL QUESTIONS

1. Jak formalnie walidować kompletny schemat całego raportu przed obliczeniem werdyktu, poza naprawionym polem `zbiegl`? **SOL CAN RESOLVE**.
2. Jaki rząd i tolerancję wymagać osobno na zdarzeniach i przejściach limiterów? **SOL CAN RESOLVE**.
3. Jaka część podłogi ANDES wynika z semantyki zdarzenia/adaptacyjnego kroku, a jaka z różnicy modelu? **SOL CAN RESOLVE**.
4. Jak trwale związać historyczny wynik z odciskiem implementacji, która go policzyła? **SOL CAN RESOLVE**.
5. Czy produkcyjne wdrożenie PostgreSQL wymaga wersjonowanej migracji zamiast automatycznego DDL przy starcie? **SOL CAN RESOLVE**.

## ASTRA ESCALATION

Brak. Naprawy są jednoznaczne; nie ma nierozstrzygniętego nowego P0/P1 z dwiema wiarygodnymi interpretacjami. **SOL CAN RESOLVE**.

## EXACT REPRODUCTIONS AND EVIDENCE

```bash
git rev-parse HEAD
# a6ee782cfb8b7735a389a4b3ae64287031ae1333
git show -s --format='%P' HEAD
# 6931a935a0e262358e825664d42d3defeb843375
git merge-base 3cfc75a11729aeec01b0b5ea8dfb258a622c3e06 HEAD
# 3cfc75a11729aeec01b0b5ea8dfb258a622c3e06

cd mv-design-pro
PYTHONPATH=backend/research:backend python - <<'PY'
# Zbuduj pełne 16 rekordów jak w raporcie 3cfc75a1 i dla wariantów
# True, "false", "true", 1, None oraz braków pól wywołaj kolejno:
# _luki_kwalifikacji(r), _braki_kwalifikacji(r).
# Wyniki: True -> ZAKWALIFIKOWANE; wszystkie złe/brakujące -> ODRZUCONE,
# 16 luk, 0 braków, bez wyjątku.
PY

python -m pytest -q backend/tests/research/test_kwalifikacja.py
# No module named pytest
```

Model wyścigu DDL: dwa procesy SQLite, wspólna stara baza, bariera przed `PRAGMA table_info`, następnie warunkowy `ALTER TABLE ADD COLUMN`; 50 uruchomień kodu sprzed naprawy dało `Counter({('OK','OperationalError'): 50})`.

Repozytorium wykonawcze nie zostało zmodyfikowane. Raport przygotowano w odłączonym worktree wyłącznie w dozwolonej ścieżce audytu.

## REVIEWER CHECKPOINT

`LAST_VERIFIED_SHA = a6ee782cfb8b7735a389a4b3ae64287031ae1333`

`pending_from_base` pozostaje otwarte dla wszystkich niewykonanych kontroli i wcześniejszych problemów wymienionych powyżej. Checkpoint nie oznacza akceptacji całej gałęzi.
