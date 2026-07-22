/**
 * Testy karty W-C (ZWARCIA-PRO F4): sekcja „Rozpływ prądu zwarciowego" (pkt 2)
 * + synchronizacja ze schematem „Pokaż na schemacie" (pkt 6) + overlay (pkt 7).
 * Interakcje NATYWNE (klik przycisku/wiersza — Zero-Debt pkt 5); store selekcji
 * i store overlay REALNE (asercje na stanie), nawigacja zamockowana (side
 * effect na window.location poza zakresem jsdom testu).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { EkranZwarc } from '../EkranZwarc';
import { ZWARCIA_STRINGS } from '../strings';
import { kierunekPrzeplywuPL, naWierszeRozplywu, rozplywDlaWiersza } from '../zwarciaModel';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { useSelectionStore } from '../../../../ui/selection';
import { useOverlayStore } from '../../../../ui/sld-overlay/overlayStore';
import {
  rozplywFixture,
  shortCircuitResultsFixture,
  shortCircuitRowFixture,
  wkladyFixture,
} from './fixtures';

const navigateToSldMock = vi.fn();

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

function props(over: Partial<Parameters<typeof EkranZwarc>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    // Wkłady przez props → hook dostawcy wkładów nie pobiera (bez fetch w teście).
    wklady: { 'BUS-GPZ': wkladyFixture() },
    ...over,
  };
}

function ustawWynikZRozplywem() {
  const wynik = shortCircuitResultsFixture();
  wynik.rows[0] = shortCircuitRowFixture({ branch_contributions: rozplywFixture() });
  useResultsInspectorStore.setState({ shortCircuitResults: wynik, selectedRunId: 'sc-run-1' });
}

beforeEach(() => {
  useResultsInspectorStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useSelectionStore.getState().centerSldOnElement(null);
  useOverlayStore.getState().clearOverlay();
  navigateToSldMock.mockClear();
});

describe('zwarciaModel — projekcje rozpływu (czyste)', () => {
  it('kierunekPrzeplywuPL obraca parę węzłów wg tokenu solvera', () => {
    const [doGpz, zSt1] = rozplywFixture();
    expect(kierunekPrzeplywuPL(doGpz)).toBe('Szyna OZE → Szyna GPZ 15 kV'); // to_from
    expect(kierunekPrzeplywuPL(zSt1)).toBe('Szyna ST1 15 kV → Szyna GPZ 15 kV'); // from_to
    expect(kierunekPrzeplywuPL({ ...doGpz, direction: 'nieznany' })).toBe(
      'Szyna GPZ 15 kV – Szyna OZE',
    );
  });

  it('naWierszeRozplywu: nazwa gałęzi, kierunek, prąd (format PL), klucz unikalny', () => {
    const wiersze = naWierszeRozplywu(rozplywFixture());
    expect(wiersze[0].galaz.wartosc).toBe('Kabel OZE');
    expect(wiersze[0].prad.wartosc).toBe('0,245');
    expect(wiersze[0].prad.dowodRef).toBe('BR-KABEL-1');
    expect(wiersze[0].identyfikator.wartosc).toBe('BR-KABEL-1::GEN-PV');
  });

  it('rozplywDlaWiersza: pole addytywne → lista; brak pola → null (starszy wynik)', () => {
    expect(rozplywDlaWiersza(shortCircuitRowFixture())).toEqual([]);
    expect(
      rozplywDlaWiersza(shortCircuitRowFixture({ branch_contributions: undefined })),
    ).toBeNull();
    expect(
      rozplywDlaWiersza(shortCircuitRowFixture({ branch_contributions: null })),
    ).toBeNull();
  });
});

describe('EkranZwarc — sekcja „Rozpływ prądu zwarciowego" (pkt 2)', () => {
  it('wpisy wiersza → tabela gałęzi z kierunkiem i |I| [kA]', () => {
    ustawWynikZRozplywem();
    render(<EkranZwarc {...props()} />);
    const sekcja = screen.getByTestId('mvd-zwarcia-rozplyw');
    // Tytuł sekcji łączy etykietę i nazwę punktu w jednym nagłówku.
    expect(sekcja).toHaveTextContent(ZWARCIA_STRINGS.rozplywTytul);
    const tabela = within(within(sekcja).getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('Kabel OZE')).toBeInTheDocument();
    expect(tabela.getByText('Szyna OZE → Szyna GPZ 15 kV')).toBeInTheDocument();
    expect(tabela.getByText('0,245')).toBeInTheDocument();
    expect(tabela.getByText('0,061')).toBeInTheDocument();
  });

  it('pusta lista (policzono, brak falowników) → uczciwy komunikat o kontrakcie', () => {
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture(),
      selectedRunId: 'sc-run-1',
    });
    render(<EkranZwarc {...props()} />);
    const sekcja = screen.getByTestId('mvd-zwarcia-rozplyw');
    expect(within(sekcja).getByTestId('mvd-zwarcia-rozplyw-pusty')).toBeInTheDocument();
    expect(
      within(sekcja).getByText(ZWARCIA_STRINGS.rozplywBrakWkladow),
    ).toBeInTheDocument();
  });

  it('starszy wynik bez pola (null) → stan „niedostępny w tym przebiegu"', () => {
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture(),
      selectedRunId: 'sc-run-1',
    });
    render(<EkranZwarc {...props()} />);
    // Natywny klik wiersza BUS-ST2 (starszy wynik: branch_contributions null).
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[2]);
    const sekcja = screen.getByTestId('mvd-zwarcia-rozplyw');
    expect(within(sekcja).getByTestId('mvd-zwarcia-rozplyw-brak')).toBeInTheDocument();
    expect(
      within(sekcja).getByText(ZWARCIA_STRINGS.rozplywNiedostepny),
    ).toBeInTheDocument();
  });

  it('kolumny eksperckie (źródło, identyfikator gałęzi) tylko w trybie eksperckim', () => {
    ustawWynikZRozplywem();
    const { unmount } = render(<EkranZwarc {...props({ trybZaawansowania: 'expert' })} />);
    const sekcja = within(screen.getByTestId('mvd-zwarcia-rozplyw'));
    expect(sekcja.getByTestId('mvd-wyn-th-zrodlo')).toBeInTheDocument();
    // Oba wpisy fixture niosą to samo źródło — kolumna ekspercka widoczna per wiersz.
    expect(sekcja.getAllByText('GEN-PV')).toHaveLength(2);
    unmount();
    ustawWynikZRozplywem();
    render(<EkranZwarc {...props({ trybZaawansowania: 'basic' })} />);
    const sekcjaBasic = within(screen.getByTestId('mvd-zwarcia-rozplyw'));
    expect(sekcjaBasic.queryByTestId('mvd-wyn-th-zrodlo')).not.toBeInTheDocument();
  });
});

describe('EkranZwarc — „Pokaż na schemacie" (pkt 6) + overlay rozpływu (pkt 7)', () => {
  it('natywny klik → selekcja elementu, centrowanie SLD, overlay, nawigacja', () => {
    ustawWynikZRozplywem();
    render(<EkranZwarc {...props()} />);
    fireEvent.click(screen.getByTestId('mvd-zwarcia-pokaz-sld'));

    // Selekcja we wspólnym store (wzorzec V12K-073): element_id wiersza.
    const selekcja = useSelectionStore.getState();
    expect(selekcja.selectedElement).toMatchObject({
      id: 'EL-GPZ',
      type: 'Bus',
      name: 'Szyna GPZ 15 kV',
    });
    expect(selekcja.sldCenterOnElement).toBe('EL-GPZ');

    // Overlay rozpływu w produkcyjnym store: znacznik punktu + gałęzie wiersza.
    const overlay = useOverlayStore.getState().overlay;
    expect(overlay?.run_id).toBe('sc-run-1');
    expect(overlay?.analysis_type).toBe('SC_3F');
    expect(overlay?.elements.map((el) => el.element_ref)).toEqual([
      'EL-GPZ',
      'BR-KABEL-1',
      'BR-LINIA-2',
    ]);

    expect(navigateToSldMock).toHaveBeenCalledTimes(1);
  });

  it('klik innego punktu przełącza akcję na jego element (wiersz → schemat)', () => {
    ustawWynikZRozplywem();
    render(<EkranZwarc {...props()} />);
    fireEvent.click(screen.getAllByTestId('mvd-wyn-wiersz')[1]); // BUS-ST1
    fireEvent.click(screen.getByTestId('mvd-zwarcia-pokaz-sld'));
    expect(useSelectionStore.getState().selectedElement?.id).toBe('EL-ST1');
    // BUS-ST1: rozpływ pusty → overlay z samym znacznikiem punktu zwarcia.
    expect(useOverlayStore.getState().overlay?.elements.map((el) => el.element_ref)).toEqual([
      'EL-ST1',
    ]);
  });
});
