/**
 * Karta „Strona nN” — rozdzielnice (sekcje) nN i odbiory domeny nN stacji.
 *
 * Iloczyn cech: stan pobrania projekcji nN (brak przypadku, ładowanie, błąd, brak domeny,
 * gotowe) × zawartość (puste listy, sekcje i odbiory). Pusta lista przy stanie innym niż
 * „gotowe” NIE może udawać rozdzielnicy bez odpływów — dawniej karta zawsze dostawała puste
 * listy bazowe i mówiła „Rozdzielnice nN (0)”, choć model miał domenę nN.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StationConfigNnSwitchgearCard, type NnSwitchgearRow } from '../StationConfigNnSwitchgearCard';
import type { LoadRow } from '../StationConfigLoadsCard';
import type { StanDanychNn } from '../../stronaNnStacji';

const ODBIOR: LoadRow = {
  loadId: 'load_001',
  name: 'Hala produkcyjna A',
  attachmentPointPl: 'Szyna nN A',
  pMw: 0.25,
  qMvar: 0.08,
};

const SEKCJA: NnSwitchgearRow = {
  sectionId: 'sek-1',
  designation: 'Szyna nN A',
  nnVoltageKv: 0.4,
  tier: 'main',
  incomersCount: 1,
  couplersCount: 1,
  feedersCount: 5,
  loadFeedersCount: 3,
  derFeedersCount: 1,
  subBoardFeedersCount: 1,
};

const STANY_BEZ_DANYCH: readonly [StanDanychNn, RegExp][] = [
  [{ stan: 'brak_przypadku' }, /Brak aktywnego przypadku/],
  [{ stan: 'ladowanie' }, /Wczytywanie domeny nN/],
  [{ stan: 'blad', komunikatPl: 'Nie udało się pobrać domeny nN (HTTP 500).' }, /HTTP 500/],
  [{ stan: 'brak_domeny', komunikatPl: 'Stacja nie ma szyny nN.' }, /Stacja nie ma szyny nN/],
];

describe('StationConfigNnSwitchgearCard — Strona nN', () => {
  it.each(STANY_BEZ_DANYCH)(
    'stan %j: komunikat stanu w obu sekcjach zamiast pustej atrapy',
    (stanDanych, wzorzec) => {
      render(<StationConfigNnSwitchgearCard switchgears={[]} loads={[]} stanDanych={stanDanych} />);
      expect(screen.getByTestId('station-config-nn-switchgear')).toHaveAttribute('data-stan', stanDanych.stan);
      expect(screen.getByTestId('nn-switchgear-stan').textContent).toMatch(wzorzec);
      expect(screen.getByTestId('station-config-nn-loads-section').textContent).toMatch(wzorzec);
    },
  );

  it('gotowe i puste: uczciwy brak szyn nN oraz brak odbiorów, bez fałszywych zer', () => {
    render(<StationConfigNnSwitchgearCard switchgears={[]} loads={[]} stanDanych={{ stan: 'gotowe' }} />);
    const karta = screen.getByTestId('station-config-nn-switchgear');
    expect(karta.textContent).toContain('Stacja nie ma szyn nN');
    expect(karta.textContent).toContain('Domena nN tej stacji nie ma odbiorów');
    expect(karta.textContent).not.toContain('0.000');
    expect(screen.queryByTestId('nn-switchgear-stan')).toBeNull();
  });

  it('gotowe: sekcja z liczbami odpływów wg rodzaju z backendu i odbiory z P/Q', () => {
    render(
      <StationConfigNnSwitchgearCard
        switchgears={[SEKCJA, { ...SEKCJA, sectionId: 'sek-2', designation: 'Podrozdzielnica', tier: 'sub', nnVoltageKv: null }]}
        loads={[ODBIOR]}
        stanDanych={{ stan: 'gotowe' }}
      />,
    );
    const glowna = screen.getByTestId('nn-switchgear-sek-1');
    expect(glowna).toHaveTextContent('rozdzielnica główna');
    expect(glowna).toHaveTextContent('0.4 kV');
    expect(glowna).toHaveTextContent('Odpływy: 5');
    expect(glowna).toHaveTextContent('z odbiorami: 3');
    expect(glowna).toHaveTextContent('ze źródłami: 1');
    expect(glowna).toHaveTextContent('do podrozdzielnic: 1');
    const pod = screen.getByTestId('nn-switchgear-sek-2');
    expect(pod).toHaveTextContent('podrozdzielnica');
    expect(pod).toHaveTextContent('napięcie nieustalone');
    const wiersz = screen.getByTestId('load-row-load_001');
    expect(wiersz).toHaveTextContent('Hala produkcyjna A');
    expect(wiersz).toHaveTextContent('Szyna nN A');
    expect(wiersz).toHaveTextContent('0.250');
    expect(wiersz).toHaveTextContent('0.080');
  });
});
