/**
 * Testy sekcji „Źródła sieciowe (Z_Q)" (CV-4.3 K6/K7, karta K7-FE) —
 * ślad WHITE BOX wyprowadzenia impedancji zastępczej + założenia biegu
 * (raw_result.zalozenia) w sekcji ZAŁOŻENIA istniejącego wzorca (SekcjaZalozen
 * — PODŁĄCZONE, nie zduplikowane). Interakcje przez render pełnego ekranu
 * (EkranZwarc), zgodnie z wzorcem `rozplywZwarciowy.test.tsx`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { EkranZwarc } from '../EkranZwarc';
import { ZWARCIA_STRINGS, trybZrodlaSiecowegoPL } from '../strings';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import {
  shortCircuitResultsFixture,
  wkladyFixture,
  zalozenieBieguFixture,
  zrodloSiecioweSladMaxFixture,
  zrodloSiecioweSladMinBrakDanychFixture,
  zrodloSiecioweSladMinZDanymiFixture,
} from './fixtures';

function props() {
  return {
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    wklady: { 'BUS-GPZ': wkladyFixture() },
  };
}

beforeEach(() => {
  useResultsInspectorStore.getState().reset();
});

describe('EkranZwarc — sekcja „Źródła sieciowe (Z_Q)" (CV-4.3 K6/K7)', () => {
  it('ślad obecny (MAX + MIN z danymi) → tabela z wierszem na scenariusz', () => {
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture({
        zrodla_sieciowe: [zrodloSiecioweSladMaxFixture(), zrodloSiecioweSladMinZDanymiFixture()],
      }),
      selectedRunId: 'sc-run-1',
    });
    render(<EkranZwarc {...props()} />);

    const sekcja = screen.getByTestId('mvd-zwarcia-zrodla');
    expect(within(sekcja).getByText(ZWARCIA_STRINGS.zrodlaTytul)).toBeInTheDocument();
    const tabela = within(within(sekcja).getByTestId('mvd-wyn-tabela'));
    expect(tabela.getAllByText('s1')).toHaveLength(2); // MAX + MIN, sam ref_id
    expect(tabela.getByText('MAX')).toBeInTheDocument();
    expect(tabela.getByText('MIN')).toBeInTheDocument();
    expect(tabela.getByText(trybZrodlaSiecowegoPL('MOC_ZWARCIOWA'))).toBeInTheDocument();
    expect(tabela.getByText(trybZrodlaSiecowegoPL('MOC_ZWARCIOWA_MIN'))).toBeInTheDocument();
  });

  it('brak śladu (starszy wynik / bez źródła sieciowego) → uczciwy komunikat, zero fabrykacji', () => {
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture(),
      selectedRunId: 'sc-run-1',
    });
    render(<EkranZwarc {...props()} />);

    const sekcja = screen.getByTestId('mvd-zwarcia-zrodla');
    expect(within(sekcja).getByTestId('mvd-zwarcia-zrodla-brak')).toBeInTheDocument();
    expect(within(sekcja).getByText(ZWARCIA_STRINGS.zrodlaNiedostepne)).toBeInTheDocument();
  });

  it('MIN bez własnych danych (Z_Q z MAX): tryb w tabeli nazywa brak danych, ORAZ sekcja ZAŁOŻENIA niesie wiersz z tego samego źródła (PODŁĄCZONE, nie zduplikowane)', () => {
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture({
        zrodla_sieciowe: [zrodloSiecioweSladMinBrakDanychFixture()],
        zalozenia: [zalozenieBieguFixture()],
      }),
      selectedRunId: 'sc-run-1',
    });
    render(<EkranZwarc {...props()} />);

    // 1. Ślad Z_Q: tryb nazywa wprost "dane MAX — brak własnych danych MIN".
    const sekcjaZrodel = screen.getByTestId('mvd-zwarcia-zrodla');
    expect(
      within(sekcjaZrodel).getByText(trybZrodlaSiecowegoPL('MOC_ZWARCIOWA_MAX_JAKO_MIN')),
    ).toBeInTheDocument();

    // 2. Założenia: WSPÓLNA sekcja SekcjaZalozen (wzorzec) niesie wiersz źródła
    // — mvd-wyn-zalozenia to TA SAMA sekcja, która pokazuje metodę/c/tk.
    const sekcjaZalozen = screen.getByTestId('mvd-wyn-zalozenia');
    expect(within(sekcjaZalozen).getByText(ZWARCIA_STRINGS.zalozenieEtykieta('s1'))).toBeInTheDocument();
    expect(within(sekcjaZalozen).getByText(zalozenieBieguFixture().message_pl)).toBeInTheDocument();
  });
});
