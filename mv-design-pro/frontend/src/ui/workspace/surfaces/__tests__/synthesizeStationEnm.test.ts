/**
 * synthesizeStationEnm tests (R48) — weryfikuje że Wizard fallback NIE GUBI
 * danych z drafta przy patchSnapshot.
 *
 * Krytyczność: R47 fallback zapisywał TYLKO Substation, gubiąc bays/transformer
 * /DER. R48 tworzy pełną hierarchię ENM. Te testy są bramą regresji.
 */

import { describe, expect, it } from 'vitest';

import {
  synthesizeStationEnm,
  mergeStationEnmIntoSnapshot,
  type SynthesizeStationDraft,
} from '../synthesizeStationEnm';
import type { EnergyNetworkModel } from '../../../../types/enm';

const EMPTY_SNAPSHOT: EnergyNetworkModel = {
  header: {
    schema_version: '1.0',
    network_id: 'test',
    base_voltage_kv: 15,
    base_mva: 100,
    cmax: 1.1,
    cmin: 0.95,
    frequency_hz: 50,
  },
  buses: [],
  branches: [],
  switches: [],
  sources: [],
  generators: [],
  loads: [],
  transformers: [],
  substations: [],
  bays: [],
} as EnergyNetworkModel;

function makeDraft(overrides: Partial<SynthesizeStationDraft> = {}): SynthesizeStationDraft {
  return {
    name: 'ST-001 Wschód',
    registryNumber: '587/24',
    stationType: 'mv_lv',
    ratedVoltageKv: 15,
    producer: 'ABB SafePlus',
    bays: [],
    hasTransformer: false,
    transformerCatalogRef: '',
    transformerSnKva: 630,
    transformerVectorGroup: 'Dyn5',
    transformerUkPercent: 6,
    hasLvSide: false,
    lvVoltageV: 400,
    lvSchemeKind: 'tns',
    lvMainBreakerCatalogRef: '',
    hasDer: false,
    derKind: null,
    derSnKva: 0,
    derConnectionVariant: null,
    derPccRef: '',
    derInverterCatalogRef: '',
    protectionHints: [],
    snInputSegmentRef: '',
    snOutputSegmentRef: '',
    isNopPoint: false,
    ...overrides,
  };
}

describe('synthesizeStationEnm (R48)', () => {
  describe('Substation hierarchy', () => {
    it('Minimalna stacja → Substation z 1 HV bus, brak bays/TR/DER', () => {
      const out = synthesizeStationEnm('station-test', makeDraft());
      expect(out.substation.ref_id).toBe('station-test');
      expect(out.substation.name).toBe('ST-001 Wschód');
      expect(out.substation.station_type).toBe('mv_lv');
      expect(out.substation.bus_refs).toHaveLength(1);
      expect(out.substation.bus_refs).toContain('station-test-bus-hv');
      expect(out.substation.transformer_refs).toHaveLength(0);
      expect(out.bays).toHaveLength(0);
      expect(out.buses).toHaveLength(1);
      expect(out.transformer).toBeNull();
      expect(out.generator).toBeNull();
    });

    it('hasLvSide → 2 buses (HV + LV)', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({
        hasLvSide: true,
        lvVoltageV: 400,
      }));
      expect(out.buses).toHaveLength(2);
      const hv = out.buses.find((b) => b.ref_id === 'station-test-bus-hv');
      const lv = out.buses.find((b) => b.ref_id === 'station-test-bus-lv');
      expect(hv?.voltage_kv).toBe(15);
      expect(lv?.voltage_kv).toBe(0.4);
    });
  });

  describe('Bays — KLUCZOWY test (R48 fixes hidden bug)', () => {
    it('3 bays w drafcie → 3 Bay obiekty w wyniku', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({
        bays: [
          { id: 'b-1', role: 'LINE_FULL', cbCatalogRef: 'CB1', cbIcuKa: 16, dsCatalogRef: 'DS1', ctCatalogRef: 'CT1', ctRatio: '200/5', hasVt: false, hasSurgeArrester: true, hasFuse: false },
          { id: 'b-2', role: 'TR_FULL', cbCatalogRef: 'CB2', cbIcuKa: 16, dsCatalogRef: '', ctCatalogRef: 'CT2', ctRatio: '100/5', hasVt: false, hasSurgeArrester: true, hasFuse: true },
          { id: 'b-3', role: 'COUPLER', cbCatalogRef: 'CB3', cbIcuKa: 25, dsCatalogRef: 'DS3', ctCatalogRef: '', ctRatio: '', hasVt: false, hasSurgeArrester: false, hasFuse: false },
        ],
      }));
      expect(out.bays).toHaveLength(3);
      expect(out.bays[0].bay_role).toBe('OUT'); // LINE_FULL → OUT
      expect(out.bays[1].bay_role).toBe('TR');  // TR_FULL → TR
      expect(out.bays[2].bay_role).toBe('COUPLER');
      /* Każdy bay ma referencję do stacji + szyny HV. */
      for (const bay of out.bays) {
        expect(bay.substation_ref).toBe('station-test');
        expect(bay.bus_ref).toBe('station-test-bus-hv');
      }
      /* Meta zawiera kompletny kontrakt aparatury. */
      expect(out.bays[0].meta.cb_catalog_ref).toBe('CB1');
      expect(out.bays[0].meta.ct_catalog_ref).toBe('CT1');
      expect(out.bays[0].meta.has_surge_arrester).toBe(true);
      expect(out.bays[1].meta.has_fuse).toBe(true);
    });

    it('Bay deterministyczny ref_id z draft.id', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({
        bays: [
          { id: 'bay-100', role: 'LINE_FULL', cbCatalogRef: 'CB1', cbIcuKa: 16, dsCatalogRef: '', ctCatalogRef: 'CT1', ctRatio: '200/5', hasVt: false, hasSurgeArrester: true, hasFuse: false },
        ],
      }));
      expect(out.bays[0].ref_id).toBe('station-test-bay-100');
    });

    it('Protection hint per bay → meta.protection_relay_type + ir_nominal_a', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({
        bays: [
          { id: 'b-1', role: 'LINE_FULL', cbCatalogRef: 'CB1', cbIcuKa: 16, dsCatalogRef: '', ctCatalogRef: 'CT1', ctRatio: '200/5', hasVt: false, hasSurgeArrester: true, hasFuse: false },
        ],
        protectionHints: [
          { bayId: 'b-1', relayType: 'overcurrent', irNominalA: 200 },
        ],
      }));
      expect(out.bays[0].meta.protection_relay_type).toBe('overcurrent');
      expect(out.bays[0].meta.protection_ir_nominal_a).toBe(200);
    });
  });

  describe('Transformer', () => {
    it('hasTransformer + hasLvSide → Transformer z hv/lv refs', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({
        hasTransformer: true,
        hasLvSide: true,
        transformerCatalogRef: 'ABB-TUMETIC-630',
        transformerSnKva: 630,
        transformerUkPercent: 6,
        ratedVoltageKv: 15,
        lvVoltageV: 400,
      }));
      expect(out.transformer).not.toBeNull();
      expect(out.transformer?.ref_id).toBe('station-test-tr');
      expect(out.transformer?.hv_bus_ref).toBe('station-test-bus-hv');
      expect(out.transformer?.lv_bus_ref).toBe('station-test-bus-lv');
      expect(out.transformer?.sn_mva).toBeCloseTo(0.63, 2);
      expect(out.transformer?.uhv_kv).toBe(15);
      expect(out.transformer?.ulv_kv).toBe(0.4);
      expect(out.transformer?.uk_percent).toBe(6);
      expect(out.transformer?.catalog_ref).toBe('ABB-TUMETIC-630');
      expect(out.substation.transformer_refs).toContain('station-test-tr');
    });

    it('hasTransformer=true ale hasLvSide=false → NULL transformer (LV bus required)', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({
        hasTransformer: true,
        hasLvSide: false,
      }));
      expect(out.transformer).toBeNull();
      expect(out.substation.transformer_refs).toHaveLength(0);
    });
  });

  describe('Generator (DER)', () => {
    it('PV + lv_behind_tr → Generator na LV bus', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({
        hasLvSide: true,
        hasDer: true,
        derKind: 'PV',
        derSnKva: 50,
        derConnectionVariant: 'lv_behind_tr',
        derPccRef: 'station-test-bus-lv',
      }));
      expect(out.generator).not.toBeNull();
      expect(out.generator?.gen_type).toBe('pv_inverter');
      expect(out.generator?.bus_ref).toBe('station-test-bus-lv');
      expect(out.generator?.connection_variant).toBe('LV_BEHIND_STATION_TRANSFORMER');
      expect(out.generator?.station_ref).toBe('station-test');
      expect(out.generator?.p_mw).toBeCloseTo(0.05, 3);
    });

    it('BESS + dedicated_mv → Generator na HV bus / PCC', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({
        hasDer: true,
        derKind: 'BESS',
        derSnKva: 200,
        derConnectionVariant: 'dedicated_mv',
        derPccRef: 'station-test-bus-hv',
      }));
      expect(out.generator?.gen_type).toBe('bess');
      expect(out.generator?.connection_variant).toBe('DEDICATED_MV_CONNECTION');
      expect(out.generator?.bus_ref).toBe('station-test-bus-hv');
    });

    it('FW + source_station → Generator wind_inverter z PCC ref', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({
        hasDer: true,
        derKind: 'FW',
        derSnKva: 1000,
        derConnectionVariant: 'source_station',
        derPccRef: 'external-bus-1',
      }));
      expect(out.generator?.gen_type).toBe('wind_inverter');
      expect(out.generator?.connection_variant).toBe('SOURCE_CONNECTION_STATION');
      expect(out.generator?.bus_ref).toBe('external-bus-1');
    });

    it('hasDer=false → null Generator', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({ hasDer: false }));
      expect(out.generator).toBeNull();
    });
  });

  describe('affectedRefs (Inv 4)', () => {
    it('Pełna stacja → affectedRefs zawiera wszystkie ref_ids', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({
        bays: [
          { id: 'b-1', role: 'LINE_FULL', cbCatalogRef: 'CB1', cbIcuKa: 16, dsCatalogRef: '', ctCatalogRef: 'CT1', ctRatio: '200/5', hasVt: false, hasSurgeArrester: true, hasFuse: false },
        ],
        hasTransformer: true,
        hasLvSide: true,
        hasDer: true,
        derKind: 'PV',
        derSnKva: 50,
        derConnectionVariant: 'lv_behind_tr',
        derPccRef: 'station-test-bus-lv',
      }));
      expect(out.affectedRefs).toContain('station-test');
      expect(out.affectedRefs).toContain('station-test-b-1');
      expect(out.affectedRefs).toContain('station-test-bus-hv');
      expect(out.affectedRefs).toContain('station-test-bus-lv');
      expect(out.affectedRefs).toContain('station-test-tr');
      expect(out.affectedRefs).toContain('station-test-der');
    });
  });

  describe('Substation.meta — connections + flags', () => {
    it('Powiązania portów + NOP point zapisane w meta', () => {
      const out = synthesizeStationEnm('station-test', makeDraft({
        snInputSegmentRef: 'seg-gpz-st1',
        snOutputSegmentRef: 'seg-st1-st2',
        isNopPoint: true,
      }));
      expect(out.substation.meta.sn_input_segment_ref).toBe('seg-gpz-st1');
      expect(out.substation.meta.sn_output_segment_ref).toBe('seg-st1-st2');
      expect(out.substation.meta.is_nop_point).toBe(true);
      expect(out.substation.meta.bay_count).toBe(0);
    });
  });
});

describe('mergeStationEnmIntoSnapshot (R48)', () => {
  it('mode=create → dodaje wszystkie obiekty na koniec list', () => {
    const synth = synthesizeStationEnm('station-new', makeDraft({
      bays: [
        { id: 'b-1', role: 'LINE_FULL', cbCatalogRef: 'CB1', cbIcuKa: 16, dsCatalogRef: '', ctCatalogRef: 'CT1', ctRatio: '200/5', hasVt: false, hasSurgeArrester: true, hasFuse: false },
      ],
      hasTransformer: true,
      hasLvSide: true,
      hasDer: true,
      derKind: 'PV',
      derSnKva: 100,
      derConnectionVariant: 'lv_behind_tr',
      derPccRef: 'station-new-bus-lv',
    }));
    const merged = mergeStationEnmIntoSnapshot(EMPTY_SNAPSHOT, synth, 'create');
    expect(merged.substations).toHaveLength(1);
    expect(merged.bays).toHaveLength(1);
    expect(merged.buses).toHaveLength(2);
    expect(merged.transformers).toHaveLength(1);
    expect(merged.generators).toHaveLength(1);
    /* Substation referencje są spójne. */
    expect(merged.substations[0].bus_refs).toHaveLength(2);
    expect(merged.substations[0].transformer_refs).toHaveLength(1);
  });

  it('mode=update → zastępuje istniejące obiekty po ref_id', () => {
    /* Najpierw create żeby mieć stację. */
    const synthV1 = synthesizeStationEnm('station-x', makeDraft({
      name: 'Wersja 1',
      bays: [
        { id: 'b-1', role: 'LINE_FULL', cbCatalogRef: 'CB-OLD', cbIcuKa: 16, dsCatalogRef: '', ctCatalogRef: 'CT1', ctRatio: '200/5', hasVt: false, hasSurgeArrester: true, hasFuse: false },
      ],
    }));
    const after1 = mergeStationEnmIntoSnapshot(EMPTY_SNAPSHOT, synthV1, 'create');

    /* Następnie update z nowym CB. */
    const synthV2 = synthesizeStationEnm('station-x', makeDraft({
      name: 'Wersja 2',
      bays: [
        { id: 'b-1', role: 'LINE_FULL', cbCatalogRef: 'CB-NEW', cbIcuKa: 25, dsCatalogRef: '', ctCatalogRef: 'CT1', ctRatio: '200/5', hasVt: false, hasSurgeArrester: true, hasFuse: false },
      ],
    }));
    const after2 = mergeStationEnmIntoSnapshot(after1, synthV2, 'update');

    expect(after2.substations).toHaveLength(1);
    expect(after2.substations[0].name).toBe('Wersja 2');
    expect(after2.bays).toHaveLength(1);
    expect(after2.bays[0].meta.cb_catalog_ref).toBe('CB-NEW');
    expect(after2.bays[0].meta.cb_icu_ka).toBe(25);
  });

  it('mode=update z mniejszą liczbą bays → usuwa stare bays', () => {
    /* 3 bays. */
    const synthV1 = synthesizeStationEnm('station-x', makeDraft({
      bays: [
        { id: 'b-1', role: 'LINE_FULL', cbCatalogRef: 'CB1', cbIcuKa: 16, dsCatalogRef: '', ctCatalogRef: 'CT1', ctRatio: '200/5', hasVt: false, hasSurgeArrester: true, hasFuse: false },
        { id: 'b-2', role: 'LINE_FULL', cbCatalogRef: 'CB2', cbIcuKa: 16, dsCatalogRef: '', ctCatalogRef: 'CT2', ctRatio: '200/5', hasVt: false, hasSurgeArrester: true, hasFuse: false },
        { id: 'b-3', role: 'LINE_FULL', cbCatalogRef: 'CB3', cbIcuKa: 16, dsCatalogRef: '', ctCatalogRef: 'CT3', ctRatio: '200/5', hasVt: false, hasSurgeArrester: true, hasFuse: false },
      ],
    }));
    const after1 = mergeStationEnmIntoSnapshot(EMPTY_SNAPSHOT, synthV1, 'create');
    expect(after1.bays).toHaveLength(3);

    /* Update z 1 bay. */
    const synthV2 = synthesizeStationEnm('station-x', makeDraft({
      bays: [
        { id: 'b-1', role: 'LINE_FULL', cbCatalogRef: 'CB1', cbIcuKa: 16, dsCatalogRef: '', ctCatalogRef: 'CT1', ctRatio: '200/5', hasVt: false, hasSurgeArrester: true, hasFuse: false },
      ],
    }));
    const after2 = mergeStationEnmIntoSnapshot(after1, synthV2, 'update');
    expect(after2.bays).toHaveLength(1);
  });

  it('mode=create nie modyfikuje istniejących obiektów innych stacji', () => {
    const synth1 = synthesizeStationEnm('station-A', makeDraft({ name: 'Stacja A' }));
    const after1 = mergeStationEnmIntoSnapshot(EMPTY_SNAPSHOT, synth1, 'create');

    const synth2 = synthesizeStationEnm('station-B', makeDraft({ name: 'Stacja B' }));
    const after2 = mergeStationEnmIntoSnapshot(after1, synth2, 'create');

    expect(after2.substations).toHaveLength(2);
    expect(after2.substations[0].name).toBe('Stacja A');
    expect(after2.substations[1].name).toBe('Stacja B');
  });

  it('Pozostałe pola snapshot (header, branches, sources) niezmienione', () => {
    const snapshot = {
      ...EMPTY_SNAPSHOT,
      branches: [{ ref_id: 'br-existing' } as never],
      sources: [{ ref_id: 'src-existing' } as never],
    };
    const synth = synthesizeStationEnm('station-x', makeDraft());
    const after = mergeStationEnmIntoSnapshot(snapshot, synth, 'create');
    expect(after.header).toBe(snapshot.header);
    expect(after.branches).toBe(snapshot.branches);
    expect(after.sources).toBe(snapshot.sources);
  });
});
