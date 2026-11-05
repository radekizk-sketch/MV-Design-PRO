// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  readExplicitCatalogBinding,
  readExplicitCatalogNamespace,
  readExplicitCatalogVersion,
} from '../catalogSnapshot';

describe('catalogSnapshot', () => {
  it('czyta namespace tylko z jawnie zapisanego pola snapshotu', () => {
    expect(
      readExplicitCatalogNamespace({
        catalog_namespace: 'TRAFO_SN_NN',
        hv_bus_ref: 'bus/hv',
        lv_bus_ref: 'bus/lv',
      }),
    ).toBe('TRAFO_SN_NN');
  });

  it('czyta wersję katalogu z meta katalogowego snapshotu', () => {
    expect(
      readExplicitCatalogVersion({
        meta: { catalog_item_version: '2024.1' },
      }),
    ).toBe('2024.1');
  });

  it('nie tworzy wiązania, jeśli snapshot nie ma kompletnego jawnego kontraktu', () => {
    expect(
      readExplicitCatalogBinding({
        catalog_ref: 'tr-sn-nn-15-04-630kva-dyn11',
        hv_bus_ref: 'bus/hv',
        lv_bus_ref: 'bus/lv',
      }),
    ).toBeNull();
  });

  it('zwraca kompletne wiązanie tylko dla jawnie zapisanych danych katalogowych', () => {
    expect(
      readExplicitCatalogBinding({
        catalog_namespace: 'TRAFO_SN_NN',
        catalog_ref: 'tr-sn-nn-15-04-630kva-dyn11',
        meta: { catalog_item_version: '2024.1' },
      }),
    ).toEqual({
      catalog_namespace: 'TRAFO_SN_NN',
      catalog_item_id: 'tr-sn-nn-15-04-630kva-dyn11',
      catalog_item_version: '2024.1',
      materialize: true,
      snapshot_mapping_version: '1.0',
    });
  });
});
