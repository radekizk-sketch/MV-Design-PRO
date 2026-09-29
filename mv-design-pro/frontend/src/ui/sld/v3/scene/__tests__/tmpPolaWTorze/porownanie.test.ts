import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildSceneV3 } from '../../buildScene';
import type { EnergyNetworkModel } from '../../../../../../types/enm';

const S = '/tmp/claude-0/-home-user-MV-Design-PRO/72c31ae8-8c05-5345-a2a0-6f7019e05b56/scratchpad/polawtorze/sld';
function podsumuj(obj: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v.length;
    else if (v && typeof v === 'object') out[k] = podsumuj(v);
    else out[k] = v;
  }
  return out;
}
it('porownanie', () => {
  for (const n of (process.env.POLA_NAZWY ?? 'baza,po').split(',')) {
    const raw = JSON.parse(readFileSync(`${S}/${n}.json`, 'utf8'));
    const enm = (raw.enm ?? raw) as EnergyNetworkModel;
    for (const lod of [0, 1, 2] as const) {
      const scena = buildSceneV3(enm, lod as never);
      writeFileSync(`${S}/scena_${n}_${lod}.json`, JSON.stringify(scena, null, 1));
      writeFileSync(`${S}/podsum_${n}_${lod}.json`, JSON.stringify(podsumuj(scena), null, 1));
    }
  }
});
