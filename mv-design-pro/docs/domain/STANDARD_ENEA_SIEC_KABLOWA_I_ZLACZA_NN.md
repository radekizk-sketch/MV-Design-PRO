# Standard ENEA — sieć kablowa nN 0,4 kV oraz szafy i złącza kablowe nN — kontrakt wiedzy produktu

Status: **BINDING** (Zasada nr 5 `CLAUDE.md`).
Dokument obejmuje spójną parę standardów ENEA Operator (sieć kablowa nN odwołuje się do szaf
i złączy w każdym punkcie):

1. „Elektroenergetyczna sieć kablowa nn-0,4 kV — wytyczne projektowania i budowy”, wersja
   11.2021, uchwała Zarządu nr 12/2022, obowiązuje od 01.07.2022, zastępuje wersję 10.2018
   (Rada Techniczna 29.11.2018, protokół 65). Adres:
   `https://www.operator.enea.pl/media/694/1703elektroenergetyczna-siec-kablowa-nn-0-4kv-wytyczne-projektowania-i-budowy-obowiazuje`.
   10 stron, **skan** (tekst odczytany wizualnie ze stron 1–10), SHA-256 zaczyna się od
   `a06b4d8a` i kończy na `7428ee`. Prefiks **ESK**.
2. „Szafy kablowe oraz złącza kablowe nN z układem pomiarowo-rozliczeniowym energii
   elektrycznej”, wersja 08.2023, uchwała Zarządu nr 5/2024, obowiązuje od 01.02.2024. Adres:
   `https://www.operator.enea.pl/media/693/szafy-kablowe-oraz-zlacza-kablowe-nn-z-ukladem-pomiarowo-rozliczeniowym-energii`.
   32 strony, SHA-256 zaczyna się od `aa2c1189` i kończy na `742930d2`. Prefiks **EZN**.

Pobrano 2026-11-13. PDF, tekst i rysunki NIE są w repozytorium (prawa ENEA). Ten dokument zawiera
wyłącznie numery punktów, wartości liczbowe i własne sformułowania; nie jest cytatem.

Skróty ENEA używane w obu dokumentach: **SK** — szafa kablowa (rozdział energii, może pełnić
funkcję złącza); **ZK** — złącze kablowe; **ZK-P** — złącze kablowo-pomiarowe z pomiarem
bezpośrednim; **ZK-Pp** — złącze kablowo-pomiarowe z pomiarem półpośrednim; **SKP** — szafa
kablowo-pomiarowa; **FL** — rozłącznik bezpiecznikowy listwowy; **FG** — rozłącznik główny.

## 1. Zakres stosowania w produkcie

- model sieci nN: obwód kablowy nN (część sieci zasilana z jednego pola rozdzielnicy nN stacji
  SN/nN), linia główna (magistrala) i odgałęźna, punkt podziału sieci, przyłącze, szafa
  i złącze jako węzły z polami bezpiecznikowymi;
- katalog: szafy i złącza (SK3/SK4/SK6, ZK3/ZK4, ZK1x-1P, ZK1-1Pp, ZK2x-2P, SKP), rozłączniki
  bezpiecznikowe listwowe i skrzynkowe wielkości 00 i 2, wkładki gG 400 V;
- kreatory: obwód nN stacji, przyłącze odbiorcy grup IV i V, budynek wielolokalowy, mikroinstalacja;
- schemat jednokreskowy domeny nN: szafa, złącze, pomiar, oznaczenie podwójnego zasilania;
- obliczenia i oceny: dobór wkładek i selektywność, czas samoczynnego wyłączenia (ochrona
  przy uszkodzeniu), uziemienia punktu neutralnego i przewodu PEN, spadki napięć;
- raport: podstawa wymagań numerem punktu.

Wdrożenie jako **wariant standardu operatora**. Ocena zgodności — werdykt wyjaśnialny
(`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`).

## 2. Wymagania potwierdzone — sieć kablowa nN 0,4 kV

| Nr | Punkt | Wymaganie |
|----|-------|-----------|
| ESK-01 | §2 | Wytyczne dotyczą nowych układów sieci kablowej nN i przyłączania obiektów; przy przebudowie analizuje się zasadność, a przebudowa całego obwodu nN obowiązkowo stosuje ten standard. Parametry elementów sieci są w odrębnych standardach. |
| ESK-02 | §4 | Definicje: linia główna (magistralna) zasila linie odgałęźne; linia odgałęźna przyłączona do innej linii w dowolnym punkcie; linia promieniowa zasilana jednostronnie; praca w strukturze zamkniętej w konfiguracji otwartej — każdy punkt zasilany z jednego z kilku możliwych punktów; obwód kablowy nN — część sieci zasilana z jednego pola rozdzielnicy nN stacji SN/nN; definicje SK, ZK-P, ZK-Pp, SKP i ZK odsyłają do standardu szaf i złączy. |
| ESK-03 | §5.1 | Sieć kablowa nN w układzie TN-C (jeden przewód PEN); dotychczasowy TT przy rozbudowie zostaje, ale przy przebudowie rozważa się zmianę na TN-C. Rozdział PEN na PE i N wyłącznie poza urządzeniami operatora, w instalacji odbiorcy lub wytwórcy. |
| ESK-04 | §5.1 | ZK, ZK-P, ZK-Pp i SKP lokalizuje się zasadniczo w granicy nieruchomości przyłączanego podmiotu; wyjątki dla oświetlenia drogowego, reklam, sygnalizacji i obiektów bez dostępu do drogi publicznej. SK lokalizuje się w miejscach swobodnego dostępu służb operatora. |
| ESK-05 | §5.2 a | Nowa linia główna w układzie przelotowym przez SK, SKP, ZK-P i ZK; dopuszczone zasilanie ZK-P i ZK przyłączem z SK lub SKP; na kablach wychodzących bezpośrednio ze stacji projektuje się SK lub SKP. |
| ESK-06 | §5.2 b | Analizuje się linię główną po obu stronach ulicy dla struktury zamkniętej w konfiguracji otwartej; gdy to niemożliwe — linia odgałęźna z SK lub SKP w linii głównej do SKP, ZK lub ZK-P/ZK-Pp, zależnie od liczby przyłączanych podmiotów. |
| ESK-07 | §5.2 c | Struktura zamknięta w konfiguracji otwartej jest wymagana, gdy możliwe jest przejęcie obciążenia między obwodami, a połączenie między nimi nie przekracza 100 m; przy dłuższym połączeniu analizuje się zasadność. Praca promieniowa jest dopuszczona. Podziały sieci tylko w SK lub SKP. |
| ESK-08 | §5.2 d | Linie główne kablem o przekroju żył roboczych 150 mm²; 70 mm² lub 240 mm² opcjonalnie, gdy wynika to z obliczeń. |
| ESK-09 | §5.2 e | Linia główna co najwyżej 500 m od stacji do punktu podziału (struktura zamknięta) albo do końca obwodu (praca promieniowa); dłuższe obwody dopuszczone przy zachowaniu spadków napięć i skuteczności ochrony przed porażeniem. |
| ESK-10 | §5.2 f | Zakaz przelotowego wprowadzania kabla 240 mm² do ZK-P. |
| ESK-11 | §5.3.1 | Podmioty V grupy przyłączeniowej: zasadniczo ZK-P lub SKP z jednym lub dwoma układami pomiarowymi (więcej w uzasadnionych przypadkach, np. zespoły garaży); ZK-P zasilane przelotowo z linii głównej, przyłączem ze słupa (istniejąca linia napowietrzna nN) albo przyłączem z SK lub SKP. |
| ESK-12 | §5.3.1 | Przyłącze 35 mm² z mufą odgałęźną tylko z istniejącej linii głównej, zasadniczo do sześciu muf odgałęźnych między szafami lub złączami zasilanymi przelotowo; wykonanie zalecane w technologii PPN; zakaz muf odgałęźnych na kablach wychodzących bezpośrednio ze stacji SN/nN. Przyłącza ze słupa i z SK/SKP kablem 35 mm², w uzasadnionych przypadkach 70 mm². |
| ESK-13 | §5.3.2 | Podmioty IV grupy przyłączeniowej: ZK-Pp; budynki wielolokalowe: ZK. Wewnętrzna linia zasilająca jak najkrótsza; układy pomiarowe w jednym miejscu dla klatki lub kondygnacji, osobno dla każdego lokalu i dla części administracyjnej lub usługowej. |
| ESK-14 | §5.3.2 | Zasilanie ZK-Pp i ZK: ZK przelotowo z linii głównej (nie dotyczy podmiotu IV grupy na końcu obwodu), ZK i ZK-Pp przyłączem z SK lub SKP, albo przyłączem bezpośrednio ze stacji SN/nN. |
| ESK-15 | §6 | Wkładki bezpiecznikowe w stacjach SN/nN i sieci kablowej nN: 400 V, charakterystyka gG (pełnozakresowa, ogólnego przeznaczenia), wg PN-EN 60269-1. |
| ESK-16 | §6 | Ochrona przy uszkodzeniu przez samoczynne wyłączenie zasilania; czas zadziałania zabezpieczeń linii najwyżej 5 s; czas dłuższy dopuszczony, gdy prąd wyłączający Ia jest co najmniej dwukrotnością prądu znamionowego wkładki. Wymagana selektywność zabezpieczeń. |
| ESK-17 | §6 | Uziemienie punktu neutralnego w stacji SN/nN zalecane o rezystancji RBN najwyżej 5 Ω (przy trudnościach — wg N SEP-E-001). |
| ESK-18 | §6 | Uziemienia RBK na trasie linii: na końcu każdej linii i każdego odgałęzienia dłuższego niż 200 m uziemienie najwyżej 30 Ω; w kole o średnicy 300 m wokół końcowego odcinka linii i odgałęzień wypadkowa rezystancja uziemień najwyżej 5 Ω, liczona z uziemień, z których każde ma najwyżej 30 Ω. |
| ESK-19 | §6, rys. s. 8 | Odczyt rysunku poglądowego (s. 8): stacja SN/nN z RB1 (punkt neutralny) i RB2, RB3 w kole 200 m — RBN ≤ 5 Ω jako połączenie równoległe RB1, RB2, RB3; obwody 1 i 2; koła 300 m na końcach obwodów: RBK1 z RB4 i RB5 (odgałęzienie dłuższe niż 200 m), RBK2 z RB6, RB7, RB8, RBK3 z RB9 i RB10, każde ≤ 5 Ω; każde pojedyncze RBi ≤ 30 Ω; wzory: odwrotność rezystancji wypadkowej równa sumie odwrotności rezystancji składowych. |
| ESK-20 | §6 | W obliczeniu RBK nie uwzględnia się uziemienia punktu neutralnego stacji (RB1), nawet gdy leży w kole 300 m. |
| ESK-21 | §6 | W każdej SK, SKP i w ZK z pomiarem półpośrednim PEN uziemia się (najwyżej 30 Ω); szafa lub złącze uziemiane w odległości do 20 m od stacji SN/nN — szyna PEN łączona z uziemieniem stacji, gdy zadanie obejmuje połączenie kablowe ze stacją. |
| ESK-22 | §6 | Nowa linia z istniejącej SK lub SKP bez uziemienia — uziemić szynę PEN; zasadniczo nie uziemia się PEN w ZK, ZK-P, ZK-Pp (z zastrzeżeniem ESK-21). Uziemienie wymagane w miejscach podziału sieci w układzie normalnym. |
| ESK-23 | §6 | Uziomy podstawowo poziomo-pionowe; dla uzyskania rezystancji dopuszczony uziom poziomy z taśmy stalowej we wspólnym rowie z kablem nN (wg standardu linii kablowych nN), wskazany w projekcie. |
| ESK-24 | §6 | Organizacja prac wg instrukcji bezpiecznej pracy operatora; projekt struktury zamkniętej uwzględnia prace pod napięciem PPN. |
| ESK-25 | §7 | Rozwiązania inne — indywidualnie, decyzją dyrektora właściwego rejonu dystrybucji (uzgodnienie przy dwóch jednostkach). |
| ESK-26 | §8, rys. s. 10 | Odczyt schematu ogólnego układów pracy sieci kablowej nN (s. 10): dwie stacje SN/nN; linie główne 150 mm² przelotowo przez SK i ZK-P; odgałęzienia 70/150 mm² do ZK-Pp (podmiot IV grupy); budynki wielolokalowe (BW) na ZK; szafy SK łączące obwody dwóch stacji (struktura zamknięta w konfiguracji otwartej); SK-P z odejściami do kilku ZK-P; „rozwiązanie dopuszczone”: ZK-P podmiotu V grupy przyłączone mufą do istniejącej linii głównej. Legenda: BW — budynek wielolokalowy, IV i V — podmiot grupy przyłączeniowej. |

## 3. Wymagania potwierdzone — szafy kablowe i złącza kablowe nN

| Nr | Punkt | Wymaganie |
|----|-------|-----------|
| EZN-01 | §2, §4 | Ujednolicone typy szaf i złączy dla budowy i rozbudowy sieci nN w układzie TN-C; definicje SK, ZK, złącza i szafy z układem pomiarowo-rozliczeniowym. |
| EZN-02 | §5.1–§5.3 | Oznaczenie SK/ZK: liczba pól FL wielkości 2 (maksymalna), liczba pól FL wielkości 00, liczba pól FL wielkości 2. Oznaczenie złącza pomiarowego: liczba rozłączników FG, litera „x” — adapter z zaciskami V, liczba liczników, „P” — pomiar bezpośredni, „Pp” — pomiar półpośredni. Analogicznie zbudowane oznaczenie SKP. |
| EZN-03 | §6.1–§6.3 | Typy standardowe: SK3, SK4, SK6; ZK3, ZK4; ZK1x-1P; ZK1-1Pp; ZK2x-2P; SKP3-1P, SKP3-2P, SKP4-1P, SKP4-2P. |
| EZN-04 | §7.1 | Napięcie 230/400 V; prąd znamionowy 160 A lub 400 A; adapter 250 A; napięcie izolacji 500 V; prąd krótkotrwały wytrzymywany 1 s co najmniej 16 kA w części szafowej/złączowej i co najmniej 10 kA w części pomiarowej; temperatura −25…+40 °C; klasa ochronności II; IK10; IP44; znak CE; palność V-0. |
| EZN-05 | §7.2 | Obudowa z SMC w kolorze RAL 7035, zamek trzypunktowy MASTER KEY, wysokość najwyżej 1400 mm, głębokość 250 mm, co najmniej 150 mm do tablicy licznikowej, ścianki co najmniej 3,5 mm, szyna PEN z co najmniej dwiema śrubami M8–M10. |
| EZN-06 | §7.3 | Posadowienie na fundamencie; dolna krawędź drzwi 25–30 cm nad terenem. |
| EZN-07 | §7.4 | Oznakowanie: logo 70 × 38 mm, znak ostrzegawczy 74 × 105 mm, napis o urządzeniu elektrycznym, tabliczka numeru 33 × 160 mm, żółta naklejka 165 × 105 mm, schemat jednokreskowy wewnątrz drzwi. |
| EZN-08 | §7.5 | Rozłączniki bezpiecznikowe listwowe wielkości 00 i 2: rozstaw szyn 185 mm, szerokość 50 mm lub 100 mm, jednobiegunowe, kategoria AC-23B, wkładki 400 V, zaciski V. |
| EZN-09 | §7.6 | Rozłącznik skrzynkowy wielkości 00: rozstaw 33 mm, trójbiegunowy, AC-22B. |
| EZN-10 | §8.1 | ZK1x-1P: rozłącznik skrzynkowy wielkości 00 z adapterem dla dwóch kabli do 150 mm²; szyna PEN Cu 40×5; część pomiarowa — wyłącznik nadprądowy charakterystyki C, rozłącznik co najmniej 63 A (6 kA), listwa zaciskowa 4×35 mm², tablica TL-3f, przewody 10 mm² H07V-K, kolory przewodów przed licznikiem czarny, za licznikiem brązowy. |
| EZN-11 | §8.1, rys. 1 | Odczyt rysunku 1 (ZK1x-1P): pętla kabla linii głównej przez adapter, rozłącznik FG, zabezpieczenie przedlicznikowe F, licznik Wh, rozłącznik R, listwa zaciskowa LZ, przyłącze odbiorcy; szyna PEN. |
| EZN-12 | §8.2 | ZK2x-2P: dwa rozłączniki skrzynkowe wielkości 00, połączenie 25 mm². |
| EZN-13 | §8.3 | ZK1-1Pp: rozłącznik listwowy FG wielkości 2 jednobiegunowy z zaciskami V dla kabla Al 240 mm²; listwa F wielkości 2 trójbiegunowa izolacyjna; gniazdo serwisowe 16 A z wyłącznikiem B; szyny 40×5 mm w rozstawie 185 mm; miejsce na przekładniki prądowe; obwody pomiarowe 2,5 mm² Cu; izolacja odczepów napięciowych 1,8/3 kV; listwa probiercza co najmniej 16 elementów. |
| EZN-14 | §8.3, rys. 3 | Odczyt rysunku 3 (ZK1-1Pp): rozłącznik FG, przekładniki prądowe, listwa F, przyłącze odbiorcy; licznik Wh z listwą probierczą LP; gniazdo G. |
| EZN-15 | §8.4 | Złącze dla mikroinstalacji lub agregatu: obowiązkowy znak ostrzegawczy o podwójnym zasilaniu z zakazem prac do czasu odłączenia od sieci i od źródła wytwórczego oraz polami na miejsce odłączenia generatora i zasilania głównego; wymiar 154 × 66 mm; umieszczony w części pomiarowej i kablowej. |
| EZN-16 | §8.5 | SK/ZK: szyny 40×5 mm w rozstawie 185 mm, otwory co 100 mm, przystosowanie do PPN; pola wielkości 2 z zaciskami V (moment 30 N·m) dla kabli 240 mm²; pola wielkości 00 z zaciskami V (20 N·m) dla kabli 150 mm². |
| EZN-17 | §8.5, rys. 5 | Odczyt rysunku 5 (SK4/ZK4): cztery rozłączniki listwowe FL wielkości 2 (400 A) na szynach; szyna PEN uziemiona. |
| EZN-18 | §8.6–§8.7 | SKP: pola wielkości 2 — 400 A, pola wielkości 00 — 160 A; część pomiarowa jak w ZK-P. |
| EZN-19 | §9 | Gwarancja na szafy i złącza co najmniej 60 miesięcy — rozdział formalny. |
| EZN-20 | §10 | Rozwiązania inne — decyzją dyrektora oddziału dystrybucji (prace SN) albo dyrektora rejonu dystrybucji (prace 0,4 kV). |
| EZN-21 | §11 | Załączniki: rysunki 1–10 typów szaf i złączy (rysunki 1, 3, 5 odczytane w EZN-11, EZN-14, EZN-17). |

## 4. Decyzje i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

1. **DECYZJA WŁAŚCICIELA 2026-11-13 o zakazie odgałęzienia na gołej szynie** dotyczy sieci SN
   (słup z rozłącznikiem, ZKSN). Standard sieci kablowej nN dopuszcza mufę odgałęźną przyłącza
   35 mm² na istniejącej linii głównej (ESK-12) i pokazuje ją na schemacie jako „rozwiązanie
   dopuszczone” (ESK-26). Przeniesienie zakazu na sieć nN byłoby rozszerzeniem decyzji
   właściciela, nie wymaganiem ENEA — zob. luka L-01.
2. Kształt symboli SK, ZK, ZK-P, SKP na schemacie i ich kolory — decyzja graficzna produktu (B-02).
3. Grupowanie obwodu nN do jednego pola rozdzielnicy (ESK-02) jako reguła kreatora — wynika
   z definicji ENEA; inne reguły kreatora (np. liczba przyłączy na szafę) są decyzją produktu.

## 5. Luki i niejednoznaczności

- **L-01 (do decyzji architekta).** Decyzja właściciela z 2026-11-13 o odgałęzieniach została
  wypowiedziana dla SN. W sieci nN ENEA dopuszcza mufy odgałęźne przyłączy (do sześciu między
  szafami). Trzeba potwierdzić, że zakaz nie obejmuje nN.
- **L-02.** Standard sieci kablowej nN jest skanem z 2021 r. (wersja 11.2021); powołuje N SEP-E-004,
  PN-76 E-05125 i N SEP-E-001 — część z nich zastąpiona. Standard linii kablowych nN 05.2025
  jest nowszy i zgodny co do przekrojów (150 mm² podstawowy).
- **L-03.** Standard nie podaje limitu spadku napięcia dla obwodu dłuższego niż 500 m (ESK-09) —
  odsyła do „dopuszczalnych spadków” bez wartości.
- **L-04.** Definicja ZK-P/ZK-Pp w sieci kablowej nN używa oznaczeń z łącznikiem, a standard szaf
  i złączy używa oznaczeń typów ZK1x-1P i ZK1-1Pp — ten sam obiekt, dwa systemy oznaczeń.
- **L-05.** Schemat s. 10 pokazuje też obiekt „SK-P” (szafa kablowa z pomiarem) obok „SKP” —
  niejednolite oznaczenie w obrębie jednego dokumentu.

## 6. Mapa wdrożenia (stan kodu 2026-11-13, `/home/user/MV-Design-PRO/mv-design-pro`)

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| EZN-02, EZN-03 (typy szaf i złączy) | brak (`grep -i "szafa kablowa\|ZK1x\|SK4\|SKP"` w `backend/src` i `frontend/src/ui2` — 0 trafień) | **Brak** obiektów SK, ZK, ZK-P, ZK-Pp, SKP w modelu i katalogu nN. |
| ESK-15, ESK-16 (wkładki gG, 5 s) | `backend/src/network_model/catalog/lv_disconnection_times_iec60364_4_41.py:89-99` (TN rozdzielczy 5 s) | Częściowe: czas 5 s zgodny; brak kryterium alternatywnego Ia ≥ 2·In wkładki dla czasów dłuższych niż 5 s. |
| ESK-03 (TN-C, rozdział PEN u odbiorcy) | `backend/src/application/analyses/fault_loop/tt_it.py:91` (układy TT/IT), domena nN | Do sprawdzenia przy karcie domeny nN — kod liczy pętlę zwarcia dla TN/TT/IT, ale nie wiąże wariantu ENEA (TN-C w sieci operatora). |
| ESK-17–ESK-22 (uziemienia RBN, RBK, PEN) | brak | **Brak** oceny uziemień sieci nN wg reguły koła 300 m i 30 Ω. |
| ESK-05–ESK-14 (struktura sieci, przyłącza grup IV/V) | brak | **Brak** reguł kreatora i walidatora (przekrój magistrali 150 mm², 500 m, 100 m między obwodami, zakaz 240 mm² przelotowo przez ZK-P). |
| EZN-15 (znak podwójnego zasilania przy mikroinstalacji) | `backend/src/application/station_templates/templates/prosument_pv.py:53` (szablon prosumenta) | Brak oznaczenia podwójnego zasilania w modelu i na schemacie. |
| EZN-10, EZN-13 (pomiar w złączu) | `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md` (tylko SN) | **Brak** pomiaru nN w złączach (bezpośredni, półpośredni) — zob. `STANDARD_ENEA_UKLADY_POMIAROWE.md`. |
