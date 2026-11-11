/**
 * Testy kreatora „Dodaj generator synchroniczny SN" — realna ścieżka użytkownika (render →
 * tabliczka z katalogu albo ręczna → nastawa P → kontrola przed zapisem → natywny zapis).
 * Mockowane są tylko store'y i katalog; próba operacji idzie prawdziwym klientem do
 * stubowanego `fetch`.
 *
 * Zgodność napięcia tabliczki z szyną ocenia WYŁĄCZNIE operacja `add_generator_sn` (reguła
 * `generator.voltage_mismatch` w backendzie); kreator nie ma progu i pokazuje werdykt próby.
 * Iloczyn cech: tabliczka {katalog, ręczna} × odpowiedź próby {przyjęta, odmowa 200, odmowa 422,
 * nieustalona 500} × formularz {kompletny, niekompletny} × szyna {wskazana, brak}.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ladunekProbyZWywolania, wynikiProby } from '../../rama/__tests__/wynikiProby';
import { KreatorGeneratoraSn } from '../KreatorGeneratoraSn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const fetchMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { bus_ref: 'bus-sn-1', bus_name: 'Szyna SN GPZ', bus_voltage_kv: 15 };
const snapshotState = { error: null as string | null, executeDomainOperation: executeDomainOperationMock };
const selectionState = { selectedElements: [] as unknown[], selectElement: vi.fn() };

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/topology/snapshotStore', () => {
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return { useSnapshotStore };
});

vi.mock('../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: { closeOperationForm: typeof closeFormMock }) => unknown) =>
    selector({ closeOperationForm: closeFormMock }),
  useActiveOperationContext: () => context,
}));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: typeof selectionState) => unknown) => selector(selectionState),
}));

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => undefined,
}));

const TYP = { id: 'GEN_SN_2MVA_15KV', name: 'Generator 2 MVA 15 kV', rated_mva: 2, rated_kv: 15, q_min_mvar: -0.8, q_max_mvar: 1.2 };

const { fetchSynchronousGeneratorTypesMock } = vi.hoisted(() => ({
  fetchSynchronousGeneratorTypesMock: vi.fn(),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchSynchronousGeneratorTypes: () => fetchSynchronousGeneratorTypesMock(),
}));

const ODMOWA = {
  komunikat: 'Napięcie znamionowe generatora 20 kV nie odpowiada napięciu szyny 15 kV.',
  kod: 'generator.voltage_mismatch',
};

async function wypelnijZKatalogu() {
  await waitFor(() =>
    expect(screen.getByTestId('mvd-kreator-generator-sn-katalog').querySelector(`option[value="${TYP.id}"]`)).not.toBeNull(),
  );
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-generator-sn-katalog'), TYP.id);
  await userEvent.type(screen.getByTestId('mvd-kreator-generator-sn-p'), '1.5');
}

async function wypelnijRecznie() {
  await waitFor(() => expect(screen.getByTestId('mvd-kreator-generator-sn-rated-mva')).toBeInTheDocument());
  await userEvent.type(screen.getByTestId('mvd-kreator-generator-sn-rated-mva'), '2');
  await userEvent.type(screen.getByTestId('mvd-kreator-generator-sn-rated-kv'), '20');
  await userEvent.type(screen.getByTestId('mvd-kreator-generator-sn-p'), '1.5');
}

function wierszKontroli(): HTMLElement {
  return screen.getByTestId('mvd-kreator-generator-sn-gotowosc-Kontrola modelu');
}

describe('KreatorGeneratoraSn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { bus_ref: 'bus-sn-1', bus_name: 'Szyna SN GPZ', bus_voltage_kv: 15 };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    fetchSynchronousGeneratorTypesMock.mockReset();
    fetchSynchronousGeneratorTypesMock.mockResolvedValue([TYP]);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe.each([
    ['katalog', [TYP], wypelnijZKatalogu, { catalog_ref: TYP.id }],
    ['ręczna (katalog pusty)', [], wypelnijRecznie, { manual_params: { rated_mva: 2, rated_kv: 20 } }],
  ] as const)('tabliczka: %s', (_nazwa, typy, wypelnij, polaTabliczki) => {
    it.each(wynikiProby(ODMOWA))('próba $nazwa → werdykt operacji w kreatorze, ładunek = ładunek zapisu', async (wynik) => {
      fetchSynchronousGeneratorTypesMock.mockResolvedValue([...typy]);
      fetchMock.mockImplementation(wynik.odpowiedz);
      executeDomainOperationMock.mockResolvedValue({ error: null });
      render(<KreatorGeneratoraSn />);
      await wypelnij();

      const proba = await screen.findByTestId('mvd-kreator-generator-sn-proba');
      await waitFor(() => expect(proba).toHaveAttribute('data-stan', wynik.stan));
      if (wynik.tresc) expect(proba.textContent).toContain(wynik.tresc);
      expect(wierszKontroli().textContent).toContain(wynik.wiersz);

      await userEvent.click(screen.getByTestId('mvd-kreator-generator-sn-zapisz'));
      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const [, operacja, ladunekZapisu] = executeDomainOperationMock.mock.calls[0];
      expect(operacja).toBe('add_generator_sn');
      expect(ladunekZapisu).toMatchObject({ bus_ref: 'bus-sn-1', p_mw: 1.5, ...polaTabliczki });
      // Próba pyta o DOKŁADNIE ten ładunek, który wysyła zapis (+ flaga próby).
      const ostatniaProba = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1];
      expect(ladunekProbyZWywolania(ostatniaProba)).toEqual({ ...ladunekZapisu, dry_run: true });
    });
  });

  it('formularz niekompletny (bez P) → brak próby, wiersz „Nie sprawdzono”', async () => {
    render(<KreatorGeneratoraSn />);
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-generator-sn-katalog').querySelector(`option[value="${TYP.id}"]`)).not.toBeNull(),
    );
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-generator-sn-katalog'), TYP.id);
    await new Promise((r) => setTimeout(r, 400));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mvd-kreator-generator-sn-proba')).toBeNull();
    expect(wierszKontroli().textContent).toContain('Nie sprawdzono');
  });

  it('wiersz szyny pokazuje napięcie szyny z kontekstu (dane, nie ocena)', async () => {
    render(<KreatorGeneratoraSn />);
    await screen.findByRole('option', { name: /Generator 2 MVA 15 kV/ });
    expect(screen.getByTestId('mvd-kreator-generator-sn-gotowosc-Szyna SN').textContent).toContain('Szyna SN GPZ · 15 kV');
  });

  it('uczciwy stan zerowy: bez szyny zapis zablokowany i brak próby', async () => {
    context = {};
    render(<KreatorGeneratoraSn />);
    await screen.findByRole('option', { name: /Generator 2 MVA 15 kV/ });
    await wypelnijZKatalogu();
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByTestId('mvd-kreator-generator-sn-brak-szyny')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-generator-sn-zapisz')).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
