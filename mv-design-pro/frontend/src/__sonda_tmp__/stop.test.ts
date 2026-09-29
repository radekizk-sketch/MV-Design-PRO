import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildSceneV3 } from '../ui/sld/v3/scene/buildScene';
import { buildSldDataFromSnapshot } from '../ui/sld/v2/canvas/enmToSldAdapter';
it('s', () => {
  const raw = JSON.parse(readFileSync(process.env.PLIK!, 'utf8'));
  const enm = raw.enm ?? raw;
  const d = buildSldDataFromSnapshot(enm, enm.logical_views ?? null, null);
  for (const c of d.cableRuns) console.log('RUN', c.id, JSON.stringify((c.segmentPaths ?? []).map((p: any) => [p.segmentRef.slice(0, 20), p.fromTerminal?.ownerRef?.slice(0, 12) ?? null, p.toTerminal?.ownerRef?.slice(0, 12) ?? null])));
  for (const lod of [0, 1, 2] as const) {
    const s = buildSceneV3(enm, lod);
    console.log('LOD', lod, 'SEG', JSON.stringify(s.segments.map((x: any) => x.meta?.ownerRef).filter((o: string) => o?.startsWith('seg/') && !o.includes('#'))));
    console.log('STOP', JSON.stringify(s.meta.stopNotes.filter((n: string) => !n.includes('declutter') && !n.includes('Arkusz'))));
  }
});
