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
import { LABEL_TYPOGRAPHY } from '../../core/text';
import { skalaPojawieniaSie } from '../gestoscInformacji';

/** Skala, przy której liczbowe etykiety wyników (pismo t4) pojawiają się przy powiększaniu
 *  (`skalaPojawieniaSie`, R3) — kadr, na którym projektant czyta wartości. */
export const SKALA_WYNIKOW = skalaPojawieniaSie(LABEL_TYPOGRAPHY.t4.fontSize);

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
 * (`data-skala-kamery`) osiągnie `skala`. Punkt kółka — środek kanwy. Jedno zdarzenie kółka
 * niesie przesunięcie potrzebne do celu (tak jak szybki obrót kółka albo gładzik — ten sam
 * uchwyt `wheel` kanwy, ta sama czułość `WHEEL_ZOOM_SENSITIVITY`), z zapasem 1 %; każdy
 * pośredni krok przerysowuje całą scenę, a tylko skala końcowa jest przedmiotem testu. Zwraca
 * skalę osiągniętą; brak celu po 8 zdarzeniach (np. sufit skali) to błąd testu, nie cichy wynik.
 */
export function powiekszKolkiemDoSkali(container: HTMLElement, skala: number): number {
  const svg = container.querySelector('[data-testid="sld-canvas-v3"]');
  if (!svg) throw new Error('brak kanwy sld-canvas-v3');
  const odczyt = (): number => Number(svg.getAttribute('data-skala-kamery'));
  const szer = Number(svg.getAttribute('width')) || 800;
  const wys = Number(svg.getAttribute('height')) || 600;
  for (let i = 0; i < 8 && odczyt() < skala; i += 1) {
    const deltaY = -Math.log((skala * 1.01) / odczyt()) / WHEEL_ZOOM_SENSITIVITY;
    fireEvent.wheel(svg, { clientX: szer / 2, clientY: wys / 2, deltaY });
  }
  if (odczyt() < skala) throw new Error(`kółko nie doprowadziło skali do ${skala} (jest ${odczyt()})`);
  return odczyt();
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
