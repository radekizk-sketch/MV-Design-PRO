# Standard ENEA SN — telemechanika stacji SN/nN i ZKSN oraz katalog sygnałów

Status: **BINDING** (dyrektywa właściciela 2026-11-12; Zasada nr 5 w `CLAUDE.md`, wzorzec formy
`STANDARD_ENEA_GPZ_Z1.md`).

Źródła (oba poza repozytorium, prawa ENEA):

1. ENEA Operator sp. z o.o., „Standardy w sieci dystrybucji — Linie i stacje
   elektroenergetyczne średniego napięcia. Telemechanika”, wersja 12.2025, obowiązuje od
   01.02.2026, zatwierdzona uchwałą Zarządu nr 8/2026; zastępuje Zeszyt 5 „Telemechanika”
   w wersji 12.2024 (uchwała 223/2025). Adres pobrania:
   `https://www.operator.enea.pl/media/3463/uslugi-dystrybucyjne/linie-i-stacje-elektroenergetyczne-sredniego-napiecia-telemechanika`,
   pobrany 2026-11-12, 18 stron, SHA-256 pliku zaczyna się od `d995de38` i kończy na `f612`.
2. ENEA Operator sp. z o.o., „Katalog standardowych sygnałów i pomiarów”, zatwierdzony
   29.07.2020 (obowiązuje od 01.09.2020), zmiana z 04.05.2022 obowiązująca od 16.05.2022,
   zatwierdzony przez Dyrektora Departamentu Zarządzania Ruchem. Adres pobrania:
   `https://www.operator.enea.pl/media/696/katalog-standardowych-sygnalow-pomiarow-04052022pdf.pdf`,
   pobrany 2026-11-12, 40 stron, SHA-256 pliku zaczyna się od `eb4ae8cc` i kończy na `e3c7`.

Dokument zawiera wyłącznie numery punktów, wartości liczbowe i własne sformułowania.
Zakres grupy A: wymagania dotyczące **stacji kompaktowych SN/nN i ZKSN**. Wymagania
wyłącznie dla linii napowietrznych (szafa sterownicza na słupie, 6.1.1; zasilanie z przekładnika
linii, część 6.7.2) są wymienione dla kompletności z oznaczeniem „linia napowietrzna”, ale
ich mapa wdrożenia należy do pliku standardu linii napowietrznych SN.

Prefiksy: `ET-` — standard telemechaniki 12.2025; `ETS-` — Katalog sygnałów 2022.

## 1. Zakres stosowania w produkcie

- model ENM: wyposażenie pola liniowego stacji i ZKSN w pomiar U i I (sensory),
  napęd 24 V DC, blokadę zdalnego sterowania, sygnalizator przepływu prądu zwarciowego albo
  zabezpieczenie przy wyłączniku; zasilanie potrzeb własnych ZKSN z przekładnika SN/nN;
- katalog: sensory napięciowe i prądowe, sygnalizatory zwarć, sterowniki, przekładnik
  potrzeb własnych ZKSN ≥ 1200 VA;
- zabezpieczenia: zestaw funkcji wyłącznika z zabezpieczeniem (6.3.4) i kryteria
  sygnalizatorów zwarć (6.3.2) jako podstawa oceny konfiguracji pola;
- Reference Engine: reguła `telemechanika.line_bay_u_i_measurement` i pokrewne;
- SLD i inspektor: oznaczenie pomiaru U/I i sygnalizatora w polu;
- raport: lista sygnałów pola wg Katalogu sygnałów (nazwy pól, sygnały DW/OS, pomiary).

Ocena zgodności jest werdyktem wyjaśnialnym; brak wyposażenia telemechaniki w modelu nie
jest zgodnością; wartość robocza (`ESTIMATED`) daje dowód `NIEPELNY`.

## 2. Wymagania potwierdzone — standard telemechaniki 12.2025

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| ET-01 | §1–§2 | Standard dotyczy linii napowietrznych SN, stacji kompaktowych SN/nN i ZKSN; wymagania są minimalne. |
| ET-02 | §3–§5 | Normy, definicje (ETSI, TCCA, TETRA) i dokumenty związane — spis formalny. |
| ET-03 | 6.1.1 | (linia napowietrzna) Szafa sterownicza na słupie — zakres pliku standardu linii napowietrznych SN. |
| ET-04 | 6.1.2 | Szafa telemechaniki w stacji i ZKSN: anteny przez istniejące przepusty; dolna krawędź szafy 0,15–1,5 m nad posadzką; przewody w zamkniętych korytkach. |
| ET-05 | 6.1.2 | Urządzenia pracują w −20…+50 °C (bez baterii); swobodna wymiana urządzeń. |
| ET-06 | 6.1.2 | Obudowa ze stali nierdzewnej albo aluminium malowanego 75 ± 25 µm, przyczepność klasy 0; grzałka PTC; wprowadzenia przez dławiki albo złącze wielopinowe. |
| ET-07 | 6.1.2 | Zamek MASTER KEY trzypunktowy z możliwością kłódki; przełącznik trybu zdalne / lokalne / odstawione z sygnałem do systemu. |
| ET-08 | 6.1.2 | Bateria bezobsługowa ≥ 16 Ah, żywotność ≥ 6 lat w 25 °C, pozwalająca wykonać 10 cykli WZ (wyłącz–załącz) w ciągu min. 24 h po zaniku napięcia ładowania; gniazdo 230 V IP20. |
| ET-09 | 6.1.2 | Łącznik krańcowy drzwi szafy z sygnałem odrębnym od sygnału drzwi stacji; opisy po polsku; oznaczniki przewodów; sterownik obiektowy; wymiary wg standardu stacji (Zeszyt 1: min. 700 × 500 × 320 mm); znak CE. |
| ET-10 | 6.1.3 | Sterownik: łączność podstawowa TETRA, rezerwowa GSM; modem 4G/2G (700–2600 MHz) z automatycznym przełączaniem; terminal TETRA zewnętrzny lub zintegrowany; połączenie z systemem dyspozytorskim; obsługa 3 adresów IP. |
| ET-11 | 6.1.3 | Protokoły: DNP3.0 (szeregowo, over IP, over SDS), IEC 60870-5-101/103/104, Modbus RTU/TCP; DNP3 over SDS dla TETRA, DNP3 over IP dla GSM i LAN; aktualizacja oprogramowania przez SCP/SFTP/HTTPS; konfiguracja szyfrowana TLS; zdalny zimny restart. |
| ET-12 | 6.1.4 | Obie anteny (TETRA i GSM) obowiązkowe z pomiarem poziomu sygnału; w stacji antena TETRA dopuszczalnie na zewnątrz, GSM wewnątrz lub na zewnątrz. |
| ET-13 | 6.1.5 | Miejsce na terminal TETRA min. 70 × 200 × 220 mm; terminal zgodny z ETSI i certyfikatem IOP; zasilanie 12 V DC, ≤ 6 A, moc 3–10 W; pasmo 380–430 MHz; interfejsy RS232/RS485/Ethernet; antena BNC; PPP/SNDCP; diagnostyka; obsługa kluczy SCK/DCK/CCK/GCK; szyfrowanie TEA1; licencje SDS dla DNP3/101 do 1000 znaków, transmisja wieloszczelinowa, wiele kanałów sterujących, GPS, funkcje kill/unkill, migracja. |
| ET-14 | 6.2.2 | Sterownik stacji: 1 × Ethernet, 2 × RS232, 2 × RS485; wejścia i wyjścia binarne oraz analogowe w liczbie wynikającej z rozdzielnicy. |
| ET-15 | 6.2.3 | Porty: RS232 300–19 200 b/s, RS485 1200–115 200 b/s. |
| ET-16 | 6.2.4 | Wejścia binarne 24 V DC ± 20 %, próg 15 V, pobór ≤ 8 mA, stan „1” = obecność napięcia, izolacja galwaniczna, wykrywanie < 10 ms. Wyjścia przekaźnikowe ≥ 24 V DC i ≥ 100 mA, styk NO bez zasilania, izolowane, przewody 0,5–1,5 mm². |
| ET-17 | 6.3.1 | Komunikacja TCP/UDP z ICMP i kontrolą przepływu; kanał inżynierski; zestaw danych diagnostycznych; dziennik zdarzeń ≥ 5 dni; diody stanu; uwierzytelnianie użytkowników. |
| ET-18 | 6.3.1 | Bezpieczeństwo: AES-128 do konfiguracji, AES-256 do łączności ze SCADA; certyfikaty X.509 (PKI) z SCEP/EST i weryfikacją OCSP/CRL; VPN IPsec IKEv2; IEC/TS 62351-5 i PN-EN 62351-3; dwa niezależne źródła czasu. |
| ET-19 | 6.3.2 | Przy rozłącznikach: moduł sygnalizacji zwarć z funkcją TEST i KASOWANIE; działanie w sieciach z automatyką AWSC i z punktem neutralnym uziemionym przez rezystor; kryteria doziemne konduktancyjne, admitancyjne i nadprądowe kierunkowe; pomiary I i U; kasowanie i konfiguracja zdalne; nieulotny rejestr zdarzeń; ≥ 4 banki nastaw. |
| ET-20 | 6.3.3 | Przy wyłączniku wyposażonym tylko w sygnalizator — wymagania jak w 6.3.2. |
| ET-21 | 6.3.4 | Wyłącznik z zabezpieczeniem: każda funkcja z atrybutem „wyłączenie” albo „sygnalizacja”; łącze inżynierskie; ≥ 12 wejść i ≥ 4 wyjścia binarne; 2 × RS485 (albo Ethernet); blokada napięciowa 24 V DC. |
| ET-22 | 6.3.4 | Funkcje zabezpieczenia: nadprądowe fazowe kierunkowe; ziemnozwarciowe kierunkowe, konduktancyjne i admitancyjne; mocowe czynne i bierne; asymetria prądowa; U>, U<, U0; asymetria napięciowa; SPZ; f< i f>; df/dt (ROCOF z blokadą napięciową, możliwość dostawienia zabezpieczenia SCO). |
| ET-23 | 6.3.4 | Rejestracja zdarzeń i zakłóceń w formacie COMTRADE: min. 5 zapisów po 3 s (bufor 15 s); ≥ 4 banki nastaw. |
| ET-24 | 6.4.1 | Pomiar napięcia sensorami (dzielnik pojemnościowy albo rezystancyjny) w każdym polu liniowym; pomiar prądu podstawowo przetwornikami prądowymi, dopuszczone sensory kombinowane i przekładniki prądowe — w każdym polu liniowym. |
| ET-25 | 6.4.2 | Napędy łączników 24 V DC; sygnalizacja położenia łączników SN dwubitowa. |
| ET-26 | 6.4.3 | Każde pole liniowe z blokadą zdalnego sterowania zdejmowaną wyłącznie lokalnie. |
| ET-27 | 6.4.4 | Pola liniowe przystosowane do telemechaniki 24 V DC; podłączenie sygnalizacji, sterowania i pomiarów bez demontażu rozdzielnicy. |
| ET-28 | 6.5.1–6.5.3 | Zasilacz: trwała tabliczka (producent, typ, numer seryjny, parametry), znak CE widoczny po zabudowie, jednoznaczne oznaczenie złącz. |
| ET-29 | 6.6.1 | Akumulatory: dane znamionowe (producent, typ, numer, napięcie, pojemność, technologia, data produkcji), symbole bezpieczeństwa, CE wg rozporządzenia UE 2023/1542. |
| ET-30 | 6.7.1 | Układ 24/12 V DC z akumulatorami jest głównym źródłem zasilania obwodów szafy telemechaniki (łączność, sterownik, wykrywanie zwarć, sterowanie, sygnalizacja). |
| ET-31 | 6.7.2 | Zasilanie układu DC z 230 V AC: w stacji SN/nN z obwodu nN stacji; (linia napowietrzna) z przekładnika ≥ 400 VA przez zabezpieczenie w skrzynce SBI. |
| ET-32 | 6.7.2 | W ZKSN: z przekładnika napięciowego SN/nN o mocy ≥ 1200 VA, zabudowanego w polu zasilającym ZKSN dla złącza bez układu pomiarowego; bezpieczniki po stronie SN przekładnika; zabezpieczenie przewodów strony nN możliwie blisko przekładnika; przewód zasilający Cu ≥ 2,5 mm², o podwyższonej izolacji. |
| ET-33 | 6.7.3–6.7.6 | Napięcia DC 24 V i 12 V; zakres w pracy buforowej: terminal TETRA 10,8–15,6 V, sterownik i modem GSM 20,5–25,5 V; napięcie ładowania z kompensacją temperaturową do 29 V. |
| ET-34 | 6.7.7–6.7.10 | Zabezpieczenia zwarciowe po stronie AC i DC; obwody baterii i zasilania 24 V DC w rozdzielnicy SN przewodem ≥ 2,5 mm²; każdy obwód DC zabezpieczony; bateria z dwóch akumulatorów 12 V zabezpieczona możliwie blisko zacisków. |
| ET-35 | 6.7.11–6.7.13 | Pojemność baterii ≥ 16 Ah; technologia VRLA AGM albo żelowa; ochrona przeciwprzepięciowa na wejściu 230 V AC. |
| ET-36 | 6.7.14 | Odłączenie przy głębokim rozładowaniu 21 V ± 0,5 V; ładowanie z termiczną regulacją napięcia; automatyczny test baterii nie rzadziej niż co 24 h (ciągłość, rozładowanie, uszkodzenie). |
| ET-37 | 6.7.15–6.7.16 | Sygnały: praca z baterii (brak 230 V), niskie napięcie baterii (21 V), awaria baterii, awaria zasilacza — przez wyjścia binarne albo RS232/RS485 protokołami z 6.1.3. |
| ET-38 | 6.7.17–6.7.20 | Diagnostyka diodami LED; oznaczenie złącz; tabliczka i CE; montaż na TH35 (poza akumulatorami); sprawność > 90 %; IP20; zgodność z PN-EN 60950, PN-EN 61000-6-2, PN-EN 61000-6-3. |
| ET-39 | 6.7.21–6.7.23 | Bateria: praca 0…+50 °C, ładowanie 0…+40 °C, rozładowanie 0…+50 °C, przechowywanie −20…+40 °C, projektowa żywotność ≥ 12 lat w 25 °C; naładowanie do stanu nominalnego ≤ 24 h; dopuszczalna budowa modułowa. |

## 3. Wymagania potwierdzone — Katalog standardowych sygnałów i pomiarów (2022)

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| ETS-01 | nazwy pól SN | Kanoniczne nazwy pól SN w sygnałach: TR1–TR4 (transformator), SE (sekcyjne), SP (sprzęgło), SZR, BKR1/BKR2, PN1/PN2 (pomiar napięcia), ZU1/ZU2, ODGROMNIK, KIERUNEK (pole liniowe opisane kierunkiem); pozostałe obiekty: SYG_CENTRALNA, PW 400/230 V AC, PW 220/110 V DC. |
| ETS-02 | Stacja SN nn (s. 36) — sygnały dwubitowe (DW) | Położenia i stany: rozłącznik (R), wyłącznik (W), wskaźnik zwarcia (WZ), napięcie (U), blokada SPZ (blSPZ), aktywny bank nastaw (BANK1–BANK4), blokada zabezpieczeń (blZAB), kasowanie wskaźników (KASZW), tryb pracy (TRYB), praca, stan, oraz sygnały lokalne i blokady (OL, OS, OT, UL, UP, UOS, UT). |
| ETS-03 | Stacja SN nn — sygnały jednobitowe (OS) | Alarmy kryteriów zwarciowych (OC1, OC3, EF, SEF), awaria panelu, ciśnienie SF6, otwarcie drzwi stacji i szafki, brak napięcia silnika napędu, przepalenie wkładki bezpiecznika, awaria sterownika pola, pobudzenia i zadziałania I>, I>>, Ik>T, Ik>>T, Io>, admitancyjne EU>, kierunkowe IN>T, U<, U>, f<, f>, SPZ. |
| ETS-04 | Stacja SN nn — pomiary | P (MW), Q (Mvar), napięcia fazowe U1–U3 i międzyfazowe U12/U23/U31 (kV), prądy I1–I3 i Io (A), częstotliwość F (Hz), tg φ, cos φ, parametry łączności GSM. |
| ETS-05 | Punkt rozłącznikowy SN (s. 33) | Rozłącznik (R), napięcie (U), wskaźnik zwarcia (WZ), tryb pracy punktu (sygnalizator albo sekcjonalizer), blokady funkcji zwarciowej i ziemnozwarciowej, pobudzenia I>, I>>T, Io>. |
| ETS-06 | Punkt wyłącznikowy SN (s. 34) | Wyłącznik (W), napięcie (U), wskaźnik zwarcia (WZ), blokada SPZ, praca na linii, „cykl SPZ nieudany”, „definitywne wyłączenie” — obiekt wyłącznika liniowego z SPZ. |
| ETS-07 | Linia SN z generacją (s. 27), automatyka AVR, farma wiatrowa, farma fotowoltaiczna | Odrębne listy sygnałów — zakres plików źródeł OZE i automatyki (poza grupą A). |

## 4. Rozdziały formalne (spis)

- §3 — normy; §4 — definicje; §5 — dokumenty związane.
- §7 — gwarancje dla elementów telemechaniki.
- §8 — informacje dodatkowe: parametryzację systemu SCADA zapewnia ENEA Operator.
- §9 — tryb odstępstw.

## 5. Decyzje właściciela (NIE są wymaganiami ENEA)

- **DECYZJA WŁAŚCICIELA 2026-11-13:** w sieci ENEA generalnie nie stosuje się reklozerów.
  Produkt nie proponuje reklozera w polu stacji ani ZKSN, mimo że standard telemechaniki
  (ET-22, funkcja SPZ) i Katalog sygnałów (ETS-06, punkt wyłącznikowy z SPZ) opisują
  wyłącznik z SPZ — patrz luka 1.
- **DECYZJA WŁAŚCICIELA 2026-11-13:** odgałęzienia — z kabla przez ZKSN, z linii przez słup
  z rozłącznikiem, mieszane przez słup z rozłącznikiem i głowicą; na gołej szynie zakazane.
  Katalog sygnałów zna „Punkt rozłącznikowy SN” (ETS-05), co jest zgodne z decyzją.

## 6. Decyzje graficzne i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

- Nazwy pól z Katalogu sygnałów (ETS-01) są konwencją nazewnictwa sygnałów SCADA; jako
  oznaczenia pól na SLD można ich używać tylko jako decyzji produktu, nie jako wymagania
  graficznego ENEA.
- Pole „SP” (sprzęgło) w Katalogu sygnałów jest nazwą sygnałową dla obiektów, które sprzęgło
  mają (np. GPZ); nie dowodzi, że ZKSN lub stacja SN/nN ma mieć sprzęgło.

## 7. Luki i niejednoznaczności

1. **Reklozer / wyłącznik z SPZ:** ET-21–ET-23 (funkcja SPZ w wyłączniku z zabezpieczeniem)
   i ETS-06 (punkt wyłącznikowy SN z „cyklem SPZ” i „definitywnym wyłączeniem”) opisują
   urządzenie funkcjonalnie równe reklozerowi. Decyzja właściciela z 2026-11-13 mówi, że ENEA
   generalnie nie stosuje reklozerów. Obie wersje zapisane; produkt stosuje decyzję
   właściciela, a punkt wyłącznikowy z SPZ dopuszcza wyłącznie jako jawny wyjątek projektanta
   (z podstawą: standard telemechaniki 6.3.4).
2. **„Pole zasilające ZKSN” (6.7.2):** rysunki ZKSN w Zeszycie 1 (rys. 4a–4j) nie wyróżniają
   pola zasilającego; rys. 4b pokazuje przekładnik na odpływie kablowym pola 1, poza
   rozdzielnicą. Standard telemechaniki nie definiuje pojęcia. Produkt przyjmuje pole
   zasilające w stanie normalnym układu i zapisuje to w wyjaśnieniu.
3. **Przekładnik ZKSN 1200 VA (6.7.2) a bezpiecznik 0,5 A z rys. 4b Zeszytu 1** — moc
   przekładnika nie jest podana na rysunku; wartości nie są sprzeczne, ale nie są zestawione.
4. **Zeszyt 1 §2 nadal wymienia Zeszyt 5,** który ten standard zastąpił.
5. **Pomiar prądu (6.4.1):** standard dopuszcza przekładniki prądowe obok przetworników
   i sensorów; reguła w produkcie sprawdzająca obecność CT i VT nie odróżnia rozwiązania
   podstawowego od dopuszczonego.
6. **Katalog sygnałów 2022 a standard 12.2025:** Katalog nie zawiera sygnałów układu
   zasilania z 6.7.15 w brzmieniu z 2025 r. (niskie napięcie baterii 21 V); nazewnictwo
   sygnałów zasilania należy uzupełnić przy wdrożeniu listy sygnałów.
7. **Kryteria sygnalizatorów (6.3.2)** nie mają wartości progów — nastawy pozostają po
   stronie projektu (wartość robocza `ESTIMATED` przy braku danych).

## 8. Mapa wdrożenia (stan głównego checkoutu, pomiar 2026-11-13)

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| ET-24 (U i I w każdym polu liniowym, sensory) | `backend/src/reference_engine/compliance.py:573` (`telemechanika.line_bay_u_i_measurement`), `:421` (`_OSD_LINE_BAY_ROLES` = IN, OUT) — reguła sprawdza przekładniki CT i VT | częściowo (nie rozpoznaje sensorów jako rozwiązania podstawowego) |
| ET-24, ET-25, ET-26 | `backend/src/reference_engine/packs/osd_enea/pack.json` — reguły `telemechanika.line_bay_u_i_measurement`, `telemechanika.qualification_not_regulated` | częściowo; brak reguł dla napędu 24 V DC, sygnalizacji dwubitowej i blokady zdalnej |
| ET-26 (blokada zdalnego sterowania) | `backend/src/enm/interlock_rules.py:31` | do sprawdzenia przy wdrożeniu (reguły blokad łączeniowych, nie blokada telemechaniki) |
| ET-19, ET-20 (sygnalizatory zwarć) | brak obiektu sygnalizatora w ENM i katalogu (0 plików) | brak |
| ET-21–ET-23 (wyłącznik z zabezpieczeniem, SPZ) | `backend/src/network_model/catalog/mv_switch_catalog.py:540` (`SWITCH_RECLOSERS`); `backend/src/network_model/catalog/bay_templates.py:211` (REKLOZER w rolach IN/OUT/FEEDER); `frontend/src/ui2/kreatory/stacja/stacjaModel.ts:1011`; `frontend/src/ui2/kreatory/stacja/generatorSldPola.ts:259`; `frontend/src/ui2/kreatory/zrodlo/zrodloModel.ts:766`–`780` | sprzeczne z decyzją właściciela (reklozer proponowany jako aparat pola) |
| ET-32 (przekładnik potrzeb własnych ZKSN ≥ 1200 VA) | `backend/src/network_model/catalog/mv_branch_point_catalog.py:47` (`_zksn_field_specs` — pola WE, WY, ODG bez przekładnika potrzeb własnych) | brak |
| ETS-01 (nazwy pól) | `frontend/src/ui2/kreatory/stacja/stacjaSzablony.ts:44` (COUPLER = „SPRZEGLO”) | rozbieżne nazewnictwo (Katalog: SP); dotyczy obiektów ze sprzęgłem |
| ETS-02–ETS-06 (lista sygnałów pola) | brak listy sygnałów pola w modelu i raporcie | brak |
| źródło wersji | `backend/src/reference_engine/packs/osd_enea/pack.json:11` — odwołanie do standardu telemechaniki 12.2025 (od 01.02.2026, zastępuje Zeszyt 5) | zgodne |
| źródło Katalogu sygnałów | `backend/src/reference_engine/packs/osd_enea/pack.json:7`–`13` — brak odwołania do Katalogu standardowych sygnałów i pomiarów (2022) | brak |
