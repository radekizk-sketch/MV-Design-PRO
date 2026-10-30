/**
 * TABLICZKA PRZEKŁADNIKA PRĄDOWEGO NA SCHEMACIE (karta UX-04/POLE-LINIOWE-WZORZEC, decyzja
 * architekta §11.7 pkt 6): zapis przekładni i klas rdzeni z `BayPrimaryDevice.rdzenie` oraz
 * kanał adnotacji pola (`resolveBayCtRatingAnnotations`).
 *
 * Iloczyn cech: liczba rdzeni (0 × 1 × 3) × strona pierwotna (wspólna × różna × zapis bez „/")
 * × FS (brak × całkowity × ułamkowy) × przeznaczenia (każde z sześciu, pary rodzajów) × źródło
 * adnotacji (pomiar CT pola wskazany przez `linked_ref` × aparat bez pomiaru × pomiar innego
 * pola) × rodzaj aparatu (CT × przekładnik Ferrantiego). Zbiory przeznaczeń — parytet z
 * backendem (`network_model/catalog/przekladniki.py`), rozjazd = czerwony test.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { PrzeznaczenieRdzenia, RdzenPrzekladnikaPradowego } from '../../../../../types/przekladniki';
import type { Bay, BayPrimaryDevice, EnergyNetworkModel } from '../../../../../types/enm';
import { resolveBayCtRatingAnnotations } from '../../canvas/enmToSldAdapter';
import {
  PRZEZNACZENIA_POMIAROWE,
  PRZEZNACZENIA_ZABEZPIECZENIOWE,
  przeznaczeniePrzekladnika,
  tekstKlasRdzeni,
  tekstPrzekladniRdzeni,
} from '../tabliczkaPrzekladnika';

const ZRODLO_BACKENDU = readFileSync(
  resolve(__dirname, '../../../../../../../backend/src/network_model/catalog/przekladniki.py'),
  'utf8',
);

const rdzen = (
  przekladnia: string,
  klasa: string,
  przeznaczenie: PrzeznaczenieRdzenia[],
  fs?: number | null,
): RdzenPrzekladnikaPradowego => ({ przekladnia, moc_va: 15, klasa, przeznaczenie, ...(fs !== undefined ? { fs } : {}) });

/** Rdzenie wzorca ENEA Z.10 (s.89) i Z.11 (s.90) — dane szablonów pól backendu. */
const Z10 = [rdzen('200-400/5', '5P20', ['ZABEZPIECZENIA'], null)];
const Z11 = [
  rdzen('200-400/5', '0,2S', ['ROZLICZENIE'], 5),
  rdzen('200-400/5', '0,2', ['POMIAR'], 5),
  rdzen('200-400/5', '5P20', ['ZABEZPIECZENIA']),
];

describe('tabliczka przekładnika — zapis przekładni i klas z rdzeni modelu', () => {
  it.each([
    ['brak rdzeni (null)', null, null, null],
    ['pusta lista', [], null, null],
    ['Z.10: jeden rdzeń 5P20', Z10, '200-400/5 A', '5P20'],
    ['Z.11: trzy rdzenie o wspólnej stronie pierwotnej', Z11, '200-400/5/5/5 A', '0,2S FS5 / 0,2 FS5 / 5P20'],
    [
      'różne strony pierwotne — przekładnie rdzeni po przecinku',
      [rdzen('200-400/5', '5P20', ['ZABEZPIECZENIA']), rdzen('300/1', '0,5', ['POMIAR'], 10)],
      '200-400/5, 300/1 A',
      '5P20 / 0,5 FS10',
    ],
    [
      'zapis bez „/" — bez składania stron (zero domysłu)',
      [rdzen('400', '5P20', ['ZABEZPIECZENIA']), rdzen('400', '10P10', ['ZABEZPIECZENIA'])],
      '400, 400 A',
      '5P20 / 10P10',
    ],
    ['FS ułamkowy w zapisie polskim', [rdzen(' 100/1 ', '0,5S', ['ROZLICZENIE'], 2.5)], '100/1 A', '0,5S FS2,5'],
  ] as const)('%s', (_opis, rdzenie, przekladnia, klasy) => {
    expect(tekstPrzekladniRdzeni(rdzenie as readonly RdzenPrzekladnikaPradowego[] | null)).toBe(przekladnia);
    expect(tekstKlasRdzeni(rdzenie as readonly RdzenPrzekladnikaPradowego[] | null)).toBe(klasy);
  });
});

describe('przeznaczenie przekładnika z rdzeni — zbiory = backend', () => {
  const zbiorBackendu = (nazwa: string): string[] => {
    const m = new RegExp(`^${nazwa}: frozenset\\[str\\] = frozenset\\(\\{([^}]*)\\}\\)`, 'm').exec(ZRODLO_BACKENDU);
    expect(m, nazwa).not.toBeNull();
    return [...(m?.[1] ?? '').matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]).sort();
  };

  it('PRZEZNACZENIA_ZABEZPIECZENIOWE i PRZEZNACZENIA_POMIAROWE = zbiory backendu', () => {
    expect([...PRZEZNACZENIA_ZABEZPIECZENIOWE].sort()).toEqual(zbiorBackendu('PRZEZNACZENIA_ZABEZPIECZENIOWE'));
    expect([...PRZEZNACZENIA_POMIAROWE].sort()).toEqual(zbiorBackendu('PRZEZNACZENIA_POMIAROWE'));
  });

  const WSZYSTKIE: readonly PrzeznaczenieRdzenia[] = ['ROZLICZENIE', 'POMIAR', 'JAKOSC_ENERGII', 'REGULACJA', 'ZABEZPIECZENIA', 'ROZNICOWE'];
  const oczekiwane = (lista: readonly PrzeznaczenieRdzenia[]) => {
    const z = lista.some((p) => p === 'ZABEZPIECZENIA' || p === 'ROZNICOWE');
    const m = lista.some((p) => p === 'ROZLICZENIE' || p === 'POMIAR' || p === 'JAKOSC_ENERGII');
    return z && m ? 'combined' : z ? 'protection' : m ? 'metering' : undefined;
  };
  for (const a of WSZYSTKIE) {
    for (const b of WSZYSTKIE) {
      it(`rdzenie {${a}} + {${b}}`, () => {
        expect(przeznaczeniePrzekladnika([rdzen('200/5', 'x', [a]), rdzen('200/5', 'x', [b])])).toBe(oczekiwane([a, b]));
      });
    }
  }
  it('brak rdzeni i rdzeń bez przeznaczeń — uczciwy brak', () => {
    expect(przeznaczeniePrzekladnika(null)).toBeUndefined();
    expect(przeznaczeniePrzekladnika([rdzen('200/5', '5P20', [])])).toBeUndefined();
  });
});

describe('kanał adnotacji pola — pomiar CT ma pierwszeństwo, aparat bez pomiaru niesie tabliczkę', () => {
  const aparat = (deviceRef: string, kind: BayPrimaryDevice['kind'], extra: Partial<BayPrimaryDevice>): BayPrimaryDevice =>
    ({ device_ref: deviceRef, kind, placement: 'MIDSTREAM', ...extra }) as BayPrimaryDevice;
  const pole = (devices: BayPrimaryDevice[]): Bay =>
    ({ id: 'b', ref_id: 'pole-1', name: 'Pole', tags: [], meta: {}, bay_role: 'OUT', substation_ref: 's', bus_ref: 'b', equipment_refs: [], primary_devices: devices }) as never;
  const pomiar = (refId: string, bayRef: string) => ({
    id: refId, ref_id: refId, name: `CT ${refId}`, tags: [], meta: {}, measurement_type: 'CT', bus_ref: 'b', bay_ref: bayRef,
    rating: { ratio_primary: 300, ratio_secondary: 5 }, connection: 'star', purpose: 'protection',
  });
  const snap = (measurements: unknown[]): Pick<EnergyNetworkModel, 'measurements'> => ({ measurements: measurements as never });

  for (const rdzenie of [Z10, Z11, null, []] as const) {
    for (const zrodlo of ['pomiar pola', 'bez pomiaru', 'pomiar innego pola'] as const) {
      for (const kind of ['CT', 'CORE_BALANCE_CT'] as const) {
        const nazwa = `rdzenie ${rdzenie === null ? 'null' : rdzenie.length} × ${zrodlo} × ${kind}`;
        it(nazwa, () => {
          const linked = zrodlo === 'bez pomiaru' ? null : 'ct-m';
          const bay = pole([aparat('T1', kind, { rdzenie: rdzenie as never, linked_ref: linked })]);
          const pomiary = zrodlo === 'pomiar pola' ? [pomiar('ct-m', 'pole-1')] : zrodlo === 'pomiar innego pola' ? [pomiar('ct-m', 'pole-2')] : [];
          const wynik = resolveBayCtRatingAnnotations(bay, snap(pomiary)) ?? [];
          const zPomiaru = wynik.filter((a) => a.measurementRef !== null);
          const zTabliczki = wynik.filter((a) => a.deviceRef !== undefined);
          // Pomiar tego pola zawsze daje swoją adnotację (dotychczasowy kanał §18.3).
          expect(zPomiaru.map((a) => a.measurementRef)).toEqual(zrodlo === 'pomiar pola' ? ['ct-m'] : []);
          // Tabliczka: wyłącznie aparat CT z rdzeniami, na który nie wskazuje pomiar TEGO pola —
          // jeden aparat, jedna adnotacja (bez dubla pomiar + tabliczka).
          const maTabliczke = kind === 'CT' && (rdzenie?.length ?? 0) > 0 && zrodlo !== 'pomiar pola';
          expect(zTabliczki.length).toBe(maTabliczke ? 1 : 0);
          if (maTabliczke) {
            const [a] = zTabliczki;
            expect(a.deviceRef).toBe('T1');
            expect(a.identifier).toBeNull();
            expect(a.measurementRef).toBeNull();
            expect(a.ratioText).toBe(tekstPrzekladniRdzeni(rdzenie));
            expect(a.klasy).toBe(tekstKlasRdzeni(rdzenie));
            expect(a.purpose).toBe(przeznaczeniePrzekladnika(rdzenie));
          }
          if (wynik.length === 0) expect(resolveBayCtRatingAnnotations(bay, snap(pomiary))).toBeUndefined();
        });
      }
    }
  }
});
