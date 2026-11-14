# Standard ENEA SN, Zeszyt 2 — stacje kompaktowe uproszczone SN/nN do 400 kVA

Status: **BINDING** (dyrektywa właściciela 2026-11-12; Zasada nr 5 w `CLAUDE.md`, wzorzec formy
`STANDARD_ENEA_GPZ_Z1.md`).

Źródło: ENEA Operator sp. z o.o., „Standardy w sieci dystrybucji — Stacje elektroenergetyczne
średniego napięcia, Zeszyt 2. Stacje transformatorowe kompaktowe prefabrykowane SN/nn do
400 kVA »uproszczone«”, wersja 06.2024, obowiązuje od 01.01.2025, zatwierdzona uchwałą
Zarządu nr 372/2024; zastępuje wersję 06.2019 (Rada Techniczna 13.06.2019, protokół 71).
Adres pobrania: `https://www.operator.enea.pl/media/684/` (plik „stacje-elektroenergetyczne-
sredniego-napiecia-zeszyt-2-stacje-transformatorowe-k…”), pobrany 2026-11-12, 19 stron,
SHA-256 pliku zaczyna się od `981d710a` i kończy na `5cd3`.
PDF i rysunki NIE są w repozytorium (prawa ENEA). Dokument zawiera wyłącznie numery punktów,
wartości liczbowe i własne sformułowania.

Prefiks: `EU-`. Zeszyt 2 powtarza strukturę Zeszytu 1 (`STANDARD_ENEA_SN_Z1_KOMPAKTOWE_ZKSN.md`);
poniżej wypisano każde wymaganie z wartością, także te równe Zeszytowi 1, żeby wariant
„uproszczony” dało się ocenić bez sięgania do innego pliku.

## 1. Zakres stosowania w produkcie

Wariant profilu OSD ENEA „stacja kompaktowa uproszczona do 400 kVA” w: katalogu (rozdzielnica
SN 3-polowa, rozdzielnica nN 5-polowa, TR do 400 kVA, kable 150 mm²), modelu ENM (`Substation`),
kreatorze stacji i konfiguratorze rozdzielnicy SN, SLD (1 pole TR + do 2 pól liniowych),
ocenie doboru aparatury, zabezpieczeniach pola TR i raporcie. Ocena zgodności jest werdyktem
wyjaśnialnym; wartość robocza (`ESTIMATED`) daje kompletność dowodu `NIEPELNY`.

Zastosowanie wariantu (Zeszyt 1 §2): w miejscu dotychczasowych stacji słupowych, gdy nie
przewiduje się rozbudowy o dodatkowe pola SN ani nN.

## 2. Wymagania potwierdzone

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| EU-01 | §2 | Zeszyt dotyczy nowych stacji kompaktowych z TR do 400 kVA oraz istniejących w zakresie ich rozbudowy i przebudowy; obejmuje projektowanie i roboty. |
| EU-02 | §3 | Normy i przepisy wg §3 Zeszytu 1. |
| EU-03 | 4.1.1 | Obsługa wyłącznie z zewnątrz. |
| EU-04 | 4.1.2 | Rozdzielnica SN małogabarytowa maks. 3-polowa, izolacja gazowa, powietrzna albo stało-powietrzna. |
| EU-05 | 4.1.3 | Rozdzielnica nN z 5 polami z rozłącznikami bezpiecznikowymi wielkości 2. |
| EU-06 | 4.1.4 | Miejsce na szafę modułu bilansującego AMI po stronie nN. |
| EU-07 | 4.1.5 | Miejsce na sygnalizację zwarć (doziemnych i międzyfazowych) każdego pola liniowego SN, z przewodami od rozdzielnicy, sensorów prądowych (w kierunku odpływu) i sensorów napięciowych **do szafy AMI** (w Zeszycie 1 — do szafy telemechaniki). |
| EU-08 | 4.1.6 | Montaż i wymiana rozdzielnicy SN przez dach. |
| EU-09 | 4.1.7 | Obudowa żelbetowa samonośna chroniąca przed gorącymi gazami ze zwarć w rozdzielnicy SN. |
| EU-10 | 4.1.8 | Dopuszczalna indywidualna elewacja i rodzaj dachu. |
| EU-11 | 4.1.9 | Transport samochodowy. |
| EU-12 | 4.1.10 | Wymiary maks.: wysokość 1,9 m od znacznika zakopania do dachu, szerokość 1,25 m, długość 2,4 m. |
| EU-13 | 4.1.11 | Dla stacji budowanych po 01.01.2028: szerokość 2400 mm, głębokość 1300 mm, wysokość od znacznika zakopania 2100 mm. |
| EU-14 | 4.1.12–4.1.14 | Wentylacja grawitacyjna; IP 43; DTR po polsku. |
| EU-15 | rys. 1 (odczyt rysunku) | Rozdzielnica SN: dwa pola liniowe 630 A bez napędów silnikowych (rozłącznik, uziemnik, głowica C 630 A) i pole TR 200 A (rozłącznik, uziemnik, bezpiecznik, uziemnik, głowica A 250 A); 24 kV, 630 A, 16 kA. |
| EU-16 | rys. 1 (odczyt rysunku) | TR do 400 kVA, napięcie dolne 420 V, Dyn5; połączenie TR–nN 3 × 2 × N2XY 150 mm² i 2 × N2XY 150 mm²; rozdzielnica 0,4 kV: łącznik 630 A (opis „910 A”), 16 kA; CT 800/5; 5 odpływów 400 A; kondensator przez rozłącznik typu 000. |
| EU-17 | 4.3.1 | Rozdzielnica SN kompaktowa lub modułowa, izolacja gazowa, powietrzna albo stało-powietrzna. |
| EU-18 | 4.3.1 a | Jedno pole transformatorowe. |
| EU-19 | 4.3.1 b | Do dwóch pól liniowych, z możliwością ograniczników przepięć na głowicach Int C. |
| EU-20 | 4.3.1 c–f | Tabliczki z numerem, nazwą i kierunkiem linii przy napędach (nie na pokrywach kablowych); trwały schemat na obudowie; miejsce na schemat A4; uchwyty kablowe nieprzewodzące. |
| EU-21 | 4.3.2 | Wykonanie wnętrzowe; 24 kV; 3 fazy; 125/50 kV; 50 Hz; szyny 630 A; 16 kA (szyny, pole liniowe, uziemnik); 40 kA szczytowo; łuk wewnętrzny 16 kA przez 1 s. |
| EU-22 | 4.3.3 | Pole TR podstawowo: rozłącznik trzypołożeniowy z bezpiecznikami; opcjonalnie wyłącznik próżniowy z odłącznikiem-uziemnikiem i autonomicznym przekaźnikiem dla TR 160–630 kVA (przeciążenie, zwarcia doziemne i międzyfazowe). |
| EU-23 | 4.3.4 | Blokada zamknięty/uziemiony, pokrywa kablowa tylko w pozycji uziemionej, kłódka. |
| EU-24 | 4.3.5 | Rozłącznik pola TR: 200 A, M1/E2, wyzwalacz od przepalenia wkładki. |
| EU-25 | 4.3.6 | Zestaw rozłącznik–bezpieczniki: załączalny 40 kA, wyłączalny 16 kA, wybijak 80 N. |
| EU-26 | 4.3.7 | Wyłącznik pola TR: 200 A, 40 kA, 16 kA, M1/E2. |
| EU-27 | 4.3.8 | Pole liniowe z rozłącznikiem trzypołożeniowym; wyłącznik dopuszczony. |
| EU-28 | 4.3.9 | Pole liniowe: blokady jak w polu TR i kłódka. |
| EU-29 | 4.3.10 | Rozłącznik liniowy: 630 A, załączalny 40 kA, wyłączalny 630 A, M1/E2. |
| EU-30 | 4.3.11 | Wyłącznik liniowy: 630 A, 40 kA, 16 kA, M1/E2. |
| EU-31 | 4.3.12 | Przystosowanie do telemechaniki 24 V DC (sygnalizacja, sterowanie, pomiary) bez demontażu rozdzielnicy. |
| EU-32 | 4.3.13 | Sygnalizatory przepływu prądu zwarciowego albo układ zabezpieczeń (sieci kompensowane, z rezystorem, z rezystorem równoległym do dławika). |
| EU-33 | 4.3.14 | VDS na stałe we wszystkich polach liniowych i każdej fazie, z zaciskami do uzgadniacza faz. |
| EU-34 | 4.3.15 | Wskaźnik lub manometr gazu. |
| EU-35 | 4.4.1 | Łącznik główny nN: rozłącznik 910 A otwierany trójbiegunowo; 5 pól z rozłącznikami wielkości 2; wymiana bez demontażu szyn i bez ingerencji od komory TR. |
| EU-36 | 4.4.2 | Szyny Cu cynowane 40×10 mm, rozstaw 185 mm, nakrętki wprasowane, podziałka 100 mm (PPN), osłony rezerwy, szyna PEN 40×10 z zaciskami V ≥ 30 Nm do 240 mm², oznaczenie L1/L2/L3/PEN. |
| EU-37 | 4.4.3 a–l | Rozłączniki listwowe: rozstaw 185 mm; wielkość 00 na hakach lub adapterach; szerokość 50 mm (00) i 100 mm (2); praca pionowa; jednobiegunowe; zaciski V ≥ 30 Nm do 240 mm² (2) i ≥ 20 Nm do 150 mm² (00); niezależna wymiana; osłona zacisków; V-0; sygnalizacja przepalenia jednym sygnałem z listwy (obudowa ≥ V-2). |
| EU-38 | 4.4.3 m–n | Kategoria AC-23B dla rozłącznika z sygnalizacją przepalenia (wymagana od 01.01.2020); zamknięte korytko 40×60 mm do szafy AMI. |
| EU-39 | 4.4.4–4.4.7 | Uchwyty kablowe niemagnetyczne; osłony rezerwy V-0; uchwyty uziemiacza; miejsce na tabliczkę przy każdym aparacie. |
| EU-40 | 4.4.8 | CT 800/5 A kl. 0,2S, 5 VA, FS5, jednouzwojeniowe, nasuwane za łącznikiem głównym, wymienne bez demontażu mostu szynowego. |
| EU-41 | 4.4.9 | Gniazdo wtyczkowe zabezpieczone bezpiecznikiem topikowym 16 A. |
| EU-42 | 4.4.10 | Przekładniki przyłączone przez listwę kontrolno-pomiarową z zabezpieczeniem obwodów napięciowych. |
| EU-43 | 4.4.11 | Kondensator biegu jałowego przez rozłącznik bezpiecznikowy skrzynkowy **000**, przewód Cu ≥ 4 mm² 1,8/3 kV. |
| EU-44 | 4.4.12 | Miejsce na szafę AMI min. 620 × 800 × 245 mm; drzwi szaf otwierane bez ograniczeń. |
| EU-45 | 4.5 | Rozdzielnica nN: izolacja 690 V; szyny główne **630 A**; 16 kA przez 1 s. |
| EU-46 | 4.6.1 | TR–SN: 3 kable XLPE Al 70 mm² 12/20 kV z głowicami konektorowymi; w polu TR Int A, przy wyłączniku Int C; warstwa przewodząca uziemiona. |
| EU-47 | 4.6.2 a | TR–nN: kable Cu N2XY 0,6/1 kV 4 × 1 × 150 mm² do 250 kVA, 4 × 2 × 150 mm² powyżej 250 kVA. |
| EU-48 | 4.6.2 b–c | Zaciski bezkońcówkowe na 2 × 150 mm² bez zmniejszania przekroju; zaciski TR pod ograniczniki przepięć. |
| EU-49 | 4.7.1 a–f | Dwa prefabrykaty (bryła i dach); klasa obudowy ≥ 20 przy obciążeniu TR 400 kVA przez 6 h; beton C30/37; dach płaski z okapnikiem; przekładka gumowa; wentylacja grawitacyjna. |
| EU-50 | 4.7.1 g–i | Miejsce na szafkę AMI; oświetlenie z bezpiecznikiem; łączniki krańcowe drzwi z okablowaniem do przedziału AMI. |
| EU-51 | 4.7.1 j–l | Szczelna misa olejowa na objętość oleju TR 400 kVA; krata lub barierka dielektryczna z tabliczką; stabilność rozdzielnic, krawędzie gratowane. |
| EU-52 | 4.7.1 m–p | Dwa szczelne przepusty SN (5 bar wody, 3 bar gazu); przepusty nN z przegrodą do wysokości dolnej krawędzi drzwi; przepusty uziemienia jak wyżej; hydroizolacja piwnicy. |
| EU-53 | 4.7.1 q–u | Otwór ≥ 60 mm nad gruntem do zasilania odbiorców tymczasowych, zaślepiany od zewnątrz i demontowalny od wewnątrz; otwory transportowe; komplet 4 zawiesi; szczelne otwory dachowe; przewód uziemiający płaskownikiem lub przez zacisk krzyżowy pod gruntem. |
| EU-54 | 4.7.1 v–y | IAC-AB 16 kA/1 s; IK 10 (20 J); dach 2000 N/m²; TR na wibroizolatorach. |
| EU-55 | 4.7.2 | Elewacja z tynku strukturalnego odpornego na UV; dach z dwiema powłokami wg [64], [65] Zeszytu 1; kolorystyka i logotyp wg rys. 6. |
| EU-56 | 4.7.3 a–k | Stolarka Al lub stal cynkowana malowana proszkowo; C4 (Kesternich); dolna krawędź drzwi ≥ 15 cm; połączenia wyrównawcze; ukryte zawiasy nierdzewne; blokada przy 95°; ryglowanie dwupunktowe i kłódka; siatka ≤ 3 mm; blokady położenia otwartego; MASTER KEY; ocynk. |
| EU-57 | 4.8–4.9 | Uziemienie i oznakowanie wg 4.8 i 4.9 Zeszytu 1. |
| EU-58 | §5 | Wyposażenie opcjonalne: wskaźnik zanieczyszczenia, czujniki wiatru, wilgotności, temperatury i jakości powietrza (rys. 7). |
| EU-59 | §6 | Warunki nieodpłatnego korzystania z rozwiązania chronionego zgłoszeniem P.425507: powiadomienie właściciela, tablica informacyjna z czcionką ≥ 15 mm w kolorach RAL 9016 / RAL 9005 (rys. 8). |
| EU-60 | §7 | Inne rozwiązania wyłącznie decyzją Dyrektora Obszaru Dystrybucji. |

## 3. Rozdziały formalne (spis)

- §3 — normy wg Zeszytu 1.
- 4.10 — dokumentacja dostarczana ze stacją wg 4.10 Zeszytu 1.
- 4.11 — gwarancje wg 4.11 Zeszytu 1.
- §6 — warunki korzystania z wynalazku (informacyjne, bez wpływu na model).
- §8 — spis rysunków.

## 4. Decyzje właściciela (NIE są wymaganiami ENEA)

- **DECYZJA WŁAŚCICIELA 2026-11-13:** w sieci ENEA generalnie nie stosuje się reklozerów.
- **DECYZJA WŁAŚCICIELA 2026-11-14 (doprecyzowanie: wyłącznik poza GPZ tylko wyjątkowo):**
  typ aparatu „reklozer” (gotowy reklozer słupowy) jest wykluczony z profilu ENEA. Poza GPZ
  aparatem domyślnym pola liniowego jest rozłącznik trzypołożeniowy (Zeszyt 2 4.3.8). Wyłącznik
  z zabezpieczeniem i SPZ (Zeszyt 1 §5.5.1 „dopuszcza się”, standard telemechaniki §6.3.4,
  Katalog sygnałów „Punkt wyłącznikowy SN”) jest dopuszczony wyłącznie jako jawny wybór
  projektanta z uzasadnieniem: walidator zgłasza ostrzeżenie, a uzasadnienie trafia
  do raportu.
- **DECYZJA WŁAŚCICIELA 2026-11-13:** odgałęzienie na gołej szynie zakazane; z kabla tylko
  przez ZKSN, z linii napowietrznej przez słup z rozłącznikiem, mieszane przez słup
  z rozłącznikiem i głowicą.

## 5. Decyzje graficzne i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

- Brak napędów silnikowych na rys. 1 nie zakazuje napędów (4.3.12 wymaga przystosowania do
  telemechaniki 24 V DC); produkt nie wnioskuje z rysunku o braku napędu.
- Symbol styku z krzyżykiem w polu TR na rys. 1 jest cechą rysunku; rodzaj łącznika
  rozstrzyga tekst 4.3.3 (rozłącznik z bezpiecznikami).
- Kolorystyka, logotyp i tablica wynalazku (rys. 6, 8) nie są renderowane w SLD.

## 6. Luki i niejednoznaczności

1. **Łącznik główny 910 A (4.4.1) a szyny główne 630 A (4.5.2)** — prąd szyn niższy niż
   łącznika; rys. 1 opisuje łącznik zarówno „630 A”, jak i „910 A”. Ocena doboru przyjmuje
   jako ograniczenie toru mniejszą wartość (630 A) i podaje obie z numerami punktów.
2. **Rys. 1 — napięcie TR opisane „15/20 V”** zamiast kV (błąd jednostki).
3. **Kable TR–nN:** rys. 1 „3 × 2 × N2XY 150 + 2 × N2XY 150” (dwa na fazę), tekst 4.6.2 a
   „4 × 1 × 150 do 250 kVA, 4 × 2 × 150 powyżej”. Wiążący jest tekst, zależny od mocy TR.
4. **Rozłącznik kondensatora 000 (Z2 4.4.11) a 00 (Z1 4.4.11, Z6 4.4.11).**
5. **Szyny 40×10 (Z2 4.4.2) a 60×10 (Z1 4.4.2)** — różnica zamierzona (mniejsza moc), nie
   sprzeczność; odnotowana, żeby katalog nie przenosił wartości między wariantami.
6. **Sygnalizacja zwarć do szafy AMI (4.1.5) a telemechanika 24 V DC (4.3.12):** wariant
   uproszczony nie ma miejsca na szafę telemechaniki (brak odpowiednika Z1 4.2.5 i 4.4.13),
   a jednocześnie wymaga przystosowania pól do telemechaniki.
7. **Wysokość:** 4.1.10 maks. 1,9 m od znacznika zakopania, 4.1.11 (po 2028) 2100 mm od tego
   samego znacznika.
8. **Wyłącznik pola TR z przekaźnikiem dla TR 160–630 kVA (4.3.3 b)** w zeszycie ograniczonym
   do 400 kVA — zakres przekaźnika przeniesiony z Zeszytu 1 bez zawężenia.
9. **Reklozery:** 4.3.8 i 4.3.11 dopuszczają wyłącznik w polu liniowym; decyzja właściciela
   wyklucza reklozer, nie wyłącznik.
   **Rozstrzygnięte 2026-11-14** decyzją właściciela „wyłącznik poza GPZ tylko wyjątkowo”
   (sekcja decyzji właściciela): reklozer wykluczony z profilu ENEA; domyślnie rozłącznik
   trzypołożeniowy; wyłącznik z zabezpieczeniem i SPZ tylko jako jawny wybór projektanta
   z uzasadnieniem, ostrzeżeniem walidatora i uzasadnieniem w raporcie.

## 7. Mapa wdrożenia (stan głównego checkoutu, pomiar 2026-11-13)

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| EU-04, EU-18, EU-19 (1 TR + do 2 pól liniowych, ≤ 3 pola) | `backend/src/reference_engine/compliance.py:549` (`bay_composition`: 1–4 pola liniowe, ≤ 5) — brak rozróżnienia wariantu uproszczonego | brak (reguła tylko dla wariantu 630 kVA) |
| EU-01 (limit 400 kVA) | `backend/src/reference_engine/compliance.py:416` (limit 0,63 MVA dla prefabrykowanej) | brak wariantu 0,4 MVA dla stacji uproszczonej |
| EU-05, EU-35, EU-37 (rozdzielnica nN na rozłącznikach listwowych wielkości 2) | `backend/src/application/station_templates/_choices.py:122` (`NN_CB_OPTIONS` — wyłączniki); `backend/src/network_model/catalog/mv_auxiliary_catalog.py:645` (rozłączniki tylko 00 i 1) | sprzeczne |
| EU-16 (Dyn5, 420 V) | `backend/src/application/station_templates/_choices.py:22`; `backend/src/network_model/catalog/mv_transformer_catalog.py:494`, `:790` | sprzeczne |
| EU-21 (24 kV, 630 A) | `backend/src/application/station_templates/_choices.py:308`; `backend/src/network_model/catalog/mv_switch_catalog.py:308`–`330` | sprzeczne |
| EU-22, EU-24, EU-25 (pole TR na bezpiecznikach, bez 87T) | `backend/src/network_model/catalog/bay_templates.py:124`, `:168`, `:227` | sprzeczne |
| EU-27 (rozłącznik w polu liniowym), decyzja reklozerowa | `backend/src/network_model/catalog/bay_templates.py:83`, `:101`, `:211` | sprzeczne |
| EU-32 (sygnalizatory zwarć) | brak w modelu | brak |
| EU-47 (kable TR–nN 150 mm²) | brak reguły zależnej od wariantu i mocy TR | brak |
| wariant stacji | `backend/src/enm/models.py:1155`–`1185` — brak wartości „uproszczona 400 kVA” | brak |
| źródło wersji | `backend/src/reference_engine/packs/osd_enea/pack.json:9` — Zeszyt 2 w wersji 06.2024 od 01.01.2025 | zgodne |
