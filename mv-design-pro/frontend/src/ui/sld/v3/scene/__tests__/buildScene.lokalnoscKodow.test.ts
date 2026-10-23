/**
 * GPZ-H5-SLD etap 3 — LOKALNOŚĆ GEOMETRII przy znormalizowanej szerokości kodów stacji.
 *
 * Po scaleniu backendu H5 macierz lokalności (`buildScene.p1Recenzja.test.ts`) zmierzyła
 * na „+1 stacja na ogonie magistrali" 4 przesunięcia pionowe o 16 j.św. przy NIEZMIENIONYM
 * podziale wierszy arkusza. Przyczyna zmierzona: kody stacji („S97") nadawane w porządku
 * obchodu przenumerowują się po dopisaniu stacji; numer przekracza granicę cyfr (S99 →
 * S100: 25 → 33 j.św. szerokości napisu), footprint jednego lateralu rośnie o kwant siatki
 * (rekord packera: `footprintHeight` 368 → 384), a laterale pakowane po nim schodzą niżej.
 *
 * Ten plik przypina GEOMETRYCZNĄ połowę twierdzenia: przy szerokości każdego kodu
 * zastąpionej szerokością stałą (podmiana pomiaru tekstu tylko dla kodów `S\d+`) ta sama
 * edycja na tych samych trzech topologiach daje ZERO przesunięć pionowych. Gdyby Δy miało
 * inną przyczynę niż treść kodów, ten test byłby czerwony.
 */
import { describe, expect, it, vi } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../core/text', async (oryginal) => {
  const m = await oryginal<typeof import('../../core/text')>();
  const stalaSzerokoscKodu = (t: string): string => t.replace(/S\d{1,3}\b/g, 'S100');
  return {
    ...m,
    measureLabelWidth: (t: string, c: Parameters<typeof m.measureLabelWidth>[1]) => m.measureLabelWidth(stalaSzerokoscKodu(t), c),
    measureTextWidth: (t: string, f: number) => m.measureTextWidth(stalaSzerokoscKodu(t), f),
  };
});

import { anchorDisplacementMetrics, buildSceneV3, sheetRowStationIds } from '../buildScene';
import { appendUnitToTrunk, loadEnm, radialize, synthLargeTrunk } from './syntheticNetworks';

const here = dirname(fileURLToPath(import.meta.url));
const bigEnm = loadEnm(resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'));
const openTrunkChain = loadEnm(resolve(here, 'fixtures', 'openTrunkChain.enm.json'));

const TOPOLOGIE = [
  { nazwa: 'sieć promieniowa (0 pierścieni)', siec: synthLargeTrunk(radialize(bigEnm), 2) },
  { nazwa: 'sieć z pierścieniem (1 pierścień)', siec: appendUnitToTrunk(radialize(bigEnm), bigEnm, 'ring1cp') },
  { nazwa: 'sieć z dwoma pierścieniami', siec: synthLargeTrunk(bigEnm, 2) },
] as const;

describe('lokalność geometrii × szerokość kodów stałą × topologia (+1 stacja na ogonie magistrali)', () => {
  for (const { nazwa, siec } of TOPOLOGIE) {
    it(`${nazwa}: podział wierszy niezmieniony ⇒ 0 przesunięć pionowych`, () => {
      const przed = buildSceneV3(siec, 0);
      const po = buildSceneV3(appendUnitToTrunk(siec, openTrunkChain), 0);
      const wierszePrzed = sheetRowStationIds(przed).map((w) => w.length);
      const wierszePo = sheetRowStationIds(po).map((w) => w.length);
      // Kontrola wejścia: edycja jest lokalna (dopisanie do OSTATNIEGO wiersza), więc
      // wymóg zera nie jest pusty z definicji.
      expect(wierszePo.length).toBe(wierszePrzed.length);
      expect(wierszePo.slice(0, -1)).toEqual(wierszePrzed.slice(0, -1));
      expect(wierszePo[wierszePo.length - 1]).toBe(wierszePrzed[wierszePrzed.length - 1] + 1);
      const miara = anchorDisplacementMetrics(przed, po);
      expect(miara.unchangedSubtreeMovementCount).toBeGreaterThan(0);
      expect(miara.movedVerticalCount).toBe(0);
    });
  }
});
