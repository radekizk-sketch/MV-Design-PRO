/**
 * Karta SLD-SKALA-I-NAWIGACJA, R4 — PIERWSZEŃSTWO NAZW STACJI NA KANWIE (rozstrzygnięcie architekta
 * 2026-11-12): nazwa stacji zaznaczonej i stacji z alarmem jest zawsze narysowana; znaczniki stanu
 * o stałym rozmiarze ekranowym są przeszkodą nazw. Plan (`labelLegibility.ts`) pilnuje
 * `nazwyStacjiPrzegladu.contract.test.ts`; tu — WPIĘCIE w kanwę (zbiór pierwszeństwa z zaznaczenia
 * i alarmów, przeszkody ze znaczników), czyli to, co widzi projektant.
 *
 * ILOCZYN CECH: nazwa przegrywająca kolizję w kadrze całej sieci 1000×560 (pierwsza i ostatnia
 * w kolejności sceny) × źródło pierwszeństwa {zaznaczona stacja, zaznaczony obiekt stacji (odcinek z kotwicą wyniku),
 * alarm przekroczenia na obiekcie stacji, brak — kontrola} oraz znaczniki stanu {łącznik otwarty,
 * punkt N.O.} × nazwa na kanwie (położenie z planu z przeszkodami znaczników, rozłączność).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { wyrownanieEtykiety, zaczepTekstuEtykiety } from '../../layout/labels';
import { sceneObstacleRects } from '../../scene/buildScene';
import { sheetSizeFor } from '../../sheet/outline';
import { planSceneLabels, rangaTozsamosci, type PlannedLabel } from '../labelLegibility';
import { nosnikiZnacznikowStanu, przeszkodyEtykietPrzySkali, przeszkodyZnacznikowStanu, znacznikiStanu } from '../znacznikiStanu';
import type { ResultLabelEntry } from '../resultLabels';
import { hierarchiaCelowTrafienia } from '../zakresKadru';
import { poleIStacjaObiektu } from '../hitAreas';
import { kotwiceWynikow, SldCanvasV3 } from '../SldCanvasV3';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }
).enm;
const scene = buildSceneV3(enm);
const hierarchia = hierarchiaCelowTrafienia(enm, scene);
const OKNO = { width: 1000, height: 560 } as const;

type Nakladka = Parameters<typeof SldCanvasV3>[0]['overlay'];

function kanwa(zaznaczenieRefy?: readonly string[], overlay?: Nakladka) {
  const { container, unmount } = render(
    <SldCanvasV3 snapshot={enm} width={OKNO.width} height={OKNO.height} onElementClick={() => {}} zaznaczenieRefy={zaznaczenieRefy} overlay={overlay} />,
  );
  const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
  return { svg, unmount };
}

const nazwaNarysowana = (svg: Element, index: number) => svg.querySelector(`[data-testid="sld-v3-label-${index}"]`) !== null;

const nazwy = scene.labels.map((l, i) => [l, i] as const).filter(([l]) => rangaTozsamosci(l) >= 3);
const { svg: svgBez, unmount: odmontujBez } = kanwa();
const przegrane = nazwy.filter(([, i]) => !nazwaNarysowana(svgBez, i));
odmontujBez();

describe('R4 — pierwszeństwo nazw na kanwie: kadr całej sieci 1000×560', () => {
  it('warunek sensu: część nazw przegrywa kolizję bez pierwszeństwa w kadrze początkowym kanwy', () => {
    expect(nazwy.length).toBeGreaterThanOrEqual(50);
    expect(przegrane.length).toBeGreaterThan(0);
  });

  const probki = przegrane.length > 1 ? [przegrane[0], przegrane[przegrane.length - 1]] : przegrane;
  for (const [label, index] of probki) {
    const stacja = label.ownerRef.split('#')[0]!;
    // Obiekt stacji z kotwicą wyniku — ta sama hierarchia, którą kanwa rozstrzyga zaznaczenie
    // i alarm do stacji (`poleIStacjaObiektu`, `kotwiceWynikow`).
    const szyna = scene.segments
      .map((s) => s.meta?.ownerRef)
      .find((ref): ref is string => {
        if (!ref || poleIStacjaObiektu(hierarchia, ref).stacja !== stacja || ref === stacja) return false;
        const wpis = { [ref]: { ownerRef: ref, resultRef: ref, kind: 'bus', severity: 'CRITICAL', lines: [] } } as Record<string, ResultLabelEntry>;
        return kotwiceWynikow(scene, wpis).has(ref);
      });

    it(`„${label.text}”: zaznaczona stacja — nazwa narysowana`, () => {
      const { svg, unmount } = kanwa([stacja]);
      expect(nazwaNarysowana(svg, index)).toBe(true);
      unmount();
    });

    it(`„${label.text}”: zaznaczony obiekt stacji (odcinek z kotwicą wyniku) — nazwa jego stacji narysowana`, () => {
      expect(szyna, 'obiekt stacji w scenie').toBeDefined();
      const { svg, unmount } = kanwa([szyna!]);
      expect(nazwaNarysowana(svg, index)).toBe(true);
      unmount();
    });

    it(`„${label.text}”: alarm przekroczenia na obiekcie stacji — nazwa narysowana`, () => {
      const wpisy: Record<string, ResultLabelEntry> = {
        [szyna!]: { ownerRef: szyna!, resultRef: szyna!, kind: 'bus', severity: 'CRITICAL', lines: [{ prefix: 'U', text: '1,12' }] },
      };
      const { svg, unmount } = kanwa(undefined, { energizedByTestId: {}, resultLabelsByOwnerRef: wpisy });
      expect(svg.querySelectorAll('[data-szyna-stacji][data-stan-alarmowy]').length, 'alarm stacji').toBeGreaterThan(0);
      expect(nazwaNarysowana(svg, index)).toBe(true);
      unmount();
    });

    it(`„${label.text}”: zaznaczenie INNEJ stacji nie daje pierwszeństwa tej nazwie (kontrola)`, () => {
      const inna = nazwy.find(([l]) => !l.ownerRef.startsWith(stacja))![0].ownerRef.split('#')[0]!;
      const { svg, unmount } = kanwa([inna]);
      expect(nazwaNarysowana(svg, index)).toBe(false);
      unmount();
    });
  }

  it('znaczniki stanu (łącznik otwarty, punkt N.O.) są przeszkodą: nazwy na kanwie stoją wg planu z przeszkodami znaczników', () => {
    const { svg, unmount } = kanwa();
    // Skala kadru początkowego pełną precyzją z `viewBox` (atrybut `data-skala-kamery` niesie
    // 4 miejsca po przecinku — za mało, żeby odtworzyć położenie napisu co do tysięcznej).
    const skala = OKNO.width / Number(svg.getAttribute('viewBox')!.split(/\s+/)[2]);
    expect(skala.toFixed(4)).toBe(svg.getAttribute('data-skala-kamery'));
    const znaczniki = znacznikiStanu(
      nosnikiZnacznikowStanu({ scene, zaznaczenia: [], punktyZwarcia: [], srednicaKropkiZwarcia: 0, przekroczenia: [] }),
      { skala, wynikiCzytelne: false },
    );
    const przeszkodyStanu = przeszkodyZnacznikowStanu(znaczniki);
    expect(przeszkodyStanu.length, 'warunek sensu: kadr całej sieci ma znaczniki stanu').toBeGreaterThan(0);
    const sheet = sheetSizeFor(scene);
    // Przeszkody kanwy z jednego źródła (`przeszkodyEtykietPrzySkali`: rysunek ∪ znaczniki stanu).
    const przeszkodyKanwy = przeszkodyEtykietPrzySkali(scene)(skala);
    expect(przeszkodyKanwy).toEqual([...sceneObstacleRects(scene), ...przeszkodyStanu]);
    const zZnacznikami = planSceneLabels(scene.labels, przeszkodyKanwy, skala, sheet);
    const bezZnacznikow = planSceneLabels(scene.labels, sceneObstacleRects(scene), skala, sheet);
    const zaczep = (p: PlannedLabel | undefined) => {
      if (!p) return null;
      const z = zaczepTekstuEtykiety(p.rect, wyrownanieEtykiety(p.label, p.strona ?? p.label.placement), p.label.rotated === true);
      return `${z.x.toFixed(3)},${z.y.toFixed(3)}`;
    };
    const wDom = (index: number) => {
      const t = svg.querySelector(`[data-testid="sld-v3-label-${index}"] text`);
      return t ? `${Number(t.getAttribute('x')).toFixed(3)},${Number(t.getAttribute('y')).toFixed(3)}` : null;
    };
    const wg = (plan: typeof zZnacznikami) => new Map(plan.drawn.map((p) => [p.index, p] as const));
    const planZ = wg(zZnacznikami);
    const planB = wg(bezZnacznikow);
    // Pomiar 2026-11-12: bez przeszkód znaczników nazwa „Stacja L6-2” przykrywała znacznik stanu.
    const rozne = nazwy.filter(([, i]) => zaczep(planZ.get(i)) !== zaczep(planB.get(i)));
    expect(rozne.length, 'warunek sensu: przeszkody znaczników zmieniają położenie nazwy').toBeGreaterThan(0);
    for (const [label, i] of nazwy) expect(wDom(i), label.text).toBe(zaczep(planZ.get(i)));
    for (const [label, i] of nazwy) {
      const p = planZ.get(i);
      if (!p) continue;
      for (const r of przeszkodyStanu) {
        const rozlaczne = r.x + r.width <= p.rect.x || p.rect.x + p.rect.width <= r.x || r.y + r.height <= p.rect.y || p.rect.y + p.rect.height <= r.y;
        expect(rozlaczne, label.text).toBe(true);
      }
    }
    unmount();
});
});
