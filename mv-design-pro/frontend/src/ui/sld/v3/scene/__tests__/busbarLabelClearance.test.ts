/**
 * KD-8 poz. 5 — PODPIS SZYNY NIE SIADA NA SZYNIE + PRÓG CZYTELNOŚCI OPISÓW.
 *
 * Ocena właściciela: „podpis »Sekcja 1 · 15 kV« koliduje z szyną; opisy przy
 * zoomie rozwinięcia nieczytelne mimo mechanizmu »Ukryto N opisów«".
 *
 * POMIAR PRZED (fixtura `gpzFeeder`, wszystkie LOD): prześwit etykiet
 * `busbar-voltage` do najbliższego odcinka toru = 7,0 px świata (slot stał
 * `GRID` = 8 od kotwicy, snap siatki zabierał 1). Przy skali przeglądowej
 * (~0,5) to ~3,5 px ekranu — styk.
 *
 * Wyrocznia przecięć (`labelWireCollisions`) była PRZY TYM ZIELONA: podpis nie
 * przecinał szyny, tylko się z nią stykał. Dlatego mierzymy PRZEŚWIT.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  allBusbarLabelsClearOfPath,
  buildSceneV3,
  busbarLabelPathClearanceGaps,
  noLabelCollisions,
  noLabelWireCollisions,
  type SceneLod,
} from '../buildScene';
import { BUSBAR_LABEL_PATH_CLEARANCE } from '../../layout/clearances';
import { LABEL_TYPOGRAPHY, MIN_READABLE_LABEL_SCREEN_PX, isLabelReadableAtScale } from '../../core/text';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnm(name: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }).enm;
}

const FIXTURY: readonly (readonly [string, EnergyNetworkModel])[] = [
  ['gpzFeeder', loadEnm('gpzFeeder.enm.json')],
  ['openBranch', loadEnm('openBranch.enm.json')],
  ['openTrunkChain', loadEnm('openTrunkChain.enm.json')],
];

const LODS: readonly SceneLod[] = [0, 1, 2];

describe('prześwit etykiet szyn od toru mocy (KD-8 poz. 5)', () => {
  for (const [nazwa, enm] of FIXTURY) {
    for (const lod of LODS) {
      it(`${nazwa} LOD ${lod}: każda etykieta szyny trzyma ≥ ${BUSBAR_LABEL_PATH_CLEARANCE} px świata`, () => {
        const scene = buildSceneV3(enm, lod);
        const gaps = busbarLabelPathClearanceGaps(scene, BUSBAR_LABEL_PATH_CLEARANCE);
        expect(
          gaps,
          gaps.map((g) => `${g.text} (${g.ownerRef}) = ${g.clearance} px przy ${g.segmentOwnerRef}`).join('; '),
        ).toEqual([]);
        expect(allBusbarLabelsClearOfPath(scene, BUSBAR_LABEL_PATH_CLEARANCE)).toBe(true);
      });
    }
  }

  it('wyrocznia GRYZIE: próg wyższy niż zmierzony prześwit MUSI dać naruszenie', () => {
    const scene = buildSceneV3(FIXTURY[0][1], 1);
    const gaps = busbarLabelPathClearanceGaps(scene, BUSBAR_LABEL_PATH_CLEARANCE * 4);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].clearance).toBeGreaterThanOrEqual(BUSBAR_LABEL_PATH_CLEARANCE);
  });

  it('dawny prześwit (GRID = 8) był PONIŻEJ obecnego kontraktu', () => {
    // Dowód, że zmiana jest realna, a nie kosmetyczna: 8 < 16.
    expect(BUSBAR_LABEL_PATH_CLEARANCE).toBeGreaterThan(8);
  });

  for (const [nazwa, enm] of FIXTURY) {
    it(`${nazwa}: podniesiony prześwit NIE wprowadził kolizji etykieta↔etykieta/symbol/przewód`, () => {
      for (const lod of LODS) {
        const scene = buildSceneV3(enm, lod);
        expect(noLabelCollisions(scene), `${nazwa} LOD ${lod} kolizje etykiet`).toBe(true);
        expect(noLabelWireCollisions(scene), `${nazwa} LOD ${lod} kolizje z przewodem`).toBe(true);
      }
    });
  }
});

describe('próg czytelności opisów (KD-8 poz. 5)', () => {
  it('próg jest JAWNĄ stałą gramatyki i wynosi 9 px ekranu', () => {
    expect(MIN_READABLE_LABEL_SCREEN_PX).toBe(9);
  });

  it('etykieta adnotacyjna (t4) znika poniżej skali, przy której miała 9 px', () => {
    const t4 = LABEL_TYPOGRAPHY.t4.fontSize;
    const progowaSkala = MIN_READABLE_LABEL_SCREEN_PX / t4;
    expect(isLabelReadableAtScale('t4', progowaSkala)).toBe(true);
    expect(isLabelReadableAtScale('t4', progowaSkala - 0.01)).toBe(false);
  });

  it('przy skali, którą właściciel zobaczył jako nieczytelną (0,75), opisy t3/t4 są UKRYWANE', () => {
    expect(isLabelReadableAtScale('t4', 0.75)).toBe(false);
    expect(isLabelReadableAtScale('t3', 0.75)).toBe(false);
    // Tożsamość (nazwa stacji, t1) zostaje czytelna — ukrycie nie zjada
    // warstwy najważniejszej.
    expect(isLabelReadableAtScale('t1', 0.75)).toBe(true);
  });

  it('brak wiarygodnego pomiaru skali NIE ukrywa niczego', () => {
    for (const skala of [0, -1, Number.NaN]) {
      expect(isLabelReadableAtScale('t4', skala)).toBe(true);
    }
  });
});
