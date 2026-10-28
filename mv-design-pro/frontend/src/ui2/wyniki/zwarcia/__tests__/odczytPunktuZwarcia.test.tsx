/**
 * Iloczyn cech: stan ODCZYTU punktu zwarcia {wczytywanie, blad, gotowe-bez-danych,
 * gotowe-z-danymi} × sekcja per punkt {rozpływ gałęziowy, ślad podziału prądu,
 * wkłady źródeł}. Reguła (KONTRAKT_WERDYKTU_WYJASNIALNEGO): odczyt w toku ≠ brak
 * danych, błąd odczytu ≠ brak danych — żadna sekcja nie mówi „niedostępne w tym
 * przebiegu", dopóki zapytanie trwa albo się nie powiodło.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import type { OdczytPunktuZwarcia } from '../api';
import { RozplywZwarciowy } from '../RozplywZwarciowy';
import { SladPodzialuPradu } from '../SladPodzialuPradu';
import { WkladyZwarciowe } from '../WkladyZwarciowe';
import { branchFlowTraceFixture, rozplywFixture, wkladyFixture } from './fixtures';

type Dane = 'brak' | 'sa';

/** Fixture śladu przez round-trip JSON — ta sama droga co realne dane (`response.json()`
 *  zwraca kształt nieopakowany), wzorzec z `sladPodzialuPradu.test.tsx`, bez rzutowań. */
function realnyTrace() {
  return JSON.parse(JSON.stringify(branchFlowTraceFixture()));
}

interface Sekcja {
  readonly nazwa: string;
  readonly testid: string;
  readonly prefiks: string;
  /** testid stanu „brak danych" (starszy wynik / brak migawki). */
  readonly brak: string;
  readonly renderuj: (odczyt: OdczytPunktuZwarcia, dane: Dane) => void;
}

const SEKCJE: readonly Sekcja[] = [
  {
    nazwa: 'rozpływ gałęziowy',
    testid: 'mvd-zwarcia-rozplyw',
    prefiks: 'mvd-zwarcia-rozplyw',
    brak: 'mvd-zwarcia-rozplyw-brak',
    renderuj: (odczyt, dane) =>
      render(
        <RozplywZwarciowy
          punktNazwa="Szyna GPZ"
          flows={dane === 'sa' ? rozplywFixture() : null}
          pominiete={null}
          progA={null}
          odczyt={odczyt}
          szczegolyAudytowe={false}
          onOtworzDowod={vi.fn()}
        />,
      ),
  },
  {
    nazwa: 'ślad podziału prądu',
    testid: 'mvd-zwarcia-slad-rozplywu',
    prefiks: 'mvd-zwarcia-slad-rozplywu',
    brak: 'mvd-zwarcia-slad-rozplywu-brak',
    renderuj: (odczyt, dane) =>
      render(
        <SladPodzialuPradu
          punktNazwa="Szyna GPZ"
          trace={dane === 'sa' ? realnyTrace() : null}
          odczyt={odczyt}
          szczegolyAudytowe={false}
        />,
      ),
  },
  {
    nazwa: 'wkłady źródeł',
    testid: 'mvd-zwarcia-wklady',
    prefiks: 'mvd-zwarcia-wklady',
    brak: 'mvd-zwarcia-wklady-brak',
    renderuj: (odczyt, dane) =>
      render(
        <WkladyZwarciowe
          punktNazwa="Szyna GPZ"
          wklady={dane === 'sa' ? wkladyFixture() : null}
          odczyt={odczyt}
          szczegolyAudytowe={false}
          onOtworzDowod={vi.fn()}
        />,
      ),
  },
];

const PRZYPADKI = SEKCJE.flatMap((sekcja) =>
  (['wczytywanie', 'blad'] as const).flatMap((odczyt) =>
    (['brak', 'sa'] as const).map((dane) => ({ sekcja, odczyt, dane })),
  ),
);

describe('sekcje punktu zwarcia — stan odczytu rozstrzyga przed danymi', () => {
  it.each(PRZYPADKI)(
    '$sekcja.nazwa × odczyt $odczyt × dane $dane → stan odczytu, nie „brak danych"',
    ({ sekcja, odczyt, dane }) => {
      sekcja.renderuj(odczyt, dane);
      const korzen = screen.getByTestId(sekcja.testid);
      const oczekiwany = within(korzen).getByTestId(`${sekcja.prefiks}-${odczyt}`);
      if (odczyt === 'wczytywanie') expect(oczekiwany).toHaveAttribute('aria-busy', 'true');
      else expect(oczekiwany).toHaveAttribute('role', 'alert');
      const przeciwny = odczyt === 'wczytywanie' ? 'blad' : 'wczytywanie';
      expect(within(korzen).queryByTestId(`${sekcja.prefiks}-${przeciwny}`)).not.toBeInTheDocument();
      expect(within(korzen).queryByTestId(sekcja.brak)).not.toBeInTheDocument();
      expect(within(korzen).queryByTestId('mvd-wyn-tabela')).not.toBeInTheDocument();
    },
  );

  it.each(SEKCJE)('$nazwa × odczyt gotowe × brak danych → stan „brak danych" (uczciwy brak)', (sekcja) => {
    sekcja.renderuj('gotowe', 'brak');
    const korzen = screen.getByTestId(sekcja.testid);
    expect(within(korzen).getByTestId(sekcja.brak)).toBeInTheDocument();
    expect(within(korzen).queryByTestId(`${sekcja.prefiks}-wczytywanie`)).not.toBeInTheDocument();
    expect(within(korzen).queryByTestId(`${sekcja.prefiks}-blad`)).not.toBeInTheDocument();
  });

  it.each(SEKCJE)('$nazwa × odczyt gotowe × dane → treść sekcji, bez stanów odczytu', (sekcja) => {
    sekcja.renderuj('gotowe', 'sa');
    const korzen = screen.getByTestId(sekcja.testid);
    expect(within(korzen).queryByTestId(sekcja.brak)).not.toBeInTheDocument();
    expect(within(korzen).queryByTestId(`${sekcja.prefiks}-wczytywanie`)).not.toBeInTheDocument();
    expect(within(korzen).queryByTestId(`${sekcja.prefiks}-blad`)).not.toBeInTheDocument();
  });
});
