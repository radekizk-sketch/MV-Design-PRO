# MV-DESIGN-PRO — INDEPENDENT WORK SHADOW REVIEW

Data przeglądu: 2026-09-12
Tryb: READ-ONLY wobec kodu audytowanego; kontrprzykłady i próby wyłącznie poza kodem produktu
Znaczenie checkpointu: kod przejrzany, niezaakceptowany; zakres oczekujący zachowany

## REVIEW RANGE

REVIEW_BASE_SHA:
`1ff13df9e475c75b50f04d017c8e155e9cd2bce5`

REVIEW_HEAD_SHA:
`7fd4a8de5fa8b9cdd01b02f5d54444f1dfd10ff4`

Merge base:
`1ff13df9e475c75b50f04d017c8e155e9cd2bce5`

Opus branch:
`claude/max-dynamic-audit-kzbivg`

PR:
NONE dla tej gałęzi. Powiązany PR #475 dotyczy starszej gałęzi `claude/opus5-dynamic-physics-audit-fixes` i HEAD `1e96202535abb0acfb123ebac8a49dae430e792c`.

Stan zdalnej gałęzi sprawdzono przez `git ls-remote`: tip był równy REVIEW_HEAD_SHA. Delta ma 10 commitów, z czego cztery są implementacyjne: `56018f44` (BESS), `6acb008b` (skończoność i wiązanie biegu), `8835b0bd` (dwa biegi koordynacji i klasy reguł katalogowych), `148cbb4a` (ANDES, tolerancja kroku, kampania mutacyjna). Pozostałe commity są scaleniami albo zapisami raportów audytowych. Łącznie delta obejmuje 74 pliki, około 8004 dodanych i 1356 usuniętych linii.

## EXECUTIVE VERDICT

**REJECT CURRENT DELTA**

Delta zamyka kilka poprzednich wad w ograniczonym zakresie: NaN nie jest już rzutowany na granicę z `STRICT_CONVERGENCE`; porównywarka trajektorii odrzuca NaN, duplikaty, niemonotoniczny czas i ekstrapolację; jawnie nazwane gałęzie równoległe zachowują tożsamość; pięć nieuniwersalnych reguł katalogowych jest miękkimi ostrzeżeniami; globalne pole `ready` zastąpiono kompletnością modelu i mapą zdolności.

Nie można jednak przyjąć delty. W autorytatywnej koordynacji zabezpieczeń proweniencja jest wyprowadzana wyłącznie z biegu MAX. Bieg MIN może mieć `DEFAULT_FORBIDDEN`, a system nadal zwraca proweniencję `DEKLARACJA` i używa jego prądu. Dodatkowo NaN w dowolnym wierszu poza pierwszym przechodzi do mapy prądów i dzięki semantyce porównań IEEE akceptuje dowolną wartość z żądania. Oba kontrprzykłady naruszają wiążącą decyzję właściciela dotyczącą `k_sc` i wejść koordynacji.

Skalowanie tolerancji Newtona przez `(dt/0,005)^(p+1)` ma nieograniczoną stronę dla dużych kroków: trapez dla `x'=-x`, `dt=1 s` zwraca predyktor `x=0` jako `STRICT_CONVERGENCE`, choć dokładnym pierwiastkiem równania kroku jest `1/3`, a residuum wynosi `0,5`. Nowa bramka energii BESS zachowuje bilans równania stanu, ale nie jest niezmiennikiem dyskretnym: dla dozwolonej konfiguracji krok przeskakuje poniżej `soc_min` i zużywa ponad trzykrotnie dostępny zapas operacyjny.

Twierdzenie „wszystko zielone” jest fałszywe dla dokładnego SHA: 7 kontroli GitHub jest zielonych, 3 czerwone. Lokalna uprząż recenzenta zakończyła się kodem 1 i uczciwie wykazała brak ANDES, pandapower oraz pytest; nie wolno z tego biegu wyprowadzać pomiaru 11/11 ani 16/16.

## LEVELS OF VERIFICATION

- IMPLEMENTED: TAK — opisane moduły i bramki istnieją.
- SOFTWARE-VERIFIED: CZĘŚCIOWO — CI ma 7 sukcesów i 3 porażki; celowane kontrprzykłady ujawniają dwa obejścia autorytetu.
- MATHEMATICALLY VERIFIED: CZĘŚCIOWO — równania BESS są energetycznie spójne wewnątrz kroku, lecz tolerancja niejawnego równania nie zachowuje znaczenia dla dużych `dt`.
- NUMERICALLY VERIFIED: REFUTED dla pełnego kontraktu — istnieje ścisła zbieżność z residuum `0,5` i błędem stanu `1/3`.
- PHYSICALLY SUPPORTED: CZĘŚCIOWO — ograniczona maszyna klasyczna i jawna topologia dwutorowa mają wsparcie; konfiguracja BESS może przekroczyć granicę operacyjną.
- PHYSICALLY VALIDATED: NIE.
- PRODUCTION-READY: NIE.
- REGULATORY-EVIDENCE-READY: NIE.

## NEW P0/P1

### P0-DELTA-24 — `DEFAULT_FORBIDDEN` w biegu MIN nie blokuje koordynacji

- Subsystem: short-circuit authority / protection coordination.
- Claim under test: oba prądy używane do koordynacji — MAX i MIN — mają miarodajną proweniencję `k_sc`.
- Independent evidence: `wejscie_koordynacji_z_biegow()` buduje dwa wiązania i dwie mapy prądów, lecz zwraca `proweniencja_ze_snapshotu(bieg_max.snapshot)` tylko dla MAX. Endpoint następnie wywołuje `wymagaj_autorytetu(PROTECTION_COORDINATION, wejscie.proweniencja)`. Snapshot MIN nie jest sprawdzany pod kątem `k_sc`.
- Executable reproduction: dwa zakończone biegi tego samego `snapshot_hash`; MAX zawiera znacznik `DEKLARACJA` i `10000 A`, MIN zawiera `DEFAULT_FORBIDDEN` i `5000 A`. Wynik sondy:

```json
{"case":"min_default_forbidden","max_marker":"DEKLARACJA","min_marker":"DEFAULT_FORBIDDEN","authority_returned":["DEKLARACJA"],"differences":[]}
```

- Why it matters physically: prąd minimalny służy do czułości zabezpieczenia. Wynik zależny od nieautorytatywnego, domyślnego wkładu DER może ustanowić nastawę i twierdzenie o ochronie, mimo że właściciel jawnie tego zakazał.
- Do existing Opus tests detect it: NIE; testy wymagają dwóch biegów i wspólnej migawki, ale nie różnej proweniencji MAX/MIN.
- Acceptance test: każdy konsumowany bieg musi mieć własną, wyprowadzoną proweniencję. Dowolny `DEFAULT_FORBIDDEN`, brak śladu, nieznany znacznik, niepoprawny `I_n` lub wynik poza dziedziną w MAX albo MIN musi zablokować autorytatywną koordynację. Niezależne zdolności LOAD_FLOW/TOPOLOGY/SLD/EDITING pozostają dostępne.
- Resolution: **SOL CAN RESOLVE**.

### P0-DELTA-25 — NaN poza pierwszym wierszem biegu autoryzuje dowolny prąd koordynacji

- Subsystem: result contract / evidence binding / protection coordination.
- Claim under test: każda wartość prądu w mapie koordynacji jest skończona i zgodna z zapisanym biegiem.
- Independent evidence: wiązanie MAX/MIN jest liczone wyłącznie z pierwszego wiersza. `_prady_zwarciowe_biegu()` wykonuje `float(wartosc)` bez `isfinite` dla wszystkich kolejnych wierszy. Porównanie liczy `abs(podany - NaN)`; wynikiem jest NaN, a `NaN > tolerancja` jest fałszem. Endpoint konstruuje `FaultCurrentData` z wartości żądania, nie z mapy biegu.
- Executable reproduction: pierwszy wiersz każdego biegu jest poprawny, drugi `TARGET` ma `ikss_a=NaN`; żądanie podaje arbitralne `999999 A` dla MAX i `1 A` dla MIN. Wynik:

```json
{"run_max_target":"nan","run_min_target":"nan","request":[{"location_id":"TARGET","ik_max_3f_a":999999.0,"ik_min_3f_a":1.0}],"differences":[]}
```

- Why it matters physically: arbitralne prądy mogą wejść do nastaw, selektywności i oceny czułości pod etykietą potwierdzenia przez solver. Zawyżenie MAX i zaniżenie MIN może jednocześnie fałszować oba końce oceny zabezpieczenia.
- Do existing Opus tests detect it: NIE; nowe testy NaN dotyczą laboratorium dynamicznego i pierwszego wiązanego wiersza, nie mapy wielowierszowej koordynacji.
- Acceptance test: walidować kompletny artefakt obu biegów przed zbudowaniem jakiejkolwiek mapy; każda wymagana wielkość musi być obecna, skończona i dodatnia w odpowiedniej dziedzinie. Porównanie musi jawnie odrzucać nieskończone wartości po obu stronach. Koordynacja powinna konsumować liczby z biegu, a payload traktować wyłącznie jako echo.
- Resolution: **SOL CAN RESOLVE**.

### P1-DELTA-26 — skalowanie tolerancji daje fałszywe `STRICT_CONVERGENCE` dla dużego kroku

- Subsystem: implicit integration / nonlinear convergence.
- Claim under test: `STRICT_CONVERGENCE` znaczy rozwiązanie równania kroku w zadanej dokładności.
- Independent evidence: `wspolczynnik_kroku=(dt/0.005)^(rzad+1)` skaluje tolerancję także w górę, bez ograniczenia. Dla trapezów i `dt=1` współczynnik wynosi `8·10^6`, więc predyktor może przejść bez jednej korekty Newtona.
- Executable reproduction:

```python
x, d = TrapezNiejawny().krok_ze_sprawozdaniem(
    lambda x, t: -x, np.array([1.0]), 0.0, 1.0
)
```

Wynik: `x=0`, `iterations=1`, `status=STRICT_CONVERGENCE`, `rho=0.6188118812`, `residual=0.5`. Dokładne rozwiązanie algebraicznego równania trapezów to `(1-dt/2)/(1+dt/2)=1/3`; błąd `0.3333333333`. Dla `dt=2` kod zwraca `x=-1`, residuum `2`, błąd `1`, nadal `STRICT_CONVERGENCE`.
- Why it matters mathematically: status nie opisuje rozwiązania własnego równania metody. Stabilność A-stabilnego schematu nie ma znaczenia, jeśli równanie kroku nie jest rozwiązywane.
- Do existing Opus tests detect it: NIE; drabiny autora obejmują małe kroki wokół kalibracji.
- Acceptance test: tolerancja rozwiązania równania kroku nie może stawać się luźniejsza od jawnie uzasadnionego kryterium przy zwiększaniu `dt`; przypadek liniowy musi osiągać pierwiastek do zadanej tolerancji albo zgłaszać niezbieżność, nigdy ścisły sukces z residuum `O(1)`.
- Resolution: **SOL CAN RESOLVE**.

### P1-DELTA-27 — okno SOC nie jest niezmiennikiem dyskretnym

- Subsystem: BESS / energy / integration.
- Claim under test: kierunkowa bramka energii uniemożliwia wykorzystanie zasobu poniżej `soc_min` i powyżej `soc_max`.
- Independent evidence: ciągła prawa strona zeruje moc na granicy, lecz stałokrokowy RK4 i trapez mogą przeskoczyć całe pasmo rampy. Ograniczenie stanu rzutuje dopiero do `[0,1]`, nie do `[soc_min,soc_max]`; brak warunku na `dt`, pojemność, moc i szerokość pasma.
- Executable reproduction: `E=0.001 MWh`, `Sbase=100 MVA`, `p=0.5 pu`, `soc0=0.11`, `soc_min=0.10`, `pasmo_soc=0.02`.

```text
RK4 dt=0.01000: soc_final=0.07527778, energia AC=0.03472222 kWh,
                 dostępny zapas do soc_min=0.01000000 kWh
RK4 dt=0.00500: soc_final=0.09263889
RK4 dt=0.00250: soc_final=0.10000000
trapez dt=0.01000: soc_final=0.07527778
```

Pełny silnik dla `soc0=0.5`, `dt=0.01` zwrócił `converged=true` i `soc_final=0.08397634 < 0.1`. Bilans mocy i pochodnej jest teraz spójny, ale system wykorzystuje zastrzeżony zapas poniżej operacyjnej granicy.
- Why it matters physically: limit SOC jest częścią zdolności BESS, a nie sugestią. Wynik zależy jakościowo od kroku i może obiecać energię, której model operacyjnie zabrania użyć.
- Do existing Opus tests detect it: NIE; przypadki autora mają krok dostatecznie mały względem stałej czasowej pasma.
- Acceptance test: wykazać nieprzekraczanie obu granic dla jawnie zadanej dziedziny `dt·P·S/(3600·E·pasmo)` albo zastosować dokładne trafienie/komplementarność/adaptację. Dla rozładowania i ładowania sprawdzić `ΔE` wobec całki mocy oraz brak mocy skierowanej poza okno.
- Resolution: **SOL CAN RESOLVE**.

### P1-DELTA-28 — odcisk implementacji historycznego biegu jest rekonstruowany z bieżącego kodu

- Subsystem: evidence identity / reproducibility.
- Claim under test: wiązanie wskazuje kod, który rzeczywiście policzył zapisany wynik.
- Independent evidence: `WiazanieWynikuZwarciowego.z_biegu()` jest wywoływane dopiero przy konsumpcji historycznego biegu. `rg` w `backend/src` pokazuje brak zapisu wiązania przy tworzeniu biegu; jedyne produkcyjne wywołania powstają w `application/autorytet_biegu_zwarciowego.py`. `odcisk_implementacji_zwarciowej()` czyta bieżące pliki i cache procesu. Po zmianie solvera stary wynik dostaje odcisk nowego kodu.
- Reproduction logic: (1) zapisać bieg przy kodzie A; (2) nie zmieniać jego `raw_result`; (3) uruchomić konsumenta przy kodzie B; (4) most tworzy wiązanie z odciskiem B i `niezgodnosci()` wobec B jest puste. Nie istnieje utrwalony odcisk A, z którym można porównać.
- Why it matters: wynik historyczny może zostać przypisany implementacji, która go nie policzyła. To unieważnia reprodukowalną tożsamość dowodu, choć nie jest podpisem odpornym na administratora magazynu.
- Do existing Opus tests detect it: NIE; testy tworzą i konsumują wiązanie w tej samej wersji procesu.
- Acceptance test: utrwalić identyfikator implementacji oraz wiązanie w atomowym artefakcie biegu podczas obliczenia. Konsument ma porównywać zapis z bieżącym kodem i nie może sam nadawać staremu wynikowi nowej tożsamości.
- Resolution: **SOL CAN RESOLVE**.

### P1-DELTA-29 — twierdzenie „wszystko zielone” nie odpowiada CI dokładnego SHA

- Subsystem: CI / completion evidence.
- Claim under test: cały zestaw integracyjny dla REVIEW_HEAD_SHA jest zielony.
- Independent evidence: dokładny SHA ma 10 zakończonych kontroli: 7 SUCCESS, 3 FAILURE.
  - `pytest`: `7 failed, 12063 passed, 15 skipped`; czerwienie dotyczą siedmiu oczekiwanych fixture JSON nN i są odziedziczone względem poprzedniego znanego stanu.
  - `full-real-backend-e2e`: `1 failed, 407 passed, 2 skipped`; industrial flow zwrócił około `101081462 B`, ponad limit `60 MiB`; klasa odziedziczona.
  - `Architecture and catalog-first repo hygiene`: nowa deterministyczna regresja dokumentacyjna — README izolacji badań nie wymienia `dynamic_lab/skonczonosc.py` i `dynamic_lab/sonda_mutacyjna.py`.
- Why it matters: lokalne podzbiory testów nie dowodzą zielonego artefaktu integracyjnego, a jedna czerwień została wprowadzona przez bieżącą deltę.
- Do existing Opus tests detect it: TAK — CI pokazuje porażki; claim ich nie klasyfikuje.
- Acceptance test: dopiero komplet zielonych wymaganych checków exact SHA albo jawna klasyfikacja każdej czerwieni bez deklaracji „wszystko zielone”.
- Resolution: **SOL CAN RESOLVE**.

## NEW P2

### P2-DELTA-30 — research isolation guard nie zna dwóch nowych modułów

Nowe `dynamic_lab/skonczonosc.py` i `dynamic_lab/sonda_mutacyjna.py` nie zostały dopisane do `backend/research/README.md`. Dedykowany guard kończy się czerwienią. Jest to wprowadzona, deterministyczna wada śladu izolacji, nie wada fizyki.

### P2-DELTA-31 — bieżący katalog ma 11 mutacji, więc claim `16/16` nie opisuje HEAD

`mutacje_laboratorium()` zawiera 11 obiektów `Mutacja`, nie 16. Lokalny pełny bieg uprzęży nie miał pytest i prawidłowo oznaczył wszystkie 11 jako `SONDA_NIEWIARYGODNA`, dając kod wyjścia 1; ANDES i pandapower także były jawnie `POMINIETA`. Nie jest to dowód, że mutacje przeżywają w środowisku CI, ale jest dowodem, że liczba `16/16` nie jest aktualną kardynalnością katalogu i nie została w tym runtime odtworzona.

### P2-DELTA-32 — twarde `Ics <= Icu` pozostaje maszynowo niesklasyfikowane

Dokumentacja kodu nazywa `Ics <= Icu` wymogiem normowym IEC 60947-2, lecz `klasa_reguly("Ics <= Icu (nN)")` zwraca `NIESKLASYFIKOWANA`, `hard=true`. Twardość jest zachowana, ale system nie rejestruje deklarowanej podstawy normowej. To luka audytowalności, nie kontrprzykład samej relacji.

## k_sc READINESS VERDICT

**REFUTED DLA CAŁEGO ŁAŃCUCHA AUTORYTATYWNEGO.**

Pozytywne ustalenia:

- `DEFAULT_FORBIDDEN` jest blokadą SI-110 dla zdolności zależnych od zwarcia;
- zestaw zależny obejmuje SC 3F/1F, ochronę, dobór zdolności wyłączalnej, koordynację, dowód wytrzymałości i dowód regulacyjny;
- LOAD_FLOW, TOPOLOGY, SLD i EDITING są jawnie niezależne i nie są blokowane;
- pojedynczy bieg pakietu doboru aparatury pobiera liczby z zapisanego biegu, a nie z payloadu;
- `k_sc·I_n=Inf` dostaje stan poza dziedziną zamiast autorytatywnego wyniku.

Ustalenie negatywne rozstrzygające: koordynacja używa dwóch biegów, ale autoryzuje tylko proweniencję MAX. `DEFAULT_FORBIDDEN` w MIN przechodzi. W połączeniu z P0-DELTA-25 system nie spełnia decyzji właściciela dla ochrony i dowodów zależnych od tej ścieżki. Wartość domyślna może pozostać w obliczeniu eksploracyjnym tylko z widocznym znacznikiem i bez możliwości podania wyniku jako wejścia autorytatywnego; aktualny kontrprzykład pokazuje, że tej separacji nie ma.

## CATALOG INVARIANT VERDICT

Niezależna klasyfikacja pięciu wskazanych reguł:

| Reguła | Klasyfikacja profesorska | Uzasadnienie |
|---|---|---|
| `R0 >= R1` | PLAUSIBILITY GUARD ONLY | Konstrukcja ekranu, żyły powrotnej i droga ziemna mogą dać nietypową relację; nie jest to prawo fizyki. |
| `P0 < Pk` | PLAUSIBILITY GUARD ONLY | Typowe dla transformatorów rozdzielczych, ale nie uniwersalne dla wszystkich rodzin i punktów odniesienia temperatury. |
| `Icw <= Icu` | PLAUSIBILITY GUARD ONLY | Zdolność krótkotrwałego przewodzenia i zdolność wyłączalna są różnymi znamionami; globalna nierówność nie wynika z definicji. |
| `0 < R/X < 1` | PLAUSIBILITY GUARD ONLY | Sieć SN bywa indukcyjna, lecz poprawny równoważnik rezystancyjny może mieć `R/X >= 1`; brak zadeklarowanej domeny produktu. |
| `0 < i0% < 10` | PLAUSIBILITY GUARD ONLY | Zakres jest sensowny dla typowych transformatorów rozdzielczych, nie dla wszystkich konstrukcji specjalnych. |

Implementacja zwraca dla wszystkich tych reguł `WIARYGODNOSC`, `hard=false`, `was_too_strong=true`. Jest to zgodne z klasyfikacją niezależną. `Ics <= Icu` może być twardą relacją normową dla tego samego aparatu i warunków znamionowych, lecz baza normowa powinna być zapisana maszynowo, nie tylko w komentarzu.

## 57/57 — TRUTHFULNESS AND PRECISE SCOPE

`57/57` jest prawdziwe wyłącznie jako metryka badanego zestawu szablonów:

- 57/57 materializuje się przez testowaną ścieżkę API;
- 57/57 nie ma `switch.catalog_ref_missing`;
- 57/57 ma strukturalnie kompletny model według obecnego kontraktu;
- 57/57 jest eligible dla LOAD_FLOW;
- tylko 31/57 jest eligible dla SC_3F; 26 szablonów DER jest zamierzenie zablokowanych przez brak miarodajnego `k_sc`.

Pole globalne `ready` zostało usunięte z endpointu na rzecz `kompletnosc_modelu` i mapy `zdolnosci`; E2E zostały zmigrowane do nowego kontraktu. To zamyka wcześniejsze zlepienie stanów w jednym boole'u.

`57/57` nie dowodzi 23/23 rodzin katalogowych production-ready, prawdziwości wartości producenta, osiągalności źródła, poprawności CT/VT, Icu, selektywności, `k_sc`, ani gotowości regulacyjnej. `FIELD_COMPLETE_SOURCE_REFERENCED` znaczy tylko: pola kompletne i istnieje referencja. Rekord z kompletnymi polami, lecz bez niezależnie weryfikowalnej proweniencji producenta, nie jest production-verified. Każde użycie „57/57 production-ready” albo „23/23 zweryfikowane produkcyjnie” nadal przeceniałoby dowód.

## PHYSICS SCORE

**PARTIALLY SUPPORTED.** Jawna tożsamość torów równoległych i badany model klasyczny mają wsparcie. BESS nie zachowuje operacyjnego okna SOC dla całej dopuszczonej domeny kroku. Brak niezależnego uruchomienia ANDES w tym runtime; wcześniejszych liczb nie przedstawia się jako nowego pomiaru.

## MATHEMATICS SCORE

**PARTIALLY SUPPORTED.** Bilans pochodnej SOC z mocą AC jest poprawiony i w sondzie bez rzutowania residuum energii było rzędu `1e-20 MWh`. Nieograniczone skalowanie tolerancji sprawia jednak, że predykat `rho<=1` przestaje znaczyć małe residuum równania dla dużego kroku.

## NUMERICAL SCORE

**REFUTED.** `STRICT_CONVERGENCE` z residuum `0.5` i błędem rozwiązania kroku `1/3` jest wykonywalnym kontrprzykładem. Dla małych kroków `0.005–0.5 s` ten sam liniowy przypadek dochodził do dokładnego pierwiastka, co lokalizuje defekt w skalowaniu, nie w formule trapezów.

## ENERGY / NETWORK SCORE

**PARTIALLY SUPPORTED.** Nowe równanie BESS nie tworzy już rozjazdu między mocą elektryczną i pochodną SOC w obrębie kroku, ale przeskok poniżej `soc_min` wykorzystuje energię spoza zadeklarowanego okna. Tożsamość nazwanych gałęzi równoległych jest poprawiona. Nie wykonano w tej delcie pełnego audytu KCL każdej sieci ani obu stron wszystkich limiterów.

## CATALOG ENGINEERING SCORE

**PARTIALLY SUPPORTED.** Pięć nieuniwersalnych nierówności poprawnie działa jako ostrzeżenie; `57/57` rozdzielono od zdolności SC i od 23 rodzin. Nadal nie ma niezależnej kwalifikacji wszystkich źródeł i danych producenta, a twarde reguły poza rejestrem pozostają `NIESKLASYFIKOWANA`.

## CI DELTA

Dokładny REVIEW_HEAD_SHA: 7 zielonych, 3 czerwone kontrole.

Zielone: V12K Extended Invariant Guards, critical-real-backend-e2e, SLD Guards (Python), Documentation integrity, blokada pól fizycznych w modalach, frontend, SLD Contract Tests.

Czerwone:

- `pytest`: 7 failed / 12063 passed / 15 skipped — odziedziczony zestaw fixture JSON nN;
- `full-real-backend-e2e`: 1 failed / 407 passed / 2 skipped — odziedziczony limit rozmiaru odpowiedzi industrial flow;
- `Architecture and catalog-first repo hygiene`: wprowadzona deterministycznie przez brak dwóch nowych modułów w README izolacji badań.

Względem poprzedniego review stan CI poprawił się ilościowo, ale nie jest całkowicie zielony. Nie przypisano czerwieni produktowej delcie bez dowodu.

## MUTATION STATUS

- NaN rzutowany na granicę z `STRICT_CONVERGENCE`: **KILLED** — obecny kod podnosi `WartoscNieskonczonaError` przed rzutowaniem.
- Niepełna/niemonotoniczna/NaN trajektoria i ekstrapolacja: **KILLED** — konstruktor albo interpolator odmawia.
- Wyłączenie jednego jawnie nazwanego toru jako wyłączenie całego korytarza: **KILLED** przez nową tożsamość i test permutacji; pełnego biegu pytest nie odtworzono lokalnie.
- MIN z `DEFAULT_FORBIDDEN`, MAX z deklaracją: **SURVIVED** — wejście koordynacji zwraca proweniencję deklarowaną.
- NaN w drugim wierszu wyniku koordynacji: **SURVIVED** — dowolny payload przechodzi porównanie.
- Duży krok trapezów, residuum `O(1)`: **SURVIVED** — status `STRICT_CONVERGENCE`.
- Przeskok BESS poniżej `soc_min`: **SURVIVED** dla `dt=0.01` i `0.005`, znika po zagęszczeniu.
- Katalog autora: 11 mutacji na tym HEAD. Lokalnie 0/11 było miarodajnie zabitych, bo pytest nie był zainstalowany; rama poprawnie oznaczyła wszystkie sondy jako niewiarygodne i zwróciła kod 1. Nie jest to wynik mutacyjny produktu, lecz fail-closed środowiska.

## PRIOR OPEN / CLOSED

### Zamknięte lub istotnie ograniczone w obecnej delcie

- poprzednie NaN -> projekcja -> `STRICT_CONVERGENCE`: zamknięte w celowanym kontrprzykładzie;
- poprzedni brak sprzężenia mocy BESS z energią: zamknięty dla ciągłej prawej strony; zastąpiony nowym P1 dotyczącym niezmiennika dyskretnego;
- porównywarka trajektorii przyjmująca ekstrapolację, duplikaty, niemonotoniczny czas i NaN: zamknięte;
- anonimowe gałęzie równoległe: obecnie jawny identyfikator jest wymagany, a adresowanie po parze odmawia przy niejednoznaczności;
- globalne `ready=57/57`: pole usunięte i zastąpione capability map.

### Nadal otwarte poza rozstrzygniętym zakresem

- re-inicjalizacja po zwarciu/topologii: poprzedni pomiar `max Δx0=1.09421789` nie został w tej delcie niezależnie zamknięty;
- pełny audyt baz BESS urządzenie–sieć, RMS/peak i MVA/MWh;
- samodzielnie konstruowalne evidence/FRT, brakujące kanały i pełne pokrycie czasu;
- trwała tożsamość implementacji historycznych wyników;
- regulatory AVR/governor, anti-windup, PSS, nasycenie i limitery;
- schemat rozdzielony DAE kontra jednoczesny;
- profile normatywne OSD — brak danych i obowiązuje zakaz fabrykacji;
- niezależna kwalifikacja producenta dla 23 rodzin katalogowych.

## UNRESOLVED PROFESSORIAL QUESTIONS

1. Jaka jest jawna, dopuszczona dziedzina stosunku `dt·P·S/(3600·E·pasmo_soc)` i jak ma być egzekwowana? **SOL CAN RESOLVE** pomiarem stabilności i kontraktem domeny.
2. Czy integrator ma pozostać jednokrokowy, czy otrzymać jawny, niemutowalny stan historii dla BDF? To decyzja architektoniczna, nie warunek naprawy obecnych P0/P1. **SOL CAN RESOLVE** przez dwa prototypy kontraktów i benchmarki.
3. Jakie kryterium akceptacji ma obowiązywać dla podłogi błędu ANDES i czy wzorzec o mierzalnym tłumieniu numerycznym może być komparatorem amplitudy? **SOL CAN RESOLVE** przez niezależną trzecią wyrocznię oraz budżet błędu; ANDES nie był dostępny w tym runtime.
4. Jak utrwalać tożsamość kodu i danych biegu tak, aby konsument historyczny nie rekonstruował jej wstecznie? **SOL CAN RESOLVE** przez wersjonowany artefakt wyniku.

## ASTRA ESCALATION

Brak. Nowe P0/P1 mają jednoznaczne kontrprzykłady i nie przedstawiają dwóch równorzędnych interpretacji matematycznych lub fizycznych. **SOL CAN RESOLVE**.

## EXACT REPRODUCTIONS AND EVIDENCE

Wszystkie sondy wykonano poza kodem produktu na czystym, odłączonym worktree REVIEW_HEAD_SHA.

```bash
# Fałszywa zbieżność trapezów
PYTHONPATH=mv-design-pro/backend/research python - <<'PY'
import numpy as np
from dynamic_lab.calkowanie import TrapezNiejawny
x,d=TrapezNiejawny().krok_ze_sprawozdaniem(lambda x,t:-x,np.array([1.]),0.,1.)
print(x,d.status,d.rho,d.residuum_maks,d.iteracje)
PY

# Pełna uprząż; w runtime recenzenta kończy się rc=1 fail-closed
PYTHONPATH=research:src python research/kwalifikacja.py
```

Skrypty recenzenta: `probe_7fd.py` (BESS), `probe_sc_7fd.py` (MIN provenance i NaN), `probe_numeric_7fd.jsonl` (trapezy), `probe_invariants_7fd.json` (klasy reguł), `qualification_7fd.json` (pełna uprząż). Nie zostały dodane do repozytorium.

Repozytorium audytowane przed zapisem raportu było czyste. Zapis audytu modyfikuje wyłącznie dwa dozwolone pliki raportowe.

## REVIEWER CHECKPOINT

`LAST_VERIFIED_SHA = 7fd4a8de5fa8b9cdd01b02f5d54444f1dfd10ff4`

Checkpoint oznacza „delta przejrzana”, nie „zaakceptowana”. `pending_from_base` pozostaje otwarte dla pozycji wymienionych w PRIOR OPEN oraz nowych P0/P1.
