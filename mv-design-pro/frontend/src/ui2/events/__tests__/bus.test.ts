/**
 * Testy rdzenia magistrali zdarzen powloki (E15.1).
 * Kryteria akceptacji: docs/uiux/karty/U1_E15_1_MAGISTRALA.md §7.1.
 */

import { describe, expect, it } from 'vitest';
import { MagistralaZdarzen, emituj, magistrala, subskrybuj, subskrybujWszystkie } from '../bus';
import type { ZdarzenieMagistrali } from '../types';

const PRZYKLADOWE_ZDARZENIA: ZdarzenieMagistrali[] = [
  { typ: 'model-zmieniony', rev: 1, zakres: ['bus-1'] },
  { typ: 'wyniki-gotowe', runId: 'run-1', przypadekId: 'case-1' },
  { typ: 'wyniki-niewazne', przyczyna: 'model-zmieniony', rev: 1 },
  { typ: 'selekcja', obiektId: 'bus-1', zrodlo: 'sld' },
  { typ: 'przypadek-aktywny', przypadekId: 'case-1' },
  { typ: 'gotowosc-zmieniona', blokady: 1, ostrzezenia: 0 },
];

describe('MagistralaZdarzen — emisja/odbior per typ (§7.1.1)', () => {
  it.each(PRZYKLADOWE_ZDARZENIA)('dostarcza zdarzenie typu %s do subskrybenta tego typu', (zdarzenie) => {
    const bus = new MagistralaZdarzen();
    const odebrane: ZdarzenieMagistrali[] = [];
    bus.subskrybuj(zdarzenie.typ, (z) => odebrane.push(z));

    bus.emituj(zdarzenie);

    expect(odebrane).toEqual([zdarzenie]);
  });

  it('nie dostarcza zdarzenia subskrybentowi innego typu', () => {
    const bus = new MagistralaZdarzen();
    const odebrane: ZdarzenieMagistrali[] = [];
    bus.subskrybuj('selekcja', (z) => odebrane.push(z));

    bus.emituj({ typ: 'przypadek-aktywny', przypadekId: 'case-1' });

    expect(odebrane).toEqual([]);
  });

  it('subskrybujWszystkie odbiera kazdy typ zdarzenia', () => {
    const bus = new MagistralaZdarzen();
    const odebrane: ZdarzenieMagistrali[] = [];
    bus.subskrybujWszystkie((z) => odebrane.push(z));

    for (const zdarzenie of PRZYKLADOWE_ZDARZENIA) {
      bus.emituj(zdarzenie);
    }

    expect(odebrane).toEqual(PRZYKLADOWE_ZDARZENIA);
  });

  it('emisja zdarzenia bez zadnego subskrybenta danego typu nie rzuca bledu (zbior typu nieobecny w mapie)', () => {
    const bus = new MagistralaZdarzen();
    // Zaden subskrybent nigdy nie zarejestrowal sie dla 'gotowosc-zmieniona'
    // -> galaz `if (zbiorTypu)` = false w dystrybuuj().
    expect(() =>
      bus.emituj({ typ: 'gotowosc-zmieniona', blokady: 0, ostrzezenia: 0 }),
    ).not.toThrow();
  });
});

describe('MagistralaZdarzen — odsubskrybowanie (§7.1.1)', () => {
  it('po odsubskrybowaniu obsluznik nie jest juz wywolywany', () => {
    const bus = new MagistralaZdarzen();
    const odebrane: ZdarzenieMagistrali[] = [];
    const odsubskrybuj = bus.subskrybuj('selekcja', (z) => odebrane.push(z));

    bus.emituj({ typ: 'selekcja', obiektId: 'a', zrodlo: 'x' });
    odsubskrybuj();
    bus.emituj({ typ: 'selekcja', obiektId: 'b', zrodlo: 'x' });

    expect(odebrane).toEqual([{ typ: 'selekcja', obiektId: 'a', zrodlo: 'x' }]);
  });

  it('wielokrotne wywolanie funkcji odsubskrybowania jest bezpieczne (no-op)', () => {
    const bus = new MagistralaZdarzen();
    const odsubskrybuj = bus.subskrybuj('selekcja', () => {});
    expect(() => {
      odsubskrybuj();
      odsubskrybuj();
    }).not.toThrow();
  });

  it('odsubskrybowanie z subskrybujWszystkie zatrzymuje dostarczanie', () => {
    const bus = new MagistralaZdarzen();
    const odebrane: ZdarzenieMagistrali[] = [];
    const odsubskrybuj = bus.subskrybujWszystkie((z) => odebrane.push(z));

    bus.emituj({ typ: 'przypadek-aktywny', przypadekId: 'case-1' });
    odsubskrybuj();
    bus.emituj({ typ: 'przypadek-aktywny', przypadekId: 'case-2' });

    expect(odebrane).toHaveLength(1);
  });

  it('odsubskrybowanie w trakcie emisji jest bezpieczne — biezaca dystrybucja konczy sie normalnie', () => {
    const bus = new MagistralaZdarzen();
    const kolejnosc: string[] = [];
    const odsubskrybujBRef: { current: (() => void) | null } = { current: null };

    bus.subskrybuj('selekcja', () => {
      kolejnosc.push('a');
      // Obsluznik 'a' odsubskrybowuje 'b' w trakcie tej samej dystrybucji.
      odsubskrybujBRef.current?.();
    });
    odsubskrybujBRef.current = bus.subskrybuj('selekcja', () => {
      kolejnosc.push('b');
    });

    expect(() =>
      bus.emituj({ typ: 'selekcja', obiektId: null, zrodlo: 'x' }),
    ).not.toThrow();
    // 'b' zdazyl juz trafic do migawki (Array.from) tej dystrybucji — wywolany.
    expect(kolejnosc).toEqual(['a', 'b']);

    kolejnosc.length = 0;
    bus.emituj({ typ: 'selekcja', obiektId: 'x', zrodlo: 'x' });
    // Po odsubskrybowaniu 'b' nie jest juz wywolywany przy kolejnej emisji.
    expect(kolejnosc).toEqual(['a']);
  });
});

describe('MagistralaZdarzen — idempotencja subskrypcji (§7.1.1)', () => {
  it('wielokrotna subskrypcja tego samego obsluznika wywoluje go raz na zdarzenie', () => {
    const bus = new MagistralaZdarzen();
    const odebrane: ZdarzenieMagistrali[] = [];
    const obsluznik = (z: ZdarzenieMagistrali) => odebrane.push(z);

    bus.subskrybuj('selekcja', obsluznik);
    bus.subskrybuj('selekcja', obsluznik);

    bus.emituj({ typ: 'selekcja', obiektId: 'a', zrodlo: 'x' });

    expect(odebrane).toHaveLength(1);
  });

  it('subskrypcja drugiego obsluznika tego samego typu dodaje sie do juz istniejacego zbioru', () => {
    const bus = new MagistralaZdarzen();
    const odebraneA: ZdarzenieMagistrali[] = [];
    const odebraneB: ZdarzenieMagistrali[] = [];

    // Pierwsza subskrypcja typu 'selekcja' -> tworzy nowy zbior (galaz `!zbior` = true).
    bus.subskrybuj('selekcja', (z) => odebraneA.push(z));
    // Druga subskrypcja tego samego typu -> uzywa istniejacego zbioru (galaz `!zbior` = false).
    bus.subskrybuj('selekcja', (z) => odebraneB.push(z));

    bus.emituj({ typ: 'selekcja', obiektId: 'a', zrodlo: 'x' });

    expect(odebraneA).toHaveLength(1);
    expect(odebraneB).toHaveLength(1);
  });
});

describe('MagistralaZdarzen — FIFO przy emisji zagniezdzonej (§7.1.1)', () => {
  it('zdarzenie emitowane z wnetrza obsluznika jest kolejkowane i obslugiwane po zakonczeniu biezacej dystrybucji', () => {
    const bus = new MagistralaZdarzen();
    const kolejnosc: string[] = [];

    bus.subskrybuj('model-zmieniony', (z) => {
      kolejnosc.push(`model-zmieniony:${z.rev}`);
      if (z.rev === 1) {
        // Emisja zagniezdzona — nie moze byc obsluzona rekurencyjnie tutaj.
        bus.emituj({ typ: 'model-zmieniony', rev: 2, zakres: [] });
        kolejnosc.push('po-emisji-zagniezdzonej');
      }
    });

    bus.emituj({ typ: 'model-zmieniony', rev: 1, zakres: [] });

    expect(kolejnosc).toEqual([
      'model-zmieniony:1',
      'po-emisji-zagniezdzonej',
      'model-zmieniony:2',
    ]);
  });

  it('kolejnosc dostarczenia wielu zdarzen odpowiada kolejnosci emisji (bez zagniezdzenia)', () => {
    const bus = new MagistralaZdarzen();
    const kolejnosc: string[] = [];
    bus.subskrybujWszystkie((z) => kolejnosc.push(z.typ));

    bus.emituj({ typ: 'przypadek-aktywny', przypadekId: 'case-1' });
    bus.emituj({ typ: 'selekcja', obiektId: null, zrodlo: 'x' });
    bus.emituj({ typ: 'gotowosc-zmieniona', blokady: 0, ostrzezenia: 0 });

    expect(kolejnosc).toEqual(['przypadek-aktywny', 'selekcja', 'gotowosc-zmieniona']);
  });

  it('wielopoziomowa emisja zagniezdzona (A emituje B, B emituje C) zachowuje FIFO bez rekurencji', () => {
    const bus = new MagistralaZdarzen();
    const kolejnosc: string[] = [];

    bus.subskrybuj('model-zmieniony', (z) => {
      kolejnosc.push(`start:${z.rev}`);
      if (z.rev < 3) {
        bus.emituj({ typ: 'model-zmieniony', rev: z.rev + 1, zakres: [] });
      }
      kolejnosc.push(`koniec:${z.rev}`);
    });

    bus.emituj({ typ: 'model-zmieniony', rev: 1, zakres: [] });

    // Kazdy poziom konczy sie (koniec:N) PRZED rozpoczeciem obslugi kolejnego
    // zagniezdzonego zdarzenia z kolejki — FIFO, bez przeplatania.
    expect(kolejnosc).toEqual([
      'start:1',
      'koniec:1',
      'start:2',
      'koniec:2',
      'start:3',
      'koniec:3',
    ]);
  });
});

describe('MagistralaZdarzen — determinizm (§7.1.1, §6)', () => {
  it('permutacja kolejnosci subskrypcji nie zmienia stanu koncowego (3 subskrybentow, wspolna lista per zdarzenie)', () => {
    function uruchomZKolejnoscia(kolejnoscId: string[]): Record<string, string[]> {
      const bus = new MagistralaZdarzen();
      const stanKoncowy: Record<string, string[]> = {
        'model-zmieniony': [],
        selekcja: [],
      };

      const zarejestruj = (id: string) => {
        bus.subskrybuj('model-zmieniony', () => {
          stanKoncowy['model-zmieniony'].push(id);
        });
        bus.subskrybuj('selekcja', () => {
          stanKoncowy.selekcja.push(id);
        });
      };

      for (const id of kolejnoscId) {
        zarejestruj(id);
      }

      bus.emituj({ typ: 'model-zmieniony', rev: 1, zakres: [] });
      bus.emituj({ typ: 'selekcja', obiektId: 'x', zrodlo: 'y' });

      return stanKoncowy;
    }

    const kolejnoscA = ['sub-1', 'sub-2', 'sub-3'];
    const kolejnoscB = ['sub-3', 'sub-1', 'sub-2'];
    const kolejnoscC = ['sub-2', 'sub-3', 'sub-1'];

    const wynikA = uruchomZKolejnoscia(kolejnoscA);
    const wynikB = uruchomZKolejnoscia(kolejnoscB);
    const wynikC = uruchomZKolejnoscia(kolejnoscC);

    // Stan koncowy (zbior subskrybentow, ktorzy zareagowali na kazde zdarzenie)
    // jest identyczny niezaleznie od kolejnosci subskrypcji — porownanie po
    // posortowaniu, bo sama kolejnosc wpisow w liscie odzwierciedla kolejnosc
    // subskrypcji (co jest oczekiwane), a nie "przypadkowosc" wyniku.
    const posortuj = (stan: Record<string, string[]>) => ({
      'model-zmieniony': [...stan['model-zmieniony']].sort(),
      selekcja: [...stan.selekcja].sort(),
    });

    expect(posortuj(wynikA)).toEqual(posortuj(wynikB));
    expect(posortuj(wynikB)).toEqual(posortuj(wynikC));
    expect(posortuj(wynikA)).toEqual({
      'model-zmieniony': ['sub-1', 'sub-2', 'sub-3'],
      selekcja: ['sub-1', 'sub-2', 'sub-3'],
    });
  });

  it('powtorne uruchomienie tej samej sekwencji emisji daje identyczny wynik (brak Date.now()/losowosci)', () => {
    function uruchom(): ZdarzenieMagistrali[] {
      const bus = new MagistralaZdarzen();
      const odebrane: ZdarzenieMagistrali[] = [];
      bus.subskrybujWszystkie((z) => odebrane.push(z));
      bus.emituj({ typ: 'model-zmieniony', rev: 1, zakres: ['a'] });
      bus.emituj({ typ: 'gotowosc-zmieniona', blokady: 2, ostrzezenia: 1 });
      return odebrane;
    }

    expect(uruchom()).toEqual(uruchom());
  });
});

describe('Magistrala — wspoldzielona instancja singleton (funkcje modulu)', () => {
  it('emituj/subskrybuj/subskrybujWszystkie eksportowane z modulu operuja na tej samej instancji `magistrala`', () => {
    const odebrane: ZdarzenieMagistrali[] = [];
    const odebraneWszystkie: ZdarzenieMagistrali[] = [];
    const odsubskrybuj = subskrybuj('przypadek-aktywny', (z) => odebrane.push(z));
    const odsubskrybujWszystkie = subskrybujWszystkie((z) => odebraneWszystkie.push(z));

    try {
      emituj({ typ: 'przypadek-aktywny', przypadekId: 'case-singleton' });

      expect(odebrane).toEqual([{ typ: 'przypadek-aktywny', przypadekId: 'case-singleton' }]);
      expect(odebraneWszystkie).toEqual([
        { typ: 'przypadek-aktywny', przypadekId: 'case-singleton' },
      ]);
      expect(magistrala).toBeInstanceOf(MagistralaZdarzen);
    } finally {
      odsubskrybuj();
      odsubskrybujWszystkie();
    }
  });
});
