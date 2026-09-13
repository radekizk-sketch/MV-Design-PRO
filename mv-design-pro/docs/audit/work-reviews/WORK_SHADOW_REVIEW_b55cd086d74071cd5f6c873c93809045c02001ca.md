# MV-DESIGN-PRO — INDEPENDENT WORK SHADOW REVIEW

Data przeglądu: 2026-09-13. Tryb: niezależny, adversarial, evidence-based. Kod, testy, progi i fixtures pozostawiono bez zmian; eksperymenty wykonano w izolowanym worktree. Checkpoint oznacza wykonanie przeglądu, nie akceptację całej gałęzi ani zamknięcie `pending_from_base`.

## REVIEW RANGE

- REVIEW_BASE_SHA: `575ce8263c7794d72ca6b5385730f4d2995067b5`
- REVIEW_HEAD_SHA: `b55cd086d74071cd5f6c873c93809045c02001ca`
- Rodzic HEAD: `74f2f17f3d73cc98fcd088127047562742d70caa`
- Merge base: `575ce8263c7794d72ca6b5385730f4d2995067b5`
- Branch: `claude/max-dynamic-audit-kzbivg`
- PR bieżącej gałęzi: brak. PR #475 pozostaje odrębnym PR dla `claude/opus5-dynamic-physics-audit-fixes`, HEAD `1e96202535abb0acfb123ebac8a49dae430e792c`.

Zakres: 14 commitów, 31 plików, około 7850 dodań i 415 usunięć. Dwa pierwsze commity utrwalały poprzedni audyt; 12 kolejnych wprowadziło m.in. re-inicjalizację algebraiczną, jawne bazy BESS, FRT ze śladu biegu, pomiar/evidence, walidację AVR/governor/PSS, ryzyko postaci modelu, układy wieloźródłowe i wielozdarzeniowe oraz rozszerzoną kwalifikację.

## EXECUTIVE VERDICT

**REJECT CURRENT DELTA**

Delta wnosi wartościowe mechanizmy badawcze i ma 9/9 zielonych workflowów, ale niezależne kontrprzykłady obalają trzy istotne deklaracje odbiorowe: diagnostyka re-inicjalizacji zeruje rzeczywistą zmianę napięcia, kontrakt wspólnej bazy BESS nie jest egzekwowany na granicy modelu, a kampania mutacyjna nie jest samowystarczalna bez opcjonalnego ANDES. Są to nowe P1, z czego błąd bazowy daje trwałą niespójność mocy i energii. Zieleń CI nie podnosi dynamiki do `VALIDATED_SIMULATION`, `PRODUCTION-READY` ani dowodu NC RfG.

## LEVELS OF VERIFICATION

- IMPLEMENTED: **TAK** dla deklarowanych modułów i testów.
- SOFTWARE-VERIFIED: **CZĘŚCIOWO**; 9/9 CI jest zielone, lecz niezależne kontrprzykłady wykryły błędy poza asercjami autora.
- MATHEMATICALLY VERIFIED: **NIE** dla pełnej delty; kontrakt baz BESS dopuszcza dwie sprzeczne interpretacje tej samej wartości p.u.
- NUMERICALLY VERIFIED: **CZĘŚCIOWO**; wyniki gładkiego SMIB są wspierające, ale diagnostyka zdarzeń i samowystarczalność mutacji są wadliwe.
- PHYSICALLY SUPPORTED: **CZĘŚCIOWO**; identyfikacja gałęzi i część porównań z ANDES są użyteczne.
- PHYSICALLY VALIDATED: **NIE**.
- PRODUCTION-READY: **NIE** dla laboratorium dynamicznego.
- REGULATORY-EVIDENCE-READY: **NIE**.

## NOWE P0/P1

### P1-B55-01 — diagnostyka re-inicjalizacji raportuje `delta_y=0`, mimo rzeczywistej zmiany napięć

**Twierdzenie.** `reinicjalizuj` zatwierdza nowy punkt pracy przed obliczeniem różnicy napięć. `_napiecia_odniesienia` odczytuje już nadpisane `_v_zatwierdzone`, więc diagnostyka porównuje `v_po` z `v_po` i może fałszywie dowodzić ciągłości części algebraicznej.

**Dowód wykonywalny.** Dla zmiany topologii niezależny scenariusz dał:

```text
actual_delta_y = 1.012071499245066
reported_delta_y = 0.0
reported_per_bus = (('GEN', 0.0), ('SYS', 0.0))
v_before = [1.00928872+0.075j, 1.0+0.0j]
v_after  = [7.50100929e-07-1.00928797e-05j, 1.0+0.0j]
```

**Reprodukcja.** Zainicjalizować silnik i zachować kopię `v_before`; wymusić zmianę topologii; wywołać `reinicjalizuj`; porównać `max(abs(v_after-v_before))` z diagnostycznym `delta_y`. Kontrprzykład jest niezależny od testu autora.

**Kryterium odbioru.** Snapshot stanu algebraicznego musi powstać przed każdą mutacją/zatwierdzeniem. Dla zmian niezerowych raportowana norma ma zgadzać się z normą obliczoną z zachowanego snapshotu w jawnej tolerancji. Test ma zabijać mutację zamieniającą `v_before` na `v_after`.

### P1-B55-02 — wspólna baza BESS jest opisana, lecz nie jest egzekwowana przez `ModelDynamiczny`

**Twierdzenie.** `MagazynEnergiiBESS` deklaruje wymóg `s_bazowa_mva == ModelDynamiczny.s_bazowa_mva`, ale konstruktor modelu nie weryfikuje tej równości. Ten sam sygnał `p=0.5 p.u.` oznacza wtedy inną moc po stronie sieci i zasobu.

**Dowód wykonywalny.** Model o bazie 100 MVA przyjął BESS o bazie 50 MVA:

```text
model_constructed = True
P_ac_pu = 0.5
P_ac_network_MW = 50.0
P_resource_inferred_MW = 25.0
energy_ratio = 0.5
```

Błąd skali wynosi 2:1 i nie maleje przy `dt -> 0`; jest błędem modelowania/jednostek, nie całkowania.

**Reprodukcja.** Utworzyć `ModelDynamiczny(s_bazowa_mva=100)` i dołączyć BESS z `s_bazowa_mva=50`, wymusić `p=0.5`, następnie przeliczyć moc na MW obiema bazami i całkę energii tym samym śladem czasu.

**Kryterium odbioru.** Konstrukcja/uruchomienie ma fail-closed dla niezgodnych baz albo wykonywać jedno jawne, audytowalne przeskalowanie w miejscu granicznym. Testy muszą obejmować ładowanie i rozładowanie, oba ograniczenia SOC, sprawność, jednostki MW/MWh i wykazać błąd bilansu malejący zgodnie z rzędem metody na gładkich odcinkach.

### P1-B55-03 — deklaracja kompletnej kampanii mutacyjnej zależy od opcjonalnego ANDES

**Twierdzenie.** `test_wzorzec_trajektoria.py` ma modułowe `pytest.importorskip("andes")`. Bez ANDES pomijany jest cały moduł, także wcześniejsze sondy niewymagające tej biblioteki. Mutant `M-KON-04` wskazuje cały plik jako jedyną sondę, zatem szybka kwalifikacja nie potwierdza deklarowanego kompletu.

**Dowód wykonywalny.** W izolowanym Pythonie 3.12 z NumPy 1.26.4 i pytest 7.4.4, bez ANDES:

```text
PYTHONPATH=research .venv/bin/python research/kwalifikacja.py --szybko
exit = 1
LUKA KWALIFIKACJI: ['M-KON-04']
mutacje_zabite = 12/13
przezyly = 1
M-KON-04 = SONDA_NIEWIARYGODNA
baseline = 1 skipped
```

Pozostałe 12 mutacji zostało zabitych. Wynik 12/13 jest właściwym zakresem tej niezależnej kampanii; nie raportowano wyjątku jako zabicia.

**Reprodukcja.** Uruchomić kwalifikację w środowisku spełniającym zależności podstawowe, lecz bez ANDES. Sprawdzić liczbę zebranych testów i wynik każdego mutanta.

**Kryterium odbioru.** Import opcjonalnej wyroczni przenieść do testów wymagających ANDES albo rozdzielić pliki. `M-KON-04` musi mieć co najmniej jedną niezależną, obowiązkową sondę. W środowisku bez ANDES kampania ma jawnie rozdzielać `KILLED`, `SURVIVED`, `NOT_RUN` i `ORACLE_UNAVAILABLE`; nie może deklarować pełnego wyniku.

## NOWE P2

### P2-B55-04 — „ALL schedule permutations” jest twierdzeniem szerszym niż wykonany eksperyment

Testy wyczerpująco enumerują jedynie permutacje trzech konkretnych zdarzeń (6), dwóch równoczesnych zwarć w wybranym układzie (24) oraz jeden przypadek `fault+clear`. Nie stanowi to dowodu dla wszystkich harmonogramów, typów zdarzeń, kolizji identyfikatorów i operacji nieprzemiennych. Należy raportować „all permutations of the enumerated finite scenarios”, a nie własność ogólną.

## PHYSICS SCORE

**PARTIALLY SUPPORTED.** Jawna tożsamość równoległych gałęzi usuwa wcześniejsze ciche rozpinanie całego korytarza dla badanego przypadku. Nie ma jednak pełnej walidacji modeli maszyny, GFL/GFM, DFIG, AVR/governor/PSS i ograniczników względem danych urządzeń. Błąd wspólnej bazy BESS obala pełną spójność fizyczną delty.

## MATHEMATICS SCORE

**PARTIALLY SUPPORTED.** Residua punktu pracy i wybrane równania regulatorów mają pomiary wspierające. Nie wykonano kompletnego przejścia równanie-po-równaniu dla maszyny, falowników i DFIG, a dopuszczona niezgodność baz oznacza brak jednoznacznego odwzorowania p.u. -> SI.

## NUMERICAL SCORE

**PARTIALLY SUPPORTED.** Dla gładkiego odcinka zmierzono oczekiwane rzędy: trapez około 25× przy pięciokrotnym zagęszczeniu i RK4 około 627×. Nie wolno przenosić tego na nieciągłości. Drabina ANDES 4 ms -> 0,5 ms spadła z `1.838e-4` do `3.354e-5 rad`, lecz ostatni iloraz tylko 1,22×; zbieżność do zera nie została wykazana. Dodatkowo diagnostyka re-inicjalizacji ukrywa niezerowy skok algebraiczny.

## ENERGY / NETWORK SCORE

**REFUTED dla deklaracji jednolitego łańcucha baz; PARTIALLY SUPPORTED dla naprawy gałęzi równoległych.** Kontrprzykład 100/50 MVA powoduje trwały błąd mocy i energii 2:1. Identyfikator gałęzi poprawia wybiórcze wyłączenie jednego toru, ale ogólne zdarzenia nakładające się, kolizje identity, KCL lokalne i bilans BESS po obu stronach ograniczeń pozostają w zakresie otwartym.

## CATALOG ENGINEERING SCORE

**UNRESOLVED.** Delta nie dostarcza nowych, niezależnie zweryfikowanych źródeł producentów dla znamion, CT/VT, zabezpieczeń ani topologii SN–TR–nN. Kompletność modelu/katalogu nie jest równoznaczna z weryfikacją źródła. Nadal obowiązuje zakaz fikcyjnych wartości i aparatów, w szczególności głównego wyłącznika stacji blokowej bez rozdzielnicy.

## CI DELTA

Dla dokładnego `b55cd086d74071cd5f6c873c93809045c02001ca` potwierdzono 9/9 `completed/success`:

| Workflow | Run ID | Klasyfikacja |
|---|---:|---|
| Python tests | 34769549909 | zielony |
| Frontend checks | 34769549929 | zielony |
| Frontend E2E smoke | 34769549923 | zielony |
| Frontend E2E full | 34769549912 | zielony |
| SLD Determinism Guards | 34769549943 | zielony |
| P0 Extended Guards | 34769549953 | zielony |
| Architectural And Repo Hygiene Guard | 34769549941 | zielony |
| Docs Integrity Guard | 34769549937 | zielony |
| Physics Label Guard | 34769549888 | zielony |

Niezależny celowany bieg na nieprzypiętej najnowszej wersji NumPy: `149 passed, 1 failed`; błąd wynikał z braku `np.trapz`. Klasyfikacja: **środowiskowa/zgodność wersji**, nie wykazana regresja repozytorium, ponieważ lock używa NumPy 1.26.4. Po przypięciu NumPy 1.26.4 nie odtworzono tego błędu. Zielone CI nie obala P1-B55-01..03, gdyż odpowiednie kontrprzykłady nie są asercjami tych workflowów.

## MUTATION STATUS

Zakres niezależny: izolowane środowisko Python 3.12, NumPy 1.26.4, pytest 7.4.4, bez ANDES, `kwalifikacja.py --szybko`.

- 12/13: **KILLED**.
- `M-KON-04`: **SURVIVED / SONDA_NIEWIARYGODNA** w tym środowisku, ponieważ jedyna sonda została pominięta modułowo.
- ANDES-dependent scope: **NOT RUN — ORACLE UNAVAILABLE**.
- Deklarowane przez autora 16/16: nie przyjęto jako niezależnie odtworzonego wyniku; katalog wykonywalny w badanym trybie zawierał 13 pozycji.

## STARE PROBLEMY — STATUS

### Zamknięte lub istotnie ograniczone

- Ciche wyłączenie obu równoległych torów przy wskazaniu jednego: **CLOSED dla jednoznacznego `Galaz.ident` i badanego scenariusza**.
- Pomiar trajektorii punkt-po-punkcie względem ANDES: **IMPLEMENTED / SOFTWARE-MEASURED** dla SMIB; nie jest walidacją wszystkich modeli.
- Punkt pracy i residua dla badanych przypadków: **SOFTWARE-VERIFIED** w podanym zakresie.
- P0/P1 dotyczące produkcyjnej proweniencji zwarciowej, `k_sc=1e308`, globalnego `ready` i nazewnictwa `SOURCE_REFERENCED`: pozostają zamknięte w zakresie wcześniejszych kontrprzykładów; bieżąca delta ich nie pogorszyła.

### Nadal otwarte

- Re-inicjalizacja po zwarciu: wcześniejsze `max delta x0=1.09421789`; nowa diagnostyka `delta_y` jest dodatkowo obalona przez P1-B55-01.
- Kompletny kontrakt NaN/Inf wejść i wyników.
- Bazy BESS i bilans energii: nowy P1-B55-02 pokazuje lukę na rzeczywistej granicy `ModelDynamiczny`.
- Identity zdarzeń i gałęzi poza jednoznacznym przypadkiem naprawionym przez `Galaz.ident`.
- Samodzielnie konstruowane evidence/FRT, pełne pokrycie czasu, brakujące kanały i łańcuch dowodowy.
- Globalizacja Newtona, stagnacja i kontrola niezbieżności.
- Rząd całkowania na zdarzeniach i przejściach limiterów, osobno od odcinków gładkich.
- PSS, nasycenie, ograniczniki AVR, anti-windup i zwalnianie ograniczeń.
- Schemat DAE rozdzielony kontra jednoczesny.
- Podłoga około `3e-5 rad` względem ANDES i nieuzgodniona semantyka nieciągłości.
- Profile normatywne OSD i dowód NC RfG: brak danych zewnętrznych, zakaz fabrykacji.
- Pełna proweniencja katalogów, CT/VT, zabezpieczeń i topologii SN–TR–nN.

## UNRESOLVED PROFESSORIAL QUESTIONS

1. Czy snapshot części algebraicznej ma być elementem transakcji zdarzenia i kiedy dokładnie następuje `commit` nowego punktu? **SOL CAN RESOLVE**.
2. Czy niezgodność bazy urządzenia z bazą sieci ma być odrzucana, czy jawnie przeliczana przez jeden kanoniczny adapter? **SOL CAN RESOLVE**.
3. Jak zdefiniować bilans energii BESS przy trafieniu w SOC min/max wewnątrz kroku, aby moc elektryczna i zasób były ograniczone w tej samej chwili? **SOL CAN RESOLVE**.
4. Jak rozdzielić obowiązkowe sondy mutacyjne od opcjonalnych wyroczni ANDES i raportować `NOT_RUN` bez fałszywego `KILLED`? **SOL CAN RESOLVE**.
5. Jaka wspólna semantyka czasu zdarzenia i interpolacji jest wymagana do oceny podłogi błędu ANDES? **SOL CAN RESOLVE**.
6. Czy kontrakt integratora pozostaje jednokrokowy, czy ma otrzymać jawny, niemutowalny kontekst historii dla BDF? Decyzja architektoniczna właściciela; nie blokuje napraw P1.
7. Jakie dokładne kanały, źródła danych obiektowych i kryteria OSD są wymagane przed jakąkolwiek promocją do dowodu NC RfG? Decyzja właściciela i dane zewnętrzne.

## ASTRA ESCALATION

Brak. Nowe P1 mają jednoznaczne kontrprzykłady i kryteria naprawy. **SOL CAN RESOLVE**.

## EXACT REPRODUCTIONS AND LIMITS

Eksperymenty wykonano w odłączonym worktree `/workspace/scratch/d840d6907656/review-b55`; audytowany kod nie został zmieniony. W oryginalnym checkout pozostawiono bez zmian istniejący, niezwiązany z audytem zmodyfikowany plik graficzny.

Nie wykonano pełnej walidacji urządzeń, HIL, prób obiektowych ani potwierdzenia OSD. Nie utożsamia się zgodności z ANDES dla jednego benchmarku z walidacją fizyczną całego laboratorium. Nie nadano statusu `VALIDATED_SIMULATION`, `PRODUCTION-READY` ani `REGULATORY-EVIDENCE-READY`.

## REVIEWER CHECKPOINT

`LAST_VERIFIED_SHA = b55cd086d74071cd5f6c873c93809045c02001ca`

`pending_from_base` pozostaje otwarte dla wszystkich niewykonanych kontroli oraz problemów wymienionych w sekcji „Nadal otwarte”. Przesunięcie checkpointu nie oznacza akceptacji gałęzi.
