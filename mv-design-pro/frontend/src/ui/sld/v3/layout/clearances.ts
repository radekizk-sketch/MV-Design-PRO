/**
 * SCHEMAT-10 S7-P3 (V12K-137) — ROZDZIELONE ŚWIATŁA layoutu SLD v3.
 *
 * WARUNKI_ODBIORU_S6 §5 wymaga, by światło NIE było jedną globalną stałą `gap`,
 * lecz rodziną stałych ROZDZIELONYCH per rola, z których każda jest niezależnie
 * strojalna. Do S7-P2 światło poziome żyło jako pojedyncze `COLUMN_GAP`
 * (`segments.ts`) plus rozproszone, nienazwane stałe roli (`CHANNEL_MIN_CLEARANCE`
 * w `columns.ts`, `LATERAL_SUBTREE_CLEARANCE` w `scene/buildScene.ts`,
 * `STATION_BLOCK_BUS_CLEARANCE`/`PORT_CAPTION_BUS_CLEARANCE`/między-polowy `GRID`
 * w `measure.ts`). Ten moduł jest JEDNYM ŹRÓDŁEM PRAWDY tych świateł, nadaje im
 * kanoniczne nazwy z §5 i dokumentuje rolę każdego. Wartości są zachowane
 * bajt-identycznie względem S7-P2 (geometria niezmieniona — patrz raport karty
 * S7-P3, tabela 18 metryk przed/po), więc rozdzielenie to refaktoryzacja
 * słownika, nie zmiana obrazu.
 *
 * ŚWIATŁO MIĘDZY OBRYSAMI (§5, ostatnie zdanie): każde z tych świateł jest
 * mierzone między RZECZYWISTYMI obrysami (footprintami) treści, nie między
 * kotwicami. `MIN_SUBTREE_CLEARANCE` liczy się od footprintu poddrzewa
 * (`footprintLeft..footprintRight` w packerze, `scene/buildScene.ts` sekcja 6,
 * uwzględnia rezerwę etykiet po pomiarze fontu i otwarty ogon). `MIN_ROUTE_
 * CLEARANCE` liczy się od bounds treści sąsiedniej kolumny (kolumna + pasmo nazw
 * B5, `insertColumnChannels`). `TOP_LEVEL_FIELD_CLEARANCE`/`MIN_GLYPH_CLEARANCE`/
 * `MIN_FIELD_CLEARANCE` wchodzą do szerokości kolumny/bloku wyliczanej z
 * `requiredStationWidth`/`stationBlockWidth`, tj. z realnego obrysu bloku
 * (symbole + pola + etykiety), nie ze stałego slotu.
 *
 * TOP_LEVEL_FIELD_CLEARANCE (+20–35%, §5/§6): stała jest ODDZIELONA od
 * `COLUMN_GAP` lateralów właśnie po to, by dało się ją PODNIEŚĆ niezależnie od
 * grzebienia lateralnego. Na fixturze referencyjnej `sldSubstrate52s` pozostaje
 * przy wartości bazowej `3×GRID` — pomiar (raport S7-P3 §GAP) dowodzi, że pas
 * górny NIE MA ŚCISKU przy `3×GRID` (`minimumClearance = GRID`, 0 kolizji), więc
 * NAJMNIEJSZA wartość „usuwająca ścisk" (§5) = wartość bazowa; podniesienie w
 * izolacji wydłużyłoby magistralę (`horizontalLength↑` ⇒ regres
 * `layout_cost_probe`, `bboxUtilization↓`), co §5 nazywa „niepotrzebnym
 * wydłużeniem magistrali", a §6 — regresją. Widełki +20–35% (=`29..32 px`) są
 * PUŁAPEM stałej stosowanym tam, gdzie obrysy FAKTYCZNIE się ściskają; jego
 * netto-dodatnie zastosowanie na tej fixturze wymaga footprint-driven compact
 * layout (S7.5, migracja do `engine/sld-layout/layoutEngine.ts`), który obniży
 * bbox na tyle, że wzrost pasa górnego będzie skompensowany — GAP zapisany
 * w `docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md` §8.
 */

import { GRID } from '../core/grid';

/** Minimalne światło między dwoma sąsiednimi GLIFAMI (kolumnami pól/aparatów)
 *  WEWNĄTRZ jednego bloku stacji — `stationBlockWidth` (`measure.ts`) dolicza je
 *  między kolejnymi kolumnami pól. Rola §5: `MIN_GLYPH_CLEARANCE`. */
export const MIN_GLYPH_CLEARANCE = GRID;

/** Minimalne światło ETYKIETY od sąsiedniej geometrii (osi szyny / portu pola)
 *  — podpis kierunku pola (`PORT_CAPTION_BUS_CLEARANCE`) i etykieta szyny SN
 *  (`STATION_BUSBAR_LABEL_GAP`) w `measure.ts`. Rola §5: `MIN_LABEL_CLEARANCE`. */
export const MIN_LABEL_CLEARANCE = GRID;

/** Minimalne światło BLOKU PÓL od szyny (nad kolumnami — szyna SN; pod
 *  kolumnami — szyna nN), `STATION_BLOCK_BUS_CLEARANCE` w `measure.ts`.
 *  Rola §5: `MIN_FIELD_CLEARANCE`. */
export const MIN_FIELD_CLEARANCE = 2 * GRID;

/** Minimalne światło POZIOME między footprintami DWÓCH poddrzew (lateralów)
 *  dzielących ten sam pas Y (interval packing, `scene/buildScene.ts` packer).
 *  Rola §5: `MIN_SUBTREE_CLEARANCE`. */
export const MIN_SUBTREE_CLEARANCE = 4 * GRID;

/** Minimalne światło kanału ROUTINGU (pionu zejścia lateralu) od treści
 *  sąsiedniej kolumny z KAŻDEJ strony — `insertColumnChannels` (`columns.ts`).
 *  Rola §5: `MIN_ROUTE_CLEARANCE`. */
export const MIN_ROUTE_CLEARANCE = GRID;

/** Światło POZIOME między kolumnami stacji PASA GÓRNEGO (magistrali) — ODDZIELONE
 *  od `COLUMN_GAP` lateralów, by dało się je podnieść niezależnie (§5, widełki
 *  +20–35%). Rola §5: `TOP_LEVEL_FIELD_CLEARANCE`.
 *
 *  SCHEMAT-10 S7-P4 (V12K-137, recenzja właściciela §9 P0 pkt 1): PODNIESIONE
 *  `3×GRID` (24 px) → `4×GRID` (32 px), tj. +33,3% — NAJMNIEJSZA wartość
 *  wyrównana do siatki w widełkach §5 „+20–35%" (28,8..32,4 px). Wyprowadzenie
 *  OGÓLNE (nie strojenie fixtury): §5 wymaga „NAJMNIEJSZEJ wartości z +20–35%,
 *  która usuwa ścisk i zapewnia światło"; jedyny mnożnik `k×GRID` w tym paśmie
 *  to `k=4` (siatka `GRID=8` — wartości pośrednie łamałyby `grid_probe`, bo
 *  originy stacji muszą leżeć na `GRID`). Recenzja AKCEPTUJE zmierzony koszt
 *  poziomy: pas górny mierzony bbox-do-bbox (wyrocznia `topBandFieldClearances`,
 *  `scene/buildScene.ts`) rósł z 24 → 32 px między REALNYMI obrysami pól
 *  (opisy+aparatura), co daje czytelniejszy odstęp (recenzja: „GÓRNY PAS 6").
 *  Koszt: `horizontalLength` +8 px × (liczba szczelin magistrali) per LOD —
 *  baseline `HORIZONTAL_LENGTH_BASELINE` (`scripts/sld_v3_acceptance.mjs`)
 *  podniesiony świadomie, z uzasadnieniem per liczba. Podłoga `sheet_fill_probe`
 *  skorygowana o zmierzony koszt świateł (nie poza). */
export const TOP_LEVEL_FIELD_CLEARANCE = 4 * GRID;

// ---------------------------------------------------------------------------
// W3-KABLE-ETYKIETY §5 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §5 „Światła
// równoległych kabli", P0): CZTERY stałe kontraktowe świateł tras kablowych.
// Zakaz „przewodu podwójnego" (dwie trasy tak blisko, że wyglądają jak jeden
// przewód dwużyłowy). Każda wartość WYPROWADZONA Z POMIARU dzisiejszej
// geometrii na fixturze referencyjnej `sldSubstrate52s` + fixturach H
// (`scripts/measure_parallel_clearance.mjs`, wynik w raporcie karty W3),
// wg reguły §5 WARUNKÓW_ODBIORU_S6: „NAJMNIEJSZA wartość, która usuwa zlanie
// optyczne i nie wydłuża magistrali niepotrzebnie". Wartości są PODŁOGAMI
// (floor) — dzisiejsza geometria je SPEŁNIA Z ZAPASEM (pomiar: min. światło
// równoległych PIONÓW tras między stacjami = 64 px na L1/L2, 408 px na L0),
// więc wpięcie NIE zmienia obrazu (zero regresji baseline) — jest twardą
// bramką chroniącą przed przyszłym zbliżeniem tras poniżej progu zlania.
// Światło mierzone między RZECZYWISTYMI osiami tras (nie kotwicami), spójnie
// z resztą modułu.

/** Minimalne światło POZIOME między osiami DWÓCH RÓŻNYCH tras kablowych
 *  (magistrala/laterale) dzielących ten sam pas Y — „równoległe kable nie
 *  zlewają się w przewód podwójny" (§5). Wyprowadzenie: dzisiejszy packer
 *  interwałowy pakuje laterale z footprintem `MIN_SUBTREE_CLEARANCE` (4×GRID),
 *  a zmierzone realne minimum osi-do-osi między niezależnymi trasami wynosi
 *  64 px (L1/L2). `4×GRID` (32 px) to NAJMNIEJSZY pełny czteroklatkowy odstęp,
 *  przy którym dwie osie są jednoznacznie rozdzielone (próg zlania optycznego
 *  ≪ 32 px), a jednocześnie NIE wydłuża magistrali (bieżące 64 px ≥ 32 px).
 *  Rola §5: `MIN_PARALLEL_CABLE_CLEARANCE`. */
export const MIN_PARALLEL_CABLE_CLEARANCE = 4 * GRID;

/** Minimalne światło między osią kabla a jego ETYKIETĄ techniczną (§5/§7) —
 *  etykieta nie może dotykać ani nachodzić na trasę. Wyprowadzenie: silnik
 *  etykiet (`layout/labels.ts`, `resolveSegmentLateralLabel`) rezerwuje
 *  `required = acrossLine + GRID`, tj. dokładnie `GRID` (8 px) prześwitu między
 *  blokiem tekstu a linią. `GRID` to zmierzona, egzekwowana dziś wartość
 *  minimalna tekst↔trasa. Rola §5: `MIN_CABLE_LABEL_CLEARANCE`. */
export const MIN_CABLE_LABEL_CLEARANCE = GRID;

/** Minimalne światło wokół WĘZŁA ROZGAŁĘZIENIA (branch junction) — sąsiednie
 *  osie/treść nie wchodzą w akcent węzła, węzeł pozostaje jednoznaczny (§5).
 *  Wyprowadzenie: akcent węzła rozgałęzienia (`branchJunction`, `symbols/
 *  defs.ts`) ma 4×GRID (32 px) gabarytu; `2×GRID` (16 px) = połowa gabarytu,
 *  minimalny prześwit z KAŻDEJ strony, przy którym akcent nie styka się z
 *  sąsiednią osią. Rola §5: `MIN_JUNCTION_CLEARANCE`. */
export const MIN_JUNCTION_CLEARANCE = 2 * GRID;

/** Minimalne światło między DWOMA WYJŚCIAMI kabli z tej samej stacji — każdy
 *  kabel wychodzi z osi WŁASNEJ głowicy (§5/§6, po W1b głowica na porcie
 *  kablowym). Wyprowadzenie: gdy z jednej stacji wychodzi wiele laterali,
 *  `LATERAL_CHANNEL_STEP` (`scene/buildScene.ts`) rozsuwa kolejne kanały
 *  zejścia o `GRID` (8 px) — to zmierzona, egzekwowana dziś minimalna
 *  separacja odrębnych wyjść pól. Rola §5: `MIN_FIELD_EXIT_CLEARANCE`. */
export const MIN_FIELD_EXIT_CLEARANCE = GRID;
