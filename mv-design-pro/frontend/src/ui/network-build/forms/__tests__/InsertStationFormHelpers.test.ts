import { describe, expect, it } from 'vitest';
import {
  stationRef,
  stationPublicName,
  sourceStatusRank,
  isCompleteSourceStatus,
  compareBayTemplateOptions,
  bayKindLabel,
  templateOptionLabel,
  orderManufacturers,
  isUsableManufacturer,
  isUsableSwitchgearFamily,
  isStationNnSourceConverter,
  hasEnoughTransformerPower,
  voltageMatches,
  clampOutgoingFeederCount,
  formatKv,
  formatMva,
  SWITCHGEAR_MANUFACTURER_ORDER,
  FIELD_ROLE_LABELS,
} from '../InsertStationFormHelpers';

describe('stationRef', () => {
  it('zwraca ref_id gdy obecny', () => {
    expect(stationRef({ ref_id: 'st-1', id: 'uuid-1' } as never)).toBe('st-1');
  });
  it('fallback do id', () => {
    expect(stationRef({ ref_id: '', id: 'uuid-1' } as never)).toBe('uuid-1');
  });
});

describe('stationPublicName', () => {
  it('zwraca name jeśli trim niepusty', () => {
    expect(stationPublicName({ name: 'GPZ Główny' } as never, 'fallback')).toBe('GPZ Główny');
  });
  it('fallback gdy name pusty', () => {
    expect(stationPublicName({ name: '   ' } as never, 'fallback')).toBe('fallback');
  });
});

describe('sourceStatusRank', () => {
  it('official_catalog → 0', () => {
    expect(sourceStatusRank('official_catalog')).toBe(0);
  });
  it('repo_verified → 1', () => {
    expect(sourceStatusRank('repo_verified')).toBe(1);
  });
  it('requires_catalog → 5', () => {
    expect(sourceStatusRank('requires_catalog')).toBe(5);
  });
});

describe('isCompleteSourceStatus', () => {
  it('true dla official/repo/user_defined', () => {
    expect(isCompleteSourceStatus('official_catalog')).toBe(true);
    expect(isCompleteSourceStatus('repo_verified')).toBe(true);
    expect(isCompleteSourceStatus('user_defined')).toBe(true);
  });
  it('false dla pozostałych', () => {
    expect(isCompleteSourceStatus('canonical_fallback')).toBe(false);
    expect(isCompleteSourceStatus('requires_catalog')).toBe(false);
    expect(isCompleteSourceStatus('incomplete_requires_review')).toBe(false);
  });
});

describe('compareBayTemplateOptions', () => {
  it('sortuje po source_status (oficjalne pierwsze)', () => {
    const a = { source_status: 'official_catalog', template_ref: 'B' } as never;
    const b = { source_status: 'user_defined', template_ref: 'A' } as never;
    expect(compareBayTemplateOptions(a, b)).toBeLessThan(0);
  });
  it('przy tym samym statusie sortuje po template_ref', () => {
    const a = { source_status: 'official_catalog', template_ref: 'A' } as never;
    const b = { source_status: 'official_catalog', template_ref: 'B' } as never;
    expect(compareBayTemplateOptions(a, b)).toBeLessThan(0);
  });
});

describe('bayKindLabel', () => {
  it('liniowe_doplywowe', () => {
    expect(bayKindLabel('liniowe_doplywowe')).toBe('Pole liniowe wejściowe');
  });
  it('transformatorowe', () => {
    expect(bayKindLabel('transformatorowe')).toBe('Pole transformatorowe');
  });
  it('sprzeglowe_poprzeczne i sprzeglowe_podluzne → "Pole sprzęgłowe"', () => {
    expect(bayKindLabel('sprzeglowe_poprzeczne')).toBe('Pole sprzęgłowe');
    expect(bayKindLabel('sprzeglowe_podluzne')).toBe('Pole sprzęgłowe');
  });
});

describe('templateOptionLabel', () => {
  it('uwzględnia rolę jeśli podana', () => {
    const tmpl = {
      template_ref: 'tpl-1',
      bay_kind: 'liniowe_doplywowe',
      source_status: 'official_catalog',
    } as never;
    expect(templateOptionLabel(tmpl, 'LINIA_IN')).toContain('Pole liniowe wejściowe');
    expect(templateOptionLabel(tmpl, 'LINIA_IN')).toContain('pakiet katalogowy');
  });
});

describe('orderManufacturers', () => {
  it('ZPUE pierwsze, ABB ostatnie w preset', () => {
    const list = [
      { manufacturer_ref: 'ABB', name: 'ABB' },
      { manufacturer_ref: 'ZPUE_WLOSZCZOWA', name: 'ZPUE' },
      { manufacturer_ref: 'CUSTOM_X', name: 'X' },
    ] as never;
    const ordered = orderManufacturers(list);
    expect(ordered[0].manufacturer_ref).toBe('ZPUE_WLOSZCZOWA');
    expect(ordered[1].manufacturer_ref).toBe('ABB');
    expect(ordered[2].manufacturer_ref).toBe('CUSTOM_X');
  });
});

describe('isUsableManufacturer', () => {
  it('verified z source_refs → true', () => {
    expect(isUsableManufacturer({ status: 'verified', source_refs: ['x'] } as never)).toBe(true);
  });
  it('user_defined → true', () => {
    expect(isUsableManufacturer({ status: 'user_defined', source_refs: [] } as never)).toBe(true);
  });
  it('verified bez source_refs → false', () => {
    expect(isUsableManufacturer({ status: 'verified', source_refs: [] } as never)).toBe(false);
  });
});

describe('hasEnoughTransformerPower', () => {
  it('null source power → wszystko OK', () => {
    expect(hasEnoughTransformerPower({ rated_power_mva: 1 } as never, null)).toBe(true);
  });
  it('transformator >= source', () => {
    expect(hasEnoughTransformerPower({ rated_power_mva: 16 } as never, 10)).toBe(true);
  });
  it('transformator < source → false', () => {
    expect(hasEnoughTransformerPower({ rated_power_mva: 5 } as never, 10)).toBe(false);
  });
});

describe('isStationNnSourceConverter', () => {
  it('un_kv ≤ 1.0 kV → true (nN)', () => {
    expect(isStationNnSourceConverter({ un_kv: 0.4 } as never)).toBe(true);
    expect(isStationNnSourceConverter({ un_kv: 1.0 } as never)).toBe(true);
  });
  it('un_kv > 1.0 kV → false (SN)', () => {
    expect(isStationNnSourceConverter({ un_kv: 15 } as never)).toBe(false);
  });
  it('un_kv invalid → false', () => {
    expect(isStationNnSourceConverter({ un_kv: 0 } as never)).toBe(false);
    expect(isStationNnSourceConverter({ un_kv: NaN } as never)).toBe(false);
  });
});

describe('voltageMatches', () => {
  it('tolerance default 0.5 kV', () => {
    expect(voltageMatches(15, 15.3)).toBe(true);
    expect(voltageMatches(15, 16)).toBe(false);
  });
  it('null → false', () => {
    expect(voltageMatches(null, 15)).toBe(false);
  });
});

describe('clampOutgoingFeederCount', () => {
  it('clamp 0-20', () => {
    expect(clampOutgoingFeederCount(-5)).toBe(0);
    expect(clampOutgoingFeederCount(25)).toBe(20);
    expect(clampOutgoingFeederCount(7.7)).toBe(7);
  });
  it('NaN → 0', () => {
    expect(clampOutgoingFeederCount(NaN)).toBe(0);
  });
});

describe('formatters', () => {
  it('formatKv', () => {
    expect(formatKv(15.75)).toBe('15.75 kV');
    expect(formatKv(null)).toBe('—');
  });
  it('formatMva', () => {
    expect(formatMva(16)).toBe('16.000 MVA');
    expect(formatMva(undefined)).toBe('—');
  });
});

describe('constants', () => {
  it('SWITCHGEAR_MANUFACTURER_ORDER zawiera 4 entries', () => {
    expect(SWITCHGEAR_MANUFACTURER_ORDER).toHaveLength(4);
    expect(SWITCHGEAR_MANUFACTURER_ORDER[0]).toBe('ZPUE_WLOSZCZOWA');
  });
  it('FIELD_ROLE_LABELS pokrywa 5 ról', () => {
    expect(Object.keys(FIELD_ROLE_LABELS)).toHaveLength(5);
    expect(FIELD_ROLE_LABELS.LINIA_IN).toBe('Pole liniowe wejściowe');
  });
});
