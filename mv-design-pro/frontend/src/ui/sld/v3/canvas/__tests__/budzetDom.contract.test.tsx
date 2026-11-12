/**
 * Karta SLD-SKALA-I-NAWIGACJA, R8 — BUDŻET WĘZŁÓW DOM kanwy (odcinanie renderu, `oknoRenderu.ts`).
 *
 * Scena jest jedna w każdej skali (R1), więc liczba węzłów DOM zależy wyłącznie od renderu: okno
 * kamery z zapasem, jeden węzeł trafienia na obiekt, symbol poniżej 3 px jako obrys bez wnętrza.
 * Iloczyn cech: {kadr: cała sieć, roboczy (skala czytania nad środkiem sieci)} × {fikstura: sieć
 * wzorcowa 52 stacji, GPZ dwusekcyjny z 40 stacjami} × {rozmiar kanwy: 1200×800, 1920×1080}.
 * Budżety z pomiaru 2026-11-12 z zapasem ok. 10 % (węzły, cała sieć 1200×800 / 1920×1080, roboczy
 * 1200×800 / 1920×1080): sieć wzorcowa 5 897 / 11 367, 1 806 / —; GPZ2s40 7 666 / 9 175,
 * 2 163 / 4 074. Sieć wzorcowa przed kartą — 1 867 i 8 296, po etapie 2 bez odcinania — 21 844
 * i 26 160; kadr roboczy nie więcej niż drzewo sprzed karty + 20 % (9 955).
 * Iniekcja: render bez okna (wszystkie obiekty z węzłem) przekracza budżet — test niżej.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3 } from '../SldCanvasV3';
import { oknoRenderuSceny, przecinaOkno, symbolBezWnetrza, PROG_WNETRZA_SYMBOLU_PX } from '../oknoRenderu';
import { kameraNadSrodkiemSceny } from './kameraTestowa';

const here = dirname(fileURLToPath(import.meta.url));
function wczytaj(sciezka: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, sciezka), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}
const enm = wczytaj('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
const scene = buildSceneV3(enm);
const enmGpz = wczytaj('../../../../../../public/test-fixtures/gpzDwusekcyjny40.enm.json');
const sceneGpz = buildSceneV3(enmGpz);
const FIKSTURY = [
  { nazwa: 'sieć wzorcowa 52 stacji', enm, scene, calaSiec: { '1200x800': 6500, '1920x1080': 12500 } as Record<string, number> },
  { nazwa: 'GPZ dwusekcyjny z 40 stacjami', enm: enmGpz, scene: sceneGpz, calaSiec: { '1200x800': 8400, '1920x1080': 10100 } as Record<string, number> },
] as const;

/** Budżet kadru roboczego na 1200×800 (pomiar + ok. 10 %), skalowany polem kanwy; budżety kadru
 *  całej sieci — per fikstura (`FIKSTURY`; większa skala dopasowania: mniej symboli poniżej progu
 *  wnętrza, więcej węzłów). */
const BUDZET = { roboczy: 2400 } as const;
/** Drzewo sprzed karty w kadrze roboczym (8 296 węzłów) + 20 % — górna granica architekta. */
const GRANICA_ROBOCZA_BAZY = 9955;

function wezly(container: HTMLElement): number {
  return container.querySelector('[data-testid="sld-canvas-v3"]')!.querySelectorAll('*').length;
}

describe('R8 — budżet węzłów DOM: ILOCZYN {kadr} × {fikstura} × {rozmiar kanwy}', () => {
  for (const f of FIKSTURY) {
    for (const [szer, wys] of [[1200, 800], [1920, 1080]] as const) {
      const budzet = f.calaSiec[`${szer}x${wys}`]!;
      it(`${f.nazwa}, cała sieć ${szer}×${wys}: ≤ ${budzet} węzłów`, () => {
        const { container } = render(<SldCanvasV3 snapshot={f.enm} width={szer} height={wys} onElementClick={() => {}} />);
        expect(wezly(container)).toBeLessThanOrEqual(budzet);
      }, 120000);
      it(`${f.nazwa}, kadr roboczy (skala 1) ${szer}×${wys}: ≤ ${BUDZET.roboczy} węzłów na 1200×800 i ≤ baza + 20 %`, () => {
        const { container } = render(
          <SldCanvasV3 snapshot={f.enm} width={szer} height={wys} onElementClick={() => {}} cameraOverride={kameraNadSrodkiemSceny(f.scene, 1, { width: szer, height: wys })} />,
        );
        const n = wezly(container);
        expect(n).toBeLessThanOrEqual(BUDZET.roboczy * (szer * wys) / (1200 * 800));
        expect(n).toBeLessThanOrEqual(GRANICA_ROBOCZA_BAZY);
      }, 120000);
    }
  }
});

describe('R8 — reguły renderu (funkcje czyste)', () => {
  it('okno renderu: widok kamery w układzie sceny z zapasem pół widoku z każdej strony', () => {
    const okno = oknoRenderuSceny({ scale: 2, translateX: -200, translateY: -100 }, { width: 800, height: 600 }, 10);
    // Widok: świat kamery x 100…500, y 50…350 → scena (−10) 90…490, 40…340; zapas 200 i 150.
    expect(okno).toEqual({ x: -110, y: -110, width: 800, height: 600 });
    expect(przecinaOkno({ x: 690, y: 0, width: 1, height: 1 }, okno)).toBe(true);
    expect(przecinaOkno({ x: 691, y: 0, width: 1, height: 1 }, okno)).toBe(false);
  });

  it('obrys bez wnętrza wyłącznie poniżej 3 px (nigdy przy 3 px i więcej)', () => {
    const g = { x: 0, y: 0, width: 16, height: 30 };
    expect(symbolBezWnetrza(g, (PROG_WNETRZA_SYMBOLU_PX - 1e-6) / 30)).toBe(true);
    expect(symbolBezWnetrza(g, PROG_WNETRZA_SYMBOLU_PX / 30)).toBe(false);
    expect(symbolBezWnetrza(g, 1)).toBe(false);
  });

  it('kadr roboczy: symbol bez wnętrza nie występuje, a obiekty poza oknem nie mają węzła; z całej sieci każdy symbol ma węzeł z refem', () => {
    const roboczy = render(
      <SldCanvasV3 snapshot={enm} width={1200} height={800} cameraOverride={kameraNadSrodkiemSceny(scene, 1, { width: 1200, height: 800 })} />,
    ).container;
    expect(roboczy.querySelectorAll('[data-bez-wnetrza]').length).toBe(0);
    const narysowane = roboczy.querySelectorAll('[data-testid="sld-v3-symbols"] > [data-testid]').length;
    expect(narysowane).toBeGreaterThan(0);
    expect(narysowane).toBeLessThan(scene.symbols.length);
    const cala = render(<SldCanvasV3 snapshot={enm} width={1200} height={800} />).container;
    // Kadr całej sieci: okno obejmuje cały rysunek — węzeł ma KAŻDY symbol (ref zostaje, R8).
    expect(cala.querySelectorAll('[data-testid="sld-v3-symbols"] > [data-testid]').length).toBe(scene.symbols.length);
    expect(cala.querySelectorAll('[data-bez-wnetrza]').length).toBeGreaterThan(0);
  }, 120000);
});
