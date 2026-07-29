import { describe, expect, it } from 'vitest';
import { SPACES } from '../../shell/spaces';
import { zbudujIndeksWyszukiwania } from '../searchIndex';

describe('zbudujIndeksWyszukiwania — przestrzenie', () => {
  it('buduje dokładnie 7 pozycji grupy „przestrzenie" z rejestru ../shell/spaces', () => {
    const indeks = zbudujIndeksWyszukiwania();
    const przestrzenie = indeks.filter((p) => p.grupa === 'przestrzenie');
    expect(przestrzenie).toHaveLength(7);
    expect(przestrzenie).toHaveLength(SPACES.length);
    expect(przestrzenie.map((p) => p.etykietaPL)).toEqual(SPACES.map((s) => s.label));
  });

  it('id pozycji przestrzeni zawiera identyfikator przestrzeni', () => {
    const indeks = zbudujIndeksWyszukiwania();
    const model = indeks.find((p) => p.etykietaPL === 'Model sieci');
    expect(model?.id).toBe('przestrzen:model');
  });
});

describe('zbudujIndeksWyszukiwania — polecenia statyczne', () => {
  it('zawiera niepustą grupę „polecenia"', () => {
    const indeks = zbudujIndeksWyszukiwania();
    const polecenia = indeks.filter((p) => p.grupa === 'polecenia');
    expect(polecenia.length).toBeGreaterThan(0);
  });

  it('każda pozycja ma etykietaPL i wywoływalną akcję', () => {
    const indeks = zbudujIndeksWyszukiwania();
    for (const pozycja of indeks) {
      expect(pozycja.etykietaPL.length).toBeGreaterThan(0);
      expect(typeof pozycja.akcja).toBe('function');
    }
  });
});

describe('zbudujIndeksWyszukiwania — obiekty przez provider', () => {
  it('bez providera zwraca pustą grupę „obiekty"', () => {
    const indeks = zbudujIndeksWyszukiwania();
    expect(indeks.filter((p) => p.grupa === 'obiekty')).toHaveLength(0);
  });

  it('mapuje obiekty dostarczone przez provider na pozycje grupy „obiekty"', () => {
    const indeks = zbudujIndeksWyszukiwania({
      obiekty: () => [
        { id: 't1', nazwa: 'Transformator T1' },
        { id: 'sz2', nazwa: 'Szyna SN-2', trybMin: 'expert' },
      ],
    });
    const obiekty = indeks.filter((p) => p.grupa === 'obiekty');
    expect(obiekty).toHaveLength(2);
    expect(obiekty[0]).toMatchObject({ id: 'obiekt:t1', etykietaPL: 'Transformator T1' });
    expect(obiekty[1]).toMatchObject({ id: 'obiekt:sz2', etykietaPL: 'Szyna SN-2', trybMin: 'expert' });
  });
});

describe('zbudujIndeksWyszukiwania — przykłady i pomoc', () => {
  it('zawiera niepuste grupy „przyklady" i „pomoc"', () => {
    const indeks = zbudujIndeksWyszukiwania();
    expect(indeks.filter((p) => p.grupa === 'przyklady').length).toBeGreaterThan(0);
    expect(indeks.filter((p) => p.grupa === 'pomoc').length).toBeGreaterThan(0);
  });
});

describe('zbudujIndeksWyszukiwania — determinizm', () => {
  it('dwa wywołania dają identyczną listę identyfikatorów w tej samej kolejności', () => {
    const pierwsze = zbudujIndeksWyszukiwania().map((p) => p.id);
    const drugie = zbudujIndeksWyszukiwania().map((p) => p.id);
    expect(drugie).toEqual(pierwsze);
  });

  it('wszystkie identyfikatory pozycji są unikalne', () => {
    const indeks = zbudujIndeksWyszukiwania();
    const ids = indeks.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
