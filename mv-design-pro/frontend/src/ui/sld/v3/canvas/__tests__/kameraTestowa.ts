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
import { sceneBoxToCameraWorld } from '../SldCanvasV3';

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
 * (`data-skala-kamery`) osiągnie `skala`. Punkt kółka — środek kanwy. Zwraca skalę
 * osiągniętą; brak postępu po 80 krokach to błąd testu, nie cichy wynik.
 */
export function powiekszKolkiemDoSkali(container: HTMLElement, skala: number): number {
  const svg = container.querySelector('[data-testid="sld-canvas-v3"]');
  if (!svg) throw new Error('brak kanwy sld-canvas-v3');
  const odczyt = (): number => Number(svg.getAttribute('data-skala-kamery'));
  const szer = Number(svg.getAttribute('width')) || 800;
  const wys = Number(svg.getAttribute('height')) || 600;
  for (let i = 0; i < 80 && odczyt() < skala; i += 1) {
    fireEvent.wheel(svg, { clientX: szer / 2, clientY: wys / 2, deltaY: -140 });
  }
  if (odczyt() < skala) throw new Error(`kółko nie doprowadziło skali do ${skala} (jest ${odczyt()})`);
  return odczyt();
}
