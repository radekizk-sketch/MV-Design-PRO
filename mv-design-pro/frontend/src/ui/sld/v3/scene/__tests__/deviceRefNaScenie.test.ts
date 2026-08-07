/**
 * KARTA S9-10 — spłata długu `S9-4-DLUG-INSPEKTOR` (rejestr konfliktów):
 * scena NIE przenosiła refu POJEDYNCZEGO aparatu (`ComposedSymbolInstance.
 * deviceRef` / `ComposedGpzSymbolInstance.deviceRef` istniały w KOMPOZYCJI,
 * ale `scene/buildScene.ts` ich nie przepisywał — pomiar rejestru:
 * `scene.symbols.some(s => 'deviceRef' in s.meta)` = false), więc dwa aparaty
 * JEDNEGO pola dzieliły `ownerRef` (= ref pola) i inspektor pokazywał dla
 * nich jedną treść (audyt P-2).
 *
 * Iloczyn cech, w którym defekt mógłby się schować (reguła KLASA pkt 2):
 * {kompozycja GPZ, kompozycja stacji} × {LOD 1, 2} × {pole z ≥ 2 aparatami
 * ścieżki danych} + NEGATYW (stos konwencji NIE fabrykuje refu).
 *
 * Wyrocznia „ref istnieje w modelu" (zero fabrykacji): każdy `deviceRef` na
 * scenie MUSI być `BayPrimaryDevice.device_ref` obecnym w migawce
 * (bays[].primary_devices lub substations[].meta.field_specs[].primary_devices).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildCanvasHitAreas } from '../../canvas/hitAreas';
import { buildSceneV3, type SceneLod } from '../buildScene';
import { buildW1MatrixFixture } from './fixtures/w1MatrixVariants';

const here = dirname(fileURLToPath(import.meta.url));

function wczytajEnm(sciezka: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(sciezka, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}

const gpzDataPathEnm = wczytajEnm(resolve(here, 'fixtures', 'gpzProtectionDataPath.enm.json'));
const substrateEnm = wczytajEnm(
  resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
);

/** Wszystkie `device_ref` obecne w MODELU — jedyne dozwolone wartości na scenie. */
function deviceRefyModelu(enm: EnergyNetworkModel): ReadonlySet<string> {
  const refy = new Set<string>();
  const zbierz = (devices: unknown): void => {
    if (!Array.isArray(devices)) return;
    for (const d of devices) {
      const ref = (d as { device_ref?: unknown }).device_ref;
      if (typeof ref === 'string' && ref) refy.add(ref);
    }
  };
  for (const bay of enm.bays ?? []) {
    zbierz((bay as { primary_devices?: unknown }).primary_devices);
  }
  for (const sub of enm.substations ?? []) {
    const specs = (sub as { meta?: { field_specs?: unknown } }).meta?.field_specs;
    if (!Array.isArray(specs)) continue;
    for (const spec of specs) {
      zbierz((spec as { primary_devices?: unknown }).primary_devices);
    }
    for (const bay of (sub as { bays?: unknown[] }).bays ?? []) {
      zbierz((bay as { primary_devices?: unknown }).primary_devices);
    }
  }
  return refy;
}

function symboleAparatow(scene: ReturnType<typeof buildSceneV3>) {
  return scene.symbols.filter((s) => s.meta?.elementKind === 'apparatus');
}

describe('S9-10 — deviceRef aparatu przechodzi z kompozycji na scenę', () => {
  it.each([1, 2] as SceneLod[])(
    'GPZ (ścieżka danych, LOD %s): aparaty niosą deviceRef; każdy ISTNIEJE w modelu; ≥2 aparaty jednego pola mają RÓŻNE refy',
    (lod) => {
      const scene = buildSceneV3(gpzDataPathEnm, lod);
      const dozwolone = deviceRefyModelu(gpzDataPathEnm);
      expect(dozwolone.size).toBeGreaterThan(0);
      // Uwaga: scena GPZ nie przenosi `apparatusSource` (metadana stacyjna) —
      // ścieżkę danych rozpoznajemy po obecności `deviceRef`, który w
      // kompozycji GPZ istnieje WYŁĄCZNIE dla ścieżki danych (F11.1).
      const zRefem = symboleAparatow(scene).filter((s) => s.meta?.deviceRef);
      expect(zRefem.length, 'aparaty ścieżki danych niosą deviceRef').toBeGreaterThan(0);
      for (const s of zRefem) {
        expect(dozwolone.has(s.meta!.deviceRef!), `deviceRef „${s.meta!.deviceRef}" istnieje w modelu`).toBe(true);
      }
      // Pole z ≥ 2 narysowanymi aparatami: refy MUSZĄ się różnić (to jest
      // dokładnie rozdzielczość, której brakowało inspektorowi).
      const wgPola = new Map<string, Set<string>>();
      for (const s of zRefem) {
        const pole = s.meta!.ownerRef!;
        const zbior = wgPola.get(pole) ?? new Set<string>();
        zbior.add(s.meta!.deviceRef!);
        wgPola.set(pole, zbior);
      }
      const poleZWieloma = [...wgPola.entries()].find(([, refy]) => refy.size >= 2);
      expect(poleZWieloma, 'istnieje pole z ≥ 2 różnymi refami aparatów').toBeTruthy();
    },
  );

  it.each([1, 2] as SceneLod[])(
    'STACJA (ścieżka danych z field_specs, LOD %s): te same niezmienniki co GPZ',
    (lod) => {
      const { enm } = buildW1MatrixFixture();
      const scene = buildSceneV3(enm, lod);
      const dozwolone = deviceRefyModelu(enm);
      expect(dozwolone.size).toBeGreaterThan(0);
      const zRefem = symboleAparatow(scene).filter((s) => s.meta?.deviceRef);
      expect(zRefem.length, 'aparaty stacji ze ścieżki danych niosą deviceRef').toBeGreaterThan(0);
      for (const s of zRefem) {
        expect(dozwolone.has(s.meta!.deviceRef!), `deviceRef „${s.meta!.deviceRef}" istnieje w modelu`).toBe(true);
      }
      const wgPola = new Map<string, Set<string>>();
      for (const s of zRefem) {
        const zbior = wgPola.get(s.meta!.ownerRef!) ?? new Set<string>();
        zbior.add(s.meta!.deviceRef!);
        wgPola.set(s.meta!.ownerRef!, zbior);
      }
      const poleZWieloma = [...wgPola.entries()].find(([, refy]) => refy.size >= 2);
      expect(poleZWieloma, 'istnieje pole stacji z ≥ 2 różnymi refami aparatów').toBeTruthy();
    },
  );

  it.each([0, 1, 2] as SceneLod[])(
    'NEGATYW (LOD %s): stos KONWENCJI (fixtura bez primary_devices) NIE fabrykuje deviceRef',
    (lod) => {
      const scene = buildSceneV3(substrateEnm, lod);
      const zRefem = scene.symbols.filter((s) => s.meta?.deviceRef !== undefined);
      expect(zRefem, 'zero zgadywanych refów urządzeń').toEqual([]);
    },
  );

  it('warstwa trafień przenosi deviceRef 1:1 ze sceny (klik → inspektor ma z czego czytać)', () => {
    const { enm } = buildW1MatrixFixture();
    const scene = buildSceneV3(enm, 2);
    const areas = buildCanvasHitAreas({
      symbols: scene.symbols,
      segments: scene.segments,
      labels: [],
      resultMarkers: [],
      scale: 1,
    });
    const wgTestId = new Map(areas.map((a) => [a.testId, a]));
    const aparatyZRefem = scene.symbols.filter((s) => s.meta?.deviceRef && s.meta?.testId);
    expect(aparatyZRefem.length).toBeGreaterThan(0);
    for (const s of aparatyZRefem) {
      const area = wgTestId.get(s.meta!.testId!);
      expect(area, `aparat ${s.meta!.testId} ma obszar trafienia`).toBeTruthy();
      expect(area!.deviceRef).toBe(s.meta!.deviceRef);
    }
  });
});
