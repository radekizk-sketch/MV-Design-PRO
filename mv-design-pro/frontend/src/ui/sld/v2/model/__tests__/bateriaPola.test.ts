/**
 * Bateria kondensatorów na końcu toru pola — relacja z modelu i glif (karta UX-04/POLE-BKR-MODEL).
 *
 * DLACZEGO. Bateria to element modelu (`ShuntCapacitor`) na zacisku końca toru pola
 * (`bus_ref === Bay.terminal_bus_ref`, ten sam predykat co backend `pole_baterii`). Rysunek
 * pokazuje układ połączeń wyłącznie z modelu (element > typ katalogowy; bez danej — znak
 * „układ nieokreślony") i przekładnik niezrównoważenia wyłącznie, gdy pole niesie jego rekord.
 * Glif w wariancie domyślnym zamiast danej modelu byłby fabrykacją na schemacie.
 *
 * ILOCZYN CECH: źródło układu {element, typ, element i typ, brak, wartość spoza słownika}
 *   × przekładnik niezrównoważenia w polu {jest, nie ma}
 *   × zacisk pola {zgodny z baterią, inny, brak}
 *   × ścieżka {funkcja relacji, scena SLD v3 z fikstury generatora, glif}.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

import {
  UKLADY_POLACZEN_BATERII,
  type Bay,
  type EnergyNetworkModel,
  type ShuntCapacitor,
  type UkladPolaczenBaterii,
} from '../../../../../types/enm';
import gpzBkrFx from '../../../../../../public/test-fixtures/gpz110kvBkr.enm.json';
import gpzBkrUziemionaFx from '../../../../../../public/test-fixtures/gpz110kvBkrGwiazdaUziemiona.enm.json';
import { buildSceneV3 } from '../../../v3/scene/buildScene';
import { CapacitorBankGlyph } from '../../../v3/symbols/glyphs';
import {
  PORTY_APARATOW_POLA_BKR,
  RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA,
} from '../../../v3/compose/rodzajeAparatowPolaBkr';
import { bateriaNaKoncuToruPola, bateriaWidokuPola, ukladBateriiZModelu } from '../bateriaPola';

const ZACISK = 'bus/zacisk-pola-bkr';

function bateria(ref: string, pola: Partial<ShuntCapacitor> = {}): ShuntCapacitor {
  return { ref_id: ref, name: ref, bus_ref: ZACISK, rated_mvar: 1.2, rated_kv: 15, ...pola } as ShuntCapacitor;
}

function pole(zacisk: string | null, zPrzekladnikiem: boolean): Pick<Bay, 'terminal_bus_ref' | 'primary_devices'> {
  return {
    terminal_bus_ref: zacisk,
    primary_devices: zPrzekladnikiem
      ? [
          { device_ref: 'q0', symbol_ref: 'q0', kind: 'CB', placement: 'MIDSTREAM' },
          { device_ref: 't5', symbol_ref: 't5', kind: RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA, placement: 'OFF_PATH' },
        ]
      : [{ device_ref: 'q0', symbol_ref: 'q0', kind: 'CB', placement: 'MIDSTREAM' }],
  } as Pick<Bay, 'terminal_bus_ref' | 'primary_devices'>;
}

const ZRODLA_UKLADU: ReadonlyArray<{
  readonly nazwa: string;
  readonly pola: Partial<ShuntCapacitor>;
  readonly oczekiwany: UkladPolaczenBaterii | null;
}> = [
  { nazwa: 'element', pola: { uklad_polaczen: 'TROJKAT' }, oczekiwany: 'TROJKAT' },
  { nazwa: 'typ', pola: { materialized_params: { uklad_polaczen: 'GWIAZDA_UZIEMIONA' } }, oczekiwany: 'GWIAZDA_UZIEMIONA' },
  {
    nazwa: 'element i typ',
    pola: { uklad_polaczen: 'GWIAZDA_IZOLOWANA', materialized_params: { uklad_polaczen: 'TROJKAT' } },
    oczekiwany: 'GWIAZDA_IZOLOWANA',
  },
  { nazwa: 'brak', pola: {}, oczekiwany: null },
  {
    nazwa: 'spoza słownika',
    pola: { materialized_params: { uklad_polaczen: 'ZYGZAK' } },
    oczekiwany: null,
  },
];

describe('bateriaNaKoncuToruPola — relacja pola z modelu', () => {
  for (const zrodlo of ZRODLA_UKLADU) {
    for (const zPrzekladnikiem of [true, false]) {
      for (const zacisk of ['zgodny', 'inny', 'brak'] as const) {
        it(`układ: ${zrodlo.nazwa} × przekładnik: ${zPrzekladnikiem} × zacisk: ${zacisk}`, () => {
          const snapshot = { shunt_capacitors: [bateria('BAT', zrodlo.pola)] };
          const terminal = zacisk === 'zgodny' ? ZACISK : zacisk === 'inny' ? 'bus/inny' : null;
          const widok = bateriaNaKoncuToruPola(pole(terminal, zPrzekladnikiem), snapshot);
          if (zacisk !== 'zgodny') {
            expect(widok).toBeNull();
            expect(bateriaWidokuPola(pole(terminal, zPrzekladnikiem), snapshot)).toEqual({});
            return;
          }
          expect(widok).toEqual({
            bateriaRef: 'BAT',
            uklad: zrodlo.oczekiwany,
            przekladnikNiezrownowazenia: zPrzekladnikiem,
          });
        });
      }
    }
  }

  it('dwie baterie na jednym zacisku — wybór po ref_id, niezależny od kolejności migawki', () => {
    const a = bateria('BAT-A', { uklad_polaczen: 'TROJKAT' });
    const b = bateria('BAT-B', { uklad_polaczen: 'GWIAZDA_UZIEMIONA' });
    for (const lista of [[a, b], [b, a]]) {
      expect(bateriaNaKoncuToruPola(pole(ZACISK, false), { shunt_capacitors: lista })?.bateriaRef).toBe('BAT-A');
    }
  });

  it('słownik układów frontu = słownik glifu (każdy układ rozpoznany z modelu)', () => {
    for (const uklad of UKLADY_POLACZEN_BATERII) {
      expect(ukladBateriiZModelu(bateria('B', { uklad_polaczen: uklad }))).toBe(uklad);
    }
  });
});

describe('CapacitorBankGlyph — znak układu i przekładnik z danych', () => {
  const wariant = (uklad: UkladPolaczenBaterii | null, przekladnik: boolean): string =>
    renderToStaticMarkup(
      createElement('svg', null, createElement(CapacitorBankGlyph, { x: 0, y: 0, bateria: { uklad, przekladnikNiezrownowazenia: przekladnik } })),
    );

  for (const uklad of [...UKLADY_POLACZEN_BATERII, null] as const) {
    for (const przekladnik of [true, false]) {
      it(`układ ${uklad ?? 'brak'} × przekładnik w polu: ${przekladnik}`, () => {
        const svg = wariant(uklad, przekladnik);
        const znak = uklad ?? 'NIEOKRESLONY';
        expect(svg).toContain(`data-uklad-baterii="${znak}"`);
        expect(svg).toContain(`data-znak-ukladu="${znak}"`);
        // Dokładnie jeden znak układu (bez wariantu domyślnego obok danej modelu).
        expect(svg.match(/data-znak-ukladu=/g)).toHaveLength(1);
        expect(svg.match(/data-okladka-kondensatora=/g)).toHaveLength(2);
        const zPrzekladnikiem = uklad === 'PODWOJNA_GWIAZDA_IZOLOWANA' && przekladnik;
        expect(svg).toContain(`data-przekladnik-niezrownowazenia="${zPrzekladnikiem ? 'tak' : 'nie'}"`);
        expect(svg.includes(`data-rodzaj-aparatu="${RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA}"`)).toBe(zPrzekladnikiem);
        if (zPrzekladnikiem) {
          expect(svg).toContain(`data-port="${PORTY_APARATOW_POLA_BKR[RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA][0]}"`);
        }
        expect(svg.includes('>?</text>')).toBe(uklad === null);
      });
    }
  }
});

describe('scena SLD v3 z fikstury generatora — glif baterii z modelu', () => {
  const SCENY: ReadonlyArray<{
    readonly nazwa: string;
    readonly enm: EnergyNetworkModel;
    readonly uklad: UkladPolaczenBaterii;
    readonly przekladnik: boolean;
  }> = [
    {
      nazwa: 'podwójna gwiazda z typu, przekładnik w polu',
      enm: (gpzBkrFx as unknown as { enm: EnergyNetworkModel }).enm,
      uklad: 'PODWOJNA_GWIAZDA_IZOLOWANA',
      przekladnik: true,
    },
    {
      nazwa: 'gwiazda uziemiona z elementu, bez przekładnika',
      enm: (gpzBkrUziemionaFx as unknown as { enm: EnergyNetworkModel }).enm,
      uklad: 'GWIAZDA_UZIEMIONA',
      przekladnik: false,
    },
  ];

  for (const scena of SCENY) {
    it(scena.nazwa, () => {
      const [bat] = scena.enm.shunt_capacitors ?? [];
      const poleBkr = scena.enm.bays?.find((b) => b.bay_role === 'BKR');
      expect(bat?.bus_ref).toBe(poleBkr?.terminal_bus_ref);
      const glify = buildSceneV3(scena.enm, 2).symbols.filter((s) => s.symbolId === 'capacitorBank');
      expect(glify).toHaveLength(1);
      expect(glify[0]?.bateria).toEqual({ uklad: scena.uklad, przekladnikNiezrownowazenia: scena.przekladnik });
    });
  }

  it('pole bez rekordu przekładnika i bateria bez układu w modelu — glif bez domysłu', () => {
    const enm = (gpzBkrFx as unknown as { enm: EnergyNetworkModel }).enm;
    const zmieniony: EnergyNetworkModel = {
      ...enm,
      bays: (enm.bays ?? []).map((b) =>
        b.bay_role === 'BKR'
          ? { ...b, primary_devices: (b.primary_devices ?? []).filter((d) => d.kind !== RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA) }
          : b,
      ),
      shunt_capacitors: (enm.shunt_capacitors ?? []).map((s) => ({
        ...s,
        uklad_polaczen: null,
        materialized_params: { ...(s.materialized_params ?? {}), uklad_polaczen: null },
      })),
    };
    const [glif] = buildSceneV3(zmieniony, 2).symbols.filter((s) => s.symbolId === 'capacitorBank');
    expect(glif?.bateria).toEqual({ uklad: null, przekladnikNiezrownowazenia: false });
  });
});
