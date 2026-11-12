/**
 * KARTA S9-4 — TRAFIENIE I TOŻSAMOŚĆ ZAZNACZENIA (audyt
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §3.2: P-1, P-2, P-3, P-6).
 *
 * Ten plik PRZYPINA deklaracje z nagłówka `canvas/hitAreas.ts` do realnego
 * drzewa DOM (reguła KLASA, NIE INSTANCJA pkt 4: „deklaracja bez testu =
 * fałszywa pewność"). Sonda odbioru w `scripts/sld_v3_acceptance.mjs` mierzy
 * SKUTECZNOŚĆ na całej sieci referencyjnej; tutaj sprawdzamy KONTRAKT:
 *
 *  1. render buduje uchwyty TĄ SAMĄ funkcją, którą czyta sonda
 *     (`buildCanvasHitAreas`) — geometria co do bajta, nie „mniej więcej";
 *  2. każdy RODZAJ obiektu kanwy ma uchwyt (iloczyn cech {rodzaj} × {skala kamery} — R6);
 *  3. rysunek jest BIERNY — żaden napis/nakładka nie łapie kliku;
 *  4. klik NATYWNY (`userEvent`, pełna sekwencja pointer/mouse/click przez DOM
 *     — nie `dispatchEvent` na handlerze) niesie `ownerRef` KLIKNIĘTEGO
 *     obiektu, także dla aparatu pola i dla etykiety;
 *  5. klik w tło (poza uchwytami) melduje TŁO, nie obiekt.
 *
 * Zero-Debt pkt 5: wszystkie kliki idą przez `userEvent` na węźle, który w
 * przeglądarce faktycznie byłby celem zdarzenia (węzeł warstwy trafień) —
 * precedens „martwego lewego kliku" (capture-on-pointerdown) był latami
 * niewidoczny właśnie dlatego, że specy klikały syntetycznie w węzeł rysunku.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects } from '../../scene/buildScene';
import { planSceneLabels } from '../labelLegibility';
import { sheetSizeFor } from '../../sheet/outline';
import { SldCanvasV3 } from '../SldCanvasV3';
import {
  HIT_ATTR,
  MIN_HIT_SCREEN_PX,
  buildCanvasHitAreas,
  hitAreasFromDom,
  pickCanvasHitArea,
  pointerBlockersInDom,
  rozstrzygnijTrafienieWezla,
  type CanvasHitArea,
  type HitDomNode,
  type HitObjectClass,
} from '../hitAreas';
import { zRekordamiAparatowPol } from '../../scene/__tests__/fixtures/rekordyAparatowPola';
import { hierarchiaCelowTrafienia } from '../zakresKadru';
import { FRAME_MARGIN } from '../../sheet/Frame';
import { kameraNadSymbolem } from './kameraTestowa';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
// GEOMETRIA-STACJI (§0 pkt 4a): aparaty pól (głowice, uziemniki, odłączniki) istnieją WYŁĄCZNIE
// z rekordów modelu — sieć referencyjna niesie w polach tylko gałąź wyłącznika, więc fikstura
// deklaruje rekordy wyposażenia pól jawnie (dawniej dostarczała je konwencja roli).
const enm = zRekordamiAparatowPol(
  (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm,
);

const CANVAS_WIDTH = 1322;
const CANVAS_HEIGHT = 696;
// Płótno dla testów, które klikają w NAPIS: przy kadrze całego arkusza na
// 1322×696 fikstura 52 stacji ma skalę 0,076 (pomiar 2026-11-05 — arkusz
// 8100×7038 po wpięciu bloku zabezpieczeń w każde pole stacji, trzy wiersze
// arkusza zamiast dwóch; wcześniej 7432×6286, skala 0,085), a podpisy stacji
// spadają pod podłogę czytelności 13 px ekranu i słusznie nie są rysowane.
// Test uchwytu napisu potrzebuje napisu NARYSOWANEGO, więc renderuje płótno
// ekranu Full HD (skala ~0,118), na którym plan etykiet je umieszcza.
const CANVAS_FHD_WIDTH = 1920;
const CANVAS_FHD_HEIGHT = 1080;

function svgOf(container: HTMLElement): SVGSVGElement {
  return container.querySelector('[data-testid="sld-canvas-v3"]') as SVGSVGElement;
}

/** Skala kamery odczytana z kadru — ta sama wielkość, którą liczy render. */
function scaleOf(container: HTMLElement, szerokosc: number = CANVAS_WIDTH): number {
  const viewBox = svgOf(container).getAttribute('viewBox')!.split(' ').map(Number);
  return szerokosc / viewBox[2];
}

/** Uchwyt obiektu — R8: jeden węzeł na obiekt (kształt obszaru, obrys w `data-hit-obrys`). */
function hitNode(container: HTMLElement, testId: string): Element | null {
  return container.querySelector(`[${HIT_ATTR.for}="${CSS.escape(testId)}"]`);
}

/** Obszary, które render buduje dla tej sceny i skali (hierarchia celów i podpowiedzi — R6, R4). */
function oczekiwaneObszary(scale: number): readonly CanvasHitArea[] {
  const scene = buildSceneV3(enm);
  const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));
  return buildCanvasHitAreas({
    symbols: scene.symbols,
    segments: scene.segments,
    labels: plan.drawn,
    tozsamosciWPodpowiedzi: plan.tozsamosciWPodpowiedzi,
    resultMarkers: [],
    scale,
    hierarchiaCelow: hierarchiaCelowTrafienia(enm, scene),
  });
}

describe('S9-4 — nazwy atrybutów kanału trafień', () => {
  it('stałe `HIT_ATTR` są DOKŁADNIE tymi atrybutami, które renderuje kanwa (jedno źródło nazw)', () => {
    expect(HIT_ATTR).toEqual({
      for: 'data-hit-for',
      klasa: 'data-hit-klasa',
      ownerRef: 'data-hit-owner-ref',
      // S9-10 (dług `S9-4-DLUG-INSPEKTOR`): ref pojedynczego aparatu.
      deviceRef: 'data-hit-device-ref',
      // R8 (karta SLD-SKALA-I-NAWIGACJA): obrys na jedynym węźle obiektu.
      obrys: 'data-hit-obrys',
    });
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onElementClick={() => {}} />,
    );
    const dowolny = container.querySelector(`[${HIT_ATTR.for}]`);
    expect(dowolny, 'warstwa trafień renderuje węzły z kanałem audytu').toBeTruthy();
    expect(dowolny!.getAttribute(HIT_ATTR.obrys)).toMatch(/^-?[\d.]/);
    expect(dowolny!.getAttribute(HIT_ATTR.klasa)).toBeTruthy();
  });
});

describe('S9-4 — render buduje uchwyty tą samą funkcją, którą czyta sonda', () => {
  it('geometria uchwytów w DOM == `buildCanvasHitAreas` (co do wartości, nie „mniej więcej")', () => {
      const { container } = render(
        <SldCanvasV3
          snapshot={enm}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onElementClick={() => {}}
        />,
      );
      const scale = scaleOf(container);
      const oczekiwane = oczekiwaneObszary(scale);
      const zDrzewa = hitAreasFromDom(svgOf(container) as unknown as HitDomNode);
      expect(zDrzewa.length).toBe(oczekiwane.length);
      const wgTestId = new Map(zDrzewa.map((a) => [a.testId, a]));
      for (const area of oczekiwane) {
        const wDom = wgTestId.get(area.testId);
        expect(wDom, `obiekt ${area.testId} ma uchwyt w drzewie`).toBeTruthy();
        expect(wDom!.klasa).toBe(area.klasa);
        expect(wDom!.ownerRef ?? undefined).toBe(area.ownerRef);
        // Geometria: prostokąt co do współrzędnych, łamana co do grubości i
        // liczby wierzchołków (wartości przechodzą przez atrybut `d`).
        //
        // Tolerancja 1e-6, nie równość bitowa: skalę kamery test odzyskuje z
        // ZAPISANEGO `viewBox` (tekst), więc różni się od tej, którą render miał
        // w pamięci, o ostatni bit mantysy — a plan etykiet jest od skali
        // zależny. Porównujemy geometrię, nie zaokrąglenie IEEE 754.
        if (area.obszar.ksztalt === 'prostokat') {
          expect(wDom!.obszar.ksztalt).toBe('prostokat');
          const wDomProstokat = wDom!.obszar as { x: number; y: number; width: number; height: number };
          expect(wDomProstokat.x).toBeCloseTo(area.obszar.x, 6);
          expect(wDomProstokat.y).toBeCloseTo(area.obszar.y, 6);
          expect(wDomProstokat.width).toBeCloseTo(area.obszar.width, 6);
          expect(wDomProstokat.height).toBeCloseTo(area.obszar.height, 6);
        } else {
          expect(wDom!.obszar.ksztalt).toBe('lamana');
          expect((wDom!.obszar as { halfWidth: number }).halfWidth).toBeCloseTo(area.obszar.halfWidth, 6);
        }
        // R8: obrys niesie atrybut jedynego węzła — ta sama geometria co w funkcji.
        if (area.obrys.ksztalt === 'prostokat') {
          const o = wDom!.obrys as { x: number; y: number; width: number; height: number };
          expect(o.x).toBeCloseTo(area.obrys.x, 6);
          expect(o.y).toBeCloseTo(area.obrys.y, 6);
          expect(o.width).toBeCloseTo(area.obrys.width, 6);
          expect(o.height).toBeCloseTo(area.obrys.height, 6);
        } else {
          expect((wDom!.obrys as { halfWidth: number }).halfWidth).toBeCloseTo(area.obrys.halfWidth, 6);
        }
      }
    },
  );
});

describe('S9-4 — inwentarz klasy: KAŻDY rodzaj obiektu kanwy ma uchwyt ≥ 24 px ekranu', () => {
  /** Jedna scena (karta SLD-SKALA-I-NAWIGACJA R1): łączniki wierszy arkusza (S9-1), napisy
   *  stacji, aparaty pól, transformatory, szyny i układy DER są w scenie w każdej skali.
   *  Błędem jest rodzaj OBECNY na scenie i BEZ uchwytu. */
  it('żaden rodzaj obiektu sceny nie zostaje bez uchwytu', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onElementClick={() => {}} />,
    );
    const scale = scaleOf(container);
    const oczekiwane = oczekiwaneObszary(scale);
    const obecneRodzaje = new Set<HitObjectClass>(oczekiwane.map((a) => a.klasa));
    // Sanity: scena referencyjna niesie WIĘCEJ NIŻ JEDEN rodzaj (inaczej test
    // przechodziłby na pustym zbiorze cech).
    expect(obecneRodzaje.size).toBeGreaterThan(3);
    const zDrzewa = hitAreasFromDom(svgOf(container) as unknown as HitDomNode);
    const rodzajeWDrzewie = new Set<HitObjectClass>(zDrzewa.map((a) => a.klasa));
    for (const rodzaj of obecneRodzaje) {
      expect(rodzajeWDrzewie.has(rodzaj), `rodzaj „${rodzaj}" ma uchwyt w drzewie`).toBe(true);
    }
    // Minimum ekranowe — na KAŻDYM obiekcie, nie na wybranym przykładzie.
    for (const area of zDrzewa) {
      const najmniejszy =
        area.obszar.ksztalt === 'prostokat'
          ? Math.min(area.obszar.width, area.obszar.height) * scale
          : 2 * area.obszar.halfWidth * scale;
      expect(najmniejszy + 1e-9, `obiekt ${area.testId}`).toBeGreaterThanOrEqual(MIN_HIT_SCREEN_PX);
    }
  });

  it('przegląd (dopasowanie FHD) niesie łączniki wierszy arkusza (S9-1) i napisy stacji — oba z uchwytem', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_FHD_WIDTH} height={CANVAS_FHD_HEIGHT} onElementClick={() => {}} />,
    );
    const zDrzewa = hitAreasFromDom(svgOf(container) as unknown as HitDomNode);
    expect(zDrzewa.filter((a) => a.klasa === 'lacznik-wiersza').length).toBeGreaterThan(0);
    // Stację w przeglądzie wskazuje napis identyfikacji (`<ref>#name-row-0`) — dawny blok
    // zwinięty widoku L0 nie istnieje.
    expect(zDrzewa.filter((a) => a.klasa === 'etykieta' && (a.ownerRef ?? '').endsWith('#name-row-0')).length).toBeGreaterThan(0);
  });
});

describe('S9-4 — rysunek jest bierny (nic poza uchwytami nie łapie kliku)', () => {
  it('0 węzłów rysunku łapiących zdarzenia wskaźnika', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onElementClick={() => {}} />,
    );
    expect(pointerBlockersInDom(svgOf(container) as unknown as HitDomNode)).toEqual([]);
  });

  // R8 (karta SLD-SKALA-I-NAWIGACJA): dawne dwa piętra (obszary pod obrysami) zastąpił jeden
  // węzeł na obiekt; pierwszeństwo obrysu przed rozszerzeniem sąsiada rozstrzyga
  // `rozstrzygnijTrafienieWezla` w punkcie kursora. Intencja testu bez zmian: rozszerzenie
  // nie kradnie kliku obiektowi, nad którego tuszem stoi kursor.
  it('rozszerzenie nie kradnie kliku obrysowi sąsiada: funkcja czysta na obszarach sceny', () => {
    const obszary = oczekiwaneObszary(0.3);
    let sprawdzone = 0;
    for (const wezel of obszary) {
      if (wezel.obrys.ksztalt !== 'prostokat' || wezel.obszar.ksztalt !== 'prostokat') continue;
      if (wezel.obszar.width === wezel.obrys.width && wezel.obszar.height === wezel.obrys.height) continue;
      // Punkt w ROZSZERZENIU węzła (poza jego obrysem), ale na obrysie INNEGO obiektu — cel to
      // obiekt z obrysem.
      const sasiad = obszary.find((a) => a !== wezel && a.obrys.ksztalt === 'prostokat' && (() => {
        const o = a.obrys as { x: number; y: number; width: number; height: number };
        const cx = o.x + o.width / 2;
        const cy = o.y + o.height / 2;
        const s2 = wezel.obszar as { x: number; y: number; width: number; height: number };
        const w2 = wezel.obrys as { x: number; y: number; width: number; height: number };
        const wObszarze = cx >= s2.x && cx <= s2.x + s2.width && cy >= s2.y && cy <= s2.y + s2.height;
        const wObrysie = cx >= w2.x && cx <= w2.x + w2.width && cy >= w2.y && cy <= w2.y + w2.height;
        return wObszarze && !wObrysie;
      })());
      if (!sasiad || sasiad.obrys.ksztalt !== 'prostokat') continue;
      const p = { x: sasiad.obrys.x + sasiad.obrys.width / 2, y: sasiad.obrys.y + sasiad.obrys.height / 2 };
      const wybor = pickCanvasHitArea(obszary, p.x, p.y)!;
      expect(rozstrzygnijTrafienieWezla(obszary, wezel.testId, p), `${wezel.testId} → ${sasiad.testId}`).toBe(wybor.testId);
      expect(wybor.testId).not.toBe(wezel.testId);
      sprawdzone += 1;
    }
    expect(sprawdzone, 'scena niesie nałożenia rozszerzeń na obrysy sąsiadów').toBeGreaterThan(0);
    // Bez punktu kursora (render bez układu) cel jest węzłem zdarzenia.
    expect(rozstrzygnijTrafienieWezla(obszary, obszary[0].testId, null)).toBe(obszary[0].testId);
  });

  it('klik natywny z geometrią ekranu: węzeł rozszerzenia oddaje cel obiektowi pod kursorem (iniekcja: bez rozstrzygania — chybienie)', async () => {
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onElementClick={onElementClick} />,
    );
    const svg = svgOf(container);
    // Przeglądarkowa geometria kanwy (jsdom nie ma układu): prostokąt kanwy = rozmiar widoku.
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, right: CANVAS_WIDTH, bottom: CANVAS_HEIGHT, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const scale = scaleOf(container);
    const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const obszary = hitAreasFromDom(svg as unknown as HitDomNode);
    let para: { wezel: CanvasHitArea; cel: CanvasHitArea; p: { x: number; y: number } } | null = null;
    for (const wezel of obszary) {
      if (wezel.obszar.ksztalt !== 'prostokat') continue;
      const o = wezel.obszar;
      for (const cel of obszary) {
        if (cel === wezel || cel.obrys.ksztalt !== 'prostokat') continue;
        const p = { x: cel.obrys.x + cel.obrys.width / 2, y: cel.obrys.y + cel.obrys.height / 2 };
        if (p.x < o.x || p.x > o.x + o.width || p.y < o.y || p.y > o.y + o.height) continue;
        if (pickCanvasHitArea(obszary, p.x, p.y)?.testId !== cel.testId) continue;
        para = { wezel, cel, p };
        break;
      }
      if (para) break;
    }
    expect(para, 'kadr niesie rozszerzenie nad obrysem sąsiada').not.toBeNull();
    const { wezel, cel, p } = para!;
    const clientX = (p.x + FRAME_MARGIN - vx) * scale;
    const clientY = (p.y + FRAME_MARGIN - vy) * scale;
    const user = userEvent.setup();
    await user.pointer({ keys: '[MouseLeft]', target: hitNode(container, wezel.testId)!, coords: { clientX, clientY } });
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick.mock.calls[0][0]).toBe(cel.testId);
  });

  it('REGRESJA WSTRZYKNIĘTA: zdjęcie bierności z warstwy rysunku MUSI dać blokery', () => {
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onElementClick={() => {}} />,
    );
    const rysunek = container.querySelector('[data-testid="sld-v3-rysunek"]')!;
    expect(rysunek.getAttribute('pointer-events')).toBe('none');
    rysunek.removeAttribute('pointer-events');
    expect(pointerBlockersInDom(svgOf(container) as unknown as HitDomNode).length).toBeGreaterThan(0);
  });
});

describe('S9-4 — tożsamość zaznaczenia niesiona klikiem NATYWNYM', () => {
  it('klik w APARAT POLA zaznacza TEN aparat (ownerRef aparatu, elementKind=apparatus)', async () => {
    const user = userEvent.setup();
    const onElementClick = vi.fn();
    const scene = buildSceneV3(enm);
    const aparat = scene.symbols.find(
      (s) => s.meta?.elementKind === 'apparatus' && s.meta?.ownerRef && s.meta?.testId,
    )!;
    expect(aparat, 'scena zawiera aparat pola z realnym refem').toBeTruthy();
    // R6 (karta SLD-SKALA-I-NAWIGACJA): aparat jest własnym celem kliku na kadrze roboczym.
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onElementClick={onElementClick}
        cameraOverride={kameraNadSymbolem(scene, aparat.meta!.testId!, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT })}
      />,
    );
    const wezel = hitNode(container, aparat.meta!.testId!);
    expect(wezel, 'aparat ma uchwyt obrysu').toBeTruthy();
    await user.click(wezel!);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick).toHaveBeenCalledWith(aparat.meta!.testId, {
      ownerRef: aparat.meta!.ownerRef,
      elementKind: 'apparatus',
      derKind: undefined,
      // S9-10: lewy klik niesie teraz też KLASĘ trafienia (to samo
      // wzbogacenie co prawy klik od S9-5) — wołający rozwiązuje po niej
      // kompozytowe refy etykiet tym samym tematem co menu.
      klasa: 'aparat',
      // GEOMETRIA-STACJI (§0 pkt 4): fikstura niesie rekordy aparatów pól, więc aparat
      // stosu ma ref rekordu (`deviceRef`); symbol bez refu aparatu to wyłącznie sylwetka
      // braku danych wyposażenia — bez stanu.
      deviceRef: aparat.meta!.deviceRef,
      lvPortalStationRef: undefined,
      // Rodzaj aparatu = `SymbolId` trafionego symbolu (jedna tożsamość aparatu pola
      // `${bayRef}#${SymbolId}`, `shared/identyfikatorAparatu.ts`).
      symbolId: aparat.symbolId,
    });
    expect(aparat.meta!.deviceRef, 'aparat z rekordu modelu niesie ref rekordu').toBeTruthy();
  });

  it('klik w TOR zaznacza TEN odcinek (ownerRef odcinka, elementKind=segment)', async () => {
    const user = userEvent.setup();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onElementClick={onElementClick} />,
    );
    const scene = buildSceneV3(enm);
    // R6: odcinek będący na tym kadrze własnym celem kliku (krótszy niż próg należy do pola).
    const index = scene.segments.findIndex(
      (s, i) => s.meta?.elementKind === 'segment' && s.meta?.ownerRef && hitNode(container, s.meta?.testId ?? `sld-v3-segment-${i}`) !== null,
    );
    expect(index, 'kadr niesie odcinek z własnym uchwytem').toBeGreaterThanOrEqual(0);
    const odcinek = scene.segments[index];
    const testId = odcinek.meta?.testId ?? `sld-v3-segment-${index}`;
    const wezel = hitNode(container, testId);
    expect(wezel, 'odcinek ma uchwyt obrysu').toBeTruthy();
    await user.click(wezel!);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick.mock.calls[0][0]).toBe(testId);
    expect(onElementClick.mock.calls[0][1].ownerRef).toBe(odcinek.meta!.ownerRef);
    expect(onElementClick.mock.calls[0][1].elementKind).toBe('segment');
  });

  it('klik w SZYNĘ niesie kanoniczny ref szyny (busRef) obok refu sceny', async () => {
    const user = userEvent.setup();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onElementClick={onElementClick} />,
    );
    const scene = buildSceneV3(enm);
    const index = scene.segments.findIndex((s) => s.meta?.elementKind === 'bus');
    const szyna = scene.segments[index];
    const testId = szyna.meta?.testId ?? `sld-v3-segment-${index}`;
    await user.click(hitNode(container, testId)!);
    expect(onElementClick.mock.calls[0][1]).toEqual({
      ownerRef: szyna.meta!.ownerRef,
      elementKind: 'bus',
      busRef: szyna.meta!.busResultRef,
      // S9-10: klasa trafienia w lewym kliku — patrz test aparatu wyżej.
      klasa: 'szyna',
    });
  });

  it('klik w ETYKIETĘ zaznacza JEJ WŁAŚCICIELA (napis jest uchwytem elementu, nie tłem)', async () => {
    const user = userEvent.setup();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_FHD_WIDTH} height={CANVAS_FHD_HEIGHT} onElementClick={onElementClick} />,
    );
    const scene = buildSceneV3(enm);
    const scale = scaleOf(container, CANVAS_FHD_WIDTH);
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), scale, sheetSizeFor(scene));
    const etykieta = plan.drawn.find((p) => p.label.ownerKind === 'apparatus')
      ?? plan.drawn.find((p) => p.label.ownerKind === 'station-name')!;
    await user.click(hitNode(container, `sld-v3-label-${etykieta.index}`)!);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onElementClick.mock.calls[0][1].ownerRef).toBe(etykieta.label.ownerRef);
    expect(onElementClick.mock.calls[0][1].elementKind).toBeTruthy();
  });

  it('dwa aparaty tego samego rodzaju w JEDNYM polu mają RÓŻNE tożsamości (odłącznik szynowy vs liniowy)', () => {
    const scene = buildSceneV3(enm);
    const wgTestId = new Map<string, number>();
    for (const [i, s] of scene.symbols.entries()) {
      const t = s.meta?.testId ?? `sld-v3-symbol-${i}`;
      wgTestId.set(t, (wgTestId.get(t) ?? 0) + 1);
    }
    const powtorzone = [...wgTestId.entries()].filter(([, n]) => n > 1);
    expect(powtorzone, 'żaden testId nie powtarza się na scenie').toEqual([]);
    // Dowód pozytywny: pole z DWOMA odłącznikami faktycznie istnieje na tej
    // sieci (inaczej asercja wyżej byłaby pusta).
    const wgPola = new Map<string, number>();
    for (const s of scene.symbols) {
      if (s.symbolId !== 'disconnector' || !s.meta?.ownerRef) continue;
      wgPola.set(s.meta.ownerRef, (wgPola.get(s.meta.ownerRef) ?? 0) + 1);
    }
    expect([...wgPola.values()].some((n) => n > 1)).toBe(true);
  });
});

describe('S9-4 — klik w tło (audyt P-6)', () => {
  it('klik NATYWNY poza uchwytami melduje TŁO, nie obiekt', async () => {
    const user = userEvent.setup();
    const onBackgroundClick = vi.fn();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onElementClick={onElementClick}
        onBackgroundClick={onBackgroundClick}
      />,
    );
    // Cel: sam korzeń `<svg>`. W przeglądarce jest nim każdy punkt, pod którym
    // nie ma uchwytu (rysunek jest bierny) — jsdom nie robi hit-testu, więc
    // klikamy DOKŁADNIE ten węzeł, który przeglądarka wskazałaby jako cel.
    await user.click(svgOf(container));
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);
    expect(onElementClick).not.toHaveBeenCalled();
  });

  it('klik w obiekt NIE jest klikiem w tło (zdarzenie zatrzymane na uchwycie)', async () => {
    const user = userEvent.setup();
    const onBackgroundClick = vi.fn();
    const onElementClick = vi.fn();
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onElementClick={onElementClick}
        onBackgroundClick={onBackgroundClick}
      />,
    );
    // Obiekt: pierwszy aparat sceny (dawniej zwinięty symbol stacji widoku L0 — jedna scena,
    // karta SLD-SKALA-I-NAWIGACJA R1).
    // R6: na kadrze całej sieci aparat należy do pola albo stacji — obiektem jest cel z uchwytem.
    const uchwyt = container.querySelector(`[${HIT_ATTR.for}][${HIT_ATTR.klasa}="stacja"]`)!;
    expect(uchwyt, 'kadr sieci niesie obszar stacji').toBeTruthy();
    await user.click(uchwyt);
    expect(onElementClick).toHaveBeenCalledTimes(1);
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });
});

describe('S9-4 — tryb motywu podany wprost (dowód dla harnessu zrzutowego)', () => {
  // V12K-332: jeden prop motywu renderu statycznego — kanonem `paletteMode`
  // (S9-7/8 i S9-4 naprawiły ten sam błąd SSR dwiema nazwami; intencja testu
  // bez zmian: prop wygrywa ze sklepem powłoki).
  it('prop `paletteMode` wygrywa ze sterownikiem powłoki — bez niego render poza przeglądarką zawsze dawał paletę dyspozytorską', () => {
    const { container: jasny } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        paletteMode="light_technical"
      />,
    );
    expect(svgOf(jasny).getAttribute('data-theme-mode')).toBe('light_technical');
    // Kolor faktycznie się zmienia (nie sam atrybut): tło kanwy jasnego motywu
    // jest białe, dyspozytorskiego — ciemne.
    expect(svgOf(jasny).getAttribute('style')).toContain('rgb(255, 255, 255)');

    const { container: bezPropa } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />,
    );
    expect(svgOf(bezPropa).getAttribute('data-theme-mode')).toBe('dark_scada');
  });
});
