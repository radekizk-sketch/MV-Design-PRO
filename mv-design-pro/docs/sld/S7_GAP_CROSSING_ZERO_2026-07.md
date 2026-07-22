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

## ROZSTRZYGNIĘCIE ZARZĄDCY (Fable, 2026-07-22)
Wariant 2 z modyfikacją: S7-P2 NIE wymaga osobnej decyzji właściciela — węzeł T
z kropką (lateral kończy się NA magistrali) to wykonanie recenzji eksperckiej
(„brak przeskoków przewodów") i litery §22.1 („pierwszeństwo ma routing; mostek
jest środkiem ostatecznym") w ramach istniejącej dyscypliny kropki węzłowej.
Kolejność wykonania: S7-P1 (kompaktyzacja Rodziny B + piony proporcjonalne) →
S7-P2 (węzeł T dla Rodziny A; aktualizacja crossing_probe do zera z mostkiem
dopuszczalnym wyłącznie dla pozostałych, dowiedzionych nieredukowalnych) →
S7-P3 (balancing + światła). crossingCount=0 POZOSTAJE warunkiem odbioru.
