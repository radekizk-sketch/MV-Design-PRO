/**
 * `statusCertyfikatuPtpiree` — status certyfikatu WYŁĄCZNIE z pola backendu
 * (karta CERTYFIKAT-Z-KATALOGU, zero fabrykacji).
 *
 * REGUŁA KLASA, NIE INSTANCJA — testy chodzą ILOCZYNEM CECH `ptpiree_status`
 * ('POWIAZANY' | 'NIEPOWIAZANY' | null) × `ptpiree_certificate_ref` (obecna |
 * pusta | brak) × zawartość `device_catalog_ref` (zawiera „ptpiree" | nie
 * zawiera), nie tylko przykładem z audytu. Dwa przypadki niżej to KONKRETNY
 * dowód usunięcia fabrykacji: rekord nazwany „ptpiree" bez adnotacji backendu
 * NIE jest już `ptpiree_verified`, a rekord certyfikowany bez tego słowa w
 * nazwie JEST `ptpiree_verified`.
 */

import { describe, expect, it } from 'vitest';

import { statusCertyfikatuPtpiree } from '../certyfikatPtpiree';
import { EMPTY_DER_CATALOGS, EMPTY_DER_PROFILES, EMPTY_DER_READINESS } from '../types';
import type { DerCatalogSelections, StationDerConnection } from '../types';

function derFixture(catalogs: Partial<DerCatalogSelections>): StationDerConnection {
  return {
    id: 'der-1',
    project_id: 'proj-1',
    station_id: 'st-1',
    der_kind: 'PV',
    name: 'DER testowy',
    connection_side: 'nN',
    bus_przylaczenia_ref: 'pcc_st-1_szyna-1',
    bay_ref: null,
    transformer_ref: null,
    lv_busbar_ref: null,
    sn_connection_bus_ref: null,
    sn_connection_point_kind: null,
    connection_voltage_kv: 0.4,
    catalogs: { ...EMPTY_DER_CATALOGS, ...catalogs },
    profiles: { ...EMPTY_DER_PROFILES },
    nominal_power_kw: 500,
    unit_count: null,
    completeness: 'complete',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: '1970-01-01T00:00:00Z',
    updated_at: '1970-01-01T00:00:00Z',
  };
}

describe('statusCertyfikatuPtpiree — iloczyn cech ptpiree_status × ptpiree_certificate_ref × nazwa', () => {
  it('ptpiree_status=POWIAZANY, brak ref → ptpiree_verified (adnotacja backendu wystarcza)', () => {
    const der = derFixture({
      ptpiree_status: 'POWIAZANY',
      ptpiree_certificate_ref: null,
      device_catalog_ref: 'conv-pv-card-huawei-sun2000-215ktl',
    });
    expect(statusCertyfikatuPtpiree(der)).toBe('ptpiree_verified');
  });

  it('ptpiree_status=POWIAZANY + ref obecna → ptpiree_verified', () => {
    const der = derFixture({
      ptpiree_status: 'POWIAZANY',
      ptpiree_certificate_ref: 'ptpiree-wipwc-1-2-row-3254',
    });
    expect(statusCertyfikatuPtpiree(der)).toBe('ptpiree_verified');
  });

  it('ptpiree_status=NIEPOWIAZANY, brak ref → unknown', () => {
    const der = derFixture({ ptpiree_status: 'NIEPOWIAZANY', ptpiree_certificate_ref: null });
    expect(statusCertyfikatuPtpiree(der)).toBe('unknown');
  });

  it('ptpiree_status=NIEPOWIAZANY, ref obecna mimo to → ptpiree_verified (ref jest niezależną przesłanką, parytet z backendem)', () => {
    const der = derFixture({
      ptpiree_status: 'NIEPOWIAZANY',
      ptpiree_certificate_ref: 'ptpiree-wipwc-1-2-row-3254',
    });
    expect(statusCertyfikatuPtpiree(der)).toBe('ptpiree_verified');
  });

  it('ptpiree_status brak, ref obecna → ptpiree_verified', () => {
    const der = derFixture({ ptpiree_status: null, ptpiree_certificate_ref: 'cert-1' });
    expect(statusCertyfikatuPtpiree(der)).toBe('ptpiree_verified');
  });

  it('ptpiree_status brak, ref brak → unknown (uczciwy stan zerowy)', () => {
    const der = derFixture({ ptpiree_status: null, ptpiree_certificate_ref: null });
    expect(statusCertyfikatuPtpiree(der)).toBe('unknown');
  });

  it('ref jest pustym łańcuchem (nie null) → unknown, tak jak brak', () => {
    const der = derFixture({ ptpiree_status: null, ptpiree_certificate_ref: '   ' });
    expect(statusCertyfikatuPtpiree(der)).toBe('unknown');
  });

  it(
    'FABRYKACJA USUNIĘTA: device_catalog_ref zawiera "ptpiree" w nazwie, ale backend NIE potwierdził ' +
      '(brak ptpiree_status, brak ref) → unknown (dawny wzór dawał fałszywy ptpiree_verified)',
    () => {
      const der = derFixture({
        ptpiree_status: null,
        ptpiree_certificate_ref: null,
        device_catalog_ref: 'device-ptpiree-lookalike-001',
      });
      expect(statusCertyfikatuPtpiree(der)).toBe('unknown');
    },
  );

  it(
    'FABRYKACJA USUNIĘTA: device_catalog_ref BEZ słowa "ptpiree", ale backend potwierdził ' +
      '(ptpiree_status=POWIAZANY) → ptpiree_verified (dawny wzór dawał fałszywy unknown)',
    () => {
      const der = derFixture({
        ptpiree_status: 'POWIAZANY',
        ptpiree_certificate_ref: 'cert-huawei-215ktl',
        device_catalog_ref: 'conv-pv-card-huawei-sun2000-215ktl',
      });
      expect(statusCertyfikatuPtpiree(der)).toBe('ptpiree_verified');
    },
  );
});
