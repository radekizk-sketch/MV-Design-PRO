// @vitest-environment node
/**
 * Schemat nN — temat menu kontekstowego i operacje wykonywane wprost z menu (`operacjeNn.ts`).
 *
 * ILOCZYN CECH:
 *  - temat menu: rodzaj trafienia {krawędź kabla, węzeł aparatu, zacisku, odbioru, szyny
 *    rozdzielnicy, źródła} × obecność obiektu w grafie projekcji nN × typ gałęzi;
 *  - scalenie przy zacisku: liczba gałęzi przy zacisku {1, 2, 3} × typy {kabel+kabel,
 *    kabel+aparat} × kolejność refów (ładunek deterministyczny);
 *  - kopia odpływu: typ gałęzi {5 typów aparatu, kabel} × rola z TEGO SAMEGO grafu
 *    (`graph.devices[].device_role`) {feeder, internal, incomer, coupler, boundary, aparat
 *    bez wpisu w `devices`};
 *  - predykaty parami: blokada pozycji w menu (`powodyBlokadyNn`) i ładunek wykonawcy
 *    (`operacjaBezposredniaNn`) to JEDNA funkcja — dla każdego przypadku powód blokady
 *    istnieje dokładnie wtedy, gdy wykonawca odmawia.
 */
import { describe, expect, it } from 'vitest';

import {
  operacjaBezposredniaNn,
  POWOD_KOPII_ROLI_PL,
  POWOD_KOPII_TYPU_PL,
  POWOD_SCALENIA_PL,
  powodyBlokadyNn,
  resolveTematMenuNn,
} from '../operacjeNn';
import type { GrafMenuNn } from '../operacjeNn';
import type { LvDeviceRole } from '../types';

function galaz(ref: string, type: string, from: string, to: string, name = ref) {
  return { ref_id: ref, name, type, from_bus_ref: from, to_bus_ref: to };
}

/** Graf projekcji nN (część czytana przez menu); `role` — wpisy `devices[]` z rolą aparatu. */
function model(
  branches: ReturnType<typeof galaz>[],
  role: Readonly<Record<string, LvDeviceRole | undefined>> = {},
): GrafMenuNn {
  const devices = Object.entries(role)
    .filter((wpis): wpis is [string, LvDeviceRole] => wpis[1] !== undefined)
    .map(([ref_id, device_role]) => ({ ref_id, device_role }));
  return {
    buses: [
      { ref_id: 'bus/a', name: 'Szyna A' },
      { ref_id: 'bus/t', name: 'Zacisk T' },
      { ref_id: 'bus/b', name: 'Szyna B' },
      { ref_id: 'bus/c', name: 'Szyna C' },
    ],
    branches,
    loads: [{ ref_id: 'load/1', name: 'Odbiór 1', bus_ref: 'bus/b' }],
    devices,
  } as unknown as GrafMenuNn;
}

describe('resolveTematMenuNn — trafienie rysunku × graf projekcji nN', () => {
  const m = model([
    galaz('cab/1', 'cable', 'bus/a', 'bus/t', 'Kabel 1'),
    galaz('sw/1', 'switch', 'bus/a', 'bus/b', 'Rozłącznik 1'),
    galaz('line/1', 'line', 'bus/a', 'bus/c'),
  ]);

  it.each([
    [{ rodzajKrawedzi: 'cable', ref: 'cab/1' }, { kind: 'nn_cable', ref: 'cab/1', nazwa: 'Kabel 1' }],
    [{ rodzajWezla: 'apparatus', ref: 'sw/1' }, { kind: 'nn_apparatus', ref: 'sw/1', nazwa: 'Rozłącznik 1' }],
    [{ rodzajWezla: 'terminal', ref: 'bus/t' }, { kind: 'nn_terminal', ref: 'bus/t', nazwa: 'Zacisk T' }],
    [{ rodzajWezla: 'load', ref: 'load/1' }, { kind: 'nn_load', ref: 'load/1', nazwa: 'Odbiór 1' }],
  ] as const)('%o → %o', (trafienie, temat) => {
    expect(resolveTematMenuNn(trafienie, m)).toEqual(temat);
  });

  it.each([
    ['krawędź kabla spoza grafu', { rodzajKrawedzi: 'cable', ref: 'cab/brak' }],
    ['krawędź kabla, gałąź nie-kablowa', { rodzajKrawedzi: 'cable', ref: 'line/1' }],
    ['węzeł aparatu wskazujący kabel', { rodzajWezla: 'apparatus', ref: 'cab/1' }],
    ['zacisk spoza grafu', { rodzajWezla: 'terminal', ref: 'bus/brak' }],
    ['odbiór spoza grafu', { rodzajWezla: 'load', ref: 'load/brak' }],
    ['szyna rozdzielnicy (bez menu nN)', { rodzajWezla: 'bus', ref: 'bus/a' }],
    ['źródło nN (bez menu nN)', { rodzajWezla: 'generator', ref: 'gen/1' }],
    ['pusty ref', { rodzajWezla: 'terminal', ref: '' }],
  ] as const)('%s → brak tematu (menu się nie otwiera)', (_opis, trafienie) => {
    expect(resolveTematMenuNn(trafienie, m)).toBeNull();
  });

  it('brak grafu (projekcja niewczytana) → brak tematu', () => {
    expect(resolveTematMenuNn({ rodzajKrawedzi: 'cable', ref: 'cab/1' }, null)).toBeNull();
  });
});

describe('Scalenie odcinków przy zacisku — liczba i typ gałęzi', () => {
  it('dwa kable → ładunek z refami w porządku leksykalnym (niezależnie od kolejności w grafie)', () => {
    const m = model([galaz('cab/z', 'cable', 'bus/t', 'bus/b'), galaz('cab/a', 'cable', 'bus/a', 'bus/t')]);
    expect(operacjaBezposredniaNn('merge-nn-segments', 'bus/t', m)).toEqual({
      ok: true,
      op: 'merge_nn_segments',
      payload: { segment_a_ref: 'cab/a', segment_b_ref: 'cab/z' },
      komunikatSukcesuPl: 'Scalono dwa odcinki kabla nN w jeden.',
    });
  });

  it.each([
    ['jeden kabel', [galaz('cab/a', 'cable', 'bus/a', 'bus/t')]],
    [
      'trzy kable',
      [
        galaz('cab/a', 'cable', 'bus/a', 'bus/t'),
        galaz('cab/b', 'cable', 'bus/t', 'bus/b'),
        galaz('cab/c', 'cable', 'bus/t', 'bus/c'),
      ],
    ],
    ['kabel i aparat', [galaz('cab/a', 'cable', 'bus/a', 'bus/t'), galaz('sw/1', 'switch', 'bus/t', 'bus/b')]],
  ])('%s → odmowa z powodem', (_opis, galezie) => {
    expect(operacjaBezposredniaNn('merge-nn-segments', 'bus/t', model(galezie))).toEqual({
      ok: false,
      powodPl: POWOD_SCALENIA_PL,
    });
  });

  it('zacisk spoza grafu → odmowa (nie ładunek na refie rysunku)', () => {
    const wynik = operacjaBezposredniaNn('merge-nn-segments', 'bus/brak', model([]));
    expect(wynik.ok).toBe(false);
  });
});

const TYPY_APARATU = ['switch', 'breaker', 'fuse', 'disconnector'] as const;
const ROLE: ReadonlyArray<LvDeviceRole | undefined> = ['feeder', 'internal', 'incomer', 'coupler', 'boundary', undefined];

describe('Kopia odpływu — typ gałęzi × rola z projekcji nN', () => {
  for (const typ of TYPY_APARATU) {
    for (const rola of ROLE) {
      const odmowa = rola === 'incomer' || rola === 'coupler' || rola === 'boundary';
      it(`${typ} × ${rola ?? 'brak pomiaru'} → ${odmowa ? 'odmowa' : 'ładunek'}`, () => {
        const m = model([galaz('ap/1', typ, 'bus/a', 'bus/b')], { 'ap/1': rola });
        const wynik = operacjaBezposredniaNn('copy-nn-feeder', 'ap/1', m);
        if (odmowa) {
          expect(wynik).toEqual({ ok: false, powodPl: POWOD_KOPII_ROLI_PL });
        } else {
          expect(wynik).toMatchObject({ ok: true, op: 'copy_nn_feeder', payload: { feeder_apparatus_ref: 'ap/1' } });
        }
      });
    }
  }

  it.each(ROLE)('sprzęgło sekcji (typ bus_coupler) × rola %s → odmowa z samego typu (jak backend)', (rola) => {
    const m = model([galaz('cp/1', 'bus_coupler', 'bus/a', 'bus/b')], { 'cp/1': rola });
    expect(operacjaBezposredniaNn('copy-nn-feeder', 'cp/1', m)).toEqual({ ok: false, powodPl: POWOD_KOPII_ROLI_PL });
  });

  it('kabel → odmowa typu', () => {
    const m = model([galaz('cab/1', 'cable', 'bus/a', 'bus/b')]);
    expect(operacjaBezposredniaNn('copy-nn-feeder', 'cab/1', m)).toEqual({ ok: false, powodPl: POWOD_KOPII_TYPU_PL });
  });
});

describe('Predykaty parami — blokada w menu ⇔ odmowa wykonawcy', () => {
  const przypadki: Array<[string, 'nn_terminal' | 'nn_apparatus', string, GrafMenuNn]> = [
    ['scalenie ok', 'nn_terminal', 'bus/t', model([galaz('c1', 'cable', 'bus/a', 'bus/t'), galaz('c2', 'cable', 'bus/t', 'bus/b')])],
    ['scalenie trzy', 'nn_terminal', 'bus/t', model([galaz('c1', 'cable', 'bus/a', 'bus/t'), galaz('c2', 'cable', 'bus/t', 'bus/b'), galaz('c3', 'cable', 'bus/t', 'bus/c')])],
    ['kopia odpływu', 'nn_apparatus', 'ap/1', model([galaz('ap/1', 'fuse', 'bus/a', 'bus/b')], { 'ap/1': 'feeder' })],
    ['kopia zasilania', 'nn_apparatus', 'ap/1', model([galaz('ap/1', 'breaker', 'bus/a', 'bus/b')], { 'ap/1': 'incomer' })],
    ['kopia sprzęgła', 'nn_apparatus', 'cp/1', model([galaz('cp/1', 'bus_coupler', 'bus/a', 'bus/b')])],
  ];
  it.each(przypadki)('%s', (_opis, kind, ref, m) => {
    const akcja = kind === 'nn_terminal' ? 'merge-nn-segments' : 'copy-nn-feeder';
    const powody = powodyBlokadyNn(kind, ref, m);
    const operacja = operacjaBezposredniaNn(akcja, ref, m);
    expect(Object.keys(powody)).toEqual([akcja]);
    expect(powody[akcja]).toBe(operacja.ok ? null : operacja.powodPl);
  });

  it.each(['nn_cable', 'nn_load'] as const)('%s nie ma pozycji bezpośrednich — brak powodów', (kind) => {
    expect(powodyBlokadyNn(kind, 'x', model([]))).toEqual({});
  });
});
