/**
 * Wynik inżynierski testu w szczególe werdyktu macierzy NC RfG (karta AB-1a D2).
 *
 * Dane = REALNA odpowiedź biegu NC RfG (fixtura harnessu z generatora backendu
 * `eksport_fixtur_harnessu.py`, adapter `wynik_inzynierski.z_testu_ncrfg`) — bez
 * ręcznie pisanych kształtów. Komórka budowana tą samą ścieżką co ekran
 * (`zbudujModuly` → `mapujMacierz`).
 *
 * ILOCZYN CECH: stan dowodowy testu × prezentacja —
 * {test bez treści (T10): wartość z kroku śladu + nazwany stan} ×
 * {brak symulacji (T14): BEZ wartości, z punktem krytycznym} ×
 * {test niewymagany z werdyktem solvera (T19): „nie dotyczy" + werdykt poza wymaganiem} ×
 * {podstawa: zawsze z odznaką „źródło niezweryfikowane"} ×
 * {bieg bez wyniku inżynierskiego: sekcja nieobecna}.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import scena from '../../../../harness-fixtures/generated/ncrfg_zgodnosc_przekrojowa_scena_macierz.json';
import type { NcRfgRunResult } from '../../../../ui/ncrfg-tests/api';
import { SzczegolWerdyktu } from '../SzczegolWerdyktu';
import { mapujMacierz, zbudujModuly, type KomorkaMacierzy } from '../macierzModel';
import { MACIERZ_STRINGS } from '../strings';
import { derFixture, wynikFixture } from './fixtures';

const BIEG = (scena as unknown as { bieg: NcRfgRunResult }).bieg;
const PV = 'pv/a14bb0e6a533796dc251500f1b5fe5fa/converter';

function komorka(testId: string, bieg: NcRfgRunResult = BIEG, derRef: string = PV): KomorkaMacierzy {
  const moduly = zbudujModuly([derFixture({ id: derRef, name: 'Instalacja PV 1,9 MW' })]);
  const wiersze = mapujMacierz(null, bieg, moduly);
  return wiersze.find((w) => w.test.test_id === testId)!.komorki[0];
}

function renderKomorka(k: KomorkaMacierzy) {
  render(<SzczegolWerdyktu komorka={k} nazwaModulu="Instalacja PV 1,9 MW" slad={[]} />);
  return screen.getByTestId('mvd-oze-szczegol-wynik-inzynierski');
}

describe('SzczegolWerdyktu — wynik inżynierski testu', () => {
  it('test bez treści (T10): „brak podstaw", NAZWANY stan dowodowy i wartość z kroku śladu', () => {
    const k = komorka('T10');
    // Solver mówi „spełnia" — wynik inżynierski tego nie powtarza.
    expect(k.wynik?.verdict).toBe('pass');
    const blok = renderKomorka(k);
    expect(within(blok).getByTestId('mvd-oze-szczegol-wi-wynik')).toHaveTextContent('BRAK PODSTAW DO OCENY');
    expect(within(blok).getByTestId('mvd-oze-szczegol-wi-stan')).toHaveTextContent('Test bez treści');
    expect(within(blok).getByTestId('mvd-oze-szczegol-wi-wartosc')).toHaveTextContent('1935');
    expect(within(blok).getByTestId('mvd-oze-szczegol-wi-wartosc')).toHaveTextContent('kW');
    expect(within(blok).getByTestId('mvd-oze-szczegol-wi-wniosek')).toHaveTextContent(
      'Brak podstaw do oceny spełnienia wymagania testu T10',
    );
  });

  it('brak symulacji (T14): bez wartości i zapasu, z punktem krytycznym obwiedni', () => {
    const blok = renderKomorka(komorka('T14'));
    expect(within(blok).getByTestId('mvd-oze-szczegol-wi-stan')).toHaveTextContent('Brak symulacji');
    // „Nigdy wartość zastępcza": zapas zerowy z przypisanej krzywej NIE jest pokazany.
    expect(within(blok).getByTestId('mvd-oze-szczegol-wi-wartosc')).toHaveTextContent('—');
    expect(within(blok).getByTestId('mvd-oze-szczegol-wi-margines')).toHaveTextContent('—');
    expect(within(blok).getByTestId('mvd-oze-szczegol-wi-szczegoly-punkt')).toBeVisible();
  });

  it('test niewymagany z werdyktem solvera (T19): „nie dotyczy", werdykt nazwany jako poza wymaganiem', () => {
    const k = komorka('T19');
    expect(k.wynik?.required).toBe(false);
    const blok = renderKomorka(k);
    const nieDotyczy = within(blok).getByTestId('mvd-oze-szczegol-wi-nie-dotyczy');
    expect(nieDotyczy).toHaveTextContent(MACIERZ_STRINGS.nieDotyczy);
    expect(nieDotyczy).toHaveTextContent('poza wymaganiem');
    expect(within(blok).queryByTestId('mvd-oze-szczegol-wi-wynik')).not.toBeInTheDocument();
  });

  it.each(['T10', 'T12', 'T14', 'T19'])(
    'podstawa testu %s zawsze z odznaką „źródło niezweryfikowane"',
    (testId) => {
      const blok = renderKomorka(komorka(testId));
      expect(within(blok).getByTestId('mvd-oze-szczegol-wi-podstawa')).toHaveTextContent(
        'PTPiREE Procedura testowania v3.0',
      );
      const odznaka = within(blok).getByTestId('mvd-oze-szczegol-wi-podstawa-zrodlo');
      expect(odznaka).toBeVisible();
      expect(odznaka).toHaveTextContent('źródło niezweryfikowane');
    },
  );

  it('bieg bez wyniku inżynierskiego → sekcja nieobecna (bez udawania)', () => {
    const k = komorka('FRT_LVRT', wynikFixture(), 'bess-1');
    expect(k.wynikInzynierski).toBeNull();
    render(<SzczegolWerdyktu komorka={k} nazwaModulu="Magazyn energii 1" slad={[]} />);
    expect(screen.queryByTestId('mvd-oze-szczegol-wynik-inzynierski')).not.toBeInTheDocument();
  });
});
