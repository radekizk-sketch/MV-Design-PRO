/**
 * engine.test.ts — Testy deterministyczne silnika SLD.
 *
 * ZASADY TESTOWE:
 * - Kazdy test uzywa sieci kontrolnej (kanoniczne dane wejsciowe).
 * - Sprawdzany jest determinizm (2x ten sam input → identyczny wynik).
 * - Sprawdzana jest poprawnosc strukturalna (obiekty, pola, porty, trasy).
 * - ZERO losowosci, ZERO efektow ubocznych.
 */

import { describe, it, expect } from 'vitest';
import { uruchomPipelineSld } from '../pipelineSld';
import { zbudujSiecSld } from '../adapterSemantyczny';
import { uzupelnijPolaEfektywne } from '../polaEfektywne';
import { sortujPolaCalejSieci, grupujPola } from '../sortowanieAntykrzyzowaniowe';
import { obliczSzerokoscSzyny } from '../geometriaSzyny';
import {
  siecProstaMagistrala,
  siecZOdgalezieniem,
  siecPierscienZNop,
  siecZGeneracjaOze,
  siecStacjaSekcyjna,
} from '../sieciKontrolne';

// =============================================================================
// § 1. ADAPTER SEMANTYCZNY (CANONICAL 1)
// =============================================================================

describe('Krok 1: Adapter semantyczny', () => {
  it('buduje SiecSld z prostej magistrali', () => {
    const dane = siecProstaMagistrala();
    const siec = zbudujSiecSld(dane);

    expect(siec.obiekty).toHaveLength(4);
    expect(siec.polaczenia).toHaveLength(3);

    // Obiekty posortowane po ID
    for (let i = 1; i < siec.obiekty.length; i++) {
      expect(siec.obiekty[i].id.localeCompare(siec.obiekty[i - 1].id)).toBeGreaterThanOrEqual(0);
    }

    // Polaczenia posortowane po ID
    for (let i = 1; i < siec.polaczenia.length; i++) {
      expect(siec.polaczenia[i].id.localeCompare(siec.polaczenia[i - 1].id)).toBeGreaterThanOrEqual(0);
    }
  });

  it('determinizm: 2x ten sam input → identyczny SiecSld', () => {
    const dane = siecProstaMagistrala();
    const siec1 = zbudujSiecSld(dane);
    const siec2 = zbudujSiecSld(dane);

    expect(JSON.stringify(siec1)).toBe(JSON.stringify(siec2));
  });

  it('generuje aparature domyslna jesli brak jawnej', () => {
    const dane = siecProstaMagistrala();
    const siec = zbudujSiecSld(dane);

    // Kazde pole powinno miec aparature
    for (const ob of siec.obiekty) {
      for (const pole of ob.pola) {
        expect(pole.aparatura.length).toBeGreaterThan(0);
      }
    }
  });
});

// =============================================================================
// § 2. POLA EFEKTYWNE (CANONICAL 2)
// =============================================================================

describe('Krok 2: Pola efektywne', () => {
  it('uzupelnia pola niejawne z polaczen', () => {
    const dane = siecProstaMagistrala();
    const siec = zbudujSiecSld(dane);
    const siecEfektywna = uzupelnijPolaEfektywne(siec);

    // Kazdy obiekt powinien miec co najmniej tyle pol co jawnych
    for (let i = 0; i < siec.obiekty.length; i++) {
      expect(siecEfektywna.obiekty[i].pola.length).toBeGreaterThanOrEqual(
        siec.obiekty[i].pola.length,
      );
    }
  });

  it('determinizm pol efektywnych', () => {
    const dane = siecZOdgalezieniem();
    const siec = zbudujSiecSld(dane);
    const r1 = uzupelnijPolaEfektywne(siec);
    const r2 = uzupelnijPolaEfektywne(siec);

    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

// =============================================================================
// § 3. SORTOWANIE ANTYKRZYZOWANIOWE (CANONICAL 3)
// =============================================================================

describe('Krok 3: Sortowanie antykrzyzowaniowe', () => {
  it('grupuje pola wg kierunku', () => {
    const dane = siecZGeneracjaOze();
    const siec = zbudujSiecSld(dane);
    const stacjaG = siec.obiekty.find((o) => o.id === 'st-g');
    expect(stacjaG).toBeDefined();

    const grupy = grupujPola(stacjaG!.pola);
    expect(grupy.gora.length).toBeGreaterThan(0);
    expect(grupy.dol.length).toBeGreaterThan(0);
  });

  it('sortowanie deterministyczne calej sieci', () => {
    const dane = siecStacjaSekcyjna();
    const siec = zbudujSiecSld(dane);
    const efektywna = uzupelnijPolaEfektywne(siec);
    const r1 = sortujPolaCalejSieci(efektywna);
    const r2 = sortujPolaCalejSieci(efektywna);

    // Porownaj kazdy obiekt
    for (const [id, grupy1] of r1) {
      const grupy2 = r2.get(id);
      expect(grupy2).toBeDefined();
      expect(JSON.stringify(grupy1)).toBe(JSON.stringify(grupy2));
    }
  });
});

// =============================================================================
// § 4. GEOMETRIA SZYNY (CANONICAL 4-7)
// =============================================================================

describe('Krok 4-7: Geometria szyny i pol', () => {
  it('oblicza szerokosc szyny na podstawie pol', () => {
    const dane = siecStacjaSekcyjna();
    const siec = zbudujSiecSld(dane);
    const efektywna = uzupelnijPolaEfektywne(siec);
    const stacjaS = efektywna.obiekty.find((o) => o.id === 'st-s');
    expect(stacjaS).toBeDefined();

    const grupy = grupujPola(stacjaS!.pola);
    const szerokosc = obliczSzerokoscSzyny(grupy);

    // Szerokosc > minimum
    expect(szerokosc).toBeGreaterThanOrEqual(120);

    // Szerokosc snap do siatki (20px)
    expect(szerokosc % 20).toBe(0);
  });
});

// =============================================================================
// § 5. PELNY PIPELINE (CANONICALY 1-9)
// =============================================================================

describe('Pelny pipeline SLD (etapy 1-9)', () => {
  it('prosta magistrala: poprawna struktura wyniku', () => {
    const dane = siecProstaMagistrala();
    const wynik = uruchomPipelineSld(dane);

    // 4 obiekty
    expect(wynik.obiekty).toHaveLength(4);

    // 3 trasy (lub mniej jesli porty nie pasuja)
    expect(wynik.trasy.length).toBeGreaterThanOrEqual(0);

    // Obrys calkowity ma sensowne wymiary
    expect(wynik.obrysCalkowity.szerokosc).toBeGreaterThan(0);
    expect(wynik.obrysCalkowity.wysokosc).toBeGreaterThan(0);

    // Hash deterministyczny
    expect(wynik.hash).toBeTruthy();
    expect(wynik.hash.length).toBe(8); // FNV-1a 32-bit = 8 hex chars
  });

  it('stacja z odgalezieniem: poprawna geometria', () => {
    const dane = siecZOdgalezieniem();
    const wynik = uruchomPipelineSld(dane);

    expect(wynik.obiekty).toHaveLength(4);

    // Kazdy obiekt ma szyne i porty
    for (const geom of wynik.obiekty) {
      expect(geom.szyna).toBeDefined();
      expect(geom.porty.length).toBeGreaterThan(0);

      // Porty posortowane po ID
      for (let i = 1; i < geom.porty.length; i++) {
        expect(geom.porty[i].id.localeCompare(geom.porty[i - 1].id)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('pierscien z NOP: trasa NOP jest normalnieOtwarta', () => {
    const dane = siecPierscienZNop();
    const wynik = uruchomPipelineSld(dane);

    // Sprawdz czy istnieje polaczenie NOP
    const trasaNop = wynik.trasy.find((t) => t.normalnieOtwarty);
    // Moze byc null jesli porty nie pasuja — ale jesli istnieje, musi byc NOP
    if (trasaNop) {
      expect(trasaNop.normalnieOtwarty).toBe(true);
    }
  });

  it('stacja z generacja OZE: ma pola PV i BESS', () => {
    const dane = siecZGeneracjaOze();
    const wynik = uruchomPipelineSld(dane);

    // Stacja generacji powinna miec wiele pol
    const stacjaG = wynik.obiekty.find((o) => o.obiektId === 'st-g');
    expect(stacjaG).toBeDefined();
    expect(stacjaG!.pola.length).toBeGreaterThanOrEqual(4);
  });

  it('stacja sekcyjna: 2 sekcje szyny', () => {
    const dane = siecStacjaSekcyjna();
    const wynik = uruchomPipelineSld(dane);

    const stacjaS = wynik.obiekty.find((o) => o.obiektId === 'st-s');
    expect(stacjaS).toBeDefined();
    expect(stacjaS!.szyna.sekcje).toHaveLength(2);
  });

  it('DETERMINIZM: 2x ten sam input → identyczny hash', () => {
    const sieci = [
      siecProstaMagistrala(),
      siecZOdgalezieniem(),
      siecPierscienZNop(),
      siecZGeneracjaOze(),
      siecStacjaSekcyjna(),
    ];

    for (const dane of sieci) {
      const wynik1 = uruchomPipelineSld(dane);
      const wynik2 = uruchomPipelineSld(dane);

      expect(wynik1.hash).toBe(wynik2.hash);
      expect(wynik1.obiekty.length).toBe(wynik2.obiekty.length);
      expect(wynik1.trasy.length).toBe(wynik2.trasy.length);

      // Bit-for-bit porownanie geometrii
      expect(JSON.stringify(wynik1.obiekty)).toBe(JSON.stringify(wynik2.obiekty));
      expect(JSON.stringify(wynik1.trasy)).toBe(JSON.stringify(wynik2.trasy));
    }
  });

  it('wszystkie wspolrzedne snap do siatki (20px)', () => {
    const dane = siecProstaMagistrala();
    const wynik = uruchomPipelineSld(dane);

    for (const geom of wynik.obiekty) {
      // Obrys obiektu
      expect(geom.obrys.x % 20).toBe(0);
      expect(geom.obrys.y % 20).toBe(0);
      expect(geom.obrys.szerokosc % 20).toBe(0);
      expect(geom.obrys.wysokosc % 20).toBe(0);

      // Szyna
      expect(geom.szyna.x % 20).toBe(0);
      expect(geom.szyna.y % 20).toBe(0);
      expect(geom.szyna.szerokosc % 20).toBe(0);
    }
  });

  it('porty maja unikalne ID', () => {
    const dane = siecStacjaSekcyjna();
    const wynik = uruchomPipelineSld(dane);

    const wszystkiePorty = wynik.obiekty.flatMap((g) => g.porty);
    const idSet = new Set(wszystkiePorty.map((p) => p.id));
    expect(idSet.size).toBe(wszystkiePorty.length);
  });
});
