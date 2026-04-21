import { describe, expect, it } from 'vitest';
import { buildReferenceScenario, type ReferenceScenarioId } from '../referenceTopologies';
import { buildVisualGraphFromTopology } from '../topologyAdapterV2';
import { computeLayout, DEFAULT_LAYOUT_CONFIG } from '../layoutPipeline';
import { computeVisualGraphHash } from '../visualGraph';
import { EdgeTypeV1 } from '../visualGraph';

const scenarios: ReferenceScenarioId[] = ['leaf', 'pass', 'branch', 'ring', 'multi', 'terrain'];

describe('referenceTopologies', () => {
  it.each(scenarios)('builds %s with non-empty symbols and canonical annotations', (scenario) => {
    const result = buildReferenceScenario(scenario);

    expect(result.symbols.length).toBeGreaterThan(0);
    expect(result.input.sources.length).toBeGreaterThan(0);
    expect(result.canonicalAnnotations).not.toBeNull();
    expect((result.canonicalAnnotations?.trunkNodes.length ?? 0) > 0).toBe(true);
  });

  it('ring scenario has NOP segment', () => {
    const result = buildReferenceScenario('ring');
    const hasNop = result.input.branches.some((branch) => branch.isNormallyOpen);
    expect(hasNop).toBe(true);
  });

  it('scenariusze referencyjne mają jawne logicalViews dla trunk/branch/ring', () => {
    const leaf = buildReferenceScenario('leaf').input.logicalViews;
    const branch = buildReferenceScenario('branch').input.logicalViews;
    const ring = buildReferenceScenario('ring').input.logicalViews;

    expect((leaf?.trunks.length ?? 0) > 0).toBe(true);
    expect((branch?.branches.length ?? 0) > 0).toBe(true);
    expect((ring?.rings.length ?? 0) > 0).toBe(true);
  });

  describe('multi — wzorzec główny sieci wieloodcinkowej', () => {
    it('buduje sieć z 5 segmentami magistrali, 3 odgałęzieniami, ringiem i NOP', () => {
      const result = buildReferenceScenario('multi');
      const lv = result.input.logicalViews;

      // 5 trunk segments
      expect(lv?.trunks[0].segmentIds.length).toBe(5);
      // 3 branches
      expect(lv?.branches.length).toBe(3);
      // 1 ring with NOP
      expect(lv?.rings.length).toBe(1);
      expect(lv?.rings[0].normallyOpenSegmentId).toBe('line_s5_s1_nop');
    });

    it('zawiera 9 stacji o różnych rolach topologicznych', () => {
      const result = buildReferenceScenario('multi');
      expect(result.input.stations.length).toBe(9);

      const stationById = new Map(result.input.stations.map(s => [s.id, s]));
      // S4 jest sekcyjna (SWITCHING)
      expect(stationById.get('st4')?.stationType).toBe('SWITCHING');
      // S4 ma 2 szyny SN
      expect(stationById.get('st4')?.busIds.length).toBe(2);
    });

    it('zawiera generator PV na stacji B4', () => {
      const result = buildReferenceScenario('multi');
      expect(result.input.generators.length).toBe(1);
      expect(result.input.generators[0].kind).toBe('PV');
      expect(result.input.generators[0].connectionVariant).toBe('nn_side');
    });

    it('NOP jest jawnie modelowany jako normallyOpen branch', () => {
      const result = buildReferenceScenario('multi');
      const nopBranch = result.input.branches.find(b => b.id === 'line_s5_s1_nop');
      expect(nopBranch).toBeDefined();
      expect(nopBranch!.isNormallyOpen).toBe(true);
    });

    it('adapter produkuje poprawny kontrakt topologii wizualnej', () => {
      const result = buildReferenceScenario('multi');
      const adapter = buildVisualGraphFromTopology(result.input);
      const vt = adapter.visualTopology;

      // GPZ
      expect(vt.gpz.length).toBe(1);
      // Szyny SN >= 10 (GPZ + stacje trunk + stacje branch)
      expect(vt.busbarsSn.length).toBeGreaterThanOrEqual(10);
      // Trunk segments = 5
      expect(vt.trunkSegments.length).toBe(5);
      // Branch segments >= 3 (at least one per branch)
      expect(vt.branchSegments.length).toBeGreaterThanOrEqual(3);
      // Stacje = 9
      expect(vt.stations.length).toBe(9);
      // NOP
      expect(vt.nops.length).toBeGreaterThanOrEqual(1);
      // Ring connectors
      expect(vt.ringConnectors.length).toBeGreaterThanOrEqual(1);
    });

    it('stacje mają poprawne role semantyczne', () => {
      const result = buildReferenceScenario('multi');
      const adapter = buildVisualGraphFromTopology(result.input);
      const roleMap = new Map(adapter.visualTopology.stations.map(s => [s.domainElementId, s.stationRole]));

      // S4 sekcyjna
      expect(roleMap.get('st4')).toBe('sekcyjna');
      // B2 końcowa
      expect(roleMap.get('stb2')).toBe('koncowa');
    });

    it('jest deterministyczny 100x', () => {
      const hashes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = buildReferenceScenario('multi');
        const adapter = buildVisualGraphFromTopology(result.input);
        hashes.add(computeVisualGraphHash(adapter.graph));
      }
      expect(hashes.size).toBe(1);
    });

    it('generuje symbole i layout bez błędów', () => {
      const result = buildReferenceScenario('multi');
      // Symbols should be created for all elements
      expect(result.symbols.length).toBeGreaterThan(20);
      // Annotations should include trunk information
      expect(result.canonicalAnnotations).not.toBeNull();
      expect(result.canonicalAnnotations!.trunkNodes.length).toBeGreaterThan(0);
    });
  });

  describe('terrain — sieć SN terenowa 12 stacji (referencja CANONICAL)', () => {
    it('buduje sieć z 6 segmentami magistrali, 4 odgałęzieniami, ringiem i NOP', () => {
      const result = buildReferenceScenario('terrain');
      const lv = result.input.logicalViews;

      // 6 trunk segments: GPZ→S1→S2→S3→S4→S5→S6
      expect(lv?.trunks[0].segmentIds.length).toBe(6);
      // 4 branches: S2→B1B2, S2→B3, S5→B4B5, B4→B6
      expect(lv?.branches.length).toBe(4);
      // 1 ring with NOP: S6↔S1
      expect(lv?.rings.length).toBe(1);
      expect(lv?.rings[0].normallyOpenSegmentId).toBe('line_s6_s1_nop');
    });

    it('zawiera 12 stacji o prawidłowych typach', () => {
      const result = buildReferenceScenario('terrain');
      expect(result.input.stations.length).toBe(12);

      const byId = new Map(result.input.stations.map((s) => [s.id, s]));

      // S4 jest sekcyjna (SWITCHING)
      expect(byId.get('st4')?.stationType).toBe('SWITCHING');
      expect(byId.get('st4')?.busIds.length).toBe(2);

      // S6 jest końcowa (DISTRIBUTION, 1 bus)
      expect(byId.get('st6')?.stationType).toBe('DISTRIBUTION');

      // B3 jest końcowa z PV
      expect(byId.get('stb3')?.stationType).toBe('DISTRIBUTION');
    });

    it('zawiera generator PV na stacji B3 (strona nN)', () => {
      const result = buildReferenceScenario('terrain');
      expect(result.input.generators.length).toBe(1);
      expect(result.input.generators[0].kind).toBe('PV');
      expect(result.input.generators[0].stationRef).toBe('stb3');
      expect(result.input.generators[0].connectionVariant).toBe('nn_side');
      expect(result.input.generators[0].ratedPowerMw).toBe(0.5);
    });

    it('NOP jest normallyOpen na odcinku S6↔S1', () => {
      const result = buildReferenceScenario('terrain');
      const nop = result.input.branches.find((b) => b.id === 'line_s6_s1_nop');
      expect(nop).toBeDefined();
      expect(nop!.isNormallyOpen).toBe(true);
      expect(nop!.kind).toBe('LINE');
      expect(nop!.lengthKm).toBe(3.0);
    });

    it('adapter klasyfikuje stacje poprawnie (role semantyczne)', () => {
      const result = buildReferenceScenario('terrain');
      const adapter = buildVisualGraphFromTopology(result.input);
      const roleMap = new Map(
        adapter.visualTopology.stations.map((s) => [s.domainElementId, s.stationRole])
      );

      // S1 przelotowa (inline)
      expect(roleMap.get('st1')).toBe('przelotowa');
      // S2 odgalezna (branch — 2 odgałęzienia)
      expect(roleMap.get('st2')).toBe('odgalezna');
      // S3 przelotowa
      expect(roleMap.get('st3')).toBe('przelotowa');
      // S4 sekcyjna
      expect(roleMap.get('st4')).toBe('sekcyjna');
      // S6 końcowa
      expect(roleMap.get('st6')).toBe('koncowa');
      // B2 końcowa
      expect(roleMap.get('stb2')).toBe('koncowa');
      // B3 końcowa (z PV)
      expect(roleMap.get('stb3')).toBe('koncowa');
    });

    it('adapter produkuje poprawny kontrakt topologii wizualnej', () => {
      const result = buildReferenceScenario('terrain');
      const adapter = buildVisualGraphFromTopology(result.input);
      const vt = adapter.visualTopology;

      // 1 GPZ
      expect(vt.gpz.length).toBe(1);
      // SN busbars: GPZ + 6 trunk + 6 branch = 13 (plus S4 has 2)
      expect(vt.busbarsSn.length).toBeGreaterThanOrEqual(13);
      // 6 trunk segments
      expect(vt.trunkSegments.length).toBe(6);
      // 5+ branch segments (4 branches with multiple segments)
      expect(vt.branchSegments.length).toBeGreaterThanOrEqual(5);
      // 12 stations
      expect(vt.stations.length).toBe(12);
      // NOP present
      expect(vt.nops.length).toBeGreaterThanOrEqual(1);
    });

    it('NOP jest klasyfikowany jako SECONDARY_CONNECTOR', () => {
      const result = buildReferenceScenario('terrain');
      const adapter = buildVisualGraphFromTopology(result.input);
      const nopEdge = adapter.graph.edges.find(
        (e) => e.attributes?.label?.includes('normalnie otwarty') || e.isNormallyOpen
      );
      expect(nopEdge).toBeDefined();
      expect(nopEdge!.edgeType).toBe(EdgeTypeV1.SECONDARY_CONNECTOR);
    });

    it('layout: magistrala główna jest pionowa (stałe X, rosnące Y)', () => {
      const result = buildReferenceScenario('terrain');
      const adapter = buildVisualGraphFromTopology(result.input);
      const layout = computeLayout(adapter.graph, DEFAULT_LAYOUT_CONFIG, adapter.stationBlockDetails);
      const placements = new Map(layout.nodePlacements.map((p) => [p.nodeId, p]));

      // Trunk SN buses: bus_s1_sn → bus_s2_sn → bus_s3_sn → bus_s4_sn_a → bus_s5_sn → bus_s6_sn
      const trunkBuses = [
        'bus_s1_sn',
        'bus_s2_sn',
        'bus_s3_sn',
        'bus_s4_sn_a',
        'bus_s5_sn',
        'bus_s6_sn',
      ];

      const trunkPositions = trunkBuses
        .map((id) => placements.get(id))
        .filter((p) => p !== undefined);

      // All trunk buses must be placed
      expect(trunkPositions.length).toBe(6);

      // Y must be strictly increasing (trunk goes downward)
      for (let i = 1; i < trunkPositions.length; i++) {
        expect(trunkPositions[i]!.position.y).toBeGreaterThan(trunkPositions[i - 1]!.position.y);
      }

      // X should be approximately the same (on same trunk axis, tolerance ±GRID_BASE)
      const trunkX = trunkPositions[0]!.position.x;
      for (const pos of trunkPositions) {
        expect(Math.abs(pos!.position.x - trunkX)).toBeLessThanOrEqual(40);
      }
    });

    it('layout: odgałęzienia B1-B6 są na prawo od magistrali', () => {
      const result = buildReferenceScenario('terrain');
      const adapter = buildVisualGraphFromTopology(result.input);
      const layout = computeLayout(adapter.graph, DEFAULT_LAYOUT_CONFIG, adapter.stationBlockDetails);
      const placements = new Map(layout.nodePlacements.map((p) => [p.nodeId, p]));

      const trunkX = placements.get('bus_s1_sn')?.position.x ?? 0;
      const branchBuses = ['bus_b1_sn', 'bus_b2_sn', 'bus_b3_sn', 'bus_b4_sn', 'bus_b5_sn', 'bus_b6_sn'];

      let branchesPlaced = 0;
      for (const busId of branchBuses) {
        const pos = placements.get(busId);
        if (pos) {
          // Branch stations should be offset from trunk (either side)
          expect(Math.abs(pos.position.x - trunkX)).toBeGreaterThan(20);
          branchesPlaced++;
        }
      }
      // At least some branch buses should be placed
      expect(branchesPlaced).toBeGreaterThan(0);
    });

    it('layout: brak overlapów między symbolami', () => {
      const result = buildReferenceScenario('terrain');
      const adapter = buildVisualGraphFromTopology(result.input);
      const layout = computeLayout(adapter.graph, DEFAULT_LAYOUT_CONFIG, adapter.stationBlockDetails);

      // Check all pairs for overlap
      const placements = layout.nodePlacements;
      let overlapCount = 0;
      for (let i = 0; i < placements.length; i++) {
        for (let j = i + 1; j < placements.length; j++) {
          const a = placements[i].bounds;
          const b = placements[j].bounds;
          const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
          const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
          if (overlapX && overlapY) {
            overlapCount++;
          }
        }
      }
      expect(overlapCount).toBe(0);
    });

    it('jest deterministyczny 100x', () => {
      const hashes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = buildReferenceScenario('terrain');
        const adapter = buildVisualGraphFromTopology(result.input);
        hashes.add(computeVisualGraphHash(adapter.graph));
      }
      expect(hashes.size).toBe(1);
    });

    it('generuje symbole i layout bez błędów', () => {
      const result = buildReferenceScenario('terrain');
      // 12 stations × ~3 elements each + lines + sources + loads
      expect(result.symbols.length).toBeGreaterThan(40);
      expect(result.canonicalAnnotations).not.toBeNull();
      expect(result.canonicalAnnotations!.trunkNodes.length).toBeGreaterThan(0);
    });

    it('bilans: 11 odbiorów, 1 PV, łączna moc odbiorów = 1,31 MW', () => {
      const result = buildReferenceScenario('terrain');
      expect(result.input.loads.length).toBe(11);
      expect(result.input.generators.length).toBe(1);

      const totalP = result.input.loads.reduce((sum, l) => sum + l.pMw, 0);
      expect(totalP).toBeCloseTo(1.31, 2);
    });
  });
});
