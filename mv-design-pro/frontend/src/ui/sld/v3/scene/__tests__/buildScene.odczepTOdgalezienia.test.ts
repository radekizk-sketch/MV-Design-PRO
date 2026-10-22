/**
 * Odczep T (sekcja 7.5 `buildScene`, S7-P2) — kropka węzła wyłącznie na pionie kabla
 * ODGAŁĘZIENIA; przecięcie kabli dwóch niezależnych ciągów jest skrzyżowaniem z mostkiem.
 *
 * Przyczyna (pomiar 2026-10-22, karta GPZ-H5-SLD etap 2): `resolveTeeJunctions` zamieniał na
 * węzeł T z kropką KAŻDE przecięcie sn×sn. Skutek: magistrala z pola GPZ 001 i feeder z pola
 * GPZ 002 (fikstury `gpzFeeder`, `gpzProtectionDataPath`, `openBranch`, wszystkie LOD) oraz
 * powrót tej samej magistrali przez łamanie arkusza na L0 (`elementyCiagu-wezel`,
 * `elementyCiagu-lacznik`) były rysowane jako POŁĄCZONE — kropka na skrzyżowaniu dwóch
 * kabli, których model nie łączy.
 *
 * Iloczyn cech: fikstura {feeder z pola GPZ ze stacjami, feeder GPZ z zabezpieczeniami,
 * feeder GPZ otwarty, magistrala z węzłem, magistrala z łącznikiem, sieć referencyjna 53
 * stacji z odgałęzieniami} × LOD {0, 1, 2}. Wyrocznia z MODELU (korytarze ENM), nie
 * z predykatu sceny:
 *  - kropka odczepu T leży na pionie kabla korytarza, który NIE wychodzi z szyny GPZ
 *    (ciąg z pola GPZ zaczyna się w polu, nigdy w środku innego kabla), i na poziomie kabla
 *    INNEGO korytarza;
 *  - każde pozostałe przecięcie sn×sn ma mostek na pionie (`bridgePointsForPolyline`, te same
 *    przecięcia, z których rysuje kanwa);
 *  - sieć referencyjna zachowuje odczepy odgałęzień (7/18/18 — reguła nie zabiera kropek
 *    prawdziwym odgałęzieniom).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod } from '../buildScene';
import { bridgePointsForPolyline, interiorCrossings } from '../crossings';

const here = dirname(fileURLToPath(import.meta.url));
const FIKSTURY: Readonly<Record<string, string>> = {
  gpzFeeder: resolve(here, 'fixtures', 'gpzFeeder.enm.json'),
  gpzProtectionDataPath: resolve(here, 'fixtures', 'gpzProtectionDataPath.enm.json'),
  openBranch: resolve(here, 'fixtures', 'openBranch.enm.json'),
  'elementyCiagu-wezel': resolve(here, 'fixtures', 'elementyCiagu-wezel.enm.json'),
  'elementyCiagu-lacznik': resolve(here, 'fixtures', 'elementyCiagu-lacznik.enm.json'),
  sldSubstrate52s: resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
};
const LODS: readonly SceneLod[] = [0, 1, 2];
/** Odczepy prawdziwych odgałęzień sieci referencyjnej (pomiar przed i po regule — bez zmian). */
const ODCZEPY_SIECI_REFERENCYJNEJ: Readonly<Record<SceneLod, number>> = { 0: 7, 1: 18, 2: 18 };

interface KorytarzEnm {
  readonly ref_id: string;
  readonly ordered_segment_refs?: readonly string[];
}

function wczytaj(sciezka: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(sciezka, 'utf8')) as { enm: EnergyNetworkModel }).enm;
}

function bazowyRef(ref: string | undefined): string {
  return (ref ?? '').split('#')[0];
}

describe('odczep T wyłącznie na pionie kabla odgałęzienia', () => {
  for (const [nazwa, sciezka] of Object.entries(FIKSTURY)) {
    const enm = wczytaj(sciezka);
    const korytarze = ((enm as unknown as { corridors?: readonly KorytarzEnm[] }).corridors ?? []);
    const korytarzKabla = new Map<string, string>();
    for (const k of korytarze) for (const r of k.ordered_segment_refs ?? []) korytarzKabla.set(r, k.ref_id);
    const szynyGpz = new Set(
      (enm.substations ?? []).filter((s) => (s.gpz_sections ?? []).length > 0).flatMap((s) => s.bus_refs ?? []),
    );
    const galezie = new Map(enm.branches.map((b) => [b.ref_id, b]));
    const zPolaGpz = new Set(
      korytarze
        .filter((k) => {
          const pierwszy = galezie.get(k.ordered_segment_refs?.[0] ?? '') as
            | { from_bus_ref?: string; to_bus_ref?: string }
            | undefined;
          return pierwszy != null && (szynyGpz.has(pierwszy.from_bus_ref ?? '') || szynyGpz.has(pierwszy.to_bus_ref ?? ''));
        })
        .map((k) => k.ref_id),
    );

    for (const lod of LODS) {
      it(`${nazwa} · LOD ${lod}`, () => {
        const scene = buildSceneV3(enm, lod);
        const kropki = scene.symbols
          .filter((s) => String(s.meta?.testId ?? '').startsWith('sld-v3-wezel-t-'))
          .map((s) => ({ x: s.x + 8, y: s.y + 8 }));
        for (const k of kropki) {
          let pion: string | null = null;
          const poziomy: string[] = [];
          for (const seg of scene.segments) {
            const p = seg.points;
            for (let i = 0; i + 1 < p.length; i++) {
              const [a, b] = [p[i], p[i + 1]];
              if (a.x === k.x && b.x === k.x && Math.min(a.y, b.y) < k.y && Math.max(a.y, b.y) > k.y) {
                pion = bazowyRef(seg.meta?.ownerRef);
              }
              if (a.y === k.y && b.y === k.y && (a.x === k.x || b.x === k.x)) poziomy.push(bazowyRef(seg.meta?.ownerRef));
            }
          }
          expect(pion, `kropka (${k.x}, ${k.y}) leży na pionie kabla`).not.toBeNull();
          const korytarzPionu = korytarzKabla.get(pion!);
          expect(korytarzPionu, `kabel pionu ${pion} należy do korytarza modelu`).toBeDefined();
          expect(zPolaGpz.has(korytarzPionu!), `pion ${pion} to ciąg z pola GPZ — nie odgałęzienie`).toBe(false);
          expect(poziomy.length, `kropka (${k.x}, ${k.y}) na końcu kabla poziomego`).toBeGreaterThan(0);
          for (const h of poziomy) {
            expect(korytarzKabla.get(h), `poziom ${h} — inny korytarz niż pion ${pion}`).not.toBe(korytarzPionu);
          }
        }
        const przeciecia = interiorCrossings(scene.segments).filter((c) => !c.involvesBus);
        const mostki = scene.segments.reduce(
          (n, s) => n + [...bridgePointsForPolyline(s.points, przeciecia).values()].flat().length,
          0,
        );
        expect(mostki, 'każde skrzyżowanie sn×sn ma mostek').toBe(przeciecia.length);
        if (nazwa === 'sldSubstrate52s') expect(kropki.length).toBe(ODCZEPY_SIECI_REFERENCYJNEJ[lod]);
        else expect(kropki, 'fikstura bez odgałęzień — zero odczepów T').toEqual([]);
        if (nazwa.startsWith('gpz') || nazwa === 'openBranch') {
          // Magistrala z pola 001 × feeder z pola 002 przecinają się (na L0 fikstury
          // z zabezpieczeniami — dwa kawałki tej samej trasy w jednym punkcie).
          expect(przeciecia.length, 'magistrala z pola 001 × feeder z pola 002: skrzyżowanie').toBeGreaterThan(0);
        }
      });
    }
  }
});
