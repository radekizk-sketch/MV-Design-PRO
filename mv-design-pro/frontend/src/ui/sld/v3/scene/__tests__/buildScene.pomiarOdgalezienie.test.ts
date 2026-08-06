/**
 * Sieć pokazowa „pomiar rozliczeniowy w odgałęzieniu" na realnej scenie v3.
 *
 * Karta POMIAR-ODGAŁĘZIENIE (etap 2 kontraktu
 * `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`). Fixtura
 * `pomiarOdgalezienie.enm.json` powstaje REALNĄ końcówką aplikacji szablonu
 * (`frontend/scripts/demo-siec-pokazowa/generate-fixture.py` → `POST
 * /api/station-templates/{id}/apply`), a nie ręcznie — jedna prawda kształtu ENM.
 *
 * Sieć: magistrala OSD z DWIEMA stacjami dystrybucyjnymi wciętymi przelotowo
 * + DWÓCH klientów SN (przemysłowy i typowy 1000 kVA „+ pomiary") wiszących na
 * ODGAŁĘZIENIACH od punktów ZKSN na magistrali.
 *
 * Test jest ILOCZYNEM CECH: {stacja OSD, stacja klienta} × {przynależność do
 * ciągu głównego, obecność na rysunku} — plus pin determinizmu sceny.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod } from '../buildScene';

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

describe('sieć pokazowa — klient w odgałęzieniu (POMIAR-ODGAŁĘZIENIE)', () => {
  it('model niesie DWIE stacje OSD w ciągu i DWÓCH klientów końcowych', () => {
    expect(stacjeOsd).toHaveLength(2);
    expect(stacjeKlientow).toHaveLength(2);
    // Klienci wiszą za punktami odgałęzienia — po jednym ZKSN na klienta.
    expect(enm.branch_points ?? []).toHaveLength(2);
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

  for (const lod of [0, 1, 2] as SceneLod[]) {
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

  /**
   * LUKA ZMIERZONA, NIE ZAMASKOWANA (karta POMIAR-ODGAŁĘZIENIE, meldunek +
   * rejestr): kompozycja lateralu v3 (`resolveBranchOrigin`) przyjmuje jako
   * początek odgałęzienia WYŁĄCZNIE STACJĘ ciągu głównego z polem odgałęźnym.
   * Odgałęzienie wychodzące z PUNKTU ODGAŁĘZIENIA na odcinku (ZKSN / słup
   * rozgałęźny) nie ma w scenie v3 węzła-origin — scena v3 w ogóle nie czyta
   * `branch_points` — więc ciąg klienta jest POMIJANY i stacja klienta nie
   * trafia na rysunek. Dotyczy KAŻDEJ sieci z punktem odgałęzienia, nie tylko
   * tej karty (dług sprzed karty, ujawniony przez nią).
   *
   * Test pilnuje, że luka jest RAPORTOWANA przez scenę (uczciwy stan zerowy),
   * a nie milcząca. Po zbudowaniu obsługi punktów odgałęzienia w scenie ten
   * test MUSI zaświecić na czerwono — wtedy zmienia się go na asercję
   * obecności stacji klienta na rysunku.
   */
  it('LUKA: odgałęzienie z punktu ZKSN jest POMIJANE i scena to zgłasza', () => {
    const scene = buildSceneV3(enm, 2);
    const pominiete = scene.meta.stopNotes.filter((n) => n.includes('ciąg pominięty'));
    expect(pominiete).toHaveLength(2);
    expect(scene.meta.lateralRunIds).toHaveLength(0);
  });
});
