// @vitest-environment node
/**
 * GPZ-PARYTET cz. 2 (pkt 1): znaki uzwojeń to klasa „glif transformatora" — KAŻDY symbol
 * `transformer2W` sceny niesie oznaczenie uzwojeń z grupy połączeń modelu, z tej samej
 * funkcji (`symbols/uzwojenia.ts` `uzwojeniaZGrupyPolaczen`).
 *
 * Iloczyn cech na realnej ścieżce (migawka ENM → adapter v2 → scena v3): miejsce
 * {GPZ (wieża), stacja z polem TR, TR bez pola, blok DER (TR blokowy)} × grupa
 * {Dyn11, Yzn11, brak}. Do tego niezmiennik klasy: na każdej scenie ŻADEN symbol
 * `transformer2W` nie jest bez oznaczenia uzwojeń.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../buildScene';
import { buildDerSnFixture, stationTransformerRef } from './fixtures/w2cDerSnFixtures';

type Miejsce = 'GPZ' | 'stacja z polem TR' | 'TR bez pola' | 'blok DER';
const MIEJSCA: readonly Miejsce[] = ['GPZ', 'stacja z polem TR', 'TR bez pola', 'blok DER'];
const GRUPY: readonly (string | null)[] = ['Dyn11', 'Yzn11', null];

/** Buduje migawkę dla miejsca i zwraca ją z ownerRef symbolu transformatora na scenie. */
function migawka(miejsce: Miejsce, grupa: string | null): { enm: EnergyNetworkModel; ownerRef: string } {
  const { enm, stationRef, injected } = buildDerSnFixture(miejsce === 'blok DER' ? [{ technology: 'BESS' }] : []);
  const ustawGrupe = (ref: string): void => {
    const tr = enm.transformers.find((t) => t.ref_id === ref);
    if (!tr) throw new Error(`brak transformatora ${ref}`);
    const zapis = tr as { vector_group?: string | null };
    if (grupa === null) delete zapis.vector_group;
    else zapis.vector_group = grupa;
  };
  if (miejsce === 'GPZ') {
    const gpz = enm.substations.find((s) => s.station_type === 'gpz')!;
    const ref = gpz.transformer_refs[0];
    ustawGrupe(ref);
    return { enm, ownerRef: ref };
  }
  if (miejsce === 'blok DER') {
    const ref = injected[0].blockTransformerRef!;
    ustawGrupe(ref);
    return { enm, ownerRef: ref };
  }
  const trRef = stationTransformerRef(enm, stationRef)!;
  ustawGrupe(trRef);
  const poleTr = enm.bays.find((b) => b.substation_ref === stationRef && b.bay_role === 'TR')!;
  if (miejsce === 'TR bez pola') {
    enm.bays = enm.bays.filter((b) => b.ref_id !== poleTr.ref_id);
    return { enm, ownerRef: trRef };
  }
  return { enm, ownerRef: poleTr.ref_id };
}

describe('uzwojenia transformatora z grupy połączeń — miejsce × grupa (scena v3)', () => {
  for (const miejsce of MIEJSCA) {
    for (const grupa of GRUPY) {
      it(`${miejsce} × ${grupa ?? 'brak grupy'}`, () => {
        const { enm, ownerRef } = migawka(miejsce, grupa);
        const scena = buildSceneV3(enm, 2);
        const tr = scena.symbols.filter((s) => s.symbolId === 'transformer2W' && s.meta?.ownerRef === ownerRef);
        expect(tr, `symbol transformatora ${ownerRef}`).toHaveLength(1);
        const u = tr[0].uzwojenia;
        if (grupa === 'Dyn11') {
          expect(u).toEqual({
            stan: 'znane',
            gorne: { rodzaj: 'trojkat', punktNeutralny: false },
            dolne: { rodzaj: 'gwiazda', punktNeutralny: true },
            godzina: 11,
          });
        } else if (grupa === 'Yzn11') {
          expect(u).toEqual({
            stan: 'znane',
            gorne: { rodzaj: 'gwiazda', punktNeutralny: false },
            dolne: { rodzaj: 'zygzak', punktNeutralny: true },
            godzina: 11,
          });
        } else {
          // Brak grupy w modelu = jawny brak (glif „?"), nigdy domyślne Dyn11.
          expect(u).toEqual({ stan: 'brak' });
        }
      });
    }
  }

  it('niezmiennik klasy: żaden symbol transformer2W sceny nie jest bez oznaczenia uzwojeń', () => {
    for (const miejsce of MIEJSCA) {
      const { enm } = migawka(miejsce, 'Dyn11');
      for (const lod of [1, 2] as const) {
        const bez = buildSceneV3(enm, lod).symbols.filter((s) => s.symbolId === 'transformer2W' && !s.uzwojenia);
        expect(bez.map((s) => s.meta?.ownerRef), `${miejsce}, L${lod}`).toEqual([]);
      }
    }
  });
});
