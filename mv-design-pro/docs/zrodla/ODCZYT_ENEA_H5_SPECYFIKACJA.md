# SPEC_H5_ENEA — układ GPZ H5 110/SN według standardu ENEA Operator (tekst własny)

Źródło główne: ENEA Operator, „Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe 110 kV/SN”, wersja 02.2023-2 (obowiązuje od 02.04.2024), plik lokalny
`mv-design-pro/docs/zrodla/pobrane/enea_stacje_110_zeszyt_1_2024.pdf` (99 stron PDF). Numer strony dokumentu „Strona I N/76” = numer strony PDF dla stron 1–76 (sprawdzone: spis załączników na s. 75 PDF). Załączniki rysunkowe są na s. 77–99 PDF i nie mają warstwy tekstowej (rysunki wektorowe/rastrowe) — wszystko poniżej odczytano z renderu 300 dpi (render lokalny poza repo, 2480×3509 px, A4; 1 px = 0,0847 mm). Dostęp lokalny 2026-10-22. Rendery i PDF NIE trafiają do repo.

Oznaczenia pewności: [ODCZYT] — odczytane z rysunku/tekstu; [POMIAR] — zmierzone na renderze; [INTERPRETACJA] — mój wniosek, nie treść normy.

---

## 1. Inwentarz rysunków (Zeszyt 1, spis §40, s. 75–76 PDF; przypisanie stron sprawdzone wizualnie miniaturami)

| Zał. | Tytuł (wg spisu §40) | Strona PDF | Uwagi |
|---|---|---|---|
| Z.1 | Schemat zasadniczy rozdzielni 110 kV (H5) | 77 | pionowa A4 |
| Z.2 | Schemat zasadniczy rozdzielni SN | 78 | arkusz obrócony 90° (poziomo) |
| Z.2.1 | Schemat rozdzielni SN, filtr Holmgreena | — | „rysunek usunięty” |
| Z.3 | Plan stacji | — | „rysunek usunięty” |
| Z.4 | Pole linii 110 kV, pomiar bilansowo-kontrolny, zab. odległościowe | 79 | |
| Z.4.1 | j.w., zab. różnicowe | 80 | |
| Z.5 | Pole linii 110 kV, pomiar rozliczeniowy, zab. odległościowe | 81 | |
| Z.5.1 | j.w., zab. różnicowe | 82 | |
| Z.5.2 | Pole linii 110 kV do współpracy z wytwórcą/odbiorcą, rozliczeniowy, odległościowe | 83 | |
| Z.5.3 | j.w., różnicowe | 84 | |
| Z.6 | Pole transformatora 110 kV/SN — strona 110 kV | 85 | |
| Z.7 | Pole transformatora 110 kV/SN — strona SN | 86 | |
| Z.8 | Pole łącznika szyn 110 kV w układzie H5 | 87 | rysowane pionowo: Sekcja A u góry, Sekcja B u dołu |
| Z.9 | Pole łącznika szyn 110 kV w układzie H4 | 88 | |
| Z.10 | Pole linii odpływowej SN | 89 | z przekładnikiem Ferrantiego; wariant z filtrem Holmgreena usunięty |
| Z.11 | Pole linii SN z pomiarem (rozliczeniowym) energii i napięcia zwrotnego | 90 | |
| Z.11.1 | Pole linii SN z pomiarem napięcia zwrotnego | 91 | |
| Z.11.2 / Z.11.3 | warianty z filtrem Holmgreena / Ferrantiego | — | „rysunek usunięty” |
| Z.12 | Pole łącznika szyn SN | 92 | rysowane pionowo: Sekcja A u góry, Sekcja B u dołu |
| Z.13 | Pole ZU SN — sieć uziemiona przez dławik z automatyczną regulacją | 93 | |
| Z.14 | Pole ZU SN — układ równoległy dławik + rezystor | 94 | |
| Z.15 | Pole ZU SN — sieć uziemiona przez rezystor | 95 | |
| Z.16 | Pole baterii kondensatorów równoległych SN | 96 | |
| Z.17 | Pole pomiaru napięcia SN | 97 | |
| Z.18 | Potrzeby własne 220 V DC | 98 | |
| Z.19 | Potrzeby własne 230/400 V AC | 99 | |
| Z.20 | Budynek rozdzielni SN | — | „rysunek usunięty” |

Zeszyt 2 (`enea_stacje_110_zeszyt_2_2023.pdf`, 16 s.): stacje jednotransformatorowe — Rys. 1 i Rys. 2 (schematy zasilania wariant 1/2, tekst ok. s. 4–5), lista załączników z odwołaniami do Zeszytu 1 (pole TR, ZU wg Z.13/14/15, pomiar wg Z.17, BKR wg Z.16, linie wg Z.10); załączniki 2, 6, 7.1, 8, 10 „rysunek usunięty”. Zeszyt 3 (14 s.): rozdzielnie sieciowe 110 kV — Zał. 1.1, 1.2, 2.1, 2.2 (schematy zasadnicze Gr. 1/Gr. 2 z granicą stron), 1.3, 2.3, 3 usunięte, 4 i 5 obwody wtórne. Rysunków z Zeszytów 2–3 NIE oglądałem w 300 dpi (poza zakresem H5; inwentarz z warstwy tekstowej). W żadnym zeszycie nie znalazłem osobnej legendy symboli (brak arkusza „Oznaczenia graficzne”); jedyna legenda to „Oznaczenia” na Z.2 (* / ** / AJEE) i „Uwagi” na Z.1.

---

## 2. Z.1 — rozdzielnia 110 kV H5 (s. 77 PDF)

### 2.1 Topologia i numeracja [ODCZYT]
- Szyna 110 kV jest POZIOMA, jedna linia na wysokości ok. 43% arkusza. Opis „Sekcja A” nad szyną po lewej, „Sekcja B” po prawej, numer pola przy węźle.
- Pola liniowe idą W GÓRĘ od szyny, pola transformatorowe W DÓŁ. Pole łącznika szyn leży POZIOMO w osi szyny między dwoma węzłami sekcji.
- Numeracja pól (cyfry przy węzłach szyny, nad szyną dla pól górnych, pod szyną dla dolnych):
  - (1) — skrajnie lewo: „Rezerwa miejsca”, pionowa linia kropkowana, opis pionowy; numer w nawiasie przy kropce na końcu szyny.
  - 3 — pole linii 110 kV (w górę), Sekcja A.
  - 2 — pole TR1 (w dół), Sekcja A — w tym samym węźle co pole 3 (ta sama oś pionowa).
  - 4 — łącznik szyn (poziomo, numer pod blokiem przekładników).
  - 5 — pole linii 110 kV (w górę), Sekcja B.
  - 6 — pole TR2 (w dół), Sekcja B — w tej samej osi co 5.
  - (7) — skrajnie prawo: „Rezerwa miejsca”, kropkowane.
  Wniosek [INTERPRETACJA]: H5 ma 5 pól wyposażonych (3, 2, 4, 5, 6) i 2 miejsca rezerwowe (1, 7) — §26.10.5/„rezerwa miejsca”. Każda sekcja to w praktyce jeden węzeł: linia nad, transformator pod.
- Szyna: od (1) do węzła 3/2 linią ciągłą; od węzła 5/6 w prawo do (7) linią przerywaną [ODCZYT; asymetria jest na rysunku].
- Nad schematem tabela 3 kolumn (linia A | łącznik | linia B): wiersz 1 „Linia 110 kV, kierunek stacja 110 kV ENEA Operator” / „Łącznik szyn 110 kV”; wiersz 2 „Schemat zasadniczy pola załączniki nr: 4, 4.1” / „załącznik nr 8”; wiersz 3 „UPB-K, AJEE – rezerwa miejsca” / „——”. Pod polami TR po lewej od osi tabelka „Pole transformatora 110 kV/SN | Schemat zasadniczy pola załącznik nr: 6 | ——”.

### 2.2 Pole linii 110 kV (pola 3 i 5), od końca linii do szyny [ODCZYT + POMIAR odległości od szyny, oś x=987 px]
1. Wejście linii (górny koniec, −1041 px od szyny). Tekst parametrów ogranicznika nad nim, po prawej osi: „Ur≥96 kV / Uc≥77 kV / 10kA / ≥2 kJ/kV / Upl≤346 kV”.
2. OGR — ogranicznik przepięć na odgałęzieniu poziomym W PRAWO od osi, z licznikiem zadziałań (prostokąt z kropką) i symbolem ziemi na końcu (−851 px).
3. Znacznik trójfazowy (trzy ukośne kreski) + opis „L1,L2,L3 / 110 kV” (−806 px).
4. Uziemnik liniowy — odgałęzienie W LEWO od węzła (kropka) na osi, nóż ukośny, ziemia na lewym końcu, napęd „M” w kółku (≈ −766 px).
5. OL — odłącznik liniowy, nóż ukośny, „1600 A” po lewej, „M” po prawej (środek −725 px).
6. Blok PIU w ramce kreskowej (P2 u góry, P1 u dołu, −656…−346 px):
   - przekładnik napięciowy 4-uzwojeniowy na odgałęzieniu w prawo (u góry bloku): przekładnia „110/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3 / 0,1/3 kV”, „I 0-10 VA; kl.0,2 / II 5 VA; kl.0,5 / III 5 VA; kl.0,5/3P / IV 5 VA; kl.3P” (uzwojenie IV w trójkąt otwarty — symbol trójkąta);
   - przekładnik prądowy 5-rdzeniowy w osi (5 kółek jedno pod drugim, cyfry rzymskie I–V po lewej, indeks „3” po prawej): „800/1/1/1/1/1 A; I 1-2,5 VA kl.0,2S FS5; II 1-2,5 VA kl.0,2 FS5; III–V 5 VA kl.5P20”.
   Kolejność od linii: VT nad CT (VT po stronie linii) [ODCZYT].
7. W — wyłącznik „3150 A”, „M” i symbol kwadratu z „б”/sprężyny obok (napęd zasobnikowy — [INTERPRETACJA]) (−251 px).
8. Uziemnik szynowy (po stronie wyłącznika odłącznika szynowego) — w lewo, „M” (≈ −136 px).
9. OS — odłącznik szynowy „1600 A”, „M” (−100 px), dalej węzeł szyny.
Zapis literowy zgodny z §11.1.1: OL(U) – PIU – W – OS(U) – szyna, OGR na wejściu linii.

### 2.3 Pole transformatora (2 i 6), od szyny w dół [ODCZYT + POMIAR]
1. OS „1600 A”, M (+101 px). 2. Uziemnik w lewo, M (+144). 3. W „3150 A”, M + „б” (+242). 4. Znacznik 3-faz „L1,L2,L3 110 kV”. 5. Ramka P1–P2: CT 4-rdzeniowy „150-300/1/1/1/1 A; I 1-2,5 VA kl.0,2 FS5; II–IV 5 VA kl.5P20”, pod nim VT 2-uzwojeniowy w prawo „110/√3 / 0,1/√3 / 0,1/√3 kV; I 5 VA kl.0,5; II 5 VA kl.0,5/3P”. 6. OGR w lewo od osi z licznikiem i ziemią, parametry jak w linii (+674). 7. TR1: dwa koła na osi, górne z gwiazdą i strzałką ukośną przez koło (regulacja pod obciążeniem), mała ramka „U>0” nad nim; dolne z trójkątem; opis „TR1 / 110 kV/SN” po lewej. 8. Punkt neutralny 110 kV: z gwiazdy wyprowadzenie poziome w prawo do węzła; od węzła w prawo uziemnik/odłącznik punktu neutralnego „72,5 kV” z ziemią, w dół ogranicznik przepięć z ziemią „Ur≥60 kV / Uc≥48 kV / 10 kA / ≥2 kJ/kV / Upl≤250 kV”. 9. Strona SN: OGR w lewo od osi (bez licznika), znacznik „L1,L2,L3 SN”, rozgałęzienie na 4 kable (trójkąty skierowane w dół; 2 ciągłe, 2 przerywane — rezerwowe [INTERPRETACJA]), opis „Rozdzielnia SN / Sekcja A” (dla TR2 „Sekcja B”).

### 2.4 Pole łącznika szyn (4), od Sekcji A do Sekcji B, poziomo [ODCZYT]
Węzeł 3/2 → OS „1600 A” (M) → węzeł z uziemnikiem pionowo w górę (M) → znacznik 3-faz „L1,L2,L3 110 kV” → W „3150 A” (M, „б” pod spodem) → ramka P1–P2 z CT 5-rdzeniowym (kółka poziomo, I–V) „800/1/1/1/1/1 A” (rdzenie jak w linii) i VT 4-uzwojeniowym zawieszonym pod osią przy P2 (przekładnie jak w linii) → węzeł z uziemnikiem w górę (M) → OS „1600 A” (M) → węzeł 5/6. Opis 4 pod ramką. Zgodne z §11.1.1 OS(U)–W–PIU–(U)OS.

### 2.5 Uwagi na rysunku Z.1 (treść skrócona) [ODCZYT]
1) CT 110 kV 1 A — podstawowe; 2) 5 A tylko przy przebudowie; 3) pokazano pola z pomiarem bilansowo-kontrolnym, rdzenie wg Z.4/4.1; 4) pola z pomiarem rozliczeniowym wg Z.5–5.3; 5) UPR — układ pomiarowy rozliczeniowy, UPB-K — bilansowo-kontrolny; 6) AJEE zasilany z rdzenia I CT i uzwojenia I VT.

---

## 3. Z.2 — rozdzielnia SN (s. 78 PDF, arkusz obrócony)

### 3.1 Układ [ODCZYT]
Dwie POZIOME szyny równoległe: Sekcja A (górna, pola nieparzyste w górę), Sekcja B (dolna, pola parzyste w dół). Numery pól przy szynie (A pod szyną, B nad szyną, w szczelinie między sekcjami). Opisy funkcji na końcach pól (A u góry, B u dołu), nad nimi „AJEE” tam, gdzie dotyczy.

Kolejność od lewej (identyczna dla obu sekcji, A/B):
1/2 ŁS (łącznik szyn — dwie cele w ramce kreskowej łączącej pole 1 i 2) · 3/4 BKR 1/2 · 5/6 ZU 1/2 · 7/8 TR 1/2 (AJEE) · 9/10 POMIAR 1/2 · 11/12 LINIA* (AJEE) · 13/14 LINIA** · 15–31 / 16–32 LINIA (9 pól na sekcję). Razem 16 pól na sekcję, 32 pola. Przy polach 21 i 29 (Sekcja A) opis „630A” przy wyłączniku [ODCZYT; znaczenie niepodane].
Oznaczenia: * pole liniowe z pomiarem energii rozliczeniowym; ** pole liniowe z pomiarem napięcia zwrotnego; AJEE — analizator jakości (rdzeń I CT, uzwojenie I VT); AJEE w polach dla wytwórców >4 MW, odbiorców niespokojnych oraz w polach TR. Uwagi: lokalizacja pól pokazana według przeznaczenia; wyposażenie wg schematów pól; liczba pól liniowych dostosowana do potrzeb.

### 3.2 Pola od szyny do końca [ODCZYT; nazwy symboli SN częściowo INTERPRETACJA, patrz §5]
- LINIA (np. 15): szyna → odłącznik/człon rozłączny z uziemnikiem (symbol: przesunięcie osi z poprzeczką „⊢” i małym symbolem ziemi) → W (nóż ukośny, krzyżyk na styku stałym, M) → węzeł z uziemnikiem po stronie kabla (w bok, z symbolem głowicy próbnej „Y” i ziemią) → CT 1 kółko, indeks 3, „200–400A” → wskaźnik obecności napięcia (dzielnik pojemnościowy „⊣⊢<”) → głowica kablowa (gruba belka + łuk) → kabel linią kreskowo-kropkową → przekładnik Ferrantiego (kółko z kreskami, indeks 1; w Z.10 opis „Przekładnik Ferrantiego 1/100”) → „LINIA”.
- LINIA* (11/12): jak wyżej + CT 3-rdzeniowy „200–400A” i VT 3-fazowy (trzy kółka) na odgałęzieniu.
- LINIA** (13/14): CT 1-rdzeniowy + VT na odgałęzieniu.
- TR (7/8): szyna → wskaźnik napięcia → człon rozłączny z uziemnikiem → W (M) → węzeł z uziemnikiem i odgałęzieniem VT → CT 4 kółka „1000(1600)A,15kV / 800(1200)A,20kV” → wskaźnik napięcia → głowica kablowa (kabel z TR).
- POMIAR (9/10): szyna → człon rozłączny z uziemnikiem → wskaźnik napięcia → (bezpiecznik — gruba belka, [INTERPRETACJA]) → VT 3-fazowy (3 kółka). Brak wyłącznika.
- ZU (5/6): jak linia, CT 1 kółko „100A”, głowica kablowa.
- BKR (3/4): jak linia, CT 3 kółka „100A”.
- ŁS (1 i 2, dwie cele): cela 1 (Sekcja A): szyna → wskaźnik napięcia → człon rozłączny z uziemnikiem → odcinek z uziemnikiem (bez wyłącznika) → wskaźnik → głowica, mostek kablowy/szynowy (ramka kreskowa) do celi 2; cela 2 (Sekcja B): szyna → wskaźnik → człon rozłączny → W (M) → CT 2 kółka „1000(1600)A,15kV / 800(1200)A,20kV” → wskaźnik → głowica. [INTERPRETACJA: cela 1 = cela sprzęgła/łącznik bez wyłącznika, cela 2 = cela wyłącznikowa.]
- Pola potrzeb własnych na Z.2 brak; zasilanie potrzeb własnych z transformatora ZU (Z.19, §27.1).
Szczegóły rdzeni i aparatów — rysunki Z.10–Z.17 (nie rozpisywałem wszystkich rdzeni; patrz niepewności).

---

## 4. Geometria [POMIAR, 300 dpi, 1 px = 0,0847 mm]

Z.1 (110 kV):
- Rozstaw osi pól linia A ↔ linia B: 942 px = 79,8 mm (= 1,0 „P”). Łącznik zajmuje cały odcinek między nimi.
- Rezerwy: ok. 0,47 P na lewo od pola 3 (x≈545 kropkowana) i ok. 0,41 P na prawo od pola 5.
- Grubość szyny 110 kV = 3 px (0,25 mm) = TAKA SAMA jak przewód pola (3 px). Szyna NIE jest pogrubiona.
- Linie konturów symboli (koła TR, CT): 1 px (0,085 mm) — cieńsze niż tor.
- Odległości od szyny w górę (pole liniowe), w ułamkach P: OS 0,106; uziemnik szynowy ≈0,14; W 0,266; P1 0,367; P2 0,696; OL 0,770; uziemnik liniowy ≈0,81; znacznik 3-faz ≈0,86; OGR ≈0,90; koniec linii 1,105.
- W dół (pole TR): OS 0,107; uziemnik ≈0,15; W 0,257; OGR 110 kV ≈0,72; środek koła górnego TR ≈0,85, dolnego ≈0,91; zakończenie SN/kable ≈1,10–1,16.
- Przerwa noża łącznika (wyłącznik/odłącznik) w osi: 42–43 px = 3,6 mm = 0,045 P; nóż wychylony w prawo (dla pól pionowych) ok. 25–30 px.
- Koło TR: średnica ≈90 px = 7,6 mm = 0,096 P; środki kół odsunięte o ≈62 px (zachodzenie ≈28 px, ok. 0,3 średnicy).
- Koło CT: średnica ≈30–34 px (≈2,7 mm, 0,035 P); kolejne rdzenie co ≈41 px (styczne/lekko rozsunięte). Koła VT ≈ wielkości CT, grupowane po 3–4 zachodząco.
- Etykiety parametrów: po PRAWEJ stronie osi (CT/VT/ogranicznik w polu liniowym), napędy „M” po prawej przy nożach, prąd znamionowy łącznika („1600 A”, „3150 A”) po LEWEJ osi tuż pod/obok noża. Uziemniki zawsze po LEWEJ osi (pola pionowe) / u góry (pole poziome łącznika). Opisy „TR1 110 kV/SN” po lewej.

Z.2 (SN, arkusz obrócony):
- Rozstaw pól 177,3 px = 15,0 mm (stały dla wszystkich typów pól, łącznie z ŁS).
- Szyna SN 5 px (0,42 mm) — POGRUBIONA względem toru pola 3 px (stosunek ≈1,7).
- Odstęp między szynami sekcji A i B: 88 px = 7,5 mm = 0,5 rozstawu pola.
- Długość pola od szyny do głowicy kablowej ≈495 px ≈ 2,8 rozstawu; przekładnik Ferrantiego ≈3,3 rozstawu; opis „LINIA” ≈4,0 rozstawu.

Położenie transformatorów [ODCZYT]: na Z.1 TR leżą pod szyną 110 kV w osiach pól 2/6 (współosiowo z liniami 3/5); rozdzielnia SN jest osobnym arkuszem (Z.2), na Z.1 zaznaczona tylko jako zakończenie „Rozdzielnia SN Sekcja A/B”.

---

## 5. Symbole (odczyt z rysunków; brak legendy w zeszytach)

Numery IEC 60617 — nie podaję żadnego jako pewnego; wszystkie: „numer do potwierdzenia” (baza IEC 60617 jest płatna/online, nie sprawdzałem w tej pracy).

| Element | Wygląd na rysunkach ENEA |
|---|---|
| Szyna | linia pozioma; 110 kV tej samej grubości co tor, SN pogrubiona ×1,7 |
| Wyłącznik 110 kV | przerwa w osi, nóż ukośny od dolnego zacisku w prawo-w górę, na styku stałym krzyżyk „×”; obok napęd „M” w kółku i kwadracik z „б” [stan: rysowany jako otwarty — nóż odchylony] |
| Odłącznik | przerwa, nóż ukośny bez krzyżyka (krótka poprzeczka na styku stałym niewidoczna przy tej skali — do potwierdzenia na wycinku), „M” |
| Uziemnik | odgałęzienie poziome od węzła (kropka) — nóż ukośny — symbol ziemi (pionowa kreska + 3 malejące kreski) na końcu; „M” przy nożu |
| Rozłącznik | nie występuje na Z.1/Z.2 |
| Przekładnik prądowy | kółko na osi toru (tor przechodzi przez środek), mała ukośna kreska z „3” (3 fazy), numer rdzenia rzymski po lewej; rdzenie jako stos kół |
| Przekładnik napięciowy indukcyjny | 2–4 zachodzące koła na odgałęzieniu z węzła, w kołach gwiazdy, uzwojenie dodatkowe trójkątem (otwarty trójkąt) |
| Przekładnik pojemnościowy | nie występuje na Z.1 (VT indukcyjne) |
| Ogranicznik przepięć | prostokąt z wpisaną łamaną/ukośną strzałką, na odgałęzieniu; licznik zadziałań = mały prostokąt z kropką; ziemia na końcu |
| Transformator 2-uzwojeniowy | dwa zachodzące koła w osi, gwiazda w górnym (z wyprowadzonym punktem neutralnym), trójkąt w dolnym; ukośna strzałka przez górne koło = regulacja; brak napisu grupy (np. Yd11) na Z.1 [ODCZYT] |
| Uziemienie punktu neutralnego 110 kV | węzeł z gwiazdy → odłącznik/uziemnik „72,5 kV” do ziemi + ogranicznik do ziemi (Z.1) |
| Transformator uziemiający / dławik / rezystor | na Z.13–Z.15 (nie rozpisane szczegółowo w tej pracy) |
| Bateria kondensatorów | Z.16 (nie rozpisane) |
| Bezpiecznik | prawdopodobnie gruba belka w polu POMIAR na Z.2 [INTERPRETACJA] |
| Wskaźnik obecności napięcia SN | „⊣⊢<” — kondensator na odgałęzieniu z łukiem |
| Głowica kablowa | gruba krótka belka + łuk pod nią |
| Kabel | linia kreskowo-kropkowa |
| Przekładnik Ferrantiego | kółko z kreskowanymi liniami przechodzącymi, indeks „1” |
| Punkt połączenia | pełna kropka |
| Znacznik trójfazowy | trzy ukośne kreski + „L1,L2,L3 / 110 kV” |

---

## 6. Stany łączników, blokady, SZR [ODCZYT tekstu]
- Rysunki Z.1/Z.2 pokazują wszystkie łączniki jednakowo jako otwarte (nóż odchylony) — to rysunek zasadniczy, nie stan normalny ruchowy [INTERPRETACJA]. Stanu normalnego łącznika szyn 110 kV rysunek nie podaje.
- §26.10.5 (s. 55): rezerwa jawna albo ukryta; rezerwa ukryta = „każdy [TR] pracuje na swoją sekcję przy otwartym łączniku szyn SN”. Przekaźniki SZR mają obsługiwać wszystkie warianty z wyłącznikami 110 kV i SN TR oraz wyłącznikiem łącznika szyn SN, z kontrolą napięć SN i 110 kV.
- §26.9.9 (s. 54): przy zasilaniu z jednego TR (łącznik szyn zamknięty) zadziałanie zabezpieczenia szyn wyłącza łącznik szyn i blokuje SZR SN.
- §26.10.4 (s. 55): tryb pola linii SN „linia/generacja”; SZR wyłącza pola generacji (obwód OWG), w razie niepowodzenia blokuje się.
- §26.8.4 (s. 51): SZR 110 kV w rozdzielniach z planowymi podziałami; działa na załączenie wyłącznika w polu „podziału”; czas 2,5–3 s, dłuższy niż przerwa SPZ; blokada po zadziałaniu.
- §26.11.3 (s. 57–58): obowiązkowe blokady elektryczne (styki pomocnicze) dla odłączników, uziemników, wyłączników H5; odłącznik sterowalny przy otwartym uziemniku w tym samym punkcie i odwrotnie; zakaz blokad w obwodach wyłączania; dopuszczalne blokady logiczne „załącz”.
Dla SLD [INTERPRETACJA]: stan normalny SN = łącznik szyn SN otwarty (rezerwa ukryta) jest jedynym stanem normalnym wskazanym w tekście; stanu normalnego łącznika 110 kV w H5 Zeszyt 1 nie podaje.

---

## 7. Dołęga rys. 3.37
Rejestr `mv-design-pro/docs/zrodla/rejestr_zrodel.json` wpis `dolega_stacje_2007`: „Stacje elektroenergetyczne”, PWr 2007, rozdz. 3.5.2, druk s. 60 (PDF s. 59), rys. 3.37, plik `dolega_stacje_elektroenergetyczne.pdf`, „user_supplied_private_pdf”. Pliku NIE ma w systemie plików (wyszukanie po nazwie: brak; jest tylko lokalna kopia poza repo (`dolega-page18.png`) — inna strona, o wyłącznikach). Rysunku 3.37 nie oglądałem i nie odtwarzam z pamięci.

---
---

# UZUPEŁNIENIE (2026-10-22) — rysunki pól w 300 dpi

Rendery: render lokalny poza repo; podglądy render lokalny poza repo (skala 0,4), wycinki `crop/z7_sep.png`, `crop/z1_b.png`. Wszystkie rysunki pól SN (Z.7, Z.10–Z.17) rysują pole PIONOWO: szyna SN pozioma u góry („L1,L2,L3 /// SN”), pole w dół. Obwody wtórne (sterowniki, czerwone tory prądowe, niebieskie napięciowe) pomijam — nie należą do SLD pierwotnego.

## 8. Z.8 — pole łącznika szyn 110 kV H5 (s. 87) [ODCZYT]
Pionowo: „SEKCJA A 110 kV” u góry, „SEKCJA B 110 kV” u dołu. Kolejność od Sekcji A:
1. odłącznik (nóż ukośny, krótka poprzeczka na styku stałym — u góry),
2. węzeł z uziemnikiem w PRAWO (nóż poziomo-ukośny, ziemia na końcu),
3. wyłącznik (krzyżyk „×” na styku stałym u góry), cewki Y1/Y3/Y4 (ZW, OW1, OW2) po prawej,
4. P1, przekładnik prądowy 5 rdzeni „800/1/1/1/1/1”: I 1-2,5 VA kl.0,2S FS5 (opis „Rezerwa”), II 1-2,5 VA kl.0,2 FS5 (pomiary lokalne), III 5 VA 5P20 (SPZ / zabezpieczenie odległościowe), IV 5 VA 5P20 (sterownik pola), V 5 VA 5P20 (ZS i LRW 110 kV),
5. węzeł z przekładnikiem napięciowym 4-uzwojeniowym w prawo „110/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3 / 0,1/3”: I 0-10 VA kl.0,2; II 5 VA kl.0,5; III 5 VA kl.0,5/3P; IV 5 VA kl.3P (trójkąt otwarty); ramka P1–P2 obejmuje CT i VT,
6. P2, uziemnik w PRAWO, 7. odłącznik, 8. Sekcja B.
Rozbieżność z Z.1 [ODCZYT]: na Z.8 uziemniki są po prawej i VT jest za CT (od strony B); na Z.1 (poziomo) VT wisi przy P2 — zgodne. Na Z.8 brak napędów „M” i brak symbolu „б” (rysunek obwodów wtórnych pokazuje cewki Y).

## 9. Z.6 — pole TR strona 110 kV (s. 85) [ODCZYT]
Od szyny: odłącznik (poprzeczka u góry) → węzeł z uziemnikiem w prawo → wyłącznik (× u góry, cewki Y1/Y3/Y4) → P1, CT 4 rdzenie „150-300/1/1/1/1”: I 1-2,5 VA kl.0,2 FS5 (pomiary lokalne), II 5 VA 5P20 (sterownik, I>, I>>), III 5 VA 5P20 (zabezpieczenie różnicowe ΔI), IV 5 VA 5P20 (ZS i LRW) → VT 2 uzwojenia w lewo-prawo przy P2 „110/√3/0,1/√3/0,1/√3; I 5 VA kl.0,5; II 5 VA kl.0,5/3P” → P2 → znacznik 3-faz → ogranicznik w PRAWO z licznikiem → znacznik → transformator (gwiazda z wyprowadzonym punktem neutralnym, strzałka regulacji przez koło) → punkt neutralny w prawo: ogranicznik do ziemi (w górę-prawo) i odłącznik do ziemi (w dół) → strona SN: ogranicznik w prawo, znacznik → tor kablowy w dół → „SN” (symbol zakończenia — trójkąt kreskowany). Bloki: napęd przełącznika zaczepów, regulator napięcia (ARN), zabezpieczenia firmowe (BPZ, BT 1st/2st, TK, ZUB, ZOK).

## 10. Z.7 — cela TR w rozdzielnicy SN (s. 86) [ODCZYT]
Od szyny SN w dół:
1. wskaźnik obecności napięcia (kondensator + łuk, odgałęzienie w prawo),
2. symbol „człon/odłącznik z uziemnikiem” (patrz §15),
3. kółko na osi (patrz §15),
4. wyłącznik (× u góry, nóż odchylony w LEWO, kwadrat z krzyżem — wyzwalacze OW1/OW2/ZW — i „M” w prawo, połączone linią kreskową),
5. węzeł: w LEWO uziemnik (ziemia na końcu) + złącze wtykowe (czarna belka) do VT 3-uzwojeniowego „SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3”: I 0-10 VA kl.0,2; II 7,5 VA kl.0,5; III 7,5 VA kl.0,5/3P,
6. P1, CT 4 rdzenie „1000/5/5/5/5*”: I 10 VA kl.0,2S FS5 (UPB-K, AJEE), II 10 VA kl.0,2 FS5 (pomiary lokalne, ARN), III 15 VA 5P20 (różnicowe TR), IV 15 VA 5P20 (sterownik), P2,
7. wskaźnik napięcia, 8. głowica kablowa (czarna belka + łuk), 9. kabel (kreskowany), 10. ogranicznik przepięć w LEWO do ziemi (na kablu, po stronie TR), 11. transformator rysowany kreskowo: górne koło trójkąt (SN), dolne gwiazda.
Uwaga *: 1000/5 (110/15 kV ≤25 MVA), 1600/5 (110/15 kV 40 MVA), 800/5 (110/20 kV ≤25 MVA), 1200/5 (110/20 kV 40 MVA).
[INTERPRETACJA] Strona SN transformatora w Z.7 = trójkąt — zgodne z Z.1 (dolne koło z trójkątem).

## 11. Z.12 — łącznik szyn SN (s. 92) [ODCZYT]
Rysunek pokazuje JEDEN tor pionowy Sekcja A → Sekcja B (bez podziału na dwie cele; podział na 2 cele jest tylko na Z.2 — ramka kreskowa pól 1/2):
wskaźnik napięcia (w prawo) → człon z uziemnikiem → kółko → wyłącznik (× u góry, „M” w lewo) → P1, CT 2 rdzenie „1000/5/5*”: I 15 VA 5P20 (I>, I>>), II 15 VA 5P20 (zab. ziemnozwarciowe) → P2 → kółko → człon z uziemnikiem (lustrzany: uziemnik poniżej poprzeczki) → wskaźnik napięcia → Sekcja B. Uwaga * jak Z.7 (1000/1600/800/1200 A).
[INTERPRETACJA] Na Z.2 cela 1 (Sekcja A) to cela sprzęgła bez wyłącznika (mostek), cela 2 (Sekcja B) — z wyłącznikiem i CT 2 rdzeniami; Z.12 przedstawia ten sam obwód elektrycznie jako jeden tor.

## 12. Pola linii SN z pomiarami (Z.11 s. 90, Z.11.1 s. 91) [ODCZYT]
- Z.11 (pomiar rozliczeniowy + napięcie zwrotne): wskaźnik napięcia przy szynie → człon z uziemnikiem → kółko → wyłącznik (M) → węzeł: w prawo uziemnik + złącze wtykowe → VT 3-uzw. „SN/√3/0,1/√3/0,1/√3/0,1/√3”: I 0-10 VA kl.0,2; II 7,5 VA kl.0,2; III 7,5 VA kl.0,5/3P → P1 (kółko puste), CT 3 rdzenie „200-400/5/5/5*”: I 10 VA kl.0,2S FS5 (układ pomiarowo-rozliczeniowy, AJEE), II 10 VA kl.0,2 FS5 (układy regulacyjne), III 15 VA 5P20 (zabezpieczenia) → P2 → dalej (poniżej kadru) wskaźnik, głowica, przekładnik Ferrantiego. Uwagi na arkuszu: dwa układy pomiarowo-rozliczeniowe (podstawowy i rezerwowy) z jednego CT; AJEE dla wytwórców >4 MW i odbiorców ≥200 kW wytwórczych (treść skrócona).
- Z.11.1 (tylko napięcie zwrotne): jak wyżej, ale VT 3-uzw. „I 0-10 VA kl.0,2; II 7,5 VA kl.0,2; III 7,5 VA kl.0,5/3P” i CT 1 rdzeń „200-400/5; I 15 VA 5P20” → wskaźnik → głowica → przekładnik Ferrantiego 1/100.
- Z.10 (linia zwykła): CT 1 rdzeń „200-400/5; I 15 VA 5P20”, bez VT, Ferranti 1/100.

## 13. Zespół uziemiający (Z.13 s. 93, Z.14 s. 94, Z.15 s. 95; §16) [ODCZYT]
Wspólna część pola (wszystkie trzy): człon z uziemnikiem → kółko → wyłącznik (M) → P1, CT 1 rdzeń „100/5; I 15 VA 5P20” → P2 → ogranicznik przepięć w LEWO do ziemi → transformator uziemiający: dwa koła, górne z symbolem zygzaka (z wyprowadzonym punktem neutralnym w prawo), dolne gwiazda z punktem neutralnym uziemionym → z dolnego koła tor w dół opisany „Zasilanie potrzeb własnych 400/230 V AC” (Z.13, Z.15) / „230/400 V AC” (Z.14). Przy punkcie neutralnym blok przekładników „BTI | BTII”. Od punktu neutralnego węzeł → ogranicznik do ziemi (w dół) i dalej:
- Z.13 (dławik z automatyczną regulacją): odłącznik → dławik (cewka z regulacją, BDI/BDII, odczepy 500 V i 100 V, w ramce kreskowej) → przekładnik prądowy (kółko) → ziemia; równolegle z dławikiem ramka kreskowa z rezystorem wymuszającym załączanym stycznikiem (AWSC [INTERPRETACJA]); regulator dławika.
- Z.14 (równolegle dławik + rezystor): z punktu neutralnego przekładnik opcjonalny „*” (kółko kreskowane: „opcjonalna lokalizacja przekładnika prądowego SN w stosunku do przekładnika w gałęzi rezystora”), dalej dwie gałęzie równoległe, każda z własnym odłącznikiem: dławik (500 V, BDI/BDII, w ramce) do ziemi oraz rezystor → przekładnik prądowy → ziemia.
- Z.15 (rezystor): odłącznik → rezystor (prostokąt) → przekładnik prądowy (kółko) → ziemia.
Pola potrzeb własnych (TPW) w rozdzielnicy SN NIE MA — potrzeby własne 230/400 V są zasilane z uzwojenia nn transformatora ZU (Z.19 „Zasilanie z pola zespołu uziemiającego Sekcji A/B SN”; §27.1). Kolejność pól Z.2 pozostaje bez zmian.

## 14. Z.16 BKR (s. 96) i Z.17 pomiar napięcia (s. 97) [ODCZYT]
- Z.16: człon z uziemnikiem → kółko → wyłącznik (wyzwalacze OW1/OW2/ZW, M) → P1, CT 3 rdzenie „100/5/5/5”: I 10 VA kl.0,2S FS5 (UPB-K), II 15 VA 5P20, III 15 VA 5P20 → P2 → wskaźnik → głowica → kabel → ogranicznik przepięć w LEWO do ziemi → bateria: szyny L1, L2, L3; dwa VT „SN/0,1 kl.3P” L1-L2 i L2-L3 (do rozładowania/pomiaru); dwie gwiazdy kondensatorów (podwójna gwiazda) z przekładnikiem niezrównoważenia „1” między punktami neutralnymi (Ir>).
- Z.17: szyna → człon z uziemnikiem → kółko → tor w dół → wskaźnik napięcia (w prawo) → czarna belka + łuk w poziomym odgałęzieniu → VT 3-uzw. „SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3”: I 0-10 VA kl.0,2; II 15 VA kl.0,5/3P; III 15 VA kl.3P. Wyłącznika brak. Po stronie wtórnej: wyłączniki nadprądowe w uzwojeniach I i II, mały prostokąt (bezpiecznik) w obwodzie pomiaru energii.
- ROZSTRZYGNIĘCIE „grubej belki”: to NIE bezpiecznik. Ten sam znak (czarny prostokąt + łuk) występuje w Z.7, Z.10, Z.11, Z.11.1, Z.16 jako głowica kablowa / złącze wtykowe (przy kablu). W Z.17 to złącze wtykowe (głowica) przyłączenia VT [ODCZYT kształtu; nazwa = INTERPRETACJA]. Bezpieczników SN po stronie pierwotnej VT rysunek nie pokazuje [ODCZYT].

## 15. Rozstrzygnięcia symboli
- „Przesunięcie osi z poprzeczką i ziemią” (wycinek `crop/z7_sep.png`, porównane w Z.7, Z.10, Z.11, Z.11.1, Z.12, Z.13–Z.17 — kształt identyczny we wszystkich polach) [ODCZYT kształtu]: tor od szyny kończy się krótką poziomą poprzeczką (styk); obok, na prawo, osobny trzpień z poprzeczką na dole i odwróconym symbolem ziemi u góry (styk uziemiający); tor dalszy zaczyna się poniżej bez połączenia (przerwa); od toru dalszego linia kreskowa (sprzężenie mechaniczne) do kwadratu z kreskowym „⊥” poniżej (napęd/blokada); pod nią małe puste kółko na osi.
  [INTERPRETACJA] To odłącznik trójpołożeniowy (zamknięty / otwarty / uziemiony) rozdzielnicy SN z napędem ręcznym (kwadrat) — styk ruchomy rysowany w położeniu „otwarty”, styk uziemiający obok. Nie pasuje to do członu wysuwnego (brak podwójnych styków „>>” po obu stronach wyłącznika i wyłącznik jest osobnym symbolem poniżej). Małe kółko = najpewniej punkt przyłączenia/zacisk (bez wyjaśnienia na rysunku). Norma nie zawiera legendy — nazwa wymaga potwierdzenia u ENEA.
- „б” przy wyłączniku 110 kV na Z.1 (wycinek `crop/z1_b.png`) [ODCZYT]: kwadrat z wpisanym znakiem podobnym do „б”/„6”, połączony poziomą kreską z nożem wyłącznika, nad nim „M” w kółku połączone pionowo z kwadratem. Na Z.6 i Z.8 w tym miejscu są cewki Y1/Y3/Y4. [INTERPRETACJA] Napęd wyłącznika (zasobnik sprężynowy z silnikiem do naciągu). Znaczenie znaku w kwadracie NIE jest zdefiniowane w zeszycie — niepotwierdzone.

## 16. Pole SN → aparaty od szyny do kabla (zbiorczo) [ODCZYT, nazwy członu wg §15 = INTERPRETACJA]
| Pole | Od szyny do końca |
|---|---|
| LINIA (Z.10) | odłącznik 3-poł. z uziemnikiem · wyłącznik (M) · uziemnik [na Z.2 przy węźle za wyłącznikiem] · CT 1 rdz. 200-400/5 · wskaźnik napięcia · głowica · kabel · Ferranti 1/100 |
| LINIA** (Z.11.1) | jak LINIA + po wyłączniku węzeł: uziemnik + złącze → VT 3-uzw.; CT 1 rdz. |
| LINIA* (Z.11) | jak LINIA** + CT 3 rdz. 200-400/5/5/5 (0,2S / 0,2 / 5P20) |
| TR (Z.7) | wskaźnik · odłącznik 3-poł. · wyłącznik (M) · węzeł: uziemnik + złącze → VT 3-uzw. · CT 4 rdz. 1000/5 (0,2S/0,2/5P20/5P20) · wskaźnik · głowica · kabel · ogranicznik · TR |
| ŁS (Z.12; na Z.2 dwie cele) | wskaźnik · odłącznik 3-poł. · wyłącznik (M) · CT 2 rdz. 1000/5/5 · odłącznik 3-poł. · wskaźnik · Sekcja B |
| ZU (Z.13–15) | odłącznik 3-poł. · wyłącznik (M) · CT 1 rdz. 100/5 · ogranicznik · transformator uziemiający (zygzak/gwiazda) · punkt neutralny: dławik / dławik‖rezystor / rezystor · nn → potrzeby własne |
| BKR (Z.16) | odłącznik 3-poł. · wyłącznik (M) · CT 3 rdz. 100/5/5/5 · wskaźnik · głowica · kabel · ogranicznik · 2 VT L1-L2/L2-L3 · podwójna gwiazda kondensatorów z CT niezrównoważenia |
| POMIAR (Z.17) | odłącznik 3-poł. · wskaźnik · złącze → VT 3-uzw. (bez wyłącznika) |
Uwaga: na Z.2 przy polach TR, LINIA, ŁS wskaźnik napięcia rysowany jest także przy szynie (TR, ŁS) — na Z.10/Z.11 wskaźnik przy szynie jest tylko w Z.11 i Z.12; Z.2 i rysunki pól różnią się w tym szczególe [ODCZYT].

## 17. Geometria pól SN względem P_SN = 15,0 mm (177,3 px) [POMIAR na Z.2, pole 15, Sekcja A; dokładność ±10 px ≈ ±0,06 P]
Odległość od osi szyny wzdłuż pola: odłącznik 3-poł. (poprzeczka) 0,51 P · środek wyłącznika 0,90 P (nóż ≈0,34 P długości, odchylony w lewo) · węzeł uziemnika 1,20 P · środek CT 1,66 P · wskaźnik napięcia 2,51 P · głowica 2,77 P · przekładnik Ferrantiego 3,42 P · opis „LINIA” ≈4,0 P. Koło CT ≈0,17 P średnicy; w TR (4 rdzenie) i LINIA* (3 rdzenie) stos kół od ≈1,4 do ≈1,9 P. VT (3 koła zachodzące) na odgałęzieniu w lewo, ≈0,3 P od osi. Sekcja B — lustrzanie w dół. Wszystkie typy pól na Z.2 mają ten sam rozstaw i tę samą wysokość aparatów (pomiar wzrokowy na podglądzie, nie pikselowy dla każdego typu).

## 18. dolega-page18.png (informacyjnie)
Ścieżka: lokalna kopia poza repo (`dolega-page18.png`) (kopie także w worktree drzewa robocze). Treść [ODCZYT]: strona tekstu Dołęgi o wyłącznikach — umieszczanie wyłącznika przy szynach i oddzielanie go odłącznikiem (odwołanie do rys. 2.1, samego rysunku brak), rodzaje wyłączników (małoolejowe, SF6, próżniowe). Część znaków nieczytelna (uszkodzone fonty). Nie zawiera układów H ani rys. 3.37.

## 19. Nadal nieodczytane
- Nazwa i znaczenie znaku w kwadracie „б” oraz małego kółka na osi w polach SN — brak legendy.
- Odłącznik 3-poł. — nazwa jest interpretacją; kształt opisany dokładnie.
- Z.18 (220 V DC, s. 98) oglądany tylko jako miniatura (bateria, prostowniki, 2 sekcje) — nie dotyczy pól SN.
- Z.9 (H4), Zeszyty 2–3 — nieoglądane w 300 dpi.
- Geometria pól SN innych niż linia — oszacowana wzrokowo, nie zmierzona pikselowo.
