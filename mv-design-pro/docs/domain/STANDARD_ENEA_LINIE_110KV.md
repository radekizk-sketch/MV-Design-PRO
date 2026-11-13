# Standard ENEA — elektroenergetyczne linie napowietrzne i kablowe 110 kV — kontrakt wiążący produktu

Status: **BINDING** (dyrektywa właściciela 2026-11-12; karta ENEA-WIEDZA 2026-11-13, grupa C).
Źródło: ENEA Operator, „Elektroenergetyczne linie napowietrzne i kablowe 110 kV”, wersja 06.2026,
obowiązuje od 01.10.2026 (uchwała Zarządu nr 299/2026; zastępuje wersję 01.2024 z uchwały 112/2024),
49 stron (40 stron tekstu i 8 załączników — wzory protokołów), URL:
https://www.operator.enea.pl/media/5143/elektroenegetyczne-linie-napowietrzne-i-kablowe-110-kv-obowiazuje-od-01102026pdf.pdf ,
SHA-256 pliku zaczyna się od `8aacbe4a` i kończy na `670e` (pełny skrót w `STANDARDY_ENEA_INDEKS.md`).
PDF NIE jest w repozytorium (prawa ENEA). Dokument zawiera numery punktów, wartości i własne
sformułowania, nie cytaty.

Wersja zastąpiona 01.2024 (obowiązywała od 01.07.2024, 47 stron, SHA-256 `c3fae7b6`…`f98d`) — tylko
odnotowana. Porównanie kluczowych wartości technicznych (sekcja odciągowa 3 km, przewód 243-AL1/39-ST1A
i +80 °C, OPGW 48J, osprzęt 10 kA/1 s, kabel co najmniej 1000 mm² Cu i 960 A) nie wykazało zmian;
różnice dotyczą m.in. nowego §4.9 „Audit” (dawny §4.9 „Gwarancje” to §4.10) i zapisów
dokumentacyjnych. Wymagania poniżej pochodzą wyłącznie z wersji 06.2026.

## 1. Zakres stosowania w produkcie

Produkt modeluje linie 110 kV jako gałęzie z przewodami z katalogu `PRZEWOD_LINII_WN` (karta LINIA-110)
i liczy ich parametry (R, X, B, składowa zerowa z przewodem odgromowym). Miejsca łańcucha: katalog
przewodów i kabli 110 kV, solver parametrów linii napowietrznej, kompilator grafu ENM, ocena doboru
(obciążalność długotrwała i cieplna zwarciowa), walidator (wymagane minimum przekroju kabla),
wartości robocze (Zasada nr 4: przewód odgromowy zastępujący OPGW), raport (opis linii, uziemień,
głowic). Wymagania budowlane i odbiorowe (§4.3 część dotycząca zabezpieczeń antykorozyjnych, §4.4,
§6, §7) są spisane punktami bez przenoszenia do modelu.

## 2. Wymagania potwierdzone w tekście standardu

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| EL-01 | §1, §2 | Standard dotyczy linii napowietrznych i kablowych 110 kV 50 Hz nowych, przebudowywanych i remontowanych, jedno- i wielotorowych; parametry są minimalne. |
| EL-02 | §4 | Linie napowietrzne budowane według norm [17] z [18] (pozycje wykazu §3); sekcja odciągowa najwyżej 3 km; temperatura graniczna długotrwała przewodu fazowego +80 °C; przy największym zwisie normalnym zapas co najmniej 0,5 m ponad odległości normowe od ziemi i obiektów krzyżowanych. |
| EL-03 | §4 | W punktach charakterystycznych (początek i koniec linii, małe zapasy odległości, miejsca nasłonecznione lub osłonięte od wiatru, ważne skrzyżowania) dopuszczalny, w uzgodnieniu z ENEA, system monitorowania dynamicznej obciążalności powiązany z SCADA. |
| EL-04 | §4 | Przebudowa i remont: linie z norm [17], [18] — według nich; linie z norm [19], [20] — według nich, a gdy prace obejmują co najmniej całą sekcję odciągową — według [17], [18]; linie z innych norm — wymiana przewodów na inne (w tym HTLS), dowieszenie ADSS, wymiana lub zmiana słupów według normy [21] z wymaganiami wytrzymałości słupów (cała sekcja odciągowa z wymianą słupów — [17], [18]); prace bez zmiany sił (izolacja, przewody o tych samych parametrach, regulacja zwisów) według [21] bez wymagań wytrzymałości słupów. Nie dotyczy usuwania awarii. |
| EL-05 | §4 | Linie SN i 0,4 kV krzyżujące budowaną lub przebudowywaną linię 110 kV skablowuje się z zachowaniem co najmniej 15 m w poziomie od skrajnego przewodu 110 kV. |
| EL-06 | §4 | Skrzyżowanie z liniami NN, autostradami, drogami szybkiego ruchu i zelektryfikowaną koleją mieści się między słupami mocnymi linii 110 kV. |
| EL-07 | §4.1 | Podstawowy przewód fazowy: ACSR (AFL) 240 mm² części aluminiowej, aluminium A1 na rdzeniu stalowym, parametry nie gorsze niż 243-AL1/39-ST1A, temperatura graniczna +80 °C. |
| EL-08 | §4.1 | Większy przekrój dopuszczalny w uzgodnieniu z ENEA (bilansowanie mocy w dużych aglomeracjach, bezpieczeństwo, ciągłość dostaw). |
| EL-09 | §4.1 | HTLS dopuszczalny w uzgodnieniu z ENEA przy przebudowie na istniejących konstrukcjach: obciążalność nie mniejsza niż ACSR 240 mm², a straty mocy przy +80 °C nie większe niż dla ACSR 240 mm². |
| EL-10 | §4.1 | Długości przewodów na bębnach projektuje się tak, by nie było złączek śródprzęsłowych (wyjątek za zgodą ENEA); przewód musi jednak dopuszczać takie złączki przy awarii. |
| EL-11 | §4.2 | Podstawowy przewód odgromowy: OPGW 48J (48 włókien jednomodowych); siła zrywająca co najmniej 51 kN; prąd zwarciowy 1 s (35–180 °C) co najmniej 6,5 kA; temperatura przy zwarciu najwyżej 200 °C. |
| EL-12 | §4.2 | OPGW prowadzi się przez wszystkie stacje 110 kV/SN na trasie; wprowadzenie ze skrzynki zapasu (aluminium 1050A, 2 mm, malowanie proszkowe 95 ± 25 μm, w żadnym miejscu poniżej 60 μm) kablem ziemnym OTK 48J na przełącznicę 48 × simplex E2000/APC w szafie ODF. |
| EL-13 | §4.2 | Linie dwutorowe z dwoma linkami odgromowymi: OPGW w miejscach obu linek, wszystkie włókna obu torów wprowadzone do każdej stacji 110 kV/SN; dopuszczalne mufy rozgałęźne na odejściach do stacji. |
| EL-14 | §4.2 | Sekcja światłowodowa najwyżej 5 km (skracana przy skrzyżowaniach); mufy i zapasy 1,5 m pod dolnym poprzecznikiem; zakres budowy obejmuje wprowadzenie włókien do każdej stacji objętej zadaniem. |
| EL-15 | §4.3 | Konstrukcje wsporcze podstawowo kratowe stalowe cynkowane (stal nieuspokojona niedopuszczalna); w uzasadnionych przypadkach stalowe pełnościenne albo strunobetonowe wirowane (beton co najmniej C50/60, XC4, XF2, XA2); rozwiązania z albumów i katalogów. |
| EL-16 | §4.3 | Słupy kratowe: skręcane, zabezpieczenie przed odkręceniem do 5 m bez spawania, spoiny poziomu C, stopnie włazowe od 3 m, słupy dwutorowe z dwoma ciągami stopni, trwałe oznaczenia elementów. Słupy pełnościenne: segmenty bez kołnierzy, kotwy śrubowe, spoiny wzdłużne z pełnym przetopem poziomu B, drabina z szyną bezpieczeństwa od 3 m, pomost spoczynkowy powyżej 30 m, szczeble co 280 ± 5 mm, szerokość szczebla 150 mm; dopuszczalne poprzeczniki izolowane kompozytowe. |
| EL-17 | §4.3 | Stal konstrukcji: krzem poniżej 0,03% (Si + P ≤ 0,045%) albo 0,15–0,24% (Si + C < 0,5%); zakaz kategorii C i D z tabeli 1 normy [53]; świadectwo 3.1 i próbki stali. |
| EL-18 | §4.3 | Zabezpieczenie antykorozyjne podstawowe: cynkowanie ogniowe klasy trwałości VH (C4 — co najmniej 40 lat, C5 — co najmniej 30 lat); dopuszczalne nieocynkowanie do 0,2% powierzchni (pojedyncze miejsce do 2,5 cm² w kratowych, 10 cm² w pełnościennych), naprawa do co najmniej 100 μm; kryteria testu NSS według liczby konstrukcji. Dodatkowe: system malarski dwuwarstwowy 120–240 μm (warstwa co najmniej 60 μm, średnio 100 ± 30 μm), kolor zewnętrzny DB 601, przyczepność GT 0, AASS 720 h z korozją podpowłokową do 1 mm, QUV według progów połysku. |
| EL-19 | §4.4 | Fundamenty według właściwości gruntu; prefabrykaty z betonu co najmniej C35/45 (XC4, XD3, XF1, XA2) dla gruntu co najmniej małej nośności; podbudowa C8/10 co najmniej 10 cm; wyniesienie 20 cm nad grunt; na terenach zalewowych cokoły co najmniej 0,3 m ponad wodę stuletnią i izbice przy pochodzie lodu; zasypka warstwami do 30 cm; dokumentacja fotograficzna z współrzędnymi PL1992. |
| EL-20 | §4.5 | Izolatory długopniowe kompozytowe (ceramiczne dopuszczalne przy przebudowie w uzgodnieniu); łańcuchy ŁO2 w pierwszym i ostatnim przęśle; podwójne łańcuchy na słupach nadleśnych; poziomy: 110 kV, udarowe 550 kV, 50 Hz na mokro 230 kV; droga upływu według strefy zabrudzeniowej; osprzęt łukoochronny (przy prądzie zwarcia poniżej 10 kA dopuszczalne rożki i pierścienie na okuciu izolatora); raporty badań współpracy osprzętu łukoochronnego z izolatorem ważne 10 lat. |
| EL-21 | §4.5 | Izolator kompozytowy: SML co najmniej 120 kN; RTL 72 kN; 550 kV udarowe; 230 kV na mokro; okucie gniazdowe (widlaste dopuszczalne przy przebudowie); rdzeń epoksyd–szkło ECR; osłona z gumy silikonowej HTV niebieskiej albo szarej (gęstość powyżej 1,45 g/cm³, twardość Shore A powyżej 50, wytrzymałość co najmniej 4,5 MPa, wydłużenie powyżej 200%, rozdarcie powyżej 15 N/mm), grubość na rdzeniu co najmniej 3 mm; LSR dopuszczalny; wypływka na szwie do 1 mm; połączenia chemiczne bez klejenia; oznakowanie SML, producenta, serii, roku i typu. |
| EL-22 | §4.5 | Izolator ceramiczny: obciążenie probiercze 80 kN, wytrzymałość 100 kN, 550 kV, 230 kV na mokro, C130, okucia z żeliwa cynkowanego (co najmniej 85 μm), spoiwo metaliczne. |
| EL-23 | §4.6 | Każdy słup uziemiony według standardu ENEA „Budowa układów uziomowych w sieci dystrybucyjnej”; połączenie każdej nogi z uziemieniem od wewnątrz konstrukcji; rezystancja uziemienia ≤ 10 Ω, a przy rezystywności gruntu powyżej 1000 Ωm ≤ 15 Ω; ochrona przeciwporażeniowa tam, gdzie wymagana. |
| EL-24 | §4.7 | Osprzęt: cynkowanie zanurzeniowe średnio co najmniej 85 μm (610 g/m²), miejscowo co najmniej 75 μm; uchwyty nie deformują przewodu; wytrzymałość na prąd zwarciowy co najmniej 10 kA / 1 s; osprzęt oplotowy dla OPGW; oplot ochronny w uchwytach przelotowych; osprzęt łukoochronny; tworzywa odporne na UV; elementy przewodzące z żeliwa ciągliwego, aluminium albo jego stopu; tłumiki Stockbridge'a; osprzęt nie grzeje się bardziej niż przewód; oznakowanie wytwórcy i roku. |
| EL-25 | §4.8 | Każdy słup: dwie tablice ostrzegawcze (na kratowym — na nogach po przekątnej, 1,5–3 m nad terenem) i tablica identyfikacyjna (numer słupa w górnych 2/3 i identyfikator linii); co piąty słup oraz pierwszy i ostatni — dwie tablice numeracyjne do inspekcji lotniczej (na słupach nadleśnych każdy słup). |
| EL-26 | §4.8 | Słupy mocne — tablice fazowe L1, L2, L3 czarne na żółtym tle (przy przepleceniu faz po obu stronach); słupy wielotorowe — tablice torowe na dolnym poprzeczniku: cyfra rzymska czarna, tło tor I biały, II jasnoczerwony, III błękitny, IV jasnobrązowy, jednolite na całej linii; oznakowanie przeszkodowe przy lotniskach (pasy biało-czerwone, skrajne czerwone; lampy z zasilaniem słonecznym i wiatrowym na 240 h, test i SMS); oznakowanie ornitologiczne (spirale albo makiety, nie na przewodach); tabliczki aluminiowe chromowane nitowane. |
| EL-27 | §5 | Linie kablowe 110 kV budowane według norm [13], [14], [54]–[57]. |
| EL-28 | §5.1 | Przekrój kabla według obciążenia i warunków zwarciowych, lecz co najmniej 1000 mm² dla miedzianej żyły roboczej wielodrutowej i 95 mm² dla żyły powrotnej; temperatura długotrwała 90 °C; obciążalność systemu kablowego co najmniej 960 A; rozważa się przeplot żył powrotnych (crossbonding). Przy przebudowie odcinka kablowego bez zwiększania przepustowości całej linii dopuszczalny przekrój kabla istniejącego. |
| EL-29 | §5.2 | Kabel jednożyłowy suchy, podstawowo N2XS(FL)2Y: żyła robocza i powrotna miedziane, izolacja XLPE, uszczelnienie wzdłużne i promieniowe żyły roboczej niezależne od uszczelnienia powłoki; moduł światłowodowy w obszarze żyły powrotnej (2 tuby po 4 włókna: 2 jednomodowe i 2 wielomodowe) do pomiaru DTS. Napięcia: fazowe 64 kV, międzyfazowe 110 kV, najwyższe 123 kV, udarowe 550 kV; temperatura żyły 90 °C w pracy normalnej i 250 °C przy zwarciu; wyładowania niezupełne w próbie typu do 5 pC; w budynku stacji klasa reakcji na ogień co najmniej Eca; nad trasą kabel światłowodowy OTK. |
| EL-30 | §5.3 | Badania fabryczne każdego odcinka (liczba drutów, średnica żyły, grubości ekranów, izolacji i powłoki, wydłużenie trwałe, szczelność powłoki, rezystancja żyły, przekrój żyły powrotnej, wyładowania niezupełne, próba napięciowa, pojemność dla co najmniej dwóch odcinków przy zamówieniu powyżej 10); końce zabezpieczone przed wilgocią na 12 miesięcy. |
| EL-31 | §5.4 | Kable i głowice chronione ogranicznikami przepięć według standardu „Napowietrzna aparatura WN” (`STANDARD_ENEA_APARATURA_WN.md` EWN-21, EWN-22); liczniki zadziałań na słupach 5,0 m nad gruntem (dopuszczalny zdalny odczyt). Głowice napowietrzne 64/110 kV prefabrykowane, jednofazowe, samonośne, z izolatorem kompozytowym (silikon HTV albo LSR), suche albo zalewane, ze stożkiem sterującym LSR, z możliwością czasowego odłączenia żyły powrotnej; do GIS i transformatorów — głowice wtykowe suche 64/110 kV; mufy 64/110 kV prefabrykowane jednoczęściowe, z separacją żyły powrotnej (crossbonding) albo przelotowe; skrzynki połączeniowe ze stali nierdzewnej albo poliestru, IP68 w ziemi, z ogranicznikami dobranymi do napięć indukowanych. |
| EL-32 | §5.5 | Dokumentacja systemu kablowego: obciążalność w różnych warunkach, opis budowy, osprzęt przebadany z kablem, narzędzia, części zamienne, oświadczenie producenta, że system w linii napowietrzno-kablowej pozwala na pracę SPZ, raport odporności powłoki na UV; dokumenty po polsku. |
| EL-33 | §5.6 | Oznaczniki na kablu co 10 m i w miejscach charakterystycznych (napięcie, identyfikator linii, typ i przekrój, rok budowy, faza L1/L2/L3, nazwa operatora); słupki oznaczeniowe trasy z symbolem K co 100 m i przy zmianach kierunku, krzyżowaniach i zbliżeniach (materiał V-0, odporny na UV, co najmniej 30 lat). |
| EL-34 | §5.7 | Głębokość nominalna 1,2 m do górnej powierzchni żyły; układ trójkątny na styk wierzchołkiem do góry, opaski co najmniej co 2 m; podsypka z betonitu (piasek:cement 14:1) co najmniej 20 cm z każdej strony; płyty ochronne 25–35 cm nad kablem (betonowe co najmniej 40 cm × 5 cm albo z tworzywa co najmniej 50 cm × 2 cm); czerwona perforowana taśma ostrzegawcza „UWAGA KABEL WN” (co najmniej 0,5 mm, wystająca co najmniej 50 mm, napisy co najwyżej co 300 mm, litery 49–50 mm); układanie przy dodatniej temperaturze. |
| EL-35 | §5.8 | Kabel światłowodowy OTK 48J (G.652.D albo G.657.A1/A2) w rurociągu HDPE Ø 40 mm (ścianka co najmniej 3,7 mm), co najmniej dwa ciągi, 0,7 m nad kablem 110 kV w tym samym wykopie; zakaz układania bez rurociągu; studnie SK-1 i SK-2 (przy zmianie kierunku powyżej 60° przy promieniu poniżej 6 m), zapas 30 m; pomarańczowa taśma „Uwaga! Kabel światłowodowy”; spadek 0,1–0,3%; zakaz łączenia włókien o różnych parametrach. |
| EL-36 | §5.9 | Przejście kabel–linia napowietrzna na słupie mocnym z kompletem głowic i ograniczników, mufami i zapasami światłowodu; osłony kabli do 3 m; uchwyty niemagnetyczne; teren 2 m wokół słupa nieutwardzony i ogrodzony barierą 1 m; odcinki kablowe w linii i jako wprowadzenia do stacji dopuszczalne; w projekcie linii napowietrzno-kablowej wskazuje się sposób pracy SPZ. |
| EL-37 | §6 | Bęben kablowy o średnicy wewnętrznej co najmniej 20-krotności średnicy zewnętrznej kabla; ochrona kabli przed UV; zakres temperatur światłowodów: składowanie −40…+50 °C, instalowanie −10…+40 °C, eksploatacja −40…+80 °C, tuba optyczna przy zwarciu co najmniej 200 °C; test OTDR przed montażem. |

Rozdziały formalne (tylko spis): §3 — wykaz przepisów i norm (pozycje [1]–[104]); §4.9 — prawo ENEA
do auditu drugiej strony u producenta; §4.10 — gwarancje i certyfikaty linii napowietrznej (wyroby
nowe, certyfikaty jednostek akredytowanych, deklaracje zgodności, gwarancja 96 miesięcy na konstrukcje,
fundamenty, przewody i zabezpieczenie antykorozyjne, 60 miesięcy na pozostałe); §5.10 — gwarancje
linii kablowej (96 miesięcy); §7.1 — zawartość dokumentacji projektowej (mapy, formaty plików,
profile, obliczenia); §7.2 — zawartość dokumentacji powykonawczej; §8 — rozwiązania inne niż standard
na wniosek, decyzja Dyrektora Departamentu Planowania i Rozwoju w konsultacji z Dyrektorem
Departamentu Zarządzania Majątkiem Sieciowym; §9 — załączniki 1–8: wzory protokołów (fundament
prefabrykowany, fundament palowy lub studniowy, montaż i pomiar rezystancji uziemienia, skuteczność
ochrony przeciwporażeniowej, słup kratowy, słup pełnościenny, łańcuchy izolatorów, pomiar zwisu).

## 3. Decyzje graficzne i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

Kolory tablic torowych i fazowych (EL-26) dotyczą tablic na słupach. Kolor i styl linii 110 kV na
schemacie produktu są standardem wizualnym produktu (dyspozycja B-02). Wybór przewodu odgromowego
zastępującego OPGW w obliczeniach składowej zerowej jest założeniem inżynierskim produktu (Zasada
nr 4), nie wymaganiem ENEA.

## 4. Luki i niejednoznaczności

| Nr | Miejsce | Opis |
|----|---------|------|
| LL-01 | §4.2 | Standard podaje dla OPGW 48J tylko dane mechaniczne i cieplne (51 kN, 6,5 kA / 1 s, 200 °C), bez rezystancji i budowy — nie wystarcza do obliczenia impedancji składowej zerowej; produkt używa wartości roboczej. |
| LL-02 | §5.1 | Obciążalność 960 A dotyczy „systemu kablowego”, bez podania warunków ułożenia (rezystywność gruntu, temperatura, sposób łączenia żył powrotnych); weryfikacja wymaga warunków z projektu. |
| LL-03 | §4.6 | Rezystancja „≤ 10 Ω” i „≤ 15 Ω” przy ρ > 1000 Ωm — standard nie podaje, czy dotyczy wartości przy rozłączonym przewodzie odgromowym. |
| LL-04 | §5.9 | Odsyłacz do „pkt 5.5” przy głowicach napowietrznych — opis głowic jest w §5.4 (omyłka odsyłacza); §5.9 wymaga głowic wypełnionych cieczą syntetyczną, a §5.4 dopuszcza głowice suche albo zalewane — w przejściu kabel–linia obowiązuje §5.9 (przepis szczegółowy). |
| LL-05 | §2 a zakres produktu | Standard nie określa parametrów przewodów o większym przekroju ani HTLS (tylko warunki dopuszczenia) — katalog produktu ma tylko przewód podstawowy. |

## 5. Mapa wdrożenia — miejsca w kodzie (stan `main` 2026-11-13, odczyt bez edycji)

Ścieżki względem `mv-design-pro/backend/src/`.

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| EL-07 | `network_model/catalog/hv_overhead_conductor_catalog.py:3`–`:8`, `:63`–`:71`, `:151`–`:152` | Zgodne: przewód 243-AL1/39-ST1A, +80 °C, z odwołaniem do wersji 06.2026 i SHA-256. |
| EL-11, LL-01 | `network_model/catalog/hv_overhead_conductor_catalog.py:39`–`:44`; `network_model/catalog/wartosci_robocze.py:892` | Zgodne z Zasadą nr 4: brak rekordu OPGW, przewód zastępczy jako wartość robocza. |
| EL-23 | `network_model/solvers/parametry_linii_napowietrznej.py:39`, `:808`; `application/proof_engine/registries/ohl_equations.py:152` | Zgodne: założenie uziemienia każdego słupa z podstawą §4.6. Próg rezystancji 10 Ω / 15 Ω nie jest nigdzie oceniany — do wpięcia w raporcie, jeśli model będzie niósł rezystancję uziemień słupów. |
| EL-28, EL-29 | `network_model/catalog/types.py:119` (jedyna przestrzeń 110 kV to `PRZEWOD_LINII_WN`); `enm/kompilator_grafu.py:89` | Brak: produkt nie ma katalogu kabli 110 kV (N2XS(FL)2Y, co najmniej 1000 mm² Cu, 960 A); odcinek kablowy linii 110 kV nie da się zbudować z katalogu. |
| EL-24 (10 kA / 1 s) | `application/analyses/wytrzymalosc_cieplna_przewodow.py` | Do wpięcia: osprzęt linii 110 kV ma wytrzymałość 10 kA / 1 s — kryterium dla prądu zwarciowego linii obok wytrzymałości przewodu. |
| EL-36 | `application/protection_settings/engine.py:98` | Do wpięcia: linia napowietrzno-kablowa 110 kV wymaga jawnego trybu SPZ w projekcie (produkt dziś nie dobiera nastaw 110 kV — informacja w raporcie). |
