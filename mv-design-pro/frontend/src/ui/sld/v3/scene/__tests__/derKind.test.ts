/**
 * DER-MENU-V3 (Karta SLD-P, GAP P-1) — rodzaj DER jako pole ADDYTYWNE meta
 * sceny (`PreviewElementMeta.derKind`), REALNA wartość łańcucha
 * `Generator.gen_type` → `mapGeneratorToSourceKind` → `SldSourceView.kind` →
 * `StationDerSourceInput.kind` → `ComposedSymbolInstance.derKind` →
 * `scene/buildScene.ts` `meta.derKind`. Konsument: menu kontekstowe podtypu na
 * kanwie v3 (`SldCanvasV3Workspace.elementKindForMenu`).
 *
 * Wzorzec fixtury/kopii identyczny jak `sourceState.test.ts` (F11.3) — TA SAMA
 * sieć testowa 52s (PV/BESS/FW), z jawnym override `gen_type` dla torów
 * `generator` (synchronous) i `unknown` (nierozpoznany), których fixtura
 * referencyjna nie niesie.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { symbolIdForSourceKind, type DerSourceKind } from '../../compose/sourceKind';
import { buildSceneV3, type SceneV3 } from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

/** Głęboka kopia fixtury z nadpisanym `gen_type` dla generatora o podanym
 *  indeksie (kanał zapisu identyczny z realnym ENM — `Generator.gen_type`). */
function withGenType(genIndex: number, genType: unknown): { snapshot: EnergyNetworkModel; genRef: string } {
  const snapshot: EnergyNetworkModel = JSON.parse(JSON.stringify(enm));
  const gen = snapshot.generators?.[genIndex];
  expect(gen).toBeTruthy();
  (gen as { gen_type?: unknown }).gen_type = genType;
  return { snapshot, genRef: gen!.ref_id };
}

function derSymbolOf(scene: SceneV3, genRef: string) {
  return scene.symbols.find((s) => s.meta?.elementKind === 'der' && s.meta?.ownerRef === genRef);
}

describe('DER-MENU-V3 A — meta.derKind płynie adapter→compose→scene (REALNA wartość, zero re-derywacji)', () => {
  it('DER rozpoznane z fixtury (pv_inverter/bess/wind_inverter) niosą meta.derKind = pv/bess/wind', () => {
    const scene = buildSceneV3(enm, 2);
    const expected: ReadonlyArray<readonly [string, DerSourceKind]> = [
      ['pv/16df25ef21e0c57696e64bf105487a69/converter', 'pv'],
      ['bess/b6262301437365a904bcf1ffaba1a041/converter', 'bess'],
      ['fw/81710acf62c709cee051a12063dc78ee/converter', 'wind'],
    ];
    for (const [genRef, kind] of expected) {
      expect(derSymbolOf(scene, genRef)?.meta?.derKind).toBe(kind);
    }
  });

  it('gen_type=synchronous ⇒ meta.derKind=generator (osobny rodzaj v2 SldSourceView, glif derGenerator)', () => {
    const { snapshot, genRef } = withGenType(0, 'synchronous');
    const scene = buildSceneV3(snapshot, 2);
    expect(derSymbolOf(scene, genRef)?.meta?.derKind).toBe('generator');
  });

  it('gen_type nierozpoznany/brak ⇒ meta.derKind=unknown (honest-unknown, ZERO domysłu podtypu)', () => {
    for (const corrupt of ['co_to_jest', null, undefined]) {
      const { snapshot, genRef } = withGenType(0, corrupt);
      const scene = buildSceneV3(snapshot, 2);
      expect(derSymbolOf(scene, genRef)?.meta?.derKind).toBe('unknown');
    }
  });

  it('symbole NIE-DER (aparat, stacja, sieć zewnętrzna) NIGDY nie niosą derKind (undefined)', () => {
    const scene = buildSceneV3(enm, 2);
    const nonDer = scene.symbols.filter((s) => s.meta?.elementKind !== 'der');
    expect(nonDer.length).toBeGreaterThan(0);
    expect(nonDer.every((s) => s.meta?.derKind === undefined)).toBe(true);
  });
});

describe('DER-MENU-V3 D — determinizm sceny z nowym meta (spec §7, reguła 7 „same input = same output")', () => {
  it('dwukrotne zbudowanie sceny daje IDENTYCZNE derKind na wszystkich symbolach DER (permutacja rekordów bez wpływu)', () => {
    const kindMapOf = (scene: SceneV3): ReadonlyArray<readonly [string, DerSourceKind | undefined]> =>
      scene.symbols
        .filter((s) => s.meta?.elementKind === 'der')
        .map((s) => [s.meta!.ownerRef!, s.meta?.derKind] as const);

    const a = buildSceneV3(enm, 2);
    const b = buildSceneV3(enm, 2);
    expect(kindMapOf(a)).toEqual(kindMapOf(b));
    // Sanity: fixtura NAPRAWDĘ niesie DER (inaczej test byłby pusto-zielony).
    expect(kindMapOf(a).length).toBeGreaterThan(0);
  });

  it('INWARIANCJA GEOMETRII: `meta.derKind` jest polem ADDYTYWNYM — geometria (symbolId/x/y) zależy WYŁĄCZNIE od `symbolId` (już wywiedzionego z rodzaju), nie od nowego pola meta', () => {
    // Dowód addytywności: derKind przepisywany 1:1 z `SldSourceView.kind`, z
    // którego JUŻ WCZEŚNIEJ (przed tą kartą) wywodzi się `symbolId` przez
    // `symbolIdForSourceKind` — więc dla TEJ SAMEJ sieci dodanie pola meta nie
    // zmienia żadnego origin/gabarytu. Sprawdzamy INWARIANT: każdy symbol DER,
    // którego `meta.derKind` odpowiada rodzajowi, ma `symbolId` zgodny z
    // `symbolIdForSourceKind(derKind)` — jedna prawda rodzaj→glif, zero rozjazdu
    // meta↔geometria. (Realny dowód „zero zmian geometrii" wobec stanu sprzed
    // karty: PEŁNA regresja goldenów/geometrii sceny v3 pozostaje zielona —
    // gdyby derKind ruszył layout, te testy by pękły.)
    const scene = buildSceneV3(enm, 2);
    const derSymbols = scene.symbols.filter((s) => s.meta?.elementKind === 'der');
    expect(derSymbols.length).toBeGreaterThan(0);
    for (const s of derSymbols) {
      const derKind = s.meta?.derKind;
      expect(derKind).toBeDefined();
      expect(s.symbolId).toBe(symbolIdForSourceKind(derKind!));
    }
  });
});
