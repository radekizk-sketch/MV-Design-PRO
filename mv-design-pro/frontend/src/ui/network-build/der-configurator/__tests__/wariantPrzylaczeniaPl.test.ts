/**
 * Wariant przyłączenia źródła — jeden słownik dla wszystkich ekranów (karta techniczna K6,
 * karta zbiorcza obiektu, nagłówek inspektora).
 *
 * Iloczyn cech: kod wariantu (5 kodów unii, w tym aliasy backendu) × konsument
 * (słownik, karta K6, karta zbiorcza) × wartość spoza unii / brak wariantu. Dawniej trzy
 * `switch` z własną treścią: nagłówek inspektora znał 2 z 5 kodów (reszta szła na ekran
 * surowo), karta zbiorcza opisywała `block_transformer` jako „po stronie nN stacji”.
 */

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Generator, GeneratorConnectionVariant } from '../../../../types/enm';
import { buildKartaTechniczna } from '../../../sld/shared/kartaTechnicznaElementu';
import type { DaneElementuKanwy } from '../../../sld/shared/daneElementuKanwy';
import { buildTechCardSubject } from '../../../tech-card/buildTechCardSubject';
import { WZORZEC_STRINGS } from '../../../../ui2/wyniki/wzorzec/strings';
import { WARIANT_PRZYLACZENIA_PL, wariantPrzylaczeniaPl } from '../wariantPrzylaczeniaPl';

/** Oczekiwany opis każdego kodu unii — `satisfies` wymusza pełne pokrycie unii w teście. */
const OCZEKIWANE = {
  nn_side: 'po stronie nN stacji',
  LV_BEHIND_STATION_TRANSFORMER: 'po stronie nN stacji',
  block_transformer: 'po stronie SN przez transformator blokowy',
  DEDICATED_MV_CONNECTION: 'po stronie SN przez transformator blokowy',
  SOURCE_CONNECTION_STATION: 'stacja przyłączeniowa źródła',
} as const satisfies Record<GeneratorConnectionVariant, string>;

const KODY = Object.keys(OCZEKIWANE) as GeneratorConnectionVariant[];
const SPOZA = ['ON_THE_MOON', 'toString', 'constructor'];

function snapshot(wariant: string | null): EnergyNetworkModel {
  const generator = {
    id: 'gen/pv/1',
    ref_id: 'gen/pv/1',
    name: 'Falownik PV',
    bus_ref: 'bus/nn',
    p_mw: 0.5,
    gen_type: 'pv_inverter',
    connection_variant: wariant,
  } as unknown as Generator;
  return {
    header: { version: 'v1', case_id: 'case', generated_at: '2026-01-01T00:00:00Z' },
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [generator],
    substations: [],
    bays: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

function opisKartyK6(wariant: string | null): string | null | undefined {
  const karta = buildKartaTechniczna(snapshot(wariant), {
    kind: 'generator',
    elementId: 'gen/pv/1',
  } as DaneElementuKanwy);
  return karta?.sekcje.flatMap((s) => s.wiersze).find((w) => w.klucz === 'wariant')?.wartosc;
}

function opisKartyZbiorczej(wariant: string | null): unknown {
  const subject = buildTechCardSubject(snapshot(wariant), {
    id: 'gen/pv/1',
    type: 'PVInverter',
    name: 'Falownik PV',
  });
  return subject?.sections.flatMap((s) => s.fields).find((f) => f.key === 'wariant')?.value;
}

describe('wariant przyłączenia źródła — jeden słownik', () => {
  it('słownik pokrywa całą unię, aliasy backendu mają ten sam opis co kod kanoniczny', () => {
    expect(WARIANT_PRZYLACZENIA_PL).toEqual(OCZEKIWANE);
    expect(WARIANT_PRZYLACZENIA_PL.LV_BEHIND_STATION_TRANSFORMER).toBe(WARIANT_PRZYLACZENIA_PL.nn_side);
    expect(WARIANT_PRZYLACZENIA_PL.DEDICATED_MV_CONNECTION).toBe(WARIANT_PRZYLACZENIA_PL.block_transformer);
  });

  it.each(KODY)('kod %s: ten sam opis w słowniku, na karcie K6 i na karcie zbiorczej', (kod) => {
    expect(wariantPrzylaczeniaPl(kod)).toBe(OCZEKIWANE[kod]);
    expect(opisKartyK6(kod)).toBe(OCZEKIWANE[kod]);
    expect(opisKartyZbiorczej(kod)).toBe(OCZEKIWANE[kod]);
  });

  it.each(SPOZA)('kod spoza unii %s: uczciwe zdanie zamiast kodu u każdego konsumenta', (kod) => {
    const zdanie = WZORZEC_STRINGS.wartoscSpozaSlownika;
    expect(wariantPrzylaczeniaPl(kod)).toBe(zdanie);
    expect(opisKartyK6(kod)).toBe(zdanie);
    expect(opisKartyZbiorczej(kod)).toBe(zdanie);
  });

  it('brak wariantu w modelu: słownik → null, karta K6 → brak danych, karta zbiorcza → „Do konfiguracji”', () => {
    expect(wariantPrzylaczeniaPl(null)).toBeNull();
    expect(wariantPrzylaczeniaPl(undefined)).toBeNull();
    expect(opisKartyK6(null)).toBeNull();
    expect(opisKartyZbiorczej(null)).toBe('Do konfiguracji');
  });
});
