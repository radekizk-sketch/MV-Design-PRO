# MV-DESIGN-PRO — INDEPENDENT WORK SHADOW REVIEW

Data przeglądu: 2026-09-12  
Tryb: READ-ONLY wobec kodu audytowanego; mutacje wyłącznie w izolowanych kopiach  
Znaczenie checkpointu: kod przejrzany, niezaakceptowany; zakres oczekujący zachowany

## REVIEW RANGE

Base:  
`64004a5d0f6f05f96677c95e307444e984b39dcc`

Head:  
`1ff13df9e475c75b50f04d017c8e155e9cd2bce5`

Merge base:  
`64004a5d0f6f05f96677c95e307444e984b39dcc`

Opus branch:  
`claude/max-dynamic-audit-kzbivg`

Zaobserwowany tip gałęzi:  
`07e3e16bf4a49ce6365c0bfcb54b76d06747eb28`; dwa commity po REVIEW_HEAD_SHA zapisują wyłącznie poprzedni raport audytowy.

PR:  
NONE dla tej gałęzi. Powiązany PR #475 pozostaje otwarty na `claude/opus5-dynamic-physics-audit-fixes`, HEAD `1e96202535abb0acfb123ebac8a49dae430e792c`, i nie obejmuje tej delty.

Zakres delty: jeden commit implementacyjny, 7 plików, 1064 dodane i 3 usunięte linie. Dodano ramę mutacyjną, katalog 16 scenariuszy, jednokomendową uprząż kwalifikacyjną, testy i dokumentację. Nie zmieniono równań urządzeń, sieci ani integratorów.

## EXECUTIVE VERDICT

**REJECT CURRENT DELTA**

Uprząż odtwarza część podanych pomiarów: 16/16 według własnego katalogu, residuum inicjalizacji SMIB `8,3267e-17`, CCT `0,420879 s`, błąd względem ANDES `4,1022e-05 rad` dla kąta oraz `9,9472e-07 p.u.` dla prędkości. Niezależna wyrocznia potwierdziła także rząd 4 RK4, rząd 2 trapezów oraz lokalne KCL badanego SMIB.

Twierdzenie „16/16 zabitych, 0 luk krytycznych” zostało jednak sfalsyfikowane. Trzy rzeczywiste mutacje kodu — usunięcie walidacji wyniku, stały odcisk implementacji oraz zastąpienie RK4 metodą drugiego rzędu przy zachowaniu etykiety `rzad=4` — nadal dały 16/16 i przeszły wszystkie 15 nowych testów autora. Kampania nie wprowadza większości defektów opisanych nazwą; sprawdza własności poprawnego kodu, typy wyjątków albo etykiety.

Uprząż nie obejmuje bilansu energii BESS ani odporności na NaN/Inf. Oba wcześniejsze defekty odtworzono ponownie na REVIEW_HEAD_SHA. BESS oddał lub przyjął około `0,165848 kWh` przy zmianie zasobu tylko `0,040 kWh`, a NaN został rzutowany na granicę z `STRICT_CONVERGENCE`.

## POZIOMY WERYFIKACJI

- IMPLEMENTED: TAK — rama, katalog, raport JSON i testy istnieją.
- SOFTWARE-VERIFIED: CZĘŚCIOWO — nowe testy autora 15/15 przechodzą, lecz nie zabijają rzeczywistych mutantów; CI dokładnego SHA ma 5 czerwonych i 5 zielonych kontroli.
- MATHEMATICALLY VERIFIED: CZĘŚCIOWO — rzędy metod potwierdzone dla równań gładkich i badanego zdarzenia SMIB.
- NUMERICALLY VERIFIED: CZĘŚCIOWO — niezależna wyrocznia potwierdza RK4/trapez i KCL, lecz kontrakt NaN/Inf oraz klasyfikacja zbieżności są wadliwe.
- PHYSICALLY SUPPORTED: CZĘŚCIOWO — klasyczny SMIB i topologia dwutorowa mają wsparcie ilościowe.
- PHYSICALLY VALIDATED: NIE — zakres nie obejmuje regulatorów, ograniczników, BESS, GFL/GFM, DFIG, FRT i pełnych zdarzeń zwarciowych.
- PRODUCTION-READY: NIE.
- REGULATORY-EVIDENCE-READY: NIE.

## NEW P0/P1

### P1-DELTA-19 — kampania mutacyjna daje fałszywie dodatnie 16/16

Subsystem: verification / mutation testing / numerical and evidence integrity.

Claim under test: każda pozycja katalogu wprowadza nazwany defekt i sprawdza, czy rzeczywisty detektor go zabija.

Independent evidence:

1. `M-KON-01` i `M-KON-02` wyłącznie sprawdzają `issubclass(..., ValueError)`; nie konstruują błędnego wyniku.
2. `M-TOZ-02` sprawdza wyłącznie 64 znaki szesnastkowe; stałe `"0" * 64` przechodzi.
3. `M-NUM-02` sprawdza tylko, czy Euler i obiekt nazwany RK4 dają różne przebiegi; nie mierzy rzędu.
4. `M-NUM-01` porównuje tożsamość elementów enum; nie wywołuje zastoju Newtona.
5. `M-FIZ-03` mierzy różnicę norm po ręcznym przesunięciu kąta, ale nie sprawdza odrzucenia złego punktu startowego.

Reproduction w izolowanych kopiach:

```text
MUTANT A: zastąp WynikDynamiczny.__post_init__ przez pass
wynik: krótki kanał ACCEPTED; odwrócony czas ACCEPTED;
kampania: 16/16 ZABITA; testy autora: 15 passed.

MUTANT B: odcisk_implementacji() -> "0" * 64
wynik: stały odcisk zaakceptowany;
kampania: 16/16 ZABITA.

MUTANT C: Rk4.krok zastąpiony metodą punktu środkowego rzędu 2,
przy pozostawieniu deklaracji rzad=4
niezależnie zmierzony rząd: 2,055; 2,027; 2,014;
kampania: 16/16 ZABITA; testy autora: 15 passed.
```

Klasy `KONTRAKT` i `TOZSAMOSC` są dodatkowo wyłączone z `KLASY_KRYTYCZNE`; przeżycie w tych klasach nie powoduje niezerowego kodu wyjścia. Pusta kampania zwraca `bez_luk_krytycznych=True`.

Why it matters: raport może deklarować pełne zabicie mutacji mimo usunięcia mechanizmów chroniących interpretowalność trajektorii, tożsamość implementacji i teoretyczny rząd metody. Daje to fałszywą podstawę decyzji o gotowości.

Do existing Opus tests detect it: NIE. Wszystkie 15 nowych testów przeszły na mutancie A i C.

Acceptance test: każdy katalogowy mutant ma zmieniać rzeczywisty kod lub rzeczywiste wejście w sposób realizujący opisany defekt. Mutant musi przeżyć, jeśli odpowiadający detektor zostanie usunięty. Rząd należy mierzyć na drabinie kroku, walidację wyniku przez konstrukcję wadliwego wyniku, zbieżność przez rzeczywisty przypadek zastoju, a odcisk przez zmianę treści kodu i test zmienności. Pusta kampania i każde przeżycie P0/P1 muszą blokować kwalifikację.

SOL CAN RESOLVE.

### P1-DELTA-20 — porównywarka trajektorii akceptuje niepełne i wadliwe osie czasu

Subsystem: external oracle / trajectory evidence.

Claim under test: błąd punkt-po-punkcie jest obliczany na wspólnym, poprawnym i kompletnym zakresie danych.

Independent executable evidence:

```python
Przebieg([1, 2], [10, 20]).na_siatce([0, 1, 2, 3])
# [10, 10, 20, 20] — cicha ekstrapolacja wartościami brzegowymi

Przebieg([0, 1, 1, 2], [0, 1, 99, 2]).na_siatce([1])
# [99] — duplikat czasu zaakceptowany

Przebieg([0, 2, 1], [0, 2, 1]).na_siatce([1.5])
# [1] — niemonotoniczna oś zaakceptowana

Przebieg([0, 1], [0, NaN]).na_siatce([0.5])
# [NaN]
```

Przyczyną jest bezpośrednie użycie `numpy.interp` bez walidacji skończoności, ścisłej monotoniczności, równoległości serii i pełnego pokrycia wspólnej siatki.

Why it matters: skrócona lub uszkodzona wyrocznia może wytworzyć pozornie kompletny przebieg; wartości spoza zakresu są powielane, zamiast blokować wniosek. To narusza fail-closed evidence.

Do existing Opus tests detect it: NIE. Katalog mutacji nie atakuje klasy `Przebieg` z porównania ANDES.

Acceptance test: konstrukcja `Przebieg` odrzuca NaN/Inf, nierówne długości, duplikaty i niemonotoniczny czas. Porównanie musi wymagać pełnego pokrycia żądanego okna i zakazywać ekstrapolacji. Brak pokrycia daje stan nierozstrzygnięty, nie metrykę zgodności.

SOL CAN RESOLVE.

### P1-DELTA-21 — deklaracja „wszystko zielone” jest niezgodna z CI dokładnego SHA

Subsystem: CI / completion evidence.

Claim under test: HEAD `1ff13df9` ma wszystkie kontrole zielone.

Independent evidence z GitHub dla dokładnego SHA:

- `pytest`, job `103536265970`: FAILURE; 11928 testów backendu, 15 pominiętych, następnie black wykazał 3 niesformatowane skrypty i zakończył job kodem 1;
- `frontend`, job `103536265334`: FAILURE; 947 + 25 testów przeszło, ale bramka typów wykazała 16 naruszeń TypeScript;
- `SLD Contract Tests (Vitest)`, job `103536265300`: FAILURE; `vertical_length_probe` przekroczył wartości bazowe;
- `critical-real-backend-e2e`, job `103536265132`: FAILURE; 1 failed, 1 passed;
- `full-real-backend-e2e`, job `103536265409`: FAILURE; 17 failed, 391 passed;
- pięć pozostałych kontroli: SUCCESS.

Porównanie z bazą `64004a5d`: także 5 czerwonych i 5 zielonych kontroli. Większość długu jest odziedziczona; delta C go nie naprawia. Nie ma podstaw do przypisania wszystkich czerwieni nowemu commitowi, ale twierdzenie „wszystko zielone” jest fałszywe.

Why it matters: completion claim nie odpowiada stanowi integracyjnemu artefaktu na GitHub. Lokalny wybór podzbioru testów nie zastępuje CI dokładnego SHA.

Do existing Opus tests detect it: CI samo wykrywa czerwień; raport Opusa jej nie odzwierciedla.

Acceptance test: dla dokładnego implementation HEAD przedstawić zakończone wyniki wszystkich wymaganych workflowów i sklasyfikować każdą czerwień. „Wszystko zielone” wolno deklarować wyłącznie przy kompletnym zielonym zestawie.

SOL CAN RESOLVE.

## NEW P2

### P2-DELTA-22 — uprząż kwalifikacyjna nie ma kryteriów akceptacji metryk

`kwalifikacja.py` raportuje błędy ANDES, residua, CCT i porównanie integratorów, ale kod wyjścia zależy wyłącznie od `przezyly_krytyczne`. Dowolnie duży błąd trajektorii, brak wymaganej dokładności, brak porównania CCT z wartością analityczną albo niezbieżna pozycja integratora nie tworzą negatywnego werdyktu. Docstring `_czas_krytyczny` zapowiada porównanie z zamkniętym wzorem równych pól, lecz zwracany dokument zawiera tylko CCT z symulacji.

To jest użyteczna uprząż pomiarowa, ale nie kwalifikacyjna bramka przyjęcia. Status `UNVALIDATED_MODEL` ogranicza skutki, dlatego ustalenie ma P2, a nie P1.

### P2-DELTA-23 — dostępność pandapower nie dowodzi wykonania wyroczni w danym biegu

Sekcja `wyrocznie_zewnetrzne` sprawdza `find_spec` i import wersji. Uprząż wykonuje ANDES TDS, lecz sama nie wykonuje porównania pandapower. Pole `dowod_zewnetrzny_mozliwy` jest uczciwie nazwane „możliwy”; nie wolno przekształcać go w twierdzenie o wykonanym dowodzie przepływu mocy.

## INDEPENDENT NUMERICAL AND PHYSICAL EVIDENCE

### Odtworzenie uprzęży

Środowisko recenzenta: Python 3.12.14, NumPy 2.3.5, SciPy 1.18.1, ANDES 2.0.0, pandapower 3.5.4.

- pełna uprząż bez zewnętrznych pakietów: 13,65 s, 16/16, residuum SMIB `8,3267e-17`, sieć SN z DER `0`, CCT `0,42087890625 s`;
- po instalacji ANDES/pandapower: ANDES rzeczywiście wykonany; max `|Δδ|=4,1021671e-05 rad`, RMS `2,2025190e-05 rad`, max `|Δω|=9,9472002e-07 p.u.`, błąd punktu pracy `3,6759290e-09 rad`.

### Niezależna wyrocznia równań SMIB

Użyto zredukowanych równań:

`dδ/dt = 2π f_b (ω - 1)`

`dω/dt = [P_m - E'/(X'_d + X_l) sin δ] / (2H)`

Rozwiązanie referencyjne: SciPy DOP853, `rtol=2,3e-14`, `atol=2e-15`, `max_step=0,005 s`; zdarzenie rozdzielono dokładnie w `t=1 s`.

Obserwowane rzędy dla `dt=20, 10, 5, 2,5 ms`:

- RK4, odcinek gładki: `4,010; 4,003; 4,000`;
- RK4, zdarzenie dokładnie na siatce: `4,002; 4,004; 4,002`;
- trapez, odcinek gładki: `1,994; 1,999; 2,000`;
- trapez, zdarzenie: `1,997; 1,999; 2,000`.

Najgorsze lokalne residuum KCL badanego SMIB: około `9,94e-13 p.u.`, znormalizowane około `2,64e-12`; błąd zgodności mocy zespolonej około `9,97e-13 p.u.`. Czas i punkt wystąpienia są zapisane w surowym artefakcie reprodukcji.

### Lokalizacja podłogi ANDES

Dla `dt=4, 2, 1, 0,5, 0,25 ms` błąd kąta ANDES względem niezależnego rozwiązania wyniósł odpowiednio:

`1,838e-4; 6,897e-5; 4,098e-5; 3,352e-5; 3,486e-5 rad`.

Błąd przed zdarzeniem pozostał około `3,57e-9 rad`; maksymalny błąd występował po zdarzeniu. ANDES stosował w pobliżu przełączenia krok `0,1 ms`. Laboratorium RK4 względem tej samej wyroczni spadło z `1,55e-8` do `2,14e-13 rad`. Dowód lokalizuje podłogę w ścieżce ANDES/semantyce przełączenia tego przypadku, lecz nie rozstrzyga dokładnego mechanizmu wewnętrznego ANDES.

## PRIOR OPEN / CLOSED

### Nadal otwarte i ponownie odtworzone

- P0-DELTA-01, energia BESS: dla rozładowania przy `dt=0,00125 s` energia sieci `0,165847882 kWh`, zmiana zasobu `0,040000000 kWh`, residuum `0,125847882 kWh`; 1484 rzutowania. Dla ładowania wyniki mają przeciwne znaki i tę samą wartość błędu. Błąd nie zanika dla dt od 10 do 1,25 ms. W punkcie wewnętrznym bez rzutowania residuum było poniżej `2,2e-11 kWh`, więc defekt wiąże się z semantyką granicy, nie z samą jednostką całki.
- P1-DELTA-02, NaN: jawny krok z `dSOC/dt=NaN` został rzutowany do `1,0` i oznaczony `STRICT_CONVERGENCE`; po wstrzyknięciu NaN do silnika wynik miał `zbiegl=True`, `kazdy_krok_scisle_zbiezny=True`, dwa rzutowania i skończone sygnały.

### Nadal otwarte, poza zmienionym zakresem

- P0-DELTA-12: snapshot proweniencji nie jest związany z konsumowanymi liczbami zwarciowymi i nieistniejącym `run_id`;
- P0-DELTA-13: niepoprawny lub nieskończony `I_n` DER może dać autoryzowany wkład 0 A;
- re-inicjalizacja po topologii zwarciowej: historyczny pomiar `max Δx0=1,09421789`;
- pełny audyt baz BESS urządzenie–sieć;
- samodzielnie konstruowalne evidence i FRT dla brakujących kanałów;
- stabilna tożsamość nienazwanych gałęzi przy zmianie porządku danych;
- migracja kontraktu readiness w E2E;
- walidacja regulatorów AVR/governor, PSS, nasycenia, ograniczników i modeli DER.

### Zamknięte w poprzedniej delcie, potwierdzone w ograniczonym zakresie

- wyłączenie jednego jawnie nazwanego toru `TOR_B` pozostawia drugi tor czynny;
- rząd RK4 i trapezu dla gładkiego klasycznego SMIB oraz zdarzenia trafiającego dokładnie w siatkę;
- porównanie trajektorii z ANDES jest rzeczywiście wykonywane, gdy ANDES jest dostępny.

## PHYSICS SCORE

**PARTIALLY SUPPORTED**

Klasyczny SMIB, wpływ bezwładności i topologia dwutorowa mają ilościowe wsparcie. Bilans zasobowy BESS jest refutowany, a pozostałe urządzenia i regulatory nie zostały w tym zakresie niezależnie zwalidowane.

## MATHEMATICS SCORE

**PARTIALLY SUPPORTED**

Niezależne równania zredukowanego SMIB odtwarzają punkt pracy i dynamikę laboratorium. Kampania nie dowodzi poprawności ogólnych równań urządzeń, a ogranicznik BESS narusza spójność równania stanu z mocą elektryczną.

## NUMERICAL SCORE

**PARTIALLY SUPPORTED**

RK4 i trapez osiągają rzędy teoretyczne, a KCL/PQ badanego SMIB są na poziomie około `1e-12 p.u.`. NaN/Inf może jednak stać się ścisłą zbieżnością, a nowa kampania nie wykrywa degradacji RK4 do rzędu 2.

## ENERGY / NETWORK SCORE

**REFUTED**

Lokalna sieć SMIB spełnia KCL i bilans mocy z małym residuum. Fizyczny bilans energii BESS na obu granicach SOC pozostaje rażąco naruszony, dlatego łączny wynik nie może być wyższy.

## CATALOG ENGINEERING SCORE

**UNRESOLVED FOR CURRENT DELTA**

Delta C nie zmienia katalogów ani gotowości szablonów. Poprzednie ustalenia pozostają: 57/57 oznacza co najwyżej kompletność szablonów/capability, a nie 23/23 rodzin z niezależnie zweryfikowaną proweniencją producenta.

## CI DELTA

Względem REVIEW_BASE_SHA liczba kontroli pozostaje bez zmiany: 5 zielonych i 5 czerwonych. Nowa delta zwiększyła liczbę przechodzących testów backendu, ale nie ustanowiła zielonego CI.

- backend: `11928 passed, 15 skipped`; końcowa czerwień przez black dla 3 skryptów — dług odziedziczony względem bazy;
- frontend: testy funkcjonalne zielone, 16 błędów bramki typów — odziedziczone;
- SLD: `vertical_length_probe` nadal czerwony — odziedziczony;
- critical E2E: 1 failed / 1 passed — odziedziczona migracja readiness;
- full E2E: 17 failed / 391 passed — odziedziczone;
- nowa kampania badawcza: celowane testy 15/15 zielone, lecz nieskuteczne wobec wykonanych mutantów.

## MUTATION STATUS

- usunięcie walidacji `WynikDynamiczny`: **SURVIVED** — kampania 16/16, testy autora 15/15;
- stały odcisk implementacji: **SURVIVED** — kampania 16/16;
- RK4 zastąpione metodą drugiego rzędu z etykietą rzędu 4: **SURVIVED** — kampania 16/16, testy autora 15/15;
- rzeczywiste wyłączenie jednego jawnie nazwanego toru: **KILLED** przez pomiar Ybus;
- wyjątek scenariusza mutacyjnego nie jest liczony jako zabicie: **KILLED** na poziomie mechaniki ramy.

Wynik niezależny: 3 istotne mutacje przeżyły. Deklaracja „0 luk krytycznych” jest refutowana.

## UNRESOLVED PROFESSORIAL QUESTIONS

1. Czy architektura integratora ma pozostać jednokrokowa, czy zostać rozszerzona o jawny, niemutowalny stan historii dla BDF? **SOL CAN RESOLVE** przez przygotowanie dwóch kontraktów i benchmarków; decyzja Fable.
2. Jaką semantykę stanu i mocy przy granicy SOC przyjąć: dokładne wykrycie czasu trafienia, ograniczenie mocy w prawych stronach równania czy układ komplementarności? **ASTRA ESCALATION RECOMMENDED** tylko jeśli po pomiarach pozostaną dwie równoważne interpretacje architektoniczne. Obecny defekt i wymóg zachowania energii są jednoznaczne i nie wymagają Astry.
3. Jaka część podłogi około `3e-5 rad` wynika z kolejności Toggle w ANDES, a jaka z algorytmu TDS? **SOL CAN RESOLVE** przez porównanie stanów bezpośrednio przed i po zdarzeniu oraz ujednolicenie semantyki przełączenia.
4. Jakie progi akceptacji mają obowiązywać dla trajektorii, energii, KCL i modeli z ogranicznikami? **SOL CAN RESOLVE** po ustanowieniu zakresu użycia i niezależnego budżetu błędów.

## ESCALATION

Brak pakietu ASTRA. Nowe P1 mają jednoznaczne wykonywalne kontrprzykłady i mogą zostać rozwiązane przez SOL/Opus. P0 bilansu BESS jest fizycznie jednoznaczny: moc elektryczna i pochodna zasobu muszą opisywać ten sam przepływ energii.

## REPRODUCTION ARTIFACTS

Lokalne artefakty recenzenta, niewprowadzane do kodu produktu:

- `audit_1ff.py` — trzy izolowane kampanie oraz bilans BESS;
- `trajectory_1ff.py` — niezależna wyrocznia DOP853, drabina rzędu, KCL/PQ;
- `andes_floor_1ff.py` — lokalizacja podłogi błędu ANDES;
- `projection_nan.py` — NaN → rzutowanie → STRICT_CONVERGENCE;
- `qualification_andes_1ff.json` — pełny raport z ANDES 2.0.0;
- `independent_results_1ff.jsonl`, `trajectory_1ff.jsonl`, `andes_floor_1ff.jsonl` — surowe wyniki.

Repozytorium audytowane po eksperymentach: czyste; mutacje wykonano poza jego drzewem.

## REVIEWER CHECKPOINT

`LAST_VERIFIED_SHA = 1ff13df9e475c75b50f04d017c8e155e9cd2bce5`

Checkpoint oznacza zakres przejrzany, nie przyjęty. `pending_from_base` pozostaje otwarte zgodnie z sekcją PRIOR OPEN.
