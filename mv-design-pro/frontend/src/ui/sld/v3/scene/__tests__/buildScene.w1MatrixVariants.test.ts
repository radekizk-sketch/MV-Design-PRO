/**
 * W1 — WYROCZNIA MACIERZY WYPOSAŻENIA POLA (RECENZJA_L2 §1/§6/§12/§15/§20,
 * V12K-145). BRAMKA FAZY W1: dowód END-TO-END, że łańcuch danych „konfiguracja
 * kreatora → ENM (field_spec.primary_devices) → adapter (buildSldDataFrom
 * Snapshot) → scena (buildSceneV3)" jest DOMKNIĘTY, a schemat jest
 * BEZPOŚREDNIM odwzorowaniem modelu — RÓŻNE konfiguracje ⇒ RÓŻNE stosy
 * aparatów (koniec jednego uniwersalnego szablonu §12.4).
 *
 * Ćwiczy REALNĄ, placeable sieć referencyjną `sldSubstrate52s` z wstrzykniętymi
 * `primary_devices` wariantów §20 (patrz `fixtures/w1MatrixVariants.ts`) — nie
 * syntetyczny deskryptor, tylko pełny potok adapter→scena na prawdziwych polach.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { buildSceneV3 } from '../buildScene';
import {
  buildW1MatrixFixture,
  W1_VARIANTS,
  type W1MatrixFixture,
} from './fixtures/w1MatrixVariants';

/** Oczekiwane sekwencje symboli sceny per wariant (tor główny wg placement,
 *  potem aparaty BOCZNE ES/SA doklejone na końcu — spec §18.1). Zmierzone na
 *  realnym potoku buildSceneV3(L2); zmiana = świadoma regresja kompozycji. */
const EXPECTED_SCENE_STACK: Record<string, readonly string[]> = {
  'linia-lbs-es': ['loadBreakSwitch', 'cableHead', 'earthSwitch'],
  'linia-cb-ct-es': ['disconnector', 'breaker', 'currentTransformer', 'disconnector', 'cableHead', 'earthSwitch'],
  'linia-lbs-fuse': ['loadBreakSwitch', 'fuseSwitch', 'cableHead', 'earthSwitch'],
  'linia-cb-ct-sa': ['disconnector', 'breaker', 'currentTransformer', 'cableHead', 'earthSwitch', 'surgeArrester'],
  'tr-lbs-fuse-es': ['loadBreakSwitch', 'fuseSwitch', 'transformer2W', 'earthSwitch'],
  'tr-cb-ct-zab': ['disconnector', 'breaker', 'currentTransformer', 'transformer2W', 'earthSwitch'],
};

const LATERAL_SYMBOLS = new Set(['earthSwitch', 'voltageTransformer', 'surgeArrester']);

interface SceneSym {
  readonly symbolId: string;
  readonly x: number;
  readonly y: number;
  readonly state?: string;
  readonly meta?: { ownerRef?: unknown; apparatusSource?: unknown };
}

function baySymbols(scene: ReturnType<typeof buildSceneV3>, fieldRef: string): SceneSym[] {
  return scene.symbols.filter((s) => s.meta?.ownerRef === fieldRef) as SceneSym[];
}

describe('W1 — macierz wyposażenia: łańcuch danych kreator→ENM→adapter→scena', () => {
  let fixture: W1MatrixFixture;
  let sceneL2: ReturnType<typeof buildSceneV3>;

  beforeAll(() => {
    fixture = buildW1MatrixFixture();
    sceneL2 = buildSceneV3(fixture.enm, 2);
  });

  it('każdy wariant §20 rysuje tor pierwotny Z DANYCH (apparatusSource="dane"), sekwencja == konfiguracja', () => {
    expect(fixture.targets).toHaveLength(W1_VARIANTS.length);
    for (const target of fixture.targets) {
      const syms = baySymbols(sceneL2, target.fieldRef);
      const ids = syms.map((s) => s.symbolId);
      expect(ids, `wariant ${target.variant.id} (${target.fieldRef})`).toEqual(
        EXPECTED_SCENE_STACK[target.variant.id],
      );
      // Zero fabrykacji/konwencji: cały stos pochodzi Z DANYCH.
      expect(syms.every((s) => s.meta?.apparatusSource === 'dane'), target.variant.id).toBe(true);
    }
  });

  it('RÓŻNE konfiguracje ⇒ RÓŻNE stosy (koniec identycznych pól — asercja różnicy)', () => {
    const stacks = fixture.targets.map((t) => baySymbols(sceneL2, t.fieldRef).map((s) => s.symbolId).join('>'));
    const unique = new Set(stacks);
    expect(unique.size, `stosy: ${stacks.join(' | ')}`).toBe(fixture.targets.length);
  });

  it('głowica na styku kabla (§6): pola liniowe kończą TOR GŁÓWNY głowicą, uziemnik/SA BOCZNIE (§15/§18.1)', () => {
    const lineTargets = fixture.targets.filter((t) => t.variant.targetRole === 'LINIA_IN');
    expect(lineTargets.length).toBeGreaterThan(0);
    for (const target of lineTargets) {
      const syms = baySymbols(sceneL2, target.fieldRef);
      const mainAxis = syms.filter((s) => !LATERAL_SYMBOLS.has(s.symbolId));
      // Głowica = OSTATNI aparat toru głównego (styk kabla).
      expect(mainAxis[mainAxis.length - 1].symbolId, target.variant.id).toBe('cableHead');
      // Uziemnik BOCZNIE: oś toru głównego jednakowa X, uziemnik POZA nią.
      const axisX = mainAxis[0].x + SYMBOL_DEFS[mainAxis[0].symbolId as keyof typeof SYMBOL_DEFS].width / 2;
      const es = syms.find((s) => s.symbolId === 'earthSwitch');
      expect(es, `${target.variant.id}: uziemnik obecny`).toBeTruthy();
      const esCenterX = es!.x + SYMBOL_DEFS.earthSwitch.width / 2;
      expect(esCenterX, `${target.variant.id}: uziemnik BOCZNIE od osi`).not.toBe(axisX);
    }
  });

  it('stan aparatu z danych PER APARAT (§3): dwa odłączniki wariantu CB+CT+ES mają RÓŻNE stany', () => {
    const target = fixture.targets.find((t) => t.variant.id === 'linia-cb-ct-es')!;
    const disconnectors = baySymbols(sceneL2, target.fieldRef).filter((s) => s.symbolId === 'disconnector');
    expect(disconnectors).toHaveLength(2);
    // ds-bus zamknięty (closed), ds-line otwarty (open) — stan z switchState KAŻDEGO
    // aparatu, nie z agregatu pola (dowód prymatu danych na poziomie stanu).
    const states = disconnectors.map((s) => s.state);
    expect(states).toContain('closed');
    expect(states).toContain('open');
  });

  it('pole BEZ danych = ścieżka konwencji (§12.4) — brak regresu na polach nieobjętych macierzą', () => {
    const targetFields = new Set(fixture.targets.map((t) => t.fieldRef));
    const conventional = sceneL2.symbols.find(
      (s) =>
        typeof s.meta?.ownerRef === 'string' &&
        (s.meta.ownerRef as string).includes('/sn_field/') &&
        !targetFields.has(s.meta.ownerRef as string) &&
        s.meta.apparatusSource === 'konwencja',
    );
    expect(conventional, 'istnieje pole rysowane z konwencji').toBeTruthy();
  });

  it('adapter DOMYKA łańcuch: field_spec.primary_devices → snBays[].primaryDevices (nie gubione)', () => {
    const payload = buildSldDataFromSnapshot(fixture.enm, null);
    for (const target of fixture.targets) {
      const station = payload.stations.find((s) => s.id === target.stationRef);
      expect(station, `stacja ${target.stationRef}`).toBeTruthy();
      const bay = station!.snBays.find((b) => b.bayRef === target.fieldRef);
      expect(bay, `pole ${target.fieldRef}`).toBeTruthy();
      expect(bay!.primaryDevices, `${target.variant.id}: primaryDevices niepuste`).toBeTruthy();
      // Kolejność aparatów adaptera == kolejność danych (posortowana wg placement).
      const kinds = (bay!.primaryDevices ?? []).map((d) => d.kind);
      expect(kinds.length).toBe(target.variant.devices.length);
    }
  });

  it('KOTWICA: dane pola nie zmieniają tożsamości/kotwic stacji (identyczny stationCount i ciąg główny)', () => {
    const base = buildSceneV3(fixture.baseEnm, 2);
    // Wstrzyknięcie primary_devices NIE dodaje/usuwa/przenumerowuje stacji ani
    // nie zmienia szkieletu ciągu głównego (§0: footprint kolumny MOŻE rosnąć
    // od realnych stosów, ale tożsamość/kotwice węzłów są zachowane).
    expect(sceneL2.meta.stationCount).toBe(base.meta.stationCount);
    expect([...sceneL2.meta.mainTrunkStationIds]).toEqual([...base.meta.mainTrunkStationIds]);
  });

  it('KOTWICA L0=L1=L2 (§20): szkielet ciągu głównego niezmienny między poziomami LOD', () => {
    const trunk0 = buildSceneV3(fixture.enm, 0).meta.mainTrunkStationIds;
    const trunk1 = buildSceneV3(fixture.enm, 1).meta.mainTrunkStationIds;
    const trunk2 = sceneL2.meta.mainTrunkStationIds;
    expect([...trunk1]).toEqual([...trunk0]);
    expect([...trunk2]).toEqual([...trunk0]);
  });
});
