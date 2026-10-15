/**
 * Inspektor ui2 (ścieżka wyszukiwarki i drzewa przestrzeni) — tożsamość kabla nN i rozdzielnicy
 * nN (karta OBIEKT-KABEL-NN): etykieta typu z pasma modelu, odnośnik obiektu kabla nN tylko dla
 * kabla nN (wtedy zakładka Właściwości pokazuje sekcję obliczeń).
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { mapowanieObiektuInspektora } from '../inspectorAdapter';

const MODEL = {
  buses: [
    { id: 'b1', ref_id: 'sn-1', name: 'SN 1', voltage_kv: 15 },
    { id: 'b2', ref_id: 'sn-2', name: 'SN 2', voltage_kv: 15 },
    { id: 'b3', ref_id: 'nn-1', name: 'nN 1', voltage_kv: 0.4 },
    { id: 'b4', ref_id: 'nn-2', name: 'nN 2', voltage_kv: 0.4 },
  ],
  branches: [
    { id: 'g1', ref_id: 'kab-nn', type: 'cable', name: 'Kabel nN 1', from_bus_ref: 'nn-1', to_bus_ref: 'nn-2', length_km: 0.1, r_ohm_per_km: 0.3, x_ohm_per_km: 0.08 },
    { id: 'g2', ref_id: 'kab-sn', type: 'cable', name: 'Kabel SN 1', from_bus_ref: 'sn-1', to_bus_ref: 'sn-2', length_km: 0.5, r_ohm_per_km: 0.2, x_ohm_per_km: 0.1 },
  ],
  substations: [
    { id: 's1', ref_id: 'zk-1', name: 'ZK-1', station_type: 'rozdzielnica_nn', bus_refs: ['nn-2'], transformer_refs: [] },
  ],
} as unknown as EnergyNetworkModel;

describe('mapowanieObiektuInspektora — elementy nN', () => {
  it('kabel nN: „Kabel nN" + odnośnik obiektu kabla nN', () => {
    const o = mapowanieObiektuInspektora(MODEL, 'kab-nn');
    expect(o?.typEtykieta).toBe('Kabel nN');
    expect(o?.kabelNnRef).toBe('kab-nn');
  });

  it('kabel SN: „Kabel SN", bez sekcji obiektu kabla nN', () => {
    const o = mapowanieObiektuInspektora(MODEL, 'kab-sn');
    expect(o?.typEtykieta).toBe('Kabel SN');
    expect(o?.kabelNnRef).toBeUndefined();
  });

  it('rozdzielnica nN: „Rozdzielnica nN", nie „Stacja"', () => {
    expect(mapowanieObiektuInspektora(MODEL, 'zk-1')?.typEtykieta).toBe('Rozdzielnica nN');
  });
});
