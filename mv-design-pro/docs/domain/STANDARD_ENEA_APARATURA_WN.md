# Standard ENEA — napowietrzna aparatura WN prądu przemiennego — kontrakt wiążący produktu

Status: **BINDING** (dyrektywa właściciela 2026-11-12; karta ENEA-WIEDZA 2026-11-13, grupa C).
Źródło: ENEA Operator, „Napowietrzna aparatura WN prądu przemiennego”, wersja 09.2022–2, obowiązuje
od 02.04.2024 (uchwała Zarządu nr 364/2022 ze zmianą nr 7/2024), 22 strony, URL:
https://www.operator.enea.pl/media/679/napowietrzna-aparatura-wn-pradu-przemiennego-obowiazuje-od-02042024pdf.pdf ,
SHA-256 pliku zaczyna się od `6f9f19cd` i kończy na `fa34` (pełny skrót w `STANDARDY_ENEA_INDEKS.md`).
PDF NIE jest w repozytorium (prawa ENEA). Dokument zawiera numery punktów, wartości i własne
sformułowania, nie cytaty.

## 1. Zakres stosowania w produkcie

Standard określa minimalne parametry aparatów napowietrznych 110 kV (123 kV) i uziemników punktu
neutralnego (72,5 kV). Produkt nie modeluje pól ani aparatury 110 kV (decyzja właściciela 2026-11-12,
`STANDARD_ENEA_GPZ_Z1.md` §2): strona 110 kV jest równoważnikiem obliczeniowym. Wartości tego
standardu służą produktowi do: opisu warunków zasilania 110 kV w raporcie (prąd wyłączalny 40 kA jako
górna granica sensownego równoważnika — `STANDARD_ENEA_GPZ_Z1.md` E-55), opisu przekładników pola
transformatora 110 kV w szablonie GPZ (informacja, nie obiekt modelu), parametrów ograniczników
przepięć głowic kablowych linii 110 kV (`STANDARD_ENEA_LINIE_110KV.md` EL-31) i ewentualnego katalogu
aparatury WN, gdyby decyzja właściciela o zakresie modelu się zmieniła (wtedy nowa wersja tego
dokumentu jest punktem wejścia).

## 2. Wymagania potwierdzone w tekście standardu

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| EWN-01 | §4 | Warunki pracy nie gorsze niż: temperatura od −30 °C do +40 °C (średnia dobowa +35 °C), wysokość do 1000 m n.p.m., lód 10 mm, parcie wiatru 700 Pa (34 m/s), nasłonecznienie 1000 W/m², poziom izokerauniczny 27 dni/rok, zanieczyszczenie według IEC 815, wilgotność do 95%, ciśnienie 920–1020 hPa. |
| EWN-02 | §5 | Wymagania standardu ostrzejsze od norm mają pierwszeństwo; praca ciągła w warunkach miejsca; ochrona antykorozyjna na czas eksploatacji, co najmniej 25 lat; dokumentacja i tabliczki po polsku, tabliczki nitowane, czytelne z ziemi, z kompletem danych wymaganych normą. |
| EWN-03 | §6.1.1 | Wyłącznik WN: budowa modułowa „live tank”, jedna komora na biegun, SF6 z komorami termoekspansyjnymi, filtr pochłaniający, czujnik gęstości gazu z kompensacją temperatury co najmniej dwustopniowy (stopień 1 — sygnalizacja, stopień 2 — blokada zamykania i otwierania z sygnałem zdalnym), bez przeglądów wewnętrznych co najmniej 25 lat albo do granicy cykli lub prądów skumulowanych z DTR. |
| EWN-04 | §6.1.3 | Przeskok przy przepięciach nie może następować w izolacji wewnętrznej; izolatory porcelanowe C130 brązowe, dopuszczalne kompozytowe. |
| EWN-05 | §6.1.4 | Szafka napędu: dostęp z ziemi, IP 54, blokada drzwi w pozycji otwartej, oświetlenie, miedziana szyna uziemiająca, listwy rozłączalne z 20% rezerwy i odstępem 150 mm, przewody miedziane 750 V trudnopalne, ogrzewanie z termostatem; napęd wspólny dla trzech biegunów zasobnikowo-sprężynowy zbrojony silnikiem; licznik zadziałań; blokady przy niedostatecznej energii napędu (wyzwalania, zamykania, ponownego zamykania, rozruchu silnika); przełącznik LOKALNE/ZDALNE; przyciski ZAŁĄCZ (zielony) i WYŁĄCZ (czerwony); blokada przeciw pompowaniu; wskaźnik położenia: załączony czerwony „I”, wyłączony zielony „O”. |
| EWN-06 | §6.2 | Wyłącznik WN — minimalne parametry: 123 kV; wytrzymywane o częstotliwości sieciowej 230 kV; udarowe 1,2/50 µs 550 kV; 50 Hz; prąd ciągły 3150 A; prąd wyłączalny zwarciowy 40 kA; prąd załączalny 100 kA; szereg O–0,3 s–CO–3 min–CO; czas trwania zwarcia 1 s; czas wyłączania najwyżej 50 ms; niejednoczesność otwierania i zamykania najwyżej 3 ms; SF6, ubytek najwyżej 0,5%/rok; droga upływu 25 mm/kV; klasy M2 i E1; złącze napełniania DILO DN8; 3 bieguny; sterowanie i silnik 220 V DC; 2 cewki wyłączające, 1 załączająca; ogrzewanie 230 V AC; co najmniej 9 styków zwiernych i 9 rozwiernych; licznik przestawień; układ rezerwowania napięcia sterowniczego; zaciski na 4 mm²; zdalna sygnalizacja rozbrojenia napędu. |
| EWN-07 | §6.3 | Do każdego wyłącznika: rozwinięty schemat obwodów wtórnych w kieszeni drzwi szafki (laminowany), rysunek wymiarowy z obciążeniami fundamentu, rysunek napędu i szafki, schemat elektryczny napędu. |
| EWN-08 | §7.1 | Odłącznik WN 123 kV: jednoprzerwowy, dwukolumnowy, poziomo-obrotowy, symetryczny, trójbiegunowy, z uziemnikami albo bez; napędy noży głównych i uziemników silnikowe trójbiegunowe, uziemnik z osobnym napędem; izolatory C130 brązowe; bez przeglądów co najmniej 15 lat; samoblokowanie w obu położeniach; wytrzymałość zwarciowa 1 s; awaryjny napęd ręczny (dźwignia 1200–1500 mm nad terenem, odejmowalna, kierunki opisane); zabezpieczenie silnika od przeciążenia i pracy niepełnofazowej; sterowanie stycznikami; łącznik lokalne/zdalne; blokady ruchowe elektryczne, na czas konserwacji mechaniczne i elektryczne; szafka napędu uziemnika w całości żółta. |
| EWN-09 | §7.2 | Odłącznik WN — minimalne parametry: napowietrzny, poziomo-obrotowy, ustawienie równoległe (wyjątkowo szeregowe); 3 bieguny; bez noża uziemiającego albo z jednym na biegun; 123 kV; 50 Hz; prąd ciągły 1600 A (wartość ostateczną ustala ENEA indywidualnie); prąd 1-sekundowy 50 kA; prąd szczytowy 125 kA; czas zwarcia 1 s; izolacja: udarowe 550 kV, sieciowe 1 min 230 kV, przez otwartą przerwę 630 kV i 265 kV; zdolność przenoszenia obciążenia 1280 A przy 100 V; droga upływu 25 mm/kV; obciążenie wzdłużne zacisków 1000 N; zaciski płaskie ze stopu aluminium; trwałość mechaniczna 2000 cykli; zakłócenia radioelektryczne do 2500 μV przy 110% napięcia; napędy osobne dla noży głównych i uziemiających, silnik 230/400 V AC, styczniki 220 V DC, po co najmniej 8 styków NO i NC, po jednym styku zwłocznym i bezzwłocznym dla zabezpieczenia szyn, IP 54; rozstaw biegunów co najmniej 1,9 m; wysokość konstrukcji wsporczej 2,5 m. |
| EWN-10 | §7.3 | Części pod napięciem w kolorze czerwonym, noże uziemiające i szafki napędów uziemników żółte; dokumentacja jak EWN-07. |
| EWN-11 | §8.1, §8.2 | Uziemnik jednobiegunowy 72,5 kV (punkt neutralny transformatora): napowietrzny, 1 biegun, 72,5 kV, 50 Hz, prąd 1-sekundowy 40 kA, szczytowy 100 kA, czas zwarcia 1 s; izolacja udarowa 325 kV, sieciowa 1 min 140 kV; droga upływu 25 mm/kV; obciążenie zacisków 0,5 kN; trwałość 2000 cykli; napęd ręczny, po co najmniej 8 styków NO i NC; IP 54; konstrukcja wsporcza około 2,5 m; samoblokowanie, dźwignia ręczna jak w odłączniku. |
| EWN-12 | §9.1 | Wyłącznik izolacyjny WN: „live tank”, z uziemnikiem, osobne napędy silnikowe trójbiegunowe wyłącznika i uziemnika (uziemnik jak EWN-11 w zakresie uziemnika), SF6 z dwustopniową kontrolą gęstości jak EWN-03; zdolność łączeniowa według norm wyłączników i wyłączników izolacyjnych; szafka jak EWN-05. |
| EWN-13 | §9.2 | Wyłącznik izolacyjny — minimalne parametry jak wyłącznik WN (EWN-06): 123 kV, 230/550 kV, 3150 A, 40 kA, 100 kA, 1 s, najwyżej 50 ms, najwyżej 3 ms, SF6 najwyżej 0,5%/rok, 25 mm/kV, M2, E1, 220 V DC, 2 cewki wyłączające i 1 załączająca, co najmniej 9 + 9 styków pomocniczych. |
| EWN-14 | §10.1 | Przekładniki WN: zaciski wtórne sprężynowe na przewody do 10 mm² (prądowe) i 6 mm² (napięciowe); wyprowadzone ekrany i zacisk N uzwojenia pierwotnego; skrzynka zacisków IP 54 z plombowanymi zaciskami pomiarowymi; konstrukcja przeciwwybuchowa z zaworem albo mieszkiem; hermetyczne, olejowe bez PCB, wskaźnik oleju czytelny z ziemi; dwa zaciski uziemiające ramy; śruby nierdzewne, połączenia pierwotne elastyczne; przekładniki napięciowe indukcyjne; znamionowe prądy krótkotrwałe gwarantowane na każdym odczepie; uzwojenia pomiarowe wzorcowane (GUM albo laboratorium PCA) lub legalizowane. |
| EWN-15 | §10.3.1 | Przekładnik prądowo-napięciowy: jednofazowy, napowietrzny, wolnostojący, olejowy, izolator porcelanowy C130 (dopuszczalny kompozytowy), osobna konstrukcja dla każdej fazy, uzwojenia wtórne miedziane z ochroną przed przepięciem powyżej 3,5 kV przy rozwarciu. |
| EWN-16 | §10.3.2 | Przekładnik prądowo-napięciowy — parametry wspólne: napięcie znamionowe 110/√3 kV, najwyższe 123 kV, 50 Hz; udar pełny 550 kV, ucięty 630 kV; 230 kV przez 1 min na sucho i 10 s pod deszczem; uzwojenia wtórne 3 kV; izolacja międzyzwojowa 4,5 kV; prąd cieplny krótkotrwały 40 kA, szczytowy 100 kA; droga upływu 25 mm/kV; wyładowania niezupełne do 10 pC przy 1,1·Um/√3; zakłócenia radioelektryczne do 2500 μV; olej elektroizolacyjny; zacisk płaski. |
| EWN-17 | §10.3.2.1 | Pole liniowe i łącznika szyn 110 kV: przekładnia pierwotna 800 A, wtórny 1 A albo 5 A; pięć rdzeni — I kl. 0,2S FS5, II kl. 0,2 FS5, III–V kl. 5P20; cztery uzwojenia napięciowe 100/√3 V — I kl. 0,2, II kl. 0,5, III kl. 0,5/3P (gwiazda), IV kl. 3P (otwarty trójkąt). |
| EWN-18 | §10.3.2.2 | Pole transformatorowe 110 kV: przekładnia pierwotna 150-300 A, wtórny 1 A albo 5 A; cztery rdzenie — I kl. 0,2 FS5, II–IV kl. 5P20; dwa uzwojenia napięciowe 100/√3 V — I kl. 0,5 (gwiazda), II kl. 0,5/3P (gwiazda). |
| EWN-19 | §10.3.2.3 | Pole liniowe 110 kV z pomiarem rozliczeniowym: przekładnia 800 A albo przełączalna 150-300_800 A albo 75-150-300_800 A, wtórny 1 A albo 5 A; sześć rdzeni — I i II kl. 0,2S FS5, III kl. 0,2 FS5, IV–VI kl. 5P20; pięć uzwojeń napięciowych 100/√3 V — I i II kl. 0,2, III kl. 0,5, IV kl. 0,5/3P (gwiazda), V kl. 3P (otwarty trójkąt). |
| EWN-20 | §10.4, §10.5 | Przekładniki napięciowe i prądowe WN wolnostojące: jednofazowe, napowietrzne, indukcyjne (napięciowe), olejowe hermetyczne, osobna konstrukcja na fazę, uzwojenia miedziane z ochroną przed przepięciem; parametry jak w §10.3. |
| EWN-21 | §11.1 | Ograniczniki przepięć WN: jednofazowe, wolnostojące, napowietrzne, beziskiernikowe z tlenków metali, obudowa kompozytowa, licznik zadziałań i wskaźnik prądu upływu w każdej fazie, możliwość badania bez wyłączania; zaciski sworzniowe Ø 30 albo płaskie; zacisk uziomowy podstawy; bez konserwacji co najmniej 25 lat. |
| EWN-22 | §11.2.1 | Ogranicznik poziomu 110 kV: Um 123 kV; Ur ≥ 96 kV; Uc ≥ 77 kV; TOV 1 s 110 kV, 10 s 105 kV; graniczny prąd wyładowczy 100 kA; In (8/20 µs) 10 kA; Upl ≤ 346 kV; wytrzymałość zwarciowa powyżej 40 kA (w pkt n) 50 kA); energia powyżej 2 kJ/kV; prąd klasyfikacji 10 kA; udar 4/10 µs 100 kA; udar długotrwały 2000 µs 550 A; klasa rozładowania linii 2; obciążenie statyczne 1000 Nm, dynamiczne 1600 Nm; 50 Hz. |
| EWN-23 | §11.2.2 | Ogranicznik punktu neutralnego transformatora w sieci 110 kV (poziom 60): Us 52 kV; Uc ≥ 48 kV; Ur ≥ 60 kV; graniczny prąd 100 kA; In 10 kA; Upl ≤ 250 kV; wytrzymałość zwarciowa ≥ 40 kA; energia powyżej 2 kJ/kV; 1000 Nm / 1600 Nm; 50 Hz. |
| EWN-24 | §12.1, §12.2 | Dławik kompensacyjny WN: jednofazowy, wolnostojący, suchy, bezrdzeniowy, napowietrzny, bez regulacji; 123 kV; prąd ciągły 10 A; 50 Hz; moc akustyczna do 60 dB; izolatory C130. |
| EWN-25 | §12.3 | Dławik: uzwojenia cylindryczne z izolowanych przewodów aluminiowych, chłodzenie naturalne, impregnacja epoksydowa; wytrzymałość na siły zwarciowe w sieci 110 kV z uwzględnieniem SPZ 1- i 3-fazowego, wiatru, lodu i temperatury; hałas do 60 dB w odległości 2 m; szybka wymiana; teren stanowiska około 30 m² bez innej aparatury; wytrzymałość zwarciowa według PN-EN 60076-5, dielektryczna według PN-EN 60076-3; moc dławika z analiz systemowych. |

Rozdziały formalne (tylko spis): §1 — wprowadzenie; §2 — zakres: nowa i modernizowana aparatura
napowietrzna 110 kV ENEA; §3 — wykaz norm; §8.3, §10.2, §11.3 — dokumentacja dostawcy i okresowość
badań w instrukcji eksploatacji; §13 — gwarancje; §14 — rozwiązania inne niż standard wymagają
indywidualnej decyzji Dyrektora Departamentu Zarządzania Majątkiem Sieciowym na wniosek.

## 3. Decyzje graficzne i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

Kolory aparatów z EWN-04, EWN-05 i EWN-10 (brązowe izolatory, czerwone części pod napięciem, żółte
uziemniki, zielony/czerwony wskaźnik położenia) dotyczą fizycznych urządzeń. Kolory symboli na
schemacie produktu są standardem wizualnym produktu (dyspozycja B-02) i nie mogą być opisywane jako
wymaganie tego standardu.

## 4. Luki i niejednoznaczności

| Nr | Miejsce | Opis |
|----|---------|------|
| LWN-01 | §11.2.1 pkt i) a pkt n) | Wytrzymałość zwarciowa ogranicznika podana dwukrotnie: „powyżej 40 kA” i „50 kA”; przyjmuje się wartość ostrzejszą 50 kA (interpretacja). |
| LWN-02 | §7.2 a Zeszyt 1 §9.1 | Odłącznik: prąd 1-sekundowy 50 kA, a Zeszyt 1 wymaga co najmniej 40 kA — oba spełnione przy 50 kA; różnica wynika z zapasu standardu aparatury. |
| LWN-03 | §6.2, §7.2 a Zeszyt 1 §10.1 tab. 5 | Poziom izolacji aparatów 230/550 kV, a tabela 5 Zeszytu 1 podaje dla instalacji 110 kV 185/450 kV (`STANDARD_ENEA_GPZ_Z1.md` L-03). |
| LWN-04 | §10.3.2.2 a Zeszyt 2 Z.9 | Klasa rdzenia I przekładnika pola transformatora: standard „0,2 FS5”, rysunek Zeszytu 2 „1–2,5 VA kl. 0,2 FS5” — zgodne; moce rdzeni (VA) podaje tylko rysunek. |
| LWN-05 | §12 | Przeznaczenie dławika kompensacyjnego 110 kV (10 A, 123 kV) nie jest opisane w standardzie; sens (np. kompensacja w punkcie neutralnym albo dławik do automatyki) wymaga potwierdzenia u ENEA. |
| LWN-06 | §10.3.2 pkt a) | Napięcie znamionowe zapisane w tekście „110:3 kV”, a wtórne „100:3 V” — pierwiastek utracony w warstwie tekstowej; z kontekstu oznacza 110/√3 kV i 100/√3 V. |

## 5. Mapa wdrożenia — miejsca w kodzie (stan `main` 2026-11-13, odczyt bez edycji)

Ścieżki względem `mv-design-pro/backend/src/`.

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| EWN-06, EWN-13 (40 kA) | `enm/domain_operations.py:3954`–`:3967` (zasilanie od strony `HV_110`) | Do wpięcia jako informacja: równoważnik 110 kV, którego prąd zwarciowy przekracza 40 kA, przekracza zdolność wyłączania aparatury ENEA (ostrzeżenie opisowe, nie blokada). |
| EWN-17, EWN-18, EWN-19 | brak miejsca (produkt nie modeluje przekładników 110 kV) | Poza zakresem modelu z decyzji właściciela 2026-11-12; opis w raporcie GPZ możliwy bez obiektu modelu. |
| EWN-22, EWN-23 | `network_model/catalog/bay_templates.py:496` (ogranicznik w polu SN) | Nie dotyczy pól SN — parametry 110 kV nie mogą zasilać ograniczników SN. Ograniczniki głowic linii kablowej 110 kV — patrz `STANDARD_ENEA_LINIE_110KV.md` EL-31. |
