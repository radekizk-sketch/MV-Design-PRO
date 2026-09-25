/**
 * TR2W-BEZ-POLA — KOTWICA TOPOLOGICZNA kolumny transformatora bez pola roli TR
 * (karta naprawcza §0.C.2/§0.C.3; `REJESTR_KONFLIKTOW.md`, wiersz
 * BUGI-PRODUKTU-E2E).
 *
 * ROZSTRZYGNIĘCIE, KTÓRE TEN PLIK PILNUJE. Miejsce kolumny transformatora
 * wynika z jego TERMINALA WN (`Transformer.hv_bus_ref`) → sekcji szyn, do
 * której ten terminal należy → wolnego slotu W OBRĘBIE tej sekcji. Reguła
 * pozycyjna („kolumna za ostatnim polem rozdzielnicy") daje ten sam wynik
 * WYŁĄCZNIE na rozdzielnicy jednosekcyjnej; na rozdzielnicy sekcjonowanej
 * (dwa systemy szyn, sprzęgło, TR1 zasilany z sekcji A i TR2 z sekcji B)
 * postawiłaby oba transformatory na końcu bloku, czyli SKŁAMAŁA o tym, skąd
 * który transformator jest zasilany. To informacja ruchowa, nie kosmetyka —
 * dlatego jest przypięta testem, a nie tylko opisana w docstringu (reguła
 * KLASA §4: „deklaracja bez testu = fałszywa pewność").
 *
 * DLACZEGO TU, A NIE NA SCENIE. Fixtury referencyjne nie niosą stacji SN/nN z
 * sekcjonowaną rozdzielnicą i dwoma transformatorami, a operacja domenowa
 * backendu (`insert_station_on_segment_sn`) takiej stacji nie produkuje —
 * fixtura ENM byłaby więc zmyśleniem kształtu danych, którego kreator nie
 * generuje. Kotwica mieszka w `layout/measure.ts` `stationSnColumnLayout` i
 * `compose/station.ts`, i dokładnie tam jest ćwiczona: wejściem jest
 * `StationMeasureInput` — ten sam kontrakt, który `scene/buildScene.ts`
 * buduje z adaptera. Pełny łańcuch adapter→scena dla stacji jednosekcyjnej
 * pokrywa `scene/__tests__/buildScene.tr2wBezPola.test.ts`.
 *
 * ILOCZYN CECH: {1 sekcja, 2 sekcje} × {1 TR, 2 TR} × {terminal WN pasujący,
 * niepasujący, pusty} × {pole TR obecne/nieobecne}.
 */
import { describe, expect, it } from 'vitest';

import { GRID, snapUp } from '../../core/grid';

import { FIELD_ROLE, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import { computeBands, type StationBandHeights } from '../../layout/bands';
import { computeColumns } from '../../layout/columns';
import {
  colorSegmentLabelRows,
  computeSegmentLabelSlotX,
} from '../../layout/segments';
import {
  bayStackCenterX,
  implicitStationTransformers,
  LV_PORTAL_WIDTH,
  lvTerminalPortXs,
  planLvTerminal,
  requiredStationWidth,
  STATION_TR_FIELD_GAP_TEXT,
  stationBlockHeight,
  stationBlockWidth,
  stationHasLvSide,
  stationSnColumnLayout,
  type StationMeasureInput,
} from '../../layout/measure';
import { composeStation, type ComposeStationInput, type StationComposition } from '../station';
import type { StationTransformerUnit } from '../../../../network-build/stationTransformerSelection';

const SEKCJA_A = 'stn/test/sn_bus_a';
const SEKCJA_B = 'stn/test/sn_bus_b';

function makeBay(
  fieldRole: FieldRole,
  index: number,
  busRef?: string,
): MiniBlockBayDescriptor {
  return {
    bayRef: `bay-${index}`,
    fieldRole,
    designation: `Pole ${index}`,
    hasMissingRequiredDevice: false,
    busRef,
  };
}

/**
 * Jednostka transformatorowa dla testów KOTWICY TOPOLOGICZNEJ (patrz docstring
 * modułu) — pola tabliczki (T3: `hvVoltageKv`/`designation`/`snMva`/`uhvKv`/
 * `ulvKv`/`ukPercent`/`vectorGroup`) są tu poza przedmiotem badania (ten plik
 * bada WYŁĄCZNIE pozycję kolumny wg `hvBusRef`/`lvBusRef`), więc `null` —
 * dozwolone wprost przez `StationTransformerUnit` (migawka bez tabliczki).
 */
function trUnit(ref: string, hvBusRef: string | null, lvBusRef: string | null): StationTransformerUnit {
  return {
    ref,
    hvBusRef,
    lvBusRef,
    hvVoltageKv: null,
    designation: null,
    snMva: null,
    uhvKv: null,
    ulvKv: null,
    ukPercent: null,
    vectorGroup: null,
  };
}

function makeStation(
  id: string,
  snBays: readonly MiniBlockBayDescriptor[],
  overrides: Partial<StationMeasureInput> = {},
): StationMeasureInput {
  return {
    id,
    name: `Stacja ${id}`,
    stationCode: 'S01',
    transformerRatedKva: 630,
    stationTypeLabel: 'stacja przelotowa',
    snBays,
    ...overrides,
  };
}

function buildComposeInput(station: StationMeasureInput): ComposeStationInput {
  const rows = colorSegmentLabelRows(computeSegmentLabelSlotX([station], [null]));
  const bandHeights: StationBandHeights = {
    incomingSegmentLabelText: null,
    portCaptionHeight: 0,
    stationBlockHeight: stationBlockHeight(station),
    nameBandHeight: 40,
  };
  const bands = computeBands([bandHeights], rows.rowCount);
  const { columns } = computeColumns({
    stations: [station],
    incomingSegmentLabelTexts: [null],
    nameSlotBand: bands.bands.B5,
    segmentSlotBand: bands.bands.B1,
  });
  const column = columns[0];
  return {
    station,
    column: { x: column.x, width: column.width, tapX: column.tapX },
    busAxisY: bands.bands.B2.y,
    blockTopY: bands.bands.B4.y,
    nameSlot: column.nameSlot,
    hasLvSection: stationHasLvSide(station),
  };
}

const compose = (station: StationMeasureInput): StationComposition =>
  composeStation(buildComposeInput(station));

const transformatory = (c: StationComposition) =>
  c.symbols.filter((s) => s.symbolId === 'transformer2W');

/** Rozdzielnica JEDNOSEKCYJNA (wszystkie pola na tej samej szynie). */
const jednaSekcja = (units: StationMeasureInput['transformerUnits']): StationMeasureInput =>
  makeStation('s-1sekcja', [
    makeBay(FIELD_ROLE.RMU_LINE, 0, SEKCJA_A),
    makeBay(FIELD_ROLE.RMU_LINE, 1, SEKCJA_A),
  ], { hasTransformer: true, transformerUnits: units });

/** Rozdzielnica SEKCJONOWANA: pola 0-1 na sekcji A, sprzęgło, pola 3-4 na B. */
const dwieSekcje = (units: StationMeasureInput['transformerUnits']): StationMeasureInput =>
  makeStation('s-2sekcje', [
    makeBay(FIELD_ROLE.RMU_LINE, 0, SEKCJA_A),
    makeBay(FIELD_ROLE.RMU_LINE, 1, SEKCJA_A),
    makeBay(FIELD_ROLE.COUPLER, 2, SEKCJA_A),
    makeBay(FIELD_ROLE.RMU_LINE, 3, SEKCJA_B),
    makeBay(FIELD_ROLE.RMU_LINE, 4, SEKCJA_B),
  ], { hasTransformer: true, transformerUnits: units });

// ---------------------------------------------------------------------------
// T4 — DWA transformatory na JEDNEJ sekcji.
// ---------------------------------------------------------------------------

describe('TR2W-BEZ-POLA T4 — 2× transformator na jednej sekcji: dwa niezależne tory', () => {
  const station = jednaSekcja([
    trUnit('tr/1', SEKCJA_A, 'stn/test/nn_bus_1'),
    trUnit('tr/2', SEKCJA_A, 'stn/test/nn_bus_2'),
  ]);

  it('plan kolumn: DWIE kolumny transformatora, każda z WŁASNYM realnym refem', () => {
    const plan = stationSnColumnLayout(station, 0);
    const tr = plan.filter((p) => p.kind === 'transformer');
    expect(tr.map((p) => p.transformerRef)).toEqual(['tr/1', 'tr/2']);
    // Rozdzielnica jednosekcyjna ⇒ sekcja rozstrzygnięta dla obu.
    expect(tr.every((p) => p.sectionResolved)).toBe(true);
    // Kolumny są ROZŁĄCZNE (nie leżą na sobie).
    expect(tr[0].leftX + tr[0].width).toBeLessThanOrEqual(tr[1].leftX);
  });

  it('kompozycja: dwa symbole, dwa PIONY zejścia, dwa zaczepy na szynie nN', () => {
    const c = compose(station);
    const tr = transformatory(c);
    expect(tr.map((s) => s.transformerRef)).toEqual(['tr/1', 'tr/2']);
    expect(tr[0].x).not.toBe(tr[1].x);
    expect(c.segments.filter((s) => s.ownerRef === 'tr/1#descent')).toHaveLength(1);
    expect(c.segments.filter((s) => s.ownerRef === 'tr/2#descent')).toHaveLength(1);
    // Szyna nN spina OBA transformatory (dwa zejścia `#lv-drop-*`).
    expect(c.segments.filter((s) => s.ownerRef.includes('#lv-drop-'))).toHaveLength(2);
    expect(c.segments.filter((s) => s.ownerRef.endsWith('#lv-bus'))).toHaveLength(1);
  });

  it('OBA transformatory oznaczone jako stan niekompletny (nie tylko pierwszy)', () => {
    const c = compose(station);
    expect(transformatory(c).map((s) => s.transformerFieldGap)).toEqual([true, true]);
    expect(c.missingData).toContain('station.transformer.brakPolaSN:tr/1');
    expect(c.missingData).toContain('station.transformer.brakPolaSN:tr/2');
  });

  it('rezerwacja szerokości bloku OBEJMUJE obie kolumny (measure↔compose)', () => {
    const bezTr = jednaSekcja([]);
    const szerokoscZ = stationBlockWidth(station);
    const szerokoscBez = stationBlockWidth({ ...bezTr, hasTransformer: false });
    expect(szerokoscZ).toBeGreaterThan(szerokoscBez);
    // Rysunek mieści się w rezerwacji: prawa krawędź ostatniego symbolu nie
    // wychodzi poza blok policzony przez measure.
    const c = compose(station);
    const plan = stationSnColumnLayout(station, 0);
    const prawaKrawedz = Math.max(...plan.map((p) => p.leftX + p.width));
    expect(prawaKrawedz - 8).toBe(szerokoscZ);
    expect(transformatory(c)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// T5 — TR1 na sekcji A, TR2 na sekcji B: KAŻDY ZE SWOJEJ SEKCJI.
// ---------------------------------------------------------------------------

describe('TR2W-BEZ-POLA T5 — rozdzielnica sekcjonowana: każdy transformator ze swojej sekcji', () => {
  const station = dwieSekcje([
    trUnit('tr/A', SEKCJA_A, 'stn/test/nn_bus_a'),
    trUnit('tr/B', SEKCJA_B, 'stn/test/nn_bus_b'),
  ]);

  it('kolumna TR sekcji A leży W OBRĘBIE sekcji A — MIĘDZY polami, nie na końcu bloku', () => {
    const plan = stationSnColumnLayout(station, 0);
    const kolejnosc = plan.map((p) =>
      p.kind === 'transformer' ? `TR:${p.transformerRef}` : `pole:${p.bayIndex}`,
    );
    // Sekcja A: pola 0,1,2 (ze sprzęgłem) → TR/A → sekcja B: pola 3,4 → TR/B.
    expect(kolejnosc).toEqual([
      'pole:0', 'pole:1', 'pole:2', 'TR:tr/A', 'pole:3', 'pole:4', 'TR:tr/B',
    ]);
  });

  it('geometria: TR sekcji A stoi NA LEWO od pierwszego pola sekcji B', () => {
    const c = compose(station);
    const tr = transformatory(c);
    const trA = tr.find((s) => s.transformerRef === 'tr/A')!;
    const trB = tr.find((s) => s.transformerRef === 'tr/B')!;
    const osPola3 = bayStackCenterX(station, 3, 0)!;
    const osPola4 = bayStackCenterX(station, 4, 0)!;
    expect(trA.x).toBeLessThan(osPola3);
    expect(trB.x).toBeGreaterThan(osPola4);
  });

  it('CZUŁOŚĆ: zamiana sekcji terminala WN PRZESTAWIA kolumnę — kotwica jest naprawdę topologiczna', () => {
    // Ten sam zbiór pól, ten sam zbiór transformatorów, RÓŻNE terminale WN.
    const zamienione = dwieSekcje([
      trUnit('tr/A', SEKCJA_B, 'stn/test/nn_bus_a'),
      trUnit('tr/B', SEKCJA_A, 'stn/test/nn_bus_b'),
    ]);
    const kolejnosc = (s: StationMeasureInput): string[] =>
      stationSnColumnLayout(s, 0).map((p) =>
        p.kind === 'transformer' ? `TR:${p.transformerRef}` : `pole:${p.bayIndex}`,
      );
    expect(kolejnosc(zamienione)).toEqual([
      'pole:0', 'pole:1', 'pole:2', 'TR:tr/B', 'pole:3', 'pole:4', 'TR:tr/A',
    ]);
    expect(kolejnosc(zamienione)).not.toEqual(kolejnosc(station));
  });

  it('oś przęsła pola sekcji B UWZGLĘDNIA wstawioną kolumnę TR sekcji A (jedna suma prefiksowa)', () => {
    const bezTr = dwieSekcje([]);
    const zTr = station;
    // Pole 3 (pierwsze sekcji B) przesuwa się w prawo dokładnie dlatego, że
    // przed nim stanęła kolumna transformatora sekcji A.
    expect(bayStackCenterX(zTr, 3, 0)!).toBeGreaterThan(
      bayStackCenterX({ ...bezTr, hasTransformer: false }, 3, 0)!,
    );
    // …a pole 0 (przed wstawką) NIE drgnęło — dowód, że różnica pochodzi z
    // wstawionej kolumny, a nie z ogólnego przesunięcia bloku.
    expect(bayStackCenterX(zTr, 0, 0)!).toBe(
      bayStackCenterX({ ...bezTr, hasTransformer: false }, 0, 0)!,
    );
  });

  it('rysunek zgadza się z planem: X pionu zejścia KAŻDEGO pola == oś z measure', () => {
    const input = buildComposeInput(station);
    const c = composeStation(input);
    station.snBays.forEach((bay, index) => {
      const zejscie = c.segments.find((s) => s.ownerRef === `${bay.bayRef}#descent`);
      expect(zejscie, `pion zejścia pola ${bay.bayRef}`).toBeDefined();
      expect(bayStackCenterX(station, index, input.column.x)).toBe(zejscie!.points[0].x);
    });
  });
});

// ---------------------------------------------------------------------------
// Degradacja bez zgadywania + pole TR obecne (ścieżka dzisiejsza).
// ---------------------------------------------------------------------------

describe('TR2W-BEZ-POLA — degradacja bez zgadywania sekcji', () => {
  it('terminal WN nie pasuje do ŻADNEJ sekcji ⇒ koniec bloku + JAWNY ślad, nie cicha sekcja A', () => {
    const station = dwieSekcje([
      trUnit('tr/obcy', 'stn/inna-stacja/sn_bus', null),
    ]);
    const plan = stationSnColumnLayout(station, 0);
    const tr = plan.filter((p) => p.kind === 'transformer');
    expect(tr).toHaveLength(1);
    expect(tr[0].sectionResolved).toBe(false);
    // Kolumna NA KOŃCU bloku (za ostatnim polem), nie w środku.
    expect(plan[plan.length - 1].transformerRef).toBe('tr/obcy');
    expect(compose(station).missingData).toContain(
      'station.transformer.sectionUnresolved:tr/obcy',
    );
  });

  it('terminal WN PUSTY (rekord Transformer nieobecny w migawce) ⇒ ten sam ślad', () => {
    const station = dwieSekcje([trUnit('tr/bezTerminala', null, null)]);
    expect(compose(station).missingData).toContain(
      'station.transformer.sectionUnresolved:tr/bezTerminala',
    );
  });

  it('rozdzielnica BEZ zadeklarowanych sekcji ⇒ NIE zgłaszamy luki (nie ma czego rozstrzygać)', () => {
    const station = makeStation('s-bez-busref', [
      makeBay(FIELD_ROLE.RMU_LINE, 0),
      makeBay(FIELD_ROLE.RMU_LINE, 1),
    ], {
      hasTransformer: true,
      transformerUnits: [trUnit('tr/1', 'stn/test/sn_bus', null)],
    });
    const plan = stationSnColumnLayout(station, 0);
    expect(plan.filter((p) => p.kind === 'transformer')[0].sectionResolved).toBe(true);
    expect(
      compose(station).missingData.filter((m) => m.startsWith('station.transformer.sectionUnresolved')),
    ).toEqual([]);
  });

  it('fakt domenowy BEZ refu ⇒ ZERO symboli i jawny `refMissing` (zakaz rysunku na wymyślonym refie)', () => {
    const station = jednaSekcja([]);
    const c = compose({ ...station, hasTransformer: true, transformerUnits: [] });
    expect(transformatory(c)).toHaveLength(0);
    expect(c.missingData).toContain('station.transformer.refMissing');
  });
});

describe('TR2W-BEZ-POLA — przypadki brzegowe planu kolumn', () => {
  // Reguła KLASA §2: iloczyn cech, nie przykład z karty. Stacja z
  // transformatorem, ale BEZ ŻADNEGO pola SN, jest kształtem, który dane
  // dopuszczają (stacja utworzona bez `sn_fields`) — plan kolumn musi go
  // udźwignąć, bo dotąd blok o zerowej liczbie pól miał zerową szerokość.
  const bezPol = makeStation('s-zero-pol', [], {
    hasTransformer: true,
    transformerUnits: [trUnit('tr/1', 'stn/test/sn_bus', 'stn/test/nn_bus')],
  });

  it('stacja BEZ pól SN, z transformatorem: jedna kolumna, niezerowa szerokość i wysokość bloku', () => {
    const plan = stationSnColumnLayout(bezPol, 0);
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe('transformer');
    expect(stationBlockWidth(bezPol)).toBe(32);
    expect(stationBlockHeight(bezPol)).toBeGreaterThan(0);
  });

  it('stacja BEZ pól SN i BEZ transformatora: zero kolumn, zerowa szerokość (stan sprzed karty)', () => {
    const pusta = makeStation('s-pusta', []);
    expect(stationSnColumnLayout(pusta, 0)).toEqual([]);
    expect(stationBlockWidth(pusta)).toBe(0);
  });

  it('kompozycja stacji bez pól rysuje transformator i stronę nN', () => {
    const c = compose(bezPol);
    expect(transformatory(c)).toHaveLength(1);
    expect(c.segments.filter((x) => x.ownerRef.endsWith('#lv-bus'))).toHaveLength(1);
    expect(c.segments.filter((x) => x.ownerRef === 'tr/1#descent')).toHaveLength(1);
  });
});

describe('TR2W-BEZ-POLA — stacja Z polem TR: ścieżka dzisiejsza nietknięta', () => {
  const zPolem = makeStation('s-z-polem', [
    makeBay(FIELD_ROLE.RMU_LINE, 0, SEKCJA_A),
    makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1, SEKCJA_A),
  ], {
    hasTransformer: true,
    transformerUnits: [trUnit('tr/1', SEKCJA_A, 'stn/test/nn_bus')],
  });

  it('ZERO kolumn implicit — transformator jest elementem stosu pola', () => {
    expect(implicitStationTransformers(zPolem)).toEqual([]);
    expect(stationSnColumnLayout(zPolem, 0).every((p) => p.kind === 'bay')).toBe(true);
  });

  it('plan kolumn IDENTYCZNY z wariantem bez danych o transformatorze (zero regresu geometrii)', () => {
    const bezDanych = makeStation('s-z-polem', zPolem.snBays);
    expect(stationSnColumnLayout(zPolem, 0)).toEqual(stationSnColumnLayout(bezDanych, 0));
    expect(stationBlockWidth(zPolem)).toBe(stationBlockWidth(bezDanych));
  });

  it('BEZ markera i BEZ śladu braku pola (transformator ma swoje pole)', () => {
    const c = compose(zPolem);
    expect(transformatory(c).every((s) => s.transformerFieldGap === undefined)).toBe(true);
    expect(c.missingData.filter((m) => m.startsWith('station.transformer.'))).toEqual([]);
  });

  it('pasmo nazw NIE niesie zdania o braku pola w ŻADNYM wariancie (treść żyje w podpowiedzi)', () => {
    // Zapadka na powrót wiersza-adnotacji do pasma nazw: to on rozsadzał
    // szerokość kolumny stacji (239 j.św. w t4 wobec 184 najszerszego wiersza
    // danych) i zdejmował skalę „Dopasuj widok" poniżej progów KD-11/K11-A.
    for (const st of [zPolem, jednaSekcja([trUnit('tr/1', SEKCJA_A, null)])]) {
      const c = compose(st);
      expect(c.labels.stationName.rows.some((r) => r.text === STATION_TR_FIELD_GAP_TEXT)).toBe(false);
    }
  });

  it('szerokość kolumny stacji BEZ pola TR nie rośnie o adnotację ani o portal (kolumna transformatora, nic ponadto — portal domeny nN mieści się w jej obrysie)', () => {
    const zTr = jednaSekcja([trUnit('tr/1', SEKCJA_A, null)]);
    const bezTr = makeStation('s-1sekcja', zTr.snBays);
    // Różnica bazy bloku = SAMA kolumna transformatora (32) + światło (8).
    expect(stationBlockWidth(zTr) - stationBlockWidth(bezTr)).toBe(40);
    // Portal domeny nN stoi NA OSI portu LV (LV Domain Projection po B-02,
    // `planLvTerminal` — JEDNA prawda z kompozycją) i nie wystaje za prawą
    // krawędź bloku: rezerwacja kolumny rośnie WYŁĄCZNIE o kolumnę TR, nigdy o
    // wiersz adnotacji ani o portal (pomiar 2026-09-01: portal doklejony ZA
    // blokiem łamał arkusz L0 golden sieci 53 stacji z 2 na 3 wiersze).
    // `bx` kompozycji względem `column.x`: blok zaczyna się na GRID.
    const plan = planLvTerminal(lvTerminalPortXs(zTr), {
      hasLoad: false,
      hasNnDer: false,
      derRowFlushX: GRID + stationBlockWidth(zTr) + GRID,
    });
    const portalOverhang = Math.max(0, plan.portalCenterX + LV_PORTAL_WIDTH / 2 - (GRID + stationBlockWidth(zTr)));
    expect(portalOverhang).toBe(0);
    expect(requiredStationWidth(zTr) - requiredStationWidth(bezTr)).toBeLessThanOrEqual(snapUp(40));
  });
});
