// @vitest-environment node
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
 *  - sąsiedzi: brak × jeden z boku (kadr przesuwa się w granicach luzu) ×
 *    po obu stronach (kadr zostaje na środku, skala celu) × nachodzący na cel
 *    (pomijany) — K2b §0.1: sąsiad NIGDY nie zmienia skali ani poziomu
 *    szczegółu kadru (dawne wchłanianie sąsiada i zejście poziomu „dla
 *    sąsiada" skasowane: dawało identyczne kadry sąsiednich stacji, Z-02);
 *  - kryteria K2b §0.2 na iloczynie cel {stacja, pole, sekcja, magistrala, tor,
 *    sieć} × sąsiedztwo {brak, z jednej strony, z obu stron, nachodzące} ×
 *    proporcje {zwarte, wydłużone} × okno {1440×900, 1920×1080, 1100×700}:
 *    (a) kompletność — cały cel w prostokącie bezpiecznym z oddechem i skala
 *    największa mieszcząca; (c) izolacja po stronie kamery — skala i poziom
 *    niezależne od sąsiedztwa; (d) rozróżnialność — sąsiednie cele dają różne
 *    kadry. Kryterium (b) czytelności (≥ 13 px opisów celu) przypina plan
 *    etykiet (`labelLegibility.kadr.test.ts`), izolację po stronie obrazu —
 *    kurtyna kanwy (`kurtynaKadru.contract.test.tsx`);
 *  - cykl życia: zmiana rozmiaru kanwy PONAWIA kadr × gest projektanta (zoom,
 *    przesunięcie, kotwica) zdejmuje kadr × „Poprzedni widok" (`'przywroc'`);
 *  - determinizm.
 */
import { describe, expect, it } from 'vitest';

import {
  cameraReducer,
  DEFAULT_LOD_THRESHOLDS,
  KADR_MAX_SCALE,
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

  // K2b §0.1 — dawny przypadek „bliższy sąsiad wchłonięty w całości" legalizował
  // wadę Z-02: kadr stacji obejmował sumę celu i sąsiada, więc kadr sąsiada
  // (wchłaniający cel) dawał ten sam obraz. Intencja po zmianie kanonu: sąsiedzi
  // po obu stronach nie poszerzają kadru — skala i środek są kadrem samego celu,
  // a to, co z sąsiadów wpadło w okno, przyciemnia kurtyna kanwy.
  it('sąsiedzi blisko po obu stronach: kadr NIE wchłania żadnego — skala i środek celu', () => {
    const anchor = { 0: null, 1: null, 2: { minX: 10000, minY: 5000, maxX: 10600, maxY: 5600 } };
    const lewy = { minX: 9700, minY: 5100, maxX: 9900, maxY: 5500 };
    const prawy = { minX: 10700, minY: 5100, maxX: 10900, maxY: 5500 };
    const bez = cameraReducer(stan(1.6, 2), kadr(anchor));
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { przeszkodyByLod: { 0: [], 1: [], 2: [lewy, prawy] } }));
    expect(z.transform).toEqual(bez.transform);
    expect(z.lod).toBe(bez.lod);
    wKadrze(anchor[2], z);
    const e = prostokatNaEkranie(anchor[2], z);
    expect((e.minX + e.maxX) / 2).toBeCloseTo(VIEWPORT.width / 2, 6);
  });

  it('sąsiedzi rozlegli i głęboko w oknie po obu stronach: cel zostaje w centrum, w skali celu', () => {
    const anchor = { 0: null, 1: null, 2: { minX: 10000, minY: 5000, maxX: 10600, maxY: 5600 } };
    const lewy = { minX: 7400, minY: 5100, maxX: 9850, maxY: 5500 };
    const prawy = { minX: 10750, minY: 5100, maxX: 13200, maxY: 5500 };
    const bez = cameraReducer(stan(1.6, 2), kadr(anchor));
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { przeszkodyByLod: { 0: [], 1: [], 2: [lewy, prawy] } }));
    expect(z.transform).toEqual(bez.transform);
  });

  // K2b §0.1 — dawny przypadek „wiersz arkusza nad i pod stacją: kadr zmniejsza
  // oddech" zmieniał skalę kadru ze względu na sąsiadów. Intencja po zmianie
  // kanonu: oddech kadru jest stały (`KADR_PADDING_PX`), sąsiad nad i pod nie
  // zmienia skali; ta sama geometria zmierzona na fixturze 52 stacji.
  it('wiersz arkusza nad i pod stacją: oddech i skala bez zmian, cel cały z oddechem', () => {
    const insets: SafeInsets = { top: 40, right: 0, bottom: 40, left: 0 };
    const anchor = { 0: null, 1: null, 2: { minX: 4568, minY: 4544, maxX: 5382, maxY: 4950 } };
    const gora = { minX: 4696, minY: 4104, maxX: 5208, maxY: 4486 };
    const dol = { minX: 4200, minY: 5008, maxX: 4624, maxY: 5390 };
    const bez = cameraReducer(stan(1.6, 2), kadr(anchor, { safeInsets: insets }));
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { safeInsets: insets, przeszkodyByLod: { 0: [], 1: [], 2: [gora, dol] } }));
    expect(z.lod).toBe(2);
    expect(z.transform.scale).toBe(bez.transform.scale);
    wKadrze(anchor[2], z, insets);
  });

  // K2b §0.1 — dawny opis „poziom niższy, gdy na wybranym sąsiedzi zostają
  // ucięci" (zejście L2 → L1, żeby wchłonąć sąsiadów nad i pod celem). Intencja
  // po zmianie kanonu: poziom szczegółu wynika WYŁĄCZNIE ze skali celu.
  it('sąsiedzi nad i pod celem nie obniżają poziomu szczegółu (bez wymuszonego zejścia)', () => {
    const naL1 = (b: BoundingBox): BoundingBox => ({ minX: b.minX * 0.8, minY: b.minY * 0.8, maxX: b.maxX * 0.8, maxY: b.maxY * 0.8 });
    const celL2: BoundingBox = { minX: 13500, minY: 5000, maxX: 14500, maxY: 5400 };
    const gora: BoundingBox = { minX: 13500, minY: 4580, maxX: 14500, maxY: 4980 };
    const dol: BoundingBox = { minX: 13500, minY: 5420, maxX: 14500, maxY: 5820 };
    const anchor = { 0: null, 1: naL1(celL2), 2: celL2 };
    const przeszkodyByLod = { 0: [], 1: [naL1(gora), naL1(dol)], 2: [gora, dol] };
    for (const minLod of [1, 2] as const) {
      const bez = cameraReducer(stan(1.6, 2), kadr(anchor, { minLod }));
      const z = cameraReducer(stan(1.6, 2), kadr(anchor, { minLod, przeszkodyByLod }));
      expect(z.lod).toBe(2);
      expect(z.lod).toBe(bez.lod);
      expect(z.transform).toEqual(bez.transform);
      wKadrze(celL2, z);
    }
  });

  it('przeszkoda nachodząca na cel jest pomijana (nie da się jej rozdzielić kadrem)', () => {
    const anchor = { 0: null, 1: null, 2: { minX: 10000, minY: 5000, maxX: 10600, maxY: 5600 } };
    const nachodzaca = { minX: 10500, minY: 5100, maxX: 10900, maxY: 5500 };
    const bez = cameraReducer(stan(1.6, 2), kadr(anchor));
    const z = cameraReducer(stan(1.6, 2), kadr(anchor, { przeszkodyByLod: { 0: [], 1: [], 2: [nachodzaca] } }));
    expect(z.transform).toEqual(bez.transform);
  });
});

/**
 * K2b §0.2 — KRYTERIA KADRU na iloczynie cech: cel × sąsiedztwo × proporcje ×
 * okno. Cel różni się dla kamery rozmiarem, proporcjami, dolną granicą poziomu
 * (`minLod`: stacja, pole i sekcja pokazują wnętrze) i obecnością rysunku na L0
 * (pole i sekcja na L0 są częścią zwiniętego bloku stacji — `null`). Wymiary
 * w jednostkach świata L2; L1 i L0 to te same obiekty w światach 0,8× i 2/3×.
 * Sąsiad jest obiektem tej samej klasy co cel (sąsiednia stacja, sąsiednie
 * pole, równoległa magistrala), w odstępie 20 % szerokości celu.
 */
describe("akcja 'kadruj' — kryteria K2b §0.2 (cel × sąsiedztwo × proporcje × okno)", () => {
  type RodzajCelu = 'stacja' | 'pole' | 'sekcja' | 'magistrala' | 'tor' | 'siec';
  type Proporcje = 'zwarte' | 'wydluzone';
  type Sasiedztwo = 'brak' | 'z_jednej_strony' | 'z_obu_stron' | 'nachodzace';
  const CELE: Readonly<
    Record<RodzajCelu, { readonly wymiary: Readonly<Record<Proporcje, readonly [number, number]>>; readonly minLod?: SceneLod; readonly bezL0?: boolean }>
  > = {
    stacja: { wymiary: { zwarte: [700, 560], wydluzone: [1500, 380] }, minLod: 1 },
    pole: { wymiary: { zwarte: [80, 220], wydluzone: [44, 520] }, minLod: 1, bezL0: true },
    sekcja: { wymiary: { zwarte: [300, 180], wydluzone: [620, 90] }, minLod: 1, bezL0: true },
    magistrala: { wymiary: { zwarte: [4000, 2600], wydluzone: [12000, 500] } },
    tor: { wymiary: { zwarte: [2400, 1600], wydluzone: [7000, 600] } },
    siec: { wymiary: { zwarte: [18000, 7000], wydluzone: [20000, 3000] } },
  };
  const OKNA = [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1100, height: 700 },
  ] as const;
  const SASIEDZTWA: readonly Sasiedztwo[] = ['brak', 'z_jednej_strony', 'z_obu_stron', 'nachodzace'];
  const SRODEK_L2 = { x: 15000, y: 5000 };
  const naPoziom = (b: BoundingBox, lod: SceneLod): BoundingBox => {
    const f = lod === 2 ? 1 : lod === 1 ? 0.8 : 2 / 3;
    return { minX: b.minX * f, minY: b.minY * f, maxX: b.maxX * f, maxY: b.maxY * f };
  };
  const prostokatL2 = (w: number, h: number, dx = 0): BoundingBox => ({
    minX: SRODEK_L2.x - w / 2 + dx,
    minY: SRODEK_L2.y - h / 2,
    maxX: SRODEK_L2.x + w / 2 + dx,
    maxY: SRODEK_L2.y + h / 2,
  });
  const naPoziomy = (b: BoundingBox, bezL0: boolean): Record<SceneLod, BoundingBox | null> => ({
    0: bezL0 ? null : naPoziom(b, 0),
    1: naPoziom(b, 1),
    2: b,
  });
  const sasiedziL2 = (w: number, h: number, sasiedztwo: Sasiedztwo): BoundingBox[] => {
    const odstep = w + 0.2 * w;
    if (sasiedztwo === 'brak') return [];
    if (sasiedztwo === 'z_jednej_strony') return [prostokatL2(w, h, odstep)];
    if (sasiedztwo === 'z_obu_stron') return [prostokatL2(w, h, odstep), prostokatL2(w, h, -odstep)];
    return [prostokatL2(w, h, w / 2)];
  };
  const naPoziomyPrzeszkod = (lista: readonly BoundingBox[]): Record<SceneLod, BoundingBox[]> => ({
    0: lista.map((b) => naPoziom(b, 0)),
    1: lista.map((b) => naPoziom(b, 1)),
    2: [...lista],
  });
  const stanOkna = (okno: { readonly width: number; readonly height: number }): CameraState => ({
    transform: { scale: 0.2, translateX: 0, translateY: 0 },
    lod: 0,
    viewportSize: okno,
    lodBboxes: swiat,
  });

  for (const rodzaj of Object.keys(CELE) as RodzajCelu[]) {
    const { wymiary, minLod, bezL0 = false } = CELE[rodzaj];
    for (const proporcje of ['zwarte', 'wydluzone'] as const) {
      for (const okno of OKNA) {
        it(`${rodzaj} · ${proporcje} · okno ${okno.width}×${okno.height}: (a) kompletność, (c) skala i poziom niezależne od sąsiedztwa, (d) rozróżnialność`, () => {
          const [w, h] = wymiary[proporcje];
          const celL2 = prostokatL2(w, h);
          const anchor = naPoziomy(celL2, bezL0);
          const akcja = (a: AkcjaKadru['anchorByLod'], przeszkody: readonly BoundingBox[]): AkcjaKadru => ({
            type: 'kadruj',
            anchorByLod: a,
            lodBboxes: swiat,
            viewportSize: okno,
            ...(minLod !== undefined ? { minLod } : {}),
            przeszkodyByLod: naPoziomyPrzeszkod(przeszkody),
          });
          const bez = cameraReducer(stanOkna(okno), akcja(anchor, []));
          for (const sasiedztwo of SASIEDZTWA) {
            const sasiedzi = sasiedziL2(w, h, sasiedztwo);
            const z = cameraReducer(stanOkna(okno), akcja(anchor, sasiedzi));
            // (a) KOMPLETNOŚĆ: cały cel w prostokącie bezpiecznym z oddechem…
            const celKadru = anchor[z.lod];
            expect(celKadru, `${sasiedztwo}: poziom bez rysunku celu`).not.toBeNull();
            wKadrze(celKadru!, z, BEZ_ZASLON, okno);
            // …przy skali NAJWIĘKSZEJ mieszczącej (dotyka marginesu w jednej osi albo granica skali).
            const e = prostokatNaEkranie(celKadru!, z);
            const wypelnienie = Math.max(
              (e.maxX - e.minX) / (okno.width - 2 * PADDING),
              (e.maxY - e.minY) / (okno.height - 2 * PADDING),
            );
            if (z.transform.scale < KADR_MAX_SCALE - 1e-9) expect(wypelnienie).toBeCloseTo(1, 6);
            if (minLod !== undefined) expect(z.lod).toBeGreaterThanOrEqual(minLod);
            expect(lodFromScaleWithHysteresis(refScaleFor(z.transform.scale, z.lod, swiat), z.lod)).toBe(z.lod);
            // (c) IZOLACJA po stronie kamery: sąsiad nie zmienia skali ani poziomu
            // (żadnego wchłaniania, żadnego zejścia poziomu „dla sąsiada").
            expect(z.transform.scale, sasiedztwo).toBe(bez.transform.scale);
            expect(z.lod, sasiedztwo).toBe(bez.lod);
            // Sąsiad z obu stron albo nachodzący: kadr zostaje na środku celu.
            if (sasiedztwo === 'z_obu_stron' || sasiedztwo === 'nachodzace' || sasiedztwo === 'brak') {
              expect(z.transform).toEqual(bez.transform);
            }
            // (d) ROZRÓŻNIALNOŚĆ: kadr sąsiada (sąsiad celem, cel przeszkodą) jest inny.
            if (sasiedzi.length > 0) {
              const sasiadL2 = sasiedzi[0]!;
              const reszta = [celL2, ...sasiedzi.slice(1)];
              const kadrSasiada = cameraReducer(stanOkna(okno), akcja(naPoziomy(sasiadL2, bezL0), reszta));
              expect(kadrSasiada.transform, `${sasiedztwo}: kadr sąsiada identyczny z kadrem celu`).not.toEqual(z.transform);
              wKadrze(naPoziomy(sasiadL2, bezL0)[kadrSasiada.lod]!, kadrSasiada, BEZ_ZASLON, okno);
            }
          }
        });
      }
    }
  }
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
    const wrocone = cameraReducer(po, {
      type: 'przywroc',
      transform: przed.transform,
      lod: przed.lod,
      viewportSize: przed.viewportSize,
    });
    expect(wrocone.transform).toEqual(przed.transform);
    expect(wrocone.lod).toBe(0);
    expect(wrocone.kadr).toBeUndefined();
    expect(wrocone.viewportSize).toEqual(po.viewportSize);
  });

  /**
   * FIX-E2E-PELNE — powrót z historii przy INNEJ szerokości kanwy niż w chwili zapisu.
   * Pomiar w żywej aplikacji (okno 1600 px): zaznaczenie stacji otwiera inspektor, kanwa
   * zwęża się z 1322 do 956 px; dawne 'przywroc' kładło stary transform na kanwę innej
   * szerokości, a późniejsze 'resize' (inspektor zamknięty) dokładało pół różnicy — każdy
   * cykl „dwuklik stacji → Sieć" przesuwał rysunek o 183 px. Iloczyn cech: viewport zapisu
   * (szeroki / wąski) × viewport powrotu (szeroki / wąski) × liczba cykli (1 / 5).
   */
  describe("'przywroc' przenosi zapamiętany kadr do bieżącego viewportu", () => {
    const SZEROKI = { width: 1322, height: 856 } as const;
    const WASKI = { width: 956, height: 856 } as const;
    const bazowy: CameraState = {
      transform: { scale: 0.324, translateX: 302.3, translateY: 67.1 },
      lod: 0,
      viewportSize: SZEROKI,
      lodBboxes: swiat,
    };
    const resize = (s: CameraState, v: { width: number; height: number }) =>
      cameraReducer(s, { type: 'resize', viewportSize: v });
    const srodekSwiata = (s: CameraState) => ({
      x: (s.viewportSize.width / 2 - s.transform.translateX) / s.transform.scale,
      y: (s.viewportSize.height / 2 - s.transform.translateY) / s.transform.scale,
    });
    const blisko = (a: CameraState, b: CameraState) => {
      expect(a.transform.scale).toBeCloseTo(b.transform.scale, 9);
      expect(a.transform.translateX).toBeCloseTo(b.transform.translateX, 6);
      expect(a.transform.translateY).toBeCloseTo(b.transform.translateY, 6);
      expect(a.viewportSize).toEqual(b.viewportSize);
    };

    for (const zapis of [
      { nazwa: 'zapis w szerokim', viewport: SZEROKI },
      { nazwa: 'zapis w wąskim', viewport: WASKI },
    ]) {
      for (const powrot of [
        { nazwa: 'powrót w szerokim', viewport: SZEROKI },
        { nazwa: 'powrót w wąskim', viewport: WASKI },
      ]) {
        it(`${zapis.nazwa} × ${powrot.nazwa}: środek świata zachowany, skala i poziom z wpisu`, () => {
          const wpis = zapis.viewport === SZEROKI ? bazowy : resize(bazowy, zapis.viewport);
          // Po wejściu w stację kamera jest gdzie indziej i w viewporcie powrotu.
          const poKadrze = cameraReducer(resize(bazowy, powrot.viewport), kadr(cel(1200), { viewportSize: powrot.viewport }));
          const wrocone = cameraReducer(poKadrze, {
            type: 'przywroc',
            transform: wpis.transform,
            lod: wpis.lod,
            viewportSize: wpis.viewportSize,
          });
          expect(wrocone.viewportSize).toEqual(powrot.viewport);
          expect(wrocone.transform.scale).toBe(wpis.transform.scale);
          expect(wrocone.lod).toBe(wpis.lod);
          expect(wrocone.kadr).toBeUndefined();
          const a = srodekSwiata(wrocone);
          const b = srodekSwiata(wpis);
          expect(a.x).toBeCloseTo(b.x, 6);
          expect(a.y).toBeCloseTo(b.y, 6);
          // Po powrocie kanwy do szerokości startowej obraz jest DOKŁADNIE kadrem startowym.
          blisko(resize(wrocone, SZEROKI), bazowy);
        });
      }
    }

    it('pięć cykli „wejście (inspektor otwarty) → Sieć (inspektor zamknięty)" bez dryfu', () => {
      let s = bazowy;
      for (let i = 0; i < 5; i += 1) {
        // Pierwszy klik dwukliku zaznacza stację: inspektor otwarty, kanwa wąska. Wpis
        // historii bywa sprzed tego 'resize' (zgłoszenie kamery spóźnia się o render).
        const wpis = s;
        s = resize(s, WASKI);
        s = cameraReducer(s, kadr(cel(1200), { viewportSize: WASKI }));
        s = cameraReducer(s, {
          type: 'przywroc',
          transform: wpis.transform,
          lod: wpis.lod,
          viewportSize: wpis.viewportSize,
        });
        // Zaznaczenie sprzed wejścia (puste) zamyka inspektor: kanwa znów szeroka.
        s = resize(s, SZEROKI);
      }
      blisko(s, bazowy);
    });
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
