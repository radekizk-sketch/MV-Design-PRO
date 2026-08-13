/**
 * Sieć pokazowa „pomiar rozliczeniowy w odgałęzieniu" na realnej scenie v3.
 *
 * Karta POMIAR-ODGAŁĘZIENIE (etap 2) i ODG-RYSUNEK (etap 3) kontraktu
 * `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`. Fixtura
 * `pomiarOdgalezienie.enm.json` powstaje REALNĄ końcówką aplikacji szablonu
 * (`frontend/scripts/demo-siec-pokazowa/generate-fixture.py` → `POST
 * /api/station-templates/{id}/apply`), a nie ręcznie — jedna prawda kształtu ENM.
 *
 * Sieć: magistrala OSD z TRZEMA stacjami dystrybucyjnymi wciętymi przelotowo
 * (630 / 400 / 1250 kVA, każda z polem odpływowym — ciąg biegnie przez nie
 * dalej) + DWÓCH klientów SN (przemysłowy i typowy 1000 kVA „+ pomiary")
 * wiszących na ODGAŁĘZIENIACH od punktów odgałęźnych magistrali. Ostatnie
 * przęsło jest NAPOWIETRZNE, więc sieć niesie OBA rodzaje punktu:
 *  · ZKSN na odcinku KABLOWYM, w środku ciągu (na przęśle międzystacyjnym),
 *  · SŁUP ROZGAŁĘŹNY na odcinku NAPOWIETRZNYM, na OGONIE OTWARTYM za ostatnią
 *    stacją.
 *
 * Test jest ILOCZYNEM CECH: {ZKSN, słup rozgałęźny} × {przęsło w ciągu, ogon
 * otwarty} × {L0, L1, L2} × {punkt narysowany, tor rozcięty w punkcie, stacja za
 * punktem narysowana} — plus pin determinizmu sceny i zerowych skrzyżowań.
 *
 * HISTORIA (intencja zachowana): do etapu 3 ten plik PRZYPINAŁ LUKĘ — scena nie
 * czytała `branch_points`, więc odgałęzienia z punktów były pomijane, a stacje
 * klientów nie trafiały na rysunek (scena zgłaszała to w `stopNotes`). Asercja
 * luki została zastąpiona asercją stanu DOCELOWEGO; test „ciąg pominięty"
 * pilnuje teraz, że komunikat pominięcia NIE występuje.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { branchPointCoverageGaps, buildSceneV3, type SceneLod } from '../buildScene';
import { interiorCrossings } from '../crossings';
import { buildCanvasHitAreas } from '../../canvas/hitAreas';
import { SYMBOL_DEFS } from '../../symbols/defs';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(readFileSync(resolve(here, 'fixtures', 'pomiarOdgalezienie.enm.json'), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }
).enm;

/** Stacje z ENM po roli topologicznej — bez zgadywania po nazwie. */
const stacjeOsd = enm.substations
  .filter((s) => s.station_type === 'inline')
  .map((s) => s.ref_id);
const stacjeKlientow = enm.substations
  .filter((s) => s.station_type === 'mv_lv')
  .map((s) => s.ref_id);
const punkty = enm.branch_points ?? [];
const LODS: readonly SceneLod[] = [0, 1, 2];

/** Symbol oczekiwany dla rodzaju punktu — kontrakt rozróżnialności rysunkowej. */
const SYMBOL_PUNKTU: Readonly<Record<string, string>> = {
  zksn: 'branchCabinet',
  branch_pole: 'branchPole',
};

describe('sieć pokazowa — klient w odgałęzieniu (POMIAR-ODGAŁĘZIENIE)', () => {
  it('model niesie TRZY stacje OSD w ciągu i DWÓCH klientów końcowych', () => {
    expect(stacjeOsd).toHaveLength(3);
    expect(stacjeKlientow).toHaveLength(2);
    // Klienci wiszą za punktami odgałęzienia — po jednym punkcie na klienta.
    expect(punkty).toHaveLength(2);
    // Sieć ćwiczy OBA rodzaje punktu (kabel ⇒ ZKSN, linia ⇒ słup rozgałęźny).
    expect([...punkty.map((p) => p.branch_point_type)].sort()).toEqual(['branch_pole', 'zksn']);
  });

  it('każda stacja klienta ma pole POMIAROWE, i to od strony dopływu gałęzi', () => {
    for (const ref of stacjeKlientow) {
      const stacja = enm.substations.find((s) => s.ref_id === ref)!;
      const role = ((stacja.meta as { field_specs?: { bay_role?: string }[] } | undefined)
        ?.field_specs ?? []
      ).map((spec) => spec.bay_role);
      expect(role).toContain('MEASUREMENT');
      // Kolejność Z DANYCH (V12K-330): dopływ → POMIAR → TR → (rezerwy).
      expect(role.indexOf('IN')).toBeLessThan(role.indexOf('MEASUREMENT'));
      expect(role.indexOf('MEASUREMENT')).toBeLessThan(role.indexOf('TR'));
      // Zakaz kontraktu §1: rozdzielnica klienta nie prowadzi tranzytu OSD,
      // więc nie ma w niej pary tranzytowej przed pomiarem.
      expect(role.slice(0, role.indexOf('MEASUREMENT'))).not.toContain('OUT');
    }
  });

  for (const lod of LODS) {
    it(`L${lod}: ciąg główny to WYŁĄCZNIE stacje OSD — klient nie leży w torze tranzytu`, () => {
      const scene = buildSceneV3(enm, lod);
      for (const ref of stacjeKlientow) {
        expect(scene.meta.mainTrunkStationIds).not.toContain(ref);
      }
      expect([...scene.meta.mainTrunkStationIds].sort()).toEqual([...stacjeOsd].sort());
    });
  }

  it('determinizm: dwa wywołania ⇒ identyczny JSON sceny (L2)', () => {
    expect(JSON.stringify(buildSceneV3(enm, 2))).toBe(JSON.stringify(buildSceneV3(enm, 2)));
  });
});

/**
 * ODG-RYSUNEK (etap 3): odgałęzienia z punktów odgałęźnych SĄ na rysunku.
 * Wyrocznie liczone dla KAŻDEGO poziomu szczegółu — punkt odgałęźny jest
 * elementem TOPOLOGII, więc nie wolno mu zniknąć przy oddaleniu (L0), tak jak
 * nie znika stacja.
 */
describe('ODG-RYSUNEK — punkty odgałęźne i ciągi za nimi na rysunku', () => {
  for (const lod of LODS) {
    it(`L${lod}: KAŻDY punkt odgałęźny narysowany, KAŻDA stacja za nim narysowana`, () => {
      const scene = buildSceneV3(enm, lod);
      expect(branchPointCoverageGaps(scene, enm)).toEqual([]);
      expect([...scene.meta.drawnBranchPointRefs].sort()).toEqual(
        [...punkty.map((p) => p.ref_id)].sort(),
      );
      for (const ref of stacjeKlientow) {
        expect(scene.meta.drawnStationIds).toContain(ref);
      }
      // Licznik i tożsamość muszą mówić to samo (3 OSD + 2 klientów).
      expect(scene.meta.stationCount).toBe(stacjeOsd.length + stacjeKlientow.length);
      expect(scene.meta.lateralRunIds).toHaveLength(stacjeKlientow.length);
    });

    it(`L${lod}: żaden ciąg nie jest POMIJANY (komunikat luki znika)`, () => {
      const scene = buildSceneV3(enm, lod);
      expect(scene.meta.stopNotes.filter((n) => n.includes('ciąg pominięty'))).toEqual([]);
      expect(scene.meta.stopNotes.filter((n) => n.includes('bez symbolu na rysunku'))).toEqual([]);
    });

    it(`L${lod}: rodzaj punktu ma WŁASNY symbol (ZKSN ≠ słup rozgałęźny ≠ węzeł)`, () => {
      const scene = buildSceneV3(enm, lod);
      for (const bp of punkty) {
        const symbol = scene.symbols.find(
          (s) => s.meta?.elementKind === 'branchPoint' && s.meta?.ownerRef === bp.ref_id,
        );
        expect(symbol, `punkt ${bp.ref_id} bez symbolu`).toBeDefined();
        expect(symbol!.symbolId).toBe(SYMBOL_PUNKTU[bp.branch_point_type]);
        // Rozróżnialność od zwykłej kropki węzłowej trasy.
        expect(symbol!.symbolId).not.toBe('junction');
      }
      // Symbole obu rodzajów są RÓŻNE (iniekcja rodzaj → glif).
      const uzyte = new Set(
        scene.symbols.filter((s) => s.meta?.elementKind === 'branchPoint').map((s) => s.symbolId),
      );
      expect(uzyte.size).toBe(new Set(punkty.map((p) => p.branch_point_type)).size);
    });

    it(`L${lod}: symbol punktu LEŻY NA TORZE magistrali, a tor jest w nim rozcięty`, () => {
      const scene = buildSceneV3(enm, lod);
      const trunkRefs = new Set(enm.corridors?.[0]?.ordered_segment_refs ?? []);
      for (const bp of punkty) {
        const symbol = scene.symbols.find(
          (s) => s.meta?.elementKind === 'branchPoint' && s.meta?.ownerRef === bp.ref_id,
        )!;
        const def = SYMBOL_DEFS[symbol.symbolId];
        const srodek = { x: symbol.x + def.width / 2, y: symbol.y + def.height / 2 };
        // Któryś człon MAGISTRALI kończy się dokładnie w środku symbolu, a inny
        // się w nim zaczyna — czyli punkt jest stykiem końców, nie glifem
        // położonym na przewodzie (kanon §22.1 „kropka ⇔ realny węzeł").
        const konce = scene.segments.filter((s) => {
          const ref = (s.meta?.ownerRef ?? '').replace(/#.*$/, '');
          if (!trunkRefs.has(ref)) return false;
          const last = s.points[s.points.length - 1];
          return last.x === srodek.x && last.y === srodek.y;
        });
        const poczatki = scene.segments.filter((s) => {
          const ref = (s.meta?.ownerRef ?? '').replace(/#.*$/, '');
          if (!trunkRefs.has(ref)) return false;
          const first = s.points[0];
          return first.x === srodek.x && first.y === srodek.y;
        });
        expect(konce.length, `punkt ${bp.ref_id}: brak członu kończącego się w punkcie`).toBeGreaterThan(0);
        expect(poczatki.length, `punkt ${bp.ref_id}: brak członu zaczynającego się w punkcie`).toBeGreaterThan(0);
      }
    });

    it(`L${lod}: punkt odgałęźny jest TRAFIALNY i ma własny rodzaj obiektu`, () => {
      const scene = buildSceneV3(enm, lod);
      const areas = buildCanvasHitAreas({
        symbols: scene.symbols,
        segments: scene.segments,
        labels: [],
        resultMarkers: [],
        scale: 1,
      });
      for (const bp of punkty) {
        const area = areas.find((a) => a.ownerRef === bp.ref_id);
        expect(area, `punkt ${bp.ref_id} bez obszaru trafienia`).toBeDefined();
        expect(area!.klasa).toBe('punkt-odgalezny');
      }
    });

    it(`L${lod}: zero skrzyżowań tras i zero przecięć wnętrz`, () => {
      const scene = buildSceneV3(enm, lod);
      expect(scene.crossings).toHaveLength(0);
      expect(interiorCrossings(scene.segments)).toHaveLength(0);
    });
  }

  it('L1/L2: punkt niesie NAZWĘ Z DANYCH (zero fabrykacji etykiety)', () => {
    for (const lod of [1, 2] as SceneLod[]) {
      const scene = buildSceneV3(enm, lod);
      for (const bp of punkty) {
        const label = scene.labels.find((l) => l.ownerRef === `${bp.ref_id}#name`);
        expect(label, `punkt ${bp.ref_id} bez etykiety na L${lod}`).toBeDefined();
        expect(label!.text).toBe(bp.name);
        expect(label!.ownerKind).toBe('branch-point');
      }
    }
  });

  it('stacja klienta jest prezentowana jako KOŃCOWA (terminalInRun)', () => {
    const scene = buildSceneV3(enm, 2);
    for (const ref of stacjeKlientow) {
      const nazwa = scene.labels.find(
        (l) => l.ownerKind === 'station-name' && l.ownerRef.startsWith(ref),
      );
      expect(nazwa, `stacja ${ref} bez pasma nazwy`).toBeDefined();
    }
    // Ciąg główny NIE prowadzi przez klienta — to jest istota kontraktu pomiaru.
    expect(scene.meta.mainTrunkStationIds).toHaveLength(stacjeOsd.length);
  });
});
