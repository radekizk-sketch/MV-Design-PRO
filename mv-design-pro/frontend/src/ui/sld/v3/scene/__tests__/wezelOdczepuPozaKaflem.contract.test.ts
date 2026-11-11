// @vitest-environment node
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
 *  (d) opis pola ∩ symbol, opis pola ∩ inny napis, opis pola ∩ przewód — zero;
 *  (f) kod ramki bloku zabezpieczeń nigdy nie jest zasłonięty;
 *  (kol-a…e) kolumny opisów pola (wzorzec właściciela 2026-11-05, `naruszeniaKolumnOpisow`).
 *
 * Iloczyn cech: fikstura (58 plików z modelem ENM, loader jak `wezlyMostkiRozlacznoscFikstur`,
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
import { czySymbolQet, SYMBOL_DEFS } from '../../symbols/defs';
import { prostokatKaflaStanu } from '../../symbols/glyphs';
import { buildSceneV3, type SceneV3 } from '../buildScene';
import { buildW1cMatrixFixture } from './fixtures/w1cMatrixCatalog';
import {
  kolumnyOpisowPol,
  naruszeniaKodowRamki,
  naruszeniaKolumnOpisow,
  naruszeniaOpisowPola,
  obrysNaScenie,
  OPIS_POLA,
} from './wyroczniaOpisowPola';

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

const zKaflem = (s: SymbolSceny): boolean => czySymbolQet(s.symbolId) && QET_SYMBOLE_POLA_SN[s.symbolId].kafel !== null;

function kafelNaScenie(s: SymbolSceny): V3Rect {
  const k = prostokatKaflaStanu(s.symbolId);
  return { x: s.x + k.x, y: s.y + k.y, width: k.width, height: k.height };
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
  // (d) opisy pola — kolizje z symbolami, innymi napisami i przewodami (wspólna wyrocznia).
  n.push(...naruszeniaOpisowPola(scena));
  // (f) kod ramki bloku zabezpieczeń nigdy nie jest zasłonięty (werdykt B-02 2026-11-05).
  n.push(...naruszeniaKodowRamki(scena));
  // (kol-a…e) kolumny opisów pola przy jego lewej krawędzi (wzorzec właściciela 2026-11-05: „Opisy
  // pól po lewej dzięki temu pole robi się czytelniejsze i węższe”).
  n.push(...naruszeniaKolumnOpisow(scena));
  return n;
}

const SCENY = FIKSTURY.flatMap(([nazwa, enm]) => LODY.map((lod) => [nazwa, lod, enm] as const));

describe('węzeł odczepu poza kaflem i opisy pola bez kolizji — każda fikstura × LOD', () => {
  it('kontrola wejścia: 60 fikstur i macierz W1c', () => {
    // Scalenie karty UX-04/POLE-LINIOWE-WZORZEC do drzewa integracji (2026-11-11): +1 fikstura —
    // `harness-fixtures/generated/glowice_kablowe_pol_gpz.json` (scena głowic kablowych pól GPZ
    // karty BKR, strona integracji); pozostałe fikstury identyczne z czubkiem karty (sonda per
    // fikstura × LOD na obu drzewach).
    expect(FIKSTURY).toHaveLength(60);
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
    // (kol-…) ćwiczy iloczyn: rodzaj pola (GPZ, stacja) × LOD {1, 2} × opis (oznaczenie aparatu
    // toru głównego, aparatu kolumny odgałęzienia, aparatu bocznego; opis przekładnika — LOD2).
    const pokrycieKolumn = new Set<string>();
    for (const [, lod, enm] of SCENY) {
      const scena = buildSceneV3(enm, lod);
      for (const [pole, { oznaczenia, przekladnie }] of kolumnyOpisowPol(scena)) {
        const rodzaj = pole.startsWith('gpz/') ? 'gpz' : 'stacja';
        for (const l of oznaczenia) {
          const s = scena.symbols.find((x) => x.meta?.ownerRef === pole && l.symbolOpisu && x.x === l.symbolOpisu.x && x.y === l.symbolOpisu.y);
          const tor = s?.meta?.odgalezienieToru != null ? 'odgałęzienie' : 'tor';
          pokrycieKolumn.add(`${rodzaj}·L${lod}·oznaczenie·${tor}`);
        }
        if (przekladnie.length > 0) pokrycieKolumn.add(`${rodzaj}·L${lod}·przekładnia`);
      }
    }
    expect([...pokrycieKolumn].sort()).toEqual([
      'gpz·L1·oznaczenie·odgałęzienie',
      'gpz·L1·oznaczenie·tor',
      'gpz·L2·oznaczenie·odgałęzienie',
      'gpz·L2·oznaczenie·tor',
      'gpz·L2·przekładnia',
      'stacja·L1·oznaczenie·odgałęzienie',
      'stacja·L1·oznaczenie·tor',
      'stacja·L2·oznaczenie·odgałęzienie',
      'stacja·L2·oznaczenie·tor',
      'stacja·L2·przekładnia',
    ]);
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

  // Oznaczenie aparatu kolumny odgałęzienia (Q5 pola Z.11.1/Z.11) i jego symbol.
  const symbolGalezi = scena.symbols.find((s) => s.meta?.odgalezienieToru != null && scena.labels.some((l) => l.symbolOpisu?.x === s.x && l.symbolOpisu?.y === s.y))!;
  const oznaczenieGalezi = scena.labels.find((l) => l.symbolOpisu?.x === symbolGalezi.x && l.symbolOpisu?.y === symbolGalezi.y && /#etykieta-aparatu-/.test(l.ownerRef))!;

  it('oznaczenie aparatu odgałęzienia przy jego symbolu zamiast w kolumnie oznaczeń (dawny podpis Q5 przy kolumnie) → (kol-a) i (kol-c)', () => {
    expect(oznaczenieGalezi, 'oznaczenie aparatu odgałęzienia w scenie Z.11').toBeTruthy();
    const z: SceneV3 = {
      ...scena,
      labels: scena.labels.map((l) =>
        l === oznaczenieGalezi ? { ...l, rect: { ...l.rect, x: symbolGalezi.x + SYMBOL_DEFS[symbolGalezi.symbolId].width + 8 } } : l,
      ),
    };
    const w = naruszenia(z);
    expect(w.some((x) => x.startsWith('(kol-a)'))).toBe(true);
    expect(w.some((x) => x.startsWith(`(kol-c) ${oznaczenieGalezi.ownerRef}`))).toBe(true);
  });

  it('kolumna odgałęzienia odsunięta od toru głównego (dawny pas opisów przed kolumną) → (kol-e)', () => {
    const pole = symbolGalezi.meta!.ownerRef!;
    const z: SceneV3 = {
      ...scena,
      symbols: scena.symbols.map((s) => (s.meta?.ownerRef === pole && s.meta?.odgalezienieToru != null ? { ...s, x: s.x + 80 } : s)),
    };
    expect(naruszenia(z).some((x) => x.startsWith(`(kol-e) ${pole}`))).toBe(true);
  });

  it('opis przekładnika poza wierszem oznaczenia swojego aparatu → (kol-b)', () => {
    const tabliczka = scena.labels.find((l) => /#(ct|vt|cbct)-rating-/.test(l.ownerRef) && l.symbolOpisu)!;
    const z: SceneV3 = {
      ...scena,
      labels: scena.labels.map((l) => (l === tabliczka ? { ...l, rect: { ...l.rect, y: l.rect.y + 16 } } : l)),
    };
    expect(naruszenia(z).some((x) => x.startsWith(`(kol-b) ${tabliczka.ownerRef}`))).toBe(true);
  });

  it('opis pola na przewodzie toru (dawny korytarz magistrali przez blok kodów) → (d) przewód', () => {
    const przewod = torMocy(scena).find((g) => g.points.length >= 2 && g.points[0].y !== g.points[1].y)!;
    const a = przewod.points[0];
    const b = przewod.points[1];
    const y = (a.y + b.y) / 2 - opis.rect.height / 2;
    expect(naruszenia(przesun(a.x - opis.rect.width / 2, y)).some((x) => x.startsWith(`(d) ${opis.ownerRef} ∩ przewód`))).toBe(true);
  });
});
