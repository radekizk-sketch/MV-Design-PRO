/**
 * F11.3 (SLD_CAD_SPEC_V3 §13.3, finał F9.6b) — stan operacyjny źródła jako
 * NAKŁADKA (kolor + `data-source-state`), czytany z REALNEGO kanału
 * `Generator.meta['operating_mode']` (operacja domenowa
 * `set_source_operating_mode`) przez UDOKUMENTOWANĄ regułę
 * `OPERATING_MODE_TO_SOURCE_STATE` (`v2/canvas/enmToSldAdapter.ts`).
 *
 * Wyrocznia: `sourceStateGaps`/`allSourceStatesLegal` (`scene/buildScene.ts`)
 * — trzy człony §13.3 `source_state_probe` (determinizm mapowania / 0 stanów
 * bez reguły / nakładka nie zmienia bboxu) + zakaz cichego gubienia stanu.
 * Testy negatywne (wyrocznia MUSI gryźć) — sekcja C.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import {
  SOURCE_STATE_LABEL_PL,
  SOURCE_STATE_OVERLAY_COLOR,
  isSourceOperationalState,
  type SourceOperationalState,
} from '../../compose/sourceKind';
import { allSourceStatesLegal, buildSceneV3, sourceStateGaps, type SceneV3 } from '../buildScene';

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

/** Głęboka kopia fixtury z wpisanym `operating_mode` dla generatora o
 *  podanym indeksie (kanał zapisu identyczny z operacją domenową
 *  `set_source_operating_mode` — `Generator.meta['operating_mode']`). */
function withOperatingMode(genIndex: number, mode: unknown): { snapshot: EnergyNetworkModel; genRef: string } {
  const snapshot: EnergyNetworkModel = JSON.parse(JSON.stringify(enm));
  const gen = snapshot.generators?.[genIndex];
  expect(gen).toBeTruthy();
  gen!.meta = { ...gen!.meta, operating_mode: mode };
  return { snapshot, genRef: gen!.ref_id };
}

function derSymbolOf(scene: SceneV3, genRef: string) {
  return scene.symbols.find((s) => s.meta?.elementKind === 'der' && s.meta?.ownerRef === genRef);
}

describe('F11.3 A — adapter: Generator.meta.operating_mode → SldSourceView.operationalState (reguła udokumentowana, §13.3)', () => {
  it('praca_sieciowa/ladowanie/rozladowanie ⇒ energized; gotowosc ⇒ standby; odstawione ⇒ disconnected', () => {
    const expected: ReadonlyArray<readonly [string, SourceOperationalState]> = [
      ['praca_sieciowa', 'energized'],
      ['ladowanie', 'energized'],
      ['rozladowanie', 'energized'],
      ['gotowosc', 'standby'],
      ['odstawione', 'disconnected'],
    ];
    for (const [mode, state] of expected) {
      const { snapshot, genRef } = withOperatingMode(0, mode);
      const sources = buildSldDataFromSnapshot(snapshot, null).sources ?? [];
      expect(sources.find((s) => s.id === genRef)?.operationalState).toBe(state);
    }
  });

  it('brak operating_mode ⇒ undefined (uczciwy brak — ZERO nakładki, zero domysłu); fixtura referencyjna nie niesie trybu dla żadnego DER', () => {
    const sources = buildSldDataFromSnapshot(enm, null).sources ?? [];
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.operationalState === undefined)).toBe(true);
  });

  it('wartość spoza słownika / nie-string NIE przecieka (ta sama semantyka co backendowy _generator_operating_mode)', () => {
    for (const corrupt of ['AWARIA?!', 42, null, { tryb: 'praca' }]) {
      const { snapshot, genRef } = withOperatingMode(0, corrupt);
      const sources = buildSldDataFromSnapshot(snapshot, null).sources ?? [];
      expect(sources.find((s) => s.id === genRef)?.operationalState).toBeUndefined();
    }
  });
});

describe('F11.3 B — scena: stan płynie adapter→compose→symbol, nakładka nie zmienia geometrii (§13.3)', () => {
  it('DER z operating_mode=odstawione niesie meta.operationalState=disconnected na L1/L2; wyrocznia zielona', () => {
    const { snapshot, genRef } = withOperatingMode(0, 'odstawione');
    for (const lod of [1, 2] as const) {
      const scene = buildSceneV3(snapshot, lod);
      expect(derSymbolOf(scene, genRef)?.meta?.operationalState).toBe('disconnected');
      expect(sourceStateGaps(scene)).toEqual([]);
      expect(allSourceStatesLegal(scene)).toBe(true);
    }
  });

  it('DER bez operating_mode NIE niesie stanu (undefined, nie fabrykowany default)', () => {
    const scene = buildSceneV3(enm, 2);
    const derSymbols = scene.symbols.filter((s) => s.meta?.elementKind === 'der');
    expect(derSymbols.length).toBeGreaterThan(0);
    expect(derSymbols.every((s) => s.meta?.operationalState === undefined)).toBe(true);
    expect(allSourceStatesLegal(scene)).toBe(true);
  });

  it('INWARIANCJA GEOMETRII (§13.3 „nakładka nie zmienia bboxu"): scena z i bez operating_mode ma IDENTYCZNE symbolId/x/y wszystkich symboli', () => {
    const { snapshot } = withOperatingMode(0, 'praca_sieciowa');
    const bare = buildSceneV3(enm, 2);
    const overlaid = buildSceneV3(snapshot, 2);
    const geometryOf = (scene: SceneV3) => scene.symbols.map((s) => ({ id: s.symbolId, x: s.x, y: s.y }));
    expect(geometryOf(overlaid)).toEqual(geometryOf(bare));
  });

  it('sieć zewnętrzna (Source, gridSource) NIGDY nie niesie stanu — ENM nie modeluje trybu pracy Source', () => {
    const { snapshot } = withOperatingMode(0, 'praca_sieciowa');
    const scene = buildSceneV3(snapshot, 2);
    const gridSymbols = scene.symbols.filter((s) => s.meta?.elementKind === 'source');
    expect(gridSymbols.length).toBeGreaterThan(0);
    expect(gridSymbols.every((s) => s.meta?.operationalState === undefined)).toBe(true);
  });
});

describe('F11.3 C — testy negatywne (wyrocznia MUSI gryźć)', () => {
  it('stan spoza słownika na symbolu ⇒ luka stan-poza-slownikiem', () => {
    const scene = buildSceneV3(enm, 2);
    const der = scene.symbols.find((s) => s.meta?.elementKind === 'der');
    expect(der).toBeTruthy();
    const corrupted: SceneV3 = {
      ...scene,
      symbols: scene.symbols.map((s) =>
        s === der
          ? { ...s, meta: { ...s.meta, operationalState: 'AWARIA?!' as never } }
          : s,
      ),
    };
    const gaps = sourceStateGaps(corrupted);
    expect(gaps.some((g) => g.reason === 'stan-poza-slownikiem' && g.state === 'AWARIA?!')).toBe(true);
    expect(allSourceStatesLegal(corrupted)).toBe(false);
  });

  it('stan na elemencie NIE-źródłowym (aparat) ⇒ luka stan-na-elemencie-nie-zrodlowym', () => {
    const scene = buildSceneV3(enm, 2);
    const apparatus = scene.symbols.find((s) => s.meta?.elementKind === 'apparatus');
    expect(apparatus).toBeTruthy();
    const corrupted: SceneV3 = {
      ...scene,
      symbols: scene.symbols.map((s) =>
        s === apparatus
          ? { ...s, meta: { ...s.meta, operationalState: 'energized' as const } }
          : s,
      ),
    };
    const gaps = sourceStateGaps(corrupted);
    expect(gaps.some((g) => g.reason === 'stan-na-elemencie-nie-zrodlowym')).toBe(true);
    expect(allSourceStatesLegal(corrupted)).toBe(false);
  });

  it('stan obecny w danych adaptera, ale zgubiony na symbolu ⇒ luka stan-zgubiony-na-scenie (zakaz cichego gubienia)', () => {
    const { snapshot, genRef } = withOperatingMode(0, 'gotowosc');
    const scene = buildSceneV3(snapshot, 2);
    // Symulacja regresji przepływu compose→scene: symbol istnieje, stan znika.
    const corrupted: SceneV3 = {
      ...scene,
      symbols: scene.symbols.map((s) =>
        s.meta?.ownerRef === genRef && s.meta?.elementKind === 'der'
          ? { ...s, meta: { ...s.meta, operationalState: undefined } }
          : s,
      ),
    };
    const gaps = sourceStateGaps(corrupted);
    expect(gaps.some((g) => g.reason === 'stan-zgubiony-na-scenie' && g.ref === genRef)).toBe(true);
    expect(allSourceStatesLegal(corrupted)).toBe(false);
  });
});

describe('F11.3 D — słownik nakładki (jedna prawda kolor/etykieta, determinizm z konstrukcji)', () => {
  it('każdy z pięciu stanów §13.3 ma kolor i polską etykietę; strażnik isSourceOperationalState zgodny ze słownikiem', () => {
    const states: readonly SourceOperationalState[] = [
      'energized',
      'standby',
      'disconnected',
      'maintenance',
      'fault',
    ];
    for (const s of states) {
      expect(SOURCE_STATE_OVERLAY_COLOR[s]).toMatch(/^#[0-9A-F]{6}$/i);
      expect(SOURCE_STATE_LABEL_PL[s].length).toBeGreaterThan(0);
      expect(isSourceOperationalState(s)).toBe(true);
    }
    expect(isSourceOperationalState('AWARIA?!')).toBe(false);
    expect(isSourceOperationalState(42)).toBe(false);
    expect(isSourceOperationalState(undefined)).toBe(false);
    // Kolory rozróżnialne parami (nakładka bez tekstu — kolor MUSI nieść stan).
    expect(new Set(Object.values(SOURCE_STATE_OVERLAY_COLOR)).size).toBe(states.length);
  });

  it('spójność z nakładką energizacji: energized=#2ECC71, disconnected=#5B6B76 (te same semantyki, te same kolory)', () => {
    expect(SOURCE_STATE_OVERLAY_COLOR.energized).toBe('#2ECC71');
    expect(SOURCE_STATE_OVERLAY_COLOR.disconnected).toBe('#5B6B76');
  });
});
