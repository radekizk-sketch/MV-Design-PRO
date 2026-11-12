# Standard ENEA dla GPZ 110 kV/SN — kontrakt wiążący produktu

Status: **BINDING** (dyrektywa właściciela 2026-11-12: „zapamiętaj standardy ENEA i stosuj globalnie”).
Źródło: ENEA Operator, „Standardy w sieci dystrybucji — Stacje elektroenergetyczne 110 kV,
Zeszyt 1”, wersja 02.2023–2 (obowiązuje od 02.04.2024), 99 stron, pobrany z witryny
operatora 2026-11-12, SHA-256 pliku zaczyna się od `467547d5` i kończy na `a488`.
PDF i rysunki NIE są w repozytorium (prawa ENEA). Ten dokument zawiera wyłącznie numery punktów,
wartości liczbowe i własne sformułowania; nie jest cytatem.

## 1. Zakres stosowania (globalnie)

Standard ENEA Zeszyt 1 jest **domyślnym wzorcem odniesienia** dla stacji 110 kV/SN (GPZ)
w całym produkcie, we wszystkich miejscach łańcucha, a nie tylko na schemacie:

- katalog typów (aparatura, przekładniki, urządzenia zabezpieczeniowe);
- model ENM (pola, sekcje, numeracja, dane znamionowe, obwody wtórne, urządzenia);
- kreator stacji i kreator pola SN;
- schemat jednokreskowy (oznaczenia, kolejność aparatów, ramki urządzeń);
- inspektor i karta techniczna elementu;
- ocena doboru aparatury (napięcie, prąd znamionowy, wytrzymałość zwarciowa);
- zabezpieczenia i automatyka (funkcje, przypisanie do urządzeń, sygnały);
- raporty i komentarz obliczeń.

Standard jest wdrażany jako **wariant standardu operatora** (profil OSD) wybierany w modelu,
a nie jako stałe zaszyte w kodzie: wariant ENEA jest domyślny, inny operator nie zmienia
globalnie oznaczeń istniejących obiektów, trwałe identyfikatory modelu się nie zmieniają.
Ocena zgodności z ENEA jest werdyktem wyjaśnialnym
(`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`): punkt standardu, wartość w modelu,
wymaganie, wynik. Brak danej w modelu nie jest zgodnością; wartość robocza
(Zasada nr 4, jakość `ESTIMATED`) daje kompletność dowodu `NIEPELNY`.

## 2. Wymagania potwierdzone w tekście standardu

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| E-01 | §13 | Sekcje rozdzielnicy SN oznacza się literami A i B. |
| E-02 | §13 | Numeracja pól: ustawienie dwurzędowe — sekcja A nieparzyste (1, 3, 5…), sekcja B parzyste (2, 4, 6…); ustawienie jednorzędowe — kolejno 1, 2, 3… |
| E-03 | §13 | Napięcie znamionowe rozdzielnicy 24 kV dla sieci o napięciu do 20 kV. |
| E-04 | §8.2 tab. 3 | Transformator do 25 MVA: szyny, pole TR i łącznik szyn 1250 A; pola liniowe, zespołu uziemiającego i baterii kondensatorów 630 A. |
| E-05 | §8.2 tab. 4 | Transformator 25–40 MVA: szyny 2000 A (pozostałe wiersze tabeli odczytać z oryginału przed wdrożeniem). |
| E-06 | §9.2 | Rozdzielnica SN: prąd krótkotrwały wytrzymywany 3 s co najmniej 16 kA. |
| E-07 | §13 | Fizyczna szerokość celki 60–80 cm, pole TR i łącznik szyn do 100 cm. To wymiar konstrukcyjny, NIE wymiar schematu. |
| E-08 | §13 | Pola liniowe, TR i pomiarowe mają gniazda do bezpośredniego przyłączenia przekładnika napięciowego, z odłączeniem i uziemieniem bez demontażu. |
| E-09 | §13 | Przekładnik napięciowy nie ma wkładek bezpiecznikowych w torze SN. Zabezpieczenia na Z.17 dotyczą obwodów wtórnych. |
| E-10 | §13 | Wydzielone pole pomiaru napięcia w każdej sekcji; SZR z przekaźnikiem w polu łącznika szyn. |
| E-11 | §13 | Blokady mechaniczne i elektryczne, także łączników trójpołożeniowych; uziemniki stałe w każdym polu, na szynach sekcji i na wyprowadzeniach liniowych; wyłączniki próżniowe; brak urządzeń SN poza obrysem celki. |
| E-12 | §13 | Przekładnik Ferrantiego w przedziale kablowym pola liniowego, z dodatkowym złączem pomiarowym; dopuszczalne dwa przekładniki prądowe w przedziale przyłączeniowym. |
| E-13 | Z.7 | Pole TR strona SN, od szyny: wskaźnik napięcia, odłącznik z uziemnikiem, wyłącznik, odgałęzienie VT, CT, wskaźnik napięcia, głowica, ogranicznik przepięć, transformator (uzwojenie SN w trójkąt). |
| E-14 | Z.7 | CT strony SN: 1000/5/5/5/5 A dla 110/15 kV do 25 MVA; 1600 A dla 110/15 kV 40 MVA; 800 A dla 110/20 kV do 25 MVA; 1200 A dla 110/20 kV 40 MVA. Rdzenie: I 0,2S FS5 (układ pomiarowy bilansowo-kontrolny, analizator jakości energii), II 0,2 FS5 (pomiary lokalne strony SN, dalej ARN), III 5P20 (zabezpieczenie różnicowe TR), IV 5P20 (sterownik pola: I>, I>>, IZS>>). Odczyt torów rysunku zweryfikowany ponownie 2026-11-12. |
| E-15 | Z.7 | VT pola TR: trzy uzwojenia wtórne 0,1/√3 kV (klasy 0,2; 0,5; 0,5/3P). |
| E-16 | Z.7, §26.9.4 | Trzy odrębne urządzenia: sterownik pola (I>, I>>, zabezpieczenie szyn, LRW), zabezpieczenie różnicowe transformatora, regulator ARN. |
| E-17 | Z.17 | VT pola pomiaru napięcia 0,1/√3 : 0,1/√3 : 0,1/3 kV; uzwojenie 0,1/3 w otwartym trójkącie daje 3U0. |
| E-18 | §26.9.8, Z.17 | Pole pomiaru napięcia: U>, U<, 3U0>, f<, df/dt; SCO 1 st., SCO 2 st. i SPZ po SCO są automatyką pod f<, nie funkcjami zabezpieczeniowymi. |
| E-19 | §26.9.9 | Zabezpieczenie szyn rozproszone: IZS>>T w sterowniku pola TR, blokowane pobudzeniem I> każdego odpływu (linia, ZU, BKR); przy zasilaniu z jednego TR i zamkniętym łączniku — wyłączenie łącznika i blokada SZR. |
| E-20 | §26.9.5 | Łącznik szyn: I>>T, I>T, doziemne, blokowanie ZS od I>, LRW (Z.12). |
| E-21 | §26.9.6 | Zespół uziemiający: I>>T, I>T, doziemne, blokowanie ZS, SPZ TU tylko w sieci z rezystorem, pobudzenie LRW (Z.13–Z.15). |
| E-22 | §26.9.7 | Bateria kondensatorów: I>>T, I>T, ziemnozwarciowe, zabezpieczenie od uszkodzeń kondensatorów, U>T, blokowanie ZS, pobudzenie LRW, sterowanie zegarem (Z.16). |

### Rozdzielnia 110 kV

Zakres produktu (decyzja właściciela, przypomniana 2026-11-12): MV-DESIGN-PRO NIE modeluje pełnej
rozdzielni 110 kV. Strona 110 kV to równoważnik obliczeniowy sieci (dane SN, wspólny równoważnik
110 kV albo oddzielne zasilania 110 kV), rysowany symbolem sieci zasilającej, bez pól i aparatury
110 kV. Wiersze E-23…E-27 są wyłącznie informacją o standardzie (np. do opisu warunków przyłączenia),
nie zakresem wdrożenia.

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| E-23 | §11.1, Z.1 | Rozwiązanie podstawowe: układ H5 — jednosystemowa, dwusekcyjna (sekcje A i B), pięć pól: dwa liniowe, dwa transformatorowe, łącznik szyn. Dopuszczalny H4 (z rezerwą terenu do H5 lub 1S); przy współpracy z wytwórcami przyłączonymi do 110 kV łącznik szyn wyposażony jak w H5. Niedopuszczalna stacja z jedną linią zasilającą 110 kV. |
| E-24 | §11.1 | Pole liniowe 110 kV, od szyny: odłącznik szynowy z uziemnikiem od strony pola, wyłącznik, przekładniki zespolone prądowo-napięciowe, odłącznik liniowy z uziemnikiem od strony linii, ograniczniki przepięć z licznikami zadziałań. |
| E-25 | §11.1 | Pole transformatorowe 110 kV, od szyny: odłącznik szynowy z uziemnikiem od strony pola, wyłącznik, przekładniki zespolone prądowo-napięciowe, ograniczniki przepięć z licznikami zadziałań (Z.6). |
| E-26 | §11.1, Z.8, Z.9 | Pole łącznika szyn 110 kV: odłącznik sekcyjny z uziemnikiem od strony pola, wyłącznik, przekładniki zespolone, odłącznik sekcyjny z uziemnikiem od strony pola (H5 — Z.8; H4 — Z.9). |
| E-27 | Z.1 | Na rysunku zasadniczym: linie 110 kV wchodzą od góry do pól liniowych, sekcje A i B rozdzielone polem łącznika szyn, pola transformatorowe schodzą do transformatorów, a te do sekcji A i B rozdzielni SN; punkt neutralny 110 kV transformatora z ogranicznikiem i odłącznikiem. Wartości znamionowe aparatów i przekładni odczytywać z Z.1, Z.4–Z.6, Z.8 przed wpisaniem do katalogu. |

Rysunki Z.12, Z.13–Z.15 i Z.16 trzeba przeczytać w oryginale przed wdrożeniem szczegółów tych
pól (kolejność aparatów, przekładnie, przypisanie do urządzeń). Do tego czasu wiersze E-20…E-22
obejmują wyłącznie listę funkcji z §26.9.

## 3. Decyzje MV-DESIGN-PRO, które NIE są wymaganiami ENEA

Nie wolno ich przedstawiać w produkcie, raporcie ani dokumentacji jako wymagań standardu:
odstęp szyna–pierwszy aparat 48 jednostek sceny, moduł szerokości pola W i jego krotności,
raster 24 jednostek, proporcje symboli (CT, VT, TR), kolory i typografia, wyrównanie ramek
urządzeń, skróty ANSI na schemacie. To standard wizualny produktu (dyspozycja B-02).

## 4. Zasady stosowania

1. Nie dopisuje się aparatów, przekładni ani funkcji, których nie potwierdza właściwy wariant
   standardu (moc i napięcie transformatora, rodzaj pola).
2. Każda pozycja oceny zgodności podaje punkt standardu z tego dokumentu (E-xx i punkt ENEA).
3. Zgodności z ENEA nie deklaruje się bez sprawdzenia rysunku źródłowego dla danego pola.
4. Wartości tego dokumentu zasilają katalog i profile, nie kod rysujący ani literały w UI.
5. Zmiana wersji standardu ENEA wymaga nowej wersji tego dokumentu z porównaniem wydań.
6. Odrębność urządzeń (E-16) jest faktem modelu i inspektora, nie wymogiem rysunku: inspektor pola
   rozróżnia sterownik pola, zabezpieczenie różnicowe transformatora i regulator napięcia; schemat
   jednokreskowy może pokazywać zwarty blok funkcji pola bez trzech osobnych ramek
   (dyspozycja właściciela 2026-11-12).
7. Kreator nie dodaje pól bezwarunkowo. Pole pomiaru napięcia, pole sprzęgła i inne wyposażenie
   wynikające z §13 kreator zakłada, gdy projektant wybrał wariant ENEA wymagający tego wyposażenia
   (np. rozdzielnica dwusekcyjna). W innych konfiguracjach nie generuje zbędnych pól
   (dyspozycja właściciela 2026-11-12).
8. SCO I, SCO II i SPZ po SCO (E-18) pozostają w szablonie Z.17 jako funkcje konfigurowalne,
   domyślnie NIEAKTYWNE. Schemat pokazuje wyłącznie funkcje rzeczywiście skonfigurowane. Inspektor
   pola ma grupę „Automatyka SCO” z nastawami, sygnałami pomiarowymi i powiązaniami wykonawczymi.
   Wyłączenie funkcji nie usuwa jej definicji katalogowej. SCO (stopnie I i II) i SPZ po SCO są
   odrębnymi funkcjami (dyspozycja właściciela 2026-11-12).
