/**
 * B-02 właściciela 2026-11-13, P0-03 — WIDOK OGÓLNY (LOD0) jako rozszerzenie reguły R8 (obrys bez
 * wnętrza) o PRÓG CZYTELNOŚCI R3 (`oknoRenderu.ts`: `PROG_WNETRZA_SYMBOLU_PX` = 9 px, skala wnętrza
 * pól `SKALA_WNETRZA_POL` = 9 / 16 = 0,5625).
 *
 * Przypina: (1) wyprowadzenie progu z R3; (2) iloczyn {fikstura: sieć wzorcowa 52 stacji, GPZ
 * dwusekcyjny z 40 stacjami, GPZ 110 kV z blokami zabezpieczeń} × {skala: 0,3; tuż pod progiem; próg; 0,6; 1,0; 2,0} × {obiekt:
 * aparat pola GPZ, adnotacja zabezpieczeń (węzeł i uchwyt), oznaczenie aparatu, stacja SN/nN,
 * łącznik przerywający tor} — poniżej progu wnętrza pól nie są rysowane, od progu są; (3) jedna
 * scena: zbiór obiektów sceny i ich identyfikatory nie zależą od skali, a pod progiem każdy
 * symbol ma węzeł z refem albo należy do symbolu stacji; (4) P1-02: zmiana poziomu szczegółu
 * kółkiem zachowuje zaznaczenie i położenie zaznaczonej stacji na ekranie.
 *
 * Iniekcje: wynik każdej w tabeli §3 kontraktu `docs/sld/SLD_LOD_SPEC_OPERATOR_GRADE.md`
 * (próg wnętrza, adnotacje, oznaczenia aparatów, symbol stacji).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { MIN_READABLE_LABEL_SCREEN_PX } from '../../core/text';
import { buildSceneV3, type SceneV3 } from '../../scene/buildScene';
import { useSelectionStore } from '../../../../selection';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { SldCanvasV3, sceneBoxToCameraWorld, symbolTestId } from '../SldCanvasV3';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { rodzajeStacji } from '../hitAreas';
import { hierarchiaCelowTrafienia } from '../zakresKadru';
import {
  NAJMNIEJSZY_GABARYT_SYMBOLU,
  PROG_WNETRZA_SYMBOLU_PX,
  SKALA_WNETRZA_POL,
  wnetrzePolRysowane,
} from '../oknoRenderu';
import { przerwaToru } from '../torMocy';
import { kameraNaPunkcieSceny, powiekszKolkiemDoSkali } from './kameraTestowa';
import fxGpz110 from '../../../../../harness-fixtures/generated/geometria_stacji_gpz_110kv.json';

const here = dirname(fileURLToPath(import.meta.url));
function wczytaj(sciezka: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, sciezka), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}
const enm52 = wczytaj('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
const enmGpz = wczytaj('../../../../../../public/test-fixtures/gpzDwusekcyjny40.enm.json');
// GPZ 110 kV z blokami zabezpieczeń pól (sterowniki pól z funkcjami) — jedyna z trzech fikstur,
// która niesie adnotacje zabezpieczeń; bez niej cecha „adnotacja pola” iloczynu byłaby pusta
// (pomiar 2026-11-13: 0 adnotacji w obu fiksturach sieci).
const enmGpz110 = (fxGpz110 as unknown as { snapshot: EnergyNetworkModel }).snapshot;
const FIKSTURY = [
  { nazwa: 'sieć wzorcowa 52 stacji', enm: enm52, scene: buildSceneV3(enm52) },
  { nazwa: 'GPZ dwusekcyjny z 40 stacjami', enm: enmGpz, scene: buildSceneV3(enmGpz) },
  { nazwa: 'GPZ 110 kV z blokami zabezpieczeń', enm: enmGpz110, scene: buildSceneV3(enmGpz110) },
] as const;
const KANWA = { width: 1200, height: 800 } as const;
const SKALE = [0.3, SKALA_WNETRZA_POL - 1e-3, SKALA_WNETRZA_POL, 0.6, 1, 2] as const;

afterEach(() => cleanup());

/** Środek GPZ (prostokąt stacji z hierarchii celów) w układzie sceny. */
function srodekGpz(enm: EnergyNetworkModel, scene: SceneV3): { x: number; y: number } {
  const hierarchia = hierarchiaCelowTrafienia(enm, scene);
  const gpz = [...rodzajeStacji(scene.symbols, hierarchia)].find(([, rodzaj]) => rodzaj === 'gpz');
  if (!gpz) throw new Error('fikstura bez GPZ');
  const r = hierarchia.stacje.get(gpz[0])!;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function kanwa(container: HTMLElement): Element {
  return container.querySelector('[data-testid="sld-canvas-v3"]')!;
}

describe('LOD0 — próg czytelności wnętrza wyprowadzony z R3', () => {
  it('próg wnętrza = próg pisma R3 (9 px); skala wnętrza pól = 9 px / najmniejszy gabaryt biblioteki (16 j.św.)', () => {
    expect(PROG_WNETRZA_SYMBOLU_PX).toBe(MIN_READABLE_LABEL_SCREEN_PX);
    expect(NAJMNIEJSZY_GABARYT_SYMBOLU).toBe(16);
    expect(SKALA_WNETRZA_POL).toBeCloseTo(9 / 16, 12);
    expect(wnetrzePolRysowane(SKALA_WNETRZA_POL)).toBe(true);
    expect(wnetrzePolRysowane(SKALA_WNETRZA_POL - 1e-9)).toBe(false);
    // Skala niewiarygodna (przed pomiarem widoku) nie jest dowodem nieczytelności.
    for (const s of [0, -1, Number.NaN]) expect(wnetrzePolRysowane(s)).toBe(true);
  });
});

describe('LOD0 — ILOCZYN {fikstura} × {skala} × {obiekt wnętrza pola}', () => {
  for (const f of FIKSTURY) {
    const srodek = srodekGpz(f.enm, f.scene);
    const adnotacjeSceny = f.scene.symbols.filter((s) => s.meta?.elementKind === 'protectionAnnotation').length;
    const hierarchia = hierarchiaCelowTrafienia(f.enm, f.scene);
    const maStacje = [...rodzajeStacji(f.scene.symbols, hierarchia).values()].some((r) => r !== 'gpz');
    if (f.enm === enmGpz110) {
      it(`${f.nazwa}: warunek sensu — fikstura niesie adnotacje zabezpieczeń pól`, () => {
        expect(adnotacjeSceny).toBeGreaterThan(0);
      });
    }
    for (const skala of SKALE) {
      const lod0 = !wnetrzePolRysowane(skala);
      it(`${f.nazwa}, skala ${skala.toFixed(4)} (${lod0 ? 'wnętrza pól nierysowane' : 'wnętrza pól rysowane'}), kamera nad GPZ`, () => {
        const { container } = render(
          <SldCanvasV3 snapshot={f.enm} {...KANWA} onElementClick={() => {}} cameraOverride={kameraNaPunkcieSceny(f.scene, srodek, skala, KANWA)} />,
        );
        const svg = kanwa(container);
        const symbole = svg.querySelector('[data-testid="sld-v3-symbols"]')!;
        // Adnotacje zabezpieczeń pola (blok, ramka, linie): bez węzła i bez uchwytu pod progiem.
        const adnotacje = svg.querySelectorAll('[data-element-kind="protectionAnnotation"]').length;
        const uchwytyAdnotacji = svg.querySelectorAll('[data-hit-klasa="adnotacja"]').length;
        if (lod0) {
          expect(adnotacje, 'węzły adnotacji zabezpieczeń').toBe(0);
          expect(uchwytyAdnotacji, 'uchwyty adnotacji zabezpieczeń').toBe(0);
        } else if (adnotacjeSceny > 0 && skala >= 1) {
          expect(adnotacje + uchwytyAdnotacji, 'adnotacje wracają od progu').toBeGreaterThan(0);
        }
        // Aparaty pola: pod progiem każdy narysowany bez wnętrza (obrys albo □ przerwy toru).
        const aparaty = [...symbole.querySelectorAll('[data-element-kind="apparatus"]')];
        expect(aparaty.length, 'aparaty pól GPZ narysowane w kadrze').toBeGreaterThan(0);
        const bezWnetrza = aparaty.filter((a) => a.getAttribute('data-bez-wnetrza') === 'true').length;
        expect(bezWnetrza, `aparaty bez wnętrza (${aparaty.length} narysowanych)`).toBe(lod0 ? aparaty.length : 0);
        // Oznaczenia aparatów (Q1, Q0…): pod progiem w podpowiedzi, nie na rysunku.
        const oznaczenia = svg.querySelectorAll('[data-testid="sld-v3-labels"] [data-owner-kind="apparatus"]').length;
        if (lod0) expect(oznaczenia, 'oznaczenia aparatów na rysunku').toBe(0);
        else if (skala >= 1) expect(oznaczenia, 'oznaczenia aparatów wracają').toBeGreaterThan(0);
        // Stacje SN/nN: pod progiem symbolem stacji, od progu — pełnym rysunkiem.
        const symboleStacji = svg.querySelector('[data-testid="sld-v3-symbole-stacji"]')!.children.length;
        if (lod0 && maStacje) expect(symboleStacji, 'symbole stacji w oknie').toBeGreaterThan(0);
        else if (!lod0) expect(symboleStacji, 'symbole stacji').toBe(0);
      }, 120000);
    }
  }
});

describe('LOD0 — jedna scena, stan łącznika toru zostaje', () => {
  // Kadr całej sieci jest widokiem ogólnym w fiksturach SIECI; sam GPZ 110 kV mieści się na kanwie
  // w skali ≥ 0,5625 (LOD1), więc jego „cała sieć” nie jest przypadkiem tej cechy.
  for (const f of FIKSTURY.filter((x) => x.enm !== enmGpz110)) {
    it(`${f.nazwa}: pod progiem każdy symbol sceny ma węzeł z refem, jest w symbolu stacji, jest adnotacją ukrytą albo poza oknem; łącznik przerywający tor — znak □`, () => {
      const { container } = render(<SldCanvasV3 snapshot={f.enm} {...KANWA} onElementClick={() => {}} />);
      const svg = kanwa(container);
      expect(wnetrzePolRysowane(Number(svg.getAttribute('data-skala-kamery'))), 'kadr całej sieci jest widokiem ogólnym').toBe(false);
      const wezly = new Map<string, Element>();
      for (const el of svg.querySelectorAll('[data-testid="sld-v3-symbols"] [data-testid]')) wezly.set(el.getAttribute('data-testid')!, el);
      let przerwy = 0;
      f.scene.symbols.forEach((symbol, index) => {
        const wezel = wezly.get(symbolTestId(symbol, index));
        if (!wezel) return;
        if (przerwaToru(symbol)) {
          przerwy += 1;
          expect(wezel.getAttribute('data-przerwa-toru'), `${symbolTestId(symbol, index)} — □ przerwy toru`).toBe('true');
        }
        if (symbol.meta?.elementKind === 'apparatus') expect(wezel.getAttribute('data-bez-wnetrza')).toBe('true');
      });
      // Kadr całej sieci obejmuje cały rysunek: każdy łącznik przerywający tor sceny jest znakiem □
      // (sieć wzorcowa ma punkty N.O.; GPZ dwusekcyjny z 40 stacjami — żadnego).
      expect(przerwy, 'łączniki przerywające tor narysowane jako □').toBe(f.scene.symbols.filter(przerwaToru).length);
    }, 120000);
  }

  it('scena (obiekty i identyfikatory) nie zależy od skali — skala zmienia wyłącznie render', () => {
    const a = buildSceneV3(enm52);
    const b = buildSceneV3(enm52);
    expect(a.symbols.map((s, i) => symbolTestId(s, i))).toEqual(b.symbols.map((s, i) => symbolTestId(s, i)));
    expect(JSON.stringify(a.segments)).toBe(JSON.stringify(b.segments));
  });
});

describe('zmiana poziomu szczegółu zachowuje zaznaczenie i położenie zaznaczonej stacji', () => {
  afterEach(() => {
    act(() => useSelectionStore.getState().clearSelection());
  });

  it('LOD2 (1,0) → LOD0 (0,3) → LOD2 kółkiem nad stacją: zaznaczenie i ekranowy środek stacji bez zmian', () => {
    useSnapshotStore.getState().reset();
    useSelectionStore.getState().clearSelection();
    useSnapshotStore.setState({ snapshot: enm52 });
    const scene = buildSceneV3(enm52);
    const hierarchia = hierarchiaCelowTrafienia(enm52, scene);
    const stacja = [...rodzajeStacji(scene.symbols, hierarchia)].find(([, r]) => r === 'zwykla')![0];
    const r = hierarchia.stacje.get(stacja)!;
    const srodekStacji = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const { container } = render(<SldCanvasV3Workspace {...KANWA} />);
    act(() => useSelectionStore.getState().selectElement({ id: stacja, type: 'Station', name: stacja }));
    act(() => useSelectionStore.getState().centerSldOnElement(stacja));
    const svg = kanwa(container);
    const naEkranie = (): { x: number; y: number } => {
      const [vx, vy, vw, vh] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
      const w = sceneBoxToCameraWorld({ minX: srodekStacji.x, minY: srodekStacji.y, maxX: srodekStacji.x, maxY: srodekStacji.y });
      return { x: ((w.minX - vx) * KANWA.width) / vw, y: ((w.minY - vy) * KANWA.height) / vh };
    };
    const zaznaczone = (): string[] => useSelectionStore.getState().selectedElements.map((e) => e.id);
    expect(zaznaczone()).toEqual([stacja]);
    const p0 = naEkranie();
    // Oddalenie kółkiem z kursorem nad stacją do widoku ogólnego, potem powrót.
    const oddal = (cel: number): void => {
      for (let i = 0; i < 12 && Number(svg.getAttribute('data-skala-kamery')) > cel; i += 1) {
        const p = naEkranie();
        fireEvent.wheel(svg, { clientX: p.x, clientY: p.y, deltaY: 120 });
      }
    };
    oddal(0.3);
    expect(wnetrzePolRysowane(Number(svg.getAttribute('data-skala-kamery'))), 'osiągnięty widok ogólny').toBe(false);
    expect(zaznaczone(), 'zaznaczenie w LOD0').toEqual([stacja]);
    const p1 = naEkranie();
    expect(p1.x).toBeCloseTo(p0.x, 0);
    expect(p1.y).toBeCloseTo(p0.y, 0);
    powiekszKolkiemDoSkali(container, 1, srodekStacji);
    expect(zaznaczone(), 'zaznaczenie po powrocie').toEqual([stacja]);
    const p2 = naEkranie();
    expect(p2.x).toBeCloseTo(p0.x, 0);
    expect(p2.y).toBeCloseTo(p0.y, 0);
  }, 120000);
});
