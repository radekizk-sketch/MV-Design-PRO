// @vitest-environment node
/**
 * KARTA SLD-CZYTELNOSC-STACJI (ocena właściciela 0/10, 2026-11-11) — czytelność widoku
 * stacji na GEOMETRII SCENY (bez przeglądarki; ten sam pomiar w żywej aplikacji robi spec
 * e2e `e2e/sld-czytelnosc-stacji.spec.ts`).
 *
 * Wejście: fikstury `geometria_stacji_{zamkniete,otwarte,bez_wyposazenia}` (stacje każdego
 * rodzaju z topologii, zbudowane realnymi operacjami domenowymi backendu) oraz fikstura
 * ODGAŁĘZIENIA z pola stacji (`pomiarOdgalezienie`).
 *
 * ILOCZYN CECH (reguła KLASA §2):
 *   fikstura {3 warianty wyposażenia + odgałęzienie z pola} × poziom szczegółu {L1, L2}
 *   × stacja {przelotowa, odgałęźna, sekcyjna, końcowa, końcowa odgałęzienia}
 *   × skala widoku stacji {dolny brzeg histerezy L1 0,51; 0,6; 0,82; 1,0; 1,2}
 *   × kryterium {odstęp równoległych tras ≥ 8 px ekranu, zacisk nN ≥ portal + margines,
 *                podpis szyny nN przy zacisku, opisy stacji nieukryte i ≥ 9 px}.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import zamknieteFx from '../../../../../harness-fixtures/generated/geometria_stacji_zamkniete.json';
import otwarteFx from '../../../../../harness-fixtures/generated/geometria_stacji_otwarte.json';
import bezWyposazeniaFx from '../../../../../harness-fixtures/generated/geometria_stacji_bez_wyposazenia.json';
import odgalezienieFx from './fixtures/pomiarOdgalezienie.enm.json';
import { rectsOverlap, type V3Rect } from '../../core/grid';
import { MIN_READABLE_LABEL_SCREEN_PX } from '../../core/text';
import { planSceneLabels } from '../../canvas/labelLegibility';
import {
  MIN_PARALLEL_ROUTE_SCREEN_PX,
  MIN_ROUTE_SEPARATION_SCALE,
  ROUTE_SUBLEVEL_STEP,
} from '../../layout/clearances';
import { LV_PORTAL_WIDTH, LV_TERMINAL_MIN_HALF } from '../../layout/measure';
import { sheetSizeFor } from '../../sheet/outline';
import { DEFAULT_LOD_THRESHOLDS, LOD_HYSTERESIS_MARGIN } from '../../canvas/camera';
import { buildSceneV3, sceneObstacleRects, type SceneV3 } from '../buildScene';

const FIKSTURY: readonly (readonly [string, EnergyNetworkModel])[] = [
  ['zamkniete', (zamknieteFx as unknown as { snapshot: EnergyNetworkModel }).snapshot],
  ['otwarte', (otwarteFx as unknown as { snapshot: EnergyNetworkModel }).snapshot],
  ['bez_wyposazenia', (bezWyposazeniaFx as unknown as { snapshot: EnergyNetworkModel }).snapshot],
  ['odgalezienie', odgalezienieFx as unknown as EnergyNetworkModel],
];
const POZIOMY = [1, 2] as const;
const SKALE_WIDOKU_STACJI: readonly number[] = [MIN_ROUTE_SEPARATION_SCALE, 0.6, 0.82, 1.0, 1.2];

const sceny = new Map<string, SceneV3>();
function scena(klucz: string, snapshot: EnergyNetworkModel, lod: 1 | 2): SceneV3 {
  const k = `${klucz}|${lod}`;
  const gotowa = sceny.get(k);
  if (gotowa) return gotowa;
  const nowa = buildSceneV3(snapshot, lod);
  sceny.set(k, nowa);
  return nowa;
}

type Odcinek = { readonly ref: string; readonly a: number; readonly b: number; readonly poz: number };

/** Odcinki toru SN (kable i magistrala — rodzaje `sn`/`snTrunk`), rozbite na poziome i pionowe. */
function odcinkiTras(sc: SceneV3): { poziome: Odcinek[]; pionowe: Odcinek[] } {
  const poziome: Odcinek[] = [];
  const pionowe: Odcinek[] = [];
  for (const s of sc.segments) {
    const kind = s.meta?.kind;
    if (kind !== 'sn' && kind !== 'snTrunk') continue;
    const ref = s.meta?.ownerRef ?? '';
    for (let i = 1; i < s.points.length; i += 1) {
      const p = s.points[i - 1];
      const q = s.points[i];
      if (p.y === q.y && p.x !== q.x) poziome.push({ ref, a: Math.min(p.x, q.x), b: Math.max(p.x, q.x), poz: p.y });
      else if (p.x === q.x && p.y !== q.y) pionowe.push({ ref, a: Math.min(p.y, q.y), b: Math.max(p.y, q.y), poz: p.x });
    }
  }
  return { poziome, pionowe };
}

/** Najmniejszy odstęp [j.św.] dwóch RÓŻNYCH tras biegnących równolegle na wspólnym odcinku. */
function najmniejszyOdstepTras(sc: SceneV3): { odstep: number; para: string } | null {
  const { poziome, pionowe } = odcinkiTras(sc);
  let wynik: { odstep: number; para: string } | null = null;
  for (const lista of [poziome, pionowe]) {
    for (let i = 0; i < lista.length; i += 1) {
      for (let j = i + 1; j < lista.length; j += 1) {
        const x = lista[i];
        const y = lista[j];
        if (x.ref === y.ref || x.poz === y.poz) continue;
        if (Math.min(x.b, y.b) - Math.max(x.a, y.a) <= 0) continue;
        const odstep = Math.abs(x.poz - y.poz);
        if (wynik === null || odstep < wynik.odstep) wynik = { odstep, para: `${x.ref} | ${y.ref}` };
      }
    }
  }
  return wynik;
}

describe('SLD-CZYTELNOSC-STACJI — geometria sceny widoku stacji', () => {
  it('krok sub-poziomów korytarza jest wyprowadzony z czytelności ekranowej i spójny z kamerą', () => {
    // Dolny brzeg histerezy wejścia w L1 — `canvas/camera.ts` (warstwa układu nie importuje kamery).
    expect(MIN_ROUTE_SEPARATION_SCALE).toBeCloseTo(DEFAULT_LOD_THRESHOLDS.l0Max * (1 - LOD_HYSTERESIS_MARGIN), 9);
    expect(ROUTE_SUBLEVEL_STEP * MIN_ROUTE_SEPARATION_SCALE).toBeGreaterThanOrEqual(MIN_PARALLEL_ROUTE_SCREEN_PX);
  });

  for (const [klucz, snapshot] of FIKSTURY) {
    for (const lod of POZIOMY) {
      it(`${klucz} · L${lod}: równoległe trasy toru SN różnych obwodów ≥ ${MIN_PARALLEL_ROUTE_SCREEN_PX} px ekranu przy każdej skali L1/L2`, () => {
        const sc = scena(klucz, snapshot, lod);
        const najmniejszy = najmniejszyOdstepTras(sc);
        if (najmniejszy === null) return;
        expect(
          najmniejszy.odstep * MIN_ROUTE_SEPARATION_SCALE,
          `${najmniejszy.para}: ${najmniejszy.odstep} j.św.`,
        ).toBeGreaterThanOrEqual(MIN_PARALLEL_ROUTE_SCREEN_PX);
      });

      it(`${klucz} · L${lod}: zacisk nN każdej stacji jest szyną (≥ portal + GRID z każdej strony), podpis szyny nN przy zacisku`, () => {
        const sc = scena(klucz, snapshot, lod);
        const zaciski = sc.segments.filter((s) => (s.meta?.ownerRef ?? '').endsWith('#lv-bus'));
        const stacjeZZaciskiem = (snapshot.substations ?? []).filter((st) =>
          zaciski.some((s) => s.meta?.ownerRef === `${st.ref_id}#lv-bus`),
        );
        // Każda stacja z transformatorem w modelu ma zacisk nN na scenie (fikstura odgałęzienia
        // nie ma transformatorów — wtedy zbiór jest pusty z obu stron).
        const zTransformatorem = (snapshot.substations ?? []).filter(
          (st) => ((st as { transformer_refs?: string[] }).transformer_refs ?? []).length > 0,
        );
        expect(stacjeZZaciskiem.map((s) => s.ref_id).sort()).toEqual(zTransformatorem.map((s) => s.ref_id).sort());
        for (const st of stacjeZZaciskiem) {
          const seg = zaciski.find((s) => s.meta?.ownerRef === `${st.ref_id}#lv-bus`)!;
          const xs = seg.points.map((p) => p.x);
          const dlugosc = Math.max(...xs) - Math.min(...xs);
          expect(dlugosc, `${st.name}: długość zacisku nN`).toBeGreaterThanOrEqual(2 * LV_TERMINAL_MIN_HALF);
          expect(dlugosc, `${st.name}: zacisk dłuższy od portalu`).toBeGreaterThan(LV_PORTAL_WIDTH);
          // Podpis szyny nN: przy zacisku (na prawo od końca, w osi zacisku) — nie w paśmie nazw.
          const podpis = sc.labels.find((l) => l.ownerRef === `${st.ref_id}#lv-bus-voltage`);
          const wPasmie = sc.labels.some(
            (l) => l.ownerKind === 'station-name' && l.ownerRef.startsWith(`${st.ref_id}#name-row`) && l.text.startsWith('Szyna nN'),
          );
          expect(Boolean(podpis) !== wPasmie, `${st.name}: podpis szyny nN dokładnie w jednym miejscu`).toBe(true);
          if (podpis) {
            const y = seg.points[0].y;
            const prawyKoniec = Math.max(...xs);
            expect(podpis.rect.x, `${st.name}: podpis na prawo od końca zacisku`).toBeGreaterThan(prawyKoniec);
            expect(podpis.rect.x - prawyKoniec, `${st.name}: podpis przy zacisku`).toBeLessThanOrEqual(24);
            expect(podpis.rect.y, `${st.name}: podpis w osi zacisku`).toBeLessThanOrEqual(y);
            expect(podpis.rect.y + podpis.rect.height, `${st.name}: podpis w osi zacisku`).toBeGreaterThanOrEqual(y);
            // Podpis nie leży na rysunku (symbol, tor) — rezerwacja szerokości kolumny stacji.
            for (const r of sceneObstacleRects(sc)) {
              expect(rectsOverlap(podpis.rect, r), `${st.name}: podpis × przeszkoda ${JSON.stringify(r)}`).toBe(false);
            }
          }
        }
      });

      for (const skala of SKALE_WIDOKU_STACJI) {
        // L2 kamera osiąga dopiero od progu L1/L2 (z histerezą ~1,02) — niższe skale z L2 nie występują.
        if (lod === 2 && skala < DEFAULT_LOD_THRESHOLDS.l1Max * (1 - LOD_HYSTERESIS_MARGIN)) continue;
        it(`${klucz} · L${lod} @${skala}: opisy stacji narysowane (żaden nie ukryty progiem skali) i ≥ ${MIN_READABLE_LABEL_SCREEN_PX} px`, () => {
          const sc = scena(klucz, snapshot, lod);
          const plan = planSceneLabels(sc.labels, sceneObstacleRects(sc), skala, sheetSizeFor(sc), undefined, lod);
          for (const p of plan.drawn) {
            expect(p.fontSize * skala, `${p.label.ownerRef} „${p.text}"`).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_SCREEN_PX - 1e-9);
          }
          // Ukrycie dopuszczalne WYŁĄCZNIE z realnej kolizji: etykieta ukryta musi w postaci
          // czytelnej (powiększonej do progu) nachodzić na rysunek albo na etykietę narysowaną.
          const zajete: V3Rect[] = [...sceneObstacleRects(sc), ...plan.drawn.map((p) => p.rect)];
          for (const l of [...plan.hiddenDetail, ...plan.droppedIdentity]) {
            const k = Math.max(1, MIN_READABLE_LABEL_SCREEN_PX / skala / (l.rect.height - 6));
            const cx = l.rect.x + l.rect.width / 2;
            const cy = l.rect.y + l.rect.height / 2;
            const powiekszony = { x: cx - (l.rect.width * k) / 2, y: cy - (l.rect.height * k) / 2, width: l.rect.width * k, height: l.rect.height * k };
            expect(
              zajete.some((r) => rectsOverlap(r, powiekszony)) || powiekszony.x < 0 || powiekszony.y < 0,
              `${l.ownerRef} „${l.text}" ukryty bez kolizji`,
            ).toBe(true);
          }
        });
      }
    }
  }
});
