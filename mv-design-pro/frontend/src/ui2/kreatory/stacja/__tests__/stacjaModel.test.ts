import { describe, expect, it } from 'vitest';

import type { TransformerType } from '../../../../ui/catalog/types';
import {
  DANE_DOMYSLNE,
  czyKoniecOdcinka,
  doborTransformatorow,
  fmtKv,
  fmtMva,
  kontekstKompletny,
  nazwaOperacji,
  normalizujTypStacji,
  ogranicznikOdplywow,
  parametryZKatalogu,
  walidujFormularz,
  wyznaczTryb,
  zbudujPayload,
  type KontekstStacji,
  type StacjaFormData,
} from '../stacjaModel';

const typy = [
  {
    id: 'trafo-630-15-04',
    name: 'TR 630',
    rated_power_mva: 0.63,
    voltage_hv_kv: 15,
    voltage_lv_kv: 0.4,
    uk_percent: 4,
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
  {
    id: 'trafo-1000-15-04',
    name: 'TR 1000',
    rated_power_mva: 1.0,
    voltage_hv_kv: 15,
    voltage_lv_kv: 0.4,
    uk_percent: 6,
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
  {
    id: 'trafo-1000-15-069',
    name: 'TR 1000 690V',
    rated_power_mva: 1.0,
    voltage_hv_kv: 15,
    voltage_lv_kv: 0.69,
    uk_percent: 6,
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
  {
    id: 'trafo-1000-20-04',
    name: 'TR 1000 20kV',
    rated_power_mva: 1.0,
    voltage_hv_kv: 20,
    voltage_lv_kv: 0.4,
    uk_percent: 6,
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
] as unknown as TransformerType[];

function dane(over: Partial<StacjaFormData> = {}): StacjaFormData {
  return { ...DANE_DOMYSLNE, catalog_ref: 'trafo-630-15-04', ...over };
}

function kontekst(over: Partial<KontekstStacji> = {}): KontekstStacji {
  return {
    tryb: 'SPLIT',
    endpointBusRef: '',
    runRef: '',
    segmentId: 'seg-1',
    positionOnSegment: 0.5,
    snVoltageKv: 15,
    stationName: 'Stacja ST-3',
    stationKind: 'branch',
    ...over,
  };
}

describe('stacjaModel — tryb i operacja', () => {
  it('append gdy jawny ENDPOINT_APPEND i znany terminal', () => {
    expect(wyznaczTryb('ENDPOINT_APPEND', 'bus-end', 0.5)).toBe('ENDPOINT_APPEND');
  });

  it('append gdy pozycja na końcu segmentu (>=0.999) i terminal', () => {
    expect(wyznaczTryb('', 'bus-end', 1)).toBe('ENDPOINT_APPEND');
  });

  it('split gdy brak terminala', () => {
    expect(wyznaczTryb('ENDPOINT_APPEND', '', 1)).toBe('SPLIT');
    expect(wyznaczTryb('', '', 0.5)).toBe('SPLIT');
  });

  it('mapuje tryb na realną operację domenową', () => {
    expect(nazwaOperacji(kontekst({ tryb: 'ENDPOINT_APPEND' }))).toBe('append_station_on_endpoint');
    expect(nazwaOperacji(kontekst({ tryb: 'SPLIT' }))).toBe('insert_station_on_segment_sn');
    expect(czyKoniecOdcinka(kontekst({ tryb: 'ENDPOINT_APPEND' }))).toBe(true);
  });

  it('kompletność kontekstu zależy od trybu', () => {
    expect(kontekstKompletny(kontekst({ tryb: 'ENDPOINT_APPEND', endpointBusRef: 'bus-end' }))).toBe(true);
    expect(kontekstKompletny(kontekst({ tryb: 'ENDPOINT_APPEND', endpointBusRef: '' }))).toBe(false);
    expect(kontekstKompletny(kontekst({ tryb: 'SPLIT', segmentId: 'seg-1' }))).toBe(true);
    expect(kontekstKompletny(kontekst({ tryb: 'SPLIT', segmentId: '' }))).toBe(false);
  });
});

describe('stacjaModel — typ stacji', () => {
  it('normalizuje wariant semantyczny i legacy', () => {
    expect(normalizujTypStacji('inline')).toBe('inline');
    expect(normalizujTypStacji('sectional')).toBe('sectional');
    expect(normalizujTypStacji('B')).toBe('inline');
    expect(normalizujTypStacji('D')).toBe('sectional');
    expect(normalizujTypStacji('gpz')).toBe('branch');
    expect(normalizujTypStacji(undefined)).toBe('branch');
  });
});

describe('stacjaModel — walidacja', () => {
  it('wymaga katalogu i dodatniego napięcia nN', () => {
    expect(walidujFormularz(dane({ catalog_ref: null })).some((e) => e.field === 'catalog_ref')).toBe(true);
    expect(walidujFormularz(dane({ nn_voltage_kv: 0 })).some((e) => e.field === 'nn_voltage_kv')).toBe(true);
    expect(walidujFormularz(dane()).length).toBe(0);
  });

  it('ogranicza liczbę odpływów do zakresu', () => {
    expect(ogranicznikOdplywow(0)).toBe(1);
    expect(ogranicznikOdplywow(99)).toBe(8);
    expect(ogranicznikOdplywow(3)).toBe(3);
  });
});

describe('stacjaModel — dobór transformatora', () => {
  it('filtruje po napięciu SN szyny i nN odbioru, sortuje po mocy', () => {
    const wynik = doborTransformatorow(typy, 15, 0.4);
    expect(wynik.map((t) => t.id)).toEqual(['trafo-630-15-04', 'trafo-1000-15-04']);
  });

  it('inne napięcie nN zwraca zgodny typ', () => {
    expect(doborTransformatorow(typy, 15, 0.69).map((t) => t.id)).toEqual(['trafo-1000-15-069']);
  });

  it('inne napięcie SN zawęża listę', () => {
    expect(doborTransformatorow(typy, 20, 0.4).map((t) => t.id)).toEqual(['trafo-1000-20-04']);
  });

  it('czyta parametry z katalogu', () => {
    expect(parametryZKatalogu('trafo-630-15-04', typy)).toMatchObject({
      rated_power_mva: 0.63,
      voltage_hv_kv: 15,
      voltage_lv_kv: 0.4,
    });
  });
});

describe('stacjaModel — payload', () => {
  it('wariant koniec odcinka → append z endpoint_bus_ref/run_ref', () => {
    const payload = zbudujPayload(
      dane({ station_name: 'ST-3' }),
      kontekst({ tryb: 'ENDPOINT_APPEND', endpointBusRef: 'bus-end', runRef: 'run-1' }),
    );
    expect(payload).toMatchObject({
      name: 'ST-3',
      station_type: 'branch',
      endpoint_bus_ref: 'bus-end',
      run_ref: 'run-1',
      station: expect.objectContaining({ nn_voltage_kv: 0.4, station_role: 'STACJA_SN_NN' }),
      transformer: expect.objectContaining({
        create: true,
        transformer_catalog_ref: 'trafo-630-15-04',
        catalog_binding: expect.objectContaining({
          catalog_namespace: 'TRAFO_SN_NN',
          catalog_item_id: 'trafo-630-15-04',
        }),
      }),
      nn_block: expect.objectContaining({ nn_configuration: 'LOAD_NN', outgoing_feeders_nn_count: 2 }),
      options: expect.objectContaining({ create_transformer_field: true, create_nn_bus: true }),
    });
    expect(payload).not.toHaveProperty('segment_id');
    expect(payload).not.toHaveProperty('insert_at');
  });

  it('wariant podział → insert z segment_id/insert_at RATIO', () => {
    const payload = zbudujPayload(
      dane(),
      kontekst({ tryb: 'SPLIT', segmentId: 'seg-7', positionOnSegment: 0.25 }),
    );
    expect(payload).toMatchObject({
      segment_id: 'seg-7',
      insert_at: { mode: 'RATIO', value: 0.25 },
    });
    expect(payload).not.toHaveProperty('endpoint_bus_ref');
    // nazwa domyślna z kontekstu, gdy pole puste
    expect(payload).toHaveProperty('name', 'Stacja ST-3');
  });

  it('napięcie SN w payloadzie pochodzi z kontekstu (szyny), nie z UI', () => {
    const payload = zbudujPayload(dane(), kontekst({ snVoltageKv: 20 }));
    expect((payload.station as Record<string, unknown>).sn_voltage_kv).toBe(20);
  });
});

describe('stacjaModel — formatery', () => {
  it('formatuje wartości', () => {
    expect(fmtKv(0.4)).toBe('0.400 kV');
    expect(fmtMva(0.63)).toBe('0.63 MVA');
    expect(fmtMva(null)).toBe('—');
  });
});
