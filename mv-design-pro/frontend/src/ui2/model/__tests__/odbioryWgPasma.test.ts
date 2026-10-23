/**
 * Karta GPZ-H5-SLD pkt 2 — grupowanie odbiorów wg pasma napięciowego szyny.
 *
 * Iloczyn cech: szyna odbioru {110 kV, 15 kV, 0,4 kV, bez napięcia w modelu, nieobecna w
 * modelu, brak `bus_ref`} × konsument {funkcja wspólna, karta techniczna stacji GPZ H5}.
 * Pasmo z JEDNEGO predykatu (`pasmoNapieciowe`); brak danych nigdy nie staje się „nN".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { buildKartaTechniczna } from '../../../ui/sld/shared/kartaTechnicznaElementu';
import { grupujOdbioryWgPasma, pasmoSzynyOdbioru, TYTUL_GRUPY_ODBIOROW } from '../odbioryWgPasma';

const SZYNY = [
  { ref_id: 'wn', voltage_kv: 110 },
  { ref_id: 'sn', voltage_kv: 15 },
  { ref_id: 'nn', voltage_kv: 0.4 },
  { ref_id: 'bez-napiecia', voltage_kv: null },
];

describe('pasmoSzynyOdbioru / grupujOdbioryWgPasma', () => {
  it.each([
    ['wn', 'WN'],
    ['sn', 'SN'],
    ['nn', 'nN'],
    ['bez-napiecia', 'brak'],
    ['nieznana', 'brak'],
    [null, 'brak'],
  ] as const)('szyna %s → %s', (bus, klucz) => {
    const napiecia = new Map(SZYNY.map((s) => [s.ref_id, s.voltage_kv]));
    expect(pasmoSzynyOdbioru(bus, napiecia)).toBe(klucz);
  });

  it('grupy od najwyższego napięcia, brak danych na końcu, kolejność w grupie zachowana, puste pominięte', () => {
    const odbiory = [
      { id: 'L1', bus: 'nn' },
      { id: 'L2', bus: 'sn' },
      { id: 'L3', bus: 'nieznana' },
      { id: 'L4', bus: 'sn' },
      { id: 'L5', bus: 'wn' },
    ];
    const grupy = grupujOdbioryWgPasma(odbiory, (o) => o.bus, SZYNY);
    expect(grupy.map((g) => [g.klucz, g.tytul, g.odbiory.map((o) => o.id)])).toEqual([
      ['WN', TYTUL_GRUPY_ODBIOROW.WN, ['L5']],
      ['SN', TYTUL_GRUPY_ODBIOROW.SN, ['L2', 'L4']],
      ['nN', TYTUL_GRUPY_ODBIOROW.nN, ['L1']],
      ['brak', TYTUL_GRUPY_ODBIOROW.brak, ['L3']],
    ]);
    expect(grupujOdbioryWgPasma([], (o: { bus: string }) => o.bus, SZYNY)).toEqual([]);
  });
});

describe('karta techniczna stacji GPZ H5 — odbiory sekcji SN poza „Stroną nN"', () => {
  const enm = (
    JSON.parse(readFileSync(`${__dirname}/../../../ui/sld/v3/scene/__tests__/fixtures/gpzH5_2x2.enm.json`, 'utf8')) as {
      enm: EnergyNetworkModel;
    }
  ).enm;
  const stacja = enm.substations![0];

  it('odbiory na szynach 15 kV stoją w liście „Odbiory SN" rozdzielni SN, „Strona nN" ich nie ma', () => {
    const karta = buildKartaTechniczna(enm, { kind: 'station', elementId: stacja.ref_id } as never)!;
    expect(karta).not.toBeNull();
    const wiersze = karta.sekcje.flatMap((s) => s.wiersze.map((w) => ({ sekcja: s.id, ...w })));
    const sn = wiersze.find((w) => w.klucz === 'odbiory_SN');
    expect(sn?.sekcja).toBe('rozdzielnica_sn');
    expect(sn?.etykieta).toBe(TYTUL_GRUPY_ODBIOROW.SN);
    expect(sn?.lista).toHaveLength(enm.loads!.length);
    const nn = wiersze.find((w) => w.klucz === 'nn_odbiory');
    expect(nn?.lista ?? []).toEqual([]);
  });
});
