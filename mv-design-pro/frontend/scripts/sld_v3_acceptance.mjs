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
  allSourcesConnected,
  allSourcesVisible,
  fieldEntryConnectionsReachCableHead,
  labelWireCollisions,
  noBranchWithoutAccent,
  noForbiddenDirectionTokens,
  noLabelWireCollisions,
  noSceneSymbolOverlaps,
  sourceConnectivityGaps,
  sourceCoverageGaps,
} from '../src/ui/sld/v3/scene/buildScene.ts';
import { overlapProbe } from '../src/ui/sld/v3/layout/labels.ts';
import { fieldSilhouettesAreInjective } from '../src/ui/sld/v3/compose/station.ts';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs.ts';
import { GRID } from '../src/ui/sld/v3/core/grid.ts';

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

/** §16 (ciągłość elektryczna ciągu głównego) — przeniesione z
 *  `buildScene.test.ts` „ciągłość elektryczna ciągu głównego (spec §16, LOD 2)".
 *  Uruchamiane WYŁĄCZNIE na LOD 2 (jak w teście źródłowym — segmenty/porty
 *  ciągu głównego nie zależą od LOD, ale sekcja E testów źródłowych była
 *  scoped do LOD 2, więc powielamy zakres 1:1, bez rozszerzania ponad to,
 *  co jest udowodnione). */
function checkContinuity(scene) {
  const ids = scene.meta.mainTrunkStationIds;
  const ranges = ids.map((id) => stationXRange(scene, id));
  const allResolved = check(
    '§16: każda stacja ciągu głównego ma symbole w scenie',
    ranges.every((r) => r != null),
    `${ranges.filter((r) => r == null).length} stacji bez symboli`,
  );
  if (!allResolved) return;

  let orderOk = true;
  for (let i = 1; i < ranges.length; i++) {
    if (!(ranges[i - 1].max < ranges[i].min)) orderOk = false;
  }
  check('§16: stacje ciągu głównego narysowane w kolejności topologyRuns[].stationRefs (rosnące X)', orderOk);

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
  check('§16: każda para kolejnych stacji ciągu głównego ma odcinek mostkujący przerwę', bridgingOk);

  const firstRange = ranges[0];
  const connectedToGpz = scene.segments.some((segment) => {
    const xs = segment.points.map((p) => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    return minX < firstRange.min && maxX <= firstRange.max + GRID;
  });
  check('§16: GPZ połączony z pierwszą stacją ciągu głównego (trasa na lewo od niej)', connectedToGpz);

  check(
    '§16: węzły routingu (junctions/crossings) istnieją dla ciągu głównego z lateralami',
    scene.junctions.length + scene.crossings.length > 0,
  );
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

  // -- determinizm (dwa wywołania → identyczny JSON) -------------------------
  const sceneAgain = buildSceneV3(enm, lod);
  check('determinizm: buildSceneV3(enm, lod) wywołane dwukrotnie daje identyczny JSON.stringify', JSON.stringify(scene) === JSON.stringify(sceneAgain));

  // -- §16 ciągłość elektryczna (scoped do LOD 2, jak test źródłowy) --------
  if (lod === 2) {
    checkContinuity(scene);
  }
}

line('');
line(anyFail ? '=== WYNIK: FAIL — patrz [FAIL] powyżej ===' : '=== WYNIK: ALL PASS ===');

console.log(out.join('\n'));

process.exitCode = anyFail ? 1 : 0;
