# Testy inżynierskie oraz kontrola spójności dokumentacji P1/P2

**Status źródła:** projektowe rozwiązania przyjęte jako zweryfikowane i dopuszczone. Kontrole poniżej nie anulują tego statusu: oddzielają błędy redakcyjne i przeliczeniowe od zatwierdzonej architektury projektowej oraz uniemożliwiają ich powielenie w generatorze.

## Macierz testów i kontrolowanych relacji

| ID | Kryterium | Typ testu |
|---|---|---|
| REF-T01 | Dla CT przełączalnego 200–400/5 A wybrane przełożenie wpływa na nastawę IED i zakres pracy, bez zmiany tożsamości przekładnika | katalog + EAZ |
| REF-T02 | Rdzenie 0,2S FS5 i 5P20 mają niezależne VA, przeznaczenie, klasy i warunki pracy | katalog |
| REF-T03 | Dla CT zachować odrębność Ith [kA, czas], Idyn [kA szczytowe] oraz obliczonego ip | zwarcia IEC |
| REF-T04 | Algorytm ALF zapisuje definicję obciążenia znamionowego/rzeczywistego i impedancji wewnętrznej; nie ogłasza rzeczywistego ALF tylko na podstawie stosunku mocy | EAZ/walidacja |
| REF-T05 | Każde uzwojenie VT ma osobną przekładnię wtórną, sposób połączenia, klasę i VA | katalog |
| REF-T06 | Wariant VT pola PN nie jest automatycznie taki sam jak VT pola generacyjnego | katalog |
| REF-T07 | Dla przekładnika Ferrantiego wykrywać niezgodne oznaczenia w opisie, BOM i schemacie | BOM/SLD |
| REF-T08 | Pole AIS wysuwne: stan CB, wózka, uziemnika i blokad to cztery różne kwestie | logika |
| REF-T09 | Zamknięty CB uniemożliwia manewr członem wysuwnym, jeśli producent wymaga blokady; brak możliwości zamknięcia uziemnika na części pod napięciem | blokady |
| REF-T10 | Pole PN nie generuje fikcyjnego wyłącznika w torze przekładnika napięciowego | SLD |
| REF-T11 | Zmiana trybu „bez generacji” / „z generacją” nie gubi konfiguracji ani blokad EAZ | EAZ |
| REF-T12 | OWG ma wskazaną grupę funkcji awaryjnych TR, a nie każde zwykłe polecenie otwarcia | EAZ |
| REF-T13 | SCO, SPZ-SCO, LRW i ZS są odrębnymi funkcjami i nie podmieniają znaczników wizualnych | EAZ |
| REF-T14 | Dla wyników obliczeniowych zachowane są jednostki pierwotne/wtórne, procent Un, HZ/Hz/s, mS i czasy [s] | EAZ |
| REF-T15 | Katalog 17,5 kV istniejącej modernizacji nie nadpisuje standardu nowej rozdzielnicy AIS 24 kV (PR #532) | zakres ENEA |
| REF-T16 | W polu TR transformator 110/SN jest granicą upstream; brak modelowania szczegółów rozdzielni 110 kV | domena |
| REF-T17 | Reguły automatyk i stanów przełączników są spójne między kartą pola, SLD L0/L1/L2, wynikiem i eksportem | E2E |
| REF-T18 | Rzeczywista topologia i parametry nie są uzależnione od skali widoku; zmiana LOD nie zmienia modelu | SLD |
| REF-T19 | Import dokumentacji wycina PII, lokalizację, obiekt, mapy telemechaniki i nastawy rzeczywiste | prywatność |
| REF-T20 | Brak dokumentu producenta dla nowej pozycji nie powoduje automatycznego przypisania parametrów innej rodziny | katalog |

## Wykryte niespójności zapisu do niepowielania

1. **P1 s. 28 — błąd sumowania obciążenia VT:** w wyrażeniu „0,4 VA + 1 VA” podano „1,2 VA”. Poprawny wynik wynosi **1,4 VA**, co pozostaje poniżej wskazanej znamionowej mocy 7,5 VA. To kontrola arytmetyczna, nie zakwestionowanie dopuszczenia rozwiązania.
2. **P1 s. 13–19 i BOM s. 29–34 — różne zapisy/wykonania VT:** opisy części pól wskazują 100/√3 V, a w zestawieniu pomiaru sekcji pojawia się 100/3 V. Sprawdzić, czy jest to inne uzwojenie/połączenie w określonym typie, czy zapis materiałowy. **Nie sprowadzać do jednego typu** i nie generować niesprawdzonego otwartego trójkąta.
3. **P1 s. 14–19 vs BOM s. 30–34 — oznaczenia Ferrantiego:** w opisie „IO-13d”, w materiałach „IO-125x470-D”. Zweryfikowane zastosowanie przekładnika zerowoprądowego pozostaje zatwierdzone; nazwa handlowa wymaga korelacji z wariantem dla konkretnej celki.
4. **P1 s. 20–21 vs s. 12–19 — pozostałości redakcyjne po wcześniejszej numeracji pól i odbiorów:** automatycznie importowane oznaczenia pole/sekcja mogłyby utworzyć fantomowe urządzenia. Numerów rzeczywistych pól **nie przenosić**; typy referencyjne są niezależne od numeracji.
5. **P2 s. 9–10 — określenie „dwa nowe pola” przy dłuższym zestawieniu**: wymaga korelacji z zakresem właściwego etapu; nie używać naturalnego opisu jako algorytmu zliczania.
6. **P2 s. 16 — powtórzenie jednego pola w wyliczeniu grupy OWG**: nie kopiować listy do automatyki; powiązania modelować na podstawie rzeczywistego grafu domeny.
7. **P2 s. 48–52 — część nastaw oznaczona jako „istniejąca” i/lub wymagająca potwierdzenia po pomiarze:** zachować osobny atrybut `approved_design_value`, `existing_setting`, `commissioning_dependency` zamiast utożsamiać je ze sobą.
8. **P2 s. 54–73 — katalog łączników i przekaźników pomocniczych:** oznaczenie funkcji na schemacie nie jest samo w sobie pełnym zamawialnym SKU; wymaga wariantu mechanicznego, napięcia i liczby zestyków.

## Kontrola matematyki z P1 — przypadki referencyjne

- Sprawdzanie (S=\sqrt{3} U I), z zachowaniem rzeczywistych założeń o cosφ; wynik projektowy służy jako **referencja sprawdzenia metody**, a nie parametr każdego GPZ.
- Porównywanie obciążenia rzeczywistego CT do znamionowego, obciążenia VA VT do mocy znamionowej każdego uzwojenia.
- Ocena ALF przy uwzględnieniu impedancji własnej przekładnika (jeśli dostępna), kabli i wejścia IED; jawnie rozdzielić **ALF znamionowy** i **rzeczywisty/skorygowany**.
- Separacja kryteriów zwarciowych (I_k'', i_p, I_{th}) i czasów; nie porównywać mocy zwarciowej z samym prądem aparatu bez konwersji i odniesienia.
- Węzeł P1 s. 23–28 pozwala też zweryfikować wyświetlanie poprawnych indeksów i polskiej notacji (I_k''), (i_p), (I_{th}) w UI.

## Definition of Done po włączeniu do MV-DESIGN-PRO

Rekordy katalogowe posiadają status, wersję producenta, przeznaczenie, typ pola i dane wymagane do walidacji. Eksport/import zapisuje tą samą konfigurację po odczycie. Solver i EAZ używają danych rzeczywistych z modelu. Wszystkie testy REF-T01…REF-T20 są powiązane z istniejącymi testami; nowe naruszenia nie obchodzą B-02. **Wynik dopuszczony** nie oznacza, że wolno automatycznie wstawić historyczne nastawy jako aktywne w nowej lokalizacji.
