/**
 * Dane przyjęte przy tabelach rozpływu (kontrakt werdyktu §3, ZASADA NR 4 pkt 4).
 *
 * Walidacja energetyczna biegu rozpływu (`energy_validation/service.py`) niesie parę
 * `status_danych` + `dane_przyjete` biegu; tabele „Gałęzie" i „Szyny" czytają ją przez
 * `useWalidacjaObciazen` (ten sam dostawca co werdykt obciążenia gałęzi) i pokazują wspólnym
 * zapisem `StanDanychWyniku` pod tabelą.
 *
 * Iloczyn cech: tabela {gałęzie, szyny} × lista {pusta, jeden wpis, wiele źródeł} ×
 * {zwinięty, rozwinięty}; dodatkowo odpowiedź walidacji niedostępna → nic się nie pokazuje.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../jakosc/api', () => ({
  fetchWalidacjaEnergetyczna: vi.fn(),
}));
const kontraktMock = vi.fn();
vi.mock('../../../../ui/workspace/analysisRunContract', () => ({
  useAnalysisRunContract: (runId: string | null) => kontraktMock(runId),
}));

import {
  WARIANTY_LISTY,
  paraDanych,
  sprawdzDanePrzyjete,
} from '../../wzorzec/__tests__/danePrzyjeteIloczyn';
import { TabelaGalezi } from '../TabelaGalezi';
import { TabelaSzyn } from '../TabelaSzyn';
import { fetchWalidacjaEnergetyczna } from '../../jakosc/api';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import { powerFlowResultFixture, runHeaderFixture, walidacjaResponseFixture } from './fixtures';

const mockedWalidacja = vi.mocked(fetchWalidacjaEnergetyczna);

const TABELE = [
  { nazwa: 'gałęzie', Tabela: TabelaGalezi, testId: 'mvd-rozplyw-galezie' },
  { nazwa: 'szyny', Tabela: TabelaSzyn, testId: 'mvd-rozplyw-szyny' },
];
const PRZYPADKI = TABELE.flatMap((tabela) => WARIANTY_LISTY.map((wariant) => ({ tabela, wariant })));

beforeEach(() => {
  mockedWalidacja.mockReset();
  kontraktMock.mockReset();
  kontraktMock.mockReturnValue({ data: null, isLoading: false, error: null });
  usePowerFlowResultsStore.getState().reset();
  usePowerFlowResultsStore.setState({
    results: powerFlowResultFixture(),
    runHeader: runHeaderFixture(),
  });
});

describe('tabele rozpływu — dane przyjęte biegu', () => {
  it.each(PRZYPADKI)('$tabela.nazwa × $wariant.nazwa', async ({ tabela, wariant }) => {
    mockedWalidacja.mockResolvedValue({
      ...walidacjaResponseFixture(),
      ...paraDanych(wariant.dane),
    });
    const { Tabela } = tabela;
    render(<Tabela trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    await waitFor(() => expect(mockedWalidacja).toHaveBeenCalled());
    if (wariant.dane.length > 0) await screen.findByTestId(`${tabela.testId}-dane`);
    await sprawdzDanePrzyjete(screen.getByTestId(tabela.testId), tabela.testId, wariant.dane);
  });

  it.each(TABELE)('$nazwa: walidacja niedostępna → bez zapisu danych przyjętych', async (tabela) => {
    mockedWalidacja.mockRejectedValue(new Error('walidacja niedostępna'));
    const { Tabela } = tabela;
    render(<Tabela trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    await waitFor(() => expect(mockedWalidacja).toHaveBeenCalled());
    await sprawdzDanePrzyjete(screen.getByTestId(tabela.testId), tabela.testId, []);
  });
});
