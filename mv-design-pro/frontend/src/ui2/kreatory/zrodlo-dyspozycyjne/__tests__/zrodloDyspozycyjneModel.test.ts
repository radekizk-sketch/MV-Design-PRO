import { describe, expect, it } from 'vitest';

import {
  brakiFormularza,
  DANE_DOMYSLNE,
  konfliktyFormularza,
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
    new_field_switch_kind: 'WYLACZNIK',
    new_field_switch_state: 'ZAMKNIETY',
    new_field_voltage_nn_kv: 0.4,
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
    new_field_switch_kind: 'WYLACZNIK',
    new_field_switch_state: 'ZAMKNIETY',
    new_field_voltage_nn_kv: 0.4,
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
  it('nowe pole wymaga aparatu, stanu i napięcia nN', () => {
    const b = walidujFormularz(genset({ new_field_switch_kind: null, new_field_voltage_nn_kv: null }), 'GENSET');
    expect(b.some((e) => e.field === 'new_field_switch_kind')).toBe(true);
    expect(b.some((e) => e.field === 'new_field_voltage_nn_kv')).toBe(true);
  });
  // Iloczyn cech: rodzaj (agregat/UPS) × parametr pusty/niepoprawny — pusty to BRAK (przy
  // zapisie), niepoprawny to KONFLIKT (od razu), nigdy oba naraz dla tego samego pola.
  it.each([
    ['GENSET', 'rated_power_kw'],
    ['GENSET', 'rated_voltage_kv'],
    ['GENSET', 'power_factor'],
    ['UPS', 'rated_power_kw'],
    ['UPS', 'backup_time_min'],
  ] as const)('%s / %s: pusty = brak, zero = konflikt', (rodzaj, pole) => {
    const baza = rodzaj === 'GENSET' ? genset : ups;
    const pusty = baza({ [pole]: null });
    expect(brakiFormularza(pusty, rodzaj).map((b) => b.field)).toContain(pole);
    expect(konfliktyFormularza(pusty, rodzaj).map((b) => b.field)).not.toContain(pole);
    const zero = baza({ [pole]: 0 });
    expect(konfliktyFormularza(zero, rodzaj).map((b) => b.field)).toContain(pole);
    expect(brakiFormularza(zero, rodzaj).map((b) => b.field)).not.toContain(pole);
  });

  it('braki niosą „co — po co”, bez ogólnego „Uzupełnij”', () => {
    const braki = brakiFormularza({ ...DANE_DOMYSLNE }, 'GENSET');
    expect(braki.length).toBeGreaterThan(0);
    for (const b of braki) {
      expect(b.message).toMatch(/ — /);
      expect(b.message).not.toMatch(/Uzupełnij/);
    }
  });

  it('katalog źródła nie jest wymagany (kontrakt GensetSpec/UPSSpec: catalog_item_id opcjonalny)', () => {
    expect(walidujFormularz(genset(), 'GENSET')).toEqual([]);
    expect(walidujFormularz(ups(), 'UPS')).toEqual([]);
    expect(zbudujPayload(genset(), 'GENSET', { station_ref: 'st-1', station_label: 'A' }).genset_spec).not.toHaveProperty(
      'catalog_item_id',
    );
  });

  it('istniejące pole wymaga wskazania pola', () => {
    const b = walidujFormularz(genset({ placement: 'EXISTING_FIELD', existing_field_ref: null }), 'GENSET');
    expect(b.some((e) => e.field === 'existing_field_ref')).toBe(true);
  });
});

describe('zrodloDyspozycyjneModel — payload', () => {
  const kontekst = { station_ref: 'st-1', station_label: 'Stacja A' };

  it('agregat: genset_spec + source_field dla nowego pola', () => {
    const payload = zbudujPayload(genset({ source_name: 'Agregat R' }), 'GENSET', kontekst);
    expect(payload).toMatchObject({
      bus_nn_ref: 'bus-nn',
      station_ref: 'st-1',
      placement: 'NEW_FIELD',
      existing_field_ref: null,
      genset_spec: expect.objectContaining({
        rated_power_kw: 250,
        power_factor: 0.8,
        operation_mode: 'PRACA_AWARYJNA',
        source_name: 'Agregat R',
      }),
    });
    const sf = payload.source_field as Record<string, unknown>;
    expect(sf.source_field_kind).toBe('AGREGAT');
    expect((sf.switch_spec as Record<string, unknown>).switch_kind).toBe('WYLACZNIK');
  });

  it('UPS: ups_spec + brak source_field dla istniejącego pola', () => {
    const payload = zbudujPayload(
      ups({ placement: 'EXISTING_FIELD', existing_field_ref: 'field-9' }),
      'UPS',
      kontekst,
    );
    expect(payload).toMatchObject({
      placement: 'EXISTING_FIELD',
      existing_field_ref: 'field-9',
      source_field: null,
      ups_spec: expect.objectContaining({ backup_time_min: 15, operation_mode: 'ONLINE' }),
    });
  });

  it('source_field niesie powiązanie katalogowe aparatu (APARAT_NN) gdy wskazane', () => {
    const payload = zbudujPayload(genset({ new_field_switch_catalog_ref: 'lv-7' }), 'GENSET', kontekst);
    const sf = payload.source_field as Record<string, unknown>;
    expect((sf.switch_spec as Record<string, Record<string, unknown>>).catalog_binding).toMatchObject({
      catalog_namespace: 'APARAT_NN',
      catalog_item_id: 'lv-7',
    });
  });
});
