/**
 * KARTA W5-B/C — ILOCZYN CECH jednego lustra reguł pól (`polaStacji.ts`).
 *
 * Cechy: {pole stacji SN, pole stacji nN, pole ZKSN} × {z własnym zaciskiem, bez zacisku,
 * zacisk = szyna pola} × {rola IN / OUT / OUT+LINIA_ODG / FEEDER+LINIA_ODG / TR / COUPLER /
 * MEASUREMENT / OZE / rezerwa (pole bez aparatu)}. Oczekiwania są wyprowadzone z reguł
 * backendu `enm/pola.py` jawnie, przypadek po przypadku (parytet bajtowy z backendem na
 * fiksturach generowanych pilnuje osobno `polaStacji.parytet.test.ts`).
 */
import { describe, expect, it } from 'vitest';

import type { Bay } from '../../../types/enm';
import { pole } from '../../../test/pola';
import {
  czyPoleNn,
  czyPoleWn,
  napieciaSzyn,
  pola,
  polaNn,
  polaNnStacji,
  polaSnStacji,
  polaStacji,
  polaWgSzyny,
  polaZksn,
  pole as poleModelu,
  punktPrzylaczeniaPola,
  rolaKanonicznaPola,
  stacjaPola,
  wlasnyZaciskPola,
  zaciskPola,
} from '../polaStacji';

type Poziom = 'sn' | 'nn' | 'zksn';
type Zacisk = 'wlasny' | 'brak' | 'szyna';

const ROLE: readonly { readonly klucz: string; readonly bay_role: Bay['bay_role']; readonly field_role: string | null; readonly kanon: string | null }[] = [
  { klucz: 'in', bay_role: 'IN', field_role: 'LINIA_IN', kanon: 'LINIA_IN' },
  { klucz: 'out', bay_role: 'OUT', field_role: 'LINIA_OUT', kanon: 'LINIA_OUT' },
  { klucz: 'odg-out', bay_role: 'OUT', field_role: 'LINIA_ODG', kanon: 'LINIA_ODG' },
  { klucz: 'odg', bay_role: 'FEEDER', field_role: 'LINIA_ODG', kanon: 'LINIA_ODG' },
  { klucz: 'tr', bay_role: 'TR', field_role: 'TRANSFORMATOROWE', kanon: 'TRANSFORMATOROWE' },
  { klucz: 'spr', bay_role: 'COUPLER', field_role: 'SPRZEGLO', kanon: 'SPRZEGLO' },
  { klucz: 'pom', bay_role: 'MEASUREMENT', field_role: 'POMIAROWE', kanon: 'POMIAROWE' },
  // Pole źródłowe bez technologii: rola spoza kanonu (technologia wynika ze źródła).
  { klucz: 'oze', bay_role: 'OZE', field_role: null, kanon: null },
  // Rezerwa: pole bez aparatu i bez roli kanonicznej — rola modelu przez kanon.
  { klucz: 'rez', bay_role: 'OUT', field_role: null, kanon: 'LINIA_OUT' },
];
const POZIOMY: readonly Poziom[] = ['sn', 'nn', 'zksn'];
const ZACISKI: readonly Zacisk[] = ['wlasny', 'brak', 'szyna'];
const SZYNA: Readonly<Record<Poziom, string>> = { sn: 'S/sn', nn: 'S/nn', zksn: 'P/szyna' };

function zbuduj(): { readonly model: { bays: Bay[]; buses: { ref_id: string; voltage_kv: number | null }[]; substations: { ref_id: string }[] }; readonly przypadki: { poziom: Poziom; zacisk: Zacisk; rola: (typeof ROLE)[number]; bay: Bay }[] } {
  const przypadki: { poziom: Poziom; zacisk: Zacisk; rola: (typeof ROLE)[number]; bay: Bay }[] = [];
  for (const poziom of POZIOMY) {
    for (const rola of ROLE) {
      for (const zacisk of ZACISKI) {
        const ref = `${poziom}/${rola.klucz}/${zacisk}`;
        const bay = pole({
          ref_id: ref,
          bay_role: rola.bay_role,
          field_role: rola.field_role,
          bus_ref: SZYNA[poziom],
          substation_ref: poziom === 'zksn' ? null : 'S/stacja',
          branch_point_ref: poziom === 'zksn' ? 'P/zksn' : null,
          terminal_bus_ref: zacisk === 'wlasny' ? `${ref}/zacisk` : zacisk === 'szyna' ? SZYNA[poziom] : null,
          equipment_refs: rola.klucz === 'rez' ? [] : [`${ref}/aparat`],
        });
        przypadki.push({ poziom, zacisk, rola, bay });
      }
    }
  }
  return {
    model: {
      bays: przypadki.map((p) => p.bay),
      buses: [
        { ref_id: 'S/sn', voltage_kv: 15 },
        { ref_id: 'S/nn', voltage_kv: 0.4 },
        { ref_id: 'P/szyna', voltage_kv: 15 },
      ],
      substations: [{ ref_id: 'S/stacja' }],
    },
    przypadki,
  };
}

const { model, przypadki } = zbuduj();

describe('polaStacji — iloczyn {SN, nN, ZKSN} × {zacisk własny, brak, = szyna} × {rola}', () => {
  it.each(przypadki.map((p) => [p.bay.ref_id, p] as const))('%s', (_ref, { poziom, zacisk, rola, bay }) => {
    // Właściciel: stacja (SN i nN) albo punkt rozgałęzienia (ZKSN) — dokładnie jeden.
    expect(polaStacji(model, 'S/stacja').includes(bay)).toBe(poziom !== 'zksn');
    expect(polaZksn(model, 'P/zksn').includes(bay)).toBe(poziom === 'zksn');
    // Poziom z napięcia szyny pola (pasmo nN do 1 kV włącznie).
    expect(czyPoleNn(model, bay)).toBe(poziom === 'nn');
    expect(polaSnStacji(model, 'S/stacja').includes(bay)).toBe(poziom === 'sn');
    expect(polaNnStacji(model, 'S/stacja').includes(bay)).toBe(poziom === 'nn');
    expect(polaNn(model).includes(bay)).toBe(poziom === 'nn');
    // Zacisk: wyłącznie `terminal_bus_ref`; własny = różny od szyny pola.
    const oczekiwanyZacisk = zacisk === 'wlasny' ? `${bay.ref_id}/zacisk` : zacisk === 'szyna' ? SZYNA[poziom] : null;
    expect(zaciskPola(bay)).toBe(oczekiwanyZacisk);
    expect(wlasnyZaciskPola(bay)).toBe(zacisk === 'wlasny' ? oczekiwanyZacisk : null);
    expect(punktPrzylaczeniaPola(bay)).toBe(oczekiwanyZacisk ?? SZYNA[poziom]);
    // Stacja pola: pole stacji → stacja; pole ZKSN → brak stacji.
    expect(stacjaPola(model, bay.ref_id)).toBe(poziom === 'zksn' ? null : 'S/stacja');
    expect(poleModelu(model, ` ${bay.ref_id} `)).toBe(bay);
    // Rola kanoniczna: `field_role`, a bez niej rola modelu przez kanon.
    expect(rolaKanonicznaPola(bay)).toBe(rola.kanon);
  });

  it('pola wg szyny: wyłącznie pola stacji, OUT < FEEDER < IN < pozostałe, w roli po ref_id', () => {
    const wgSzyny = polaWgSzyny(model);
    expect([...wgSzyny.keys()].sort()).toEqual(['S/nn', 'S/sn']);
    for (const szyna of ['S/sn', 'S/nn']) {
      const poziom = szyna === 'S/sn' ? 'sn' : 'nn';
      const refy = (wgSzyny.get(szyna) ?? []).map((b) => b.ref_id);
      const ranga = (b: Bay): number => ({ OUT: 0, FEEDER: 1, IN: 2 } as Record<string, number>)[b.bay_role] ?? 99;
      const oczekiwane = przypadki
        .filter((p) => p.poziom === poziom)
        .map((p) => p.bay)
        .sort((a, b) => ranga(a) - ranga(b) || (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0))
        .map((b) => b.ref_id);
      expect(refy).toEqual(oczekiwane);
      expect(refy[0].startsWith(`${poziom}/odg-out/`) || refy[0].startsWith(`${poziom}/out/`) || refy[0].startsWith(`${poziom}/rez/`)).toBe(true);
    }
  });
});

describe('polaStacji — dane brzegowe', () => {
  it('szyna bez napięcia albo nieznana: pole NIE jest polem nN (brak danej ≠ nN)', () => {
    const m = { buses: [{ ref_id: 'x', voltage_kv: null }], bays: [] as Bay[] };
    expect(czyPoleNn(m, { bus_ref: 'x' })).toBe(false);
    expect(czyPoleNn(m, { bus_ref: 'nieznana' })).toBe(false);
    expect(czyPoleNn(m, { bus_ref: '' })).toBe(false);
    expect(napieciaSzyn(m).get('x')).toBeNull();
  });

  it('granica pasma nN: 1,0 kV to nN, 1,0001 kV to SN', () => {
    const m = { buses: [{ ref_id: 'a', voltage_kv: 1.0 }, { ref_id: 'b', voltage_kv: 1.0001 }] };
    expect(czyPoleNn(m, { bus_ref: 'a' })).toBe(true);
    expect(czyPoleNn(m, { bus_ref: 'b' })).toBe(false);
  });

  it('stacja pola: pole stacji, której nie ma w modelu → brak stacji; pole nieznane → brak', () => {
    const m = { substations: [{ ref_id: 'S' }], bays: [pole({ ref_id: 'p', bay_role: 'IN', bus_ref: 'b', substation_ref: 'Q' })] };
    expect(stacjaPola(m, 'p')).toBeNull();
    expect(stacjaPola(m, 'nieznane')).toBeNull();
    expect(stacjaPola(m, '')).toBeNull();
  });

  it('brak modelu i brak kolekcji `bays` = brak pól (żadnej syntezy z innych danych)', () => {
    expect(pola(null)).toEqual([]);
    expect(polaStacji({}, 'S')).toEqual([]);
    expect(polaZksn({ bays: null }, 'P')).toEqual([]);
    expect(polaStacji(model, '  ')).toEqual([]);
    expect(zaciskPola(null)).toBeNull();
    expect(punktPrzylaczeniaPola(pole({ ref_id: 'p', bay_role: 'IN', bus_ref: '' }))).toBeNull();
  });
});

/**
 * Karta GPZ-H5-APARATURA: `czyPoleWn` jest lustrem bramy `bay_equipment.bay_hv_boundary`
 * (`enm/wyposazenie_pola.py`, predykat `enm.sklad_pola.pole_granicy_wn` = pasmo WN, Uₙ ≥ 110 kV).
 * Iloczyn {napięcie szyny: nN, SN, granica 109,999/110 kV, WN 220 kV, brak napięcia, szyna
 * nieznana, brak szyny pola} — pole WN i pole nN rozłączne (jedno pasmo na pole).
 */
describe('czyPoleWn — granica zasilania 110 kV', () => {
  const m = {
    buses: [
      { ref_id: 'nn', voltage_kv: 0.4 },
      { ref_id: 'sn', voltage_kv: 15 },
      { ref_id: 'sn_max', voltage_kv: 109.999 },
      { ref_id: 'wn', voltage_kv: 110 },
      { ref_id: 'wn220', voltage_kv: 220 },
      { ref_id: 'bez', voltage_kv: null },
    ],
  };
  it.each([
    ['nn', false],
    ['sn', false],
    ['sn_max', false],
    ['wn', true],
    ['wn220', true],
    ['bez', false],
    ['nieznana', false],
    ['', false],
  ])('szyna %s → pole WN: %s', (szyna, oczekiwane) => {
    expect(czyPoleWn(m, { bus_ref: szyna })).toBe(oczekiwane);
    if (oczekiwane) expect(czyPoleNn(m, { bus_ref: szyna })).toBe(false);
  });
  it('brak modelu = NIE WN (brak danej ≠ granica 110 kV)', () => {
    expect(czyPoleWn(null, { bus_ref: 'wn' })).toBe(false);
    expect(czyPoleWn(undefined, { bus_ref: 'wn' })).toBe(false);
  });
});
