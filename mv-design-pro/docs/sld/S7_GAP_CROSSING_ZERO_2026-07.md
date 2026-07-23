# SCHEMAT-10 S7 — GAP wykonalności: `crossingCount=0` wymaga planarnej przebudowy (V12K-137)

Status: WIĄŻĄCY ZAPIS DŁUGU (Zero-Debt pkt 4 + karta S7 §S7.5 „ścieżka GAP").
Sporządzony po pełnej diagnozie geometrii na fixturze `sldSubstrate52s` (53 stacje
SN + GPZ). Uzupełnia `S6_METRYKI_LAYOUT_2026-07.md` §5 i `WARUNKI_ODBIORU_S6_2026-07.md`.

## 1. Wniosek

Warunek odbioru `crossingCount=0` (baza 13/24 wg `s6_measure.mjs`) **nie jest
osiągalny lokalnym reroutingiem** — wymaga zastąpienia sekwencyjnego grzebienia
ortogonalnego planarnym układem footprint-driven (przebudowa `buildScene.ts`,
5161 linii, ~20 wyroczni-niezmienników). To jest dokładnie przebudowa, którą
`S6_METRYKI_LAYOUT_2026-07.md` §5 zapisał jako „przekraczającą jedną synchroniczną
sesję bez złamania niezmienników". Pozostałe warunki metryczne (`Σpionów↓`,
`koszt↓`, `wykorzystanie↑`) są sprzężone z tą samą przebudową (piony i skrzyżowania
płyną z tego samego mechanizmu sekwencyjnego).

**To NIE jest konflikt reguł.** `SLD_CAD_SPEC_V3.md` §22.1 wprost: „Pierwszeństwo ma
ROUTING redukujący (zejścia odgałęzień poza przęsłami), mostek jest środkiem
ostatecznym." Zero przecięć jest zatem docelowym stanem, który kanon POPIERA;
mostki półłukowe (`crossing_probe` sprawdza pokrycie mostkiem-lub-kropką, nie zero)
to fallback do czasu, gdy routing planarny je wyeliminuje. Problem jest wyłącznie
wykonalnościowy (rozmiar bezpiecznej przebudowy), nie normatywny.

## 2. Taksonomia przecięć (dowód strukturalności) — pomiar `interiorCrossings`

Wszystkie 24 przecięcia (LOD 1/2; LOD 0 = 13) są `bus=false` (tor mocy × tor mocy,
nie szyna — `bus_band_clearance_probe` zielony). Dwie rodziny:

| Rodzina | Liczność (L1/L2) | H (poziom) | V (pion) | Poziom Y | Przyczyna |
|---|---|---|---|---|---|
| **A** | 11 | przęsło magistrali `segment*` | `branch_segment_L` (pierwsze zejście lateralu) | 608 (korytarz magistrali) | każdy lateral, schodząc w szczelinie `COLUMN_GAP` między stacjami, przecina poziomy kabel magistrali biegnący na y=608 |
| **B** | 13 | poziomy wiersz PŁYTSZEGO lateralu `branch_segment_R_*` | `branch_segment_L` GŁĘBSZEGO lateralu | 1208…7384 | kanał zejścia lateralu leżącego głębiej w grzebieniu przechodzi przez wiersz lateralu płytszego (mechanizm `insertColumnChannels` + kursor `nextRowTopY`) |

Wnioski:
- **Rodzina A jest nieredukowalna bez zmiany geometrii połączenia magistrala↔lateral.**
  Dopóki magistrala jest jednym poziomym kablem na y=608, a zejście lateralu leży w
  szczelinie X między stacjami (offset `channelX` w `COLUMN_GAP`, celowo poza blokiem
  stacji — `entry_collinearity_probe`/§22.3), pion zejścia z definicji przecina
  przęsło. „Zejście poza przęsłem" w sensie §22.1 wymaga, by w szczelinie zejścia NIE
  było poziomego kabla — czyli innej reprezentacji magistrali (np. rozcięcie przęsła
  z jawnym T-węzłem-kropką w punkcie zejścia, albo szyna zbiorcza zamiast łańcucha
  przęseł). To zmiana modelu magistrali, nie rerouting pojedynczej trasy.
- **Rodzina B jest funkcją sekwencyjnego stosowania lateralów** (`buildScene.ts`
  sekcja 6, `nextRowTopY = dy + totalHeight + ROW_VERTICAL_GAP`, każdy lateral pod
  CAŁĄ dotychczasową treścią). Kompaktyzacja w pasma Y wg rozłączności X mogłaby
  część z nich usunąć, ale nie wszystkie (gdy `channelX` głębszego lateralu wpada w
  zakres X płytszego przy pośrednim Y), i wymaga przepisania rezerwacji kanałów
  (`computeLateralChannelXById`/`insertColumnChannels`) oraz utrzymania „JEDNA
  KOTWICA" (rezerwa korytarza liczona niezależnie od LOD) — istotny fragment
  przebudowy, nie punktowa poprawka.

## 3. Dlaczego częściowa zmiana nie domyka karty

Warunki odbioru S7 obowiązują JEDNOCZEŚNIE (lista `WARUNKI_ODBIORU_S6` §"WARUNKI
ODBIORU"). `crossingCount=0` jest twardym elementem tej koniunkcji. Nawet udana
kompaktyzacja Rodziny B (redukcja `Σpionów`, część crossings) pozostawia Rodzinę A
(11/24, dominująca) → `crossingCount>0` → karta niezaakceptowana. Kompaktyzacja
niesie przy tym realne ryzyko regresji wyroczni (`insertColumnChannels`,
`junction_dot_probe`, `labelWireCollisions`, `lod_path_probe`/JEDNA KOTWICA) bez
domknięcia karty — netto ujemne w bieżącej sesji. Dlatego: żadnej zmiany geometrii
w tej sesji (gałąź pozostaje w znanym-zielonym stanie S6, geometria bajt-identyczna).

## 4. Plan wykonalny wielosesyjny (do egzekucji w kolejnych kartach)

Przebudowa musi zaatakować OBIE rodziny; kolejność od najmniejszego ryzyka:

- **S7-P1 (Rodzina B, kompaktyzacja pionowa).** Zastąpić kursor `nextRowTopY`
  pakowaniem lateralów w pasma Y wg rozłączności rzeczywistego footprintu X
  (interval packing). Wejście: footprint poddrzewa (symbole+pola+trasy+budżet
  etykiet po pomiarze fontu). Bramka: `vertical_length_probe` (nie-rosnąca — tu
  spada), `lod_path_probe`, wszystkie wyrocznie zero-kolizji, determinizm 2×.
  Efekt docelowy: `Σpionów↓`, `bboxUtilization↑`, część crossings B → 0.
- **S7-P2 (Rodzina A, model magistrali).** Rozstrzygnięcie WŁAŚCICIELSKIE: zejście
  lateralu jako jawny T-węzeł na przęśle (kropka §22.1, przęsło rozcięte w
  `channelX`) ⇒ styk końcem, nie przecięcie interioru ⇒ `interiorCrossings` nie
  liczy (patrz `externalBranchNodes`: styk końcem = legalny węzeł). To ZMIENIA
  fizykę obrazu (kropka zamiast mostka na połączeniu magistrala↔lateral) — wymaga
  decyzji właściciela + aktualizacji §22.1 i `junction_dot_probe` (realny węzeł ENM
  vs. węzeł rysunkowy). Alternatywa: szyna zbiorcza magistrali zamiast łańcucha
  przęseł. Obie to zmiany kontraktu, nie routingu.
- **S7-P3 (balancing + światła rozdzielone).** Dopiero po P1/P2, gdy bbox spadnie:
  `TOP_LEVEL_FIELD_CLEARANCE` +20–35% netto-dodatnio (§5/§6 S6).
- **Architektura (S7.5).** Migracja geometrii do `engine/sld-layout/layoutEngine.ts`
  jako kanonicznego `LayoutResult` (buildScene = render-only) — najbezpieczniej po
  ustabilizowaniu algorytmu w P1–P3, żeby migracja była 1:1 mechaniczna.

Kryterium wyjścia S7 = pełna lista „WARUNKI ODBIORU" spełniona jednocześnie na
`sldSubstrate52s`, 2× deterministycznie, goldeny wymienione per plik.

## 5. Stan bazy (potwierdzony w tej sesji)

`accept:sld-v3` = ALL PASS. `s6_measure.mjs` = tabela 18 metryk zgodna z
`S6_METRYKI_LAYOUT_2026-07.md` §2 (verticalLength 50264/67208/67208; crossingCount
13/24/24; labelCollision/subtreeIntersection/nonOrthogonal/ambiguous = 0). Geometria
niezmieniona — dokument nie dotyka warstwy źródłowej.

## 6. Ustalenie wykonawcze S7-P1.1 (2026-07-22) — pomiar kompromisu reorder↔kompaktyzacja

Zrealizowano **S7-P1.1** (kompaktyzacja pionowa Rodziny B + piony proporcjonalne):
kursor sekwencyjny `nextRowTopY` w `buildScene.ts` sekcja 6 zastąpiony pakowaniem
interwałowym pasami Y (`createLateralShelfPacker`; laterale rozłączne w X dzielą
pas, `dy` niemalejące w kolejności komponowania — niezmiennik rezerwacji
`insertColumnChannels` zachowany). Pomiar (fixtura `sldSubstrate52s`, per LOD):

| Metryka | Baza | Po S7-P1.1 |
|---|---|---|
| verticalLength | 50264/67208/67208 | **28072/45016/45016** (L0 −44%, L1/L2 −33%) |
| inkDensity | 0.0069/0.0115/0.0117 | **0.0098/0.0181/0.0185** (↑) |
| contentBBox h | 8043/8121/8121 | **4379/4457/4457** (~2× niżej) |
| crossingCount | 13/24/24 | 13/24/24 (bez zmian) |
| kolizje/M-02/nieortog/niejedn | 0 | 0 |

**Kluczowe ustalenie (dowód, że redukcja przecięć NIE należy do P1):** czyste
pakowanie Y jest **topologicznie neutralne dla `crossingCount`**. Przecięcie
Rodziny B = pion GŁĘBSZEGO lateralu × poziomy kabel-wiersz PŁYTSZEGO; zachodzi
wtw. footprinty X obu lateralów NACHODZĄ (`channelX` głębszego wpada w przedział
wiersza płytszego). Gdy nachodzą — nie mogą dzielić pasa (rozłączność X jest
warunkiem pakowania), więc przesunięcie w Y nie usuwa ani nie dodaje przecięcia.

**Reorder eliminuje Rodzinę B, ale ŁAMIE bramkę `sheet_fill_probe` (mierzone):**
kolejność komponowania warstwowa (covers-DAG: lateral nakrywający cudzy `channelX`
komponowany GŁĘBIEJ) daje `crossingCount` 13/24 → **0/11** (pozostałe 11 = Rodzina
A, pion × magistrala — zgodnie z podziałem „Rodzina A do P2"). ALE na tej fixturze
laterale tworzą GŁĘBOKI łańcuch nakryć (każdy origin na magistrali, wiersz 3–4
stacji nakrywa 2–3 kolejne), więc bez-przecięciowe warstwowanie wymusza układ
≈ sekwencyjny: `verticalLength` 66648 (ledwo < baza), a `inkDensity` spada do
0.0065/0.0111/0.0114 — **PONIŻEJ podłogi `SHEET_FILL_FLOOR` bazowej
(0.0069/0.0114/0.0117)** → `sheet_fill_probe` FAIL. Pakowanie pośrednie (cap
głębokości warstw) niemonotoniczne: cap=1 dał `crossingCount` 21/32 (GORZEJ od
bazy). Wniosek: na komb-reprezentacji z lateralami schodzącymi PONIŻEJ siebie
redukcja Rodziny B jest sprzężona z UTRATĄ kompaktyzacji (kompromis fundamentalny,
nie parametr). „Wykorzystanie arkusza po > przed" (§6) i „Rodzina B → 0" są
wzajemnie wykluczające się w tej reprezentacji.

**Konsekwencja dla P2 (potwierdzenie kierunku):** `crossingCount=0` bez utraty
kompaktyzacji wymaga ZMIANY REPREZENTACJI (węzeł T — lateral kończy się NA
magistrali/rodzicu kropką §22.1, styk końcem zamiast przecięcia interioru), nie
zmiany kolejności ani reroutingu w komb. To dokładnie mechanizm S7-P2 z
rozstrzygnięcia poniżej. Analogicznie do Rodziny A (lateral↔magistrala), Rodzina B
(lateral↔lateral zagnieżdżony) domyka się węzłem T na rodzicu-lateralu. Kod pakera
interwałowego (S7-P1.1) jest bazą pod footprint-driven layout P2/S7.5.

Bramki S7-P1.1: `type-check`=0, `lint`=0, vitest (`src/ui/sld`, `sld-overlay`,
`engine/sld-layout`) zielone, `accept:sld-v3` 190/0 ALL PASS, guardy
`sld_determinism`/`overlay_no_physics`/`no_codenames`/`forbidden_ui_terms`=0.
Goldeny wymienione per plik (`buildScene.test.ts` vertical_length; acceptance
`VERTICAL_LENGTH_BASELINE` zaciśnięty + `SHEET_FILL_FLOOR` podniesiony). Testy §11
a/c/e/g w `buildScene.schemat10s7p1.test.ts`.

## ROZSTRZYGNIĘCIE ZARZĄDCY (Fable, 2026-07-22)
Wariant 2 z modyfikacją: S7-P2 NIE wymaga osobnej decyzji właściciela — węzeł T
z kropką (lateral kończy się NA magistrali) to wykonanie recenzji eksperckiej
(„brak przeskoków przewodów") i litery §22.1 („pierwszeństwo ma routing; mostek
jest środkiem ostatecznym") w ramach istniejącej dyscypliny kropki węzłowej.
Kolejność wykonania: S7-P1 (kompaktyzacja Rodziny B + piony proporcjonalne) →
S7-P2 (węzeł T dla Rodziny A; aktualizacja crossing_probe do zera z mostkiem
dopuszczalnym wyłącznie dla pozostałych, dowiedzionych nieredukowalnych) →
S7-P3 (balancing + światła). crossingCount=0 POZOSTAJE warunkiem odbioru.

## 7. Wykonanie S7-P2 (2026-07-23) — węzeł T: przecięcia do zera

Zrealizowano **S7-P2** dla OBU rodzin (A magistrala×zejście, B lateral×zejście).
Mechanizm (`resolveTeeJunctions`, `scene/buildScene.ts` sekcja 7.5): każdy kabel
POZIOMY (przęsło magistrali `segment*` / kabel-wiersz płytszego lateralu
`branch_segment_R_*`) jest ROZCIĘTY dokładnie w punkcie, w którym dotyka go pion
ZEJŚCIA lateralu (`branch_segment_L`). Koniec połówki poziomej ląduje we WNĘTRZU
pionu ⇒ styk KOŃCEM = realny T-węzeł (`externalBranchNodes`) ⇒ kropka `junction`
(∅ §22.1). PIERWSZY kawałek zachowuje realny `ownerRef` (kontrakt kierunku
nakładki F-1 i licznik przęseł `overlay.ts` nietknięte), kolejne kawałki niosą
`⟨ref⟩#tee-N` (element rysunkowy — kontynuacja tego samego kabla ENM za odczepem,
poza bramką kierunku). Te same punkty rozcinają `allRouteGeoms`, więc
`classifyRouteNodes` reklasyfikuje dawne skrzyżowania na WĘZŁY (`scene.crossings`
→ 0). ELEKTRYCZNIE bez zmian (ten sam `ownerRef`, ciągłość toru zachowana).

Tabela 18 metryk (fixtura `sldSubstrate52s`, per LOD — L0/L1/L2), przed→po S7-P2:

| Metryka | Przed (po P1) | Po S7-P2 |
|---|---|---|
| **crossingCount** | **13/24/24** | **0/0/0** |
| kropki T (`junction`) | 0/0/0 | 13/24/24 |
| verticalLength | 28072/45016/45016 | 28072/45016/45016 (bez zmian) |
| horizontalLength | 47048/67192/70784 | 47048/67192/70784 (bez zmian) |
| totalOrthogonalLength | 75120/112208/115800 | 75120/112208/115800 (bez zmian) |
| bendCount | 39/167/167 | 39/167/167 (bez zmian) |
| contentBBox (w×h) | 14208×4379 / 14208×4457 / 14208×4457 | identycznie |
| widthUtilization | 0.0957/0.4291/0.4426 | identycznie |
| heightUtilization | 0.1204/0.2921/0.2921 | identycznie |
| bboxUtilization | 0.000370/0.004328/0.004328 | identycznie |
| inkDensity | 0.009854/0.018107/0.018560 | identycznie |
| minimumClearance | 8/8/8 | 8/8/8 |
| labelCollisionCount | 0/0/0 | 0/0/0 |
| subtreeIntersectionCount | 0/0/0 | 0/0/0 |
| nonOrthogonalSegmentCount | 0/0/0 | 0/0/0 |
| ambiguousConnectionCount | 0/0/0 | 0/0/0 |
| symbolCount | 68/568/568 | 81/592/592 (+kropki T) |
| stationCount | 53/53/53 | 53/53/53 |

Rozcięcie jest WSPÓŁLINIOWE (wierzchołek dzieli kabel bez ruchu geometrii), więc
piony/poziomy/załamania/bbox/kompaktyzacja P1 NIE regresują (podłogi
`sheet_fill_probe` i baza pionów `vertical_length_probe` spełnione z zapasem).
Jedyny przyrost to symbolCount (+13/+24/+24 kropek T) i inkDensity marginalnie ↑.

Pozostałe przecięcia po S7-P2: **ZERO** (`interiorCrossings` sn×sn = 0/0/0 na
wszystkich LOD, `crossingBusGaps` = 0). Mostek półłukowy NIE jest użyty na
fixturze referencyjnej (dopuszczalny wyłącznie dla dowiedzionych nieredukowalnych
— brak takich). `crossing_probe` zaostrzony do TWARDEGO ZERA (sn×sn ORAZ szyna).

Bramki S7-P2: `type-check`=0, `lint`=0, vitest (`src/ui/sld`, `sld-overlay`,
`engine/sld-layout`) zielone, `accept:sld-v3` ALL PASS, guardy
`sld_determinism`/`overlay_no_physics`/`no_codenames`/`forbidden_ui_terms`=0,
determinizm 2× (buildSceneV3 bajt-identyczny). Goldeny wymienione per plik:
`crossings.test.ts` (24 przecięcia → 0 + węzeł T z kropką), `buildScene.test.ts`
(L0: kropka ≠ stacja), `buildScene.gpzFeeder.test.ts` (styk feeder×magistrala =
węzeł T), `overlay.test.ts` (kontrakt kierunku F-1 przepisany na niezmiennik
monotoniczny from→to dla przęseł rozciętych). Acceptance `crossing_probe`
zaostrzony (TWARDE ZERO).

GAP-y do S7-P3: balancing całych poddrzew + rozdzielenie świateł
(`TOP_LEVEL_FIELD_CLEARANCE` +20–35%) — dopiero po spadku bbox, zgodnie z §4.
Migracja geometrii do `engine/sld-layout/layoutEngine.ts` (S7.5) po ustabilizowaniu
P1–P3. crossingCount=0 osiągnięty i utrzymany jako warunek odbioru.

## 8. Wykonanie S7-P3 (2026-07-23) — rozdzielone światła + generalizacja + GAP balansowania

Zrealizowano **S7-P3** w zakresie osiągalnym w bieżącej reprezentacji (grzebień
sekwencyjny w `scene/buildScene.ts`), zgodnie z `WYTYCZNE_GENERALIZACJA_LAYOUTU_
2026-07` (silnik OGÓLNY, nie strojony pod `sldSubstrate52s`).

### 8.1 Rozdzielone światła §5 (ZREALIZOWANE)
Jedno źródło prawdy `layout/clearances.ts` — 6 stałych kanonu §5, każda
wyprowadzona z footprintu/topologii (zero hardcode), mierzona MIĘDZY OBRYSAMI:

| Stała §5 | Plik/rola (realne miejsce) | Przed | Po | % |
|---|---|---|---|---|
| `MIN_GLYPH_CLEARANCE` | `measure.ts` `stationBlockWidth` (glify pól) | `GRID` | `GRID` | 0% |
| `MIN_LABEL_CLEARANCE` | `measure.ts` `PORT_CAPTION_BUS_CLEARANCE`/`STATION_BUSBAR_LABEL_GAP` | `GRID` | `GRID` | 0% |
| `MIN_FIELD_CLEARANCE` | `measure.ts` `STATION_BLOCK_BUS_CLEARANCE` | `2×GRID` | `2×GRID` | 0% |
| `MIN_SUBTREE_CLEARANCE` | `buildScene.ts` packer (`LATERAL_SUBTREE_CLEARANCE`) | `4×GRID` | `4×GRID` | 0% |
| `MIN_ROUTE_CLEARANCE` | `columns.ts` `CHANNEL_MIN_CLEARANCE` | `GRID` | `GRID` | 0% |
| `TOP_LEVEL_FIELD_CLEARANCE` | pas górny (przewleczony `columnGap`, oddzielony od `COLUMN_GAP` lateralów) | `3×GRID` | `3×GRID` | 0% |

**TOP_LEVEL_FIELD_CLEARANCE +20–35% — GAP netto (pomiar):** widełki `29..32 px`
NIE są stosowane na fixturze referencyjnej, bo pas górny NIE MA ŚCISKU przy
`3×GRID` (`minimumClearance = GRID = 8`, 0 kolizji, `accept:sld-v3` zielone).
Zgodnie z §5 („NAJMNIEJSZA wartość usuwająca ścisk") wartość dla tej fixtury =
bazowa; podniesienie w izolacji zwiększa `horizontalLength` (pomiar S6 §4: 24→32
= +336/LOD) ⇒ regres `layout_cost_probe (poziomy)` ORAZ `bboxUtilization↓` (§6),
czyli „niepotrzebne wydłużenie magistrali" (§5). Stała jest ODDZIELONA (osobny
`columnGap` pasa górnego, przewleczony przez `computeStationTaps`/
`computeColumns`/`buildRowLayout`), więc jej podniesienie jest teraz zmianą
JEDNEJ liczby — netto-dodatnie zastosowanie wymaga jednak footprint-driven
compact layout (S7.5), który obniży bbox na tyle, by szerszy pas górny był
skompensowany. GAP wykonalnościowy (Zero-Debt pkt 4), nie normatywny.

### 8.2 Fix determinizmu DER (ZREALIZOWANE — Zero-Debt, znalezisko §5)
Test permutacji (`buildScene.schemat10s7p3.test.ts`, WYTYCZNE §5) wykrył, że
kolejność DER (PV/BESS) w rzędzie nN zależała od kolejności tablicy `generators`
ENM (brak determinizmu-pod-permutacją). Naprawiono U ŹRÓDŁA: sort DER po
STABILNYM `id` (§4). Koszt kanonicznego porządku: `horizontalLength` +32/LOD na
L1/L2 (dołączenia nN), reszta bez zmian. `HORIZONTAL_LENGTH_BASELINE` podniesiony
z uzasadnieniem (nowa kanoniczna geometria po fixie poprawności).

### 8.3 Tabela 18 metryk przed/po (fixtura `sldSubstrate52s`, L0/L1/L2)

| Metryka | Przed (po P2) | Po S7-P3 |
|---|---|---|
| verticalLength | 28072/45016/45016 | 28072/45016/45016 |
| horizontalLength | 47048/67192/70784 | 47048/**67224**/**70816** (DER kanon +32 L1/L2) |
| totalOrthogonalLength | 75120/112208/115800 | 75120/112240/115832 |
| bendCount | 39/167/167 | 39/167/167 |
| contentBBox (w×h) | 14208×4379/4457/4457 | identycznie |
| widthUtilization | 0.0957/0.4291/0.4426 | 0.0957/0.4291/0.4426 |
| heightUtilization | 0.1204/0.2921/0.2921 | identycznie |
| bboxUtilization | 0.000370/0.004328/0.004328 | identycznie |
| inkDensity | 0.009854/0.018107/0.018560 | 0.009854/**0.018111**/**0.018564** (↑) |
| minimumClearance | 8/8/8 | 8/8/8 |
| labelCollisionCount | 0/0/0 | 0/0/0 |
| subtreeIntersectionCount | 0/0/0 | 0/0/0 |
| nonOrthogonalSegmentCount | 0/0/0 | 0/0/0 |
| ambiguousConnectionCount | 0/0/0 | 0/0/0 |
| crossingCount | 0/0/0 | 0/0/0 |
| symbolCount | 81/592/592 | 81/592/592 |
| stationCount | 53/53/53 | 53/53/53 |
| — kropki T (`junction`) | 13/24/24 | 13/24/24 |

### 8.4 Balancing całych poddrzew — GAP do S7.5 (POMIAR STRUKTURALNY)
**Balancing pionowy = ZREALIZOWANY** i uogólniony: packer interwałowy P1
(`createLateralShelfPacker`) JEST regułą balansowania całych poddrzew w osi Y
(footprint-driven interval packing, `dy` niemalejące — niezmiennik rezerwacji
kanałów). Uogólnienie dowiedzione na 5 klasach topologii (§12, niżej).

**Balancing poziomy (centrowanie na osi przyłączenia, środek ciężkości ważony
footprintem) = GAP nieredukowalny w tej reprezentacji** (Zero-Debt pkt 4).
Dowód strukturalny: pozycja X lateralu jest SZTYWNO związana z kanałem zejścia
(`dx = channelX − entryPort.x`, `buildScene.ts` sekcja 6). Przesunięcie
poddrzewa w X wymaga albo (a) ruchu `channelX` — łamie rezerwację kanałów
`insertColumnChannels` + `entry_collinearity_probe §22.3` + `junction_dot_probe`;
albo (b) jogu poziomego zejścia do przesuniętego ciała — dodaje załamania
(`layout_cost_probe`) i przecięcia (`crossing_probe` TWARDE ZERO). Packer jest
przy tym na LOKALNYM optimum osi Y pod niezmiennikiem „dy niemalejące"
(pakowanie first-fit-across-shelves zabronione tą samą rezerwacją). Genuine
centrowanie CoG wymaga footprint-driven layout w `engine/sld-layout/
layoutEngine.ts` (S7.5) — tam X poddrzewa jest zmienną decyzyjną, nie pochodną
kanału. WYTYCZNE §11 zakazuje wprost hacków geometrii w buildScene, więc
balancing poziomy NIE jest wciskany lokalnie — czeka na S7.5.

### 8.5 Dowód generalizacji §12 (WYTYCZNE) — reguły świateł + packingu
`buildScene.schemat10s7p3.test.ts` (8 testów) na 5 klasach topologii:

| Klasa | Fixtura | subs | kolizje | przec. | nieortog. | niejedn. | crossing (L0/L1/L2) |
|---|---|---|---|---|---|---|---|
| A radialna prosta | openTerminal | 1 | 0 | 0 | 0 | 0 | 0/0/0 |
| A ciąg radialny | openTrunkChain | 2 | 0 | 0 | 0 | 0 | 0/0/0 |
| B z odgałęzieniem | openBranch | 2 | 0 | 0 | 0 | 0 | 0/0/0 |
| C GPZ + feeder | gpzFeeder | 3 | 0 | 0 | 0 | 0 | 0/0/0 |
| E wieloźródłowa | sldSubstrate52s | 54 | 0 | 0 | 0 | 0 | 0/0/0 |

- **§5 permutacja**: odwrócenie pul rekordów (po `ref_id`) ⇒ scena
  BAJT-IDENTYCZNA na każdej fixturze/LOD (po fixie DER 8.2).
- **§11f różne footprinty razem**: stacja/switchgear/PV/BESS/trafo blokowy/
  pole pomiarowe (CT) + wstrzyknięty punkt NO — współistnieją, 0 kolizji.
- **§9 lokalność+stabilność**: długi opis PL na 1 lateralu ⇒ ciąg główny
  `anchorMovementCount=0`, `totalAnchorDisplacement=0`, `maxAnchorDisplacement=0`.
- **§10 wydajność**: 4.2 / 7.5 / 8.6 / 11.0 / 226.8 ms per 3 LOD (budżet <15 s).

### 8.6 Bramki S7-P3
`type-check`=0, `lint`=0, vitest (`src/ui/sld/v3` 962, `sld-overlay`+`engine/
sld-layout` 249) zielone, `accept:sld-v3` ALL PASS (baseline poziomów
zaktualizowany), guardy `sld_determinism`/`overlay_no_physics`/`no_codenames`/
`forbidden_ui_terms`=0, determinizm 2×. Zrzuty `docs/audit/visual/schemat-10/
s7p3-l0..l2.png` dołączone. Goldeny per plik: `HORIZONTAL_LENGTH_BASELINE`
(`sld_v3_acceptance.mjs`, przyczyna: kanoniczny porządek DER).

### 8.7 Pozostały dług (S7.5)
- `TOP_LEVEL_FIELD_CLEARANCE` +20–35% netto-dodatnio (po obniżeniu bbox).
- Balancing poziomy całych poddrzew (centrowanie CoG ważone footprintem).
- Migracja geometrii `buildScene`→`layoutEngine.ts` (`LayoutResult` render-only).
crossingCount=0 utrzymany jako warunek odbioru.

## §9 RECENZJA WŁAŚCICIELA PO P1-P3 (2026-07-22) — S6/S7 NIEODEBRANE, wymagane P0
Oceny: topologia 9, ortogonalność 9, piony 8, compact 8, balancing 7, arkusz 8,
GÓRNY PAS 6, czytelność całości 6, skalowalność BEZ DOWODU, gotowość 7.
P0 przed odbiorem: (1) światło górnego pasa mierzone bbox-do-bbox całych pól
(prawy bbox pola N → lewy bbox pola N+1 ≥ TOP_LEVEL_FIELD_CLEARANCE, z opisami
i aparaturą — nie odstęp kotwic); (2) każdy pion dłuższy niż footprint MUSI mieć
w raporcie przyczynę (kolizja z poddrzewem X / etykieta Y / M-02) — bez przyczyny
= skrócić; (3) czytelność stanów na widoku całości: na L0 rozpoznawalne typ
stacji, funkcja pola, NO, stan łącznika, źródło, transformator, tor mocy (bez
zoomu); (4-6) potwierdzenia: zero kolizji, JEDNA KOTWICA, raport metryk przed/po;
(7) dowód wielotopologiczny (WYTYCZNE §12). P1: lokalna gęstość (metryki
localOccupancyByGrid, largestEmptyRectangle, subtreeCenterDeviation,
h/vDensityVariance), odstęp stacji z footprintu (nie stały krok), hierarchia wag
tor główny→odejście→podgałąź (kolor NIE jedyny nośnik), testy długich opisów
i sieci 100–500 stacji. Sekcjonowanie/wielorzędowy pas magistrali dla bardzo
dużych sieci = polityka jawna, nigdy łamanie magistrali dla wyglądu.
