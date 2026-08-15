import { describe, expect, it, vi } from 'vitest';

import { SCREEN_CANON_REGISTRY } from '../../../ui/workspace/screenCanonRegistry';
import { SPACES } from '../../shell/spaces';
import { zbudujIndeksWyszukiwania, type AkcjeIndeksu } from '../searchIndex';

/** Komplet dostawców — każdy jako szpieg, żeby dało się sprawdzić WYWOŁANIE. */
function akcjeSzpiegi(): Record<keyof AkcjeIndeksu, ReturnType<typeof vi.fn>> {
  return {
    przejdzDoPrzestrzeni: vi.fn(),
    wybierzObiekt: vi.fn(),
    otworzEkran: vi.fn(),
    przelicz: vi.fn(),
    otworzProjekt: vi.fn(),
    przywrocUklad: vi.fn(),
    polaczPonownie: vi.fn(),
  };
}

describe('zbudujIndeksWyszukiwania — przestrzenie', () => {
  it('buduje dokładnie 7 pozycji grupy „przestrzenie" z rejestru ../shell/spaces', () => {
    const indeks = zbudujIndeksWyszukiwania({ akcje: akcjeSzpiegi() });
    const przestrzenie = indeks.filter((p) => p.grupa === 'przestrzenie');
    expect(przestrzenie).toHaveLength(7);
    expect(przestrzenie).toHaveLength(SPACES.length);
    expect(przestrzenie.map((p) => p.etykietaPL)).toEqual(SPACES.map((s) => s.label));
  });

  it('id pozycji przestrzeni zawiera identyfikator przestrzeni', () => {
    const indeks = zbudujIndeksWyszukiwania({ akcje: akcjeSzpiegi() });
    const model = indeks.find((p) => p.etykietaPL === 'Model sieci');
    expect(model?.id).toBe('przestrzen:model');
  });

  it('akcja pozycji przestrzeni prowadzi do TEJ przestrzeni', () => {
    const akcje = akcjeSzpiegi();
    const indeks = zbudujIndeksWyszukiwania({ akcje });
    indeks.find((p) => p.id === 'przestrzen:wyniki')?.akcja();
    expect(akcje.przejdzDoPrzestrzeni).toHaveBeenCalledWith('wyniki');
  });
});

/**
 * D4 — zdolność PRZENIESIONA ze skasowanej palety `ui/network-build`.
 * Test broni dokładnie tego, co mogłoby zginąć po kasacji duplikatu: listy
 * okien E-XX i tego, że klik w nie coś robi.
 */
describe('zbudujIndeksWyszukiwania — ekrany E-XX (przeniesione z drugiej palety)', () => {
  it('zawiera każde okno widoczne w nawigacji i tylko takie', () => {
    const indeks = zbudujIndeksWyszukiwania({ akcje: akcjeSzpiegi() });
    const kodyWIndeksie = indeks
      .filter((p) => p.grupa === 'ekrany')
      .map((p) => p.id.replace('ekran:', ''))
      .sort();
    const kodyWidoczne = Object.values(SCREEN_CANON_REGISTRY)
      .filter((ekran) => ekran.visibleInNavigation)
      .map((ekran) => ekran.id)
      .sort();
    expect(kodyWIndeksie).toEqual(kodyWidoczne);
    expect(kodyWIndeksie.length).toBeGreaterThan(0);
  });

  it('akcja ekranu otwiera powierzchnię tym samym kodem i tytułem', () => {
    const akcje = akcjeSzpiegi();
    const indeks = zbudujIndeksWyszukiwania({ akcje });
    const gpz = indeks.find((p) => p.id === 'ekran:E-10');
    gpz?.akcja();
    expect(akcje.otworzEkran).toHaveBeenCalledWith('E-10', SCREEN_CANON_REGISTRY['E-10'].labelFull);
  });

  it('okno jest wyszukiwalne po kodzie i nazwie skróconej (parytet starej palety)', () => {
    const indeks = zbudujIndeksWyszukiwania({ akcje: akcjeSzpiegi() });
    const gpz = indeks.find((p) => p.id === 'ekran:E-10');
    expect(gpz?.slowaKluczowe).toContain('E-10');
    expect(gpz?.slowaKluczowe).toContain(SCREEN_CANON_REGISTRY['E-10'].labelShort);
  });
});

/**
 * Zakaz fabrykacji: pozycja bez dostawcy = martwe kliknięcie. Ten test jest
 * ZAPADKĄ dla deklaracji z nagłówka `searchIndex.ts` („zero pozycji bez
 * dostawcy") — bez niego deklaracja byłaby fałszywą pewnością.
 */
describe('zbudujIndeksWyszukiwania — zero pozycji bez dostawcy', () => {
  it('KAŻDA pozycja indeksu po wywołaniu akcji dotyka realnego dostawcy', () => {
    const akcje = akcjeSzpiegi();
    const indeks = zbudujIndeksWyszukiwania({
      akcje,
      obiekty: () => [{ id: 't1', nazwa: 'Transformator T1' }],
    });
    expect(indeks.length).toBeGreaterThan(0);

    for (const pozycja of indeks) {
      const przed = Object.values(akcje).reduce((suma, szpieg) => suma + szpieg.mock.calls.length, 0);
      pozycja.akcja();
      const po = Object.values(akcje).reduce((suma, szpieg) => suma + szpieg.mock.calls.length, 0);
      expect(po, `pozycja ${pozycja.id} nie wywołała żadnego dostawcy`).toBe(przed + 1);
    }
  });

  it('każda pozycja ma niepustą etykietę PL', () => {
    const indeks = zbudujIndeksWyszukiwania({ akcje: akcjeSzpiegi() });
    for (const pozycja of indeks) {
      expect(pozycja.etykietaPL.length).toBeGreaterThan(0);
    }
  });
});

describe('zbudujIndeksWyszukiwania — obiekty przez provider', () => {
  it('bez providera zwraca pustą grupę „obiekty"', () => {
    const indeks = zbudujIndeksWyszukiwania({ akcje: akcjeSzpiegi() });
    expect(indeks.filter((p) => p.grupa === 'obiekty')).toHaveLength(0);
  });

  it('mapuje obiekty dostarczone przez provider na pozycje grupy „obiekty"', () => {
    const indeks = zbudujIndeksWyszukiwania({
      akcje: akcjeSzpiegi(),
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

describe('zbudujIndeksWyszukiwania — determinizm', () => {
  it('dwa wywołania dają identyczną listę identyfikatorów w tej samej kolejności', () => {
    const pierwsze = zbudujIndeksWyszukiwania({ akcje: akcjeSzpiegi() }).map((p) => p.id);
    const drugie = zbudujIndeksWyszukiwania({ akcje: akcjeSzpiegi() }).map((p) => p.id);
    expect(drugie).toEqual(pierwsze);
  });

  it('wszystkie identyfikatory pozycji są unikalne', () => {
    const indeks = zbudujIndeksWyszukiwania({ akcje: akcjeSzpiegi() });
    const ids = indeks.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
