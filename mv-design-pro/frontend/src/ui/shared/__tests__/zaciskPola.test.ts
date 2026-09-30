/**
 * KARTA POLA-W-TORZE — zacisk pola i przynależność szyn do stacji z DANYCH `field_specs`.
 * Iloczyn: {klucz zacisku: meta.field_terminal_bus_ref, meta.terminal_bus_ref,
 * field_terminal_bus_ref, terminal_bus_ref} × {zacisk własny, zacisk = szyna pola, brak}
 * × {szyna główna, zacisk pola, szyna obca}.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { szynaNalezyDoStacji, wlasnyZaciskPola, zaciskiPolStacji, zaciskPola } from '../zaciskPola';

describe('zaciskPola — kolejność kluczy jak backend enm.zajetosc_pol.zacisk_pola', () => {
  it.each([
    [{ meta: { field_terminal_bus_ref: 'z1', terminal_bus_ref: 'z2' }, field_terminal_bus_ref: 'z3' }, 'z1'],
    [{ meta: { terminal_bus_ref: 'z2' }, field_terminal_bus_ref: 'z3', terminal_bus_ref: 'z4' }, 'z2'],
    [{ field_terminal_bus_ref: 'z3', terminal_bus_ref: 'z4' }, 'z3'],
    [{ terminal_bus_ref: 'z4' }, 'z4'],
    [{ meta: { terminal_bus_ref: '  ' } }, null],
    [{}, null],
  ])('%j → %s', (spec, oczekiwany) => {
    expect(zaciskPola(spec)).toBe(oczekiwany);
  });

  it('zacisk równy szynie pola nie jest zaciskiem własnym (dane zastane)', () => {
    expect(wlasnyZaciskPola({ bus_ref: 'sn', meta: { terminal_bus_ref: 'sn' } })).toBeNull();
    expect(wlasnyZaciskPola({ bus_ref: 'sn', meta: { terminal_bus_ref: 'z' } })).toBe('z');
    expect(wlasnyZaciskPola({ bus_ref: 'sn' })).toBeNull();
  });
});

describe('przynależność szyn do stacji', () => {
  const stacja = {
    ref_id: 'st-1',
    bus_refs: ['sn'],
    meta: {
      field_specs: [
        { field_ref: 'f-in', bus_ref: 'sn', meta: { terminal_bus_ref: 'z-in' } },
        { field_ref: 'f-stare', bus_ref: 'sn', meta: { terminal_bus_ref: 'sn' } },
      ],
    },
  };

  it.each([
    ['sn', true],
    ['z-in', true],
    ['obca', false],
  ])('szyna %s należy do stacji: %s', (szyna, oczekiwane) => {
    expect(szynaNalezyDoStacji(stacja, szyna)).toBe(oczekiwane);
  });

  it('mapa zacisków obejmuje wyłącznie zaciski własne, deterministycznie', () => {
    const snapshot = { substations: [stacja] } as unknown as Pick<EnergyNetworkModel, 'substations'>;
    const mapa = zaciskiPolStacji(snapshot);
    expect([...mapa.entries()]).toEqual([['z-in', { stationRef: 'st-1', fieldRef: 'f-in' }]]);
    expect(zaciskiPolStacji(null).size).toBe(0);
  });
});
