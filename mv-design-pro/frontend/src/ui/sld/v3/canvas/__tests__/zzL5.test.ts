// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects } from '../../scene/buildScene';
import { sheetSizeFor } from '../../sheet/outline';
import { planSceneLabels } from '../labelLegibility';
import { podlogaOpisowCelu, zakresCelu } from '../zakresKadru';
import { rectsOverlap } from '../../core/grid';
const here = dirname(fileURLToPath(import.meta.url));
const enm = (JSON.parse(readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8')) as { enm: EnergyNetworkModel }).enm;
it('sonda', () => {
  const out: string[] = [];
  const s2 = buildSceneV3(enm, 2);
  const s1 = buildSceneV3(enm, 1);
  const st = enm.substations.find((x) => x.name === 'Stacja L5-1')!.ref_id;
  const w = zakresCelu('stacja', enm, [st], s2) as any;
  const refy = new Set<string>(w.zakres.refy);
  const p = planSceneLabels(s1.labels, sceneObstacleRects(s1), 0.3, sheetSizeFor(s1), podlogaOpisowCelu(refy));
  const lbl = s1.labels.filter((l) => l.ownerRef.startsWith(st));
  for (const l of lbl) out.push(`L ${l.ownerRef} ${l.text} ${l.labelClass} ${JSON.stringify(l.rect)}`);
  for (const d of p.drawn) if (d.label.ownerRef.startsWith(st)) out.push(`D ${d.label.ownerRef} ${d.text} fs=${d.fontSize.toFixed(1)} ${JSON.stringify(d.rect)}`);
  const naz = p.drawn.find((d) => d.text.includes('L5-1') && d.label.ownerRef.startsWith(st));
  if (naz) {
    const big = { ...naz.rect };
    for (const d of p.drawn) if (d !== naz && rectsOverlap(d.rect, { x: big.x - 200, y: big.y - 100, width: big.width + 400, height: big.height + 200 })) out.push(`N ${d.label.ownerRef} ${d.text} fs=${d.fontSize.toFixed(1)} ${JSON.stringify(d.rect)}`);
  }
  writeFileSync(process.env.SONDA_OUT!, out.join('\n'));
});
