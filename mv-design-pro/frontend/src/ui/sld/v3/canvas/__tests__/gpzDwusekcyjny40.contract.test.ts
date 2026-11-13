/**
 * Karta SLD-SKALA-I-NAWIGACJA (R3, R4, R8) — GPZ DWUSEKCYJNY Z 40 STACJAMI przy podłodze czytelności.
 *
 * Sieć pomiarowa karty (`public/test-fixtures/gpzDwusekcyjny40.enm.json`, budowana operacjami
 * domenowymi przez API w `backend/tests/reference_networks/fikstury_enm_sld.py`,
 * `_gpz_dwusekcyjny_40_stacji`): GPZ 110/15 kV z dwiema sekcjami SN i dwoma transformatorami,
 * cztery ciągi po dziewięć stacji, na każdym ciągu stacja odgałęźna z odgałęzieniem do stacji
 * końcowej i stacja sekcyjna — 40 stacji SN/nN.
 *
 * ILOCZYN CECH: skala {dopasowanie całej sieci 1200×800, podłoga czytelności rozdzielnicy (1,0),
 * skale odbioru planu etykiet} × klasa {tożsamość, dane} × rodzaj właściciela tożsamości.
 *  - R4: każda tożsamość sceny jest narysowana albo w podpowiedzi uchwytu — w każdej skali;
 *  - plan bez kolizji etykieta↔etykieta w każdej skali;
 *  - przy podłodze czytelności (kadr rozdzielnicy, `SKALA_PODLOGI_ROZDZIELNICY`) każda narysowana
 *    tożsamość ma pismo czytelne na ekranie (≥ `MIN_READABLE_LABEL_SCREEN_PX`), a obie sekcje
 *    szyn GPZ mają narysowany opis sekcji.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects } from '../../scene/buildScene';
import { MIN_READABLE_LABEL_SCREEN_PX } from '../../core/text';
import { sheetSizeFor } from '../../sheet/outline';
import { computeInitialCameraState, SKALE_ODBIORU_PLANU_ETYKIET } from '../camera';
import { SKALA_PODLOGI_ROZDZIELNICY } from '../oknoRenderu';
import { planSceneLabels, plannedLabelCollisions } from '../labelLegibility';
import { contentBoundingBoxOf, sceneBoxToCameraWorld } from '../SldCanvasV3';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(resolve(here, '../../../../../../public/test-fixtures/gpzDwusekcyjny40.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;
const scene = buildSceneV3(enm);

function skalaDopasowania(widok: { readonly width: number; readonly height: number }): number {
  const b = scene.bbox;
  const cel = sceneBoxToCameraWorld(
    contentBoundingBoxOf(scene) ?? { minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height },
  );
  return computeInitialCameraState(cel, widok, null).transform.scale;
}

const SKALE: readonly (readonly [string, number])[] = [
  ['dopasowanie całej sieci 1200×800', skalaDopasowania({ width: 1200, height: 800 })],
  ['podłoga czytelności rozdzielnicy', SKALA_PODLOGI_ROZDZIELNICY],
  ...SKALE_ODBIORU_PLANU_ETYKIET.map((s) => [`odbiór planu ${s}`, s] as const),
];

describe('GPZ dwusekcyjny z 40 stacjami — sieć pomiarowa', () => {
  it('fikstura: jeden GPZ i 40 stacji SN/nN; na rysunku wszystkie poza końcami odgałęzień ciągów 2–4', () => {
    const gpz = enm.substations.filter((s) => s.station_type === 'gpz');
    expect(gpz).toHaveLength(1);
    expect(enm.substations.length - gpz.length).toBe(40);
    const naRysunku = new Set(scene.meta.stationTraversalOrder);
    const pominiete = enm.substations
      .filter((x) => x.station_type !== 'gpz' && !naRysunku.has(x.ref_id))
      .map((x) => x.name)
      .sort();
    // PRZYPIĘTE OGRANICZENIE UKŁADU (wykryte tą fiksturą, zgłoszone w meldunku karty, warstwa
    // layout/** poza granicą tej karty): odgałęzienie, którego stacja-origin nie leży na
    // magistrali głównej rysunku (ciągi 2–4 — ciąg 1 jest magistralą), jest pomijane z notą
    // „ciąg pominięty". Ten test zmieni kolor, gdy układ zacznie je rysować — wtedy oczekiwanie
    // wraca do „wszystkie 40 na rysunku".
    expect(pominiete).toEqual(['Stacja 2.03-K', 'Stacja 3.03-K', 'Stacja 4.03-K']);
    expect(scene.meta.stopNotes.filter((n) => n.includes('ciąg pominięty'))).toHaveLength(3);
  });

  for (const [opis, skala] of SKALE) {
    it(`${opis} (skala ${skala.toFixed(4)}): każda tożsamość narysowana albo w podpowiedzi, zero kolizji`, () => {
      const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), skala, sheetSizeFor(scene));
      const obecne = new Set([...plan.drawn.map((p) => p.index), ...plan.tozsamosciWPodpowiedzi.map((t) => t.index)]);
      const zgubione = scene.labels
        .map((l, i) => [l, i] as const)
        .filter(([l, i]) => l.labelRole === 'tozsamosc' && !obecne.has(i))
        .map(([l]) => `${l.ownerKind}:${l.ownerRef}`);
      expect(zgubione).toEqual([]);
      expect(plannedLabelCollisions(plan)).toEqual([]);
    });
  }

  it('podłoga czytelności: narysowane tożsamości czytelne na ekranie, opisy obu sekcji GPZ narysowane', () => {
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), SKALA_PODLOGI_ROZDZIELNICY, sheetSizeFor(scene));
    const nieczytelne = plan.drawn
      .filter((p) => p.label.labelRole === 'tozsamosc' && p.fontSize * SKALA_PODLOGI_ROZDZIELNICY < MIN_READABLE_LABEL_SCREEN_PX - 1e-9)
      .map((p) => p.label.ownerRef);
    expect(nieczytelne).toEqual([]);
    const opisySekcji = plan.drawn.filter((p) => p.label.ownerKind === 'busbar-voltage' && /Sekcja/.test(p.text));
    expect(new Set(opisySekcji.map((p) => p.text)).size).toBeGreaterThanOrEqual(2);
  });
});
