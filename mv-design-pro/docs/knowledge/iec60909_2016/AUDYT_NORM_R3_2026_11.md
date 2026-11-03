# MV-DESIGN-PRO — audyt norm R3 (3 listopada 2026)
## 0. Zakres, źródła i klasy pewności
**A — zweryfikowano w dostarczonym PDF:** PN-EN 62271-1:2018-02 (136 stron), PN-EN 60909-0:2016-09 (82 strony, skan), PN-EN 60909-3:2010 (66 stron), PN-EN 50160:2023-10/A1:2025-04 (9 stron).

**B — zweryfikowano w oficjalnych katalogach:** PKN i IEC, data odczytu 2026-11-03. Numer normy polskiej, norma międzynarodowa i jej data ostatniego wydania **nie są tym samym**. Metadane zawiera `NORM_REGISTER_2026_11.json`.

**C — wniosek architektoniczno-inżynierski:** proponowane reguły kontroli danych, bez twierdzenia że normy same opisują implementację MV-DESIGN-PRO. Wersja R3 nie modyfikuje silnika obliczeń.

Wszystkie 5 nowych plików PDF to **3 niezależne dokumenty**. Kopie `(1)` mają identyczne SHA-256; dokument PN-EN 62271-1 jest dodatkowo dostarczony pod dwoma nazwami i ma tę samą sumę `6ecfd3a461b62b15dc70a05da2cf7b941f2f49336f17658864db8e7701eef529`. Kopie nie są rejestrowane jako osobne wydania.

## 1. Stan wydawniczy i niekompletność norm
| Dokument | Potwierdzony stan i ograniczenie |
|---|---|
| **PN-EN 60909-0:2016-09** | Plik podstawowy w bazie; w PKN nadal katalogowany bez oznaczenia wycofania na dzień sprawdzenia. **IEC 60909-0:2026** (wyd. 3, 23 lipca 2026) zastąpiła **IEC 60909-0:2016** na poziomie IEC. **Nie wolno** automatycznie zmieniać formuł, numeracji i współczynników 2016 na deklarację zgodności z 2026. |
| **PN-EN 60909-3:2010** | IEC 60909-3:2009. §2 powołuje **IEC 60909-0:2001** w sposób datowany. Użycie z edycjami 2016 lub 2026 wymaga udokumentowanej kompatybilności międzywydaniowej. |
| **PN-EN 50160:2023-10/A1:2025-04** | Jest to tylko zmiana; kompletna norma bazowa PN-EN 50160:2023-10 nie została załączona. Dla tabel granicznych i pełnej oceny zgodności **BRAK_PODSTAWY**. |
| **PN-EN 62271-1:2018-02** | Dostarczono tekst podstawowy; istnieje **A1:2022-06** modyfikująca §6.4.1 i bibliografię. Nie wolno deklarować pełnej zgodności z wersją z A1 bez jej treści. |
| **PN-EN IEC 62271-100, -102, -103, -105, -200, -202** | Znane z metadanych katalogu PKN. Bez ich pełnych norm nie wolno wyprowadzać specyficznych wartości zdolności wyłączeniowej, klasy łuku IAC, LSC, klasyfikacji przegród ani specyfikacji stacji. |

## 2. Weryfikacja PN-EN 62271-1:2018-02 — wnioski o najwyższym znaczeniu
### 2.1. Zakres i podział aparatury
§1 (IEC s.12, PDF 24) dotyczy aparatury AC o Ur>1 kV, nie jest normą rysowania symboli SLD i nie zastępuje norm wyrobu. Terminologia HV w IEC nie oznacza, że sieć 15 kV staje się WN w nazewnictwie polskim.

### 2.2. Dobór do 15 kV
§5.2.2 (IEC s.31, PDF 43) zawiera szereg Ur: m.in. 12, 17,5, 24, 36 kV. Nie należy wymuszać dowolnego parametru bez wymagań konkretnego OSD i karty producenta.

**Korekta szczególnie ważna po wzrokowej inspekcji tablicy 1** (IEC s.33, PDF 45):
- Dla **Ur=17,5 kV**: Ud=38/45 kV (wspólna/przerwa izolacyjna) oraz **dwie** alternatywne pary Up: **75/85** albo **95/110 kV**.
- Dla **Ur=24 kV**: Ud=50/60 kV oraz **dwie** alternatywne pary Up: **95/110** albo **125/145 kV**.
- Wybrana para wymaga uzasadnienia przez koordynację izolacji i dane produktu; sam fakt Un=15 kV nie ustala automatycznie jednego poziomu udarowego. Nie przechowywać w katalogu pojedynczej nieweryfikowanej wartości jako `62271_minimum`.

### 2.3. Prądy i czas zwarcia
§5.5–5.8 (IEC s.36–37, PDF 48–49):
- `Ir` oznacza znamionowy prąd ciągły.
- `Ik` oznacza **znamionowy krótkotrwały prąd wytrzymywany** przy zamkniętym aparacie, **nie** zdolność wyłączeniową.
- `Ip` oznacza wytrzymywaną wartość szczytową. **2,5×Ik** dotyczy w §5.7 tablica 5 przypadku 50 Hz i stałej czasowej 45 ms; w innych przypadkach współczynnik może być większy.
- `tk` ma wartość preferowaną 1 s, z dopuszczonymi innymi czasami (np. 0,5, 2, 3 s). **Nie porównuj mechanicznie Ik z Ib ani I″k z Ith bez właściwego modelu czasu/warunków**.

Dla modelu IEC 60909-0 prąd udarowy `ip` należy obliczyć własnym obliczeniem na danych sieci i porównać z deklarowanym `Ip`. Zdolność wyłączania wymaga PN-EN IEC 62271-100 oraz danych wyłącznika.

### 2.4. Bezpieczeństwo i sygnalizacja
- §6.3 (IEC 39 / PDF 51): punkt przyłączenia PE i oznaczenie IEC 60417-5019. To nie jest uniwersalny symbol uziemnika na schemacie.
- §6.12–6.13 (IEC 48 / PDF 60): blokowanie niewłaściwych operacji i wiarygodna informacja o położeniu rzeczywistych styków. Norma wskazuje IEC 60073, IEC 60417 i IEC 60617; **nie ustanawia sama jednej pary barw dla każdego SLD**.
- §6.14.2 (IEC 48 / PDF 60): minimalne IP1XB w zakresie ochrony przed dotykiem; dla aparatów zewnętrznych §6.14.3 przewiduje IPX3 względem wody. To wymogi wspólne — norma wyrobu/OSD może wymagać więcej.
- §6.14.4 (IEC 48 / PDF 60): **IK07 jest wartością preferowaną** dla zastosowań wnętrzowych, a nie generalnym bezwarunkowym minimum.

### 2.5. Dowody i odbiór
- §6.11 i tablica 9 (PDF 58–59): tabliczka znamionowa, rozróżnienie znakowania obowiązkowego X (gdy dotyczy) i warunkowego Y.
- §7 (PDF 63+): badania typu; sprawdzić zastosowanie raportu do konkretnej konfiguracji.
- §8 (PDF 96+): badania wyrobu — inne niż badania typu; m.in. obwód główny, obwody pomocnicze, rezystancja, szczelność, kontrola wizualna.
- §8.3 (PDF 97): weryfikacja okablowania i schematów, elementów sterowania i blokad.
- §10 (informacyjny, PDF 100+): dane do zamówień; nie mylić wytycznych informacyjnych z wymaganiem typu `shall`.

## 3. Kontrakt stosowania w MV-DESIGN-PRO
Warstwy muszą pozostać rozdzielone:
1. **Wiedza normowa**: `source_id`, edycja, punkt, drukowana strona IEC i PDF, parafraza, dowód, status źródła.
2. **Katalog aparatury**: producent, model, wariant wykonania, `Ur`, `Ud`, `Up`, `Ir`, `Ik`, `Ip`, `tk`, zdolność wyłączania (osobne pole), opcje sterowania, protokoły badań i identyfikator dokumentacji.
3. **Wynik obliczeń sieci**: `I″k`, `ip`, `Ib`, wartość cieplna i czas, profil wydania normy, stan sieci, provenance/snapshot.
4. **Porównanie**: wynik `ZGODNE/WYMAGA_KOREKTY/BRAK_DANYCH/NIE_DOTYCZY` wyłącznie gdy właściwy produkt i obowiązujące źródło dostarcza kryterium. Nieweryfikowany próg OSD i brak normy wyrobu nie mogą dać automatycznego `ZGODNE`.

Dla SLD: nie przesuwać symboli, nie przebudowywać LOD i nie zmieniać topologii. Ta zmiana jest **wiedzą i walidacją wybranych danych wejściowych**, nie implementacją cyfrowego aparatu łączeniowego.

## 4. Lista najważniejszych braków
| Priorytet | Brakujący materiał | Skutek braku |
|---|---|---|
| P0 | **IEC 60909-0:2026, pełna edycja** | Nie wolno deklarować zgodności nowego solvera z IEC 2026 ani automatycznie przenosić numeracji formuł |
| P0 | **PN-EN 62271-1:2018-02/A1:2022-06** | Niekompletna §6.4.1 aparatury |
| P0 | **PN-EN IEC 62271-100 i -200 z aktualnymi zmianami** | Niekompletny audyt wyłącznika i klasyfikacji rozdzielnicy |
| P1 | **PN-EN IEC 62271-102, -103, -105 i -202** | Brak osobnej podstawy dla odłączników, uziemników, rozłączników, zestawów i stacji prefabrykowanych |
| P1 | **PN-EN 50160:2023-10 — wydanie bazowe** | Niekompletne wartości graniczne jakości napięcia |
| P1 | **Standardy ENEA Operator aktualnej edycji** | Brak lokalnych warunków doboru wykraczających poza IEC |

## 5. Odbiór wdrożenia R3 — co można i czego nie można twierdzić
`extensions_62271_2018.json` dodaje 56 kart i 22 reguły. `NORM_REGISTER_2026_11.json` rejestruje stan wersji i brakujące zmiany. Indeks R3: 168 kart / 7 źródeł / 59 reguł. Reguły są **propozycjami w warstwie wiedzy**, nie aktywnymi bramkami solvera.

Badanie sum kontrolnych potwierdziło identyczność załączonych duplikatów. Kontrola normy obejmowała odczyt tekstowy oraz wzrokową kontrolę szczególnie istotnej tablicy 1, z dwoma alternatywnymi poziomami udarowymi. **Przegląd kompletności wszystkich stron nie jest równoważny certyfikacji całej normy ani wykonaniu pełnej regresji aplikacji.** Testy kodu należy uruchomić na PR, a integrację produkcyjną dopuścić dopiero po przeglądzie.

## 6. Publiczne źródła katalogowe (metadane, nie pełne normy)
- PKN 62271-1: https://sklep.pkn.pl/normy/pn-en-62271-1-2018-02e.html
- PKN A1: https://sklep.pkn.pl/normy/pn-en-62271-1-2018-02-a1-2022-06e.html
- IEC 62271-1, wydanie scalone: https://webstore.iec.ch/en/publication/71439
- IEC 60909-0:2026: https://webstore.iec.ch/en/publication/68454
- PKN 60909-0:2016-09: https://sklep.pkn.pl/pn-en-60909-0-2016-09e.html
- PKN 50160:2023-10: https://sklep.pkn.pl/pn-en-50160-2023-10e.html
- PKN 62271-200: https://sklep.pkn.pl/pn-en-iec-62271-200-2022-02e.html
- PKN 62271-100: https://sklep.pkn.pl/normy/pn-en-iec-62271-100-2022-04e.html

Nie dodawano kopii licencjonowanych PDF, długich fragmentów norm ani przekrojów kompletnych tabel do repozytorium.
