/** Pomiar jednorazowy (W3-KABLE-ETYKIETY §5): minimalne światło równoległych
 *  odcinków toru elektrycznego na fixturze referencyjnej, per LOD. Reużywa
 *  produkcyjny buildSceneV3 (zero duplikacji geometrii). Wynik = wyprowadzenie
 *  wartości 4 nowych stałych §5 z DZISIEJSZEJ geometrii. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene.ts';

const here = dirname(fileURLToPath(import.meta.url));
const enm = JSON.parse(
  readFileSync(
    resolve(here, '..', 'src', 'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
    'utf8',
  ),
).enm;

function decompose(seg) {
  // rozbij polilinię na proste odcinki poziome/pionowe
  const out = [];
  const pts = seg.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= 0.5) {
      out.push({ orient: 'V', x: a.x, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), owner: seg.meta?.ownerRef ?? null });
    } else if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) >= 0.5) {
      out.push({ orient: 'H', y: a.y, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), owner: seg.meta?.ownerRef ?? null });
    }
  }
  return out;
}

for (const lod of [0, 1, 2]) {
  const scene = buildSceneV3(enm, lod);
  // Tylko trasy kablowe/liniowe MIĘDZY stacjami (magistrala + laterale) — kind
  // snTrunk/sn. Wewnętrzna geometria stacji (szyny nN, rzędy DER, dropy) NIE
  // jest „równoległym kablem" w rozumieniu §5 (to szyna, nie trasa).
  const segs = scene.segments.filter(
    (s) =>
      s.meta?.elementKind === 'segment' &&
      (s.meta?.kind === 'snTrunk' || s.meta?.kind === 'sn') &&
      // trasy MIĘDZY stacjami niosą ref segmentu ENM (seg/.../segment,
      // .../branch_segment_L); dekoracje wewnątrz stacji mają ref z '#'
      // (…/station#lv-load-drop, #der-row-trunk) — to szyny, nie trasy.
      typeof s.meta?.ownerRef === 'string' && !s.meta.ownerRef.includes('#'),
  );
  const prims = segs.flatMap(decompose);
  const V = prims.filter((p) => p.orient === 'V');
  const H = prims.filter((p) => p.orient === 'H');
  let minV = Infinity;
  let minVpair = null;
  for (let i = 0; i < V.length; i++) {
    for (let j = i + 1; j < V.length; j++) {
      const a = V[i];
      const b = V[j];
      if (a.owner && b.owner && a.owner === b.owner) continue;
      const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (overlap <= 0) continue; // muszą dzielić pas Y
      const d = Math.abs(a.x - b.x);
      if (d < 0.5) continue; // ten sam pion (styk/łańcuch)
      if (d < minV) { minV = d; minVpair = [a.owner, b.owner]; }
    }
  }
  let minH = Infinity;
  let minHpair = null;
  for (let i = 0; i < H.length; i++) {
    for (let j = i + 1; j < H.length; j++) {
      const a = H[i];
      const b = H[j];
      if (a.owner && b.owner && a.owner === b.owner) continue;
      const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      if (overlap <= 0) continue;
      const d = Math.abs(a.y - b.y);
      if (d < 0.5) continue;
      if (d < minH) { minH = d; minHpair = [a.owner, b.owner]; }
    }
  }
  console.log(`LOD ${lod}: segmenty=${segs.length} V=${V.length} H=${H.length}`);
  console.log(`  min światło równoległych PIONÓW = ${minV === Infinity ? 'brak par' : minV + ' px'} ${minVpair ? JSON.stringify(minVpair) : ''}`);
  console.log(`  min światło równoległych POZIOMÓW = ${minH === Infinity ? 'brak par' : minH + ' px'} ${minHpair ? JSON.stringify(minHpair) : ''}`);
}
