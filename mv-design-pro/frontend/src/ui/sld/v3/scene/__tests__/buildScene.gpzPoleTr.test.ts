// @vitest-environment node
/**
 * GPZ-PARYTET cz. 3 (pkt 2): transformator GPZ wskazany przez pole TR modelu był pomijany
 * jako wieża, a pole TR w sekcji nie ma symbolu transformatora — transformator znikał
 * z rysunku. Teraz transformator ZAWSZE rysuje się torem (pole WN TR → TR2W z uzwojeniami
 * → pole TR → szyna SN), a pole TR modelu jest polem tego toru (stan łączników, tożsamość
 * zaznaczenia, karta tabeli, tło pola, okrąg zabezpieczenia), nie drugim rysunkiem w sekcji.
 *
 * Iloczyn cech na realnej ścieżce (migawka ENM → adapter → kompozycja → scena v3):
 * {transformator w polu TR, poza polem} × {grupa połączeń znana (Yd11), brak} × LOD {1, 2}.
 */
import { describe, expect, it } from 'vitest';

import type { Branch, Bus, EnergyNetworkModel } from '../../../../../types/enm';
import { pole } from '../../../../../test/pola';
import { buildSceneV3 } from '../buildScene';
import { buildDerSnFixture } from './fixtures/w2cDerSnFixtures';

type Miejsce = 'w polu TR' | 'poza polem';
const MIEJSCA: readonly Miejsce[] = ['w polu TR', 'poza polem'];
const GRUPY: readonly (string | null)[] = ['Yd11', null];
const POLE_TR = 'gpz-test/pole-tr';
const WYLACZNIK = 'gpz-test/pole-tr/q0';

function migawka(miejsce: Miejsce, grupa: string | null): { enm: EnergyNetworkModel; trRef: string } {
  const { enm } = buildDerSnFixture([]);
  const gpz = enm.substations.find((s) => s.station_type === 'gpz')!;
  const trRef = gpz.transformer_refs[0];
  const tr = enm.transformers.find((t) => t.ref_id === trRef)! as { vector_group?: string | null };
  if (grupa === null) delete tr.vector_group;
  else tr.vector_group = grupa;
  if (miejsce === 'w polu TR') {
    const sekcja = gpz.gpz_sections![0];
    const zacisk = `${WYLACZNIK}/k`;
    enm.buses.push({
      id: zacisk, ref_id: zacisk, name: 'Zacisk pola TR', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {},
    } as Bus);
    enm.branches.push({
      id: WYLACZNIK, ref_id: WYLACZNIK, name: 'Q0', type: 'breaker', status: 'open',
      from_bus_ref: sekcja.bus_ref!, to_bus_ref: zacisk, tags: [], meta: {},
    } as unknown as Branch);
    enm.bays.push(
      pole({
        ref_id: POLE_TR,
        name: 'Pole TR',
        bay_role: 'TR',
        substation_ref: gpz.ref_id,
        bus_ref: sekcja.bus_ref!,
        gpz_section_id: sekcja.section_id,
        bay_number: 'FT1',
        equipment_refs: [trRef, WYLACZNIK],
        protection_codes: ['87T', '51'],
      }),
    );
  }
  return { enm, trRef };
}

describe('GPZ: transformator pola TR rysowany torem z uzwojeniami — miejsce × grupa × LOD', () => {
  for (const miejsce of MIEJSCA) {
    for (const grupa of GRUPY) {
      for (const lod of [1, 2] as const) {
        it(`${miejsce} × ${grupa ?? 'brak grupy'} × L${lod}`, () => {
          const { enm, trRef } = migawka(miejsce, grupa);
          const scena = buildSceneV3(enm, lod);
          const transformatory = scena.symbols.filter(
            (s) => s.symbolId === 'transformer2W' && s.meta?.ownerRef === trRef,
          );
          // Dokładnie jeden rysunek transformatora — ani zniknięcie, ani podwójny rysunek.
          expect(transformatory).toHaveLength(1);
          expect(transformatory[0].uzwojenia).toEqual(
            grupa === 'Yd11'
              ? {
                  stan: 'znane',
                  gorne: { rodzaj: 'gwiazda', punktNeutralny: false },
                  dolne: { rodzaj: 'trojkat', punktNeutralny: false },
                  godzina: 11,
                }
              : { stan: 'brak' },
          );
          const brakGrupy = scena.meta.missingData.includes(`gpz.transformer.vector_group.missing:${trRef}`);
          expect(brakGrupy).toBe(grupa === null);

          // KOREKTA (GEOMETRIA-STACJI §0 pkt 4): aparaty toru WYŁĄCZNIE z rekordów modelu.
          // Pole TR modelu wskazuje gałąź wyłącznika (`equipment_refs`) — tor ma DOKŁADNIE ten
          // wyłącznik (bez przekładnika/odłącznika z dawnej gramatyki pola TR); tor bez pola
          // TR w modelu i pole WN TR bez rekordu mają sylwetkę braku danych bez stanu.
          const stosPolaTr = scena.symbols.filter((s) => s.meta?.testId?.startsWith(`gpz-canonical-tr-field-${trRef}-`));
          const stosPolaWn = scena.symbols.filter((s) => s.meta?.testId?.startsWith(`gpz-canonical-hv-tr-bay-${trRef}-`));
          expect(stosPolaWn.map((s) => [s.symbolId, s.state])).toEqual([['bayNoEquipment', undefined]]);
          const wylacznikToru = scena.symbols.find(
            (s) => s.meta?.testId === `gpz-canonical-tr-field-${trRef}-cb`,
          );
          // Przekładnik prądowy toru nie jest rysowany bez rekordu (ani ze stanem, ani bez).
          expect(stosPolaTr.some((s) => s.symbolId === 'currentTransformer')).toBe(false);
          // Pole TR nie jest drugi raz rysowane w sekcji SN.
          expect(scena.symbols.filter((s) => s.meta?.testId?.startsWith(`gpz-canonical-bay-${POLE_TR}-`))).toEqual([]);
          if (miejsce === 'w polu TR') {
            // Stan łącznika i tożsamość zaznaczenia z pola modelu.
            expect(stosPolaTr.map((s) => s.symbolId)).toEqual(['breaker']);
            expect(wylacznikToru, 'wyłącznik pola TR toru transformatora').toBeDefined();
            expect(wylacznikToru!.meta?.deviceRef).toBe(WYLACZNIK);
            expect(wylacznikToru!.state).toBe('open');
            expect(wylacznikToru!.meta?.ownerRef).toBe(POLE_TR);
            expect(scena.meta.gpzAdnotacje?.tabela?.karty.map((k) => k.bayRef)).toContain(POLE_TR);
            expect(scena.meta.gpzAdnotacje?.panele.map((p) => p.bayRef)).toContain(POLE_TR);
            expect(
              scena.symbols.some((s) => s.symbolId === 'protectionRelay' && s.meta?.ownerRef === POLE_TR),
            ).toBe(true);
          } else {
            expect(wylacznikToru).toBeUndefined();
            expect(stosPolaTr.map((s) => [s.symbolId, s.state])).toEqual([['bayNoEquipment', undefined]]);
            expect(stosPolaTr[0].meta?.ownerRef).toBe(trRef);
          }
        });
      }
    }
  }

  it('determinizm: ta sama migawka → ta sama scena (pole TR w torze transformatora)', () => {
    const a = buildSceneV3(migawka('w polu TR', 'Yd11').enm, 2);
    const b = buildSceneV3(migawka('w polu TR', 'Yd11').enm, 2);
    expect(JSON.stringify(b.symbols)).toBe(JSON.stringify(a.symbols));
    expect(JSON.stringify(b.meta.gpzAdnotacje)).toBe(JSON.stringify(a.meta.gpzAdnotacje));
  });
});
