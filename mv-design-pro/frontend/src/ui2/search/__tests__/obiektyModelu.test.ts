/**
 * Wyszukiwarka — obiekty modelu z rodzajem z tożsamości pasma (karta OBIEKT-KABEL-NN).
 * Dawniej indeks znał tylko szyny: kabla nN ani złącza kablowego nie dało się znaleźć.
 */
import { describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { obiektyDoWyszukiwania } from '../obiektyModelu';
import { zbudujIndeksWyszukiwania } from '../searchIndex';

const MODEL = {
  buses: [
    { id: 'b1', ref_id: 'sn-1', name: 'Szyna SN', voltage_kv: 15 },
    { id: 'b2', ref_id: 'sn-2', name: 'Szyna SN 2', voltage_kv: 15 },
    { id: 'b3', ref_id: 'nn-1', name: 'RG nN', voltage_kv: 0.4 },
    { id: 'b4', ref_id: 'nn-2', name: 'Szyna ZK', voltage_kv: 0.4 },
  ],
  branches: [
    { id: 'g1', ref_id: 'kab-nn', type: 'cable', name: 'Kabel nN 1', from_bus_ref: 'nn-1', to_bus_ref: 'nn-2' },
    { id: 'g2', ref_id: 'kab-sn', type: 'cable', name: 'Odcinek 1', from_bus_ref: 'sn-1', to_bus_ref: 'sn-2' },
    { id: 'g3', ref_id: 'lin-sn', type: 'line_overhead', name: 'Linia 1', from_bus_ref: 'sn-1', to_bus_ref: 'sn-2' },
    { id: 'g4', ref_id: 'wyl', type: 'breaker', name: 'Wyłącznik', from_bus_ref: 'sn-1', to_bus_ref: 'sn-2' },
  ],
  substations: [{ id: 's1', ref_id: 'zk-1', name: 'ZK-1', station_type: 'rozdzielnica_nn', bus_refs: ['nn-2'] }],
} as unknown as EnergyNetworkModel;

describe('obiektyDoWyszukiwania', () => {
  it('szyny, odcinki przewodowe i stacje z rodzajem pasma; łączniki poza indeksem obiektów', () => {
    const etykiety = Object.fromEntries(obiektyDoWyszukiwania(MODEL).map((o) => [o.id, o.nazwa]));
    expect(etykiety['kab-nn']).toBe('Kabel nN 1 · Kabel nN');
    expect(etykiety['kab-sn']).toBe('Odcinek 1 · Kabel SN');
    expect(etykiety['lin-sn']).toBe('Linia 1 · Linia napowietrzna SN');
    expect(etykiety['zk-1']).toBe('ZK-1 · Rozdzielnica nN');
    expect(etykiety['nn-1']).toBe('RG nN · Szyna nN');
    expect(etykiety['sn-1']).toBe('Szyna SN · Szyna SN');
    expect(etykiety.wyl).toBeUndefined();
    expect(obiektyDoWyszukiwania(null)).toEqual([]);
  });

  it('pozycja kabla nN w indeksie zaznacza obiekt (realna akcja powłoki)', () => {
    const wybierzObiekt = vi.fn();
    const indeks = zbudujIndeksWyszukiwania({
      akcje: {
        przejdzDoPrzestrzeni: vi.fn(),
        wybierzObiekt,
        otworzEkran: vi.fn(),
        przelicz: vi.fn(),
        otworzProjekt: vi.fn(),
        przywrocUklad: vi.fn(),
        polaczPonownie: vi.fn(),
      },
      obiekty: () => obiektyDoWyszukiwania(MODEL),
    });
    const pozycja = indeks.find((p) => p.id === 'obiekt:kab-nn');
    expect(pozycja?.etykietaPL).toContain('Kabel nN');
    pozycja?.akcja();
    expect(wybierzObiekt).toHaveBeenCalledWith('kab-nn');
  });
});
