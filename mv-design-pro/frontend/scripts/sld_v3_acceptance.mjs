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
  busbarLabelPathClearanceGaps,
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
  sheetAspectRatio,
  sheetRowStationIds,
  sheetRowBandsOf,
  sheetContinuationGaps,
  allSheetContinuationsMarked,
  trunkThicknessGaps,
  allTopBandFieldsClearance,
  topBandClearanceViolations,
  allVerticalsAttributed,
  verticalAuditGaps,
  verticalCauseBreakdown,
  allLod0ElementsReadable,
  lod0ReadabilityGaps,
  localDensityMetrics,
  LOCAL_DENSITY_WINDOW_CELLS,
  minParallelCableClearance,
  sceneObstacleRects,
} from '../src/ui/sld/v3/scene/buildScene.ts';
import {
  planSceneLabels,
  plannedLabelCollisions,
  plannedLabelObstacleCollisions,
  plannedLabelsBelowScreenFloor,
} from '../src/ui/sld/v3/canvas/labelLegibility.ts';
import { MIN_TEXT_SCREEN_PX, screenFixedFontSize } from '../src/ui/sld/v3/core/text.ts';
import { MIN_SCALE, MAX_SCALE } from '../src/ui/sld/v3/canvas/camera.ts';
import {
  SHEET_MAX_ASPECT,
  SHEET_TARGET_ASPECT,
  SHEET_WIDTH_QUANTUM,
} from '../src/ui/sld/v3/layout/sheetRows.ts';
import {
  BUSBAR_LABEL_PATH_CLEARANCE,
  MIN_PARALLEL_CABLE_CLEARANCE,
  TOP_LEVEL_FIELD_CLEARANCE,
} from '../src/ui/sld/v3/layout/clearances.ts';
import { allBayTemplatesValid, bayTemplateGaps } from '../src/ui/sld/v3/scene/buildScene.ts';
import { overlapProbe } from '../src/ui/sld/v3/layout/labels.ts';
import {
  SEGMENT_STROKE_WIDTH,
  segmentStrokeWidthForScale,
  MIN_TRUNK_STROKE_SCREEN_PX,
} from '../src/ui/sld/v3/compose/preview.tsx';
import { fieldSilhouettesAreInjective } from '../src/ui/sld/v3/compose/station.ts';
import { sourceKindSymbolsAreInjective } from '../src/ui/sld/v3/compose/sourceKind.ts';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs.ts';
import {
  miniRmuPathContinuityGaps,
  miniRmuMarkerSpacingGaps,
  transformerInteriorHeightRatio,
} from '../src/ui/sld/v3/symbols/miniRmuGrammar.ts';
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
  orientedSegmentRefs,
} from '../src/ui/sld/v3/canvas/overlay.ts';
import { computeFlowOverlayPlacements, layoutResultLabels, SldCanvasV3 } from '../src/ui/sld/v3/canvas/SldCanvasV3.tsx';
import { buildResultLabelsFromScene, resultRefForSegment } from '../src/ui/sld/v3/canvas/resultLabels.ts';
import { buildResultRefBridge } from '../src/ui/sld/v3/canvas/resultRefBridge.ts';
// Karta S9-4 (trafienie i tożsamość zaznaczenia): sonda siatkowa odczytuje
// uchwyty z FAKTYCZNIE wyrenderowanego drzewa kanwy, a oczekiwanie liczy ze
// sceny — patrz nagłówek `canvas/hitAreas.ts` (dwa niezależne źródła).
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import {
  MIN_HIT_SCREEN_PX,
  buildCanvasHitAreas,
  hitAreasFromDom,
  hitLayerOrderingInDom,
  pointerBlockersInDom,
  sondaSiatkowaTrafien,
} from '../src/ui/sld/v3/canvas/hitAreas.ts';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * R2 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.19) — BUDŻETY sondy metryk warstwy
 * wynikowej. Kolizje KOŃCOWE = 0 (twarde: warstwa nie renderuje nakładających
 * się liczb). Ukryte etykiety ≤ budżet per LOD (zmierzone na fixturze
 * referencyjnej z PEŁNYM payloadem rozpływu: L0=0, L1=0, L2=15 — budżet z
 * zapasem chroni przed regresją „chowamy za dużo"; spadek dozwolony). */
const RESULT_LABEL_HIDDEN_BUDGET = { 0: 0, 1: 5, 2: 25 };

/** Napięcie znamionowe szyn modelu — `Bus.ref_id → voltage_kv`. Jedyne źródło
 *  wartości U w syntetycznym payloadzie niżej i miara `bus_result_voltage_level_probe`. */
function busVoltageIndex(model) {
  return new Map((model.buses ?? []).map((b) => [b.ref_id, b.voltage_kv]));
}

/**
 * Buduje PEŁNY, syntetyczny payload rozpływu na REALNYCH refach sceny (źródła/
 * TR/szyny/odcinki z udowodnioną orientacją) — kształt identyczny z
 * `RawOverlayPayload`, wartości 1:1 z kontraktu (zero fizyki w skrypcie).
 * Odwzorowuje bieg z wynikami na całej sieci — maksymalne obciążenie
 * deklutteru/agregacji.
 *
 * PRZESTRZEŃ KLUCZY = przestrzeń BACKENDU (karta WN-WYNIK). Klucz szyny bierzemy
 * dokładnie tak, jak robi to produkcja: najpierw MOST REFÓW (`resultRefBridge`,
 * szyny stacji i blok stacji na L0), potem `resultRefForSegment` (kanoniczny
 * `busResultRef` szyn GPZ). Wcześniej sonda dla szyn stacji fabrykowała klucz
 * RYSUNKOWY (`stn/…/station#sn-bus`) — kształt, którego backend NIGDY nie emituje
 * — więc mierzyła mapowanie nieistniejące w produkcji (Zero-Debt pkt 5: test
 * omijający realną ścieżkę maskuje defekt produktu).
 *
 * NAPIĘCIE SZYNY = `Bus.voltage_kv` TEJ szyny (z lekkim, deterministycznym
 * odchyłem +0,13 %, żeby wartość wyglądała jak odczyt rozpływu, a nie jak
 * przepisana tabliczka). Wcześniej KAŻDA szyna dostawała jedną stałą 15,02 kV —
 * także szyna 110 kV GPZ i szyna 0,4 kV stacji. Sonda akceptacyjna renderowała
 * więc „U 15,02 kV" NA SZYNIE WN i wszystkie bramki świeciły na zielono: to
 * dokładnie ta fabrykacja, którą zgłosił właściciel.
 */
function buildFullResultPayload(scene, oriented, busVoltageByRef, bridge) {
  const metricsForKind = (kind, ref) => {
    if (kind === 'branch') {
      return {
        LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' },
        I_A: { code: 'I_A', value: 350, unit: 'A', format_hint: 'fixed1' },
        P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' },
      };
    }
    if (kind === 'source') return { P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' } };
    if (kind === 'transformer') return { S_MVA: { code: 'S_MVA', value: 0.63, unit: 'MVA', format_hint: 'fixed2' } };
    const un = busVoltageByRef.get(ref);
    if (un == null) return {};
    return { U_kV: { code: 'U_kV', value: un * 1.0013, unit: 'kV', format_hint: 'fixed2' } };
  };
  const elements = {};
  const dodaj = (ref, kind) => {
    if (!ref || elements[ref]) return;
    const metrics = metricsForKind(kind, ref);
    if (Object.keys(metrics).length === 0) return;
    elements[ref] = { ref_id: ref, kind, badges: [], severity: 'INFO', metrics };
  };
  for (const s of scene.symbols) {
    const k = s.meta?.elementKind;
    const ref = s.meta?.ownerRef;
    if (!ref) continue;
    if (k === 'source' || k === 'transformer') dodaj(ref, k);
    // Blok stacji na L0 i symbol TR stacji zakotwiczony na polu — punkt wyniku
    // zna WYŁĄCZNIE most refów (ta sama droga co produkcja).
    const binding = bridge?.get(ref);
    if (binding) dodaj(binding.resultRef, binding.kind === 'bus' ? 'bus' : binding.kind);
  }
  for (const s of scene.segments) {
    const k = s.meta?.elementKind;
    const ref = s.meta?.ownerRef;
    // Kolejność 1:1 z `buildResultLabelsFromScene`: MOST ma pierwszeństwo przed
    // klasą odcinka — szyna nN stacji (`…#lv-bus`) jest w scenie zwykłym
    // odcinkiem toru, a punktem wyniku jest szyna nN (0,4 kV). Bez tej gałęzi
    // sonda w ogóle nie widziała poziomu nN.
    const binding = ref ? bridge?.get(ref) : undefined;
    if (binding) {
      dodaj(binding.resultRef, binding.kind === 'bus' ? 'bus' : binding.kind);
      continue;
    }
    if (k === 'bus') {
      dodaj(resultRefForSegment(s.meta), 'bus');
      continue;
    }
    if (k === 'segment' && ref && !ref.includes('#') && oriented.has(ref)) dodaj(ref, 'branch');
  }
  return { run_id: 'accept-sld-v3-result-labels', analysis_type: 'LOAD_FLOW', elements };
}

/** Liczba z linii etykiety wynikowej („15,02 kV" → 15.02; zapis POLSKI, tak jak
 *  renderuje warstwa). `null` = linia nie niesie liczby (nie zgadujemy). */
function liczbaZLiniiEtykiety(text) {
  const m = /^(-?\d+(?:,\d+)?)\s/.exec(text);
  return m ? Number(m[1].replace(',', '.')) : null;
}

/**
 * `bus_result_voltage_level_probe` (karta WN-WYNIK) — SONDA POZIOMU NAPIĘCIA.
 *
 * Każda etykieta wynikowa klasy `bus` niesie U TEJ szyny, do której jest
 * przypięta: punkt wyniku MUSI być szyną modelu, a odczyt MUSI zgadzać się z jej
 * `Bus.voltage_kv` CO DO RZĘDU (|U/Un − 1| < 0,5 — zapas obejmuje realne odchyłki
 * rozpływu i regulację zaczepów, ale 15 kV na szynie 110 kV to 0,86, a 110 kV na
 * szynie 15 kV to 6,3). Zamyka klasę „wynik jednego poziomu napięcia na szynie
 * innego poziomu": każde przyszłe pomylenie refów (most, adapter, kompozycja)
 * przewraca tę bramkę, niezależnie od tego, kto je popełni.
 *
 * Zwraca listę naruszeń (pusta = stan docelowy).
 */
function naruszeniaPoziomuNapiecia(entries, busVoltageByRef) {
  const naruszenia = [];
  for (const ownerRef of Object.keys(entries).sort()) {
    const entry = entries[ownerRef];
    if (entry.kind !== 'bus') continue;
    const linia = entry.lines.find((l) => l.prefix === 'U');
    if (!linia) continue;
    const u = liczbaZLiniiEtykiety(linia.text);
    if (u == null) continue;
    const un = busVoltageByRef.get(entry.resultRef);
    if (un == null) {
      naruszenia.push(`${ownerRef}: punkt wyniku „${entry.resultRef}" NIE jest szyną modelu`);
      continue;
    }
    if (!(Math.abs(u / un - 1) < 0.5)) {
      naruszenia.push(`${ownerRef}: U=${u} kV na szynie ${entry.resultRef} o Un=${un} kV`);
    }
  }
  return naruszenia;
}
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

/** Karta WN-WYNIK: most refów i napięcia szyn liczone RAZ na całą sonde —
 *  ta sama para, którą produkcja karmi warstwę wynikową
 *  (`SldCanvasV3Workspace.buildResultLabelsForSnapshot`). */
const RESULT_REF_BRIDGE = buildResultRefBridge(enm);
const BUS_VOLTAGE_BY_REF = busVoltageIndex(enm);

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
// SCHEMAT-10 S7.6 (V12K-137, karta KOMPRESJA, Z1): ZACIEŚNIONY 28072/45016/45016
// → 21976/38920/38920 (L0 −22%, L1/L2 −14%). Przyczyna: etykieta zejścia lateralu
// (obrócony `segment-lateral`) przeniesiona z gapu NAD stacją docelową do PASA
// ZEJŚĆ pod magistralą (przy punkcie odejścia); gap pasm lateralnych spadł z
// korytarza-etykiety (248 px) do MIN_SUBTREE_CLEARANCE (32 px), więc piony zejść
// skróciły się WYNIKOWO (`rezerwacja-kanalu` 43872→37776 na L1/L2). Bramka
// nie-rosnąca ryglowana do nowej wartości. Topologia/kolejność/ciągłość toru/
// „jedna kotwica"/crossings=0/kolizje=0 NIEZMIENIONE (patrz raport S7.6, tabela).
// W3-KABLE-ETYKIETY §7 (2026-07-23): PODNIESIONY 21976/38920/38920 →
// 22936/39880/39880 (+960/LOD, jednolicie). Pełna etykieta techniczna L2
// („relacja · typ · napięcie znam. · l = …", `layout/lineLabel.ts`, dane z
// katalogu/ENM) jest szersza od dawnej „typ · długość" → footprint kolumn
// NIEKTÓRYCH pól rośnie → `colorSegmentLabelRows` (`layout/segments.ts`) inaczej
// przydziela wiersze pasma B1, dokładając +960 px pionów; „jedna kotwica"
// propaguje deltę JEDNOLICIE na L0/L1/L2. Świadome odstępstwo od „nie-rosnącej"
// (§15.1 „redukcja MIĘKKA") — pełne dane techniczne linii (§7 P0) mają
// pierwszeństwo; ZERO nowych kolizji jakiegokolwiek rodzaju (ten skrypt zielony).
// RE-BASELINE V12K-219 (+8 pion / +16 poziom / +1 róg, jednolicie na L0/L1/L2):
// schemat zyskał APARAT UZIEMIAJĄCY punktu neutralnego sieci SN wraz z trasą
// przyłączenia od szyny. Wzrost jest kosztem NOWEJ TREŚCI rysunku, nie regresją
// układu — aparat stoi obok sekcji (poza pasem pól), a trasa ma jeden róg, bo
// biegnie poziomo od lewego końca szyny i schodzi pionowo do aparatu.
  // KD-8 poz. 5 (2026-07-31, CELOWA aktualizacja baseline): PODNIESIONY
  // 22896/39888/39888 → 23232/40224/40224 (+336 px pionów JEDNOLICIE na LOD).
  // Przyczyna dokładna: prześwit etykiety napięcia szyny od TORU urósł z GRID
  // (8 px) do BUSBAR_LABEL_PATH_CLEARANCE (16 px), a rezerwacja pasma
  // (`stationBusbarLabelHeight`) urosła razem z nim — 42 wiersze stacji z
  // polami SN na fixturze referencyjnej × 8 px = 336 px. Odstępstwo od reguły
  // „nie-rosnąca" (§15.1 „redukcja jest ograniczeniem MIĘKKIM") ŚWIADOME i tej
  // samej klasy co F10.3: czytelność podpisu szyny ma pierwszeństwo przed
  // minimalizacją pionów. Dowód braku regresji układu: `accept:sld-v3` ALL PASS
  // (w tym nowa sonda `busbar_label_clearance_probe` — 55 etykiet szyn,
  // 0 naruszeń) oraz zero nowych kolizji etykieta↔etykieta/symbol/przewód.
// S9-1 (ŁAMANIE ARKUSZA, `docs/sld/DECYZJA_LAMANIE_ARKUSZA.md`) — baseline
// OBNIŻONY 23232/40224/40224 → 22232/39240/39240: odgałęzienia leżą w PAŚMIE
// swojego wiersza arkusza (przeplot §4), więc piony zejść nie muszą już
// przebiegać pod całym rysunkiem. Reguła „nie-rosnąca" spełniona.
// S9-7/8 (TYPOGRAFIA I HIERARCHIA RYSUNKU) — baseline PODNIESIONY 22232/39240/
// 39240 → 22440/39448/39448 (+208 px pionów JEDNOLICIE na każdym LOD).
// PRZYCZYNA ZMIERZONA, nie zgadnięta: oznacznik jednoznaczności napięcia
// znamionowego kabla („Un=" przed wartością, `layout/lineLabel.ts` — S9-8
// „jednoznaczne oznaczenie napięcia znamionowego kabla przy przęśle") wydłuża
// etykietę przęsła o 3 glify, a etykieta przęsła jest REZERWACJĄ szerokości
// kolumny stacji (`requiredSegmentLabelWidth`, `layout/measure.ts`). Szersze
// sloty inaczej dzielą się na wiersze pasma B1 (`colorSegmentLabelRows`,
// `layout/segments.ts`, NIEZMIENIONE) i „jedna kotwica" SCHEMAT-10 S1
// propaguje deltę jednolicie na L0/L1/L2.
//
// ŚWIADOME ODSTĘPSTWO od reguły „nie-rosnąca" (spec §15.1: „redukcja jest
// ograniczeniem MIĘKKIM — nigdy kosztem czytelności"): kabel opisany samym
// „20 kV" w łańcuchu członów rozdzielonych tym samym separatorem nie mówi, czy
// to napięcie IZOLACJI KABLA, czy PRACY SIECI — a te bywają różne na tym samym
// rysunku. Wariant droższy („Un = " ze spacjami) kosztowałby +2536 px pionów i
// obniżał gęstość tuszu na przeglądzie z 2,03 % do 1,94 %; wybrano formę zwartą
// (pomiar w docstringu `formatRatedVoltageKv`). Gęstość tuszu po zmianie: L0
// referencyjna 1,67 % → 1,66 %, L0 długi ciąg 2,03 % → 2,03 % (bez zmiany).
// Zero nowych kolizji jakiegokolwiek rodzaju (ten skrypt zielony).
const VERTICAL_LENGTH_BASELINE = { 0: 22440, 1: 39448, 2: 39448 };

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
// SCHEMAT-10 S7-P3 (V12K-137, WYTYCZNE_GENERALIZACJA §5): L1/L2 PODNIESIONE
// 67192/70784 → 67224/70816 (+32/LOD). Przyczyna: naprawa determinizmu-pod-
// permutacją DER (`scene/buildScene.ts` — kolejność PV/BESS w rzędzie nN
// sortowana po STABILNYM `id`, nie po kolejności tablicy `generators` ENM;
// test §5 `buildScene.schemat10s7p3.test.ts`). Kanoniczny porządek DER zmienia
// długość dołączeń nN o stałą +32 na L1/L2 (piony/bbox/crossings/kolizje bez
// zmian — patrz raport S7-P3, tabela 18 metryk). To NOWA kanoniczna geometria
// po fixie poprawności, nie regresja. L0 (bez DER) bez zmian.
// SCHEMAT-10 S7-P4 (V12K-137, recenzja właściciela §9 P0 pkt 1): PODNIESIONE
// L0/L1/L2 47048/67224/70816 → 47248/67424/71016 (+200/LOD). Przyczyna:
// `TOP_LEVEL_FIELD_CLEARANCE` (`layout/clearances.ts`) podniesione 3×GRID→4×GRID
// (+33,3%, widełki §5 „+20–35%"), żeby światło pasa górnego MIĘDZY REALNYMI
// obrysami pól (opisy+aparatura) rosło z 24 → 32 px (recenzja: „GÓRNY PAS 6").
// Koszt poziomy = +8 px na szczelinę magistrali × 25 pododcinków objętych
// pomiarem `totalHorizontalSegmentLength` (11 szczelin × segmenty przęseł +
// slotów etykiet). Recenzja AKCEPTUJE ten koszt jako P0; baseline podniesiony
// świadomie. Piony/załamania/bbox-h/crossings/kolizje bez zmian (patrz raport
// S7-P4, tabela 18 metryk). NOWA kanoniczna geometria po podniesieniu światła.
// W3-KABLE-ETYKIETY §7 (2026-07-23): PODNIESIONY 47248/67424/71016 →
// 48208/68384/71976 (+960/LOD, jednolicie) — ta sama przyczyna co
// `VERTICAL_LENGTH_BASELINE` wyżej (szersze kolumny pełnej etykiety L2 wydłużają
// pododcinki poziome przęseł/slotów o stałą na LOD). Załamania (bends) BEZ zmian.
// S9-1 (ŁAMANIE ARKUSZA) — baseline PODNIESIONY, świadome odstępstwo od reguły
// „nie-rosnąca" (spec §15.1: redukcja kosztu jest ograniczeniem MIĘKKIM,
// czytelność ma pierwszeństwo). Przyczyna zmierzona, nie oszacowana: każde
// złamanie arkusza dokłada ŁĄCZNIK CIĄGU DALSZEGO (kanał powrotny w prawo,
// bieg nad wierszem następnym, rynna podjęcia) — to +2 biegi poziome i +4 rogi
// na złamanie. Ceną 9120/9440/9424 px poziomów i 3/4/4 rogów kupujemy zejście
// proporcji arkusza z 4,06 : 1 do 1,49 : 1 (znalezisko C-1 wagi 3), a PIONY w
// tym samym bilansie SPADAJĄ (patrz `VERTICAL_LENGTH_BASELINE` wyżej).
// S9-7/8: PODNIESIONY 57344/77840/81416 → 57392/77888/81464 (+48 px poziomów
// jednolicie) — ta sama przyczyna i to samo uzasadnienie co przy
// `VERTICAL_LENGTH_BASELINE` wyżej (oznacznik „Un=" w etykiecie przęsła).
const HORIZONTAL_LENGTH_BASELINE = { 0: 57392, 1: 77888, 2: 81464 };
const BEND_COUNT_BASELINE = { 0: 43, 1: 172, 2: 172 };

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
// SCHEMAT-10 S7-P4 (V12K-137, recenzja §9 P0 pkt 1): OBNIŻONY o ZMIERZONY koszt
// świateł 0.0098/0.018/0.0185 → 0.00977/0.01797/0.01842. Przyczyna: podniesienie
// `TOP_LEVEL_FIELD_CLEARANCE` 3×GRID→4×GRID poszerza bbox arkusza o +88 px
// (11 szczelin × 8), więc udział pokrytych komórek spada marginalnie
// (L0 0.009854→0.009818, L1 0.018111→0.018024, L2 0.018564→0.018475; sheetFill
// ≈ inkDensity). Podłoga = NOWA zmierzona wartość minus ~0.00005 na jitter
// metryk tekstu (ta sama reguła co S7-P1). Korekta per liczba, z uzasadnieniem
// (recenzja AKCEPTUJE zmierzony koszt świateł pasa górnego jako P0). Nie jest to
// „spuchnięcie pustką" — to świadomy koszt czytelniejszego światła, a bbox
// rośnie tylko o poszerzone szczeliny, nie o pustą rezerwę.
// SCHEMAT-10 S7.6 (V12K-137, karta KOMPRESJA, Z1): PODNIESIONY 0.00977/0.01797/
// 0.01842 → 0.01380/0.02250/0.02309 (zaryglowanie zysku kompresji pionowej).
// Przyczyna: kompresja pasm lateralnych (etykieta zejścia → pas pod magistralą,
// gap → MIN_SUBTREE_CLEARANCE) obniża bbox-h o −24% (4457→3409 na L1/L2), więc
// udział pokrytych komórek (inkDensity ≈ sheetFill) rośnie: L0 0.011309→0.013840,
// L1 0.018024→0.022556, L2 0.018475→0.023144 (spełnia „wykorzystanie arkusza po >
// przed", warunek S6 §6). Podłoga = NOWA zmierzona wartość minus ~0.00005 na jitter
// metryk tekstu (ta sama reguła co S7-P1/P4). Korekta per liczba.
// W3-KABLE-ETYKIETY §7 (2026-07-23): OBNIŻONY 0.01380/0.02250/0.02309 →
// 0.01374/0.02223/0.02281. Przyczyna: pełna etykieta techniczna L2 poszerza bbox
// arkusza (piony+poziomy +960/LOD), więc udział pokrytych komórek spada
// marginalnie (zmierzone 0.01379/0.02228/0.02286). To NIE „spuchnięcie pustką"
// (S6 §6) — bbox rośnie o REALNĄ treść (dłuższe, kompletne etykiety), nie o pustą
// rezerwę. Podłoga = NOWA zmierzona wartość minus ~0.00005 na jitter metryk
// tekstu (ta sama reguła co S7-P1/P4). Korekta per liczba.
// KD-8 poz. 5 (2026-07-31, CELOWA korekta podłogi L2): OBNIŻONA 0.02281 →
// 0.02275. Przyczyna: pasmo etykiety szyny urosło o 8 px na wiersz stacji
// (prześwit podpisu od toru — patrz `VERTICAL_LENGTH_BASELINE` wyżej), więc
// bbox arkusza rośnie o REALNĄ treść (czytelny podpis), a udział pokrytych
// komórek spada marginalnie: zmierzone L2 0.022805 (L0 0.013808 i L1 0.022240
// zostają nad dotychczasową podłogą — bez korekty). Podłoga = NOWA zmierzona
// wartość minus ~0.00005 na jitter metryk tekstu (ta sama reguła co S7-P1/P4).
const SHEET_FILL_FLOOR = { 0: 0.01374, 1: 0.02223, 2: 0.02275 };

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

  // S9-1 (ŁAMANIE ARKUSZA): kolejność topologiczna czytana jest teraz
  // leksykograficznie (wiersz arkusza, potem X) — każdy wiersz zaczyna się od
  // lewego marginesu, więc „rosnące X w poprzek całego ciągu" przestało być
  // kanonem. Intencja bez zmian: ciąg czyta się od zasilania w głąb sieci.
  const rows = sheetRowStationIds(scene);
  const rowOf = new Map();
  rows.forEach((row, i) => row.forEach((id) => rowOf.set(id, i)));
  let orderOk = rows.flat().join('|') === ids.join('|');
  for (let i = 1; i < ranges.length; i++) {
    if (rowOf.get(ids[i - 1]) !== rowOf.get(ids[i])) continue; // granica wiersza
    if (!(ranges[i - 1].max < ranges[i].min)) orderOk = false;
  }
  check(
    `§16/§15.2: stacje ciągu głównego narysowane w kolejności topologyRuns[].stationRefs (wiersz arkusza, potem rosnące X; wierszy=${rows.length})`,
    orderOk,
  );

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

// SCHEMAT-10 GS-2 (V12K-137, `GRAMATYKA_MINI_RMU_2026-07` reguły 2–4, 5–7, 10,
// 12): gramatyka konstrukcyjna sylwetki mini-RMU jest WŁAŚCIWOŚCIĄ GLOBALNĄ
// (stałe `MINI_RMU`, `symbols/miniRmuGrammar.ts`) — nie zależy od fixtury/sceny.
line('');
line('=== mini_rmu_grammar_probe (GS-2, reguły 2–4 / 5–7,10,12, globalne — poza pętlą LOD) ===');
{
  const contGaps = miniRmuPathContinuityGaps();
  check(
    'mini_rmu_path_continuity_probe (reguły 2–4): szyna SN na wylot port W↔E przez enklozurę (tor ciągły, glif = fragment toru)',
    contGaps.length === 0,
    contGaps.length ? contGaps.join(' | ') : 'ciągłość toru zachowana',
  );
  const spGaps = miniRmuMarkerSpacingGaps();
  check(
    'mini_rmu_marker_spacing_probe (reguły 5–7, 10): markery wewnątrz enklozury, rozłączne, kanał routingu x=24 czysty',
    spGaps.length === 0,
    spGaps.length ? spGaps.join(' | ') : 'kotwice/odstępy zachowane',
  );
  const trRatio = transformerInteriorHeightRatio();
  check(
    'mini_rmu_transformer_proportion_probe (reguła 12): TR uzupełniający — ≤0,5 wysokości wnętrza',
    trRatio <= 0.5,
    `udział=${trRatio.toFixed(4)}`,
  );
}

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

  // -- KD-8 poz. 5: PRZEŚWIT etykiet szyn od toru (nie przecięcie — styk) ----
  const clearanceGaps = busbarLabelPathClearanceGaps(scene, BUSBAR_LABEL_PATH_CLEARANCE);
  check(
    `busbar_label_clearance_probe (KD-8 poz. 5): każda etykieta szyny trzyma od toru ≥ ${BUSBAR_LABEL_PATH_CLEARANCE}px świata`,
    clearanceGaps.length === 0,
    clearanceGaps.length === 0
      ? `etykiety_szyn=${scene.labels.filter((l) => l.ownerKind === 'busbar-voltage').length} naruszenia=0`
      : clearanceGaps.map((g) => `${g.text}=${g.clearance}px`).join(', '),
  );

  // -- W3 §5: światła równoległych kabli -------------------------------------
  const parallelClearance = minParallelCableClearance(scene);
  check(
    `parallel_cable_clearance_probe (W3 §5): min. światło równoległych pionów tras ≥ MIN_PARALLEL_CABLE_CLEARANCE (${MIN_PARALLEL_CABLE_CLEARANCE}px) — brak „przewodu podwójnego"`,
    parallelClearance === Infinity || parallelClearance >= MIN_PARALLEL_CABLE_CLEARANCE,
    parallelClearance === Infinity ? 'brak par równoległych tras (brak ryzyka)' : `min=${parallelClearance}px`,
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
  // Wyrocznia idzie na L2, bo tam identyfikatory są RYSOWANE. Warunek był dotąd
  // `lod !== 0` i dobrany do tego, gdzie istnieją SYMBOLE aparatów (L0 =
  // stationCollapsed, zero aparatów) — a mierzy ETYKIETY tych symboli. Rozjazd
  // ujawnił audyt powykonawczy SLD (V12K-212): kontrakt LOD §6 przypisuje
  // identyfikatory aparatów do pełnego detalu, więc od tej zmiany L1 ich nie ma
  // i probe raportował 0 etykiet wobec 395 aparatów. Intencja §19.1 zostaje bez
  // zmian — „każdy uprawniony aparat niesie identyfikator funkcyjny ze znacznikiem
  // konwencji" — przenosi się tylko poziom, na którym da się ją sprawdzić.
  if (lod === 2) {
    const idGaps = apparatusIdentifierGaps(scene);
    check(
      'apparatus_identifier_probe (§19.1 a-d): oznaczenie pola FUNKCYJNE (nie surowe Q\\d+/T\\d+), każdy aparat uprawniony (CB/DS/rozłącznik/uziemnik/TR) niesie identyfikator Q/QE/T ze znacznikiem konwencji',
      allApparatusIdentifiersValid(scene),
      `luki=${idGaps.length}${idGaps.length ? ' np. ' + JSON.stringify(idGaps[0]) : ''}`,
    );
  }
  // Kontrola ODWROTNA (V12K-212): na L1 identyfikatorów aparatów nie ma, a symbole
  // owszem. Bez tej pary regresja w drugą stronę — powrót etykiet Q na „sieć
  // terenową" — byłaby niewykrywalna, bo probe §19.1 wtedy tylko by się ucieszył.
  if (lod === 1) {
    const idLabels = scene.labels.filter(
      (l) => l.ownerKind === 'apparatus' && l.ownerRef.includes('#apparatus-id-'),
    );
    // TA SAMA wyrocznia „aparatu uprawnionego" co §19.1 (`apparatusIdentifierGaps`):
    // `elementKind` + znacznik `apparatusSource` ustawiany wyłącznie przez
    // `compose/station.ts`. Pierwsza wersja licznika pytała o `meta.kind` (pole,
    // którego symbole nie mają) i raportowała 0 aparatów przy 395 obecnych —
    // liczba w raporcie audytowym nie może kłamać, nawet gdy asercja obok jest
    // poprawna.
    const apparatusSymbols = scene.symbols.filter(
      (sym) =>
        (sym.meta?.elementKind === 'apparatus' || sym.meta?.elementKind === 'transformer') &&
        sym.meta?.apparatusSource != null,
    ).length;
    check(
      'apparatus_identifier_lod_probe (kontrakt LOD §6): L1 („sieć terenowa") niesie SYMBOLE aparatów, ale NIE ich identyfikatory — te należą do pełnego detalu',
      idLabels.length === 0,
      `etykiety_identyfikatorow=${idLabels.length} symbole_aparatow=${apparatusSymbols}`,
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
  // V12K-293 (KD-5) + KD-7 poz. 5: helpery §21 same czytają SCENĘ
  // (`gpzBlockCollapsed`) — scena ze zwiniętym blokiem nie wymaga kolumny WN
  // ani dominanty, ale rysunek ROZWINIĘTY podlega §21 na KAŻDYM poziomie LOD.
  // Dlatego sondy biegną bezwarunkowo; na L0 dodatkowo sonda kanonu zwinięcia.
  {
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
  }
  if (lod === 0) {
    const gpzInFull = buildSceneV3(enm, 1).symbols.some(
      (s) => (s.meta?.ownerRef ?? '').startsWith('gpz/'),
    );
    const collapsedCount = scene.symbols.filter((s) => s.symbolId === 'gpzCollapsed').length;
    const internalExtra = scene.symbols.filter(
      (s) =>
        (s.meta?.ownerRef ?? '').startsWith('gpz/') &&
        s.symbolId !== 'gpzCollapsed' &&
        s.symbolId !== 'gridSource' &&
        s.symbolId !== 'breaker',
    );
    check(
      'gpz_collapsed_probe (§21.3, V12K-293): L0 rysuje GPZ ZWINIĘTY — dokładnie jeden gpzCollapsed (gdy pełny detal niesie pasmo gpz/), a poza nim wyłącznie glif źródła i aparaty ciągłości pól',
      (!gpzInFull && collapsedCount === 0) ||
        (gpzInFull && collapsedCount === 1 && internalExtra.length === 0),
      `gpz_w_pelnym_detalu=${gpzInFull} zwiniete=${collapsedCount} wewnetrzne_nadmiarowe=${internalExtra.length}${internalExtra.length ? ' np. ' + JSON.stringify(internalExtra[0]?.symbolId) : ''}`,
    );
  }

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
  // w kanonie S9-2: kierunek emitowany WYŁĄCZNIE dla odcinków z orientacją
  // DOWODZONĄ refami węzłów gałęzi (`orientedSegmentRefs`) — poprzednik
  // (`singleHopSegmentRefs`, przęsła jednokawałkowe) był jej podzbiorem.
  const oriented = orientedSegmentRefs(enm);
  const emptyFlow = buildFlowOverlayFromScene(scene, null, oriented);
  check('flow_overlay_probe (§14.2, a): overlay wyłączony bez wyniku (payload=null ⇒ pusta nakładka, zero atrap)', isFlowOverlayEmpty(emptyFlow));

  const flowCandidateRef = scene.segments.find(
    (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#') && oriented.has(s.meta.ownerRef),
  )?.meta?.ownerRef;
  if (check('flow_overlay_probe: scena LOD ' + lod + ' zawiera odcinek z realnym segmentRef o udowodnionej orientacji (kandydat do sondy b/c/negatyw)', flowCandidateRef != null)) {
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
    const flow = buildFlowOverlayFromScene(scene, syntheticPayload, oriented);
    check(
      'flow_overlay_probe (§14.2, b): każda wartość nakładki wywiedziona z wyniku (brak wartości wpisanych w UI)',
      !isFlowOverlayEmpty(flow) && flowOverlayValuesTraceToPayload(flow, syntheticPayload),
    );
    const flowAgain = buildFlowOverlayFromScene(scene, syntheticPayload, oriented);
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

    // -- F-1 (recenzja Opusa, kanon S9-2): bramka orientacji gryzie ----------
    // Odcinek BEZ udowodnionej orientacji nie dostaje strzałki. Dowód przez
    // WYCOFANIE dowodu: kandydatowi zabieramy wpis z mapy orientacji (kopia,
    // nie mutacja) i podajemy wynik z P_MW — nakładka MUSI zostać pusta.
    // Ten sam wzorzec co vitest `overlay.test.ts` (kopia mapy orientacji);
    // działa niezależnie od tego, ile odcinków fixtury ma dowód orientacji.
    {
      const withoutProof = new Map(oriented);
      withoutProof.delete(flowCandidateRef);
      const unprovenPayload = {
        run_id: 'accept-sld-v3-synthetic',
        analysis_type: 'LOAD_FLOW',
        elements: { [flowCandidateRef]: syntheticMetricsOf(flowCandidateRef) },
      };
      check(
        'flow_overlay_probe (F-1, negatyw): odcinek bez udowodnionej orientacji z P_MW w wyniku ⇒ ZERO wpisu kierunku (uczciwe „nie wiem", nie błędna strzałka)',
        isFlowOverlayEmpty(buildFlowOverlayFromScene(scene, unprovenPayload, withoutProof)),
      );
    }

    // -- V-1/V-2 (recenzja wizualna): rozmieszczenie etykiet przepływu -------
    // Payload na WSZYSTKICH odcinkach z udowodnioną orientacją naraz (jak harness
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
        if (ref && s.meta?.elementKind === 'segment' && oriented.has(ref)) fullElements[ref] = syntheticMetricsOf(ref);
      }
      const fullPayload = { run_id: 'accept-sld-v3-synthetic', analysis_type: 'LOAD_FLOW', elements: fullElements };
      const fullFlow = buildFlowOverlayFromScene(scene, fullPayload, oriented);
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

  // -- R2 (§wym.19): result_label_metrics_probe — metryki rozmieszczania -----
  // Warstwa wynikowa na PEŁNYM syntetycznym payloadzie rozpływu (wszystkie
  // realne kotwice sceny) — maksymalne obciążenie deklutteru/agregacji na
  // REALNEJ scenie. Metryki (wym. 19): liczba etykiet, kolizje wykryte/
  // rozwiązane/końcowe, callouty, ukryte, agregaty, śr./maks. odległość od
  // kotwicy, CZAS rozmieszczania. Budżety: kolizje KOŃCOWE = 0 (twarde),
  // ukryte ≤ budżet per LOD. Czas mierzony poza kontraktem determinizmu (nie
  // wchodzi do porównania JSON) — sam raportowany.
  {
    const rlPayload = buildFullResultPayload(scene, oriented, BUS_VOLTAGE_BY_REF, RESULT_REF_BRIDGE);
    const rlByRef = buildResultLabelsFromScene(scene, rlPayload, new Set(oriented.keys()), undefined, RESULT_REF_BRIDGE);
    const t0 = performance.now();
    const layout = layoutResultLabels(scene, rlByRef, [], lod);
    const layoutMs = performance.now() - t0;
    const m = layout.metrics;
    line(
      `  result_label_metrics (LOD ${lod}): etykiety=${m.labelCount} ulokowane=${layout.placements.length} `
      + `agregaty=${m.aggregateCount} ukryte=${m.hiddenCount} callouty=${m.calloutCount} `
      + `kolizje(wykryte=${m.collisionsDetected} rozwiązane=${m.collisionsResolved} końcowe=${m.collisionsFinal}) `
      + `odl_kotwica(śr=${m.avgAnchorDistance.toFixed(1)} maks=${m.maxAnchorDistance.toFixed(1)}) czas=${layoutMs.toFixed(2)}ms`,
    );
    check(
      `result_label_metrics_probe (§wym.19): kolizje KOŃCOWE = 0 (warstwa nie renderuje nakładających się liczb) na LOD ${lod}`,
      m.collisionsFinal === 0,
      `końcowe=${m.collisionsFinal}`,
    );
    check(
      `result_label_metrics_probe (§wym.19): ukryte ≤ budżet (${RESULT_LABEL_HIDDEN_BUDGET[lod]}) na LOD ${lod}`,
      m.hiddenCount <= RESULT_LABEL_HIDDEN_BUDGET[lod],
      `ukryte=${m.hiddenCount}`,
    );
    check(
      `result_label_metrics_probe (§wym.19): bilans etykiet = ulokowane + ukryte + Σ członków agregatów na LOD ${lod}`,
      layout.placements.length + m.hiddenCount + layout.aggregates.reduce((s, a) => s + a.count, 0) === m.labelCount,
    );
    // Determinizm rozmieszczania (bez czasu) — dwa wywołania identyczne.
    const layoutAgain = layoutResultLabels(scene, rlByRef, [], lod);
    check(
      `result_label_metrics_probe (§wym.19): determinizm rozmieszczania (placements+agregaty+ukryte+metryki identyczne) na LOD ${lod}`,
      JSON.stringify(layout) === JSON.stringify(layoutAgain),
    );
    // -- WN-WYNIK: bus_result_voltage_level_probe ---------------------------
    // (a) każda etykieta szyny zgodna CO DO RZĘDU z `Bus.voltage_kv` tej szyny.
    {
      const naruszenia = naruszeniaPoziomuNapiecia(rlByRef, BUS_VOLTAGE_BY_REF);
      check(
        `bus_result_voltage_level_probe (WN-WYNIK a): U etykiety == poziom napięcia szyny (|U/Un−1| < 0,5) dla WSZYSTKICH szyn na LOD ${lod}`,
        naruszenia.length === 0,
        naruszenia.length === 0 ? undefined : `naruszenia=${naruszenia.length}, np. ${naruszenia.slice(0, 3).join(' | ')}`,
      );
      // (b) dowód POZYTYWNY, że sonda ma co mierzyć: warstwa niesie etykiety
      // szyn z CO NAJMNIEJ DWÓCH poziomów napięcia (WN/SN/nN). Bez tego bramka
      // (a) mogłaby być prawdziwa „przez pustkę" — sieć referencyjna ma szynę
      // 110 kV GPZ, szyny 15 kV i szyny 0,4 kV stacji.
      const poziomy = new Set();
      for (const ownerRef of Object.keys(rlByRef)) {
        const e = rlByRef[ownerRef];
        if (e.kind !== 'bus') continue;
        const un = BUS_VOLTAGE_BY_REF.get(e.resultRef);
        if (un != null) poziomy.add(un);
      }
      if (lod !== 0) {
        check(
          `bus_result_voltage_level_probe (WN-WYNIK b, dowód pozytywny): etykiety szyn obejmują ≥ 2 poziomy napięcia na LOD ${lod}`,
          poziomy.size >= 2,
          `poziomy=${[...poziomy].sort((x, y) => x - y).join('/')} kV`,
        );
      }
      // (c) test NEGATYWNY — dowód, że wyrocznia gryzie: podmieniamy odczyt
      // szyny WN na wartość szyny SN (dokładnie defekt zgłoszony przez
      // właściciela: „U 15,02 kV" na szynie 110 kV). Sonda MUSI zgłosić.
      if (lod !== 0) {
        const wnRef = [...BUS_VOLTAGE_BY_REF.entries()].filter(([, u]) => u > 60).map(([r]) => r).sort()[0];
        const wpisWn = wnRef ? Object.keys(rlByRef).find((o) => rlByRef[o].resultRef === wnRef) : undefined;
        if (wpisWn) {
          const podmieniony = {
            ...rlByRef,
            [wpisWn]: {
              ...rlByRef[wpisWn],
              lines: rlByRef[wpisWn].lines.map((l) => (l.prefix === 'U' ? { ...l, text: '15,02 kV' } : l)),
            },
          };
          check(
            `bus_result_voltage_level_probe (WN-WYNIK c, test negatywny): odczyt SN wstrzyknięty na szynę WN MUSI dać naruszenie (LOD ${lod})`,
            naruszeniaPoziomuNapiecia(podmieniony, BUS_VOLTAGE_BY_REF).length > 0,
          );
        } else {
          check(
            `bus_result_voltage_level_probe (WN-WYNIK c, test negatywny): szyna WN obecna w warstwie wynikowej (LOD ${lod})`,
            false,
            `brak wpisu dla szyny WN „${wnRef ?? '(brak szyny WN w modelu)'}"`,
          );
        }
      }
    }

    // Priorytet (wym. 12): źródła/transformatory NIGDY ukryte, gdy niżej-
    // priorytetowe klasy obecne — dowód, że wyrocznia mierzy realny priorytet.
    if (lod !== 0) {
      const hiddenHighPri = layout.hiddenRefs.filter((r) => rlByRef[r]?.kind === 'source' || rlByRef[r]?.kind === 'transformer');
      check(
        `result_label_metrics_probe (§wym.12): 0 źródeł/transformatorów ukrytych (klasa właściciela rozstrzyga kolizję) na LOD ${lod}`,
        hiddenHighPri.length === 0,
        `ukryte_wysokopriorytetowe=${hiddenHighPri.length}`,
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
  // -- SCHEMAT-10 S7-P4 (V12K-137, recenzja §9 P0 pkt 2): AUDYT DŁUGOŚCI PIONÓW.
  // Każdy pion MUSI mieć przyczynę (footprint / rezerwacja-kanalu / jog-trasy /
  // slupek-terminalny); pion `nieuzasadniony` = DO SKRÓCENIA (regresja).
  const vGaps = verticalAuditGaps(scene);
  const vBreak = verticalCauseBreakdown(scene);
  const vTable = Object.entries(vBreak)
    .map(([k, v]) => `${k}:${v.count}/${v.length}`)
    .join(' · ');
  check(
    'vertical_audit_probe (S7-P4 §9 P0 pkt 2): każdy pion ma przyczynę (żaden nieuzasadniony)',
    allVerticalsAttributed(scene),
    vGaps.length === 0
      ? `tabela przyczyn(liczba/długość) — ${vTable}`
      : `NIEUZASADNIONE=${vGaps.length}: ${vGaps.slice(0, 5).map((g) => `${g.ownerRef ?? '?'}(${g.kind ?? '?'},${g.length})`).join(', ')}`,
  );
  // -- SCHEMAT-10 S7-P4 + GS-1 (V12K-137, recenzja §9 P0 pkt 3, DOMKNIĘCIE GAP
  // §10.4): CZYTELNOŚĆ L0 na widoku całości — zbiór §3 „nigdy nie znika" (tor
  // mocy z wagą, tożsamość stacji, źródło) ROZSZERZONY o TYP STACJI · TR ·
  // MARKER DER · STAN NO (sylwetka mini-RMU niesie `meta.stationGlyph`). Bramka
  // WYŁĄCZNIE na L0 (semantyka „Przegląd sieci").
  if (lod === 0) {
    const l0Gaps = lod0ReadabilityGaps(scene);
    check(
      'lod0_readability_probe (S7-P4 §9 P0 pkt 3 + GS-1 §10.4): tor mocy(waga) + tożsamość + źródło + typ/TR/DER/NO sylwetki rozpoznawalne na L0',
      allLod0ElementsReadable(scene),
      l0Gaps.length === 0
        ? 'zbiór §3 „nigdy nie znika" (z rozszerzeniem GS-1) obecny na L0'
        : `luki=${l0Gaps.length}: ${l0Gaps.slice(0, 5).map((g) => `${g.element}: ${g.reason}`).join(' | ')}`,
    );
    // Test negatywny (GS-1): usunięcie podsumowania sylwetki (`meta.stationGlyph`)
    // MUSI dać lukę „sylwetka stacji" — dowód, że rozszerzenie §10.4 gryzie.
    const sabotaged = {
      ...scene,
      symbols: scene.symbols.map((s) =>
        s.symbolId === 'stationCollapsed' ? { ...s, meta: { ...s.meta, stationGlyph: undefined } } : s,
      ),
    };
    check(
      'lod0_readability_probe (GS-1, test negatywny — dowód, że wyrocznia gryzie): sylwetka bez typ/TR/DER/NO MUSI dać lukę',
      lod0ReadabilityGaps(sabotaged).some((g) => g.element === 'sylwetka stacji') && !allLod0ElementsReadable(sabotaged),
    );
  }

  // -- S9-1 (ŁAMANIE ARKUSZA, audyt C-1 wagi 3) — PROPORCJA ARKUSZA ----------
  // Kryterium odbioru karty: bbox arkusza NIE MOŻE przekroczyć 2 : 1 na ŻADNYM
  // poziomie szczegółu (sieć referencyjna miała 4,06 : 1, a sieć 51 stacji z
  // audytu — 53 : 1). Docelowo 1,41 : 1 (A3 poziomo).
  const aspect = sheetAspectRatio(scene);
  check(
    `sheet_aspect_probe (S9-1, C-1): proporcja arkusza ≤ ${SHEET_MAX_ASPECT} : 1 (docelowo ${SHEET_TARGET_ASPECT.toFixed(2)} : 1)`,
    aspect > 0 && aspect <= SHEET_MAX_ASPECT && 1 / aspect <= SHEET_MAX_ASPECT,
    `proporcja=${aspect.toFixed(3)} bbox=${scene.bbox.width}×${scene.bbox.height} wierszy arkusza=${sheetRowStationIds(scene).length}`,
  );
  const contGaps = sheetContinuationGaps(scene);
  check(
    'sheet_continuation_probe (S9-1 §5): każde złamanie arkusza ma znak ciągu dalszego (kreski + odsyłacze na L2)',
    allSheetContinuationsMarked(scene),
    contGaps.length === 0
      ? `złamań=${Math.max(0, sheetRowStationIds(scene).length - 1)}`
      : `luki=${contGaps.length}: ${contGaps.slice(0, 3).map((g) => `${g.ownerRef}: ${g.powod}`).join(' | ')}`,
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
  // -- RECENZJA P1.1 (gęstość lokalna) — ROZKŁAD zajętości arkusza z REALNEJ
  // geometrii sceny (okna `LOCAL_DENSITY_WINDOW_CELLS`×`GRID`): średnia/maks/
  // odchylenie/pustka. Sonda RAPORTUJĄCA (PASS z wartością) — twardy próg
  // dopiero po uczciwym pomiarze bazy (recenzja P1). Sanity: okna niepuste,
  // wartości skończone w [0,1], maks ≥ średnia. Deterministyczne (2× ⇒ identyczne).
  const density = localDensityMetrics(scene);
  const densityAgain = localDensityMetrics(buildSceneV3(enm, lod));
  const densitySane =
    density.windowCount > 0 &&
    [density.meanDensity, density.maxLocalDensity, density.densityStdDev, density.voidRatio].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 1,
    ) &&
    density.maxLocalDensity >= density.meanDensity &&
    JSON.stringify(density) === JSON.stringify(densityAgain);
  check(
    `local_density_probe (RECENZJA EKSPERCKA — gęstość lokalna, okno=${LOCAL_DENSITY_WINDOW_CELLS}×GRID): rozkład zajętości arkusza zmierzony (raport, bez twardego progu)`,
    densitySane,
    `okna=${density.windowCount} średnia=${density.meanDensity.toFixed(6)} maks=${density.maxLocalDensity.toFixed(6)} odch=${density.densityStdDev.toFixed(6)} pustka=${density.voidRatio.toFixed(6)}`,
  );
  // -- SCHEMAT-10 S7-P4 (V12K-137, recenzja §9 P0 pkt 1): światło pasa górnego
  // BBOX-DO-BBOX (nie kotwic). Odstęp = prawy bbox CAŁEGO pola N (opisy+aparatura)
  // → lewy bbox pola N+1 ≥ TOP_LEVEL_FIELD_CLEARANCE, na REALNYCH obrysach pól.
  const topBandViolations = topBandClearanceViolations(scene);
  const topBandGaps = topBandViolations.map((v) => v.gap);
  check(
    `top_band_clearance_probe (S7-P4 §9 P0 pkt 1): każde światło pasa górnego bbox-do-bbox ≥ TOP_LEVEL_FIELD_CLEARANCE=${TOP_LEVEL_FIELD_CLEARANCE}`,
    allTopBandFieldsClearance(scene),
    topBandViolations.length === 0
      ? `zero naruszeń (kontrakt=${TOP_LEVEL_FIELD_CLEARANCE})`
      : `naruszenia=${topBandViolations.length} min=${Math.min(...topBandGaps)} < ${TOP_LEVEL_FIELD_CLEARANCE}`,
  );
  // Test negatywny — dowód, że wyrocznia MIERZY realne światła i próg gryzie:
  // z progiem = (największe zmierzone światło + 1) MUSI pojawić się naruszenie
  // (chyba że pas górny ma <2 pola — wtedy 0 świateł, dowód pusty/pominięty).
  {
    const gaps = topBandClearanceViolations(scene, Number.MAX_SAFE_INTEGER).map((v) => v.gap);
    if (gaps.length > 0) {
      const maxGap = Math.max(...gaps);
      check(
        'top_band_clearance_probe (test negatywny — dowód, że wyrocznia gryzie): próg > największego światła MUSI dać naruszenie',
        topBandClearanceViolations(scene, maxGap + 1).length > 0,
      );
    }
  }

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

// -- KD-11 identity_label_probe: tożsamość elementów NIE znika i NIE koliduje -
// Rysunek techniczny bez tożsamości (nazwa stacji/transformatora, napięcie
// szyny/sekcji, oznaczenie pola, nazwa źródła) nie mówi, CO przedstawia —
// regresja użytkowa z odbioru KD-8 („Ukryto 35 opisów" na rozwiniętym GPZ).
// Wyrocznia sprawdza PLAN RENDERU (`canvas/labelLegibility.ts`) na sieci
// referencyjnej, w skalach, przy których dany LOD jest AKTYWNY w kamerze
// produkcyjnej (progi + histereza `canvas/camera.ts`): (a) żadna etykieta
// tożsamości nie jest porzucona, (b) zero nachodzeń etykieta↔etykieta,
// (c) zero nachodzeń etykieta↔rysunek (symbol/tor).
line('');
line('=== identity_label_probe (KD-11: tożsamość na rysunku, bez kolizji) ===');
{
  const SKALE_PRODUKCYJNE = {
    0: [0.51, 0.68],
    1: [0.51, 0.69, 1.02, 1.38],
    2: [1.02, 1.38, 2],
  };
  for (const lod of LODS) {
    const scene = buildSceneV3(enm, lod);
    const obstacles = sceneObstacleRects(scene);
    const tozsamosci = scene.labels.filter((l) => l.labelRole === 'tozsamosc').length;
    check(
      `identity_label_probe (KD-11) L${lod}: scena niesie etykiety tożsamości i KAŻDA ma zadeklarowaną stronę kotwicy`,
      tozsamosci > 0 &&
        scene.labels.every((l) => l.labelRole !== 'tozsamosc' || l.placement !== undefined),
      `${tozsamosci} etykiet tożsamości`,
    );
    for (const scale of SKALE_PRODUKCYJNE[lod]) {
      const plan = planSceneLabels(scene.labels, obstacles, scale);
      const narysowaneTozsamosci = plan.drawn.filter((p) => p.label.labelRole === 'tozsamosc').length;
      check(
        `identity_label_probe (KD-11) L${lod} @ ${scale}: 0 porzuconych tożsamości`,
        plan.droppedIdentity.length === 0,
        `${narysowaneTozsamosci}/${tozsamosci} narysowanych, porzucone: ${plan.droppedIdentity
          .slice(0, 3)
          .map((l) => l.text)
          .join(', ')}`,
      );
      const pary = plannedLabelCollisions(plan);
      check(
        `identity_label_probe (KD-11) L${lod} @ ${scale}: 0 nachodzeń etykieta↔etykieta`,
        pary.length === 0,
        `${pary.length} par`,
      );
      const naRysunku = plannedLabelObstacleCollisions(plan, obstacles);
      check(
        `identity_label_probe (KD-11) L${lod} @ ${scale}: 0 nachodzeń etykieta↔rysunek (symbol/tor)`,
        naRysunku.length === 0,
        `${naRysunku.length} etykiet`,
      );
      check(
        `identity_label_probe (KD-11) L${lod} @ ${scale}: licznik „Ukryto N opisów" liczy WYŁĄCZNIE dane szczegółowe`,
        plan.hiddenDetail.every((l) => l.labelRole === 'dane'),
        `${plan.hiddenDetail.length} ukrytych opisów`,
      );
    }
  }
  // Negatyw obowiązkowy: wyrocznia kolizji MUSI gryźć na planie sfabrykowanym.
  const scene = buildSceneV3(enm, 2);
  const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), 1.02);
  const sabotaz = {
    ...plan,
    drawn: [plan.drawn[0], { ...plan.drawn[1], rect: { ...plan.drawn[0].rect } }],
  };
  check(
    'identity_label_probe (test negatywny — dowód, że wyrocznia gryzie): dwie etykiety w TYM SAMYM prostokącie MUSZĄ dać FAIL',
    plannedLabelCollisions(sabotaz).length > 0,
  );
}

// -- S9-7 screen_text_floor_probe: ŻADEN napis nie schodzi poniżej 8 px EKRANU
// Audyt C-4 zmierzył na L0 sieci dużej 114 ze 165 napisów o wysokości 2 px
// (znaczniki stref, podziałka, opis GPZ). Sonda pilnuje OBU rodzin napisów:
// (a) TREŚCI RYSUNKU — plan etykiet sceny (`canvas/labelLegibility.ts`) na
//     KAŻDYM poziomie szczegółu i przy skalach od dolnego krańca kamery
//     (`MIN_SCALE`) po górny (`MAX_SCALE`): albo napis jest czytelny, albo go
//     nie ma (jest wtedy policzony jako ukryty/porzucony);
// (b) APARATU ARKUSZA — ramka, znaczniki stref, podziałka, poziom szczegółu,
//     legenda (`sheet/Frame.tsx`): rozmiar STAŁY na ekranie, więc próg musi
//     trzymać przy dowolnej skali z definicji (`screenFixedFontSize`).
line('');
line('=== screen_text_floor_probe (S9-7, C-4: zero napisów < 8 px ekranu) ===');
{
  // Skale: dolny kraniec kamery, wpasowanie sieci dużej, 1:1, górny kraniec.
  const SKALE_EKRANOWE = [MIN_SCALE, 0.13, 1, MAX_SCALE];
  for (const lod of LODS) {
    const scene = buildSceneV3(enm, lod);
    const obstacles = sceneObstacleRects(scene);
    for (const scale of SKALE_EKRANOWE) {
      const plan = planSceneLabels(scene.labels, obstacles, scale);
      const ponizej = plannedLabelsBelowScreenFloor(plan, scale, MIN_TEXT_SCREEN_PX);
      check(
        `screen_text_floor_probe (S9-7, treść rysunku) L${lod} @ ${scale}: 0 narysowanych napisów < ${MIN_TEXT_SCREEN_PX} px ekranu`,
        ponizej.length === 0,
        `narysowanych=${plan.drawn.length} poniżej=${ponizej.length}` +
          (ponizej.length > 0 ? ` np. ${ponizej[0].ownerRef} @${ponizej[0].screenPx.toFixed(2)}px` : '') +
          ` ukrytych=${plan.hiddenDetail.length} porzuconych=${plan.droppedIdentity.length}`,
      );
    }
  }
  // (b) aparat arkusza — rozmiar stały na ekranie dla KAŻDEJ klasy typograficznej,
  // której ramka używa (t1 znaczniki stref, t2 podziałka/poziom, t3 legenda).
  const KLASY_ARKUSZA = ['t1', 't2', 't3'];
  for (const scale of SKALE_EKRANOWE) {
    const najmniejszy = Math.min(
      ...KLASY_ARKUSZA.map((cls) => screenFixedFontSize(cls, scale) * scale),
    );
    check(
      `screen_text_floor_probe (S9-7, aparat arkusza) @ ${scale}: najmniejszy napis ramki ≥ ${MIN_TEXT_SCREEN_PX} px ekranu`,
      najmniejszy >= MIN_TEXT_SCREEN_PX - 1e-9,
      `najmniejszy=${najmniejszy.toFixed(2)}px`,
    );
  }
  // Test negatywny OBOWIĄZKOWY — dowód, że wyrocznia gryzie: plan z pismem
  // wprost poniżej progu MUSI zostać zgłoszony (bez tego sonda mogłaby być
  // zielona dlatego, że nic nie mierzy).
  {
    const scene = buildSceneV3(enm, 2);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), 1);
    const sabotaz = { ...plan, drawn: [{ ...plan.drawn[0], fontSize: 2 }] };
    check(
      'screen_text_floor_probe (test negatywny — dowód, że wyrocznia gryzie): napis 2 px ekranu MUSI dać zgłoszenie',
      plannedLabelsBelowScreenFloor(sabotaz, 1, MIN_TEXT_SCREEN_PX).length === 1,
    );
  }
}

// -- S9-7/S9-8 sheet_grid_probe: siatka odniesienia i hierarchia wag --------
// Znaczniki stref muszą opisywać FORMAT ARKUSZA (kwant `SHEET_WIDTH_QUANTUM`,
// wiersze z `meta.sheetRowBands`), a nie stałą 400 px oderwaną od łamania;
// hierarchia wag toru (§22.4) musi przetrwać KAŻDĄ skalę kamery, nie tylko 1:1.
line('');
line('=== sheet_grid_probe (S9-7 strefy z formatu arkusza) + stroke_rank_probe (S9-8) ===');
{
  for (const lod of LODS) {
    const scene = buildSceneV3(enm, lod);
    const wiersze = sheetRowStationIds(scene).length;
    const pasy = sheetRowBandsOf(scene);
    const dol = pasy.length > 0 ? pasy[pasy.length - 1].y + pasy[pasy.length - 1].height : 0;
    const ciagle = pasy.every((b, i) => i === 0 || Math.abs(b.y - (pasy[i - 1].y + pasy[i - 1].height)) < 1e-9);
    check(
      `sheet_grid_probe (S9-7) L${lod}: pasy stref == wiersze arkusza, rozłączne i pokrywające bbox`,
      pasy.length === wiersze &&
        ciagle &&
        pasy.every((b) => b.height > 0) &&
        Math.abs(pasy[0].y - scene.bbox.y) < 1e-9 &&
        Math.abs(dol - (scene.bbox.y + scene.bbox.height)) < 1e-9,
      `pasów=${pasy.length} wierszy=${wiersze} od=${pasy[0]?.y} do=${dol} bbox=${scene.bbox.y}..${scene.bbox.y + scene.bbox.height}`,
    );
    const kolumn = Math.max(1, Math.ceil((scene.bbox.x + scene.bbox.width) / SHEET_WIDTH_QUANTUM));
    check(
      `sheet_grid_probe (S9-7) L${lod}: kolumn stref liczonych KWANTEM formatu (${SHEET_WIDTH_QUANTUM} px), nie stałą oderwaną od łamania`,
      kolumn >= 1 && kolumn <= 32,
      `kolumn=${kolumn} (dawna stała 400 px dałaby ${Math.ceil((scene.bbox.x + scene.bbox.width) / 400)})`,
    );
  }
  // Hierarchia wag §22.4 na KAŻDEJ skali: wzmocnienie jest jednorodne, więc
  // porządek jest zachowany co do ilorazu — sonda mierzy to wprost.
  const RANGI = ['busGpz', 'bus', 'snTrunk', 'sn', 'lv', 'leader'];
  for (const scale of [MIN_SCALE, 0.13, 0.51, 1, MAX_SCALE]) {
    const wagi = RANGI.map((k) => segmentStrokeWidthForScale(k, scale) * scale);
    const malejaco = wagi.every((w, i) => i === 0 || w < wagi[i - 1]);
    const magistralaCzytelna = segmentStrokeWidthForScale('snTrunk', scale) * scale >= MIN_TRUNK_STROKE_SCREEN_PX - 1e-9;
    check(
      `stroke_rank_probe (S9-8) @ ${scale}: hierarchia wag §22.4 zachowana i magistrala ≥ ${MIN_TRUNK_STROKE_SCREEN_PX} px ekranu`,
      malejaco && magistralaCzytelna,
      `px ekranu: ${RANGI.map((k, i) => `${k}=${wagi[i].toFixed(2)}`).join(' ')}`,
    );
  }
  // Test negatywny — bez wzmocnienia magistrala przy wpasowaniu ma 0,31 px
  // (stan sprzed karty), więc sonda MUSI to wyłapać.
  check(
    'stroke_rank_probe (test negatywny — dowód, że wyrocznia gryzie): waga BEZ wzmocnienia przy skali 0,13 jest poniżej progu',
    SEGMENT_STROKE_WIDTH.snTrunk * 0.13 < MIN_TRUNK_STROKE_SCREEN_PX,
    `bez wzmocnienia=${(SEGMENT_STROKE_WIDTH.snTrunk * 0.13).toFixed(2)}px`,
  );
}

// ---------------------------------------------------------------------------
// KARTA S9-4 — SONDA SIATKOWA TRAFIEŃ (audyt §3.2: P-1 „klik w element w
// większości nic nie zaznacza", P-2 „inspektor nie rozróżnia obiektów",
// P-3 „aparaty rysowane kreską są niekilkalne", P-6 „klik w tło zaznacza").
// ---------------------------------------------------------------------------
//
// METODA (dwa niezależne źródła — inaczej sonda pytałaby modelu o model):
//  - OCZEKIWANIE ze SCENY (`buildCanvasHitAreas`): siatka punktów o kroku
//    1 j.św. po OBRYSIE każdego obiektu; obiektem oczekiwanym jest ten, którego
//    obrys zawiera punkt (przy nałożeniu — malowany najwyżej);
//  - WYNIK z DRZEWA RENDERU: `SldCanvasV3` przepuszczony przez
//    `renderToStaticMarkup`, sparsowany jsdom-em i odczytany przez
//    `hitAreasFromDom`. Obiekt, któremu render nie dał uchwytu, NIE ISTNIEJE w
//    tym zbiorze, więc każdy klik nad nim jest chybieniem (dokładnie stan
//    etykiet przed tą kartą: 0 uchwytów na 1137 etykiet L2).
//
// ILOCZYN CECH (reguła KLASA, NIE INSTANCJA pkt 2): {rodzaj obiektu: symbol
// stacji · aparat pola · transformator · źródło · układ DER · szyna · tor ·
// łącznik wiersza arkusza (S9-1) · etykieta · znacznik wyniku (S9-2)} ×
// {LOD 0/1/2} × {zoom mały/duży}. Zoom sterowany rozmiarem widoku (skala
// kamery = szerokość widoku / szerokość `viewBox`), więc obie skrajności są
// mierzone na TEJ SAMEJ scenie.
line('');
line('=== hit_grid_probe (S9-4): trafienie i tożsamość zaznaczenia ===');
{
  const WIDOKI = [
    { nazwa: 'mały', width: 1322, height: 696 },
    { nazwa: 'duży', width: 13220, height: 6960 },
  ];
  /** Próg odbioru karty S9-4: ≥ 95 % klików nad elementem zaznacza TEN element. */
  const PROG_SKUTECZNOSCI = 0.95;
  /** Minimalny obszar trafienia [px EKRANU] — kryterium KARTY, zapisane tu
   *  LICZBĄ, świadomie NIE importowane z `hitAreas.ts`. Bramka mierząca się
   *  stałą, której pilnuje, nie pilnuje niczego: obniżenie `MIN_HIT_SCREEN_PX`
   *  obniżyłoby jednocześnie cel i miarę (sprawdzone iniekcją 24 → 4: przy
   *  imporcie stałej bramka przechodziła na zielono). */
  const PROG_MIN_PX_EKRANU = 24;
  check(
    `hit_size_probe (S9-4): stała renderu MIN_HIT_SCREEN_PX nie schodzi poniżej progu karty (${PROG_MIN_PX_EKRANU} px)`,
    MIN_HIT_SCREEN_PX >= PROG_MIN_PX_EKRANU,
    `MIN_HIT_SCREEN_PX=${MIN_HIT_SCREEN_PX}`,
  );
  const orientedRefs = orientedSegmentRefs(enm);

  for (const lod of LODS) {
    const scene = buildSceneV3(enm, lod);
    // Warstwa wynikowa WŁĄCZONA — znaczniki S9-2 są obiektami kanwy tak samo
    // jak symbol czy tor, więc podlegają temu samemu minimum i tej samej
    // tożsamości (bez payloadu ta klasa nie byłaby w ogóle zmierzona).
    const rlByRef = buildResultLabelsFromScene(
      scene,
      buildFullResultPayload(scene, orientedRefs, BUS_VOLTAGE_BY_REF, RESULT_REF_BRIDGE),
      new Set(orientedRefs.keys()),
      undefined,
      RESULT_REF_BRIDGE,
    );
    const overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: rlByRef };

    // Tożsamość: każdy obiekt kanwy MUSI mieć własny, niepowtarzalny `testId` —
    // bez tego „TEN element" nie ma sensu, bo dwa obiekty są nieodróżnialne.
    const wszystkieTestId = [
      ...scene.segments.map((s, i) => s.meta?.testId ?? `sld-v3-segment-${i}`),
      ...scene.symbols.map((s, i) => s.meta?.testId ?? `sld-v3-symbol-${i}`),
    ];
    const powtorzone = wszystkieTestId.filter((t, i) => wszystkieTestId.indexOf(t) !== i);
    check(
      `hit_identity_probe (S9-4, P-2) LOD ${lod}: każdy obiekt kanwy ma NIEPOWTARZALNĄ tożsamość (testId)`,
      powtorzone.length === 0,
      powtorzone.length === 0 ? `obiektów=${wszystkieTestId.length}` : `powtórzone=${[...new Set(powtorzone)].join(', ')}`,
    );

    for (const widok of WIDOKI) {
      const markup = renderToStaticMarkup(
        React.createElement(SldCanvasV3, {
          snapshot: enm,
          width: widok.width,
          height: widok.height,
          lodOverride: lod,
          overlay,
          onElementClick: () => {},
          onElementContextMenu: () => {},
          onResultLabelActivate: () => {},
          animateLodTransitions: false,
        }),
      );
      const svg = new JSDOM(`<body>${markup}</body>`).window.document.querySelector('[data-testid="sld-canvas-v3"]');
      const viewBox = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(' ').map(Number);
      const scale = widok.width / viewBox[2];
      const labelPlan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale);
      const layoutWynikow = layoutResultLabels(scene, rlByRef, [], lod);
      const oczekiwane = buildCanvasHitAreas({
        symbols: scene.symbols,
        segments: scene.segments,
        labels: labelPlan.drawn,
        resultMarkers: [
          ...layoutWynikow.placements.map((p, i) => ({
            testId: `sld-v3-result-label-${i}`, ownerRef: p.ownerRef, x: p.x, y: p.y, width: p.width, height: p.height,
          })),
          ...layoutWynikow.aggregates.map((a, i) => ({
            testId: `sld-v3-result-aggregate-${i}`, ownerRef: a.anchorRef, x: a.x, y: a.y, width: a.width, height: a.height,
          })),
        ],
        scale,
      });
      const zDrzewa = hitAreasFromDom(svg);
      const wynik = sondaSiatkowaTrafien(oczekiwane, { scale, trafiane: zDrzewa, minEkranPx: PROG_MIN_PX_EKRANU });
      const etykieta = `LOD ${lod} · zoom ${widok.nazwa} (skala ${scale.toFixed(4)})`;

      // (a) Kolejność warstw uchwytów — bez niej rozszerzenie kradnie klik obrysowi.
      const porzadek = hitLayerOrderingInDom(svg);
      check(
        `hit_layer_order_probe (S9-4) ${etykieta}: wszystkie obszary rozszerzone LEŻĄ POD obrysami rysunku`,
        porzadek !== null && porzadek.poprawna,
        porzadek === null ? 'brak warstwy trafień' : `maks(obszar)=${porzadek.maksZObszaru} < min(obrys)=${porzadek.minZObrysu}`,
      );

      // (b) Nic poza uchwytami nie łapie kliku — napis bez obsługi nie połyka zdarzenia.
      const blokery = pointerBlockersInDom(svg);
      check(
        `hit_blocker_probe (S9-4, P-1/P-3) ${etykieta}: 0 węzłów rysunku łapiących klik poza warstwą trafień`,
        blokery.length === 0,
        blokery.length === 0 ? 'rysunek bierny' : `blokery=${blokery.length}: ${blokery.slice(0, 5).join(', ')}`,
      );

      // (c) Minimum ekranowe na KAŻDYM obiekcie.
      check(
        `hit_size_probe (S9-4) ${etykieta}: każdy obiekt ma obszar trafienia ≥ ${PROG_MIN_PX_EKRANU} px ekranu`,
        wynik.ponizejMinimum.length === 0,
        wynik.ponizejMinimum.length === 0
          ? `obiektów=${oczekiwane.length}`
          : `poniżej=${wynik.ponizejMinimum.length}, np. ${wynik.ponizejMinimum.slice(0, 3).map((o) => `${o.testId}=${o.ekranPx.toFixed(1)}px`).join(', ')}`,
      );

      // (d) KRYTERIUM ODBIORU: ≥ 95 % klików nad elementem zaznacza TEN element.
      check(
        `hit_grid_probe (S9-4, kryterium odbioru) ${etykieta}: ≥ ${(100 * PROG_SKUTECZNOSCI).toFixed(0)} % klików nad elementem zaznacza TEN element`,
        wynik.skutecznosc >= PROG_SKUTECZNOSCI,
        `${(100 * wynik.skutecznosc).toFixed(2)} % (${wynik.trafionych}/${wynik.probek})`
        + (wynik.chybienia.length > 0
          ? ` · pierwsze chybienie: ${wynik.chybienia[0].oczekiwanyTestId} → ${wynik.chybienia[0].otrzymanyTestId ?? 'tło'}`
          : ''),
      );
      line(
        `  hit_grid (${etykieta}) wg rodzaju: `
        + wynik.wgKlas
          .filter((k) => k.obiektow > 0)
          .map((k) => `${k.klasa}=${k.probek > 0 ? ((100 * k.trafionych) / k.probek).toFixed(1) : '—'}%/${k.obiektow}ob.`)
          .join(' '),
      );

      // (e) TEST NEGATYWNY (dowód, że wyrocznia gryzie): usunięcie uchwytów
      //     etykiet z drzewa MUSI zbić skuteczność poniżej progu — to dokładnie
      //     stan sprzed karty S9-4 (napis rysowany, ale nieklikalny).
      if (widok.nazwa === 'mały') {
        const bezEtykiet = zDrzewa.filter((a) => a.klasa !== 'etykieta');
        const wynikBez = sondaSiatkowaTrafien(oczekiwane, { scale, trafiane: bezEtykiet, minEkranPx: PROG_MIN_PX_EKRANU });
        check(
          `hit_grid_probe (test negatywny — dowód, że wyrocznia gryzie) LOD ${lod}: uchwyty etykiet usunięte z drzewa MUSZĄ zbić skuteczność poniżej progu`,
          wynikBez.skutecznosc < PROG_SKUTECZNOSCI,
          `${(100 * wynikBez.skutecznosc).toFixed(2)} % (bez ${zDrzewa.length - bezEtykiet.length} uchwytów etykiet)`,
        );
      }
    }
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
