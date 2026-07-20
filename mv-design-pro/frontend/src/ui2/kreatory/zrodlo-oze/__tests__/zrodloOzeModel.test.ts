import { describe, expect, it } from 'vitest';

import type { ConverterType } from '../../../../ui/catalog/types';
import {
  BESS_OPCJE,
  DANE_DOMYSLNE,
  REGULACJA_OPCJE,
  TECHNOLOGIA_OPCJE,
  bessLabel,
  converterCatalogNamespace,
  maKontekst,
  materializedParams,
  regulacjaLabel,
  technologiaLabel,
  walidujFormularz,
  wariantLabel,
  zbudujPayload,
  type OzeFormData,
  type TransformatorBlokowy,
} from '../zrodloOzeModel';

const KONWERTER: ConverterType = {
  id: 'conv-pv-1',
  name: 'Falownik PV 1',
  manufacturer: 'ACME',
  kind: 'PV',
  un_kv: 0.4,
  sn_mva: 1.0,
  pmax_mw: 0.9,
  qmin_mvar: -0.3,
  qmax_mvar: 0.3,
  cosphi_min: 0.9,
  cosphi_max: 1.0,
  ptpiree_certificate_ref: 'CERT-1',
  ptpiree_document_number: 'DOC-1',
} as unknown as ConverterType;

const TRANSFORMATOR: TransformatorBlokowy = {
  ref_id: 'tr-1',
  name: 'TR blokowy',
  lv_bus_ref: 'bus-lv-1',
  sn_mva: 2.0,
};

function dane(over: Partial<OzeFormData> = {}): OzeFormData {
  return { ...DANE_DOMYSLNE, converter_catalog_ref: 'conv-pv-1', apparatus_catalog_ref: 'apar-1', ...over };
}

const KONTEKST = { station_ref: 'st-1', bus_nn_ref: 'bus-nn-1', station_label: 'ST-1' };

describe('zrodloOzeModel — nazewnictwo (kod backendu vs polska etykieta)', () => {
  it('każda opcja ma polską etykietę, nie surowy kod backendu', () => {
    for (const { value, label } of [...TECHNOLOGIA_OPCJE, ...REGULACJA_OPCJE, ...BESS_OPCJE]) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(value);
      expect(/^[A-Z_]+$/.test(label)).toBe(false);
    }
  });
  it('mapowania totalne (bez wycieku kodu)', () => {
    expect(technologiaLabel('PV')).toBe('Fotowoltaika (PV)');
    expect(regulacjaLabel('Q_OD_U')).toContain('Q(U)');
    expect(wariantLabel('block_transformer')).toContain('transformator');
    expect(bessLabel('PEAK_SHAVING')).toContain('szczyt');
  });
});

describe('zrodloOzeModel — namespace katalogu', () => {
  it('mapuje technologię na namespace bindowania', () => {
    expect(converterCatalogNamespace('PV')).toBe('ZRODLO_NN_PV');
    expect(converterCatalogNamespace('BESS')).toBe('ZRODLO_NN_BESS');
    expect(converterCatalogNamespace('FW')).toBe('CONVERTER');
  });
});

describe('zrodloOzeModel — walidacja', () => {
  it('wymaga falownika z katalogu', () => {
    expect(
      walidujFormularz(dane({ converter_catalog_ref: null }), KONTEKST).some(
        (e) => e.field === 'converter_catalog_ref',
      ),
    ).toBe(true);
  });
  it('nn_side/nowe pole wymaga aparatu; block wymaga transformatora', () => {
    const bezAparatu = walidujFormularz(dane({ apparatus_catalog_ref: null }), KONTEKST);
    expect(bezAparatu.some((e) => e.field === 'apparatus_catalog_ref')).toBe(true);
    const block = walidujFormularz(
      dane({ connection_variant: 'block_transformer', blocking_transformer_ref: null }),
      KONTEKST,
    );
    expect(block.some((e) => e.field === 'blocking_transformer_ref')).toBe(true);
  });
  it('zakres Q: min > max = błąd', () => {
    const errs = walidujFormularz(dane({ q_min_mvar: 0.5, q_max_mvar: 0.1 }), KONTEKST);
    expect(errs.some((e) => e.field === 'q_max_mvar')).toBe(true);
  });
  it('BESS SOC poza 0–100 lub min>max = błąd', () => {
    const errs = walidujFormularz(
      dane({ source_technology: 'BESS', soc_min_percent: 80, soc_max_percent: 20 }),
      KONTEKST,
    );
    expect(errs.some((e) => e.field === 'soc_max_percent')).toBe(true);
  });
  it('poprawny nn_side przechodzi', () => {
    expect(walidujFormularz(dane(), KONTEKST).length).toBe(0);
  });
});

describe('zrodloOzeModel — payload add_converter_source (kontrakt 1:1)', () => {
  it('nn_side / nowe pole: aparat APARAT_NN + katalog PV + tabliczka', () => {
    const payload = zbudujPayload(dane({ source_name: 'Farma PV' }), KONTEKST, KONWERTER, null);
    expect(payload).toMatchObject({
      source_technology: 'PV',
      connection_variant: 'nn_side',
      station_ref: 'st-1',
      bus_nn_ref: 'bus-nn-1',
      placement: 'NEW_FIELD',
      source_name: 'Farma PV',
      control_mode: 'STALY_COS_PHI',
      catalog_binding: expect.objectContaining({ catalog_namespace: 'ZRODLO_NN_PV', catalog_item_id: 'conv-pv-1' }),
    });
    expect(payload.source_field).toMatchObject({
      source_field_kind: 'PV',
      catalog_binding: expect.objectContaining({ catalog_namespace: 'APARAT_NN' }),
    });
    // Q z tabliczki gdy nie podano jawnie; Pmax = liczba × pmax.
    expect(payload.q_min_mvar).toBe(-0.3);
    expect(payload.power_setpoint_mw).toBeCloseTo(0.9, 5);
  });

  it('block_transformer: bus_nn = szyna nN transformatora + blocking_transformer_ref, bez source_field', () => {
    const payload = zbudujPayload(
      dane({ connection_variant: 'block_transformer', blocking_transformer_ref: 'tr-1' }),
      KONTEKST,
      KONWERTER,
      TRANSFORMATOR,
    );
    expect(payload.bus_nn_ref).toBe('bus-lv-1');
    expect(payload.blocking_transformer_ref).toBe('tr-1');
    expect(payload.placement).toBeUndefined();
    expect(payload.source_field).toBeUndefined();
  });

  it('BESS: bess_mode + SOC obecne; dla PV pominięte', () => {
    const bess = zbudujPayload(
      dane({ source_technology: 'BESS', bess_mode: 'ARBITRAGE', soc_min_percent: 10, soc_max_percent: 90 }),
      KONTEKST,
      { ...KONWERTER, kind: 'BESS' } as ConverterType,
      null,
    );
    expect(bess.bess_mode).toBe('ARBITRAGE');
    expect(bess.soc_min_percent).toBe(10);
    const pv = zbudujPayload(dane(), KONTEKST, KONWERTER, null);
    expect(pv.bess_mode).toBeUndefined();
    expect(pv.soc_min_percent).toBeUndefined();
  });

  it('materialized_params niesie tabliczkę + certyfikat PTPiREE z katalogu', () => {
    const mp = materializedParams(KONWERTER, 0.9);
    expect(mp).toMatchObject({
      catalog_item_id: 'conv-pv-1',
      sn_mva: 1.0,
      pmax_mw: 0.9,
      un_kv: 0.4,
      ptpiree_certificate_ref: 'CERT-1',
    });
  });
});

describe('zrodloOzeModel — kontekst', () => {
  it('maKontekst wymaga stacji', () => {
    expect(maKontekst({})).toBe(false);
    expect(maKontekst({ station_ref: 'st-1' })).toBe(true);
  });
});
