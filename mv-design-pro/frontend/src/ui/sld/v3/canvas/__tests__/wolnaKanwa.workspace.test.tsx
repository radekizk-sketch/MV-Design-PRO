/**
 * B-02 właściciela 2026-11-13 — WOLNA KANWA (P0-02, P1-03).
 *
 *  - P0-02: otwarty nawigator jest zasłoną stanową prawego-dolnego rogu (`toolbarLayout.ts`,
 *    `zaslonaNawigatora`): prostokąt bezpieczny traci jeden pas — dolny albo prawy, ten, który
 *    zabiera mniej pola. Iloczyn {kanwa szeroka, kanwa wysoka} × {projekcja niska, wysoka}.
 *  - P1-03: zmiana rozmiaru kanwy (otwarcie/zamknięcie inspektora zwęża/poszerza kanwę) odsłania
 *    ZAZNACZONY obiekt — nie zostaje poza kanwą ani pod zasłoną. Iloczyn {zwężenie, poszerzenie}
 *    × {obiekt przy prawej krawędzi kanwy}.
 *
 * Iniekcje (wynik w kontrakcie §3): `odslonRefy` bez zaznaczenia (sam portal nN) — czerwone;
 * `zaslonaNawigatora` zwraca zawsze pas dolny — czerwone.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSelectionStore } from '../../../../selection';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { buildSceneV3 } from '../../scene/buildScene';
import { sceneBoxToCameraWorld } from '../SldCanvasV3';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { SLD_CANVAS_DOCK_INSETS, TOOLBAR_EDGE_PX, zaslonaNawigatora } from '../toolbarLayout';
import { prostokatRefowWScenie } from '../viewAnchor';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8')) as {
    enm: EnergyNetworkModel;
  }
).enm;
const scena = buildSceneV3(enm);
const STACJA = scena.meta.mainTrunkStationIds[2]!;
const POLE = enm.bays.find((b) => b.substation_ref === STACJA && b.ref_id.includes('/sn_field/'))!;

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

describe('zasłona nawigatora: jeden pas, ten tańszy', () => {
  const przypadki = [
    { nazwa: 'kanwa szeroka, projekcja niska', kanwa: { width: 1176, height: 760 }, projekcja: { width: 260, height: 70 }, pas: 'dolny' },
    { nazwa: 'kanwa szeroka, projekcja wysoka', kanwa: { width: 1176, height: 760 }, projekcja: { width: 260, height: 180 }, pas: 'prawy' },
    { nazwa: 'kanwa wysoka, projekcja niska', kanwa: { width: 640, height: 1000 }, projekcja: { width: 260, height: 70 }, pas: 'dolny' },
    { nazwa: 'kanwa wąska i wysoka, projekcja wysoka', kanwa: { width: 640, height: 1000 }, projekcja: { width: 260, height: 180 }, pas: 'dolny' },
  ] as const;
  for (const p of przypadki) {
    it(`${p.nazwa}: pas ${p.pas}`, () => {
      const z = zaslonaNawigatora(p.kanwa, p.projekcja);
      const dolny = TOOLBAR_EDGE_PX + 28 + 4 + p.projekcja.height + 38;
      const prawy = TOOLBAR_EDGE_PX + p.projekcja.width + 18;
      if (p.pas === 'dolny') expect(z).toEqual({ right: SLD_CANVAS_DOCK_INSETS.right, bottom: dolny });
      else expect(z).toEqual({ right: prawy, bottom: SLD_CANVAS_DOCK_INSETS.bottom });
      // Wybrany pas zabiera nie więcej pola niż drugi.
      const wys = p.kanwa.height - SLD_CANVAS_DOCK_INSETS.top - SLD_CANVAS_DOCK_INSETS.bottom;
      const strataDolna = (dolny - SLD_CANVAS_DOCK_INSETS.bottom) * p.kanwa.width;
      const strataPrawa = prawy * wys;
      expect(p.pas === 'dolny' ? strataDolna <= strataPrawa : strataPrawa < strataDolna).toBe(true);
    });
  }
});

describe('zmiana rozmiaru kanwy odsłania zaznaczony obiekt', () => {
  it.each([
    ['zwężenie (otwarcie inspektora)', 1200, 760],
    ['poszerzenie (zamknięcie inspektora)', 760, 1200],
  ] as const)('%s: zaznaczone pole przy prawej krawędzi zostaje w kanwie', (_opis, przed, po) => {
    const { container, rerender } = render(<SldCanvasV3Workspace width={przed} height={700} />);
    act(() => useSelectionStore.getState().selectElement({ id: POLE.ref_id, type: 'BaySN', name: POLE.name }));
    act(() => useSelectionStore.getState().centerSldOnElement(POLE.ref_id));
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
    const box = sceneBoxToCameraWorld(prostokatRefowWScenie(scena, [POLE.ref_id])!);
    const ekran = (szer: number) => {
      const [vx, vy, vw, vh] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
      const s = szer / vw;
      return { lewa: (box.minX - vx) * s, prawa: (box.maxX - vx) * s, gora: (box.minY - vy) * (700 / vh), dol: (box.maxY - vy) * (700 / vh) };
    };
    // Pole przy prawej krawędzi kanwy: kadr przesunięty strzałką w lewo, aż pole stoi przy prawym brzegu.
    for (let i = 0; i < 12 && ekran(przed).prawa < przed - 140; i += 1) fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(ekran(przed).prawa, 'pole przy prawej krawędzi przed zmianą').toBeGreaterThan(przed - 160);
    expect(ekran(przed).prawa, 'pole w kanwie przed zmianą').toBeLessThanOrEqual(przed);
    rerender(<SldCanvasV3Workspace width={po} height={700} />);
    const e = ekran(po);
    expect(e.lewa, 'lewa krawędź pola w kanwie').toBeGreaterThanOrEqual(-0.5);
    expect(e.prawa, 'prawa krawędź pola w kanwie').toBeLessThanOrEqual(po + 0.5);
    expect(e.gora).toBeGreaterThanOrEqual(-0.5);
    expect(e.dol).toBeLessThanOrEqual(700.5);
    expect(useSelectionStore.getState().selectedElements.map((x) => x.id)).toEqual([POLE.ref_id]);
  });
});
