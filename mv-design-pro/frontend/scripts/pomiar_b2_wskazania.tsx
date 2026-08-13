/**
 * B-2 — pomiar ROZWIĄZYWALNOŚCI wskazania operacji na rysunku (czy kamera ma
 * się na czym zakotwiczyć). Wejście: pary (snapshot po operacji, wskazanie)
 * zebrane z żywego backendu.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   B2_DIR=<katalog par> npx vite-node scripts/pomiar_b2_wskazania.tsx
 */
import { readFileSync } from 'node:fs';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, type SceneLod } from '../src/ui/sld/v3/scene/buildScene';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs';

const DIR = process.env.B2_DIR ?? '/tmp/b2';
const pary = JSON.parse(readFileSync(`${DIR}/wskazania.json`, 'utf8')) as {
  operacja: string; wskazanie: string | null; utworzone: string[];
}[];

function pasuje(owner: string | undefined | null, ref: string): boolean {
  return !!owner && (owner === ref || owner.startsWith(`${ref}#`));
}

function trafienia(scene: ReturnType<typeof buildSceneV3>, ref: string) {
  let symbole = 0; let odcinki = 0; let etykiety = 0;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const obejmij = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const s of scene.symbols) {
    if (!pasuje(s.meta?.ownerRef, ref)) continue;
    symbole += 1;
    const def = SYMBOL_DEFS[s.symbolId];
    obejmij(s.x, s.y); obejmij(s.x + def.width, s.y + def.height);
  }
  for (const seg of scene.segments) {
    if (!pasuje(seg.meta?.ownerRef, ref)) continue;
    odcinki += 1;
    for (const p of seg.points) obejmij(p.x, p.y);
  }
  for (const l of scene.labels) {
    if (!pasuje(l.ownerRef, ref)) continue;
    etykiety += 1;
    obejmij(l.rect.x, l.rect.y); obejmij(l.rect.x + l.rect.width, l.rect.y + l.rect.height);
  }
  const znaleziono = symbole + odcinki + etykiety > 0;
  return {
    znaleziono, symbole, odcinki, etykiety,
    rozmiar: znaleziono ? { w: Math.round(maxX - minX), h: Math.round(maxY - minY) } : null,
  };
}

const wynik: Record<string, unknown>[] = [];
for (const para of pary) {
  const enm = (JSON.parse(readFileSync(`${DIR}/wsk-${para.operacja}.enm.json`, 'utf8')) as { enm: EnergyNetworkModel }).enm;
  const wiersz: Record<string, unknown> = { operacja: para.operacja, wskazanie: para.wskazanie };
  for (const lod of [0, 1, 2] as const) {
    const scene = buildSceneV3(enm, lod as SceneLod);
    const kandydaci = [para.wskazanie, ...(para.utworzone ?? [])].filter((r): r is string => !!r);
    const pierwszyRozwiazywalny = kandydaci.find((r) => trafienia(scene, r).znaleziono) ?? null;
    wiersz[`L${lod}`] = {
      wskazanie_rozwiazywalne: para.wskazanie ? trafienia(scene, para.wskazanie).znaleziono : false,
      pierwszy_rozwiazywalny_kandydat: pierwszyRozwiazywalny,
      pozycja_kandydata: pierwszyRozwiazywalny ? kandydaci.indexOf(pierwszyRozwiazywalny) : null,
      rozmiar: pierwszyRozwiazywalny ? trafienia(scene, pierwszyRozwiazywalny).rozmiar : null,
    };
  }
  wynik.push(wiersz);
}
console.log(JSON.stringify(wynik, null, 2));
