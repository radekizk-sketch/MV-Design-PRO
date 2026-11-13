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
| E-05 | §8.2 tab. 4 | Transformator powyżej 25 MVA i nie większy niż 40 MVA: szyny, pole TR i łącznik szyn 2000 A; pola liniowe, zespołu uziemiającego i baterii kondensatorów 630 A (wszystkie wiersze tabeli odczytane z tekstu 2026-11-13). |
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

### Uzupełnienie 2026-11-13 — rozdzielnia SN, EAZ pól SN, automatyka (§8.2, §10.1, §13, §26)

Wiersze dopisane po ponownym odczycie tekstu (karta ENEA-WIEDZA, grupa C). Wiersze E-01…E-22 nie
zmieniły treści poza uzupełnieniem E-05 o wiersze tabeli 4.

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| E-28 | §8.2 | Tabelę obciążalności wybiera się według mocy znamionowej transformatora zasilającego: do 25 MVA — tabela 3 (E-04), powyżej 25 MVA i nie więcej niż 40 MVA — tabela 4 (E-05). |
| E-29 | §10.1 tab. 5 | Poziomy izolacji SN: sieć 15 kV — napięcie najwyższe urządzenia 17,5 kV, wytrzymywane krótkotrwałe 38 kV, udarowe piorunowe 95 kV, minimalny odstęp doziemny i międzyfazowy w instalacji napowietrznej 220 mm; sieć 20 kV — 24 kV, 50 kV, 125 kV, 220 mm. W stacjach o napięciu dolnym 6 kV i 10 kV instaluje się urządzenia jak dla 15 kV albo 20 kV (w obszarze z dominującym 20 kV — jak dla 20 kV). |
| E-30 | §13 | Rozdzielnica SN: jednosystemowa, dwusekcyjna, izolacja SF6 albo inna o zbliżonych właściwościach dielektrycznych (także powietrzna), wnętrzowa, osłonięta. Skład pól: dwa pola transformatorowe, pole łącznika szyn (jedna albo dwie celki), dwa pola zasilania zespołów uziemiających, dwa pola zasilania BKR, dwa pola pomiaru napięcia oraz pola liniowe w liczbie wynikającej z potrzeb. |
| E-31 | §13 | Rozdzielnica przystosowana do współpracy z transformatorem 110 kV/SN o mocy co najmniej 25 MVA; pomieszczenie dla co najmniej 32 pól docelowo; pola wolnostojące, ustawienie jedno- albo dwurzędowe z odstępem pozwalającym dobudować pole bez rozsuwania sąsiednich; podejścia kablowe indywidualne, wnękowe, murowane; przy budowie etapowej wszystkie elementy budowlane wykonuje się od razu dla układu docelowego. |
| E-32 | §13 | Rozdzielnica powietrzna dopuszczalna w uzasadnionych przypadkach (np. rozbudowa istniejącej): stały wyłącznik z odłącznikiem szynowym albo wyłącznik wysuwny poziomo z wózkiem. Konstrukcja pola: zamknięta, łukoodporna, łukochronna, przedziałowa — przedziały: przyłączeniowy (kablowy), łączników, szyn zbiorczych, obwodów pomocniczych; w rozdzielnicy gazowej dodatkowo kanał wydmuchowy w obrębie pola. Zwarcie w jednym polu nie może oddziaływać na pola sąsiednie. |
| E-33 | §13 | Mosty SN między dwoma rzędami pól: kablowe (budowa, liczba kabli na fazę i przekroje jak dla mostów kablowych SN transformatora, §15) albo szynowe w technologii szyn rozdzielnicy. |
| E-34 | §13 | Przy łącznikach trójpołożeniowych dopuszczalne uziemienie pola przez zamknięty wyłącznik. Przedział gazowy ma niezależny wskaźnik ciśnienia z możliwością sygnalizacji; przekładniki prądowe wymienialne bez ingerencji w przedział gazowy; próby napięciowe kabli bez odłączania ich od rozdzielnicy. |
| E-35 | §13 | Automatyka SZR: przekaźnik w polu łącznika szyn SN, obwody kontroli napięcia po stronie 110 kV i SN, urządzenia do programowania SZR w szafie pola łącznika szyn 110 kV w nastawni. |
| E-36 | §13 | Zakaz urządzeń SN pola poza obrysem celki dotyczy także przekładników napięciowych dla ARN. Wyjątek: istniejąca rozdzielnica gazowa z kablownią pod rozdzielnią — przekładniki napięciowe pod polem, z ochroną przed dotykiem i opisem (pole, kierunek linii, fazy). |
| E-37 | §13 | Stacjonarne wskaźniki obecności napięcia współpracujące z uzgadniaczem faz; uziemniki z jednym wspólnym napędem dla trzech faz; sterowniki i napędy obsługiwane z poziomu podłogi. |
| E-38 | §13 | Dwa przekładniki prądowe w przedziale przyłączeniowym: jeden na przepuście kablowym, drugi na kablu SN. Okno przekładnika Ferrantiego dobrane do przekroju kabli z zachowaniem osiowości przepustu. |
| E-39 | §26.9 | Zabezpieczenia od prądów fazowych: nadprądowe zwłoczne i zwarciowe we wszystkich polach poza polem pomiaru napięcia oraz zwarciowe dynamiczne (odstawiane albo uruchamiane na krótki czas po poleceniu „załącz”). Zabezpieczenia ziemnozwarciowe (I0, U0) zależą od sposobu uziemienia sieci: pole liniowe — nadprądowe, kierunkowe i admitancyjne; pole pomiaru napięcia — zerowonapięciowe; łącznik szyn — zerowoprądowe i admitancyjne; pole transformatora — zerowoprądowe; pole ZU — nadprądowe z prądu w obwodzie łączącym urządzenie uziemiające (dławik albo rezystor) z ziemią; pole BKR — zerowoprądowe. |
| E-40 | §26.9.1 | Urządzenie EAZ pola SN to zespół zabezpieczeń zintegrowany ze sterownikiem pola: zwarciowe selektywne, doziemne, przeciążeniowe, napięciowe, częstotliwościowe; co najmniej dwie niezależne grupy nastaw; położenie każdego łącznika pola w postaci dwubitowej; montaż w przedziale niskonapięciowym celki. |
| E-41 | §26.9.2, Z.10 | Pole linii odpływowej SN: zwarciowe I>>T, nadprądowe I>T, od zwarć doziemnych, blokowanie ZS od pobudzenia I>, SPZ, pobudzenie LRW, SCO z SPZ po SCO. |
| E-42 | §26.9.3, Z.11, Z.11.1 | Pole linii SN współpracującej z jednostkami wytwórczymi: zwarciowe I>>T, nadprądowe kierunkowe I>T, od zwarć doziemnych, U>T, U<T, f>T, f<T, df/dt, wyłączenie od zabezpieczeń transformatora mocy, blokowanie od napięcia zwrotnego, blokowanie ZS od pobudzenia kierunkowego I>, SPZ, pobudzenie LRW, SCO (sprzeczność z IRiESD — L-04). |
| E-43 | §26.9.4, Z.7 | Pole transformatora 110 kV/SN strony SN: zwarciowe I>>T, nadprądowe I>T, IZST do zabezpieczenia szyn z blokowaniem od I> pól odpływowych, różnicowe (pomiar prądów strony SN), LRW. |
| E-44 | §26.10 | Każdą automatykę pola SN blokuje się zdalnie (z systemu nadzoru) i lokalnie (łącznikiem zwrotnym albo stałym). |
| E-45 | §26.10.1 | SPZ jedno- albo dwukrotny, nie stosowany w liniach kablowych. Przerwa beznapięciowa: pierwszy cykl 0,4–1,5 s, drugi cykl 5–15 s. |
| E-46 | §26.10.2 | LRW SN z funkcji wewnętrznych zabezpieczeń pól; dwa kryteria: wyłącznik zamknięty i ciągłe pobudzenie zabezpieczenia nadprądowego. Po czasie tLRW wyłącza łącznik szyn SN albo pole transformatora po stronie SN — zależnie od układu pracy. |
| E-47 | §26.10.3 | Blokowanie od napięcia zwrotnego (opcjonalnie kontrola synchronizmu) tylko w polach liniowych przystosowanych do generacji: przy napięciu na podejściu liniowym blokuje załączenie operacyjne i SPZ. |
| E-48 | §26.10.4 | Tryb pracy pola linii SN wybierany zdalnie i lokalnie: „linia” albo „generacja”. W trybie „generacja”: każde wyłączenie transformatora po stronie SN wyłącza pola generacyjne dedykowanym obwodem OWG; SZR przed działaniem wyłącza pola generacyjne, a gdy któreś nie zostanie wyłączone — SZR wstrzymuje się i blokuje; aktywne są U<, U>, f<, f>, df/dt i nadprądowe kierunkowe Ik>. |
| E-49 | §26.10.5 | SZR SN po wyeliminowaniu uszkodzonego transformatora; rezerwa jawna (transformator rezerwowy bez obciążenia) albo ukryta (każdy transformator na swoją sekcję przy otwartym łączniku szyn); w szczególnych przypadkach SZR transformator–linia SN. Przekaźnik SZR obsługuje wszystkie warianty dla dwóch transformatorów z wyłącznikami po stronie 110 kV i SN oraz wyłącznikiem łącznika szyn SN, z kontrolą napięć SN i 110 kV. |
| E-50 | §26.10.6 | Pola odpływowe objęte dwustopniową SCO i SPZ po SCO. Wariant scentralizowany: przekaźnik w polu pomiaru napięcia, szyny okrężne, osobny układ dla każdej sekcji; w polu odpływowym — odstawienie SCO, wybór stopnia, odstawienie SPZ po SCO; w polu pomiaru napięcia — odstawienie SCO dla sekcji. Wariant rozproszony: sterownik pola liniowego wyłącza własny wyłącznik, te same nastawy w każdym polu. |
| E-51 | §26.10.7 | W sieciach kompensowanych wymagana automatyka wymuszania składowej czynnej prądu doziemnego (AWSCz); w polach ZU układ kontroli jej działania z blokadą zdalną i lokalną (w jednej sekcji) przy zamkniętym łączniku szyn SN. |
| E-52 | §26.10.8 | ARN: niezależny, dedykowany regulator cyfrowy; blokada miejscowa i zdalna; sterowanie zaczepami w górę i w dół miejscowo i zdalnie; blokada nad- i podnapięciowa; przełącznik trybu ręczny/automatyczny; cyfrowy wskaźnik numeru zaczepu z nadajnikiem w szafce napędu przełącznika. |
| E-53 | §26.11, §26.11.2 | Wszystkie obwody sterowania łącznikami w blokadach elektrycznych na stykach pomocniczych aparatów. Wyłączniki SN sterowane: zdalnie z systemu nadzoru, z terminala stacyjnego, lokalnie ze sterownika pola, lokalnym poleceniem „wyłącz” w polu; pozostałe łączniki SN miejscowo napędem ręcznym albo silnikowym. Terminal stacyjny bez dostępu do sieci IP operatora. |
| E-54 | §26.4, §26.5 | Zabezpieczenia wyłączają tylko wyłączniki niezbędne do eliminacji uszkodzenia; działają poprawnie niezależnie od układu pracy sieci; podstawowe reagują na wszystkie rodzaje zwarć i rozpoznają fazy i strefy; rezerwowe reagują na zwarcia niesymetryczne z ziemią z uwzględnieniem rezystancji łuku. |

### Rozdzielnia 110 kV

Zakres produktu (decyzja właściciela, przypomniana 2026-11-12): MV-DESIGN-PRO NIE modeluje pełnej
rozdzielni 110 kV. Strona 110 kV to równoważnik obliczeniowy sieci (dane SN, wspólny równoważnik
110 kV albo oddzielne zasilania 110 kV), rysowany symbolem sieci zasilającej, bez pól i aparatury
110 kV. Wiersze E-23…E-27 i E-55…E-66 są wyłącznie informacją o standardzie (np. do opisu warunków
przyłączenia i granic równoważnika), nie zakresem wdrożenia.

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| E-23 | §11.1, Z.1 | Rozwiązanie podstawowe: układ H5 — jednosystemowa, dwusekcyjna (sekcje A i B), pięć pól: dwa liniowe, dwa transformatorowe, łącznik szyn. Dopuszczalny H4 (z rezerwą terenu do H5 lub 1S); przy współpracy z wytwórcami przyłączonymi do 110 kV łącznik szyn wyposażony jak w H5. Niedopuszczalna stacja z jedną linią zasilającą 110 kV. |
| E-24 | §11.1 | Pole liniowe 110 kV, od szyny: odłącznik szynowy z uziemnikiem od strony pola, wyłącznik, przekładniki zespolone prądowo-napięciowe, odłącznik liniowy z uziemnikiem od strony linii, ograniczniki przepięć z licznikami zadziałań. |
| E-25 | §11.1 | Pole transformatorowe 110 kV, od szyny: odłącznik szynowy z uziemnikiem od strony pola, wyłącznik, przekładniki zespolone prądowo-napięciowe, ograniczniki przepięć z licznikami zadziałań (Z.6). |
| E-26 | §11.1, Z.8, Z.9 | Pole łącznika szyn 110 kV: odłącznik sekcyjny z uziemnikiem od strony pola, wyłącznik, przekładniki zespolone, odłącznik sekcyjny z uziemnikiem od strony pola (H5 — Z.8; H4 — Z.9). |
| E-27 | Z.1 | Na rysunku zasadniczym: linie 110 kV wchodzą od góry do pól liniowych, sekcje A i B rozdzielone polem łącznika szyn, pola transformatorowe schodzą do transformatorów, a te do sekcji A i B rozdzielni SN; punkt neutralny 110 kV transformatora z ogranicznikiem i odłącznikiem. Wartości znamionowe aparatów i przekładni odczytywać z Z.1, Z.4–Z.6, Z.8 przed wpisaniem do katalogu. |
| E-55 | §9.1 | Standardowy szereg prądów zwarciowych, na które projektuje się rozdzielnię 110 kV: 25 – 31,5 – 40 kA (wartość docelową podaje ENEA). Prąd wyłączalny wyłączników 110 kV co najmniej 40 kA, prąd 1-sekundowy odłączników co najmniej 40 kA. |
| E-56 | §10.1 tab. 5 | Sieć 110 kV: napięcie najwyższe urządzenia 123 kV, wytrzymywane krótkotrwałe 185 kV, udarowe piorunowe 450 kV, minimalny odstęp w instalacji napowietrznej 900 mm. |
| E-57 | §11 | Stacja 110 kV/SN do pracy bez stałej obsługi; liczba elementów wyłączanych przy rozbudowie i remontach minimalna; możliwość bezpośredniego połączenia linii 110 kV tymczasowym mostem linkowym z odłącznikiem; system blokad przeciw błędnym łączeniom; sygnalizacja włamaniowa z kontrolą dostępu i monitoring wideo (Zeszyt 4 „Systemy ochrony technicznej” — nie występuje na publicznej stronie standardów ENEA według inwentarza z 2026-11-13). |
| E-58 | §11.1 | Rozplanowanie H5 umożliwia rozbudowę o dwa pola do układu 1S bez rozbiórki. Zakaz napowietrznej stacji 110 kV/SN w IV strefie zabrudzeniowej. W rozdzielni 1S najwyżej cztery pola liniowe i najwyżej siedem pól łącznie; więcej pól — zalecany układ 2S z jednym systemem sekcjonowanym. Urządzenia i płyny izolacyjne bez PCB. |
| E-59 | §11.1 | Rozwiązania zamienne (każde wymaga zgody ENEA): napowietrzne z wyłącznikiem izolacyjnym, napowietrzne z kompaktowymi polami SF6, wnętrzowe GIS. Przy wyłącznikach izolacyjnych pola liniowe i transformatorowe nie mają odłączników szynowych; pole łącznika szyn ma układ aparatów jak w rozwiązaniu podstawowym. Wymagania dla pojedynczych aparatów — w standardzie „Napowietrzna aparatura WN” (`STANDARD_ENEA_APARATURA_WN.md`). |
| E-60 | §11.1 | Ustawienie aparatów wysokie (bez przegród przed dotykiem); szerokość pola 8 m; szyny z rur gołych o średnicy 80, 100 albo 120 mm, montaż najwyżej 7 m nad terenem, dobór z obliczeń elektrodynamicznych; obok siebie najwyżej dwa pola. Napędy: odłączniki i uziemniki — silnikowe z możliwością ręcznej obsługi; wyłączniki — zasobnikowe sprężynowe zbrojone silnikiem; uziemniki punktów neutralnych transformatorów i odłączniki stanowisk ZU — ręczne; przyciski sterownicze 100–170 cm nad terenem; oświetlenie rozdzielni co najmniej 20 lx. |
| E-61 | §11.1.1.1–§11.1.1.3 | Zapis układu pól (od szyny): liniowe OSZ(U) – W – PIU – OL(U) – OGR; transformatorowe OSZ(U) – W – PIU – OGR; łącznika szyn OS(U) – W – PIU – (U)OS. Ograniczniki przepięć połączone z siatką uziemiającą przez liczniki zadziałań. |
| E-62 | §12 | Punkt neutralny transformatora 110 kV/SN uziemiany przez uziemnik (odłącznik) z napędem ręcznym z przełącznikiem sygnałowym, dostępnym z ziemi; ogranicznik przepięć w punkcie neutralnym bez licznika zadziałań. |
| E-63 | §23 | Uziemniki w polach liniowych, transformatorowych i łącznika szyn 110 kV, nabudowane na odłącznikach szynowych i liniowych (w rozwiązaniach bez odłączników — na urządzeniach pełniących ich funkcję); zawsze uziemnik w obwodzie punktu neutralnego transformatora. Napędy uziemników silnikowe, z wyjątkiem punktu neutralnego (ręczny). Noże uziemiające i ich napędy w kolorze żółtym. |
| E-64 | §26.6 | Czas trwania zwarcia to suma czasu pobudzenia zabezpieczenia podstawowego, czasu nastawionego i czasu własnego wyłącznika; w sieci 110 kV przy działaniu w strefie podstawowej najwyżej 150 ms. |
| E-65 | §26.7.2–§26.7.4 | Linia 110 kV: zabezpieczenie podstawowe odległościowe albo różnicowe (gdy jest łącze), rezerwowe zerowoprądowe kierunkowe dwustopniowe (albo odległościowe, gdy podstawowe jest różnicowe), SPZ z kontrolą synchronizmu, lokalizator miejsca zwarcia; linia blokowa — różnicowe i zerowoprądowe kierunkowe dwustopniowe. Transformator: różnicowe, rezerwowe nadprądowe strony 110 kV, zabezpieczenia fabryczne (gazowo-przepływowe kadzi dwustopniowe, gazowo-przepływowe przełącznika zaczepów, od wzrostu temperatury oleju dwustopniowe), strona SN nadprądowe. Łącznik szyn 110 kV: odległościowe, zerowoprądowe kierunkowe, SPZ z kontrolą synchronizmu (pole zastępujące pola liniowe — wszystkie funkcje zastępowanych poza różnicową). |
| E-66 | §26.11.1, §26.11.3 | Łączniki 110 kV sterowane zdalnie z systemu nadzoru, z nastawni i lokalnie z szafki napędu. Blokady 110 kV (H5) bezwzględnie elektryczne na stykach pomocniczych; łącznik nie może podać napięcia na element uziemiony ani uziemić elementu pod napięciem; odłącznik nie łączy pod obciążeniem; odłącznik sterowalny przy otwartym uziemniku w tym samym punkcie i odwrotnie; zakaz blokad w obwodach wyłączających; blokady logiczne dopuszczalne tylko w obwodach „załącz”. |

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

## 5. Luki i niejednoznaczności (stan 2026-11-13)

| Nr | Miejsce | Opis |
|----|---------|------|
| L-01 | §8.2, Zeszyt 7 §4 | Standard określa obciążalności tylko dla transformatorów do 40 MVA, a Zeszyt 7 projektuje stanowisko transformatora na moc docelową 40 MVA. Dla 63 MVA standard nie podaje wymagań. |
| L-02 | §10.1 tab. 5 a §13 | Tabela 5 podaje dla sieci 15 kV urządzenia 17,5 kV, a §13 wymaga rozdzielnicy 24 kV dla sieci do 20 kV. Dla rozdzielnicy SN obowiązuje §13 (przepis szczegółowy); tabela 5 dotyczy pozostałych urządzeń i odstępów. W ocenie zgodności pokazuje się oba punkty. |
| L-03 | §10.1 tab. 5 a „Napowietrzna aparatura WN” §6.2, §7.2 | Zeszyt 1 podaje dla 110 kV 185/450 kV, a standard aparatury wymaga od wyłączników i odłączników 230/550 kV. To nie sprzeczność (aparat ma minimum wyższe niż instalacja), ale dwa różne progi; dla aparatury obowiązuje standard aparatury. |
| L-04 | §26.9.3 a IRiESD 2.3 pkt II.4.5.4.7.1 ppkt 1 | Zeszyt 1 wymienia automatykę SCO w polu linii SN z jednostkami wytwórczymi, a IRiESD zakazuje uruchamiania SCO w liniach, do których przyłączone są jednostki wytwórcze. Sprzeczność do rozstrzygnięcia przez architekta; do czasu rozstrzygnięcia funkcja istnieje w szablonie pola, domyślnie nieaktywna (zasada 8 w §4), a ocena pokazuje oba punkty. |
| L-05 | §26.10.6 a IRiESD 2.3 pkt II.4.5.4.7.1 ppkt 2 | Zeszyt 1: pola odpływowe „powinny być objęte” SPZ po SCO; IRiESD: SPZ/SCO stosuje się w uzgodnieniu z ENEA. Zasada 8 (domyślnie nieaktywne) jest zgodna z IRiESD. |
| L-06 | §26.10.1 a IRiESD 2.3 pkt II.4.5.4.2.1 ppkt 3 | Zeszyt 1 ogranicza SPZ do jednego albo dwóch cykli, IRiESD wymaga „wielokrotnego SPZ z możliwością programowania” w liniach napowietrznych i napowietrzno-kablowych. Liczba cykli jest nastawą, nie cechą urządzenia — przyjmuje się urządzenie programowalne, nastawa domyślna według Zeszytu 1. |
| L-07 | §26.9.9 | Odsyłacz „p. 3.4.9.” nie istnieje w Zeszycie 1 (omyłka redakcyjna); treść wymagania jest kompletna bez odsyłacza. |
| L-08 | §26.10.4 | Tekst nazywa obwody „R15 kV” i automatykę „SZR 15 kV”; wymaganie dotyczy rozdzielni SN niezależnie od napięcia 15 albo 20 kV (interpretacja, nie literał). |
| L-09 | §13 | Łącznik szyn SN realizowany w jednej albo dwóch celkach; liczba celek wynika z rysunku Z.2 i wyboru producenta, standard nie rozstrzyga. |
| L-10 | §13, Z.13–Z.15 | Standard przewiduje sieć SN uziemioną przez dławik, układ dławik–rezystor albo rezystor (dwa pola ZU); nie przewiduje wariantu sieci izolowanej w GPZ. |
| L-11 | Z.12, Z.13–Z.15, Z.16 | Rysunki nieodczytane — kolejność aparatów i przekładnie tych pól pozostają nieustalone (jak w §2). |

## 6. Mapa wdrożenia — miejsca w kodzie (stan `main` 2026-11-13, odczyt bez edycji)

Ścieżki względem `mv-design-pro/backend/src/`. „Sprzeczne” oznacza, że kod dziś realizuje coś
innego niż standard; wejście do karty wpięcia profilu ENEA.

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| E-23, E-30, E-61 (terminologia) | `application/station_templates/templates/gpz_110_sn.py:18`, `:96`, `:117`; `api/station_templates.py:451`; `application/station_templates/apply.py:158` | Sprzeczne: „układ H5 z mostkiem” opisuje stronę SN (sprzęgło sekcji SN), a H5 w ENEA to układ rozdzielni 110 kV (§11.1); pole sekcyjne SN to „łącznik szyn” (§13), nie „mostek”. |
| E-30 (skład pól) | `application/station_templates/templates/gpz_110_sn.py:93`–`:97`; `network_model/catalog/bay_templates.py:73` | Sprzeczne: szablon GPZ zna tylko role FEEDER i COUPLER; słownik ról pól nie ma pola zespołu uziemiającego ani BKR. Pole pomiaru napięcia istnieje jako rola MEASUREMENT (`bay_templates.py:248`), ale szablon GPZ go nie tworzy. Zasada 7 w §4 (kreator nie dodaje pól bezwarunkowo) pozostaje w mocy. |
| E-30, E-51, L-10 | `application/station_templates/apply.py:242`; `application/station_templates/templates/gpz_110_sn.py:33` | Sprzeczne: GPZ zawsze z siecią izolowaną (`grounding: isolated`), a standard przewiduje pola ZU i AWSCz dla sieci kompensowanej. |
| E-28, L-01 | `application/station_templates/_choices.py:76`, `:86` | Sprzeczne: oferta 63 MVA poza zakresem tabel 3 i 4. |
| E-03, E-04, E-05, E-06, E-29 | `application/analyses/wytrzymalosc_aparatury_pol.py`; `application/equipment_proof/generator.py:253` (czas `tk_s`) | Miejsce oceny doboru: brak progu ENEA 16 kA/3 s i prądów znamionowych pól według mocy TR. |
| E-41, E-45 | `application/protection_settings/engine.py:98`–`:99` | Częściowo zgodne: przerwa SPZ 0,5 s mieści się w 0,4–1,5 s, ale SPZ domyślnie włączony bez rozróżnienia linii kablowej (E-45 wyklucza SPZ w liniach kablowych). |
| E-42, E-47, E-48 | `network_model/catalog/bay_templates.py` (rola OZE, `:278`–`:306`) | Do wpięcia: funkcje pola linii z generacją (blokowanie od napięcia zwrotnego, tryb „generacja”, OWG). |
| E-55 | `enm/domain_operations.py:3954`–`:3967` (strona zasilania `HV_110`) | Do wpięcia: walidacja równoważnika 110 kV względem szeregu 25 – 31,5 – 40 kA jako informacja, nie blokada. |
| E-62 | `network_model/catalog/mv_transformer_catalog.py:85` (grupa „Yd11”) | Niejednoznaczne: standard uziemia punkt neutralny 110 kV przez uziemnik (uzwojenie w gwiazdę z wyprowadzonym punktem neutralnym, Zeszyt 2 Z.9), katalog opisuje grupę bez „N”. |
