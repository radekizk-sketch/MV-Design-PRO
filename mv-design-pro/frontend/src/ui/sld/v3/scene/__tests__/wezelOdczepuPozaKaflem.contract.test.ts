/**
 * Kontrakt odbioru B-02 pola liniowego (UX04 §11.20, decyzja architekta 2026-11-04 pkt 2 i karta
 * POLE-LINIOWE ODBIÓR B-02): odczep z aparatu z kaflem stanu zaczyna się w WĘŹLE poza kaflem,
 * a opisy pola (zaciski P1/P2, tabliczki przekładników, kody zabezpieczenia) nie kolidują
 * z rysunkiem ani ze sobą.
 *
 * Wyrocznie niezależne od kompozytora — geometria kafla z rejestru QET (`prostokatKaflaStanu`),
 * porty z definicji symboli, nie z pozycji liczonych przez `apparatusSequence`:
 *  (a) środek kropki węzłowej nie leży na prostokącie kafla (domkniętym — krawędź też jest kaflem);
 *  (b) port toru aparatu z kaflem jest końcem lub punktem przejścia NAJWYŻEJ jednego odcinka
 *      toru — dwa odcinki w jednym porcie to rozgałęzienie na krawędzi kafla (dawny odczep
 *      wprost z portu S wyłącznika);
 *  (c) koniec odcinka toru leżący na kaflu jest portem symbolu tego kafla;
 *  (d) opis pola ∩ symbol, opis pola ∩ inny napis, opis pola ∩ przewód — zero.
 *
 * Iloczyn cech: fikstura (64 pliki z modelem ENM, loader jak `wezlyMostkiRozlacznoscFikstur`,
 * plus macierz W1c pól stacji) × LOD {0, 1, 2} × wyrocznia (a)–(d). Iniekcje: kropka i odczep
 * przesunięte na port wyłącznika, opis nałożony na symbol, napis i przewód.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { QET_SYMBOLE_POLA_SN } from '../../cad/qet/qetPoleSn';
import type { V3Rect } from '../../core/grid';
import { czySymbolQet, obrysSymbolu, SYMBOL_DEFS } from '../../symbols/defs';
import { prostokatKaflaStanu } from '../../symbols/glyphs';
import { buildSceneV3, labelWireCollisions, type SceneV3 } from '../buildScene';
import { buildW1cMatrixFixture } from './fixtures/w1cMatrixCatalog';

const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(here, '../../../../../..');
const KATALOGI = [
  'public/test-fixtures',
  'src/harness-fixtures/generated',
  'src/ui/sld/v2/geometry/__tests__/fixtures',
  'src/ui/sld/v3/canvas/__tests__/fixtures',
  'src/ui/sld/v3/scene/__tests__/fixtures',
];

function modelPliku(sciezka: string): EnergyNetworkModel | null {
  const raw = JSON.parse(readFileSync(sciezka, 'utf8')) as Record<string, unknown> | unknown[];
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const kandydat of [raw, raw.enm, raw.snapshot]) {
    const enm = kandydat as Partial<EnergyNetworkModel> | undefined;
    if (enm && Array.isArray(enm.buses) && Array.isArray(enm.branches)) return enm as EnergyNetworkModel;
  }
  return null;
}

const FIKSTURY: readonly (readonly [string, EnergyNetworkModel])[] = [
  ...KATALOGI.flatMap((katalog) =>
    readdirSync(resolve(FRONTEND, katalog))
      .filter((plik) => plik.endsWith('.json'))
      .sort()
      .flatMap((plik): (readonly [string, EnergyNetworkModel])[] => {
        const enm = modelPliku(resolve(FRONTEND, katalog, plik));
        return enm == null ? [] : [[`${katalog}/${plik}`, enm] as const];
      }),
  ),
  ['macierz W1c (pola stacji)', buildW1cMatrixFixture().enm] as const,
];

const LODY = [0, 1, 2] as const;

type Punkt = { readonly x: number; readonly y: number };
type SymbolSceny = SceneV3['symbols'][number];

const naProstokacie = (p: Punkt, r: V3Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

const zachodzi = (a: V3Rect, b: V3Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const zKaflem = (s: SymbolSceny): boolean => czySymbolQet(s.symbolId) && QET_SYMBOLE_POLA_SN[s.symbolId].kafel !== null;

function kafelNaScenie(s: SymbolSceny): V3Rect {
  const k = prostokatKaflaStanu(s.symbolId);
  return { x: s.x + k.x, y: s.y + k.y, width: k.width, height: k.height };
}

/** Prostokąt `w` leży w całości wewnątrz `r` (krawędź wspólna dozwolona). */
function zawiera(r: V3Rect, w: V3Rect): boolean {
  return w.x >= r.x && w.y >= r.y && w.x + w.width <= r.x + r.width && w.y + w.height <= r.y + r.height;
}

function obrysNaScenie(s: SymbolSceny): V3Rect {
  const o = obrysSymbolu(s.symbolId);
  return { x: s.x + o.x, y: s.y + o.y, width: o.width, height: o.height };
}

const portyNaScenie = (s: SymbolSceny): Punkt[] => SYMBOL_DEFS[s.symbolId].ports.map((p) => ({ x: s.x + p.x, y: s.y + p.y }));

/** Punkt leży na łamanej (na wierzchołku albo we wnętrzu odcinka ortogonalnego lub ukośnego). */
function naLamanej(p: Punkt, pts: readonly Punkt[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const krzyz = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(krzyz) > 1e-6) continue;
    if (p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) return true;
  }
  return pts.length === 1 && pts[0].x === p.x && pts[0].y === p.y;
}

/** Odcinki toru mocy — bez linii obwodu wtórnego przekaźnika i bez odnośników opisów. */
const BEZ_TORU = new Set(['leader', 'protectionTrip', 'measurementLink', 'sheetContinuation', 'tieMarker']);
const torMocy = (scena: SceneV3) => scena.segments.filter((g) => !BEZ_TORU.has(g.meta?.kind ?? ''));

/** Opisy pola objęte kontraktem: zaciski P1/P2, tabliczki przekładników, wiersze kodów zabezpieczenia. */
const OPIS_POLA = /#(zacisk-przekladnika-|ct-rating-|vt-rating-|cbct-rating-|protection-codes-full)/;

function naruszenia(scena: SceneV3): string[] {
  const n: string[] = [];
  const kafle = scena.symbols.filter(zKaflem).map((s) => ({ s, k: kafelNaScenie(s) }));
  const tor = torMocy(scena);
  // (a) kropka na kaflu
  for (const kropka of scena.symbols.filter((s) => s.symbolId === 'junction')) {
    const c = { x: kropka.x + SYMBOL_DEFS.junction.width / 2, y: kropka.y + SYMBOL_DEFS.junction.height / 2 };
    for (const { s, k } of kafle) {
      if (naProstokacie(c, k)) n.push(`(a) kropka (${c.x},${c.y}) na kaflu ${s.symbolId} ${s.meta?.ownerRef ?? '—'}`);
    }
  }
  for (const { s, k } of kafle) {
    const porty = portyNaScenie(s);
    // (b) port aparatu z kaflem — najwyżej jeden odcinek toru
    for (const p of porty) {
      const ile = tor.filter((g) => naLamanej(p, g.points)).length;
      if (ile > 1) n.push(`(b) port (${p.x},${p.y}) ${s.symbolId} ${s.meta?.ownerRef ?? '—'}: ${ile} odcinków toru (rozgałęzienie na krawędzi kafla)`);
    }
    // (c) koniec odcinka na kaflu poza portem symbolu kafla
    for (const g of tor) {
      for (const e of [g.points[0], g.points[g.points.length - 1]]) {
        if (!naProstokacie(e, k)) continue;
        if (porty.some((p) => p.x === e.x && p.y === e.y)) continue;
        n.push(`(c) koniec ${g.meta?.ownerRef ?? '—'} (${e.x},${e.y}) na kaflu ${s.symbolId} ${s.meta?.ownerRef ?? '—'} poza portem`);
      }
    }
  }
  // (d) opisy pola — kolizje z symbolami, innymi napisami i przewodami
  const opisy = scena.labels.filter((l) => OPIS_POLA.test(l.ownerRef));
  for (const l of opisy) {
    for (const s of scena.symbols) {
      // Blok zabezpieczeń (UX04 §11.16, korekta v2 2026-11-04): symbolem jest prostokątna ramka
      // z meta sceny. Wiersz WŁASNEGO bloku leży w całości wewnątrz ramki; każdy inny opis jest
      // z ramką rozłączny.
      const r = s.meta?.ramkaBlokuPrzekaznika;
      if (s.symbolId === 'protectionRelay' && r) {
        const ramka = { x: s.x + r.x, y: s.y + r.y, width: r.width, height: r.height };
        const wlasny = (s.meta?.wierszeBlokuPrzekaznika ?? []).includes(l.ownerRef);
        if (wlasny ? !zawiera(ramka, l.rect) : zachodzi(l.rect, ramka)) {
          n.push(`(d) ${l.ownerRef} ${wlasny ? 'poza ramką' : '∩ ramka'} bloku ${s.meta?.ownerRef ?? '—'}`);
        }
        continue;
      }
      if (zachodzi(l.rect, obrysNaScenie(s))) n.push(`(d) ${l.ownerRef} ∩ symbol ${s.symbolId} ${s.meta?.ownerRef ?? '—'}`);
    }
    for (const inna of scena.labels) {
      if (inna !== l && zachodzi(l.rect, inna.rect)) n.push(`(d) ${l.ownerRef} ∩ napis ${inna.ownerRef}`);
    }
  }
  for (const k of labelWireCollisions(scena)) {
    if (OPIS_POLA.test(k.ownerRef)) n.push(`(d) ${k.ownerRef} ∩ przewód ${scena.segments[k.segmentIndex].meta?.ownerRef ?? '—'}`);
  }
  return n;
}

const SCENY = FIKSTURY.flatMap(([nazwa, enm]) => LODY.map((lod) => [nazwa, lod, enm] as const));

describe('węzeł odczepu poza kaflem i opisy pola bez kolizji — każda fikstura × LOD', () => {
  it('kontrola wejścia: 64 fikstury i macierz W1c', () => {
    // Pomiar 2026-11-05 (karta POLA-GPZ-SZABLONY, następca 7): 60 → 64 — sceny generatora
    // `gpz110kvPolaSzablonow`, `gpz110kvPoleZu{Z13,Z14,Z15}` (public/test-fixtures).
    expect(FIKSTURY).toHaveLength(64);
  });

  it.each(SCENY)('%s L%i', (_nazwa, lod, enm) => {
    expect(naruszenia(buildSceneV3(enm, lod))).toEqual([]);
  });

  it('zbiór nie jest pusty z konstrukcji: kropki przy aparatach z kaflem, opisy każdego rodzaju', () => {
    let kropkiPrzyKaflu = 0;
    const rodzaje = new Set<string>();
    for (const [, lod, enm] of SCENY) {
      const scena = buildSceneV3(enm, lod);
      const kafle = scena.symbols.filter(zKaflem).map(kafelNaScenie);
      for (const kropka of scena.symbols.filter((s) => s.symbolId === 'junction')) {
        const c = { x: kropka.x + SYMBOL_DEFS.junction.width / 2, y: kropka.y + SYMBOL_DEFS.junction.height / 2 };
        // Kropka w odległości jednego oczka od krawędzi kafla — węzeł odczepu aparatu z kaflem.
        if (kafle.some((k) => naProstokacie(c, { x: k.x - 8, y: k.y - 8, width: k.width + 16, height: k.height + 16 }))) kropkiPrzyKaflu++;
      }
      for (const l of scena.labels) {
        const m = OPIS_POLA.exec(l.ownerRef);
        if (m) rodzaje.add(m[1]);
      }
    }
    expect(kropkiPrzyKaflu).toBeGreaterThan(0);
    expect([...rodzaje].sort()).toEqual(['cbct-rating-', 'ct-rating-', 'protection-codes-full', 'vt-rating-', 'zacisk-przekladnika-']);
  });
});

describe('wyrocznie kontraktu — iniekcje na realnej scenie pola Z.11', () => {
  const enm = FIKSTURY.find(([n]) => n.endsWith('pole_liniowe_z11_gpz_odgalezienie.json'))![1];
  const scena = buildSceneV3(enm, 2);
  const kropka = scena.symbols.find((s) => s.symbolId === 'junction')!;
  const wylacznik = scena.symbols.find((s) => zKaflem(s) && SYMBOL_DEFS[s.symbolId].ports.length === 2)!;
  const portS = portyNaScenie(wylacznik).sort((a, b) => b.y - a.y)[0];
  const opis = scena.labels.find((l) => OPIS_POLA.test(l.ownerRef))!;

  it('scena wejściowa jest czysta', () => {
    expect(naruszenia(scena)).toEqual([]);
    expect(kropka && wylacznik && opis).toBeTruthy();
  });

  it('kropka i odczep w porcie aparatu z kaflem (dawny odczep z krawędzi kafla) → (a) i (b)', () => {
    const j = SYMBOL_DEFS.junction;
    const z: SceneV3 = {
      ...scena,
      symbols: [...scena.symbols, { ...kropka, x: portS.x - j.width / 2, y: portS.y - j.height / 2 }],
      segments: [...scena.segments, { points: [portS, { x: portS.x + 80, y: portS.y }], meta: { kind: 'sn', ownerRef: 'iniekcja#lateral-0' } } as SceneV3['segments'][number]],
    };
    const w = naruszenia(z);
    expect(w.some((x) => x.startsWith('(a)'))).toBe(true);
    expect(w.some((x) => x.startsWith('(b)'))).toBe(true);
  });

  it('odcinek kończący się we wnętrzu kafla → (c)', () => {
    const k = kafelNaScenie(wylacznik);
    const srodek = { x: k.x + k.width / 2 + 4, y: k.y + k.height / 2 };
    const z: SceneV3 = {
      ...scena,
      segments: [...scena.segments, { points: [{ x: srodek.x + 200, y: srodek.y }, srodek], meta: { kind: 'sn', ownerRef: 'iniekcja#lateral-0' } } as SceneV3['segments'][number]],
    };
    expect(naruszenia(z).some((x) => x.startsWith('(c)'))).toBe(true);
  });

  const przesun = (x: number, y: number): SceneV3 => ({
    ...scena,
    labels: scena.labels.map((l) => (l === opis ? { ...l, rect: { ...l.rect, x, y } } : l)),
  });

  it('opis pola nałożony na symbol → (d) symbol', () => {
    const o = obrysNaScenie(wylacznik);
    expect(naruszenia(przesun(o.x, o.y)).some((x) => x.startsWith(`(d) ${opis.ownerRef} ∩ symbol`))).toBe(true);
  });

  it('opis pola nałożony na inny napis → (d) napis', () => {
    const inny = scena.labels.find((l) => l !== opis && !OPIS_POLA.test(l.ownerRef))!;
    expect(naruszenia(przesun(inny.rect.x, inny.rect.y)).some((x) => x.startsWith(`(d) ${opis.ownerRef} ∩ napis`))).toBe(true);
  });

  it('opis pola na przewodzie toru (dawny korytarz magistrali przez blok kodów) → (d) przewód', () => {
    const przewod = torMocy(scena).find((g) => g.points.length >= 2 && g.points[0].y !== g.points[1].y)!;
    const a = przewod.points[0];
    const b = przewod.points[1];
    const y = (a.y + b.y) / 2 - opis.rect.height / 2;
    expect(naruszenia(przesun(a.x - opis.rect.width / 2, y)).some((x) => x.startsWith(`(d) ${opis.ownerRef} ∩ przewód`))).toBe(true);
  });
});
