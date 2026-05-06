/**
 * sld_render_artifacts.ts — CI render artifact generator dla nowego SLD v2.
 *
 * Po PR-5c (wygaszenie starego SLD) pipeline jest:
 *   BuildSequence (lista komend) → HierarchicalLayout (computeLayout) → EffectiveLayout
 *
 * Generuje deterministyczne artefakty renderingu dla 3 sieci golden:
 *   - radial_5: GPZ + 1 sekcja + 1 pole + 1 ciąg + 5 stacji
 *   - branch_3: GPZ + 1 sekcja + 1 pole + ciąg główny + 1 odgałęzienie + 3 stacje
 *   - der_pv: GPZ + 1 sekcja + 1 pole + 1 ciąg + 1 stacja + 1 PV
 *
 * USAGE: npx tsx scripts/sld_render_artifacts.ts
 *
 * Plik wyjściowy:
 *   artifacts/<networkId>__<layoutHash>.json
 * zawiera EffectiveLayout (elements + paths + hash) jako stabilny JSON.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  appendCommand,
  emptyBuildSequence,
  type BuildCommand,
  type BuildSequence,
} from '../frontend/src/ui/sld/v2/builder/BuildSequence';
import { computeLayout } from '../frontend/src/ui/sld/v2/builder/HierarchicalLayout';

interface NetworkArtifact {
  readonly networkId: string;
  readonly description: string;
  readonly sequence: BuildSequence;
}

function buildRadial5(): NetworkArtifact {
  let seq = emptyBuildSequence();
  const cmds: BuildCommand[] = [
    { type: 'InsertGpz', id: 'gpz', name: 'GPZ Test', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: 500 },
    { type: 'AddSection', id: 'sec1', gpzId: 'gpz', number: 1, busVoltageKv: 15 },
    { type: 'AddBay', id: 'bay1', sectionId: 'sec1', designation: 'F01', bayTemplateId: 'bay_template_line_out' },
    {
      type: 'ExtendCableRun',
      id: 'run1',
      fromBayId: 'bay1',
      fromPortId: 'bay1:sn_output',
      runKind: 'main_trunk',
      segmentKind: 'cable_sn',
      catalogRef: null,
      lengthKm: 0.5,
      parentRunId: null,
      branchOriginStationId: null,
    },
  ];
  for (let i = 1; i <= 5; i++) {
    cmds.push({
      type: 'InsertStationOnRun',
      id: `st${i}`,
      runId: 'run1',
      afterSegmentId: 'seg-prev',
      stationName: `Stacja ${i}`,
      stationTemplateId: i === 5 ? 'station_template_terminal' : 'station_template_inline',
    });
  }
  for (const c of cmds) seq = appendCommand(seq, c);
  return { networkId: 'radial_5', description: 'GPZ + 1 sekcja + 1 pole + ciąg + 5 stacji', sequence: seq };
}

function buildBranch3(): NetworkArtifact {
  let seq = emptyBuildSequence();
  const cmds: BuildCommand[] = [
    { type: 'InsertGpz', id: 'gpz', name: 'GPZ Test', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: 500 },
    { type: 'AddSection', id: 'sec1', gpzId: 'gpz', number: 1, busVoltageKv: 15 },
    { type: 'AddBay', id: 'bay1', sectionId: 'sec1', designation: 'F01', bayTemplateId: 'bay_template_line_out' },
    {
      type: 'ExtendCableRun',
      id: 'mainrun',
      fromBayId: 'bay1',
      fromPortId: 'bay1:sn_output',
      runKind: 'main_trunk',
      segmentKind: 'cable_sn',
      catalogRef: null,
      lengthKm: 1.0,
      parentRunId: null,
      branchOriginStationId: null,
    },
    {
      type: 'InsertStationOnRun',
      id: 'st_branch_origin',
      runId: 'mainrun',
      afterSegmentId: 'seg1',
      stationName: 'Stacja branch',
      stationTemplateId: 'station_template_branch',
    },
    {
      type: 'ExtendCableRun',
      id: 'sub_run1',
      fromBayId: 'bay1',
      fromPortId: 'st_branch_origin:sn_branch',
      runKind: 'branch',
      segmentKind: 'overhead_line_sn',
      catalogRef: null,
      lengthKm: 0.7,
      parentRunId: 'mainrun',
      branchOriginStationId: 'st_branch_origin',
    },
    {
      type: 'InsertStationOnRun',
      id: 'st_branch_end',
      runId: 'sub_run1',
      afterSegmentId: 'seg-sub',
      stationName: 'Stacja końcowa odgałęzienia',
      stationTemplateId: 'station_template_terminal',
    },
    {
      type: 'InsertStationOnRun',
      id: 'st_main_end',
      runId: 'mainrun',
      afterSegmentId: 'seg2',
      stationName: 'Stacja końcowa',
      stationTemplateId: 'station_template_terminal',
    },
  ];
  for (const c of cmds) seq = appendCommand(seq, c);
  return { networkId: 'branch_3', description: 'GPZ + ciąg główny + odgałęzienie + 3 stacje', sequence: seq };
}

function buildDerPv(): NetworkArtifact {
  let seq = emptyBuildSequence();
  const cmds: BuildCommand[] = [
    { type: 'InsertGpz', id: 'gpz', name: 'GPZ Test', voltageHighKv: 110, voltageLowKv: 15, scShortCircuitMva: 500 },
    { type: 'AddSection', id: 'sec1', gpzId: 'gpz', number: 1, busVoltageKv: 15 },
    { type: 'AddBay', id: 'bay1', sectionId: 'sec1', designation: 'F01', bayTemplateId: 'bay_template_line_out' },
    {
      type: 'ExtendCableRun',
      id: 'run1',
      fromBayId: 'bay1',
      fromPortId: 'bay1:sn_output',
      runKind: 'main_trunk',
      segmentKind: 'cable_sn',
      catalogRef: null,
      lengthKm: 0.5,
      parentRunId: null,
      branchOriginStationId: null,
    },
    {
      type: 'InsertStationOnRun',
      id: 'st_pv',
      runId: 'run1',
      afterSegmentId: 'seg1',
      stationName: 'Stacja PV',
      stationTemplateId: 'station_template_pv',
    },
    {
      type: 'AttachDer',
      id: 'pv1',
      derKind: 'PV',
      attachmentPortId: 'st_pv:sn_der_pv',
      parentStationId: 'st_pv',
      nominalPowerKw: 2000,
      portKind: 'sn_der_pv',
    },
  ];
  for (const c of cmds) seq = appendCommand(seq, c);
  return { networkId: 'der_pv', description: 'GPZ + 1 stacja PV z 2 MW PV', sequence: seq };
}

function serializeArtifact(networkId: string, description: string, layout: ReturnType<typeof computeLayout>) {
  const elements: Record<string, { x: number; y: number; widthPx?: number; heightPx?: number }> = {};
  for (const [id, slot] of layout.elements.entries()) {
    elements[id] = { x: slot.x, y: slot.y };
    if ('widthPx' in slot && typeof slot.widthPx === 'number') elements[id].widthPx = slot.widthPx;
    if ('heightPx' in slot && typeof slot.heightPx === 'number') elements[id].heightPx = slot.heightPx;
  }
  const paths: Record<string, ReadonlyArray<{ x: number; y: number }>> = {};
  for (const [id, pathPoints] of layout.paths.entries()) {
    paths[id] = pathPoints;
  }
  return {
    networkId,
    description,
    layoutVersion: layout.version,
    layoutHash: layout.hash,
    elementCount: layout.elements.size,
    pathCount: layout.paths.size,
    elements,
    paths,
  };
}

function main(): void {
  const artifactsDir = path.resolve(__dirname, '..', 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const networks = [buildRadial5(), buildBranch3(), buildDerPv()];

  for (const net of networks) {
    const layout = computeLayout(net.sequence);
    const artifact = serializeArtifact(net.networkId, net.description, layout);
    const fileName = `${net.networkId}__${layout.hash}.json`;
    const filePath = path.join(artifactsDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf-8');
    console.log(`[sld_render_artifacts] ${net.networkId}: hash=${layout.hash} elements=${layout.elements.size} paths=${layout.paths.size} → ${fileName}`);
  }
  console.log(`[sld_render_artifacts] ${networks.length} sieci wyrenderowanych do ${artifactsDir}`);
}

main();
