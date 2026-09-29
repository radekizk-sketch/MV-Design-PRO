import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildSceneV3 } from '../ui/sld/v3/scene/buildScene';
const pliki = [
  'src/ui/sld/v3/scene/__tests__/fixtures/gpzFeeder.enm.json',
  'src/ui/sld/v3/canvas/__tests__/fixtures/s92Bieg.enm.json',
  'src/ui/sld/v3/scene/__tests__/fixtures/pomiarOdgalezienie.enm.json',
];
it('kompletnosc', () => {
  for (const f of pliki) {
    const raw = JSON.parse(readFileSync(f, 'utf8'));
    const enm = raw.enm ?? raw;
    for (const lod of [0, 2] as const) {
      const s = buildSceneV3(enm, lod);
      const owners = new Set<string>();
      for (const x of s.symbols) if ((x.meta as any)?.ownerRef) owners.add((x.meta as any).ownerRef);
      for (const x of s.segments) { if ((x as any).ownerRef) owners.add((x as any).ownerRef); if ((x as any).meta?.ownerRef) owners.add((x as any).meta.ownerRef); }
      for (const x of s.labels) if ((x as any).ownerRef) owners.add((x as any).ownerRef);
      const base = new Set([...owners].map((o) => o.split('#')[0]));
      const out: Record<string, { n: number; brak: string[] }> = {};
      for (const kl of ['substations','buses','branches','transformers','sources','loads','generators','branch_points','bays','measurements','protection_assignments','corridors','line_runs']) {
        const els = (enm[kl] ?? []) as any[];
        const brak = els.filter((e) => !owners.has(e.ref_id) && !base.has(e.ref_id)).map((e) => `${e.ref_id}|${e.type ?? e.station_type ?? ''}|${e.meta?.visual_role ?? ''}|${e.meta?.render_on_sld ?? ''}`);
        out[kl] = { n: els.length, brak };
      }
      console.log('PLIK', f.split('/').pop(), 'LOD', lod, JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, `${v.n - v.brak.length}/${v.n}`]))));
      if (lod === 2) for (const [k, v] of Object.entries(out)) for (const b of v.brak.slice(0, 40)) console.log('  BRAK', k, b);
      console.log('  OWNERS', [...owners].slice(0, 60).join(' '));
    }
  }
});
