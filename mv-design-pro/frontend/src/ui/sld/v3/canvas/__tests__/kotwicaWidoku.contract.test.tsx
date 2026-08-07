/**
 * B-2 — KONTRAKT KOTWICZENIA KAMERY NA ZMIANIE (audyt
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §4.3 wiersz B-2: „ogon przesuwa się o
 * pełną szerokość stacji, więc obraz skacze… kamera nie nadąża za miejscem
 * edycji").
 *
 * ---------------------------------------------------------------------------
 * CO ORZEKA (na REALNYCH parach migawek z żywego backendu, port 8037,
 * 2026-08-07 — nie na modelu wymyślonym w teście)
 * ---------------------------------------------------------------------------
 * Po operacji, która zmieniła model i WSKAZAŁA obiekt:
 *  · przybliżenie projektanta ZOSTAJE (skala niezmieniona, dopóki wskazany
 *    obiekt mieści się w kadrze),
 *  · poziom szczegółu ZOSTAJE (praca na L2 nie spada do L0),
 *  · wskazany obiekt jest CAŁY w kadrze i wyśrodkowany.
 * Stan sprzed karty (bezwarunkowy `'refit'`), zmierzony tym samym narzędziem:
 * oddalenie 9,01× i L2→L0 przy pracy na pełnym szczególe (sieć 50→51 stacji).
 *
 * ---------------------------------------------------------------------------
 * ILOCZYN CECH (reguła „KLASA, NIE INSTANCJA" pkt 2 — nie przykład z karty)
 * ---------------------------------------------------------------------------
 *  {droga operacji: 5 realnych operacji budowy}
 *    × {rozmiar sieci: mała 3→4 stacje (jeden wiersz arkusza)
 *                    · duża 14→15 stacji (5 wierszy, arkusz łamany)}
 *    × {poziom pracy: L0 przegląd · L1 operatorski · L2 aparatura}.
 * Do tego trzy stany brzegowe tej samej maszynerii: migawka o TYM SAMYM haszu
 * (odświeżenie bez zmiany modelu), wskazanie z `zoom_to: false` oraz brak
 * wskazania (fallback do refitu).
 *
 * ŚCIEŻKA REALNA: kamera jest stanem WEWNĘTRZNYM `SldCanvasV3`, więc kontrakt
 * mierzy `viewBox` ZAMONTOWANEGO komponentu po podmianie propu `snapshot` —
 * dokładnie tak, jak robi to aplikacja, gdy store dostaje odpowiedź operacji.
 * Żadnego wołania reducera „na skróty" (Zero-Debt pkt 5).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import type { EnergyNetworkModel, SelectionHint } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import { SldCanvasV3, sceneBoxToCameraWorld } from '../SldCanvasV3';
import { kotwicaWidoku, prostokatElementuWScenie } from '../viewAnchor';
import { wskazanieOperacji } from '../../../../topology/wskazanieOperacji';

afterEach(() => cleanup());

const here = dirname(fileURLToPath(import.meta.url));
const wczytajEnm = (nazwa: string): EnergyNetworkModel =>
  (JSON.parse(readFileSync(resolve(here, 'fixtures', nazwa), 'utf8')) as { enm: EnergyNetworkModel }).enm;
const wczytajJson = <T,>(nazwa: string): T =>
  JSON.parse(readFileSync(resolve(here, 'fixtures', nazwa), 'utf8')) as T;

interface OdpowiedzOperacji {
  readonly selection_hint: SelectionHint | null;
  readonly changes: { readonly created_element_ids: string[] } | null;
  readonly segment_srodkowy?: string;
}

const SIECI = [
  {
    nazwa: 'mała (3 → 4 stacje, jeden wiersz arkusza)',
    przed: wczytajEnm('b2MalaPrzed.enm.json'),
    po: wczytajEnm('b2MalaPo.enm.json'),
    operacja: wczytajJson<OdpowiedzOperacji>('b2MalaOperacja.json'),
  },
  {
    nazwa: 'duża (14 → 15 stacji, 5 wierszy arkusza)',
    przed: wczytajEnm('b2DuzaPrzed.enm.json'),
    po: wczytajEnm('b2DuzaPo.enm.json'),
    operacja: wczytajJson<OdpowiedzOperacji>('b2DuzaOperacja.json'),
  },
] as const;

const KANWA = { width: 1600, height: 1000 } as const;

/** Kadr kamery [świat] odczytany z `viewBox` ZAMONTOWANEJ kanwy. */
function kadrZDom(container: HTMLElement): { x: number; y: number; width: number; height: number } {
  const viewBox = container.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('viewBox')!;
  const [x, y, width, height] = viewBox.split(' ').map(Number);
  return { x, y, width, height };
}

/** Prostokąt wskazanego obiektu w świecie kamery, na poziomie `lod`. */
function prostokatWskazanego(enm: EnergyNetworkModel, ref: string, lod: SceneLod) {
  const box = prostokatElementuWScenie(buildSceneV3(enm, lod), ref);
  return box ? sceneBoxToCameraWorld(box) : null;
}

function refKotwicy(enm: EnergyNetworkModel, operacja: OdpowiedzOperacji): string {
  const wskazanie = wskazanieOperacji(operacja.selection_hint, operacja.changes);
  expect(wskazanie, 'operacja niesie wskazanie obiektu').not.toBeNull();
  const sceneByLod = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) } as const;
  const kotwica = kotwicaWidoku(sceneByLod, wskazanie!.kandydaci, sceneBoxToCameraWorld);
  expect(kotwica, 'wskazanie rozwiązywalne na rysunku').not.toBeNull();
  return kotwica!.ref;
}

function wskazanieDoPropu(operacja: OdpowiedzOperacji) {
  const wskazanie = wskazanieOperacji(operacja.selection_hint, operacja.changes)!;
  return { kandydaci: wskazanie.kandydaci, przenosKadr: wskazanie.przenosKadr };
}

describe('SldCanvasV3 — kotwiczenie kamery na zmianie (B-2)', () => {
  for (const siec of SIECI) {
    for (const lod of [0, 1, 2] as const) {
      it(`${siec.nazwa} · praca na L${lod}: przybliżenie i poziom szczegółu zostają, wskazany obiekt jest cały w kadrze`, () => {
        const anchor = wskazanieDoPropu(siec.operacja);
        // Praca projektanta odwzorowana `lodOverride` — kanwa fituje do świata
        // TEGO poziomu (k4.1), więc kadr przed operacją jest kadrem roboczym
        // danego poziomu szczegółu.
        const { container, rerender } = render(
          <SldCanvasV3
            snapshot={siec.przed}
            width={KANWA.width}
            height={KANWA.height}
            lodOverride={lod}
            viewAnchor={null}
          />,
        );
        const kadrPrzed = kadrZDom(container);
        const skalaPrzed = KANWA.width / kadrPrzed.width;

        // Zmiana migawki = odpowiedź operacji domenowej (store podaje migawkę
        // i wskazanie w jednym zapisie — tu w jednym renderze).
        rerender(
          <SldCanvasV3
            snapshot={siec.po}
            width={KANWA.width}
            height={KANWA.height}
            lodOverride={lod}
            viewAnchor={anchor}
          />,
        );
        const kadrPo = kadrZDom(container);
        const skalaPo = KANWA.width / kadrPo.width;

        // 1. Przybliżenie projektanta ZOSTAJE (wskazany obiekt mieści się w
        //    kadrze na każdym z tych poziomów, więc kamera nie ma powodu
        //    oddalać). Sprzed karty: skala spadała do skali fitu całej sieci.
        expect(skalaPo).toBeCloseTo(skalaPrzed, 6);

        // 2. Wskazany obiekt jest CAŁY w kadrze — i wyśrodkowany.
        const ref = refKotwicy(siec.po, siec.operacja);
        const box = prostokatWskazanego(siec.po, ref, lod)!;
        expect(box.minX).toBeGreaterThanOrEqual(kadrPo.x);
        expect(box.maxX).toBeLessThanOrEqual(kadrPo.x + kadrPo.width);
        expect(box.minY).toBeGreaterThanOrEqual(kadrPo.y);
        expect(box.maxY).toBeLessThanOrEqual(kadrPo.y + kadrPo.height);
        expect((box.minX + box.maxX) / 2).toBeCloseTo(kadrPo.x + kadrPo.width / 2, 3);
      });
    }
  }

  /**
   * ŚCIEŻKA PRODUKCYJNA (bez `lodOverride`): poziom szczegółu wybiera KAMERA
   * progami zoomu. Projektant przybliża się kółkiem — natywnym zdarzeniem, nie
   * podmianą stanu (Zero-Debt pkt 5: obejście realnej ścieżki zamaskowałoby
   * dokładnie ten defekt, który karta naprawia) — a potem zapisuje operację.
   * Sprzed karty: skala wracała do fitu całej sieci, a poziom spadał do L0
   * (pomiar: 9,01× oddalenia, L2 → L0).
   */
  for (const siec of SIECI) {
    it(`${siec.nazwa} · realna ścieżka (kółko myszy, poziom z kamery): zoom i poziom szczegółu przeżywają zapis operacji`, () => {
      const { container, rerender } = render(
        <SldCanvasV3 snapshot={siec.przed} width={KANWA.width} height={KANWA.height} viewAnchor={null} />,
      );
      const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
      const poziom = () => Number(svg.getAttribute('data-scene-lod'));
      const poziomStartowy = poziom();
      // Przybliżenie aż kamera podniesie poziom szczegółu.
      let obrot = 0;
      while (poziom() === poziomStartowy && obrot < 60) {
        fireEvent.wheel(svg, { clientX: KANWA.width / 2, clientY: KANWA.height / 2, deltaY: -140 });
        obrot += 1;
      }
      expect(poziom()).toBeGreaterThan(poziomStartowy);
      const poziomRoboczy = poziom();
      const kadrRoboczy = kadrZDom(container);
      const skalaRobocza = KANWA.width / kadrRoboczy.width;

      rerender(
        <SldCanvasV3
          snapshot={siec.po}
          width={KANWA.width}
          height={KANWA.height}
          viewAnchor={wskazanieDoPropu(siec.operacja)}
        />,
      );
      const kadrPo = kadrZDom(container);
      const skalaPo = KANWA.width / kadrPo.width;

      expect(poziom()).toBe(poziomRoboczy);
      expect(skalaPo).toBeCloseTo(skalaRobocza, 6);
      const box = prostokatWskazanego(siec.po, refKotwicy(siec.po, siec.operacja), poziomRoboczy as SceneLod)!;
      expect(box.minX).toBeGreaterThanOrEqual(kadrPo.x);
      expect(box.maxX).toBeLessThanOrEqual(kadrPo.x + kadrPo.width);
      expect(box.minY).toBeGreaterThanOrEqual(kadrPo.y);
      expect(box.maxY).toBeLessThanOrEqual(kadrPo.y + kadrPo.height);
    });
  }

  it('bez kotwicy kamera zachowuje się jak przed kartą — pełny refit do całej sieci', () => {
    const siec = SIECI[1];
    const { container, rerender } = render(
      <SldCanvasV3 snapshot={siec.przed} width={KANWA.width} height={KANWA.height} lodOverride={2} viewAnchor={null} />,
    );
    rerender(
      <SldCanvasV3 snapshot={siec.po} width={KANWA.width} height={KANWA.height} lodOverride={2} viewAnchor={null} />,
    );
    const kadrPo = kadrZDom(container);
    // Refit celuje w CAŁĄ treść: kadr musi obejmować skrajne punkty sceny.
    const scene = buildSceneV3(siec.po, 2);
    const bbox = sceneBoxToCameraWorld({
      minX: scene.bbox.x, minY: scene.bbox.y,
      maxX: scene.bbox.x + scene.bbox.width, maxY: scene.bbox.y + scene.bbox.height,
    });
    expect(kadrPo.width).toBeGreaterThan((bbox.maxX - bbox.minX) * 0.9);
  });

  it('wskazanie z `zoom_to: false` NIE rusza kamery (kontrakt SelectionHint)', () => {
    const siec = SIECI[1];
    const wskazanie = wskazanieOperacji(siec.operacja.selection_hint, siec.operacja.changes)!;
    const { container, rerender } = render(
      <SldCanvasV3 snapshot={siec.przed} width={KANWA.width} height={KANWA.height} lodOverride={2} viewAnchor={null} />,
    );
    const kadrPrzed = kadrZDom(container);
    rerender(
      <SldCanvasV3
        snapshot={siec.po}
        width={KANWA.width}
        height={KANWA.height}
        lodOverride={2}
        viewAnchor={{ kandydaci: wskazanie.kandydaci, przenosKadr: false }}
      />,
    );
    expect(kadrZDom(container)).toEqual(kadrPrzed);
  });

  it('migawka o TYM SAMYM haszu (odświeżenie bez zmiany modelu) nie rusza kamery', () => {
    const siec = SIECI[1];
    // Ta sama treść, INNA referencja obiektu — dokładnie to, co robi
    // `refresh_snapshot`: nowa odpowiedź, ten sam model.
    const odswiezona = JSON.parse(JSON.stringify(siec.przed)) as EnergyNetworkModel;
    const { container, rerender } = render(
      <SldCanvasV3 snapshot={siec.przed} width={KANWA.width} height={KANWA.height} lodOverride={2} viewAnchor={null} />,
    );
    const kadrPrzed = kadrZDom(container);
    rerender(
      <SldCanvasV3 snapshot={odswiezona} width={KANWA.width} height={KANWA.height} lodOverride={2} viewAnchor={null} />,
    );
    expect(kadrZDom(container)).toEqual(kadrPrzed);
  });

  it('kandydat nierozwiązywalny na rysunku jest pomijany na rzecz następnego (droga „przedłuż magistralę")', () => {
    // Pomiar 2026-08-07: `continue_trunk_segment_sn` wskazuje `bus/…/downstream`,
    // którego rysunek NIE nosi — kotwicą jest dopiero utworzony odcinek.
    const drogi = wczytajJson<Record<string, { wskazanie: string; utworzone: string[] }>>('b2DrogiOperacji.json');
    const droga = drogi.continue_trunk_segment_sn;
    const enm = wczytajEnm('b2Droga-continue_trunk_segment_sn.enm.json');
    const sceneByLod = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) } as const;
    expect(prostokatElementuWScenie(sceneByLod[2], droga.wskazanie)).toBeNull();
    const kotwica = kotwicaWidoku(
      sceneByLod,
      wskazanieOperacji({ element_id: droga.wskazanie, element_type: 'bus', zoom_to: true }, { created_element_ids: droga.utworzone })!.kandydaci,
      sceneBoxToCameraWorld,
    );
    expect(kotwica).not.toBeNull();
    expect(kotwica!.ref).not.toBe(droga.wskazanie);
    expect(droga.utworzone).toContain(kotwica!.ref);
  });
});

describe('B-2 — każda droga operacji budowy ma kotwicę na KAŻDYM poziomie szczegółu', () => {
  const drogi = wczytajJson<Record<string, {
    wskazanie: string | null; typ: string | null; zoom_to: boolean | null; utworzone: string[];
  }>>('b2DrogiOperacji.json');

  for (const [operacja, dane] of Object.entries(drogi)) {
    it(`${operacja}: wskazanie backendu prowadzi do obiektu narysowanego na L0/L1/L2`, () => {
      const enm = wczytajEnm(`b2Droga-${operacja}.enm.json`);
      const sceneByLod = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) } as const;
      const wskazanie = wskazanieOperacji(
        dane.wskazanie ? { element_id: dane.wskazanie, element_type: dane.typ ?? '', zoom_to: dane.zoom_to ?? true } : null,
        { created_element_ids: dane.utworzone },
      );
      expect(wskazanie, 'operacja niesie wskazanie').not.toBeNull();
      const kotwica = kotwicaWidoku(sceneByLod, wskazanie!.kandydaci, sceneBoxToCameraWorld);
      expect(kotwica, 'kotwica rozwiązywalna na wszystkich poziomach').not.toBeNull();
      for (const lod of [0, 1, 2] as const) {
        const box = kotwica!.boxByLod[lod];
        expect(box.maxX - box.minX).toBeGreaterThan(0);
        expect(box.maxY - box.minY).toBeGreaterThan(0);
      }
    });
  }
});
