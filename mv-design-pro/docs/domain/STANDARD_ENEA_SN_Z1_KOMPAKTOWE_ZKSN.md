# Standard ENEA SN, Zeszyt 1 — stacje kompaktowe SN/nN i złącza kablowe SN (ZKSN)

Status: **BINDING** (dyrektywa właściciela 2026-11-12: standardy ENEA są domyślnym wzorcem
produktu; Zasada nr 5 w `CLAUDE.md`, wzorzec formy `STANDARD_ENEA_GPZ_Z1.md`).

Źródło: ENEA Operator sp. z o.o., „Standardy w sieci dystrybucji — Stacje elektroenergetyczne
średniego napięcia, Zeszyt 1. Stacje transformatorowe kompaktowe prefabrykowane SN/nN oraz
złącza/szafy kablowe SN”, wersja 06.2024, obowiązuje od 01.01.2025, zatwierdzona uchwałą
Zarządu nr 372/2024; zastępuje wersję 09.2021-2 (uchwała 364/2021 zmieniona uchwałą 7/2024).
Adres pobrania: `https://www.operator.enea.pl/media/683/` (plik „stacje-elektroenergetyczne-
sredniego-napiecia-zeszyt-1-stacje-transformatorowe-k…”), pobrany 2026-11-12, 37 stron,
SHA-256 pliku zaczyna się od `063b5372` i kończy na `7d28`.
PDF i rysunki NIE są w repozytorium (prawa ENEA). Dokument zawiera wyłącznie numery punktów,
wartości liczbowe i własne sformułowania; nie jest cytatem.

Prefiksy: `ES1-` — stacja kompaktowa (rozdz. 4), `EZ-` — złącze/szafa kablowa SN (rozdz. 5).
Wymagania wspólne dla rodziny stacji SN/nN, zmienione w zeszytach 2, 3 i 6, są opisane
w plikach `STANDARD_ENEA_SN_Z2_UPROSZCZONE.md`, `STANDARD_ENEA_SN_Z3_SLUPOWE.md`,
`STANDARD_ENEA_SN_Z6_WNETRZOWE.md`; telemechanika w `STANDARD_ENEA_SN_TELEMECHANIKA.md`;
szafa AMI w `STANDARD_ENEA_SN_Z4_AMI.md`.

## 1. Zakres stosowania w produkcie

Zeszyt 1 SN jest **domyślnym wzorcem** dla stacji transformatorowej SN/nN do 630 kVA
i dla złącza kablowego SN bez transformatora (ZKSN) w całym łańcuchu produktu:

- katalog typów: rozdzielnica SN (RMU/modułowa 24 kV), rozłącznik trzypołożeniowy, zestaw
  rozłącznik–bezpieczniki, wyłącznik pola TR, głowice konektorowe Int A/Int C, kabel 70 mm²
  do TR, transformator SN/nN do 630 kVA, rozdzielnica nN 12 pól, rozłączniki listwowe
  wielkości 2 i 00, przekładniki prądowe nN, kondensator biegu jałowego;
- model ENM: `Substation` (typ i konstrukcja stacji), pola SN i nN, `BranchPointSN` typu
  `zksn`, transformator, połączenia kablowe TR;
- kreator stacji, kreator pola SN, konfigurator rozdzielnicy SN (RMU);
- schemat jednokreskowy: kolejność aparatów w polu, brak sprzęgła i pola TR w ZKSN,
  pole pomiarowe MP za kablem pola liniowego;
- walidator i ocena doboru aparatury (napięcie 24 kV, prąd 630 A / 200 A, 16 kA/1 s,
  40 kA szczytowo, łuk wewnętrzny);
- zabezpieczenia: pole TR na bezpiecznikach albo wyłącznik z autonomicznym przekaźnikiem,
  sygnalizatory przepływu prądu zwarciowego w polach liniowych;
- raport i komentarz obliczeń (podstawa: numer punktu Zeszytu 1).

Standard wdraża się jako **wariant standardu operatora** (profil OSD ENEA w Reference Engine,
pakiet `osd_enea`), nie jako literały w kodzie. Ocena zgodności jest werdyktem wyjaśnialnym
(`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`): punkt standardu, wartość w modelu,
wymaganie, wynik, margines. Brak danej w modelu nie jest zgodnością; wartość robocza
(Zasada nr 4, jakość `ESTIMATED`) daje kompletność dowodu `NIEPELNY`.

Zgodnie z §3 zeszytu słowa „powinien” i „należy” oznaczają w nim obowiązek. Parametry są
wymaganiami minimalnymi (§1).

## 2. Wymagania potwierdzone — stacja kompaktowa SN/nN (rozdz. 2 i 4)

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| ES1-01 | §1 | Podane parametry są minimalne; dopuszcza się lepsze. |
| ES1-02 | §2 | Podstawowym rozwiązaniem stacji SN/nN jest stacja kompaktowa prefabrykowana z transformatorem do 630 kVA. |
| ES1-03 | §2 | Wariant uproszczony do 400 kVA (Zeszyt 2) stosuje się tam, gdzie dotąd stały stacje słupowe i nie przewiduje się dodatkowych pól SN ani nN. |
| ES1-04 | §2 | Nie zaleca się budowy nowych stacji słupowych. |
| ES1-05 | §2 | Stacji nie lokalizuje się przy skarpach ani na nasypach. |
| ES1-06 | §3 | Wyrazy „powinien/należy” oznaczają wymaganie obowiązkowe. |
| ES1-07 | 4.1.1 | Obsługa stacji wyłącznie z zewnątrz (bez wchodzenia do wnętrza). |
| ES1-08 | 4.1.2 | Rozdzielnica SN do 5 pól, izolacja gazowa, powietrzna albo stało-powietrzna. |
| ES1-09 | 4.1.3 | Rozdzielnica nN z 12 polami odpływowymi z rozłącznikami wielkości 2. |
| ES1-10 | 4.1.4 | Wydzielone miejsce na szafę systemu AMI. |
| ES1-11 | 4.1.5 | Wydzielone miejsce na szafę telemechaniki oraz zamknięte koryta kablowe wg 4.7.1 h. |
| ES1-12 | 4.1.6 | Miejsce na sygnalizację zwarć (doziemnych i międzyfazowych) dla każdego pola liniowego, z przewodami do napędów, do sensorów prądowych (montowanych w kierunku odpływu) i do sensorów napięciowych. |
| ES1-13 | 4.1.7 | Rozdzielnica SN montowana i wymieniana przez dach. |
| ES1-14 | 4.1.8 | Obudowa żelbetowa samonośna, chroniąca obsługę przed gorącymi gazami z łuku. |
| ES1-15 | 4.1.9 | Elewacja dopuszczalna indywidualnie (dostosowana do otoczenia). |
| ES1-16 | 4.1.10 | Stacja przewożona transportem samochodowym w całości. |
| ES1-17 | 4.1.11 | Wysokość stacji maks. 2 m, liczona od znacznika zakopania do dachu. |
| ES1-18 | 4.1.12 | Dla stacji budowanych po 01.01.2028: bez ścian pełnych albo z jedną pełną — szerokość 3000 mm, głębokość 2100 mm (3 lub 4 pola SN) albo 2400 mm (5 pól SN); z trzema ścianami pełnymi REI 120 — szerokość 3600 mm (3/4 pola) albo 4200 mm (5 pól), głębokość 1800 mm; wysokość od znacznika zakopania do dachu 2100 mm. |
| ES1-19 | 4.1.13 | Wentylacja grawitacyjna. |
| ES1-20 | 4.1.14 | Stopień ochrony obudowy IP 43. |
| ES1-21 | 4.1.15 | Dokumentacja techniczno-ruchowa w języku polskim. |
| ES1-22 | 4.2 | Stacja składa się z: rozdzielnicy SN, rozdzielnicy nN, komory transformatora, miejsca na szafę AMI i miejsca na szafę telemechaniki. |
| ES1-23 | rys. 1 (odczyt rysunku) | Schemat stacji: obudowa do 5 pól SN; pola 1–4 liniowe 630 A z napędem silnikowym, pola 1 i 2 w obrysie przerywanym (opcjonalne); w polu liniowym od szyny: rozłącznik z napędem, uziemnik od strony kabla, głowica konektorowa typu C 630 A, przepust kablowy. |
| ES1-24 | rys. 1 (odczyt rysunku) | Pole 5 transformatorowe 200 A z napędem: rozłącznik, uziemnik, bezpiecznik, drugi uziemnik, głowica typu A 250 A (stożek zewnętrzny). |
| ES1-25 | rys. 1 (odczyt rysunku) | Rozdzielnica SN: 24 kV, 630 A, 16 kA przez 1 s. Kabel do TR: 3 × YHAKXS/NA2XSY 1×70 mm² 12/20 kV. |
| ES1-26 | rys. 1 (odczyt rysunku) | Transformator 6, 15 lub 20 / 0,4 kV, do 630 kVA, napięcie strony dolnej 420 V, grupa połączeń Dyn5. |
| ES1-27 | rys. 1 (odczyt rysunku) | Połączenie TR–nN: 3 × 2 × N2XY 240 mm² i 2 × N2XY 240 mm² (neutralny), 0,6/1 kV. |
| ES1-28 | rys. 1 (odczyt rysunku) | Rozdzielnica 0,4 kV: 400 V, łącznik główny 1250 A, 16 kA; kondensator 440 V przez rozłącznik typu 00; przekładniki 800/5 A kl. 0,2S 5 VA FS5; 12 odpływów 400 A; szyna PEN 60×10; szyna uziemiająca Cu 40×10; miejsce pomiaru cęgowego; miejsca szaf AMI i telemechaniki. |
| ES1-29 | 4.3.1 | Rozdzielnica SN kompaktowa lub modułowa. |
| ES1-30 | 4.3.1 a | Jedno pole transformatorowe. |
| ES1-31 | 4.3.1 b | Od 2 do 4 pól liniowych, z możliwością montażu ograniczników przepięć na głowicach Int C. |
| ES1-32 | 4.3.1 c | Tabliczki z numerem pola, nazwą i kierunkiem linii przy napędach łączników, nie na pokrywach przedziałów kablowych. |
| ES1-33 | 4.3.1 d | Trwały schemat synoptyczny na obudowie rozdzielnicy. |
| ES1-34 | 4.3.1 e | Miejsce na schemat stacji formatu A4. |
| ES1-35 | 4.3.1 f | Uchwyty kablowe z materiału nieprzewodzącego. |
| ES1-36 | 4.3.2 | Napięcie znamionowe 24 kV; 3 fazy; wytrzymywane udarowe 125 kV i przemienne 50 kV; 50 Hz; prąd znamionowy szyn 630 A. |
| ES1-37 | 4.3.2 | Prąd krótkotrwały wytrzymywany 16 kA (szyny, pole liniowe, uziemnik), szczytowy 40 kA; klasyfikacja łuku wewnętrznego 16 kA przez 1 s. |
| ES1-38 | 4.3.3 | Pole TR: podstawowo rozłącznik trzypołożeniowy z bezpiecznikami; opcjonalnie wyłącznik próżniowy z odłącznikiem-uziemnikiem i autonomicznym przekaźnikiem chroniącym TR 160–630 kVA przed przeciążeniem oraz zwarciami doziemnymi i międzyfazowymi. |
| ES1-39 | 4.3.4 | Pole TR: blokada mechaniczna między stanem zamkniętym a uziemionym; pokrywa przedziału kablowego otwierana tylko w pozycji uziemionej; możliwość założenia kłódki. |
| ES1-40 | 4.3.5 | Rozłącznik pola TR: 200 A (niezależnie od bezpieczników), klasa mechaniczna M1, uziemnik E2, wyzwalacz zadziałania od przepalenia wkładki. |
| ES1-41 | 4.3.6 | Zestaw rozłącznik–bezpieczniki: prąd załączalny 40 kA, wyłączalny 16 kA, wkładki z wybijakiem o sile 80 N. |
| ES1-42 | 4.3.7 | Wyłącznik pola TR (wariant opcjonalny): 200 A, załączalny 40 kA, wyłączalny 16 kA, M1/E2. |
| ES1-43 | 4.3.8 | Pole liniowe: rozłącznik trzypołożeniowy albo rozłącznik próżniowy z odłącznikiem-uziemnikiem; dopuszczony wyłącznik. |
| ES1-44 | 4.3.9 | Pole liniowe: blokady jak w polu TR (4.3.4). |
| ES1-45 | 4.3.10 | Rozłącznik pola liniowego: 630 A, załączalny 40 kA, wyłączalny 630 A, M1/E2. |
| ES1-46 | 4.3.11 | Wyłącznik pola liniowego (gdy zastosowany): 630 A, załączalny 40 kA, wyłączalny 16 kA, M1/E2. |
| ES1-47 | 4.3.12 | Przystosowanie do telemechaniki: napędy i obwody 24 V DC, rozbudowa bez demontażu rozdzielnicy. |
| ES1-48 | 4.3.13 | Sygnalizatory przepływu prądu zwarciowego albo (przy wyłączniku) układ zabezpieczeń działający w sieciach kompensowanych, z rezystorem i z układem rezystor–dławik. |
| ES1-49 | 4.3.14 | Wskaźniki obecności napięcia (VDS) zainstalowane na stałe w każdym polu liniowym i każdej fazie, z zaciskami do uzgadniacza faz. |
| ES1-50 | 4.3.15 | Wskaźnik ciśnienia albo manometr gazu izolacyjnego. |
| ES1-51 | 4.4.1 | Łącznik główny nN: rozłącznik izolacyjny 1250 A; 12 pól odpływowych z rozłącznikami wielkości 2; wymiana rozłącznika bez demontażu szyn. |
| ES1-52 | 4.4.2 | Szyny Cu cynowane 60×10 mm, rozstaw osi 185 mm, nakrętki wprasowane, podziałka 100 mm (prace pod napięciem), osłony pól rezerwowych, szyna PEN 60×10 z zaciskami typu V (≥ 30 Nm, do 240 mm²), oznaczenia L1/L2/L3/PEN. |
| ES1-53 | 4.4.3 | Rozłączniki listwowe na rozstaw 185 mm; wielkość 00 na hakach lub adapterach; szerokość 50 mm (00) i 100 mm (2); praca pionowa; otwierane jednobiegunowo; zaciski V ≥ 30 Nm do 240 mm² (wielkość 2) i ≥ 20 Nm do 150 mm² (00); niezależna wymiana; osłona zacisków; palność V-0; sygnalizacja przepalenia wkładki jednym sygnałem na listwę (obudowa ≥ V-2); kategoria użytkowania AC-23B; korytko 40×60 mm do szafy AMI. |
| ES1-54 | 4.4.4–4.4.7 | Uchwyty kablowe; osłony pól rezerwowych V-0; uchwyty do uziemiacza przenośnego; tabliczki opisowe pól. |
| ES1-55 | 4.4.8 | Przekładniki prądowe 800/5 A kl. 0,2S, 5 VA, FS5, nasuwane, za łącznikiem głównym. |
| ES1-56 | 4.4.9 | Gniazdo wtykowe z bezpiecznikiem Bi 16 A. |
| ES1-57 | 4.4.10 | Listwa kontrolno-pomiarowa. |
| ES1-58 | 4.4.11 | Kondensator do kompensacji mocy biernej biegu jałowego TR, przyłączony przez rozłącznik skrzynkowy wielkości 00 przewodem Cu ≥ 4 mm² o izolacji 1,8/3 kV. |
| ES1-59 | 4.4.12 | Miejsce na szafę AMI o wymiarach min. 620 × 800 × 245 mm. |
| ES1-60 | 4.4.13 | Szafa telemechaniki IP 44, min. 700 × 500 × 320 mm; drzwi szaf otwierane bez ograniczeń. |
| ES1-61 | 4.5 | Rozdzielnica nN: napięcie izolacji 690 V; szyny 910 A ciągle (1100 A przez 2 h); odpływy 400 A; 16 kA przez 1 s; 32 kA szczytowo. |
| ES1-62 | rys. 2 (odczyt rysunku) | Rozmieszczenie w rozdzielnicy nN: rozłącznik główny Q0 1250 A z przekładnikami T1–T3, zabezpieczenia oświetlenia i gniazd, miejsce szafy AMI, rząd 12 rozłączników listwowych, miejsce szafy telemechaniki; wykonanie lustrzane dopuszczalne. |
| ES1-63 | 4.6.1 a | TR–rozdzielnica SN: trzy kable jednożyłowe XLPE, żyła Al 70 mm², 12/20 kV, głowice konektorowe po obu stronach. |
| ES1-64 | 4.6.1 b | W polu TR głowice Int A (stożek zewnętrzny); przy wyłączniku w polu TR głowice Int C; głowice z zewnętrzną warstwą przewodzącą uziemioną. |
| ES1-65 | 4.6.2 a | TR–rozdzielnica nN: kable Cu N2XY 1×240 mm² 0,6/1 kV, po jednym na fazę do 250 kVA i po dwa powyżej 250 kVA. |
| ES1-66 | 4.6.2 b–c | Zaciski TR i rozdzielnicy bezkońcówkowe na 2 × 240 mm² bez zmniejszania przekroju; zaciski TR umożliwiają przyłączenie ograniczników przepięć. |
| ES1-67 | 4.7.1 a–d | Dwa prefabrykaty (część dolna i górna); klasa obudowy ≥ 20 wg normy [54]; beton C30/37; dach płaski z okapnikiem. |
| ES1-68 | 4.7.1 e–i | Przekładka gumowa między prefabrykatami; wentylacja; miejsca na szafki telemechaniki i AMI; listwa kablowa min. 100 × 50 mm; oświetlenie wnętrza z zabezpieczeniem; łączniki krańcowe drzwi z sygnałem do AMI. |
| ES1-69 | 4.7.1 j–m | Misa olejowa na pełną objętość oleju TR 630 kVA; krata lub barierka przy TR; stabilne mocowanie rozdzielnic; krawędzie stalowe gratowane. |
| ES1-70 | 4.7.1 n–r | Cztery przepusty SN szczelne (5 bar wody, 3 bar gazu); przepusty nN z przegrodą; przepusty uziemienia; hydroizolacja. |
| ES1-71 | 4.7.1 s–v | Otwór ≥ 60 mm na kabel zasilania tymczasowego (agregat); otwory transportowe; cztery zawiesia; szczelne otwory w dachu. |
| ES1-72 | 4.7.1 w | Przewód uziemiający przez płaskownik albo zacisk krzyżowy. |
| ES1-73 | 4.7.1 x–z | Klasa łuku wewnętrznego IAC-AB 16 kA przez 1 s; odporność IK 10 (20 J); obciążenie dachu 2000 N/m²; TR na wibroizolatorach. |
| ES1-74 | 4.7.2 | Elewacja z tynku odpornego na UV; dach z dwiema powłokami wg [64] i [65]; kolorystyka wg rys. 3. |
| ES1-75 | 4.7.3 a–k | Stolarka Al lub stal cynkowana; klasa korozyjności C4 (badanie Kesternicha); dolna krawędź drzwi ≥ 15 cm nad terenem; połączenia wyrównawcze; ukryte zawiasy nierdzewne; blokada otwarcia przy 95°; ryglowanie dwupunktowe i kłódka; siatka wentylacyjna ≤ 3 mm; zamek pod klucz MASTER KEY; ocynk. |
| ES1-76 | 4.8 | Uziemienie wg standardu ENEA ochrony przeciwporażeniowej w sieci SN; złącze kontrolne dostępne dla pomiaru cęgowego bez wyłączania stacji. |
| ES1-77 | 4.9 | Oznakowanie: tablice wg standardu tablic i znaków ENEA; numer stacji na drzwiach od strony drogi; drzwi opisane jako komora transformatora, rozdzielnia SN, rozdzielnia nN; opisy pól SN i nN z wartościami wkładek; tabliczka ostrzegawcza o napięciu w każdej części; mocowanie przez nitowanie. |

## 3. Wymagania potwierdzone — ZKSN (rozdz. 5)

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| EZ-01 | 5.1.1 | Obsługa złącza wyłącznie z zewnątrz. |
| EZ-02 | 5.1.2 | Rozdzielnica SN do 5 pól. |
| EZ-03 | 5.1.3 | Rozdzielnica montowana przez dach. |
| EZ-04 | 5.1.4 | Obudowa żelbetowa. |
| EZ-05 | 5.1.5 | Elewacja dopuszczalna indywidualnie. |
| EZ-06 | 5.1.6 | Transport samochodowy w całości. |
| EZ-07 | 5.1.7 | Wysokość złącza maks. 2 m, liczona od znacznika zakopania do dachu. |
| EZ-08 | 5.1.8 | Dla złączy budowanych po 01.01.2028: szerokość 1500 mm, głębokość 1300 mm, wysokość od znacznika zakopania do dachu 2100 mm; typoszereg szerokości co 300 mm zależnie od rodzaju złącza. |
| EZ-09 | 5.1.9–5.1.11 | Wentylacja; IP 43; DTR po polsku. |
| EZ-10 | rys. 4a (odczyt rysunku) | Wariant 1 bez telemechaniki: obudowa min. 5 pól; każde pole 630 A: szyna, rozłącznik z napędem silnikowym, uziemnik, głowica C 630 A, przepust, kabel z opisem kierunku; dwa ostatnie pola w obrysie przerywanym (opcjonalne). Rozdzielnica 24 kV, 630 A, 16 kA. Uziemienie: szyna Cu 40×10, przewód H07V-K 70 mm², połączenie ze zbrojeniem budynku. **Brak sprzęgła i brak pola transformatorowego.** |
| EZ-11 | rys. 4b (odczyt rysunku) | Wariant 2 z telemechaniką: obudowa min. 3 pól SN z zasilaniem telemechaniki; pola 1–3 630 A z napędem, pole 4 opcjonalne; opcjonalny przekładnik zasilający szafę telemechaniki z bezpiecznikiem 0,5 A, przyłączony kablem 2 × 1 × 50 mm² do odpływu kablowego pola 1 (poza rozdzielnicą); szafa telemechaniki z ogranicznikiem przepięć typu B+C i bezpiecznikiem 10 A; przy większej liczbie pól dopuszczalne większe gabaryty. **Brak sprzęgła.** |
| EZ-12 | rys. 4c–4e (odczyt rysunku) | Wariant 3 (z pomiarem): rozdzielnica 3 pola liniowe, pole pomiarowe MP, przekładnik potrzeb własnych, tablica pomiarowa za osobnymi drzwiami z zamkiem MASTER KEY, przedział szafy telemechaniki; przy ograniczeniach konstrukcyjnych dodatkowy przedział telemechaniki. |
| EZ-13 | rys. 4f (odczyt rysunku) | Schemat wariantu 3: z odpływu pola 1 kabel do pola MP; w MP wejście kablowe → 3 przekładniki prądowe → wyjście kablowe; odgałęzienie przez bezpieczniki WBP20 do 3 przekładników napięciowych i do przekładnika zasilania szafy telemechaniki; tablica pośredniego pomiaru energii. **Pole MP nie ma łącznika.** |
| EZ-14 | rys. 4g–4h (odczyt rysunku) | Złącze pomiarowe SN z pośrednim układem pomiarowo-rozliczeniowym: bez łączników; kabel wejściowy → 3 CT → kabel wyjściowy; 3 VT przez WBP20; 24 kV, 630 A, min. 16 kA przez 1 s. |
| EZ-15 | rys. 4i–4j (odczyt rysunku) | Wariant z dwoma układami pomiarowymi: 4 pola liniowe z rozłącznikami i napędami; skrajne pola zasilają kablami dwa pola MP, każde z CT, WBP, VT i przekładnikiem potrzeb własnych. **Brak sprzęgła.** |
| EZ-16 | 5.3 | Rozdzielnica kompaktowa lub modułowa, z łącznikami próżniowymi. |
| EZ-17 | 5.3 a | Od 3 do 5 pól liniowych. |
| EZ-18 | 5.3 b | Ograniczniki przepięć montowalne na głowicach Int C, z miejscem na opis. |
| EZ-19 | 5.3 c–f | Tabliczki przy napędach; trwały schemat; miejsce na schemat A4; uchwyty kablowe nieprzewodzące. |
| EZ-20 | 5.4 | 24 kV; 3 fazy; 125/50 kV; 50 Hz; szyny 630 A; 16 kA; 40 kA szczytowo; łuk wewnętrzny 16 kA przez 1 s. |
| EZ-21 | 5.5.1 | Pole liniowe z rozłącznikiem trzypołożeniowym; wyłącznik dopuszczony. |
| EZ-22 | 5.5.2 | Blokady zamknięty/uziemiony, blokada pokrywy kablowej, kłódka. |
| EZ-23 | 5.5.3 | Rozłącznik: 630 A, załączalny 40 kA, wyłączalny 630 A, M1/E2. |
| EZ-24 | 5.5.4 | W wariancie 2 (rys. 4b) napędy i obwody telemechaniki 24 V DC. |
| EZ-25 | 5.5.5 | Sygnalizatory przepływu prądu zwarciowego albo, przy wyłączniku, zabezpieczenia dla sieci kompensowanych, z rezystorem i z układem rezystor–dławik. |
| EZ-26 | 5.5.6 | VDS w każdej fazie każdego pola. |
| EZ-27 | 5.5.7 | Szafa telemechaniki min. 700 × 500 × 320 mm. |
| EZ-28 | 5.5.8 | Manometr albo wskaźnik ciśnienia gazu. |
| EZ-29 | 5.5.9 | Układ pomiarowy wg standardu ENEA „Układy pomiarowe energii elektrycznej”. |
| EZ-30 | 5.5.10 | Osobne drzwi do przedziału układu pomiarowego. |
| EZ-31 | 5.5.11 | Obwody telemechaniki wg standardu telemechaniki SN. |
| EZ-32 | 5.6.1 a–f | Dwa prefabrykaty; miejsce na szafkę telemechaniki; beton C30/37; uszczelka; wentylacja; pięć przepustów SN szczelnych (5 bar wody, 3 bar gazu). |
| EZ-33 | 5.6.1 g | W ZKSN z modułem pomiarowym przepusty SN pola MP z tyłu obudowy. |
| EZ-34 | 5.6.1 h–n | Hydroizolacja; otwory transportowe; zawiesia; uziemienie; IAC-AB 16 kA przez 1 s; IK 10; dach 2000 N/m². |
| EZ-35 | 5.6.2 | Powłoki elewacji i dachu; kolorystyka i wymiary oznakowania wg rys. 5 i 6. |
| EZ-36 | 5.6.3 | Stolarka jak w 4.7.3. |
| EZ-37 | 5.7 | Uziemienie jak w 4.8. |
| EZ-38 | 5.8 | Oznakowanie: drzwi „rozdzielnia SN”, opisy pól, tabliczka ostrzegawcza o napięciu, nitowanie. |
| EZ-39 | 5.9.8 | Okres przejściowy 12 miesięcy dla złączy z pośrednim pomiarem rozliczeniowym w zakresie przedziału transformatora potrzeb własnych i szafki telemechaniki. |
| EZ-40 | §6 | Inne rozwiązania wyłącznie decyzją Dyrektora Obszaru Dystrybucji. |

## 4. Rozdziały formalne (spis)

- §3 — wykaz norm [1]–[80] i definicja słów obowiązku.
- 4.10.1–4.10.9 — dokumentacja dostawcy (DTR, rysunki, protokoły badań, deklaracje, instrukcje).
- 4.11 — gwarancja: 60 miesięcy na stację i 96 miesięcy na obudowę betonową.
- 5.9.1–5.9.7 — dokumentacja ZKSN jak w 4.10.
- 5.10 — gwarancja ZKSN jak w 4.11.
- §6 — inne rozwiązania tylko decyzją Dyrektora Obszaru Dystrybucji.

## 5. Decyzje właściciela (NIE są wymaganiami ENEA)

- **DECYZJA WŁAŚCICIELA 2026-11-13 (reklozery):** w sieci ENEA generalnie nie stosuje się
  reklozerów. Produkt nie proponuje reklozera jako aparatu pola stacji ani ZKSN.
- **DECYZJA WŁAŚCICIELA 2026-11-13 (odgałęzienia):** odgałęzienie na gołej szynie jest
  zakazane. Odgałęzienie z kabla wykonuje się wyłącznie przez ZKSN (rysowany jak stacja bez
  transformatora). Odgałęzienie z linii napowietrznej — przez słup z rozłącznikiem. Odgałęzienie
  mieszane (napowietrzne → kabel) — przez słup z rozłącznikiem i głowicą kablową.

## 6. Decyzje graficzne i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

- Rysowanie ZKSN „jak stacji bez TR” jest decyzją właściciela, a nie wymaganiem Zeszytu 1.
- Kolejność aparatów w polu z rys. 1 i 4a–4j jest odczytem rysunku; symbol graficzny (kształt
  rozłącznika, uziemnika, głowicy) jest decyzją SLD produktu.
- Oznaczenia ramki „Z” i symboli przepustów „3” i „1” na rys. 1 i 4a nie mają legendy —
  produkt nie przypisuje im znaczenia jako wymagania.
- Numeracja pól od lewej, położenie pola TR po prawej stronie i lustrzane wykonanie
  rozdzielnicy nN są cechą rysunków, nie wymaganiem.
- Kolorystyka elewacji (rys. 3, 5, 6) nie wpływa na model elektryczny i nie jest renderowana
  w SLD.
- Szyna uziemiająca, zbrojenie i przewody uziemiające z rys. 4a są informacją budowlaną,
  nie elementem modelu sieci.

## 7. Luki i niejednoznaczności

1. **Rys. 4a — numeracja pól 1, 2, 3, 4, 4** (powtórzona „4”): błąd druku; produkt numeruje
   pola kolejno 1–5.
2. **Liczba pól ZKSN:** rys. 4a podaje obudowę „min. 5 pól”, 5.1.2 „do 5 pól”, 5.3 a „od 3 do
   5 pól liniowych”, rys. 4b „min. 3 pola” z dopuszczeniem większych gabarytów. Wiążący dla
   produktu jest zakres 3–5 pól liniowych (5.3 a); rys. 4b dopuszcza więcej pól wyłącznie
   gabarytowo.
3. **Liczba pól liniowych stacji:** 4.1.2 „do 5 pól”, 4.3.1 b „od 2 do 4 pól liniowych”, rys. 1
   pola 1–2 opcjonalne. Wiążące: 1 pole TR + 2–4 pola liniowe (≤ 5 pól łącznie).
4. **Wysokość obudowy — sprzeczność wewnętrzna:** 4.1.11 (stacja) i 5.1.7 (ZKSN) podają maks. 2 m od znacznika zakopania do dachu, a 4.1.12 i 5.1.8 dla obiektów budowanych po 01.01.2028 podają 2100 mm od tego samego znacznika. Prawdopodobnie 4.1.12/5.1.8 zastępują limit dla nowych obiektów od 2028 r.; zeszyt tego nie mówi. Produkt nie używa wymiarów obudowy w obliczeniach; przy wdrożeniu atrybutu wymiarów obie wartości podaje się z numerami punktów.
5. **5.6.3 — zdublowane litery d/e/f** w wyliczeniu stolarki (błąd numeracji).
6. **§2 wymienia Zeszyt 5 (telemechanika),** który został zastąpiony standardem
   „Linie i stacje elektroenergetyczne SN — Telemechanika” wersja 12.2025 (od 01.02.2026).
   Odwołania 4.1.5, 5.5.11 kieruje się do nowego standardu.
7. **Pole zasilające ZKSN:** standard telemechaniki 6.7.2 wymaga przekładnika SN/nN
   ≥ 1200 VA „w polu zasilającym ZKSN”, a rysunki 4a–4j nie wyróżniają pola zasilającego
   (wszystkie pola są równorzędnymi polami liniowymi); rys. 4b pokazuje przekładnik
   na odpływie kablowym pola 1, poza rozdzielnicą. Produkt traktuje jako pole zasilające to,
   które w modelu jest stroną zasilania w stanie normalnym, i zapisuje tę interpretację
   w wyjaśnieniu.
8. **Reklozery a tekst standardu:** 4.3.8, 4.3.11 i 5.5.1 dopuszczają wyłącznik w polu
   liniowym, a 4.3.13 i 5.5.5 przewidują przy nim zabezpieczenia. Standard nie mówi
   o reklozerze (wyłączniku z SPZ na linii); standard telemechaniki 6.3.4 przewiduje funkcję
   SPZ w wyłączniku z zabezpieczeniem, a Katalog sygnałów definiuje „Punkt wyłącznikowy SN”
   z SPZ. Decyzja właściciela (§5) rozstrzyga dla produktu: wyłącznik w polu stacji
   dopuszczalny, reklozer nieproponowany.
9. **Odgałęzienia:** Zeszyt 1 nie formułuje wprost zakazu odgałęzienia na szynie; ZKSN jest
   w nim jedynym obiektem rozdziału sieci kablowej bez TR, co jest zgodne z decyzją
   właściciela. Sprzecznej treści nie znaleziono.
10. **Przekaźnik autonomiczny pola TR (4.3.3):** standard nie podaje funkcji ani nastaw poza
    ochroną przed przeciążeniem i zwarciami; produkt nie może przypisywać mu funkcji 87T.
11. **4.3.13 / 5.5.5:** standard nie podaje parametrów sygnalizatorów przepływu prądu
    zwarciowego (progów, kryteriów); kryteria zawiera standard telemechaniki 6.3.2.

## 8. Mapa wdrożenia (stan głównego checkoutu, pomiar 2026-11-13)

Ścieżki względem `mv-design-pro/`. „Sprzeczne” oznacza miejsce, w którym kod przeczy
wymaganiu; „brak” — wymaganie bez odwzorowania; „zgodne” — odwzorowanie istnieje.

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| ES1-02, ES1-18 | `backend/src/reference_engine/compliance.py:412` (`_OSD_PREFERRED_CONSTRUCTION`), `:480` reguła `prefabricated_compact_preferred` | zgodne |
| ES1-02 (limit 630 kVA) | `backend/src/reference_engine/compliance.py:416` (`_OSD_TRANSFORMER_LIMIT_MVA` kontenerowa/prefabrykowana 0,63), `:524` | zgodne |
| ES1-02 (limit 630 kVA) | `backend/src/application/station_templates/templates/typowe_sn_nn.py:131`, `:154`, `:162`, `:179`, `:188` — szablony 1000–2500 kVA bez oznaczenia, że wykraczają poza standard ENEA | sprzeczne (domyślny wzorzec) |
| ES1-02 (limit 630 kVA), EZ-10 | `backend/src/application/station_templates/templates/zksn_wnetrzowe.py:98` — `tpl_zksn_4pole_1600kva` | sprzeczne |
| ES1-08, ES1-30, ES1-31 | `backend/src/reference_engine/compliance.py:549` reguła `bay_composition` (1 TR, 1–4 pola liniowe, ≤ 5 pól) — dolna granica 1 zamiast 2 (4.3.1 b) | częściowo sprzeczne |
| ES1-26 (Dyn5, 420 V) | `backend/src/application/station_templates/_choices.py:22`, `:30` — opcje TR wyłącznie Dyn11; `backend/src/network_model/catalog/mv_transformer_catalog.py:494`, `:790` — `voltage_lv_kv` 0,4 i Dyn11 | sprzeczne (brak wariantu Dyn5/420 V) |
| ES1-36, ES1-45, EZ-20 (24 kV) | `backend/src/application/station_templates/_choices.py:308` — domyślnie wyłącznik ABB VD4 17,5 kV; RM6 17,5 kV 400 A; `backend/src/network_model/catalog/mv_switch_catalog.py:308`–`330` — rozłączniki NAL 12 kV 400 A | sprzeczne (napięcie i prąd poniżej 24 kV / 630 A) |
| ES1-38, ES1-40, ES1-41 (pole TR na bezpiecznikach) | `backend/src/network_model/catalog/bay_templates.py:227` — `BAY_TEMPLATE_TRANSFORMER` z wyłącznikiem CB i CT; `:211` rola TR = rozłącznik bezpiecznikowy albo wyłącznik (zgodne co do rodzajów) | sprzeczne (szablon), zgodne (lista rodzajów) |
| ES1-38 (brak 87T przy TR ≤ 630 kVA) | `backend/src/network_model/catalog/bay_templates.py:124` (`TRANSFORMER_BAY_PROTECTION_CODES` z 87T, Buchholz), `:168` rola TR dziedziczy bez warunku mocy; `backend/src/application/station_templates/_choices.py:249` (e2TANGO-800 z 87T) | sprzeczne |
| ES1-43, ES1-45, EZ-21, EZ-23 (rozłącznik trzypołożeniowy w polu liniowym) | `backend/src/network_model/catalog/bay_templates.py:83` i `:101` — pola LINE_IN/LINE_OUT z wyłącznikiem CB, CT, odłącznikami | sprzeczne (domyślny wzorzec pola) |
| ES1-43 (aparaty pola liniowego), decyzja reklozerowa | `backend/src/network_model/catalog/bay_templates.py:211` — IN/OUT/FEEDER = WYLACZNIK, ROZLACZNIK, REKLOZER; `backend/src/network_model/catalog/mv_switch_catalog.py:540` (`SWITCH_RECLOSERS`); `backend/src/network_model/catalog/wartosci_robocze.py:85`, `:340`; `frontend/src/ui2/kreatory/stacja/stacjaModel.ts:1011`; `frontend/src/ui2/kreatory/stacja/generatorSldPola.ts:259`; `frontend/src/ui2/kreatory/zrodlo/zrodloModel.ts:766`–`780` | sprzeczne z decyzją właściciela |
| ES1-48, EZ-25 (sygnalizatory przepływu prądu zwarciowego) | brak w modelu i katalogu (0 plików) | brak |
| ES1-49, EZ-26 (VDS) | `frontend/src/ui2/kreatory/stacja/generatorSldPola.ts:90`, `:667`, `:768` — wskaźnik obecności napięcia na SLD | zgodne (prezentacja); brak w ENM |
| ES1-47, EZ-24 (telemechanika) | `backend/src/reference_engine/compliance.py:573` (`telemechanika.line_bay_u_i_measurement`); `backend/src/enm/interlock_rules.py:31` | częściowo (patrz plik telemechaniki) |
| ES1-51, ES1-53, ES1-61 (rozdzielnica nN na rozłącznikach listwowych) | `backend/src/application/station_templates/_choices.py:122` (`NN_CB_OPTIONS` — wyłączniki 100–630 A); `backend/src/network_model/catalog/mv_auxiliary_catalog.py:645`, `:1056` — rozłączniki bezpiecznikowe tylko wielkości 00 i 1 | sprzeczne (brak wielkości 2, domyślnie wyłączniki) |
| ES1-55 (CT 800/5 0,2S) | `backend/src/application/station_templates/_choices.py:346` (`CT_OPTIONS`) | do sprawdzenia przy wdrożeniu profilu |
| ES1-63 (kabel 70 mm² do TR) | `backend/src/network_model/catalog/mv_cable_line_catalog.py:279` (YHAKXS) | zgodne (typ dostępny) |
| ES1-22 (rodzaj stacji) | `backend/src/enm/models.py:1155`–`1185` — `station_type`, `construction_type` bez wariantu ENEA (kompaktowa 630 / uproszczona 400 / słupowa / wnętrzowa) | brak |
| EZ-10, EZ-11, EZ-15 (brak sprzęgła w ZKSN) | `backend/src/application/station_templates/templates/zksn_wnetrzowe.py:114` (`tpl_zksn_8pole_2x1000kva_coupler`), `:136` (`tpl_zksn_pole_lacznikowe`); `backend/src/application/station_templates/templates/sekcyjne.py:48` (rola COUPLER), `:65`, `:73` (`tpl_petla_zksn_nop`), `:81`; `frontend/src/ui2/kreatory/stacja/stacjaSzablony.ts:44`; `frontend/src/ui2/kreatory/stacja/konfiguratorRozdzielnicy.ts:272`; `frontend/src/ui2/strings.ts:238` | sprzeczne |
| EZ-10 (ZKSN bez TR) | `backend/src/application/station_templates/templates/zksn_wnetrzowe.py:1`–`5`, `:52` — kategoria „ZKSN” jako stacja wnętrzowa z transformatorem | sprzeczne (nazwa ZKSN dla innego obiektu) |
| EZ-10 (ZKSN bez TR) | `backend/src/network_model/catalog/mv_branch_point_catalog.py:77` (`has_transformer` False); `backend/src/enm/models.py:1772`–`1790` (`BranchPointSN` typu `zksn`) | zgodne |
| EZ-17 (3–5 pól) | `backend/src/network_model/catalog/mv_branch_point_catalog.py:47` (`_zksn_field_specs` — 3 lub 4 pola), `:152` (`ZKSN-2P-630A` — 2 pola) | częściowo sprzeczne (wariant 2-polowy poniżej 3) |
| EZ-13, EZ-14 (pole MP za kablem, bez łącznika) | `backend/src/network_model/catalog/bay_templates.py:245` — `BAY_TEMPLATE_MEASUREMENT` jako pole szynowe z odłącznikiem, VT i uziemnikiem | sprzeczne |
| EZ-29 (układ pomiarowy) | `backend/src/reference_engine/compliance.py:618`, `:634`; `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md:44` (klasa C: ZKSN z polem pomiarowym) | zgodne co do idei, rozbieżne co do budowy pola |
| §2 (wersja standardu) | `backend/src/reference_engine/packs/osd_enea/pack.json:8` — `source_document_refs` cytuje Zeszyt 1 w wersji 09.2021-2 (obowiązującej od 02.04.2024) | sprzeczne (nieaktualna wersja; obowiązuje 06.2024 od 01.01.2025) |
| decyzja „pole łukowe wymagane PN-EN 62271-200” | `backend/src/application/station_templates/templates/zksn_wnetrzowe.py:129` | niepotwierdzone w ENEA (Zeszyt 1 wymaga klasy IAC-AB 16 kA/1 s obudowy, nie osobnego pola) |
