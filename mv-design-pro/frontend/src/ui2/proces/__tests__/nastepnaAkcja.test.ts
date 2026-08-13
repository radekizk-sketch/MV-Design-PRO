/*
 * Testy reguły „następna najlepsza akcja". Każda deklaracja z nagłówka
 * `nastepnaAkcja.ts` ma tu przypiętą asercję — deklaracja bez testu jest
 * fałszywą pewnością (CLAUDE.md, reguła KLASA-NIE-INSTANCJA pkt 4).
 *
 * Pokrycie jest ILOCZYNEM CECH, nie listą przykładów: szczeble drabiny ×
 * obecność blokad × obecność ostrzeżeń × stan przebiegu × aktualność wyników
 * przechodzimy wyczerpująco (test „całkowitości"), a wybór blokady sprawdzamy
 * na iloczynie: priorytet kanoniczny × brak priorytetu × remis priorytetów ×
 * remis kodów × brak elementu.
 */

import { describe, it, expect } from 'vitest';
import {
  porownajProblemy,
  wybierzBlokadeDoNaprawy,
  wyznaczNastepnaAkcje,
  type RodzajNastepnejAkcji,
} from '../nastepnaAkcja';
import { ETAPY_IDS } from '../etapy';
import { SPACE_IDS } from '../../shell/spaces';
import { PROCES_STRINGS } from '../strings';
import { problem, sygnaly } from './fixtures';

describe('wyznaczNastepnaAkcje — drabina reguł, DOKŁADNIE jedna akcja', () => {
  it('R1: bez otwartego projektu prowadzi do otwarcia projektu (etap E1)', () => {
    const akcja = wyznaczNastepnaAkcje(sygnaly({ projektOtwarty: false }));
    expect(akcja.rodzaj).toBe('otworz-projekt');
    expect(akcja.etap).toBe('E1');
    expect(akcja.przestrzen).toBe('projekt');
    expect(akcja.problem).toBeNull();
  });

  it('R1 wyprzedza wszystko inne — nawet gdy są blokady i wyniki', () => {
    const akcja = wyznaczNastepnaAkcje(
      sygnaly({
        projektOtwarty: false,
        problemy: [problem()],
        jestZakonczonyPrzebieg: true,
        wynikiAktualne: true,
      }),
    );
    expect(akcja.rodzaj).toBe('otworz-projekt');
  });

  it('R2: gotowość NIEUSTALONA → ustal gotowość, a nie „uruchom obliczenia" (etap E3)', () => {
    // Regresja długu V12K-309 poz. 1 w regule NBA: pusta lista zgłoszeń przy
    // nieustalonej gotowości NIE jest zieloną bramką.
    const akcja = wyznaczNastepnaAkcje(sygnaly({ gotowoscUstalona: false, problemy: [] }));
    expect(akcja.rodzaj).toBe('ustal-gotowosc');
    expect(akcja.etap).toBe('E3');
    expect(akcja.przestrzen).toBe('gotowosc');
    expect(akcja.problem).toBeNull();
  });

  it('R2 wyprzedza obliczenia i wyniki (bez gotowości nie wiadomo, czy wolno liczyć)', () => {
    const akcja = wyznaczNastepnaAkcje(
      sygnaly({ gotowoscUstalona: false, jestZakonczonyPrzebieg: true, wynikiAktualne: true }),
    );
    expect(akcja.rodzaj).toBe('ustal-gotowosc');
  });

  it('R3: blokada gotowości daje akcję naprawczą z konkretnym zgłoszeniem (etap E3)', () => {
    const blokada = problem({ code: 'source.sk3_invalid', elementRef: 'GPZ-1' });
    const akcja = wyznaczNastepnaAkcje(sygnaly({ problemy: [blokada] }));
    expect(akcja.rodzaj).toBe('usun-blokade');
    expect(akcja.etap).toBe('E3');
    expect(akcja.problem).toBe(blokada);
    expect(akcja.tytul).toBe(blokada.opisPl);
  });

  it('R3 wyprzedza obliczenia i wyniki (blokada zamyka drogę dalej)', () => {
    const akcja = wyznaczNastepnaAkcje(
      sygnaly({ problemy: [problem()], jestZakonczonyPrzebieg: true, wynikiAktualne: true }),
    );
    expect(akcja.rodzaj).toBe('usun-blokade');
  });

  it('uzasadnienie R3 liczy POZOSTAŁE blokady z kontraktu (nie z domysłu)', () => {
    const jedna = wyznaczNastepnaAkcje(sygnaly({ problemy: [problem()] }));
    expect(jedna.uzasadnienie).toBe(PROCES_STRINGS.nbaPozostaleBlokady(0));

    const trzy = wyznaczNastepnaAkcje(
      sygnaly({
        problemy: [
          problem({ code: 'a.jeden' }),
          problem({ code: 'b.dwa' }),
          problem({ code: 'c.trzy' }),
        ],
      }),
    );
    expect(trzy.uzasadnienie).toBe(PROCES_STRINGS.nbaPozostaleBlokady(2));
  });

  it('R4: brak zaległości i brak przebiegu → „wszystko gotowe" Z AKCJĄ (etap E4)', () => {
    const akcja = wyznaczNastepnaAkcje(sygnaly({ problemy: [], jestZakonczonyPrzebieg: false }));
    expect(akcja.rodzaj).toBe('uruchom-obliczenia');
    expect(akcja.etap).toBe('E4');
    expect(akcja.przestrzen).toBe('obliczenia');
    expect(akcja.etykietaAkcji).toBe(PROCES_STRINGS.nbaUruchomObliczeniaAkcja);
  });

  it('R5: wyniki jawnie nieaktualne → przelicz ponownie (etap E4)', () => {
    const akcja = wyznaczNastepnaAkcje(
      sygnaly({ jestZakonczonyPrzebieg: true, wynikiAktualne: false }),
    );
    expect(akcja.rodzaj).toBe('przelicz-ponownie');
    expect(akcja.etap).toBe('E4');
  });

  it('R6: wyniki aktualne → odczytaj wyniki (etap E5)', () => {
    const akcja = wyznaczNastepnaAkcje(
      sygnaly({ jestZakonczonyPrzebieg: true, wynikiAktualne: true }),
    );
    expect(akcja.rodzaj).toBe('odczytaj-wyniki');
    expect(akcja.etap).toBe('E5');
    expect(akcja.przestrzen).toBe('wyniki');
  });

  it('R6 obejmuje też brak danej o aktualności (przebieg jest, przypadek bez wyników)', () => {
    // `wynikiAktualne === null` to BRAK DANEJ, nie „nieaktualne" — reguła nie
    // udaje wartości logicznej i nie każe przeliczać bez podstawy.
    const akcja = wyznaczNastepnaAkcje(
      sygnaly({ jestZakonczonyPrzebieg: true, wynikiAktualne: null }),
    );
    expect(akcja.rodzaj).toBe('odczytaj-wyniki');
  });

  it('ostrzeżenia NIE tworzą następnej akcji (kontrakt: blokady zamykają drogę)', () => {
    const akcja = wyznaczNastepnaAkcje(
      sygnaly({
        problemy: [
          problem({ waga: 'OSTRZEZENIE', code: 'catalog.binding_missing' }),
          problem({ waga: 'OSTRZEZENIE', code: 'protection.ct_required' }),
        ],
      }),
    );
    expect(akcja.rodzaj).toBe('uruchom-obliczenia');
    expect(akcja.problem).toBeNull();
  });
});

describe('wyznaczNastepnaAkcje — całkowitość i determinizm (iloczyn cech)', () => {
  const wartosciAktualnosci: Array<boolean | null> = [true, false, null];

  it('dla KAŻDEGO zestawu sygnałów zwraca dokładnie jedną akcję z klikalnym celem', () => {
    const rodzaje = new Set<RodzajNastepnejAkcji>();
    for (const projektOtwarty of [true, false]) {
      for (const gotowoscUstalona of [true, false]) {
        for (const zBlokada of [true, false]) {
          for (const zOstrzezeniem of [true, false]) {
            for (const jestZakonczonyPrzebieg of [true, false]) {
              for (const wynikiAktualne of wartosciAktualnosci) {
                const problemy = [
                  ...(zBlokada ? [problem({ code: 'source.sk3_invalid' })] : []),
                  ...(zOstrzezeniem
                    ? [problem({ waga: 'OSTRZEZENIE' as const, code: 'catalog.binding_missing' })]
                    : []),
                ];
                const akcja = wyznaczNastepnaAkcje({
                  projektOtwarty,
                  gotowoscUstalona,
                  problemy,
                  jestZakonczonyPrzebieg,
                  wynikiAktualne,
                });
                // Klikalny cel: albo zgłoszenie do naprawy, albo realna przestrzeń.
                expect(SPACE_IDS).toContain(akcja.przestrzen);
                expect(akcja.etykietaAkcji.length).toBeGreaterThan(0);
                expect(ETAPY_IDS).toContain(akcja.etap);
                rodzaje.add(akcja.rodzaj);
              }
            }
          }
        }
      }
    }
    // Każdy szczebel drabiny jest osiągalny — żaden nie jest martwym kodem.
    expect([...rodzaje].sort()).toEqual(
      [
        'odczytaj-wyniki',
        'otworz-projekt',
        'przelicz-ponownie',
        'uruchom-obliczenia',
        'ustal-gotowosc',
        'usun-blokade',
      ].sort(),
    );
  });

  it('reguła NIGDY nie ogłasza etapów E6–E8 (pulpit ich nie mierzy — nie zgaduje)', () => {
    for (const projektOtwarty of [true, false]) {
      for (const gotowoscUstalona of [true, false]) {
        for (const zBlokada of [true, false]) {
          for (const jestZakonczonyPrzebieg of [true, false]) {
            for (const wynikiAktualne of wartosciAktualnosci) {
              const akcja = wyznaczNastepnaAkcje({
                projektOtwarty,
                gotowoscUstalona,
                problemy: zBlokada ? [problem()] : [],
                jestZakonczonyPrzebieg,
                wynikiAktualne,
              });
              expect(['E6', 'E7', 'E8']).not.toContain(akcja.etap);
            }
          }
        }
      }
    }
  });

  it('ten sam zestaw sygnałów daje identyczny wynik (determinizm)', () => {
    const wejscie = sygnaly({
      problemy: [problem({ code: 'b.drugi' }), problem({ code: 'a.pierwszy' })],
    });
    const pierwszy = wyznaczNastepnaAkcje(wejscie);
    const drugi = wyznaczNastepnaAkcje(wejscie);
    expect(drugi).toEqual(pierwszy);
  });

  it('wynik NIE zależy od kolejności zgłoszeń na wejściu', () => {
    const a = problem({ code: 'z.ostatni', priorytetKanoniczny: 1 });
    const b = problem({ code: 'a.pierwszy', priorytetKanoniczny: 3 });
    expect(wyznaczNastepnaAkcje(sygnaly({ problemy: [a, b] })).problem).toBe(a);
    expect(wyznaczNastepnaAkcje(sygnaly({ problemy: [b, a] })).problem).toBe(a);
  });
});

describe('wybór blokady — porządek WYŁĄCZNIE z pól kontraktu', () => {
  it('wiele celów o różnych priorytetach: wygrywa najniższy priorytet kanoniczny', () => {
    const zwarcia = problem({ code: 'source.sk3_invalid', cel: 'zwarcia', priorytetKanoniczny: 1 });
    const stacje = problem({ code: 'station.voltage_missing', cel: 'stacje', priorytetKanoniczny: 2 });
    const katalogi = problem({ code: 'catalog.ref_required', cel: 'wspolne', priorytetKanoniczny: 3 });
    expect(wybierzBlokadeDoNaprawy([katalogi, stacje, zwarcia])).toBe(zwarcia);
  });

  it('REMIS priorytetów rozstrzyga jawne pole kontraktu `code` (rosnąco)', () => {
    const pierwszy = problem({ code: 'a.kod', priorytetKanoniczny: 2 });
    const drugi = problem({ code: 'b.kod', priorytetKanoniczny: 2 });
    expect(wybierzBlokadeDoNaprawy([drugi, pierwszy])).toBe(pierwszy);
  });

  it('REMIS priorytetu i kodu rozstrzyga `elementRef` (rosnąco)', () => {
    const pierwszy = problem({ code: 'a.kod', elementRef: 'B-1' });
    const drugi = problem({ code: 'a.kod', elementRef: 'B-2' });
    expect(wybierzBlokadeDoNaprawy([drugi, pierwszy])).toBe(pierwszy);
  });

  it('zgłoszenie BEZ elementu idzie PO zgłoszeniach z elementem (akcja wykonalna wprost)', () => {
    const zElementem = problem({ code: 'a.kod', elementRef: 'B-9' });
    const bezElementu = problem({ code: 'a.kod', elementRef: null });
    expect(wybierzBlokadeDoNaprawy([bezElementu, zElementem])).toBe(zElementem);
  });

  it('brak priorytetu kanonicznego NIE wyprzedza kodu uszeregowanego przez kanon', () => {
    const bezKanonu = problem({ code: 'aaa.bez.kanonu', priorytetKanoniczny: null });
    const zKanonem = problem({ code: 'zzz.z.kanonem', priorytetKanoniczny: 4 });
    expect(wybierzBlokadeDoNaprawy([bezKanonu, zKanonem])).toBe(zKanonem);
  });

  it('gdy ŻADNE zgłoszenie nie ma priorytetu, rozstrzyga kod (porządek nadal totalny)', () => {
    const a = problem({ code: 'aaa.x', priorytetKanoniczny: null });
    const b = problem({ code: 'bbb.x', priorytetKanoniczny: null });
    expect(wybierzBlokadeDoNaprawy([b, a])).toBe(a);
  });

  it('porównanie kodów jest KODOWE, nie językowe (wynik niezależny od lokalizacji)', () => {
    // W porządku językowym „ą" poprzedza „b"; w porządku kodowym jest odwrotnie.
    // Reguła musi dać wynik KODOWY — inaczej ta sama sieć dałaby inną akcję na
    // maszynie z inną lokalizacją.
    const zOgonkiem = problem({ code: 'ą.kod', priorytetKanoniczny: null });
    const zBe = problem({ code: 'b.kod', priorytetKanoniczny: null });
    expect('ą'.localeCompare('b', 'pl')).toBeLessThan(0);
    expect(wybierzBlokadeDoNaprawy([zOgonkiem, zBe])).toBe(zBe);
  });

  it('bez blokad zwraca null (ostrzeżenia świadomie pomijane)', () => {
    expect(wybierzBlokadeDoNaprawy([])).toBeNull();
    expect(wybierzBlokadeDoNaprawy([problem({ waga: 'OSTRZEZENIE' })])).toBeNull();
  });

  it('porownajProblemy jest zwrotne i antysymetryczne dla par testowych', () => {
    const a = problem({ code: 'a.kod', priorytetKanoniczny: 1 });
    const b = problem({ code: 'b.kod', priorytetKanoniczny: 2 });
    expect(porownajProblemy(a, a)).toBe(0);
    expect(Math.sign(porownajProblemy(a, b))).toBe(-Math.sign(porownajProblemy(b, a)));
  });

  it('wybór blokady NIE mutuje listy wejściowej', () => {
    const lista = [problem({ code: 'z.kod' }), problem({ code: 'a.kod' })];
    const kopia = [...lista];
    wybierzBlokadeDoNaprawy(lista);
    expect(lista).toEqual(kopia);
  });
});
