/**
 * Karta SLD-SKALA-I-NAWIGACJA, R7 — nawigacja jawna, jedna kamera.
 *
 * ILOCZYN CECH:
 *  (a) reguła WSKAZANIA (`camera.ts`, `applyWskazanie`) — czysta funkcja:
 *      skala startowa {poniżej czytania, równa czytaniu, powyżej} × cel {mieści się w skali,
 *      nie mieści się} × położenie {w całości widoczny, poza widokiem};
 *  (b) wskazanie w zamontowanym warsztacie (realna ścieżka `centerSldOnElement` wszystkich
 *      wołających: wyniki zwarć, gotowość, drzewo, kreatory) — cel {pole, stacja} × tryb
 *      {„kadruj", „kotwicz"} × kadr startowy {cała sieć, przybliżony}: obie drogi dają TĘ SAMĄ
 *      kamerę, cel jest w kadrze;
 *  (c) klawisze kamery `+`/`−`/strzałki × historia w obie strony (`Alt+←`, `Alt+→`, nowe
 *      polecenie kasuje drogę naprzód) × `Esc` przy pustym i niepustym zaznaczeniu.
 *
 * Iniekcje (wykonane przy karcie, meldunek): reguła wskazania bez gałęzi „skala czytania"
 * (stary kadr celu, skala do `KADR_MAX_SCALE`) — czerwienią (a) i (b); `nastepnyWidok` bez
 * odłożenia drogi naprzód — czerwieni (c).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSelectionStore } from '../../../../selection';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { buildSceneV3 } from '../../scene/buildScene';
import { cameraReducer, SKALA_CZYTANIA, type CameraState } from '../camera';
import { KROK_SKALI_KLAWISZEM, sceneBoxToCameraWorld } from '../SldCanvasV3';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { prostokatRefowWScenie } from '../viewAnchor';

const WIDOK = { width: 1200, height: 800 } as const;
const SWIAT = { minX: 0, minY: 0, maxX: 40000, maxY: 20000 } as const;

function stan(scale: number, translateX = 0, translateY = 0): CameraState {
  return { transform: { scale, translateX, translateY }, viewportSize: WIDOK, swiat: SWIAT };
}

function wskaz(state: CameraState, anchor: { minX: number; minY: number; maxX: number; maxY: number }): CameraState {
  return cameraReducer(state, { type: 'kadruj', anchor, viewportSize: WIDOK, wskazanie: true });
}

/** Prostokąt świata w pikselach ekranu. */
function naEkranie(state: CameraState, box: { minX: number; minY: number; maxX: number; maxY: number }) {
  const { scale, translateX, translateY } = state.transform;
  return {
    minX: box.minX * scale + translateX,
    maxX: box.maxX * scale + translateX,
    minY: box.minY * scale + translateY,
    maxY: box.maxY * scale + translateY,
  };
}

function wWidoku(state: CameraState, box: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  const e = naEkranie(state, box);
  return e.minX >= -1e-6 && e.maxX <= WIDOK.width + 1e-6 && e.minY >= -1e-6 && e.maxY <= WIDOK.height + 1e-6;
}

describe('R7 (a): reguła wskazania — czysta funkcja kamery', () => {
  const maly = { minX: 20000, minY: 10000, maxX: 20200, maxY: 10300 };
  const duzy = { minX: 5000, minY: 5000, maxX: 9000, maxY: 9000 };

  it('skala poniżej czytania: kadr celu w skali czytania, cel w kadrze', () => {
    const po = wskaz(stan(0.05), maly);
    expect(po.transform.scale).toBeCloseTo(SKALA_CZYTANIA, 12);
    expect(wWidoku(po, maly)).toBe(true);
  });

  it('skala poniżej czytania, cel większy od okna przy 1,0: skala czytania, kadr od początku celu', () => {
    const po = wskaz(stan(0.05), duzy);
    expect(po.transform.scale).toBeCloseTo(SKALA_CZYTANIA, 12);
    const e = naEkranie(po, duzy);
    expect(e.minX).toBeGreaterThanOrEqual(0);
    expect(e.minX).toBeLessThan(WIDOK.width / 4);
    expect(e.minY).toBeGreaterThanOrEqual(0);
  });

  it.each([SKALA_CZYTANIA, 1.6])('skala %s, cel w całości widoczny: kamera stoi bit w bit', (s) => {
    // Cel na środku widoku przy skali s.
    const przed = stan(s, WIDOK.width / 2 - 20100 * s, WIDOK.height / 2 - 10150 * s);
    expect(wWidoku(przed, maly)).toBe(true);
    const po = wskaz(przed, maly);
    expect(po.transform).toEqual(przed.transform);
    expect(po.kadr).toBeUndefined();
  });

  it.each([SKALA_CZYTANIA, 1.6])('skala %s, cel poza widokiem i mieszczący się: skala zostaje, cel na środku', (s) => {
    const przed = stan(s);
    expect(wWidoku(przed, maly)).toBe(false);
    const po = wskaz(przed, maly);
    expect(po.transform.scale).toBe(s);
    expect(wWidoku(po, maly)).toBe(true);
    const e = naEkranie(po, maly);
    expect((e.minX + e.maxX) / 2).toBeCloseTo(WIDOK.width / 2, 6);
  });

  it('skala powyżej czytania, cel nie mieści się w tej skali: kadr w skali czytania', () => {
    const sredni = { minX: 20000, minY: 10000, maxX: 21000, maxY: 10600 };
    const po = wskaz(stan(1.6), sredni);
    expect(po.transform.scale).toBeCloseTo(SKALA_CZYTANIA, 12);
    expect(wWidoku(po, sredni)).toBe(true);
  });

  it('wskazanie celu nienarysowanego (`null`) nie rusza kamery', () => {
    const przed = stan(0.3, 11, 22);
    expect(cameraReducer(przed, { type: 'kadruj', anchor: null, viewportSize: WIDOK, wskazanie: true })).toBe(przed);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
  ) as { enm: EnergyNetworkModel }
).enm;
const scena = buildSceneV3(enm);
const STACJA = scena.meta.mainTrunkStationIds[2]!;
const POLE = enm.bays.find((b) => b.substation_ref === STACJA && b.ref_id.includes('/sn_field/'))!;

const kanwa = (c: HTMLElement) => c.querySelector('[data-testid="sld-canvas-v3"]')!;
const skala = (c: HTMLElement) => Number(kanwa(c).getAttribute('data-skala-kamery'));
function kadr(c: HTMLElement) {
  const [x, y, width, height] = (kanwa(c).getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  return { x: x!, y: y!, width: width!, height: height! };
}
const etykietySciezki = () =>
  within(screen.getByTestId('sld-v3-sciezka-kadru'))
    .getAllByTestId(/^sld-v3-sciezka-\d+$/)
    .map((el) => el.textContent);

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useSnapshotStore.setState({ snapshot: enm });
});
afterEach(() => {
  cleanup();
  useSelectionStore.getState().clearSelection();
});

describe('R7 (b): wskazanie z zewnątrz — jedna reguła dla obu trybów', () => {
  for (const [nazwaCelu, ref] of [
    ['pole', POLE.ref_id],
    ['stacja', STACJA],
  ] as const) {
    it(`${nazwaCelu}: z kadru całej sieci obie drogi dają skalę czytania i cel w kadrze`, () => {
      const kamery: { skala: number; kadr: ReturnType<typeof kadr> }[] = [];
      for (const tryb of ['kadruj', 'kotwicz'] as const) {
        const { container, unmount } = render(<SldCanvasV3Workspace width={1200} height={800} />);
        expect(skala(container)).toBeLessThan(SKALA_CZYTANIA);
        act(() => useSelectionStore.getState().centerSldOnElement(ref, tryb));
        expect(skala(container)).toBeCloseTo(SKALA_CZYTANIA, 3);
        kamery.push({ skala: skala(container), kadr: kadr(container) });
        unmount();
      }
      // Ta sama reguła: ta sama skala i ten sam środek w poziomie. Pion może różnić się o pas
      // mini-ścieżki kadru — tryb „kadruj" ją pokazuje (zasłona prostokąta bezpiecznego),
      // cichy „kotwicz" nie zmienia ścieżki.
      expect(kamery[1]!.skala).toBe(kamery[0]!.skala);
      expect(kamery[1]!.kadr.x).toBeCloseTo(kamery[0]!.kadr.x, 6);
      expect(Math.abs(kamery[1]!.kadr.y - kamery[0]!.kadr.y)).toBeLessThanOrEqual(40);
      const box = sceneBoxToCameraWorld(prostokatRefowWScenie(scena, [ref])!);
      const k = kamery[0]!.kadr;
      // Cel w kadrze (lewy górny róg zawsze; cały, gdy mieści się w oknie przy 1,0).
      expect(box.minX).toBeGreaterThanOrEqual(k.x - 1e-6);
      expect(box.minY).toBeGreaterThanOrEqual(k.y - 1e-6);
      if (box.maxX - box.minX <= k.width && box.maxY - box.minY <= k.height) {
        expect(box.maxX).toBeLessThanOrEqual(k.x + k.width + 1e-6);
        expect(box.maxY).toBeLessThanOrEqual(k.y + k.height + 1e-6);
      }
    });
  }

  it('pole już widoczne w skali czytania: ponowne wskazanie nie rusza kamery', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    act(() => useSelectionStore.getState().centerSldOnElement(POLE.ref_id));
    const przed = kadr(container);
    act(() => useSelectionStore.getState().centerSldOnElement(POLE.ref_id, 'kotwicz'));
    expect(kadr(container)).toEqual(przed);
  });
});

describe('R7 (c): klawisze kamery i historia w obie strony', () => {
  it('`+` i `−` zmieniają skalę o krok wokół środka kadru; strzałka przesuwa kadr', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    act(() => useSelectionStore.getState().centerSldOnElement(POLE.ref_id));
    const s0 = skala(container);
    const k0 = kadr(container);
    fireEvent.keyDown(window, { key: '+' });
    // `data-skala-kamery` niesie 4 miejsca po przecinku.
    expect(skala(container)).toBeCloseTo(s0 * KROK_SKALI_KLAWISZEM, 3);
    const k1 = kadr(container);
    // Środek kadru stoi (zoom wokół środka).
    expect(k1.x + k1.width / 2).toBeCloseTo(k0.x + k0.width / 2, 6);
    expect(k1.y + k1.height / 2).toBeCloseTo(k0.y + k0.height / 2, 6);
    fireEvent.keyDown(window, { key: '-' });
    expect(skala(container)).toBeCloseTo(s0, 3);
    const k2 = kadr(container);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const k3 = kadr(container);
    expect(k3.x).toBeGreaterThan(k2.x);
    expect(k3.y).toBeCloseTo(k2.y, 9);
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(kadr(container).y).toBeLessThan(k3.y);
  });

  it('`Alt+←` i `Alt+→` przechodzą historię w obie strony; nowe polecenie kasuje drogę naprzód', () => {
    const { container } = render(<SldCanvasV3Workspace width={1200} height={800} />);
    const siec = kadr(container);
    act(() => useSelectionStore.getState().centerSldOnElement(STACJA));
    const stacja = kadr(container);
    expect(stacja).not.toEqual(siec);
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    expect(kadr(container)).toEqual(siec);
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    expect(kadr(container)).toEqual(stacja);
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    expect(kadr(container)).toEqual(siec);
    // Nowe polecenie widoku (F — cała sieć bez zaznaczenia) kasuje drogę naprzód.
    fireEvent.keyDown(window, { key: 'F', shiftKey: true });
    const poPoleceniu = kadr(container);
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    expect(kadr(container)).toEqual(poPoleceniu);
  });

  it('`Esc` bez zaznaczenia przechodzi poziom wyżej w ścieżce kadru; z zaznaczeniem tylko je zdejmuje', () => {
    render(<SldCanvasV3Workspace width={1200} height={800} />);
    act(() => useSelectionStore.getState().centerSldOnElement(STACJA));
    const sciezkaStacji = etykietySciezki();
    expect(sciezkaStacji.length).toBeGreaterThanOrEqual(2);
    act(() => useSelectionStore.getState().selectElement({ id: POLE.ref_id, type: 'BaySN', name: POLE.name }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useSelectionStore.getState().selectedElements).toHaveLength(0);
    expect(etykietySciezki()).toEqual(sciezkaStacji);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('sld-v3-sciezka-kadru')?.textContent ?? '').not.toContain(sciezkaStacji[sciezkaStacji.length - 1]);
  });
});
