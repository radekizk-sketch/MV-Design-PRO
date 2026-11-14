# Standard ENEA — linie kablowe SN oraz pomiary i diagnostyka linii kablowych — kontrakt wiedzy produktu

Status: **BINDING** (Zasada nr 5 `CLAUDE.md`).
Dokument obejmuje spójną parę standardów ENEA Operator:

1. „Standard w sieci dystrybucyjnej — Elektroenergetyczne linie kablowe SN”, wersja 03.2026,
   uchwała Zarządu nr 202/2026, obowiązuje od 01.07.2026, zastępuje wersję 12.2023 (uchwała
   7/2024). Adres:
   `https://www.operator.enea.pl/media/4774/uslugi-dystrybucyjne/elektroenergetyczne-linie-kablowe-sn-obowiazuje-od-01072026pdf.pdf`.
   70 stron (część główna i załącznik A-1 „wytyczne projektowania linii kablowych SN” oraz
   załącznik O-1 osprzętu), SHA-256 zaczyna się od `a4f4f474` i kończy na `804afe`.
   Oznaczenie w tabeli: prefiks **ELK**; „§x” — część główna, „A-1 §x” / „A-1 tab. x” — załącznik
   A-1.
2. „Pomiary i diagnostyka linii kablowych WN i SN”, wersja 02.2026, uchwała Zarządu nr 203/2026,
   obowiązuje od 01.07.2026. Adres:
   `https://www.operator.enea.pl/media/4771/uslugi-dystrybucyjne/pomiary-i-diagnostyka-lk-wn-i-sn-wersja-022026pdf.pdf`.
   19 stron w dwóch zeszytach (Zeszyt 1 — procedury, Zeszyt 2 — tabele kryteriów), SHA-256
   zaczyna się od `3ac5c284` i kończy na `b21b8c`. Prefiks **EDK**; „Z1 §x” — Zeszyt 1,
   „Z2 tab. x” — Zeszyt 2.

Pobrano 2026-11-13. PDF, tekst i rysunki NIE są w repozytorium (prawa ENEA). Ten dokument zawiera
wyłącznie numery punktów, wartości liczbowe i własne sformułowania; nie jest cytatem.

## 1. Zakres stosowania w produkcie

- katalog typów kabli SN 12/20 kV (rodzina XUHAKXS1 i odmiany), osprzętu (mufy, głowice,
  głowice konektorowe) i parametrów elektrycznych (R, X, C, R0, X0, prąd ziemnozwarciowy,
  obciążalność długotrwała i zwarciowa żyły roboczej i powrotnej);
- model ENM: odcinek `cable`, żyła powrotna, sposób ułożenia (trójkąt, płasko), przejście kabla
  na słup linii napowietrznej, ZKSN jako punkt odgałęzienia na kablu;
- kreatory: magistrala, odgałęzienie, wyprowadzenie linii z GPZ, przyłącze klienta;
- schemat jednokreskowy: głowica kablowa, mufa, ogranicznik przepięć przy głowicy na słupie;
- walidator i gotowość: dopuszczalne przekroje dla rodzaju sieci, długość odcinka produkcyjnego;
- solwery i ocena doboru: dane wejściowe zwarciowe (R, X, R0, X0, C), obciążalność długotrwała,
  wytrzymałość zwarciowa żyły roboczej i powrotnej, prąd ziemnozwarciowy pojemnościowy (wejście
  do oceny ochrony przed porażeniem);
- raport i komentarz obliczeń: podstawa wartości z tabel A-1 oraz kryteria odbioru i diagnostyki
  (raport odbiorczy, karta techniczna kabla).

Wdrożenie jako **wariant standardu operatora**, nie jako literały. Tabele A-1 tab. 4.1 i 4.2
podają wartości normatywne; standard sam wskazuje, że do szczegółowych obliczeń stosuje się dane
producenta (luka L-03). Wartość z tabeli ENEA ma w modelu jakość źródła „standard operatora”,
nie `DATASHEET` producenta. Ocena zgodności — werdykt wyjaśnialny
(`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`).

## 2. Wymagania potwierdzone — linie kablowe SN

| Nr | Punkt | Wymaganie |
|----|-------|-----------|
| ELK-01 | §4.1 | Linie kablowe SN wykonuje się trzema jednożyłowymi kablami o izolacji XLPE ułożonymi w trójkąt. Dopuszczone wspólne ułożenie z kanalizacją światłowodową i wykop otwarty w terenie zadrzewionym z ochroną przed korzeniami (§6.1). |
| ELK-02 | §4.2.1, §4.3 | Typy kabli: XUHAKXS1, XRUHAKXS1 oraz odmiany „Xn” (uniepalniona powłoka HDPE co najmniej w klasie Eca). Znaczenie liter: X — powłoka HDPE odporna na UV, R — uszczelnienie poprzeczne, U — uszczelnienie wzdłużne, H — promieniowy rozkład pola, A — żyła Al okrągła wielodrutowa zagęszczona 70, 150 lub 240 mm², XS — izolacja XLPE. Kable te są podstawowym rozwiązaniem do ziemi, przecisków, przewiertów, powietrza (wejście na słup), budynków i kanałów. |
| ELK-03 | §4.2.1 tab. 2 | Klasa reakcji na ogień: Eca dla stacji z obsługą wewnętrzną i budynków stacji 110 kV; Fca dla ułożenia w ziemi i stacji z obsługą zewnętrzną. |
| ELK-04 | §4.2.2 tab. 3 | Typoszereg przejmowany do eksploatacji: kable 12/20 kV o przekroju żyły roboczej Al 70, 150 i 240 mm² z żyłą powrotną Cu 25 mm². |
| ELK-05 | §4.3, §4.4 | Zastosowanie wg rodzaju sieci; dobór kabli wg załącznika A-1. |
| ELK-06 | §5.1–§5.2, zał. O-1 tab. O-1 | Osprzęt w kompletnych zestawach z instrukcją i cechą zakładu; mufy przelotowe do kabli o izolacji wytłaczanej z badaniami typu B1(I)+B2 i wymaganiami tabeli O-1; liczba muf ograniczona do niezbędnego minimum. |
| ELK-07 | §5.3, tab. O-2 | Mufy przejściowe do kabli trójżyłowych o izolacji papierowej z badaniami typu B1(I)+B2 i wymaganiami tabeli O-2; rozmieszczenie muf tak, by nie przekroczyć dopuszczalnej siły ciągnięcia. |
| ELK-08 | §5.4, tab. O-3 | Głowice wnętrzowe i napowietrzne z badaniami typu A1+A2+A3 i wymaganiami tabeli O-3. |
| ELK-09 | §5.4 | Głowice konektorowe: typ C 630 A (grupy D1+D2) i typ A 250 A (D1+D2, z okiem operacyjnym D1+D2+D3); przyłącze zgodne z PN-EN 50180. Głowice konektorowe dotykowo bezpieczne; dopuszczone wyłącznie sensory napięciowe ze wspólnymi badaniami z głowicą w akredytowanym laboratorium. Montaż osprzętu tylko przez osoby przeszkolone (§5.5). |
| ELK-10 | §6.1 | Długość jednego odcinka kabla (bez muf) najwyżej 12 km. |
| ELK-11 | §6.2 | Na całej długości kabla w ziemi trwałe oznaczniki z tworzywa (wysokość 25–50 mm, szerokość 75–90 mm, grubość co najmniej 1,0 mm) z napięciem nominalnym sieci, typem i przekrojem kabla, rokiem budowy i nazwą operatora. |
| ELK-12 | §6.3, §6.5 | Czerwona perforowana taśma ostrzegawcza co najmniej 300 × 0,5 mm na wysokości 30 ±5 cm nad kablem oraz druga czerwona taśma z napisem ostrzegawczym na głębokości 30–35 cm pod powierzchnią gruntu; przy kilku liniach w jednym rowie taśmy nad każdym torem. |
| ELK-13 | §6.4 | Na kablach przyłączonych do rozdzielnicy SN (stacja, złącze, szafa) oznaczniki z numerem eksploatacyjnym linii, kierunkiem (numer stacji, szafy, złącza, słupa albo łącznika sieciowego) i typem linii; tablice opisowe na podejściach słupowych wg standardu numeracji i oznaczania obiektów sieciowych (wzory tablic: `STANDARD_ENEA_TABLICE_I_ZNAKI.md`). |
| ELK-14 | §6.5 | Kilka linii w jednym rowie wg odległości z A-1 §5.7 (tab. 5.11). |
| ELK-15 | §6.6 | Zapas kabla w kształcie litery S, co najmniej 2 m przy słupie. |
| ELK-16 | §6.7 | Kabel na słupie w rurze HDPE od co najmniej 0,5 m pod ziemią do 2,5 m nad ziemią, sztywność SN8, odporność na zgniatanie 750 N; ścianka wg tab. 4 (Ø75/4,5 mm, Ø110/6 mm, Ø160/8 mm); rura czarna odporna na UV, mocowana ramkami i taśmą nierdzewną co najwyżej co 1,0 m, górny koniec uszczelniony; kabel powyżej rury w uchwytach dystansowych co najwyżej co 1,5 m; ograniczniki przepięć na słupie; mostki przewodem w osłonie co najmniej 70 mm²; rozwiązania wg załącznika 1 standardu linii napowietrznych SN. |
| ELK-17 | §6.8 | Rury ochronne w ziemi o średnicy zewnętrznej co najmniej 160 mm tam, gdzie wymaga tego norma lub występują naprężenia mechaniczne. |
| ELK-18 | §7 | Żyła powrotna przyłączona obustronnie do uziemienia urządzenia lub stanowiska słupowego końcówkami śrubowymi lub zrywalnymi (styk metaliczny); zakaz łączenia żył powrotnych linii pod jednym zaciskiem. |
| ELK-19 | §8.2.1 tab. 5 | Średnica żyły roboczej: 70 mm² — 9,3–10,2 mm; 150 mm² — 13,7–15,0 mm; 240 mm² — 17,6–19,2 mm. Przeliczenie rezystancji na 20 °C współczynnikiem kt (Al 0,00403, Cu 0,00393 1/K). |
| ELK-20 | §8.2.2 | Izolacja: średnia grubość co najmniej 5,5 mm, różnica grubości najwyżej 0,7 mm. |
| ELK-21 | §8.2.3 | Żyła powrotna 25 mm² Cu: rezystancja najwyżej 0,714 Ω/km w 20 °C. |
| ELK-22 | §8.2.4 | Powłoka zewnętrzna: średnio co najmniej 2,50 mm, w najcieńszym miejscu co najmniej 2,10 mm. |
| ELK-23 | §8.2.5 tab. 9 | Średnica zewnętrzna kabla: 70 mm² — 30,4–35,2 mm (35,5 dla odmiany wzmocnionej); 150 mm² — 33,2/33,4–39,2/39,5 mm; 240 mm² — 38,2–44,1/44,3 mm. |
| ELK-24 | §3 tab. 1 | Wykonawca przy odbiorze kabla sprawdza cechowanie, powłokę, kapturki na końcach, średnicę zewnętrzną (§8.2.5) i średnicę rdzenia bębna; minimalna średnica rdzenia bębna: 70 mm² — 700/720 mm (1000 mm przy przewijaniu); 150 mm² — 780/800 mm (1100 mm); 240 mm² — 880 mm (1200 mm). |
| ELK-25a | §8.1 | Produkcja w zakładach z nadzorem jakości i identyfikowalnością materiałów; bez substancji zakazanych w UE, z dokumentem potwierdzającym dla każdej partii — wymaganie formalne zakupowe. |
| ELK-25 | §9 | Linie w obiektach budowlanych spełniają wymagania ochrony przeciwpożarowej z przepisów techniczno-budowlanych — rozdział formalny. |
| ELK-26 | §10 | Wyroby fabrycznie nowe, wyprodukowane nie wcześniej niż w roku poprzedzającym zlecenie, z certyfikatami jednostek akredytowanych, deklaracją zgodności i deklaracją właściwości użytkowych; gwarancja na roboty i elementy linii, w tym kabel, co najmniej 60 miesięcy od odbioru. |
| ELK-27 | §11 | Dokumentacja projektowa (część prawna i techniczna) i powykonawcza — rozdział formalny. |
| ELK-28 | §12 | Badania odbiorcze: rezystancja izolacji, ciągłość żył, szczelność powłoki, próba napięciowa, współczynnik strat tgδ i wyładowania niezupełne — wg standardu diagnostyki (EDK). |
| ELK-29 | §13 | W uzgodnieniu z zarządzającym siecią telekomunikacyjną: rura HDPE dla światłowodu we wspólnym rowie z kablami SN, co najmniej Ø40 mm, ścianka co najmniej 3,7 mm; przy słupie co najmniej 2,5 m nad ziemią i 0,5 m pod ziemią; rury ochronne w ziemi; wymagania do projektu i dokumentacji powykonawczej sieci optotelekomunikacyjnej. |
| ELK-30 | §14 | Rozwiązania inne — decyzją dyrektora właściwego oddziału dystrybucji. |
| ELK-31 | A-1 tab. 3.1 | Masa, dopuszczalna siła ciągnięcia (za żyłę / za pończochę) i promień gięcia: 70 mm² — 1050 kg/km, 2,1/1,6 kN, 0,53 m; 150 mm² — 1500 kg/km, 4,5/3,4 kN, 0,60 m; 240 mm² — 1850 kg/km, 7,2/5,5 kN, 0,65 m. |
| ELK-32 | A-1 tab. 4.1 | Parametry 12/20 kV (R DC 20 °C / R AC 90 °C żyły roboczej; R DC 20 °C / R AC 90 °C żyły powrotnej; R0; X0; C; Xc przy 20 kV): 70 mm² — 0,443 / 0,568; 0,714 / 0,890; 1,45; 0,076 Ω/km; 0,18 µF/km; 18,1 kΩ·km. 150 mm² — 0,206 / 0,265; 0,714 / 0,890; 0,71; 0,061 Ω/km; 0,23 µF/km; 13,8 kΩ·km. 240 mm² — 0,125 / 0,161; 0,714 / 0,890; 0,60; 0,054 Ω/km; 0,27 µF/km; 11,6 kΩ·km. |
| ELK-33 | A-1 tab. 4.2 | Prąd ziemnozwarciowy pojemnościowy przy 20 kV / przeliczony na 15 kV i prąd ładowania [A/km]: 70 mm² — 2,25 / 1,69 / 0,66; 150 mm² — 2,82 / 2,11 / 0,87; 240 mm² — 3,39 / 2,54 / 1,04. Indukcyjność, reaktancja i impedancja w trójkącie (powłoki stykają się): 70 — 0,420 mH/km, 0,132 Ω/km, 0,583 Ω/km; 150 — 0,370, 0,116, 0,289; 240 — 0,340, 0,108, 0,194. Płasko, odstęp 70 mm: 70 — 0,710, 0,222, 0,610; 150 — 0,640, 0,200, 0,331; 240 — 0,600, 0,187, 0,247. Wartości normatywne; do szczegółowych obliczeń dane producenta. |
| ELK-34 | A-1 §4.2.1–§4.2.3 | Założenia doboru: kabel 12/20 kV, udarowe wytrzymywane co najmniej 125 kV; żyła 90 °C przed zwarciem, 250 °C przy zwarciu; grunt 20 °C, powietrze 25 °C; głębokość 0,7–1,1 m; rezystywność cieplna gruntu 1,0 K·m/W; współczynnik obciążenia 0,7 w ziemi, 1,0 w powietrzu; trójkąt stykający. |
| ELK-35 | A-1 tab. 4.3 | Obciążalność zwarciowa 1 s żyły roboczej / powrotnej i długotrwała w ziemi / w powietrzu (trójkąt): 70 mm² — 6,6 / 5,3 kA, 260 / 248 A; 150 mm² — 14,1 / 5,3 kA, 398 / 392 A; 240 mm² — 22,6 / 5,3 kA, 523 / 527 A (obciążalność wg PN-HD 620 S3 cz. 10R). |
| ELK-36 | A-1 tab. 4.4 | Obliczeniowa temperatura otoczenia: powietrze w cieniu i pomieszczenia zamknięte +25 °C, ziemia +20 °C. |
| ELK-37 | A-1 tab. 4.5 | Jednosekundowa gęstość prądu zwarciowego żył Al XLPE do 250 °C w funkcji temperatury przed zwarciem: 20 °C — 120 A/mm², 30 — 116, 40 — 113, 50 — 109, 60 — 105, 70 — 102, 80 — 98, 90 °C — 94 A/mm². |
| ELK-38 | A-1 tab. 4.6 | Obciążalność zwarciowa żyły powrotnej Cu 25 mm² w funkcji czasu zwarcia: 0,1 s — 15,3 kA; 0,2 s — 11,1; 0,3 s — 9,1; 0,5 s — 7,2; 0,8 s — 5,8; 1,0 s — 5,3; 1,5 s — 4,4; 2,0 s — 3,9; 3,0 s — 3,3 kA. |
| ELK-39 | A-1 §4.2.6 | Osprzęt o napięciu co najmniej 12/20 kV dobierany do typu, przekroju i materiału żył, napięcia i warunków pracy; dopuszczony ogranicznik przepięć na głowicy konektorowej i głowica sprzęgająca. |
| ELK-40 | A-1 §5.1.2 tab. 5.1 | W sieciach 15 kV i 20 kV kable 12/20 kV. Linie kablowo-napowietrzne: 70 i 150 mm² (240 mm² opcjonalnie, gdy wynika z obliczeń); linie kablowe: 70, 150 i 240 mm²; wyprowadzenia linii z GPZ: 150 i 240 mm²; żyła powrotna 25 mm² (50 mm² opcjonalnie dla wyprowadzeń z GPZ). |
| ELK-41 | A-1 §5.1.3 | Kable opancerzone przy naprężeniach rozciągających i pod wodą; osłony z tworzyw przy przemieszczeniach gruntu i prądach błądzących. |
| ELK-42 | A-1 §5.4.2 | Głębokość ułożenia co najmniej 80 cm, co najmniej 100 cm pod gruntami ornymi i leśnymi. |
| ELK-43 | A-1 §5.4.3 | Przy układaniu warstwowym odstęp warstw co najmniej 15 cm. |
| ELK-44 | A-1 §5.7–§5.9 | Odległości od kabli innych linii, urządzeń podziemnych, rurociągów, dróg, torów i cieków wg tablic 5.11 i dalszych — wymagania trasowe. |
| ELK-45 | A-1 §6, rys. 6.1–6.5 | Wprowadzenie kabla na słup linii napowietrznej; odczyt rys. 6.3: słup krańcowy z głowicami kablowymi i rozłącznikiem. |
| ELK-46 | A-1 §7 | Ograniczniki przepięć przy głowicach kablowych w miejscach połączenia z linią napowietrzną. |

## 3. Wymagania potwierdzone — pomiary i diagnostyka linii kablowych

| Nr | Punkt | Wymaganie |
|----|-------|-----------|
| EDK-01 | Z1 §2.2 | Próby odbiorcze SN dla nowej relacji: sprawdzenie montażu, ciągłość żył roboczych i powrotnych, rezystancja izolacji, szczelność powłok, próba napięciowa z tgδ, wyładowania niezupełne; dla nowej części relacji przed połączeniem — bez tgδ i wyładowań, a po połączeniu próby eksploatacyjne całości. |
| EDK-02 | Z1 §2.2.2 | Ciągłość żył sprawdza się źródłem prądu stałego o napięciu najwyżej 24 V. |
| EDK-03 | Z1 §2.2.3 | Rezystancja izolacji miernikiem co najmniej 2,5 kV; dla kabli dłuższych niż 1 km wynik przelicza się na 1 km: R1km = Rzm · l. |
| EDK-04 | Z1 §2.2.4 | Szczelność powłoki SN: napięcie stałe 5 kV przez 1 min; bez przebicia między żyłą powrotną a ziemią. |
| EDK-05 | Z1 §2.2.5 | Próba nowej relacji SN: VLF sinus 0,1 Hz, kroki U0, 2U0, 3U0 dla każdej fazy, 3U0 przez 30 min, z tgδ; przy pojemności fazy poniżej 12 nF (długość graniczna około 70 m) bez tgδ — 3U0 przez 30 min; nowa część relacji — 3U0 przez 30 min sinusem albo VLF CP. |
| EDK-06 | Z1 §2.2.6 | Wyładowania niezupełne SN dla każdej fazy, VLF sinus 0,1 Hz, do 3U0. |
| EDK-07 | Z1 §2.3 | Próby eksploatacyjne SN nie rzadziej niż raz na 30 lat lub po usunięciu awarii: ciągłość, izolacja, powłoki (poza odcinkami połączonymi z kablem PILC), próba U0/1,5U0/2U0 z tgδ, 2U0 przez 30 min (bez tgδ poniżej 12 nF), wyładowania do 2U0. |
| EDK-08 | Z2 §2 | Skala oceny stanu: 1 — uszkodzony, natychmiastowa naprawa; 2 — sprawny, stan krytyczny izolacji lub uszkodzona powłoka; 3 — obniżony; 4 — dobry; 5 — bardzo dobry. |
| EDK-09 | Z2 tab. 1 | Odbiór SN: R1km ≥ 100 MΩ → 5, poniżej → 1; ciągłość zachowana → 5, brak → 1; powłoka i próba 3U0 bez przebicia → 5, przebicie → 1. |
| EDK-10 | Z2 tab. 1 | Odbiór SN, izolacja PE: tgδ(2U0) ≤ 1,2·10⁻³ i przyrost tgδ(2U0)−tgδ(U0) ≤ 0,6·10⁻³ → 5; tgδ(2U0) ≤ 2,2·10⁻³ i przyrost ≤ 1·10⁻³ → 4; więcej → 1. Wyładowania: Ui > 1,3U0, Ue > 1,1U0, najwyżej 50 pC dla kabla i 100 pC dla osprzętu przy 2U0 → 5; Ui i Ue > U0 lub 50–100 pC kabel / 100–200 pC osprzęt → 4; Ui ≤ U0 lub ponad 100 / 200 pC → 1. |
| EDK-11 | Z2 tab. 1 | Odbiór SN, izolacja papierowa lub PVC: tgδ(2U0) < 50·10⁻³ i przyrost < 10·10⁻³ → 5; 50–60·10⁻³ → 4; ponad 60·10⁻³ lub przyrost ponad 20·10⁻³ → 1. Wyładowania: do 100 pC kabel i 200 pC osprzęt → 5; 100–200 / 200–500 pC → 4; więcej → 1. |
| EDK-12 | Z2 tab. 2 | Eksploatacja SN: R1km < 100 MΩ → 2; przebicie powłoki → 2; tgδ(2U0) w przedziale 2,2–3,2·10⁻³ lub przyrost ponad 1·10⁻³ → 3; ponad 3,2·10⁻³ → 2; pozostałe progi jak przy odbiorze. |
| EDK-13 | Z1 §3.2 | Odbiór WN: montaż, rezystancja uziemienia skrzynek cross-bondingowych, rezystancja żył (metoda techniczna, prąd stały co najmniej 60 A, klasa 0,5), pojemność (odchyłka najwyżej ±8% od danych producenta, raport producenta z partii), izolacja (2,5 kV, przeliczenie na 1 km), powłoka 10 kV DC przez 1 min, próba RTS 2U0 przez 60 min z rejestracją wyładowań i tgδ w krokach U0, 1,5U0, 2U0; gdy RTS niemożliwy — załączenie z sieci 110 kV na 24 h. |
| EDK-14 | Z1 §3.3 | Eksploatacja WN nie rzadziej niż raz na 5 lat: pojemność (±8% od protokołu odbioru), izolacja, powłoka. |
| EDK-15 | Z1 §3.4 | WN po wyłączeniu trwałym dłuższym niż 30 dni: pojemność, izolacja, powłoka i załączenie z sieci 110 kV na co najmniej 24 h. |
| EDK-16 | Z2 tab. 3–5 | Kryteria WN dla odbioru, eksploatacji i stanu po wyłączeniu (rezystancja uziemienia skrzynek cross-bondingowych najwyżej 10 Ω, rezystancja izolacji co najmniej 1000 MΩ·km). |

## 4. Decyzje i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

1. **DECYZJA WŁAŚCICIELA 2026-11-13 — odgałęzienie od kabla wyłącznie przez ZKSN**, rysowane jak
   stacja bez transformatora; odgałęzienie na gołej szynie zabronione. Standard linii kablowych SN
   nie zawiera tej reguły (nie opisuje mufy odgałęźnej SN ani jej zakazu) — to decyzja produktu.
2. Wybór przekroju 150 mm² jako domyślnego w kreatorze magistrali jest decyzją produktu;
   standard dopuszcza 70, 150 i 240 mm² zależnie od rodzaju sieci (ELK-40).
3. Wybór, czy solwer zwarciowy używa wartości z tab. 4.1/4.2 czy z karty producenta, jest decyzją
   architekta (L-03); standard nie narzuca metody obliczeń IEC 60909.
4. Rysowanie głowicy kablowej i ogranicznika na schemacie (symbol, kolejność) — decyzja graficzna
   produktu (B-02).

DECYZJA WŁAŚCICIELA 2026-11-13, doprecyzowana 2026-11-14 (decyzja produktu, nie wymaganie
ENEA): „w ENEA nie stosujemy reklozerów”, „wyłącznik poza GPZ tylko wyjątkowo”. W złączu kablowym
SN (ZKSN) i rozdzielni sieciowej SN domyślnym aparatem pola jest rozłącznik; typ „reklozer” jest
wykluczony; wyłącznik z zabezpieczeniem w złączu pojawia się tylko jako jawny wybór projektanta
z uzasadnieniem widocznym w wyjaśnieniu i raporcie. Dokumenty 4774 i 4771 nie regulują aparatury
złączy, więc nie ma tu sprzeczności z tekstem standardu; aparat wyłączający poza GPZ dopuszczany
przez standard linii napowietrznych SN opisano w `STANDARD_ENEA_LINIE_NAPOWIETRZNE_SN.md` (L-01).

## 5. Luki i niejednoznaczności

- **L-01.** Tab. 4.1 podaje X0 (0,054–0,076 Ω/km) mniejsze niż X1 z tab. 4.2 (0,108–0,132 Ω/km
  w trójkącie). Jest to możliwe przy powrocie prądu przez żyły powrotne uziemione obustronnie,
  ale standard nie opisuje modelu, z którego wartości wyprowadzono (sposób uziemienia powłok,
  rezystywność gruntu). Do weryfikacji przez architekta przed użyciem w solwerze (Zasada nr 6,
  `NORMA_IEC_60909_0_2016.md`).
- **L-02.** Tab. 4.1 podaje rezystancję żyły powrotnej 0,714 Ω/km jako wartość DC 20 °C, a §8.2.3
  używa jej jako górnej granicy (najwyżej 0,714 Ω/km). Model produktu wyprowadza
  17,241/25 = 0,690 Ω/km z przekroju.
- **L-03.** Uwaga pod tab. 4.2: wartości są normatywne, a do szczegółowych obliczeń stosuje się dane
  producenta. Standard nie mówi, co ma pierwszeństwo przy ocenie zgodności ze standardem.
- **L-04.** Tab. 5.1 oznacza 240 mm² w liniach kablowo-napowietrznych jako opcjonalny, a tab. 3
  części głównej wymienia 240 mm² bez zastrzeżeń.
- **L-05.** Zeszyt 1 §3.4 diagnostyki odsyła do „Zeszytu nr 3, tabeli nr 5”, a tabela 5 jest
  w Zeszycie 2 (dokument nie ma Zeszytu 3) — omyłka redakcyjna.
- **L-06.** Zeszyt 1 §2.2.6 każe mierzyć wyładowania niezupełne przy odbiorze do 3U0, a kryteria
  Zeszytu 2 tab. 1 podane są dla 2U0.
- **L-08.** §6.4 odsyła do standardu „Zasady numeracji i oznaczania obiektów sieciowych”, którego
  nie ma w wykazie dokumentów grupy B; wzory tablic są w standardzie tablic i znaków (695).
- **L-07.** Standard nie podaje parametrów kabli innych niż XUHAKXS1 (np. NA2XS(F)2Y) — kable
  takie nie są typoszeregiem ENEA.

## 6. Mapa wdrożenia (stan kodu 2026-11-13, `/home/user/MV-Design-PRO/mv-design-pro`)

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| ELK-02, ELK-04, ELK-40 (typoszereg) | `backend/src/network_model/catalog/mv_cable_line_catalog.py:1901-1990` (`CABLE_ENEA_OPERATOR_STANDARD_TYPES`) | **Sprzeczne:** rekord `cable-enea-operator-xruhakxs-1x120` (`:1903`) — przekrój 120 mm² nie należy do typoszeregu ENEA; rekordy `cable-enea-operator-na2xs2y-1x150` (`:1947`) i `-1x240` (`:1969`) — typ NA2XS2Y nie jest typem ENEA, a nazwa „ENEA Operator standard” sugeruje wymaganie standardu. Brak rekordu ENEA 70 mm² i 150 mm² rodziny XRUHAKXS. |
| ELK-32, ELK-33 (R, X, C) | `mv_cable_line_catalog.py:1903-1945` (ENEA 240: X = 0,099 Ω/km, C = 340 nF/km), `:1947-1967` (150: X = 0,107, C = 290 nF/km), `:588-600` i `:620-680` (bazowe Al 70/150/240: X = 0,123/0,108/0,099, C = 220/285/340 nF/km); `:104-108` (`ENEA_OPERATOR_CABLE_SOURCE_REFERENCE`) | **Sprzeczne z tab. 4.1/4.2:** ENEA podaje X (trójkąt) 0,132/0,116/0,108 Ω/km i C 180/230/270 nF/km. Pojemność katalogu jest o 22–26% wyższa, co zawyża prąd ziemnozwarciowy pojemnościowy. Opis źródła mówi, że brak dokumentu ENEA — dokument jest już w tym pliku wiedzy. |
| ELK-32 (R0, X0) | `mv_cable_line_catalog.py:200-220` (R0 = R1 + R żyły powrotnej, X0 = 3·X1 jako wartości robocze) | **Sprzeczne z tab. 4.1:** dla 150 mm² model daje X0 ≈ 0,32 Ω/km wobec 0,061 Ω/km i R0 ≈ 0,90 Ω/km wobec 0,71 Ω/km w standardzie (z zastrzeżeniem L-01). |
| ELK-35 (obciążalność długotrwała) | `mv_cable_line_catalog.py:1903-1990` (`rated_current_a` 255/410/310/420 A), `:599`, `:637`, `:675` (bazowe 190/305/410 A) | **Sprzeczne z tab. 4.3:** ENEA 260/398/523 A w ziemi i 248/392/527 A w powietrzu dla 70/150/240 mm². Katalog zaniża obciążalność 240 mm² o około 22%. |
| ELK-37 (gęstość prądu zwarciowego) | `mv_cable_line_catalog.py:48` (`JTH_AL_XLPE = 94.0`) | Zgodne z tab. 4.5 (90 °C → 94 A/mm²). |
| ELK-21, ELK-38 (żyła powrotna 25 mm²) | `mv_cable_line_catalog.py:113-118`, `:141-171` (R i Ith żyły powrotnej z przekroju, wartości robocze) | Częściowe: rezystancja 0,690 Ω/km mieści się w limicie 0,714 Ω/km; brak tablicy obciążalności zwarciowej żyły powrotnej w funkcji czasu (tab. 4.6). |
| ELK-10 (odcinek ≤ 12 km), ELK-42/43 (głębokość) | brak | Walidator nie sprawdza; model nie niesie głębokości ułożenia. |
| ELK-16, ELK-45, ELK-46 (przejście na słup, głowice, ograniczniki) | brak obiektu „słup z głowicami” w ENM; `backend/src/enm/domain_operations.py:8254-8283` (słup rozgałęźny tylko na linii) | **Brak** przejścia napowietrze–kabel jako obiektu modelu (zob. `STANDARD_ENEA_LINIE_NAPOWIETRZNE_SN.md`, ELN-39/ELN-42). |
| DECYZJA WŁAŚCICIELA (odgałęzienie od kabla przez ZKSN) | `domain_operations.py:8280-8284` (ZKSN tylko na kablu), `:8591` (`insert_zksn_on_segment_sn`), `backend/src/network_model/catalog/mv_branch_point_catalog.py:152-205` (ZKSN z rozłącznikami 630 A) | Zgodne z decyzją. |
| EDK-01–EDK-16 (diagnostyka) | brak | Poza obliczeniami sieci; dotyczy raportu odbiorczego i karty eksploatacji, których produkt dziś nie ma. |
