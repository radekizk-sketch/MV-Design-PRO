# MV-DESIGN-PRO — niezależny shadow review remediacji

## REVIEW RANGE

| Pole | Wartość |
|---|---|
| REVIEW_BASE_SHA | `cac842855ca9acab9552435432492d85ddfe5bd0` |
| REVIEW_HEAD_SHA | `49bf0ab639eea4856e18db85a95e5aa78a25e118` |
| Gałąź Opusa | `claude/max-dynamic-audit-kzbivg` |
| PR | **NONE** dla tej gałęzi. PR #475 pozostaje otwarty na `claude/opus5-dynamic-physics-audit-fixes`, HEAD `1e96202535abb0acfb123ebac8a49dae430e792c`. |
| Merge base z `main` | `7e84753adbc4b0e50de9a1fd4f1022f1cfd01903` |
| Delta | 4 commity od punktu przeglądu: 2 niezmienne artefakty audytowe oraz 2 commity remediacji `c59aed7e`, `49bf0ab6`; 21 zmienionych plików względem `cac842855`. |
| LAST_VERIFIED_SHA | `49bf0ab639eea4856e18db85a95e5aa78a25e118` — punkt wykonania przeglądu, nie akceptacja całego SHA. |

Zakres audytu jest przyrostowy. Nie wykonano ponownego audytu całego repozytorium. Produkcyjnego kodu, testów, progów i fixtures nie zmieniono. Eksperymenty recenzenta były tylko odczytem i obliczeniami poza repozytorium.

## EXECUTIVE VERDICT

**REJECT CURRENT DELTA**

Remediacja istotnie poprawia ścieżkę uruchamiania nowych analiz: brak albo niepoprawne `k_sc` blokuje `SHORT_CIRCUIT_3F`, `SHORT_CIRCUIT_1F` i `PROTECTION`, a `LOAD_FLOW` pozostaje dostępny. Nie spełnia jednak całej wiążącej decyzji właściciela. Cztery zdolności nazwane jako chronione — `BREAKING_CAPACITY_SELECTION`, `PROTECTION_COORDINATION`, `SC_WITHSTAND_EVIDENCE`, `REGULATORY_EVIDENCE` — występują wyłącznie w wyliczeniu/zbiorze klasyfikacyjnym. Nie mają wykonywalnych punktów wywołania bramki. Nie zmieniono też kontraktu historycznego lub wstrzykniętego wyniku SC ani generatorów dowodów. Zatem `DEFAULT_FORBIDDEN` jest skutecznie blokowane przed zwykłym nowym biegiem, lecz nie wykazano i nie zaimplementowano zakazu wykorzystania już istniejącego lub dostarczonego wyniku jako autorytatywnego wejścia downstream.

Ponadto nowy predykat przyjmuje każdą dodatnią skończoną liczbę. Dla `k_sc=1e308` i `I_n=1000 A` źródło jest oznaczone `DEKLARACJA`, eligibility przechodzi, a właściwość `ik_sc_a = k_sc * I_n` zwraca `Inf`.

## NEW P0/P1

### P1-DELTA-07 — skończone `k_sc` może wytworzyć nieskończony prąd zwarciowy

- **Subsystem:** wkład zwarciowy przekształtnika / kontrakt wyniku.
- **Claim under test:** `math.isfinite(k_sc) and k_sc > 0` wystarcza, aby deklaracja była miarodajnym wejściem obliczenia.
- **Kod:** `network_model/core/wklad_zwarciowy_przeksztaltnika.py::_jest_liczba_skonczona_dodatnia`; `network_model/core/inverter.py::InverterSource.ik_sc_a`.
- **Niezależny kontrprzykład wykonywalny:** bieżący predykat dla `k_sc=1e308` zwraca prawdę. Następnie dla zwykłego dodatniego `I_n=1000 A` Python oblicza `1e308 * 1000.0 == inf`.
- **Dokładna reprodukcja:**

```bash
python3 -c 'import math; k=1e308; accepted=isinstance(k,(int,float)) and not isinstance(k,bool) and math.isfinite(float(k)) and float(k)>0.0; ik=float(k)*1000.0; print({"accepted_as_declaration":accepted,"k_sc":k,"in_rated_a":1000.0,"ik_sc_a":ik,"ik_is_finite":math.isfinite(ik)})'
```

Wynik:

```text
{'accepted_as_declaration': True, 'k_sc': 1e+308, 'in_rated_a': 1000.0, 'ik_sc_a': inf, 'ik_is_finite': False}
```

- **Znaczenie:** system może oznaczyć wejście jako miarodajną deklarację i dopuścić analizę, mimo że pierwsza wielkość fizyczna jest niefinitywna. To luka gotowości produkcyjnej i kontraktu wyników. Nie ustanawiam arbitralnego uniwersalnego górnego progu `k_sc`; wymagane jest co najmniej sprawdzenie skończoności wielkości pochodnej i jawna kontrola wiarygodności w kontekście urządzenia.
- **Istniejące testy:** nie wykrywają; macierz kończy się na NaN/±Inf/0/wartościach ujemnych i typach niepoprawnych, bez dużej skończonej liczby powodującej przepełnienie.
- **Kryterium odbioru:** żadna analiza nie może uzyskać statusu miarodajnej, jeśli `k_sc`, `I_n` albo ich iloczyn nie są skończone i dodatnie; błąd musi powstać przed obliczeniem/serializacją wyniku.

### P1-DELTA-08 — globalne `engineering-readiness.ready=57/57` nadal nie jest capability-scoped

- **Subsystem:** gotowość szablonów / komunikat produktu.
- **Claim under test:** rozdzielenie metryk usuwa możliwość pomylenia kompletności szablonu z gotowością konkretnej analizy.
- **Dowód:** bieżący test przypina równocześnie `engineering-readiness.ready = 57/57` i `SC_3F eligible = 31/57`; 26 szablonów DER bez miarodajnego `k_sc` ma zatem globalne `ready=True`, choć zdolność zwarciowa jest prawidłowo zablokowana. Endpoint i test nadal nazywają tę pierwszą wartość „pełną gotowością inżynierską”.
- **Reprodukcja:** uruchomić `test_szablon_osiaga_pelna_gotowosc_inzynierska` oraz `test_zwarcie_3f_jest_zablokowane_DOKLADNIE_tam_gdzie_brak_deklaracji_k_sc` dla dowolnego z 26 szablonów DER. Oczekiwany obecny stan: `ready is True` i `SC_3F` niekwalifikowane.
- **Znaczenie:** same liczby są prawdziwe jako odczyt dwóch różnych endpointów, ale globalna etykieta `engineering-readiness.ready` może zostać użyta jako ogólne potwierdzenie gotowości, czego wiążąca decyzja właściciela zabrania. Gotowość musi być wyrażona jako „kompletność modelu” albo jako mapa zdolności, nie jako globalne `ready` bez kwalifikatora.
- **Istniejące testy:** utrwalają ten stan zamiast go wykrywać.
- **Kryterium odbioru:** szablon DER bez miarodajnego `k_sc` może być kompletny strukturalnie i gotowy do LOAD_FLOW/TOPOLOGY/SLD, lecz żaden globalny status ani powierzchnia UI/API nie może przedstawiać go jako ogólnie gotowego inżyniersko; każda decyzja gotowości musi wskazywać zdolność.

## NEW P2

### P2-DELTA-09 — `FIELD_COMPLETE_SOURCE_VERIFIED` nie weryfikuje źródła

`inwentarz_katalogow.py::_klasa_zrodla` klasyfikuje rekord jako `DOKUMENT_ZEWNETRZNY`, gdy którekolwiek z pól `document_number`, `source_url`, `ptpiree_document_number`, `ptpiree_source_url` jest niepustym tekstem. Nie sprawdza osiągalności dokumentu, producenta, zgodności modelu ani wiązania wartości z dokumentem. Następnie cała rodzina może otrzymać klasę `FIELD_COMPLETE_SOURCE_VERIFIED`.

Kontrprzykład miernika: kompletny rekord z `source_url="x"` zostaje zaklasyfikowany jako źródło zewnętrzne. Dokumentacja prawidłowo zastrzega, że `FIELD_COMPLETE_*` nie oznacza `PRODUCTION_QUALIFIED`, więc nie jest to obecnie P1 produkcyjny. Nazwa `SOURCE_VERIFIED` jest jednak silniejsza od wykonywanego pomiaru.

Kryterium odbioru: klasa powinna nazywać wyłącznie obecność deklaracji źródła (`SOURCE_REFERENCED`) albo rzeczywiście sprawdzać tożsamość/osiągalność dokumentu i powiązanie wartości.

### P2-DELTA-10 — nowa remediacja pozostawia deterministycznie czerwoną bramkę zakresu modeli

CI `pytest` wykonało pełną suitę: `11763 passed, 14 skipped`, po czym osobny test guardu zakończył się `1 failed, 390 passed`. Dokładna porażka:

```text
Moduly-modele czytane przez warstwe objeta skanem, a nieujete w mapie pol:
['domain/dobor_aparatu_pola.py']
```

Jest to czerwień wprowadzona przez aktualny zakres zmian, deterministyczna, nie środowiskowa i nie numeryczna. Oznacza niekompletny zakres wyroczni `solver_input_substitute_guard`, nie wykazany błąd fizyczny doboru.

### P2-DELTA-11 — reguły `WIARYGODNOSC` nie tworzą trwałego wyniku przeglądu

Pięć przeklasyfikowanych reguł przestało być twardymi asercjami, co jest merytorycznie właściwe. Odstępstwo jest jednak tylko drukowane przez test do przechwytywanego stdout. Przy zielonym pytest nie powstaje strukturalny artefakt, kod ostrzeżenia ani blokada świadomej kwalifikacji rekordu. Reguła nie jest już fałszywą bramką, lecz twierdzenie „nadal raportuje odstępstwa” jest słabsze operacyjnie niż sugeruje dokumentacja.

## k_sc READINESS VERDICT

**PARTIALLY SUPPORTED / owner decision NOT FULLY SATISFIED.**

Potwierdzone programowo w delcie:

- `None` → `1.1`, `DOMYSLNE_SYSTEMOWE`, blokada `SI-110` dla nowego biegu SC 3F/1F i PROTECTION;
- NaN/±Inf/0/ujemne/bool/tekst → `DANE_NIEPOPRAWNE`, blokada `SI-111` albo odrzucenie operacji domenowej;
- dodatnia skończona deklaracja odblokowuje te analizy;
- `LOAD_FLOW` pozostaje dostępny;
- wyłączone źródło nie blokuje.

Granica nie jest kompletna:

- `BREAKING_CAPACITY_SELECTION`, `PROTECTION_COORDINATION`, `SC_WITHSTAND_EVIDENCE`, `REGULATORY_EVIDENCE` mają zero produkcyjnych punktów wywołania nowej bramki; w zmienionych źródłach ich nazwy występują wyłącznie w `zdolnosci_wkladu_zwarciowego.py`;
- żaden generator wyniku/dowodu ani kontrakt historycznego wyniku SC nie został zmieniony;
- wcześniejszy wykonywalny kontrprzykład ręcznie skonstruowanego evidence pozostaje nierozstrzygnięty; nie uruchamiano go ponownie, ponieważ jego konsumenci nie występują w delcie;
- bardzo duża skończona deklaracja może dać `Inf` po mnożeniu.

Wniosek: default 1.1 nie ustanawia już zwykłej gotowości do uruchomienia nowego SC/protection, ale nadal brak dowodu i wykonywalnej ochrony wszystkich autorytatywnych konsumentów wymaganych decyzją właściciela.

## CATALOG INVARIANT VERDICT

**PARTIALLY SUPPORTED.**

| Reguła | Niezależna klasyfikacja | Stan remediacji |
|---|---|---|
| `R0 >= R1` | PLAUSIBILITY GUARD ONLY | Prawidłowo przeklasyfikowana na `WIARYGODNOSC`; nie jest twardą bramką. |
| `P0 < Pk` | PLAUSIBILITY GUARD ONLY | Prawidłowo przeklasyfikowana na `WIARYGODNOSC`. |
| `Icw <= Icu` | PLAUSIBILITY GUARD ONLY, chyba że konkretna norma/rodzina jawnie narzuca relację | Dla SN przeklasyfikowana. Dla aparatury nN nadal twarda w `test_aparatura_nn_spelnia_relacje_zdolnosci_zwarciowych`; wcześniejsze zastrzeżenie nie jest więc zamknięte dla całej reguły. Icw i Icu opisują różne zdolności i muszą być oceniane dla tego samego wariantu, napięcia i czasu. |
| `0 < R/X < 1` | dodatniość: VALID DOMAIN CONSTRAINT; górna granica: PLAUSIBILITY GUARD ONLY | Prawidłowo rozdzielona; `R/X > 0` pozostaje twarde, `<1` jest wiarygodnością. |
| `0 < i0% < 10` | dodatniość wymagana dla wpisanej, mierzalnej wartości; `<10%`: PLAUSIBILITY GUARD ONLY | Cała relacja przeklasyfikowana na `WIARYGODNOSC`; brak pola jest osobno wykrywany przez gotowość LOAD_FLOW. |

Testy obu stron są użyteczne jako software verification, ale część z nich sprawdza bezpośrednio wyrażenie na syntetycznej dataclass, a nie rzeczywisty importer lub produkcyjny walidator. Nie są niezależnym dowodem producenta ani normy.

## 57/57 — CO DOKŁADNIE DOWODZI

Twierdzenie jest **prawdziwe wyłącznie po podaniu nazwy metryki**. Bieżąca suite CI potwierdza:

- materializacja API: 57/57;
- brak `switch.catalog_ref_missing`: 57/57;
- globalny endpoint `engineering-readiness.ready`: 57/57;
- LOAD_FLOW: 57/57;
- SC_3F: 31/57;
- SC_1F, SC_2F, FAULT_LOOP_NN, SWZ_NN: 0/57.

Nie dowodzi to 23/23 rodzin katalogowych gotowych produkcyjnie, poprawności danych producenta, zdolności wyłączalnej, selektywności, poprawności `k_sc` ani dowodu regulacyjnego. Dokument katalogowy obecnie mówi wprost, że `FIELD_COMPLETE_*` nie jest `PRODUCTION_QUALIFIED`; to sprostowanie jest uczciwe. Nadal zawyżona jest sama nazwa globalnego `engineering-readiness.ready` w zestawieniu z 26 szablonami DER niegotowymi do SC.

## PHYSICS SCORE

**PARTIALLY SUPPORTED.** Dobór przestrzeni aparatu z napięcia szyny i fail-closed dla napięcia nieustalonego są właściwe. Dobór `U_m aparatu >= U_n szyny` działa dla zbadanych klas 11→12, 15→17,5, 22→24 kV i jawnie odmawia bez klasy katalogowej. Granica k_sc nie obejmuje wszystkich autorytatywnych konsumentów, a przepełnienie iloczynu pozostaje możliwe.

## MATHEMATICS SCORE

**PARTIALLY SUPPORTED.** Predykat skończoności zamyka NaN/±Inf wejścia, ale nie zapewnia domknięcia działań arytmetycznych: iloczyn dwóch liczb skończonych może być nieskończony. Nie ma nowych zmian równań dynamicznych w tej delcie.

## NUMERICAL SCORE

**UNRESOLVED.** Delta nie zmienia integratora, globalizacji Newtona ani obsługi zdarzeń. Nie wykonano nowej drabiny dt. Wcześniejsze problemy dynamiczne pozostają otwarte.

## ENERGY / NETWORK SCORE

**UNRESOLVED.** Brak zmian naprawiających bilans energii BESS lub historię topologii. Dla aktualnej delty sprawdzono wyłącznie algebraiczny wkład `I_k=k_sc I_n`; kontrprzykład przepełnienia obala pełny kontrakt skończoności.

## CATALOG ENGINEERING SCORE

**PARTIALLY SUPPORTED.** Metryka została rozdzielona per zdolność, `p0_kw` i `i0_percent` są wymagane tam, gdzie istnieją konsumenci, a etykieta `PRODUCTION_READY` została usunięta. Pięć nieuniwersalnych reguł nie blokuje już katalogu. Nadal nie ma niezależnej kwalifikacji wszystkich wartości producenta, `SOURCE_VERIFIED` mierzy głównie obecność odwołania, a twarda relacja LV `Icw<=Icu` wymaga podstawy rodzinowej/normowej.

## POZIOMY DOWODU

| Obszar | IMPLEMENTED | SOFTWARE-VERIFIED | MATHEMATICALLY VERIFIED | NUMERICALLY VERIFIED | PHYSICALLY SUPPORTED | PHYSICALLY VALIDATED | PRODUCTION-READY | REGULATORY-EVIDENCE-READY |
|---|---|---|---|---|---|---|---|---|
| k_sc — nowy bieg SC/protection | TAK | TAK, testy + CI | częściowo | NIE — przepełnienie | częściowo | NIE | NIE | NIE |
| capability scope | częściowo | częściowo | nie dotyczy | nie dotyczy | częściowo | NIE | NIE | NIE |
| 57/57 template metrics | TAK | TAK w CI | nie dotyczy | nie dotyczy | tylko kompletność modelu/LF | NIE | NIE | NIE |
| katalogi 23 rodzin | TAK jako miernik | TAK jako pomiar wewnętrzny | nie dotyczy | nie dotyczy | częściowo | NIE | NIE | NIE |
| niezmienniki katalogu | TAK | częściowo | klasyfikacja sprawdzona | nie dotyczy | częściowo | NIE | NIE | NIE |

## CI DELTA

HEAD `49bf0ab6`: **7 zielonych, 3 czerwone**, wszystkie zakończone.

| Kontrola | Stan | Klasyfikacja |
|---|---|---|
| V12K Extended Invariant Guards | success | wcześniejsza nowa czerwień `meta.quantity` zamknięta |
| frontend | success | zielona |
| SLD Guards (Python) | success | zielona |
| Documentation integrity | success | zielona |
| Architecture/catalog hygiene | success | zielona |
| critical-real-backend-e2e | success | zielona |
| modal physical fields | success | zielona |
| pytest workflow | failure | pełna suite 11763 passed/14 skipped; następnie nowa deterministyczna porażka guardu model-map: 1 failed/390 passed |
| SLD Contract Tests | failure | odziedziczone `vertical_length_probe`: 22672>22440 oraz 45656>39448 |
| full-real-backend-e2e | failure | odziedziczone 1 failed/407 passed/2 skipped; odpowiedź 100908315 B przekracza próg 62914560 B, identyczna klasa porażki jak wcześniej |

Nie klasyfikuję czerwieni SLD/E2E jako spowodowanych tą remediacją bez dowodu. Czerwień guardu `domain/dobor_aparatu_pola.py` jest bezpośrednio związana z aktualnym zakresem i nowa.

## MUTATION STATUS

### Niezależnie sprawdzone w tej rundzie

| Mutacja/przypadek | Wynik | Zakres |
|---|---|---|
| `k_sc=+Inf` | **KILLED** | predykat zwraca `DANE_NIEPOPRAWNE` |
| `k_sc=1e308`, `I_n=1000 A` | **SURVIVED (P1)** | deklaracja przechodzi, `ik_sc_a=Inf` |
| brak k_sc, nowy bieg SC 3F/1F/protection | **KILLED** | wykonywalna eligibility blokuje |
| brak k_sc, LOAD_FLOW | **KILLED po stronie fałszywej globalnej blokady** | load flow pozostaje dostępny |
| usunięcie faktycznego konsumenta bramki dla BREAKING/COORDINATION/EVIDENCE | **SURVIVED (P0, stan równoważny implementacji)** | nazwy istnieją w enumie, brak produkcyjnych call-sites |
| `ready=True` przy SC_3F=False | **SURVIVED (P1)** | 26 szablonów DER utrwala ten rozjazd semantyczny |
| rekord z `source_url="x"` | **SURVIVED (P2)** | miernik klasyfikuje jako `DOKUMENT_ZEWNETRZNY` |

Mutacji Opusa M01–M14 nie uznaję automatycznie za niezależny dowód. CI potwierdza przejście jego testów, nie niezależność wyroczni. W szczególności M12/M13 dowodzą wiązania wyciągu ABB z tym samym dokumentem/katalogiem, a nie niezależnej poprawności danych producenta.

## STARE USTALENIA — STATUS

### Nadal otwarte

- **P0-DELTA-01:** BESS po projekcji SOC=0 nadal oddaje 0,165847882 kWh przy zasobie początkowym 0,040 kWh; błąd nie zanika z dt. Delta katalogowa nie dotyka modelu.
- **P1-DELTA-02:** NaN przed projekcją stanu może stać się górną granicą z `STRICT_CONVERGENCE`; brak zmian w integratorze.
- re-inicjalizacja po biegu kończącym się podczas zwarcia: max `|Δx0|=1,09421789`; brak zmian w inicjalizacji/topologii;
- NaN/Inf i niepoprawny czas w kontrakcie wyników dynamicznych;
- niepełna kwalifikacja baz BESS i obu stron ograniczeń energii;
- identity zdarzeń, kolizje i równoległe gałęzie;
- samodzielnie konstruowane evidence/FRT i bezpośredni generator dokumentu;
- model-form risk ograniczników AVR/governora;
- twarde `Icw<=Icu` pozostało dla aparatury nN;
- dynamic layer pozostaje `UNVALIDATED_MODEL`; `VALIDATED_SIMULATION` i dowód NC RfG niedopuszczone.

### Zamknięte w badanym zakresie

- P1-DELTA-04 dla wejściowego NaN/±Inf — zamknięte; zastąpione nowym przypadkiem przepełnienia P1-DELTA-07;
- P1-DELTA-05 — fałszywy pojedynczy test 57/57 został rozdzielony na mierzalne metryki; pozostaje P1-DELTA-08 dotyczące globalnej semantyki `ready`;
- P1-DELTA-06 — zamknięta mapa 11/22/33 kV usunięta; wybór wynika z dostępnych klas katalogowych;
- brak napięcia nie jest już domyślnie `APARAT_NN`;
- luka pól transformatora `p0_kw`/`i0_percent` została rozdzielona per zdolność;
- V12K `meta.quantity` — poprzednia czerwień zamknięta.

## UNRESOLVED PROFESSORIAL QUESTIONS

1. **SOL CAN RESOLVE:** gdzie jest jedyny wykonywalny punkt autoryzacji dla wyników już istniejących/importowanych, doboru Icu, koordynacji i dokumentów dowodowych? Sam enum zdolności nie jest punktem wykonania.
2. **SOL CAN RESOLVE:** czy globalny `engineering-readiness.ready` zostanie formalnie przemianowany na kompletność strukturalną, czy usunięty na rzecz mapy zdolności?
3. **SOL CAN RESOLVE:** jaki kontrakt zapewnia skończoność `I_k=k_sc I_n` bez arbitralnego uniwersalnego progu producenta?
4. **SOL CAN RESOLVE:** jaka konkretna klauzula i rodzina aparatu uzasadnia twarde `Icw<=Icu` dla nN? Bez tego relacja pozostaje kontrolą wiarygodności.
5. **SOL CAN RESOLVE:** czy `FIELD_COMPLETE_SOURCE_VERIFIED` ma znaczyć jedynie „wskazano źródło”, czy ma rzeczywiście weryfikować dokument i wartości?
6. **SOL CAN RESOLVE:** pozostałe pytania dynamiczne z checkpointu wymagają osobnych wykonywalnych rund; ta delta ich nie zmienia.

## ASTRA ESCALATION

**NONE.** Nie ma nowego, autentycznie niejednoznacznego P0/P1 wymagającego rozstrzygnięcia matematycznego przez Astrę. Problemy są rozstrzygalne przez wykonanie brakujących bramek i testów kontraktowych w Sol.

## ODTWARZALNOŚĆ I OGRANICZENIA

- Stan gałęzi, PR, compare i CI odczytano bezpośrednio z GitHub dla SHA `49bf0ab6`.
- Przejrzano komplet ośmiu zmienionych modułów produkcyjnych Python. Pomiar wystąpień pokazał, że cztery downstream capabilities występują tylko w module wyliczenia; `wklad_jest_miarodajny` ma produkcyjne wywołania wyłącznie w dwóch warstwach eligibility.
- Pełnej suity nie uruchamiano lokalnie; podano dokładne wyniki zakończonego CI. Jedyny niezależny lokalny eksperyment wykonawczy tej rundy to kontrprzykład przepełnienia IEEE-754.
- Nie wykonano ponownie wcześniejszych eksperymentów dynamicznych, ponieważ delta nie zmienia ich kodu. Zachowano je jako nierozstrzygnięte, a nie jako nowe wyniki.
- Raport nie promuje dynamiki do `VALIDATED_SIMULATION`, nie stanowi dowodu NC RfG i nie kwalifikuje katalogów produkcyjnie.
