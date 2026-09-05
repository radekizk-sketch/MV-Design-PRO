import { describe, expect, it } from 'vitest';

import type { ConverterType } from '../../../../ui/catalog/types';
import {
  BESS_OPCJE,
  DANE_DER_SN_DOMYSLNE,
  DANE_DOMYSLNE,
  LV_SWITCHGEAR_OPCJE,
  REGULACJA_OPCJE,
  SPOSOB_PRZYLACZENIA_OPCJE,
  TECHNOLOGIA_OPCJE,
  bessLabel,
  converterCatalogNamespace,
  maKontekst,
  materializedParams,
  regulacjaLabel,
  sposobPrzylaczeniaLabel,
  sugerujDerSn,
  technologiaLabel,
  refUtworzonegoWytworcy,
  trybQWymagaWartosci,
  walidujDerSn,
  walidujFormularz,
  wariantLabel,
  zbudujDerTopology,
  zbudujLimityBierne,
  zbudujPayload,
  zbudujWiazaniaDer,
  type DerSnFormData,
  type OzeFormData,
  type TransformatorBlokowy,
} from '../zrodloOzeModel';

const KONWERTER: ConverterType = {
  id: 'conv-pv-1',
  name: 'Falownik PV 1',
  manufacturer: 'Producent testowy',
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
    expect(regulacjaLabel('REGULACJA_NAPIECIA')).toContain('napięcia');
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
  it('cosφ poza (0;1] = błąd (tylko dla trybu stałego cosφ)', () => {
    expect(
      walidujFormularz(dane({ control_mode: 'STALY_COS_PHI', cos_phi_target: 1.5 }), KONTEKST).some(
        (e) => e.field === 'cos_phi_target',
      ),
    ).toBe(true);
    expect(
      walidujFormularz(dane({ control_mode: 'STALY_COS_PHI', cos_phi_target: 0 }), KONTEKST).some(
        (e) => e.field === 'cos_phi_target',
      ),
    ).toBe(true);
    // cosφ w zakresie = OK; inny tryb nie waliduje cosφ.
    expect(
      walidujFormularz(dane({ control_mode: 'STALY_COS_PHI', cos_phi_target: 0.95 }), KONTEKST).some(
        (e) => e.field === 'cos_phi_target',
      ),
    ).toBe(false);
    expect(
      walidujFormularz(dane({ control_mode: 'Q_OD_U', cos_phi_target: 1.5, qu_slope_pu_per_pu: 4 }), KONTEKST).some(
        (e) => e.field === 'cos_phi_target',
      ),
    ).toBe(false);
  });
  it('pasmo Q(U): napięcie dolne > górne = błąd (tylko dla trybu Q(U))', () => {
    expect(
      walidujFormularz(
        dane({ control_mode: 'Q_OD_U', qu_slope_pu_per_pu: 4, qu_deadband_low_pu: 1.05, qu_deadband_high_pu: 0.95 }),
        KONTEKST,
      ).some((e) => e.field === 'qu_deadband_high_pu'),
    ).toBe(true);
    expect(
      walidujFormularz(
        dane({ control_mode: 'Q_OD_U', qu_slope_pu_per_pu: 4, qu_deadband_low_pu: 0.95, qu_deadband_high_pu: 1.05 }),
        KONTEKST,
      ).some((e) => e.field === 'qu_deadband_high_pu'),
    ).toBe(false);
  });
  describe('REGULACJA_NAPIECIA (karta CV-4.1b, A3-04) — iloczyn cech', () => {
    it('kompletny + poprawny: brak błędów', () => {
      const errs = walidujFormularz(
        dane({ control_mode: 'REGULACJA_NAPIECIA', u_set_pu: 1.02, q_min_mvar: -0.03, q_max_mvar: 0.03 }),
        KONTEKST,
      );
      expect(errs.some((e) => e.field === 'u_set_pu' || e.field === 'q_max_mvar')).toBe(false);
    });
    it('brak u_set_pu = błąd na polu u_set_pu', () => {
      const errs = walidujFormularz(
        dane({ control_mode: 'REGULACJA_NAPIECIA', u_set_pu: null, q_min_mvar: -0.03, q_max_mvar: 0.03 }),
        KONTEKST,
      );
      expect(errs.some((e) => e.field === 'u_set_pu')).toBe(true);
    });
    it.each([0.85, 1.15])('u_set_pu=%s poza pasmem [0,9; 1,1] = błąd', (u) => {
      const errs = walidujFormularz(
        dane({ control_mode: 'REGULACJA_NAPIECIA', u_set_pu: u, q_min_mvar: -0.03, q_max_mvar: 0.03 }),
        KONTEKST,
      );
      expect(errs.some((e) => e.field === 'u_set_pu')).toBe(true);
    });
    it.each([0.9, 1.1])('u_set_pu=%s na granicy pasma (włącznie) = brak błędu', (u) => {
      const errs = walidujFormularz(
        dane({ control_mode: 'REGULACJA_NAPIECIA', u_set_pu: u, q_min_mvar: -0.03, q_max_mvar: 0.03 }),
        KONTEKST,
      );
      expect(errs.some((e) => e.field === 'u_set_pu')).toBe(false);
    });
    it('brak granic Q = błąd na polu q_max_mvar', () => {
      const errs = walidujFormularz(
        dane({ control_mode: 'REGULACJA_NAPIECIA', u_set_pu: 1.0, q_min_mvar: null, q_max_mvar: null }),
        KONTEKST,
      );
      expect(errs.some((e) => e.field === 'q_max_mvar')).toBe(true);
    });
    it('q_min == q_max (ścisła nierówność wymagana dla tego trybu) = błąd', () => {
      const errs = walidujFormularz(
        dane({ control_mode: 'REGULACJA_NAPIECIA', u_set_pu: 1.0, q_min_mvar: 0.01, q_max_mvar: 0.01 }),
        KONTEKST,
      );
      expect(errs.some((e) => e.field === 'q_max_mvar')).toBe(true);
    });
    it('inny tryb (STALY_COS_PHI) z u_set_pu=null nie zgłasza błędu pola u_set_pu', () => {
      const errs = walidujFormularz(
        dane({ control_mode: 'STALY_COS_PHI', cos_phi_target: 0.95, u_set_pu: null }),
        KONTEKST,
      );
      expect(errs.some((e) => e.field === 'u_set_pu')).toBe(false);
    });
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

  it('statyzm P(f)/LFSM trafia do payloadu (G-OZE-B); puste = pominięte', () => {
    const zDroop = zbudujPayload(dane({ frequency_droop_percent: 5 }), KONTEKST, KONWERTER, null);
    expect(zDroop.frequency_droop_percent).toBe(5);
    const bezDroop = zbudujPayload(dane(), KONTEKST, KONWERTER, null);
    expect(bezDroop.frequency_droop_percent).toBeUndefined();
  });

  it('pasmo nieczułości P(f) trafia do payloadu tylko przy zadanym statyzmie (G-OZE-B3)', () => {
    const zDeadband = zbudujPayload(
      dane({ frequency_droop_percent: 5, lfsm_deadband_hz: 0.2 }),
      KONTEKST,
      KONWERTER,
      null,
    );
    expect(zDeadband.lfsm_deadband_hz).toBe(0.2);
    // Bez statyzmu pasmo jest ignorowane (zero fabrykacji: LFSM nieaktywne).
    const bezStatyzmu = zbudujPayload(dane({ lfsm_deadband_hz: 0.2 }), KONTEKST, KONWERTER, null);
    expect(bezStatyzmu.lfsm_deadband_hz).toBeUndefined();
  });

  it('cosφ wysyłany tylko w trybie STALY_COS_PHI; nachylenie Q(U) tylko w Q_OD_U (G-OZE-B3)', () => {
    const cosPhi = zbudujPayload(
      dane({ control_mode: 'STALY_COS_PHI', cos_phi_target: 0.95, qu_slope_pu_per_pu: 4 }),
      KONTEKST,
      KONWERTER,
      null,
    );
    expect(cosPhi.cos_phi).toBe(0.95);
    expect(cosPhi.qu_slope_pu_per_pu).toBeUndefined();

    const qu = zbudujPayload(
      dane({
        control_mode: 'Q_OD_U',
        cos_phi_target: 0.95,
        qu_slope_pu_per_pu: 4,
        qu_deadband_low_pu: 0.95,
        qu_deadband_high_pu: 1.05,
      }),
      KONTEKST,
      KONWERTER,
      null,
    );
    expect(qu.qu_slope_pu_per_pu).toBe(4);
    expect(qu.qu_deadband_low_pu).toBe(0.95);
    expect(qu.qu_deadband_high_pu).toBe(1.05);
    expect(qu.cos_phi).toBeUndefined();

    // Pasmo Q(U) pomijane poza trybem Q(U) (zero fabrykacji).
    const cosPhiNoDb = zbudujPayload(
      dane({ control_mode: 'STALY_COS_PHI', cos_phi_target: 0.95, qu_deadband_low_pu: 0.95, qu_deadband_high_pu: 1.05 }),
      KONTEKST,
      KONWERTER,
      null,
    );
    expect(cosPhiNoDb.qu_deadband_low_pu).toBeUndefined();
    expect(cosPhiNoDb.qu_deadband_high_pu).toBeUndefined();

    // Tryb pasywny: żadna wartość rządząca nie jest wysyłana.
    const pasywny = zbudujPayload(
      dane({ control_mode: 'WYLACZONE', cos_phi_target: 0.95, qu_slope_pu_per_pu: 4 }),
      KONTEKST,
      KONWERTER,
      null,
    );
    expect(pasywny.cos_phi).toBeUndefined();
    expect(pasywny.qu_slope_pu_per_pu).toBeUndefined();
  });

  it('u_set_pu wysyłany TYLKO w trybie REGULACJA_NAPIECIA (karta CV-4.1b, A3-04)', () => {
    const regulacja = zbudujPayload(
      dane({ control_mode: 'REGULACJA_NAPIECIA', u_set_pu: 1.02, q_min_mvar: -0.03, q_max_mvar: 0.03 }),
      KONTEKST,
      KONWERTER,
      null,
    );
    expect(regulacja.u_set_pu).toBe(1.02);
    expect(regulacja.control_mode).toBe('REGULACJA_NAPIECIA');
    expect(regulacja.q_min_mvar).toBe(-0.03);
    expect(regulacja.q_max_mvar).toBe(0.03);

    const innyTryb = zbudujPayload(
      dane({ control_mode: 'STALY_COS_PHI', cos_phi_target: 0.95, u_set_pu: 1.02 }),
      KONTEKST,
      KONWERTER,
      null,
    );
    expect(innyTryb.u_set_pu).toBeUndefined();
  });

  it('flagi FRT (LVRT/HVRT) wysyłane tylko gdy zadeklarowane (G-OZE-B2)', () => {
    const zadeklarowane = zbudujPayload(
      dane({ has_lvrt_curve: true, has_hvrt_curve: true }),
      KONTEKST,
      KONWERTER,
      null,
    );
    expect(zadeklarowane.has_lvrt_curve).toBe(true);
    expect(zadeklarowane.has_hvrt_curve).toBe(true);

    const domyslne = zbudujPayload(dane({}), KONTEKST, KONWERTER, null);
    expect(domyslne.has_lvrt_curve).toBeUndefined();
    expect(domyslne.has_hvrt_curve).toBeUndefined();
  });

  it('trybQWymagaWartosci: tryb Q wybrany bez wartości rządzącej = regulacja pasywna', () => {
    // Domyślnie STALY_COS_PHI bez cos_phi_target → wymaga wartości.
    expect(trybQWymagaWartosci(dane())).toBe(true);
    expect(trybQWymagaWartosci(dane({ cos_phi_target: 0.95 }))).toBe(false);
    expect(trybQWymagaWartosci(dane({ control_mode: 'Q_OD_U' }))).toBe(true);
    expect(trybQWymagaWartosci(dane({ control_mode: 'Q_OD_U', qu_slope_pu_per_pu: 4 }))).toBe(false);
    // Tryby bez wartości rządzącej (P(U), wyłączone) nie są „pasywne z brakiem".
    expect(trybQWymagaWartosci(dane({ control_mode: 'WYLACZONE' }))).toBe(false);
    expect(trybQWymagaWartosci(dane({ control_mode: 'P_OD_U' }))).toBe(false);
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

// ---------------------------------------------------------------------------
// W2b-DANE: tor DER przyłączonego po stronie SN — model payloadu (DerTopology).
// ---------------------------------------------------------------------------

const DER_SN: DerSnFormData = {
  ...DANE_DER_SN_DOMYSLNE,
  inverter_output_voltage_kv: 0.4,
  has_manufacturer_lv_switchgear: true,
  lv_switchgear_variant: 'multi-feeder',
  block_transformer_catalog_ref: 'tr-sn-nn-15-04-1000kva-dyn11',
  block_transformer_rated_power_mva: 1.0,
  block_transformer_primary_voltage_kv: 15.0,
  block_transformer_secondary_voltage_kv: 0.4,
  block_transformer_vector_group: 'Dyn11',
  mv_switching_device: 'CB',
  mv_ct: true,
  mv_vt: true,
  mv_earthing_switch: true,
  mv_surge_arrester: true,
  mv_protection_relay: true,
  mv_cable_head: true,
  mv_field_apparatus_catalog_ref: 'ap-sn-cb-630',
  mv_field_name: 'Pole PV SN',
  mv_cable_catalog_ref: 'cable-base-epr-al-1c-240',
  mv_cable_length_km: 0.05,
  mv_cable_laying_conditions: null,
};

describe('zrodloOzeModel — tor DER-SN (DerTopology)', () => {
  it('zbudujDerTopology mapuje 1:1 na kontrakt backendu', () => {
    const topo = zbudujDerTopology(DER_SN, 'bus_sn_1');
    expect(topo.connection_level).toBe('sn');
    expect(topo.has_block_transformer).toBe(true);
    expect(topo.has_dedicated_mv_field).toBe(true);
    expect(topo.mv_bus_ref).toBe('bus_sn_1');
    expect(topo.inverter_output_voltage_kv).toBe(0.4);
    expect(topo.lv_switchgear_variant).toBe('multi-feeder');
    expect(topo.block_transformer?.catalog_binding).toMatchObject({
      catalog_namespace: 'TRAFO_SN_NN',
      catalog_item_id: 'tr-sn-nn-15-04-1000kva-dyn11',
    });
    // D3 wym. 7: grupa połączeń idzie w payload (parametr modelu, spójny z typem katalogu).
    expect(topo.block_transformer?.vector_group).toBe('Dyn11');
    expect(topo.mv_field_configuration?.apparatus_catalog_binding).toMatchObject({
      catalog_namespace: 'APARAT_SN',
      catalog_item_id: 'ap-sn-cb-630',
    });
    expect(topo.mv_field_configuration?.cable_catalog_binding).toMatchObject({
      catalog_namespace: 'KABEL_SN',
      catalog_item_id: 'cable-base-epr-al-1c-240',
    });
    // V12K-207: brak warunków ułożenia = warunki katalogowe. Pole jedzie jako null,
    // więc payload dotychczasowych torów pozostaje bez zmian znaczeniowych.
    expect(topo.mv_field_configuration?.cable_laying_conditions).toBeNull();
  });

  it('warunki UŁOŻENIA kabla jadą do modelu razem z torem (V12K-207)', () => {
    // Bez tego raport zgodności liczyłby propozycję dla warunków katalogowych i
    // zgłaszał fałszywe odstępstwo od doboru zrobionego dla warunków ziemnych.
    const topo = zbudujDerTopology(
      {
        ...DER_SN,
        mv_cable_laying_conditions: { set_name: 'ziemia_3_kable_warstwa_200mm' },
      },
      'bus_sn_1',
    );
    expect(topo.mv_field_configuration?.cable_laying_conditions).toEqual({
      set_name: 'ziemia_3_kable_warstwa_200mm',
    });
  });

  it('własne współczynniki jadą w całości (nazwa sama nic nie odtwarza)', () => {
    const topo = zbudujDerTopology(
      {
        ...DER_SN,
        mv_cable_laying_conditions: {
          set_name: 'wlasne',
          f_grunt: 0.88,
          f_wiazka: 1.0,
          f_grupa: 0.9,
          opis_pl: 'Ziemia, 2 obwody w rurach oslonowych',
        },
      },
      'bus_sn_1',
    );
    expect(topo.mv_field_configuration?.cable_laying_conditions).toEqual({
      set_name: 'wlasne',
      f_grunt: 0.88,
      f_wiazka: 1.0,
      f_grupa: 0.9,
      opis_pl: 'Ziemia, 2 obwody w rurach oslonowych',
    });
  });

  it('przełączniki wyposażenia pola są load-bearing (zero fabrykacji)', () => {
    const topo = zbudujDerTopology(
      { ...DER_SN, mv_vt: false, mv_surge_arrester: false, mv_switching_device: 'LBS' },
      'bus_sn_1',
    );
    const cfg = topo.mv_field_configuration;
    expect(cfg?.vt).toBe(false);
    expect(cfg?.surge_arrester).toBe(false);
    expect(cfg?.switching_device).toBe('LBS');
    // Odznaczone opcje trafiają do payloadu jako false (backend usuwa aparat), nie znikają.
    expect(cfg?.ct).toBe(true);
    expect(cfg?.cable_head).toBe(true);
  });

  it('walidujDerSn wymaga katalogów toru i spójności napięć', () => {
    expect(walidujDerSn(DER_SN)).toEqual([]);
    const braki = walidujDerSn({
      ...DANE_DER_SN_DOMYSLNE,
      inverter_output_voltage_kv: 0.4,
    });
    const fields = braki.map((b) => b.field);
    expect(fields).toContain('block_transformer_catalog_ref');
    expect(fields).toContain('mv_field_apparatus_catalog_ref');
    expect(fields).toContain('mv_cable_catalog_ref');
  });

  it('walidujDerSn wykrywa niezgodność napięcia strony nN TR blokowego', () => {
    const braki = walidujDerSn({ ...DER_SN, block_transformer_secondary_voltage_kv: 0.69 });
    expect(braki.map((b) => b.field)).toContain('block_transformer_secondary_voltage_kv');
  });

  it('sugerujDerSn wyprowadza napięcia z katalogu falownika i szyny SN', () => {
    const seeded = sugerujDerSn(
      { ...DANE_DER_SN_DOMYSLNE, inverter_output_voltage_kv: null },
      KONWERTER,
      15.0,
    );
    expect(seeded.inverter_output_voltage_kv).toBe(0.4);
    expect(seeded.block_transformer_secondary_voltage_kv).toBe(0.4);
    expect(seeded.block_transformer_primary_voltage_kv).toBe(15.0);
  });

  it('LV_SWITCHGEAR_OPCJE eksponuje warianty części nN producenta', () => {
    const values = LV_SWITCHGEAR_OPCJE.map((o) => o.value);
    expect(values).toEqual([
      'none',
      'single-bus',
      'multi-feeder',
      'combiner',
      'integrated-skid',
    ]);
  });

  it('zbudujDerTopology przenosi jawny sposób przyłączenia do payloadu (D1 wymaganie 9)', () => {
    const topo = zbudujDerTopology(
      { ...DER_SN, connection_method: 'der_przez_rozdzielnie_producenta' },
      'bus_sn_1',
    );
    expect(topo.connection_method).toBe('der_przez_rozdzielnie_producenta');
    const domyslny = zbudujDerTopology(DER_SN, 'bus_sn_1');
    expect(domyslny.connection_method).toBe('der_z_tr_blokowym');
  });

  it('SPOSOB_PRZYLACZENIA_OPCJE mapuje kody backendu na polskie etykiety', () => {
    expect(SPOSOB_PRZYLACZENIA_OPCJE.map((o) => o.value)).toEqual([
      'der_z_tr_blokowym',
      'der_przez_rozdzielnie_producenta',
    ]);
    expect(sposobPrzylaczeniaLabel('der_z_tr_blokowym')).toBe('DER z transformatorem blokowym');
    expect(sposobPrzylaczeniaLabel('der_przez_rozdzielnie_producenta')).toBe(
      'DER przez rozdzielnię producenta',
    );
  });

  it('walidujDerSn ostrzega o niespójnym sposobie przyłączenia (rozdzielnia bez rozdzielni nN)', () => {
    const braki = walidujDerSn({
      ...DER_SN,
      connection_method: 'der_przez_rozdzielnie_producenta',
      has_manufacturer_lv_switchgear: false,
    });
    expect(braki.map((b) => b.field)).toContain('connection_method');
  });
});

// K9-A: buildery sekwencji zapisu (wiązania + limity) i ref utworzonego wytwórcy.
describe('sekwencja zapisu K9-A', () => {
  it('zbudujWiazaniaDer wysyła WYŁĄCZNIE pola z wyborem projektanta (pominięcie ≠ null)', () => {
    expect(zbudujWiazaniaDer(DANE_DOMYSLNE)).toBeNull();
    const wiazania = zbudujWiazaniaDer({
      ...DANE_DOMYSLNE,
      ct_catalog_ref: 'ct-1',
      nc_rfg_profile_ref: 'ncrfg_pse',
      dynamic_model_ref: '  DOK-1  ',
    });
    expect(wiazania).toEqual({
      ct_catalog_ref: 'ct-1',
      nc_rfg_profile_ref: 'ncrfg_pse',
      dynamic_model_ref: 'DOK-1',
    });
    // Żadnych null-i dla pól niedotkniętych — null kasowałby wcześniejsze wiązania.
    expect(Object.values(wiazania ?? {})).not.toContain(null);
  });

  it('karta FAB-L: `fault_current_data_ref` USUNIĘTE z `OzeFormData` i z wyjścia '
    + '`zbudujWiazaniaDer` — pole nie miało ŻADNEGO konsumenta solvera (κ i składowe '
    + 'symetryczne liczy IEC 60909 z modelu, nie z deklaracji urządzenia)', () => {
    expect('fault_current_data_ref' in DANE_DOMYSLNE).toBe(false);
    // Rzutowanie celowe: dowodzi, że nawet gdyby ktoś PODAŁ to pole (np. stary
    // fixture), `zbudujWiazaniaDer` go nie odczyta — kontrakt `OzeFormData` już
    // go nie zna, więc typowo takie wywołanie nie powstanie.
    const daneZeStaregoPola = {
      ...DANE_DOMYSLNE,
      fault_current_data_ref: 'DOK-JUZ-NIE-ISTNIEJE',
      ct_catalog_ref: 'ct-1',
    } as unknown as OzeFormData;
    expect(zbudujWiazaniaDer(daneZeStaregoPola)).toEqual({ ct_catalog_ref: 'ct-1' });
  });

  it('zbudujLimityBierne zwraca limity Q tylko przy podanych wartościach (bez limitów P — brak konsumenta)', () => {
    expect(zbudujLimityBierne(DANE_DOMYSLNE)).toBeNull();
    expect(zbudujLimityBierne({ ...DANE_DOMYSLNE, q_min_mvar: -0.2 })).toEqual({ q_min_mvar: -0.2 });
    expect(zbudujLimityBierne({ ...DANE_DOMYSLNE, q_min_mvar: -0.2, q_max_mvar: 0.3 })).toEqual({
      q_min_mvar: -0.2,
      q_max_mvar: 0.3,
    });
  });

  it('refUtworzonegoWytworcy wybiera utworzony ref obecny w kolekcji wytwórców (nie ref pola)', () => {
    expect(
      refUtworzonegoWytworcy({
        selection_hint: { element_id: 'nn/x/source_field' },
        changes: { created_element_ids: ['nn/x/source_field', 'gen-7'] },
        snapshot: { generators: [{ ref_id: 'gen-7' }] },
      }),
    ).toBe('gen-7');
    // Bez migawki — pierwszy utworzony ref (odpowiedź okrojona, np. testy komponentu).
    expect(
      refUtworzonegoWytworcy({
        changes: { created_element_ids: ['gen-1'] },
      }),
    ).toBe('gen-1');
    // Z migawką bez dopasowania — null (uczciwy brak zamiast refu pola).
    expect(
      refUtworzonegoWytworcy({
        changes: { created_element_ids: ['nn/x/source_field'] },
        snapshot: { generators: [] },
      }),
    ).toBeNull();
  });
});
