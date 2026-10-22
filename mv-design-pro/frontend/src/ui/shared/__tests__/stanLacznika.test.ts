/**
 * KARTA W5-C — lustro frontu reguł stanu łącznika (`ui/shared/stanLacznika.ts`).
 *
 * Iloczyn cech: typ gałęzi {switch, breaker, bus_coupler, disconnector, fuse, cable} ×
 * pozycja normalna {open, closed, brak} × bieżące położenie {open, closed}. Pozycja normalna
 * i punkt podziału wynikają WYŁĄCZNIE z `normal_state` łącznika z pozycją normalną —
 * bieżące położenie (`status`) ani typ bezpiecznika nigdy nie czynią punktu podziału
 * (dawny domysł „otwarty = NOP" jest defektem tej klasy).
 */
import { describe, expect, it } from 'vitest';

import type { Branch, EnergyNetworkModel } from '../../../types/enm';
import {
  czyLacznik,
  czyLacznikZPozycjaNormalna,
  czyPunktPodzialu,
  etykietaPolozenia,
  etykietaPozycjiNormalnej,
  kandydaciNaPunktPodzialu,
  lacznikiPortowPunktu,
  lacznikTematu,
  opisLacznikowPortow,
  opisStanuLacznika,
  pozycjaNormalna,
  punktyPodzialu,
} from '../stanLacznika';

const TYPY = ['switch', 'breaker', 'bus_coupler', 'disconnector', 'fuse', 'cable'] as const;
const NORMALNE = ['open', 'closed', null] as const;
const POLOZENIA = ['open', 'closed'] as const;

function galaz(
  ref: string,
  type: (typeof TYPY)[number],
  status: 'open' | 'closed',
  normal: 'open' | 'closed' | null,
  meta: Record<string, unknown> = {},
): Branch {
  return {
    id: ref,
    ref_id: ref,
    name: `N-${ref}`,
    tags: [],
    meta,
    type,
    from_bus_ref: 'a',
    to_bus_ref: 'b',
    status,
    ...(normal !== null ? { normal_state: normal } : {}),
  } as unknown as Branch;
}

describe('stanLacznika — iloczyn typ × pozycja normalna × położenie', () => {
  const przypadki: Array<[string, (typeof TYPY)[number], 'open' | 'closed' | null, 'open' | 'closed']> = [];
  for (const typ of TYPY) {
    for (const normal of NORMALNE) {
      for (const status of POLOZENIA) {
        przypadki.push([`${typ} normal=${String(normal)} status=${status}`, typ, normal, status]);
      }
    }
  }

  it.each(przypadki)('%s', (_opis, typ, normal, status) => {
    const g = galaz('g1', typ, status, normal);
    const zPozycja = typ !== 'fuse' && typ !== 'cable';
    expect(czyLacznik(g)).toBe(typ !== 'cable');
    expect(czyLacznikZPozycjaNormalna(g)).toBe(zPozycja);
    expect(pozycjaNormalna(g)).toBe(zPozycja ? normal : null);
    expect(czyPunktPodzialu(g)).toBe(zPozycja && normal === 'open');

    const migawka = { branches: [g] } as Pick<EnergyNetworkModel, 'branches'>;
    expect(punktyPodzialu(migawka).map((b) => b.ref_id)).toEqual(
      zPozycja && normal === 'open' ? ['g1'] : [],
    );
    expect(kandydaciNaPunktPodzialu(migawka).map((b) => b.ref_id)).toEqual(
      zPozycja && normal !== 'open' ? ['g1'] : [],
    );
  });

  it('pusta / brak migawki: zero punktów i kandydatów (bez wyjątku)', () => {
    expect(punktyPodzialu(null)).toEqual([]);
    expect(kandydaciNaPunktPodzialu(undefined)).toEqual([]);
    expect(lacznikiPortowPunktu(null, 'bp')).toEqual([]);
  });

  it('punkty podziału i kandydaci są posortowani po ref_id (determinizm)', () => {
    const migawka = {
      branches: [
        galaz('z', 'switch', 'open', 'open'),
        galaz('a', 'breaker', 'open', 'open'),
        galaz('m', 'disconnector', 'closed', null),
        galaz('c', 'bus_coupler', 'closed', 'closed'),
      ],
    } as Pick<EnergyNetworkModel, 'branches'>;
    expect(punktyPodzialu(migawka).map((b) => b.ref_id)).toEqual(['a', 'z']);
    expect(kandydaciNaPunktPodzialu(migawka).map((b) => b.ref_id)).toEqual(['c', 'm']);
  });
});

describe('etykiety i opisy — brak deklaracji nazwany wprost', () => {
  it.each([
    ['open', 'Otwarty'],
    ['closed', 'Zamknięty'],
    [null, '—'],
    ['OPEN', '—'],
  ])('etykietaPolozenia(%s) = %s', (status, oczekiwana) => {
    expect(etykietaPolozenia(status)).toBe(oczekiwana);
  });

  it.each([
    ['open', 'Normalnie otwarty (punkt podziału)'],
    ['closed', 'Normalnie zamknięty'],
    [null, 'Niezadeklarowana'],
  ] as const)('etykietaPozycjiNormalnej(%s) = %s', (pozycja, oczekiwana) => {
    expect(etykietaPozycjiNormalnej(pozycja)).toBe(oczekiwana);
  });

  it('opis bezpiecznika nie wspomina pozycji normalnej, łącznika — zawsze', () => {
    expect(opisStanuLacznika(galaz('f', 'fuse', 'closed', null) as never)).toBe('Zamknięty');
    expect(opisStanuLacznika(galaz('s', 'switch', 'open', null) as never)).toBe(
      'Otwarty · pozycja normalna: niezadeklarowana',
    );
    expect(opisStanuLacznika(galaz('s', 'switch', 'closed', 'open') as never)).toBe(
      'Zamknięty · pozycja normalna: normalnie otwarty (punkt podziału)',
    );
  });
});

describe('łączniki portów punktu rozgałęzienia — wyłącznie z gałęzi', () => {
  const migawka = {
    branches: [
      galaz('l-c', 'switch', 'open', null, { branch_point_ref: 'bp-1', port_id: 'BRANCH_2' }),
      galaz('l-b', 'fuse', 'closed', null, { branch_point_ref: 'bp-1', port_id: 'BRANCH_1' }),
      galaz('l-a', 'switch', 'closed', 'closed', { branch_point_ref: 'bp-1', port_id: 'BRANCH_1' }),
      galaz('k1', 'cable', 'closed', null, { branch_point_ref: 'bp-1', port_id: 'MAIN_IN' }),
      galaz('x1', 'switch', 'closed', null, { branch_point_ref: 'bp-2', port_id: 'BRANCH_1' }),
    ],
  } as Pick<EnergyNetworkModel, 'branches'>;

  it('kolejność port → ref_id, kabel i obcy punkt pominięte', () => {
    expect(lacznikiPortowPunktu(migawka, 'bp-1').map((b) => b.ref_id)).toEqual(['l-a', 'l-b', 'l-c']);
  });

  it('opis jednym zdaniem; punkt bez łączników nazwany wprost', () => {
    expect(opisLacznikowPortow(migawka, 'bp-1')).toBe(
      'N-l-a: Zamknięty · pozycja normalna: normalnie zamknięty; N-l-b: Zamknięty; ' +
        'N-l-c: Otwarty · pozycja normalna: niezadeklarowana',
    );
    expect(opisLacznikowPortow(migawka, 'bp-9')).toBe('Brak łączników portów w modelu');
  });
});

describe('lacznikTematu — obiekt rysunku × liczba łączników pola', () => {
  const migawka = {
    branches: [
      galaz('sw-1', 'switch', 'closed', null),
      galaz('sw-2', 'breaker', 'closed', null),
      galaz('fu-1', 'fuse', 'closed', null),
      galaz('kab', 'cable', 'closed', null),
    ],
    bays: [
      { ref_id: 'pole-1', id: 'pole-1', equipment_refs: ['sw-1', 'kab'] },
      { ref_id: 'pole-2', id: 'pole-2', equipment_refs: ['sw-1', 'sw-2'] },
      { ref_id: 'pole-0', id: 'pole-0', equipment_refs: ['kab'] },
      { ref_id: 'pole-f', id: 'pole-f', equipment_refs: ['fu-1'] },
    ],
  } as unknown as Pick<EnergyNetworkModel, 'branches' | 'bays'>;

  it.each([
    ['sw-1', 'sw-1', null],
    ['fu-1', 'fu-1', null],
    ['kab', null, 'Element nie jest łącznikiem'],
    ['pole-1', 'sw-1', null],
    ['pole-1#cb', 'sw-1', null],
    ['pole-f', 'fu-1', null],
    ['pole-0', null, 'Pole nie ma łącznika w modelu sieci.'],
    ['pole-2', null, 'Pole ma kilka łączników (N-sw-1, N-sw-2)'],
    ['nieznany', null, 'Wskazany obiekt nie jest łącznikiem modelu sieci.'],
    [null, null, 'Nie wskazano łącznika'],
  ])('%s → łącznik %s', (ref, oczekiwany, powod) => {
    const wynik = lacznikTematu(migawka, ref);
    expect(wynik.lacznik?.ref_id ?? null).toBe(oczekiwany);
    if (powod) expect(wynik.powodPl).toContain(powod);
    else expect(wynik.powodPl).toBeUndefined();
  });

  it('brak migawki: powód zamiast wyjątku', () => {
    expect(lacznikTematu(null, 'sw-1').lacznik).toBeNull();
  });
});
