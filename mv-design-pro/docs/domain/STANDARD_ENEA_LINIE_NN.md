# Standard ENEA — linie kablowe i napowietrzne nN — kontrakt wiedzy produktu

Status: **BINDING** (Zasada nr 5 `CLAUDE.md`).
Dokument obejmuje spójną parę standardów ENEA Operator dla linii niskiego napięcia 0,4 kV:

1. „Standard w sieci dystrybucyjnej — Elektroenergetyczne linie kablowe niskiego napięcia”,
   wersja 05.2025, uchwała Zarządu nr 310/2025, obowiązuje od 01.10.2025, zastępuje wersję
   11.2021-2 (uchwała 407/2021, zmiana 7/2024). Adres:
   `https://www.operator.enea.pl/media/2710/elektroenergetyczne-linie-kablowe-niskiego-napiecia-obowiazuje-od-01102025pdf.pdf`.
   65 stron (część główna 21 stron i załącznik A-1 „wytyczne projektowania”), SHA-256 zaczyna
   się od `7329a3d0` i kończy na `cde1071a9`. Prefiks **ENK**; „§x” — część główna,
   „A-1 …” — załącznik A-1.
2. „Standard w sieci dystrybucyjnej — Elektroenergetyczne linie napowietrzne niskiego napięcia”,
   wersja 09.2025, uchwała Zarządu nr 33/2026, obowiązuje od 01.04.2026, zastępuje wersję
   02.2023-2 (uchwała 149/2023, zmiana 7/2024). Adres:
   `https://www.operator.enea.pl/media/4033/elektroenergetyczne-linie-napowietrzne-niskiego-napiecia-obowiazuje-od-01042026p.pdf`.
   15 stron, SHA-256 zaczyna się od `d30db11f` i kończy na `0093d4e1`. Prefiks **ENN**.

Pobrano 2026-11-13. PDF, tekst i rysunki NIE są w repozytorium (prawa ENEA). Ten dokument zawiera
wyłącznie numery punktów, wartości liczbowe i własne sformułowania; nie jest cytatem. Struktura
sieci kablowej nN, szafy i złącza: `STANDARD_ENEA_SIEC_KABLOWA_I_ZLACZA_NN.md`.

## 1. Zakres stosowania w produkcie

- katalog typów: kable nN NAYY-J i NAY2Y-J (przekroje, rezystancje, obciążalność długotrwała
  i zwarciowa), przewody samonośne pełnoizolowane linii napowietrznych nN, ograniczniki
  przepięć nN, rozłącznik bezpiecznikowy słupowy nN;
- model ENM i domena nN (`application/analyses/lv_domain`): odcinek kablowy i napowietrzny nN,
  przyłącze, przejście kabel–linia napowietrzna;
- kreatory: obwód nN stacji SN/nN, przyłącze odbiorcy;
- schemat jednokreskowy domeny nN: łącznik słupowy, ogranicznik przepięć, szafa kablowa;
- obliczenia: rozpływ i spadki napięć nN, zwarcia nN (pętla zwarcia, IEC 60364), obciążalność;
- ocena doboru: przekrój wobec obciążalności tab. 4.2, wytrzymałość zwarciowa;
- raport: podstawa wartości z tabel A-1.

Wdrożenie jako **wariant standardu operatora**. Ocena zgodności — werdykt wyjaśnialny
(`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`).

## 2. Wymagania potwierdzone — linie kablowe nN

| Nr | Punkt | Wymaganie |
|----|-------|-----------|
| ENK-01 | §4.1 | Rozwiązanie podstawowe: kabel 0,6/1 kV z czterema żyłami Al o izolacji PVC, z wytłoczoną powłoką wewnętrzną z mieszanki gumowej i powłoką zewnętrzną z PE lub PVC; rozwiązania umożliwiające prace pod napięciem (PPN). |
| ENK-02 | §4.2.1.1 | NAYY-J: żyły Al 35 mm² lub 70 mm², izolacja PVC, powłoka zewnętrzna PVC odporna na UV, żyła zielono-żółta; kolory żył L1 brązowy, L2 czarny, L3 szary, PEN zielono-żółty; cechowanie z symbolem zakładu, znakiem CE i klasą reakcji na ogień. |
| ENK-03 | §4.2.1.2 | NAY2Y-J: żyły Al 150 mm² jako przekrój podstawowy rozwoju sieci kablowej nN (praca w strukturze zamkniętej w konfiguracji otwartej) albo 240 mm² opcjonalnie, gdy wynika z obliczeń; powłoka zewnętrzna PE odporna na UV; kolory żył jak w ENK-02. |
| ENK-04 | §4.2.1.2 tab. 2 | Klasa reakcji na ogień: Eca dla wprowadzenia do stacji z obsługą wewnętrzną i budynków stacji 110 kV/SN; Fca dla rowu kablowego i obiektów z obsługą zewnętrzną; są to klasy minimalne. |
| ENK-05 | §4.2.2 tab. 3 | Typoszereg: NAYY-J 4×35 (żyła RE), NAYY-J 4×70 (SE), NAY2Y-J 4×150 (SE), NAY2Y-J 4×240 (SE). |
| ENK-06 | §4.3.1 | Mufy przelotowe i odgałęźne badane typem II; mufy termokurczliwe ze złączkami Al śrubowymi z łbem zrywalnym (klasa A lub A1), bez wystających części śruby; ścianka rury odtwarzającej izolację co najmniej 2,4 mm (35 mm²), 3,2 mm (70 mm²), 4,0 mm (150 i 240 mm²); rura odtwarzająca powłokę z klejem co najmniej 4,0 mm; zakaz zestawów składanych przez wykonawcę. |
| ENK-07 | §4.3.1 tab. 4 | Zakres mufy i minimalna długość: kabel 35 mm² — mufa 16–50 mm², 500 mm; 70 mm² — 35–150 mm², 700 mm; 150 mm² — 70–240 mm², 800 mm; 240 mm² — 95–300 mm², 800 mm. Mufy w wykopie lub zakrytych kanałach, w minimalnej liczbie; mufy odgałęźne zalewane żywicą przystosowane do PPN. |
| ENK-08 | §4.4.1 | Taśma uziemiająca, jeśli potrzebna, co najmniej 10 cm pod kablem. |
| ENK-09 | §4.4.2 | Oznaczniki kabla w ziemi na całej długości (25–50 × 75–90 mm, grubość co najmniej 1,0 mm): napięcie nominalne, typ i przekrój, rok budowy, nazwa operatora. |
| ENK-10 | §4.4.3 | Niebieska perforowana taśma ostrzegawcza co najmniej 300 × 0,5 mm, 30–35 cm nad kablem. |
| ENK-11 | §4.4.4 | Oznaczniki na końcach kabli opaskami co najmniej 4,0 mm wg standardu tablic i znaków; tablice opisowe na podejściach słupowych około 2,0 m nad ziemią na rurze osłonowej. |
| ENK-12 | §4.4.5 | Kilka linii w jednym wykopie z odległościami wg normy; taśma wystaje co najmniej 5 cm poza skrajne kable. |
| ENK-13 | §4.4.6 | Zapas kabla w kształcie litery S co najmniej 2,0 m przy słupie; zakaz zapasów kabla i żył w szafach, złączach i stacjach SN/nN. |
| ENK-14 | §4.4.7 | Kabel na słupie w czarnej rurze HDPE (750 N, SN8) 0,5 m w gruncie i 2,5 m nad gruntem, tolerancja ±0,1 m; ścianka wg tab. 5 (Ø75/4,5, Ø110/6,0, Ø160/8,0 mm); ramki co najwyżej co 1,0 m; izolacja żył od palczatki do zacisków linii lub rozłącznika chroniona czarną rurą termokurczliwą; ograniczniki przepięć na słupie wg standardu linii napowietrznych nN; końce kabli 35 i 70 mm² w szafach i złączach z palczatkami. |
| ENK-15 | §4.4.8 | Rury osłonowe w ziemi Ø75 mm lub Ø110 mm (Ø160 mm dopuszczalne dla 240 mm²). |
| ENK-16 | §5 | Uziemienia wg standardu układów uziomowych i standardu ochrony przed porażeniem (zob. `STANDARD_ENEA_OCHRONA_PORAZENIOWA_I_UZIEMIENIA_SN.md`). |
| ENK-17 | §6 | Wymagania szczegółowe produkcji i budowy kabla (żyły, izolacja, powłoki, średnice) — wymagania wyrobu dla zakupu. |
| ENK-18 | §7 | Wyroby fabrycznie nowe z certyfikatami akredytowanymi; gwarancja na roboty i elementy linii, w tym kabel, co najmniej 60 miesięcy od odbioru. |
| ENK-19 | §8 | Dokumentacja projektowa i powykonawcza — rozdział formalny. |
| ENK-20 | §9 | Badania odbiorcze: rezystancja izolacji, ciągłość żył, protokół rezystancji uziemień, protokół skuteczności ochrony przeciwporażeniowej (operator mierzy skuteczność ochrony po załączeniu linii). |
| ENK-21 | §10 | Rozwiązania inne — decyzją dyrektora właściwego rejonu dystrybucji. |
| ENK-22 | A-1 tab. 3.1 | Średnica, masa, siła ciągnięcia, promień gięcia: 4×35 — 27,0 mm, 1058 kg/km, 2,2 kN, 0,35 m; 4×70 — 32,0 mm, 1463 kg/km, 3,1 kN, 0,50 m; 4×150 — 43,8 mm, 2749 kg/km, 5,8 kN, 0,65 m; 4×240 — 53,7 mm, 4341 kg/km, 8,4 kN, 0,80 m. |
| ENK-23 | A-1 tab. 4.1 | Rezystancja żyły DC 20 °C / AC 70 °C / AC 90 °C: 35 mm² — 0,868 / 1,043 / 1,113 Ω/km; 70 mm² — 0,443 / 0,5323 / 0,5680; 150 mm² — 0,206 / 0,2475 / 0,2641; 240 mm² — 0,125 / 0,1502 / 0,1603. |
| ENK-24 | A-1 §4.2.3 | Próba napięciowa kabla co najmniej 4 kV AC przez 5 min; temperatura żyły 70 °C długotrwale i 160 °C przy zwarciu (tab. 4.3). |
| ENK-25 | A-1 tab. 4.2 | Obciążalność zwarciowa 1 s i długotrwała w ziemi / w powietrzu (PN-HD 603 S1 cz. 3G): 4×35 — 2,59 kA, 123 / 100 A; 4×70 — 5,18 kA, 179 / 152 A; 4×150 — 11,10 kA, 275 / 246 A; 4×240 — 17,76 kA, 364 / 338 A. Założenia: głębokość 0,7–1,1 m, grunt 20 °C, powietrze 25 °C, współczynnik obciążenia 0,7 w ziemi i 1,0 w powietrzu, rezystywność cieplna gruntu 1,0 K·m/W. |
| ENK-26 | A-1 tab. 4.5 | Jednosekundowa gęstość prądu zwarciowego żył Al PVC do 160 °C: od 99 A/mm² przy 20 °C do 76 A/mm² przy 70 °C przed zwarciem. |
| ENK-27 | A-1 §4.2.5 | Współczynnik 0,85 obciążalności dla kabla w rurach osłonowych. |
| ENK-28 | A-1 tab. 5.1 | NAYY-J 4×35 wyłącznie do przyłączy; NAY2Y-J 4×150 przekrój podstawowy rozwoju sieci; NAYY-J 4×70 i NAY2Y-J 4×240 opcjonalne, gdy wynika z obliczeń. |
| ENK-29 | A-1 §5.3 | Ochrona przeciwporażeniowa wg zasad PTPiREE i standardu ochrony przed porażeniem. |
| ENK-30 | A-1 §5.4.2–§5.4.3 | Głębokość ułożenia co najmniej 70 cm (co najmniej 100 cm pod gruntami ornymi); warstwy co najmniej 15 cm od siebie. |
| ENK-31 | A-1 tab. 5.10 | Przyłączenie kabla do linii napowietrznej: 4×35 — bezpośrednio zaciskiem; 4×70 i 4×150 — bezpośrednio, przez łącznik słupowy, zaciski nN albo szafę SK lub SKP (decyduje operator); 4×240 — przez łącznik słupowy, zaciski nN albo szafę SK lub SKP. Między linią a rozłącznikiem przewód izolowany o przekroju nie mniejszym niż przewód linii; łącznik słupowy nie jest obowiązkowy, gdy kabel idzie do złącza lub szafy przy słupie. |
| ENK-32 | A-1 §7, rys. 7.1–7.4 (s. 41–43, PDF 63–65) | Rezystancja uziemienia odgromowego słupów linii nN najwyżej 10 Ω; dobór ograniczników (SPD) wg chronionego urządzenia i warunków sieci. Odczyt rysunków: 7.1 — słup przelotowy linii gołej, SPD na każdym przewodzie L1, L2, L3 i przy PEN, żyły kabla w rurach termokurczliwych od palczatki do zacisków, połączenie uziemienia SPD; 7.2 — linia izolowana, cztery SPD z zaciskiem przebijającym w odstępach 0,3 / 0,2 / 0,2 / 0,2 m od słupa, osobne zaciski przebijające dla żył kabla, uziemienie PEN na trzonie; 7.3 — rozłącznik na słupie poniżej przewodów linii, kabel nN wprowadzony od dołu przez palczatkę do rozłącznika; 7.4 — kabel połączony z linią izolowaną przez zaciski przebijające, SPD na przewodach linii, zaciski kabla 0,5 m poniżej przewodów. |

## 3. Wymagania potwierdzone — linie napowietrzne nN

| Nr | Punkt | Wymaganie |
|----|-------|-----------|
| ENN-01 | §2 | Dla nowych linii nN podstawą jest linia kablowa; przy przebudowie i remoncie analizuje się możliwość skablowania. Standard stosuje się, gdy prace obejmują co najmniej całą sekcję odciągową; w pozostałych przypadkach dotychczasowe rozwiązania, ale słupy nie krótsze niż 10 m; nie dotyczy usuwania awarii. |
| ENN-02 | §4.1 | Rozwiązanie podstawowe: system pełnoizolowany, samonośny, czteroprzewodowy na żerdziach strunobetonowych wirowanych; rozwiązania PPN. |
| ENN-03 | §4.1 | Skrzyżowanie z linią 110 kV — skablowanie nN ze strefą co najmniej 15 m; z linią 15 kV — skablowanie nN ze strefą co najmniej 5 m (mierzone w poziomie od skrajnego przewodu). |
| ENN-04 | §4.1 | Przęsło najwyżej 50 m; sekcja odciągowa najwyżej 500 m; do czterech torów nN; do dwóch torów nN pod dwoma torami SN na wspólnym słupie (SN kablem uniwersalnym), tory nN poniżej torów SN, odległość pionowa od toru SN z kablem uniwersalnym co najmniej 0,6 m. |
| ENN-05 | §4.2 | Przewody samonośne Al z izolacją XLPE, nierozprzestrzeniające płomienia, odporne na UV: 70 mm² i 95 mm² dla linii głównej i odgałęzień, 25 mm² dla przyłączy; co najmniej 90 °C długotrwale i 250 °C przy zwarciu; bez łączenia w sekcji odciągowej. |
| ENN-06 | §4.3 | Słupy jednożerdziowe strunobetonowe wirowane co najmniej 12 m, siły 6, 15, 25 i 30 kN; inne konstrukcje za zgodą operatora; beton C40/50 (XC4, XF2, XA2), bez szwu; bez zacisków uziemiających; stal cynkowana ogniowo i oznaczona. |
| ENN-07 | §4.4 | Fundamenty jak dla SN (C30/37, otwór Ø55/80 cm, zasypywanie 20–30 cm, górny element 0,5 +0/−0,2 m pod gruntem); przy fundamencie terenowym kabel w rurze z kolanem Ø110 mm do 1 m; ustoje zorientowane wg wypadkowej siły (przelotowe — dwie płyty prostopadle do parcia wiatru; N, ON, O — wg wypadkowej naciągu; ROK, K, KK — wg naciągów); dokumentacja fotograficzna fundamentu ze współrzędnymi. |
| ENN-08 | §4.5 | Uziemienia wg standardu układów uziomowych. |
| ENN-09 | §4.6 | Ograniczniki beziskiernikowe co najmniej 5 kA 8/20 µs, Uc co najmniej 440 V, z odłącznikiem, w zaciskach izolowanych umożliwiających wymianę; osobny przewód H07V-K 25 mm² do PEN i uziemienia; rezystancja uziemienia najwyżej 10 Ω (najwyżej 15 Ω przy rezystywności gruntu co najmniej 1000 Ωm). |
| ENN-10 | §4.6 | Ograniczniki na krańcach linii, na końcu każdego odgałęzienia dłuższego niż 200 m, w linii co najwyżej co 500 m, w miejscach przyłączenia kabli i linii z przewodami gołymi (nie dotyczy przyłączy) oraz po obu stronach podziału sieci. |
| ENN-11 | §4.7 | Osprzęt: uchwyty odciągowe ze śrubami zrywalnymi, uchwyty przelotowe i narożne z rolkami, haki cynkowane, zaciski przebijające Al i Al–Cu ze śrubą zrywalną; przy trzech i więcej przyłączach zaciski podwójne, poczwórne albo skrzynka rozgałęźna; montaż od −15 °C, eksploatacja od −25 °C; trwałe oznakowanie osprzętu. |
| ENN-12 | §4.8 | Aparatura łączeniowa tylko w uzasadnionych przypadkach, za zgodą operatora, na słupach przy drogach publicznych (poza ogrodzeniami, terenami zalewowymi i trudnodostępnymi): rozłącznik bezpiecznikowy słupowy trójbiegunowy, prąd ciągły co najmniej 160 A, dla kabla 150 mm²; połączenie z linią wiązką przewodów samonośnych; montaż 3–3,5 m nad terenem poniżej przewodów; tabliczka z maksymalną wkładką dla danego punktu sieci. |
| ENN-13 | §4.9 | Tablice ostrzegawcze 2–3 m nad terenem, po jednej na żerdzi; tablice numeracyjne nad nimi, po jednej na słupie linii jednotorowej, osobno dla każdego toru linii wielotorowej; mocowanie taśmą nierdzewną. |
| ENN-14 | §5 | Wyroby fabrycznie nowe z certyfikatami; gwarancja co najmniej 60 miesięcy od odbioru, 96 miesięcy na ochronę antykorozyjną, przewody i słupy. |
| ENN-15 | §6 | Dokumentacja projektowa i powykonawcza — rozdział formalny. |
| ENN-16 | §7 | Rozwiązania inne — decyzją dyrektora właściwego rejonu dystrybucji. |

## 4. Decyzje i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

1. Domyślny przekrój nowego obwodu nN w kreatorze (np. 150 mm²) wynika z ENK-03/ENK-28; każda
   inna wartość domyślna jest decyzją produktu i nie może być opisywana jako wymaganie ENEA.
2. Sposób rysowania łącznika słupowego nN, szafy kablowej i ogranicznika przepięć na schemacie
   domeny nN — decyzja graficzna produktu (B-02).
3. Przeniesienie obciążalności z tab. 4.2 na inne warunki ułożenia (współczynniki
   korekcyjne inne niż 0,85 dla rur) — metoda IEC 60364-5-52 produktu, nie wymaganie ENEA.

## 5. Luki i niejednoznaczności

- **L-01.** §4.2.1.1 i tab. 3 wymieniają NAYY-J 4×70 bez zastrzeżeń, a A-1 tab. 5.1 przypis 3
  oznacza 70 mm² jako przekrój opcjonalny „gdy wynika z obliczeń”.
- **L-02.** §5 standardu linii kablowych nN powołuje dawny tytuł „Dobór środków ochrony przed
  porażeniem prądem elektrycznym w sieci SN”, zastąpiony od 01.10.2025 standardem „Ochrona przed
  porażeniem prądem elektrycznym w sieci SN” (05.2025).
- **L-03.** §4.9 standardu linii napowietrznych nN mówi o numeracji „linii napowietrznych SN”
  w rozdziale o liniach nN — omyłka redakcyjna.
- **L-04.** Standard linii napowietrznych nN nie podaje parametrów elektrycznych przewodów
  samonośnych (R, X, obciążalność) — produkt bierze je z kart producentów (`DATASHEET`) albo
  jako wartości robocze `ESTIMATED`.
- **L-05.** Kryterium skuteczności ochrony przeciwporażeniowej w sieci nN (Zs ≤ U0/Ia, czas 5 s,
  dwukrotność prądu wkładki) jest w standardzie sieci kablowej nN §6 i standardzie ochrony
  przed porażeniem §8.2, nie w standardach linii — zob. pliki powiązane.

## 6. Mapa wdrożenia (stan kodu 2026-11-13, `/home/user/MV-Design-PRO/mv-design-pro`)

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| ENK-02, ENK-03, ENK-05, ENK-28 (typy NAYY-J, NAY2Y-J) | `backend/src/network_model/catalog/mv_auxiliary_catalog.py:79-330` (rodzina YAKY 4×16…4×240, Tele-Fonika) | **Brak** typów ENEA NAYY-J i NAY2Y-J; katalog oferuje przekroje spoza typoszeregu ENEA (16, 25, 50, 95, 120, 185 mm²) bez rozróżnienia wariantu operatora. |
| ENK-23 (rezystancje) | `mv_auxiliary_catalog.py:136` (35: 0,868), `:186` (70: 0,443), `:261` (150: 0,206), `:311` (240: 0,125) | Zgodne z tab. 4.1 (DC 20 °C). |
| ENK-25 (obciążalność długotrwała) | `mv_auxiliary_catalog.py:138` (4×35: 135 A), `:188` (4×70: 180 A), `:263` (4×150: 275 A), `:313` (4×240: 360 A) | 4×150 zgodne; 4×70 i 4×240 w granicy ±1%; **4×35 sprzeczne** — 135 A wobec 123 A w ziemi wg tab. 4.2 (zawyżenie około 10%). |
| ENK-24, ENK-26 (temperatury, gęstość zwarciowa) | `mv_auxiliary_catalog.py:147-149` (70 °C, 160 °C, 76,09 A/mm²) | Zgodne z tab. 4.3 i 4.5 (76 A/mm² przy 70 °C). |
| ENN-05 (przewody samonośne nN) | brak w katalogu (`grep NFA2X/AsXSn` — 0 trafień w `backend/src`) | **Brak** typów przewodów samonośnych pełnoizolowanych 25/70/95 mm². |
| ENN-12, ENK-31 (rozłącznik bezpiecznikowy słupowy nN, łącznik słupowy) | brak pozycji katalogowej słupowego rozłącznika nN | **Brak.** |
| ENN-09, ENN-10 (ograniczniki nN i ich rozmieszczenie) | `backend/src/network_model/catalog/mv_surge_arrester_catalog.py` (katalog SN) | **Brak** ograniczników nN i reguł rozmieszczenia. |
| ENK-20, L-05 (skuteczność ochrony nN) | `backend/src/network_model/catalog/lv_disconnection_times_iec60364_4_41.py:99` (TN rozdzielczy 5 s) | Częściowe — czas 5 s zgodny; kryterium alternatywne „prąd wyłączający co najmniej dwukrotność prądu wkładki” nie jest zaimplementowane (zob. plik sieci kablowej nN). |
| ENN-04, ENK-30 (przęsło, sekcja, głębokość) | brak | Model nie niesie słupów ani głębokości ułożenia. |
