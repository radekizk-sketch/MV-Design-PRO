// @vitest-environment node
/**
 * KARTA SLD-CZYTELNOSC-STACJI (ocena właściciela widoku stacji 0/10, 2026-11-11) —
 * ODEJŚCIA KADRU: odpływ wychodzący za ramkę kadru stacji kończy się znakiem
 * kontynuacji z nazwą obiektu na drugim końcu, a ramka kadru obejmuje znak i opis.
 *
 * ILOCZYN CECH (reguła KLASA §2): każda stacja rysunku (zwykła i GPZ) × poziom L1/L2
 * × skala kadru {dolny brzeg L1 0,51 · 0,8 · 1,2} × kierunek wyjścia trasy (zmierzony
 * na fiksturze — wszystkie występujące kierunki pokryte asercją rozkładu).
 * Oczekiwanie wyprowadzone z MODELU niezależnie od implementacji: gałęzie
 * (bez łączników) o dokładnie jednym końcu w stacji; nazwa celu = nazwa stacji
 * drugiego końca z rekordów `substations`/`bays`.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { MIN_READABLE_LABEL_SCREEN_PX } from '../../core/text';
import { prostokatRefowWScenie } from '../viewAnchor';
import {
  OPIS_ODEJSCIA_PX,
  obrysOdejscia,
  odejsciaKadru,
  pismoOpisuOdejscia,
  prostokatyZakresu,
  zakresCelu,
  type ZakresKadru,
} from '../zakresKadru';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8')) as {
    enm: EnergyNetworkModel;
  }
).enm;
const sceny = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) } as const;
const stacje = sceny[2].meta.stationTraversalOrder;
const LACZNIKI = new Set(['switch', 'breaker', 'bus_coupler', 'disconnector', 'fuse']);

/** Stacja szyny wprost z rekordów (niezależnie od indeksu modułu). */
const stacjaSzyny = new Map<string, string>();
for (const st of enm.substations ?? []) for (const b of st.bus_refs ?? []) stacjaSzyny.set(b, st.ref_id);
for (const bay of enm.bays ?? []) {
  if (!bay.substation_ref) continue;
  if (!stacjaSzyny.has(bay.bus_ref)) stacjaSzyny.set(bay.bus_ref, bay.substation_ref);
  if (bay.terminal_bus_ref && !stacjaSzyny.has(bay.terminal_bus_ref)) stacjaSzyny.set(bay.terminal_bus_ref, bay.substation_ref);
}
const nazwaStacji = new Map((enm.substations ?? []).map((s) => [s.ref_id, s.name] as const));

function zakresStacji(st: string): ZakresKadru {
  const w = zakresCelu('stacja', enm, [st], sceny[2]);
  if (!w.dostepny) throw new Error(w.przyczyna);
  return w.zakres;
}

/** Szyny sąsiednie przez dowolną gałąź (rekordy `branches`). */
const sasiedzi = new Map<string, string[]>();
for (const br of enm.branches ?? []) {
  sasiedzi.set(br.from_bus_ref, [...(sasiedzi.get(br.from_bus_ref) ?? []), br.to_bus_ref]);
  sasiedzi.set(br.to_bus_ref, [...(sasiedzi.get(br.to_bus_ref) ?? []), br.from_bus_ref]);
}
/** Nazwy stacji za szyną spoza stacji (złącze, punkt odgałęźny) — przejście w głąb do stacji. */
function stacjeZa(szyna: string, wlasna: string): string[] {
  const wynik = new Set<string>();
  const stos = [szyna];
  const byly = new Set([szyna]);
  while (stos.length) {
    for (const n of sasiedzi.get(stos.pop()!) ?? []) {
      if (byly.has(n)) continue;
      byly.add(n);
      const st = stacjaSzyny.get(n);
      if (st) {
        if (st !== wlasna) wynik.add(st);
      } else stos.push(n);
    }
  }
  return [...wynik].sort();
}

/** Oczekiwane odejścia stacji z modelu: gałąź → nazwa obiektu na drugim końcu. */
function oczekiwane(st: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const br of enm.branches ?? []) {
    if (LACZNIKI.has(br.type)) continue;
    const z = stacjaSzyny.get(br.from_bus_ref);
    const d = stacjaSzyny.get(br.to_bus_ref);
    if ((z === st) === (d === st)) continue;
    const daleka = z === st ? d : z;
    const dalekaSzyna = z === st ? br.to_bus_ref : br.from_bus_ref;
    if (daleka) out.set(br.ref_id, nazwaStacji.get(daleka)!);
    else {
      const za = stacjeZa(dalekaSzyna, st);
      out.set(br.ref_id, za.length ? za.map((s) => nazwaStacji.get(s)!).join(', ') : (enm.buses ?? []).find((b) => b.ref_id === dalekaSzyna)!.name);
    }
  }
  return out;
}

const zawiera = (zew: { minX: number; minY: number; maxX: number; maxY: number }, w: typeof zew) =>
  w.minX >= zew.minX - 1e-6 && w.minY >= zew.minY - 1e-6 && w.maxX <= zew.maxX + 1e-6 && w.maxY <= zew.maxY + 1e-6;

describe('odejścia kadru stacji — iloczyn stacja × poziom × skala', () => {
  const kierunki = new Set<string>();
  for (const lod of [1, 2] as const) {
    it.each(stacje.map((st) => [nazwaStacji.get(st) ?? st, st]))(`L${lod} %s: każdy odpływ do sąsiada ma znak z nazwą celu na krawędzi ramki`, (_n, st) => {
      const zakres = zakresStacji(st);
      const refy = new Set(zakres.refy);
      const baza = prostokatRefowWScenie(sceny[lod], zakres.refy)!;
      const odejscia = odejsciaKadru(enm, sceny[lod], refy, baza);
      const wzor = oczekiwane(st);
      // Każde odejście: gałąź z wzorca, nazwa celu z modelu, punkt NA krawędzi ramki.
      for (const o of odejscia) {
        expect(wzor.get(o.galazRef), o.segmentRef).toBe(o.cel);
        expect(o.tekst).toBe(`dalej: ${o.cel}`);
        const naKrawedzi =
          (o.kierunek === 'prawo' && o.punkt.x === baza.maxX) ||
          (o.kierunek === 'lewo' && o.punkt.x === baza.minX) ||
          (o.kierunek === 'dol' && o.punkt.y === baza.maxY) ||
          (o.kierunek === 'gora' && o.punkt.y === baza.minY);
        expect(naKrawedzi, `${o.segmentRef} ${o.kierunek}`).toBe(true);
        kierunki.add(o.kierunek);
      }
      // Każdy odpływ z modelu, którego odcinek toru SN zaczyna się w ramce, ma znak.
      const zZnakiem = new Set(odejscia.map((o) => o.galazRef));
      for (const galaz of wzor.keys()) {
        const odcinki = sceny[lod].segments.filter((s) => {
          const r = s.meta?.ownerRef ?? '';
          return (r === galaz || r.startsWith(`${galaz}_`) || r.startsWith(`${galaz}#`)) && ['sn', 'snTrunk'].includes(s.meta?.kind ?? 'sn');
        });
        const wychodzi = odcinki.some((s) => {
          const [p, q] = [s.points[0], s.points[s.points.length - 1]];
          const w = (pt: { x: number; y: number }) => pt.x >= baza.minX && pt.x <= baza.maxX && pt.y >= baza.minY && pt.y <= baza.maxY;
          return w(p) !== w(q) || (w(p) && s.points.some((pt) => !w(pt)));
        });
        if (wychodzi) expect(zZnakiem.has(galaz), `${galaz} bez znaku kontynuacji`).toBe(true);
      }
    });
  }

  it('fikstura pokrywa wyjścia w poziomie i w pionie (inaczej iloczyn kierunku jest pusty)', () => {
    const wszystkie = new Set<string>();
    for (const lod of [1, 2] as const) {
      for (const st of stacje) {
        const z = zakresStacji(st);
        const baza = prostokatRefowWScenie(sceny[lod], z.refy)!;
        for (const o of odejsciaKadru(enm, sceny[lod], new Set(z.refy), baza)) wszystkie.add(o.kierunek);
      }
    }
    expect(wszystkie.size).toBeGreaterThanOrEqual(2);
    expect([...wszystkie].some((k) => k === 'lewo' || k === 'prawo')).toBe(true);
  });

  it.each([0.51, 0.8, 1.2])('skala %s: ramka kadru (tusz) obejmuje znak i opis każdego odejścia; pismo opisu stałe 11 px ≥ 9 px', (skala) => {
    let sprawdzonych = 0;
    for (const lod of [1, 2] as const) {
      for (const st of stacje) {
        const z = zakresStacji(st);
        const { tuszEtykiet } = prostokatyZakresu(sceny, z, (b) => b, enm);
        const cel = tuszEtykiet(lod, skala).cel!;
        const baza = prostokatRefowWScenie(sceny[lod], z.refy)!;
        for (const o of odejsciaKadru(enm, sceny[lod], new Set(z.refy), baza)) {
          expect(zawiera(cel, obrysOdejscia(o, pismoOpisuOdejscia(skala))), `${st} ${o.tekst}`).toBe(true);
          sprawdzonych += 1;
        }
      }
    }
    expect(sprawdzonych).toBeGreaterThan(50);
    expect(pismoOpisuOdejscia(skala) * skala).toBeCloseTo(OPIS_ODEJSCIA_PX, 9);
    expect(OPIS_ODEJSCIA_PX).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_SCREEN_PX);
  });

  it('bez migawki (sonda dostępności) ramka nie obejmuje odejść — obejmuje je wyłącznie mechanizm odejść', () => {
    let wystaje = 0;
    for (const st of stacje) {
      const z = zakresStacji(st);
      const bez = prostokatyZakresu(sceny, z).tuszEtykiet(1, 0.8).cel!;
      const baza = prostokatRefowWScenie(sceny[1], z.refy)!;
      for (const o of odejsciaKadru(enm, sceny[1], new Set(z.refy), baza)) {
        if (!zawiera(bez, obrysOdejscia(o, pismoOpisuOdejscia(0.8)))) wystaje += 1;
      }
    }
    expect(wystaje).toBeGreaterThan(0);
  });

  it('determinizm: ten sam kadr — te same odejścia w tej samej kolejności', () => {
    const z = zakresStacji(stacje[3]);
    const baza = prostokatRefowWScenie(sceny[2], z.refy)!;
    expect(odejsciaKadru(enm, sceny[2], new Set(z.refy), baza)).toEqual(odejsciaKadru(enm, sceny[2], new Set(z.refy), baza));
  });
});
