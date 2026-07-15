import { describe, expect, it } from 'vitest';
import { dopasuj, filtrujISortuj, porownajDopasowania, znormalizuj } from '../fuzzy';

describe('dopasuj — typ dopasowania', () => {
  it('rozpoznaje dopasowanie prefiksowe', () => {
    expect(dopasuj('mod', 'Model sieci')).toEqual({ typ: 'prefiks', pozycja: 0 });
  });

  it('rozpoznaje dopasowanie podciągiem (fraza wewnątrz etykiety)', () => {
    expect(dopasuj('siec', 'Model sieci')).toEqual({ typ: 'podciag', pozycja: 6 });
  });

  it('rozpoznaje dopasowanie rozmyte (znaki rozproszone w tej samej kolejności)', () => {
    const wynik = dopasuj('mdl', 'Model sieci');
    expect(wynik).not.toBeNull();
    expect(wynik?.typ).toBe('rozmyte');
  });

  it('zwraca null, gdy fraza nie występuje w żadnej kolejności', () => {
    expect(dopasuj('xyz', 'Model sieci')).toBeNull();
  });

  it('zwraca null dla pustej frazy', () => {
    expect(dopasuj('', 'Model sieci')).toBeNull();
    expect(dopasuj('   ', 'Model sieci')).toBeNull();
  });
});

describe('dopasuj — polskie znaki diakrytyczne', () => {
  it('dopasowuje frazę bez ogonków do etykiety z ogonkami', () => {
    expect(dopasuj('zrodlo', 'Źródło zasilania')?.typ).toBe('prefiks');
  });

  it('dopasowuje frazę z ogonkami do etykiety bez ogonków', () => {
    expect(dopasuj('źródło', 'Zrodlo zasilania')?.typ).toBe('prefiks');
  });
});

describe('porownajDopasowania — ranking', () => {
  it('prefiks wygrywa z podciągiem', () => {
    const a = { wynik: dopasuj('sie', 'Sieć podstawowa')!, etykietaPL: 'Sieć podstawowa' };
    const b = { wynik: dopasuj('sie', 'Model sieci')!, etykietaPL: 'Model sieci' };
    expect(porownajDopasowania(a, b)).toBeLessThan(0);
  });

  it('podciąg wygrywa z dopasowaniem rozmytym', () => {
    const a = { wynik: dopasuj('gpz', 'Stacja GPZ')!, etykietaPL: 'Stacja GPZ' };
    const b = { wynik: dopasuj('gpz', 'Gotowość: pozycja zerowa')!, etykietaPL: 'Gotowość: pozycja zerowa' };
    expect(porownajDopasowania(a, b)).toBeLessThan(0);
  });

  it('remis rangi rozstrzyga etykietaPL.localeCompare(pl)', () => {
    const wynik = dopasuj('test', 'Test Aaa')!;
    const a = { wynik, etykietaPL: 'Test Bbb' };
    const b = { wynik, etykietaPL: 'Test Aaa' };
    expect(porownajDopasowania(a, b)).toBeGreaterThan(0);
  });
});

describe('znormalizuj', () => {
  it('sprowadza do małych liter i usuwa znaki diakrytyczne', () => {
    expect(znormalizuj('ŹRÓDŁO Zasilania')).toBe('zrodlo zasilania');
  });
});

describe('filtrujISortuj', () => {
  interface Fixture {
    id: string;
    etykietaPL: string;
  }

  const elementy: Fixture[] = [
    { id: 'a', etykietaPL: 'Model sieci' },
    { id: 'b', etykietaPL: 'Gotowość: pozycja zerowa' },
    { id: 'c', etykietaPL: 'Stacja GPZ' },
    { id: 'd', etykietaPL: 'Wyniki i dowody' },
  ];

  it('filtruje elementy niepasujące i sortuje deterministycznie wg rangi', () => {
    const wynik = filtrujISortuj('gpz', elementy, (e) => e.etykietaPL);
    expect(wynik.map((e) => e.id)).toEqual(['c', 'b']);
  });

  it('zwraca pustą listę dla pustej frazy', () => {
    expect(filtrujISortuj('', elementy, (e) => e.etykietaPL)).toEqual([]);
  });

  it('zwraca pustą listę, gdy nic nie pasuje', () => {
    expect(filtrujISortuj('qqqqq', elementy, (e) => e.etykietaPL)).toEqual([]);
  });

  it('jest deterministyczne — powtórne wywołanie daje identyczny wynik', () => {
    const pierwsze = filtrujISortuj('o', elementy, (e) => e.etykietaPL).map((e) => e.id);
    const drugie = filtrujISortuj('o', elementy, (e) => e.etykietaPL).map((e) => e.id);
    expect(drugie).toEqual(pierwsze);
  });
});
