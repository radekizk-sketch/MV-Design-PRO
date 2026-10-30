# Macierz kandydatów, kontrakty symulacji i testy — materiał do decyzji Opusa

**Status:** NIEOBOWIĄZUJĄCE kandydaty, bez wdrożenia. Opus ma prawo odrzucić wszystkie.  
**Cel:** symulacja stanów sieci SN i ich wpływu na obliczenia, w estetyce e²TANGO; **bez runtime SCADA**.  
**Zasada:** nie zmieniać fizyki solverów, nie przebudowywać architektury bez wykazanego błędu. B-01/B-02 obowiązują.

## 1. Matryca decyzji z dowodem i kosztami

Kolumna „Sugestia” to **opinia badawcza**, nie decyzja Opusa.

| ID | Kategoria | Kandydat | Dowód | Sugestia | Ryzyko / warunek |
|---|---|---|---|---|---|
| D-01 | Visual | e²TANGO jako kierunek wizualny SLD: cienkie jasne linie, ciemny podkład, zwięzłe etykiety | E01–E03/E14 | ROZWAŻ | Brak licencjonowanego SVG; nie klonować panelu |
| D-02 | Visual | Mniej kolorowanych prostokątów i ozdobnych kółek, większa dyscyplina linii | O + decyzja właściciela | ROZWAŻ | Najpierw aktualny renderer, potem lokalna korekta |
| D-03 | Visual | Wspólna geometria oznaczenia stanu, kolor jako pomocniczy | R03 + S01 | ROZWAŻ | Wymóg rozróżnienia open/unknown w mono |
| D-04 | Visual | Czerwony zamknięty / zielony otwarty jak e²YANKEE | E07, atlas właściciela | DO DECYZJI | Konflikt ze starszą `SLD_SYMBOL_LIBRARY.md` |
| D-05 | Visual | Żółty znak ? dla stanu nieznanego | E07 | WARUNKOWO | Nie utożsamiać „nieznany” z „brak wyniku LF” |
| D-06 | Visual | Osobne reguły gęstości LOD0/1/2 bez zmiany połączeń | R03 | ROZWAŻ | Zachować bez zmian `viewBox`/porty, lub formalnie zmigrować |
| D-07 | Geometria | Wysuwność przez wtyk–gniazdo, nie kółko boczne | S03 | TYLKO PO WERYFIKACJI | Nazwy elementów ≠ geometrii IEC/ENEA |
| D-08 | Geometria | Wyłącznik stały i wysuwny jako rozróżnialne konstrukcje | S01/S03 | ROZWAŻ | Sprawdzić poprawność przy L0, L1, L2 |
| D-09 | Model | breaker OPEN/CLOSED/INTERMEDIATE/CONFLICT/UNKNOWN | S01 | ROZWAŻ | Domknąć semantykę pochodzenia sygnału |
| D-10 | Model | rack SERVICE/TEST/DISCONNECTED/UNKNOWN/N/A | S01/S02 | ROZWAŻ | S02 uproszczony do 2; nie mapować liczb 1:1 |
| D-11 | Model | uziemnik jako osobny aparat i boczny tor | ENEA R03/R04 | ZACHOWAĆ | Bez mieszania w tor główny |
| D-12 | Model | trip osobno od położenia wyłącznika | S01 | WARUNKOWO | Trip tylko jeśli analiza zabezpieczeń go uzasadnia |
| D-13 | Model | status źródła: projektowy / symulowany / importowany | konstytucja R01 | ROZWAŻ | Nie dorabiać warstwy live telemetry |
| D-14 | Topologia | połączenia źródło–szyna–aparat z jawnych portów i ENM | S04/S05/R03 | ZACHOWAĆ | Brak grafu z położenia pikseli |
| D-15 | Topologia | kolorowanie zasilanych gałęzi | S07/S09 | WARUNKOWO | Wyspy, wieloźródłowość, napięcie z solvera rozdzielić |
| D-16 | Scenariusze | symulacja łączeń z niezmienną bazą i rekalkulacją | E04/R01 | ROZWAŻ | UI nie może wywołać sterowania realnym obiektem |
| D-17 | Wyniki | stan świeżości i pochodzenia wyników | S10/R01 | ZACHOWAĆ | Brak wyniku ≠ brak napięcia |
| D-18 | SLD | referencyjny katalog prymitywów | S03/R03 | ZACHOWAĆ | Nie zakładać importu TGML/Genie |
| D-19 | Kontrola | debug wiązań i portów w modelu | S04/S06 | ROZWAŻ | Wpiąć w istniejące guardy/testy, nie nowy silnik |
| D-20 | UI | pogląd pojedynczego pola i widoku całej sieci | E07/R03 | ROZWAŻ | UI projektanta, nie dyspozytora |
| D-21 | Symulacja | ręczna emulacja stanu łącznika przez wariant scenariusza | S02/E04 | ROZWAŻ | Nie nazywać „sygnał live” |
| D-22 | Integracja | read/import IEC 61850/SCD | S01/PO | ODRADZAM BEZ POTRZEBY | Nie jest potrzebne do podstawowych LF/SC |
| D-23 | Runtime | watchdog, historian, SMS, RTU, SBO, SCADA | S01/E06 | ODRZUCIĆ | Poza celem produktu |
| D-24 | Estetyka | dosłowny klon panelu e²TANGO/TGML | E01–E03 | ODRZUCIĆ | Własność IP i zła ergonomia desktop CAD |
| D-25 | Zabezpieczenia | automatyczne wyłączenie aparatu po obliczeniu zwarcia | Model PR | TYLKO JEŚLI SOLVER I LOGIKA SĄ ZWERYFIKOWANE | Nie symulować fikcyjnego trip matrix |
| D-26 | Wydruk | wersja monochromatyczna i eksport SVG/PDF | R03 | ZACHOWAĆ | Barwy nie niosą jedynej semantyki |

**Obowiązkowy wynik Opusa per D-xx:** `PRZYJĄĆ`, `ZMODYFIKOWAĆ`, `ODRZUCIĆ`, `BRAK DOWODU`; uzasadnienie + plik kontekstowy + brak/regresja.

## 2. Formalny model przypadków pracy — propozycja do oceny

### 2.1 Warstwy, których nie wolno sklejać

1. **Fizyczna konfiguracja urządzenia**: rodzinny typ; fixed/rackable; liczba torów i portów; blokady i dozwolone konfiguracje.
2. **Stan projektowy aparatu**: wyłącznik, człon, uziemnik, punkt NO.
3. **Scenariusz**: rewizja ENM + jawny zbiór zmian + walidacja stanów.
4. **Wynik obliczeniowy**: ID solver run + metoda + czas/rewizja + źródła obciążenia/zasilania + jakość.
5. **Prezentacja SLD**: symbol bazowy + typ nakładki + dane do opisu, bez przepisywania stanu do frontendowego magazynu.

`state === closed` w UI **nie** gwarantuje fizycznego przewodzenia: potrzebne są pozostałe warunki modelu.

### 2.2 Przykładowy kontrakt logiczny (nie API do implementacji 1:1)

```text
BreakerGeometry = Fixed | Withdrawable
BreakerContact = Open | Closed | Intermediate | Conflict | Unknown
RackPosition = Service | Test | Disconnected | Moving | Unknown | NotApplicable
EarthSwitch = Open | Closed | Intermediate | Conflict | Unknown | NotPresent
StateOrigin = DesignScenario | SimulationResult | ImportedObservation
CalculationFreshness = Current | Stale | NotComputed | Failed | UnknownInputs
ElectricalConnectivity = Conductive | NonConductive | Indeterminate
```

Wartości `Conflict` mają sens wyłącznie przy **dwóch sprzecznych przesłankach**; nie dopisywać ich do modelu projektowego bez potrzeby. `Moving` — tylko jeżeli symulator rzeczywiście obsługuje sekwencję ruchową. `ImportedObservation` to ewentualna funkcja importu, **nie świadectwo live telemetry**. Opus może wybrać mniejszy model przy zachowaniu rozróżnialności krytycznych przypadków.

### 2.3 Reguły elektrycznej łączności członu — kandydat

Przy prawidłowo zidentyfikowanym aparacie i jawnej konfiguracji:
- `Fixed + Closed` może przewodzić tor główny.
- `Rackable + Service + Closed` może przewodzić tor główny.
- `Rackable + Test` **nie** przewodzi przez rozłączone styki główne, nawet gdy wyłącznik (jego styki robocze) są zamknięte.
- `Rackable + Disconnected` **nie** przewodzi przez rozłączone styki główne.
- `Contact=Open` **nie** przewodzi przez wyłącznik niezależnie od `Rack=Service`.
- `Unknown/Intermediate/Conflict` **nie jest dowodem** ani pełnej ciągłości, ani izolacji; wymaga jawnego traktowania niepewności.
- `EarthSwitch=Closed` to **topologiczny odgałęziony tor do ziemi** i warunek walidacji konfiguracji, a nie rodzaj stanu wyłącznika.
- Możliwy stan zasilania od strony odpływu i wieloźródłowy — **nie zakładać, że rozłączony wyłącznik gwarantuje brak napięcia po obu stronach**.

Przy braku danych nie udawać wyroczni: model może przerwać symulację konkretnego stanu, zwrócić kilka scenariuszy warunkowych albo oznaczyć wniosek jako nieokreślony. Wybór algorytmu i zachowania UI = Opus.

## 3. Testy referencyjne semantyki / topologii

| ID | Dane/scenariusz | Oczekiwany inwariant |
|---|---|---|
| T01 | Fixed, CB closed, bez innych przerw | Tor przewodzi zgodnie z grafem i zasilaniem |
| T02 | Fixed, CB open | Tor główny przerwany |
| T03 | Rackable service + CB closed | Tor przewodzi tylko przy połączeniach głównych |
| T04 | Rackable test + CB closed | Brak przewodzenia przez człon; stan CB pozostaje closed |
| T05 | Rackable disconnected + CB closed | Brak przewodzenia przez człon |
| T06 | Rackable service + CB open | Brak przewodzenia przez CB |
| T07 | Rack unknown + CB closed | Brak bezwarunkowej deklaracji Conductive |
| T08 | CB intermediate, conflicting/unknown | Nie rysować jako potwierdzone open/closed |
| T09 | Earth closed przy konflikcie z zasilaniem | Walidator zgłasza niedozwolony/niebezpieczny stan; żadnej „zielonej zgody” |
| T10 | Backfeed od OZE z odpływu | Odłączona strona źródła nie dowodzi beznapięciowości odpływu |
| T11 | Dwa źródła i punkt NO | Przełączenie może stworzyć oczko; typ analizy i solver muszą to uwzględnić |
| T12 | Wyspa bez źródła/slack | Nie przypisywać bez podstawy napięcia znamionowego |
| T13 | Zmiana scenariusza po LF | Poprzedni wynik LF nieaktualny, nie używany jako bieżący |
| T14 | Zmiana nastaw ochrony po fault run | Wynik ochrony i powiązane werdykty nieaktualne |
| T15 | Wieloźródłowy zasilacz DER | Wektor P/Q/I i kierunki pochodzą z solvera, nie z koloru |
| T16 | Przekładnik napięciowy na bocznym torze | Nie jest włączony szeregowo w główny tor prądowy |
| T17 | Przekładnik prądowy w torze | Prawidłowe porty i niezerwana ciągłość elektryczna |
| T18 | Uziemnik boczny, strzałka/linia w dół | Brak przypadkowego szeregowego połączenia oraz prawidłowy symbol ziemi |
| T19 | Element sklonowany z tym samym ID | Błąd identyfikatora, nie współdzielony stan dwóch pól |
| T20 | Wiele widoków/LOD tego samego scenariusza | Ta sama łączność i identyfikatory, bez osobnych źródeł prawdy |
| T21 | SVG export/print | Porty, przewody, etykiety i znaki pozostają czytelne w mono |
| T22 | Brak przypisanego IED/stopnia zabezpieczeń | Żadnego automatycznie wymyślonego trip, 67N, czasu wyłączenia |
| T23 | Rozbieżne dane o stanie | Status epistemiczny jest jawny, nie domyślnie otwarty |
| T24 | Powrót do poprzedniego snapshotu | Identyczny rysunek i wyniki przy tej samej rewizji/parametrach |
| T25 | Import opisu nieznanego typu aparatu | System nie wymyśla geometrii IEC, raportuje brak dowodu i proponuje bezpieczny wariant roboczy z oznaczeniem |

## 4. Testy jakości wizualnej B-02 (nie mogą być zastąpione testem jednostkowym)

**Materiał do dostarczenia Opusowi i właścicielowi:**
1. rzeczywisty render `SldCanvasV3` (nie osobny HTML i nie mock SVG poza aplikacją);
2. 1 pole liniowe ENEA w trzech LOD i stanie closed/open;
3. analogicznie wyłącznik fixed vs rackable (pozycje SERVICE/TEST/DISCONNECTED, jeśli model wspiera);
4. kontekst: 3–5 pól obok siebie, aby sprawdzić czytelność na gęstym rysunku;
5. eksport SVG i monochromatyczny PDF/druk;
6. zrzuty 1× w natywnym rozmiarze, nie tylko powiększenie do inspekcji;
7. tabela porównania ze źródłem IEC/ENEA, wskazująca konkretny rysunek/stronę, **jeśli źródło licencjonowane**;
8. ocena adwersaryjna: co inżynier może błędnie odczytać, np. kółko jak CT, uziemnik jak odłącznik.

**Bramka estetyki:**
- nie używać poprzednich 60 autorskich ikon jako „zatwierdzonej biblioteki”;
- nie uznawać różnorodnych tytułów, paneli i badge za postęp jakości symbolu;
- nie zmieniać kryteriów podczas testu bez zapisu;
- nie wydawać werdyktu B-02 w imieniu właściciela.

## 5. Testy mechaniczne i domenowe

- **Porty:** top/bottom/lateral jako jawne gniazda grafu; żadnego dowiązania po pikselach.
- **Rysunek:** maski/trasowanie ortogonalne, zero przecięć bboxów, w tym etykiet; ten sam computeLayout.
- **LOD:** nie zmieniają typu aparatu, scenariusza, położenia NO, wyników ani portów elektrycznych.
- **Wersje:** deterministyczny hash snapshotu, wyników, projekcji oraz SVG.
- **Identyfikatory:** wymiar symbolu/wariant nie tworzy nowego `deviceId`.
- **Wyrocznie:** porównanie solverów LF i SC do benchmarków już istniejących w repo; żadnych nowych uproszczeń fizyki przez UI.
- **Wpływ:** test graniczny typu `rack=TEST, breaker=CLOSED`, backfeed i wieloźródłowość; szczególnie przypadki, gdzie wizualna czerwoność urządzenia sugerowałaby nieprawdziwą ciągłość.
- **Brak regresji:** sterowanie scenariuszem bez zdalnych urządzeń, bez ingerencji w B-01.

## 6. Priorytety badawcze zamiast backlogu wdrożenia

**P0 — przed decyzją o jakimkolwiek symbolu:** sprawdzić aktualną ścieżkę renderowania; zweryfikować ENEA/IEC; oddzielić breaker/rack/earth/unknown; sprawdzić, czy istniejący model nie obejmuje tych stanów już poprawnie.

**P1 — tylko po wskazaniu luki:** lokalna korekta symbolu wyłącznika wysuwnego / tokenów/legendy; dowód w rzeczywistym SLD, natywna skala i print.

**P2 — po odrębnej decyzji produktowej:** wygodne scenariusze „co się stanie, jeśli”, widoki porównawcze i rejestrowanie wyników; bez systemu SCADA.

To jest **kolejność badania**, nie polecenie implementacji P0/P1/P2. Ostateczny podział pracy i zakres określa Opus.

## 7. Checklista ADR Opusa

Przed decyzją o wdrożeniu odpowiedz i podlinkuj dowody:

- [ ] Czy obecny symbol jest niepoprawny normowo, czy tylko nieestetyczny?
- [ ] Czy wysuwność jest cechą urządzenia, pola czy osobnego członu w ENM?
- [ ] Czy produkt ma już typ `rack position` i gotową semantykę?
- [ ] Czy istniejąca geometria `cb_drawout.svg` jest rzeczywiście renderowana w aktywnym SLD?
- [ ] Czy konflikt kolorów w starej specyfikacji jest nadal widoczny w działającej aplikacji?
- [ ] Czy istnieje autoryzowany wzorzec ENEA/IEC dla kształtu bez bocznego kółka?
- [ ] Czy rekomendacja eliminuje realne błędy odczytu w LOD0?
- [ ] Czy poprawka nie wymaga zmiany solvera i B-01?
- [ ] Czy demonstracja działa w kodzie produkcyjnym?
- [ ] Czy eksperyment nie narusza praw vendor?
- [ ] Czy właściciel zatwierdził B-02 po zobaczeniu rzeczywistego widoku?

## 8. Przykładowa tabela decyzji do uzupełnienia

| D-xx | Decyzja Opusa | Dlaczego | Dowód repo | Dowód zewnętrzny | Zmiana / brak zmiany | Ryzyko | B-01/B-02 |
|---|---|---|---|---|---|---|---|
| D-07 | — | — | — | — | — | — | — |
| D-09 | — | — | — | — | — | — | — |
| D-10 | — | — | — | — | — | — | — |
| D-04 | — | — | — | — | — | — | — |

Pozostawić puste do realnej decyzji architekta; GPT-6 nie dokonuje tej decyzji za Opusa.
