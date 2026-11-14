# Standard ENEA SN, Zeszyt 3 — stacje transformatorowe słupowe SN/nN

Status: **BINDING** (dyrektywa właściciela 2026-11-12; Zasada nr 5 w `CLAUDE.md`, wzorzec formy
`STANDARD_ENEA_GPZ_Z1.md`).

Źródło: ENEA Operator sp. z o.o., „Standardy w sieci dystrybucji — Stacje elektroenergetyczne
średniego napięcia, Zeszyt 3. Stacje transformatorowe słupowe SN/nn”, wersja 06.2021-2,
obowiązuje od 02.04.2024, zatwierdzona uchwałą Zarządu nr 211/2021 zmienioną uchwałą 7/2024.
Adres pobrania: `https://www.operator.enea.pl/media/685/` (plik „stacje-elektroenergetyczne-
sredniego-napiecia-zeszyt-3-stacje-transformatorowe-s…”), pobrany 2026-11-12, 76 stron
(w tym załączniki 1–5: karty stacji STN 13,5/17,5-20/400 i STN 13,5/12-20/400), SHA-256 pliku
zaczyna się od `230de306` i kończy na `558e`.
PDF i rysunki NIE są w repozytorium (prawa ENEA). Dokument zawiera wyłącznie numery punktów,
wartości liczbowe i własne sformułowania.

Prefiks: `ESL-`.

## 1. Zakres stosowania w produkcie

Wariant profilu OSD ENEA „stacja słupowa” w: katalogu (TR do 400 kVA, podstawa bezpiecznikowa
napowietrzna PBNV z wkładką WBGNp, ograniczniki SN i nN, rozdzielnica nN słupowa,
przekładniki 200/5 i 800/5, żerdzie 12 i 17,5 kN), modelu ENM (`Substation` o konstrukcji
słupowej, przyłączenie do linii napowietrznej), kreatorze stacji, SLD (brak łącznika SN
na stacji, bezpiecznik SN w torze TR, rozłącznik przed stacją na linii), walidatorze
(zakaz kablowego podejścia SN), ocenie doboru (bezpiecznik SN, ogranicznik, CT), raporcie.
Ocena zgodności jest werdyktem wyjaśnialnym; wartość robocza daje dowód `NIEPELNY`.

Konstrukcje wsporcze, fundamenty i antykorozja są zapisane jako wymagania, bo wpływają
na katalog i kartę techniczną; nie są modelowane w obliczeniach elektrycznych.

## 2. Wymagania potwierdzone

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| ESL-01 | §2 | Podstawowym rozwiązaniem stacji SN/nN jest stacja kompaktowa; stacje słupowe dotyczą głównie przebudów, a pozostawienie słupowej wymaga uzasadnienia. |
| ESL-02 | §2 | Nie zaleca się budowy nowych stacji słupowych. |
| ESL-03 | §2 | Zakaz budowy nowych stacji słupowych z kablowym podejściem linii SN. |
| ESL-04 | §2 | Załącznik 1 — stacja na żerdzi o nośności 17,5 kN; Załącznik 2 — na żerdzi 12 kN; dobór potwierdza projekt. |
| ESL-05 | §2 | Zeszyt nie dotyczy usuwania awarii. |
| ESL-06 | 4.1 | Rozwiązanie podstawowe: stacja w pełni wyposażona, TR do 400 kVA, izolacja SN 24 kV, bez pomostu obsługi, na żerdzi strunobetonowej wirowanej. |
| ESL-07 | 4.2 | Żerdzie: beton C40/50, klasy ekspozycji XC4, XF2, XA2, bez szwu, bez zacisków uziemiających; powłoka bitumiczna tylko w gruncie bardzo agresywnym, do 0,3 m nad terenem; oznacznik żerdzi. |
| ESL-08 | 4.2 | Konstrukcje stalowe cynkowane ogniowo, oznakowane, łączone śrubami i taśmami. |
| ESL-09 | 4.2 | Ustoje i fundamenty: prefabrykaty C30/37 XC4/XF1/XA1 dla gruntu o co najmniej małej nośności, z oznacznikiem; grunty bardzo słabe — projekt indywidualny; dopuszczone fundamenty monolityczne albo otwór wiercony Ø 55 lub 80 cm; płyty stopowe. |
| ESL-10 | 4.2 | Wykop bez zmniejszania wymiarów; zasypka warstwami 20–30 cm z zagęszczeniem; ustoje ustawiane wg kierunku siły wypadkowej; górna krawędź elementu ustoju 0,5–0,7 m pod terenem; nie lokalizować przy skarpach; odbiór robót zanikających z dokumentacją zdjęciową. |
| ESL-11 | 4.3.1 | Połączenia SN przewodami w osłonie 70 mm². |
| ESL-12 | 4.3.2 | Izolatory kompozytowe (guma silikonowa LSR lub HTV). |
| ESL-13 | 4.3.2 | Izolator odciągowy: 125 kV udarowe, 50 kV na mokro, SML ≥ 70 kN, droga upływu ≥ 480 mm, rdzeń ECR; guma: gęstość > 1,20 g/cm³ (HTV) / > 1,07 g/cm³ (LSR), twardość Shore A > 35, wytrzymałość ≥ 5 MPa, wydłużenie > 200 %, odporność na rozdarcie > 15 N/mm; powłoka ≥ 3 mm, bez szwu, wiązanie chemiczne z rdzeniem; sworzeń nitowany z zawleczką; uchwyty śrubowe; ucho owalne; długość 515 mm; oznakowanie. |
| ESL-14 | 4.3.2 | Izolator wsporczy: 24 kV, 125 kV udarowe, 70 kV na mokro, SCL ≥ 12,5 kN, MDCL ≥ 6 kN, ugięcie < 20 mm, droga upływu ≥ 480 mm, rdzeń ≥ 32 mm, palność V0, gwint M24, okucie cynkowane ≥ 85 µm, uchwyt oplotowy. |
| ESL-15 | 4.3.3 | Ograniczniki przepięć SN beziskiernikowe, prąd wyładowczy ≥ 10 kA (8/20 µs), z odłącznikiem, w osłonie silikonowej, montowane jako wsporcze na zejściu do TR, z osłonami zacisków. |
| ESL-16 | 4.3.4 | Osłony przepustów SN i nN transformatora; iskierniki TR zdemontowane. |
| ESL-17 | 4.3.5 | Adaptery do izolatorów konektorowych TR. |
| ESL-18 | 4.3.6 | TR zabezpieczony przed przesunięciem na konstrukcji. |
| ESL-19 | 4.3.7 | Podstawy bezpiecznikowe napowietrzne SN kompozytowe, do wkładek WBGNp 17,5 kV i 24 kV. |
| ESL-20 | 4.3.8 | Przed stacją zaleca się rozłącznik napowietrzny o prądzie ciągłym ≥ 200 A i wyłączalnym ≥ 20 A. |
| ESL-21 | 4.3.9 | W terenie zadrzewionym zaleca się łączniki bezpiecznikowe w każdej fazie o sile niszczącej 6 kN (żerdź 12 kN) albo 8,75 kN (żerdź 17,5 kN). |
| ESL-22 | 4.4.1 | Połączenie TR–rozdzielnica nN kablami N2XY 4 × 1 × 150 mm² do 250 kVA i 4 × 2 × 150 mm² powyżej; kabel wprowadzony od góry na rozłącznik główny; uszczelnienia termokurczliwe; zaciski bezkońcówkowe. |
| ESL-23 | 4.4.1 | Ograniczniki przepięć nN: ≥ 10 kA, Uc = 440 V, z odłącznikiem. |
| ESL-24 | 4.4.2 | Rozdzielnica nN w szafie na słupie: do 5 obwodów z rozłącznikami wielkości 2 albo do 10 obwodów wielkości 00; wzmocniona konstrukcja. |
| ESL-25 | 4.4.2 | Obudowa: aluminium 1050A grubości 2 mm (tolerancja +0,3/−0 mm), lakier 95 ± 25 µm (min. 60 µm), przyczepność klasy 0; krawędzie gratowane; zamek MASTER KEY. |
| ESL-26 | 4.4.2 | Wyprowadzenia napowietrzne NAYY-J 4×70 lub NAY2Y-J 4×150 po drabinkach; wyprowadzenia kablowe kanałem skręcanym; uszczelnienia; kształtka czteropalczasta. |
| ESL-27 | 4.4.2 | Wymiary szafy: 700 mm ± 15 % × 1120 mm ± 20 % × 550 mm ± 15 %; zacisk uziemiający; łączniki krańcowe drzwi do AMI wg Zeszytu 4; półka na laptop. |
| ESL-28 | 4.4.3 | Łącznik główny nN: rozłącznik listwowy trójbiegunowy 630 A z zaciskami V ≥ 30 Nm (150 mm² albo 2 × 150 mm²). |
| ESL-29 | 4.4.3 | Rozłączniki odpływowe listwowe jak w Zeszycie 1 (wielkość 00 na adapterze); szyny i PEN 40×5 mm. |
| ESL-30 | 4.4.3 | Przekładniki prądowe kl. 0,2S, 5 VA, FS5: 200/5 A dla TR do 160 kVA, 800/5 A powyżej, za rozłącznikiem głównym. |
| ESL-31 | 4.5 | Układ bilansujący i szafa AMI wg Załącznika 5; CT na tulejach dystansowych za aparatem 630 A; schemat szafy AMI wg Zeszytu 4. |
| ESL-32 | 4.6 | Uziemienie wg standardu ENEA ochrony przeciwporażeniowej w sieci SN. |
| ESL-33 | 4.7 | Ochrona antykorozyjna konstrukcji. |
| ESL-34 | 4.8 | Oznakowanie: tablica identyfikacyjna centralnie na łożu TR; opis „Rozdzielnica nn”; opis pól z numerem, nazwą i prądem wkładki; zalaminowany schemat w kieszeni drzwi. |
| ESL-35 | Zał. 3 (legenda) | Kadź TR i ograniczniki nN łączone z uziemieniem przewodem H07V-K 25 mm² (żółto-zielony); drabinka; taśma; osłona przed ptakami; tablica; ogranicznik SN z Uc dobranym do sieci; odłącznik ogranicznika; płaskownik; podstawa i wkładka bezpiecznika SN. |
| ESL-36 | Zał. 4 (odczyt rysunku) | Schemat stacji od góry: ogranicznik SN z uziemieniem → przewody w osłonie → podstawa bezpiecznikowa PBNV z wkładką → przewody w osłonie → TR do 400 kVA → kable 3 × (2) × N2XY 150 i (2) × N2XY 150 → rozłącznik główny listwowy 630 A → CT kl. 0,2S → szyny 400 V / 630 A → 5 odpływów 400 A → kanał kablowy; szafa AMI. **Na stacji nie ma łącznika SN.** |
| ESL-37 | Zał. 2 (EN-802) | Karta STN 13,5/12-20/400 (wrzesień 2019): do wymiany stacji bramowych ŻH i drewnianych; na stacji nie ma możliwości instalacji łącznika SN — zaleca się rozłącznik z uziemnikiem przed stacją (≥ 200 A ciągły, ≥ 20 A wyłączalny). |
| ESL-38 | Zał. 2 | Warianty /I (naciąg NSN ≤ 6 kN) i /II (NSN ≤ 7,2 kN); przekładnia 15/0,42 kV i 20/0,42 kV; izolacja 24/1 kV; TR 400 kVA o masie 2300 kg. |
| ESL-39 | Zał. 2 | Przewody linii AFL-6 35/50/70 mm² albo w osłonie 50/70 mm²; rozdzielnica nN podwieszana; żerdź E 13,5 m 12 kN; łańcuchy odciągowe ŁO i ŁO2; obostrzenia 0–3. |
| ESL-40 | Zał. 2 | Podstawa bezpiecznikowa PBNV-24 z wkładką WBGNp 24; ustój UP4 + UP6; uziemienia SN i nN wspólne; konstrukcje stalowe w klasie wykonania EXC2/EXC1. |
| ESL-41 | Zał. 2 | Słup odporowy liczony jak krańcowy, gdy różnica naciągów ≥ 2/3; odległość Del = 22 cm; ograniczniki SN i nN ≥ 10 kA, nN Uc ≥ 440 V, montowane na TR między fazą a kadzią; górna krawędź ustoju ≥ 0,5 m pod terenem. |
| ESL-42 | Zał. 1 | Karta STN 13,5/17,5-20/400: dla nowych inwestycji oraz wymian przy naciągu przewodów > 12 kN; NSN ≤ 12 kN; żerdź 17,5 kN; ustój SFP111 + SP11. |
| ESL-43 | §5 | Inne rozwiązania wyłącznie decyzją Dyrektora Obszaru Dystrybucji; decyzja o nowej stacji słupowej również należy do Dyrektora OD, ale nie obejmuje podejścia kablowego SN. |

## 3. Rozdziały formalne (spis)

- §3 — normy i przepisy.
- 4.9 — dokumentacja dostarczana ze stacją.
- 4.10 — gwarancje i odbiory.
- §5 — tryb odstępstw (inne rozwiązania decyzją Dyrektora OD).

## 4. Decyzje właściciela (NIE są wymaganiami ENEA)

- **DECYZJA WŁAŚCICIELA 2026-11-13:** w sieci ENEA generalnie nie stosuje się reklozerów.
- **DECYZJA WŁAŚCICIELA 2026-11-13:** odgałęzienie z linii napowietrznej wykonuje się przez
  słup z rozłącznikiem; mieszane (napowietrzne → kabel) przez słup z rozłącznikiem
  i głowicą; z kabla tylko przez ZKSN; odgałęzienie na gołej szynie zakazane.
  Zeszyt 3 jest z tym zgodny (ESL-03, ESL-20, ESL-37), ale sam nie formułuje zakazu
  odgałęzienia na szynie.

## 5. Decyzje graficzne i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

- Rysowanie rozłącznika przed stacją jako osobnego słupa linii w SLD jest decyzją produktu;
  standard tylko zaleca rozłącznik (4.3.8) i nie określa jego odległości od stacji.
- Kolejność elementów z Zał. 4 jest odczytem rysunku; symbole graficzne są decyzją SLD.
- Dane konstrukcyjne (żerdzie, ustoje, łańcuchy, obostrzenia) nie są renderowane w SLD.

## 6. Luki i niejednoznaczności

1. **SCL izolatora wsporczego:** 4.3.2 podaje ≥ 12,5 kN, zestawienie materiałów w Zał. 2
   ≥ 12 kN.
2. **Nowe stacje słupowe:** §2 nie zaleca nowych słupowych, a Zał. 1 przeznacza STN
   13,5/17,5-20/400 „dla nowych inwestycji”; rozstrzyga §5 (decyzja Dyrektora OD).
3. **Naciągi:** §2 mówi o nośności żerdzi 17,5 kN i 12 kN, a załączniki ograniczają naciąg
   NSN do ≤ 12 kN (Zał. 1) i 6 / 7,2 kN (Zał. 2 /I, /II) — to różne wielkości (nośność żerdzi
   a naciąg przewodów), standard ich nie zestawia.
4. **Uc ogranicznika SN** (Zał. 3, poz. ogranicznik SN) bez wartości — „dobrane do sieci”;
   produkt proponuje wartość roboczą z normy (Zasada nr 4) i oznacza ją `ESTIMATED`.
5. **CT 200/5 do 160 kVA (4.4.3)** wobec stałego 800/5 w Zeszytach 1, 2 i 6.
6. **Szyny 40×5 (Z3 4.4.3)** wobec 40×10 (Z2) i 60×10 (Z1, Z6) — różnica zamierzona,
   odnotowana dla katalogu.
7. **Rozłącznik przed stacją — „zaleca się” (4.3.8, Zał. 2)** a decyzja właściciela traktuje
   słup z rozłącznikiem jako obowiązkowy sposób odgałęzienia. Zapisane obie wersje; produkt
   stosuje decyzję właściciela i podaje podstawę jako decyzję, nie punkt standardu.
8. **Zał. 4 — oznaczenia 1–10 bez opisu** (uwaga odsyła do 4.6).

## 7. Mapa wdrożenia (stan głównego checkoutu, pomiar 2026-11-13)

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| ESL-03 (zakaz podejścia kablowego) | `backend/src/reference_engine/compliance.py:500` reguła `pole_station_cable_entry_forbidden` | zgodne |
| ESL-06 (TR do 400 kVA) | `backend/src/reference_engine/compliance.py:416` (`slupowa` 0,4 MVA), `:524` | zgodne |
| ESL-02 (nie zaleca się nowych) | `backend/src/reference_engine/compliance.py:480` (`prefabricated_compact_preferred`) | zgodne |
| ESL-36, ESL-37 (brak łącznika SN na stacji; tylko PBNV z wkładką) | `backend/src/application/station_templates/templates/slupowe.py:61` (rozdzielnice SN ZPUE/Elektrometal), `:66` (pole SN IN), `:67` (`PROT_FEEDER_OPTIONS`) | sprzeczne |
| ESL-06 (bez pomostu obsługi) | `backend/src/application/station_templates/templates/slupowe.py:109` (`tpl_slupowa_250kva` „z platformą”) | sprzeczne |
| ESL-24 (do 5 obwodów wielkości 2 albo do 10 wielkości 00) | `backend/src/application/station_templates/templates/slupowe.py:69`–`71` — `nn_feeders_count` maks. 4, `:72` odpływy na wyłącznikach (`NN_CB_OPTIONS`) | sprzeczne (za mało) |
| ESL-20 (rozłącznik przed stacją), decyzja o odgałęzieniu z linii | `backend/src/network_model/catalog/mv_branch_point_catalog.py:110` (`AFL-SLUP` z odłącznikiem 400 A), `:132` (`SLUP-ODG-12` z rozłącznikiem 630 A) | `:110` sprzeczne z decyzją właściciela (odłącznik zamiast rozłącznika); `:132` zgodne |
| ESL-19 (PBNV, WBGNp 17,5/24 kV) | `backend/src/network_model/catalog/mv_auxiliary_catalog.py` — brak typów podstaw napowietrznych PBNV i wkładek WBGNp | brak |
| ESL-30 (CT 200/5 i 800/5) | `backend/src/application/station_templates/_choices.py:346` (`CT_OPTIONS`) | do sprawdzenia przy profilu |
| ESL-15, ESL-23 (ograniczniki SN i nN) | brak ograniczników przepięć jako elementu stacji słupowej w szablonie | brak |
| ESL-38 (przekładnia 15/0,42 i 20/0,42 kV) | `backend/src/network_model/catalog/mv_transformer_catalog.py:494`, `:790` — strona dolna 0,4 kV, Dyn11 | sprzeczne |
| wariant stacji | `backend/src/enm/models.py:1155`–`1185` (`construction_type` = `slupowa`) | zgodne co do konstrukcji |
| źródło wersji | `backend/src/reference_engine/packs/osd_enea/pack.json:10` — Zeszyt 3 w wersji 06.2021-2 od 02.04.2024 | zgodne |
