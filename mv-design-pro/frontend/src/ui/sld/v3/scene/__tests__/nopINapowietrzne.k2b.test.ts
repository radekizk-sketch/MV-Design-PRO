/**
 * K2b §0.4 — WIDOK ROBOCZY: punkt normalnie otwarty na KAŻDYM poziomie szczegółu
 * i rozróżnienie kabel / linia napowietrzna, oba z ENM.
 *
 * Wada wyjściowa (pomiar 2026-10-21 na fiksturze 52 stacji): `Corridor.no_point_ref`
 * wskazywał ŁĄCZNIK (`sw/…/switch`), a scena porównywała go wyłącznie z refem
 * STACJI — NOP ustawiony operacją domenową nie był rysowany na żadnym poziomie.
 * Osiem linii napowietrznych (`Branch.type = 'line_overhead'`) rysowało się kreską
 * ciągłą jak kabel, a legenda nie znała linii napowietrznej.
 *
 * ILOCZYN CECH (reguła KLASA pkt 2):
 *  - wskazanie NOP: łącznik (fikstura) · odcinek kablowy · odcinek napowietrzny ·
 *    stacja (dotychczasowa reprezentacja GS-1) · ref nieistniejący;
 *  - poziom szczegółu L0 · L1 · L2;
 *  - rodzaj gałęzi: kabel · linia napowietrzna · model bez linii napowietrznych;
 *  - determinizm (dwa budowania tej samej migawki — identyczna scena).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../buildScene';
import { OVERHEAD_LINE_DASHARRAY, segmentDasharray } from '../../compose/preview';
import { computeProjectLegendEntries } from '../../sheet/projectLegend';

const here = dirname(fileURLToPath(import.meta.url));
const wczytaj = (): EnergyNetworkModel =>
  (
    JSON.parse(
      readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
    ) as { enm: EnergyNetworkModel }
  ).enm;
const enm = wczytaj();
const LODY: readonly SceneLod[] = [0, 1, 2];
const baza = (ref: string | undefined) => (ref ?? '').split('#')[0];
const NOP_LACZNIKA = enm.corridors!.find((c) => c.no_point_ref)!.no_point_ref!;

/** Kopia migawki z NOP przeniesionym na `ref` (jedyny korytarz z NOP). */
function zNop(ref: string): EnergyNetworkModel {
  const kopia = structuredClone(enm);
  for (const c of kopia.corridors ?? []) {
    if (c.no_point_ref) (c as { no_point_ref: string | null }).no_point_ref = ref;
  }
  return kopia;
}
/** Gałąź danego typu, której odcinek jest narysowany na KAŻDYM poziomie. */
function galazNarysowana(typ: 'cable' | 'line_overhead'): string {
  const sceny = LODY.map((l) => buildSceneV3(enm, l));
  const kandydat = enm.branches
    .filter((b) => b.type === typ)
    .map((b) => b.ref_id)
    .sort()
    .find((ref) => sceny.every((sc) => sc.segments.some((s) => baza(s.meta?.ownerRef) === ref)));
  if (!kandydat) throw new Error(`fikstura bez narysowanej gałęzi ${typ}`);
  return kandydat;
}
function nop(sc: SceneV3, ref: string) {
  return {
    symbole: sc.symbols.filter((s) => s.symbolId === 'noPoint' && s.meta?.ownerRef === ref),
    podpisy: sc.labels.filter((l) => l.ownerRef === `${ref}#no-point` && l.text === 'NO'),
  };
}

describe('NOP z `Corridor.no_point_ref` na każdym poziomie szczegółu', () => {
  const KABEL = galazNarysowana('cable');
  const NAPOWIETRZNA = galazNarysowana('line_overhead');
  const PRZYPADKI: readonly (readonly [string, string, EnergyNetworkModel])[] = [
    ['łącznik (fikstura)', NOP_LACZNIKA, enm],
    ['odcinek kablowy', KABEL, zNop(KABEL)],
    ['odcinek napowietrzny', NAPOWIETRZNA, zNop(NAPOWIETRZNA)],
  ];
  for (const [nazwa, ref, model] of PRZYPADKI) {
    for (const lod of LODY) {
      it(`${nazwa} · L${lod}: jeden symbol noPoint z testId i ownerRef, ${lod === 0 ? 'bez podpisu (GS-1: L0 = sam symbol)' : 'jeden podpis „NO"'}, bez notatki o pominięciu`, () => {
        const sc = buildSceneV3(model, lod);
        const { symbole, podpisy } = nop(sc, ref);
        expect(symbole).toHaveLength(1);
        expect(symbole[0]!.meta?.testId).toBe(`sld-v3-nop-${ref}`);
        expect(symbole[0]!.meta?.elementKind).toBe('apparatus');
        expect(podpisy).toHaveLength(lod === 0 ? 0 : 1);
        if (lod !== 0) expect(podpisy[0]!.labelClass).toBe('t3');
        expect(sc.meta.stopNotes.some((n) => n.includes(ref))).toBe(false);
      });
    }
  }

  it.each(PRZYPADKI.slice(1).map(([n, r, m]) => [n, r, m] as const))(
    '%s: symbol leży NA odcinku tej gałęzi (środek symbolu na jego biegu) na L0/L1/L2',
    (_n, ref, model) => {
      for (const lod of LODY) {
        const sc = buildSceneV3(model, lod);
        const s = nop(sc, ref).symbole[0]!;
        const def = { w: 16, h: 16 };
        const cx = s.x + def.w / 2;
        const cy = s.y + def.h / 2;
        const naBiegu = sc.segments
          .filter((seg) => baza(seg.meta?.ownerRef) === ref)
          .some((seg) =>
            seg.points.slice(1).some((b, i) => {
              const a = seg.points[i]!;
              const tol = 10; // siatka przyciągania
              return (
                cx >= Math.min(a.x, b.x) - tol &&
                cx <= Math.max(a.x, b.x) + tol &&
                cy >= Math.min(a.y, b.y) - tol &&
                cy <= Math.max(a.y, b.y) + tol
              );
            }),
          );
        expect(naBiegu, `L${lod}`).toBe(true);
      }
    },
  );

  it('symbol i podpis NO nie wypychają z rysunku żadnej INNEJ etykiety (pomiar: podpis pod łącznikiem toru odrzucał jego nazwę na L2)', () => {
    const bezNop = structuredClone(enm);
    for (const c of bezNop.corridors ?? []) (c as { no_point_ref: string | null }).no_point_ref = null;
    const odrzucone = (sc: SceneV3) =>
      new Set(sc.meta.stopNotes.filter((n) => n.startsWith('label.declutter')).flatMap((n) => n.match(/[a-z-]+:[^ ,()]+#[a-z-]+/g) ?? []));
    for (const [nazwa, ref, model] of PRZYPADKI) {
      for (const lod of LODY) {
        const przed = odrzucone(buildSceneV3(bezNop, lod));
        const po = [...odrzucone(buildSceneV3(model, lod))].filter((k) => !k.endsWith(`${ref}#no-point`));
        expect(po.filter((k) => !przed.has(k)), `${nazwa} · L${lod}`).toEqual([]);
      }
    }
  });

  it('NOP stacji (dotychczasowa reprezentacja GS-1) nie dostaje drugiego symbolu z przebiegu korytarza', () => {
    const st = buildSceneV3(enm, 2).meta.mainTrunkStationIds[0]!;
    const model = zNop(st);
    for (const lod of LODY) expect(nop(buildSceneV3(model, lod), st).symbole.filter((s) => s.meta?.testId === `sld-v3-nop-${st}`).length).toBeLessThanOrEqual(1);
  });

  it('ref nieistniejący: brak symbolu i jawna notatka o pominięciu (bez fabrykacji położenia)', () => {
    const ref = 'sw/nie-ma-takiego/switch';
    for (const lod of LODY) {
      const sc = buildSceneV3(zNop(ref), lod);
      expect(nop(sc, ref).symbole).toHaveLength(0);
      expect(sc.meta.stopNotes.some((n) => n.includes(ref))).toBe(true);
    }
  });

  it('determinizm: dwa budowania tej samej migawki z NOP — identyczne sceny', () => {
    for (const lod of LODY) expect(JSON.stringify(buildSceneV3(zNop(KABEL), lod))).toBe(JSON.stringify(buildSceneV3(zNop(KABEL), lod)));
  });
});

describe('kabel ciągły, linia napowietrzna przerywana — z `Branch.type` przez adapter', () => {
  const napowietrzne = new Set(enm.branches.filter((b) => b.type === 'line_overhead').map((b) => b.ref_id));
  const kablowe = new Set(enm.branches.filter((b) => b.type === 'cable').map((b) => b.ref_id));
  for (const lod of LODY) {
    it(`L${lod}: każdy odcinek SN linii napowietrznej ma lineType 'overhead' i kreskę ${OVERHEAD_LINE_DASHARRAY}; żaden odcinek kabla jej nie ma`, () => {
      const sc = buildSceneV3(enm, lod);
      let napow = 0;
      for (const s of sc.segments) {
        const rodzaj = s.meta?.kind ?? 'sn';
        if (rodzaj !== 'sn' && rodzaj !== 'snTrunk') continue;
        const ref = baza(s.meta?.ownerRef);
        if (napowietrzne.has(ref)) {
          napow += 1;
          expect(s.meta?.lineType, ref).toBe('overhead');
          expect(segmentDasharray(s)).toBe(OVERHEAD_LINE_DASHARRAY);
        }
        if (kablowe.has(ref)) {
          expect(s.meta?.lineType, ref).toBeUndefined();
          expect(segmentDasharray(s)).toBeUndefined();
        }
      }
      expect(napow, 'fikstura musi rysować linie napowietrzne').toBeGreaterThan(0);
      const legenda = computeProjectLegendEntries(sc).filter((e) => e.kind === 'line').map((e) => e.id);
      expect(legenda).toContain('overhead');
      expect(legenda).toContain('cable');
    });
  }

  it('model bez linii napowietrznych: żaden odcinek nie jest przerywany, legenda bez pozycji linii napowietrznej', () => {
    const kopia = structuredClone(enm);
    for (const b of kopia.branches) if (b.type === 'line_overhead') (b as { type: string }).type = 'cable';
    for (const lod of LODY) {
      const sc = buildSceneV3(kopia, lod);
      expect(sc.segments.some((s) => s.meta?.lineType === 'overhead')).toBe(false);
      expect(computeProjectLegendEntries(sc).some((e) => e.id === 'overhead')).toBe(false);
    }
  });
});
