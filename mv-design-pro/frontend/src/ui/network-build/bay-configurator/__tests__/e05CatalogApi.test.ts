import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchE05Catalog, fetchE05FactoryConfigurations, isE05CatalogEligible,
  type E05BayTemplate, type E05SwitchgearFamily,
} from '../e05CatalogApi';

const FAMILY: E05SwitchgearFamily = {
  switchgear_family_ref: 'OEM__SERIA', manufacturer_ref: 'OEM', family_name: 'Seria',
  status: 'verified', tor_konfiguracji: 'MODULARNY',
  network_voltages_kv: [15], um_classes_kv: [17.5], source_refs: ['dokument'],
};
const TEMPLATE: E05BayTemplate = {
  template_ref: 'OEM__POLE', template_name_pl: 'Pole liniowe', template_code: 'L',
  manufacturer_ref: 'OEM', switchgear_family_ref: 'OEM__SERIA', bay_kind: 'liniowe_odplywowe',
  bay_role: 'OUT', source_status: 'official_catalog', source_refs: ['dokument'],
  version: '1.0', device_instances: [], port_definitions: [],
  protection_requirements: [], measurement_requirements: [],
};
function reply(data: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => data } as Response;
}
afterEach(() => vi.unstubAllGlobals());

describe('E05 — katalog OEM bez lokalnych zamienników', () => {
  it('odczytuje istniejące API rodzin i kompletnych pól', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply([FAMILY]))
      .mockResolvedValueOnce(reply([TEMPLATE]));
    vi.stubGlobal('fetch', fetchMock);
    const data = await fetchE05Catalog();
    expect(data.families[0].switchgear_family_ref).toBe('OEM__SERIA');
    expect(data.templates[0].template_ref).toBe('OEM__POLE');
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/catalog/switchgear-families', '/api/catalog/complete-bay-templates',
    ]);
  });
  it('nie promuje statusu requires_catalog', () => {
    expect(isE05CatalogEligible({ ...FAMILY, status: 'requires_catalog' }, TEMPLATE)).toBe(false);
    expect(isE05CatalogEligible(FAMILY, { ...TEMPLATE, source_status: 'canonical_fallback' })).toBe(false);
    expect(isE05CatalogEligible(FAMILY, { ...TEMPLATE, source_refs: [] })).toBe(false);
    expect(isE05CatalogEligible(FAMILY, { ...TEMPLATE, switchgear_family_ref: 'INNA' })).toBe(false);
    expect(isE05CatalogEligible(FAMILY, TEMPLATE)).toBe(true);
  });
  it('nie zastępuje błędu API lokalnym katalogiem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ detail: 'brak' }, 503)));
    await expect(fetchE05Catalog()).rejects.toThrow('HTTP 503');
  });
  it('odrzuca niekompletny schemat odpowiedzi', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(reply([{ ...FAMILY, source_refs: null }]))
      .mockResolvedValueOnce(reply([TEMPLATE])));
    await expect(fetchE05Catalog()).rejects.toThrow('lista źródeł');
  });
  it('pobiera rzeczywiste bloki fabryczne RMU bez dopowiadania szerokości', async () => {
    const f = vi.fn().mockResolvedValue(reply([{
      configuration_ref: 'RMU-LLT', switchgear_family_ref: 'RMU', code: 'LLT',
      name_pl: 'Blok fabryczny', total_width_mm: null, source_refs: ['karta'],
      units: [{ unit_code: 'L', unit_name_pl: 'Liniowe', bay_kind: 'liniowe_doplywowe' },
        { unit_code: 'T', unit_name_pl: 'Transformatorowe', bay_kind: 'transformatorowe' }],
    }]));
    vi.stubGlobal('fetch', f);
    const items = await fetchE05FactoryConfigurations('RMU');
    expect(items[0].total_width_mm).toBeNull();
    expect(f.mock.calls[0][0]).toBe('/api/catalog/switchgear-families/RMU/factory-configurations');
  });
});
