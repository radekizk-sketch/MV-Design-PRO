# Standard ENEA — układy pomiarowe energii elektrycznej — kontrakt wiedzy produktu

Status: **BINDING** (Zasada nr 5 `CLAUDE.md`). Uzupełnia kontrakt domenowy
`docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`, który opiera się na tym samym standardzie (tam
oznaczonym [E-UP]) — ten plik jest wykazem wymagań z numerami punktów.
Źródło: ENEA Operator, „Standard w sieci dystrybucyjnej — Układy pomiarowe energii
elektrycznej”, wersja 05.2022-2, uchwała Zarządu nr 179/2022 zmieniona uchwałą 7/2024, obowiązuje
od 02.04.2024. Adres:
`https://www.operator.enea.pl/media/698/uklady-pomiarowe-energii-elektrycznej-obowiazuje-od-02042024pdf.pdf`.
36 stron (17 stron części głównej i załącznik „konfigurator układów pomiarowych” z załącznikami
1–10), SHA-256 zaczyna się od `3d514abf` i kończy na `e69db6`. Pobrano 2026-11-13.
PDF, tekst i rysunki NIE są w repozytorium (prawa ENEA). Ten dokument zawiera wyłącznie numery
punktów, wartości liczbowe i własne sformułowania; nie jest cytatem. Prefiks **EUP**; „zał. N” —
załącznik konfiguratora.

## 1. Zakres stosowania w produkcie

- katalog: przekładniki prądowe i napięciowe pomiarowe (przekładnia, klasa, moc, FS, Ith),
  liczniki, listwy kontrolno-pomiarowe, rezystory dociążające;
- model ENM: pole pomiarowe SN, złącze kablowe SN z pomiarem, złącze pomiarowe SN, słup SN
  z pomiarem, pomiar nN w złączu (bezpośredni, półpośredni), granica stron i własność elementów;
- kreatory: przyłącze odbiorcy i wytwórcy (dobór rodzaju układu wg mocy i napięcia, dobór
  przekładnika wg mocy przyłączeniowej);
- schemat jednokreskowy: przekładniki pomiarowe, pomiar przed/za granicą stron, kolejność
  przekładnika napięciowego przed prądowym;
- ocena doboru przekładnika (`domain/dobor_przekladnika.py`): zakres prądu pierwotnego,
  obciążenie wtórne, FS, klasa;
- raport: protokół doboru układu pomiarowego z podstawą punktów.

Wdrożenie jako **wariant standardu operatora**. Ocena zgodności — werdykt wyjaśnialny
(`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`).

## 2. Wymagania potwierdzone

| Nr | Punkt | Wymaganie |
|----|-------|-----------|
| EUP-01 | §1–§2 | Standard dotyczy nowych i modernizowanych punktów poboru energii na wszystkich poziomach napięć; dokumentacja układów w instalacji odbiorcy uzgadniana z wydziałem układów pomiarowych. |
| EUP-02 | §3 | Definicje: granica stron, instalacja odbiorcy i odbiorcza, miejsce przyłączenia, mikroinstalacja (OZE o mocy elektrycznej najwyżej 50 kW przyłączona poniżej 110 kV albo kogeneracja do 150 kW cieplnych przy najwyżej 50 kW elektrycznych), wytwórca (bez mikroinstalacji), zabezpieczenie przedlicznikowe, złącze kablowe SN z pomiarem, złącze pomiarowe SN, słup SN z pomiarem z telemechaniką lub bez. |
| EUP-03 | §5.1 ust. 1–2 | Układ pomiarowy w miejscu wskazanym w warunkach przyłączenia; lokalizacja złącza, słupa lub szafy z pomiarem zapewnia nieograniczony i bezpieczny dostęp. |
| EUP-04 | §5.1 ust. 3 | W budynkach wielolokalowych pomiary jak najbliżej miejsca dostarczania, poza lokalami, w zamykanych szafkach lub pomieszczeniach technicznych. |
| EUP-05 | §5.1 ust. 4–5 | Części pod napięciem co najmniej 30 cm nad posadzką (50 cm, gdy grozi zalanie); bez miejsc z drganiami, hałasem i polem elektromagnetycznym. |
| EUP-06 | §5.1 ust. 6–7 | Wszystkie urządzenia od granicy stron do układu pomiarowego włącznie zabezpieczone przed dostępem i przystosowane do plombowania; trwały opis zabezpieczenia przedlicznikowego i tablicy licznikowej. |
| EUP-07 | §5.1 ust. 8 | Przedział licznika bezpośredniego co najmniej 24 × 38 × 20 cm; montaż bez naruszania konstrukcji, plombowanie, pion; pole odczytowe co najmniej 48 cm nad gruntem w złączach i szafach wolnostojących (dolna krawędź tablicy TL-3 co najmniej 29 cm nad posadowieniem), w pozostałych przypadkach 80–180 cm; transmisja danych GSM. |
| EUP-08 | §5.2 ust. 1–3 | Układy półpośrednie i pośrednie trójsystemowe: obwody napięciowe czteroprzewodowe, prądowe sześcioprzewodowe; trasy obwodów wtórnych jak najkrótsze; pomiar napięcia (w układach operatora) wyprowadzony **przed** przekładnikami prądowymi, patrząc od strony zasilania. |
| EUP-09 | §5.2 ust. 4–12 | Obwody wtórne w osłonach: przewody Cu co najmniej 1,5 mm² (napięciowe) i 2,5 mm² (prądowe), izolacja co najmniej 750 V; poza tablicą kable 0,6/1 kV, osobne dla obwodów napięciowych i prądowych; N niebieski, PE żółto-zielony; bez wspólnego prowadzenia z instalacją odbiorczą; dławiki na wejściach. |
| EUP-10 | §5.2 ust. 13 | Listwa kontrolno-pomiarowa co najmniej 16-polowa, plombowana osłona, izolacja co najmniej 500 V, bezpieczniki obwodów napięciowych, zwieranie torów prądowych, gniazda aparatury kontrolnej, przy zaciskach sprężynowych jedna końcówka na zacisk. |
| EUP-11 | §5.2 ust. 15 | Zabezpieczenie obwodów napięciowych: WN — po stronie wtórnej wkładki szybkie 2–6 A; SN — po stronie pierwotnej wkładki 0,3–0,8 A i po stronie wtórnej szybkie 2–6 A (w układach napowietrznych i małych rozdzielnicach wnętrzowych za zgodą operatora bez zabezpieczeń pierwotnych); półpośrednie — szybkie 2–6 A. |
| EUP-12 | §5.2 ust. 16–17 | Obwody jednolite bez zbędnych połączeń; zaciski wtórne uziemione — w przekładnikach prądowych początki uzwojeń wtórnych, w napięciowych punkt gwiazdowy; przewody uziemiające do uziemienia lub uziemionej szyny PEN. |
| EUP-13 | §6 | Odbiorca będący jednocześnie wytwórcą — zasady własności jak dla odbiorcy. |
| EUP-14 | §6.1 | Odbiorcy grup III, IV, V i VI poniżej 1 kV: układ pomiarowy i transmisja danych należą do operatora. |
| EUP-15 | §6.2 | Odbiorcy grup II i VI powyżej 1 kV: pomiar w sieci operatora — całość własnością operatora; pomiar w instalacji odbiorcy — liczniki i transmisja operatora, przekładniki i pozostałe elementy z obwodami wtórnymi odbiorcy. |
| EUP-16 | §6.3 | Wytwórcy (bez III grupy i mikroinstalacji): jak §6.2 — w sieci operatora całość operatora; w instalacji wytwórcy liczniki i transmisja operatora, przekładniki i obwody wtórne wytwórcy. |
| EUP-17 | §6.4 | Wytwórcy III grupy (bez mikroinstalacji): układ i transmisja własnością operatora. |
| EUP-18 | §6.5 | Mikroinstalacje: układ pomiarowy własnością operatora. |
| EUP-19 | §7 tab. 1 | 0,4 kV do 40 kW (zabezpieczenie przedlicznikowe do 63 A) — pomiar bezpośredni; 0,4 kV powyżej 40 kW — półpośredni; SN i wyżej — pośredni w złączu kablowym SN z pomiarem, złączu pomiarowym SN, na słupie SN (przekładniki najwyżej 50-100/5 A kl. 0,2S wg zał. 5B), w polu WN lub SN stacji 110 kV/SN, w rozdzielni sieciowej 110 kV albo w polu WN rozdzielni 110 kV klienta. |
| EUP-20 | §8.1 | Pomiar bezpośredni: w budownictwie jednorodzinnym na zewnątrz budynku albo w linii ogrodzenia (przy przyłączu kablowym); w wielorodzinnym i usługowym na zewnątrz, zbiorczo w pomieszczeniu technicznym albo w miejscu ogólnodostępnym; poza granicą stron osobne przedziały zabezpieczeń przedlicznikowych i liczników; transmisja GSM. |
| EUP-21 | §9 | Pomiar półpośredni: w złączu kablowym nN z pomiarem (wg standardu szaf i złączy) albo w instalacji podmiotu wg uzgodnionej dokumentacji. |
| EUP-22 | §10.1 | Pomiar pośredni: przekładniki w polu WN lub SN stacji 110 kV/SN, w polu WN rozdzielni sieciowej 110 kV lub rozdzielni klienta, w złączu kablowym SN z pomiarem, w złączu pomiarowym SN, na słupie SN (z telemechaniką lub bez); pozostałe elementy odpowiednio w nastawni, złączu albo na słupie. |
| EUP-23 | §10.2 | Wyposażenie przedziału pomiarowego u odbiorcy/wytwórcy: szafa lub tablica z uchylną płytą, tablice TL-3F, zabezpieczenie obwodów VT, listwa kontrolno-pomiarowa, rezystory dociążające (opcja), napięcie gwarantowane z osobnym zabezpieczeniem dla poboru co najmniej 800 kW, listwa w obudowie typu S, gniazdo podwójne 230 V, moduł komunikacyjny (opcja). |
| EUP-24 | §10.3 | Szafa pomiarowa w nastawni stacji 110 kV/SN: drzwi z podglądem liczników, płyty otwierane co najmniej o 90°, co najmniej dwie drogi transmisji (np. GSM i ETH), zasilanie gwarantowane 230 V AC, każdy licznik osobno przez wyłącznik 6 A, dodatkowy obwód 230 V przez wyłącznik 16 A i co najmniej dwa gniazda 16 A na płytach. |
| EUP-25 | §11 | Przekładniki pomiarowe ze świadectwem wzorcowania (GUM/OUM lub laboratorium akredytowane); zakresy mocowe wg zał. 1–3. |
| EUP-26 | §11.1 | Prąd pierwotny wynikający z mocy umownej w granicach 20–120% prądu znamionowego przekładnika (za zgodą operatora przeciążalność do 200% przy zachowanej klasie). Dla źródeł: klasa 0,5 — 20–120%; klasy 0,5S i 0,2 — 5–120%; klasa 0,2S — 1–120%. |
| EUP-27 | §11.1 | Obciążenie strony wtórnej przekładników prądowych i napięciowych 25–100% mocy znamionowej uzwojenia; dociążenie atestowanymi rezystorami w plombowanych obudowach. Zalecana klasa 0,2S na wszystkich poziomach napięć. FS najwyżej 5 (za zgodą operatora najwyżej 10). |
| EUP-28 | §11.1 pkt 1–3 | Przekładniki do 1 kV dla pomiaru półpośredniego dostarcza operator (zał. 4); dla 1–30 kV dane w zał. 5, schematy w zał. 7–10; powyżej 30 kV wg standardów stacji 110 kV i zał. 6. |
| EUP-29 | §11.2 | Przekładniki napięciowe w klasie wg IRiESD lub lepszej; uzwojenie 0–10 VA nie wymaga rezystorów dociążających, inne 25–100%; dodatkowe uzwojenie co najmniej 40 VA do zasilaczy i analizatora jakości, gdy brak napięcia gwarantowanego; bezpieczniki po stronie górnego i dolnego napięcia (WN i uzasadnione przypadki SN — tylko wtórne); obciążenie uzwojenia nie przekracza mocy znamionowej. |
| EUP-30 | §12–§13 | Liczniki statyczne wg IRiESD; dodatkowy interfejs licznika udostępniany klientowi przez urządzenia optoizolowane, bez gwarancji kompatybilności po wymianie licznika. |
| EUP-31 | §14 | Plombowaniu podlegają płyty z licznikami i listwami, osłony listew, zabezpieczenia przedlicznikowe, bezpieczniki obwodów napięciowych, drzwiczki celek i napędy odłączników pól pomiaru napięcia, obudowy rezystorów dociążających. |
| EUP-32 | §15–§16 | Wyroby nowe z certyfikatami akredytowanymi (rozdział formalny). Rozwiązania inne — decyzją dyrektora departamentu zarządzania informacją pomiarową (WN), dyrektora oddziału dystrybucji (SN) albo dyrektora rejonu dystrybucji (nN). |
| EUP-33 | zał. 1 | Przekładniki 0,4 kV kl. 0,2S: 200 A — od 2 kW (wytwórcy) / ponad 40 kW (klienci) do 143 kW; 400 A — od 3 kW / ponad 143 kW do 286 kW; 800 A — od 6 kW / ponad 286 kW do 572 kW (moc przy tgφ 0,4; dobór do maksymalnej mocy przyłączeniowej). |
| EUP-34 | zał. 2 | Przekładniki SN — górne granice mocy przyłączeniowej: przy 6 kV — 5 A: 52 kW, 15 A: 156 kW, 50 A: 520 kW, 100 A: 1039 kW, 200 A: 2078 kW, 400 A: 4157 kW; przy 15 kV — 130, 390, 1299, 2598, 5196, 10 392 kW; przy 20 kV — 173, 520, 1732, 3464, 6928, 13 856 kW. 5 A i 15 A nieprzełączalne, 50-100 A i 200-400 A przełączalne; dolne granice mocy zależne od klasy (0,2S / 0,2 i 0,5S / 0,5) i od tego, czy chodzi o wytwórcę, czy klienta. Zalecana klasa 0,2S. |
| EUP-35 | zał. 3 | Przekładniki 110 kV kl. 0,2S przełączalne 150-300 A: 150 A do 34 MW, 300 A do 68 MW; alternatywnie za zgodą 75-150-300 A (75 A do 17 MW). |
| EUP-36 | zał. 4 | Przekładniki 0,4 kV: kl. 0,2S, wtórny 5 A, FS ≤ 5, 5 VA, przeciążalność co najmniej 120%, Ith = 60·Ipn, Um 0,72 kV, Up 3 kV, IP20, nakładane na szynę 40×5 (800 A — 60×5) lub kabel 1×240, wymiary najwyżej 105 × 125 × 60 mm, praca od −25 do +50 °C. |
| EUP-37 | zał. 5A | Wsporcze przekładniki SN rozdzielcze (24 kV, rdzeń rozliczeniowy kl. 0,2S FS5 10 VA, Ith 16 kA dla mniejszej przekładni, rdzeń pomiaru lokalnego kl. 0,2 FS5 10 VA): pole BKR 100/5; pola liniowe 200-400/5; pola transformatorowe 1000/5, 1600/5, 800/5, 1200/5 (z rdzeniami zabezpieczeniowymi wg standardów stacji). |
| EUP-38 | zał. 5B | Wsporcze przekładniki SN sieciowe (24 kV, kl. 0,2S FS5, 5 VA): pole pomiarowe w rozdzielni operatora dla odbiorcy — 5/5 A (Ith 2 kA) i 15/5 A (Ith 8 kA); pole liniowe odbiorcy-wytwórcy — 50-100/5 A i 200-400/5 A (Ith 8 kA); słup SN odbiorcy — 5/5 i 15/5 A; słup SN odbiorcy-wytwórcy — 50-100/5 A (Ith 8 kA). |
| EUP-39 | zał. 5C–5D | Toroidalne przekładniki SN rozdzielcze i sieciowe — odpowiedniki zał. 5A i 5B (izolacja 24/0,72 kV). |
| EUP-40 | zał. 5E | Przekładniki napięciowe SN pola transformatorowego: 6:√3 / 0,1:√3 / 0,1:√3 / 0,1:√3 kV (izolacja 7,2 kV), 15:√3 i 20:√3 (izolacja 24 kV); uzwojenie pomiarowe 0–10 VA kl. 0,2, uzwojenie drugie 7,5 VA kl. 0,5, wzorcowane. |
| EUP-41 | zał. 5F | Przekładniki napięciowe pola pomiarowego klienta: te same przekładnie, uzwojenie pomiarowe 0–10 VA kl. 0,2 wzorcowane. |
| EUP-42 | zał. 6 | Przekładniki kombinowane WN — dane dla pomiaru pośredniego powyżej 30 kV. |
| EUP-43 | zał. 7 | Odczyt schematu zasadniczego złącza kablowego SN z pomiarem: licznik rozliczeniowy i licznik kontrolny, przekładniki prądowe 5/5, 15/5 lub 50-100/5 A 5 VA kl. 0,2S FS5, przekładniki napięciowe z bezpiecznikami po stronie pierwotnej, listwa kontrolno-pomiarowa, uziemienie początków uzwojeń wtórnych i punktu gwiazdowego. |
| EUP-44 | zał. 8–10 | Schematy zasadnicze: złącze pomiarowe SN (zał. 8), słup SN z pomiarem i telemechaniką (zał. 9), słup SN z pomiarem (zał. 10) — wspólna zasada EUP-08 i EUP-11. |

## 3. Decyzje i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

1. Zasada „pomiar rozliczeniowy nie obejmuje tranzytu magistrali” i klasy A/B/C przyłączeń
   (`POMIAR_ROZLICZENIOWY_SN_V1.md` §1–§3) są wnioskiem produktu z zał. 5B i §7, a nie
   dosłownym wymaganiem ENEA. Wymaganiem ENEA są miejsca układu (EUP-19, EUP-22)
   i przekładnie (EUP-38).
2. Domyślna długość gałęzi klienta 1000 m i wybór pozycji katalogowej odcinka klienta
   (`POMIAR_ROZLICZENIOWY_SN_V1.md` §4) — decyzje produktu.
3. Kolejność rysowania przekładnika napięciowego i prądowego na schemacie wynika z EUP-08
   (napięcie przed przekładnikami prądowymi od strony zasilania); rozmiar i styl symboli —
   decyzja graficzna (B-02).

## 4. Luki i niejednoznaczności

- **L-01.** Zał. 2 podaje dolne granice mocy osobno dla wytwórców i klientów oraz dla klas, ale
  §11.1 podaje dla źródeł zakres procentowy zależny od klasy — tabela i tekst muszą dać ten sam
  dobór; produkt powinien liczyć z §11.1 i sprawdzać z tabelą.
- **L-02.** Zał. 5A: Ith 16 kA dla przekładników SN rozdzielczych jest mniejsze niż typowe prądy
  zwarciowe szyn GPZ 20 kV (do 20–25 kA); standard odsyła po pełne dane do standardów stacji
  (grupa C indeksu).
- **L-03.** Zał. 7 odczytano ze schematu zasadniczego; wartości bezpieczników pierwotnych VT na
  schemacie nie są opisane liczbowo — obowiązuje zakres 0,3–0,8 A z §5.2 ust. 15.

## 5. Mapa wdrożenia (stan kodu 2026-11-13, `/home/user/MV-Design-PRO/mv-design-pro`)

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| EUP-19, EUP-22 (miejsca pomiaru pośredniego SN) | `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md:21-31`; `backend/src/application/station_templates/apply.py:711` (`_klasa_przylaczenia`) | Zgodne co do miejsc w SN (złącze kablowe SN, złącze pomiarowe, słup, pole GPZ). |
| EUP-19, EUP-20, EUP-21 (pomiar nN bezpośredni i półpośredni, próg 40 kW / 63 A) | brak | **Brak** wyboru rodzaju układu nN wg mocy; brak złączy nN z pomiarem (zob. `STANDARD_ENEA_SIEC_KABLOWA_I_ZLACZA_NN.md`). |
| EUP-26 (zakres 20–120% prądu znamionowego) | `backend/src/domain/dobor_przekladnika.py:58-62` (`PROG_WYKORZYSTANIA_PRZEKLADNI = 0.2` z komentarzem, że progu nie ma w normie), `:221-231` (kryterium jako „informacja”) | **Sprzeczne dla przekładników rozliczeniowych:** dla pomiaru rozliczeniowego w sieci ENEA próg 20% (oraz 5% i 1% dla klas 0,5S/0,2 i 0,2S przy źródłach) i górna granica 120% są wymaganiami standardu (§11.1), a nie praktyką projektową. Moduł nie rozróżnia rdzenia rozliczeniowego od zabezpieczeniowego przy tym kryterium. |
| EUP-27, EUP-36–EUP-38 (kl. 0,2S, FS ≤ 5, wtórny 5 A, przekładnie 5/5, 15/5, 50-100/5) | `backend/src/network_model/catalog/mv_auxiliary_catalog.py:1351-1407` (`ct_50_1_0_5_5va_arteche`, `ct_100_1_0_5_5va_abb`, `ct_150_1_0_5_10va_abb`: wtórny 1 A, kl. 0,5, FS 10), `:1341-1347` (opis „Fs wg znormalizowanej wartości 10”) | **Sprzeczne:** katalog nie ma przekładnika rozliczeniowego kl. 0,2S FS5 o prądzie wtórnym 5 A ani przekładni 5/5, 15/5, 50-100/5 A; obecne rdzenie pomiarowe mają FS 10 (dopuszczalne tylko za zgodą operatora) i klasę 0,5. |
| EUP-40, EUP-41 (VT kl. 0,2, 15:√3/0,1:√3) | `mv_auxiliary_catalog.py:1810-1830` (`vt_15kv_fz_100_3_05_3p_arteche`: kl. 0,5/3P), `:1609-1780` (przekładniki międzyfazowe kl. 0,5) | **Sprzeczne:** brak przekładnika napięciowego z uzwojeniem pomiarowym kl. 0,2 0–10 VA; najlepsza klasa w katalogu to 0,5. |
| EUP-08 (napięcie przed przekładnikami prądowymi) | `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md` (brak reguły kolejności VT/CT) | **Brak** reguły kolejności w szablonach pola pomiarowego. |
| EUP-15–EUP-18 (własność elementów) | brak | Brak atrybutu własności (operator / odbiorca / wytwórca) przekładników i liczników w modelu. |
| EUP-34 (dobór przekładni wg mocy) | `backend/src/domain/dobor_przekladnika.py` (kryterium 1 — prąd roboczy ≤ prąd pierwotny) | Częściowe: brak doboru przekładni rozliczeniowej z tabel zał. 2 wg mocy przyłączeniowej i napięcia. |
