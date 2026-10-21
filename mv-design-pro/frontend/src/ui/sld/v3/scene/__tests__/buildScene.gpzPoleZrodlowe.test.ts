/**
 * GPZ-PARYTET cz. 3 (pkt 1): pole źródłowe GPZ (`bay_role = 'OZE'`) było mapowane na odpływ
 * (`LINE_OUT`) i rysowane bez rodzaju źródła. Teraz rodzaj źródła pochodzi z przyłączonych
 * wytwórców (`Generator.meta.field_ref`) przez TĘ SAMĄ funkcję co pola źródłowe stacji
 * (`v2/model/polaZModelu.ts rolaPolaZrodlowego`), a pole dostaje glif źródła z tej samej
 * tabeli rola → glif (`apparatusSymbolsForRole`). Glif jest aparatem bocznym przy głowicy
 * kablowej — kabel nadal wychodzi z głowicy.
 *
 * Iloczyn cech na realnej ścieżce (migawka ENM → adapter → kompozycja → scena v3):
 * wytwórcy pola {PV, BESS, FW, brak, mieszane} × pole {magistralowe, odpływowe} × LOD {1, 2}.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Generator } from '../../../../../types/enm';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { buildSceneV3 } from '../buildScene';
import { buildDerSnFixture } from './fixtures/w2cDerSnFixtures';

const GLIFY = ['derPv', 'derBess', 'derWind', 'derUnknown'] as const;
type Wytworcy = 'PV' | 'BESS' | 'FW' | 'brak' | 'mieszane';
const PRZYPADKI: ReadonlyArray<readonly [Wytworcy, readonly NonNullable<Generator['gen_type']>[], (typeof GLIFY)[number]]> = [
  ['PV', ['pv_inverter'], 'derPv'],
  ['BESS', ['bess'], 'derBess'],
  ['FW', ['fw_pmsg', 'wind_inverter'], 'derWind'],
  ['brak', [], 'derUnknown'],
  ['mieszane', ['pv_inverter', 'bess'], 'derUnknown'],
];
const POLA = { magistralowe: 'bay/001/001', odplywowe: 'bay/001/002' } as const;

function migawka(pole: keyof typeof POLA, typy: readonly NonNullable<Generator['gen_type']>[]): {
  enm: EnergyNetworkModel;
  bayRef: string;
} {
  const { enm } = buildDerSnFixture([]);
  const bay = enm.bays.find((b) => b.ref_id.endsWith(POLA[pole]))!;
  (bay as { bay_role: string }).bay_role = 'OZE';
  typy.forEach((genType, i) => {
    enm.generators.push({
      id: `gen-oze-${i}`, ref_id: `gen-oze-${i}`, name: `Źródło ${i}`, tags: [], bus_ref: bay.bus_ref, p_mw: 1,
      gen_type: genType, meta: { field_ref: bay.ref_id },
    } as Generator);
  });
  return { enm, bayRef: bay.ref_id };
}

describe('GPZ: pole źródłowe z glifem rodzaju źródła z modelu — wytwórcy × pole × LOD', () => {
  for (const [opis, typy, glif] of PRZYPADKI) {
    for (const pole of Object.keys(POLA) as (keyof typeof POLA)[]) {
      for (const lod of [1, 2] as const) {
        it(`${opis} × ${pole} × L${lod} → ${glif}`, () => {
          const { enm, bayRef } = migawka(pole, typy);
          const scena = buildSceneV3(enm, lod);
          const wlasne = scena.symbols.filter((s) => s.meta?.ownerRef === bayRef);
          const glify = wlasne.filter((s) => (GLIFY as readonly string[]).includes(s.symbolId));
          expect(glify.map((s) => s.symbolId)).toEqual([glif]);
          // Głowica kablowa zostaje zakończeniem toru pola; glif wisi obok niej (boczny).
          const glowica = wlasne.find((s) => s.symbolId === 'cableHead')!;
          const osX = glowica.x + SYMBOL_DEFS.cableHead.width / 2;
          expect(glify[0].x).toBeGreaterThan(osX);
          const dnoGlowicy = { x: osX, y: glowica.y + SYMBOL_DEFS.cableHead.height };
          // Kabel wychodzi z dolnego portu głowicy (zaczep trasy nie przechodzi na glif).
          const zGlowicy = scena.segments.filter(
            (seg) => !(seg.meta?.ownerRef ?? '').startsWith(bayRef) &&
              seg.points.some((p) => p.x === dnoGlowicy.x && p.y === dnoGlowicy.y),
          );
          if (pole === 'magistralowe') expect(zGlowicy.length).toBeGreaterThan(0);
          const dnoGlifu = { y: glify[0].y + SYMBOL_DEFS[glif].height };
          expect(scena.segments.some((seg) => seg.points.some((p) => p.y === dnoGlifu.y && p.x === glify[0].x + SYMBOL_DEFS[glif].width / 2))).toBe(false);
        });
      }
    }
  }

  it('pole odpływowe (FEEDER) nie dostaje glifu źródła, nawet gdy w modelu wskazuje je wytwórca', () => {
    const { enm } = buildDerSnFixture([]);
    const bay = enm.bays.find((b) => b.ref_id.endsWith(POLA.odplywowe))!;
    enm.generators.push({
      id: 'g', ref_id: 'g', name: 'g', tags: [], bus_ref: bay.bus_ref, p_mw: 1, gen_type: 'pv_inverter',
      meta: { field_ref: bay.ref_id },
    } as Generator);
    const glify = buildSceneV3(enm, 2).symbols.filter(
      (s) => s.meta?.ownerRef === bay.ref_id && (GLIFY as readonly string[]).includes(s.symbolId),
    );
    expect(glify).toEqual([]);
  });

  it('determinizm: ta sama migawka → ta sama scena', () => {
    const a = buildSceneV3(migawka('odplywowe', ['bess']).enm, 2);
    const b = buildSceneV3(migawka('odplywowe', ['bess']).enm, 2);
    expect(JSON.stringify(b.symbols)).toBe(JSON.stringify(a.symbols));
    expect(JSON.stringify(b.segments)).toBe(JSON.stringify(a.segments));
  });
});
