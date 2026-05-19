import { describe, expect, it } from 'vitest';

import { validateCatalogFirst } from '../forms/catalogFirstRules';

describe('catalogFirstRules', () => {
  it('blokuje segment magistrali bez katalogu', () => {
    const error = validateCatalogFirst('continue_trunk_segment_sn', {
      segment: {
        dlugosc_m: 200,
        catalog_binding: null,
      },
    });
    expect(error).toMatch(/katalogu/i);
  });

  it('pozwala na segment magistrali z katalogiem', () => {
    const error = validateCatalogFirst('continue_trunk_segment_sn', {
      segment: {
        dlugosc_m: 200,
        catalog_binding: {
          catalog_namespace: 'KABEL_SN',
          catalog_item_id: 'kabel-sn-001',
        },
      },
    });
    expect(error).toBeNull();
  });

  it('blokuje transformator bez catalog_binding', () => {
    const error = validateCatalogFirst('add_transformer_sn_nn', {
      catalog_binding: null,
    });
    expect(error).toMatch(/transformator/i);
  });

  it('blokuje układ PV/BESS/FW bez katalogu rozwiązania', () => {
    const error = validateCatalogFirst('add_converter_source', {
      catalog_binding: null,
    });
    expect(error).toMatch(/PV\/BESS\/FW/i);
  });

  it('blokuje slup rozgalezny bez catalog_ref', () => {
    const error = validateCatalogFirst('insert_branch_pole_on_segment_sn', {
      segment_id: 'seg-1',
      catalog_binding: null,
    });
    expect(error).toMatch(/rozga/i);
  });

  it('blokuje ZKSN bez catalog_ref', () => {
    const error = validateCatalogFirst('insert_zksn_on_segment_sn', {
      segment_id: 'seg-1',
      catalog_binding: null,
    });
    expect(error).toMatch(/ZKSN/i);
  });

  it('pozwala na układ PV/BESS/FW z catalog_binding', () => {
    const error = validateCatalogFirst('add_converter_source', {
      catalog_binding: {
        catalog_namespace: 'CONVERTER',
        catalog_item_id: 'conv-pv-0.5mw-15kv',
      },
    });
    expect(error).toBeNull();
  });

  it('blokuje GPZ bez catalog_binding', () => {
    const error = validateCatalogFirst('add_grid_source_sn', {
      source_name: 'GPZ 1',
      catalog_binding: null,
    });
    expect(error).toMatch(/GPZ/i);
  });
});
