/**
 * D2 (RECENZJA_DER_SN_DOBORY_2026-07): testy modelu DOBORU kreatora — budowa zapytania,
 * payload z propozycji, ostrzeżenia odstępstwa, komunikaty ❌ z backendu.
 */

import { describe, expect, it } from 'vitest';

import type { ConverterType } from '../../../../ui/catalog/types';
import type { DerSelectionPreviewResponse } from '../derSelectionApi';
import { DANE_DER_SN_DOMYSLNE, type DerSnFormData } from '../zrodloOzeModel';
import {
  charakterQMaZnaczenie,
  komunikatyBledow,
  odstepstwaPropozycji,
  propozycjaKompletna,
  zastosujPropozycje,
  zbudujZapytanieDoboru,
} from '../zrodloOzeDobor';

const KONWERTER: ConverterType = {
  id: 'conv-pv-500',
  name: 'Falownik PV 500 kW',
  kind: 'PV',
  un_kv: 0.4,
  sn_mva: 0.5,
  pmax_mw: 0.499,
} as ConverterType;

function odpowiedz(overrides: Partial<DerSelectionPreviewResponse> = {}): DerSelectionPreviewResponse {
  return {
    sum_apparent_power_mva: 0.998,
    transformer_current_a: 38.49,
    transformer: {
      proposal: {
        catalog_ref: 'tr-1000',
        name: 'TR 1000 kVA 15/0.4',
        sn_mva: 1.0,
        primary_kv: 15.0,
        secondary_kv: 0.4,
        uk_percent: 6.0,
        vector_group: 'Dyn11',
      },
      required_apparent_power_mva: 0.998,
      effective_load_mva: 0.998,
      rejected: [
        { catalog_ref: 'tr-630', name: 'TR 630', reason_code: 'moc_niewystarczajaca', reason_pl: 'za mała' },
      ],
      error_code: null,
      error_pl: null,
      formula_ref: 'S_wym',
    },
    cable: {
      proposal: {
        catalog_ref: 'cab-50',
        name: 'Kabel 50 mm²',
        cross_section_mm2: 50,
        rated_current_a: 160,
        delta_u_v: 10,
        delta_u_pct: 0.4,
      },
      required_ampacity_a: 38.49,
      max_delta_u_pct: 2.0,
      rejected: [],
      error_code: null,
      error_pl: null,
      formula_ref: 'Iz',
    },
    field_apparatus: {
      proposal: {
        catalog_ref: 'cb-400',
        name: 'Rozłącznik 400 A',
        equipment_kind: 'LOAD_SWITCH',
        un_kv: 12.0,
        in_a: 400,
        ik_ka: null,
      },
      required_current_a: 38.49,
      rejected: [],
      error_code: null,
      error_pl: null,
      formula_ref: 'In',
    },
    ...overrides,
  };
}

describe('zrodloOzeDobor — model doboru kreatora', () => {
  it('zbudujZapytanieDoboru wyprowadza ΣP=Pmax·liczba i napięcia z katalogu falownika', () => {
    const req = zbudujZapytanieDoboru(KONWERTER, 2, 15.0, {
      cableLengthKm: 1.5,
      transformerReservePu: 0.1,
      maxDeltaUPct: 2.0,
    });
    expect(req.sum_active_power_mw).toBeCloseTo(0.499 * 2);
    expect(req.inverter_output_kv).toBe(0.4);
    expect(req.sn_bus_voltage_kv).toBe(15.0);
    expect(req.cable_length_km).toBe(1.5);
    expect(req.transformer_reserve_pu).toBe(0.1);
    expect(req.max_delta_u_pct).toBe(2.0);
  });

  it('propozycjaKompletna wymaga TR + kabla + pola', () => {
    expect(propozycjaKompletna(odpowiedz())).toBe(true);
    expect(propozycjaKompletna(odpowiedz({ cable: null }))).toBe(false);
  });

  it('zastosujPropozycje przenosi ref-y i napięcia propozycji do payloadu toru', () => {
    const wynik = zastosujPropozycje(DANE_DER_SN_DOMYSLNE, odpowiedz());
    expect(wynik.block_transformer_catalog_ref).toBe('tr-1000');
    expect(wynik.block_transformer_rated_power_mva).toBe(1.0);
    expect(wynik.block_transformer_primary_voltage_kv).toBe(15.0);
    expect(wynik.block_transformer_secondary_voltage_kv).toBe(0.4);
    expect(wynik.block_transformer_vector_group).toBe('Dyn11');
    expect(wynik.inverter_output_voltage_kv).toBe(0.4);
    expect(wynik.mv_cable_catalog_ref).toBe('cab-50');
    expect(wynik.mv_field_apparatus_catalog_ref).toBe('cb-400');
  });

  it('odstepstwaPropozycji ostrzega, gdy wybór ręczny różni się od propozycji', () => {
    const reczny: DerSnFormData = {
      ...DANE_DER_SN_DOMYSLNE,
      block_transformer_catalog_ref: 'tr-1600',
      mv_cable_catalog_ref: 'cab-120',
      mv_field_apparatus_catalog_ref: 'cb-400', // zgodny z propozycją — bez ostrzeżenia
    };
    const ostrzezenia = odstepstwaPropozycji(reczny, odpowiedz());
    expect(ostrzezenia).toHaveLength(2);
    expect(ostrzezenia[0]).toContain('transformator');
    expect(ostrzezenia[1]).toContain('kabel');
  });

  it('komunikatyBledow zbiera komunikaty ❌ z backendu (TR/kabel/pole)', () => {
    const zBledem = odpowiedz({
      transformer: {
        ...odpowiedz().transformer,
        proposal: null,
        error_code: 'converter.der_sn.dobor_tr_brak_kandydata',
        error_pl: '❌ Brak transformatora blokowego w katalogu.',
      },
    });
    const komunikaty = komunikatyBledow(zBledem);
    expect(komunikaty).toHaveLength(1);
    expect(komunikaty[0]).toContain('❌');
  });
});

describe('przypadek pracy toru DER (karta F-K5, V12K-203)', () => {
  it('charakter mocy biernej i cos φ trafiają do żądania doboru', () => {
    const req = zbudujZapytanieDoboru(KONWERTER, 2, 15.0, {
      cableLengthKm: 8.0,
      cosPhi: 0.95,
      reactiveCharacter: 'capacitive',
    });
    expect(req.cos_phi).toBe(0.95);
    expect(req.reactive_character).toBe('capacitive');
  });

  it('bez charakteru Q żądanie jest identyczne jak przed kartą', () => {
    const req = zbudujZapytanieDoboru(KONWERTER, 2, 15.0, { cableLengthKm: 8.0 });
    expect('reactive_character' in req).toBe(false);
    expect('cos_phi' in req).toBe(false);
  });

  it('charakterQMaZnaczenie: tylko cos φ z przedziału (0; 1) daje moc bierną', () => {
    // Przy cos φ = 1 sin φ = 0, więc człon X·sinφ zeruje się i wybór poboru/oddawania Q
    // nie może zmienić ani ΔU, ani przekroju — kontrolka musi być wtedy wyłączona.
    expect(charakterQMaZnaczenie(0.95)).toBe(true);
    expect(charakterQMaZnaczenie(1)).toBe(false);
    expect(charakterQMaZnaczenie(null)).toBe(false);
    expect(charakterQMaZnaczenie(undefined)).toBe(false);
    expect(charakterQMaZnaczenie(0)).toBe(false);
  });
});
