# Standard ENEA — linie napowietrzne SN — kontrakt wiedzy produktu

Status: **BINDING** (Zasada nr 5 `CLAUDE.md`, dyrektywa właściciela 2026-11-12: standardy ENEA są
domyślnym wzorcem produktu).
Źródło: ENEA Operator, „Standard w sieci dystrybucyjnej — Elektroenergetyczne linie napowietrzne
średniego napięcia”, wersja 01.2026, zatwierdzony uchwałą Zarządu nr 76/2026, obowiązuje od
16.03.2026, zastępuje wersję 11.2022-2 (uchwała 1/2023, zmiana 7/2024). Adres:
`https://www.operator.enea.pl/media/4183/uslugi-dystrybucyjne/elektroenergetyczne-linie-napowietrzne-sredniego-napiecia`.
331 strony (20 stron części głównej, załączniki nr 1–3 z albumem rysunków), SHA-256 pliku
zaczyna się od `f1b097e5` i kończy na `0aabf11`. Pobrano 2026-11-13.
PDF, tekst i rysunki NIE są w repozytorium (prawa ENEA). Ten dokument zawiera wyłącznie numery
punktów, wartości liczbowe i własne sformułowania; nie jest cytatem.

Oznaczenia: „§x.y” = punkt części głównej, „Z1/Z2/Z3 §x” = punkt załącznika nr 1/2/3,
„s. N” = numer strony w stopce dokumentu, „PDF N” = numer strony pliku.

## 1. Zakres stosowania w produkcie

Dokument wiąże wszystkie miejsca łańcucha, w których występuje linia napowietrzna SN 15/20 kV:

- katalog typów: przewody linii (przewód w osłonie, kabel uniwersalny, przewody gołe
  w rozwiązaniach załącznika 1), słupy i ich typy (K/O/ON, Kg/Kgr, PRK/PRO/PRON), łączniki
  napowietrzne (rozłącznik, rozłącznik z uziemnikiem, łącznik sterowany radiowo), ograniczniki
  przepięć, przekładniki słupa pomiarowego;
- model ENM: odcinek `line_overhead`, punkt rozgałęzienia `branch_pole`
  (`BranchPointSN`), łącznik sekcyjny (`insert_section_switch_sn`), słup z głowicami kablowymi
  (przejście napowietrze–kabel), słup pomiarowy;
- kreatory: magistrala i odgałęzienie SN, słup rozgałęźny, łącznik sekcyjny, przyłącze klienta SN
  ze słupem pomiarowym;
- schemat jednokreskowy: symbol słupa rozgałęźnego, łącznika słupowego, głowicy kablowej,
  ogranicznika przepięć;
- walidator i gotowość: kontrola dopuszczalnych rodzajów łączników, przekrojów, ograniczeń
  długości przęsła i sekcji odciągowej (tam, gdzie model niesie te dane);
- ocena doboru aparatury: prąd ciągły i wyłączalny łącznika (§4.9), wytrzymałość izolacji 24 kV;
- zabezpieczenia i automatyka: łącznik sterowany radiowo z sygnalizacją przepływu prądu
  zwarciowego (§4.9, Z3);
- raport i komentarz obliczeń: podstawa punktem tego dokumentu.

Standard jest wdrażany jako **wariant standardu operatora** (profil OSD), a nie stałe w kodzie.
Ocena zgodności jest werdyktem wyjaśnialnym (`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`):
punkt standardu, wartość w modelu, wymaganie, margines. Brak danej ≠ zgodność; wartość robocza
(Zasada nr 4, `ESTIMATED`) daje kompletność dowodu `NIEPELNY`.

## 2. Wymagania potwierdzone (własne sformułowania)

| Nr | Punkt | Wymaganie |
|----|-------|-----------|
| ELN-01 | §2 | Standard dotyczy linii 15 kV i 20 kV, 50 Hz; wartości w nim podane są minimalne. |
| ELN-02 | §2 | Gdzie to możliwe, priorytet ma linia kablowa SN, zwłaszcza w zwartej zabudowie i w terenach zalesionych. |
| ELN-03 | §2 | Standard stosuje się, gdy prace obejmują co najmniej całą sekcję odciągową; przy mniejszym zakresie dopuszczone są dotychczasowe rozwiązania z uchwytami oplotowymi. |
| ELN-04 | §2 | Wymiana lub dobudowa słupa z głowicami kablowymi w linii zbudowanej wg innych norm — wg załącznika nr 1; słup z pomiarem pośrednim (z telemechaniką lub bez) — wg załącznika nr 2; łącznik typu zamkniętego sterowany radiowo — wg załącznika nr 3. |
| ELN-05 | §4.1 | Rozwiązanie podstawowe: trzy pojedyncze przewody w osłonie w układzie płaskim, na słupach jednożerdziowych strunobetonowych wirowanych, z izolatorami kompozytowymi wiszącymi i wsporczymi. |
| ELN-06 | §4.1 | Rozwiązania muszą umożliwiać prace pod napięciem (PPN) zgodnie z instrukcją organizacji bezpiecznej pracy operatora. |
| ELN-07 | §4.1 | Skrzyżowanie nowej, przebudowywanej lub remontowanej linii SN z napowietrzną linią wyższego napięcia wymaga skablowania linii SN; przy linii 110 kV strefa co najmniej 15 m mierzona w poziomie od skrajnego przewodu linii 110 kV. |
| ELN-08 | §4.1 | Przęsło linii SN nie dłuższe niż 100 m. |
| ELN-09 | §4.1 | Na słupie przelotowym rozpiętości przyległych przęseł różnią się najwyżej o 20% dłuższego z nich. |
| ELN-10 | §4.1 | Sekcja odciągowa nie dłuższa niż 1 km; w sekcji najwyżej trzy słupy narożne. |
| ELN-11 | §4.1 | Dopuszczalna linia do dwóch torów SN z możliwością dowieszenia do dwóch torów nN (linia wielotorowa dwunapięciowa); linia dwutorowa SN w układzie pionowym; ograniczenia przęsła wynikają też z linii nN; podstawowo wykorzystuje się istniejącą trasę i konstrukcje. |
| ELN-12 | §4.1 | Linie wielotorowe dwunapięciowe wykonuje się kablami uniwersalnymi dla torów SN; kable uniwersalne są też dopuszczone dla linii tymczasowych (bocznikowych), w obszarach ochrony przyrody, gdy w jednej relacji potrzeba kilku przejść napowietrze–kabel, oraz przy przebudowie linii gołej w pasie leśnym po istniejącej trasie. |
| ELN-13 | §4.2 | Przewód w osłonie: przekrój 70 mm² dla linii głównej i odgałęzień (dla linii głównej dopuszczony 120 mm²); temperatura pracy długotrwałej co najmniej 70 °C; żyła ze stopu AlMgSi z barierą przeciwwilgociową, ekranem półprzewodzącym i osłoną PE odporną na UV; bez łączenia przewodów w sekcji odciągowej. |
| ELN-14 | §4.2 | Kabel uniwersalny (przewód pełnoizolowany): żyła Al 70 mm² dla linii głównej i odgałęzień (dla odgałęzień dopuszczona żyła Cu 10 mm²); co najmniej 70 °C długotrwale i 250 °C przy zwarciu 5 s; żyły powrotne o prądzie zwarcia co najmniej 2 kA; powłoka XLPE odporna na ścieranie i UV; bez łączenia w sekcji odciągowej. |
| ELN-15 | §4.3 | Słupy podstawowe: jednożerdziowe strunobetonowe wirowane, długość co najmniej 13,5 m, siły użytkowe 6, 15 i 25 kN; słupy kratowe, rurowe, kompozytowe i drewniane tylko w uzgodnieniu z operatorem. |
| ELN-16 | §4.3 | Żerdź z betonu co najmniej C40/50, klasy ekspozycji XC4, XF2, XA2, bez szwu podłużnego; bez zacisków uziemiających (uziemienie wg standardu ochrony przed porażeniem); trwały oznacznik żerdzi; stal uzbrojenia cynkowana ogniowo i trwale oznaczona; montaż śrubowy. |
| ELN-17 | §4.3 | Słupy rozgałęźne są słupami mocnymi. Dobudowa odgałęzienia, również kablowego, oznacza przebudowę istniejącego słupa na mocny; wymiana słupa w liniach zbudowanych wg innych norm — rozwiązaniami z załączników 1, 2 lub 3. |
| ELN-18 | §4.4 | Ustoje i fundamenty prefabrykowane z betonu co najmniej C30/37 (XC4, XF1, XA1), dobierane wg albumów dla gruntu o co najmniej małej nośności; grunty bardzo słabe projektowane indywidualnie; dopuszczone fundamenty terenowe i otwór wiercony Ø55 cm lub Ø80 cm; przy fundamencie terenowym kabel schodzący w rurze z kolanem Ø160 mm do 1 m głębokości; zasypywanie warstwami 20–30 cm z zagęszczaniem. |
| ELN-19 | §4.5 | Izolatory odciągowe kompozytowe: udarowe piorunowe co najmniej 125 kV, przemienne na mokro co najmniej 50 kV, SML co najmniej 70 kN, droga upływu co najmniej 480 mm, długość montażowa 515 mm, powłoka silikonowa co najmniej 3 mm. |
| ELN-20 | §4.5 | Izolatory wsporcze kompozytowe: napięcie izolacji 24 kV, udarowe co najmniej 125 kV, przemienne na mokro co najmniej 70 kV, SCL co najmniej 12,5 kN, MDCL co najmniej 6 kN przy ugięciu poniżej 20 mm, droga upływu co najmniej 480 mm, rdzeń co najmniej 32 mm, gwint M24, główka 100 mm, palność osłony V0. |
| ELN-21 | §4.6 | Uziemienia wg odrębnego standardu układów uziomowych (zob. `STANDARD_ENEA_OCHRONA_PORAZENIOWA_I_UZIEMIENIA_SN.md`). |
| ELN-22 | §4.7 | Ograniczniki przepięć beziskiernikowe, prąd wyładowczy 8/20 µs co najmniej 10 kA, z odłącznikiem i wspornikiem, montowane pod przewodami; każdy połączony osobnym przewodem H07V-K 25 mm² (zielono-żółtym); rezystancja uziemienia ograniczników najwyżej 10 Ω. |
| ELN-23 | §4.7 | Ochrona przepięciowa w miejscach zmiany impedancji falowej: połączenie przewodów gołych lub pełnoizolowanych z przewodami w osłonie, słupy z głowicami kablowymi, pierwszy słup przewodzący po odcinku nieprzewodzącym; dla przewodów pełnoizolowanych także przy głowicach i łącznikach; w linii dwutorowej dla każdego toru; w linii dwunapięciowej także dla toru nN na tym samym słupie. |
| ELN-24 | §4.7 | Ochrona przeciwłukowa ogranicznikami: na jednym ze słupów przęsła skrzyżowaniowego z obostrzeniem 2° i 3°, przy zabudowaniach, na granicy terenu leśnego, na wzniesieniach, na słupach mocnych (odporowych, odporowo-narożnych, krańcowych) i rozgałęźnych. |
| ELN-25 | §4.7 | Ochrona przeciwdrganiowa linii z przewodami w osłonie: dobór naprężenia bez drgań eolskich i spiralne tłumiki drgań. |
| ELN-26 | §4.8 | Łączenie przewodów linii głównej wyłącznie na słupach odporowych; odgałęzienia, również kablowe, wyłącznie na słupach mocnych. |
| ELN-27 | §4.8 | Mostki zaciskami izolowanymi przebijającymi izolację ze śrubą zrywalną; bez uchwytów wymagających ściągania izolacji; osłony na uchwytach odciągowych; na przewodach słupów rozgałęźnych zaciski do uziemiaczy przenośnych (zalecane też na końcach sekcji odciągowej); wprowadzenie kabla SN na słup wg standardu linii kablowych SN. |
| ELN-28 | §4.9 | Na liniach głównych i na rozbudowanych odgałęzieniach, które mogą stać się magistralą: rozłączniki o prądzie ciągłym co najmniej 400 A i wyłączalnym co najmniej 200 A. W uzgodnieniu z operatorem, głównie dla przyłączania obiektów, dopuszczone są wyłączniki, także z automatyką zabezpieczeniową. |
| ELN-29 | §4.9 | W pozostałych przypadkach i przed słupowymi stacjami SN/nN: rozłączniki z uziemnikiem o prądzie ciągłym co najmniej 100 A i wyłączalnym co najmniej 20 A. |
| ELN-30 | §4.9 | Napęd podstawowo posuwisty (pionowy), obrotowy dopuszczony dla napędu elektrycznego; styki srebrzone; łączniki sterowane zdalnie typu zamkniętego; łączniki sterowane radiowo z sygnalizacją przepływu prądu zwarciowego przesyłaną do systemu dyspozytorskiego; aparatura zabudowana poniżej przewodów; rozwiązania wg załączników 1, 2 lub 3. |
| ELN-31 | §4.9 | Szafa pomiarowa: szerokość 600–650 mm, wysokość 600 mm ±15%, głębokość 300–400 mm; szafa sterownicza: 600–650 mm × 800 mm ±15% × 300–400 mm; obudowa z aluminium 1050A grubości 2 mm, malowana proszkowo; zamki MASTER KEY; łączność radiowa TETRA; wyłączniki krańcowe drzwi; antena dookólna 3 dBd o długości około 1,7 m (antena 0 dBd 0,7 m tylko po pomiarze poziomu sygnału). |
| ELN-32 | §4.10 | Słupy nowych, przebudowywanych i remontowanych linii mają elementy identyfikacyjne i ostrzegawcze: tablice ostrzegawcze 2–3 m nad terenem, po jednej na każdej żerdzi; tablice numeracyjne 2–3 m nad terenem, powyżej ostrzegawczych, po jednej na słupie linii jednotorowej i osobno po stronie każdego toru linii wielotorowej; tablice torowe nad numeracyjnymi; mocowanie taśmą nierdzewną (wzory: `STANDARD_ENEA_TABLICE_I_ZNAKI.md`). |
| ELN-33 | §5 | Wyroby fabrycznie nowe (nie starsze niż z roku poprzedzającego zlecenie), z certyfikatami jednostek akredytowanych; gwarancja na roboty i elementy linii co najmniej 60 miesięcy od odbioru, na ochronę antykorozyjną konstrukcji, przewody i słupy co najmniej 96 miesięcy. |
| ELN-34 | §6 | Dokumentacja projektowa (część prawna z oświadczeniem projektanta o zgodności ze standardami, część techniczna z liczbą egzemplarzy i formatami PDF/CAD) i powykonawcza — rozdział formalny. |
| ELN-35 | §7 | Rozwiązania inne niż w standardzie — tylko decyzją dyrektora właściwego oddziału dystrybucji; antena kierunkowa — decyzją dyrektora departamentu teleinformatyki. |
| ELN-36 | Z1 §1–§2 | Załącznik 1 (luty 2026): słupy z łącznikami uchylnymi lub głowicami kablowymi w liniach z przewodami gołymi AFL-6 35/50/70 mm² (układ trójkątny) oraz AFL-6 50/70 mm² i przewodami w osłonie 50–120 mm² (układ płaski). Tylko słupy K, O, ON; łączniki montowane wyłącznie poniżej przewodów. |
| ELN-37 | Z1 §3 | Napięcie 15/20 kV, izolacja 24 kV; żerdzie E 13,5 m i 15 m, siły 15, 20 i 25 kN; fundamenty SFP/SP; strefy oblodzenia i wiatru WI/WII, SI/SII/SIa/SIIa; strefy zabrudzenia I–III. |
| ELN-38 | Z1 tab. 1, tab. 2 | Naprężenia i naciągi: przewód w osłonie 50 mm² — najwyżej 75 MPa, naciąg 1158 daN, słup 15 kN; 120 mm² — najwyżej 60 MPa, 2160 daN, słup 25 kN; poprzecznik PON-4/E do 21,6 kN. |
| ELN-39 | Z1 §3 | Łączniki: rozłączniki napowietrzne RUN lub RN, uchylne, z napędem ręcznym. Oznaczenia typów: litera „g” — głowice kablowe, litera „r” — rozłącznik (np. Kgr-15/20); typy Kg, Og, ONg (same głowice) oraz Kgr, Ogr, ONgr (głowice i rozłącznik). |
| ELN-40 | Z1 §4 | Słupy z łącznikami lokalizuje się przy drogach publicznych (dostęp służb). |
| ELN-41 | Z1 §6–§8 | Ograniczniki co najmniej 10 kA w osłonie silikonowej; uziemienie wg standardu ochrony przed porażeniem; górna płyta fundamentu co najmniej 0,5 m pod ziemią. |
| ELN-42 | Z1 s. 55 (PDF 76) | Odczyt rysunku „Uzbrojenie słupa Kgr” (przewody w osłonie): od strony linii — łańcuch odciągowy, przewód, górny komplet ograniczników (na konstrukcji KOG-8/M), rozłącznik RUN/RN, przewód, dolny komplet ograniczników, zestaw do uziemiaczy przenośnych ZUO-CH (przy RN), głowica napowietrzna kabla, kabel w rurze osłonowej wzdłuż żerdzi. Wykaz: dwa komplety ograniczników; KOG-8/M przy RUN; ZUO-CH przy RN. |
| ELN-43 | Z2 §1–§3 | Załącznik 2: słupy pomiarowe PRK, PRO, PRON w wariantach „gr” i „gws”, 15/20 kV; pomiar pośredni trójsystemowy, dwukierunkowy, wielotaryfowy, energii czynnej i biernej. |
| ELN-44 | Z2 §4 | Wyposażenie SN słupa pomiarowego: przekładniki prądowe i napięciowe (po trzy), ograniczniki przepięć, łącznik napowietrzny, głowice kablowe; przy łączniku sterowanym radiowo przekładnik napięciowy potrzeb własnych. Szafa pomiarowa: licznik zdalnego odczytu, listwa probiercza, zabezpieczenie obwodów napięciowych, analizator jakości energii, rezystory dociążające (opcjonalnie), antena. Iglica odgromowa; rezystancja uziemienia najwyżej 10 Ω. Łączniki bez gazów fluorowanych, w tym SF6. |
| ELN-45 | Z2 s. 63 (PDF 186) | Odczyt rysunku PRK3grs: łańcuch odciągowy, zacisk odgałęźny, górne ograniczniki, łącznik zamknięty sterowany radiowo, przekładnik potrzeb własnych 15 kV/230 V 500 VA, trzy przekładniki prądowe i trzy napięciowe, dolne ograniczniki, zestaw ZU-CH, głowice kablowe, kabel; obok szafa sterownicza, szafa pomiarowa, antena dookólna i iglica odgromowa ZO-2/E. |
| ELN-46 | Z3 §1–§3 | Załącznik 3: łączniki typu zamkniętego sterowane radiowo, bez SF6. Oznaczenie „ws” obejmuje wyłącznik albo rozłącznik sterowany radiowo. |
| ELN-47 | Z3 §4 | Miejsca stosowania łączników sterowanych radiowo: linie główne, stałe punkty podziału sieci, początki długich odgałęzień; mogą zastąpić istniejące odłączniki lub rozłączniki. |
| ELN-48 | Z3 §5.2 | Urządzenia sterujące łącznika tworzą układ zabezpieczeniowy, sygnalizacyjny i pomiarowy (powołanie na zeszyt telemechaniki). |
| ELN-49 | Z3 s. 76 (PDF 313) | Odczyt rysunku płyty szafy sterowniczej: przełącznik „SPZ załączony / odłączony” i przełącznik sterowania lokalne / zdalne. |
| ELN-50 | Z3 karty, uwagi 3 i 5 | Wyłącznik obsługiwany drążkiem z hakiem, rozłącznik wymaga napędu ręcznego na wysokości 1,4 m; przekładnik potrzeb własnych przyłączony od strony zasilania podstawowego. |

## 3. Decyzje i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

1. **DECYZJA WŁAŚCICIELA 2026-11-13, doprecyzowana 2026-11-14 — reklozery i wyłączniki poza
   GPZ.** Brzmienie 2026-11-13: „w ENEA nie stosujemy reklozerów”; doprecyzowanie 2026-11-14:
   „wyłącznik poza GPZ tylko wyjątkowo”. Skutek w produkcie: typ aparatu „reklozer” jest
   wykluczony z katalogu wariantu ENEA i z propozycji kreatorów; poza GPZ (słup linii, słup
   odgałęźny, złącze kablowe SN, rozdzielnia sieciowa) domyślnym aparatem łączeniowym jest
   rozłącznik; wyłącznik z zabezpieczeniem poza GPZ pojawia się wyłącznie jako jawny wybór
   projektanta z wpisanym uzasadnieniem, widocznym w wyjaśnieniu oceny i w raporcie. To decyzja
   produktu, a nie treść tego standardu. Tekst standardu dopuszcza wyłącznik z automatyką
   zabezpieczeniową w uzgodnieniu z operatorem (ELN-28) i łącznik typu zamkniętego sterowany
   radiowo, którym może być wyłącznik, z przełącznikiem SPZ na płycie szafy (ELN-46–ELN-49) —
   obie wersje zapisano w luce L-01.
2. **DECYZJA WŁAŚCICIELA 2026-11-13 — odgałęzienia.** Odgałęzienie na gołej szynie jest
   zabronione. Odgałęzienie od linii napowietrznej — przez słup z rozłącznikiem; odgałęzienie
   mieszane (napowietrze → kabel) — słup z rozłącznikiem i głowicą kablową; odgałęzienie od kabla —
   wyłącznie przez złącze kablowe SN (ZKSN), rysowane jak stacja bez transformatora. Standard
   wymaga tylko słupa mocnego dla każdego odgałęzienia (ELN-17, ELN-26) i rozłącznika na liniach
   głównych i rozbudowanych odgałęzieniach (ELN-28, ELN-29); album przewiduje także słupy Kg/Og
   z samymi głowicami (ELN-39) — zob. luka L-02.
3. Sylwetka słupa na schemacie, rozmiar glifu, kolejność rysowania aparatów na słupie
   rozgałęźnym i kolory są decyzjami graficznymi produktu (bramka B-02). Odczyt rysunku ELN-42
   opisuje kolejność montażową w terenie, a nie wymagany układ symboli na schemacie.
4. Przypisanie rodzaju łącznika do „magistrali” albo „odgałęzienia” na podstawie topologii
   modelu (np. odgałęzienie dłuższe niż pewna długość = „rozbudowane”) jest interpretacją
   produktu; standard nie podaje progu długości.
5. **DECYZJA WŁAŚCICIELA 2026-11-14 — SPZ (ANSI 79) poza GPZ dopuszczalne warunkowo.** Nie ma
   globalnego zakazu ani ograniczenia lokalizacyjnego „tylko GPZ”. Podstawa przywołana przez
   właściciela i sprawdzona w tekście (prywatne repozytorium źródeł, `enea/tekst/`):
   - IRiESD 2.3, pkt II.4.5.4.1.6 (s. 51): zalecenie automatyki EAZ w głębi sieci SN;
   - IRiESD 2.3, pkt II.4.5.4.2.1 ppkt 3 i II.4.5.4.2.2 ppkt 3 (s. 51–52): wielokrotny SPZ,
     programowalny i blokowalny, w polach linii napowietrznych i napowietrzno-kablowych SN;
   - II.4.5.4.2.2 ppkt 7 i II.4.5.4.2.3 ppkt 6: blokada załączenia przy obecności napięcia w linii
     albo kontrola synchronizmu w polach z generacją;
   - ten standard: §4.9 (ELN-28) dopuszcza wyłącznik z automatyką zabezpieczeniową w linii w
     uzgodnieniu z operatorem; odczyt rysunku płyty szafy sterowniczej łącznika — załącznik 2
     s. 91 (PDF 214) i załącznik 3 s. 76 (PDF 313, ELN-49): przełącznik „SPZ załączony / odłączony”.
     Tekst §4.9 nie wymienia SPZ z nazwy; SPZ wynika z rysunków szafy i z IRiESD.
   Reguły produktu: SPZ na wyłączniku poza GPZ jest opcją projektową, domyślnie nieaktywną;
   aktywacja eksploatacyjna wymaga uzgodnienia konkretnego rozwiązania z ENEA Operator — bez
   uzgodnienia status „Wymaga uzgodnienia ENEA” (nie „Niedozwolone”); ocena obejmuje
   selektywność, koordynację z SPZ pola w GPZ, sekwencję załączeń, blokady i obecność OZE, a dla
   linii z generacją kontrolę obecności napięcia i synchronizmu, gdy wymagają tego warunki sieci
   lub ENEA; raport podaje lokalizację, nastawy SPZ, status i dokument uzgodnienia.
   SPZ (ANSI 79) nie jest tym samym co SPZ po SCO: warunek uzgodnienia z pkt II.4.5.4.7.1 ppkt 2
   dotyczy automatyki SPZ/SCO rozdzielni i nie jest samodzielną podstawą dla SPZ wyłącznika
   liniowego. Norma IEC nie rozstrzyga zgody operatora na lokalizację SPZ.

## 4. Luki i niejednoznaczności

- **L-01 (standard dopuszcza aparat wyłączający poza GPZ; decyzja właściciela go ogranicza).**
  Wersja standardu: §4.9 dopuszcza w linii wyłączniki „z automatyką zabezpieczeniową” w
  uzgodnieniu z operatorem (ELN-28); załącznik 3 §1–§3 opisuje łączniki typu zamkniętego
  sterowane radiowo, a oznaczenie „ws” obejmuje wyłącznik albo rozłącznik (ELN-46); Z3 §4 wskazuje
  ich miejsca: linie główne, stałe punkty podziału, początki długich odgałęzień (ELN-47); Z3 §5.2
  opisuje układ zabezpieczeniowy łącznika (ELN-48), a płyta szafy sterowniczej (Z3 s. 76) ma
  przełącznik SPZ (ELN-49) — funkcjonalnie jest to łącznik o cechach reklozera. Wersja decyzji
  właściciela (2026-11-13 i 2026-11-14): typ „reklozer” wykluczony, poza GPZ domyślnie rozłącznik,
  wyłącznik z zabezpieczeniem tylko jawnym wyborem projektanta z uzasadnieniem. Pogodzenie obu
  wersji w produkcie: łącznik sterowany radiowo z załącznika 3 wchodzi do katalogu wariantu ENEA
  jako rozłącznik (domyślnie) albo jako wyłącznik dostępny wyłącznie przez jawny wybór
  z uzasadnieniem; pozycja typu „reklozer” nie jest oferowana. Rozstrzygnięcie, czy wyłącznik
  z SPZ z załącznika 3 wybrany jawnie może nieść funkcję SPZ w modelu zabezpieczeń, rozstrzyga
  decyzja właściciela 2026-11-14 (§3 pkt 5): może, jako opcja domyślnie nieaktywna, wymagająca
  uzgodnienia z ENEA Operator.
- **L-02 (decyzja właściciela ostrzejsza niż album).** Album załącznika 1 zawiera słupy Kg, Og,
  ONg z głowicami kablowymi bez rozłącznika. Decyzja właściciela wymaga rozłącznika na słupie
  przy każdym odgałęzieniu napowietrznym i mieszanym. Dodatkowo ELN-29 wymaga przed słupową
  stacją SN/nN rozłącznika z uziemnikiem 100/20 A, a ELN-28 rozłącznika 400/200 A tylko na
  liniach głównych i rozbudowanych odgałęzieniach — standard nie rozstrzyga, który z nich
  stawia się na początku krótkiego odgałęzienia.
- **L-03.** §6.1.1 lit. c oraz §6.2 (dokumentacja powykonawcza: protokół odbioru linii kablowej
  przed zasypaniem, inwentaryzacja geodezyjna „linii kablowej nn”, typ „linii nn”) mówią o linii nN
  i kablowej w dokumencie o liniach napowietrznych SN — omyłki redakcyjne przeniesione z innego
  standardu (rozdział formalny).
- **L-04.** Z3 §5.2 powołuje „Zeszyt 5. Telemechanika”, który zastąpił standard
  „Linie i stacje elektroenergetyczne SN — telemechanika” 12.2025 (grupa C indeksu).
- **L-05.** Standard nie podaje parametrów elektrycznych (R, X, C, obciążalności) przewodów
  w osłonie ani kabli uniwersalnych; produkt musi je brać z kart producentów jako `DATASHEET`
  albo jako wartości robocze `ESTIMATED`.
- **L-06.** §4.1 nie definiuje, czy limit 100 m przęsła i 1 km sekcji odnosi się do linii
  z kablem uniwersalnym tak samo jak do przewodów w osłonie (tekst mówi ogólnie „linia SN”).

## 5. Mapa wdrożenia (stan kodu 2026-11-13, `/home/user/MV-Design-PRO/mv-design-pro`)

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| ELN-13, ELN-14 (przewód w osłonie, kabel uniwersalny) | `backend/src/network_model/catalog/mv_cable_line_catalog.py:1324-1733` (rodziny AAL, AFL-6, AFL-2 — tylko przewody gołe) | **Brak** typów przewodu w osłonie AlMgSi 70/120 mm² i kabla uniwersalnego 70 mm² — podstawowego rozwiązania ENEA nie da się wybrać z katalogu. |
| ELN-36 (AFL-6 w liniach istniejących) | `mv_cable_line_catalog.py:1494-1640` (`line-base-al-st-*`) | Zgodne co do rodziny przewodu gołego. |
| ELN-17, ELN-26 (odgałęzienie na słupie mocnym) | `backend/src/enm/domain_operations.py:8254-8283` (`_insert_branch_point_on_segment_sn`: słup rozgałęźny tylko na `line_overhead`, ZKSN tylko na kablu), `:8587` (`insert_branch_pole_on_segment_sn`), `:8602` (`start_branch_segment_sn`) | Zgodne co do ośrodka (słup na linii, ZKSN na kablu). Brak cechy „słup mocny” w modelu. |
| ELN-28, ELN-29 (rodzaj i prądy łącznika na słupie) | `backend/src/network_model/catalog/mv_branch_point_catalog.py:110-124` (`AFL-SLUP`: `ODLACZNIK` 400 A), `:132-146` (`SLUP-ODG-12`: `ROZLACZNIK` 630 A); `domain_operations.py:360-369` (domyślnie `ROZLACZNIK` 630 A) | **Sprzeczne:** pozycja `AFL-SLUP` niesie odłącznik — standard wymaga rozłącznika (ELN-28/29), odłącznik nie jest przewidziany jako łącznik liniowy SN. Brak wariantu „rozłącznik z uziemnikiem 100/20 A”. Brak prądu wyłączalnego w specyfikacji aparatu słupa. |
| ELN-28 + DECYZJA WŁAŚCICIELA (rozłącznik na słupie odgałęźnym widoczny) | `domain_operations.py:8475-8494` (łącznik portu odgałęźnego: `render_on_sld: False`, `requires_catalog_binding: False`, `visual_role: BRANCH_POINT_INTERNAL_SWITCH`); `frontend/src/ui/sld/v3/symbols/defs.ts:217-222` (`branchPole` bez łącznika); `frontend/src/ui/sld/v3/scene/buildScene.ts:1879-1881` | **Sprzeczne z decyzją właściciela:** łącznik słupa jest ukryty na schemacie i nie ma wiązania katalogowego; brak głowicy kablowej dla odgałęzienia mieszanego. |
| ELN-28 (wyłącznik w linii za zgodą) + DECYZJA WŁAŚCICIELA 2026-11-13/14 (reklozery wykluczone, wyłącznik poza GPZ tylko jawnie z uzasadnieniem) | `backend/src/network_model/catalog/mv_switch_catalog.py:536-602` (`SWITCH_RECLOSERS`: ABB REC615 17,5 kV, NOJA, Schneider); `backend/src/network_model/catalog/bay_templates.py:212-214` (role IN/OUT/FEEDER z `REKLOZER`); `domain_operations.py:5785`; `backend/src/enm/models.py:1742` (`junction_type` z `recloser_point`); `backend/src/enm/wylaczniki_liniowe.py:5`; `frontend/src/ui2/kreatory/stacja/stacjaModel.ts:1011`; `frontend/src/ui2/kreatory/stacja/generatorSldPola.ts:259`; `frontend/src/ui/sld/v3/symbols/defs.ts:88-100` | **Sprzeczne z decyzją właściciela:** reklozer jest pozycją proponowaną na równi z wyłącznikiem i rozłącznikiem dla pól liniowych. Dodatkowo pozycja ABB 17,5 kV nie spełnia izolacji 24 kV wymaganej dla sieci 20 kV (ELN-37). |
| DECYZJA WŁAŚCICIELA 2026-11-14 (poza GPZ domyślnie rozłącznik, wyłącznik tylko jawnie z uzasadnieniem) | `backend/src/enm/domain_operations.py:8951` (`insert_section_switch_sn`: domyślny `switch_type` = `ROZLACZNIK`); `backend/src/enm/wylaczniki_liniowe.py:3-5` (wyłącznik sekcyjny z zabezpieczeniem, w opisie „np. reklozer”) | Domyślny rozłącznik zgodny z decyzją. **Brak** pola uzasadnienia wyboru wyłącznika poza GPZ w operacji i w modelu, więc wyjaśnienie oceny i raport nie mogą go pokazać; opis modułu przywołuje reklozer jako przykład. |
| ELN-30, ELN-46–ELN-49 (łącznik sterowany radiowo, sygnalizacja zwarcia) | brak typu w `mv_switch_catalog.py` | **Brak** pozycji „łącznik zamknięty sterowany radiowo” i atrybutu sygnalizacji przepływu prądu zwarciowego. |
| ELN-22–ELN-24 (ograniczniki przepięć) | `backend/src/network_model/catalog/mv_surge_arrester_catalog.py` | Katalog istnieje; reguły rozmieszczenia (ELN-23/24) nie są sprawdzane. |
| ELN-08–ELN-10 (przęsło, sekcja odciągowa) | brak (model nie niesie słupów przelotowych ani sekcji odciągowych) | Poza modelem obliczeniowym; do wpięcia w kreator trasy, gdy model będzie niósł słupy. |
| ELN-43–ELN-45 (słup pomiarowy) | `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md:21-31` (słup z pomiarem jako miejsce układu) | Kontrakt zna słup pomiarowy; brak szablonu PRK/PRO/PRON z przekładnikiem potrzeb własnych. |
| ELN-07 (skrzyżowanie z 110 kV) | brak | Wymaganie trasowe, poza modelem obliczeniowym. |
| ELN-32 (oznakowanie) | brak | Poza modelem obliczeniowym. |
