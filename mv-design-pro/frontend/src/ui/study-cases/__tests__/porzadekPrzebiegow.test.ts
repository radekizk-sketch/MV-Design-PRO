/**
 * Najnowszy przebieg — JEDNO źródło porządku dla wszystkich selektorów ekranów.
 *
 * Defekt (karta DANE-PRZYJETE-EKRANY, znalezisko przy zrzutach): backend zwraca listę
 * przebiegów `created_at DESC, id DESC`, a sześć selektorów brało „ostatni z listy", czyli
 * NAJSTARSZY bieg. Po ponownym policzeniu ekran jakości pokazywał dane przyjęte starego biegu.
 *
 * Iloczyn cech: kolejność listy (jak z API — od najnowszego × rosnąco × pomieszana) ×
 * aktywny przebieg (brak × aktywny pasującego rodzaju × aktywny INNEGO rodzaju) × remis czasu
 * (rozstrzyga identyfikator) × brak czasu utworzenia (zapis sprzed koperty) × KAŻDY selektor
 * ekranu, który wybiera przebieg domyślny.
 */
import { describe, expect, it } from 'vitest';

import type { ExecutionRun } from '../types';
import {
  aktywnyLubNajnowszy,
  najnowszyPrzebieg,
  porownajOdNajnowszego,
  przebiegiOdNajnowszego,
} from '../porzadekPrzebiegow';
import { przebiegRozplywu, przebiegZwarciowy } from '../../../ui2/wyniki/jakosc/jakoscModel';
import { kandydaciRozplywuOdNajnowszego } from '../../../ui2/wyniki/jakosc/porownanieMetodModel';
import { przebiegRozplywuEstymacji } from '../../../ui2/wyniki/estymacja/model';
import { wybierzPrzebiegRozplywu as zbieznoscRozplyw } from '../../../ui2/wyniki/zbieznosc/zbieznoscModel';
import {
  domyslnyPrzebieg,
  przebiegiRozplywu,
  przebiegiZwarciowe,
} from '../../../ui2/oze/wniosek/model';
import {
  wybierzPrzebiegRozplywu as pulpitRozplyw,
  wybierzPrzebiegZwarciowy as pulpitZwarcie,
} from '../../../ui2/oze/pulpit/pulpitModel';
import { wybierzPrzebiegRozplywu as zdolnoscRozplyw } from '../../../ui2/oze/zdolnosc/zdolnoscModel';
import { ostatniZakonczonyPrzebieg as ostatniPowloki } from '../../../ui2/shell/shellStatus';
import { ostatniZakonczonyPrzebieg as ostatniDokumentacji } from '../../../ui2/spaces/dokumentacja/model';
import { przebiegiDoRaportu } from '../../../ui2/spaces/dokumentacja/generator/model';
import { najnowszyBieg } from '../../../ui2/spaces/obliczenia/diagnoza/adapters/diagnozaAdapter';

function bieg(
  id: string,
  analysis_type: ExecutionRun['analysis_type'],
  created_at: string | null,
  status: ExecutionRun['status'] = 'DONE',
): ExecutionRun {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type,
    solver_input_hash: `h-${id}`,
    status,
    started_at: created_at,
    finished_at: status === 'DONE' ? created_at : null,
    error_message: null,
    created_at,
  };
}

// Dwa rozpływy, dwa zwarcia; najnowszy rozpływ = pf-nowy, najnowsze zwarcie = sc-nowy.
const PF_STARY = bieg('pf-stary', 'LOAD_FLOW', '2026-10-23T04:14:56.003001+00:00');
const SC_STARY = bieg('sc-stary', 'SC_3F', '2026-10-23T04:14:48.510830+00:00');
const PF_NOWY = bieg('pf-nowy', 'LOAD_FLOW', '2026-10-23T06:22:05.422397+00:00');
const SC_NOWY = bieg('sc-nowy', 'SC_3F', '2026-10-23T06:21:56.302337+00:00');

/** Kolejność odpowiedzi API (`created_at DESC, id DESC`) — przypadek, który był błędny. */
const Z_API = [PF_NOWY, SC_NOWY, PF_STARY, SC_STARY];
const KOLEJNOSCI: ReadonlyArray<[string, ExecutionRun[]]> = [
  ['jak z API (od najnowszego)', Z_API],
  ['rosnąco', [...Z_API].reverse()],
  ['pomieszana', [SC_NOWY, PF_STARY, PF_NOWY, SC_STARY]],
];

type Selektor = (runs: readonly ExecutionRun[], aktywny: string | null) => string | null;

const SELEKTORY_ROZPLYWU: ReadonlyArray<[string, Selektor]> = [
  ['jakość: walidacja energetyczna', (r, a) => przebiegRozplywu(r, a)?.id ?? null],
  ['estymacja stanu', (r, a) => przebiegRozplywuEstymacji(r, a)?.id ?? null],
  ['zbieżność rozpływu', (r, a) => zbieznoscRozplyw(r, a)?.id ?? null],
  ['wniosek OSD', (r, a) => domyslnyPrzebieg(przebiegiRozplywu(r), a)],
  ['pulpit OZE: adekwatność Q', (r, a) => pulpitRozplyw(r, a)],
  ['zdolność przyłączeniowa', (r, a) => zdolnoscRozplyw(r, a)],
  ['porównanie metod (pierwszy kandydat)', (r) => kandydaciRozplywuOdNajnowszego(r)[0]?.id ?? null],
];

const SELEKTORY_ZWARCIA: ReadonlyArray<[string, Selektor]> = [
  ['jakość: wiarygodność zwarciowa', (r, a) => przebiegZwarciowy(r, a)?.id ?? null],
  ['wniosek OSD', (r, a) => domyslnyPrzebieg(przebiegiZwarciowe(r), a)],
  ['pulpit OZE: siła sieci', (r, a) => pulpitZwarcie(r, a)],
];

describe('selektory przebiegu domyślnego wybierają NAJNOWSZY bieg niezależnie od kolejności listy', () => {
  for (const [kolejnosc, runs] of KOLEJNOSCI) {
    for (const [nazwa, wybierz] of SELEKTORY_ROZPLYWU) {
      it(`${nazwa} — lista ${kolejnosc}`, () => {
        expect(wybierz(runs, null)).toBe('pf-nowy');
        // Aktywny przebieg INNEGO rodzaju nie zmienia wyboru rodzaju tego ekranu.
        expect(wybierz(runs, 'sc-nowy')).toBe('pf-nowy');
        // Aktywny przebieg tego rodzaju wygrywa, także gdy jest starszy.
        if (!nazwa.startsWith('porównanie')) expect(wybierz(runs, 'pf-stary')).toBe('pf-stary');
      });
    }
    for (const [nazwa, wybierz] of SELEKTORY_ZWARCIA) {
      it(`${nazwa} — lista ${kolejnosc}`, () => {
        expect(wybierz(runs, null)).toBe('sc-nowy');
        expect(wybierz(runs, 'pf-nowy')).toBe('sc-nowy');
        expect(wybierz(runs, 'sc-stary')).toBe('sc-stary');
      });
    }
    it(`pasek stanu, dokumentacja, generator raportu, diagnoza — lista ${kolejnosc}`, () => {
      expect(ostatniPowloki(runs)?.id).toBe('pf-nowy');
      expect(ostatniDokumentacji(runs)?.id).toBe('pf-nowy');
      expect(przebiegiDoRaportu(runs).map((r) => r.id)).toEqual([
        'pf-nowy',
        'sc-nowy',
        'pf-stary',
        'sc-stary',
      ]);
      expect(najnowszyBieg(runs)).toBe('pf-nowy');
    });
  }
});

describe('porządek przebiegów — przypadki brzegowe', () => {
  it('bieg w kolejce (bez zakończenia) jest najnowszy po czasie utworzenia — diagnoza', () => {
    const wKolejce = bieg('pf-kolejka', 'LOAD_FLOW', '2026-10-23T07:00:00+00:00', 'PENDING');
    expect(najnowszyBieg([...Z_API, wKolejce])).toBe('pf-kolejka');
    // Selektory wyników biorą wyłącznie zakończone.
    expect(przebiegRozplywu([...Z_API, wKolejce], null)?.id).toBe('pf-nowy');
  });

  it('remis czasu rozstrzyga identyfikator malejąco (jak repozytorium `id DESC`)', () => {
    const a = bieg('a', 'LOAD_FLOW', '2026-10-23T06:00:00+00:00');
    const b = bieg('b', 'LOAD_FLOW', '2026-10-23T06:00:00+00:00');
    expect(najnowszyPrzebieg([a, b])?.id).toBe('b');
    expect(najnowszyPrzebieg([b, a])?.id).toBe('b');
    expect(przebiegiOdNajnowszego([a, b]).map((r) => r.id)).toEqual(['b', 'a']);
    expect(porownajOdNajnowszego(a, a)).toBe(0);
  });

  it('przebieg bez czasu utworzenia porządkuje czas zakończenia', () => {
    const stary = { ...bieg('x', 'LOAD_FLOW', null), finished_at: '2026-10-01T00:00:00+00:00' };
    const nowy = { ...bieg('y', 'LOAD_FLOW', null), finished_at: '2026-10-02T00:00:00+00:00' };
    expect(najnowszyPrzebieg([nowy, stary])?.id).toBe('y');
    expect(najnowszyPrzebieg([stary, nowy])?.id).toBe('y');
  });

  it('pusta lista i brak kandydatów → null', () => {
    expect(najnowszyPrzebieg([])).toBeNull();
    expect(aktywnyLubNajnowszy([], 'cokolwiek')).toBeNull();
    expect(przebiegRozplywu([SC_NOWY], null)).toBeNull();
    expect(najnowszyBieg([])).toBeNull();
  });

  it('wynik nie zależy od kolejności — każda permutacja daje ten sam porządek', () => {
    const zbior = [PF_STARY, SC_STARY, PF_NOWY, SC_NOWY];
    const wzorzec = przebiegiOdNajnowszego(zbior).map((r) => r.id);
    const permutacje = (xs: ExecutionRun[]): ExecutionRun[][] =>
      xs.length <= 1
        ? [xs]
        : xs.flatMap((x, i) => permutacje([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
    for (const p of permutacje(zbior)) {
      expect(przebiegiOdNajnowszego(p).map((r) => r.id)).toEqual(wzorzec);
    }
  });
});
