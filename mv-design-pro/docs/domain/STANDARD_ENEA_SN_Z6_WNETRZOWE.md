# Standard ENEA SN, Zeszyt 6 — stacje transformatorowe SN/nN wnętrzowe w budynkach

Status: **BINDING** (dyrektywa właściciela 2026-11-12; Zasada nr 5 w `CLAUDE.md`, wzorzec formy
`STANDARD_ENEA_GPZ_Z1.md`).

Źródło: ENEA Operator sp. z o.o., „Standardy w sieci dystrybucji — Stacje elektroenergetyczne
średniego napięcia, Zeszyt 6. Wytyczne projektowania i budowy stacji transformatorowych SN/nn
wnętrzowych w budynkach”, wersja 10.2023, obowiązuje od 01.03.2024, zatwierdzona uchwałą
Zarządu nr 495/2023. Adres pobrania: `https://www.operator.enea.pl/media/688/` (plik
„stacje-elektroenergetyczne-sredniego-napiecia-zeszyt-6-wytyczne-projektowania-i-…”), pobrany
2026-11-12, 17 stron, SHA-256 pliku zaczyna się od `aa0e10c7` i kończy na `e647`.
PDF i rysunki NIE są w repozytorium (prawa ENEA). Dokument zawiera wyłącznie numery punktów,
wartości liczbowe i własne sformułowania.

Prefiks: `EW-`.

## 1. Zakres stosowania w produkcie

Wariant profilu OSD ENEA „stacja wnętrzowa w budynku” w: modelu ENM (`Substation`
o konstrukcji wnętrzowej, sekcje jednotransformatorowe powielane), katalogu (te same aparaty
co stacja kompaktowa: rozdzielnica SN 24 kV 5-polowa, nN 12 pól wielkości 2 z polem agregatu),
kreatorze stacji (stacja wielotransformatorowa = powielona sekcja), SLD, ocenie doboru,
zabezpieczeniach pola TR i raporcie. Zeszyt 6 jest też rozwiązaniem zastępczym ZKSN, gdy
nie da się postawić prefabrykowanego złącza (§2). Ocena zgodności jest werdyktem
wyjaśnialnym; wartość robocza daje dowód `NIEPELNY`.

## 2. Wymagania potwierdzone

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| EW-01 | §1 | Parametry są minimalne. |
| EW-02 | §2 | Dotyczy nowych stacji wnętrzowych w budynkach oraz istniejących w zakresie przebudowy i remontu (rozwiązania wdrażane w miarę możliwości). |
| EW-03 | §2 | Podstawowym rozwiązaniem jest stacja prefabrykowana; stacja w budynku dopuszczona tylko, gdy prefabrykowanej nie pozwala zastosować akt prawa miejscowego. |
| EW-04 | §2 | Rozwiązanie z Zeszytu 6 stosuje się odpowiednio, gdy nie da się usytuować prefabrykowanego ZKSN. |
| EW-05 | §3 | Normy wg Zeszytu 1; „powinien/należy” oznacza obowiązek. |
| EW-06 | 4.1.1 | Stacja na pierwszej kondygnacji nadziemnej („poziom 0”), przy ścianie zewnętrznej, z bezpośrednim dostępem z zewnątrz. |
| EW-07 | 4.1.2 | Odrębny, stały, całodobowy i bezpośredni dostęp dla służb ENEA (łączenia, pomiary, eksploatacja, wymiana urządzeń). |
| EW-08 | 4.1.3 | Droga dojazdowa dla sprzętu o nacisku osi 80 kN (transport TR i rozdzielnic). |
| EW-09 | 4.1.4 | Wprowadzenie kabli SN i nN przez kanalizację kablową bez ingerencji w konstrukcję budynku. |
| EW-10 | 4.1.5 | Strona SN przygotowana na rozdzielnicę 5-polową. |
| EW-11 | 4.1.6 | Rozdzielnica SN o izolacji powietrznej, stało-powietrznej albo gazowej (równoważne). |
| EW-12 | 4.1.7 | Strona nN przygotowana na rozdzielnicę z 12 polami odpływowymi z rozłącznikami wielkości 2. |
| EW-13 | 4.1.8 | Miejsce na szafy AMI w liczbie równej liczbie rozdzielnic nN. |
| EW-14 | 4.1.9 | Po stronie SN miejsce na szafę telemechaniki min. 700 × 500 × 320 mm. |
| EW-15 | 4.1.10 | Miejsce na sygnalizację zwarć (doziemnych i międzyfazowych) każdego pola liniowego, z przewodami od rozdzielnicy nN, napędów silnikowych, sensorów prądowych (w kierunku odpływu) i sensorów napięciowych do szafki telemechaniki. |
| EW-16 | 4.1.11 | Rozwiązanie budowlane chroni obsługę i osoby postronne przed gorącymi gazami ze zwarć w rozdzielnicy SN. |
| EW-17 | 4.1.12–4.1.15 | Indywidualna elewacja dopuszczalna; wentylacja grawitacyjna; IP 43; DTR po polsku. |
| EW-18 | 4.2.1–4.2.5 | Skład: rozdzielnica SN, rozdzielnica nN, komora TR, miejsce szafy AMI, miejsce szafy telemechaniki. |
| EW-19 | 4.2.6 | Stacja wielotransformatorowa = powielone rozwiązanie stacji jednotransformatorowej (sekcja na każdy TR). |
| EW-20 | rys. 1 (odczyt rysunku) | Schemat pojedynczej sekcji jak rys. 1 Zeszytu 1: do 5 pól SN, pola liniowe 630 A z napędem, pole TR 200 A z bezpiecznikiem; TR do 630 kVA, 420 V, Dyn5. |
| EW-21 | 4.3.1 a–b | Rozdzielnica SN kompaktowa lub modułowa: jedno pole TR, od 2 do 4 pól liniowych z możliwością ograniczników na głowicach Int C. |
| EW-22 | 4.3.1 c–f | Tabliczki przy napędach (nie na pokrywach kablowych); trwały schemat na obudowie; miejsce na schemat A4; uchwyty kablowe nieprzewodzące. |
| EW-23 | 4.3.2 | 24 kV; 3 fazy; 125/50 kV; 50 Hz; szyny 630 A; 16 kA; 40 kA szczytowo; łuk wewnętrzny 16 kA przez 1 s. |
| EW-24 | 4.3.3–4.3.7 | Pole TR: podstawowo rozłącznik trzypołożeniowy z bezpiecznikami (200 A, M1/E2, wyzwalacz od wkładki; zestaw 40 kA załączalny, 16 kA wyłączalny, wybijak 80 N); opcjonalnie wyłącznik próżniowy 200 A, 40/16 kA, M1/E2 z autonomicznym przekaźnikiem dla TR 160–630 kVA; blokady i kłódka. |
| EW-25 | 4.3.8–4.3.11 | Pole liniowe: rozłącznik trzypołożeniowy 630 A, załączalny 40 kA, wyłączalny 630 A, M1/E2; wyłącznik dopuszczony (630 A, 40/16 kA, M1/E2); blokady i kłódka. |
| EW-26 | 4.3.12–4.3.14 | Telemechanika 24 V DC bez demontażu; sygnalizatory przepływu prądu zwarciowego albo zabezpieczenia (sieci kompensowane, z rezystorem, rezystor–dławik); VDS na stałe w każdym polu liniowym i fazie. |
| EW-27 | 4.3.15 | Rozdzielnica z gazem SF6 — wskaźnik lub manometr. |
| EW-28 | 4.4.1 | Łącznik główny nN: rozłącznik izolacyjny 1250 A; 12 pól z rozłącznikami wielkości 2, w tym jedno pole dedykowane do przyłączenia agregatu prądotwórczego. |
| EW-29 | 4.4.2 | Szyny Cu cynowane 60×10 mm, rozstaw 185 mm, nakrętki wprasowane, podziałka 100 mm, osłony rezerwy, PEN 60×10; zaciski typu V albo — po uzgodnieniu — 2V. |
| EW-30 | 4.4.3 | Rozłączniki listwowe jak w Zeszycie 1 (rozstaw 185 mm, 50/100 mm, pionowe, jednobiegunowe, V-0, AC-23B, zaciski V/2V); sygnalizacja przepalenia wkładki z wymaganiami kompatybilności elektromagnetycznej; odporność udarowa modułu sygnalizacji ≥ 4 kV; korytko do szafy AMI. |
| EW-31 | 4.4.4–4.4.7 | Uchwyty kablowe; osłony rezerwy V-0; uchwyty uziemiacza; tabliczki. |
| EW-32 | 4.4.8–4.4.10 | CT 800/5 A kl. 0,2S 5 VA FS5 za łącznikiem głównym; gniazdo z bezpiecznikiem Bi 16 A; listwa kontrolno-pomiarowa. |
| EW-33 | 4.4.11 | Kondensator biegu jałowego przez rozłącznik skrzynkowy 00, przewód Cu ≥ 4 mm² 1,8/3 kV. |
| EW-34 | 4.4.12–4.4.13 | Miejsce na szafę AMI min. 620 × 800 × 245 mm; szafa telemechaniki IP 44. |
| EW-35 | 4.5 | Rozdzielnica nN: 690 V; szyny 910 A (1100 A przez 2 h); odpływy 400 A; 16 kA przez 1 s; 32 kA szczytowo; rozmieszczenie wg rys. 2. |
| EW-36 | 4.6.1 | TR–SN: 3 kable XLPE Al 70 mm² 12/20 kV z głowicami konektorowymi; Int A w polu TR, Int C przy wyłączniku; warstwa przewodząca uziemiona; długość kabli pozwalająca na dowolne przełożenie faz. |
| EW-37 | 4.6.2 | TR–nN: dwa kable Cu N2XY 1 × 240 mm² 0,6/1 kV (bez zróżnicowania mocy); zaciski bezkońcówkowe 2 × 240 mm²; długość pozwalająca na przełożenie faz; zaciski TR pod ograniczniki przepięć. |
| EW-38 | 4.7.1 a | Pomieszczenie rozdzielnicy SN min. 2 m wzdłuż rozdzielnicy i 2,25 m prostopadle. |
| EW-39 | 4.7.1 b | Komora TR min. 1,8 m wzdłuż drzwi transportowych i 2 m prostopadle; pomieszczenia stacji w klasie odporności ogniowej REI 120; przy spodziewanym zapotrzebowaniu > 630 kVA miejsce na drugi TR o tych samych parametrach. |
| EW-40 | 4.7.1 c–e | Pomieszczenie rozdzielnicy nN min. 2 × 2 m; dopuszczalne wspólne pomieszczenie SN i nN spełniające oba wymagania; powierzchnia pozwalająca na montaż, obsługę i wymianę. |
| EW-41 | 4.7.1 f–j | Wentylacja grawitacyjna (szczególnie komory TR); miejsce na szafki telemechaniki i AMI w pomieszczeniu nN; listwa instalacyjna min. 100 × 50 mm od SN do nN; oświetlenie z bezpiecznikiem; łączniki krańcowe drzwi z okablowaniem do AMI i telemechaniki. |
| EW-42 | 4.7.1 k–m | Szczelna misa olejowa na olej TR 630 kVA; barierka dielektryczna z tabliczką; stabilne rozdzielnice, krawędzie gratowane. |
| EW-43 | 4.7.1 n–q | Kanały kablowe z przepustami szczelnymi (5 bar wody, 3 bar gazu) albo podłoga technologiczna z przestrzenią min. 50 cm; kanały SN 60 × 80, nN 40 × 50; postument rozdzielnic maks. 30 cm; przykrycia kanałów do 25 kg; przepusty uziemienia jak wyżej. |
| EW-44 | 4.7.1 r–t | Ciąg techniczny (kanał lub otwór ≥ 60 mm z zaślepką demontowaną od wewnątrz) do przyłączenia agregatu; hydroizolacja piwnicy; przewód uziemiający taśmą. |
| EW-45 | 4.7.1 u–v | IAC-AB 16 kA/1 s; TR na wibroizolatorach. |
| EW-46 | 4.7.1 w–y | Transport TR: rozładunek z samochodu, posadzki bez progów, haki do stoczenia po pochylni; dojazd samochodu ciężarowego lub pomiarowego do wejścia; szyny jezdne w komorze zlicowane z progiem, próg maks. 5 cm. |
| EW-47 | 4.7.2 | Tablice z logotypem 148 × 210 mm na wszystkich drzwiach, w prawym górnym rogu. |
| EW-48 | 4.7.3 a–b | Stolarka malowana proszkowo, Al lub stal cynkowana; klasa korozyjności C4 (Kesternich). |
| EW-49 | 4.7.3 c–d | Drzwi komory TR stalowe REI 60, w świetle min. 120 × 200 cm; drzwi SN i nN stalowe REI 60, min. 90 × 200 cm (dwuskrzydłowe, gdy zasadne > 120 cm). |
| EW-50 | 4.7.3 e–m | Połączenia wyrównawcze; ukryte zawiasy nierdzewne; blokada przy 95°; ryglowanie dwupunktowe i kłódka; siatka ≤ 3 mm; blokady położenia otwartego; MASTER KEY z uchami na kłódkę; ocynk; żaluzje z zabezpieczeniem przeciwpożarowym. |
| EW-51 | 4.8 | Uziemienie wg standardów ENEA ochrony przeciwporażeniowej SN i układów uziomowych; główna szyna uziemiająca przez złącze pomiarowe ZP do uziomu pionowego (pojedynczego lub zespolonego) i fundamentowego; złącze dostępne dla cęgów bez wyłączania; po uzgodnieniu dopuszczalne przepusty pod przyszły uziom. |
| EW-52 | 4.9 | Oznakowanie jak w Zeszycie 1 (numer stacji od drogi, opisy drzwi „komora transformatora”, „rozdzielnia SN”, „rozdzielnia nn”, opisy pól, tabliczki ostrzegawcze); dopuszczalne mocowanie przez klejenie. |
| EW-53 | §5 | Inne rozwiązania wyłącznie decyzją Dyrektora Obszaru Dystrybucji. |

## 3. Rozdziały formalne (spis)

- §3 — normy wg Zeszytu 1.
- 4.10.1–4.10.10 — dokumentacja powykonawcza (w tym projekt budowlany pomieszczeń stacji,
  dokumenty z podpisem elektronicznym).
- 4.11 — gwarancje.
- §5 — tryb odstępstw.

## 4. Decyzje właściciela (NIE są wymaganiami ENEA)

- **DECYZJA WŁAŚCICIELA 2026-11-13:** w sieci ENEA generalnie nie stosuje się reklozerów.
- **DECYZJA WŁAŚCICIELA 2026-11-13:** odgałęzienie z kabla tylko przez ZKSN; odgałęzienie
  na gołej szynie zakazane. Zeszyt 6 §2 jest z tym zgodny: wnętrzowe rozwiązanie zastępuje
  ZKSN, gdy prefabrykowanego nie da się postawić.

## 5. Decyzje graficzne i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

- Rysowanie stacji wielotransformatorowej jako zestawu niezależnych sekcji bez sprzęgła
  wynika z 4.2.6 (powielenie rozwiązania jednotransformatorowego); połączenie sekcji
  sprzęgłem nie jest opisane w standardzie i nie może być przedstawiane jako wymaganie ENEA.
- Wymiary pomieszczeń, drzwi i kanałów są danymi budowlanymi; nie są renderowane w SLD.

## 6. Luki i niejednoznaczności

1. **Kable TR–nN zawsze 2 × N2XY 1×240 mm² (4.6.2 a)** wobec Zeszytu 1 4.6.2 a (jeden kabel
   na fazę do 250 kVA, dwa powyżej). Tekst 4.6.2 a nie mówi, czy „dwa kable” to dwa na fazę;
   zacisk 2 × 240 mm² (4.6.2 b) wskazuje na dwa na fazę.
2. **Pole agregatu (4.4.1)** jest jednym z 12 pól — liczba pól odpływowych dla sieci wynosi
   11; Zeszyt 1 nie ma pola agregatu.
3. **Stacja wielotransformatorowa (4.2.6) a > 630 kVA (4.7.1 b):** drugi TR „o tych samych
   parametrach” — standard nie mówi, czy sekcje mogą być łączone po stronie SN lub nN.
4. **Szafa telemechaniki „po stronie SN” (4.1.9)** wobec miejsca na szafki telemechaniki
   w pomieszczeniu rozdzielnicy nN (4.7.1 g).
5. **Rys. 1** nosi tytuł schematu pojedynczej sekcji; przy powieleniu sekcji standard nie
   określa numeracji pól.
6. **Zeszyt 4 §5.1** nie wymienia Zeszytu 6 jako miejsca montażu szafy AMI (patrz
   `STANDARD_ENEA_SN_Z4_AMI.md`, luka 2).

## 7. Mapa wdrożenia (stan głównego checkoutu, pomiar 2026-11-13)

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| EW-03 (prefabrykowana podstawowo) | `backend/src/reference_engine/compliance.py:412`, `:480` | zgodne |
| EW-19, EW-20 (sekcja do 630 kVA, powielana) | `backend/src/application/station_templates/templates/zksn_wnetrzowe.py:98` (`tpl_zksn_4pole_1600kva`), `:114` (`tpl_zksn_8pole_2x1000kva_coupler`); `backend/src/application/station_templates/templates/typowe_sn_nn.py:131`, `:154`, `:162`, `:179`, `:188` | sprzeczne (TR > 630 kVA w jednej sekcji, sprzęgło) |
| EW-19 (bez sprzęgła między sekcjami) | `backend/src/application/station_templates/templates/zksn_wnetrzowe.py:136` (`tpl_zksn_pole_lacznikowe`); `backend/src/application/station_templates/templates/sekcyjne.py:48`, `:65`, `:81` | sprzeczne (sprzęgło nieopisane w ENEA) |
| EW-20 (Dyn5, 420 V) | `backend/src/application/station_templates/_choices.py:22`, `:30`; `backend/src/network_model/catalog/mv_transformer_catalog.py:494`, `:790` | sprzeczne |
| EW-23, EW-25 (24 kV, 630 A) | `backend/src/application/station_templates/_choices.py:308`; `backend/src/network_model/catalog/mv_switch_catalog.py:308`–`330` | sprzeczne |
| EW-24 (pole TR na bezpiecznikach, bez 87T) | `backend/src/network_model/catalog/bay_templates.py:124`, `:168`, `:227` | sprzeczne |
| EW-25 (rozłącznik w polu liniowym), decyzja reklozerowa | `backend/src/network_model/catalog/bay_templates.py:83`, `:101`, `:211` | sprzeczne |
| EW-26 (sygnalizatory zwarć) | brak w modelu | brak |
| EW-28, EW-30 (12 pól wielkości 2, pole agregatu) | `backend/src/application/station_templates/_choices.py:122`; `backend/src/network_model/catalog/mv_auxiliary_catalog.py:645` | sprzeczne / brak pola agregatu |
| wariant stacji | `backend/src/enm/models.py:1155`–`1185` (`construction_type` = `wnetrzowa`) | zgodne co do konstrukcji |
| źródło wersji | `backend/src/reference_engine/packs/osd_enea/pack.json:7`–`13` — lista źródeł pakietu bez Zeszytu 6 (ani Zeszytu 4) | brak (stacje wnętrzowe nieobjęte pakietem) |
