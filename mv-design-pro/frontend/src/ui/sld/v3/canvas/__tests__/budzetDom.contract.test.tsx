/**
 * Karta SLD-SKALA-I-NAWIGACJA, R8 — BUDŻET WĘZŁÓW DOM kanwy (odcinanie renderu, `oknoRenderu.ts`).
 *
 * Scena jest jedna w każdej skali (R1), więc liczba węzłów DOM zależy wyłącznie od renderu: okno
 * kamery z zapasem, jeden węzeł trafienia na obiekt, symbol poniżej progu wnętrza (9 px mniejszego
 * boku, B-02 2026-11-13) jako obrys bez wnętrza, adnotacje zabezpieczeń pola bez węzła poniżej
 * skali wnętrza pól,
 * a w kadrze całej sieci stacja SN/nN, której żaden aparat nie jest rozpoznawalny, jako SYMBOL
 * STACJI (`glifZbiorczy.ts`: szyna i nogi toru, bez TR i aparatury; łącznik otwarty w nodze
 * zostaje węzłem, przewody toru spoza stacji i GPZ — węzłami pojedynczymi;
 * `glifZbiorczy.contract.test.tsx`). Iloczyn cech: {kadr: cała sieć, roboczy (skala czytania nad
 * środkiem sieci)} × {fikstura: sieć wzorcowa 52 stacji, GPZ dwusekcyjny z 40 stacjami} ×
 * {rozmiar kanwy: 1200×800, 1920×1080}.
 *
 * Pomiar 2026-11-12 (węzły DOM kanwy, przed symbolem stacji → z symbolem stacji):
 *
 *   | fikstura, kadr całej sieci | 1200×800      | 1920×1080      |
 *   |----------------------------|---------------|----------------|
 *   | sieć wzorcowa 52 stacji    | 5 922 → 1 287 | 11 367 → 1 424 |
 *   | GPZ dwusekcyjny 40 stacji  | 7 666 → 1 074 |  9 175 → 1 128 |
 *
 * Budżet architekta dla sieci wzorcowej 1200×800 — 3 000 węzłów (decyzja 2026-11-12); przypięte
 * progi to pomiar + ok. 10 % (zapadka: wzrost ponad próg jest regresją, spadek — obniżeniem progu).
 * Kadr roboczy bez zmian (symbolu stacji nie ma przy skali czytania): sieć wzorcowa 1 872 / 2 661,
 * GPZ2s40 2 164 / 4 075 węzłów; nie więcej niż drzewo sprzed karty + 20 % (9 955). Sieć wzorcowa
 * przed kartą — 1 867 i 8 296, po etapie 2 bez odcinania — 21 844 i 26 160.
 * Pomiar 2026-11-13 po progu wnętrza 9 px i widoku ogólnym (cała sieć 1200×800 / 1920×1080): sieć
 * wzorcowa 1 281 / 1 391, GPZ2s40 1 007 / 1 061 węzłów; kadr roboczy bez zmian. Progi obniżone
 * zapadką do pomiaru + ok. 10 %: 1 410 / 1 530 i 1 110 / 1 170.
 * Iniekcja (pomiar 2026-11-12): kanwa bez symbolu stacji (`stacjePrzegladu` puste) — sieć wzorcowa
 * 5 224 / 10 669, GPZ2s40 7 166 / 8 675 węzłów: każdy kadr całej sieci ponad próg.
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
import { bezWezlaPrzegladu, stacjePrzegladu } from '../hitAreas';
import { hierarchiaCelowTrafienia } from '../zakresKadru';
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
  { nazwa: 'sieć wzorcowa 52 stacji', enm, scene, calaSiec: { '1200x800': 1410, '1920x1080': 1530 } as Record<string, number> },
  { nazwa: 'GPZ dwusekcyjny z 40 stacjami', enm: enmGpz, scene: sceneGpz, calaSiec: { '1200x800': 1110, '1920x1080': 1170 } as Record<string, number> },
] as const;

/** Budżet kadru roboczego na 1200×800 (pomiar + ok. 10 %), skalowany polem kanwy; budżety kadru
 *  całej sieci — per fikstura (`FIKSTURY`; większa skala dopasowania: mniej symboli poniżej progu
 *  wnętrza, więcej węzłów). */
const BUDZET = { roboczy: 2400 } as const;
/** Budżet architekta kadru całej sieci (decyzja 2026-11-12) — żaden próg go nie przekracza. */
const BUDZET_ARCHITEKTA = 3000;
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
        expect(budzet).toBeLessThanOrEqual(BUDZET_ARCHITEKTA);
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

  // B-02 2026-11-13 (P0-03): próg wnętrza = próg pisma R3 (9 px) liczony z MNIEJSZEGO boku
  // gabarytu (dawniej 3 px z większego boku — aparat 16 × 30 j.św. miał „wnętrze” przy 1,4 px).
  it('obrys bez wnętrza wyłącznie poniżej 9 px mniejszego boku (nigdy przy 9 px i więcej)', () => {
    const g = { x: 0, y: 0, width: 16, height: 30 };
    expect(PROG_WNETRZA_SYMBOLU_PX).toBe(9);
    expect(symbolBezWnetrza(g, (PROG_WNETRZA_SYMBOLU_PX - 1e-6) / 16)).toBe(true);
    expect(symbolBezWnetrza(g, PROG_WNETRZA_SYMBOLU_PX / 16)).toBe(false);
    expect(symbolBezWnetrza(g, PROG_WNETRZA_SYMBOLU_PX / 30), 'większy bok nie rozstrzyga').toBe(true);
    expect(symbolBezWnetrza(g, 1)).toBe(false);
  });

  it('kadr roboczy: symbol bez wnętrza nie występuje, a obiekty poza oknem nie mają węzła; z całej sieci każdy symbol ma węzeł z refem albo jest w symbolu swojej stacji', () => {
    const roboczy = render(
      <SldCanvasV3 snapshot={enm} width={1200} height={800} cameraOverride={kameraNadSrodkiemSceny(scene, 1, { width: 1200, height: 800 })} />,
    ).container;
    expect(roboczy.querySelectorAll('[data-bez-wnetrza]').length).toBe(0);
    const narysowane = roboczy.querySelectorAll('[data-testid="sld-v3-symbols"] > [data-testid]').length;
    expect(narysowane).toBeGreaterThan(0);
    expect(narysowane).toBeLessThan(scene.symbols.length);
    const cala = render(<SldCanvasV3 snapshot={enm} width={1200} height={800} />).container;
    // Kadr całej sieci: okno obejmuje cały rysunek — KAŻDY symbol ma węzeł z refem albo należy do
    // stacji narysowanej symbolem stacji (symbol niesie ref stacji, `data-owner-ref`); nic nie znika
    // bez śladu (R8).
    const skala = Number(cala.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('data-skala-kamery'));
    const h = hierarchiaCelowTrafienia(enm, scene);
    const wSymbolu = bezWezlaPrzegladu(scene.symbols, scene.segments, h, stacjePrzegladu(scene.symbols, h, skala)).symbole;
    expect(wSymbolu.size).toBeGreaterThan(0);
    const pojedyncze = cala.querySelectorAll('[data-testid="sld-v3-symbols"] > [data-testid]').length;
    expect(pojedyncze + wSymbolu.size).toBe(scene.symbols.length);
    const symboleStacji = new Set([...cala.querySelectorAll('[data-symbol-stacji="true"]')].map((g) => g.getAttribute('data-owner-ref')));
    for (const stacja of new Set(wSymbolu.values())) expect(symboleStacji.has(stacja), stacja).toBe(true);
    expect(cala.querySelectorAll('[data-bez-wnetrza]').length).toBeGreaterThan(0);
  }, 120000);
});
