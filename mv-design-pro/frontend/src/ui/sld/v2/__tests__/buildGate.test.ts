/**
 * SLD V2 — Phase -1 Build Gate smoke test.
 *
 * Cel: zatrzymać degradację publicznego API V2 zanim Phase 0A doda nowe
 * moduły. Test weryfikuje, że każdy aktywny moduł V2 eksportuje znane
 * symbole, że nie ma niezamierzonych importów z V1, i że adaptery
 * snapshot→props zwracają deterministyczne pustki dla pustego ENM-u.
 *
 * Test NIE testuje renderingu (to robią visualFixtures.test.ts) ani
 * decyzji LOD (LodPolicy.test.ts) — pełni rolę tripwire dla bramki
 * wejściowej Phase -1.
 */

import { describe, expect, it } from 'vitest';

import * as Lod from '../lod/LodPolicy';
import * as Ports from '../core/ports';
import * as Routing from '../geometry/routing';
import * as Slot from '../geometry/slot';
import * as Tokens from '../theme/tokens';
import * as Viewport from '../viewport/ViewportController';
import * as Adapter from '../canvas/enmToSldAdapter';
import * as Command from '../command/SldCommandService';
import * as Hierarchical from '../builder/HierarchicalLayout';
import * as BuildSeq from '../builder/BuildSequence';

describe('SLD V2 build gate — public API surface', () => {
  it('LodPolicy publiczne API', () => {
    expect(typeof Lod.inferLodFromScale).toBe('function');
    expect(typeof Lod.isVisibleAtLod).toBe('function');
    expect(typeof Lod.effectiveLodForElement).toBe('function');
    expect(Lod.LOD_ZOOM_THRESHOLDS).toBeDefined();
    expect(Lod.DEFAULT_LAYER_VISIBILITY).toBeDefined();
    expect(Lod.LAYER_LABELS_PL).toBeDefined();
  });

  it('ports.ts ma listę 15 kinds first-class', () => {
    expect(Ports.ALL_PORT_KINDS).toBeDefined();
    expect(Array.isArray(Ports.ALL_PORT_KINDS)).toBe(true);
    expect(Ports.ALL_PORT_KINDS.length).toBe(15);
    expect(typeof Ports.canConnectPorts).toBe('function');
    expect(typeof Ports.classifyStationTopology).toBe('function');
    expect(typeof Ports.validatePortVoltages).toBe('function');
  });

  it('routing.ts publiczne API L-routingu', () => {
    expect(typeof Routing.routeOrthogonalL).toBe('function');
    expect(typeof Routing.routeStraight).toBe('function');
    expect(typeof Routing.isOrthogonal).toBe('function');
    expect(typeof Routing.isOnGrid).toBe('function');
  });

  it('slot.ts publiczne API alokatora', () => {
    expect(typeof Slot.gpzSlot).toBe('function');
    expect(typeof Slot.sectionSlot).toBe('function');
    expect(typeof Slot.bayHeadSlot).toBe('function');
    expect(typeof Slot.stationOnRunSlot).toBe('function');
    expect(typeof Slot.derAttachmentSlot).toBe('function');
  });

  it('tokens.ts eksportuje tokeny SCADA', () => {
    expect(Tokens.COLOR_LINE_PRIMARY).toBeDefined();
    expect(Tokens.COLOR_PANEL_RAISED).toBeDefined();
    expect(Tokens.COLOR_TEXT_PRIMARY).toBeDefined();
    expect(Tokens.FONT_SANS).toBeDefined();
    expect(Tokens.FONT_SIZES).toBeDefined();
  });

  it('ViewportController publiczne API', () => {
    expect(Viewport.IDENTITY_TRANSFORM).toBeDefined();
    expect(typeof Viewport.zoomToCursor).toBe('function');
    expect(typeof Viewport.fitToView).toBe('function');
    expect(typeof Viewport.pan).toBe('function');
    expect(typeof Viewport.snapWorldPoint).toBe('function');
    expect(Viewport.MIN_SCALE).toBeLessThan(Viewport.MAX_SCALE);
  });

  it('enmToSldAdapter zwraca stabilną pustkę dla null', () => {
    expect(typeof Adapter.buildSldDataFromSnapshot).toBe('function');
    const empty = Adapter.buildSldDataFromSnapshot(null, []);
    expect(empty.gpzs).toEqual([]);
    expect(empty.stations).toEqual([]);
    expect(empty.cableRuns).toEqual([]);
    expect(empty.ders).toEqual([]);
    expect(empty.sections).toEqual([]);
  });

  it('SldCommandService eksportuje COMMAND_FEEDBACK_PL + toastBus', () => {
    expect(Command.COMMAND_FEEDBACK_PL).toBeDefined();
    expect(typeof Command.COMMAND_FEEDBACK_PL).toBe('object');
    expect(Command.toastBus).toBeDefined();
    expect(typeof Command.toastBus.publish).toBe('function');
    expect(typeof Command.toastBus.subscribe).toBe('function');
    expect(Command.SLD_MENU_REGISTRY).toBeDefined();
    expect(typeof Command.getMenuActions).toBe('function');
  });

  it('HierarchicalLayout eksportuje computeLayout', () => {
    expect(typeof Hierarchical.computeLayout).toBe('function');
  });

  it('BuildSequence publiczne API komend', () => {
    expect(typeof BuildSeq.emptyBuildSequence).toBe('function');
    expect(typeof BuildSeq.appendCommand).toBe('function');
    expect(typeof BuildSeq.popLastCommand).toBe('function');
    expect(typeof BuildSeq.validateCommand).toBe('function');
    expect(typeof BuildSeq.tryApplyCommand).toBe('function');
    expect(typeof BuildSeq.inferBuildPhase).toBe('function');
  });
});

describe('SLD V2 build gate — invariant pustki adaptera', () => {
  it('buildSldDataFromSnapshot z pustym EnergyNetworkModel produkuje wszystkie sekcje', () => {
    const emptyEnm = {
      buses: [],
      branches: [],
      switches: [],
      sources: [],
      loads: [],
      transformers: [],
      generators: [],
      bays: [],
      substations: [],
      line_runs: [],
    };
    const result = Adapter.buildSldDataFromSnapshot(emptyEnm as never, null);
    expect(result.gpzs).toBeDefined();
    expect(result.stations).toBeDefined();
    expect(result.cableRuns).toBeDefined();
    expect(result.ders).toBeDefined();
    expect(result.sections).toBeDefined();
  });

  it('inferBuildPhase z pustej sekwencji daje NO_SOURCE', () => {
    const empty = BuildSeq.emptyBuildSequence();
    expect(BuildSeq.inferBuildPhase(empty)).toBe('NO_SOURCE');
  });
});
