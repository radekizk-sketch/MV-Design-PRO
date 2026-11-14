# Standard ENEA — ochrona przed porażeniem w sieci SN i budowa układów uziomowych — kontrakt wiedzy produktu

Status: **BINDING** (Zasada nr 5 `CLAUDE.md`). Plik obejmuje parę dokumentów, które wzajemnie się
powołują (2716 odsyła do załączników 2 i 3 dokumentu 2713 jako „części 1”).

Źródła:

- **[2713]** ENEA Operator, „Standard w sieci dystrybucyjnej — Ochrona przed porażeniem prądem
  elektrycznym w sieci SN”, wersja 05.2025, uchwała Zarządu nr 311/2025, obowiązuje od
  01.10.2025, zastępuje wersję 05.2023 („Dobór środków ochrony przed porażeniem…”). Adres:
  `https://www.operator.enea.pl/media/2713/ochrona-przed-porazeniem-pradem-elektrycznym-w-sieci-sn-obowiazuje-od-01102025pdf.pdf`.
  22 strony, SHA-256 zaczyna się od `45887d39` i kończy na `8aa405`. Prefiks **EOP**.
- **[2716]** ENEA Operator, „Standard w sieci dystrybucyjnej — Budowa układów uziomowych w sieci
  dystrybucyjnej”, wersja 05.2025, uchwała Zarządu nr 311/2025, obowiązuje od 01.10.2025,
  zastępuje wersję 05.2023 (uchwała 318/2023). Adres:
  `https://www.operator.enea.pl/media/2716/budowa-ukladow-uziomowych-w-sieci-dystrybucyjnej-obowiazuje-od-01102025pdf.pdf`.
  17 stron, SHA-256 zaczyna się od `82733e56` i kończy na `02a606`. Prefiks **EUZ**.

Pobrano 2026-11-13. PDF, tekst i rysunki NIE są w repozytorium (prawa ENEA). Plik zawiera
wyłącznie numery punktów, wartości liczbowe, wzory w zapisie własnym i własne sformułowania.
„Odczyt rysunku” oznacza wizualny odczyt strony PDF (obrazy skasowane po odczycie).

## 1. Zakres stosowania w produkcie

- solver doziemień SN: pojemnościowy prąd doziemienia sieci I_CS, prąd doziemienia I_k1 wg
  sposobu pracy punktu neutralnego (izolowany, skompensowany z AWSCz i bez, przez rezystor,
  rezystor równoległy z dławikiem), prąd uziomowy I_E = r·I_k1, czas trwania doziemienia t_F
  z uwzględnieniem SPZ — wszystko jako fizyka w `network_model/solvers/**`;
- model ENM: sposób pracy punktu neutralnego źródła, AWSCz, nastawy czasowe zabezpieczeń
  ziemnozwarciowych i SPZ, dane uziomu stacji, słupa i złącza (R_E, R_B, R_BN, R_ES),
  przynależność do ZIU, „miejsce często uczęszczane” słupa, współczynnik redukcyjny kabla;
- katalog: współczynniki redukcyjne r kabli (zał. 1), elementy uziomów (pręty, taśmy, zaciski),
  przewody uziemiające stacji;
- ocena (werdykt wyjaśnialny): warunki R_E ≤ 2U_D/I_E, R_E ≤ 2U_Tp/I_E, R_B ≤ U_F/(r·I_k1),
  R_B ≤ R_E·50/(U_0−50), R_BN < 5 Ω, R_S < 5 Ω, R_ES ≤ 10 Ω, Z_s ≤ U_0/I_a, wartości 2 Ω i 3,3 Ω;
- pakiet dowodowy uziemień i raport: wzory, podstawienia, limity z tablicy 1, podstawa punktu;
- schemat jednokreskowy: oznaczenie uziemień i złącz pomiarowych ZP (decyzje graficzne — B-02).

Wdrożenie jako **wariant standardu operatora**. Ocena zgodności — werdykt wyjaśnialny
(`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`); wartości przyjęte domyślnie z tego standardu
(I_AWSCz = 20 A, r = 0,6, R_E = 15 Ω) mają jakość `ESTIMATED` i kompletność dowodu `NIEPELNY`
(Zasada nr 4).

## 2. Wymagania potwierdzone — ochrona przed porażeniem w sieci SN [2713]

| Nr | Punkt | Wymaganie |
|----|-------|-----------|
| EOP-01 | §1 | Standard dotyczy sieci 50 Hz o napięciu nominalnym 15 kV i 20 kV należącej do ENEA Operator. |
| EOP-02 | §2 | Zakres: ochrona przy uszkodzeniu (przed dotykiem pośrednim) w nowej sieci SN i w sieci istniejącej w zakresie rozbudowy i przebudowy; etapy projektowania, budowy i eksploatacji. |
| EOP-03 | §3 | Słowa „powinien” i „należy” oznaczają wymaganie; przy wymaganiu ostrzejszym niż norma stosuje się standard. |
| EOP-04 | §4.1–§4.2 | Części czynne niebezpieczne niedostępne, części przewodzące dostępne bezpieczne w warunkach normalnych (ochrona przed dotykiem bezpośrednim) i przy pojedynczym uszkodzeniu (ochrona przy uszkodzeniu). |
| EOP-05 | §4.3.1–§4.3.2 | SN: powyżej 1 kV i poniżej 110 kV; nN: nie wyżej niż 1 kV. |
| EOP-06 | §4.3.3 | Sieć z punktem neutralnym uziemionym przez rezystor: składowa czynna prądu doziemienia większa od pojemnościowej, działanie zabezpieczeń zerowoprądowych pól liniowych, uziemienie nieskuteczne, prąd czynny w punkcie neutralnym przy zwarciu bezrezystancyjnym powyżej 100 A. |
| EOP-07 | §4.3.4–§4.3.6 | Definicje sieci skompensowanej (dławik gaszący dostrojony do pojemności doziemnej), z izolowanym punktem neutralnym (bez zamierzonego uziemienia poza dużymi impedancjami pomiarowymi) oraz uziemionej przez rezystor równoległy z dławikiem (dławik dostrojony, rezystor tłumi przepięcia jak w sieci z samym rezystorem). |
| EOP-08 | §4.3.7 | „Uziemienie przy stacji SN/nN” = „uziemienie przy źródle” w normach. |
| EOP-09 | §4.3.8 | Do analiz przyjmuje się ustalony prąd doziemienia I_k1, równy I″k1, bo w sieciach SN stany podprzejściowe nie występują. |
| EOP-10 | §4.3.9 a | Gdy operator nie podał I_CS: I_CS = 1,05·√3·U_n·ω·C_S (C_S — pojemność doziemna fazowa całej sieci, ω ≈ 314). |
| EOP-11 | §4.3.9 b | Albo I_CS = 1,05·Σ I′_CKi·l_Ki z jednostkowych prądów pojemnościowych odcinków (kable — katalog producenta, linie napowietrzne — literatura [22]); dla kabla o napięciu znamionowym U_r wyższym od U_n: I′_CK = (U_n/U_r)·I′_CK(U_r). |
| EOP-12 | §4.3.9 c | I_CS można przyjąć z pomiaru; współczynnik 1,05 odpowiada napięciu roboczemu o 5% wyższemu od nominalnego. |
| EOP-13 | §4.4–§4.5 | Skróty: AWSCz (automatyka wymuszania składowej czynnej w sieciach skompensowanych), GPZ, SPZ, szafa i złącze kablowe SN, ZIU, p.n.; jednostki: Ω, V, A, Ωm. |
| EOP-14 | §4.6 | Czas doziemienia t_F = t_AWSCz + t_E + t_ow bez SPZ albo z SPZ o przerwie bezprądowej co najmniej 3 s; t_F = t_AWSCz + 2t_E + 2t_ow przy SPZ o przerwie krótszej niż 3 s (t_E — nastawa zabezpieczenia ziemnozwarciowego z uwzględnieniem nastaw w głębi sieci, t_ow — czas własny wyłącznika). |
| EOP-15 | §5.1 | Prąd doziemienia liczy się dla układu sieci dającego największą wartość (bez krótkich stanów przełączeń): rozdzielnia dwusekcyjna z długotrwałym łączeniem sekcji — suma prądów sekcji i możliwość dwóch AWSCz lub dwóch rezystorów; więcej niż dwie sekcje — najmniej korzystny wariant łączenia; stacja jednotransformatorowa — możliwe połączenie z siecią innego GPZ. |
| EOP-16 | §5.2 | I_k1: sieć izolowana — I_CS; skompensowana bez AWSCz, dławiki nieregulowane — 0,2·I_CS, kompensacja nadążna — nastawa regulatora (stopień kompensacji albo prąd resztkowy); skompensowana z AWSCz — √((0,1·I_CS)² + I_AWSCz²), I_AWSCz = 20 A gdy brak danych, z możliwością pracy dwóch AWSCz; przez rezystor — √(I_CS² + I_R²) (metoda uproszczona, I_R — prąd znamionowy rezystora); rezystor równoległy z dławikiem — √((I_CS − I_L)² + I_R²). |
| EOP-17 | §5.2 | Prąd uziomowy słupa I_E = I_k1; wyjątek: słup przejścia linii kablowej od GPZ (ciągła żyła powrotna, powłoka lub pancerz) w napowietrzną — I_E = r·I_k1, r wg zał. 1. |
| EOP-18 | §5.3 | Stacja SN/nN zasilana linią napowietrzną: I_E = I_k1; zasilana kablem: I_E = r·I_k1; r nieznane dla typu kabla — r = 0,6. |
| EOP-19 | §6.1 | §6.2–§6.3 dotyczą tylko słupów bez aparatury łączeniowej; słupy z aparaturą łączeniową lub inną obsługiwaną (odłącznik z napędem ręcznym, „reklozer”, rozłącznik, układ pomiarowy) — §6.4; żaden słup linii napowietrznej nie podlega regułom ZIU, nawet na jej terenie. |
| EOP-20 | §6.2, rys. 1 | Algorytm doboru uziemienia słupa (tylko sieci z rezystorem albo rezystorem i dławikiem). Odczyt rysunku: blok 1 słup z materiału izolacyjnego → projekt poprawny; blok 2 otoczenie często uczęszczane → tak: blok 4, nie: blok 3; blok 3 bezzwłoczne automatyczne wyłączenie → tak: projekt poprawny, nie: blok 4; blok 4 wyznaczenie U_E; blok 5 U_E < 2U_D → projekt poprawny; inaczej blok 6 wyznaczenie U_T; blok 7 U_T poniżej dopuszczalnego → projekt poprawny; inaczej blok 8 środki uzupełniające i powrót do bloku 6 (tekst: do bloku 4). |
| EOP-21 | §6.2 blok 1 | Słup drewniany lub kompozytowy jest izolacyjny; słup betonowy jest przewodzący. |
| EOP-22 | §6.2 blok 2 | Miejsca często uczęszczane: a) kąpieliska, boiska, place zabaw, kempingi; b) podwórka, chodniki, parkingi, ogrody, tereny przykościelne, cmentarze, tereny magazynowe, przemysłowe i gospodarcze; c) mniej niż 25 m od wejść do budynków i miejsc z lit. a; d) bliżej niż 10 m od skraju dróg publicznych w terenie zabudowanym, chodników i ścieżek prowadzących do budynków odwiedzanych co najmniej raz w tygodniu; e) ścieżki piesze z map i pas 10 m od nich; ścieżki leśne niedopuszczone do ruchu nie są drogami; w razie wątpliwości przyjmuje się, że miejsce jest uczęszczane. Ramka: pola, sady, lasy, drogi wyłącznie do stacji telefonii i elektrowni wiatrowych nie są często uczęszczane. |
| EOP-23 | §6.2 bloki 4–5 | U_E = I_E·R_E; projekt właściwy, gdy U_E < 2U_D, czyli R_E ≤ 2U_D(ρ_E1)/I_E; ρ_E1 — rezystywność zmierzona metodą Wennera przy rozstawie 1 m bez współczynników sezonowych, przy warstwie wierzchniej o dużej rezystywności (asfalt, tłuczeń) — jej rezystywność; tłuczeń co najmniej 0,10 m grubości w pasie co najmniej 1,3 m od obrysu słupa; krzywa dla najbliższej mniejszej rezystywności, bez pomiaru — krzywa dla 0 Ωm; miejsca z lit. a bloku 2 — krzywa „bez obuwia”. |
| EOP-24 | §6.2 rys. 2 | Odczyt rysunku (przybliżony, skala logarytmiczna): U_D w funkcji t_F od 100 ms do 10 s dla krzywych „bez obuwia”, 0, 200, 500, 1000, 2000, 4000 Ωm z obuwiem; „bez obuwia” około 650 V przy 100 ms i około 80 V powyżej 3 s; 0 Ωm z obuwiem około 1,7 kV przy 100 ms i około 140 V powyżej 3 s; 4000 Ωm około 7 kV przy 100 ms i około 430 V powyżej 3 s; wartości pośrednie wymagają odczytu krzywej z dokładnością, której ten plik nie zapewnia (luka L-06). |
| EOP-25 | §6.2 bloki 6–8 | Gdy warunek bloku 5 nie jest spełniony — wyznaczenie U_T, zalecany pomiar między uziemieniem a punktami 1 m od słupa (cztery punkty symetrycznie dla słupa jednożerdziowego); przekroczenie w jednym punkcie wymaga środków uzupełniających: uziom otokowy, izolacja słupa, warstwa o dużej rezystywności; zalecany otok albo elementy pionowe lub uziom rzędowy. |
| EOP-26 | §6.3 | W sieciach skompensowanych i izolowanych z samoczynnym wyłączeniem doziemienia ENEA wymaga mimo to uziemienia ochronnego słupów w miejscach często uczęszczanych, zapewniającego napięcie dotykowe rażeniowe nie wyższe niż dopuszczalne. |
| EOP-27 | §6.4 | Słup z aparaturą łączeniową: R_E ≤ 2U_Tp/I_E (U_Tp z rys. 3 albo tablicy 1) albo zmierzone napięcia dotykowe rażeniowe poniżej wartości z rys. 2. |
| EOP-28 | §6.5.1 | Konstrukcja (poprzecznik) każdego słupa linii z przewodami gołymi połączona z taśmą wzdłuż słupa zawiniętą u dołu do wnętrza — dla pewności detekcji doziemień. |
| EOP-29 | §6.5.2 | Słup bez aparatury poza miejscami z bloku 2 nie wymaga uziemienia ochronnego, jeśli zabezpieczenia ziemnozwarciowe działają na wyłączenie. |
| EOP-30 | §6.5.3 | Uziom słupa połączony z uziomem stacji SN/nN spełniającej rozdział 7 — wystarczy sprawdzić ciągłość połączenia. |
| EOP-31 | §6.5.4 | Słup wymagający sprawdzenia (brak zabezpieczeń ziemnozwarciowych na wyłączenie, miejsce posadowienia, aparatura obsługiwana) — wykonać uziom, zmierzyć napięcia dotykowe przy I_E z rozdziału 5, przy przekroczeniu rozbudować uziom; słup z aparaturą obsługiwaną traktuje się jak stację niezależnie od miejsca. |
| EOP-32 | §6.5.5 | Słup kablowy: uziom nie większy niż 10 Ω bez udziału żył powrotnych i powłok; w sieci z rezystorem dodatkowo algorytm rys. 1, z możliwym uwzględnieniem żył powrotnych i r. |
| EOP-33 | §6.4.1 rys. 3 | Odczyt rysunku: krzywa U_Tp w funkcji czasu przepływu prądu 10 ms–10 s — około 780 V przy 10 ms, spadek do około 120 V przy 1 s i około 85 V dla czasów dłuższych; wartości liczbowe zawiera tablica 1 (EOP-40). |
| EOP-34 | §7.1 | Wymagania rozdziału 7 dotyczą stacji SN/nN poza ZIU przy sieci nN TN-C i wspólnym uziomie SN i nN; wtedy warunek R_B ≤ 2U_Tp/(r·I_k1) nie jest analizowany, bo 2U_Tp > U_F; zalecany algorytm rys. 4 (U_E ≤ 2U_Tp → poprawny; U_E ≤ 4U_Tp → środki dodatkowe; inaczej wyznaczenie U_T i porównanie z U_Tp, środki uzupełniające M). |
| EOP-35 | §7.1 a | R_B ≤ U_F/(r·I_k1); R_B obejmuje uziom stacji, fundament, żyły powrotne i powłoki kabli SN, uziemienia PEN na trasie nN i u odbiorców oraz inne połączone uziomy; U_F wg czasu t_F (§4.6) z krzywej U_F (rys. 5) albo tablicy 1; r wg zał. 1. |
| EOP-36 | §7.1 b | R_B ≤ R_E·50/(U_0 − 50) dla uziemień punktów neutralnych i PEN linii napowietrznych, gdzie możliwe jest doziemienie z pominięciem PEN; R_E nieznane — 15 Ω, stąd R_B ≤ 4,17 Ω; przy ρ > 500 Ωm R_E = 15·ρ/500; wymagania nie stawia się dla sieci czysto kablowych i napowietrznych wyłącznie z przewodami izolowanymi (bez obwodów gołych). |
| EOP-37 | §7.1 | Rezystancja uziemienia przy stacji R_BN < 5 Ω; przy ρ_E10 > 500 Ωm (Wenner, rozstaw 10 m) dopuszczalne R_BN = ρ_E10/100. |
| EOP-38 | §7.1 | Każda stacja SN/nN poza ZIU ma uziom otokowy z uziomami pionowymi o łącznej długości co najmniej 12 m; gdy otok niemożliwy — uziomy poziome i pionowe wzdłuż tras kabli; pojedynczy uziom pionowy co najmniej 3,0 m, zalecany odstęp nie mniejszy niż długość dłuższego uziomu. |
| EOP-39 | §7.2 | Sieć skompensowana z sumą prądów pojemnościowych sekcji do 360 A i I_AWSCz = 20 A (±25%): R_B ≤ 2 Ω dla stacji zasilanej linią napowietrzną, ≤ 3,3 Ω dla stacji zasilanej kablem ciągłym od GPZ; I_AWSCz większy — obliczenie wg §7.1; przy łączeniu sekcji GPZ zalecana blokada AWSCz w sekcji niezasilanej bezpośrednio z transformatora, inaczej obliczenie wg §5.1. Uzasadnienie: t_F = 5 s, U_F = 82 V, I_k1 = √(36² + 20²) = 41,2 A, R_B = 82/41,2 = 1,99 Ω; kabel: 82/(0,6·41,2) = 3,32 Ω. |
| EOP-40 | tabl. 1 | U_Tp / U_F [V] w funkcji czasu [s]: 0,10 — 650/680; 0,15 — 600/640; 0,20 — 540/560; 0,25 — 460/500; 0,30 — 420/430; 0,35 — 350/370; 0,40 — 310/310; 0,45 — 270/270; 0,50 — 220/200; 0,60 — 180/170; 0,70 — 150/130; 0,80 — 130/120; 0,90 — 125/115; 1,00 — 120/110; 2,00 — 95/90; 3,00 — 90/87; 4,00 — 85/83; 5,00 — 85/82; ≥ 10 — 85/80. |
| EOP-41 | §8.1 | Stacje SN/nN, SN/SN, rozdzielnie sieciowe na terenie ZIU: własny układ uziomowy jak poza ZIU, bez rozdzielania uziemień; obliczeniowe R_S < 5 Ω; otok z uziomami pionowymi po 3 m; po połączeniu z szyną PE pomiary przynależności do ZIU wg zał. 3. |
| EOP-42 | §8.2 | Linie nN TN: PEN łączyć z uziomami naturalnymi i sztucznymi, gdy to możliwe; PEN uziemiony nie dalej niż 500 m od innego uziemienia i na końcu każdego obwodu lub odgałęzienia promieniowego dłuższego niż 200 m; obliczeniowa rezystancja tych uziemień do 30 Ω; ciągłość PEN we wszystkich punktach podziału. |
| EOP-43 | §8.2 | Samoczynne wyłączenie w TN: Z_s ≤ U_0/I_a; wymaganie uznaje się za spełnione, gdy I_a > 2·I_nB (I_nB — prąd znamionowy bezpiecznika lub wyłącznika). |
| EOP-44 | §9.1 | Rozdzielnie sieciowe, złącza i szafy kablowe SN poza ZIU — jedno z kryteriów: a) R_E ≤ 2U_Tp/(r·I_k1) z U_Tp dla najdłuższego czasu i I_k1 największym ze wszystkich wariantów zasilania, r = 1 przy zasilaniu napowietrznym, r wg zał. 1 przy kablu ciągłym od GPZ; b) zmierzone napięcia dotykowe dopuszczalne oraz R_ES ≤ 10 Ω (uziom przy obiekcie bez wpływu innych, minimum otok na głębokości 0,5–1 m w odległości 1 m od obrysu), przy ρ > 500 Ωm (Wenner, rozstaw 5 m) R_ES = ρ/50. |
| EOP-45 | §9.2 | Te same obiekty na terenie ZIU — wg §8.1. |
| EOP-46 | zał. 1 | Współczynnik redukcyjny r: kabel polietylenowy z żyłą powrotną Cu 50 mm² — 0,25, 25 mm² — 0,40, 16 mm² — 0,55; kabel papierowo-olejowy z powłoką ołowianą — 0,6; przy kablach różnych typów na drodze do GPZ przyjmuje się wartość największą. |
| EOP-47 | zał. 2 | ZIU: równoważny układ połączonych lokalnych instalacji uziemiających bez niebezpiecznych napięć dotykowych; warunki sprzyjające — niska rezystancja wypadkowa, niskie prądy doziemne, żyły powrotne, sieć nN TN (także TT, ale TN korzystniejsza) z zachowaną ciągłością PEN; typowe przypadki — zabudowa z uziomami fundamentowymi, centrum miasta, obszar podmiejski z PEN, liczba stacji sąsiednich, uziomy wychodzące, kable o działaniu uziomu, strefa przemysłowa; na obszarze ZIU badanie uziemień sprowadza się do stwierdzenia ciągłości przewodów uziemiających. |
| EOP-48 | zał. 3 pkt 1, rys. 6 | Kwalifikacja do ZIU. Odczyt algorytmu: obszar zurbanizowany? nie → nie należy; zasilanie ciągiem kablowym? nie → nie należy; ciąg zamknięty → należy (z ewentualnym pomiarowym potwierdzeniem ciągłości żył powrotnych starszych kabli trójżyłowych); ciąg promieniowy → należy tylko przy ciągu przewodów ochronnych w kablowej sieci nN TN. |
| EOP-49 | zał. 3 pkt 2–3 | Stacja na skraju obszaru albo niespełniająca algorytmu w głębi ZIU (np. zasilana krótkim odcinkiem napowietrznym) — przynależność tylko po pomiarach napięć rażeniowych. |
| EOP-50 | zał. 3 pkt 4–7 | Obszar ZIU — obwiednia terenów wokół zakwalifikowanych stacji z granicami naturalnymi; obwody nN stacji z ZIU należą do ZIU, z wyjątkiem wyprowadzonych co najmniej 300 m poza obszar; dokumentacja na mapie i liście stacji z obwodami nN i stacjami SN/SN; obszar wprowadzony do GIS przez Rejon Dystrybucji i zatwierdzony przez dyrektora Oddziału; przy nowych stacjach dąży się do rozszerzania ZIU. |

## 3. Wymagania potwierdzone — budowa układów uziomowych [2716]

| Nr | Punkt | Wymaganie |
|----|-------|-----------|
| EUZ-01 | §1–§2 | Standard dotyczy uziomów roboczych, ochronnych i odgromowych w sieci 110 kV, 15 kV, 20 kV i 0,4 kV ENEA — nowej i rozbudowywanej; etap projektowania i budowy. |
| EUZ-02 | §3 | Wymaganie ostrzejsze niż norma — stosuje się standard; urządzenia z certyfikatami i gwarancją; „powinien”/„należy” oznacza wymaganie. |
| EUZ-03 | §4.1 | Podstawowe rozwiązanie w SN i nN: uziemienie wspólne (ochronne, odgromowe, funkcjonalne); rozdzielenie uziemienia punktu N transformatora w stacji SN/nN tylko w uzasadnionych przypadkach, projektowane indywidualnie, ze specjalnym oznaczeniem stacji; trwałość nie krótsza niż czas eksploatacji chronionych urządzeń. |
| EUZ-04 | §4.2–§4.3 | Funkcje uziomów: funkcjonalne, ochronne, funkcjonalno-ochronne, odgromowe, ochronno-odgromowe; rodzaje: poziome (otokowe, kratowe, promieniowe), pionowe, pionowe głębokie, ukośne, fundamentowe, ZIU. |
| EUZ-05 | §5 | Materiał uziomów: miedź, stal miedziowana elektrolitycznie, stal nierdzewna, stal cynkowana ogniowo; zakaz stali czarnej bez powłoki przewodzącej; połączenia w ziemi inne niż egzotermiczne chronione taśmą antykorozyjną lub masą bitumiczną. |
| EUZ-06 | §5 | Przewody uziemiające: taśma stalowa cynkowana co najmniej 30×4 mm albo linka Cu co najmniej 25 mm²; połączenia z uziomem i elementów uziomu — zgrzewy egzotermiczne albo zaciski krzyżowe ze stali nierdzewnej; zakaz spawania elementów uziomowych (zob. luka L-04). |
| EUZ-07 | §5 | Stal do cynkowania: Si poniżej 0,03% przy Si+P do 0,045% albo Si 0,15–0,24% przy Si+C poniżej 0,5%. |
| EUZ-08 | §6.1 | Pręt pionowy cynkowany ogniowo: wytrzymałość co najmniej 600 N/mm², cynk średnio co najmniej 85 µm (pojedynczo co najmniej 70 µm), średnica bez powłoki co najmniej 16 mm, grot, długość pręta 1 m albo 1,5 m. |
| EUZ-09 | §6.2 | Pręt pionowy miedziowany: co najmniej 600 N/mm², miedź 99,9% średnio co najmniej 250 µm (pojedynczo co najmniej 225 µm), średnica co najmniej 16 mm, grot, 1 m albo 1,5 m. |
| EUZ-10 | §6.3–§6.4 | Uziom pionowy głęboki ze stali nierdzewnej: średnica co najmniej 16 mm (rura — ścianka co najmniej 2 mm), grot większy od pręta, pancerz do pogrążania, łączenie przez prasowanie, segmenty 1 m albo 1,5 m; grot ze stali narzędziowej lub hartowanej. |
| EUZ-11 | §6.5 | Uziom poziomy, kratowy, otokowy: taśma Cu co najmniej 25×2 mm; stal miedziowana co najmniej 30×4 mm z miedzią średnio 80 µm (pojedynczo 70 µm); stal nierdzewna co najmniej 30×4 mm; stal cynkowana co najmniej 30×4 mm z cynkiem średnio 70 µm (pojedynczo 55 µm). |
| EUZ-12 | §6.6–§6.7 | Zacisk krzyżowy z trzech blach nierdzewnych co najmniej 2 mm, 4 śruby nierdzewne co najmniej M8 z nakrętką nierdzewną i kontrującą; zakaz łączenia w gruncie metali o różnicy potencjału elektrochemicznego powyżej 0,6 V; złączka gwintowana prętów z mosiądzu lub brązu. |
| EUZ-13 | §6.8 | Przewód uziemiający: taśma 30×4 mm cynkowana (70/55 µm); połączenia obudów rozdzielnic nN, kadzi transformatora, ograniczników SN i nN, kanałów i konstrukcji przewodem H07V-K żółto-zielonym 1×25 mm² w stacji słupowej i 1×70 mm² w kompaktowej (drzwi 1×25 mm²); w stacji słupowej pionowy przewód od konstrukcji górnej do zacisku probierczego z jednolitej taśmy FeZn 30×4. |
| EUZ-14 | §6.8 | Szafy i złącza kablowe: PEN z uziomem przewodem Cu izolowanym 1×25 mm² powyżej poziomu gruntu; uziemienie punktu neutralnego transformatora H07V-K niebieskim 1×70 mm² (stacja słupowa) i 1×95 mm² (kompaktowa); zaciski do końcówek gołych lub prasowanych; cięcia stali cynkowanej malowane farbą do cynkowania na zimno. |
| EUZ-15 | §6.9 | Połączenia egzotermiczne: forma grafitowa na co najmniej 50 połączeń, stop o zawartości miedzi powyżej 97%, nabój w zamkniętym zasobniku, zapłon elektryczny. |
| EUZ-16 | §7.1 | Przed projektem: rozpoznanie terenu, rodzaju gruntu i istniejących instalacji (zwłaszcza ZIU), pomiar rezystywności, warunki zwarciowe i nastawy zabezpieczeń, wytrzymałość i ochrona przed korozją, rozkład potencjału, uziomy naturalne, możliwość pomiarów w eksploatacji. |
| EUZ-17 | §7.2 | Projekt: elementy, materiały, ilości, wymiary i powłoki przy czasie eksploatacji co najmniej 40 lat, głębokości i odstępy, wymagana rezystancja (nie dotyczy sieci w ZIU), sposób przyłączenia obiektu, część rysunkowa ze zwymiarowanymi rzutami i przekrojami. |
| EUZ-18 | §7.2 | Gdy możliwe połączenie z istniejącymi uziomami — projekt jako element ZIU wg zał. 2 i 3 dokumentu 2713; w razie wątpliwości nie zakłada się ZIU; przy spełnionym kryterium napięć dotykowych nie sprawdza się napięć krokowych na etapie projektu. |
| EUZ-19 | §8 | Budowa: elementy dedykowane systemu; połączenia systemowe, egzotermiczne „lub spawane” (zob. luka L-04); zabezpieczenie połączeń skręcanych przed luzowaniem; złącza pomiarowe ZP na przewodach ochronnych, skręcane dwiema śrubami M10, z kształtem przewodu umożliwiającym cęgi, w miejscach dostępnych, oznaczone wg rys. 9. |
| EUZ-20 | §8 | Taśma przy wejściu do gruntu w rurze termokurczliwej z klejem 40 cm nad i 60 cm pod gruntem; przewody ochronne widoczne — żółto-zielone, funkcjonalne (zacisk PEN transformatora) — niebieskie; otok na głębokości wykluczającej uszkodzenie (prace polowe); górny koniec uziomu pionowego co najmniej 0,5 m pod powierzchnią. |
| EUZ-21 | §8 | Słup z §6.5.1 dokumentu 2713 (linia z przewodami gołymi): taśma stalowa cynkowana na całej długości, dół zawinięty do wnętrza, góra do zacisku konstrukcji, opaski stalowe co 1 m, bez malowania; zakaz używania zbrojenia słupów żelbetowych jako przewodu uziemiającego bez przewidzenia przez producenta i zbrojenia betonowych elementów stacji i złączy; studzienki kontrolne dopuszczalne w uzasadnionych przypadkach. |
| EUZ-22 | §9 | Wyroby nowe, wyprodukowane nie wcześniej niż w roku poprzedzającym zlecenie; certyfikaty jednostek akredytowanych (PCA lub sygnatariusze IAF MLA, ILAC MRA, EA MLA); gwarancja na roboty i elementy co najmniej 60 miesięcy, na zabezpieczenia antykorozyjne co najmniej 96 miesięcy. |
| EUZ-23 | §10 | Rozwiązania inne niż w standardzie — indywidualna decyzja na wniosek: WN — Dyrektor Departamentu Planowania i Rozwoju, SN — Dyrektor Oddziału Dystrybucji, nN — Dyrektor Rejonu Dystrybucji. |
| EUZ-24 | rys. 1–4 | Odczyt rysunku: stacja kompaktowa, szafa lub złącze SN poza ZIU i na terenie ZIU — otok taśmą FeZn 30×4 lub Cu 25×2 w odległości 1 m od obrysu i na głębokości 0,5 m, z uziomami pionowymi (pojedynczymi, zespolonymi, głębokimi lub ukośnymi) w narożach, wewnątrz przewód FeZn 30×4 do głównej szyny uziemiającej i miejsce pomiaru; łączenia opisane jako zgrzew egzotermiczny, element dedykowany systemu „lub spawanie o klasie spoiny B lub C”. |
| EUZ-25 | rys. 5 | Odczyt rysunku: schemat połączeń stacji kompaktowej — część SN z rozłącznikiem z bezpiecznikami, transformator, część nN z PEN; do głównej szyny uziemiającej przyłączone: konstrukcje SN, punkt neutralny 2N transformatora przez połączenie rozłączalne, PEN rozdzielnicy nN, drzwi i kratka wentylacyjna, szafka pomiarowa, uziom pionowy, uziom fundamentowy, złącze ZP; gniazdo 230 V wewnątrz stacji. |
| EUZ-26 | rys. 6–8 | Odczyt rysunku: stacja słupowa i słup SN z aparaturą — przewód FeZn 30×4 od konstrukcji SN (i nN) do zacisku probierczego ZP na wysokości 0,6 m (+0,2/−0,2 m) dla stacji słupowej i 1,0 m (+0,2/−0,2 m) dla słupa z aparaturą, rura termokurczliwa 0,4 m nad i 0,6 m pod gruntem, otok w odległości 1 m i na głębokości 0,5 m z uziomem pionowym; słup bez aparatury — sam przewód FeZn 30×4 od konstrukcji, bez otoku. |
| EUZ-27 | rys. 9 | Odczyt rysunku: znak złącza ZP 50×50 mm (symbol uziemienia w okręgu), na słupach mocowany taśmą nierdzewną, na pozostałych obiektach klejony lub nitowany. |

## 4. Decyzje i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

1. **DECYZJA WŁAŚCICIELA 2026-11-13, doprecyzowana 2026-11-14 — reklozery i wyłączniki poza
   GPZ.** „W ENEA nie stosujemy reklozerów”; „wyłącznik poza GPZ tylko wyjątkowo”. Typ „reklozer”
   jest wykluczony; poza GPZ domyślnie rozłącznik; wyłącznik z zabezpieczeniem tylko jawnym wyborem
   projektanta z uzasadnieniem. EOP-19 wymienia „reklozer” wyłącznie jako przykład aparatu na
   słupie przy regułach uziemienia — to nie jest zachęta do stosowania (luka L-03).
2. Wartości odczytane z krzywych rys. 2 i rys. 3 (EOP-24, EOP-33) są przybliżone; produkt liczy
   U_Tp i U_F z tablicy 1 (EOP-40), a U_D wymaga cyfrowego odwzorowania krzywych (luka L-06).
   Interpolacja między wierszami tablicy 1 (liniowa albo logarytmiczna) jest decyzją produktu.
3. Przyjęcie wartości domyślnych standardu (I_AWSCz = 20 A, r = 0,6, R_E = 15 Ω, krzywa 0 Ωm przy
   braku pomiaru) to wartości robocze `ESTIMATED` wg Zasady nr 4, nie dane projektu.
4. Symbol uziemienia, złącza ZP i sposób rysowania otoku na schemacie są decyzjami graficznymi
   (B-02); rysunki 1–9 opisują montaż, a nie schemat jednokreskowy.

## 5. Luki i niejednoznaczności

- **L-01 (omyłka odwołania).** §7.1 lit. a odsyła po U_F do „rys. 4”, który jest algorytmem
  projektowania; krzywą U_F zawiera rys. 5. Podobnie zał. 3 pkt 3 odsyła do „rys. 2” zamiast do
  algorytmu kwalifikacji ZIU z rys. 6. §7.1 zapowiada punkty „7.1.1–7.1.2”, których w tekście nie
  ma (warunki oznaczono lit. a i b).
- **L-02 (dwie wartości domyślne r).** §5.3 nakazuje r = 0,6, gdy r nie jest znane, a zał. 1 daje
  r = 0,40 dla typowego kabla polietylenowego z żyłą powrotną Cu 25 mm² (ENEA stosuje w SN ekrany
  Cu 25 i 50 mm² — zob. `STANDARD_ENEA_LINIE_KABLOWE_SN.md`). Wartość 0,6 jest bezpieczna
  (większa), ale dla znanego typu kabla właściwa jest wartość z zał. 1; produkt powinien brać r
  z katalogu kabla, a 0,6 tylko przy kablu bez danych.
- **L-03 (słowo „reklozer” w §6.1 a decyzja właściciela).** Wersja standardu: §6.1 wymienia
  reklozer obok odłącznika, rozłącznika i układu pomiarowego jako aparat słupowy podlegający §6.4,
  czyli standard zakłada, że taki aparat może wystąpić. Wersja decyzji właściciela: typ reklozer
  wykluczony, wyłącznik poza GPZ tylko jawnie z uzasadnieniem. Reguła uziemienia §6.4 obejmuje
  każdy słup z aparaturą łączeniową, więc decyzja nie zmienia wymagań uziemienia.
- **L-04 (spawanie).** 2716 §5 zabrania spawania elementów uziomowych, a §8 dopuszcza połączenia
  „spawane”, rysunki 1–7 opisują „spawanie o klasie spoiny B lub C”, spis treści zawiera §6.10
  „Połączenia spawane”, którego w treści nie ma. Sprzeczność wewnętrzna — do wyjaśnienia
  z operatorem; produkt nie generuje opisu wykonania połączeń, więc wpływ ogranicza się do raportu.
- **L-05 (odwołanie do „Zeszytu 1”).** 2716 §8 odsyła do „pk-tu 6.5.1 Zeszytu 1”, a zał. 2 i 3
  nazywa „częścią 1”; jest to dokument 2713 (EOP-28), choć sam 2713 nie nosi oznaczenia zeszytu.
- **L-06 (krzywe U_D).** Rys. 2 nie ma tablicy wartości; warunek bloku 5 (EOP-23) wymaga U_D dla
  rezystywności i czasu — bez cyfrowego odwzorowania krzywych produkt nie może go ocenić liczbowo.
  Do decyzji architekta: odczyt krzywych z normy źródłowej [22] (PN-EN 50341) zamiast z rysunku.
- **L-07 (I_k1 a solver IEC 60909).** Standard definiuje I_k1 dla sieci SN wzorami §5.2
  (prąd pojemnościowy, prąd resztkowy, AWSCz), a nie jako zwarcie jednofazowe IEC 60909 metodą
  składowych symetrycznych; w sieci izolowanej i skompensowanej oba podejścia dają różne liczby.

## 6. Mapa wdrożenia (stan kodu 2026-11-14, `/home/user/MV-Design-PRO/mv-design-pro`)

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| EOP-10–EOP-12 (I_CS ze współczynnikiem 1,05) | `backend/src/network_model/solvers/v126_academic.py:1394` (`ic_a = √3·ω·C0·U_l` z napięcia szyny) | **Częściowe, sprzeczne co do współczynnika:** brak 1,05 i brak przeliczenia U_n/U_r; liczone tylko w module akademickim projektu uziemienia punktu neutralnego. |
| EOP-16 (I_k1 wg sposobu pracy p.n., AWSCz) | `v126_academic.py:1435` (`petersen_detuning` domyślnie 0,05), `:1468-1469` (`I_res = Ic·√(d² + v²)`) | **Sprzeczne:** prąd resztkowy z rozstrojenia 5% zamiast 0,2·I_CS (bez AWSCz) i √((0,1·I_CS)² + I_AWSCz²) (z AWSCz); brak pojęcia AWSCz w modelu; brak wzorów dla rezystora i układu R‖L wg §5.2. |
| EOP-17, EOP-18, EOP-46 (I_E = r·I_k1, r z zał. 1, domyślnie 0,6) | `backend/src/application/analyses/earthing/ground_fault_bridge.py:111-133` (brak r → `ReadinessPriority.BLOCKER`, `earthing.electrode_data_missing`); `backend/src/enm/models.py:1695-1698` (`earth_return_split_factor` w polu) | **Sprzeczne z §5.3 i Zasadą nr 4:** brak r blokuje ocenę, choć standard podaje wartość domyślną 0,6 i tabelę zał. 1 wg ekranu kabla; r nie wynika z katalogu kabla ani z rodzaju zasilania (napowietrzne r = 1). |
| EOP-09, EOP-16, L-07 (źródło I_k1) | `ground_fault_bridge.py` (I_k1 = `ShortCircuitResult.ikss_a` z solvera SC_1F IEC 60909) | **Sprzeczne dla sieci izolowanych i skompensowanych:** I_k1 brany ze zwarcia jednofazowego IEC 60909 zamiast z wzorów §5.2. |
| EOP-14 (t_F z SPZ i AWSCz) | brak | **Brak** obliczenia czasu doziemienia z nastaw t_AWSCz, t_E, t_ow i przerwy SPZ. |
| EOP-23, EOP-27, EOP-35–EOP-40, EOP-44 (warunki R_E, R_B, R_BN, R_ES, tablica 1) | `backend/src/analysis/normative/models.py:38-39` (`touch_voltage_warn_v/fail_v` = None, konfigurowane ręcznie); `backend/src/application/proof_engine/packs/earthing_ground_fault_sn.py` (U_d = I_u·R_u bez limitu) | **Brak:** brak tablicy U_Tp/U_F, krzywych U_D, warunków 2U_Tp/I_E, U_F/(r·I_k1), 50/(U_0−50), R_BN < 5 Ω, 2 Ω / 3,3 Ω, R_ES ≤ 10 Ω. |
| EOP-22 (miejsce często uczęszczane), EOP-41, EOP-47–EOP-50 (ZIU) | brak | **Brak** atrybutów słupa i stacji: miejsce uczęszczane, przynależność do ZIU, rezystywność gruntu. |
| EOP-42, EOP-43 (PEN co 500 m i 200 m, 30 Ω, I_a > 2·I_nB) | `backend/src/network_model/catalog/lv_disconnection_times_iec60364_4_41.py:19` (TN 5 s dla obwodów rozdzielczych) | Częściowe: czas wyłączenia zgodny; brak alternatywy I_a > 2·I_nB i brak reguł uziemień PEN w liniach nN. |
| EUZ-03 (uziemienie wspólne, rozdzielenie N jako wyjątek) | `backend/src/enm/models.py:510` (`lv_earthing_system`) | Częściowe: układ sieci nN jest w modelu; brak oznaczenia stacji z rozdzielonym uziemieniem funkcjonalnym. |
| EUZ-05–EUZ-15 (materiały i elementy uziomów) | brak | **Brak** katalogu elementów uziomowych (pręty, taśmy, zaciski) — produkt nie projektuje geometrii uziomu; wpływ: raport i zestawienie materiałów. |
