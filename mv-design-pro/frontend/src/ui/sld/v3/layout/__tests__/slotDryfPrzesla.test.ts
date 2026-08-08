/**
 * SLOT-DRYF-PRZĘSŁA — WYROCZNIE KARTY.
 *
 * CO KARTA ZMIENIŁA. Rezerwacja slotu etykiety przęsła była centrowana na
 * odcinku tap-do-tap (ŚRODEK BLOKU stacji ↔ ŚRODEK BLOKU stacji), a kabel
 * międzystacyjny biegnie od GŁOWICY do GŁOWICY (dolne porty pól liniowych
 * „następnik"/„poprzednik", §12.3). `resolveSegmentSpanLabel` liczy poprawny
 * środek przęsła, ale zaraz potem DOSUWA etykietę do tej rezerwacji — więc to
 * rezerwacja, nie resolver, decydowała o położeniu napisu. Zmierzone na sieci
 * referencyjnej (L2): środek podpisu mijał środek opisywanego kabla o medianę
 * 180 j.św. (38% długości tego kabla), max 824 (131%).
 *
 * KAŻDE MOCNE ZDANIE MA TU SWÓJ TEST (reguła KLASA §4):
 *
 *  (1) „`bayStackCenterX` to JEDNO źródło prawdy osi kolumny pola" — oś
 *      policzona z `layout/measure.ts` jest CO DO JEDNOSTKI tą samą liczbą, w
 *      której `compose/station.ts` stawia pion zejścia pola, na iloczynie
 *      {1 pole / kilka / z DER / z podpisami kierunku} × {rola pola}.
 *  (2) „Slot jest centrowany na RYSOWANYM przęśle, nie na tap-do-tap" —
 *      test rozdzielający oba środki: stacje o RÓŻNYCH szerokościach bloków
 *      (tam, gdzie te dwie liczby się rozjeżdżają) + kontrola negatywna, że
 *      wyrocznia w ogóle gryzie.
 *  (3) „Przęsło wieloczłonowe: slot idzie za CZŁONEM NIOSĄCYM REF podpisu" —
 *      `chainLengths` przesuwa slot na ostatni udział przęsła; `n=1` niczego
 *      nie zmienia (norma).
 *  (4) „Podpis przęsła leży na kablu, który opisuje" — na CAŁEJ scenie
 *      referencyjnej × {L0, L1, L2}: prostokąt każdego podpisu przecina
 *      zakres X polilinii swojego właściciela (z kawałkami `#tee-N`, bo to
 *      TEN SAM kabel za kropką węzła), a środek podpisu leży w tym zakresie.
 *      Zapadka na pusty zbiór: L2 MUSI mieć niezerową liczbę podpisów.
 *  (5) „Etykieta ustępuje kanałowi WZDŁUŻ własnego kabla, a nie rozpycha
 *      arkusza" — `insertColumnChannels` z przekazanymi stacjami nie rusza
 *      kolumn tam, gdzie wystarczy przesunąć slot; przesunięty slot zostaje
 *      w obrębie swojego przęsła i wolny od kanałów.
 *
 * ILOCZYN CECH, NIE PRZYKŁAD Z KARTY (reguła KLASA §2). Zgłoszenie mówiło o
 * DWÓCH podpisach („S14 ↔ S15", „S17 ↔ S18"). Pomiar pokazał, że wada dotyczy
 * WSZYSTKICH 37 podpisów przęseł sieci referencyjnej, a jej rozmiar zależy od
 * iloczynu {przęsło krótkie / długie} × {jednoczłonowe / łańcuch} × {kanał
 * zejścia w przęśle / bez kanału} × {stacja 0 wiersza / dalsza}. Testy niżej
 * przechodzą przez ten iloczyn — sam przypadek ze zgłoszenia przepuściłby
 * zarówno wadę, jak i jej powrót.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { FIELD_ROLE, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../../scene/buildScene';
import { composeStation } from '../../compose/station';
import { computeBands, type StationBandHeights } from '../bands';
import { computeColumns, insertColumnChannels } from '../columns';
import {
  colorSegmentLabelRows,
  computeSegmentLabelSlotX,
  computeStationTaps,
  segmentSpanEndsX,
} from '../segments';
import {
  bayStackCenterX,
  findLineBayIndices,
  stationBlockHeight,
  stationNameBandHeight,
  stationPortCaptionHeight,
  type StationMeasureInput,
} from '../measure';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
const LODY: readonly SceneLod[] = [0, 1, 2];

function makeBay(fieldRole: FieldRole, index: number): MiniBlockBayDescriptor {
  return { bayRef: `bay-${index}`, fieldRole, designation: `Pole ${index}`, hasMissingRequiredDevice: false };
}

function makeStation(
  id: string,
  bays: readonly MiniBlockBayDescriptor[],
  overrides: Partial<StationMeasureInput> = {},
): StationMeasureInput {
  return {
    id,
    name: `Stacja ${id}`,
    stationCode: id.toUpperCase(),
    transformerRatedKva: 630,
    stationTypeLabel: 'stacja przelotowa',
    snBays: bays,
    ...overrides,
  };
}

/** Stacja przelotowa: pole „poprzednik" + `srodkowe` pól środkowych + pole
 *  „następnik" + pole transformatorowe. Liczba pól środkowych rozsuwa oba
 *  porty liniowe — to ona różnicuje ŚRODEK BLOKU od ŚRODKA PRZĘSŁA. */
function stacjaPrzelotowa(id: string, srodkowe: number, overrides: Partial<StationMeasureInput> = {}) {
  const bays: MiniBlockBayDescriptor[] = [makeBay(FIELD_ROLE.RMU_LINE, 0)];
  for (let i = 0; i < srodkowe; i++) bays.push(makeBay(FIELD_ROLE.RMU_TRANSFORMER, 100 + i));
  bays.push(makeBay(FIELD_ROLE.RMU_LINE, 1));
  bays.push(makeBay(FIELD_ROLE.RMU_TRANSFORMER, 2));
  return makeStation(id, bays, overrides);
}

// ---------------------------------------------------------------------------
// (1) JEDNO ŹRÓDŁO PRAWDY: oś kolumny pola.
// ---------------------------------------------------------------------------

describe('SLOT-DRYF-PRZĘSŁA §1 — `bayStackCenterX` jest tą samą osią, w której compose stawia pole', () => {
  const przypadki: readonly { readonly nazwa: string; readonly stacja: StationMeasureInput }[] = [
    { nazwa: 'jedno pole liniowe', stacja: makeStation('s-1', [makeBay(FIELD_ROLE.RMU_LINE, 0)]) },
    { nazwa: 'przelotowa bez pól środkowych', stacja: stacjaPrzelotowa('s-2', 0) },
    { nazwa: 'przelotowa z trzema polami środkowymi', stacja: stacjaPrzelotowa('s-3', 3) },
    {
      nazwa: 'przelotowa z podpisami kierunku (szersze kolumny)',
      stacja: stacjaPrzelotowa('s-4', 1, {
        bayDirectionCaptions: ['Ciąg SN 01 · kier. S01', null, 'Ciąg SN 01 · kier. S99', null],
      }),
    },
    {
      nazwa: 'przelotowa ze źródłem DER na nN',
      stacja: stacjaPrzelotowa('s-5', 1, {
        derSources: [
          { ref: 'src/1', kind: 'pv', ratedKw: 400, connectionSide: 'nn', operationalState: 'in_service' },
        ] as StationMeasureInput['derSources'],
      }),
    },
  ];

  for (const { nazwa, stacja } of przypadki) {
    it(`${nazwa}: oś z measure == X pionu zejścia z compose dla KAŻDEGO pola`, () => {
      const taps = computeStationTaps([stacja], [null]);
      const rows = colorSegmentLabelRows(computeSegmentLabelSlotX([stacja], [null]));
      const bandHeights: StationBandHeights = {
        incomingSegmentLabelText: null,
        portCaptionHeight: stationPortCaptionHeight(stacja),
        stationBlockHeight: stationBlockHeight(stacja),
        nameBandHeight: stationNameBandHeight(stacja),
      };
      const bands = computeBands([bandHeights], rows.rowCount);
      const { columns } = computeColumns({
        stations: [stacja],
        incomingSegmentLabelTexts: [null],
        nameSlotBand: bands.bands.B5,
        segmentSlotBand: bands.bands.B1,
      });
      const column = columns[0];
      const composition = composeStation({
        station: stacja,
        column: { x: column.x, width: column.width, tapX: column.tapX },
        busAxisY: bands.bands.B2.y + bands.bands.B2.height,
        blockTopY: bands.bands.B4.y,
        nameSlot: column.nameSlot,
      });

      expect(taps[0].x).toBe(column.x);
      // ZAPADKA NA PUSTY ZBIÓR: bez tego test przeszedłby, gdyby compose
      // przestało rysować zejścia i pętla niżej nie wykonała się ani razu.
      const zejscia = composition.segments.filter((s) => s.ownerRef.endsWith('#descent'));
      expect(zejscia.length).toBe(stacja.snBays.length);

      stacja.snBays.forEach((bay, index) => {
        const zMeasure = bayStackCenterX(
          stacja.snBays,
          index,
          column.x,
          stacja.bayDirectionCaptions,
          stacja.entryDescentBayIndex,
        );
        const zejscie = composition.segments.find((s) => s.ownerRef === `${bay.bayRef}#descent`);
        expect(zejscie, `pion zejścia pola ${bay.bayRef}`).toBeDefined();
        expect(zMeasure).toBe(zejscie!.points[0].x);
      });
    });
  }

  it('CZUŁOŚĆ: oś pola zależy od pól PRZED nim — inaczej wyrocznia niczego nie pilnuje', () => {
    const waska = stacjaPrzelotowa('s-w', 0);
    const szeroka = stacjaPrzelotowa('s-s', 3);
    const osWaskiej = bayStackCenterX(waska.snBays, waska.snBays.length - 2, 0, undefined, null);
    const osSzerokiej = bayStackCenterX(szeroka.snBays, szeroka.snBays.length - 2, 0, undefined, null);
    expect(osWaskiej).not.toBe(osSzerokiej);
    // Pierwsze pole stoi w tym samym miejscu w OBU (prefix-sum jest pusty) —
    // dowód, że różnica wyżej pochodzi z pól poprzedzających, a nie z szumu.
    expect(bayStackCenterX(waska.snBays, 0, 0, undefined, null)).toBe(
      bayStackCenterX(szeroka.snBays, 0, 0, undefined, null),
    );
  });

  it('pole spoza zakresu daje `null` (wołający spada na `tapX`, tak jak `portOfBay` w renderze)', () => {
    const s = stacjaPrzelotowa('s-n', 1);
    expect(bayStackCenterX(s.snBays, null, 0, undefined, null)).toBeNull();
    expect(bayStackCenterX(s.snBays, s.snBays.length, 0, undefined, null)).toBeNull();
    expect(bayStackCenterX([], 0, 0, undefined, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (2)(3) SLOT IDZIE ZA PRZĘSŁEM, NIE ZA BLOKIEM.
// ---------------------------------------------------------------------------

describe('SLOT-DRYF-PRZĘSŁA §2 — rezerwacja centruje się na RYSOWANYM przęśle', () => {
  // Iloczyn {przęsło krótkie / długie} × {sąsiedztwo równe / niesymetryczne}:
  // stacja szeroka obok wąskiej to dokładnie ten przypadek, w którym środek
  // bloku i środek przęsła się rozjeżdżają (bo port wyjścia stacji szerokiej
  // leży daleko od jej środka).
  const scenariusze: readonly { readonly nazwa: string; readonly lewa: number; readonly prawa: number }[] = [
    { nazwa: 'sąsiedztwo równe (0/0 pól środkowych)', lewa: 0, prawa: 0 },
    { nazwa: 'lewa szeroka, prawa wąska', lewa: 4, prawa: 0 },
    { nazwa: 'lewa wąska, prawa szeroka', lewa: 0, prawa: 4 },
    { nazwa: 'obie szerokie', lewa: 5, prawa: 5 },
  ];

  for (const { nazwa, lewa, prawa } of scenariusze) {
    it(`${nazwa}: środek slotu == środek przęsła głowica→głowica`, () => {
      const stations = [stacjaPrzelotowa('a', lewa), stacjaPrzelotowa('b', prawa)];
      const teksty = [null, 'A ↔ B · YAKXS 3×120/16 · Un=20 kV'];
      const taps = computeStationTaps(stations, teksty);
      const slots = computeSegmentLabelSlotX(stations, teksty);
      const slot = slots[1];
      expect(slot).not.toBeNull();

      const przeslo = segmentSpanEndsX(stations, taps, 1);
      const srodekPrzesla = (przeslo.startX + przeslo.endX) / 2;
      const srodekSlotu = slot!.x + slot!.width / 2;
      // Slot leży na siatce (GRID), więc równość środków z dokładnością do
      // pół modułu siatki — dalej ZERO dryfu w sensie karty.
      expect(Math.abs(srodekSlotu - srodekPrzesla)).toBeLessThanOrEqual(4);

      // KONTROLA ROZDZIELAJĄCA: dla niesymetrycznych sąsiadów środek przęsła
      // MUSI różnić się od środka tap-do-tap — inaczej test przechodziłby
      // także dla starego (wadliwego) centrowania i nic by nie dowodził.
      const srodekTapDoTap = (taps[0].tapX + taps[1].tapX) / 2;
      if (lewa !== prawa) {
        expect(Math.abs(srodekPrzesla - srodekTapDoTap)).toBeGreaterThan(4);
      }
    });
  }

  it('przęsło wieloczłonowe: slot idzie za UDZIAŁEM członu niosącego ref podpisu', () => {
    const stations = [stacjaPrzelotowa('a', 2), stacjaPrzelotowa('b', 2)];
    const teksty = [null, 'A ↔ B · YAKXS 3×120/16 · Un=20 kV'];
    const taps = computeStationTaps(stations, teksty);
    const przeslo = segmentSpanEndsX(stations, taps, 1);

    const jeden = computeSegmentLabelSlotX(stations, teksty, undefined, [null, 1])[1]!;
    const cztery = computeSegmentLabelSlotX(stations, teksty, undefined, [null, 4])[1]!;
    // n=1 (norma) — bez zmian względem centrowania na całym przęśle.
    expect(jeden.x).toBe(computeSegmentLabelSlotX(stations, teksty)[1]!.x);
    // n=4 — środek ostatniej ćwiartki przęsła, czyli PRZY stacji docelowej.
    const srodekCzwartej = przeslo.startX + ((przeslo.endX - przeslo.startX) * 7) / 8;
    expect(Math.abs(cztery.x + cztery.width / 2 - srodekCzwartej)).toBeLessThanOrEqual(4);
    expect(cztery.x).toBeGreaterThan(jeden.x);
  });

  it('stacja bez pola liniowego spada na `tapX` — tym samym fallbackiem co render', () => {
    // Stacja wyłącznie z polem transformatorowym: `findLineBayIndices` nie
    // znajduje ani „poprzednika", ani „następnika".
    const bezLinii = makeStation('t', [makeBay(FIELD_ROLE.RMU_TRANSFORMER, 0)]);
    expect(findLineBayIndices(bezLinii.snBays).previousIndex).toBeNull();
    expect(findLineBayIndices(bezLinii.snBays).nextIndex).toBeNull();
    const stations = [stacjaPrzelotowa('a', 1), bezLinii];
    const teksty = [null, 'A ↔ T · YAKXS 3×120/16'];
    const taps = computeStationTaps(stations, teksty);
    expect(segmentSpanEndsX(stations, taps, 1).endX).toBe(taps[1].tapX);
  });
});

// ---------------------------------------------------------------------------
// (4) SCENA REFERENCYJNA: podpis leży na kablu, który opisuje.
// ---------------------------------------------------------------------------

/** Zakres X polilinii NIOSĄCEJ dany ref — razem z kawałkami `#tee-N`, bo
 *  `resolveTeeJunctions` nadaje je kontynuacji TEGO SAMEGO kabla ENM za
 *  kropką węzła (patrz `scene/buildScene.ts`). Bez sklejenia wyrocznia
 *  mierzyłaby konwencję nazewniczą, a nie położenie napisu. */
function zakresWlasciciela(scene: SceneV3, ref: string): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const g of scene.segments) {
    const owner = g.meta?.ownerRef?.replace(/#tee-\d+$/, '');
    if (owner !== ref) continue;
    for (const p of g.points) {
      min = Math.min(min, p.x);
      max = Math.max(max, p.x);
    }
  }
  return Number.isFinite(min) ? { min, max } : null;
}

describe('SLOT-DRYF-PRZĘSŁA §3 — podpis przęsła stoi na swoim kablu (scena referencyjna)', () => {
  for (const lod of LODY) {
    it(`L${lod}: prostokąt i środek KAŻDEGO podpisu przęsła leżą w zakresie X jego kabla`, () => {
      const scene = buildSceneV3(enm, lod);
      const podpisy = scene.labels.filter((l) => l.ownerKind === 'segment-span');
      // ZAPADKA NA PUSTY ZBIÓR (§4 karty): etykiety przęseł są rysowane
      // dopiero na L2 — na L0/L1 zbiór jest pusty Z DEFINICJI i wtedy test
      // pilnuje tylko tego, że nic się tam nie pojawiło. Na L2 zbiór MUSI być
      // niepusty, inaczej zieleń nic nie znaczy.
      if (lod === 2) expect(podpisy.length).toBeGreaterThanOrEqual(30);
      else expect(podpisy).toEqual([]);

      for (const l of podpisy) {
        const ref = l.ownerRef.replace(/#segment-label$/, '');
        const kabel = zakresWlasciciela(scene, ref);
        expect(kabel, `kabel dla ${l.ownerRef}`).not.toBeNull();
        const x0 = l.rect.x;
        const x1 = l.rect.x + l.rect.width;
        // NAPIS I KABEL LEŻĄ NA SOBIE. Dwa dopuszczalne układy, wyprowadzone
        // z GEOMETRII (R1: zero progów w jednostkach):
        //  · środek napisu leży w zakresie kabla (kabel dłuższy od napisu
        //    albo porównywalny) — napis „siedzi" na kablu;
        //  · albo napis POKRYWA cały kabel (kabel krótszy od własnego
        //    podpisu — na sieci referencyjnej kable od 56 j.św. przy
        //    podpisach 335–362 j.św.; wymaganie środka byłoby wtedy
        //    wymaganiem trafienia w okno węższe niż sam napis).
        // Oba mówią to samo zdanie: nie da się pokazać punktu napisu, który
        // stoi „gdzie indziej" niż kabel.
        const srodek = (x0 + x1) / 2;
        const srodekNaKablu = srodek >= kabel!.min && srodek <= kabel!.max;
        const napisPokrywaKabel = x0 <= kabel!.min && x1 >= kabel!.max;
        expect(
          srodekNaKablu || napisPokrywaKabel,
          `${l.text}: podpis [${x0}..${x1}] nie leży na swoim kablu [${kabel!.min}..${kabel!.max}]`,
        ).toBe(true);
      }
    });
  }

  it('CZUŁOŚĆ wyroczni: podpis przesunięty o własną szerokość MUSI oblać (inaczej zieleń nic nie dowodzi)', () => {
    const scene = buildSceneV3(enm, 2);
    const podpis = scene.labels.find((l) => l.ownerKind === 'segment-span');
    expect(podpis).toBeDefined();
    const kabel = zakresWlasciciela(scene, podpis!.ownerRef.replace(/#segment-label$/, ''))!;
    // Napis odsunięty o WŁASNĄ szerokość za koniec kabla: ani środek nie leży
    // na kablu, ani napis go nie pokrywa — TEN SAM predykat, którego używa
    // test wyżej, musi to odrzucić.
    const x0 = kabel.max + podpis!.rect.width;
    const x1 = x0 + podpis!.rect.width;
    const srodek = (x0 + x1) / 2;
    expect(srodek >= kabel.min && srodek <= kabel.max).toBe(false);
    expect(x0 <= kabel.min && x1 >= kabel.max).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (5) KANAŁ ZEJŚCIA: ustępuje ETYKIETA, nie kolumna.
// ---------------------------------------------------------------------------

describe('SLOT-DRYF-PRZĘSŁA §4 — kanał zejścia przesuwa etykietę wzdłuż kabla, nie kolumny', () => {
  function ukladDwochStacji() {
    const stations = [stacjaPrzelotowa('a', 3), stacjaPrzelotowa('b', 3)];
    const teksty = [null, 'A ↔ B · YAKXS 3×120/16 · Un=20 kV'];
    const rows = colorSegmentLabelRows(computeSegmentLabelSlotX(stations, teksty));
    const bands = computeBands(
      stations.map((s, i) => ({
        incomingSegmentLabelText: teksty[i],
        portCaptionHeight: stationPortCaptionHeight(s),
        stationBlockHeight: stationBlockHeight(s),
        nameBandHeight: stationNameBandHeight(s),
      })),
      rows.rowCount,
    );
    const columns = computeColumns({
      stations,
      incomingSegmentLabelTexts: teksty,
      nameSlotBand: bands.bands.B5,
      segmentSlotBand: bands.bands.B1,
    });
    return { stations, teksty, columns };
  }

  it('kanał w slocie: slot się przesuwa, kolumny zostają na miejscu', () => {
    const { stations, columns } = ukladDwochStacji();
    const slot = columns.segmentLabelSlots.find((s) => s.stationIndex === 1)!;
    // Punkt kanału celowo W ŚRODKU slotu — kolizja gwarantowana.
    const kanal = slot.rect.x + Math.floor(slot.rect.width / 2);
    const wynik = insertColumnChannels(columns, [kanal], 'test', stations);

    // ZAPADKA: mechanizm ma ZADZIAŁAĆ, a nie poddać się notatką. (Notatka o
    // degeneracji „kanał w kolumnie 0" jest tu oczekiwana i pochodzi z pętli
    // kolumn — to inny, wcześniejszy mechanizm; interesuje nas WYŁĄCZNIE
    // brak notatki o slocie.)
    expect(wynik.stopNotes.filter((n) => n.includes('slot etykiety przęsła'))).toEqual([]);
    expect(wynik.result.columns.map((c) => c.x)).toEqual(columns.columns.map((c) => c.x));
    expect(wynik.result.totalWidth).toBe(columns.totalWidth);
    const po = wynik.result.segmentLabelSlots.find((s) => s.stationIndex === 1)!;
    expect(po.rect.x).not.toBe(slot.rect.x);
    // Slot wolny od kanału…
    expect(kanal < po.rect.x || kanal > po.rect.x + po.rect.width).toBe(true);
    // …i wciąż na swoim kablu (ŚRODEK slotu w zakresie przęsła — pełne
    // zawieranie jest niewykonalne dla przęseł krótszych od podpisu).
    const taps = wynik.result.columns.map((c) => ({ x: c.x, width: c.width, tapX: c.tapX }));
    const przeslo = segmentSpanEndsX(stations, taps, 1);
    const srodek = po.rect.x + po.rect.width / 2;
    expect(srodek).toBeGreaterThanOrEqual(Math.min(przeslo.startX, przeslo.endX));
    expect(srodek).toBeLessThanOrEqual(Math.max(przeslo.startX, przeslo.endX));
  });

  it('BEZ przekazanych stacji zachowanie jest jak przed kartą (slot nie ustępuje)', () => {
    const { columns } = ukladDwochStacji();
    const slot = columns.segmentLabelSlots.find((s) => s.stationIndex === 1)!;
    const kanal = slot.rect.x + Math.floor(slot.rect.width / 2);
    const wynik = insertColumnChannels(columns, [kanal], 'test');
    expect(wynik.result.segmentLabelSlots.find((s) => s.stationIndex === 1)!.rect.x).toBe(slot.rect.x);
  });

  it('kanał w BLOKU stacji nadal przesuwa kolumnę (druga połowa pary predykatów)', () => {
    const { stations, columns } = ukladDwochStacji();
    const kolumna = columns.columns[1];
    const kanal = kolumna.x + Math.floor(kolumna.width / 2);
    const wynik = insertColumnChannels(columns, [kanal], 'test', stations);
    expect(wynik.result.columns[1].x).toBeGreaterThan(kolumna.x);
    expect(wynik.result.totalWidth).toBeGreaterThan(columns.totalWidth);
  });
});
