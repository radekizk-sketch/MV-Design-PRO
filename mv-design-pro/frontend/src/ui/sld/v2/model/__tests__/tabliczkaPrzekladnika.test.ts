// @vitest-environment node
/**
 * PRZEKŁADNIA PRZEKŁADNIKA NA SCHEMACIE (karta UX-04/POLE-LINIOWE-WZORZEC, §11.7 pkt 6; odbiór
 * B-02 właściciela 2026-11-04 pkt 6): KRÓTKA przekładnia z `BayPrimaryDevice.rdzenie`
 * („200–400/5”) i `BayPrimaryDevice.uzwojenia` („15/√3 / 0,1/√3 kV” — „SN” szablonu zastąpione
 * napięciem szyny pola) oraz kanał adnotacji pola (`resolveBayCtRatingAnnotations`). Klasy,
 * FS, zaczep i kolejne rdzenie/uzwojenia NIE trafiają na schemat (inspektor pola).
 *
 * Iloczyn cech: liczba rdzeni (0 × 1 × 3) × zapis (zakres zaczepów × jedna wartość × spacje ×
 * jednostka „A”) × zaczep rekordu (brak × projektanta × roboczy) × napięcie szyny (15 × 20 ×
 * 0,4 × brak szyny × brak napięcia) × zapis VT („SN” szablonu × liczba × bez separatora) ×
 * przeznaczenia (każde z sześciu, pary rodzajów) × źródło
 * adnotacji (pomiar CT pola wskazany przez `linked_ref` × aparat bez pomiaru × pomiar innego
 * pola) × rodzaj aparatu (CT × przekładnik Ferrantiego). Zbiory przeznaczeń — parytet z
 * backendem (`network_model/catalog/przekladniki.py`), rozjazd = czerwony test.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { PrzeznaczenieRdzenia, RdzenPrzekladnikaPradowego, UzwojeniePrzekladnikaNapieciowego } from '../../../../../types/przekladniki';
import type { Bay, BayPrimaryDevice, EnergyNetworkModel } from '../../../../../types/enm';
import { resolveBayCtRatingAnnotations } from '../../canvas/enmToSldAdapter';
import {
  PRZEZNACZENIA_POMIAROWE,
  PRZEZNACZENIA_ZABEZPIECZENIOWE,
  przeznaczeniePrzekladnika,
  krotkaPrzekladniaRdzeni,
  krotkaPrzekladniaUzwojen,
  zaczepyPierwotneA,
  zaczepyPrzekladnika,
} from '../tabliczkaPrzekladnika';
import { ctRatingLabelText } from '../../../v3/compose/protectionMarking';
import przypadkiJson from './zaczepy_przekladnika_przypadki.json';

const przypadki = przypadkiJson as unknown as {
  rdzen: Array<[string, number[]]>;
  przekladnik: Array<[string[], number[]]>;
};

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

describe('krótka przekładnia CT na schemacie — pierwszy rdzeń, półpauza w zakresie zaczepów', () => {
  it.each([
    ['brak rdzeni (null)', null, null],
    ['pusta lista', [], null],
    ['Z.10: jeden rdzeń 5P20', Z10, '200–400/5'],
    ['Z.11: trzy rdzenie — wyłącznie przekładnia (bez „/5/5”, bez klas)', Z11, '200–400/5'],
    ['jedna wartość pierwotna', [rdzen('300/1', '0,5', ['POMIAR'], 10)], '300/1'],
    ['zapis ze spacjami i jednostką', [rdzen(' 100 - 200 / 5 A ', '5P20', ['ZABEZPIECZENIA'])], '100–200/5'],
    ['trzy zaczepy', [rdzen('150-300-600/1', '5P20', ['ZABEZPIECZENIA'])], '150–300–600/1'],
  ] as const)('%s', (_opis, rdzenie, oczekiwana) => {
    const tekst = krotkaPrzekladniaRdzeni(rdzenie as readonly RdzenPrzekladnikaPradowego[] | null);
    expect(tekst).toBe(oczekiwana);
    // Na schemacie nigdy klasa dokładności ani FS (opis pełny — inspektor pola).
    if (tekst !== null) expect(tekst).not.toMatch(/P20|FS|0,2S|kl\./);
  });
});

describe('krótka przekładnia VT na schemacie — liczbowo z napięcia szyny pola', () => {
  const uzw = (przekladnia: string, klasa = '0,2'): UzwojeniePrzekladnikaNapieciowego =>
    ({ przekladnia, moc_va: 30, klasa, przeznaczenie: ['POMIAR'] }) as UzwojeniePrzekladnikaNapieciowego;
  const SZABLON = [uzw('SN/√3 / 0,1/√3'), uzw('SN/√3 / 0,1/√3'), uzw('SN/√3 / 0,1/3', '3P')];
  it.each([
    ['brak uzwojeń', null, 15, null],
    ['pusta lista', [], 15, null],
    ['szablon × szyna 15 kV', SZABLON, 15, '15/√3 / 0,1/√3 kV'],
    ['szablon × szyna 20 kV', SZABLON, 20, '20/√3 / 0,1/√3 kV'],
    ['szablon × szyna 6,3 kV (zapis polski)', SZABLON, 6.3, '6,3/√3 / 0,1/√3 kV'],
    ['szablon × brak napięcia szyny — „SN” zostaje (brak danej jawny)', SZABLON, null, 'SN/√3 / 0,1/√3 kV'],
    ['szablon × napięcie 0 — nieważne, „SN” zostaje', SZABLON, 0, 'SN/√3 / 0,1/√3 kV'],
    ['zapis liczbowy z rekordu — bez zmian', [uzw('15/√3 / 0,1/√3')], 20, '15/√3 / 0,1/√3 kV'],
    ['zapis bez separatora stron — bez zmian i bez jednostki', [uzw('15000/100')], 15, '15000/100'],
  ] as const)('%s', (_opis, uzwojenia, un, oczekiwana) => {
    const tekst = krotkaPrzekladniaUzwojen(uzwojenia as readonly UzwojeniePrzekladnikaNapieciowego[] | null, un);
    expect(tekst).toBe(oczekiwana);
    // Wada z oględzin: wielokropek i lista kolejnych uzwojeń na schemacie.
    if (tekst !== null) {
      expect(tekst).not.toContain('…');
      expect(tekst.split(' / ').length).toBeLessThanOrEqual(2);
    }
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
            expect(a.ratioText).toBe(krotkaPrzekladniaRdzeni(rdzenie));
            expect(a.ratioText).toBe('200–400/5');
            expect(a.purpose).toBe(przeznaczeniePrzekladnika(rdzenie));
          }
          if (wynik.length === 0) expect(resolveBayCtRatingAnnotations(bay, snap(pomiary))).toBeUndefined();
        });
      }
    }
  }
});

describe('zaczepy przekładnika — lustro backendu (wspólna tabela przypadków)', () => {
  // Ten sam plik czyta `backend/tests/network_model/catalog/test_zaczepy_przekladnika.py`.
  for (const [zapis, oczekiwane] of przypadki.rdzen) {
    it(`rdzeń „${zapis}" → [${oczekiwane.join(', ')}]`, () => {
      expect(zaczepyPierwotneA(zapis)).toEqual(oczekiwane);
    });
  }
  for (const [zapisy, oczekiwane] of przypadki.przekladnik) {
    it(`przekładnik [${zapisy.join(' | ')}] → [${oczekiwane.join(', ')}]`, () => {
      expect(zaczepyPrzekladnika(zapisy)).toEqual(oczekiwane);
    });
  }
});

describe('zaczep NIE na schemacie — tabliczka aparatu CT (rekord × źródło zaczepu)', () => {
  // Iloczyn: zaczep rekordu {brak, 200 projektanta, 400 roboczy} × rdzenie {1, 3}. Odbiór B-02
  // (pkt 6 i 8): wybrany zaczep jest w inspektorze pola; etykieta schematu = krótka przekładnia
  // niezależnie od zaczepu — ten sam tekst rezerwuje szerokość pasma (`ctRatingLabelText`).
  const r1 = [rdzen('200-400/5', '5P20', ['ZABEZPIECZENIA'])];
  const r3 = [
    rdzen('200-400/5', '0,2S', ['ROZLICZENIE'], 5),
    rdzen('200-400/5', '0,2', ['POMIAR'], 5),
    rdzen('200-400/5', '5P20', ['ZABEZPIECZENIA']),
  ];
  const przypadkiZaczepu: Array<[string, number | null, 'PROJEKTANT' | 'WARTOSC_ROBOCZA' | null]> = [
    ['brak', null, null],
    ['200 projektanta', 200, 'PROJEKTANT'],
    ['400 roboczy', 400, 'WARTOSC_ROBOCZA'],
  ];
  for (const [nazwa, zaczepA, zrodlo] of przypadkiZaczepu) {
    for (const [nazwaRdzeni, rdzenie] of [['1 rdzeń', r1], ['3 rdzenie', r3]] as const) {
      it(`${nazwa} · ${nazwaRdzeni}`, () => {
        const aparat = {
          device_ref: 'T1',
          symbol_ref: 's',
          kind: 'CT',
          placement: 'MIDSTREAM',
          rdzenie,
          ...(zaczepA !== null ? { zaczep_pierwotny_a: zaczepA, zrodlo_zaczepu: zrodlo } : {}),
        } as BayPrimaryDevice;
        const bay = { ref_id: 'pole', primary_devices: [aparat] } as unknown as Bay;
        const [wpis] = resolveBayCtRatingAnnotations(bay, { measurements: [] } as unknown as EnergyNetworkModel) ?? [];
        expect(ctRatingLabelText(wpis)).toBe('200–400/5');
      });
    }
  }
});

describe('kanał adnotacji pola — VT z napięciem szyny pola (bus_ref × szyny migawki)', () => {
  const vt = {
    device_ref: 'TV1',
    kind: 'VT',
    placement: 'MIDSTREAM',
    uzwojenia: [{ przekladnia: 'SN/√3 / 0,1/√3', moc_va: 30, klasa: '0,2', przeznaczenie: ['POMIAR'] }],
  } as unknown as BayPrimaryDevice;
  const bay = { ref_id: 'pole', bus_ref: 'szyna-1', primary_devices: [vt] } as unknown as Bay;
  it.each([
    ['szyna pola 15 kV', [{ ref_id: 'szyna-1', voltage_kv: 15 }], '15/√3 / 0,1/√3 kV'],
    ['szyna pola 20 kV, inna 110 kV', [{ ref_id: 'szyna-0', voltage_kv: 110 }, { ref_id: 'szyna-1', voltage_kv: 20 }], '20/√3 / 0,1/√3 kV'],
    ['tylko inna szyna — brak danej, „SN” zostaje', [{ ref_id: 'szyna-0', voltage_kv: 110 }], 'SN/√3 / 0,1/√3 kV'],
    ['migawka bez szyn', undefined, 'SN/√3 / 0,1/√3 kV'],
  ] as const)('%s', (_opis, buses, oczekiwana) => {
    const [wpis] = resolveBayCtRatingAnnotations(bay, { measurements: [], ...(buses ? { buses: buses as never } : {}) }) ?? [];
    expect(wpis.rodzajPrzekladnika).toBe('VT');
    expect(ctRatingLabelText(wpis)).toBe(oczekiwana);
  });
});
