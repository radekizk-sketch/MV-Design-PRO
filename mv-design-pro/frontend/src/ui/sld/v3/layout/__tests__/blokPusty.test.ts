/**
 * BLOK-PUSTY — WYROCZNIE KARTY (zgłoszenie właściciela 2026-08-07, pkt 6:
 * „wnętrze ramy stacji w większości puste"; zrzuty
 * `docs/sld/audyt-2026-08/blok-{przed,po}-{ciemny,jasny}.png`).
 *
 * CO KARTA ZMIENIŁA I CO TU JEST PRZYPIĘTE (reguła KLASA §4 — „deklaracja bez
 * testu = fałszywa pewność"; każde mocne zdanie karty ma niżej swój test):
 *
 *  (1) „Prostokąt KAŻDEJ etykiety niesie TUSZ, nie rezerwację" —
 *      `labelRectsWiderThanInk` na CAŁEJ scenie referencyjnej × 3 poziomy
 *      szczegółu, plus kontrola czułości na etykiecie spreparowanej.
 *  (2) „Rezerwacja nie znikła, tylko przeniosła się do własnego pola" —
 *      `labelGrowthReservationGaps` (drugi koniec pary: tusz nie wystaje poza
 *      rezerwację) + geometryczne zawieranie prostokąta w rezerwacji.
 *      JEDYNY WYJĄTEK jest DŁUGIEM NAZWANYM, nie ustępstwem: wiersz stanu
 *      zwinięcia GPZ (tylko L0) wystaje o zmierzone 95 j.św. poza baner strefy
 *      — defekt PIERWOTNY, którego zamknięcie wymaga rozstrzygnięcia kontraktu
 *      KD-5 (patrz `scene/buildScene.ts` `composeCollapsedGpz`). Test go NIE
 *      filtruje: asertuje go co do sztuki i co do rozmiaru, więc nowe takie
 *      miejsce albo zmiana nadmiaru pada natychmiast, a na L1/L2 zbiór musi
 *      być PUSTY bez żadnego ustępstwa.
 *  (3) „Napis nie zmienił położenia" — środek prostokąta wiersza pasma nazw
 *      leży dokładnie w środku slotu kolumny (render rysuje `textAnchor=middle`
 *      w środku prostokąta, więc równość środków = brak ruchu na rysunku).
 *  (4) „Układ nie idzie za tuszem" — `labelReservationRect` sprawia, że
 *      szerokość arkusza jest IDENTYCZNA na L0/L1/L2 mimo różnej treści
 *      wierszy (KD-5/S1 „jedna kotwica" — nietykalne, patrz §0 karty R4).
 *  (5) „Strona nN wisi RÓWNOLEGLE, więc rezerwacja to `max`, nie suma" —
 *      `nnSideBelowBusHeight` (portal domeny nN / rząd DER / strzałka odbioru,
 *      LV Domain Projection po B-02) porównana z REALNYM zwisem kompozycji, na
 *      ILOCZYNIE {brak/odbiór/DER/odbiór+DER} × {1 pole / kilka / maksimum}.
 *
 * ILOCZYN CECH, NIE PRZYKŁAD Z KARTY (reguła KLASA §2): defekt (5) chował się
 * dokładnie w jednej komórce iloczynu — „odbiór nN ORAZ DER na nN" — bo w
 * każdej innej `max` i suma dają tę samą liczbę. Test, który sprawdzałby samą
 * stację ze zrzutu, przepuściłby zarówno defekt, jak i jego powrót.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { GRID } from '../../core/grid';
import { measureLabelWidth } from '../../core/text';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { FIELD_ROLE, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import { prostokatElementuWScenie } from '../../canvas/viewAnchor';
import { composeStation, type ComposeStationInput } from '../../compose/station';
import type { StationDerSourceInput } from '../../compose/sourceKind';
import {
  labelGrowthReservationGaps,
  labelRectsWiderThanInk,
  labelReservationRect,
  resolveLabels,
  type OwnedLabel,
} from '../labels';
import { computeBands, type StationBandHeights } from '../bands';
import { computeColumns } from '../columns';
import { colorSegmentLabelRows, computeSegmentLabelSlotX } from '../segments';
import {
  lvPortalExtraHeight,
  nnSideBelowBusHeight,
  stationBlockHeight,
  stationNameBandHeight,
  type StationMeasureInput,
} from '../measure';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
const LODY: readonly SceneLod[] = [0, 1, 2];

// ---------------------------------------------------------------------------
// (1)(2) KLASA: prostokąt etykiety = tusz; rezerwacja = własne pole.
// ---------------------------------------------------------------------------

describe('BLOK-PUSTY §1 — prostokąt etykiety niesie TUSZ, nie rezerwację slotu', () => {
  for (const lod of LODY) {
    it(`L${lod}: ŻADNA etykieta sceny referencyjnej nie jest szersza od swojego tekstu`, () => {
      const scene = buildSceneV3(enm, lod);
      // Wyrocznia bez listy wyjątków — obejmuje WSZYSTKIE klasy właściciela i
      // wszystkie sloty. Przed kartą zapalałaby się na 273 wierszach pasma
      // nazw (prostokąt średnio 7,57× szerszy od tekstu).
      expect(labelRectsWiderThanInk(scene.labels)).toEqual([]);
    });

    it(`L${lod}: tusz mieści się w rezerwacji wszędzie POZA jednym nazwanym długiem (drugi koniec pary)`, () => {
      const scene = buildSceneV3(enm, lod);
      const luki = labelGrowthReservationGaps(scene.labels);
      if (lod === 0) {
        // DŁUG NAZWANY (opis i uzasadnienie: `scene/buildScene.ts`
        // `composeCollapsedGpz`): wiersz stanu zwinięcia GPZ jest dopisywany do
        // pasma, którego baner zmierzono wyłącznie dla wiersza tytułowego.
        // NIE filtrujemy go z wyroczni — ASERTUJEMY go co do sztuki i co do
        // liczby, więc test pada zarówno wtedy, gdy dojdzie NOWE takie miejsce,
        // jak i wtedy, gdy nadmiar zmieni rozmiar albo gdy dług zostanie
        // spłacony (wtedy tę gałąź się usuwa — świadomie, nie „żeby przeszło").
        expect(luki.map((g) => g.ownerRef)).toEqual([
          'gpz/1021aa18ea28ab398f1166359a58215a/substation#name-row-1',
        ]);
        expect(luki[0].inkExtent - luki[0].rectExtent).toBeCloseTo(95, 6);
        // Wiersz stanu istnieje WYŁĄCZNIE na poziomie przeglądowym — na L1/L2
        // gałąź `else` niżej wymaga zbioru PUSTEGO bez żadnego ustępstwa.
      } else {
        expect(luki).toEqual([]);
      }
      // Rezerwacja obejmuje prostokąt geometrycznie — nie tylko liczbowo.
      for (const label of scene.labels) {
        const rez = labelReservationRect(label);
        expect(label.rect.x).toBeGreaterThanOrEqual(rez.x - 0.5);
        expect(label.rect.x + label.rect.width).toBeLessThanOrEqual(rez.x + rez.width + 0.5);
        expect(label.rect.y).toBeGreaterThanOrEqual(rez.y - 0.5);
        expect(label.rect.y + label.rect.height).toBeLessThanOrEqual(rez.y + rez.height + 0.5);
      }
    });
  }

  it('CZUŁOŚĆ wyroczni: etykieta z prostokątem szerszym od tekstu JEST wykrywana (inaczej zieleń niczego nie dowodzi)', () => {
    const tekst = 'Stacja S01';
    const tusz = measureLabelWidth(tekst, 't1');
    const spreparowana: OwnedLabel = {
      ownerRef: 'stn/test/station#name-row-0',
      ownerKind: 'station-name',
      labelClass: 't1',
      labelRole: 'tozsamosc',
      text: tekst,
      slotIndex: 1,
      rect: { x: 0, y: 0, width: tusz + 400, height: 19 },
      rezerwacjaSzerokosci: tusz + 400,
    };
    expect(labelRectsWiderThanInk([spreparowana])).toHaveLength(1);
    expect(labelRectsWiderThanInk([spreparowana])[0].inkExtent).toBeCloseTo(tusz, 6);
    // Rezerwacja szersza od tuszu jest POPRAWNA — to nie jest ten sam defekt.
    expect(labelGrowthReservationGaps([spreparowana])).toEqual([]);
  });

  it('CZUŁOŚĆ wyroczni pary: rezerwacja WĘŻSZA od tuszu JEST wykrywana', () => {
    const tekst = 'Stacja S01';
    const tusz = measureLabelWidth(tekst, 't1');
    const spreparowana: OwnedLabel = {
      ownerRef: 'stn/test/station#name-row-0',
      ownerKind: 'station-name',
      labelClass: 't1',
      labelRole: 'tozsamosc',
      text: tekst,
      slotIndex: 1,
      rect: { x: 0, y: 0, width: tusz, height: 19 },
      rezerwacjaSzerokosci: tusz - 16,
    };
    expect(labelRectsWiderThanInk([spreparowana])).toEqual([]);
    expect(labelGrowthReservationGaps([spreparowana])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// (3) Napis stoi tam, gdzie stał — środek prostokąta == środek slotu.
// ---------------------------------------------------------------------------

describe('BLOK-PUSTY §2 — zwężenie prostokąta NIE przesuwa napisu', () => {
  for (const lod of LODY) {
    it(`L${lod}: wszystkie wiersze jednego pasma nazw mają WSPÓLNY środek poziomy`, () => {
      const scene = buildSceneV3(enm, lod);
      const pasma = new Map<string, number[]>();
      for (const label of scene.labels) {
        if (label.ownerKind !== 'station-name') continue;
        const klucz = label.ownerRef.replace(/#name-row-\d+$/, '');
        const lista = pasma.get(klucz) ?? [];
        lista.push(label.rect.x + label.rect.width / 2);
        pasma.set(klucz, lista);
      }
      expect(pasma.size).toBeGreaterThan(0);
      for (const [klucz, srodki] of pasma) {
        // Render rysuje tekst `textAnchor=middle` w środku prostokąta — wspólny
        // środek wszystkich wierszy znaczy, że pasmo jest nadal wyśrodkowane w
        // kolumnie dokładnie tak, jak przed kartą.
        expect(new Set(srodki).size, `pasmo ${klucz} rozjechało się w poziomie`).toBe(1);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// (4) Układ (arkusz/kamera) NIE idzie za tuszem — KD-5/S1 „jedna kotwica".
// ---------------------------------------------------------------------------

describe('BLOK-PUSTY §3 — arkusz mierzy REZERWACJĘ, więc nie zależy od treści poziomu', () => {
  it('szerokość bbox sceny IDENTYCZNA na L0/L1/L2, mimo że wiersz pasma nazw niesie na L0 kod, a na L1/L2 nazwę', () => {
    const szerokosci = LODY.map((lod) => buildSceneV3(enm, lod).bbox.width);
    expect(new Set(szerokosci).size, `szerokości arkusza: ${szerokosci.join(' / ')}`).toBe(1);
    // Kontrola, że przesłanka testu zachodzi (treść RÓŻNI się między poziomami)
    // — inaczej równość wyżej byłaby prawdziwa z powodu, którego nie badamy.
    // Bierzemy wiersz STACJI (nie nagłówek GPZ, który jest ten sam na każdym
    // poziomie): na L0 niesie kod stacji, na L2 jej nazwę.
    const wierszStacji = (lod: SceneLod): string | undefined =>
      buildSceneV3(enm, lod).labels.find(
        (l) => l.ownerKind === 'station-name' && l.ownerRef.startsWith('stn/'),
      )?.text;
    expect(wierszStacji(0)).toBeDefined();
    expect(wierszStacji(0)).not.toBe(wierszStacji(2));
  });
});

// ---------------------------------------------------------------------------
// (5) Rezerwacja strony nN = `max`, bo kompozycja wiesza zwisy RÓWNOLEGLE.
// ---------------------------------------------------------------------------

function makeBay(fieldRole: FieldRole, index: number): MiniBlockBayDescriptor {
  return { bayRef: `bay-${index}`, fieldRole, designation: `Pole ${index}`, hasMissingRequiredDevice: false };
}

function makeStation(
  snBays: readonly MiniBlockBayDescriptor[],
  overrides: Partial<StationMeasureInput> = {},
): StationMeasureInput {
  return {
    id: 'stn/test/station',
    name: 'Stacja testowa',
    stationCode: 'S99',
    transformerRatedKva: 630,
    stationTypeLabel: 'stacja przelotowa',
    nnVoltageKv: 0.4,
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
    nameBandHeight: stationNameBandHeight(station),
  };
  const bandsResult = computeBands([bandHeights], rows.rowCount);
  const { columns } = computeColumns({
    stations: [station],
    incomingSegmentLabelTexts: [null],
    nameSlotBand: bandsResult.bands.B5,
    segmentSlotBand: bandsResult.bands.B1,
  });
  const column = columns[0];
  return {
    station,
    column: { x: column.x, width: column.width, tapX: column.tapX },
    busAxisY: bandsResult.bands.B2.y,
    blockTopY: bandsResult.bands.B4.y,
    nameSlot: column.nameSlot,
    // `composeStation` rysuje szynę nN dopiero, gdy wołający zadeklaruje stronę
    // nN (adapter v2 czyta to z modelu) — bez tego wariant „odbiór/DER pod
    // szyną" nie miałby czego mierzyć.
    hasLvSection: true,
  };
}

/** REALNY zwis kompozycji POD szyną nN [j.św.]: dno wszystkiego, co wisi pod
 *  `#lv-bus`, minus Y tej szyny. `null` = stacja bez szyny nN. */
function realnyZwisPodSzynaNn(station: StationMeasureInput): number | null {
  const composition = composeStation(buildComposeInput(station));
  const lvBus = composition.segments.find((s) => s.ownerRef.endsWith('#lv-bus'));
  if (!lvBus) return null;
  const busY = lvBus.points[0].y;
  let dno = busY;
  for (const symbol of composition.symbols) {
    const def = SYMBOL_DEFS[symbol.symbolId];
    if (symbol.y + def.height > busY) dno = Math.max(dno, symbol.y + def.height);
  }
  for (const segment of composition.segments) {
    for (const p of segment.points) if (p.y > busY) dno = Math.max(dno, p.y);
  }
  // Etykiety DER (rodzaj+moc POD symbolem) też są treścią zwisu — rezerwacja
  // `derRowExtraHeight` jawnie dolicza ich wiersz, więc pomiar musi je widzieć.
  for (const label of resolveLabels({ simpleAnchored: composition.labels.der })) {
    if (label.rect.y + label.rect.height > busY) dno = Math.max(dno, label.rect.y + label.rect.height);
  }
  return dno - busY;
}

const DER_NN: StationDerSourceInput = { id: 'gen-nn-1', kind: 'pv', ratedPower: 0.5, connectionSide: 'nn' };
const ODBIOR = { pMw: 0.9, qMvar: 0.297, count: 1 } as const;

/** ILOCZYN CECH: {strona nN} × {liczba pól w rozdzielnicy}. Pole
 *  transformatorowe jest w każdym wariancie, bo bez niego stacja nie ma
 *  strony nN (a wtedy pytanie o zwis nie ma sensu — osobny przypadek niżej). */
const WARIANTY_NN = [
  { nazwa: 'bez odbioru i bez DER', load: null, der: [] as readonly StationDerSourceInput[] },
  { nazwa: 'sam odbiór nN', load: ODBIOR, der: [] as readonly StationDerSourceInput[] },
  { nazwa: 'sam DER na nN', load: null, der: [DER_NN] },
  { nazwa: 'odbiór nN ORAZ DER na nN', load: ODBIOR, der: [DER_NN] },
] as const;

const WARIANTY_POL = [
  { nazwa: '1 pole (sam transformator)', role: [FIELD_ROLE.RMU_TRANSFORMER] },
  { nazwa: 'kilka pól', role: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_TRANSFORMER] },
  {
    nazwa: 'maksimum z fixtury (4 pola)',
    role: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_TRANSFORMER],
  },
] as const;

describe('BLOK-PUSTY §4 — rezerwacja strony nN śledzi RYSUNEK (max, nie suma)', () => {
  for (const wariantNn of WARIANTY_NN) {
    for (const wariantPol of WARIANTY_POL) {
      it(`${wariantNn.nazwa} × ${wariantPol.nazwa}: rezerwacja − realny zwis == bufor dolny (${GRID} j.św.)`, () => {
        const station = makeStation(
          wariantPol.role.map((role, i) => makeBay(role, i)),
          { aggregatedLvLoad: wariantNn.load, derSources: wariantNn.der },
        );
        const rezerwacja = nnSideBelowBusHeight(station);
        const zwis = realnyZwisPodSzynaNn(station);
        expect(zwis, 'stacja z polem transformatorowym MUSI mieć szynę nN').not.toBeNull();
        // Rezerwacja NIGDY nie jest mniejsza od rysunku (inaczej zwis wchodzi w
        // pasmo nazw) i NIGDY nie przekracza go o więcej niż jeden zadeklarowany
        // bufor dolny. Suma zamiast `max` w wariancie „odbiór ORAZ DER" dawała
        // nadmiar 32+8 j.św. — ten test zapala się na tym natychmiast.
        expect(rezerwacja).toBeGreaterThanOrEqual(zwis!);
        expect(rezerwacja - zwis!).toBeLessThanOrEqual(GRID);
      });
    }
  }

  it('stacja BEZ pola transformatorowego: brak strony nN ⇒ rezerwacja zwisu = 0 (nie ma czego rezerwować)', () => {
    const station = makeStation([makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_LINE, 1)], {
      aggregatedLvLoad: ODBIOR,
      derSources: [DER_NN],
    });
    // `lvSideExtraHeight`/`lvPortalExtraHeight` milczą bez pola TR; rząd DER
    // nadal ma swoją wysokość, bo DER strony nN bez zacisku jest luką
    // (`station.der.unattached`, kompozycja go nie rysuje).
    expect(nnSideBelowBusHeight({ ...station, derSources: [] })).toBe(0);
  });

  it('KONTROLA KIERUNKU (portal): dla stacji BEZ odbioru i BEZ DER rezerwacja = sam portal (LV Domain Projection po B-02)', () => {
    const station = makeStation([makeBay(FIELD_ROLE.RMU_TRANSFORMER, 0)]);
    expect(nnSideBelowBusHeight(station)).toBe(lvPortalExtraHeight(station));
    expect(lvPortalExtraHeight(station)).toBeGreaterThan(0);
  });

  it('KONTROLA KIERUNKU: dla „odbiór ORAZ DER" `max` jest ŚCIŚLE mniejsze od sumy (inaczej test wyżej niczego nie rozstrzyga)', () => {
    const station = makeStation(
      [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)],
      { aggregatedLvLoad: ODBIOR, derSources: [DER_NN] },
    );
    const tylkoOdbior = nnSideBelowBusHeight({ ...station, derSources: [] });
    const tylkoDer = nnSideBelowBusHeight({ ...station, aggregatedLvLoad: null });
    const oba = nnSideBelowBusHeight(station);
    expect(tylkoOdbior).toBeGreaterThan(0);
    expect(tylkoDer).toBeGreaterThan(0);
    expect(oba).toBe(Math.max(tylkoOdbior, tylkoDer));
    expect(oba).toBeLessThan(tylkoOdbior + tylkoDer);
  });
});

// ---------------------------------------------------------------------------
// (6) EFEKT KARTY NA RAMIE BLOKU — mierzony produkcyjną funkcją kotwicy.
// ---------------------------------------------------------------------------

describe('BLOK-PUSTY §5 — rama bloku obejmuje TREŚĆ, nie rezerwację kolumny', () => {
  for (const lod of LODY) {
    it(`L${lod}: rama KAŻDEGO bloku jest węższa niż rezerwacja kolumny, którą blok zajmuje`, () => {
      const scene = buildSceneV3(enm, lod);
      const korzenie = new Set<string>();
      for (const label of scene.labels) {
        const m = /^((stn|gpz)\/[0-9a-f]+)\//.exec(label.ownerRef);
        if (m) korzenie.add(m[1]);
      }
      expect(korzenie.size).toBeGreaterThan(50);
      let zbadane = 0;
      const naStyk: string[] = [];
      for (const korzen of korzenie) {
        const ref = korzen.startsWith('gpz') ? `${korzen}/substation` : `${korzen}/station`;
        const rama = prostokatElementuWScenie(scene, ref);
        if (!rama) continue;
        const wiersze = scene.labels.filter(
          (l) => l.ownerKind === 'station-name' && (l.ownerRef === ref || l.ownerRef.startsWith(`${ref}#`)),
        );
        if (wiersze.length === 0) continue;
        const kolumna = wiersze[0].rezerwacjaSzerokosci;
        expect(kolumna, `wiersz pasma nazw bez rezerwacji: ${wiersze[0].ownerRef}`).toBeGreaterThan(0);
        // Rama nie może już być rozdmuchana rezerwacją: prostokąt pasma NIGDY
        // nie przekracza kolumny, a w każdym bloku, którego wiersze się w niej
        // mieszczą, jest od niej ŚCIŚLE węższy — więc jeżeli rama równa się
        // kolumnie, to wyłącznie dlatego, że NARYSOWANA treść (szyna,
        // aparatura) tyle zajmuje.
        const najszerszyWiersz = Math.max(...wiersze.map((l) => l.rect.width));
        expect(najszerszyWiersz).toBeLessThanOrEqual(kolumna!);
        if (najszerszyWiersz === kolumna) naStyk.push(ref);
        zbadane += 1;
      }
      expect(zbadane).toBeGreaterThan(50);
      // Równość zachodzi WYŁĄCZNIE tam, gdzie tusz nie mieści się w rezerwacji
      // i `tuszWSlocie` oddaje slot bez zmian — czyli w jedynym nazwanym długu
      // (wiersz stanu zwinięcia GPZ, istniejący tylko na L0; opis w
      // `scene/buildScene.ts` `composeCollapsedGpz`). Liczba, nie filtr: nowy
      // blok „na styk" zapala test.
      expect(naStyk, `bloki z pasmem na styk kolumny: ${naStyk.join(', ')}`).toHaveLength(
        lod === 0 ? 1 : 0,
      );
    });
  }
});

/*
 * ===========================================================================
 * §6 — GAŁĘZIE MARTWE NA FIKSTURZE (dopisane przy odbiorze karty, 2026-08-07)
 * ===========================================================================
 *
 * DLACZEGO OSOBNO. Wyrocznie §1 chodzą po CAŁEJ SCENIE zbudowanej z realnej
 * sieci — i to jest ich siła, ale i granica: widzą wyłącznie te rodzaje
 * etykiet, które ta sieć produkuje. Wykonawca karty uczciwie zgłosił, że slot 2
 * podpisu portu jest na fiksturze MARTWY (0 z 37 przęseł tam trafia), więc
 * naprawił go „w ciemno". Nadzorca to sprawdził iniekcją: przywrócenie w tej
 * gałęzi wpisywania CUDZEGO SLOTU do `rect` przeszło 29/29 NA ZIELONO.
 *
 * Fix był dobry, brakowało STRAŻNIKA. Deklaracja „prostokąt KAŻDEJ etykiety
 * niesie tusz" obejmuje cztery resolvery, a pinowała trzy (reguła KLASA §4:
 * deklaracja bez testu = fałszywa pewność). Poniższe przypadki wołają
 * resolvery WPROST, z właścicielem spreparowanym tak, żeby wejść w gałąź,
 * której realna sieć dziś nie wywołuje — więc pokrycie przestaje zależeć od
 * tego, co akurat jest w fiksturze.
 */
describe('BLOK-PUSTY §6 — tusz w gałęziach, których realna sieć nie wywołuje', () => {
  it('podpis portu w slocie 2 (za szeroki na slot 1) niesie TUSZ, nie cudzy slot', () => {
    const text = 'Odpływ do stacji odbiorczej nr 12';
    const szerokoscTuszu = measureLabelWidth(text, 't3');
    // Slot 1 celowo za wąski -> resolver schodzi do slotu 2 (gałąź martwa na fiksturze).
    const etykiety = resolveLabels({
      portCaptions: [
        {
          ownerRef: 'stacja/x/port/1',
          text,
          anchorX: 100,
          primaryRect: { x: 80, y: 0, width: 8, height: 12 },
          fallbackRect: { x: 0, y: 40, width: szerokoscTuszu + 600, height: 12 },
        },
      ],
    });
    expect(etykiety).toHaveLength(1);
    const etykieta = etykiety[0];
    expect(etykieta.slotIndex, 'przypadek ma ćwiczyć slot 2, inaczej nie testuje niczego').toBe(2);
    // Sedno: prostokąt to TUSZ, nie szerokość slotu (600 j.św. nadmiaru).
    expect(etykieta.rect.width).toBeLessThan(szerokoscTuszu + 1);
    expect(labelRectsWiderThanInk([etykieta])).toEqual([]);
    // A rezerwacja NIE znikła — układ nadal wie, ile miejsca zajmuje slot.
    expect(labelReservationRect(etykieta).width).toBe(szerokoscTuszu + 600);
  });

  it('środek napisu w slocie 2 nie drgnął wobec środka slotu', () => {
    const text = 'Odpływ do stacji odbiorczej nr 12';
    const slot = { x: 0, y: 40, width: measureLabelWidth(text, 't3') + 600, height: 12 };
    const [etykieta] = resolveLabels({
      portCaptions: [
        {
          ownerRef: 'stacja/x/port/1',
          text,
          anchorX: 100,
          primaryRect: { x: 80, y: 0, width: 8, height: 12 },
          fallbackRect: slot,
        },
      ],
    });
    const srodekSlotu = slot.x + slot.width / 2;
    const srodekTuszu = etykieta.rect.x + etykieta.rect.width / 2;
    // Zwężenie do tuszu ma być SYMETRYCZNE — inaczej napis przeskakuje w bok
    // wobec swojego leadera, a to defekt widoczny gołym okiem.
    expect(Math.abs(srodekTuszu - srodekSlotu)).toBeLessThanOrEqual(GRID);
  });
});
