# GPZ H5 — dowody źródłowe i reguły do ENM/SLD

**Status:** opracowanie techniczne oparte na źródłach pierwotnych. Nie jest zmianą projektu, instrukcją przełączeń ani kolejną kartą wykonawczą. Działania programistyczne: [istniejący pakiet GPZ A–D](../plan/KOREKTA_GPZ_H5_ENEA_2026-10.md).

## Z1 — ENEA Operator, stacje dwutransformatorowe 110/SN

**Dokument:** „Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe 110 kV/SN”; ENEA Operator, wersja 02.2023-2, obowiązuje od 02.04.2024. [Oficjalny PDF](https://www.operator.enea.pl/media/675/stacje-elektroenergetyczne-110-kv-zeszyt-1-stacje-dwutransformatorowe-110-kvsn-obowiazuje).

| Id | Odsyłacz do źródła | Ustalenie własnymi słowami | Konsekwencja modelowa | Stan |
|---|---|---|---|---|
| H5-01 | §11.1, druk s. 18, PDF strona 18 (licząc od 1) | Podstawowym układem rozdzielni 110 kV stacji dwutransformatorowej jest H5: jednosystemowa, dwusekcyjna, pięciopolowa, z dwoma polami liniowymi, dwoma transformatorowymi i polem łącznika szyn. | Dwie tożsamości sekcji 110 kV; pięć funkcjonalnych pól; oddzielny łącznik. Brak „jednej wspólnej szyny” w stanie otwartym. | SPRAWDZONE w oficjalnym PDF |
| H5-02 | §11.1 | H4 jest dopuszczany warunkowo z rezerwą na rozbudowę i analizą roli stacji; źródła współpracujące po 110 kV mogą wymuszać pełne pole łącznika. | Nie oznaczać H4 jako uniwersalnie równoważnego H5. | SPRAWDZONE |
| H5-03 | §11.1 | Nowa stacja 110/SN nie jest przewidziana z jedną linią zasilającą 110 kV; redukcja liczby transformatorów nie jest tym samym co redukcja liczby pól liniowych. | Oddzielić liczbę torów zasilania od liczby transformatorów w konfiguratorze. | SPRAWDZONE |
| H5-04 | §13; załączniki Z.2, Z.12 | Rozdzielnia SN i łącznik szyn SN to odrębne węzły i łączniki od sekcji 110 kV i łącznika 110 kV. | Osobne referencje i stan łączeniowy; nie zwierać automatycznie sekcji SN. | Paragrafy zidentyfikowane; detale graficzne załączników do wizualnego potwierdzenia przez wykonawcę |
| H5-05 | §26.10.5, druk s. 55–56 | Przy rezerwie ukrytej transformatory zasilają własne sekcje SN, a łącznik SN w normalnej pracy jest otwarty. Po awarii dopuszczalność SZR zależy od zapasu mocy i warunków ruchowych. | Normalny stan otwarty, awaryjne przełączenie jawne w scenariuszu; analiza dostępności rezerwy i źródeł lokalnych. | SPRAWDZONE |
| H5-06 | §26.11 | Manipulacje muszą być objęte odpowiednimi blokadami. | Nie wnioskować możliwości załączenia z samej geometrii SLD; rozdzielić stan, polecenie i warunek dopuszczalności. | SPRAWDZONE — szczegóły reguł weryfikować per przypadek |
| H5-07 | załączniki Z.1, Z.4–Z.9 | Schematy i wyposażenie pól 110 kV stanowią dane referencyjne dla funkcjonalnej topologii i identyfikacji aparatów. | Aparat projektowany z typu pola ≠ aparat rzeczywiście zamodelowany; dane katalogowe i stany muszą być jawne. | Lokalizacja potwierdzona w spisie, same rysunki wymagają weryfikacji graficznej w PDF |

**Uwaga:** §11.1 opisuje schemat obiektu. Nie dostarcza automatycznie pełnego wielowęzłowego równoważnika zwarciowego sieci nadrzędnej, impedancji L1/L2 ani wspólnej admitancji wzajemnej. Zabronione jest traktowanie dwóch kabli/linii jako dwóch statystycznie lub elektrycznie niezależnych źródeł bez danych.

## Z2 — Dołęga, rozdział 3, rysunek 3.37

**Źródło:** Waldemar Dołęga, *Stacje elektroenergetyczne*, PWr, 2007; **druk s. 60**, rys. 3.37 „Układ mostkowy pełny H5”; w kopii dostarczonej w projekcie: **fizyczna strona PDF 59 z 251**. Należy odróżniać numer wydrukowany od indeksu czytnika.

**Opracowanie autorskie, nie kopia strony podręcznika:**

- Układy H1–H5 klasyfikuje się m.in. przez liczbę i rozmieszczenie wyłączników; w H5 występują wyłączniki przy torach liniowych, transformatorowych i w poprzeczce.
- Praca H5 nie ma jednego niezmiennego zestawu zamkniętych aparatów: dopuszczalne warianty obejmują obie linie i oba transformatory z otwartą poprzeczką, obie linie i transformatory z poprzeczką zamkniętą, zredukowaną liczbę czynnych linii/transformatorów oraz przesył przelotowy.
- Istnienie funkcjonalnego pola łącznika nie oznacza, że w stanie normalnym obie sekcje są zwarcie połączone. To stan łącznika, nie jego narysowanie, rozstrzyga topologię.
- Dla MV-DESIGN PRO układy H1–H5 są wzorcami analizy, lecz **wybór kanonicznego wzorca ENEA H5 pochodzi ze standardu operatora, nie z samej książki**.

**Stan:** strona 60 i rys. 3.37 bezpośrednio zweryfikowane w dostarczonym PDF. Licencja na dalsze publikowanie skanu nie została ustalona — skan pozostaje lokalny.

## Z3 — rozdzielenie normy, operatora i założenia projektu

| Rodzaj wiedzy | Co wnosi | Czego NIE wolno z niej wywodzić |
|---|---|---|
| ENEA Zeszyt 1 / Z.1 | Preferowany układ H5, rodzaje pól, schemat, zasady SZR/blokad | Parametrów impedancyjnych konkretnych linii 110 kV ani rzeczywistej możliwości pracy równoległej |
| Dołęga, rozdz. 3.5.2, rys. 3.37 | Teoria układów mostkowych i możliwych stanów pracy | Domyślnego stanu każdej istniejącej stacji ENEA |
| IEC 60909 | Metoda obliczeń zwarciowych danego modelu i danych wejściowych | Schematów pola H5 ani liczby źródeł na danym GPZ |
| Dane wejściowe OSD / projektanta | Granica zasilania, S''k max/min, R/X, Z0/Z1, stany normalne i dopuszczalne | Nie mogą zastępować wymogu zweryfikowania standardowego schematu |
| Wyniki solvera | Liczby dla **danej** topologii i zestawu parametrów | Dowodu poprawności topologii ani tego, że fikstura reprezentuje rzeczywistą stację |

## Z4 — wymagania dowodowe dla sesji GPZ-MODEL

1. Najpierw identyfikator dokumentu, wersja, paragraf i odniesienie do rysunku; następnie reguła ENM.
2. Wyraźnie odróżniać źródło zasilania „jeden wspólny upstream” od dwóch niezależnych równoważników odseparowanych w stanie normalnym. Model połączony z dwoma niezależnymi źródłami bez macierzy zależności nie może produkować pozornego wyniku.
3. Rysować jedynie rzeczywistą topologię ENM; dwóch sekcji 110 kV nie zastępować ciągłą kreską, gdy łącznik jest otwarty.
4. Porównać liczby z niezależną wyrocznią na SC-01…SC-08; nie przyjmować własnego golden jako dowodu zgodności z ENEA.
5. Źródła **nie rozstrzygają** z góry, czy 110 kV sprzęgło H5 zawsze jest otwarte; stan normalny wymaga jawnej konfiguracji z danymi projektu, a przykładowy wariant referencyjny może przyjmować otwarte.
6. Dowody zmian i decyzje B-01/B-02 pozostają w [jedynym pakiecie A–D](../plan/KOREKTA_GPZ_H5_ENEA_2026-10.md); niniejszy plik jest biblioteką referencji, nie konkurencyjnym planem.

## Z5 — jawne braki

- Rysunki źródłowe Z.1/Z.2/Z.8/Z.12: nie są kopiowane do GitHub. Wykonawca otwiera oficjalny PDF i odnotowuje wynik kontroli.
- Parametry L1/L2: brak danych rzeczywistego OSD → nie wolno wypełniać przykładowymi impedancjami jako danymi stacji.
- Dołęga: książka nie jest publikowana w historii Git, bo nie wykazano praw do redystrybucji.
- Należy sprawdzać zmiany standardu po dacie 2026-10-22, szczególnie standard linii 110 kV obowiązujący od 2026-10-01.

## Z6 — odczyt kontrolny wątku wykonawczego (2026-10-22)

Wątek wykonawczy GPZ-MODEL pobrał cztery publiczne PDF ENEA skryptem `scripts/pobierz_zrodla_techniczne.py --all` z oficjalnych adresów rejestru. `--verify` zwraca 4/5; Dołęga jest niedostępny w tym kontenerze. Skróty SHA-256 zaobserwowane przy pobraniu (operator może podmienić plik, więc to obserwacja, nie wymóg):
- Zeszyt 1: `467547d5…4ba488`
- Zeszyt 2: `9e53bf35…c9caad`
- Zeszyt 3: `bb4d19af…c4ad2`
- linie 110 kV: `8aacbe4a…85670e`

| Id | Wynik odczytu oryginału | Konsekwencja |
|---|---|---|
| H5-01, H5-03 | Potwierdzone w §11.1, s. I 18/76. Zakaz jednej linii zasilającej przy dopuszczalnej ograniczonej liczbie TR | bez zmian |
| H5-02 | Potwierdzone. Przy jednostkach wytwórczych przyłączonych do 110 kV pełne pole łącznika jak H5 jest bezwzględnie wymagane | wariant H4 oznaczany warunkiem |
| H5-04 | Potwierdzone w §13, s. I 23–24/76, i w Z.2 (strona PDF 78). Rozdzielnica SN jednosystemowa, dwusekcyjna. Pola funkcyjne na każdą sekcję: transformatorowe, zespołu uziemiającego, BKR, pomiaru napięcia, liniowe. Łącznik szyn w 1 lub 2 celkach (Z.2: 2 celki, pola 1–2) | szablon H5 tworzy te pola bez domyślnego aparatu |
| H5-05 | Potwierdzone w §26.10.5, s. I 55–56/76: rezerwa jawna i ukryta. §26.10.4: SZR SN przy liniach w trybie „generacja” musi je wyłączyć, inaczej SZR się blokuje | sposób rezerwowania to jawny wybór; dopuszczalność SZR uwzględnia generację na sekcji |
| H5-06 | Potwierdzone w §26.11.3, s. I 57–58/76: zasady blokad H5 | stan, polecenie i warunek dopuszczalności rozdzielone |
| H5-07 | Z.1 (strona PDF 77) odczytany graficznie. Sekcja A i B 110 kV, pole łącznika szyn nr 4, pola liniowe w kierunku stacji 110 kV ENEA, TR1 → SN sekcja A, TR2 → SN sekcja B, punkt neutralny 110 kV TR przez uziemnik z ogranicznikiem. Skład pól z §11.1.1: liniowe OSZ(U)–W–PIU–OL(U)–OGR, transformatorowe OSZ(U)–W–PIU–OGR, łącznik szyn OS(U)–W–PIU–(U)OS | aparaty z typu pola tylko jako propozycja szablonu, jawnie odróżniona od aparatu zamodelowanego |
| Z4 pkt 5 | Potwierdzone: Zeszyt 1 nie określa stanu normalnego łącznika szyn 110 kV. Z.1 rysuje go bez stanu; §26.8.4 wiąże SZR 110 kV z planowymi podziałami ustalanymi przez ODM/KDM | stan normalny łącznika 110 kV jest jawnym wejściem projektu |
| §16 | Uziemienie punktu neutralnego sieci SN wymaga analizy per projekt: rezystor, dławik (min. 40–400 A) albo układ równoległy. Jeden zespół ma działać na połączoną sieć A+B | SC-08: sposób uziemienia z danych, brak = odmowa |
| Linie 110 kV (od 01.10.2026) | Przewód podstawowy ACSR (AFL) 240 mm²; kabel ≥ 1000 mm² Cu. Rezystancja, reaktancja i susceptancja linii wyznaczane obliczeniowo dla projektu, potem mierzone | standard nie daje stałych katalogowych R′/X′; model B wymaga danych linii z obliczenia albo od OSD, z pochodzeniem |

Dołęga, rys. 3.37: NIEZWERYFIKOWANE w tym kontenerze, bo PDF nie został dostarczony. Status z Z2 pochodzi od autora biblioteki.
