/**
 * K2 (UI-04, W5-UI-15) — akcja kamery `'kadruj'`: kadr podzbioru rysunku.
 *
 * Cechy iloczynu (każda kombinacja ma tu przypadek):
 *  - kierunek skali: cel mały (kadr PRZYBLIŻA) × cel duży (kadr oddala);
 *  - poziom szczegółu: histereza zoomu × dolna granica `minLod` × poziom bez
 *    rysunku celu (`null`) × poziom wymuszony (`wymuszonyLod`);
 *  - prostokąt bezpieczny: bez zasłon × z zasłonami (`safeInsets`);
 *  - poziom niższy: na wybranym poziomie sąsiedzi nierozwiązywalni × zejście
 *    dozwolone (`minLod`) × zabronione × poziom wymuszony;
 *  - tusz etykiet: celu × sąsiada;
 *  - sąsiedzi: brak × jeden z boku (kadr się przesuwa) × po obu stronach
 *    blisko (kadr wchłania ich w całości) × po obu stronach rozlegli (kadr
 *    zostaje na środku, bo wchłonięcie odebrałoby celowi dominację) × sąsiad
 *    odsłonięty dopiero po poszerzeniu (iteracja wchłaniania);
 *  - cykl życia: zmiana rozmiaru kanwy PONAWIA kadr × gest projektanta (zoom,
 *    przesunięcie, kotwica) zdejmuje kadr × „Poprzedni widok" (`'przywroc'`);
 *  - determinizm.
 */
import { describe, expect, it } from 'vitest';

import {
  cameraReducer,
  DEFAULT_LOD_THRESHOLDS,
  KADR_MAX_SCALE,
  KADR_UDZIAL_DOMINACJI,
  LOD_HYSTERESIS_MARGIN,
  lodFromScaleWithHysteresis,
  refScaleFor,
  type AkcjaKadru,
  type BoundingBox,
  type CameraState,
} from '../camera';
import type { SafeInsets } from '../../../v2/viewport/ViewportController';
import type { SceneLod } from '../../scene/buildScene';

const VIEWPORT = { width: 1600, height: 1000 } as const;
const PADDING = 40;
const swiat: Readonly<Record<SceneLod, BoundingBox>> = {
  0: { minX: 0, minY: 0, maxX: 20000, maxY: 8000 },
  1: { minX: 0, minY: 0, maxX: 24000, maxY: 9000 },
  2: { minX: 0, minY: 0, maxX: 30000, maxY: 10000 },
};
/** Ten sam obiekt w trzech światach — proporcjonalnie do szerokości świata. */
const cel = (szerokosc: number): Readonly<Record<SceneLod, BoundingBox>> => ({
  0: { minX: 9000, minY: 4000, maxX: 9000 + szerokosc * (20 / 30), maxY: 4000 + (szerokosc * (20 / 30)) / 2 },
  1: { minX: 10800, minY: 4500, maxX: 10800 + szerokosc * (24 / 30), maxY: 4500 + (szerokosc * (24 / 30)) / 2 },
  2: { minX: 13500, minY: 5000, maxX: 13500 + szerokosc, maxY: 5000 + szerokosc / 2 },
});
const stan = (scale: number, lod: SceneLod): CameraState => ({
  transform: { scale, translateX: 0, translateY: 0 },
  lod,
  viewportSize: VIEWPORT,
  lodBboxes: swiat,
});
const naEkranie = (p: { x: number; y: number }, s: CameraState) => ({
  x: p.x * s.transform.scale + s.transform.translateX,
  y: p.y * s.transform.scale + s.transform.translateY,
});
const prostokatNaEkranie = (b: BoundingBox, s: CameraState) => {
  const a = naEkranie({ x: b.minX, y: b.minY }, s);
  const z = naEkranie({ x: b.maxX, y: b.maxY }, s);
  return { minX: a.x, minY: a.y, maxX: z.x, maxY: z.y };
};
const BEZ_ZASLON: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
/** Sąsiad względem widocznej kanwy: cały w niej, poza nią albo UCIĘTY krawędzią. */
function stanSasiada(b: BoundingBox, s: CameraState, viewport = VIEWPORT): 'caly' | 'poza' | 'uciety' {
  const e = prostokatNaEkranie(b, s);
  if (e.maxX <= 0 || e.minX >= viewport.width || e.maxY <= 0 || e.minY >= viewport.height) return 'poza';
  if (e.minX >= 0 && e.maxX <= viewport.width && e.minY >= 0 && e.maxY <= viewport.height) return 'caly';
  return 'uciety';
}
/** Cały prostokąt celu leży w prostokącie bezpiecznym pomniejszonym o padding. */
function wKadrze(
  b: BoundingBox,
  s: CameraState,
  insets: SafeInsets = BEZ_ZASLON,
  viewport: { readonly width: number; readonly height: number } = VIEWPORT,
): void {
  const e = prostokatNaEkranie(b, s);
  expect(e.minX).toBeGreaterThanOrEqual(insets.left + PADDING - 1e-6);
  expect(e.minY).toBeGreaterThanOrEqual(insets.top + PADDING - 1e-6);
  expect(e.maxX).toBeLessThanOrEqual(viewport.width - insets.right - PADDING + 1e-6);
  expect(e.maxY).toBeLessThanOrEqual(viewport.height - insets.bottom - PADDING + 1e-6);
}
const kadr = (anchorByLod: AkcjaKadru['anchorByLod'], extra: Partial<AkcjaKadru> = {}): AkcjaKadru => ({
  type: 'kadruj',
  anchorByLod,
  lodBboxes: swiat,
  viewportSize: VIEWPORT,
  ...extra,
});

describe("akcja 'kadruj' — skala i poziom szczegółu", () => {
  it('kadr PRZYBLIŻA: projektant oddalony (L0, skala 0,2) dostaje cel wypełniający kadr', () => {
    const anchor = cel(1200);
    const po = cameraReducer(stan(0.2, 0), kadr(anchor));
    expect(po.transform.scale).toBeGreaterThan(0.2);
    wKadrze(anchor[po.lod], po);
    // Cel WYPEŁNIA kadr — co najmniej jeden wymiar dotyka prostokąta bezpiecznego.
    const e = prostokatNaEkranie(anchor[po.lod], po);
    const wypelnienieX = (e.maxX - e.minX) / (VIEWPORT.width - 2 * PADDING);
    const wypelnienieY = (e.maxY - e.minY) / (VIEWPORT.height - 2 * PADDING);
    expect(Math.max(wypelnienieX, wypelnienieY)).toBeCloseTo(1, 6);
  });

  it('kadr ODDALA, gdy cel się nie mieści (to samo polecenie, kierunek wynika z celu)', () => {
    const anchor = cel(8000);
    const po = cameraReducer(stan(1.4, 2), kadr(anchor));
    expect(po.transform.scale).toBeLessThan(1.4);
    wKadrze(anchor[po.lod], po);
  });

  it('mały cel: skala ograniczona KADR_MAX_SCALE (powiększenie bez informacji jest zakazane)', () => {
    const anchor = cel(20);
    const po = cameraReducer(stan(0.2, 0), kadr(anchor));
    expect(po.transform.scale).toBeLessThanOrEqual(KADR_MAX_SCALE + 1e-9);
    expect(po.lod).toBe(2);
    expect(KADR_MAX_SCALE).toBeCloseTo(2 * DEFAULT_LOD_THRESHOLDS.l1Max * (1 + LOD_HYSTERESIS_MARGIN), 12);
  });

  it('poziom szczegółu z TEJ SAMEJ histerezy co zoom (kolejny zoom nie przełączy poziomu sam z siebie)', () => {
    for (const szerokosc of [50, 400, 1200, 3000, 8000, 30000]) {
      for (const start of [0, 1, 2] as const) {
        const po = cameraReducer(stan(start === 0 ? 0.2 : start === 1 ? 0.8 : 1.6, start), kadr(cel(szerokosc)));
        expect(lodFromScaleWithHysteresis(refScaleFor(po.transform.scale, po.lod, swiat), po.lod)).toBe(po.lod);
      }
    }
  });

  it('minLod: kadr stacji pokazuje WNĘTRZE — nigdy poziom niższy niż minLod, choć cel zmieściłby się na L0', () => {
    const anchor = cel(30000);
    const bez = cameraReducer(stan(0.2, 0), kadr(anchor));
    const z = cameraReducer(stan(0.2, 0), kadr(anchor, { minLod: 1 }));
    expect(bez.lod).toBe(0);
    expect(z.lod).toBeGreaterThanOrEqual(1);
    wKadrze(anchor[z.lod], z);
  });

  it('poziom bez rysunku celu (null) jest pomijany; komplet null = kamera nietknięta', () => {
    const anchor = cel(30000);
    const po = cameraReducer(stan(0.2, 0), kadr({ 0: null, 1: anchor[1], 2: anchor[2] }));
    expect(po.lod).not.toBe(0);
    const przed = stan(0.7, 1);
    expect(cameraReducer(przed, kadr({ 0: null, 1: null, 2: null }))).toBe(przed);
  });

  it('poziom WYMUSZONY (lodOverride): poziom nie zmienia się, kadr celuje w świat tego poziomu', () => {
    const anchor = cel(1200);
    const po = cameraReducer(stan(0.2, 0), kadr(anchor, { wymuszonyLod: 2 }));
    expect(po.lod).toBe(0);
    wKadrze(anchor[2], po);
  });
});

describe("akcja 'kadruj' — prostokąt bezpieczny i sąsiedzi", () => {
  it('safeInsets: cel nie chowa się pod zasłonami (dok u góry, panel z prawej)', () => {
    const insets: SafeInsets = { top: 120, right: 400, bottom: 40, left: 0 };
    const anchor = cel(1200);
    const po = cameraReducer(stan(0.2, 0), kadr(anchor, { safeInsets: insets }));
    wKadrze(anchor[po.lod], po, insets);
  });

  it('sąsiad z boku w kadrze środka: kadr przesuwa się tak, by sąsiad wypadł, a cel został cały', () => {
    // Cel szeroki na 1000 j. przy L2: skala ograniczona wysokością/szerokością
    // zostawia luz w osi X, w którym mieści się przesunięcie.
    const anchor = { 0: null, 1: null, 2: { minX: 10000, minY: 5000, maxX: 10600, maxY: 5600 } };
    const sasiad = { minX: 10700, minY: 5100, maxX: 10900, maxY: 5500 };
    const bez = cameraReducer(stan(1.6, 2), kadr(anchor));
    const widocznyBez = prostokatNaEkranie(sasiad, bez);
    expect(widocznyBez.minX).toBeLessThan(VIEWPORT.width); // bez przeszkód sąsiad jest w kadrze
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { przeszkodyByLod: { 0: [], 1: [], 2: [sasiad] } }));
    wKadrze(anchor[2], z);
    const ekranSasiada = prostokatNaEkranie(sasiad, z);
    expect(ekranSasiada.minX).toBeGreaterThanOrEqual(VIEWPORT.width - 1e-6);
    expect(z.transform.scale).toBe(bez.transform.scale);
  });

  it('sąsiedzi blisko po obu stronach: żaden nie jest ucięty — bliższy wchłonięty w całości, dalszy poza kadrem', () => {
    // Przesunięcie samego celu nic nie daje (sąsiad z każdej strony), więc kadr
    // wchłania najbliższego sąsiada i dopiero wtedy szuka położenia wolnego od
    // reszty. Cel dalej zajmuje ≥ 50 % mniejszego wymiaru prostokąta bezpiecznego.
    const anchor = { 0: null, 1: null, 2: { minX: 10000, minY: 5000, maxX: 10600, maxY: 5600 } };
    const lewy = { minX: 9700, minY: 5100, maxX: 9900, maxY: 5500 };
    const prawy = { minX: 10700, minY: 5100, maxX: 10900, maxY: 5500 };
    const bez = cameraReducer(stan(1.6, 2), kadr(anchor));
    expect(stanSasiada(lewy, bez)).toBe('uciety');
    expect(stanSasiada(prawy, bez)).toBe('uciety');
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { przeszkodyByLod: { 0: [], 1: [], 2: [lewy, prawy] } }));
    wKadrze(anchor[2], z);
    expect(stanSasiada(lewy, z)).toBe('caly');
    expect(stanSasiada(prawy, z)).toBe('poza');
    const e = prostokatNaEkranie(anchor[2], z);
    expect(Math.max(e.maxX - e.minX, e.maxY - e.minY)).toBeGreaterThanOrEqual(
      KADR_UDZIAL_DOMINACJI * Math.min(VIEWPORT.width, VIEWPORT.height),
    );
  });

  it('sąsiedzi rozlegli i głęboko w oknie po obu stronach: ani wchłonięcie, ani oddech nie pomagają — cel zostaje w centrum', () => {
    const anchor = { 0: null, 1: null, 2: { minX: 10000, minY: 5000, maxX: 10600, maxY: 5600 } };
    // Wchłonięcie dowolnego z nich (2450 j.) dałoby celowi < 50 % kadru, a
    // nawet oddech 12 px zostawia ich skraje w oknie.
    const lewy = { minX: 7400, minY: 5100, maxX: 9850, maxY: 5500 };
    const prawy = { minX: 10750, minY: 5100, maxX: 13200, maxY: 5500 };
    const bez = cameraReducer(stan(1.6, 2), kadr(anchor));
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { przeszkodyByLod: { 0: [], 1: [], 2: [lewy, prawy] } }));
    expect(z.transform).toEqual(bez.transform);
  });

  it('wchłanianie jest iterowane: po wchłonięciu pierwszego sąsiada pętla wchłania drugiego', () => {
    // Tylko L1 (świat 24 000 j.): skala celu 1,31 → refScale 1,05, w paśmie L1.
    // Sąsiedzi nad i pod celem wnikają w okno tak głęboko, że oddech 12 px ich
    // nie usuwa; wchłonięcie górnego zostawia ucięty dolny, więc dopiero drugi
    // obrót pętli daje kadr bez uciętych fragmentów.
    const anchor = { 0: null, 1: { minX: 10000, minY: 5000, maxX: 10700, maxY: 5700 }, 2: null };
    const gora = { minX: 10200, minY: 4800, maxX: 10500, maxY: 4995 };
    const dol = { minX: 10200, minY: 5705, maxX: 10500, maxY: 5900 };
    const z = cameraReducer(
      stan(1.0, 1),
      kadr(anchor, { minLod: 1, przeszkodyByLod: { 0: [], 1: [gora, dol], 2: [] } }),
    );
    expect(z.lod).toBe(1);
    expect(lodFromScaleWithHysteresis(refScaleFor(z.transform.scale, 1, swiat), 1)).toBe(1);
    wKadrze(anchor[1], z);
    expect(stanSasiada(gora, z)).toBe('caly');
    expect(stanSasiada(dol, z)).toBe('caly');
    expect(z.transform.scale).toBeCloseTo((VIEWPORT.height - 2 * PADDING) / 1100, 6);
  });

  it('wiersz arkusza nad i pod stacją ucięty skrajem: kadr zmniejsza oddech, sąsiedzi wypadają, cel cały', () => {
    // Geometria zmierzona na fixturze 52 stacji (stacja odgałęzienia z wierszami
    // arkusza nad i pod, kanwa 1600×1000, doki 40 px u góry i u dołu): przy
    // pełnym oddechu 40 px okno sięga ~7 j. w głąb obu sąsiadów; wchłonięcie
    // zepchnęłoby skalę poniżej progu wyjścia z L2 (odrzucone — punkt stały
    // histerezy), więc ratuje dopiero mniejszy oddech.
    const insets: SafeInsets = { top: 40, right: 0, bottom: 40, left: 0 };
    const anchor = { 0: null, 1: null, 2: { minX: 4568, minY: 4544, maxX: 5382, maxY: 4950 } };
    const gora = { minX: 4696, minY: 4104, maxX: 5208, maxY: 4486 };
    const dol = { minX: 4200, minY: 5008, maxX: 4624, maxY: 5390 };
    const bez = cameraReducer(stan(1.6, 2), kadr(anchor, { safeInsets: insets }));
    const widocznyBez = { min: -bez.transform.translateY / bez.transform.scale, max: (VIEWPORT.height - bez.transform.translateY) / bez.transform.scale };
    expect(widocznyBez.min).toBeLessThan(gora.maxY); // bez przeszkód: obaj ucięci
    expect(widocznyBez.max).toBeGreaterThan(dol.minY);
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { safeInsets: insets, przeszkodyByLod: { 0: [], 1: [], 2: [gora, dol] } }));
    expect(z.lod).toBe(2);
    expect(z.transform.scale).toBeGreaterThan(bez.transform.scale);
    const okno = { min: -z.transform.translateY / z.transform.scale, max: (VIEWPORT.height - z.transform.translateY) / z.transform.scale };
    expect(okno.min).toBeGreaterThanOrEqual(gora.maxY);
    expect(okno.max).toBeLessThanOrEqual(dol.minY);
    // Cel dalej CAŁY w prostokącie bezpiecznym (bez oddechu, ale nie pod dokami).
    const e = prostokatNaEkranie(anchor[2], z);
    expect(e.minX).toBeGreaterThanOrEqual(-1e-6);
    expect(e.maxX).toBeLessThanOrEqual(VIEWPORT.width + 1e-6);
    expect(e.minY).toBeGreaterThanOrEqual(insets.top - 1e-6);
    expect(e.maxY).toBeLessThanOrEqual(VIEWPORT.height - insets.bottom + 1e-6);
  });

  it('wchłonięcie, które zepchnęłoby skalę poza poziom szczegółu, jest odrzucone (punkt stały histerezy)', () => {
    // Para sąsiadów blisko, ale wchłonięcie obu wymaga skali < progu wyjścia
    // z L2: kadr zostaje na L2 w skali celu, wynik jest punktem stałym histerezy.
    const anchor = { 0: null, 1: null, 2: { minX: 10000, minY: 5000, maxX: 11200, maxY: 5600 } };
    // Skraje obu sąsiadów w oknie także przy oddechu 12 px; wchłonięcie
    // któregokolwiek (1900 j.) daje skalę 0,8 < progu wyjścia z L2 (1,02).
    const lewy = { minX: 9300, minY: 5100, maxX: 9995, maxY: 5500 };
    const prawy = { minX: 11205, minY: 5100, maxX: 11900, maxY: 5500 };
    const bez = cameraReducer(stan(1.3, 2), kadr(anchor));
    expect(stanSasiada(lewy, bez)).toBe('uciety');
    const z = cameraReducer(stan(1.3, 2), kadr(anchor, { przeszkodyByLod: { 0: [], 1: [], 2: [lewy, prawy] } }));
    expect(lodFromScaleWithHysteresis(refScaleFor(z.transform.scale, z.lod, swiat), z.lod)).toBe(z.lod);
    expect(z.lod).toBe(2);
    expect(z.transform).toEqual(bez.transform);
  });

  it('przeszkoda nachodząca na cel jest pomijana (nie da się jej rozdzielić kadrem)', () => {
    const anchor = { 0: null, 1: null, 2: { minX: 10000, minY: 5000, maxX: 10600, maxY: 5600 } };
    const nachodzaca = { minX: 10500, minY: 5100, maxX: 10900, maxY: 5500 };
    const bez = cameraReducer(stan(1.6, 2), kadr(anchor));
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { przeszkodyByLod: { 0: [], 1: [], 2: [nachodzaca] } }));
    expect(z.transform).toEqual(bez.transform);
  });
});

describe("akcja 'kadruj' — cykl życia kadru", () => {
  it('zmiana rozmiaru kanwy PONAWIA kadr (pierwszy pomiar kontenera nie ucina celu)', () => {
    const anchor = cel(1200);
    const po = cameraReducer(stan(0.2, 0), kadr(anchor));
    const mniejsza = { width: 800, height: 600 };
    const poResize = cameraReducer(po, { type: 'resize', viewportSize: mniejsza });
    expect(poResize.transform.scale).toBeLessThan(po.transform.scale);
    wKadrze(anchor[poResize.lod], poResize, BEZ_ZASLON, mniejsza);
  });

  // K2: zmiana ZASŁON (portal rozdzielnicy nN otwarty/zamknięty nad kanwą — jedyna
  // zasłona kanwy po UI-02b) przy tym
  // samym rozmiarze kanwy ponawia kadr w nowym prostokącie bezpiecznym; akcja bez
  // zasłon zachowuje zasłony kadru. Iloczyn: zasłona {dochodzi · znika · bez zmian}.
  it('zmiana zasłon przy tym samym rozmiarze kanwy PONAWIA kadr w nowym prostokącie bezpiecznym', () => {
    const anchor = cel(1200);
    const po = cameraReducer(stan(0.2, 0), kadr(anchor));
    const portal: SafeInsets = { top: 0, right: 392, bottom: 0, left: 0 };
    const zPortalem = cameraReducer(po, { type: 'resize', viewportSize: VIEWPORT, safeInsets: portal });
    wKadrze(anchor[zPortalem.lod], zPortalem, portal);
    expect(zPortalem.transform).not.toEqual(po.transform);
    // Ta sama akcja bez zasłon nie gubi zasłony kadru (kadr pamięta swoje zasłony).
    const bezZmian = cameraReducer(zPortalem, { type: 'resize', viewportSize: VIEWPORT });
    expect(bezZmian.transform).toEqual(zPortalem.transform);
    // Portal zamknięty: kadr wraca DOKŁADNIE do kadru bez zasłon.
    const poZamknieciu = cameraReducer(zPortalem, { type: 'resize', viewportSize: VIEWPORT, safeInsets: BEZ_ZASLON });
    expect(poZamknieciu.transform).toEqual(cameraReducer(stan(0.2, 0), kadr(anchor, { safeInsets: BEZ_ZASLON })).transform);
  });

  it('gest projektanta (zoom) zdejmuje kadr — kolejna zmiana rozmiaru zachowuje jego skalę', () => {
    const po = cameraReducer(stan(0.2, 0), kadr(cel(1200)));
    const poZoomie = cameraReducer(po, { type: 'zoom', cursor: { x: 800, y: 500 }, factor: 1.1 });
    expect(poZoomie.kadr).toBeUndefined();
    const poResize = cameraReducer(poZoomie, { type: 'resize', viewportSize: { width: 800, height: 600 } });
    expect(poResize.transform.scale).toBe(poZoomie.transform.scale);
  });

  it('przesunięcie i kotwica edycji też zdejmują kadr', () => {
    const po = cameraReducer(stan(0.2, 0), kadr(cel(1200)));
    expect(cameraReducer(po, { type: 'pan', delta: { x: 10, y: 0 } }).kadr).toBeUndefined();
    const kotw = cameraReducer(po, {
      type: 'kotwicz',
      anchorByLod: { 0: cel(100)[0], 1: cel(100)[1], 2: cel(100)[2] },
      lodBboxes: swiat,
      viewportSize: VIEWPORT,
    });
    expect(kotw.kadr).toBeUndefined();
    // Kotwica edycji po kadrze nadal NIGDY nie przybliża.
    expect(kotw.transform.scale).toBeLessThanOrEqual(po.transform.scale);
  });

  it("'przywroc' (Poprzedni widok) ustawia transform i poziom z historii i zdejmuje kadr", () => {
    const przed = stan(0.3, 0);
    const po = cameraReducer(przed, kadr(cel(1200)));
    const wrocone = cameraReducer(po, { type: 'przywroc', transform: przed.transform, lod: przed.lod });
    expect(wrocone.transform).toEqual(przed.transform);
    expect(wrocone.lod).toBe(0);
    expect(wrocone.kadr).toBeUndefined();
    expect(wrocone.viewportSize).toEqual(po.viewportSize);
  });

  it('determinizm: dwa niezależne przebiegi dają identyczny stan', () => {
    const akcja = kadr(cel(1200), {
      minLod: 1,
      safeInsets: { top: 74, right: 0, bottom: 40, left: 0 },
      przeszkodyByLod: { 0: [], 1: [{ minX: 0, minY: 0, maxX: 100, maxY: 100 }], 2: [] },
    });
    expect(cameraReducer(stan(0.2, 0), akcja)).toEqual(cameraReducer(stan(0.2, 0), akcja));
  });
});

/**
 * K2 — TUSZ ETYKIET. Pismo tożsamości poniżej progu czytelności rośnie, gdy skala
 * maleje (zasięg ekranowy stały), więc etykieta wystaje poza slot sceny. Model
 * w teście: etykieta zakotwiczona w prawej krawędzi celu, szerokość 300 px EKRANU
 * (= 300/skala j. świata). Iloczyn: {cel, przeszkoda} × {z tuszem, bez tuszu}.
 */
describe("akcja 'kadruj' — poziom niższy, gdy na wybranym sąsiedzi zostają ucięci", () => {
  // Cel 1000×400 j. (L2) między dwoma sąsiadami 400 j. wysokimi, 20 j. nad i pod
  // nim. Na L2 przesunięcie nie usuwa obu, wchłonięcie drugiego zbija skalę
  // poniżej progu histerezy L2, mniejszy oddech nie wystarcza — kadr L2 zostaje
  // z uciętymi sąsiadami. Na L1 (świat 0,8×) wchłonięcie obu mieści się w skali
  // zgodnej z L1, a cel dalej dominuje.
  const naL1 = (b: BoundingBox): BoundingBox => ({ minX: b.minX * 0.8, minY: b.minY * 0.8, maxX: b.maxX * 0.8, maxY: b.maxY * 0.8 });
  const celL2: BoundingBox = { minX: 13500, minY: 5000, maxX: 14500, maxY: 5400 };
  const gora: BoundingBox = { minX: 13500, minY: 4580, maxX: 14500, maxY: 4980 };
  const dol: BoundingBox = { minX: 13500, minY: 5420, maxX: 14500, maxY: 5820 };
  const anchor = { 0: null, 1: naL1(celL2), 2: celL2 };
  const przeszkodyByLod = { 0: [], 1: [naL1(gora), naL1(dol)], 2: [gora, dol] };
  const zgodnyZHistereza = (s: CameraState) =>
    expect(lodFromScaleWithHysteresis(refScaleFor(s.transform.scale, s.lod, swiat), s.lod)).toBe(s.lod);

  it('minLod 1: kadr schodzi na L1 — obaj sąsiedzi w kadrze w całości, cel cały i dominujący, skala zgodna z histerezą', () => {
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { minLod: 1, przeszkodyByLod }));
    expect(z.lod).toBe(1);
    wKadrze(anchor[1], z);
    for (const p of przeszkodyByLod[1]) expect(stanSasiada(p, z)).not.toBe('uciety');
    zgodnyZHistereza(z);
    const e = prostokatNaEkranie(anchor[1], z);
    expect(Math.max(e.maxX - e.minX, e.maxY - e.minY)).toBeGreaterThanOrEqual(KADR_UDZIAL_DOMINACJI * Math.min(VIEWPORT.width, VIEWPORT.height));
  });

  it('minLod 2: niżej zejść nie wolno — kadr L2 z celem w centrum (sąsiedzi ucięci, cel ważniejszy)', () => {
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { minLod: 2, przeszkodyByLod }));
    expect(z.lod).toBe(2);
    wKadrze(celL2, z);
    expect(stanSasiada(gora, z)).toBe('uciety');
    const e = prostokatNaEkranie(celL2, z);
    expect((e.minX + e.maxX) / 2).toBeCloseTo(VIEWPORT.width / 2, 6);
    expect((e.minY + e.maxY) / 2).toBeCloseTo(VIEWPORT.height / 2, 6);
  });

  it('poziom wymuszony (L2) nie schodzi niżej', () => {
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { minLod: 1, przeszkodyByLod, wymuszonyLod: 2 }));
    expect(z.lod).toBe(2);
    wKadrze(celL2, z);
  });

  it('determinizm: ten sam stan i akcja — identyczny kadr', () => {
    const a = cameraReducer(stan(1.6, 2), kadr(anchor, { minLod: 1, przeszkodyByLod }));
    const b = cameraReducer(stan(1.6, 2), kadr(anchor, { minLod: 1, przeszkodyByLod }));
    expect(a.transform).toEqual(b.transform);
    expect(a.lod).toBe(b.lod);
  });
});

describe("akcja 'kadruj' — tusz etykiet (pismo powiększone przy oddaleniu)", () => {
  const anchor = cel(6000);
  const etykietaPrzy = (box: BoundingBox, scale: number): BoundingBox => ({
    minX: box.maxX,
    minY: box.minY,
    maxX: box.maxX + 300 / scale,
    maxY: box.minY + 20 / scale,
  });

  it('cel: kadr obejmuje tusz etykiety przy SKALI KOŃCOWEJ; bez tuszu etykieta wystaje poza kadr', () => {
    const bez = cameraReducer(stan(0.2, 0), kadr(anchor));
    const tuszBez = etykietaPrzy(anchor[bez.lod]!, bez.transform.scale);
    expect(prostokatNaEkranie(tuszBez, bez).maxX).toBeGreaterThan(VIEWPORT.width);
    const z = cameraReducer(
      stan(0.2, 0),
      kadr(anchor, { tuszEtykiet: (lod, scale) => ({ cel: etykietaPrzy(anchor[lod]!, scale), przeszkody: [] }) }),
    );
    expect(z.transform.scale).toBeLessThan(bez.transform.scale);
    wKadrze(anchor[z.lod], z);
    // Po KADR_LIMIT_TUSZU dołożeniach reszta (punkt stały nieosiągnięty dokładnie) mieści się w oddechu.
    const e = prostokatNaEkranie(etykietaPrzy(anchor[z.lod]!, z.transform.scale), z);
    expect(e.maxX).toBeLessThanOrEqual(VIEWPORT.width + 1e-6);
  });

  it('przeszkoda: tusz etykiety sąsiada wchodzący w okno czyni go uciętym — kadr go omija', () => {
    // Cel kwadratowy (skala ograniczona wysokością) zostawia luz w osi X. Sam
    // obrys sąsiada leży za prawą krawędzią, ale jego etykieta — rysowana
    // powiększonym pismem, 200 px ekranu w lewo od obrysu — wchodzi w okno.
    // Kadr liczony bez tuszu zostawia ją uciętą; z tuszem rysunek przesuwa się
    // w prawo (cel do prawego marginesu), aż etykieta wypada za krawędź.
    const anchorL2 = { 0: null, 1: null, 2: { minX: 10000, minY: 5000, maxX: 10600, maxY: 5600 } };
    const sasiad: BoundingBox = { minX: 10870, minY: 5100, maxX: 10970, maxY: 5500 };
    const tuszSasiadaPrzy = (scale: number): BoundingBox => ({ ...sasiad, minX: sasiad.minX - 200 / scale });
    const akcja = (z: boolean) =>
      kadr(anchorL2, {
        przeszkodyByLod: { 0: [], 1: [], 2: [sasiad] },
        tuszEtykiet: z
          ? (lod, scale) => ({ cel: null, przeszkody: lod === 2 ? [tuszSasiadaPrzy(scale)] : [] })
          : undefined,
      });
    const bez = cameraReducer(stan(1.6, 2), akcja(false));
    expect(stanSasiada(sasiad, bez)).toBe('poza');
    expect(stanSasiada(tuszSasiadaPrzy(bez.transform.scale), bez)).toBe('uciety');
    const z = cameraReducer(stan(1.6, 2), akcja(true));
    wKadrze(anchorL2[2], z);
    expect(z.transform.scale).toBe(bez.transform.scale);
    expect(stanSasiada(tuszSasiadaPrzy(z.transform.scale), z)).toBe('poza');
    expect(z.transform.translateX).toBeGreaterThan(bez.transform.translateX);
  });
});

describe("akcja 'resize' — odsłonięcie obiektu zasłony (poza kadrem)", () => {
  // Widok bez kadru: skala 0,1, przesunięcie zerowe. Obiekt w świecie L2.
  const zasloniety = { minX: 14000, minY: 4000, maxX: 15000, maxY: 5000 }; // ekran x 1400–1500
  const odslon = (b: BoundingBox | null) => ({ 0: b, 1: b, 2: b });
  const ZASLONA: SafeInsets = { top: 0, right: 392, bottom: 0, left: 0 };
  const start = { ...stan(0.1, 2) };

  it('obiekt pod zasłoną: najmniejsze przesunięcie w lewo do prostokąta bezpiecznego z oddechem; skala i poziom bez zmian', () => {
    const po = cameraReducer(start, { type: 'resize', viewportSize: VIEWPORT, safeInsets: ZASLONA, odslon: odslon(zasloniety) });
    expect(po.transform.scale).toBe(0.1);
    expect(po.lod).toBe(2);
    const e = prostokatNaEkranie(zasloniety, po);
    expect(e.maxX).toBeCloseTo(VIEWPORT.width - ZASLONA.right - PADDING, 6);
    expect(po.transform.translateY).toBe(0);
  });

  it('obiekt widoczny: kadr bez zmian', () => {
    const widoczny = { minX: 2000, minY: 2000, maxX: 3000, maxY: 3000 };
    const s0 = cameraReducer(start, { type: 'resize', viewportSize: VIEWPORT, safeInsets: BEZ_ZASLON });
    const po = cameraReducer(s0, { type: 'resize', viewportSize: VIEWPORT, safeInsets: ZASLONA, odslon: odslon(widoczny) });
    expect(po.transform).toEqual(s0.transform);
  });

  it('obiekt szerszy niż prostokąt: wyrównanie do lewej krawędzi (początek widoczny)', () => {
    const szeroki = { minX: 3000, minY: 1000, maxX: 20000, maxY: 2000 };
    const po = cameraReducer(start, { type: 'resize', viewportSize: VIEWPORT, safeInsets: ZASLONA, odslon: odslon(szeroki) });
    expect(prostokatNaEkranie(szeroki, po).minX).toBeCloseTo(PADDING, 6);
  });

  it('obiekt bez rysunku na bieżącym poziomie: bez przesunięcia', () => {
    const po = cameraReducer(start, {
      type: 'resize',
      viewportSize: VIEWPORT,
      safeInsets: ZASLONA,
      odslon: { 0: zasloniety, 1: zasloniety, 2: null },
    });
    expect(po.transform).toEqual(start.transform);
  });

  it('trwający kadr ma pierwszeństwo: ponawia się na nowych zasłonach, odsłonięcie nie przesuwa go', () => {
    const anchor = cel(1200);
    const k = cameraReducer(stan(0.2, 0), kadr(anchor));
    const zOdslonem = cameraReducer(k, { type: 'resize', viewportSize: VIEWPORT, safeInsets: ZASLONA, odslon: odslon(zasloniety) });
    const bezOdslonu = cameraReducer(k, { type: 'resize', viewportSize: VIEWPORT, safeInsets: ZASLONA });
    expect(zOdslonem.transform).toEqual(bezOdslonu.transform);
    wKadrze(anchor[zOdslonem.lod], zOdslonem, ZASLONA);
  });
});
