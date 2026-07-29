import { describe, it, expect } from 'vitest';

import {
  KLUCZ_PROBLEM,
  KOLUMNY_SZYN_DIFF,
  etykietaPrzebiegu,
  mapaWagElementow,
  naWierszeGalezi,
  naWierszeRankingu,
  naWierszeSzynDiff,
  naZalozeniaPorownania,
} from '../porownanieModel';
import { POROWNANIE_STRINGS } from '../strings';
import {
  branchDiffFixture,
  busDiffFixture,
  rankingFixture,
  runFixture,
  summaryFixture,
} from './fixtures';

describe('mapaWagElementow — maksymalna waga per element', () => {
  it('bierze najwyższą wagę problemu dla elementu', () => {
    const mapa = mapaWagElementow([
      ...rankingFixture(),
      {
        issue_code: 'ANGLE_SHIFT_HIGH',
        severity: 2,
        element_ref: 'SZYNA-GPZ',
        description_pl: 'x',
        evidence_ref: 2,
      },
    ]);
    expect(mapa.get('SZYNA-GPZ')).toBe(5);
    expect(mapa.get('LINIA-GPZ-ST1')).toBe(3);
    expect(mapa.get('BRAK')).toBeUndefined();
  });
});

describe('naWierszeSzynDiff — A · B · Δ z sortKey i tagiem wg wagi', () => {
  it('mapuje napięcia i kąty A/B/Δ z przecinkiem PL', () => {
    const wagi = mapaWagElementow(rankingFixture());
    const wiersze = naWierszeSzynDiff([busDiffFixture()], wagi);
    const w = wiersze[0];
    expect(w.szyna.wartosc).toBe('SZYNA-GPZ');
    expect(w.vA.wartosc).toBe('1,0200');
    expect(w.vB.wartosc).toBe('0,9650');
    expect(w.dV.wartosc).toBe('-0,0550');
    expect(w.dV.sortKey).toBe(-0.055);
    expect(w.dKat.wartosc).toBe('-1,60');
  });

  it('delta dodatnia otrzymuje znak „+"', () => {
    const wiersze = naWierszeSzynDiff(
      [busDiffFixture({ delta_v_pu: 0.01, delta_angle_deg: 0.5 })],
      new Map(),
    );
    expect(wiersze[0].dV.wartosc).toBe('+0,0100');
    expect(wiersze[0].dKat.wartosc).toBe('+0,50');
  });

  it('element z wagą poważną+ (5) → tag ostrzeżenia na deltach', () => {
    const wagi = mapaWagElementow(rankingFixture());
    const wiersze = naWierszeSzynDiff([busDiffFixture()], wagi);
    expect(wiersze[0].dV.ostrzezenie).toBe(true);
    expect(wiersze[0].dKat.ostrzezenie).toBe(true);
  });

  it('element bez problemów → brak tagu', () => {
    const wiersze = naWierszeSzynDiff([busDiffFixture({ bus_id: 'CICHA' })], new Map());
    expect(wiersze[0].dV.ostrzezenie).toBe(false);
  });

  it('wartości źródłowe A i B niosą sortKey liczbowy', () => {
    const wiersze = naWierszeSzynDiff([busDiffFixture()], new Map());
    expect(wiersze[0].vA.sortKey).toBe(1.02);
    expect(wiersze[0].vB.sortKey).toBe(0.965);
  });

  it('R3-C: komórki A/B niosą dowodRef strony, Δ bez dowodu (brak wywodu różnicy)', () => {
    const w = naWierszeSzynDiff([busDiffFixture()], new Map())[0];
    expect(w.vA.dowodRef).toBe('A:SZYNA-GPZ');
    expect(w.vB.dowodRef).toBe('B:SZYNA-GPZ');
    expect(w.katA.dowodRef).toBe('A:SZYNA-GPZ');
    expect(w.katB.dowodRef).toBe('B:SZYNA-GPZ');
    // Różnica B−A nie ma pojedynczego wywodu WHITE BOX — delta bez dowodu.
    expect(w.dV.dowodRef).toBeUndefined();
    expect(w.dKat.dowodRef).toBeUndefined();
  });
});

describe('naWierszeGalezi — straty i moc A · B · Δ', () => {
  it('mapuje straty czynne i moc początkową A/B/Δ [MW] z 3 miejscami', () => {
    const wagi = mapaWagElementow(rankingFixture());
    const w = naWierszeGalezi([branchDiffFixture()], wagi)[0];
    expect(w.galaz.wartosc).toBe('LINIA-GPZ-ST1');
    expect(w.stratyA.wartosc).toBe('0,200');
    expect(w.stratyB.wartosc).toBe('0,300');
    expect(w.dStraty.wartosc).toBe('+0,100');
    expect(w.mocA.wartosc).toBe('8,200');
    expect(w.dMoc.wartosc).toBe('+0,700');
  });

  it('waga umiarkowana (3) nie przekracza progu tagu (poważny=4)', () => {
    const wagi = mapaWagElementow(rankingFixture());
    const w = naWierszeGalezi([branchDiffFixture()], wagi)[0];
    expect(w.dStraty.ostrzezenie).toBe(false);
  });

  it('R3-C: komórki A/B gałęzi niosą dowodRef strony, Δ bez dowodu', () => {
    const w = naWierszeGalezi([branchDiffFixture()], new Map())[0];
    expect(w.stratyA.dowodRef).toBe('A:LINIA-GPZ-ST1');
    expect(w.stratyB.dowodRef).toBe('B:LINIA-GPZ-ST1');
    expect(w.mocA.dowodRef).toBe('A:LINIA-GPZ-ST1');
    expect(w.mocB.dowodRef).toBe('B:LINIA-GPZ-ST1');
    expect(w.dStraty.dowodRef).toBeUndefined();
    expect(w.dMoc.dowodRef).toBeUndefined();
  });
});

describe('naWierszeRankingu — waga PL, rodzaj PL, kod techniczny', () => {
  it('mapuje wagę i rodzaj na PL; klucz = indeks; surowy kod w polu eksperckim', () => {
    const wiersze = naWierszeRankingu(rankingFixture());
    expect(wiersze[0].waga.wartosc).toBe('Krytyczny');
    expect(wiersze[0].waga.sortKey).toBe(5);
    expect(wiersze[0].waga.ostrzezenie).toBe(true);
    expect(wiersze[0].rodzaj.wartosc).toBe('Duża zmiana napięcia');
    expect(wiersze[0].element.wartosc).toBe('SZYNA-GPZ');
    expect(wiersze[0].kodTechniczny.wartosc).toBe('VOLTAGE_DELTA_HIGH');
    expect(wiersze[0][KLUCZ_PROBLEM].wartosc).toBe('0');
    expect(wiersze[1][KLUCZ_PROBLEM].wartosc).toBe('1');
  });

  it('waga 3 → „Umiarkowany" bez tagu', () => {
    const wiersze = naWierszeRankingu(rankingFixture());
    expect(wiersze[1].waga.wartosc).toBe('Umiarkowany');
    expect(wiersze[1].waga.ostrzezenie).toBe(false);
  });
});

describe('naZalozeniaPorownania — podsumowanie A · B · Δ', () => {
  it('zbieżność, straty A/B/Δ i liczby problemów wg wag', () => {
    const zal = naZalozeniaPorownania(summaryFixture());
    const zbieznosc = zal.find((z) => z.etykieta === POROWNANIE_STRINGS.podsumZbieznosc);
    expect(zbieznosc?.wartosc).toBe('Zbieżny · Zbieżny');
    const straty = zal.find((z) => z.etykieta === POROWNANIE_STRINGS.podsumStraty);
    expect(straty?.wartosc).toContain('0,200 · 0,300 · Δ +0,100');
    const problemy = zal.find((z) => z.etykieta === POROWNANIE_STRINGS.podsumProblemy);
    expect(problemy?.wartosc).toBe('1 · 0 · 1 · 0');
  });

  it('delta strat dostaje tag „poza zakresem" przy niezerowych problemach', () => {
    const zal = naZalozeniaPorownania(summaryFixture({ total_issues: 2 }));
    const straty = zal.find((z) => z.etykieta === POROWNANIE_STRINGS.podsumStraty);
    expect(String(straty?.wartosc)).toContain(POROWNANIE_STRINGS.podsumTagOdchylenie);
  });

  it('brak problemów → brak tagu przy delcie', () => {
    const zal = naZalozeniaPorownania(summaryFixture({ total_issues: 0 }));
    const straty = zal.find((z) => z.etykieta === POROWNANIE_STRINGS.podsumStraty);
    expect(String(straty?.wartosc)).not.toContain(POROWNANIE_STRINGS.podsumTagOdchylenie);
  });

  it('niezbieżność jednego wariantu widoczna w podsumowaniu', () => {
    const zal = naZalozeniaPorownania(summaryFixture({ converged_b: false }));
    const zbieznosc = zal.find((z) => z.etykieta === POROWNANIE_STRINGS.podsumZbieznosc);
    expect(zbieznosc?.wartosc).toBe('Zbieżny · Niezbieżny');
  });
});

describe('etykietaPrzebiegu — data + zbieżność; id tylko w trybie eksperckim', () => {
  it('tryb podstawowy: analiza, data deterministyczna, zbieżność bez identyfikatorów', () => {
    const label = etykietaPrzebiegu(runFixture(), false);
    expect(label).toBe('Rozpływ mocy · 2026-07-10 08:15 · Zbieżny');
    expect(label).not.toContain('run-a');
    expect(label).not.toContain('case-1');
  });

  it('tryb ekspercki: dopisany przypadek i identyfikator przebiegu', () => {
    const label = etykietaPrzebiegu(runFixture(), true);
    expect(label).toContain('case-1');
    expect(label).toContain('run-a');
  });

  it('brak informacji o zbieżności → kreska', () => {
    const label = etykietaPrzebiegu(runFixture({ converged: null }), false);
    expect(label).toContain(POROWNANIE_STRINGS.kreska);
  });

  it('nazwa przypadku dopisana obok znacznika czasu (przed zbieżnością)', () => {
    const label = etykietaPrzebiegu(runFixture(), false, 'Wariant letni');
    expect(label).toBe('Rozpływ mocy · 2026-07-10 08:15 · Wariant letni · Zbieżny');
  });

  it('brak nazwy przypadku (null) → dzisiejsza etykieta, zero zgadywania', () => {
    const label = etykietaPrzebiegu(runFixture(), false, null);
    expect(label).toBe('Rozpływ mocy · 2026-07-10 08:15 · Zbieżny');
  });

  it('tryb ekspercki zachowuje identyfikatory obok nazwy przypadku', () => {
    const label = etykietaPrzebiegu(runFixture(), true, 'Wariant letni');
    expect(label).toContain('Wariant letni');
    expect(label).toContain('case-1');
    expect(label).toContain('run-a');
  });
});

describe('kolumny — kontrakt deklaratywny', () => {
  it('kolumny szyn niosą jednostki i tryb liczbowy', () => {
    const dV = KOLUMNY_SZYN_DIFF.find((k) => k.klucz === 'dV');
    expect(dV?.jednostka).toBe(POROWNANIE_STRINGS.jednPu);
    expect(dV?.mono).toBe(true);
  });
});
