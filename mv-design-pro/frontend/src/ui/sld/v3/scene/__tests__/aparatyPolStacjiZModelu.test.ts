/**
 * Karta SZABLONY-POL (rozszerzenie sesji głównej 2026-11-11, werdykt właściciela 0/10 widoku
 * stacji): pole stacji SN rysuje KAŻDY aparat z modelu — liczba glifów aparatów pola na scenie
 * = liczba rekordów `Bay.primary_devices`, a każdy glif niesie `deviceRef` rekordu.
 *
 * Dawniej operacje stacyjne zapisywały w polu bez szablonu wyłącznie gałąź aparatu głównego,
 * więc pole rysowało się samym kwadratem wyłącznika. Backend (`enm/aparaty_pol_sn.py`)
 * materializuje dziś tor z szablonu roli wg konstrukcji pola (aparat główny z katalogu).
 *
 * ILOCZYN CECH: konstrukcja pola {wyłącznik, rozłącznik, rozłącznik bezpiecznikowy, odłącznik}
 *   × funkcja pola {zasilające, odpływowe, sprzęgło, transformatorowe} × LOD {1, 2}.
 * Fikstura `stacjeKonstrukcjiPol.enm.json` z REALNYCH operacji domenowych backendu
 * (`tests.reference_networks.fikstury_enm_sld`), po jednej stacji sekcyjnej na konstrukcję.
 *
 * Wyrocznia NIEZALEŻNA od kompozycji: rekordy aparatów czytane wprost z modelu.
 * Rekord transformatora pola (`TRANSFORMER_DEVICE`) rysuje transformator stacji — glif
 * transformatora nie należy do pola, więc wyrocznia liczy go poza polem (jawnie niżej).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod } from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(readFileSync(resolve(here, 'fixtures', 'stacjeKonstrukcjiPol.enm.json'), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }
).enm;

/** Stacja → konstrukcja (nazwy z generatora fikstury). */
const KONSTRUKCJE: Readonly<Record<string, string>> = {
  'S-WYL': 'wyłącznik',
  'S-ROZL': 'rozłącznik',
  'S-BEZP': 'rozłącznik bezpiecznikowy',
  'S-ODL': 'odłącznik',
};
const ROLE = ['IN', 'OUT', 'COUPLER', 'TR'] as const;

/** Rekordy, które pole rysuje w SWOJEJ kolumnie (transformator rysuje stacja). */
const POZA_KOLUMNA_POLA = new Set(['TRANSFORMER_DEVICE']);

const stacje = new Map(
  (enm.substations ?? [])
    .filter((s) => s.name !== undefined && s.name in KONSTRUKCJE)
    .map((s) => [s.ref_id, s.name as string]),
);
const polaStacji = (enm.bays ?? []).filter((b) => b.substation_ref && stacje.has(b.substation_ref));

describe('pole stacji SN rysuje każdy aparat z modelu', () => {
  it('fikstura: cztery konstrukcje × cztery funkcje pól, każde pole SN ma rekordy aparatów', () => {
    expect([...stacje.values()].sort()).toEqual(Object.keys(KONSTRUKCJE).sort());
    for (const [ref, nazwa] of stacje) {
      const role = polaStacji
        .filter((b) => b.substation_ref === ref && (b.primary_devices ?? []).length > 0)
        .map((b) => b.bay_role)
        .sort();
      expect(role, nazwa).toEqual([...ROLE].sort());
    }
  });

  for (const lod of [1, 2] as SceneLod[]) {
    it(`L${lod}: liczba glifów aparatów pola = liczba rekordów primary_devices (każda konstrukcja × funkcja)`, () => {
      const scene = buildSceneV3(enm, lod);
      let zbadane = 0;
      for (const pole of polaStacji) {
        const rekordy = (pole.primary_devices ?? []).filter((d) => !POZA_KOLUMNA_POLA.has(d.kind));
        if (rekordy.length === 0) continue;
        const opis = `${stacje.get(pole.substation_ref ?? '')} / ${pole.bay_role}`;
        const glify = scene.symbols.filter(
          (s) => s.meta?.ownerRef === pole.ref_id && s.meta?.elementKind === 'apparatus',
        );
        expect(glify.length, `${opis}: liczba glifów`).toBe(rekordy.length);
        expect(
          glify.map((s) => s.meta?.deviceRef).sort(),
          `${opis}: każdy glif to rekord aparatu modelu`,
        ).toEqual(rekordy.map((d) => d.device_ref).sort());
        zbadane += 1;
      }
      expect(zbadane).toBe(stacje.size * ROLE.length);
    });
  }

  it('konstrukcja rozłącznikowa nie rysuje przekładnika prądowego ani wyłącznika (pole RMU)', () => {
    const scene = buildSceneV3(enm, 2);
    for (const pole of polaStacji) {
      const nazwa = stacje.get(pole.substation_ref ?? '');
      if (nazwa === 'S-WYL' || !(pole.primary_devices ?? []).length) continue;
      const glify = scene.symbols.filter((s) => s.meta?.ownerRef === pole.ref_id);
      expect(glify.map((s) => s.symbolId), `${nazwa} / ${pole.bay_role}`).not.toContain('breaker');
      expect(glify.map((s) => s.symbolId), `${nazwa} / ${pole.bay_role}`).not.toContain(
        'currentTransformer',
      );
    }
  });

  it('determinizm: dwa wywołania ⇒ identyczny JSON sceny (L2)', () => {
    expect(JSON.stringify(buildSceneV3(enm, 2))).toBe(JSON.stringify(buildSceneV3(enm, 2)));
  });
});
