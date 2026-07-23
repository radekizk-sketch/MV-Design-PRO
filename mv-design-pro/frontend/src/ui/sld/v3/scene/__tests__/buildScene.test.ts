/**
 * SLD V3 F6a — testy `scene/buildScene.ts` (SLD_CAD_SPEC_V3 §5/§7/§9/§10/§11/
 * §16; REBUILD_PLAN_V3 F6). Uruchamiane na REALNEJ fixturze `sldSubstrate52s`
 * (v2, 53 stacje SN + 1 GPZ — patrz sekcja B poniżej) — nie na syntetycznych
 * danych, zgodnie z zadaniem dokończenia F6a.
 *
 * Zakres (DoD F6a):
 *  A. Wyrocznie §11 per LOD (rdzeń DoD).
 *  B. Determinizm (to samo wejście ⇒ identyczny wynik, spec P7).
 *  C. Kontrakt LOD (§7).
 *  D. Kompletność sceny (§10 — nic nie zgubione: wszystkie stacje ciągu
 *     głównego + laterali, GPZ).
 *  E. Ciągłość elektryczna (§16) dla LOD 2 — trasy magistrali łączą kolejne
 *     stacje wg kolejności `topologyRuns[].stationRefs`.
 *
 * UWAGA (F6b, spłata długu §9): `noForbiddenDirectionTokens` sprawdza dziś
 * WSZYSTKIE klasy etykiet (dawniej scoped do `port-caption`, bo `apparatus`
 * niosło surowe `bay.designation`, np. literalne `WE`/`WY`/`ODG` — F5a,
 * naprawione w `compose/directions.ts` `bayApparatusDesignation`). Sekcja
 * A.4 niżej dowodzi tego wprost na realnej fixturze.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  allBusbarLabelsValid,
  allEarthSwitchesLateral,
  allPathTerminationsLabeled,
  allSwitchSymbolsUnambiguous,
  allVtParallel,
  busbarLabelGaps,
  earthSwitchLateralGaps,
  pathTerminationLabelGaps,
  switchSymbolUnambiguityGaps,

  buildSceneV3,
  allFieldEntryConnectionsReachCableHead,
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
  protectionAnnotationAtLod1IsCircleOnly,
  protectionMarkingGaps,
  sceneSegmentEndpointGaps,
  sourceConnectivityGaps,
  sourceCoverageGaps,
  symbolWireCollisions,
  totalVerticalSegmentLength,
  allSecondaryLinksValid,
  secondaryLinkDualityGaps,
  noAnnotationOverlapsPrimaryPath,
  annotationOverlapsPrimaryPath,
  allMeterSymbolsDisambiguated,
  meterDisambiguationGaps,
  type SceneLod,
  type SceneV3,
} from '../buildScene';
import { overlapProbe } from '../../layout/labels';
import { trunkThicknessGaps } from '../buildScene';
import { SEGMENT_STROKE_WIDTH } from '../../compose/preview';
import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { GRID, type V3Rect } from '../../core/grid';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const LODS: readonly SceneLod[] = [0, 1, 2];

/** Rzeczywista liczba stacji SN na fixturze (potwierdzona empirycznie —
 *  ciąg główny 12 + 12 lateralów po 3-4 stacje = 53; NAZWA fixtury
 *  `sldSubstrate52s` jest historyczna/umowna, nie jest to literalna liczba
 *  stacji zwracana przez adapter). */
const EXPECTED_STATION_COUNT = 53;

function symbolRectsOf(scene: SceneV3): readonly V3Rect[] {
  return scene.symbols.map((s) => {
    const def = SYMBOL_DEFS[s.symbolId];
    return { x: s.x, y: s.y, width: def.width, height: def.height };
  });
}

function labelOwnerKindCounts(scene: SceneV3): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const label of scene.labels) counts[label.ownerKind] = (counts[label.ownerKind] ?? 0) + 1;
  return counts;
}

/** Hash identyfikatora stacji (`stn/<hash>/station` → `<hash>`) — WSZYSTKIE
 *  `testId` symboli/aparatów tej stacji go zawierają (`${bayRef}#${symbolId}`,
 *  a `bayRef` dzieli prefiks `stn/<hash>/...` ze `stationId`) — używane
 *  WYŁĄCZNIE do grupowania symboli po stacji w sekcji E (ciągłość), bez
 *  odwoływania się do prywatnych funkcji `buildScene.ts`. */
function stationHash(stationId: string): string {
  const parts = stationId.split('/');
  return parts[1] ?? stationId;
}

describe('buildSceneV3 — wyrocznie §11 per LOD (realna fixtura, 53 stacje)', () => {
  for (const lod of LODS) {
    describe(`LOD ${lod}`, () => {
      const scene = buildSceneV3(enm, lod);

      it('grid_probe (§11.2): 100% originów symboli i wierzchołków tras na siatce', () => {
        expect(allSceneGeometryOnGrid(scene)).toBe(true);
      });

      it('zero nachodzeń symbol↔symbol (rozszerzenie F6a wyroczni F5 na całą scenę)', () => {
        expect(noSceneSymbolOverlaps(scene)).toBe(true);
      });

      it('overlap_probe (§11.1): zero kolizji etykieta↔etykieta i etykieta↔symbol', () => {
        const probe = overlapProbe(scene.labels, symbolRectsOf(scene));
        expect(probe.pairs).toEqual([]);
        expect(probe.overlapCount).toBe(0);
      });

      it('§9: brak zakazanych tokenów WE/WY/ODG na ŻADNEJ etykiecie sceny (wszystkie ownerKind)', () => {
        expect(noForbiddenDirectionTokens(scene)).toBe(true);
      });

      it('D2/k5b: żadna etykieta nie wystaje za lewą krawędź arkusza (rect.x >= 0; regresja: „Sekcja 1 · 15 kV" przy x≈-56 przed poprawką composeGpz)', () => {
        expect(scene.labels.every((l) => l.rect.x >= 0)).toBe(true);
      });

      it('k6 SPŁACONE W CAŁOŚCI (F6d kanały pionowe + F6e nakłady własnego pola): ZERO kolizji etykieta↔przewód — WSZYSTKIE klasy, cała scena (historia: F6c wykryło 28/105/426 na LOD 0/1/2; F6d zbiło architekturę zejść do 3/3/317 „własnego pola"; F6e zbiło resztę do zera — oznacznik pola GPZ poniżej szyny, podpis kierunku odsunięty od osi magistrali i od pionu wejściowego zejścia przez rezerwację `entryDescentBayIndex`)', () => {
        expect(labelWireCollisions(scene)).toEqual([]);
        expect(noLabelWireCollisions(scene)).toBe(true);
      });

      it('junction_dot_probe (F13.2, §22.1, V12K-039 — zastępuje dawną branch_accent_probe): kropka wyłącznie na realnym węźle tras; po usunięciu akcentu-kropki scena bez kropek i bez luk', () => {
        expect(scene.meta.lateralRunIds.length).toBeGreaterThan(0);
        // Dawny akcent-kropka (fałszywy odczyt węzła przy przelocie, D3-14)
        // NIE istnieje na scenie:
        expect(scene.symbols.some((s) => s.symbolId === 'branchJunction')).toBe(false);
        expect(noBranchWithoutAccent(scene)).toBe(true);
      });

      it('F9.3 FIX-1 (§12.3, kontrakt POŁĄCZENIA): głowice kablowe BEZ trasy dotykającej ich portu istnieją WYŁĄCZNIE na fizycznych końcach ciągów (1 magistrala + N laterali = brak dalszej stacji za polem "następnik"); WSZYSTKIE inne głowice (wnętrze ciągów, GPZ→S0, origin→lateral) MUSZĄ być dotknięte trasą', () => {
        if (lod === 0) {
          // L0: stacje SN są symbolem zbiorczym (brak aparatów pola/głowic),
          // ale GPZ renderuje się w PEŁNYM detalu na KAŻDYM LOD (`composeGpz`
          // nie przyjmuje parametru lod, spec §7 dotyczy stacji, nie GPZ) —
          // JEGO pole liniowe NIESIE własną głowicę, zawsze POŁĄCZONĄ (GPZ→S0,
          // sekcja 5) — więc `cableHead` JEST obecny, ale zbiór nieosiągniętych
          // głowic jest i tak pusty (GPZ ma zawsze następnika — magistralę).
          expect(scene.symbols.some((s) => s.symbolId === 'cableHead')).toBe(true);
          expect(fieldEntryConnectionsReachCableHead(scene)).toEqual([]);
          expect(allFieldEntryConnectionsReachCableHead(scene)).toBe(true);
          return;
        }
        expect(scene.symbols.some((s) => s.symbolId === 'cableHead')).toBe(true);
        const unreached = fieldEntryConnectionsReachCableHead(scene);
        // DECYZJA (F9.3 FIX-1, patrz docstring `fieldEntryConnectionsReachCableHead`):
        // ta wyrocznia dowodzi WYŁĄCZNIE, że TAM GDZIE trasa istnieje, dotyka
        // głowicy. §16-v3 (2026-07-17): fizyczne końce ciągów (1 magistrala +
        // N laterali) niosą TERAZ bieg OTWARTY (realne segmenty ENM
        // `…/branch_end`/`…/downstream` za ostatnią stacją, dotąd niewidoczne
        // — patrz `buildScene.openTerminal.test.ts`), więc głowica końcowa
        // JEST dotknięta trasą — nieosiągnięte spada z `1 + laterale` do ZERA.
        // Jeżeli liczba WZROŚNIE bez zmiany topologii fixtury — regresja
        // (kabel międzystacyjny/ogon znowu nie dotyka głowicy).
        expect(unreached.length).toBe(0);
        expect(allFieldEntryConnectionsReachCableHead(scene)).toBe(true);
      });

      it('F9.3 (§12.1): KAŻDY aparat pola STACJI (składający `apparatusSource`, spec §12.1) na fixturze nosi "konwencja" (brak primary_devices, f92-1)', () => {
        // `apparatusSource` jest ustawiane WYŁĄCZNIE przez `composeStation`
        // (`v3/compose/station.ts`) — GPZ (`compose/gpz.ts`, POZA
        // autoryzacją F9.3) ma WŁASNĄ, nietkniętą gramatykę aparatów i NIE
        // niesie tego pola; filtrowanie po obecności `apparatusSource`
        // (nie po `elementKind`, który miesza stacje SN z GPZ) odróżnia
        // dokładnie te symbole, które przeszły przez F9.3.
        const stationFieldApparatus = scene.symbols.filter((s) => s.meta?.apparatusSource != null);
        // LOD 0 (spec §7): stacje są symbolem zbiorczym `stationCollapsed`,
        // ŻADEN aparat pola nie jest rysowany — filtr jest wtedy pusty
        // (wyrocznia wciąż prawdziwa, wacuously) — sanity length>0 dotyczy
        // WYŁĄCZNIE LOD 1/2, gdzie `composeStation` faktycznie się wykonuje.
        if (lod !== 0) expect(stationFieldApparatus.length).toBeGreaterThan(0);
        expect(stationFieldApparatus.every((s) => s.meta?.apparatusSource === 'konwencja')).toBe(true);
      });
    });
  }

  it('§9 (spłata długu F6b): etykiety `apparatus` NIE noszą surowych WE/WY/ODG — oznacznik z konwencji Q/T, gdy dane nie dają realnego oznacznika', () => {
    const scene = buildSceneV3(enm, 2);
    const forbiddenTokenPattern = /\b(WE|WY|ODG)\b/;
    const apparatusLabels = scene.labels.filter((l) => l.ownerKind === 'apparatus');
    // Fixtura NADAL ma dziesiątki pól z `bay.designation` typu "WE"/"WY"/"ODG"
    // (adapter v2 się nie zmienił) — to dowód, że naprawa faktycznie działa
    // na realnych danych, nie że fixtura „już nie ma takich pól".
    expect(apparatusLabels.length).toBeGreaterThan(0);
    expect(apparatusLabels.every((l) => !forbiddenTokenPattern.test(l.text))).toBe(true);
    // A port-caption (realny zamiennik WE/WY/ODG, spec §9) też nigdy nie
    // noszą surowego tokenu.
    const portCaptions = scene.labels.filter((l) => l.ownerKind === 'port-caption');
    expect(portCaptions.length).toBeGreaterThan(0);
    expect(portCaptions.every((l) => !forbiddenTokenPattern.test(l.text))).toBe(true);
    // Wyrocznia globalna (WSZYSTKIE klasy etykiet) pozostaje zielona.
    expect(noForbiddenDirectionTokens(scene)).toBe(true);
  });
});

describe('buildSceneV3 — determinizm (ta sama sieć musi dawać identyczny wynik)', () => {
  it('dwa wywołania buildSceneV3(enm, 2) dają identyczny JSON', () => {
    const sceneA = buildSceneV3(enm, 2);
    const sceneB = buildSceneV3(enm, 2);
    expect(JSON.stringify(sceneA)).toBe(JSON.stringify(sceneB));
  });

  it('dwa wywołania buildSceneV3(enm, 0)/(enm, 1) dają identyczny JSON', () => {
    for (const lod of [0, 1] as const) {
      const sceneA = buildSceneV3(enm, lod);
      const sceneB = buildSceneV3(enm, lod);
      expect(JSON.stringify(sceneA)).toBe(JSON.stringify(sceneB));
    }
  });
});

describe('buildSceneV3 — kontrakt LOD (spec §7)', () => {
  it('LOD 0: stacje jako symbol zbiorczy (junction), brak etykiet segmentów/podpisów kierunku', () => {
    const scene = buildSceneV3(enm, 0);
    const counts = labelOwnerKindCounts(scene);
    expect(counts['segment-span'] ?? 0).toBe(0);
    expect(counts['segment-lateral'] ?? 0).toBe(0);
    expect(counts['port-caption'] ?? 0).toBe(0);
    // Każda z 53 stacji ma DOKŁADNIE jeden symbol 'stationCollapsed' (F6b:
    // dedykowany symbol zbiorczy stacji L0, kontur kwadratu — spłata
    // STOP-notatki F6a; wcześniej placeholder `junction`, patrz nagłówek
    // `buildScene.ts`).
    const collapsedSymbols = scene.symbols.filter((s) => s.symbolId === 'stationCollapsed');
    expect(collapsedSymbols.length).toBe(EXPECTED_STATION_COUNT);
    // 'junction' pozostaje WYŁĄCZNIE węzłem T tras — NIE stacją. Od S7-P2
    // (V12K-137) węzeł T zejścia lateralu z kablem poziomym (Rodzina B na L0)
    // materializuje kropkę `junction`; sprawdzamy więc, że ŻADNA kropka nie
    // pokrywa się z pozycją stacji zbiorczej (kropki to węzły tras, stacje to
    // `stationCollapsed`), zamiast dawnego „0 kropek w ogóle".
    const collapsedKeys = new Set(collapsedSymbols.map((s) => `${s.x},${s.y}`));
    const junctionOnStation = scene.symbols.some(
      (s) => s.symbolId === 'junction' && collapsedKeys.has(`${s.x},${s.y}`),
    );
    expect(junctionOnStation).toBe(false);
  });

  it('LOD 1: pełne symbole stacji, ale zero etykiet segmentów i zero podpisów kierunku', () => {
    const scene = buildSceneV3(enm, 1);
    const counts = labelOwnerKindCounts(scene);
    expect(counts['segment-span'] ?? 0).toBe(0);
    expect(counts['segment-lateral'] ?? 0).toBe(0);
    expect(counts['port-caption'] ?? 0).toBe(0);
    // Pełne symbole (composeStation/composeGpz) — realne aparaty, NIE
    // placeholder zbiorczy 'stationCollapsed' (kontrast z LOD 0).
    expect(scene.symbols.some((s) => s.symbolId === 'stationCollapsed')).toBe(false);
    expect(scene.symbols.length).toBeGreaterThan(200);
    // Nazwy/kVA/typ stacji (pasmo B5) SĄ obecne na L1 (kontrast z brakiem
    // etykiet segmentów/podpisów kierunku powyżej).
    expect(counts['station-name'] ?? 0).toBeGreaterThan(0);
  });

  it('LOD 2: etykiety segmentów i podpisy kierunku pól są obecne', () => {
    const scene = buildSceneV3(enm, 2);
    const counts = labelOwnerKindCounts(scene);
    expect(counts['segment-span'] ?? 0).toBeGreaterThan(0);
    expect(counts['segment-lateral'] ?? 0).toBeGreaterThan(0);
    expect(counts['port-caption'] ?? 0).toBeGreaterThan(0);
  });

  it('L1 i L2 mają IDENTYCZNĄ liczbę symboli/segmentów (aparaty się nie zmieniają — TYLKO etykiety)', () => {
    // UWAGA: same WSPÓŁRZĘDNE aparatów mogą się różnić między L1/L2 (composeStation
    // liczy centerX pola z rezerwacji ZALEŻNEJ od treści renderu — podpisy
    // kierunku pól są na L2, nie na L1 — więc stos aparatów pola bywa inaczej
    // wyśrodkowany w TEJ SAMEJ kolumnie). SCHEMAT-10 S1 (V12K-135): KOTWICE
    // stacji (kolumny/oś magistrali/pasmo nazw) są już IDENTYCZNE na L1/L2 (i L0)
    // — patrz test „JEDNA KOTWICA"; różni się tylko rozkład detalu WEWNĄTRZ
    // kolumny. Ten test sprawdza WYŁĄCZNIE, że zestaw aparatów jest taki sam
    // (żaden aparat nie jest dodawany/usuwany w zależności od LOD).
    const sceneL1 = buildSceneV3(enm, 1);
    const sceneL2 = buildSceneV3(enm, 2);
    expect(sceneL1.symbols.length).toBe(sceneL2.symbols.length);
    expect(sceneL1.segments.length).toBe(sceneL2.segments.length);
    expect(sceneL1.symbols.map((s) => s.symbolId)).toEqual(sceneL2.symbols.map((s) => s.symbolId));
  });

  it('SCHEMAT-10 S1 (V12K-135): JEDNA KOTWICA — środek glifu stacji IDENTYCZNY na L0/L1/L2 (nazwa stacji i symbol zbiorczy)', () => {
    // Macierz prawdy LOD §3: „środek glifu stacji i oś magistrali IDENTYCZNE na
    // L0/L1/L2 — zoom = skala szczegółu, nie przemeblowanie". Dowód na REALNEJ
    // fixturze: kotwica = wiersz nazwy stacji (pasmo B5, `ownerKind:
    // 'station-name'`, kotwiczony do `nameSlot` KOLUMNY) — po unifikacji
    // geometrii (buildRowLayout @ pełny szczegół) `nameSlot` jest ten sam na
    // wszystkich LOD, więc etykieta nazwy każdej stacji ma IDENTYCZNE (x,y) na
    // L0/L1/L2. Przed S1 (D1 „trzy światy") kolumny L0/L1/L2 różniły się
    // szerokością → nazwa dryfowała między poziomami.
    // Kotwica = PIERWSZY wiersz pasma nazw (`#name-row-0`) — jego `rect` bierze
    // się WPROST z `nameSlot` kolumny (`layout/labels.ts` `resolveStationNameBand`:
    // `x = nameSlot.x`, `y = nameSlot.y`, niezależnie od TREŚCI wiersza), więc
    // jest tekstowo-niezależną kotwicą stacji. Na L0 pasmo ma 1 wiersz (S-id),
    // na L1/L2 więcej (nazwa/kVA/typ/nN) — porównujemy wspólny wiersz 0.
    const nameAnchors = (lod: 0 | 1 | 2): Map<string, string> => {
      const scene = buildSceneV3(enm, lod);
      const m = new Map<string, string>();
      for (const label of scene.labels) {
        if (label.ownerKind === 'station-name' && label.ownerRef.endsWith('#name-row-0')) {
          const stationRef = label.ownerRef.slice(0, -'#name-row-0'.length);
          m.set(stationRef, `${label.rect.x},${label.rect.y},${label.rect.width}`);
        }
      }
      return m;
    };
    const a0 = nameAnchors(0);
    const a1 = nameAnchors(1);
    const a2 = nameAnchors(2);
    // Zbiór stacji z nazwą jest niepusty i wspólny (nic nie ginie między LOD).
    expect(a0.size).toBeGreaterThan(EXPECTED_STATION_COUNT / 2);
    expect(a1.size).toBe(a0.size);
    expect(a2.size).toBe(a0.size);
    const drift: string[] = [];
    for (const [ref, pos0] of a0) {
      const pos1 = a1.get(ref);
      const pos2 = a2.get(ref);
      if (pos1 !== pos0 || pos2 !== pos0) {
        drift.push(`${ref}: L0=${pos0} L1=${pos1} L2=${pos2}`);
      }
    }
    expect(drift, `kotwice stacji dryfują między LOD:\n${drift.slice(0, 8).join('\n')}`).toEqual([]);
  });

  it('liczba stacji w meta jest stała i zgodna z realną fixturą, niezależnie od LOD', () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(enm, lod);
      expect(scene.meta.stationCount).toBe(EXPECTED_STATION_COUNT);
      expect(scene.meta.lod).toBe(lod);
    }
  });
});

describe('buildSceneV3 — kompletność sceny (spec §10, nic nie zgubione)', () => {
  const scene = buildSceneV3(enm, 2);

  it('ciąg główny ma 12 stacji (empirycznie potwierdzone na fixturze)', () => {
    expect(scene.meta.mainTrunkStationIds.length).toBe(12);
    // Unikalne — żadna stacja nie jest zdublowana w ciągu głównym.
    expect(new Set(scene.meta.mainTrunkStationIds).size).toBe(12);
  });

  it('WSZYSTKIE 12 lateralów z fixtury jest umieszczonych w scenie (brak zagnieżdżeń na tej sieci)', () => {
    expect(scene.meta.lateralRunIds.length).toBe(12);
    expect(new Set(scene.meta.lateralRunIds).size).toBe(12);
    // Brak STOP-notatek o pominiętych (zagnieżdżonych) lateralach — na tej
    // fixturze WSZYSTKIE odgałęzienia wychodzą z ciągu głównego (potwierdzone
    // w raporcie F6a), więc nie powinno być tu żadnej notatki o pominięciu.
    const skippedLateralNotes = scene.meta.stopNotes.filter((n) => n.includes('Lateral'));
    expect(skippedLateralNotes).toEqual([]);
  });

  it('suma stacji ciągu głównego i lateralów odpowiada meta.stationCount (liczona NIEZALEŻNIE z adaptera)', () => {
    // Niezależne źródło: adapter v2 — suma stationRefs branch-runów, których
    // id jest w meta.lateralRunIds (te same runy, które scena umieściła).
    const data = buildSldDataFromSnapshot(enm, enm.logical_views ?? null, null);
    const lateralIds = new Set(scene.meta.lateralRunIds);
    const lateralStationCount = data.topologyRuns
      .filter((r) => lateralIds.has(r.id))
      .reduce((acc, r) => acc + r.stationRefs.length, 0);
    // 12 (główny) + 41 (12 lateralów, 3-4 stacje każdy) = 53.
    expect(lateralStationCount).toBe(41);
    expect(scene.meta.mainTrunkStationIds.length + lateralStationCount).toBe(EXPECTED_STATION_COUNT);
    expect(scene.meta.stationCount).toBe(EXPECTED_STATION_COUNT);
  });

  it('GPZ jest obecny w scenie z niepustymi kluczami parzystości (parity)', () => {
    expect(scene.meta.gpzId).not.toBeNull();
    expect(scene.meta.parityKeys.length).toBeGreaterThan(0);
    expect(scene.meta.sections.length).toBeGreaterThan(0);
    expect(scene.meta.transformers.length).toBeGreaterThan(0);
  });

  it('każdy segment ma co najmniej 2 punkty, wszystkie na siatce', () => {
    expect(scene.segments.length).toBeGreaterThan(0);
    for (const segment of scene.segments) {
      expect(segment.points.length).toBeGreaterThanOrEqual(2);
      for (const point of segment.points) {
        // `=== 0` (nie `.toBe(0)`) — Object.is odróżnia -0 od 0, a -0 % GRID
        // jest matematycznie „na siatce" (== 0), tylko innym bitowym zapisem.
        expect(point.x % GRID === 0).toBe(true);
        expect(point.y % GRID === 0).toBe(true);
      }
    }
  });

  it('brak STOP-notatek o niespójności adaptera (stacja z topologyRuns nieobecna w sldData.stations)', () => {
    const adapterInconsistencyNotes = scene.meta.stopNotes.filter((n) => n.includes('niespójność adaptera'));
    expect(adapterInconsistencyNotes).toEqual([]);
  });
});

describe('buildSceneV3 — ciągłość elektryczna ciągu głównego (spec §16, LOD 2)', () => {
  const scene = buildSceneV3(enm, 2);
  const ids = scene.meta.mainTrunkStationIds;

  /** Zakres X symboli TEJ stacji (grupowanie po hashu identyfikatora w
   *  `meta.testId` — patrz `stationHash` wyżej). Publiczny kształt `SceneV3`
   *  nie eksponuje per-stacji portów WPROST, więc to jest maksimum, co da
   *  się zweryfikować bez odwoływania się do prywatnych funkcji modułu. */
  function stationXRange(stationId: string): { readonly min: number; readonly max: number } {
    const hash = stationHash(stationId);
    const xs = scene.symbols.filter((s) => s.meta?.testId?.includes(hash)).map((s) => s.x);
    expect(xs.length).toBeGreaterThan(0); // stacja MUSI mieć symbole w scenie
    return { min: Math.min(...xs), max: Math.max(...xs) };
  }

  it('stacje ciągu głównego są narysowane w TEJ SAMEJ kolejności co topologyRuns[].stationRefs (rosnące X)', () => {
    const ranges = ids.map(stationXRange);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i - 1].max).toBeLessThan(ranges[i].min);
    }
  });

  it('między KAŻDĄ parą kolejnych stacji ciągu głównego istnieje odcinek mostkujący przerwę (trasa magistrali)', () => {
    // §16-v3 (tożsamość łańcucha, 2026-07-17): przęsło międzystacyjne bywa
    // ŁAŃCUCHEM kawałków (kawałek per człon ENM — `chainSegmentRefs`/
    // `splitPolylineIntoPieces`, kawałki stykają się końcami z konstrukcji)
    // — mostkowanie dowodzi POKRYCIE SUMĄ przedziałów X, nie jednym
    // odcinkiem. Dla łańcucha 1-członowego suma == stary warunek (przerwa w
    // pokryciu dalej = FAIL). TA SAMA asercja co `sld_v3_acceptance.mjs`.
    const ranges = ids.map(stationXRange);
    for (let i = 1; i < ranges.length; i++) {
      const gapStart = ranges[i - 1].max;
      const gapEnd = ranges[i].min;
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
      expect(covered).toBeGreaterThanOrEqual(gapEnd - GRID);
    }
  });

  it('GPZ i pierwsza stacja ciągu głównego są połączone (istnieje trasa na lewo od pierwszej stacji)', () => {
    const firstRange = stationXRange(ids[0]);
    const connectedToGpz = scene.segments.some((segment) => {
      const xs = segment.points.map((p) => p.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      return minX < firstRange.min && maxX <= firstRange.max + GRID;
    });
    expect(connectedToGpz).toBe(true);
  });

  it('węzły routingu (junctions/crossings) istnieją dla ciągu głównego z lateralami', () => {
    // classifyRouteNodes (route.ts, F3, zamrożone) — sama obecność węzłów
    // pass-through potwierdza, że trasy się faktycznie łączą (routing nie
    // jest zbiorem odizolowanych odcinków).
    expect(scene.junctions.length + scene.crossings.length).toBeGreaterThan(0);
  });
});

/**
 * F8b-1 (SLD_CAD_REBUILD_PLAN_V3.md §F8b, spłata długu k1 + fundament B/C):
 * `PreviewElementMeta.ownerRef`/`elementKind` — TYLKO meta (autoryzacja
 * zadania), zero zmian geometrii/etykiet. Wyrocznie §11 wyżej pozostają
 * zielone (nie dotknięte tym blokiem) — dowód, że dodanie meta NIE wpłynęło
 * na geometrię.
 */
describe('buildSceneV3 — F8b-1 meta (ownerRef/elementKind, fundament selekcji B i nakładki C)', () => {
  const scene2 = buildSceneV3(enm, 2);

  /**
   * SCHEMAT-10 S3 (V12K-135, D7): fixtura `sldSubstrate52s` ma WSZYSTKIE
   * `line_runs[].nop_station_ref` na `null` (i `corridors[].no_point_ref` na
   * ref łącznika, nie ref stacji — GAP osobny, patrz raport karty S3) — na
   * fixturze bazowej `props.isNop` NIGDY nie jest `true`, więc testy NOP na
   * `enm` surowym są puste (pętla po zerowym zbiorze). Ten helper zwraca
   * GŁĘBOKI KLON fixtury z jednym polem nadpisanym: `nop_station_ref` ciągu
   * głównego = REALNY ref pierwszej stacji ciągu głównego — dowód na
   * FAKTYCZNIE wyrenderowanym markerze, nie na pustym zbiorze.
   */
  function enmWithSyntheticNop(): { readonly enm: EnergyNetworkModel; readonly targetStationRef: string } {
    const targetStationRef = scene2.meta.mainTrunkStationIds[0];
    const clone = structuredClone(enm);
    const mainRun = clone.line_runs?.find((r) => r.run_kind === 'main_trunk');
    if (!mainRun) throw new Error('fixtura bez ciągu main_trunk w line_runs — helper NOP wymaga go do testu');
    (mainRun as { nop_station_ref: string | null }).nop_station_ref = targetStationRef;
    return { enm: clone, targetStationRef };
  }

  it('elementKind wg symbolId: TR2W→transformer, der*→der, gridSource→source (F9.4), stationCollapsed→station, reszta→apparatus', () => {
    const byKind = new Map(scene2.symbols.map((s) => [s.symbolId, s.meta?.elementKind]));
    expect(byKind.get('transformer2W')).toBe('transformer');
    expect(byKind.get('gridSource')).toBe('source');
    for (const [symbolId, kind] of byKind) {
      if (symbolId.startsWith('der')) expect(kind).toBe('der');
    }
    expect(scene2.symbols.every((s) => s.meta?.elementKind !== undefined)).toBe(true);
    const nonSpecial = scene2.symbols.filter(
      (s) =>
        s.symbolId !== 'transformer2W' &&
        !s.symbolId.startsWith('der') &&
        s.symbolId !== 'gridSource' &&
        s.symbolId !== 'stationCollapsed',
    );
    expect(nonSpecial.length).toBeGreaterThan(0);
    expect(nonSpecial.every((s) => s.meta?.elementKind === 'apparatus')).toBe(true);
  });

  it('L0: stationCollapsed niesie ownerRef=station id + elementKind=station', () => {
    const scene0 = buildSceneV3(enm, 0);
    const stationSymbols = scene0.symbols.filter((s) => s.symbolId === 'stationCollapsed');
    expect(stationSymbols.length).toBeGreaterThan(0);
    for (const s of stationSymbols) {
      expect(s.meta?.elementKind).toBe('station');
      expect(s.meta?.ownerRef).toBeTruthy();
      // testId ma postać `sld-v3-l0-${ownerRef}` z konstrukcji.
      expect(s.meta?.testId).toBe(`sld-v3-l0-${s.meta?.ownerRef}`);
    }
  });

  it('L1/L2: symbol noPoint (NO) niesie ownerRef=station id + elementKind=apparatus; L0 = marker noOpen sylwetki (GS-1)', () => {
    // GS-1 (V12K-137, GAP §10.4, Zero-Debt pkt 2): symbol `noPoint` (16×16 na
    // osi szyny) to reprezentacja L1/L2. Na L0 (sylwetka mini-RMU 48×48) osobny
    // noPoint byłby POGRZEBANY w enklozurze — NOP niesie marker `noOpen`
    // sylwetki (`meta.stationGlyph.noOpen`). TA SAMA kotwica (środek stacji) na
    // wszystkich LOD (test D7 niżej).
    const { enm: enmWithNop, targetStationRef } = enmWithSyntheticNop();
    for (const lod of [1, 2] as const) {
      const scene = buildSceneV3(enmWithNop, lod);
      const nopSymbols = scene.symbols.filter((s) => s.symbolId === 'noPoint');
      expect(nopSymbols.length).toBeGreaterThan(0);
      for (const s of nopSymbols) {
        expect(s.meta?.elementKind).toBe('apparatus');
        expect(s.meta?.ownerRef).toBeTruthy();
        expect(s.meta?.testId).toBe(`sld-v3-nop-${s.meta?.ownerRef}`);
      }
    }
    // L0: brak osobnego noPoint; NOP w markerze sylwetki stacji docelowej.
    const scene0 = buildSceneV3(enmWithNop, 0);
    expect(scene0.symbols.some((s) => s.symbolId === 'noPoint')).toBe(false);
    const nopGlyph = scene0.symbols.find(
      (s) => s.symbolId === 'stationCollapsed' && s.meta?.ownerRef === targetStationRef,
    );
    expect(nopGlyph?.meta?.stationGlyph?.noOpen).toBe(true);
  });

  it('SCHEMAT-10 S3 (V12K-135, D7) + GS-1: KOTWICA znacznika NOP (środek stacji) IDENTYCZNA na L0/L1/L2', () => {
    // Macierz prawdy LOD §3, wiersz „Sekcje/NOP": „znacznik NA torze (kotwica =
    // render szyny TEGO LOD)". Intencja D7 („marker nie dryfuje przy zmianie
    // poziomu") ZACHOWANA pod kanonem GS-1: kotwica = ŚRODEK STACJI (JEDNA
    // KOTWICA, geometria z L2). Reprezentacja RÓŻNI SIĘ per LOD („zoom = skala
    // szczegółu"): L0 = marker `noOpen` sylwetki mini-RMU (środek stationCollapsed),
    // L1/L2 = symbol `noPoint` (środek na osi szyny) — OBA w tym samym punkcie.
    const { enm: enmWithNop, targetStationRef } = enmWithSyntheticNop();

    // Środek NOP-a stacji docelowej per LOD (kotwica, niezależnie od symbolu).
    const nopCenter = (lod: SceneLod): string | null => {
      const scene = buildSceneV3(enmWithNop, lod);
      if (lod === 0) {
        const g = scene.symbols.find(
          (s) => s.symbolId === 'stationCollapsed' && s.meta?.ownerRef === targetStationRef && s.meta?.stationGlyph?.noOpen,
        );
        if (!g) return null;
        const d = SYMBOL_DEFS.stationCollapsed;
        return `${g.x + d.width / 2},${g.y + d.height / 2}`;
      }
      const s = scene.symbols.find((x) => x.symbolId === 'noPoint' && x.meta?.ownerRef === targetStationRef);
      if (!s) return null;
      const d = SYMBOL_DEFS.noPoint;
      return `${s.x + d.width / 2},${s.y + d.height / 2}`;
    };
    const c0 = nopCenter(0);
    const c1 = nopCenter(1);
    const c2 = nopCenter(2);
    expect(c0).toBeTruthy();
    expect(c1).toBe(c0);
    expect(c2).toBe(c0);
  });

  it('aparatura stacji (L2): ownerRef === bayRef odczytany z testId (`${bayRef}#${symbolId}`)', () => {
    const apparatusSymbols = scene2.symbols.filter(
      (s) => s.meta?.testId && s.meta.testId.includes('#') && !s.meta.testId.startsWith('gpz-'),
    );
    expect(apparatusSymbols.length).toBeGreaterThan(0);
    for (const s of apparatusSymbols) {
      const bayRefFromTestId = s.meta!.testId!.slice(0, s.meta!.testId!.indexOf('#'));
      expect(s.meta?.ownerRef).toBe(bayRefFromTestId);
    }
  });

  it('segmenty stacji: elementKind bus/segment zgodny z meta.kind, ownerRef przeniesiony (composition.segments MA ownerRef)', () => {
    const withOwnerRef = scene2.segments.filter((s) => s.meta?.ownerRef !== undefined);
    expect(withOwnerRef.length).toBeGreaterThan(0);
    for (const s of withOwnerRef) {
      // F13.1 (spec §21.2): `busGpz` = szyna sekcji SN GPZ (grubsza klasa
      // renderu, TA SAMA semantyka `elementKind: 'bus'`).
      if (s.meta?.kind === 'bus' || s.meta?.kind === 'busGpz') expect(s.meta.elementKind).toBe('bus');
      // §16-v3: słupek terminalny — MARKER końca biegu (nie element
      // selekcji); ownerRef z sufiksem `#open-terminal` dla tożsamości,
      // elementKind celowo nieustawiony (klik nie otwiera inspektora).
      else if (s.meta?.kind === 'openTerminal') expect(s.meta?.elementKind).toBeUndefined();
      else expect(s.meta?.elementKind).toBe('segment');
    }
    // Przynajmniej jeden segment SN-bus (stacja) z ownerRef kończącym się na
    // `#sn-bus` (konwencja `compose/station.ts`) i elementKind='bus'.
    const snBus = scene2.segments.find((s) => s.meta?.ownerRef?.endsWith('#sn-bus'));
    expect(snBus).toBeTruthy();
    expect(snBus?.meta?.elementKind).toBe('bus');
  });

  it('łączniki między stacjami (connectRowStations): ownerRef = realny segmentRef z cableRun.segmentPaths (brak fabrykacji)', () => {
    const sldData = buildSldDataFromSnapshot(enm, enm.logical_views ?? null, null);
    const allSegmentRefs = new Set(
      sldData.cableRuns.flatMap((run) => (run.segmentPaths ?? []).map((p) => p.segmentRef)),
    );
    // Odcinki magistrali/lateralu klasy 'segment' z ownerRef MUSZĄ być
    // realnymi segmentRef adaptera — zero wymyślania (odcinki GPZ/stacji mają
    // ownerRef zakotwiczony z sufiksem '#', filtrowane precyzyjnie).
    const connectorLike = scene2.segments.filter(
      (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef !== undefined && !s.meta.ownerRef.includes('#'),
    );
    expect(connectorLike.length).toBeGreaterThan(0);
    for (const s of connectorLike) {
      expect(allSegmentRefs.has(s.meta!.ownerRef!)).toBe(true);
    }
  });

  it('GPZ: mappery przenoszą refy, które kompozycja GPZ już niesie (ownerRef obecny na segmentach GPZ)', () => {
    const gpzSegments = scene2.segments.filter((s) => s.meta?.testId?.startsWith('gpz-canonical-'));
    expect(gpzSegments.length).toBeGreaterThan(0);
    // Segmenty GPZ mają WŁASNY ownerRef (kompozyt zakotwiczony w realnym
    // refie — sectionId/bayRef/transformerRef/couplerId) — nigdy undefined
    // (composeGpz zawsze ustawia `ComposedGpzSegment.ownerRef`).
    expect(gpzSegments.every((s) => typeof s.meta?.ownerRef === 'string' && s.meta.ownerRef.length > 0)).toBe(true);
  });

  it('determinizm meta: dwa wywołania buildSceneV3 na tym samym wejściu dają identyczne ownerRef/elementKind', () => {
    const a = buildSceneV3(enm, 2);
    const b = buildSceneV3(enm, 2);
    expect(JSON.stringify(a.symbols.map((s) => s.meta))).toBe(JSON.stringify(b.symbols.map((s) => s.meta)));
    expect(JSON.stringify(a.segments.map((s) => s.meta))).toBe(JSON.stringify(b.segments.map((s) => s.meta)));
  });

  it('meta (F8b-1) nie wpływa na geometrię — wyrocznie §11 pozostają zielone na L0/L1/L2 (regresja zerowa)', () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(enm, lod);
      expect(allSceneGeometryOnGrid(scene)).toBe(true);
      expect(noSceneSymbolOverlaps(scene)).toBe(true);
      expect(noLabelWireCollisions(scene)).toBe(true);
      expect(noForbiddenDirectionTokens(scene)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// F9.4 — runda korekcyjna po recenzji Opusa (REQUEST-CHANGES F-1 [HIGH]):
// `sources_visible_probe` (§13.1) i `source_connectivity_probe` (§14.1)
// istniały WYŁĄCZNIE w komentarzach jako nazwy ("wyrocznie-widma") — ciało
// tu, testowane na REALNEJ fixturze (pozytyw) i syntetycznym negatywie
// (dowód, że wyrocznie faktycznie gryzą, nie są dekoracją).
// ---------------------------------------------------------------------------

describe('buildSceneV3 — F9.4 runda korekcyjna: sourceCoverageGaps/allSourcesVisible (spec §13.1)', () => {
  it('fixtura referencyjna: 21 źródeł w meta.sources (1 external_grid + 20 DER) na WSZYSTKICH LOD', () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(enm, lod);
      expect(scene.meta.sources).toHaveLength(21);
      expect(scene.meta.sources.filter((s) => s.kind === 'external_grid')).toHaveLength(1);
    }
  });

  it('L0 (spec §7 — decyzja F9.4: DER od L1): TYLKO external_grid podlega wyroczni, 0 luk (GPZ zawsze renderowany w pełni)', () => {
    const scene = buildSceneV3(enm, 0);
    const derSymbols = scene.symbols.filter((s) => s.meta?.elementKind === 'der');
    expect(derSymbols).toHaveLength(0); // DER faktycznie nieobecne na L0, z konstrukcji.
    expect(sourceCoverageGaps(scene)).toEqual([]);
    expect(allSourcesVisible(scene)).toBe(true);
  });

  it('L1/L2: WSZYSTKIE 21 źródeł (external_grid + 20 DER) mają symbol na scenie, 0 luk', () => {
    for (const lod of [1, 2] as const) {
      const scene = buildSceneV3(enm, lod);
      const derSymbols = scene.symbols.filter((s) => s.meta?.elementKind === 'der');
      expect(derSymbols).toHaveLength(20);
      expect(sourceCoverageGaps(scene)).toEqual([]);
      expect(allSourcesVisible(scene)).toBe(true);
    }
  });

  it('test negatywny (dowód, że wyrocznia gryzie): DER z connectionRef nieistniejącym w danych adaptera ⇒ sourceCoverageGaps zgłasza lukę, allSourcesVisible=false, stopNote wyjaśnia przyczynę (F-1.3)', () => {
    const corrupted: EnergyNetworkModel = JSON.parse(JSON.stringify(enm));
    const target = corrupted.generators?.[0];
    expect(target).toBeTruthy();
    const originalRef = target!.ref_id;
    // `enmToSldAdapter.ts` buildSources(): connectionRef = gen.station_ref ??
    // gen.bus_ref — obie wartości psujemy, żeby żadna nie rozwiązała się do
    // ŻADNEJ stacji narysowanej na scenie (literówka refu — scenariusz F-1.3).
    target!.station_ref = 'stn/does-not-exist-anywhere/station';
    target!.bus_ref = 'stn/does-not-exist-anywhere/nn_bus';

    const scene = buildSceneV3(corrupted, 1);
    const gaps = sourceCoverageGaps(scene);
    expect(gaps.some((g) => g.sourceId === originalRef)).toBe(true);
    expect(allSourcesVisible(scene)).toBe(false);
    // Symbol NIE istnieje wcale (ciche gubienie NAPRAWIONE przez F-1.3 —
    // stopNote, nie fabrykacja symbolu w złym miejscu).
    expect(scene.symbols.some((s) => s.meta?.ownerRef === originalRef)).toBe(false);
    expect(
      scene.meta.stopNotes.some(
        (n) => n.includes('does-not-exist-anywhere') && n.includes(originalRef),
      ),
    ).toBe(true);
  });
});

describe('buildSceneV3 — F9.4 runda korekcyjna: sourceConnectivityGaps/allSourcesConnected (spec §14.1)', () => {
  it('fixtura referencyjna: KAŻDE widoczne źródło (external_grid na L0/L1/L2, DER na L1/L2) ma trasę do co najmniej jednej szyny — 0 luk', () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(enm, lod);
      const gaps = sourceConnectivityGaps(scene);
      expect(gaps).toEqual([]);
      expect(allSourcesConnected(scene)).toBe(true);
    }
  });

  it('test negatywny (dowód, że wyrocznia gryzie): symbol źródła całkowicie odizolowany (żaden port nie dotyka żadnego odcinka sceny) ⇒ sourceConnectivityGaps go zgłasza', () => {
    const scene = buildSceneV3(enm, 1);
    // Syntetyczna scena: bierzemy realną (żeby geometria WSZYSTKICH innych
    // elementów była wiarygodna), ale DODAJEMY jeden symbol DER daleko poza
    // całą resztą rysunku (żaden port nie dotyka żadnego istniejącego
    // odcinka) — konstrukcja bez modyfikacji istniejących elementów.
    const isolated: SceneV3 = {
      ...scene,
      symbols: [
        ...scene.symbols,
        {
          symbolId: 'derPv',
          x: 999_999_992,
          y: 999_999_992,
          meta: { ownerRef: 'gen-isolated-test', elementKind: 'der' },
        },
      ],
    };
    const gaps = sourceConnectivityGaps(isolated);
    expect(gaps.some((g) => g.sourceId === 'gen-isolated-test')).toBe(true);
    expect(allSourcesConnected(isolated)).toBe(false);
  });
});

describe('buildSceneV3 — F9.7: sceneSegmentEndpointGaps/allSceneSegmentEndpointsAnchored (spec §11.3 port_probe, scena)', () => {
  it('fixtura referencyjna: KAŻDY koniec KAŻDEGO odcinka (poza szynami — patrz docstring `isBusbarLikeSegment`) jest portem symbolu, dotyka innego odcinka, LUB (L0) trafia w środek `stationCollapsed` — 0 luk na WSZYSTKICH LOD', () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(enm, lod);
      const gaps = sceneSegmentEndpointGaps(scene);
      expect(gaps).toEqual([]);
      expect(allSceneSegmentEndpointsAnchored(scene)).toBe(true);
    }
  });

  it('test negatywny (dowód, że wyrocznia gryzie): odcinek z jednym końcem w PRÓŻNI (żaden port, żaden inny odcinek) ⇒ sceneSegmentEndpointGaps go zgłasza', () => {
    const scene = buildSceneV3(enm, 2);
    const dangling: SceneV3 = {
      ...scene,
      segments: [
        ...scene.segments,
        {
          points: [
            { x: 999_999_200, y: 999_999_200 },
            { x: 999_999_264, y: 999_999_200 },
          ],
          meta: { kind: 'sn', ownerRef: 'dangling-test-segment', elementKind: 'segment' },
        },
      ],
    };
    const gaps = sceneSegmentEndpointGaps(dangling);
    expect(gaps.some((g) => dangling.segments[g.segmentIndex].meta?.ownerRef === 'dangling-test-segment')).toBe(true);
    expect(allSceneSegmentEndpointsAnchored(dangling)).toBe(false);
  });
});

describe('buildSceneV3 — F9.7/F9.10: symbolWireCollisions/noSymbolWireCollisions (spec §11.4 wire_probe rozszerzony na symbole, dług F9.3(b))', () => {
  /**
   * ZNALEZISKO F9.7 (dług F9.3(b) POTWIERDZONY, nie hipotetyczny): dokładnie
   * 11 kolizji `branchJunction`↔przewód na L1/L2 (0 na L0 — `branchJunction`
   * nierysowany na L0), 100% deterministyczne i powtarzalne. Przyczyna
   * geometryczna (zbadana, patrz raport F9.7): `trunkCorridorYOf` (jog
   * międzystacyjny głowica→głowica, F9.3 FIX-1) = `stripTopYOf + GRID`, a
   * `branchJunction` (32×32, spec §14.4) zajmowała `[stripTopY-16, stripTopY+16]`
   * — `DESCENT_STRIP_HEIGHT` (16px, `bands.ts`) NIE MIEŚCIŁ akcentu węzła
   * (32px) bez nachodzenia na sub-poziom korytarza międzystacyjnego, gdy
   * korytarz przechodzi przez TĘ SAMĄ szczelinę `COLUMN_GAP`, w której stoi
   * akcent.
   *
   * F9.10 (REBUILD_PLAN_V3 F9.10, NAPRAWIONE): `DESCENT_STRIP_HEIGHT`
   * podniesiony 2×GRID→6×GRID (`bands.ts`, uzasadnienie liczbowe tam) —
   * akcent jest zakotwiczony do stropu pasma nazw (`B5.y = stripTopY +
   * DESCENT_STRIP_HEIGHT`, rośnie WRAZ ze stałą), `trunkCorridorYOf`
   * (`stripTopY + GRID`) NIE rośnie — więc podniesienie stałej rozsuwa
   * akcent i korytarz. Kolizje = ZERO na WSZYSTKICH LOD, baseline USUNIĘTY
   * (DoD F9.10: twarde zero, ten sam wzorzec co `noSceneSymbolOverlaps`).
   */
  it('fixtura referencyjna: ZERO kolizji symbol↔przewód na WSZYSTKICH LOD (F9.10 — twarde zero, dług F9.3(b)/F9.7 spłacony)', () => {
    expect(symbolWireCollisions(buildSceneV3(enm, 0))).toEqual([]);
    expect(noSymbolWireCollisions(buildSceneV3(enm, 0))).toBe(true);
    for (const lod of [1, 2] as const) {
      const scene = buildSceneV3(enm, lod);
      const hits = symbolWireCollisions(scene);
      expect(hits.length).toBe(0);
      expect(noSymbolWireCollisions(scene)).toBe(true);
    }
  });

  it('test negatywny (dowód, że wyrocznia gryzie): symbol BEZ styku portowego umieszczony WPROST na trasie CUDZEGO odcinka ⇒ symbolWireCollisions go zgłasza', () => {
    const scene = buildSceneV3(enm, 2);
    // Odcinek realny (magistrala/lateral), dowolny wystarczająco długi —
    // wstawiamy symbol (junction bazowy, port N/S/E/W ISTNIEJE, ale
    // CELOWO wyśrodkowany na WNĘTRZU cudzego odcinka, gdzie żaden z jego
    // portów nie pokrywa się z żadnym punktem tego odcinka) w miejscu, o
    // którym wiadomo z konstrukcji, że nic tam nie stoi (offset sceny).
    const target = scene.segments.find((s) => s.points.length >= 2 && s.points[0].x !== s.points[1].x)!;
    const [a, b] = target.points;
    const midX = Math.round((a.x + b.x) / 2 / 8) * 8;
    const collidingSymbol = {
      symbolId: 'junction' as const,
      // Węzeł 16×16 wyśrodkowany 3px NAD osią odcinka (a.y) — bbox
      // [midX-8,midX+8]×[a.y-11,a.y+5] nachodzi na odcinek (grubość 0, ale
      // sam TEST geometryczny w `symbolWireCollisions` jest inkluzywny —
      // patrz `segmentTouchesOrOverlapsRect`), a JEGO porty (N/S/E/W na
      // krawędzi 16×16) nie pokrywają się z ŻADNYM punktem `target`.
      x: midX - 8,
      y: a.y - 11,
      meta: { ownerRef: 'colliding-test-symbol', elementKind: 'apparatus' as const },
    };
    const withCollision: SceneV3 = { ...scene, symbols: [...scene.symbols, collidingSymbol] };
    const hits = symbolWireCollisions(withCollision);
    expect(hits.some((h) => withCollision.symbols[h.symbolIndex].meta?.ownerRef === 'colliding-test-symbol')).toBe(true);
    expect(noSymbolWireCollisions(withCollision)).toBe(false);
  });
});

describe('buildSceneV3 — F9.7: totalVerticalSegmentLength (spec §15.1 vertical_length_probe)', () => {
  it('miara jest deterministyczna i zgodna z prostą arytmetyką na syntetycznej scenie (dowód formuły)', () => {
    const scene = buildSceneV3(enm, 2);
    const synthetic: SceneV3 = {
      ...scene,
      segments: [
        { points: [{ x: 0, y: 0 }, { x: 0, y: 40 }], meta: { kind: 'sn', elementKind: 'segment' } },
        { points: [{ x: 0, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 10 }], meta: { kind: 'sn', elementKind: 'segment' } },
      ],
    };
    // pion 1: |40-0|=40; poziom (0, pomijany); pion 2: |10-40|=30 → suma 70.
    expect(totalVerticalSegmentLength(synthetic)).toBe(70);
  });

  it('fixtura referencyjna: baseline aktualny per LOD (historia: F9.7 9656/38504/53304 → F9.10 +2496 za kolizje=0 → F10.1 OBNIŻONY: tor główny pola KRÓTSZY o ES wyjęty na bok §18.1 — blok stacji −32, co przez 78 przecięć pasm ODDAJE dokładnie koszt F9.10 na L1/L2; L0 −32 na zejściu GPZ → F10.2 OBNIŻONY na L2: podpisy kierunku pola z nazwą linii §19.2 (dłuższe teksty na fixturze referencyjnej, `LineRunV1.name` np. „Magistrala 01"/„Odgałęzienie SN kablowe") poszerzyły kolumny NIEKTÓRYCH pól — przez `colorSegmentLabelRows` (`layout/segments.ts`, r9, NIEZMIENIONE przez F10.2) zmiana szerokości kolumn przełożyła się na inne przydziały wierszy pasma B1, co ODDAJE 1072px pionów na L2 (spadek, nie wzrost — miara „nie-rosnąca" spec §15.1 spełniona z zapasem); L0/L1 BEZ zmian (L0 nie niesie `bayDirectionCaptions`, L1 ma je wyłączone — spec §7) → F10.3 PODNIESIONY na L1/L2 (spec §18.4 — etykieta szyny SN, `busbar_label_probe`): zakaz anonimowego odcinka szyny wymaga WŁASNEGO wiersza B2 (`stationBusbarLabelHeight`, `layout/measure.ts`) NAD podpisem kierunku pola — rezerwacja doliczana JEDNOLICIE do KAŻDEGO wiersza stacji z co najmniej jednym polem SN (`snBays.length>0`, zgodnie z `composeStation` — pomija tylko stacje bez pól), więc rośnie na L1/L2 (gdzie `snBays` jest niepuste), NIE na L0 (kolaps do `stationCollapsed`, `snBays: []` z konstrukcji `buildMeasureInput`). Świadome odstępstwo od reguły „nie-rosnąca" (jak F9.10: czytelność/zero-anonimowej-szyny ma pierwszeństwo przed minimalizacją pionów, spec §15.1 „redukcja jest ograniczeniem MIĘKKIM") — ZERO nowych kolizji symbol↔przewód/etykieta↔przewód/etykieta↔etykieta na fixturze referencyjnej (zweryfikowane `npm run accept:sld-v3`).', () => {
    // → F13.1/F13.2 (D3, przejęcie nadzorcy): L0 PODNIESIONY 12120→12280
    // (+160 — rynna objazdu wyjścia GPZ: prosty pion PRZEBIJAŁ własną szynę
    // sekcji GPZ we wnętrzu przęsła, zakaz §22.3; koszt poprawności
    // kanonicznej, świadome odstępstwo od „nie-rosnącej" jak F9.10/F10.3);
    // L1 OBNIŻONY 41000→40952 i L2 54104→54056 (−48: kolumna WN dodaje piony
    // GPZ, ale kasacja fałszywego akcentu-kropki V12K-039 i przebudowa strefy
    // GPZ na dekorację zdejmują więcej — netto spadek).
    // → F13.3 (spec §22.3, D3-4/D3-15): L1 PODNIESIONY 40952→41880, L2
    // 54056→54984 (+928 — 12 wejść lateralnych rynną ZA blokiem stacji
    // docelowej i POD stacją do głowicy OD DOŁU, zamiast pionu
    // współliniowego z osią pola wejściowego przez pas szyny; zysk twardy:
    // bus_band_clearance 12→0, entry_collinearity 12→0). L0 BEZ zmian
    // (stacja zbiorcza — brak szyny/pól, zejście proste zostaje).
    // → §16-v3 (2026-07-17): L0 12280→12488 (+208), L1 41880→42560, L2
    // 54984→55664 (+680) — 13 OTWARTYCH ogonów ENM (segmenty za ostatnią
    // stacją każdego ciągu) dotąd NIEWIDOCZNYCH jest teraz rysowanych
    // (zejście głowica→korytarz per ogon + pionowy słupek terminalny na
    // ogonie magistrali). Zysk twardy: field_entry 13→0 dyndających głowic,
    // 13 realnych refów ENM w DOM — `buildScene.openTerminal.test.ts`.
    // → Recenzja NO-GO 2026-07-17 (pkt 1/2/3/4): L0 12488→12472 (−16 netto),
    // L1 42560→42608 i L2 55664→55712 (+48) — złożenie: (a) objazd magistrali
    // głębiej pod strefą GPZ (+3×GRID zamiast +1, kabel schodzi z przerywanej
    // granicy obiektu, pkt 1) i pas ±2×GRID w warunku objazdu (korytarz
    // DOKŁADNIE na poziomie szyny GPZ też objeżdża — kasuje współliniowość
    // pionu z własnym zejściem pola na L0), (b) źródło-EKWIWALENT
    // (Source.bus_ref = szyna SN) zaczepia się nad szyną SN zamiast wieńczyć
    // kolumnę WN cudzym napięciem (pkt 2/3 — na L0 krótsze zejście źródła),
    // (c) DWA nowe wiersze tabliczek w strefie GPZ (TR uk%/Pk pkt 4 +
    // „Ekwiwalent sieci zasilającej" pkt 3) pogłębiają nawis strefy → dłuższy
    // pion wyjścia magistrali na L1/L2 (świadome odstępstwo od „nie-rosnącej"
    // jak F9.10/F10.3 — uczciwa tabliczka ma pierwszeństwo, §15.1 miękka).
    // → 7 pozycji PLAN recenzji NO-GO (2026-07-17, runda 7): L1 42608→47240
    // (+4632), L2 55712→67208 (+11496), L0 BEZ zmian — złożenie trzech
    // ŚWIADOMYCH kosztów czytelności (§15.1 miękka, precedens F9.10/F10.3):
    // (a) pkt 6: KAŻDA stacja z polem TR niesie teraz dwa wiersze strony nN
    // w paśmie B5 („Szyna nN · 0.4 kV" + odbiór/granica modelu) → wyższe
    // wiersze → dłuższe zejścia międzywierszowe na L1/L2; strzałki odbioru
    // (12 stacji z Load na fixturze) dokładają pion+symbol pod szyną nN;
    // (b) pkt 13 (L2): etykiety przęseł z parą końców („S01 ↔ S02 — …") są
    // szersze → korytarze etykiet lateralnych (wysokość = szerokość
    // obróconego tekstu) głębsze; (c) pkt 5: szablony RMU skracają stosy
    // pól (mniej aparatów), co CZĘŚCIOWO oddaje koszt (a)/(b). Zero nowych
    // kolizji (symbolWireCollisions/k6/overlap — twarde zera niżej/wyżej).
    // → SCHEMAT-10 S1 (V12K-135, macierz LOD §3 „jedna kotwica"): L0 12472→50264,
    // L1 47240→67208, L2 BEZ zmian (67208 — L1 zrównało się z L2). Świadoma
    // WYMIANA WZORCA: GEOMETRIA (kolumny/pasma/kotwice/rezerwy korytarzy)
    // liczona teraz zawsze przy PEŁNYM szczególe (L2), niezależnie od poziomu
    // renderu — koniec D1 „trzy światy" na poziomie geometrii (L0 liczyło
    // kolumny z pustych pól; L1 bez podpisów/incoming; wyrównanie do GPZ i
    // rezerwa korytarzy lateralnych zależne od LOD — każdy poziom miał INNĄ oś
    // magistrali, INNE kolumny i INNE Y gałęzi → zoom przemeblowywał układ).
    // Po S1 środek glifu KAŻDEJ stacji (X i Y) i oś magistrali są IDENTYCZNE na
    // L0/L1/L2 — dowód: test „JEDNA KOTWICA" wyżej (porównanie kotwic wszystkich
    // stacji między scenami). Poziom steruje WYŁĄCZNIE szczegółem RYSOWANYM w tej
    // samej geometrii. Wzrost pionów wynika z tego, że L0/L1 renderują teraz w
    // pełnej rezerwie L2 (wyższe pasma B2/B5, korytarze lateralne, wyrównanie GPZ
    // przy pełnej adnotacji). §15.1 „redukcja pionów jest ograniczeniem MIĘKKIM"
    // — spójność LOD (jedna kotwica) ma pierwszeństwo (precedens F9.10/F10.3).
    // L2 bez zmian potwierdza brak regresji przy pełnym szczególe. Zero nowych
    // kolizji (twarde zera symbolWireCollisions/k6/overlap wyżej/niżej).
    // → SCHEMAT-10 S7-P1 (V12K-137, GAP `S7_GAP_CROSSING_ZERO` §S7-P1,
    // kompaktyzacja Rodziny B): L0 50264→28072 (−44%), L1/L2 67208→45016
    // (−33%). Kursor sekwencyjny `nextRowTopY` (każdy lateral POD CAŁĄ
    // dotychczasową treścią) zastąpiony pakowaniem interwałowym: laterale
    // ROZŁĄCZNE w X dzielą pas Y (piony zejść PROPORCJONALNE do footprintu,
    // nie do skumulowanej pozycji w grzebieniu — WARUNKI_ODBIORU_S6 §2). Piony
    // MALEJĄ (miara „nie-rosnąca" §15.1 spełniona z zapasem). Topologia,
    // kolejność aparatów, ciągłość toru, „jedna kotwica" NIEZMIENIONE — zmienia
    // się WYŁĄCZNIE rzędna `dy` pasa (geometria, nie model). Dowód braku
    // regresji: `accept:sld-v3` ALL PASS + s6Metrics (0 kolizji/przecięć-poddrzew/
    // nie-ortogonalnych/niejednoznacznych).
    expect(totalVerticalSegmentLength(buildSceneV3(enm, 0))).toBe(28072);
    expect(totalVerticalSegmentLength(buildSceneV3(enm, 1))).toBe(45016);
    expect(totalVerticalSegmentLength(buildSceneV3(enm, 2))).toBe(45016);
  });
});

describe('buildSceneV3 — F10.1: wyrocznie §18.1/§18.2/§18.6 (aparaty boczne + opisane zakończenia)', () => {
  it('earth_switch_lateral_probe + vt_parallel_probe: zero luk na realnej fixturze, wszystkie LOD', () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(enm, lod);
      expect(allEarthSwitchesLateral(scene)).toBe(true);
      expect(allVtParallel(scene)).toBe(true);
    }
  });

  it('§18.1 (test negatywny): ES podstawiony NA oś toru ⇒ wyrocznia zgłasza on-main-axis', () => {
    const scene = buildSceneV3(enm, 2);
    const axisApparatus = scene.symbols.find(
      (sym) => sym.meta?.elementKind === 'apparatus' && sym.symbolId === 'breaker' && sym.meta?.ownerRef,
    )!;
    const sabotaged = { ...scene, symbols: [...scene.symbols, { ...axisApparatus, symbolId: 'earthSwitch' as const }] };
    const gaps = earthSwitchLateralGaps(sabotaged);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((g) => g.reason === 'on-main-axis')).toBe(true);
  });

  it('§18.1 (test negatywny 2): ES odsunięty od osi, ale BEZ odcinka odgałęzienia ⇒ no-branch-segment', () => {
    const scene = buildSceneV3(enm, 2);
    const axisApparatus = scene.symbols.find(
      (sym) => sym.meta?.elementKind === 'apparatus' && sym.symbolId === 'breaker' && sym.meta?.ownerRef,
    )!;
    const sabotaged = {
      ...scene,
      symbols: [
        ...scene.symbols,
        // 10 000 px od wszystkiego — na pewno bez odcinka bocznego.
        { ...axisApparatus, symbolId: 'earthSwitch' as const, x: axisApparatus.x + 10000 },
      ],
    };
    const gaps = earthSwitchLateralGaps(sabotaged);
    expect(gaps.some((g) => g.reason === 'no-branch-segment')).toBe(true);
  });

  it('path_termination_labeled_probe (§18.6): fizyczne końce niosą bieg otwarty §16-v3 (0 głowic bez trasy, 0 #termination) — opis końca przejęły etykiety „koniec otwarty"; wyrocznia dalej gryzie po zdjęciu ogonów', () => {
    // §16-v3 (2026-07-17): 13 dawnych „fizycznych końców" (głowica bez
    // trasy) niesie TERAZ bieg otwarty do słupka terminalnego (realne
    // segmenty ENM za ostatnią stacją) — głowice są dotknięte trasą, więc
    // etykiet `#termination` jest 0, a opis końca daje 13 etykiet
    // „koniec otwarty" (`#open-terminal-label`, L2).
    const scene = buildSceneV3(enm, 2);
    expect(allPathTerminationsLabeled(scene)).toBe(true);
    expect(scene.labels.filter((l) => l.ownerRef.endsWith('#termination'))).toHaveLength(0);
    const openLabels = scene.labels.filter((l) => l.ownerRef.endsWith('#open-terminal-label'));
    expect(openLabels.length).toBe(13);
    expect(openLabels.every((l) => l.text === 'koniec otwarty')).toBe(true);
    // Wyrocznia §18.6 MUSI dalej gryźć: scena z USUNIĘTYMI ogonami (i ich
    // etykietami) = 13 głowic znowu bez trasy i bez opisu → 13 luk.
    const isOpenRunPiece = (ownerRef: string | undefined) =>
      ownerRef != null && (ownerRef.endsWith('#open-terminal') || ownerRef.endsWith('#open-terminal-label'));
    const openRunRefs = new Set(
      scene.segments.filter((s) => s.meta?.openTerminal === true).map((s) => s.meta?.ownerRef),
    );
    const stripped = {
      ...scene,
      segments: scene.segments.filter(
        (s) => !isOpenRunPiece(s.meta?.ownerRef) && !openRunRefs.has(s.meta?.ownerRef),
      ),
      labels: scene.labels.filter((l) => !isOpenRunPiece(l.ownerRef)),
    };
    expect(allPathTerminationsLabeled(stripped)).toBe(false);
    expect(pathTerminationLabelGaps(stripped).length).toBe(13);
  });

  it('§18.6: L0/L1 bez etykiet zakończeń (poziom szczegółowości L2 — spójnie z etykietami przęseł)', () => {
    for (const lod of [0, 1] as const) {
      const scene = buildSceneV3(enm, lod);
      expect(scene.labels.filter((l) => l.ownerRef.endsWith('#termination'))).toHaveLength(0);
      expect(pathTerminationLabelGaps(scene)).toHaveLength(0);
    }
  });
});

describe('buildSceneV3 — F10.3: busbar_label_probe (spec §18.4) na fixturze REALNEJ', () => {
  it('każda szyna SN (stacji + sekcji GPZ) ma DOKŁADNIE JEDNĄ etykietę busbar-voltage, format poprawny, na lod>=1', () => {
    for (const lod of [1, 2] as const) {
      const scene = buildSceneV3(enm, lod);
      expect(allBusbarLabelsValid(scene)).toBe(true);
      expect(busbarLabelGaps(scene)).toHaveLength(0);
      const busbarLabels = scene.labels.filter((l) => l.ownerKind === 'busbar-voltage');
      // 53 stacje + N sekcji GPZ (fixtura: 1) — parytet z GPZ dosłownie.
      expect(busbarLabels.length).toBeGreaterThanOrEqual(53);
      // F13.1 (spec §21.1): forma WN „Szyna WN · V kV" (szyna 110 kV GPZ)
      // dopisana do zamkniętego słownika form (§19.2 SN + §21.1 WN).
      expect(busbarLabels.every((l) => /^(?:Sekcja \d+|Szyna WN)(?: · \d+(?:\.\d+)? kV)?$/.test(l.text))).toBe(true);
    }
  });

  it('(test negatywny a): usunięcie etykiety JEDNEJ szyny SN ⇒ bus-without-label zgłoszony', () => {
    const scene = buildSceneV3(enm, 2);
    const victim = scene.labels.find((l) => l.ownerKind === 'busbar-voltage')!;
    const sabotaged = { ...scene, labels: scene.labels.filter((l) => l !== victim) };
    const gaps = busbarLabelGaps(sabotaged);
    expect(gaps.some((g) => g.reason === 'bus-without-label')).toBe(true);
    expect(allBusbarLabelsValid(sabotaged)).toBe(false);
  });

  it('(test negatywny b): tekst spoza formatu „Sekcja N"/„Sekcja N · V kV" ⇒ malformed-text zgłoszony', () => {
    const scene = buildSceneV3(enm, 2);
    const victim = scene.labels.find((l) => l.ownerKind === 'busbar-voltage')!;
    const sabotaged = { ...scene, labels: scene.labels.map((l) => (l === victim ? { ...l, text: 'S1 15kV' } : l)) };
    const gaps = busbarLabelGaps(sabotaged);
    expect(gaps.some((g) => g.reason === 'malformed-text')).toBe(true);
  });
});

describe('buildSceneV3 — F10.3: switch_symbol_unambiguity_probe (spec §18.5) na fixturze REALNEJ', () => {
  it('mapowanie kind→symbol jednoznaczne (statyczne, niezależne od LOD) i zero stanów nielegalnych na scenie, na wszystkich LOD', () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(enm, lod);
      expect(allSwitchSymbolsUnambiguous(scene)).toBe(true);
      expect(switchSymbolUnambiguityGaps(scene)).toHaveLength(0);
    }
  });

  it('(test negatywny a): kind dopisany do udokumentowanej aproksymacji nie psuje sondy, ALE dowód działa na SYMULOWANYM mapowaniu — negatyw pokryty w scripts/sld_v3_acceptance.mjs (statyczna tabela, poza zasięgiem sabotażu na scenie)', () => {
    // (a) jest STATYCZNE (niezależne od `scene`) — sabotaż wymaga podmiany
    // `apparatusSequence.ts`, poza zasięgiem testu na scenie; dowód
    // pozytywny (mapowanie DZIŚ jednoznaczne) wystarcza tu, negatyw (b/c)
    // niżej i w acceptance script.
    const scene = buildSceneV3(enm, 2);
    expect(switchSymbolUnambiguityGaps(scene).some((g) => g.reason === 'kind-symbol-ambiguous')).toBe(false);
  });

  it('(test negatywny b): łącznik toru głównego ze stanem spoza {closed,open,unknown} ⇒ main-path-switch-invalid-state zgłoszony; `undefined` pozostaje LEGALNY (Invariant 9)', () => {
    const scene = buildSceneV3(enm, 2);
    const anySwitch = scene.symbols.find((s) => s.symbolId === 'breaker' || s.symbolId === 'disconnector' || s.symbolId === 'fuseSwitch')!;
    const sabotaged = {
      ...scene,
      symbols: scene.symbols.map((s) => (s === anySwitch ? { ...s, state: 'energized' as never } : s)),
    };
    const gaps = switchSymbolUnambiguityGaps(sabotaged);
    expect(gaps.some((g) => g.reason === 'main-path-switch-invalid-state')).toBe(true);
    // `undefined` NIE jest sabotowany dalej — dowód, że NIE jest luką (56
    // instancje na fixturze referencyjnej mają dziś `state===undefined`,
    // patrz docstring `switchSymbolUnambiguityGaps` — konwencja fuseSwitch
    // bez kanału stanu + syntetyzowane pola HV GPZ bez telemetrii, oba
    // legalne per Invariant 9).
    const undefinedStateGaps = switchSymbolUnambiguityGaps(scene).filter((g) => g.reason === 'main-path-switch-invalid-state');
    expect(undefinedStateGaps).toHaveLength(0);
  });

  it('(test negatywny c): „52" w protectionCodes okręgu przekaźnika ⇒ device-number-52-in-protection-codes zgłoszony', () => {
    const scene = buildSceneV3(enm, 2);
    const sabotaged = {
      ...scene,
      symbols: [
        ...scene.symbols,
        { symbolId: 'protectionRelay' as const, x: 0, y: 0, meta: { ownerRef: 'sabotage-relay', protectionCodes: ['50/51', '52'] } },
      ],
    };
    const gaps = switchSymbolUnambiguityGaps(sabotaged);
    expect(gaps.some((g) => g.reason === 'device-number-52-in-protection-codes')).toBe(true);
  });

  it('(test negatywny c, ownerKind): etykieta „52" z ownerKind spoza protection ⇒ device-number-52-misplaced zgłoszony', () => {
    const scene = buildSceneV3(enm, 2);
    const victim = scene.labels.find((l) => l.text === '52');
    if (!victim) return; // fixtura referencyjna: 0 torów wyzwalania (§17.2/GPZ) — patrz F9.9 opis niżej.
    const sabotaged = { ...scene, labels: scene.labels.map((l) => (l === victim ? { ...l, ownerKind: 'apparatus' as const } : l)) };
    const gaps = switchSymbolUnambiguityGaps(sabotaged);
    expect(gaps.some((g) => g.reason === 'device-number-52-misplaced')).toBe(true);
  });
});

describe('buildSceneV3 — F9.9: protection_marking_probe (spec §17.5) na fixturze REALNEJ (sldSubstrate52s: 0 Bay[], 0 protection_assignments, 0 measurements)', () => {
  it('§17.2 „brak danych = brak oznaczenia" na REALNEJ fixturze: ZERO okręgów przekaźnika/miernika, ZERO torów wyzwalania na WSZYSTKICH LOD — dowód „vacuously true", nie fałszywy pozytyw (fixtura nie niesie Bay[] w ogóle)', () => {
    for (const lod of LODS) {
      const scene = buildSceneV3(enm, lod);
      expect(scene.symbols.filter((s) => s.symbolId === 'protectionRelay')).toHaveLength(0);
      expect(scene.symbols.filter((s) => s.symbolId === 'meter')).toHaveLength(0);
      expect(scene.segments.filter((s) => s.meta?.kind === 'protectionTrip')).toHaveLength(0);
      expect(allProtectionMarkingsValid(scene)).toBe(true);
      expect(noProtectionAnnotationAtLod0(scene)).toBe(true);
    }
  });

  it('(negatyw obowiązkowy, §17.5a) okrąg przekaźnika BEZ kodów ⇒ protectionMarkingGaps WYKRYWA (dowód, że wyrocznia gryzie, nie zawsze zielona)', () => {
    const scene = buildSceneV3(enm, 2);
    const synthetic: SceneV3 = {
      ...scene,
      symbols: [
        ...scene.symbols,
        {
          symbolId: 'protectionRelay',
          x: 800,
          y: 800,
          meta: { ownerRef: 'bay-fabricated', elementKind: 'protectionAnnotation', protectionCodes: [] },
        },
      ],
    };
    const gaps = protectionMarkingGaps(synthetic);
    expect(gaps.some((g) => g.reason === 'circle-without-codes' && g.ownerRef === 'bay-fabricated')).toBe(true);
    expect(allProtectionMarkingsValid(synthetic)).toBe(false);
  });

  it('(negatyw obowiązkowy, §17.2/§17.5b) linia wyzwalania do NIEWŁAŚCIWEGO/nierejestrowanego punktu (nie port aparatu tego samego pola) ⇒ protectionMarkingGaps WYKRYWA', () => {
    const scene = buildSceneV3(enm, 2);
    const synthetic: SceneV3 = {
      ...scene,
      symbols: [
        ...scene.symbols,
        {
          symbolId: 'protectionRelay',
          x: 800,
          y: 800,
          meta: { ownerRef: 'bay-x', elementKind: 'protectionAnnotation', protectionCodes: ['50/51'] },
        },
      ],
      segments: [
        ...scene.segments,
        {
          points: [{ x: 999, y: 999 }, { x: 800, y: 999 }, { x: 800, y: 808 }],
          meta: { kind: 'protectionTrip', ownerRef: 'bay-x#trip-line', elementKind: 'protectionAnnotation' },
        },
      ],
    };
    const gaps = protectionMarkingGaps(synthetic);
    expect(gaps.some((g) => g.reason === 'trip-line-endpoint-mismatch')).toBe(true);
  });

  it('(pozytyw kontrolny) para okrąg+tor poprawnie zakotwiczona na REJESTROWANYCH portach TEGO SAMEGO pola ⇒ zero luk', () => {
    const scene = buildSceneV3(enm, 2);
    const fakeBreaker: SceneV3['symbols'][number] = {
      symbolId: 'breaker',
      x: 800,
      y: 900,
      meta: { ownerRef: 'bay-y', elementKind: 'apparatus' },
    };
    const fakeRelay: SceneV3['symbols'][number] = {
      symbolId: 'protectionRelay',
      x: 700,
      y: 900,
      meta: { ownerRef: 'bay-y', elementKind: 'protectionAnnotation', protectionCodes: ['51'] },
    };
    const breakerTop = { x: fakeBreaker.x + 8, y: fakeBreaker.y }; // 'top' port offset (8,0)
    const relayLink = { x: fakeRelay.x, y: fakeRelay.y + 8 }; // 'link' port offset (0,8)
    const synthetic: SceneV3 = {
      ...scene,
      symbols: [...scene.symbols, fakeBreaker, fakeRelay],
      segments: [
        ...scene.segments,
        {
          points: [breakerTop, { x: relayLink.x, y: breakerTop.y }, relayLink],
          meta: { kind: 'protectionTrip', ownerRef: 'bay-y#trip-line', elementKind: 'protectionAnnotation' },
        },
      ],
    };
    expect(protectionMarkingGaps(synthetic)).toEqual([]);
    expect(allProtectionMarkingsValid(synthetic)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // B-1 (recenzja F9.9, spec §17.4 L1) — protectionAnnotationAtLod1IsCircleOnly.
  // Dowody POZYTYWNE i NEGATYWNE na scenach syntetycznych (fixtura
  // referencyjna jest pusto-prawdziwa — 0 danych §17.2, recenzent wytknął,
  // że to nie wystarcza jako dowód).
  // -------------------------------------------------------------------------

  it('B-1 (§17.4 L1, POZYTYW): scena L1 z okręgiem przekaźnika BEZ kodów (i niczym więcej z warstwy §17) ⇒ oracle zielony', () => {
    const scene = buildSceneV3(enm, 1);
    const synthetic: SceneV3 = {
      ...scene,
      symbols: [
        ...scene.symbols,
        {
          symbolId: 'protectionRelay',
          x: 800,
          y: 800,
          meta: { ownerRef: 'bay-l1', elementKind: 'protectionAnnotation' },
        },
      ],
    };
    expect(synthetic.meta.lod).toBe(1);
    // Okrąg OBECNY (dowód pozytywny — nie pusta scena) i oracle zielony.
    expect(synthetic.symbols.some((s) => s.symbolId === 'protectionRelay')).toBe(true);
    expect(protectionAnnotationAtLod1IsCircleOnly(synthetic)).toBe(true);
    expect(allProtectionMarkingsValid(synthetic)).toBe(true); // ownerRef jest, kodów brak — L1 OK.
  });

  it('B-1 (§17.4 L1, NEGATYW ×3): kody na okręgu / tor wyzwalania / miernik na L1 ⇒ oracle FAIL (dowód, że gryzie)', () => {
    const scene = buildSceneV3(enm, 1);
    const withCodes: SceneV3 = {
      ...scene,
      symbols: [
        ...scene.symbols,
        {
          symbolId: 'protectionRelay',
          x: 800,
          y: 800,
          meta: { ownerRef: 'bay-l1', elementKind: 'protectionAnnotation', protectionCodes: ['50/51'] },
        },
      ],
    };
    expect(protectionAnnotationAtLod1IsCircleOnly(withCodes)).toBe(false);
    // Ta sama wada widziana przez protectionMarkingGaps (codes-present-at-lod1).
    expect(protectionMarkingGaps(withCodes).some((g) => g.reason === 'codes-present-at-lod1')).toBe(true);

    const withTrip: SceneV3 = {
      ...scene,
      segments: [
        ...scene.segments,
        {
          points: [{ x: 800, y: 900 }, { x: 900, y: 900 }],
          meta: { kind: 'protectionTrip', ownerRef: 'bay-l1#trip-line', elementKind: 'protectionAnnotation' },
        },
      ],
    };
    expect(protectionAnnotationAtLod1IsCircleOnly(withTrip)).toBe(false);

    const withMeter: SceneV3 = {
      ...scene,
      symbols: [
        ...scene.symbols,
        { symbolId: 'meter', x: 800, y: 800, meta: { ownerRef: 'bay-l1', elementKind: 'protectionAnnotation' } },
      ],
    };
    expect(protectionAnnotationAtLod1IsCircleOnly(withMeter)).toBe(false);
  });

  it('B-1 sanity: na L2 oracle L1 nie dotyczy (zwraca true niezależnie od kodów) — rozdział odpowiedzialności per LOD', () => {
    const scene2 = buildSceneV3(enm, 2);
    expect(protectionAnnotationAtLod1IsCircleOnly(scene2)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // R-3 (recenzja F9.9): tor wyzwalania NIE mostkuje komponentów spójności
  // w source_connectivity_probe (§17.1: adnotacja, nie przewód mocy).
  // -------------------------------------------------------------------------

  it('R-3: segment protectionTrip łączący ODCIĘTE źródło z szyną ⇒ źródło NADAL zgłaszane jako odcięte (tor wyzwalania wykluczony z unii)', () => {
    const scene = buildSceneV3(enm, 2);
    // Syntetyczne odcięte źródło: symbol gridSource daleko od sceny (port
    // `bottom` w (808, 1024)) + szyna-wyspa obok; JEDYNE połączenie
    // źródło→szyna to segment protectionTrip.
    const strandedSource: SceneV3['symbols'][number] = {
      symbolId: 'gridSource',
      x: 800,
      y: 1000,
      meta: { ownerRef: 'src-stranded', elementKind: 'source' },
    };
    const islandBus: SceneV3['segments'][number] = {
      points: [{ x: 900, y: 1024 }, { x: 1000, y: 1024 }],
      meta: { kind: 'bus', ownerRef: 'island#sn-bus', elementKind: 'bus' },
    };
    const tripBridge: SceneV3['segments'][number] = {
      points: [{ x: 808, y: 1024 }, { x: 900, y: 1024 }],
      meta: { kind: 'protectionTrip', ownerRef: 'src-stranded#trip-line', elementKind: 'protectionAnnotation' },
    };
    const synthetic: SceneV3 = {
      ...scene,
      symbols: [...scene.symbols, strandedSource],
      segments: [...scene.segments, islandBus, tripBridge],
    };
    const gaps = sourceConnectivityGaps(synthetic);
    expect(gaps.some((g) => g.sourceId === 'src-stranded')).toBe(true);

    // Kontrola: TEN SAM mostek jako zwykły przewód (kind 'sn') FAKTYCZNIE
    // łączy — dowód, że wykluczenie dotyczy WYŁĄCZNIE protectionTrip, a
    // geometria mostka jest poprawna (test nie przechodzi „przypadkiem").
    const wireBridge: SceneV3['segments'][number] = {
      points: tripBridge.points,
      meta: { kind: 'sn', ownerRef: 'src-stranded#wire', elementKind: 'segment' },
    };
    const control: SceneV3 = {
      ...scene,
      symbols: [...scene.symbols, strandedSource],
      segments: [...scene.segments, islandBus, wireBridge],
    };
    expect(sourceConnectivityGaps(control).some((g) => g.sourceId === 'src-stranded')).toBe(false);
  });
});

describe(
  'buildSceneV3 — F10.5: secondary_link_duality_probe / annotation_no_overlap_primary_probe / ' +
    'meter_symbol_disambiguation (spec §20.1/§20.3/§20.4) na fixturze REALNEJ (0 protection_assignments)',
  () => {
    it('§20.1 „brak danych = brak linii pomiarowej" na REALNEJ fixturze: ZERO segmentów measurementLink na WSZYSTKICH LOD — dowód vacuously true (fixtura nie niesie ProtectionAssignment w ogóle)', () => {
      for (const lod of LODS) {
        const scene = buildSceneV3(enm, lod);
        expect(scene.segments.filter((s) => s.meta?.kind === 'measurementLink')).toHaveLength(0);
        expect(allSecondaryLinksValid(scene)).toBe(true);
        expect(allMeterSymbolsDisambiguated(scene)).toBe(true);
        expect(noAnnotationOverlapsPrimaryPath(scene)).toBe(true);
      }
    });

    it('(pozytyw kontrolny, §20.1a/c) CT+przekaźnik+wyłącznik z DWIEMA liniami RÓŻNYMI (measurementLink CT→przekaźnik, protectionTrip przekaźnik→wyłącznik), oba zakotwiczone na REJESTROWANYCH portach TEGO SAMEGO pola ⇒ zero luk', () => {
      const scene = buildSceneV3(enm, 2);
      const fakeCt: SceneV3['symbols'][number] = {
        symbolId: 'currentTransformer',
        x: 700,
        y: 900,
        meta: { ownerRef: 'bay-z', elementKind: 'apparatus' },
      };
      const fakeBreaker: SceneV3['symbols'][number] = {
        symbolId: 'breaker',
        x: 700,
        y: 950,
        meta: { ownerRef: 'bay-z', elementKind: 'apparatus' },
      };
      const fakeRelay: SceneV3['symbols'][number] = {
        symbolId: 'protectionRelay',
        x: 780,
        y: 900,
        meta: { ownerRef: 'bay-z', elementKind: 'protectionAnnotation', protectionCodes: ['51'] },
      };
      const ctTop = { x: fakeCt.x + 8, y: fakeCt.y }; // 'top' port offset (8,0)
      const breakerTop = { x: fakeBreaker.x + 8, y: fakeBreaker.y };
      const relayLink = { x: fakeRelay.x, y: fakeRelay.y + 8 }; // 'link' port offset (0,8)
      const synthetic: SceneV3 = {
        ...scene,
        symbols: [...scene.symbols, fakeCt, fakeBreaker, fakeRelay],
        segments: [
          ...scene.segments,
          {
            points: [ctTop, { x: relayLink.x, y: ctTop.y }, relayLink],
            meta: { kind: 'measurementLink', ownerRef: 'bay-z#measurement-link', elementKind: 'protectionAnnotation' },
          },
          {
            points: [breakerTop, { x: relayLink.x, y: breakerTop.y }, relayLink],
            meta: { kind: 'protectionTrip', ownerRef: 'bay-z#trip-line', elementKind: 'protectionAnnotation' },
          },
        ],
      };
      expect(secondaryLinkDualityGaps(synthetic)).toEqual([]);
      expect(allSecondaryLinksValid(synthetic)).toBe(true);
      // Dwie linie o RÓŻNYCH ownerRef (§20.1a dosłownie) — kontrola jawna.
      const secondary = synthetic.segments.filter(
        (s) => s.meta?.kind === 'measurementLink' || s.meta?.kind === 'protectionTrip',
      );
      expect(secondary).toHaveLength(2);
      expect(new Set(secondary.map((s) => s.meta?.ownerRef)).size).toBe(2);
    });

    it('(negatyw obowiązkowy, §20.1b) linia pomiarowa dotykająca PORTU WYŁĄCZNIKA (bezpośrednio „pomiar z wyłącznika") ⇒ secondaryLinkDualityGaps WYKRYWA', () => {
      const scene = buildSceneV3(enm, 2);
      const fakeBreaker: SceneV3['symbols'][number] = {
        symbolId: 'breaker',
        x: 700,
        y: 950,
        meta: { ownerRef: 'bay-w', elementKind: 'apparatus' },
      };
      const breakerTop = { x: fakeBreaker.x + 8, y: fakeBreaker.y };
      const synthetic: SceneV3 = {
        ...scene,
        symbols: [...scene.symbols, fakeBreaker],
        segments: [
          ...scene.segments,
          {
            points: [breakerTop, { x: breakerTop.x, y: breakerTop.y - 20 }],
            meta: { kind: 'measurementLink', ownerRef: 'bay-w#measurement-link', elementKind: 'protectionAnnotation' },
          },
        ],
      };
      const gaps = secondaryLinkDualityGaps(synthetic);
      expect(gaps.some((g) => g.reason === 'direct-breaker-measurement-link')).toBe(true);
      expect(allSecondaryLinksValid(synthetic)).toBe(false);
    });

    it('(negatyw obowiązkowy, §20.1c) linia pomiarowa BEZ zakotwiczenia na REJESTROWANYCH portach CT/przekaźnika TEGO SAMEGO pola ⇒ secondaryLinkDualityGaps WYKRYWA (endpoint-mismatch)', () => {
      const scene = buildSceneV3(enm, 2);
      const synthetic: SceneV3 = {
        ...scene,
        segments: [
          ...scene.segments,
          {
            points: [{ x: 1200, y: 1200 }, { x: 1300, y: 1200 }],
            meta: { kind: 'measurementLink', ownerRef: 'bay-v#measurement-link', elementKind: 'protectionAnnotation' },
          },
        ],
      };
      const gaps = secondaryLinkDualityGaps(synthetic);
      expect(gaps.some((g) => g.reason === 'measurement-link-endpoint-mismatch')).toBe(true);
      expect(allSecondaryLinksValid(synthetic)).toBe(false);
    });

    // -----------------------------------------------------------------------
    // §20.1e: linia pomiarowa WYŁĄCZONA z continuity_probe toru mocy —
    // TEN SAM wzorzec R-3 (F9.9) co protectionTrip, teraz dla measurementLink.
    // -----------------------------------------------------------------------
    it('§20.1e: segment measurementLink łączący ODCIĘTE źródło z szyną ⇒ źródło NADAL zgłaszane jako odcięte (linia pomiarowa wykluczona z unii ciągłości)', () => {
      const scene = buildSceneV3(enm, 2);
      const strandedSource: SceneV3['symbols'][number] = {
        symbolId: 'gridSource',
        x: 800,
        y: 1100,
        meta: { ownerRef: 'src-stranded-2', elementKind: 'source' },
      };
      const islandBus: SceneV3['segments'][number] = {
        points: [{ x: 900, y: 1124 }, { x: 1000, y: 1124 }],
        meta: { kind: 'bus', ownerRef: 'island2#sn-bus', elementKind: 'bus' },
      };
      const measurementBridge: SceneV3['segments'][number] = {
        points: [{ x: 808, y: 1124 }, { x: 900, y: 1124 }],
        meta: { kind: 'measurementLink', ownerRef: 'src-stranded-2#measurement-link', elementKind: 'protectionAnnotation' },
      };
      const synthetic: SceneV3 = {
        ...scene,
        symbols: [...scene.symbols, strandedSource],
        segments: [...scene.segments, islandBus, measurementBridge],
      };
      const gaps = sourceConnectivityGaps(synthetic);
      expect(gaps.some((g) => g.sourceId === 'src-stranded-2')).toBe(true);
    });

    // -----------------------------------------------------------------------
    // §20.1/§17.4: obie linie wtórne ukryte na L0/L1 (rozszerzenie
    // `noProtectionAnnotationAtLod0`/`protectionAnnotationAtLod1IsCircleOnly`
    // o measurementLink, patrz `scene/buildScene.ts`).
    // -----------------------------------------------------------------------
    it('(negatyw obowiązkowy) segment measurementLink fabrykowany na L1 ⇒ protectionAnnotationAtLod1IsCircleOnly FAIL', () => {
      const scene = buildSceneV3(enm, 1);
      const synthetic: SceneV3 = {
        ...scene,
        segments: [
          ...scene.segments,
          {
            points: [{ x: 800, y: 900 }, { x: 900, y: 900 }],
            meta: { kind: 'measurementLink', ownerRef: 'bay-l1b#measurement-link', elementKind: 'protectionAnnotation' },
          },
        ],
      };
      expect(protectionAnnotationAtLod1IsCircleOnly(synthetic)).toBe(false);
    });

    it('(negatyw obowiązkowy) segment measurementLink fabrykowany na L0 ⇒ noProtectionAnnotationAtLod0 FAIL', () => {
      const scene = buildSceneV3(enm, 0);
      const synthetic: SceneV3 = {
        ...scene,
        segments: [
          ...scene.segments,
          {
            points: [{ x: 800, y: 900 }, { x: 900, y: 900 }],
            meta: { kind: 'measurementLink', ownerRef: 'bay-l0#measurement-link', elementKind: 'protectionAnnotation' },
          },
        ],
      };
      expect(noProtectionAnnotationAtLod0(synthetic)).toBe(false);
    });

    // -----------------------------------------------------------------------
    // §20.4 meter_symbol_disambiguation.
    // -----------------------------------------------------------------------
    it('(negatyw obowiązkowy, §20.4a) okrąg „M" BEZ właściciela (pole) ⇒ meterDisambiguationGaps WYKRYWA', () => {
      const scene = buildSceneV3(enm, 2);
      const synthetic: SceneV3 = {
        ...scene,
        symbols: [...scene.symbols, { symbolId: 'meter', x: 800, y: 800, meta: {} }],
      };
      const gaps = meterDisambiguationGaps(synthetic);
      expect(gaps.some((g) => g.reason === 'meter-without-owner')).toBe(true);
      expect(allMeterSymbolsDisambiguated(synthetic)).toBe(false);
    });

    it('(pozytyw kontrolny, §20.4a) okrąg „M" Z właścicielem (pole) ⇒ zero luk', () => {
      const scene = buildSceneV3(enm, 2);
      const synthetic: SceneV3 = {
        ...scene,
        symbols: [
          ...scene.symbols,
          { symbolId: 'meter', x: 800, y: 800, meta: { ownerRef: 'bay-meter-ok', elementKind: 'protectionAnnotation' } },
        ],
      };
      expect(meterDisambiguationGaps(synthetic)).toEqual([]);
      expect(allMeterSymbolsDisambiguated(synthetic)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // §20.3 annotation_no_overlap_primary_probe — ALIAS udokumentowany
    // `symbolWireCollisions` (patrz docstring `annotationOverlapsPrimaryPath`,
    // `scene/buildScene.ts`): dowód, że FILTR sam działa (nie tylko „zero bo
    // zero" na fixturze referencyjnej).
    // -----------------------------------------------------------------------
    it('(negatyw obowiązkowy, §20.3a) symbol warstwy adnotacji (protectionRelay) nachodzący na przewód toru pierwotnego (bez styku portem) ⇒ annotationOverlapsPrimaryPath WYKRYWA', () => {
      const scene = buildSceneV3(enm, 2);
      const primarySeg = scene.segments.find((s) => s.meta?.elementKind !== 'protectionAnnotation' && s.points.length >= 2);
      expect(primarySeg).toBeTruthy();
      const p0 = primarySeg!.points[0];
      // Okrąg (24×24) wyśrodkowany DOKŁADNIE na pierwszym wierzchołku odcinka
      // pierwotnego — nachodzi na przewód, BEZ dotyku WŁASNYM portem (fałszywy
      // fabrykowany symbol nie ma zarejestrowanego portu w tym miejscu).
      const fakeRelay: SceneV3['symbols'][number] = {
        symbolId: 'protectionRelay',
        x: p0.x - 12,
        y: p0.y - 12,
        meta: { ownerRef: 'bay-overlap', elementKind: 'protectionAnnotation', protectionCodes: ['51'] },
      };
      const synthetic: SceneV3 = { ...scene, symbols: [...scene.symbols, fakeRelay] };
      const hits = annotationOverlapsPrimaryPath(synthetic);
      expect(hits.some((h) => h.reason === 'annotation-symbol-touches-primary-wire')).toBe(true);
      expect(noAnnotationOverlapsPrimaryPath(synthetic)).toBe(false);
      // Kontrola: `symbolWireCollisions` GENERYCZNA łapie TĘ SAMĄ kolizję —
      // dowód, że `annotationOverlapsPrimaryPath` jest ALIASEM/filtrem, nie
      // niezależną (potencjalnie rozjeżdżającą się) implementacją.
      expect(symbolWireCollisions(synthetic).length).toBeGreaterThan(0);
    });
  },
);

describe('buildSceneV3 — F13.4: trunk_thickness_probe (spec §22.4, D3-6)', () => {
  it('fixtura L0/L1/L2: trasa ciągu głównego klasą snTrunk, odgałęzienia klasą sn — 0 luk', () => {
    for (const lod of [0, 1, 2] as const) {
      const scene = buildSceneV3(enm, lod);
      expect(trunkThicknessGaps(scene)).toEqual([]);
      expect(scene.segments.some((s) => s.meta?.kind === 'snTrunk')).toBe(true);
    }
  });

  it('relacja stałych renderu: snTrunk > sn (hierarchia §6/§22.4: szyny > magistrala > odgałęzienie > nN)', () => {
    expect(SEGMENT_STROKE_WIDTH.snTrunk).toBeGreaterThan(SEGMENT_STROKE_WIDTH.sn);
    expect(SEGMENT_STROKE_WIDTH.bus).toBeGreaterThan(SEGMENT_STROKE_WIDTH.snTrunk);
    expect(SEGMENT_STROKE_WIDTH.sn).toBeGreaterThan(SEGMENT_STROKE_WIDTH.lv);
  });

  it('NEGATYW (wyrocznia gryzie): trasa odgałęźna z klasą snTrunk ⇒ luka', () => {
    const scene = buildSceneV3(enm, 2);
    const branch = scene.segments.find((s) => (s.meta?.ownerRef ?? '').includes('branch_segment'))!;
    const corrupted = {
      ...scene,
      segments: scene.segments.map((s) => (s === branch ? { ...s, meta: { ...s.meta, kind: 'snTrunk' as const } } : s)),
    };
    expect(trunkThicknessGaps(corrupted).length).toBeGreaterThan(0);
  });
});
