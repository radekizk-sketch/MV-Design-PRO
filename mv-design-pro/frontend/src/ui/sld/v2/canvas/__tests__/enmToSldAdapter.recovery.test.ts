// @vitest-environment node
/**
 * SLD RECOVERY oracles (2026-07) — executable proof for the failures named in
 * SLD_FORENSIC_AUDIT.md / SLD_ELECTRICAL_SEMANTICS.md.
 *
 * These assert electrical/semantic correctness (not pixels). Passing tests are
 * PROVEN fixes. Geometric oracles of the deleted v2 adapter geometry (E02/E03
 * trunk polyline) went with it (GPZ-PARYTET cz. 3) — the drawing geometry is
 * owned and asserted by the v3 scene (`v3/scene/__tests__`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSldDataFromSnapshot } from '../enmToSldAdapter';
import { buildSceneV3 } from '../../../v3/scene/buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { enm: EnergyNetworkModel }).enm;

describe('SLD recovery — electrical/semantic oracles', () => {
  const data = buildSldDataFromSnapshot(enm, null);

  // E01: the ENM has exactly one source; the SLD must not render two
  // independent source-looking blocks. Proxy: exactly one GPZ block.
  it('E01: renders exactly one GPZ / source block (single source in ENM)', () => {
    expect(enm.sources.length).toBe(1);
    expect(data.gpzs.length).toBe(1);
  });

  // E11: section labels must never be a zero-based array index ("Sekcja 0"/"S0").
  // GPZ-PARYTET cz. 3: opis sekcji v2 (`sections`, `labelSpecs`) skasowany razem
  // z rendererami — wyrocznia czyta JEDYNY rysunek: scenę v3 (sekcje GPZ i każdą
  // etykietę) na wszystkich poziomach szczegółowości.
  it.each([0, 1, 2] as const)('E11: no zero-based section label leaks ("Sekcja 0" / "S0"), LOD %i', (lod) => {
    const scene = buildSceneV3(enm, lod);
    expect(scene.meta.sections.length).toBeGreaterThan(0);
    // `order` to klucz sortowania z ENM (może zaczynać się od 0) — wyrocznia dotyczy
    // NAPISU sekcji, który widzi inżynier.
    for (const sekcja of scene.meta.sections) {
      expect(sekcja.label, `section ${sekcja.sectionId}`).not.toMatch(/\bSekcja 0\b/);
      expect(sekcja.label.trim()).not.toBe('S0');
    }
    const teksty = scene.labels.map((l) => l.text);
    expect(teksty.length).toBeGreaterThan(0);
    for (const t of teksty) {
      expect(t).not.toMatch(/\bSekcja 0\b/);
      expect(t.trim()).not.toBe('S0');
    }
  });

  // E08: a cable-class label must never contain the OVERHEAD token (contradiction
  // "Kabel SN · OVERHEAD"); cable and overhead line are distinct classes.
  it('E08: no cable run label mixes "Kabel" with "OVERHEAD"', () => {
    for (const run of data.cableRuns) {
      const texts = [run.label ?? '', ...(run.segmentLabels ?? []).map((s) => s.text)];
      for (const t of texts) {
        const hasKabel = /kabel/i.test(t);
        const hasOverhead = /overhead/i.test(t);
        expect(hasKabel && hasOverhead, `contradictory label: "${t}"`).toBe(false);
      }
    }
  });

  // E07: DER declared connection_variant "nn_side" attaches to the station LV
  // (nN) side — the SLD must anchor such DER to a station, never leave it as a
  // free coordinate on the 15 kV trunk. Proxy: every DER connection references a
  // known station id (its PCC anchor), not a bare trunk coordinate.
  it('E07: nn_side DER are anchored to a station (PCC = station), not the trunk', () => {
    const stationIds = new Set(data.stations.map((s) => s.id));
    const nnGenerators = enm.generators.filter((g) => g.connection_variant === 'nn_side');
    expect(nnGenerators.length).toBeGreaterThan(0);
    // Every nn_side generator's owning station must be a rendered station node.
    for (const g of nnGenerators) {
      const stationRef = g.station_ref
        ?? (typeof g.bus_ref === 'string' && g.bus_ref.startsWith('stn/')
          ? `stn/${g.bus_ref.split('/')[1]}/station`
          : null);
      expect(stationRef, `DER ${g.name} has no resolvable station`).toBeTruthy();
      if (stationRef) expect(stationIds.has(stationRef)).toBe(true);
    }
  });

  // §16 / connection_contract (recovery step 5): every rendered cable segment is
  // TERMINAL-TO-TERMINAL — its endpoints are the ENM branch's from_bus/to_bus,
  // not bare coordinates. Proven by matching each segmentPath's fromTerminal/
  // toTerminal busRef to the ENM branch it renders.
  it('§16: every rendered cable segment carries ENM terminal identity (from_bus→to_bus)', () => {
    const branchByRef = new Map(enm.branches.map((b) => [b.ref_id, b]));
    let checked = 0;
    let unanchored = 0; // renderowany odcinek BEZ tożsamości terminala — zakazany
    for (const run of data.cableRuns) {
      for (const seg of run.segmentPaths ?? []) {
        const branch = branchByRef.get(seg.segmentRef);
        // Każdy renderowany segmentPath ma segmentRef = ref gałęzi ENM; brak
        // fromTerminal/toTerminal = krawędź „tylko-współrzędne" (zakazana, §16).
        if (!branch || !seg.fromTerminal || !seg.toTerminal) {
          unanchored += 1;
          continue;
        }
        checked += 1;
        // Identity must equal the ENM branch endpoints — no coordinate-only edge.
        expect(seg.fromTerminal.busRef).toBe(branch.from_bus_ref);
        expect(seg.toTerminal.busRef).toBe(branch.to_bus_ref);
      }
    }
    // The substrate's corridor-routed runs must actually exercise this path.
    expect(checked).toBeGreaterThan(50);
    // COMPLETENESS: żaden renderowany odcinek nie może być bez tożsamości terminala.
    expect(unanchored, 'każdy renderowany odcinek musi być terminal-to-terminal').toBe(0);
  });

  // §16 (fallback path): a snapshot WITHOUT line_runs skips the corridor router
  // and renders via the slot fallback (buildRunSegmentPaths). Those segments must
  // ALSO be terminal-anchored — proven here so the invariant holds on every path,
  // not only the substrate's corridor-routed runs.
  it('§16: slot-fallback segments (no line_runs) are also terminal-to-terminal', () => {
    const bus = (id: string): Record<string, unknown> => ({
      id, ref_id: id, name: id, voltage_kv: 15, phase_system: '3ph', tags: [], meta: {},
    });
    const station = (ref: string, name: string): Record<string, unknown> => ({
      id: ref, ref_id: ref, name, tags: [], meta: {},
      station_type: 'inline', bus_refs: [], transformer_refs: [],
    });
    const cable = (ref: string, from: string, to: string): Record<string, unknown> => ({
      id: ref, ref_id: ref, name: ref, type: 'cable',
      from_bus_ref: from, to_bus_ref: to, tags: [], meta: {},
    });
    const fallbackSnapshot = {
      header: enm.header,
      buses: [bus('bus/gpz'), bus('bus/s1'), bus('bus/s2')],
      // Łańcuch ≥2 kabli, BEZ line_runs → syntetyczny main_trunk (slot fallback).
      branches: [cable('cbl/1', 'bus/gpz', 'bus/s1'), cable('cbl/2', 'bus/s1', 'bus/s2')],
      transformers: [], sources: [], loads: [], generators: [],
      substations: [
        { ...station('stn/gpz/station', 'GPZ'), station_type: 'gpz', bus_refs: ['bus/gpz'] },
        station('stn/1/station', 'Stacja 1'),
        station('stn/2/station', 'Stacja 2'),
      ],
      bays: [], measurements: [], protection_devices: [], protection_assignments: [],
      line_runs: [], connection_nodes: [], cable_joints: [],
    } as unknown as EnergyNetworkModel;

    const fallbackData = buildSldDataFromSnapshot(fallbackSnapshot, null);
    const branchByRef = new Map(fallbackSnapshot.branches.map((b) => [b.ref_id, b]));
    const rendered = fallbackData.cableRuns.flatMap((run) => run.segmentPaths ?? []);
    // Fallback musi faktycznie coś wyrenderować (inaczej test niczego nie dowodzi).
    const branchSegments = rendered.filter((seg) => branchByRef.has(seg.segmentRef));
    expect(branchSegments.length).toBeGreaterThan(0);
    for (const seg of branchSegments) {
      const branch = branchByRef.get(seg.segmentRef)!;
      expect(seg.fromTerminal?.busRef, `fallback ${seg.segmentRef} fromTerminal`).toBe(branch.from_bus_ref);
      expect(seg.toTerminal?.busRef, `fallback ${seg.segmentRef} toTerminal`).toBe(branch.to_bus_ref);
    }
  });
});
