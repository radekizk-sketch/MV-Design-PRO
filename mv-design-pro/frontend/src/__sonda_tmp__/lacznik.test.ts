import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildSceneV3 } from '../ui/sld/v3/scene/buildScene';
import { buildSldDataFromSnapshot } from '../ui/sld/v2/canvas/enmToSldAdapter';
it('l', () => {
  const enm = JSON.parse(readFileSync(process.env.PLIK!, 'utf8'));
  const d = buildSldDataFromSnapshot(enm, enm.logical_views ?? null, null);
  for (const c of d.cableRuns) console.log('RUN', c.id, JSON.stringify((c.segmentPaths ?? []).map((p: any) => [p.segmentRef, p.fromTerminal?.ownerRef ?? null, p.toTerminal?.ownerRef ?? null])));
  const s = buildSceneV3(enm, 2);
  console.log('SEG', JSON.stringify(s.segments.map((x: any) => x.meta?.ownerRef).filter((o: string) => o?.startsWith('seg/') || o?.startsWith('sw/'))));
  console.log('SYM', JSON.stringify(s.symbols.map((x: any) => [x.symbolId, x.meta?.ownerRef]).filter((o: any) => String(o[1]).startsWith('sw/') || String(o[1]).startsWith('bus/'))));
  console.log('STOP', JSON.stringify(s.meta.stopNotes));
});
