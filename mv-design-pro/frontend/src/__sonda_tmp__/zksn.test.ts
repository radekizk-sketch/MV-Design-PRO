import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildSceneV3, branchPointCoverageGaps } from '../ui/sld/v3/scene/buildScene';
it('zksn', () => {
  const enm = JSON.parse(readFileSync(process.env.PLIK!, 'utf8'));
  for (const lod of [0, 2] as const) {
    const s = buildSceneV3(enm, lod);
    console.log('LOD', lod, 'stacje', s.meta.stationCount, JSON.stringify(s.meta.drawnStationIds), JSON.stringify(s.meta.drawnBranchPointRefs));
    console.log('STOP', JSON.stringify(s.meta.stopNotes, null, 1));
    console.log('GAPS', JSON.stringify(branchPointCoverageGaps(s, enm)));
    console.log('SEG', JSON.stringify(s.segments.map((x: any) => [x.ownerRef ?? x.meta?.ownerRef, x.points?.length])).slice(0, 1500));
  }
});
