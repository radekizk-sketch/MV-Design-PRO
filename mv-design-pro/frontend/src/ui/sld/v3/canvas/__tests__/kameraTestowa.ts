/**
 * Kamera testowa kanwy SLD v3 (karta SLD-SKALA-I-NAWIGACJA, R1/R3).
 *
 * Kanwa ma jedną scenę, a gęstość napisów zależy od rozmiaru ekranowego pisma
 * (`canvas/gestoscInformacji.ts`). Test, który sprawdza treść napisów (wartości
 * przepływu, opisy pól), potrzebuje więc kamery przy skali czytania nad
 * badanym miejscem — dawniej osiągał to wymuszonym poziomem szczegółu. Helper
 * buduje STAN POCZĄTKOWY kamery (`cameraOverride`, ten sam kontrakt, którego
 * używają zrzuty dokumentacji): wskazany punkt sceny pod środkiem kanwy przy
 * zadanej skali, świat kamery = cały rysunek (dolna granica skali bez zmian).
 */
import { fireEvent } from '@testing-library/react';
import type { SceneV3 } from '../../scene/buildScene';
import { boundingBoxOfRect, type BoundingBox, type CameraState } from '../camera';
import { WHEEL_ZOOM_SENSITIVITY, sceneBoxToCameraWorld } from '../SldCanvasV3';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { PISMO_WYNIKOW } from '../../core/text';
import { skalaPojawieniaSie } from '../gestoscInformacji';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { scenaSld } from '../../scene/scenaSld';
import { sheetSizeFor } from '../../sheet/outline';
import { planSceneLabels } from '../labelLegibility';
import { przeszkodyEtykietPrzySkali } from '../znacznikiStanu';
import { buildCanvasHitAreas } from '../hitAreas';
import { hierarchiaCelowTrafienia } from '../zakresKadru';
import { obwiedniaKsztaltu } from '../oknoRenderu';
import { przegladEtykietPrzySkali } from '../glifZbiorczy';

/** Skala, przy której liczbowe etykiety wyników (`PISMO_WYNIKOW`, 9 px) pojawiają się przy
 *  powiększaniu (`skalaPojawieniaSie`, R3) — 1,0: kadr, na którym projektant czyta wartości. */
export const SKALA_WYNIKOW = skalaPojawieniaSie(PISMO_WYNIKOW.fontSize);

interface Punkt {
  readonly x: number;
  readonly y: number;
}

/** Kamera ze wskazanym punktem SCENY pod środkiem kanwy przy skali `skala`. */
export function kameraNaPunkcieSceny(
  scene: SceneV3,
  punkt: Punkt,
  skala: number,
  viewportSize: { readonly width: number; readonly height: number },
): CameraState {
  const w = sceneBoxToCameraWorld({ minX: punkt.x, minY: punkt.y, maxX: punkt.x, maxY: punkt.y });
  return {
    transform: {
      scale: skala,
      translateX: viewportSize.width / 2 - w.minX * skala,
      translateY: viewportSize.height / 2 - w.minY * skala,
    },
    viewportSize,
    swiat: sceneBoxToCameraWorld(boundingBoxOfRect(scene.bbox)),
  };
}

/** Środek prostokąta sceny. */
export function srodekProstokata(box: BoundingBox): Punkt {
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

/** Kamera przy skali `skala` nad środkiem prostokąta rysunku sceny. */
export function kameraNadSrodkiemSceny(
  scene: SceneV3,
  skala: number,
  viewportSize: { readonly width: number; readonly height: number },
): CameraState {
  return kameraNaPunkcieSceny(scene, srodekProstokata(boundingBoxOfRect(scene.bbox)), skala, viewportSize);
}

/**
 * Powiększenie NATYWNYM kółkiem myszy (ścieżka użytkownika) aż skala kamery kanwy
 * (`data-skala-kamery`) osiągnie `skala`. Punkt kółka — środek kanwy albo, gdy podany, punkt
 * sceny `celSceny` (kursor nad obiektem; zoom kółka trzyma punkt pod kursorem w miejscu, więc
 * obiekt zostaje w oknie renderu — R8). Jedno zdarzenie kółka
 * niesie przesunięcie potrzebne do celu (tak jak szybki obrót kółka albo gładzik — ten sam
 * uchwyt `wheel` kanwy, ta sama czułość `WHEEL_ZOOM_SENSITIVITY`), z zapasem 1 %; każdy
 * pośredni krok przerysowuje całą scenę, a tylko skala końcowa jest przedmiotem testu. Zwraca
 * skalę osiągniętą; brak celu po 8 zdarzeniach (np. sufit skali) to błąd testu, nie cichy wynik.
 */
export function powiekszKolkiemDoSkali(container: HTMLElement, skala: number, celSceny?: Punkt): number {
  const svg = container.querySelector('[data-testid="sld-canvas-v3"]');
  if (!svg) throw new Error('brak kanwy sld-canvas-v3');
  const odczyt = (): number => Number(svg.getAttribute('data-skala-kamery'));
  const szer = Number(svg.getAttribute('width')) || 800;
  const wys = Number(svg.getAttribute('height')) || 600;
  for (let i = 0; i < 8 && odczyt() < skala; i += 1) {
    const deltaY = -Math.log((skala * 1.01) / odczyt()) / WHEEL_ZOOM_SENSITIVITY;
    const kursor = celSceny ? punktEkranowySceny(svg, celSceny) : { x: szer / 2, y: wys / 2 };
    fireEvent.wheel(svg, { clientX: kursor.x, clientY: kursor.y, deltaY });
  }
  if (odczyt() < skala) throw new Error(`kółko nie doprowadziło skali do ${skala} (jest ${odczyt()})`);
  return odczyt();
}

/**
 * Punkt EKRANU kanwy [px] dla punktu sceny — odczyt z `viewBox` kanwy (świat kamery
 * widoczny w kadrze) i jej rozmiaru. jsdom nie ma układu strony (`getBoundingClientRect` daje
 * zera), więc współrzędna lokalna kanwy jest jednocześnie `clientX`/`clientY` zdarzenia.
 */
function punktEkranowySceny(svg: Element, punkt: Punkt): Punkt {
  const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
  const szer = Number(svg.getAttribute('width'));
  const wys = Number(svg.getAttribute('height'));
  const w = sceneBoxToCameraWorld({ minX: punkt.x, minY: punkt.y, maxX: punkt.x, maxY: punkt.y });
  return { x: ((w.minX - vx) * szer) / vw, y: ((w.minY - vy) * wys) / vh };
}

/**
 * Środek obszaru trafienia obiektu `testId` w układzie SCENY przy skali `skala` — z tego
 * samego inwentarza, z którego kanwa buduje warstwę trafień (`buildCanvasHitAreas` na planie
 * etykiet tej skali, hierarchia celów R6). Karta SLD-SKALA-I-NAWIGACJA, R8: kanwa rysuje
 * uchwyty tylko w oknie renderu, więc test, który klika obiekt na kadrze roboczym, dojeżdża
 * do niego tak jak projektant — kółkiem z kursorem NAD obiektem
 * (`powiekszKolkiemDoSkali(container, skala, punktCeluTrafienia(…))`). Brak obszaru to błąd
 * testu (obiekt nie jest celem kliku przy tej skali), nie cichy wynik.
 */
export function punktCeluTrafienia(model: EnergyNetworkModel, testId: string, skala = 1): Punkt {
  const scene = scenaSld(model);
  const hierarchia = hierarchiaCelowTrafienia(model, scene);
  // Te same wejścia planu co kanwa: przeszkody i opisy stacji przeglądowych LOD0.
  const plan = planSceneLabels(scene.labels, przeszkodyEtykietPrzySkali(scene)(skala), skala, sheetSizeFor(scene), undefined, undefined, undefined, przegladEtykietPrzySkali(scene, hierarchia)(skala));
  const obszar = buildCanvasHitAreas({
    symbols: scene.symbols,
    segments: scene.segments,
    labels: plan.drawn,
    tozsamosciWPodpowiedzi: plan.tozsamosciWPodpowiedzi,
    resultMarkers: [],
    scale: skala,
    hierarchiaCelow: hierarchia,
  }).find((a) => a.testId === testId);
  if (!obszar) throw new Error(`obiekt ${testId} nie ma obszaru trafienia przy skali ${skala}`);
  const r = obwiedniaKsztaltu(obszar.obszar);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/**
 * Dojazd projektanta do obiektu `testId` na kadrze roboczym — dwa gesty natywne: kółko do skali
 * `skala` z kursorem nad obiektem (`powiekszKolkiemDoSkali`), potem przeciągnięcie rysunku lewym
 * przyciskiem tak, że obiekt staje pod środkiem kanwy. Dla testów, które klikają wiele obiektów
 * w różnych miejscach rysunku przy jednym montażu kanwy (R8: uchwyty tylko w oknie renderu).
 */
export function dojedzDoObiektu(container: HTMLElement, model: EnergyNetworkModel, testId: string, skala = 1): void {
  const svg = container.querySelector('[data-testid="sld-canvas-v3"]');
  if (!svg) throw new Error('brak kanwy sld-canvas-v3');
  const cel = punktCeluTrafienia(model, testId, skala);
  if (Number(svg.getAttribute('data-skala-kamery')) < skala) powiekszKolkiemDoSkali(container, skala, cel);
  const p = punktEkranowySceny(svg, cel);
  const srodek = { x: Number(svg.getAttribute('width')) / 2, y: Number(svg.getAttribute('height')) / 2 };
  przeciagnijLewym(svg, p, srodek);
}

/**
 * Przeciągnięcie lewym przyciskiem po kanwie (pointerdown → pointermove → pointerup).
 * jsdom nie ma klasy `PointerEvent`, więc `fireEvent.pointerDown` tworzy goły `Event` BEZ
 * `clientX`/`clientY` (przesunięcie widoku wychodzi NaN) — zdarzenia wskaźnika niesie
 * `MouseEvent` o typie `pointer*` (konwencja repo: `panelDolny`, `panelLayout`, `workspacePanels`).
 */
export function przeciagnijLewym(cel: Element, od: Punkt, doPunktu: Punkt, przyciskPuszczony = true): void {
  const zdarzenie = (typ: string, p: Punkt, buttons: number) =>
    fireEvent(cel, new MouseEvent(typ, { bubbles: true, cancelable: true, button: 0, buttons, clientX: p.x, clientY: p.y }));
  zdarzenie('pointerdown', od, 1);
  zdarzenie('pointermove', doPunktu, 1);
  if (przyciskPuszczony) zdarzenie('pointerup', doPunktu, 0);
}

/** `testId` symbolu sceny (meta albo zastępczy indeksowy — ta sama reguła co kanwa). */
export function testIdSymboluSceny(scene: SceneV3, index: number): string {
  return scene.symbols[index]?.meta?.testId ?? `sld-v3-symbol-${index}`;
}

/** `testId` z selektora uchwytu `[data-hit-for="…"]` (selektory budowane przez testy). */
export function testIdZSelektoraUchwytu(selektor: string): string | null {
  const m = /data-hit-for="([^"]+)"/.exec(selektor);
  return m ? m[1].replace(/\\(.)/g, '$1') : null;
}

/**
 * Kamera przy skali `skala` (domyślnie skala czytania 1) nad środkiem symbolu `testId` sceny.
 * Karta SLD-SKALA-I-NAWIGACJA, R6: aparat jest celem kliku dopiero wtedy, gdy jest na ekranie
 * rozpoznawalny — test klikający aparat stoi więc na kadrze roboczym, do którego projektant
 * dojeżdża w aplikacji (ten sam kontrakt `cameraOverride`, co zrzuty dokumentacji).
 */
export function kameraNadSymbolem(
  scene: SceneV3,
  testId: string,
  viewportSize: { readonly width: number; readonly height: number },
  skala = 1,
): CameraState {
  const indeks = scene.symbols.findIndex((s, i) => (s.meta?.testId ?? `sld-v3-symbol-${i}`) === testId);
  if (indeks < 0) throw new Error(`brak symbolu ${testId} w scenie`);
  const s = scene.symbols[indeks];
  const def = SYMBOL_DEFS[s.symbolId];
  return kameraNaPunkcieSceny(scene, { x: s.x + def.width / 2, y: s.y + def.height / 2 }, skala, viewportSize);
}
