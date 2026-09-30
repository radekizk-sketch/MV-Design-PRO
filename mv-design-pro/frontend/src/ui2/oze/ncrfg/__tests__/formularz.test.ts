/**
 * Formularz biegu „co-jeśli" NC RfG (karta AB-1a Pakiet D2 §2/§8).
 *
 * 1. PARYTET z kontraktem: ograniczenia pól liczbowych (`OGRANICZENIA_WEJSCIA`,
 *    `OGRANICZENIA_NASTAW`) są LUSTREM `Field(gt/ge/le)` backendu — porównane z migawką
 *    `backend/schemas/openapi_snapshot.json` (jedna prawda). Lista pól formularza pokrywa
 *    KAŻDE pole liczbowe `NcRfgPtpireeModuleInput` poza mocą i napięciem (te z modelu).
 * 2. Iloczyn cech walidatora: stan pola (puste / liczba / nie-liczba / przecinek) ×
 *    ograniczenie (gt / ge / le / brak); nastawy: źródło × wartości × kolejność par progów.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  OGRANICZENIA_NASTAW,
  OGRANICZENIA_WEJSCIA,
  POLA_LICZBOWE_WEJSCIA,
  PUSTE_NASTAWY,
  modulIstniejacyZeStanu,
  parsujPole,
  zbudujNastawy,
  type FormularzNastaw,
  type Ograniczenie,
} from '../formularz';
import { POLA_NASTAW } from '../typy';

interface SchematLiczby {
  readonly type?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly anyOf?: readonly SchematLiczby[];
}

const SCHEMATY = (
  JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', '..', 'backend', 'schemas', 'openapi_snapshot.json'),
      'utf-8',
    ),
  ) as { components: { schemas: Record<string, { properties: Record<string, SchematLiczby> }> } }
).components.schemas;

/** Ograniczenie z migawki OpenAPI (wariant liczbowy `anyOf[number, null]`). */
function ograniczenieZOpenApi(schemat: SchematLiczby): Ograniczenie {
  const liczbowy = schemat.anyOf?.find((w) => w.type === 'number') ?? schemat;
  return {
    ...(liczbowy.exclusiveMinimum !== undefined ? { gt: liczbowy.exclusiveMinimum } : {}),
    ...(liczbowy.minimum !== undefined ? { ge: liczbowy.minimum } : {}),
    ...(liczbowy.maximum !== undefined ? { le: liczbowy.maximum } : {}),
  };
}

function czyLiczbowe(schemat: SchematLiczby): boolean {
  return (schemat.anyOf ?? [schemat]).some((w) => w.type === 'number' || w.type === 'integer');
}

describe('parytet ograniczeń formularza z kontraktem backendu', () => {
  it('pola liczbowe formularza = pola liczbowe NcRfgPtpireeModuleInput poza mocą i napięciem', () => {
    const wejscie = SCHEMATY.NcRfgPtpireeModuleInput.properties;
    const liczbowe = Object.keys(wejscie)
      .filter((pole) => czyLiczbowe(wejscie[pole]))
      .filter((pole) => pole !== 'p_max_kw' && pole !== 'voltage_kv')
      .sort();
    expect([...POLA_LICZBOWE_WEJSCIA].sort()).toEqual(liczbowe);
  });

  it.each([...POLA_LICZBOWE_WEJSCIA])('wejście modułu: %s', (pole) => {
    expect(OGRANICZENIA_WEJSCIA[pole]).toEqual(
      ograniczenieZOpenApi(SCHEMATY.NcRfgPtpireeModuleInput.properties[pole]),
    );
  });

  it('pola nastaw formularza = pola NastawyZabezpieczenModulu (+ źródło)', () => {
    expect([...POLA_NASTAW, 'zrodlo_pl'].sort()).toEqual(
      Object.keys(SCHEMATY.NastawyZabezpieczenModulu.properties).sort(),
    );
  });

  it.each([...POLA_NASTAW])('nastawa: %s', (pole) => {
    expect(OGRANICZENIA_NASTAW[pole]).toEqual(
      ograniczenieZOpenApi(SCHEMATY.NastawyZabezpieczenModulu.properties[pole]),
    );
  });
});

describe('parsujPole — stan pola × ograniczenie', () => {
  it.each([
    ['', {}, { stan: 'ok', wartosc: null }],
    ['   ', { gt: 0 }, { stan: 'ok', wartosc: null }],
    ['0,9', { gt: 0, le: 1 }, { stan: 'ok', wartosc: 0.9 }],
    ['1', { gt: 0, le: 1 }, { stan: 'ok', wartosc: 1 }],
    ['1,01', { gt: 0, le: 1 }, { stan: 'blad', komunikat: 'wartość nie może być większa od 1' }],
    ['0', { gt: 0 }, { stan: 'blad', komunikat: 'wartość musi być większa od 0' }],
    ['0', { ge: 0 }, { stan: 'ok', wartosc: 0 }],
    ['-0,1', { ge: 0 }, { stan: 'blad', komunikat: 'wartość nie może być mniejsza od 0' }],
    ['-0,33', {}, { stan: 'ok', wartosc: -0.33 }],
    ['abc', {}, { stan: 'blad', komunikat: 'wymagana liczba skończona' }],
    ['Infinity', {}, { stan: 'blad', komunikat: 'wymagana liczba skończona' }],
  ] as const)('„%s" wobec %j', (tekst, ograniczenie, oczekiwane) => {
    expect(parsujPole(tekst, ograniczenie)).toEqual(oczekiwane);
  });
});

describe('modulIstniejacyZeStanu — trzy jawne stany art. 4', () => {
  it('nieustalone → null, tak → true, nie → false', () => {
    expect(modulIstniejacyZeStanu('nieustalone')).toBeNull();
    expect(modulIstniejacyZeStanu('tak')).toBe(true);
    expect(modulIstniejacyZeStanu('nie')).toBe(false);
  });
});

function nastawy(wartosci: Partial<FormularzNastaw['wartosci']>, zrodlo = ''): FormularzNastaw {
  return { wartosci: { ...PUSTE_NASTAWY.wartosci, ...wartosci }, zrodlo };
}

describe('zbudujNastawy — źródło × wartości × kolejność par progów', () => {
  it('brak wartości i brak źródła → null (brak nastaw w formularzu)', () => {
    expect(zbudujNastawy(PUSTE_NASTAWY)).toEqual({ stan: 'ok', nastawy: null });
  });

  it('wartość bez źródła → błąd pola źródła (walidator backendu wymaga źródła)', () => {
    const wynik = zbudujNastawy(nastawy({ u_min_pu: '0,8' }));
    expect(wynik.stan).toBe('blad');
    expect(wynik.stan === 'blad' && wynik.bledy.zrodlo_pl).toMatch(/podaj źródło nastaw/);
  });

  it('samo źródło bez wartości → obiekt nastaw z polami null i źródłem', () => {
    const wynik = zbudujNastawy(nastawy({}, 'karta nastaw'));
    expect(wynik).toEqual({
      stan: 'ok',
      nastawy: {
        ...Object.fromEntries(POLA_NASTAW.map((pole) => [pole, null])),
        zrodlo_pl: 'karta nastaw',
      },
    });
  });

  it('pary progów: U< ≥ U> i f< ≥ f> → błąd górnego progu; poprawna kolejność → obiekt', () => {
    const odwrocone = zbudujNastawy(
      nastawy({ u_min_pu: '1,1', u_max_pu: '0,9', f_min_hz: '51', f_max_hz: '51' }, 'karta'),
    );
    expect(odwrocone.stan).toBe('blad');
    expect(odwrocone.stan === 'blad' && Object.keys(odwrocone.bledy).sort()).toEqual([
      'f_max_hz',
      'u_max_pu',
    ]);
    const poprawne = zbudujNastawy(nastawy({ u_min_pu: '0,8', u_max_pu: '1,1' }, 'karta'));
    expect(poprawne.stan === 'ok' && poprawne.nastawy?.u_min_pu).toBe(0.8);
    expect(poprawne.stan === 'ok' && poprawne.nastawy?.u_max_pu).toBe(1.1);
  });

  it('wartość spoza ograniczenia (skok wektora > 180°) → błąd pola', () => {
    const wynik = zbudujNastawy(nastawy({ przesuniecie_fazy_deg: '200' }, 'karta'));
    expect(wynik.stan === 'blad' && wynik.bledy.przesuniecie_fazy_deg).toBe(
      'wartość nie może być większa od 180',
    );
  });
});
