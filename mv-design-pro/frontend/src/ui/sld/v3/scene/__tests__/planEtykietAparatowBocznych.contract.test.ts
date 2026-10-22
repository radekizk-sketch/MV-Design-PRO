/**
 * W2C-PLAN-ETYKIET — kontrakt planu etykiet APARATÓW BOCZNYCH (ES/VT/SA) pól SN.
 *
 * DEFEKT, KTÓRY TEN PLIK PRZYPINA. Kompozycja SLD v3 (`compose/station.ts`
 * `buildBayStack`) rozkłada aparat boczny na kotwicę toru wynikającą z jego
 * MIEJSCA W SEKWENCJI pola, a aparaty boczne różnych kotwic stawia w TEJ SAMEJ
 * kolumnie X. Porządek sekwencji ustalał dotąd wyłącznie adapter
 * (`projectBayPrimaryDevices`); kompozycja tylko zakładała go w komentarzu.
 * Deskryptor w kolejności surowej backendu ([DS, CB, CT, VT, DS, ES, SA,
 * głowica]) dawał więc przekładnik na kotwicy CT i uziemnik dwie kotwice niżej
 * w tej samej kolumnie — identyfikator „TV1" (kotwiczony POD przekładnikiem)
 * lądował na symbolu uziemnika, a przy powiększeniu pisma plan kanwy porzucał
 * tożsamość. Bramka dowodowa W2c (`scripts/render_schemat10_w2c.tsx`) to
 * pokazała. Naprawa: jedna funkcja porządku (`orderByPrimaryPlacement`,
 * `v2/domain/apparatusContracts.ts`) czytana przez adapter ORAZ przez plan i
 * kompozycję (`orderedSymbolPrimaryDevices`).
 *
 * ILOCZYN CECH (reguła KLASA §2): rola pola (DER_PV, DER_BESS, RMU_LINE,
 * RMU_TRANSFORMER; pola GPZ obecne w każdej scenie) × zestaw aparatów bocznych
 * ({QE}, {TV,QE}, {QE,F}, {TV,QE,F}) × kolejność aparatów w danych (posortowana,
 * surowa z przeplotem) × LOD (0/1/2) × każda skala, przy której LOD jest
 * aktywny w kamerze (`LABEL_PLAN_PRODUCTION_SCALES`). Dla każdego punktu:
 * zero porzuconych tożsamości, zero kolizji etykieta↔etykieta i etykieta↔rysunek,
 * zero napisów poza arkuszem, zero identyfikatorów aparatów narysowanych w
 * postaci skróconej (plan kanwy wolał „T…" po stronie zadeklarowanej od pełnego
 * „TV1" po stronie wolnej — `canvas/labelLegibility.ts` `najlepszeDopasowanie`); na L2 każdy aparat boczny ma narysowany
 * identyfikator, wszystkie aparaty boczne pola wiszą na JEDNEJ kotwicy, a
 * geometria pola nie zależy od kolejności aparatów w danych.
 */

import { describe, expect, it } from 'vitest';

import type { BayPrimaryDevice, BayPrimaryDeviceKind, BayPrimaryPlacement, EnergyNetworkModel } from '../../../../../types/enm';
import {
  DEFAULT_LOD_THRESHOLDS,
  LABEL_PLAN_PRODUCTION_SCALES,
  LOD_HYSTERESIS_MARGIN,
} from '../../canvas/camera';
import {
  planSceneLabels,
  plannedLabelCollisions,
  plannedLabelObstacleCollisions,
  plannedLabelsOutsideSheet,
} from '../../canvas/labelLegibility';
import { FIELD_ROLE, orderByPrimaryPlacement, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { BayPrimaryDeviceView, MiniBlockBayDescriptor } from '../../../v2/model/widokPolStacji';
import { rectsOverlap } from '../../core/grid';
import { LATERAL_APPARATUS_SYMBOLS } from '../../compose/apparatusSequence';
import { composeStation, type ComposeStationInput } from '../../compose/station';
import { computeBands } from '../../layout/bands';
import { computeColumns } from '../../layout/columns';
import { resolveLabels } from '../../layout/labels';
import { stationBlockHeight, type StationMeasureInput } from '../../layout/measure';
import { colorSegmentLabelRows, computeSegmentLabelSlotX } from '../../layout/segments';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { sheetSizeFor } from '../../sheet/outline';
import { buildSceneV3, sceneObstacleRects, type SceneLod, type SceneV3 } from '../buildScene';
import { buildDerSnFixture } from './fixtures/w2cDerSnFixtures';

const LODS: readonly SceneLod[] = [0, 1, 2];

type LateralKind = 'VT' | 'ES' | 'SURGE_ARRESTER';
const LATERAL_SETS: readonly (readonly LateralKind[])[] = [
  ['ES'],
  ['VT', 'ES'],
  ['ES', 'SURGE_ARRESTER'],
  ['VT', 'ES', 'SURGE_ARRESTER'],
];
type Order = 'posortowana' | 'surowa-przeplot';
const ORDERS: readonly Order[] = ['posortowana', 'surowa-przeplot'];

const LATERAL_PLACEMENT: Readonly<Record<LateralKind, BayPrimaryPlacement>> = {
  VT: 'OFF_PATH',
  ES: 'GROUND_BRANCH',
  SURGE_ARRESTER: 'GROUND_BRANCH',
};

function device(ref: string, kind: BayPrimaryDeviceKind, placement: BayPrimaryPlacement): BayPrimaryDevice {
  return {
    device_ref: ref,
    symbol_ref: `symbol:${kind.toLowerCase()}`,
    kind,
    placement,
    is_controllable: kind === 'CB' || kind === 'DS' || kind === 'LOAD_SWITCH',
    render_variant: 'kanoniczny',
  };
}

/** Sekwencja aparatów pola w zadanej kolejności: `posortowana` = tor szeregowy,
 *  potem aparaty boczne; `surowa-przeplot` = aparat boczny po KAŻDYM aparacie
 *  toru (ostatnie boczne po ostatnim aparacie toru) — najgorszy przypadek dla
 *  kotwic, bo rozkłada boczne na RÓŻNE węzły toru. */
function sequence(
  fieldRef: string,
  main: readonly (readonly [BayPrimaryDeviceKind, BayPrimaryPlacement])[],
  laterals: readonly LateralKind[],
  order: Order,
): BayPrimaryDevice[] {
  const mainDevices = main.map(([kind, placement], i) => device(`${fieldRef}/m${i}`, kind, placement));
  const lateralDevices = laterals.map((kind, i) => device(`${fieldRef}/b${i}`, kind, LATERAL_PLACEMENT[kind]));
  if (order === 'posortowana') return [...mainDevices, ...lateralDevices];
  const out: BayPrimaryDevice[] = [];
  mainDevices.forEach((d, i) => {
    out.push(d);
    if (i < lateralDevices.length && i < mainDevices.length - 1) out.push(lateralDevices[i]);
  });
  out.push(...lateralDevices.slice(Math.max(0, mainDevices.length - 1)));
  return out;
}

/** Rekord pola stacji (karta W5-B: typowany `Bay` w kolekcji `bays` jest jedynym nośnikiem
 *  pól — dawny słownik pól w `meta` stacji skasowany). Test podmienia sekwencję aparatów
 *  rekordu w miejscu, więc zwraca rekordy modelu, nie kopie. */
type RekordPola = { ref_id: string; primary_devices?: BayPrimaryDevice[] };

function polaStacji(enm: EnergyNetworkModel, stationRef: string): RekordPola[] {
  return ((enm.bays ?? []) as unknown as (RekordPola & { substation_ref?: string | null })[]).filter(
    (b) => b.substation_ref === stationRef,
  );
}

interface Scenario {
  readonly role: string;
  readonly enm: EnergyNetworkModel;
  readonly fieldRef: string;
  readonly lateralCount: number;
}

/** Scenariusz roli pola z zadanym zestawem aparatów bocznych i kolejnością. */
function scenario(role: string, laterals: readonly LateralKind[], order: Order): Scenario {
  if (role === 'DER_PV' || role === 'DER_BESS') {
    const { enm, stationRef, injected } = buildDerSnFixture([
      {
        technology: role === 'DER_PV' ? 'PV' : 'BESS',
        withVt: laterals.includes('VT'),
        withSa: laterals.includes('SURGE_ARRESTER'),
      },
    ]);
    const fieldRef = injected[0].ozeFieldRef;
    const spec = polaStacji(enm, stationRef).find((s) => s.ref_id === fieldRef)!;
    // Fixtura niesie kolejność surową backendu (VT po CT, ES/SA po drugim DS).
    if (order === 'posortowana') spec.primary_devices = orderByPrimaryPlacement(spec.primary_devices ?? []);
    return { role, enm, fieldRef, lateralCount: laterals.length };
  }
  const { enm, stationRef } = buildDerSnFixture([]);
  const specs = polaStacji(enm, stationRef);
  const suffix = role === 'RMU_LINE' ? '/sn_field/000' : '/sn_field/002';
  const spec = specs.find((s) => s.ref_id.endsWith(suffix))!;
  const main: readonly (readonly [BayPrimaryDeviceKind, BayPrimaryPlacement])[] =
    role === 'RMU_LINE'
      ? [['LOAD_SWITCH', 'UPSTREAM'], ['CT', 'MIDSTREAM'], ['CABLE_HEAD', 'DOWNSTREAM']]
      : [['FUSE', 'UPSTREAM'], ['CT', 'MIDSTREAM'], ['TRANSFORMER_DEVICE', 'DOWNSTREAM']];
  spec.primary_devices = sequence(spec.ref_id, main, laterals, order);
  return { role, enm, fieldRef: spec.ref_id, lateralCount: laterals.length };
}

function lateralSymbols(scene: SceneV3, fieldRef: string) {
  return scene.symbols.filter((s) => s.meta?.ownerRef === fieldRef && LATERAL_APPARATUS_SYMBOLS.has(s.symbolId));
}

function fieldGeometry(scene: SceneV3, fieldRef: string): string {
  return scene.symbols
    .filter((s) => s.meta?.ownerRef === fieldRef)
    .map((s) => `${s.symbolId}@${s.x},${s.y}`)
    .sort()
    .join(' ');
}

describe('W2C-PLAN-ETYKIET — skale produkcyjne planu etykiet leżą w paśmie aktywności LOD kamery', () => {
  it('każda skala z LABEL_PLAN_PRODUCTION_SCALES mieści się w domkniętym paśmie histerezy swojego LOD', () => {
    const { l0Max, l1Max } = DEFAULT_LOD_THRESHOLDS;
    const m = LOD_HYSTERESIS_MARGIN;
    const eps = 1e-9;
    const pasmo: Readonly<Record<SceneLod, readonly [number, number]>> = {
      0: [0, l0Max * (1 + m)],
      1: [l0Max * (1 - m), l1Max * (1 + m)],
      2: [l1Max * (1 - m), Number.POSITIVE_INFINITY],
    };
    for (const lod of LODS) {
      expect(LABEL_PLAN_PRODUCTION_SCALES[lod].length).toBeGreaterThan(0);
      for (const scale of LABEL_PLAN_PRODUCTION_SCALES[lod]) {
        expect(scale, `L${lod} @${scale}`).toBeGreaterThanOrEqual(pasmo[lod][0] - eps);
        expect(scale, `L${lod} @${scale}`).toBeLessThanOrEqual(pasmo[lod][1] + eps);
      }
    }
  });
});

describe('W2C-PLAN-ETYKIET — rola pola × aparaty boczne × kolejność danych × LOD × skala', () => {
  for (const role of ['DER_PV', 'DER_BESS', 'RMU_LINE', 'RMU_TRANSFORMER']) {
    for (const laterals of LATERAL_SETS) {
      for (const order of ORDERS) {
        it(`${role} · {${laterals.join(', ')}} · kolejność ${order}`, () => {
          const s = scenario(role, laterals, order);
          for (const lod of LODS) {
            const scene = buildSceneV3(s.enm, lod);
            const obstacles = sceneObstacleRects(scene);
            const sheet = sheetSizeFor(scene);
            const lateralIdRefs = scene.labels
              .filter((l) => l.ownerRef.startsWith(`${s.fieldRef}#apparatus-id-`) && l.ownerRef.includes('-lateral-'))
              .map((l) => l.ownerRef);
            if (lod === 2) {
              const boczne = lateralSymbols(scene, s.fieldRef);
              expect(boczne.length, 'aparaty boczne pola na scenie').toBe(s.lateralCount);
              // Jedna kotwica: wszystkie aparaty boczne pola wiszą na tym samym węźle toru.
              expect(new Set(boczne.map((b) => b.y)).size, 'aparaty boczne na jednej kotwicy').toBe(1);
              expect(lateralIdRefs.length, 'identyfikator każdego aparatu bocznego').toBe(s.lateralCount);
            } else {
              // §6 SLD_LOD_SPEC: identyfikatory aparatów należą do PEŁNEGO detalu.
              expect(lateralIdRefs).toEqual([]);
            }
            for (const scale of LABEL_PLAN_PRODUCTION_SCALES[lod]) {
              const plan = planSceneLabels(scene.labels, obstacles, scale, sheet);
              const at = `L${lod} @${scale}`;
              expect(plan.droppedIdentity.map((l) => l.ownerRef), `${at}: porzucone tożsamości`).toEqual([]);
              expect(plannedLabelCollisions(plan), `${at}: etykieta↔etykieta`).toEqual([]);
              expect(plannedLabelObstacleCollisions(plan, obstacles), `${at}: etykieta↔symbol/tor`).toEqual([]);
              expect(plannedLabelsOutsideSheet(plan, sheet), `${at}: poza arkuszem`).toEqual([]);
              expect(
                plan.drawn
                  .filter((p) => p.label.ownerRef.includes('#apparatus-id-') && p.text !== p.label.text)
                  .map((p) => `${p.label.text}→${p.text}`),
                `${at}: identyfikatory aparatów skrócone`,
              ).toEqual([]);
              const drawn = new Set(plan.drawn.map((p) => p.label.ownerRef));
              expect(lateralIdRefs.filter((ref) => !drawn.has(ref)), `${at}: identyfikatory boczne nienarysowane`).toEqual([]);
            }
          }
        });
      }
      it(`${role} · {${laterals.join(', ')}} · geometria pola niezależna od kolejności aparatów w danych (L2)`, () => {
        const posortowana = scenario(role, laterals, 'posortowana');
        const surowa = scenario(role, laterals, 'surowa-przeplot');
        expect(fieldGeometry(buildSceneV3(surowa.enm, 2), surowa.fieldRef)).toBe(
          fieldGeometry(buildSceneV3(posortowana.enm, 2), posortowana.fieldRef),
        );
      });
    }
  }

  // Scalenie z gałęzią UI/UX (karta GEOMETRIA-STACJI §0 pkt 4, przepisanie do kanonu z
  // zachowaniem intencji): aparaty pola GPZ pochodzą WYŁĄCZNIE z rekordów modelu — stos
  // konwencji roli zniknął, a pole bez rekordów ma jedną sylwetkę „brak danych wyposażenia
  // pola". Uziemnik boczny GPZ istnieje więc tylko wtedy, gdy rekord pola go niesie: test
  // dopisuje polom GPZ fikstury rekordy aparatów z uziemnikiem (GROUND_BRANCH) i dalej
  // sprawdza to samo — scena niesie aparaty boczne GPZ, plan etykiet bez kolizji.
  it('pola GPZ (rekordy modelu, uziemnik boczny) — scena niesie aparaty boczne GPZ, plan bez kolizji na każdym LOD i skali', () => {
    const { enm } = buildDerSnFixture([]);
    for (const bay of (enm.bays ?? []) as unknown as RekordPola[]) {
      if (!bay.ref_id.startsWith('gpz/')) continue;
      bay.primary_devices = sequence(
        bay.ref_id,
        [['DS', 'UPSTREAM'], ['CB', 'MIDSTREAM'], ['CT', 'MIDSTREAM'], ['CABLE_HEAD', 'DOWNSTREAM']],
        ['ES'],
        'surowa-przeplot',
      );
    }
    const gpzLaterals = buildSceneV3(enm, 2).symbols.filter(
      (s) => LATERAL_APPARATUS_SYMBOLS.has(s.symbolId) && String(s.meta?.ownerRef ?? '').startsWith('gpz/'),
    );
    expect(gpzLaterals.length).toBeGreaterThan(0);
    for (const lod of LODS) {
      const scene = buildSceneV3(enm, lod);
      const obstacles = sceneObstacleRects(scene);
      const sheet = sheetSizeFor(scene);
      for (const scale of LABEL_PLAN_PRODUCTION_SCALES[lod]) {
        const plan = planSceneLabels(scene.labels, obstacles, scale, sheet);
        expect(plan.droppedIdentity, `L${lod} @${scale}`).toEqual([]);
        expect(plannedLabelCollisions(plan), `L${lod} @${scale}`).toEqual([]);
        expect(plannedLabelObstacleCollisions(plan, obstacles), `L${lod} @${scale}`).toEqual([]);
        expect(
          plan.drawn.filter((p) => p.label.ownerRef.includes('#apparatus-id-') && p.text !== p.label.text),
          `L${lod} @${scale}: identyfikatory aparatów skrócone`,
        ).toEqual([]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Druga strona pary: KOMPOZYCJA nie może zależeć od tego, czy producent
// deskryptora posortował aparaty. Scena produkcyjna przechodzi przez adapter,
// który sortuje — więc test sceny wyżej NIE zauważyłby kompozycji, która
// znowu zaczęłaby ufać kolejności wejścia. Ten blok podaje `composeStation`
// deskryptor w kolejności surowej wprost (ścieżka skryptów dowodowych i
// każdego przyszłego producenta deskryptora).
// ---------------------------------------------------------------------------

const COMPOSE_MAIN: Readonly<Record<string, readonly (readonly [BayPrimaryDeviceKind, BayPrimaryPlacement])[]>> = {
  DER_PV: [['DS', 'UPSTREAM'], ['CB', 'MIDSTREAM'], ['CT', 'MIDSTREAM'], ['DS', 'MIDSTREAM'], ['CABLE_HEAD', 'DOWNSTREAM']],
  DER_BESS: [['DS', 'UPSTREAM'], ['CB', 'MIDSTREAM'], ['CT', 'MIDSTREAM'], ['DS', 'MIDSTREAM'], ['CABLE_HEAD', 'DOWNSTREAM']],
  RMU_LINE: [['LOAD_SWITCH', 'UPSTREAM'], ['CT', 'MIDSTREAM'], ['CABLE_HEAD', 'DOWNSTREAM']],
  RMU_TRANSFORMER: [['FUSE', 'UPSTREAM'], ['CT', 'MIDSTREAM'], ['TRANSFORMER_DEVICE', 'DOWNSTREAM']],
};

function viewOf(d: BayPrimaryDevice): BayPrimaryDeviceView {
  return { kind: d.kind, placement: d.placement, deviceRef: d.device_ref };
}

function composeOne(role: string, devices: readonly BayPrimaryDevice[]) {
  const bay: MiniBlockBayDescriptor = {
    bayRef: 'pole',
    fieldRole: FIELD_ROLE[role as keyof typeof FIELD_ROLE] as FieldRole,
    designation: role,
    hasMissingRequiredDevice: false,
    primaryDevices: devices.map(viewOf),
  };
  const station: StationMeasureInput = {
    id: 'st',
    name: 'Stacja',
    stationCode: 'S01',
    transformerRatedKva: null,
    stationTypeLabel: 'stacja SN',
    snBays: [bay],
  };
  const rows = colorSegmentLabelRows(computeSegmentLabelSlotX([station], [null]));
  const bands = computeBands(
    [{ incomingSegmentLabelText: null, portCaptionHeight: 0, stationBlockHeight: stationBlockHeight(station), nameBandHeight: 48 }],
    rows.rowCount,
  );
  const { columns } = computeColumns({
    stations: [station],
    incomingSegmentLabelTexts: [null],
    nameSlotBand: bands.bands.B5,
    segmentSlotBand: bands.bands.B1,
  });
  const input: ComposeStationInput = {
    station,
    column: { x: columns[0].x, width: columns[0].width, tapX: columns[0].tapX },
    busAxisY: bands.bands.B2.y,
    blockTopY: bands.bands.B4.y,
    nameSlot: columns[0].nameSlot,
  };
  return composeStation(input);
}

describe('W2C-PLAN-ETYKIET — composeStation: deskryptor w kolejności surowej × rola pola × aparaty boczne', () => {
  for (const role of Object.keys(COMPOSE_MAIN)) {
    for (const laterals of LATERAL_SETS) {
      it(`${role} · {${laterals.join(', ')}}: geometria jak dla kolejności posortowanej, identyfikator boczny nie leży na symbolu`, () => {
        const sorted = composeOne(role, sequence('pole', COMPOSE_MAIN[role], laterals, 'posortowana'));
        const raw = composeOne(role, sequence('pole', COMPOSE_MAIN[role], laterals, 'surowa-przeplot'));
        const symbolRects = raw.symbols.map((sym) => ({
          x: sym.x,
          y: sym.y,
          width: SYMBOL_DEFS[sym.symbolId].width,
          height: SYMBOL_DEFS[sym.symbolId].height,
        }));
        const lateralIds = resolveLabels({ simpleAnchored: raw.labels.apparatus }).filter((l) =>
          l.ownerRef.includes('-lateral-'),
        );
        expect(lateralIds.length).toBe(laterals.length);
        for (const label of lateralIds) {
          expect(symbolRects.filter((r) => rectsOverlap(label.rect, r)), label.ownerRef).toEqual([]);
        }
        const geometry = (c: ReturnType<typeof composeOne>): string =>
          c.symbols.map((sym) => `${sym.symbolId}@${sym.x},${sym.y}`).sort().join(' ');
        expect(geometry(raw)).toBe(geometry(sorted));
      });
    }
  }
});
