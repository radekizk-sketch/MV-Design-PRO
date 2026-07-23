/**
 * SLD V3 F7 — skrypt render-odbioru: wszystkie wyrocznie spec §11/§9/§16
 * uruchomione na REALNEJ fixturze `sldSubstrate52s` (v2, 53 stacje), per LOD
 * 0/1/2. Reużywa WYŁĄCZNIE wyrocznie eksportowane z produkcyjnego kodu v3
 * (`scene/buildScene.ts`, `layout/labels.ts`) — nie duplikuje logiki testów,
 * przenosi asercje §16 (ciągłość elektryczna) z
 * `scene/__tests__/buildScene.test.ts` sekcja E na te same funkcje.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   npx vite-node scripts/sld_v3_acceptance.mjs
 *   npm run accept:sld-v3
 *
 * Exit code: 0 gdy WSZYSTKIE wyrocznie na WSZYSTKICH LOD są zielone; 1 gdy
 * jakikolwiek FAIL (włącznie z wyjątkiem rzuconym przez buildSceneV3 — łapany
 * per LOD, żeby raport pozostałych LOD i tak się wypisał).
 *
 * Determinizm RAPORTU (nie tylko sceny): zero `Date.now()`/`Math.random()`/
 * UUID w treści wypisywanej — dwa uruchomienia na tym samym kodzie dają
 * BAJT-IDENTYCZNY stdout (poza ewentualną kolejnością wypisu, która tu jest
 * zawsze sekwencyjna/deterministyczna).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  buildSceneV3,
  allApparatusIdentifiersValid,
  allBusbarLabelsValid,
  allEarthSwitchesLateral,
  allFieldEntryConnectionsReachCableHead,
  allLineBayCaptionsValid,
  allPathTerminationsLabeled,
  allSwitchSymbolsUnambiguous,
  allVtParallel,
  apparatusIdentifierGaps,
  busbarLabelGaps,
  earthSwitchLateralGaps,
  lineBayCaptionGaps,
  pathTerminationLabelGaps,
  stationTypeTopologyMismatches,
  switchSymbolUnambiguityGaps,
  vtParallelGaps,
  allCtAnnotationsValid,
  allProtectionMarkingsValid,
  allSceneGeometryOnGrid,
  allSceneSegmentEndpointsAnchored,
  allSourcesConnected,
  allSourcesVisible,
  fieldEntryConnectionsReachCableHead,
  labelWireCollisions,
  noBranchWithoutAccent,
  noForbiddenDirectionTokens,
  noLabelWireCollisions,
  noProtectionAnnotationAtLod0,
  noSceneSymbolOverlaps,
  noSymbolWireCollisions,
  ctAnnotationGaps,
  protectionAnnotationAtLod1IsCircleOnly,
  protectionMarkingGaps,
  allSecondaryLinksValid,
  secondaryLinkDualityGaps,
  noAnnotationOverlapsPrimaryPath,
  annotationOverlapsPrimaryPath,
  allMeterSymbolsDisambiguated,
  meterDisambiguationGaps,
  sceneSegmentEndpointGaps,
  openTerminalGaps,
  allOpenTerminalsMarked,
  sourceConnectivityGaps,
  sourceCoverageGaps,
  allSourceStatesLegal,
  sourceStateGaps,
  symbolWireCollisions,
  totalVerticalSegmentLength,
  totalHorizontalSegmentLength,
  orthogonalBendCount,
  sheetFillRatio,
  trunkThicknessGaps,
} from '../src/ui/sld/v3/scene/buildScene.ts';
import { allBayTemplatesValid, bayTemplateGaps } from '../src/ui/sld/v3/scene/buildScene.ts';
import { overlapProbe } from '../src/ui/sld/v3/layout/labels.ts';
import { SEGMENT_STROKE_WIDTH } from '../src/ui/sld/v3/compose/preview.tsx';
import { fieldSilhouettesAreInjective } from '../src/ui/sld/v3/compose/station.ts';
import { sourceKindSymbolsAreInjective } from '../src/ui/sld/v3/compose/sourceKind.ts';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs.ts';
import {
  busBandClearanceGaps,
  crossingBusGaps,
  entryCollinearityGaps,
  interiorCrossings,
  junctionDotGaps,
} from '../src/ui/sld/v3/scene/crossings.ts';
import {
  allGpzHvColumnsComplete,
  gpzDominanceGaps,
  gpzHvColumnGaps,
  gpzIsDominant,
} from '../src/ui/sld/v3/scene/gpzCanonProbes.ts';
import { GRID } from '../src/ui/sld/v3/core/grid.ts';
import {
  buildFlowOverlayFromScene,
  flowOverlayValuesTraceToPayload,
  isFlowOverlayEmpty,
  singleHopSegmentRefs,
} from '../src/ui/sld/v3/canvas/overlay.ts';
import { computeFlowOverlayPlacements } from '../src/ui/sld/v3/canvas/SldCanvasV3.tsx';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  'src',
  'ui',
  'sld',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = JSON.parse(readFileSync(fixturePath, 'utf8')).enm;

const LODS = [0, 1, 2];
const EXPECTED_STATION_COUNT = 53;

/**
 * F9.7 (§15.1 `vertical_length_probe`): baseline PIERWSZEGO wpięcia — wartość
 * `totalVerticalSegmentLength(buildSceneV3(enm, lod))` zmierzona na TEJ
 * fixturze w chwili dostawy F9.7 (2026-07-15), po analizie optymalizacyjnej
 * (patrz raport agenta — pkt B: żaden bezpieczny/tani skrót nie znaleziony
 * bez ryzyka regresji w `layout/bands.ts`/`layout/measure.ts`, geometria
 * NIEZMIENIONA w tej fazie). Wyrocznia poniżej wymaga WARTOŚCI NIE WIĘKSZEJ
 * niż baseline — spadek jest dozwolony i pożądany (przyszła optymalizacja),
 * wzrost jest regresją (FAIL). Aktualizacja baseline wymaga świadomej zmiany
 * TEGO pliku z uzasadnieniem (nie automatycznej).
 *
 * F9.10 (REBUILD_PLAN_V3 F9.10, root-cause z F9.7 C — naprawa geometryczna
 * `symbolWireCollisions`, patrz gate `symbol_wire_probe` poniżej): baseline
 * PODNIESIONY z {0: 9656, 1: 38504, 2: 53304} na WARTOŚĆ
 * ZMIERZONĄ po zmianie `DESCENT_STRIP_HEIGHT` (2×GRID→6×GRID,
 * `layout/bands.ts`) — świadome odstępstwo od reguły „nie-rosnąca", zgodnie
 * ze spec §15.1 („redukcja jest ograniczeniem MIĘKKIM — nigdy kosztem
 * czytelności ani kolizji"): kolizje symbol↔przewód (§11.4, twarde zero)
 * mają pierwszeństwo przed minimalizacją pionów. Delta jest STAŁA na
 * WSZYSTKICH LOD (+2496px) — spójne z tym, że rezerwacja `DESCENT_STRIP_
 * HEIGHT` jest doliczana JEDNOLICIE do KAŻDEGO wiersza sceny niezależnie od
 * LOD (patrz `bands.ts` `computeBands`/F6d).
 */
// F10.1 (spec §18.1): OBNIŻONY względem F9.10 (12152/41000/55800) — ES/VT
// wyjęte z osi skracają tor główny pola o 32px; miara nie-rosnąca spełniona
// z zapasem (spadek, nie wzrost).
// F10.2 (spec §19.2): L2 OBNIŻONY 53304→52232 — podpisy kierunku pola z
// nazwą linii (`⟨numer linii⟩ · kier./odg. ⟨kod⟩`, dane realne na fixturze
// referencyjnej: `LineRunV1.name`) są DŁUŻSZE niż sam kod kierunku,
// poszerzając kolumny NIEKTÓRYCH pól — przez `colorSegmentLabelRows`
// (`layout/segments.ts`, r9, NIEZMIENIONE) inny rozkład szerokości kolumn
// dał INNY przydział wierszy pasma B1, oddając 1072px pionów na L2 (spadek,
// miara nie-rosnąca spełniona z zapasem). L0/L1 BEZ zmian (captions
// nieobecne na tych LOD, spec §7).
//
// F10.3 (spec §18.4, `busbar_label_probe`): L1 PODNIESIONY 38504→41000, L2
// PODNIESIONY 52232→54104 — zakaz anonimowego odcinka szyny SN wymaga
// WŁASNEGO wiersza pasma B2 (`stationBusbarLabelHeight`, `layout/measure.ts`)
// nad podpisem kierunku pola, doliczanego JEDNOLICIE do KAŻDEGO wiersza
// stacji z ≥1 polem SN (`composeStation` rysuje szynę/etykietę TYLKO gdy
// `snBays` niepuste — L0 nie niesie `snBays` z konstrukcji, kolaps do
// `stationCollapsed`, więc L0 BEZ zmian). Świadome odstępstwo od reguły
// „nie-rosnąca" (jak F9.10 — czytelność/zero-anonimowej-treści ma
// pierwszeństwo, spec §15.1 „redukcja jest ograniczeniem MIĘKKIM"): ZERO
// nowych kolizji jakiegokolwiek rodzaju na fixturze referencyjnej po tej
// zmianie (`symbol_wire_probe`/`overlapProbe`/`noLabelWireCollisions`
// wszystkie PASS z tą samą — twardą — regułą co przed F10.3).
// F13.1/F13.2 (D3, 2026-07-16, przejęcie nadzorcy): L0 12120→12280 (+160 —
// rynna objazdu wyjścia GPZ, eliminacja przebicia własnej szyny §22.3);
// L1 41000→40952, L2 54104→54056 (−48 netto: kolumna WN GPZ + kasacja
// fałszywego akcentu-kropki V12K-039 + strefa GPZ jako dekoracja).
// F13.3 (spec §22.3, D3-4/D3-15): L1 40952→41880, L2 54056→54984 (+928 —
// 12 wejść lateralnych prowadzonych rynną ZA blokiem stacji docelowej i POD
// stacją do głowicy OD DOŁU zamiast pionu współliniowego z osią pola przez
// pas szyny; koszt = 2×(dystans strop-wiersza→sub-poziom pod głowicami) na
// wejście. Zysk twardy: bus_band_clearance_probe 12→0, entry_collinearity
// 12→0 na L1/L2. L0 bez zmian (stacja zbiorcza — pas szyny nie istnieje).
// §16-v3 (2026-07-17): L0 12280→12488 (+208), L1 41880→42560 (+680),
// L2 54984→55664 (+680) — 13 OTWARTYCH ogonów ENM (segmenty za ostatnią
// stacją każdego ciągu, `…/branch_end`/`…/downstream`) dotąd NIEWIDOCZNYCH
// jest teraz rysowanych (zejście głowica→korytarz per ogon + pionowy słupek
// terminalny 2×GRID na ogonie magistrali). Zysk twardy: 13 realnych
// segmentów ENM w DOM (klik/nakładka), field_entry_probe 13→0 głowic
// dyndających, `buildScene.openTerminal.test.ts` pilnuje 1 słupka/ogon.
// Recenzja NO-GO 2026-07-17 (pkt 1/2/3/4): L0 12488→12472 (−16 netto), L1
// 42560→42608 i L2 55664→55712 (+48) — objazd magistrali głębiej pod strefą
// (+3×GRID) + pas ±2×GRID w warunku objazdu, źródło-ekwiwalent zaczepione
// nad szyną SN (L0: krótsze zejście), DWA nowe wiersze tabliczek strefy GPZ
// (TR uk%/Pk + „Ekwiwalent sieci zasilającej") pogłębiają nawis → dłuższy
// pion wyjścia magistrali na L1/L2. Uzasadnienie liczbowe:
// `buildScene.test.ts` vertical_length_probe (ta sama historia baseline).
// 7 pozycji PLAN recenzji NO-GO (runda 7): L1 47240, L2 67208 — dwa wiersze
// strony nN per stacja (pkt 6) + szersze etykiety przęseł z parą końców
// (pkt 13) minus krótsze stosy RMU (pkt 5); uzasadnienie liczbowe:
// buildScene.test.ts vertical_length_probe.
// SCHEMAT-10 S1 (V12K-135, „jedna kotwica"): L0 12472→50264, L1 47240→67208,
// L2 BEZ zmian (67208 — L1 zrównało się z L2). Świadoma WYMIANA WZORCA:
// geometria (kolumny/pasma/kotwice/rezerwy korytarzy/wyrównanie GPZ) liczona
// zawsze przy pełnym szczególe (L2) niezależnie od poziomu renderu → środek
// glifu KAŻDEJ stacji i oś magistrali IDENTYCZNE na L0/L1/L2 (koniec D1 „trzy
// światy"). L0/L1 renderują teraz w pełnej rezerwie L2 (stąd wzrost pionów);
// §15.1 „redukcja jest ograniczeniem MIĘKKIM" — spójność LOD ma pierwszeństwo.
// Uzasadnienie i dowód: buildScene.test.ts vertical_length_probe + „JEDNA KOTWICA".
// SCHEMAT-10 S7-P1 (V12K-137, GAP `S7_GAP_CROSSING_ZERO` §S7-P1): OBNIŻONY
// 50264/67208/67208 → 28072/45016/45016 (L0 −44%, L1/L2 −33%) — kompaktyzacja
// Rodziny B: kursor sekwencyjny `nextRowTopY` zastąpiony pakowaniem
// interwałowym (laterale rozłączne w X dzielą pas Y; piony PROPORCJONALNE do
// footprintu, nie do skumulowanej pozycji w grzebieniu). Baseline ZACIEŚNIONY
// do zmierzonej wartości — bramka nie-rosnąca chroni przed cofnięciem zysku.
// Topologia/kolejność aparatów/ciągłość toru/„jedna kotwica" NIEZMIENIONE.
const VERTICAL_LENGTH_BASELINE = { 0: 28072, 1: 45016, 2: 45016 };

/**
 * SCHEMAT-10 S6 (V12K-137) — funkcja kosztu layoutu (recenzja ekspercka pkt 3):
 * poza pionami (baseline wyżej) mierzymy również POZIOMY i ZAŁAMANIA, jako
 * gwarancje NIE-ROSNĄCE (spadek dozwolony/pożądany przy przyszłej
 * kompaktyzacji; wzrost = regresja). Wartości zmierzone przy dostawie S6 na
 * fixturze referencyjnej PO podniesieniu światła pasa górnego (`COLUMN_GAP`
 * 3×GRID→4×GRID, `layout/segments.ts`, +33,3%): poziomy urosły o stałą +336
 * fixturze referencyjnej (geometria bez zmian w S6 — patrz raport karty:
 * podniesienie `COLUMN_GAP` w izolacji regresowałoby §6, więc cofnięte;
 * kompaktyzacja footprint-driven = S7). Aktualizacja tych baseline — jak
 * `VERTICAL_LENGTH_BASELINE` — wymaga świadomej zmiany TEGO pliku.
 */
const HORIZONTAL_LENGTH_BASELINE = { 0: 47048, 1: 67192, 2: 70784 };
const BEND_COUNT_BASELINE = { 0: 39, 1: 167, 2: 167 };

/**
 * S6 pkt 10 (eliminacja pustych przestrzeni) — PODŁOGA wykorzystania arkusza
 * (udział komórek siatki pokrytych treścią w bbox sceny, `sheetFillRatio`).
 * Miara jest z natury niska dla schematu grzebieniowego (rzadkie linie na
 * dużym arkuszu) — bramka wymaga, by wypełnienie NIE SPADŁO poniżej podłogi
 * zmierzonej przy dostawie S6 (regresja „arkusz spuchł pustką" = FAIL).
 * Kompaktyzacja (S7) ma tę wartość PODNIEŚĆ; podłoga chroni przed cofnięciem.
 * Podłogi = zmierzone wartości minus mały margines na jitter metryk tekstu.
 */
// SCHEMAT-10 S7-P1 (V12K-137): PODNIESIONY 0.0069/0.0114/0.0117 →
// 0.0098/0.0180/0.0185 (zmierzone po kompaktyzacji Rodziny B; „wykorzystanie
// arkusza po > przed" — warunek odbioru S6 §6). Podłoga zaryglowuje zysk.
const SHEET_FILL_FLOOR = { 0: 0.0098, 1: 0.018, 2: 0.0185 };

/**
 * F9.7 (dług F9.3(b), spec §11.4 `wire_probe` rozszerzony o symbole —
 * `symbolWireCollisions`) wpięła tę wyrocznię z baseline LICZONYM (11
 * znanych kolizji `branchJunction`↔przewód na L1/L2, 0 na L0), przyczyna
 * geometryczna udokumentowana w `scene/buildScene.ts` (docstring
 * `symbolWireCollisions`) — `DESCENT_STRIP_HEIGHT` (16px) nie mieścił
 * akcentu węzła (32px) bez nachodzenia na sub-poziom korytarza
 * międzystacyjnego.
 *
 * F9.10 (REBUILD_PLAN_V3 F9.10): naprawa geometryczna U ŹRÓDŁA
 * (`DESCENT_STRIP_HEIGHT` 2×GRID→6×GRID, `layout/bands.ts`, uzasadnienie
 * liczbowe tam) sprowadza kolizje do ZERA na WSZYSTKICH LOD — baseline
 * USUNIĘTY, gate jest teraz TWARDYM ZEREM (DoD F9.10: „noSymbolWireCollisions
 * bez baseline"), tym samym wzorcem co `noSceneSymbolOverlaps` poniżej.
 */

let anyFail = false;
const out = [];

function line(text) {
  out.push(text);
}

/** Rejestruje jedną asercję w raporcie; zwraca `pass` (żeby wołający mógł
 *  warunkowo pominąć zależne asercje bez rzucania). */
function check(label, pass, detail) {
  if (!pass) anyFail = true;
  line(`  [${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
  return pass;
}

function symbolRectsOf(scene) {
  return scene.symbols.map((s) => {
    const def = SYMBOL_DEFS[s.symbolId];
    return { x: s.x, y: s.y, width: def.width, height: def.height };
  });
}

/** Hash identyfikatora stacji (`stn/<hash>/station` → `<hash>`) — jak w
 *  `buildScene.test.ts` sekcja E, do grupowania symboli po stacji bez
 *  odwoływania się do prywatnych funkcji modułu. */
function stationHash(stationId) {
  const parts = stationId.split('/');
  return parts[1] ?? stationId;
}

function stationXRange(scene, stationId) {
  const hash = stationHash(stationId);
  const xs = scene.symbols.filter((s) => s.meta && s.meta.testId && s.meta.testId.includes(hash)).map((s) => s.x);
  if (xs.length === 0) return null;
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

/**
 * §16 (ciągłość elektryczna ciągu głównego) — przeniesione z
 * `buildScene.test.ts` „ciągłość elektryczna ciągu głównego (spec §16, LOD 2)".
 *
 * F9.7 (§15.2 `lod_path_probe`, rozszerzenie zakresu — dowód empiryczny):
 * ORYGINALNIE uruchamiane WYŁĄCZNIE na LOD 2 (test źródłowy scoped do LOD 2,
 * bez rozszerzania ponad udowodnione). §15.2 wymaga DOSŁOWNIE: „na L0/L1/L2
 * zbiór odcinków toru elektrycznego jest niepusty i pokrywa TE SAME
 * połączenia topologiczne" — to wymaga uruchomienia TYCH SAMYCH asercji na
 * WSZYSTKICH LOD, nie tylko L2. Zweryfikowane EMPIRYCZNIE przed wpięciem
 * (skrypt jednorazowy, raport agenta F9.7): wszystkie cztery asercje
 * (resolved/order/bridging/connectedToGpz/junctions) przechodzą identycznie
 * na L0/L1/L2 na fixturze referencyjnej — rozszerzenie zakresu jest więc
 * dowiedzione, nie założone. Zwraca SYGNATURĘ (kolejność `mainTrunkStationIds`
 * — dane z adaptera, LOD-niezależne z konstrukcji) do porównania MIĘDZY LOD
 * po pętli (dowód „te same połączenia topologiczne", nie tylko „bridging
 * gdzieś istnieje" na każdym LOD z osobna).
 */
function checkContinuity(scene) {
  const ids = scene.meta.mainTrunkStationIds;
  const ranges = ids.map((id) => stationXRange(scene, id));
  const allResolved = check(
    '§16/§15.2: każda stacja ciągu głównego ma symbole w scenie',
    ranges.every((r) => r != null),
    `${ranges.filter((r) => r == null).length} stacji bez symboli`,
  );
  if (!allResolved) return null;

  let orderOk = true;
  for (let i = 1; i < ranges.length; i++) {
    if (!(ranges[i - 1].max < ranges[i].min)) orderOk = false;
  }
  check('§16/§15.2: stacje ciągu głównego narysowane w kolejności topologyRuns[].stationRefs (rosnące X)', orderOk);

  let bridgingOk = true;
  for (let i = 1; i < ranges.length; i++) {
    const gapStart = ranges[i - 1].max;
    const gapEnd = ranges[i].min;
    // §16-v3 (tożsamość łańcucha, 2026-07-17): przęsło międzystacyjne bywa
    // ŁAŃCUCHEM kawałków (segment per człon ENM, `chainSegmentRefs`/
    // `splitPolylineIntoPieces` w `buildScene.ts`) — mostkowanie dowodzi
    // POKRYCIE SUMĄ przedziałów X kawałków (kawałki stykają się końcami z
    // konstrukcji), nie jednym odcinkiem. Dla łańcucha 1-członowego suma ==
    // stary warunek (bez osłabienia: przerwa w pokryciu dalej = FAIL).
    const spans = scene.segments
      .map((segment) => {
        const xs = segment.points.map((p) => p.x);
        return { minX: Math.min(...xs), maxX: Math.max(...xs) };
      })
      .filter((s) => s.minX <= gapEnd - GRID && s.maxX >= gapStart + GRID)
      .sort((a, b) => a.minX - b.minX);
    let covered = gapStart + GRID;
    for (const s of spans) {
      if (s.minX > covered) break;
      covered = Math.max(covered, s.maxX);
    }
    if (covered < gapEnd - GRID) bridgingOk = false;
  }
  check('§16/§15.2: każda para kolejnych stacji ciągu głównego ma odcinek mostkujący przerwę', bridgingOk);

  const firstRange = ranges[0];
  const connectedToGpz = scene.segments.some((segment) => {
    const xs = segment.points.map((p) => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    return minX < firstRange.min && maxX <= firstRange.max + GRID;
  });
  check('§16/§15.2: GPZ połączony z pierwszą stacją ciągu głównego (trasa na lewo od niej)', connectedToGpz);

  check(
    '§16/§15.2: węzły routingu (junctions/crossings) istnieją dla ciągu głównego z lateralami',
    scene.junctions.length + scene.crossings.length > 0,
  );

  // lod_path_probe (§15.2, „niepusty"): zbiór odcinków toru elektrycznego
  // sceny nie jest pusty na tym LOD.
  check('lod_path_probe (§15.2): zbiór odcinków sceny niepusty', scene.segments.length > 0, `segmenty=${scene.segments.length}`);

  return JSON.stringify(ids);
}

// F9.3 (FIX-3, po recenzji Opusa): wpięcie field_silhouette_probe (§14.3,
// V12K-031) — WŁAŚCIWOŚĆ GLOBALNA systemu (nie zależy od fixtury/sceny,
// `fieldSilhouettesAreInjective` dowodzi na `ALL_FIELD_ROLES`), sprawdzana
// RAZ, przed pętlą per-LOD.
line('');
line('=== field_silhouette_probe (§14.3, V12K-031, globalne — poza pętlą LOD) ===');
check(
  'field_silhouette_probe: każde dwie role SPOZA tej samej klasy równoważności mają RÓŻNE sygnatury wizualne',
  fieldSilhouettesAreInjective(),
);

// F9.7: source_symbol_probe (§13.2) — WŁAŚCIWOŚĆ GLOBALNA (tabela stała
// `DER_SOURCE_KIND_SYMBOL`, `compose/sourceKind.ts`), nie zależy od
// fixtury/sceny — sprawdzana RAZ, jak field_silhouette_probe wyżej.
check(
  'source_symbol_probe (§13.2): rodzaje DER ROZPOZNANE (pv/bess/generator/wind) mapują na UNIKALNE glify, rozłączne z gridSource',
  sourceKindSymbolsAreInjective(),
);

// F10.2 (spec §19.3, V12K-034): station_type_topology_probe — NIEZALEŻNA od
// buildSceneV3/lod (działa WPROST na snapshot ENM przez adapter v2) — (a)
// typ stacji WYPROWADZONY z topologii == typ w danych na fixturze
// referencyjnej (dowód pozytywny: 0 niezgodności na 53 realnych stacjach —
// spójne dane, żaden false positive); (c) sprawdzone niezależnie w
// `compose/__tests__/directions.test.ts` (3 pola liniowe ⇒ „odgałęźna").
{
  const mismatches = stationTypeTopologyMismatches(enm);
  check(
    'station_type_topology_probe (§19.3 a): 0 niezgodności typ-z-topologii vs station_type (dana) na fixturze referencyjnej',
    mismatches.length === 0,
    `niezgodności=${mismatches.length}${mismatches.length ? ' np. ' + JSON.stringify(mismatches[0]) : ''}`,
  );
  // Test negatywny (b) — dowód, że wyrocznia GRYZIE: snapshot z PODMIENIONYM
  // station_type jednej stacji (branch→terminal, mimo 3 pól liniowych w
  // danych) MUSI dać niezgodność zgłoszoną (nie cichą akceptację).
  const sabotagedStation = enm.substations.find((s) => s.station_type === 'branch');
  if (sabotagedStation) {
    const sabotagedEnm = {
      ...enm,
      substations: enm.substations.map((s) =>
        s === sabotagedStation ? { ...s, station_type: 'terminal' } : s,
      ),
    };
    const sabotagedMismatches = stationTypeTopologyMismatches(sabotagedEnm);
    check(
      'station_type_topology_probe (test negatywny (b) — dowód, że wyrocznia gryzie): station_type podmieniony (branch→terminal) MUSI dać niezgodność zgłoszoną',
      sabotagedMismatches.some((m) => m.stationId === sabotagedStation.ref_id),
    );
  }
}

// F9.7 (§15.2 lod_path_probe): sygnatury topologii ciągu głównego per LOD —
// porównywane PO pętli (poniżej), żeby dowieść „ten sam zbiór połączeń
// topologicznych" niezależnie od LOD (LOD zmienia TYLKO szczegółowość
// etykiet, spec §15.2/§7).
const mainTrunkSignatureByLod = {};

for (const lod of LODS) {
  line('');
  line(`=== LOD ${lod} ===`);
  let scene;
  try {
    scene = buildSceneV3(enm, lod);
  } catch (err) {
    anyFail = true;
    line(`  [FAIL] buildSceneV3(enm, ${lod}) rzucił wyjątek — ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }

  line(
    `  liczby: symbole=${scene.symbols.length} segmenty=${scene.segments.length} etykiety=${scene.labels.length} stacje=${scene.meta.stationCount}`,
  );

  // -- grid (spec §11.2) ----------------------------------------------------
  check('grid_probe (§11.2): 100% originów symboli i wierzchołków tras na siatce', allSceneGeometryOnGrid(scene));

  // -- overlap (spec §11.1) --------------------------------------------------
  check('noSceneSymbolOverlaps: zero nachodzeń symbol↔symbol', noSceneSymbolOverlaps(scene));

  const probe = overlapProbe(scene.labels, symbolRectsOf(scene));
  check(
    'overlapProbe (§11.1): zero kolizji etykieta↔etykieta i etykieta↔symbol',
    probe.overlapCount === 0,
    `overlapCount=${probe.overlapCount}`,
  );

  const wireHits = labelWireCollisions(scene);
  check(
    'noLabelWireCollisions (D3/k6): zero kolizji etykieta↔przewód',
    noLabelWireCollisions(scene) && wireHits.length === 0,
    `kolizje=${wireHits.length}`,
  );

  // -- §9: zakazane tokeny ---------------------------------------------------
  check('noForbiddenDirectionTokens (§9): brak WE/WY/ODG na żadnej etykiecie', noForbiddenDirectionTokens(scene));

  // -- etykiety w arkuszu (D2/k5b) -------------------------------------------
  const offSheet = scene.labels.filter((l) => l.rect.x < 0);
  check('etykiety w arkuszu: żadna etykieta nie wystaje za lewą krawędź (rect.x >= 0)', offSheet.length === 0, `${offSheet.length} poza arkuszem`);

  // -- liczba stacji stała względem fixtury ----------------------------------
  check('meta.stationCount zgodne z realną fixturą', scene.meta.stationCount === EXPECTED_STATION_COUNT, `stationCount=${scene.meta.stationCount}`);

  // -- §12.1 (F9.3): znacznik apparatusSource na KAŻDYM aparacie pola --------
  // Fixtura `sldSubstrate52s` NIE ćwiczy ścieżki danych §12.1 (bays.length=0,
  // konsekwencja f92-1) — na TEJ fixturze KAŻDY aparat pola musi nieść
  // `apparatusSource==='konwencja'` (gałąź „dane" jest przetestowana w
  // `compose/__tests__/station.test.ts` na fixturze syntetycznej).
  if (lod !== 0) {
    // `apparatusSource` jest ustawiane WYŁĄCZNIE przez `compose/station.ts`
    // (F9.3) — GPZ (`compose/gpz.ts`, poza autoryzacją F9.3) NIE niesie tego
    // pola, więc filtrujemy po jego OBECNOŚCI (nie po `elementKind`, który
    // miesza stacje SN z GPZ — patrz `buildScene.test.ts`, ten sam fix).
    const fieldApparatus = scene.symbols.filter((s) => s.meta?.apparatusSource != null);
    const withoutMarker = fieldApparatus.filter((s) => s.meta?.apparatusSource !== 'konwencja');
    check(
      '§12.1 (cell_sequence_probe/konwencja): 100% aparatów pola nosi data-apparatus-source="konwencja"',
      fieldApparatus.length > 0 && withoutMarker.length === 0,
      `aparaty=${fieldApparatus.length} bez_znacznika=${withoutMarker.length}`,
    );
  }

  // -- §14.4 (F9.3): akcent węzłów rozgałęzień --------------------------------
  check(
    'branch_accent_probe (§14.4): każdy punkt odejścia lateralu ma węzeł branchJunction większy niż junction bazowy',
    noBranchWithoutAccent(scene),
  );

  // -- §19.1 (F10.2, V12K-035) apparatus_identifier_probe --------------------
  // Symbole pola istnieją WYŁĄCZNIE na lod>=1 (L0 = stationCollapsed, zero
  // aparatów) — ta sama gałąź co §12.1 wyżej.
  if (lod !== 0) {
    const idGaps = apparatusIdentifierGaps(scene);
    check(
      'apparatus_identifier_probe (§19.1 a-d): oznaczenie pola FUNKCYJNE (nie surowe Q\\d+/T\\d+), każdy aparat uprawniony (CB/DS/rozłącznik/uziemnik/TR) niesie identyfikator Q/QE/T ze znacznikiem konwencji',
      allApparatusIdentifiersValid(scene),
      `luki=${idGaps.length}${idGaps.length ? ' np. ' + JSON.stringify(idGaps[0]) : ''}`,
    );
  }
  if (lod === 2) {
    // Test negatywny — dowód, że wyrocznia GRYZIE: etykieta oznaczenia pola
    // fabrykowana jako surowe „Q1" MUSI dać FAIL (a).
    const fabricatedFieldRole = {
      ...scene,
      labels: [
        ...scene.labels,
        { ownerRef: 'accept-sld-v3-fabricated#field-role', ownerKind: 'field-role', labelClass: 't3', text: 'Q1', slotIndex: 1, rect: { x: 0, y: 0, width: 10, height: 10 } },
      ],
    };
    check(
      'apparatus_identifier_probe (test negatywny (a) — dowód, że wyrocznia gryzie): oznaczenie pola „Q1" fabrykowane MUSI dać FAIL',
      !allApparatusIdentifiersValid(fabricatedFieldRole),
    );
    // Test negatywny — aparat uprawniony BEZ znacznika `designationSource` i
    // BEZ etykiety towarzyszącej MUSI dać FAIL (b/c).
    const anyBreaker = scene.symbols.find(
      (s) => s.symbolId === 'breaker' && s.meta?.elementKind === 'apparatus' && s.meta?.apparatusSource != null,
    );
    if (anyBreaker) {
      const sabotagedMissingMarker = {
        ...scene,
        symbols: [
          ...scene.symbols,
          { ...anyBreaker, meta: { ...anyBreaker.meta, ownerRef: 'accept-sld-v3-fabricated-bay', designationSource: undefined } },
        ],
      };
      check(
        'apparatus_identifier_probe (test negatywny (b/c) — dowód, że wyrocznia gryzie): aparat uprawniony BEZ znacznika/etykiety MUSI dać FAIL',
        !allApparatusIdentifiersValid(sabotagedMissingMarker),
      );
    }
  }

  // -- §18.4 (F10.3, D2-4) busbar_label_probe --------------------------------
  // Szyna SN istnieje WYŁĄCZNIE na lod>=1 (L0 = stationCollapsed, zero pól/
  // szyn — ta sama gałąź co apparatus_identifier_probe wyżej).
  if (lod !== 0) {
    const busGaps = busbarLabelGaps(scene);
    check(
      'busbar_label_probe (§18.4 a-b): każda szyna SN (stacji „#sn-bus", sekcji GPZ „#bus-primary") ma DOKŁADNIE JEDNĄ etykietę napięcie+sekcja o poprawnym formacie',
      allBusbarLabelsValid(scene),
      `luki=${busGaps.length}${busGaps.length ? ' np. ' + JSON.stringify(busGaps[0]) : ''}`,
    );
  }
  if (lod === 2) {
    // Dowód POZYTYWNY: fixtura referencyjna niesie realne napięcie SN (15 kV,
    // `ENM Bus.voltage_kv` przez `Substation.bus_refs`) — co najmniej JEDNA
    // etykieta stacji MUSI nieść „· 15 kV" (nie tylko degradację „Sekcja 1"),
    // inaczej gałąź „dane obecne" nigdy nie jest ćwiczona na realnych danych
    // (ten sam wzorzec dowodu co line_bay_caption_probe wyżej).
    const stationBusbarLabels = scene.labels.filter(
      (l) => l.ownerKind === 'busbar-voltage' && !l.ownerRef.startsWith('gpz/'),
    );
    const withVoltage = stationBusbarLabels.filter((l) => / · \d/.test(l.text));
    check(
      'busbar_label_probe (dowód pozytywny): co najmniej jedna etykieta szyny SN stacji niesie realne napięcie z danych',
      stationBusbarLabels.length > 0 && withVoltage.length > 0,
      `etykiety=${stationBusbarLabels.length} z_napięciem=${withVoltage.length}`,
    );
    // Dowód RZECZYWISTY „zero zgadywania" — WPROST porównanie wartości z
    // etykiety sceny z `enm.buses[].voltage_kv` fixtury (przez
    // `Substation.bus_refs`, TA SAMA ścieżka co poprawiony
    // `v2/canvas/enmToSldAdapter.ts` `buildStationMiniBlockDetails`
    // `mainBusVoltageKv`, F10.3) — scena NIE fabrykuje liczby, to REALNA
    // wartość ENM tej konkretnej stacji.
    const busByRef = new Map((enm.buses ?? []).map((b) => [b.ref_id, b]));
    let voltageMismatch = 0;
    let voltageChecked = 0;
    for (const station of (enm.substations ?? []).filter((s) => s.station_type !== 'gpz')) {
      const label = scene.labels.find((l) => l.ownerKind === 'busbar-voltage' && l.ownerRef === `${station.ref_id}#busbar-voltage`);
      if (!label) continue;
      const expectedKv = Math.max(
        0,
        ...(station.bus_refs ?? [])
          .map((ref) => busByRef.get(ref)?.voltage_kv)
          .filter((v) => typeof v === 'number' && v > 0.5),
      );
      const match = label.text.match(/· (\d+(?:\.\d+)?) kV$/);
      voltageChecked += 1;
      if (expectedKv > 0.5) {
        if (!match || Number(match[1]) !== expectedKv) voltageMismatch += 1;
      } else if (match) {
        voltageMismatch += 1;
      }
    }
    check(
      'busbar_label_probe (zero zgadywania): napięcie w etykiecie == ENM Bus.voltage_kv REALNY tej stacji (przez Substation.bus_refs), dla WSZYSTKICH stacji sprawdzonych',
      voltageChecked > 0 && voltageMismatch === 0,
      `sprawdzone=${voltageChecked} niezgodne=${voltageMismatch}`,
    );
    // Test negatywny — dowód, że wyrocznia GRYZIE: usunięcie etykiety jednej
    // szyny SN MUSI dać FAIL (a).
    const anyBusbarLabel = scene.labels.find((l) => l.ownerKind === 'busbar-voltage' && !l.ownerRef.startsWith('gpz/'));
    if (anyBusbarLabel) {
      const sabotagedMissingLabel = { ...scene, labels: scene.labels.filter((l) => l !== anyBusbarLabel) };
      check(
        'busbar_label_probe (test negatywny (a) — dowód, że wyrocznia gryzie): usunięcie etykiety szyny SN MUSI dać FAIL',
        !allBusbarLabelsValid(sabotagedMissingLabel),
      );
    }
    // Test negatywny — dowód, że wyrocznia GRYZIE: tekst z wymyślonym
    // napięciem spoza formatu MUSI dać FAIL (b).
    if (anyBusbarLabel) {
      const sabotagedFabricatedVoltage = {
        ...scene,
        labels: scene.labels.map((l) => (l === anyBusbarLabel ? { ...l, text: 'Sekcja 1 · 999 kV (zgadywane)' } : l)),
      };
      check(
        'busbar_label_probe (test negatywny (b) — dowód, że wyrocznia gryzie): tekst niezgodny z formatem „Sekcja N · V kV" MUSI dać FAIL',
        !allBusbarLabelsValid(sabotagedFabricatedVoltage),
      );
    }
  }

  // -- §18.5 (F10.3, D2-4) switch_symbol_unambiguity_probe -------------------
  // Symbole łącznika istnieją WYŁĄCZNIE na lod>=1 (ta sama gałąź co wyżej).
  if (lod !== 0) {
    const switchGaps = switchSymbolUnambiguityGaps(scene);
    check(
      'switch_symbol_unambiguity_probe (§18.5 a-c): mapowanie kind→symbol jednoznaczne (poza LOAD_SWITCH→disconnector udokumentowanym), stan łącznika toru głównego zawsze legalny (closed/open/unknown/undefined), „52" wyłącznie przy wyłączniku',
      allSwitchSymbolsUnambiguous(scene),
      `luki=${switchGaps.length}${switchGaps.length ? ' np. ' + JSON.stringify(switchGaps[0]) : ''}`,
    );
    // Dowód POZYTYWNY (b): ścieżka „dane→stan renderowany" faktycznie
    // działa na realnej fixturze — co najmniej JEDEN łącznik toru głównego
    // ma stan DETERMINOWANY (nie tylko degradację do `undefined`/„unknown").
    // `undefined` jest legalny (Invariant 9 — brak telemetrii, patrz
    // docstring `switchSymbolUnambiguityGaps`), więc sam PRZEZ SIĘ nie
    // dowodzi, że kanał kiedykolwiek faktycznie niesie dane — ta asercja to
    // domyka.
    const mainPathSwitches = scene.symbols.filter(
      (s) => s.symbolId === 'breaker' || s.symbolId === 'disconnector' || s.symbolId === 'fuseSwitch',
    );
    const withDeterminateState = mainPathSwitches.filter((s) => s.state !== undefined);
    check(
      'switch_symbol_unambiguity_probe (dowód pozytywny (b)): co najmniej jeden łącznik toru głównego ma stan DETERMINOWANY z danych (nie sam fallback „unknown")',
      mainPathSwitches.length > 0 && withDeterminateState.length > 0,
      `łączniki=${mainPathSwitches.length} zdeterminowane=${withDeterminateState.length}`,
    );
  }
  if (lod === 2) {
    // Test negatywny — dowód, że wyrocznia GRYZIE: łącznik toru głównego z
    // `state` PODMIENIONYM na string spoza {closed,open,unknown} MUSI dać
    // FAIL (b) — `undefined` jest LEGALNY (Invariant 9), więc negatyw musi
    // wstrzyknąć wartość faktycznie nielegalną, nie samo `undefined`.
    const anyMainPathSwitch = scene.symbols.find((s) => s.symbolId === 'breaker' || s.symbolId === 'disconnector' || s.symbolId === 'fuseSwitch');
    if (anyMainPathSwitch) {
      const sabotagedInvalidState = {
        ...scene,
        symbols: scene.symbols.map((s) => (s === anyMainPathSwitch ? { ...s, state: 'energized-garbage' } : s)),
      };
      check(
        'switch_symbol_unambiguity_probe (test negatywny (b) — dowód, że wyrocznia gryzie): łącznik toru głównego ze stanem spoza {closed,open,unknown} MUSI dać FAIL',
        !allSwitchSymbolsUnambiguous(sabotagedInvalidState),
      );
    }
    // Test negatywny — dowód, że wyrocznia GRYZIE: „52" wstrzyknięte do
    // protectionCodes okręgu przekaźnika MUSI dać FAIL (c).
    const anyRelay = scene.symbols.find((s) => s.symbolId === 'protectionRelay');
    const relayBase = anyRelay ?? { symbolId: 'protectionRelay', x: 0, y: 0, meta: { ownerRef: 'accept-sld-v3-fabricated-relay' } };
    const sabotagedRelayCode52 = {
      ...scene,
      symbols: [
        ...scene.symbols.filter((s) => s !== anyRelay),
        { ...relayBase, meta: { ...relayBase.meta, protectionCodes: ['50/51', '52'] } },
      ],
    };
    check(
      'switch_symbol_unambiguity_probe (test negatywny (c) — dowód, że wyrocznia gryzie): „52" w protectionCodes okręgu przekaźnika MUSI dać FAIL',
      !allSwitchSymbolsUnambiguous(sabotagedRelayCode52),
    );
    // Test negatywny — dowód, że wyrocznia GRYZIE: etykieta „52" z ownerKind
    // podmienionym (poza kontraktem protection/#device-number) MUSI dać FAIL (c).
    const anyDeviceNumberLabel = scene.labels.find((l) => l.text === '52');
    if (anyDeviceNumberLabel) {
      const sabotagedDeviceNumberOwner = {
        ...scene,
        labels: scene.labels.map((l) => (l === anyDeviceNumberLabel ? { ...l, ownerKind: 'apparatus' } : l)),
      };
      check(
        'switch_symbol_unambiguity_probe (test negatywny (c, ownerKind) — dowód, że wyrocznia gryzie): „52" spoza ownerKind:protection MUSI dać FAIL',
        !allSwitchSymbolsUnambiguous(sabotagedDeviceNumberOwner),
      );
    }
  }

  // -- §19.2 (F10.2, D2) line_bay_caption_probe -------------------------------
  // Podpisy kierunku pola (`bayDirectionCaptions`) istnieją WYŁĄCZNIE na L2
  // (spec §7).
  if (lod === 2) {
    const captionGaps = lineBayCaptionGaps(scene);
    check(
      'line_bay_caption_probe (§19.2): każdy podpis pola liniowego ma format „⟨numer linii⟩ · kier./odg. ⟨kod⟩" lub degradację „kier./odg. ⟨kod⟩"',
      allLineBayCaptionsValid(scene),
      `luki=${captionGaps.length}${captionGaps.length ? ' np. ' + JSON.stringify(captionGaps[0]) : ''}`,
    );
    // Dowód POZYTYWNY (b): fixtura referencyjna niesie `LineRunV1.name`
    // (`Magistrala 01`/`Odgałęzienie SN kablowe`) — co najmniej JEDEN
    // podpis MUSI nieść prefiks nazwy linii (nie tylko degradację), inaczej
    // ta gałąź formatu nigdy nie jest ćwiczona na realnych danych.
    const portCaptions = scene.labels.filter((l) => l.ownerKind === 'port-caption');
    const withLineName = portCaptions.filter((l) => l.text.includes(' · '));
    check(
      'line_bay_caption_probe (dowód pozytywny): co najmniej jeden podpis niesie prefiks nazwy linii („⟨nazwa⟩ · kier./odg.")',
      portCaptions.length > 0 && withLineName.length > 0,
      `podpisy=${portCaptions.length} z_nazwą=${withLineName.length}`,
    );
    // Test negatywny — dowód, że wyrocznia GRYZIE: podpis fabrykowany bez
    // „kier."/„odg." MUSI dać FAIL.
    const fabricatedCaption = {
      ...scene,
      labels: [
        ...scene.labels,
        { ownerRef: 'accept-sld-v3-fabricated#direction', ownerKind: 'port-caption', labelClass: 't3', text: 'L-01 GPZ Południe', slotIndex: 1, rect: { x: 0, y: 0, width: 10, height: 10 } },
      ],
    };
    check(
      'line_bay_caption_probe (test negatywny — dowód, że wyrocznia gryzie): podpis BEZ „kier./odg." fabrykowany MUSI dać FAIL',
      !allLineBayCaptionsValid(fabricatedCaption),
    );
  }

  // -- §12.3 (FIX-1, po recenzji Opusa): kontrakt POŁĄCZENIA kabel↔głowica --
  // Głowice BEZ trasy dotykającej ich portu istnieją WYŁĄCZNIE na fizycznych
  // końcach ciągów (1 magistrala + N laterali) — patrz docstring
  // `fieldEntryConnectionsReachCableHead` (`scene/buildScene.ts`) i
  // `buildScene.test.ts` (dowód empiryczny liczby na tej fixturze).
  const unreachedHeads = fieldEntryConnectionsReachCableHead(scene);
  // §16-v3 (2026-07-17): fizyczne końce ciągów (1 magistrala + N laterali)
  // niosą TERAZ bieg otwarty do słupka terminalnego (realne segmenty ENM
  // `…/branch_end`/`…/downstream`, dotąd niewidoczne — patrz
  // `buildScene.openTerminal.test.ts`), więc głowica końcowa jest DOTKNIĘTA
  // trasą — oczekiwane nieosiągnięte spada z `1 + laterale` do ZERA
  // (pomiar na fixturze referencyjnej: 13 ogonów, 13 głowic domkniętych).
  const expectedDeadEnds = 0;
  check(
    'field_entry_probe/kontrakt połączenia (§12.3): głowice bez trasy dotykającej portu == TYLKO fizyczne końce ciągów (1 magistrala + N laterali)',
    unreachedHeads.length === expectedDeadEnds,
    `nieosiągnięte=${unreachedHeads.length} oczekiwane=${expectedDeadEnds}`,
  );
  if (lod === 0) {
    check('field_entry_probe (LOD 0): allFieldEntryConnectionsReachCableHead zielone (GPZ zawsze połączony z magistralą)', allFieldEntryConnectionsReachCableHead(scene));
  }

  // -- §18.1/§18.2/§18.6 (F10.1, dyrektywa D2-5/D2-6/D2-1) ------------------
  const esGaps = earthSwitchLateralGaps(scene);
  check(
    'earth_switch_lateral_probe (§18.1): każdy uziemnik POZA osią toru głównego, połączony odgałęzieniem bocznym',
    allEarthSwitchesLateral(scene),
    `luki=${esGaps.length}${esGaps.length ? ' np. ' + JSON.stringify(esGaps[0]) : ''}`,
  );
  const vtGaps = vtParallelGaps(scene);
  check(
    'vt_parallel_probe (§18.2): zero VT/SA na osi toru szeregowego; każdy połączony gałęzią boczną',
    allVtParallel(scene),
    `luki=${vtGaps.length}${vtGaps.length ? ' np. ' + JSON.stringify(vtGaps[0]) : ''}`,
  );
  if (lod === 2) {
    const termGaps = pathTerminationLabelGaps(scene);
    check(
      'path_termination_labeled_probe (§18.6): każde fizyczne zakończenie toru (głowica bez trasy) ma JAWNĄ etykietę na scenie',
      allPathTerminationsLabeled(scene),
      `nieopisane=${termGaps.length} (fizyczne końce=${expectedDeadEnds})`,
    );
    // Test negatywny — wyrocznia §18.1 MUSI gryźć: scena z podmienionym
    // symbolem ES wstawionym NA oś toru (syntetyczna mutacja kopii sceny).
    const axisApparatus = scene.symbols.find(
      (sym) => sym.meta?.elementKind === 'apparatus' && sym.symbolId === 'breaker' && sym.meta?.ownerRef,
    );
    if (axisApparatus) {
      const sabotaged = {
        ...scene,
        symbols: [
          ...scene.symbols,
          { ...axisApparatus, symbolId: 'earthSwitch' },
        ],
      };
      check(
        'earth_switch_lateral_probe (test negatywny — dowód, że wyrocznia gryzie): ES wstawiony NA oś toru ⇒ FAIL',
        !allEarthSwitchesLateral(sabotaged),
        'sabotowana scena przeszła — wyrocznia martwa',
      );
    }
  }

  // -- §13.1/§14.1 (F9.4, runda korekcyjna po recenzji Opusa): wyrocznie -----
  // widoczności/ciągłości źródeł — dawniej wyrocznie-widma (nazwy w
  // komentarzach `compose/station.ts`/`compose/gpz.ts`/`compose/sourceKind.ts`
  // bez ciała), teraz realne, wpięte tu jako twarde bramki.
  const coverageGaps = sourceCoverageGaps(scene);
  check(
    'sources_visible_probe (§13.1): liczba narysowanych symboli źródeł == liczba źródeł podlegających temu LOD (external_grid zawsze, DER od L1)',
    allSourcesVisible(scene),
    `źródła_meta=${scene.meta.sources.length} luki=${coverageGaps.length}`,
  );

  const connectivityGaps = sourceConnectivityGaps(scene);
  check(
    'source_connectivity_probe (§14.1): każde widoczne źródło ma trasę segmentów do co najmniej jednej szyny',
    allSourcesConnected(scene),
    `luki=${connectivityGaps.length}`,
  );

  // -- §21 (F13.1, D3-1/D3-2): GPZ jako dominanta WN/SN ----------------------
  const hvGaps = gpzHvColumnGaps(scene, enm);
  check(
    'gpz_hv_column_probe (§21.1): ENM niesie TR WN/SN ⇒ scena rysuje kolumnę WN (przyłącze→szyna WN→TR→sekcje SN); 0 GPZ z danymi WN bez kolumny',
    allGpzHvColumnsComplete(scene, enm) && hvGaps.length === 0,
    `luki=${hvGaps.length}`,
  );
  const domGaps = gpzDominanceGaps(scene);
  check(
    'gpz_dominance_probe (§21.2): strefa GPZ ≥ największa stacja; szyna GPZ grubsza (busGpz>bus); tabliczka danych przy źródle',
    gpzIsDominant(scene) && domGaps.length === 0,
    `luki=${domGaps.length}${domGaps.length ? ' np. ' + JSON.stringify(domGaps[0]) : ''}`,
  );

  // -- §12.5 (recenzja NO-GO 2026-07-17 pkt 5): szablony technologiczne pól --
  const templateGaps = bayTemplateGaps(scene, enm);
  check(
    'bay_template_probe (§12.5): pola KONWENCJI stacji SN/nN używają szablonów RMU (zero CB/CT z konwencji w polu liniowym; rozłącznik obecny; ES w polu TR)',
    allBayTemplatesValid(scene, enm) && templateGaps.length === 0,
    `luki=${templateGaps.length}${templateGaps.length ? ' np. ' + JSON.stringify(templateGaps[0]) : ''}`,
  );
  if (lod === 2) {
    // Test negatywny — dowód, że wyrocznia gryzie: breaker WSTRZYKNIĘTY w
    // pole RMU konwencji MUSI dać gap (sabotaż na kopii sceny).
    const rmuSwitch = scene.symbols.find(
      (sym) => sym.symbolId === 'loadBreakSwitch' && sym.meta?.apparatusSource === 'konwencja',
    );
    const sabotaged = rmuSwitch
      ? { ...scene, symbols: [...scene.symbols, { ...rmuSwitch, symbolId: 'breaker' }] }
      : null;
    check(
      'bay_template_probe (test negatywny — dowód, że wyrocznia gryzie): CB wstrzyknięty w pole RMU konwencji MUSI dać FAIL',
      sabotaged != null && bayTemplateGaps(sabotaged, enm).some((g) => g.reason === 'rmu-line-breaker-leak'),
      sabotaged ? '' : 'brak pola RMU konwencji na fixturze — sabotaż niewykonalny',
    );
  }

  // -- §22.1 (F13.2, D3-3/D3-5): fizyka obrazu — skrzyżowania i kropki -------
  const crossings = interiorCrossings(scene.segments);
  const snCrossings = crossings.filter((c) => !c.involvesBus);
  const busCrossGaps = crossingBusGaps(scene.segments);
  check(
    'crossing_probe (§22.1, węzeł T, V12K-137): TWARDE ZERO przecięć toru mocy — 0 sn×sn (Rodziny A/B rozcięte węzłem T, styk końcem + kropka) ORAZ 0 z SZYNĄ (mostek na szynie zakazany). Mostek półłukowy dopuszczalny WYŁĄCZNIE dla dowiedzionych nieredukowalnych (na fixturze referencyjnej: brak)',
    snCrossings.length === 0 && busCrossGaps.length === 0,
    `przecięcia_sn×sn=${snCrossings.length} przecięcia_z_szyną=${busCrossGaps.length}`,
  );
  const dotGaps = junctionDotGaps(scene, SYMBOL_DEFS);
  check(
    'junction_dot_probe (§22.1, V12K-039): kropka węzłowa ⇔ realny węzeł rozgałęzienia tras (obustronnie); 0 luk',
    dotGaps.length === 0,
    `luki=${dotGaps.length}${dotGaps.length ? ' np. ' + JSON.stringify(dotGaps[0]) : ''}`,
  );

  // -- §22.3 (F13.3, D3-4/D3-15): pas ochronny szyny + wejście przez głowicę -
  const bandGaps = busBandClearanceGaps(scene.segments);
  check(
    'bus_band_clearance_probe (§22.3): 0 obcych pionów w pasie ±2×GRID osi jakiejkolwiek szyny (przed F13.3: 12 na L1/L2 — pomiar P-5); do pasa wchodzą wyłącznie zejścia pól tej szyny',
    bandGaps.length === 0,
    `luki=${bandGaps.length}${bandGaps.length ? ' np. ' + JSON.stringify(bandGaps[0]) : ''}`,
  );
  const collinearGaps = entryCollinearityGaps(scene.segments);
  check(
    'entry_collinearity_probe (D3-15, audyt §6a): 0 pokryć pionu trasy zewnętrznej z pionem wewnętrznym pola (kabel wchodzi w głowicę OD DOŁU, nie jedną kreską przez pas szyny)',
    collinearGaps.length === 0,
    `luki=${collinearGaps.length}${collinearGaps.length ? ' np. ' + JSON.stringify(collinearGaps[0]) : ''}`,
  );

  // -- §22.4 (F13.4, D3-6): hierarchia grubości tras -------------------------
  const thicknessGaps = trunkThicknessGaps(scene);
  check(
    'trunk_thickness_probe (§22.4): trasa ciągu głównego klasą snTrunk (grubsza), odgałęzienia klasą sn; relacja stałych snTrunk>sn',
    thicknessGaps.length === 0 && SEGMENT_STROKE_WIDTH.snTrunk > SEGMENT_STROKE_WIDTH.sn,
    `luki=${thicknessGaps.length}${thicknessGaps.length ? ' np. ' + thicknessGaps[0] : ''} snTrunk=${SEGMENT_STROKE_WIDTH.snTrunk} sn=${SEGMENT_STROKE_WIDTH.sn}`,
  );

  // -- §13.3 (F11.3): source_state_probe — stan źródła jako nakładka --------
  // Fixtura referencyjna NIE niesie `operating_mode` dla żadnego DER
  // (uczciwy brak ⇒ zero nakładek) — bramka (a) dowodzi „0 stanów
  // wywiedzionych bez udokumentowanej reguły" na scenie bazowej; (b) dowodzi
  // POZYTYWNIE przepływ adapter→scena na wariancie fixtury z wpisanym
  // `Generator.meta['operating_mode']` (realny kanał operacji domenowej
  // `set_source_operating_mode`): stan LĄDUJE na symbolu DER i wyrocznia
  // pozostaje zielona (determinizm + geometria nietknięta pilnowane w
  // `sourceState.test.ts`, dowód inwariancji bboxu).
  const stateGaps = sourceStateGaps(scene);
  check(
    'source_state_probe (§13.3a): 0 stanów źródeł bez udokumentowanej reguły (scena bazowa bez operating_mode ⇒ zero nakładek)',
    allSourceStatesLegal(scene) &&
      scene.symbols.every((s) => s.meta?.operationalState === undefined),
    `luki=${stateGaps.length}`,
  );
  if (lod >= 1) {
    const withMode = JSON.parse(JSON.stringify(enm));
    const targetGen = withMode.generators?.[0];
    if (targetGen) {
      targetGen.meta = { ...targetGen.meta, operating_mode: 'odstawione' };
      const overlaidScene = buildSceneV3(withMode, lod);
      const derSymbol = overlaidScene.symbols.find(
        (s) => s.meta?.elementKind === 'der' && s.meta?.ownerRef === targetGen.ref_id,
      );
      const overlaidGaps = sourceStateGaps(overlaidScene);
      check(
        'source_state_probe (§13.3b): operating_mode=odstawione ⇒ symbol DER niesie operationalState=disconnected, wyrocznia zielona',
        derSymbol?.meta?.operationalState === 'disconnected' && overlaidGaps.length === 0,
        `stan=${String(derSymbol?.meta?.operationalState)} luki=${overlaidGaps.length}`,
      );
    }
  }

  // -- §14.2 (F9.5): flow_overlay_probe — nakładka przepływu mocy -----------
  // UWAGA (WHITE BOX, nie fabrykacja): ten skrypt nie uruchamia solvera —
  // fixtura `sldSubstrate52s` niesie WYŁĄCZNIE topologię ENM, zero wyniku
  // power-flow. Sonda (a) dowodzi kontraktu „wyłączone bez wyniku" na
  // REALNEJ scenie; (b)/(c)/negatyw dowodzą właściwości budowniczego
  // (`buildFlowOverlayFromScene`, `overlay.ts`) na SYNTETYCZNYM payloadzie
  // o kształcie identycznym z prawdziwym `RawOverlayPayload` (backend
  // `result_contract_v1.py`; `analysis_type: 'LOAD_FLOW'` = dokładna wartość
  // z `canonical_analysis.py` `_execution_analysis_type_for_run` — allowlista
  // F-3), kluczowanym PRAWDZIWYM `segmentRef` odczytanym z tej sceny — nie
  // wymyślonym stringiem. Realny kanał produkcyjny (`useRawResultOverlay
  // Store`, zasilany przez `App.tsx`) i UDOKUMENTOWANA luka backendu, przez
  // którą jest on dziś pusty dla gałęzi na KAŻDYM realnym przebiegu
  // LOAD_FLOW, opisane w `canvas/overlay.ts` nagłówek F9.5. Bramka F-1
  // (recenzja Opusa): kierunek emitowany WYŁĄCZNIE dla przęseł
  // jednokawałkowych (`singleHopSegmentRefs`) — na tej fixturze 45/53.
  const singleHop = singleHopSegmentRefs(enm);
  const emptyFlow = buildFlowOverlayFromScene(scene, null, singleHop);
  check('flow_overlay_probe (§14.2, a): overlay wyłączony bez wyniku (payload=null ⇒ pusta nakładka, zero atrap)', isFlowOverlayEmpty(emptyFlow));

  const flowCandidateRef = scene.segments.find(
    (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#') && singleHop.has(s.meta.ownerRef),
  )?.meta?.ownerRef;
  if (check('flow_overlay_probe: scena LOD ' + lod + ' zawiera odcinek z realnym segmentRef jednokawałkowym (kandydat do sondy b/c/negatyw)', flowCandidateRef != null)) {
    const syntheticMetricsOf = (ref) => ({
      ref_id: ref,
      kind: 'branch',
      badges: [],
      severity: 'INFO',
      metrics: {
        P_MW: { code: 'P_MW', value: 1.23, unit: 'MW' },
        Q_Mvar: { code: 'Q_Mvar', value: -0.45, unit: 'Mvar' },
        I_A: { code: 'I_A', value: 67, unit: 'A' },
      },
    });
    const syntheticPayload = {
      run_id: 'accept-sld-v3-synthetic',
      analysis_type: 'LOAD_FLOW',
      elements: { [flowCandidateRef]: syntheticMetricsOf(flowCandidateRef) },
    };
    const flow = buildFlowOverlayFromScene(scene, syntheticPayload, singleHop);
    check(
      'flow_overlay_probe (§14.2, b): każda wartość nakładki wywiedziona z wyniku (brak wartości wpisanych w UI)',
      !isFlowOverlayEmpty(flow) && flowOverlayValuesTraceToPayload(flow, syntheticPayload),
    );
    const flowAgain = buildFlowOverlayFromScene(scene, syntheticPayload, singleHop);
    check(
      'flow_overlay_probe (§14.2, c): determinizm nakładki (dwukrotne wywołanie tego samego wejścia ⇒ identyczny JSON)',
      JSON.stringify(flow) === JSON.stringify(flowAgain),
    );
    const fabricated = {
      [flowCandidateRef]: { ownerRef: flowCandidateRef, forward: true, p: { value: 999, unit: 'MW' } },
    };
    check(
      'flow_overlay_probe (test negatywny — dowód, że wyrocznia gryzie): wartość niezgodna z payload MUSI dać FAIL',
      flowOverlayValuesTraceToPayload(fabricated, syntheticPayload) === false,
    );

    // -- F-1 (recenzja Opusa): bramka kierunku gryzie ------------------------
    const multiHopRef = scene.segments.find(
      (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#') && !singleHop.has(s.meta.ownerRef),
    )?.meta?.ownerRef;
    if (lod === 2) {
      check(
        'flow_overlay_probe (F-1): fixtura zawiera przęsła wielokawałkowe — bramka jednokawałkowa ma realny skutek',
        multiHopRef != null,
      );
    }
    if (multiHopRef != null) {
      const multiHopPayload = {
        run_id: 'accept-sld-v3-synthetic',
        analysis_type: 'LOAD_FLOW',
        elements: { [multiHopRef]: syntheticMetricsOf(multiHopRef) },
      };
      check(
        'flow_overlay_probe (F-1, negatyw): przęsło wielokawałkowe z P_MW w wyniku ⇒ ZERO wpisu kierunku (uczciwe „nie wiem", nie błędna strzałka)',
        isFlowOverlayEmpty(buildFlowOverlayFromScene(scene, multiHopPayload, singleHop)),
      );
    }

    // -- V-1/V-2 (recenzja wizualna): rozmieszczenie etykiet przepływu -------
    // Payload na WSZYSTKICH odcinkach jednokawałkowych naraz (jak harness
    // renderowy nadzorcy) — każda etykieta musi znaleźć pozycję rozłączną
    // z etykietami sceny (w tym tytułami stacji — V-1), symbolami (ikony
    // DER — V-2) i innymi etykietami przepływu. L0 bez etykiet (spec §15.2).
    //
    // r3 (F9.7, residuum LOW z werdyktu weryfikacji F9.5 — REBUILD_PLAN_V3
    // F9.5 „Rezydualne LOW…: (r3) sonda acceptance V-1/V-2 czyta flagę
    // `labelPlaced` — niezależne liczenie kolizji jest w vitest, pokryte, ale
    // sonda mogłaby liczyć sama"): PONIŻEJ sonda liczy kolizje NIEZALEŻNIE,
    // TA SAMA logika co `canvas/__tests__/sldCanvasV3.test.tsx` „czytelność
    // (LOD…)" (bbox-y wprost, nie flaga `labelPlaced`) — przeniesiona/
    // zduplikowana tu celowo (dwa niezależne konsumenty tego samego
    // kontraktu `FlowPlacement`, nie jeden punkt prawdy o poprawności).
    if (lod !== 0) {
      const fullElements = {};
      for (const s of scene.segments) {
        const ref = s.meta?.ownerRef;
        if (ref && s.meta?.elementKind === 'segment' && singleHop.has(ref)) fullElements[ref] = syntheticMetricsOf(ref);
      }
      const fullPayload = { run_id: 'accept-sld-v3-synthetic', analysis_type: 'LOAD_FLOW', elements: fullElements };
      const fullFlow = buildFlowOverlayFromScene(scene, fullPayload, singleHop);
      const placements = computeFlowOverlayPlacements(scene, fullFlow, lod === 1 ? 'p-only' : 'full');

      // Flaga wewnętrzna algorytmu (informacyjna — NIE jedyna podstawa PASS).
      const unplaced = placements.filter((p) => p.label && !p.labelPlaced);

      // r3: liczenie NIEZALEŻNE od `labelPlaced` — bboxy wprost (etykiety
      // sceny + symbole + inne etykiety przepływu), ta sama definicja
      // nachodzenia co `sldCanvasV3.test.tsx`.
      const sceneObstacles = [
        ...scene.labels.map((l) => l.rect),
        ...scene.symbols.map((s) => {
          const def = SYMBOL_DEFS[s.symbolId];
          return { x: s.x, y: s.y, width: def.width, height: def.height };
        }),
      ];
      const flowLabelRects = placements.filter((p) => p.label).map((p) => p.labelRect);
      const overlapsRect = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      let independentCollisions = 0;
      for (const rect of flowLabelRects) {
        independentCollisions += sceneObstacles.filter((o) => overlapsRect(rect, o)).length;
      }
      for (let i = 0; i < flowLabelRects.length; i++) {
        for (let j = i + 1; j < flowLabelRects.length; j++) {
          if (overlapsRect(flowLabelRects[i], flowLabelRects[j])) independentCollisions++;
        }
      }

      check(
        `flow_overlay_probe (V-1/V-2, r3 — liczenie NIEZALEŻNE od labelPlaced): wszystkie etykiety przepływu (${placements.length}) bez nachodzeń geometrycznych`,
        placements.length > 0 && independentCollisions === 0,
        `wpisy=${Object.keys(fullFlow).length} nachodzenia_niezależne=${independentCollisions} nieulokowane_flaga=${unplaced.length}`,
      );
    }
  }

  // -- determinizm (dwa wywołania → identyczny JSON) -------------------------
  const sceneAgain = buildSceneV3(enm, lod);
  check('determinizm: buildSceneV3(enm, lod) wywołane dwukrotnie daje identyczny JSON.stringify', JSON.stringify(scene) === JSON.stringify(sceneAgain));

  // -- §11.3 port_probe (F9.7, pierwsze wpięcie do accept:sld-v3) -----------
  const endpointGaps = sceneSegmentEndpointGaps(scene);
  check(
    'port_probe (§11.3): 100% końców odcinków sceny to port symbolu, dotyk innego odcinka, lub (L0) środek stationCollapsed',
    allSceneSegmentEndpointsAnchored(scene) && endpointGaps.length === 0,
    `luki=${endpointGaps.length}`,
  );

  // -- §16-v3 open_terminal_probe (2026-07-17) -------------------------------
  // Biegi OTWARTE (segmenty ENM bez następnika — na tej fixturze 13 ogonów
  // za ostatnimi stacjami ciągów): każdy kończy się DOTYKIEM słupka
  // terminalnego, żaden słupek nie jest sierotą. Dowód pozytywny + negatywy
  // w `buildScene.openTerminal.test.ts` (3 fixtury z realnego backendu).
  const otGaps = openTerminalGaps(scene);
  const otTicks = scene.segments.filter((s) => s.meta?.kind === 'openTerminal').length;
  const otRuns = scene.segments.filter((s) => s.meta?.openTerminal === true).length;
  check(
    'open_terminal_probe (§16-v3): każdy bieg otwarty zakończony słupkiem terminalnym; zero słupków-sierot',
    allOpenTerminalsMarked(scene) && otGaps.length === 0 && otTicks === otRuns,
    `biegi_otwarte=${otRuns} słupki=${otTicks} luki=${otGaps.length}`,
  );
  {
    // Test negatywny — wyrocznia MUSI gryźć: scena z usuniętymi słupkami.
    const sabotaged = { ...scene, segments: scene.segments.filter((s) => s.meta?.kind !== 'openTerminal') };
    check(
      'open_terminal_probe (test negatywny — dowód, że wyrocznia gryzie): usunięcie słupków terminalnych MUSI dać FAIL',
      otRuns === 0 || openTerminalGaps(sabotaged).length > 0,
    );
  }

  // -- §11.4 wire_probe rozszerzony o symbole (F9.7 wpięcie, F9.10 naprawa) -
  // F9.10 (REBUILD_PLAN_V3 F9.10): naprawa geometryczna U ŹRÓDŁA
  // (`DESCENT_STRIP_HEIGHT`, `layout/bands.ts`) sprowadziła kolizje do zera —
  // TWARDE ZERO, bez baseline (DoD F9.10), tak jak `noSceneSymbolOverlaps`.
  const wireSymbolHits = symbolWireCollisions(scene);
  check(
    'symbol_wire_probe (§11.4, F9.10): zero kolizji symbol↔przewód (twarde zero, baseline usunięty)',
    noSymbolWireCollisions(scene) && wireSymbolHits.length === 0,
    `kolizje=${wireSymbolHits.length}`,
  );

  // -- §15.1 vertical_length_probe (F9.7, pierwsze wpięcie) ------------------
  const verticalLength = totalVerticalSegmentLength(scene);
  const verticalBaseline = VERTICAL_LENGTH_BASELINE[lod];
  check(
    `vertical_length_probe (§15.1): suma długości pionów nie-rosnąca względem baseline=${verticalBaseline}`,
    verticalLength <= verticalBaseline,
    `wartość=${verticalLength} baseline=${verticalBaseline}`,
  );

  // -- S6 (V12K-137) funkcja kosztu layoutu: poziomy + załamania (pkt 3) ------
  const horizontalLength = totalHorizontalSegmentLength(scene);
  const horizontalBaseline = HORIZONTAL_LENGTH_BASELINE[lod];
  check(
    `layout_cost_probe (S6 pkt 3, poziomy): łączna długość poziomów nie-rosnąca względem baseline=${horizontalBaseline}`,
    horizontalLength <= horizontalBaseline,
    `wartość=${horizontalLength} baseline=${horizontalBaseline}`,
  );
  const bends = orthogonalBendCount(scene);
  const bendBaseline = BEND_COUNT_BASELINE[lod];
  check(
    `layout_cost_probe (S6 pkt 3, załamania): liczba rogów tras nie-rosnąca względem baseline=${bendBaseline}`,
    bends <= bendBaseline,
    `wartość=${bends} baseline=${bendBaseline}`,
  );
  // -- S6 (V12K-137) wykorzystanie arkusza: podłoga (pkt 10) ------------------
  const fill = sheetFillRatio(scene);
  const fillFloor = SHEET_FILL_FLOOR[lod];
  check(
    `sheet_fill_probe (S6 pkt 10): wykorzystanie arkusza nie-spadające poniżej podłogi=${fillFloor}`,
    fill >= fillFloor,
    `wartość=${fill.toFixed(6)} podłoga=${fillFloor} koszt(piony+poziomy)=${verticalLength + horizontalLength}`,
  );

  // -- §17.5 protection_marking_probe (F9.9) ---------------------------------
  // Fixtura referencyjna niesie 0 Bay[]/protection_assignments/measurements
  // (patrz `scene/__tests__/buildScene.test.ts` F9.9) — na TEJ fixturze ta
  // sonda dowodzi „zero okręgów bez danych" WPROST (0 okręgów w ogóle, dowód
  // vacuously true, nie fałszywy pozytyw); dowód pozytywny (okrąg z danych,
  // negatyw obowiązkowy) żyje w testach vitest syntetycznych
  // (`compose/__tests__/station.test.ts`, `scene/__tests__/buildScene.test.ts`).
  const relayCount = scene.symbols.filter((s) => s.symbolId === 'protectionRelay').length;
  const meterCount = scene.symbols.filter((s) => s.symbolId === 'meter').length;
  const tripLineCount = scene.segments.filter((s) => s.meta?.kind === 'protectionTrip').length;
  const markingGaps = protectionMarkingGaps(scene);
  check(
    'protection_marking_probe (§17.5 a-c): okręgi przekaźnika mają kody+ownerRef (≤2), tory wyzwalania kończą się na REJESTROWANYCH portach wyłącznika+przekaźnika TEGO SAMEGO pola',
    allProtectionMarkingsValid(scene),
    `okręgi=${relayCount} mierniki=${meterCount} tory=${tripLineCount} luki=${markingGaps.length}`,
  );
  check(
    'protection_marking_probe (§17.5e): L0 bez warstwy adnotacji zabezpieczeń',
    noProtectionAnnotationAtLod0(scene),
  );
  // B-1 (§17.4 L1): sam okrąg bez kodów/toru/„52"/„M" — na tej fixturze
  // pusto-prawdziwe (0 danych §17.2); dowód POZYTYWNY + negatywy na scenach
  // syntetycznych w `buildScene.test.ts` (wymóg recenzji F9.9).
  check(
    'protection_marking_probe (§17.4 L1, B-1): warstwa adnotacji na L1 = sam okrąg (bez kodów/toru/„52"/„M")',
    protectionAnnotationAtLod1IsCircleOnly(scene),
  );

  // -- §18.3 ct_annotation_probe (F10.4) -------------------------------------
  // Fixtura referencyjna niesie 0 `measurements` (patrz raport F10.4,
  // `resolveBayCtRatingAnnotations` w `enmToSldAdapter.ts`) — na TEJ fixturze
  // ta sonda dowodzi „zero przekładni z domysłu" (b, §18.3) WPROST (0 etykiet
  // `#ct-rating-` w ogóle, dowód vacuously true); dowód POZYTYWNY (a, etykieta
  // z realnych danych) żyje w testach vitest syntetycznych
  // (`compose/__tests__/protectionMarking.test.ts`/`station.test.ts`,
  // `scene/__tests__/buildScene.test.ts`). (c) układ 3×CT/Ferranti-I0 poza
  // zakresem (NOWE pole DOMAIN D3, F10.6) — patrz docstring `ctAnnotationGaps`.
  const ctRatingLabelCount = scene.labels.filter(
    (l) => l.ownerKind === 'protection' && l.ownerRef?.includes('#ct-rating-'),
  ).length;
  const ctGaps = ctAnnotationGaps(scene);
  check(
    'ct_annotation_probe (§18.3 a): każda etykieta przekładni CT zakotwiczona na REALNYM symbolu currentTransformer tego samego pola',
    allCtAnnotationsValid(scene),
    `etykiety=${ctRatingLabelCount} luki=${ctGaps.length}`,
  );
  check(
    'ct_annotation_probe (§18.3 b, negatyw obowiązkowy): fixtura referencyjna (0 measurements) ⇒ zero etykiet przekładni CT „z domysłu"',
    ctRatingLabelCount === 0,
    `etykiety=${ctRatingLabelCount}`,
  );

  // -- §20.1 secondary_link_duality_probe (F10.5) ----------------------------
  // Fixtura referencyjna niesie 0 `protection_assignments`/`measurements`
  // (patrz F9.9/F10.4) — na TEJ fixturze ta sonda dowodzi „zero linii
  // wtórnych fabrykowanych" WPROST (0 linii `measurementLink`/`protectionTrip`
  // w ogóle, dowód vacuously true — TA SAMA sytuacja co `ct_annotation_probe`
  // wyżej). Dowód POZYTYWNY (dwie linie RÓŻNE, endpoint-y REJESTROWANE,
  // negatyw „linia prosto do wyłącznika") żyje w testach vitest syntetycznych
  // (`compose/__tests__/station.test.ts`, `scene/__tests__/buildScene.test.ts`).
  const measurementLinkCount = scene.segments.filter((s) => s.meta?.kind === 'measurementLink').length;
  const secondaryGaps = secondaryLinkDualityGaps(scene);
  check(
    'secondary_link_duality_probe (§20.1 a-e): linie pomiarowe CT→przekaźnik zakotwiczone na REALNYCH aparatach TEGO SAMEGO pola, nigdy bezpośrednio na wyłączniku',
    allSecondaryLinksValid(scene),
    `linie_pomiarowe=${measurementLinkCount} tory_wyzwalania=${tripLineCount} luki=${secondaryGaps.length}`,
  );

  // -- §20.3 annotation_no_overlap_primary_probe (F10.5) ---------------------
  // ALIAS udokumentowany `symbolWireCollisions` (patrz docstring
  // `annotationOverlapsPrimaryPath`) — na TEJ fixturze `symbol_wire_probe`
  // (sekcja wyżej w tym skrypcie) jest już TWARDYM ZEREM na wszystkich LOD,
  // więc ta sonda jest tu vacuously true; dowód, że FILTR sam działa (nie
  // tylko „zero bo zero") żyje w testach syntetycznych.
  const overlapHits = annotationOverlapsPrimaryPath(scene);
  check(
    'annotation_no_overlap_primary_probe (§20.3 a-b, alias `symbolWireCollisions`): zero kolizji warstwa-adnotacji↔tor-pierwotny',
    noAnnotationOverlapsPrimaryPath(scene),
    `kolizje=${overlapHits.length}`,
  );

  // -- §20.4 meter_symbol_disambiguation (F10.5) -----------------------------
  const meterGaps = meterDisambiguationGaps(scene);
  check(
    'meter_symbol_disambiguation (§20.4 a): każdy okrąg „M" ma właściciela (pole) — miernik zawsze pochodzi z realnego Measurement.purpose="metering"',
    allMeterSymbolsDisambiguated(scene),
    `mierniki=${meterCount} luki=${meterGaps.length}`,
  );

  // -- §16/§15.2 ciągłość elektryczna + lod_path_probe -----------------------
  // F9.7: rozszerzone z „WYŁĄCZNIE LOD 2" na WSZYSTKIE LOD (patrz docstring
  // `checkContinuity` — dowód empiryczny, spec §15.2 wymaga tego na L0/L1/L2).
  mainTrunkSignatureByLod[lod] = checkContinuity(scene);
}

// -- protection_marking_probe (negatyw obowiązkowy, §17.5a) ----------------
// Dowód, że wyrocznia GRYZIE (nie zawsze zielona) — okrąg fabrykowany bez
// kodów na scenie realnej MUSI failować `allProtectionMarkingsValid`.
{
  const scene = buildSceneV3(enm, 2);
  const fabricated = {
    ...scene,
    symbols: [
      ...scene.symbols,
      {
        symbolId: 'protectionRelay',
        x: 0,
        y: 0,
        meta: { ownerRef: 'accept-sld-v3-fabricated', elementKind: 'protectionAnnotation', protectionCodes: [] },
      },
    ],
  };
  check(
    'protection_marking_probe (test negatywny — dowód, że wyrocznia gryzie): okrąg BEZ kodów fabrykowany na scenie MUSI dać FAIL',
    allProtectionMarkingsValid(fabricated) === false,
  );
}

// -- ct_annotation_probe (negatyw obowiązkowy, §18.3b) ----------------------
// Dowód, że wyrocznia GRYZIE: etykieta „#ct-rating-" fabrykowana BEZ
// odpowiadającego symbolu `currentTransformer` na scenie MUSI failować
// `allCtAnnotationsValid` (wzorzec `protection_marking_probe` wyżej).
{
  const scene = buildSceneV3(enm, 2);
  const fabricated = {
    ...scene,
    labels: [
      ...scene.labels,
      {
        ownerRef: 'accept-sld-v3-fabricated#ct-rating-ghost',
        ownerKind: 'protection',
        labelClass: 't4',
        text: 'CT9 · 300/5',
        slotIndex: 1,
        rect: { x: 0, y: 0, width: 10, height: 10 },
      },
    ],
  };
  check(
    'ct_annotation_probe (test negatywny — dowód, że wyrocznia gryzie): etykieta przekładni CT fabrykowana BEZ symbolu currentTransformer MUSI dać FAIL',
    allCtAnnotationsValid(fabricated) === false,
  );
}

// -- secondary_link_duality_probe (negatyw obowiązkowy, §20.1b) ------------
// Dowód, że wyrocznia GRYZIE: linia pomiarowa fabrykowana WPROST na port
// realnego `breaker` (symuluje „jedną anonimową linię do wyłącznika",
// dokładnie to, czego §20.1 zakazuje) MUSI failować `allSecondaryLinksValid`
// (wzorzec `protection_marking_probe` wyżej).
{
  const scene = buildSceneV3(enm, 2);
  const breaker = scene.symbols.find((s) => s.symbolId === 'breaker');
  if (breaker) {
    const port = { x: breaker.x + SYMBOL_DEFS.breaker.width / 2, y: breaker.y };
    const fabricated = {
      ...scene,
      segments: [
        ...scene.segments,
        {
          points: [port, { x: port.x, y: port.y - 10 }],
          meta: {
            kind: 'measurementLink',
            ownerRef: 'accept-sld-v3-fabricated#measurement-link',
            elementKind: 'protectionAnnotation',
          },
        },
      ],
    };
    check(
      'secondary_link_duality_probe (test negatywny — dowód, że wyrocznia gryzie): linia pomiarowa fabrykowana WPROST na port wyłącznika MUSI dać FAIL',
      allSecondaryLinksValid(fabricated) === false,
    );
  } else {
    // Fixtura referencyjna (sieć MV 53-stacyjna) niesie dziesiątki `breaker` —
    // gałąź defensywna, nie oczekiwana w praktyce (dowód POZYTYWNY negatywu
    // żyje wtedy WYŁĄCZNIE w testach vitest syntetycznych).
    line('  [SKIP] secondary_link_duality_probe (test negatywny): fixtura L2 bez symbolu breaker');
  }
}

// -- §15.2 lod_path_probe: „pokrywa TE SAME połączenia topologiczne" -------
// Porównanie sygnatur (kolejność mainTrunkStationIds) MIĘDZY LOD — dowód, że
// LOD zmienia WYŁĄCZNIE szczegółowość rysunku/etykiet, NIGDY topologię ścieżki.
line('');
line('=== lod_path_probe (§15.2, porównanie topologii MIĘDZY LOD) ===');
const signatures = LODS.map((lod) => mainTrunkSignatureByLod[lod]);
check(
  'lod_path_probe (§15.2): sygnatura topologii ciągu głównego (kolejność stacji) identyczna na L0/L1/L2',
  signatures.every((s) => s != null) && signatures.every((s) => s === signatures[0]),
  `L0=${signatures[0]} L1=${signatures[1]} L2=${signatures[2]}`,
);

line('');
line(anyFail ? '=== WYNIK: FAIL — patrz [FAIL] powyżej ===' : '=== WYNIK: ALL PASS ===');

console.log(out.join('\n'));

process.exitCode = anyFail ? 1 : 0;
