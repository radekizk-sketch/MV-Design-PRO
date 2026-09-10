/**
 * Model prezentacji ekranu „Ocena techniczna wyników" (karta B-02 / W3-E) — czyste
 * mapowanie, zero fizyki i zero ocen własnych.
 *
 * Pilnuje tego, czego nie wolno zgubić w prezentacji:
 * 1. trzy wyniki oceny elementu mają WŁASNE, rozróżnialne etykiety i klasy (żaden nie
 *    zlewa się z innym; BRAK PODSTAW nigdy nie czyta się jak spełnienie),
 * 2. grupy renderują się WYŁĄCZNIE z pozycjami niosącymi oceny elementów; pozycje bez
 *    elementów lądują w „bez podstawy" — z jednego predykatu (`elementy.length`),
 * 3. blokada „BRAK WYNIKÓW DO OCENY" i oznaczenie biegu NIEAKTUALNEGO to PARA z jednego
 *    źródła (`dostepny`/`aktualny` przebiegów rozpływu i zwarć; model nie ratuje ekranu),
 * 4. formatowanie liczb po polsku (przecinek, znak marginesu, zapis odniesienia wg
 *    warunku) jest deterministyczne — wartość bez zmian, zmienia się tylko zapis,
 * 5. typ elementu i rodzaj przekroczenia wynikają z semantyki DOMENY, a cel akcji
 *    jest mapowany tylko tam, gdzie rejestr akcji ma realny cel (zero fabrykacji).
 */

import { describe, expect, it } from 'vitest';

import type { OcenaElementu, OdpowiedzOceny, PozycjaOceny, ZrodloOceny } from '../api';
import {
  czasWykonaniaPL,
  czyBrakWynikow,
  elementNaSchemacie,
  fmtLiczba,
  fmtMargines,
  fmtOdniesienie,
  fmtWartoscZJednostka,
  grupyZWynikami,
  klasaWyniku,
  nazwaPrzedmiotu,
  ocenaCalosciowaPL,
  pakietWynikowPL,
  podstawaOcenyPL,
  pozycjeBezPodstaw,
  rodzajPrzekroczeniaKryterium,
  stanPrzebieguPL,
  typElementu,
  typElementuKryterium,
  wynikPL,
  zrodloPL,
} from '../model';
import { OCENA_STRINGS as T } from '../strings';

function element(over: Partial<OcenaElementu> = {}): OcenaElementu {
  return {
    element_id: 'L-07',
    element_nazwa: 'Magistrala L-07',
    element_rodzaj: 'galaz_liniowa',
    wynik: 'SPELNIA',
    wartosc: 82.4,
    odniesienie: 100,
    odniesienie_dolne: null,
    odniesienie_ostrzegawcze: 90,
    jednostka: '%',
    margines: 17.6,
    margines_jednostka: 'pkt proc.',
    uwaga_pl: null,
    uzasadnienie_pl: null,
    wniosek_pl: 'Gałąź obciążona w granicy obciążalności długotrwałej.',
    dowod: { run_id: 'run-pf-1', element_id: 'L-07' },
    ...over,
  };
}

function pozycja(over: Partial<PozycjaOceny> = {}): PozycjaOceny {
  return {
    kryterium_id: 'galaz.obciazenie_dlugotrwale',
    etap: 'E5',
    nazwa_pl: 'Obciążenie długotrwałe gałęzi',
    warunek_pl: '$I \\le I_{dd}$',
    norma_pl: 'Obciążalność katalogowa',
    zrodlo: 'PF',
    element_rodzaj: 'galaz_liniowa',
    stan: 'SPELNIONE',
    liczba_ocenionych: 1,
    liczba_naruszen: 0,
    liczba_niesprawdzonych: 0,
    liczba_ostrzezen: 0,
    wiodacy_element_id: 'L-07',
    wiodacy_opis_pl: null,
    powod_kod: null,
    powod_pl: null,
    run_id: 'run-pf-1',
    grupa: 'obciazalnosc',
    wielkosc_pl: 'Obciążenie',
    symbol: 'I/I_dd',
    jednostka: '%',
    warunek: 'nie_wiecej_niz',
    elementy: [element()],
    ...over,
  };
}

function zrodlo(over: Partial<ZrodloOceny> = {}): ZrodloOceny {
  return {
    rodzaj: 'PF',
    run_id: 'run-pf-1',
    wykonano: '2026-09-10T08:15:00+00:00',
    snapshot_hash: 'abc',
    aktualny: true,
    dostepny: true,
    powod_pl: null,
    ...over,
  };
}

function odpowiedz(over: Partial<OdpowiedzOceny> = {}): OdpowiedzOceny {
  return {
    werdykt: 'SPELNIONE',
    case_id: 'case-1',
    model_hash: 'abc',
    pozycje: [pozycja()],
    zrodla: [zrodlo(), zrodlo({ rodzaj: 'short_circuit_sn', run_id: 'run-sc-1' }), zrodlo({ rodzaj: 'model', run_id: null })],
    podsumowanie: { spelnione: 1, naruszone: 0, niesprawdzone: 0, nie_dotyczy: 0, razem: 1 },
    zakres_poza_automatem: [],
    ocena: { oceniono: 1, spelnia: 1, nie_spelnia: 0, brak_podstaw: 0 },
    grupy: [
      { kod: 'napiecia', nazwa_pl: 'Napięcia' },
      { kod: 'obciazalnosc', nazwa_pl: 'Obciążalność' },
    ],
    ...over,
  };
}

describe('wyniki oceny elementu — trzy stany, nigdy dwa', () => {
  it('każdy wynik ma własną etykietę i klasę; BRAK PODSTAW nie brzmi jak spełnienie', () => {
    const etykiety = [wynikPL('SPELNIA'), wynikPL('NIE_SPELNIA'), wynikPL('BRAK_PODSTAW')];
    expect(new Set(etykiety).size).toBe(3);
    expect(new Set([klasaWyniku('SPELNIA'), klasaWyniku('NIE_SPELNIA'), klasaWyniku('BRAK_PODSTAW')]).size).toBe(3);
    expect(wynikPL('BRAK_PODSTAW')).toBe(T.wynikBrakPodstaw);
    expect(wynikPL('BRAK_PODSTAW').startsWith('SPEŁNIA')).toBe(false);
    // Zakaz skrótów PASS/WARN/FAIL (prompt właściciela §6): etykiety są zdaniami PL.
    for (const etykieta of etykiety) expect(etykieta).not.toMatch(/\b(PASS|WARN|FAIL)\b/);
  });
});

describe('grupy i pozycje bez podstawy — jeden predykat', () => {
  it('grupa renderuje się WYŁĄCZNIE z pozycjami niosącymi oceny elementów, w kolejności odpowiedzi', () => {
    const dane = odpowiedz({
      pozycje: [
        pozycja({ kryterium_id: 'b', grupa: 'obciazalnosc' }),
        pozycja({ kryterium_id: 'a', grupa: 'napiecia', elementy: [element({ element_id: 'B-1', element_rodzaj: 'szyna' })] }),
        pozycja({ kryterium_id: 'c', grupa: 'zwarcia', elementy: [] }),
      ],
      grupy: [
        { kod: 'napiecia', nazwa_pl: 'Napięcia' },
        { kod: 'obciazalnosc', nazwa_pl: 'Obciążalność' },
        { kod: 'zwarcia', nazwa_pl: 'Zwarcia' },
      ],
    });
    const grupy = grupyZWynikami(dane);
    expect(grupy.map((g) => g.kod)).toEqual(['napiecia', 'obciazalnosc']);
    expect(grupy[0].nazwa).toBe('Napięcia');
    expect(grupy[0].pozycje.map((p) => p.kryterium_id)).toEqual(['a']);
  });

  it('pozycja bez elementów trafia do „bez podstawy"; NIE_DOTYCZY nie jest brakiem podstawy', () => {
    const dane = odpowiedz({
      pozycje: [
        pozycja({ kryterium_id: 'z-wynikiem' }),
        pozycja({ kryterium_id: 'bez-biegu', elementy: [], stan: 'NIESPRAWDZONE', powod_pl: 'Brak zakończonego biegu.' }),
        pozycja({ kryterium_id: 'nie-dotyczy', elementy: [], stan: 'NIE_DOTYCZY' }),
      ],
    });
    expect(pozycjeBezPodstaw(dane).map((p) => p.kryterium_id)).toEqual(['bez-biegu']);
    // Para predykatów: pozycja jest ALBO w grupie, ALBO bez podstawy — nigdy w obu.
    const wGrupach = grupyZWynikami(dane).flatMap((g) => g.pozycje.map((p) => p.kryterium_id));
    expect(wGrupach).toEqual(['z-wynikiem']);
  });
});

describe('blokada BRAK WYNIKÓW i bieg nieaktualny — para z jednego źródła', () => {
  it('brak dostępnego i aktualnego biegu rozpływu ORAZ zwarć blokuje ocenę; jeden aktualny — nie', () => {
    const bezBiegow = odpowiedz({
      zrodla: [
        zrodlo({ dostepny: false, run_id: null }),
        zrodlo({ rodzaj: 'short_circuit_sn', dostepny: false, run_id: null }),
        zrodlo({ rodzaj: 'model', run_id: null }),
      ],
    });
    expect(czyBrakWynikow(bezBiegow)).toBe(true);
    const nieaktualne = odpowiedz({
      zrodla: [
        zrodlo({ aktualny: false, dostepny: false }),
        zrodlo({ rodzaj: 'short_circuit_sn', aktualny: false, dostepny: false }),
      ],
    });
    expect(czyBrakWynikow(nieaktualne)).toBe(true);
    const jedenAktualny = odpowiedz({
      zrodla: [zrodlo({ aktualny: false, dostepny: false }), zrodlo({ rodzaj: 'short_circuit_sn' })],
    });
    expect(czyBrakWynikow(jedenAktualny)).toBe(false);
    // Kryterium „z modelu" nie ratuje ekranu: ocena techniczna WYNIKÓW dotyczy obliczeń.
    const tylkoModel = odpowiedz({ zrodla: [zrodlo({ rodzaj: 'model', run_id: null })] });
    expect(czyBrakWynikow(tylkoModel)).toBe(true);
  });

  it('stan przebiegu: NIEAKTUALNY ma pierwszeństwo przed „niedostępny", dostępny = ZAKOŃCZONY i aktualny', () => {
    expect(stanPrzebieguPL(zrodlo({ aktualny: false, dostepny: false }))).toBe(T.przebiegNieaktualny);
    expect(stanPrzebieguPL(zrodlo({ run_id: null, dostepny: false, powod_pl: 'Brak biegu rozpływu.' }))).toBe(
      'Brak biegu rozpływu.',
    );
    expect(stanPrzebieguPL(zrodlo({ run_id: null, dostepny: false }))).toBe(T.przebiegBrak);
    expect(stanPrzebieguPL(zrodlo())).toContain(T.przebiegZakonczony);
    expect(stanPrzebieguPL(zrodlo())).toContain(T.przebiegAktualny);
  });

  it('pakiet wyników wymienia tylko dostępne i aktualne biegi', () => {
    expect(pakietWynikowPL(odpowiedz().zrodla)).toBe(`${T.pakietRozplyw}, ${T.pakietZwarcia}`);
    expect(pakietWynikowPL([zrodlo({ aktualny: false, dostepny: false })])).toBe(T.podstawaPakietBrak);
    expect(zrodloPL('PF')).toBe(T.zrodloRozplyw);
    expect(zrodloPL('short_circuit_sn')).toBe(T.zrodloZwarcie);
    expect(zrodloPL('model')).toBe(T.zrodloModel);
  });
});

describe('ocena całościowa — z liczników backendu, nigdy z porównań w UI', () => {
  it('NIE SPEŁNIA > 0 → decyzja projektowa; BRAK PODSTAW > 0 → nie równa się spełnieniu; inaczej spełnia', () => {
    expect(ocenaCalosciowaPL(odpowiedz({ ocena: { oceniono: 3, spelnia: 2, nie_spelnia: 1, brak_podstaw: 0 } }))).toBe(
      T.ocenaCalosciowaNieSpelnia,
    );
    expect(ocenaCalosciowaPL(odpowiedz({ ocena: { oceniono: 2, spelnia: 2, nie_spelnia: 0, brak_podstaw: 1 } }))).toBe(
      T.ocenaCalosciowaBrakPodstaw,
    );
    expect(ocenaCalosciowaPL(odpowiedz({ werdykt: 'NIESPRAWDZONE', ocena: { oceniono: 0, spelnia: 0, nie_spelnia: 0, brak_podstaw: 0 } }))).toBe(
      T.ocenaCalosciowaBrakPodstaw,
    );
    expect(ocenaCalosciowaPL(odpowiedz())).toBe(T.ocenaCalosciowaSpelnia);
  });
});

describe('formatowanie po polsku — zapis, nie wartość', () => {
  it('fmtLiczba: przecinek dziesiętny, miejsca zależne od rzędu, brak → kreska', () => {
    expect(fmtLiczba(0.941)).toBe('0,941');
    expect(fmtLiczba(12.5)).toBe('12,5');
    expect(fmtLiczba(118.26)).toBe('118,3');
    expect(fmtLiczba(100)).toBe('100');
    expect(fmtLiczba(null)).toBe(T.marginesBrak);
    expect(fmtLiczba(Number.NaN)).toBe(T.marginesBrak);
  });

  it('fmtWartoscZJednostka: jednostka „-" i pusta pomijane', () => {
    expect(fmtWartoscZJednostka(82.4, '%')).toBe('82,4 %');
    expect(fmtWartoscZJednostka(0.95, '-')).toBe('0,95');
    expect(fmtWartoscZJednostka(0.95, '')).toBe('0,95');
    expect(fmtWartoscZJednostka(null, '%')).toBe(T.marginesBrak);
  });

  it('fmtOdniesienie: zapis wg warunku (≤ / ≥ / pasmo / zgodność) z progiem uwagi', () => {
    expect(fmtOdniesienie(element(), pozycja())).toBe(`≤ 100 % (${T.progUwagi}: 90 %)`);
    expect(fmtOdniesienie(element({ odniesienie_ostrzegawcze: null }), pozycja())).toBe('≤ 100 %');
    expect(
      fmtOdniesienie(element({ odniesienie: 1.05, odniesienie_dolne: 0.95, odniesienie_ostrzegawcze: null, jednostka: 'p.u.' }), pozycja({ warunek: 'w_pasmie' })),
    ).toBe('0,95 … 1,05 p.u.');
    // Jednostka elementu ma pierwszeństwo; pusta jednostka elementu → jednostka pozycji.
    expect(
      fmtOdniesienie(element({ odniesienie: 1.05, odniesienie_dolne: null, odniesienie_ostrzegawcze: null, jednostka: '' }), pozycja({ warunek: 'w_pasmie', jednostka: 'p.u.' })),
    ).toBe('≤ 1,05 p.u.');
    expect(fmtOdniesienie(element({ odniesienie: 5, odniesienie_ostrzegawcze: null, jednostka: 'kA' }), pozycja({ warunek: 'nie_mniej_niz' }))).toBe('≥ 5 kA');
    expect(fmtOdniesienie(element({ odniesienie: null }), pozycja({ warunek: 'zgodnosc' }))).toBe(T.odniesienieBrak);
    expect(fmtOdniesienie(element({ odniesienie: 1, jednostka: '-' }), pozycja({ warunek: 'zgodnosc' }))).toBe('1');
  });

  it('fmtMargines: znak (+ w granicy, − poza), jednostka zapasu', () => {
    expect(fmtMargines(element())).toBe('+17,6 pkt proc.');
    expect(fmtMargines(element({ margines: -4.1, margines_jednostka: '%' }))).toBe('−4,1 %');
    expect(fmtMargines(element({ margines: 0, margines_jednostka: '-' }))).toBe('0');
    expect(fmtMargines(element({ margines: null }))).toBe(T.marginesBrak);
  });

  it('podstawa oceny: norma + warunek; bez normy sam warunek', () => {
    expect(podstawaOcenyPL(pozycja())).toBe('Obciążalność katalogowa · $I \\le I_{dd}$');
    expect(podstawaOcenyPL(pozycja({ norma_pl: '' }))).toBe('$I \\le I_{dd}$');
  });

  it('czas wykonania: ISO → „RRRR-MM-DD GG:MM"; brak → kreska', () => {
    expect(czasWykonaniaPL('2026-09-10T08:15:00+00:00')).toBe('2026-09-10 08:15');
    expect(czasWykonaniaPL(null)).toBe(T.marginesBrak);
  });
});

describe('przedmiot oceny i pętla decyzji — semantyka domeny', () => {
  it('nazwa przedmiotu: nazwa elementu, agregat sieci, w ostateczności identyfikator', () => {
    expect(nazwaPrzedmiotu(element())).toBe('Magistrala L-07');
    expect(nazwaPrzedmiotu(element({ element_nazwa: null, element_id: 'network' }))).toBe(T.elementAgregat);
    expect(nazwaPrzedmiotu(element({ element_nazwa: '', element_id: null }))).toBe(T.elementAgregat);
    expect(nazwaPrzedmiotu(element({ element_nazwa: null, element_id: 'L-07' }))).toBe('L-07');
  });

  it('typ elementu interfejsu wynika z semantyki domeny; agregat nie ma celu na schemacie', () => {
    expect(typElementu('szyna')).toBe('Bus');
    expect(typElementu('galaz_liniowa')).toBe('LineBranch');
    expect(typElementu('transformator')).toBe('TransformerBranch');
    expect(typElementu('zrodlo')).toBe('Generator');
    expect(typElementu(null)).toBeNull();
    expect(elementNaSchemacie(element(), pozycja())).toBe(true);
    expect(elementNaSchemacie(element({ element_id: 'network', element_rodzaj: null }), pozycja({ element_rodzaj: null }))).toBe(false);
    // Rodzaj elementu z pozycji ratuje element bez własnego rodzaju — jedno źródło semantyki.
    expect(elementNaSchemacie(element({ element_rodzaj: null }), pozycja())).toBe(true);
  });

  it('typ elementu kryterium (rejestr „Co wymaga uwagi"): element wiodący + semantyka', () => {
    expect(typElementuKryterium(pozycja({ element_rodzaj: 'szyna' }))).toBe('Bus');
    expect(typElementuKryterium(pozycja({ wiodacy_element_id: null }))).toBeNull();
    expect(typElementuKryterium(pozycja({ element_rodzaj: null }))).toBeNull();
  });

  it('rodzaj przekroczenia tylko dla kryteriów z realnym celem akcji (zero fabrykacji celu)', () => {
    expect(rodzajPrzekroczeniaKryterium({ kryterium_id: 'napiecie.odchylenie' })).toBe('napiecie');
    expect(rodzajPrzekroczeniaKryterium({ kryterium_id: 'galaz.obciazenie_dlugotrwale' })).toBe('obciazalnosc-galezi');
    expect(rodzajPrzekroczeniaKryterium({ kryterium_id: 'transformator.obciazenie' })).toBe('obciazalnosc-transformatora');
    expect(rodzajPrzekroczeniaKryterium({ kryterium_id: 'moc_bierna.bilans' })).toBe('bilans-biernej');
    expect(rodzajPrzekroczeniaKryterium({ kryterium_id: 'przewod.wytrzymalosc_zwarciowa' })).toBeUndefined();
  });
});
