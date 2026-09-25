import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TabelaSzyn } from '../TabelaSzyn';
import { ROZPLYW_STRINGS } from '../strings';
import { WZORZEC_STRINGS } from '../../wzorzec';
import { INSPECTOR_STRINGS, znacznikNieaktualne } from '../../../inspector';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { powerFlowResultFixture, runHeaderFixture } from './fixtures';

// Karta TODO-UI2 p.9: znacznik świeżości nagłówka (`useSwiezoscNaglowka`, V12K-264)
// czyta `analysisCaseContext.rewizjaModelu` z kontraktu przebiegu — mockowany tu
// tak samo jak we własnym teście hooka (`freshness/__tests__/useSwiezoscNaglowka.test.tsx`),
// żeby nie zależeć od realnego `fetch`.
const kontraktMock = vi.fn();
vi.mock('../../../../ui/workspace/analysisRunContract', () => ({
  useAnalysisRunContract: (runId: string | null) => kontraktMock(runId),
}));

function props(over: Partial<Parameters<typeof TabelaSzyn>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  usePowerFlowResultsStore.getState().reset();
  kontraktMock.mockReset();
  kontraktMock.mockReturnValue({ data: null, isLoading: false, error: null });
});

function ustawWynik() {
  usePowerFlowResultsStore.setState({
    results: powerFlowResultFixture(),
    runHeader: runHeaderFixture(),
  });
}

describe('TabelaSzyn — stan pusty (brak wyniku w store)', () => {
  it('bez wyniku: komunikat PL zamiast tabeli', () => {
    render(<TabelaSzyn {...props()} />);
    expect(screen.getByText(ROZPLYW_STRINGS.brakWyniku)).toBeInTheDocument();
    expect(screen.getByText(ROZPLYW_STRINGS.brakWynikuOpis)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-tabela')).not.toBeInTheDocument();
  });
});

describe('TabelaSzyn — konkretyzacja wzorca na realnym kształcie danych', () => {
  beforeEach(ustawWynik);

  it('nagłówek: nazwa analizy PL', () => {
    render(<TabelaSzyn {...props()} />);
    expect(screen.getByText(ROZPLYW_STRINGS.analiza)).toBeInTheDocument();
  });

  it('założenia: parametry przebiegu z wyniku (moc bazowa, szyna bilansująca)', () => {
    render(<TabelaSzyn {...props()} />);
    const zalozenia = screen.getByTestId('mvd-wyn-zalozenia');
    expect(within(zalozenia).getByText(ROZPLYW_STRINGS.zalMocBazowa)).toBeInTheDocument();
    expect(within(zalozenia).getByText('SZ-GPZ')).toBeInTheDocument();
    expect(within(zalozenia).getByText(ROZPLYW_STRINGS.zalZbieznosc)).toBeInTheDocument();
  });

  it('tabela: wiersz per szyna, napięcie sformatowane z jednostką w nagłówku', () => {
    render(<TabelaSzyn {...props()} />);
    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(3);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('1,0000')).toBeInTheDocument();
    expect(tabela.getByText('0,9820')).toBeInTheDocument();
    const thNapiecie = screen.getByTestId('mvd-wyn-th-napiecie');
    expect(within(thNapiecie).getByText(`[${ROZPLYW_STRINGS.jednPU}]`)).toBeInTheDocument();
  });

  it('napięcie poza przedziałem ±5% Un → tag „Poza zakresem"', () => {
    render(<TabelaSzyn {...props()} />);
    const tagi = screen.getAllByTestId('mvd-wyn-tag-ostrzezenie');
    expect(tagi).toHaveLength(1); // tylko SZ-ST2 (0,941 p.u.)
    expect(tagi[0]).toHaveTextContent(WZORZEC_STRINGS.tagOstrzezenie);
  });

  it('wykres profilu napięcia obecny w slocie wykresu', () => {
    render(<TabelaSzyn {...props()} />);
    const slot = screen.getByTestId('mvd-wyn-wykres');
    expect(within(slot).getByTestId('mvd-rozplyw-wykres')).toBeInTheDocument();
    expect(within(slot).getByText(ROZPLYW_STRINGS.wykresTytul)).toBeInTheDocument();
  });

  it('identyfikator przebiegu tylko w trybie eksperckim (§2.7)', () => {
    const { rerender } = render(<TabelaSzyn {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByTestId('mvd-wyn-informacje-audytowe')).not.toBeInTheDocument();
    rerender(<TabelaSzyn {...props({ trybZaawansowania: 'expert' })} />);
    // Karta #145: identyfikator przebiegu wyłącznie w „Informacjach audytowych" (zwinięte).
    fireEvent.click(screen.getByTestId('mvd-wyn-informacje-audytowe-przelacz'));
    expect(screen.getByTestId('mvd-wyn-informacje-audytowe-lista')).toHaveTextContent('pf-run-1');
  });

  it('K3/C1 realna ścieżka: 2× klik na napięciu szyny → onOtworzDowod(bus_id)', () => {
    const onOtworzDowod = vi.fn();
    render(<TabelaSzyn {...props({ onOtworzDowod })} />);
    // Natywna ścieżka użytkownika: dwuklik na przycisku wartości (semantyka wzorca).
    const przycisk = screen.getByText('0,9820').closest('button');
    expect(przycisk).not.toBeNull();
    fireEvent.doubleClick(przycisk!);
    expect(onOtworzDowod).toHaveBeenCalledWith('SZ-ST1');
  });

  it('onEksport przekazany do stopki wzorca', () => {
    const onEksport = vi.fn();
    render(<TabelaSzyn {...props({ onEksport })} />);
    screen.getByRole('button', { name: WZORZEC_STRINGS.eksport }).click();
    expect(onEksport).toHaveBeenCalledTimes(1);
  });
});

describe('TabelaSzyn — znacznik świeżości nagłówka (karta TODO-UI2 p.9, V12K-264)', () => {
  // Dowód, że komentarz nagłówkowy `rozplywAdapter.ts` ("FreshnessBadge się
  // pokazuje") jest FAKTEM, nie deklaracją: `useSwiezoscNaglowka(runId)` musi
  // być realnie wpięty w `naglowek`, a nie tylko architektonicznie dostępny.
  beforeEach(ustawWynik);

  it('rewizja biegu ≠ bieżąca rewizja modelu → FreshnessBadge „nieaktualne (rew. a → b)"', () => {
    useSnapshotStore.setState({ rewizjaBiezacegoModelu: 5 } as never);
    kontraktMock.mockReturnValue({
      data: { analysisCaseContext: { rewizjaModelu: 3 } },
      isLoading: false,
      error: null,
    });

    render(<TabelaSzyn {...props()} />);

    expect(screen.getByText(znacznikNieaktualne(3, 5))).toBeInTheDocument();
  });

  it('rewizja biegu = bieżąca rewizja modelu → FreshnessBadge „aktualne"', () => {
    useSnapshotStore.setState({ rewizjaBiezacegoModelu: 5 } as never);
    kontraktMock.mockReturnValue({
      data: { analysisCaseContext: { rewizjaModelu: 5 } },
      isLoading: false,
      error: null,
    });

    render(<TabelaSzyn {...props()} />);

    expect(screen.getByText(INSPECTOR_STRINGS.aktualne)).toBeInTheDocument();
  });

  it('kontrakt biegu bez liczbowej rewizji (starszy zapis) → BRAK znacznika (zero zgadywania)', () => {
    useSnapshotStore.setState({ rewizjaBiezacegoModelu: 5 } as never);
    kontraktMock.mockReturnValue({
      data: { analysisCaseContext: { rewizjaModelu: null } },
      isLoading: false,
      error: null,
    });

    render(<TabelaSzyn {...props()} />);

    expect(screen.queryByText(INSPECTOR_STRINGS.aktualne)).not.toBeInTheDocument();
    expect(screen.queryByText(/nieaktualne/i)).not.toBeInTheDocument();
  });
});
