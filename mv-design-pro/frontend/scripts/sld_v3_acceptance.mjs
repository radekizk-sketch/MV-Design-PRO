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
  allFieldEntryConnectionsReachCableHead,
  allSceneGeometryOnGrid,
  allSceneSegmentEndpointsAnchored,
  allSourcesConnected,
  allSourcesVisible,
  fieldEntryConnectionsReachCableHead,
  labelWireCollisions,
  noBranchWithoutAccent,
  noForbiddenDirectionTokens,
  noLabelWireCollisions,
  noSceneSymbolOverlaps,
  noSymbolWireCollisions,
  sceneSegmentEndpointGaps,
  sourceConnectivityGaps,
  sourceCoverageGaps,
  symbolWireCollisions,
  totalVerticalSegmentLength,
} from '../src/ui/sld/v3/scene/buildScene.ts';
import { overlapProbe } from '../src/ui/sld/v3/layout/labels.ts';
import { fieldSilhouettesAreInjective } from '../src/ui/sld/v3/compose/station.ts';
import { sourceKindSymbolsAreInjective } from '../src/ui/sld/v3/compose/sourceKind.ts';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs.ts';
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
 */
const VERTICAL_LENGTH_BASELINE = { 0: 9656, 1: 38504, 2: 53304 };

/**
 * F9.7 (dług F9.3(b), spec §11.4 `wire_probe` rozszerzony o symbole —
 * `symbolWireCollisions`): fixtura referencyjna niesie 11 ZNANYCH kolizji
 * `branchJunction`↔przewód na L1/L2 (0 na L0), przyczyna geometryczna
 * udokumentowana w `scene/buildScene.ts` (docstring `symbolWireCollisions`)
 * i w teście `scene/__tests__/buildScene.test.ts` — `DESCENT_STRIP_HEIGHT`
 * (16px) nie mieści akcentu węzła (32px) bez nachodzenia na sub-poziom
 * korytarza międzystacyjnego. Naprawa wymaga zmiany wysokości pasm
 * (`layout/bands.ts`), wpływającej na KAŻDY wiersz sceny — poza bezpiecznym
 * zakresem tej fazy bez pełnej rewalidacji renderów (patrz raport). Baseline
 * jest LICZONY i NIEROSNĄCY (jak `vertical_length_probe`), NIE zero-
 * tolerancją — regresja (wzrost / kolizja INNEGO symbolu niż `branchJunction`)
 * MUSI failować.
 */
const SYMBOL_WIRE_COLLISION_BASELINE = { 0: 0, 1: 11, 2: 11 };

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
    const bridging = scene.segments.some((segment) => {
      const xs = segment.points.map((p) => p.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      return minX <= gapStart + GRID && maxX >= gapEnd - GRID;
    });
    if (!bridging) bridgingOk = false;
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

  // -- §12.3 (FIX-1, po recenzji Opusa): kontrakt POŁĄCZENIA kabel↔głowica --
  // Głowice BEZ trasy dotykającej ich portu istnieją WYŁĄCZNIE na fizycznych
  // końcach ciągów (1 magistrala + N laterali) — patrz docstring
  // `fieldEntryConnectionsReachCableHead` (`scene/buildScene.ts`) i
  // `buildScene.test.ts` (dowód empiryczny liczby na tej fixturze).
  const unreachedHeads = fieldEntryConnectionsReachCableHead(scene);
  const expectedDeadEnds = lod === 0 ? 0 : 1 + scene.meta.lateralRunIds.length;
  check(
    'field_entry_probe/kontrakt połączenia (§12.3): głowice bez trasy dotykającej portu == TYLKO fizyczne końce ciągów (1 magistrala + N laterali)',
    unreachedHeads.length === expectedDeadEnds,
    `nieosiągnięte=${unreachedHeads.length} oczekiwane=${expectedDeadEnds}`,
  );
  if (lod === 0) {
    check('field_entry_probe (LOD 0): allFieldEntryConnectionsReachCableHead zielone (GPZ zawsze połączony z magistralą)', allFieldEntryConnectionsReachCableHead(scene));
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

  // -- §11.4 wire_probe rozszerzony o symbole (F9.7, dług F9.3(b)) ----------
  // Baseline LICZONY, NIE zero-tolerancją — patrz SYMBOL_WIRE_COLLISION_BASELINE
  // (nagłówek pliku): 11 ZNANYCH kolizji `branchJunction` na L1/L2, przyczyna
  // udokumentowana w `scene/buildScene.ts` (`symbolWireCollisions` docstring).
  // Regresja (wzrost LICZBY lub kolizja symbolu INNEGO niż `branchJunction`)
  // MUSI failować — to jest twarda bramka na ZMIANĘ stanu, nie na jego istnienie.
  const wireSymbolHits = symbolWireCollisions(scene);
  const wireSymbolBaseline = SYMBOL_WIRE_COLLISION_BASELINE[lod] ?? 0;
  const onlyKnownSymbol = wireSymbolHits.every((h) => h.symbolId === 'branchJunction');
  check(
    `symbol_wire_probe (§11.4/dług F9.3(b)): kolizje symbol↔przewód nie-rosnące względem baseline=${wireSymbolBaseline}, wyłącznie znany typ (branchJunction)`,
    wireSymbolHits.length <= wireSymbolBaseline && onlyKnownSymbol,
    `kolizje=${wireSymbolHits.length} baseline=${wireSymbolBaseline}`,
  );

  // -- §15.1 vertical_length_probe (F9.7, pierwsze wpięcie) ------------------
  const verticalLength = totalVerticalSegmentLength(scene);
  const verticalBaseline = VERTICAL_LENGTH_BASELINE[lod];
  check(
    `vertical_length_probe (§15.1): suma długości pionów nie-rosnąca względem baseline=${verticalBaseline}`,
    verticalLength <= verticalBaseline,
    `wartość=${verticalLength} baseline=${verticalBaseline}`,
  );

  // -- §16/§15.2 ciągłość elektryczna + lod_path_probe -----------------------
  // F9.7: rozszerzone z „WYŁĄCZNIE LOD 2" na WSZYSTKIE LOD (patrz docstring
  // `checkContinuity` — dowód empiryczny, spec §15.2 wymaga tego na L0/L1/L2).
  mainTrunkSignatureByLod[lod] = checkContinuity(scene);
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
