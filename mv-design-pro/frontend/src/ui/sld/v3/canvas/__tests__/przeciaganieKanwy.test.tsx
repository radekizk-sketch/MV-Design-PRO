/**
 * Przeciąganie kanwy SLD v3 (pan/pinch na Pointer Events) — koniec gestu ma JEDNO źródło
 * (`zwolnijWskaznik` w `SldCanvasV3.tsx`).
 *
 * Defekt naprawiony u źródła (karta UX-04/POLE-LINIOWE-WZORZEC, pomiar e2e 2026-10-29,
 * dziennik akcji kamery): prawy klik wpisywał wskaźnik do mapy przeciągania, menu kontekstowe
 * otwierało się pod kursorem i przejmowało `pointerup`, więc każdy późniejszy ruch myszy nad
 * kanwą BEZ przycisku przesuwał widok (`pan`) aż do następnego kliku w kanwę. Dotąd pan
 * wskaźnikiem nie miał ŻADNEGO testu DOM (jsdom nie ma `PointerEvent` — `sldCanvasV3.test.tsx`
 * „Uwaga metodologiczna"); tu `PointerEvent` testowy dziedziczy po `MouseEvent`, więc
 * zdarzenia niosą `clientX/clientY/button/buttons/pointerId` i przechodzą realną ścieżką
 * React → uchwyty kanwy.
 *
 * Iloczyn cech: przycisk {lewy, środkowy, prawy} × koniec gestu {`up` na kanwie, `up` poza
 * kanwą (menu pod kursorem), brak `up`} × następny ruch BEZ przycisku ⇒ widok nieruchomy;
 * plus kontrola pozytywna, że naprawa nie zabiera gestów: przeciąganie lewym i środkowym
 * przesuwa widok, prawy nie zaczyna przeciągania, dotyk przesuwa, dwa dotyki zbliżają.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { SldCanvasV3 } from '../SldCanvasV3';

afterEach(() => cleanup());

class PointerEventTestowy extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

beforeAll(() => {
  if (typeof window.PointerEvent !== 'function') {
    Object.defineProperty(window, 'PointerEvent', { value: PointerEventTestowy, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'PointerEvent', { value: PointerEventTestowy, configurable: true, writable: true });
  }
});

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

function kanwa(): { readonly svg: SVGSVGElement; readonly widok: () => string } {
  const { container } = render(<SldCanvasV3 snapshot={enm} width={1200} height={800} />);
  const svg = container.querySelector<SVGSVGElement>('[data-testid="sld-canvas-v3"]')!;
  return { svg, widok: () => svg.getAttribute('viewBox')! };
}

const PRZYCISKI = [
  ['lewy', 0, 1],
  ['środkowy', 1, 4],
  ['prawy', 2, 2],
] as const;

const KONCE = ['up na kanwie', 'up poza kanwą (menu pod kursorem)', 'brak up'] as const;

describe('kanwa SLD v3 — koniec przeciągania (jedno źródło `zwolnijWskaznik`)', () => {
  it.each(PRZYCISKI.flatMap(([nazwa, button, buttons]) => KONCE.map((koniec) => [nazwa, button, buttons, koniec] as const)))(
    'przycisk %s (button %i, buttons %i) × %s → ruch bez przycisku nie przesuwa widoku',
    (_nazwa, button, buttons, koniec) => {
      const { svg, widok } = kanwa();
      const start = widok();
      fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'mouse', button, buttons, clientX: 300, clientY: 300 });
      fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'mouse', buttons, clientX: 360, clientY: 340 });
      const poGescie = widok();
      if (button === 2) {
        // Prawy przycisk otwiera menu kontekstowe, nie przeciąganie.
        expect(poGescie, 'prawy przycisk nie przesuwa widoku').toBe(start);
      } else {
        expect(poGescie, `${_nazwa}: przeciąganie przesuwa widok`).not.toBe(start);
      }
      if (koniec === 'up na kanwie') {
        fireEvent.pointerUp(svg, { pointerId: 1, pointerType: 'mouse', button, buttons: 0, clientX: 360, clientY: 340 });
      } else if (koniec === 'up poza kanwą (menu pod kursorem)') {
        const menu = document.createElement('div');
        document.body.appendChild(menu);
        fireEvent.pointerUp(menu, { pointerId: 1, pointerType: 'mouse', button, buttons: 0, clientX: 360, clientY: 340 });
        menu.remove();
      }
      // Ruch myszy bez wciśniętego przycisku — dwa kroki (drugi pilnuje, że stan nie wraca).
      fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'mouse', buttons: 0, clientX: 520, clientY: 480 });
      fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'mouse', buttons: 0, clientX: 700, clientY: 200 });
      expect(widok(), 'widok nieruchomy po końcu gestu').toBe(poGescie);
    },
  );

  it('po zgubionym `up` następne przeciąganie zaczyna od nowej kotwicy (bez skoku o drogę kursora)', () => {
    const { svg, widok } = kanwa();
    fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'mouse', buttons: 0, clientX: 800, clientY: 700 });
    const przed = widok();
    fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: 800, clientY: 700 });
    fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'mouse', buttons: 1, clientX: 810, clientY: 700 });
    const [x0] = przed.split(' ').map(Number);
    const [x1] = widok().split(' ').map(Number);
    const skala = 1200 / Number(przed.split(' ')[2]);
    // Przesunięcie widoku = 10 px ekranu, nie 510 px (droga od starej kotwicy).
    expect(Math.abs((x0 - x1) * skala)).toBeCloseTo(10, 6);
  });

  it('dotyk: przeciąganie jednym palcem przesuwa widok, a po `pointercancel` ruch nie przesuwa', () => {
    const { svg, widok } = kanwa();
    const start = widok();
    fireEvent.pointerDown(svg, { pointerId: 7, pointerType: 'touch', button: 0, buttons: 1, clientX: 400, clientY: 400 });
    fireEvent.pointerMove(svg, { pointerId: 7, pointerType: 'touch', buttons: 1, clientX: 450, clientY: 420 });
    const poGescie = widok();
    expect(poGescie).not.toBe(start);
    fireEvent.pointerCancel(document.body, { pointerId: 7, pointerType: 'touch', buttons: 0 });
    fireEvent.pointerMove(svg, { pointerId: 7, pointerType: 'touch', buttons: 1, clientX: 600, clientY: 600 });
    expect(widok()).toBe(poGescie);
  });

  it('dwa dotyki: rozsunięcie palców zbliża widok (pinch nietknięty naprawą)', () => {
    const { svg, widok } = kanwa();
    const szerokoscPrzed = Number(widok().split(' ')[2]);
    fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'touch', button: 0, buttons: 1, clientX: 500, clientY: 400 });
    fireEvent.pointerDown(svg, { pointerId: 2, pointerType: 'touch', button: 0, buttons: 1, clientX: 600, clientY: 400 });
    fireEvent.pointerMove(svg, { pointerId: 2, pointerType: 'touch', buttons: 1, clientX: 700, clientY: 400 });
    expect(Number(widok().split(' ')[2])).toBeLessThan(szerokoscPrzed);
  });
});
