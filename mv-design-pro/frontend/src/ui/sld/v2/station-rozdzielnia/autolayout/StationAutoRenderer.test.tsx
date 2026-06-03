/**
 * E2 AUTO-LAYOUT render — ACCEPTANCE: it MATCHES the preset (same companion + same readouts), it
 * does not re-implement the model. Locks the regressions the reviewer flagged: idyn from the
 * companion (not 0), local per-type share, 1f-z restored, NO PCC name, CT ring on the busbar.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fmt } from '../canon/sldCanonKit';
import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { companionToStationModel } from './layoutModel';
import { StationAutoRenderer } from './StationAutoRenderer';
import { layoutStation } from './stationLayout';

function autoText(key: string): { txt: string; companion: (typeof OZE_ARCHETYPES_2A)[string] } {
  const companion = OZE_ARCHETYPES_2A[key];
  const layout = layoutStation(companionToStationModel(companion));
  const { container } = render(
    <svg>
      <StationAutoRenderer layout={layout} companion={companion} />
    </svg>,
  );
  return { txt: container.textContent ?? '', companion };
}

describe('E2 auto-layout render — matches the preset (same model + readouts)', () => {
  it('NO PCC name/marker anywhere (canon)', () => {
    for (const k of ['G4-PVTR', 'G8-BIOGAZ', 'G9-GPO']) expect(autoText(k).txt).not.toContain('PCC');
  });

  it('idyn from the companion (ip ≤ idyn ✓), not 0', () => {
    const { txt, companion } = autoText('G8-BIOGAZ');
    const idyn = companion.source.withstand!.sn_idyn_ka;
    expect(idyn).toBeGreaterThan(0);
    expect(txt).toContain(`idyn ${idyn}`); // rendered (NodeReadout shows "idyn 63 ✓"), not 0
    expect(txt).not.toContain('idyn 0');
    expect(companion.short_circuit.buses['SN_PCC'].max.ip_ka).toBeLessThanOrEqual(idyn);
  });

  it('single-nN archetype (G4-PVTR) STILL shows the nN dynamic verdict (scalar is unambiguous)', () => {
    const { txt, companion } = autoText('G4-PVTR');
    const nn = companion.source.withstand!.nn_idyn_ka; // 1 SN + 1 nN → the scalar maps cleanly
    expect(txt).toContain(`idyn ${nn} ✓`);
    expect(txt).not.toContain('✗'); // healthy single-transformer station — no failed verdict
  });

  it('multi-nN station (G9) shows NO fabricated dynamic verdict on its nN buses', () => {
    const { txt, companion } = autoText('G9-GPO');
    // The SN collector DOES carry the dynamic verdict (sn_idyn_ka applies to the SN tier).
    expect(txt).toContain(`idyn ${companion.source.withstand!.sn_idyn_ka} ✓`);
    // Two distinct nN buses share ONE nn_idyn_ka scalar → no per-bus idyn, hence NO failed verdict.
    expect(txt).not.toContain('✗');
    // The nN peak (ip) is still shown — but WITHOUT an "· idyn …" suffix (no fabricated rating).
    const pvIp = fmt(companion.short_circuit.buses['PV_NN'].max.ip_ka, 1);
    expect(txt).toContain(`${pvIp} kA`);
    expect(txt).not.toContain(`${pvIp} kA · idyn`);
  });

  it('1f-z restored from grid_earthing (kompensowana on SN)', () => {
    const { txt, companion } = autoText('G8-BIOGAZ');
    expect(txt).toContain(`${fmt(companion.source.grid_earthing!.ik_1f_ka)} kA · kompensowana`);
  });

  it('share = local per-type breakdown, NOT a raw enum (G8 synchronous → sieć + maszyna)', () => {
    const { txt, companion } = autoText('G8-BIOGAZ');
    const scb = companion.short_circuit.buses['SN_PCC'];
    const mach = scb.source_contribution.ik_contribution_ka;
    expect(txt).toContain(`sieć ${fmt(scb.max.ikss_ka - mach, 1)} + maszyna ${fmt(mach, 2)} kA`);
    expect(txt).not.toContain('SYNCHRONOUS'); // no raw enum (the previous regression)
  });

  it('ik3f matches the companion (same numbers as the preset)', () => {
    const { txt, companion } = autoText('G8-BIOGAZ');
    const scb = companion.short_circuit.buses['SN_PCC'];
    expect(txt).toContain(`${fmt(scb.max.ikss_ka, 1)} / ${fmt(scb.min.ikss_ka, 1)} kA`);
  });

  it('G9 per-node: collector MIXED (sieć+masz+IBG); LV node shows only its LOCAL source', () => {
    const c = OZE_ARCHETYPES_2A['G9-GPO'];
    const layout = layoutStation(companionToStationModel(c));
    const { container } = render(
      <svg>
        <StationAutoRenderer layout={layout} companion={c} />
      </svg>,
    );
    const txt = container.textContent ?? '';
    // collector (SN) — all three terms.
    expect(txt).toMatch(/sieć [\d,]+ \+ masz [\d,]+ \+ IBG [\d,]+ kA/);
    // WIND_NN (async machine, no local IBG): its readout must NOT carry a spurious cross-bus IBG.
    const windIk = fmt(c.short_circuit.buses['WIND_NN'].max.ikss_ka, 1);
    const windReadout = txt.slice(txt.indexOf(windIk));
    // the wind node's share line is "sieć … + masz …" — no IBG term before the next node.
    expect(windReadout).toMatch(/sieć [\d,]+ \+ masz [\d,]+ kA/);
    // PV_NN (IBG, no machine): "sieć … + IBG …".
    expect(txt).toMatch(/sieć [\d,]+ \+ IBG [\d,]+ kA/);
  });
});
