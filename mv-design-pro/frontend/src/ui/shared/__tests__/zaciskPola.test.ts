/**
 * KARTA POLA-W-TORZE — zacisk pola z DANYCH `field_specs`.
 * Iloczyn: {klucz zacisku: meta.field_terminal_bus_ref, meta.terminal_bus_ref,
 * field_terminal_bus_ref, terminal_bus_ref} × {zacisk własny, zacisk = szyna pola, brak}.
 * Przynależność szyn do stacji pilnuje `szynyStacji.test.ts` (karta SZYNY-STACJI-LUSTRO).
 */
import { describe, expect, it } from 'vitest';

import { wlasnyZaciskPola, zaciskPola } from '../zaciskPola';

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
