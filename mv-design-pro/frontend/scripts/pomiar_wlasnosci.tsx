/**
 * BLOK-LATERAL-WLASNOSC — POMIAR PRZYCZYN ROZCIĄGNIĘCIA RAMY BLOKU.
 *
 * Karta BLOK-PUSTY zamknęła pkt 6 zgłoszenia właściciela („wnętrze ramy stacji
 * w większości puste") tylko na L0/L1. Na L2 — tam, gdzie właściciel patrzył —
 * poprawa wyniosła 1,2 pkt proc. (87,7% → 86,5%) i 11/54 bloków zostało ponad
 * progiem 90%. Ten skrypt ROZBIJA tę resztę NA PRZYCZYNY, zamiast podawać jedną
 * liczbę: rama bloku (kotwica `canvas/viewAnchor.ts` `prostokatElementuWScenie`,
 * ta sama funkcja co B-2 i `pomiar_bloku.tsx` — zero drugiej implementacji)
 * powstaje z obiektów, których `ownerRef` NALEŻY do refu bloku. Jeśli obiekt
 * należy do bloku, a OPISUJE co innego (np. podpis odcinka odgałęźnego stojący
 * przy magistrali, ~1900 j.św. wyżej), rama rozciąga się na PUSTĄ przestrzeń
 * między nimi.
 *
 * CO MIERZY:
 *   (A) dla każdego rodzaju etykiety — o ile ROŚNIE prostokąt bloku przez
 *       etykiety TEGO rodzaju (bbox pełny minus bbox bez nich), osobno w X i Y;
 *   (B) ile bloków ma niezerowy przyrost od danego rodzaju, na których LOD;
 *   (C) dla 11 bloków L2 ponad progiem pustki — ile z nich schodzi pod próg po
 *       usunięciu z ramy etykiet danego rodzaju (= przyczyna JEST tu sprawcza),
 *       a ile zostaje (= przyczyna INNA, do nazwania osobno).
 *
 * Skrypt jest DIAGNOSTYCZNY (przed/po), nie jest bramką — pomiar bramkowy
 * (kontrakt) siedzi w `src/ui/sld/v3/**__tests__`.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   npx vite-node scripts/pomiar_wlasnosci.tsx
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { prostokatElementuWScenie } from '../src/ui/sld/v3/canvas/viewAnchor';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs';
import { SEGMENT_STROKE_WIDTH, type PreviewSegmentKind } from '../src/ui/sld/v3/compose/preview';
import { measureLabelWidth } from '../src/ui/sld/v3/core/text';
import type { OwnerKind } from '../src/ui/sld/v3/layout/labels';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  HERE,
  '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json',
);
const enm = JSON.parse(readFileSync(fixturePath, 'utf8')).enm as EnergyNetworkModel;

const REF_BLOKU = /^(stn|gpz)\/([0-9a-f]+)\//;
const KOMORKA = 2;
const PROG_PUSTKI = 0.9;

function nalezyDo(owner: string | undefined | null, ref: string): boolean {
  return !!owner && (owner === ref || owner.startsWith(`${ref}#`));
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Prostokąt bloku POMIJAJĄCY etykiety wskazanych rodzajów — reszta liczona
 *  identycznie jak w `prostokatElementuWScenie` (symbole + odcinki + etykiety). */
function prostokatBezRodzajow(
  scene: SceneV3,
  ref: string,
  pomijane: ReadonlySet<OwnerKind>,
): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const obejmij = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const s of scene.symbols) {
    if (!nalezyDo(s.meta?.ownerRef, ref)) continue;
    const def = SYMBOL_DEFS[s.symbolId];
    obejmij(s.x, s.y);
    obejmij(s.x + def.width, s.y + def.height);
  }
  for (const g of scene.segments) {
    if (!nalezyDo(g.meta?.ownerRef, ref)) continue;
    for (const p of g.points) obejmij(p.x, p.y);
  }
  for (const l of scene.labels) {
    if (!nalezyDo(l.ownerRef, ref)) continue;
    if (pomijane.has(l.ownerKind)) continue;
    obejmij(l.rect.x, l.rect.y);
    obejmij(l.rect.x + l.rect.width, l.rect.y + l.rect.height);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

interface Prostokat {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function tuszSceny(scene: SceneV3): readonly Prostokat[] {
  const out: Prostokat[] = [];
  for (const symbol of scene.symbols) {
    const def = SYMBOL_DEFS[symbol.symbolId];
    out.push({ x: symbol.x, y: symbol.y, width: def.width, height: def.height });
  }
  for (const segment of scene.segments) {
    const kind = segment.meta?.kind as PreviewSegmentKind | undefined;
    const w = kind && kind in SEGMENT_STROKE_WIDTH ? SEGMENT_STROKE_WIDTH[kind] : 0.8;
    const pts = segment.points;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      out.push({
        x: Math.min(a.x, b.x) - w / 2,
        y: Math.min(a.y, b.y) - w / 2,
        width: Math.abs(b.x - a.x) + w,
        height: Math.abs(b.y - a.y) + w,
      });
    }
  }
  for (const label of scene.labels) {
    const szer = Math.min(label.rect.width, measureLabelWidth(label.text, label.labelClass));
    out.push({ x: label.rect.x, y: label.rect.y, width: szer, height: label.rect.height });
  }
  return out;
}

/** Udział pustego tuszu wewnątrz podanego prostokąta (raster, jak BLOK-PUSTY). */
function pustkaW(box: Box, tusz: readonly Prostokat[]): number {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (w <= 0 || h <= 0) return Number.NaN;
  const kolumny = Math.max(1, Math.ceil(w / KOMORKA));
  const wiersze = Math.max(1, Math.ceil(h / KOMORKA));
  const zajete = new Uint8Array(kolumny * wiersze);
  for (const r of tusz) {
    if (r.x + r.width < box.minX || r.x > box.maxX) continue;
    if (r.y + r.height < box.minY || r.y > box.maxY) continue;
    const i0 = Math.max(0, Math.floor((r.x - box.minX) / KOMORKA));
    const i1 = Math.min(kolumny - 1, Math.ceil((r.x + r.width - box.minX) / KOMORKA) - 1);
    const j0 = Math.max(0, Math.floor((r.y - box.minY) / KOMORKA));
    const j1 = Math.min(wiersze - 1, Math.ceil((r.y + r.height - box.minY) / KOMORKA) - 1);
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) zajete[j * kolumny + i] = 1;
  }
  let z = 0;
  for (let k = 0; k < zajete.length; k += 1) z += zajete[k];
  return 1 - z / (kolumny * wiersze);
}

function blokiSceny(scene: SceneV3): readonly { korzen: string; ref: string }[] {
  const zbior = new Map<string, string>();
  const zobacz = (owner: string): void => {
    const m = REF_BLOKU.exec(owner);
    if (!m) return;
    const korzen = `${m[1]}/${m[2]}`;
    zbior.set(korzen, `${korzen}/${m[1] === 'gpz' ? 'substation' : 'station'}`);
  };
  for (const s of scene.symbols) zobacz(String(s.meta?.ownerRef ?? ''));
  for (const l of scene.labels) zobacz(l.ownerRef);
  for (const g of scene.segments) zobacz(String(g.meta?.ownerRef ?? ''));
  return [...zbior]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([korzen, ref]) => ({ korzen, ref }));
}

function nazwyBlokow(scene: SceneV3): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const l of scene.labels) {
    if (l.ownerKind !== 'station-name') continue;
    const m = REF_BLOKU.exec(l.ownerRef);
    if (!m) continue;
    const korzen = `${m[1]}/${m[2]}`;
    if (!out.has(korzen)) out.set(korzen, l.text);
  }
  return out;
}

const f = (v: number, n = 0): string => (Number.isFinite(v) ? v.toFixed(n) : '—');
const proc = (v: number): string => `${(v * 100).toFixed(1)}%`;

console.log('=== BLOK-LATERAL-WLASNOSC — PRZYCZYNY ROZCIĄGNIĘCIA RAMY ===');
console.log('rama = `prostokatElementuWScenie` (ta sama funkcja co kotwica B-2)');
console.log('');

for (const lod of [0, 1, 2] as const) {
  const scene = buildSceneV3(enm, lod);
  const tusz = tuszSceny(scene);
  const nazwy = nazwyBlokow(scene);
  const bloki = blokiSceny(scene);

  // Rodzaje etykiet występujące w scenie.
  const rodzaje = [...new Set(scene.labels.map((l) => l.ownerKind))].sort();

  console.log(`--- L${lod} · bloków ${bloki.length} · rodzajów etykiet ${rodzaje.length} ---`);
  console.log('rodzaj etykiety      | bloków rozciąga | maks ΔY | maks ΔX | mediana ΔY (rozciąganych)');
  for (const rodzaj of rodzaje) {
    const pomijane = new Set<OwnerKind>([rodzaj]);
    const dY: number[] = [];
    const dX: number[] = [];
    for (const { ref } of bloki) {
      const pelny = prostokatElementuWScenie(scene, ref);
      const bez = prostokatBezRodzajow(scene, ref, pomijane);
      if (!pelny || !bez) continue;
      const y = pelny.maxY - pelny.minY - (bez.maxY - bez.minY);
      const x = pelny.maxX - pelny.minX - (bez.maxX - bez.minX);
      if (y > 0.001 || x > 0.001) {
        dY.push(y);
        dX.push(x);
      }
    }
    if (dY.length === 0) continue;
    const med = [...dY].sort((a, b) => a - b)[Math.floor(dY.length / 2)];
    console.log(
      `${rodzaj.padEnd(20)} | ${String(dY.length).padStart(15)} | ${f(Math.max(...dY)).padStart(7)} | ${f(Math.max(...dX)).padStart(7)} | ${f(med).padStart(25)}`,
    );
  }

  // Rozbicie bloków ponad progiem pustki PER PRZYCZYNA.
  const ponadProg = bloki
    .map(({ korzen, ref }) => {
      const pelny = prostokatElementuWScenie(scene, ref);
      if (!pelny) return null;
      return { ref, nazwa: nazwy.get(korzen) ?? korzen, box: pelny, pustka: pustkaW(pelny, tusz) };
    })
    .filter((b): b is NonNullable<typeof b> => b != null && b.pustka > PROG_PUSTKI);

  console.log(`  bloków ponad progiem pustki ${proc(PROG_PUSTKI)}: ${ponadProg.length}/${bloki.length}`);
  if (ponadProg.length > 0) {
    console.log('  nazwa                | rama [j.św.] | pustka | bez `segment-lateral` → rama · pustka');
    for (const b of [...ponadProg].sort((p, q) => q.pustka - p.pustka)) {
      const bez = prostokatBezRodzajow(scene, b.ref, new Set<OwnerKind>(['segment-lateral']));
      const opis = bez
        ? `${f(bez.maxX - bez.minX)}×${f(bez.maxY - bez.minY)} · ${proc(pustkaW(bez, tusz))}`
        : '—';
      console.log(
        `  ${b.nazwa.padEnd(20)} | ${`${f(b.box.maxX - b.box.minX)}×${f(b.box.maxY - b.box.minY)}`.padStart(12)} | ${proc(b.pustka).padStart(6)} | ${opis}`,
      );
    }
  }
  console.log('');
}

// Inwentarz: które etykiety noszą ref bloku, a stoją POZA jego rdzeniem
// (rdzeń = prostokąt bez etykiet `segment-*`). Wypisuje surowe fakty, bez progu.
console.log('=== L2 — ETYKIETY NIOSĄCE REF BLOKU, ROZBICIE PO SUFIKSIE REFU ===');
{
  const scene = buildSceneV3(enm, 2);
  const licznik = new Map<string, { n: number; rodzaje: Set<string> }>();
  for (const l of scene.labels) {
    const sufiks = l.ownerRef.includes('#') ? `#${l.ownerRef.split('#')[1]}` : '(bez sufiksu)';
    const wpis = licznik.get(sufiks) ?? { n: 0, rodzaje: new Set<string>() };
    wpis.n += 1;
    wpis.rodzaje.add(l.ownerKind);
    licznik.set(sufiks, wpis);
  }
  const wiersze = [...licznik].sort((a, b) => b[1].n - a[1].n);
  console.log('sufiks refu               | szt. | rodzaje');
  for (const [sufiks, wpis] of wiersze) {
    console.log(`${sufiks.padEnd(25)} | ${String(wpis.n).padStart(4)} | ${[...wpis.rodzaje].join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// R3/R4 — DRUGI KONIEC PARY: kotwiczenie kamery (B-2) po zmianie własności.
// ---------------------------------------------------------------------------
console.log('');
console.log('=== R4 — KOTWICZENIE (B-2 wymaga rysunku na WSZYSTKICH trzech poziomach) ===');
{
  const sceneByLod = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) } as const;
  const bloki = blokiSceny(sceneByLod[2]);
  const nazwy = nazwyBlokow(sceneByLod[2]);

  const naTrzech = (ref: string): boolean =>
    ([0, 1, 2] as const).every((lod) => prostokatElementuWScenie(sceneByLod[lod], ref) != null);

  // (a) STACJE / GPZ
  const stacjeOk = bloki.filter((b) => naTrzech(b.ref)).length;
  console.log(`kotwica na STACJI/GPZ: ${stacjeOk}/${bloki.length} refów narysowanych na L0+L1+L2`);

  // (b) POLA — refy pól z etykiet `field-role` (`bay.bayRef`).
  const pola = [
    ...new Set(
      sceneByLod[2].labels
        .filter((l) => l.ownerKind === 'field-role')
        .map((l) => l.ownerRef.split('#')[0]),
    ),
  ];
  const polaOk = pola.filter(naTrzech).length;
  console.log(`kotwica na POLU: ${polaOk}/${pola.length} refów narysowanych na L0+L1+L2`);

  // (c) ODCINKI ZEJŚCIA LATERALU — nowi właściciele podpisu odgałęzienia.
  const zejscia = [
    ...new Set(
      sceneByLod[2].labels
        .filter((l) => l.ownerKind === 'segment-lateral')
        .map((l) => l.ownerRef.split('#')[0]),
    ),
  ];
  const zejsciaOk = zejscia.filter(naTrzech).length;
  console.log(`kotwica na ODCINKU ZEJŚCIA: ${zejsciaOk}/${zejscia.length} refów narysowanych na L0+L1+L2`);

  // (d) ODCINKI PRZĘSEŁ POZIOMYCH — nowi właściciele podpisu przęsła.
  const przesla = [
    ...new Set(
      sceneByLod[2].labels
        .filter((l) => l.ownerKind === 'segment-span')
        .map((l) => l.ownerRef.split('#')[0]),
    ),
  ];
  const przeslaOk = przesla.filter(naTrzech).length;
  console.log(`kotwica na PRZĘŚLE: ${przeslaOk}/${przesla.length} refów narysowanych na L0+L1+L2`);

  // (e) Czy podpis LEŻY NA swoim odcinku — i o ile rozciąga jego prostokąt.
  console.log('');
  console.log('prostokąt ODCINKA ZEJŚCIA (L2): z podpisem vs. bez podpisu');
  console.log('ref odcinka                       | z podpisem | bez podpisu | ΔY | podpis wewnątrz odcinka?');
  for (const ref of zejscia) {
    const zLab = prostokatElementuWScenie(sceneByLod[2], ref);
    const bez = prostokatBezRodzajow(sceneByLod[2], ref, new Set<OwnerKind>(['segment-lateral']));
    if (!zLab || !bez) continue;
    const lab = sceneByLod[2].labels.find(
      (l) => l.ownerKind === 'segment-lateral' && l.ownerRef.startsWith(`${ref}#`),
    );
    const wewnatrz =
      lab != null
      && lab.rect.x >= bez.minX - 0.001
      && lab.rect.x + lab.rect.width <= bez.maxX + 0.001
      && lab.rect.y >= bez.minY - 0.001
      && lab.rect.y + lab.rect.height <= bez.maxY + 0.001;
    console.log(
      `${ref.padEnd(33)} | ${`${f(zLab.maxX - zLab.minX)}×${f(zLab.maxY - zLab.minY)}`.padStart(10)} | ${`${f(bez.maxX - bez.minX)}×${f(bez.maxY - bez.minY)}`.padStart(11)} | ${f(zLab.maxY - zLab.minY - (bez.maxY - bez.minY)).padStart(3)} | ${wewnatrz ? 'TAK' : 'NIE'}`,
    );
  }

  // (f) Blok „Stacja L4-1" — najgorszy przypadek karty, przed↔po jednym okiem.
  const l41 = bloki.find(({ korzen }) => (nazwy.get(korzen) ?? '') === 'Stacja L4-1');
  if (l41) {
    for (const lod of [0, 1, 2] as const) {
      const b = prostokatElementuWScenie(sceneByLod[lod], l41.ref);
      console.log(
        `Stacja L4-1 · L${lod}: rama ${b ? `${f(b.maxX - b.minX)}×${f(b.maxY - b.minY)}` : 'BRAK'} j.św.`,
      );
    }
  }
}
