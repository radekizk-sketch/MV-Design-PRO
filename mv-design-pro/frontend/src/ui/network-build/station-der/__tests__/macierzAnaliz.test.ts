/**
 * Macierz analiz (E21-2, audyt E-21 pkt P5/P10).
 *
 * Testy pilnują tego, czego nie dawały dwa sformułowania „zakres kompletny / zakres do
 * przeliczenia": rozróżnienia „nie obliczono" od „brakuje danych" od „wynik jest", oraz
 * JEDNEGO konkretnego działania w każdym wierszu. Ślepy zaułek — wiersz bez działania
 * i bez powodu — jest tu błędem.
 */

import { describe, expect, it } from 'vitest';

import { zlozMacierzAnaliz, POWOD_OSI_PL, stanWynikuPl, etykietaDzialaniaPl } from '../macierzAnaliz';
import type { AggregatedReadinessAxis } from '../readiness';
import type { ExecutionRun } from '../../../study-cases/types';

function os(
  axis: AggregatedReadinessAxis['axis'],
  status: AggregatedReadinessAxis['status'],
  blockers: AggregatedReadinessAxis['blockers'] = [],
): AggregatedReadinessAxis {
  return { axis, label_pl: `os ${axis}`, status, blockers };
}

function blokada(code: string): AggregatedReadinessAxis['blockers'][number] {
  return {
    code,
    message_pl: `brak danej ${code}`,
    object_ref: 'DER-1',
    target_screen: 'E-21',
    target_tab: 'inverters',
  };
}

function przebieg(over: Partial<ExecutionRun>): ExecutionRun {
  return {
    id: 'run-1',
    study_case_id: 'case-1',
    analysis_type: 'SC_3F',
    solver_input_hash: 'hash',
    status: 'DONE',
    started_at: '2026-07-27T10:00:00Z',
    finished_at: '2026-07-27T10:01:00Z',
    error_message: null,
    ...over,
  } as ExecutionRun;
}

describe('macierz analiz — trzy różne sytuacje, trzy różne odpowiedzi', () => {
  it('brak danych wejściowych: działaniem jest ICH UZUPEŁNIENIE, nie liczenie', () => {
    // Uruchomienie analizy przy nazwanych brakach skonczyloby sie odrzuceniem przez
    // walidacje — wiec „Uruchom obliczenia" byloby zaproszeniem w slepy zaulek.
    const [wiersz] = zlozMacierzAnaliz(
      [os('sc_3f', 'blocked', [blokada('der.device_catalog.missing')])],
      [],
    );
    expect(wiersz.dzialanie).toBe('uzupelnij_dane');
    expect(wiersz.blokady).toHaveLength(1);
    expect(wiersz.blokady[0].message_pl).toContain('brak danej');
    expect(wiersz.stanWyniku).toBe('brak_przebiegu');
  });

  it('dane są, przebiegu nie było: działaniem jest OBLICZENIE', () => {
    const [wiersz] = zlozMacierzAnaliz([os('sc_3f', 'ready')], []);
    expect(wiersz.dzialanie).toBe('uruchom_analize');
    expect(wiersz.stanWyniku).toBe('brak_przebiegu');
    expect(wiersz.ostatnieLiczenie).toBeNull();
  });

  it('wynik jest: działaniem jest JEGO OTWARCIE, z datą ostatniego liczenia', () => {
    const [wiersz] = zlozMacierzAnaliz(
      [os('sc_3f', 'ready')],
      [przebieg({ finished_at: '2026-07-27T09:00:00Z' }), przebieg({ id: 'run-2', finished_at: '2026-07-27T11:30:00Z' })],
    );
    expect(wiersz.dzialanie).toBe('otworz_wynik');
    expect(wiersz.stanWyniku).toBe('policzony');
    // NAJNOWSZY zakonczony przebieg, nie pierwszy z listy.
    expect(wiersz.ostatnieLiczenie).toBe('2026-07-27T11:30:00Z');
  });

  it('przebieg w toku nie udaje wyniku', () => {
    const [wiersz] = zlozMacierzAnaliz(
      [os('sc_3f', 'ready')],
      [przebieg({ status: 'RUNNING', finished_at: null })],
    );
    expect(wiersz.stanWyniku).toBe('w_toku');
    expect(wiersz.ostatnieLiczenie).toBeNull();
  });

  it('przebieg zakonczony bledem daje BLAD i ponowne obliczenie, nie „wynik dostepny"', () => {
    const [wiersz] = zlozMacierzAnaliz(
      [os('sc_3f', 'ready')],
      [przebieg({ status: 'FAILED', finished_at: null, error_message: 'solver nie zbiegl' })],
    );
    expect(wiersz.stanWyniku).toBe('blad');
    expect(wiersz.dzialanie).toBe('uruchom_analize');
  });

  it('braki danych mają PIERWSZEŃSTWO nad istniejącym wynikiem', () => {
    // Wynik policzony na starych danych nie zwalnia z uzupelnienia braku, ktory
    // regula nazwala — inaczej ekran zachecalby do czytania nieaktualnego wyniku.
    const [wiersz] = zlozMacierzAnaliz(
      [os('protection', 'partial', [blokada('der.ct_class.unresolved')])],
      [przebieg({ analysis_type: 'SC_3F' })],
    );
    expect(wiersz.dzialanie).toBe('uzupelnij_dane');
  });

  it('oś bez osobnego przebiegu jest NAZWANA, a nie pokazana jako „nie obliczono"', () => {
    // Raporty i dowod aparatury nie maja wlasnego biegu solvera — udawanie, ze „nie
    // obliczono", sugerowaloby dzialanie, ktorego nie ma.
    const [wiersz] = zlozMacierzAnaliz([os('report_osd', 'partial')], []);
    expect(wiersz.stanWyniku).toBe('nie_dotyczy');
    expect(stanWynikuPl(wiersz.stanWyniku)).toBe('bez osobnego przebiegu');
  });

  it('każda oś ma powód „po co" — wiersz bez uzasadnienia jest ozdobą', () => {
    for (const [axis, powod] of Object.entries(POWOD_OSI_PL)) {
      expect(powod.trim().length, `os ${axis} bez powodu`).toBeGreaterThan(20);
    }
    expect(Object.keys(POWOD_OSI_PL)).toHaveLength(14);
  });

  it('przebieg innej analizy NIE zalicza się do tej osi', () => {
    // Kontrola odwrotna: bieg zwarciowy nie moze udawac wyniku rozplywu.
    const [wiersz] = zlozMacierzAnaliz(
      [os('vdrop', 'ready')],
      [przebieg({ analysis_type: 'SC_3F' })],
    );
    expect(wiersz.stanWyniku).toBe('brak_przebiegu');
  });

  it('ostatni przebieg niesie ID NAJNOWSZEGO zakończonego biegu, nie pierwszego z listy', () => {
    // Podstawa dzialania `otworz_wynik` (karta W2 pkt 2) — bez ID nawigacja do
    // dowodu nie ma czego otworzyc.
    const [wiersz] = zlozMacierzAnaliz(
      [os('sc_3f', 'ready')],
      [
        przebieg({ id: 'run-stary', finished_at: '2026-07-27T09:00:00Z' }),
        przebieg({ id: 'run-nowy', finished_at: '2026-07-27T11:30:00Z' }),
      ],
    );
    expect(wiersz.ostatniPrzebiegId).toBe('run-nowy');
  });

  it('ostatni przebieg jest null, gdy nic nie liczono', () => {
    const [wiersz] = zlozMacierzAnaliz([os('sc_3f', 'ready')], []);
    expect(wiersz.ostatniPrzebiegId).toBeNull();
  });

  it('rodzaj przebiegu — jeden na oś z mapowaniem, null dla osi bez własnego przebiegu', () => {
    const [scWiersz] = zlozMacierzAnaliz([os('sc_3f', 'ready')], []);
    expect(scWiersz.typPrzebiegu).toBe('SC_3F');
    const [frtWiersz] = zlozMacierzAnaliz([os('frt', 'ready')], []);
    expect(frtWiersz.typPrzebiegu).toBe('DYNAMIC_STABILITY');
    const [protectionWiersz] = zlozMacierzAnaliz([os('protection', 'ready')], []);
    expect(protectionWiersz.typPrzebiegu).toBeNull();
  });

  it('etykieta FRT/HVRT/NC RfG mówi WPROST dokąd prowadzi, reszta zostaje generyczna', () => {
    // Iloczyn cech (KLASA NIE INSTANCJA): {frt,hvrt,nc_rfg,sc_3f,protection} ×
    // {uruchom_analize,uzupelnij_dane,otworz_wynik} — nie tylko przykład z karty.
    const [frt] = zlozMacierzAnaliz([os('frt', 'ready')], []);
    expect(etykietaDzialaniaPl(frt)).toBe('Przejdź do analizy FRT');
    const [hvrt] = zlozMacierzAnaliz([os('hvrt', 'ready')], []);
    expect(etykietaDzialaniaPl(hvrt)).toBe('Przejdź do analizy HVRT');
    const [ncRfg] = zlozMacierzAnaliz([os('nc_rfg', 'ready')], []);
    expect(etykietaDzialaniaPl(ncRfg)).toBe('Przejdź do zgodności NC RfG');

    // Inna oś z tym samym działaniem `uruchom_analize` NIE dostaje etykiety FRT/HVRT/NC RfG.
    const [sc3f] = zlozMacierzAnaliz([os('sc_3f', 'ready')], []);
    expect(etykietaDzialaniaPl(sc3f)).toBe('Uruchom obliczenia');

    // `uzupelnij_dane`/`otworz_wynik` zostają generyczne NAWET dla frt/hvrt/nc_rfg —
    // etykieta „dokąd prowadzi” dotyczy wyłącznie `uruchom_analize`.
    const [frtBlocked] = zlozMacierzAnaliz(
      [os('frt', 'blocked', [blokada('der.dynamic_profile_missing')])],
      [],
    );
    expect(etykietaDzialaniaPl(frtBlocked)).toBe('Uzupełnij brakujące dane');
    const [ncRfgDone] = zlozMacierzAnaliz(
      [os('nc_rfg', 'ready')],
      [przebieg({ analysis_type: 'SOURCE_COMPLIANCE' })],
    );
    expect(etykietaDzialaniaPl(ncRfgDone)).toBe('Otwórz wynik');
  });
});
