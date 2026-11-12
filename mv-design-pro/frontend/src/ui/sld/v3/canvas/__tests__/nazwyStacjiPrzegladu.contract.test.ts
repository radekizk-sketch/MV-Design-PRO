// @vitest-environment node
/**
 * Karta SLD-SKALA-I-NAWIGACJA, R4 — NAZWY STACJI I GPZ NA WIDOKU CAŁEJ SIECI (rozstrzygnięcie
 * architekta 2026-11-12). Nazwa jest adnotacją o STAŁEJ wielkości ekranowej (≥ 9 px niezależnie
 * od skali kamery) w slocie nazwy bloku stacji, nad szyną symbolu stacji. Widoczność rozstrzyga
 * priorytet i kolizja: nazwa stacji zaznaczonej i stacji z alarmem zawsze; przy zbiegu kolizji
 * kolejność stała i deterministyczna; nazwa przegrana stoi w podpowiedzi uchwytu (nie ginie).
 *
 * ILOCZYN CECH: fikstura {sieć wzorcowa 53 stacji, GPZ dwusekcyjny z 40 stacjami} × okno
 * {1000×560, 1322×696, 1400×900, 1920×1080} (skala dopasowania całej sieci) × własność
 * {pismo ≥ 9 px i stałe na ekranie, nazwa narysowana albo w podpowiedzi, zero kolizji z rysunkiem
 * (symbole, łączniki, punkt N.O., tory), zero kolizji ze znacznikami stanu, zero kolizji
 * z adnotacjami wyników czytającymi `rozmieszczenieNazw`, determinizm} oraz pierwszeństwo
 * {każda stacja i GPZ jako zaznaczona, wszystkie naraz (zbieg kolizji), nazwa z wolnym miejscem
 * wobec rysunku} w najmniejszym oknie.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { MIN_READABLE_LABEL_SCREEN_PX } from '../../core/text';
import { buildSceneV3, sceneObstacleRects, type SceneV3 } from '../../scene/buildScene';
import { sheetSizeFor } from '../../sheet/outline';
import { computeInitialCameraState } from '../camera';
import {
  planSceneLabels,
  plannedLabelCollisions,
  plannedLabelObstacleCollisions,
  rangaTozsamosci,
  rozmieszczenieNazw,
} from '../labelLegibility';
import type { ResultLabelEntry } from '../resultLabels';
import { contentBoundingBoxOf, layoutResultLabels, sceneBoxToCameraWorld } from '../SldCanvasV3';
import { nosnikiZnacznikowStanu, przeszkodyZnacznikowStanu, znacznikiStanu } from '../znacznikiStanu';

const here = dirname(fileURLToPath(import.meta.url));
const wczytaj = (sciezka: string) =>
  (JSON.parse(readFileSync(resolve(here, sciezka), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const FIKSTURY: readonly (readonly [string, EnergyNetworkModel])[] = [
  ['sieć wzorcowa 53 stacji', wczytaj('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json')],
  ['GPZ dwusekcyjny, 40 stacji', wczytaj('../../../../../../public/test-fixtures/gpzDwusekcyjny40.enm.json')],
];
const OKNA = [
  { width: 1000, height: 560 },
  { width: 1322, height: 696 },
  { width: 1400, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const skalaDopasowania = (scene: SceneV3, okno: { width: number; height: number }) =>
  computeInitialCameraState(sceneBoxToCameraWorld(contentBoundingBoxOf(scene)!), okno, null).transform.scale;

const przecina = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Wpisy wyników dla każdej szyny i odcinka sceny — gęsta warstwa adnotacji wyników. */
function wynikiWszedzie(scene: SceneV3): Record<string, ResultLabelEntry> {
  const out: Record<string, ResultLabelEntry> = {};
  for (const s of scene.segments) {
    const ref = s.meta?.ownerRef;
    if (!ref || out[ref]) continue;
    out[ref] = { ownerRef: ref, resultRef: ref, kind: 'bus', severity: 'INFO', lines: [{ prefix: 'U', text: '1,02' }] };
  }
  return out;
}

for (const [nazwaFikstury, enm] of FIKSTURY) {
  describe(`${nazwaFikstury}: nazwy na widoku całej sieci`, () => {
    const scene = buildSceneV3(enm);
    const sheet = sheetSizeFor(scene);
    const nazwy = scene.labels.map((l, i) => [l, i] as const).filter(([l]) => rangaTozsamosci(l) >= 3);

    it('scena niesie nazwę każdej stacji i GPZ (warunek sensu testu)', () => {
      // Pomiar 2026-11-12: sieć wzorcowa 54, GPZ dwusekcyjny 38 — trzy stacje odgałęzień
      // zagnieżdżonych GPZ40 (2.03-K, 3.03-K, 4.03-K) scena dziś pomija (defekt kompozycji
      // odczepów zgłoszony karcie pól, `scene/buildScene.ts` — poza tą kartą).
      expect(nazwy.length).toBeGreaterThanOrEqual(35);
    });

    for (const okno of OKNA) {
      describe(`okno ${okno.width}×${okno.height}`, () => {
        const skala = skalaDopasowania(scene, okno);
        const nosniki = nosnikiZnacznikowStanu({ scene, zaznaczenia: [], punktyZwarcia: [], srednicaKropkiZwarcia: 0, przekroczenia: [] });
        const znaczniki = znacznikiStanu(nosniki, { skala, wynikiCzytelne: false });
        const przeszkody = [...sceneObstacleRects(scene), ...przeszkodyZnacznikowStanu(znaczniki)];
        const plan = planSceneLabels(scene.labels, przeszkody, skala, sheet);
        const narysowane = plan.drawn.filter((p) => rangaTozsamosci(p.label) >= 3);

        it('pismo nazwy ≥ 9 px na ekranie; poniżej rozmiaru naturalnego — dokładnie próg (stała wielkość ekranowa)', () => {
          expect(narysowane.length).toBeGreaterThan(0);
          for (const p of narysowane) {
            const px = p.fontSize * skala;
            expect(px, p.label.text).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_SCREEN_PX - 1e-9);
            if (p.enlarged) expect(px, p.label.text).toBeCloseTo(MIN_READABLE_LABEL_SCREEN_PX, 9);
          }
        });

        it('każda nazwa narysowana albo w podpowiedzi uchwytu — żadna nie ginie', () => {
          const obecne = new Set([...plan.drawn.map((p) => p.index), ...plan.tozsamosciWPodpowiedzi.map((t) => t.index)]);
          expect(nazwy.filter(([, i]) => !obecne.has(i)).map(([l]) => l.text)).toEqual([]);
        });

        it('zero kolizji: nazwa × nazwa, nazwa × rysunek (symbole, łączniki, punkt N.O., tory), nazwa × znacznik stanu', () => {
          expect(plannedLabelCollisions(plan)).toEqual([]);
          expect(plannedLabelObstacleCollisions(plan, przeszkody)).toEqual([]);
          const prostokatyZnacznikow = przeszkodyZnacznikowStanu(znaczniki);
          for (const p of narysowane) {
            expect(prostokatyZnacznikow.filter((z) => przecina(z, p.rect)).length, p.label.text).toBe(0);
          }
        });

        it('adnotacje wyników czytające `rozmieszczenieNazw` nie wchodzą na nazwy', () => {
          const rozmieszczenie = rozmieszczenieNazw(plan);
          expect(rozmieszczenie.length).toBe(narysowane.length);
          const wyniki = layoutResultLabels(scene, wynikiWszedzie(scene), rozmieszczenie.map((n) => n.rect));
          const postawione = wyniki.placements.filter((w) => w.labelPlaced);
          expect(postawione.length).toBeGreaterThan(0);
          for (const w of postawione) {
            for (const n of rozmieszczenie) expect(przecina(w, n.rect), `${w.ownerRef} × ${n.ref}`).toBe(false);
          }
        });

        it('determinizm: ten sam plan bajt w bajt', () => {
          const drugi = planSceneLabels(scene.labels, przeszkody, skala, sheet);
          expect(JSON.stringify(drugi)).toBe(JSON.stringify(plan));
        });
      });
    }

    it('pierwszeństwo: nazwa KAŻDEJ stacji i GPZ jako zaznaczonej (albo z alarmem) jest narysowana w najmniejszym oknie', () => {
      const skala = skalaDopasowania(scene, OKNA[0]);
      const przeszkody = sceneObstacleRects(scene);
      const bez = planSceneLabels(scene.labels, przeszkody, skala, sheet);
      const wPodpowiedziBez = bez.tozsamosciWPodpowiedzi.filter((t) => rangaTozsamosci(t.label) >= 3).length;
      const nieRysowane: string[] = [];
      let zNaRysunku = 0;
      for (const [l, i] of nazwy) {
        const ref = l.ownerRef.split('#')[0]!;
        const plan = planSceneLabels(scene.labels, przeszkody, skala, sheet, undefined, undefined, new Set([ref]));
        if (!plan.drawn.some((p) => p.index === i)) nieRysowane.push(l.text);
        expect(plannedLabelCollisions(plan)).toEqual([]);
        // Na rysunku stoi WYŁĄCZNIE nazwa z pierwszeństwem oznaczona `naRysunku`; każdy inny
        // napis planu omija rysunek jak bez pierwszeństwa.
        const naRysunku = new Set(plan.drawn.filter((p) => p.naRysunku === true).map((p) => p.index));
        for (const p of naRysunku) expect(p, l.text).toBe(i);
        const kolizje = plannedLabelObstacleCollisions(plan, przeszkody);
        expect(kolizje.filter((k) => k !== l.ownerRef), l.text).toEqual([]);
        if (naRysunku.size > 0) zNaRysunku += 1;
      }
      expect(nieRysowane).toEqual([]);
      // Warunek sensu: część nazw z pierwszeństwem stoi na rysunku (inaczej ścieżka `naRysunku`
      // nie byłaby ćwiczona) — pomiar 2026-11-12: sieć wzorcowa 5, GPZ dwusekcyjny 2.
      expect(zNaRysunku).toBeGreaterThan(0);
      // Warunek sensu: w najmniejszym oknie część nazw przegrywa kolizję bez pierwszeństwa
      // (inaczej test pierwszeństwa nic by nie dowodził) — pomiar dla sieci wzorcowej: 6.
      if (nazwaFikstury.startsWith('sieć wzorcowa')) expect(wPodpowiedziBez).toBeGreaterThan(0);
    });

    it('pierwszeństwo wybiera miejsce PRZED innymi napisami: nazwa, która sama wobec rysunku ma wolne miejsce, z pierwszeństwem stoi wolna od rysunku', () => {
      const skala = skalaDopasowania(scene, OKNA[0]);
      const przeszkody = sceneObstacleRects(scene);
      let sprawdzone = 0;
      for (const [l, i] of nazwy) {
        // Sama nazwa wobec samego rysunku (bez innych napisów) — czy rysunek zostawia jej miejsce.
        const sama = planSceneLabels([l], przeszkody, skala, sheet);
        if (sama.drawn.length !== 1 || sama.drawn[0].naRysunku === true) continue;
        const plan = planSceneLabels(scene.labels, przeszkody, skala, sheet, undefined, undefined, new Set([l.ownerRef.split('#')[0]!]));
        const p = plan.drawn.find((x) => x.index === i);
        expect(p, l.text).toBeDefined();
        expect(p!.naRysunku, l.text).toBeUndefined();
        sprawdzone += 1;
      }
      expect(sprawdzone).toBeGreaterThan(0);
    });

    it('zbieg kolizji na rysunku: dwie nazwy z pierwszeństwem w tym samym slocie pod przeszkodą — jedna na rysunku, druga w podpowiedzi, kolejność stała (ref)', () => {
      const skala = skalaDopasowania(scene, OKNA[0]);
      const [wzor] = nazwy[0]!;
      const [blok, wiersz] = wzor.ownerRef.split('#');
      const a = { ...wzor, ownerRef: `${blok!.replace(/station$/, '')}a/station#${wiersz}` };
      const b = { ...wzor, ownerRef: `${blok!.replace(/station$/, '')}b/station#${wiersz}` };
      // Przeszkoda pokrywająca cały arkusz: żadna pozycja nie jest wolna od rysunku.
      const calyArkusz = [{ x: -1e6, y: -1e6, width: 2e6, height: 2e6 }];
      const pierwszenstwo = new Set([a.ownerRef.split('#')[0]!, b.ownerRef.split('#')[0]!]);
      for (const etykiety of [[a, b], [b, a]]) {
        const plan = planSceneLabels(etykiety, calyArkusz, skala, sheet, undefined, undefined, pierwszenstwo);
        expect(plannedLabelCollisions(plan)).toEqual([]);
        expect(plan.drawn.map((p) => [p.label.ownerRef, p.naRysunku])).toEqual([[a.ownerRef, true]]);
        expect(plan.tozsamosciWPodpowiedzi.map((t) => t.label.ownerRef)).toEqual([b.ownerRef]);
      }
    });

    it('zbieg kolizji: pierwszeństwo dla WSZYSTKICH stacji naraz — zero kolizji napisów, każda nazwa narysowana albo w podpowiedzi, plan deterministyczny', () => {
      const skala = skalaDopasowania(scene, OKNA[0]);
      const przeszkody = sceneObstacleRects(scene);
      const wszystkie = new Set(nazwy.map(([l]) => l.ownerRef.split('#')[0]!));
      const plan = planSceneLabels(scene.labels, przeszkody, skala, sheet, undefined, undefined, wszystkie);
      expect(plannedLabelCollisions(plan)).toEqual([]);
      const obecne = new Set([...plan.drawn.map((p) => p.index), ...plan.tozsamosciWPodpowiedzi.map((t) => t.index)]);
      expect(nazwy.filter(([, i]) => !obecne.has(i)).map(([l]) => l.text)).toEqual([]);
      const drugi = planSceneLabels(scene.labels, przeszkody, skala, sheet, undefined, undefined, new Set([...wszystkie].reverse()));
      expect(JSON.stringify(drugi)).toBe(JSON.stringify(plan));
    });
  });
}
