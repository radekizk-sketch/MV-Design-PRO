/**
 * Lustro TS reguły wymagalności danych projektu (`schema.py::dana_projektu_wymagana`) —
 * przypadki z JEDNEJ reguły backendu we wspólnej fiksturze (generator:
 * `backend/tests/application/station_templates/test_dane_projektu_wymagalnosc.py`).
 * Iloczyn: każda dana H5 × zestawy danych {brak, rezerwa jawna z domyślną i jawną liczbą
 * transformatorów, rezerwa ukryta, łącznik 110 kV zamknięty i otwarty}.
 */
import { describe, expect, it } from 'vitest';
import fikstura from './wymagalnosc_danych_projektu.json';
import type { DanaProjektuSzablonu, TemplateParamInt } from '../api';
import { czyDanaProjektuWymagana, wartoscDanejProjektuDoLadunku } from '../daneProjektu';

const dane = fikstura.dane_projektu as unknown as DanaProjektuSzablonu[];
const parametry: Record<string, TemplateParamInt> = {
  transformer_count: {
    default: fikstura.transformer_count_default,
    min_value: 1,
    max_value: 2,
    step: 1,
    label_pl: 'Liczba transformatorów',
  } as TemplateParamInt,
};

describe('czyDanaProjektuWymagana — zgodność z regułą backendu', () => {
  it.each(fikstura.przypadki.map((p) => [p.klucz, JSON.stringify(p.dane), p.wymagana, p] as const))(
    '%s przy %s → %s',
    (_klucz, _opis, wymagana, przypadek) => {
      const dana = dane.find((d) => d.klucz === przypadek.klucz);
      expect(dana).toBeDefined();
      expect(czyDanaProjektuWymagana(dana!, przypadek.dane as Record<string, unknown>, parametry)).toBe(wymagana);
    },
  );

  it('fikstura obejmuje każdą wymagalność (zawsze, warunkowo, opcjonalnie)', () => {
    expect(new Set(dane.map((d) => d.wymagalnosc))).toEqual(new Set(['zawsze', 'warunkowo', 'opcjonalnie']));
    expect(new Set(fikstura.przypadki.map((p) => p.wymagana))).toEqual(new Set([true, false]));
  });
});

describe('wartoscDanejProjektuDoLadunku — postać wartości z typu', () => {
  const liczba = dane.find((d) => d.typ_wartosci === 'liczba_calkowita')!;
  const wybor = dane.find((d) => d.typ_wartosci === 'wybor')!;

  it('liczba całkowita idzie jako liczba, wybór jako tekst', () => {
    expect(wartoscDanejProjektuDoLadunku(liczba, ' 2 ')).toBe(2);
    expect(wartoscDanejProjektuDoLadunku(wybor, wybor.wartosci[0].wartosc)).toBe(wybor.wartosci[0].wartosc);
  });

  it('pusty tekst to brak danej, nie wartość domyślna; nie-liczba idzie bez zmian do odmowy operacji', () => {
    expect(wartoscDanejProjektuDoLadunku(liczba, '  ')).toBeUndefined();
    expect(wartoscDanejProjektuDoLadunku(liczba, 'dwa')).toBe('dwa');
  });
});
