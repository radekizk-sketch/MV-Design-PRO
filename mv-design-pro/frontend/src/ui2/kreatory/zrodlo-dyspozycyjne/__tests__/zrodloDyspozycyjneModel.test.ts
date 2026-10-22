import { describe, expect, it } from 'vitest';

import {
  DANE_DOMYSLNE,
  operacjaDla,
  rodzajZOperacji,
  walidujFormularz,
  zbudujPayload,
  type ZrodloDyspozycyjneFormData,
} from '../zrodloDyspozycyjneModel';

function genset(over: Partial<ZrodloDyspozycyjneFormData> = {}): ZrodloDyspozycyjneFormData {
  return {
    ...DANE_DOMYSLNE,
    bus_nn_ref: 'bus-nn',
    placement: 'NEW_FIELD',
    rated_power_kw: 250,
    rated_voltage_kv: 0.4,
    power_factor: 0.8,
    genset_operation_mode: 'PRACA_AWARYJNA',
    ...over,
  };
}

function ups(over: Partial<ZrodloDyspozycyjneFormData> = {}): ZrodloDyspozycyjneFormData {
  return {
    ...DANE_DOMYSLNE,
    bus_nn_ref: 'bus-nn',
    placement: 'NEW_FIELD',
    rated_power_kw: 100,
    backup_time_min: 15,
    ups_operation_mode: 'ONLINE',
    ...over,
  };
}

describe('zrodloDyspozycyjneModel — rodzaj z operacji', () => {
  it('mapuje op na rodzaj i operację', () => {
    expect(rodzajZOperacji('add_ups_nn')).toBe('UPS');
    expect(rodzajZOperacji('add_genset_nn')).toBe('GENSET');
    expect(operacjaDla('GENSET')).toBe('add_genset_nn');
    expect(operacjaDla('UPS')).toBe('add_ups_nn');
  });
});

describe('zrodloDyspozycyjneModel — walidacja', () => {
  it('agregat: komplet przechodzi, brak cos φ blokuje', () => {
    expect(walidujFormularz(genset(), 'GENSET').length).toBe(0);
    expect(walidujFormularz(genset({ power_factor: null }), 'GENSET').some((e) => e.field === 'power_factor')).toBe(true);
  });
  it('UPS: komplet przechodzi, brak czasu podtrzymania blokuje', () => {
    expect(walidujFormularz(ups(), 'UPS').length).toBe(0);
    expect(walidujFormularz(ups({ backup_time_min: 0 }), 'UPS').some((e) => e.field === 'backup_time_min')).toBe(true);
  });
  it('nowe pole bez aparatu katalogowego przechodzi (aparat opcjonalny, jak w handlerze)', () => {
    expect(walidujFormularz(genset({ new_field_switch_catalog_ref: null }), 'GENSET')).toEqual([]);
  });
  it('istniejące pole wymaga wskazania pola', () => {
    const b = walidujFormularz(genset({ placement: 'EXISTING_FIELD', existing_field_ref: null }), 'GENSET');
    expect(b.some((e) => e.field === 'existing_field_ref')).toBe(true);
  });
});

describe('zrodloDyspozycyjneModel — payload', () => {
  const kontekst = { station_ref: 'st-1', station_label: 'Stacja A' };

  // Klucze najwyższego poziomu = klucze czytane przez `add_genset_nn`/`add_ups_nn`
  // (`CANONICAL_OPERATIONS`, przypięte `test_spec_operacji_rowna_odczytom_handlera.py`).
  // Klucz spoza tego zbioru byłby polem, które handler pomija bez śladu.
  it.each([
    ['GENSET', 'genset_spec'],
    ['UPS', 'ups_spec'],
  ] as const)('%s: klucze ładunku = odczyty handlera', (kind, spec) => {
    const dane = kind === 'GENSET' ? genset() : ups();
    expect(Object.keys(zbudujPayload(dane, kind, kontekst)).sort()).toEqual(
      ['bus_nn_ref', 'existing_field_ref', 'placement', 'source_field', spec, 'station_ref'].sort(),
    );
  });

  it('agregat: genset_spec z tabliczki, bez katalogu źródła', () => {
    const payload = zbudujPayload(
      genset({ source_name: 'Agregat R', fuel_type: 'DIESEL' }),
      'GENSET',
      kontekst,
    );
    expect(payload).toMatchObject({
      bus_nn_ref: 'bus-nn',
      station_ref: 'st-1',
      placement: 'NEW_FIELD',
      existing_field_ref: null,
    });
    expect(payload.genset_spec).toEqual({
      rated_power_kw: 250,
      rated_voltage_kv: 0.4,
      power_factor: 0.8,
      operation_mode: 'PRACA_AWARYJNA',
      fuel_type: 'DIESEL',
      source_name: 'Agregat R',
    });
  });

  it.each([
    ['GENSET', 'AGREGAT'],
    ['UPS', 'UPS'],
  ] as const)('%s: nowe pole — source_field w kształcie czytanym przez backend', (kind, rodzajPola) => {
    const dane = kind === 'GENSET' ? genset() : ups();
    expect(zbudujPayload({ ...dane, new_field_name: ' Pole R ' }, kind, kontekst).source_field).toEqual({
      source_field_kind: rodzajPola,
      field_name: 'Pole R',
      catalog_binding: null,
    });
  });

  it('UPS: ups_spec + brak source_field dla istniejącego pola', () => {
    const payload = zbudujPayload(
      ups({ placement: 'EXISTING_FIELD', existing_field_ref: 'field-9', battery_type: 'VRLA' }),
      'UPS',
      kontekst,
    );
    expect(payload).toMatchObject({
      placement: 'EXISTING_FIELD',
      existing_field_ref: 'field-9',
      source_field: null,
    });
    expect(payload.ups_spec).toEqual({
      rated_power_kw: 100,
      backup_time_min: 15,
      operation_mode: 'ONLINE',
      battery_type: 'VRLA',
      source_name: null,
    });
  });

  it('source_field niesie powiązanie katalogowe aparatu (APARAT_NN) gdy wskazane', () => {
    const payload = zbudujPayload(genset({ new_field_switch_catalog_ref: 'lv-7' }), 'GENSET', kontekst);
    const sf = payload.source_field as Record<string, unknown>;
    expect(sf.catalog_binding).toMatchObject({
      catalog_namespace: 'APARAT_NN',
      catalog_item_id: 'lv-7',
    });
  });
});
