/**
 * Testy kreatora „Punkt pomiarowy pola SN" (add_ct / add_vt) — realna ścieżka, Zero-Debt §5.
 * Katalog wypełnia przekładnię; payload weryfikowany 1:1 z operacją domenową.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPomiaru } from '../KreatorPomiaru';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let activeForm: { op: string; context?: Record<string, unknown> } | null = { op: 'add_ct', context: {} };
const snapshotState = {
  error: null as string | null,
  snapshot: null as unknown,
  executeDomainOperation: executeDomainOperationMock,
};

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
  useActiveOperationForm: () => activeForm,
}));

vi.mock('../../../../ui/navigation/routes', () => ({ navigateToSld: () => navigateToSldMock() }));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerSldOnElementMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  fetchCtTypes: () =>
    Promise.resolve([
      { id: 'ct-1', name: 'CT 300/5', manufacturer: 'ABB', ratio_primary_a: 300, ratio_secondary_a: 5, accuracy_class: '5P20', burden_va: 15 },
      { id: 'ct-bez-klasy', name: 'CT 200/1', manufacturer: 'ABB', ratio_primary_a: 200, ratio_secondary_a: 1 },
    ]),
  fetchVtTypes: () =>
    Promise.resolve([
      { id: 'vt-1', name: 'VT 15000/100', manufacturer: 'ABB', ratio_primary_v: 15000, ratio_secondary_v: 100, accuracy_class: '0.5' },
    ]),
}));

vi.mock('../../../../ui/network-build/forms/catalogFirstRules', () => ({ validateCatalogFirst: () => null }));

const FIELD_ITEM = { bay_ref: 'bay-1', bay_id: 'bay-1', bay_name: 'Pole liniowe A' };

vi.mock('../../../../ui/field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({ data: { fields: [FIELD_ITEM] }, itemsByBayRef: new Map([['bay-1', FIELD_ITEM]]) }),
}));

vi.mock('../../../../ui/field/fieldReadModelSelectors', () => ({
  buildFieldReadModelOptions: () => [
    { ref_id: 'bay-1', name: 'Pole liniowe A', bay_role: 'FEEDER', station_name: 'GPZ Wschód', bus_name: 'Szyna I', ct_count: 0, vt_count: 0 },
  ],
  resolveFieldReadModelItem: () => null,
}));

async function pickCt() {
  await waitFor(() => expect(screen.getByTestId('mvd-kreator-pomiar-katalog')).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pomiar-katalog'), 'ct-1');
}

describe('KreatorPomiaru — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    activeForm = { op: 'add_ct', context: {} };
    snapshotState.error = null;
    snapshotState.snapshot = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('dodaje CT z przekładnią wypełnioną z katalogu (add_ct)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'ct-x' } });
    render(<KreatorPomiaru />);
    await pickCt();

    // Jedyne pole SN modelu przyjęte automatycznie; dane znamionowe z karty katalogowej.
    expect(screen.getByTestId('mvd-kreator-pomiar-bay')).toHaveValue('bay-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-krok-znamionowe'));
    expect(screen.getByTestId('mvd-kreator-pomiar-secondary')).toHaveValue(5);
    expect(screen.getByTestId('mvd-kreator-pomiar-klasa')).toHaveValue('5P20');
    expect(screen.queryByText(/przyjęto/)).toBeNull();

    await userEvent.click(screen.getByTestId('mvd-kreator-pomiar-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_ct',
        expect.objectContaining({
          bay_ref: 'bay-1',
          catalog_ref: 'ct-1',
          ratio_primary_a: 300,
          ratio_secondary_a: 5,
          catalog_binding: expect.objectContaining({ catalog_namespace: 'CT', catalog_item_id: 'ct-1' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
    expect(selectElementMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'ct-x', type: 'Measurement' }));
  });

  it('wariant VT używa operacji add_vt i pól napięciowych', async () => {
    activeForm = { op: 'add_vt', context: {} };
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPomiaru />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-pomiar-katalog')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pomiar-katalog'), 'vt-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-pomiar-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_vt',
        expect.objectContaining({ ratio_primary_v: 15000, ratio_secondary_v: 100 }),
      );
    });
  });

  // Intencja dawnego „bez katalogu zapis zablokowany”: operacja nie rusza bez typu — teraz
  // przez wskazanie katalogu przy próbie zapisu; dane znamionowe bez karty pozostają puste.
  it('bez katalogu: wtórna i klasa puste (bez domyślnych 5 A / „0.5”), zapis wskazuje katalog', async () => {
    render(<KreatorPomiaru />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-pomiar-katalog')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(screen.getByTestId('mvd-kreator-krok-znamionowe'));
    expect((screen.getByTestId('mvd-kreator-pomiar-secondary') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('mvd-kreator-pomiar-klasa') as HTMLInputElement).value).toBe('');
    await userEvent.click(screen.getByTestId('mvd-kreator-pomiar-zapisz'));
    expect(screen.getByTestId('mvd-kreator-krok-pole')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('mvd-kreator-pomiar-katalog')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Wybierz typ przekładnika z katalogu — /);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('karta bez klasy dokładności: klasa pusta (bez „0.5”); przekładnia z karty daje się zmienić', async () => {
    render(<KreatorPomiaru />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-pomiar-katalog')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pomiar-katalog'), 'ct-bez-klasy');
    await userEvent.click(screen.getByTestId('mvd-kreator-krok-znamionowe'));
    expect((screen.getByTestId('mvd-kreator-pomiar-klasa') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('mvd-kreator-pomiar-primary')).toHaveValue(200);
    await userEvent.clear(screen.getByTestId('mvd-kreator-pomiar-primary'));
    await userEvent.type(screen.getByTestId('mvd-kreator-pomiar-primary'), '150');
    expect(screen.getByTestId('mvd-kreator-pomiar-primary')).toHaveValue(150);
  });

  it('konflikt widoczny od razu: przekładnia niedodatnia', async () => {
    render(<KreatorPomiaru />);
    await pickCt();
    await userEvent.click(screen.getByTestId('mvd-kreator-krok-znamionowe'));
    await userEvent.clear(screen.getByTestId('mvd-kreator-pomiar-secondary'));
    await userEvent.type(screen.getByTestId('mvd-kreator-pomiar-secondary'), '0');
    expect(screen.getByRole('alert').textContent).toBe('Wartości przekładni muszą być dodatnie.');
  });
});

/**
 * Kotwica „wyłącznik liniowy" (karta BIEG-ZABEZPIECZEN-Z-MODELU): przekładnik przy wyłączniku
 * w torze odcinka, wejście z ekranu „Zabezpieczenia i automatyka". Iloczyn cech: {wyłącznik
 * w modelu: jest, brak} × {katalog: wybrany, niewybrany}.
 */
describe('KreatorPomiaru — kotwica wyłącznika liniowego', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    activeForm = { op: 'add_ct', context: { kotwica: 'wylacznik', breaker_ref: 'q-1' } };
  });

  afterEach(() => cleanup());

  async function wybierzKatalog() {
    const katalog = screen.getByTestId('mvd-kreator-pomiar-katalog');
    await waitFor(() => expect(within(katalog).getByRole('option', { name: /CT 300\/5/ })).toBeInTheDocument());
    await userEvent.selectOptions(katalog, 'ct-1');
  }

  it('add_ct z breaker_ref (bez pola) i przekładnią z katalogu', async () => {
    snapshotState.snapshot = { branches: [{ ref_id: 'q-1', name: 'Wyłącznik odcinka 1', type: 'breaker' }] };
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'ct-q' } });
    render(<KreatorPomiaru />);
    expect(screen.getByTestId('mvd-kreator-pomiar-pole')).toHaveTextContent('Wyłącznik odcinka 1');
    expect(screen.queryByTestId('mvd-kreator-pomiar-bay')).not.toBeInTheDocument();
    // Zapis klikalny od startu (brak danych nie wyszarza zapisu — kontrakt prowadzenia).
    expect(screen.getByTestId('mvd-kreator-pomiar-zapisz')).toBeEnabled();
    await wybierzKatalog();
    await userEvent.click(screen.getByTestId('mvd-kreator-pomiar-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const [, operacja, ladunek] = executeDomainOperationMock.mock.calls[0];
    expect(operacja).toBe('add_ct');
    expect(ladunek).toMatchObject({
      breaker_ref: 'q-1',
      catalog_ref: 'ct-1',
      ratio_primary_a: 300,
      ratio_secondary_a: 5,
    });
    expect(ladunek).not.toHaveProperty('bay_ref');
  });

  it('wyłącznika nie ma w modelu — próba zapisu nazywa brak kotwicy mimo wybranego katalogu', async () => {
    snapshotState.snapshot = { branches: [] };
    render(<KreatorPomiaru />);
    await wybierzKatalog();
    await userEvent.click(screen.getByTestId('mvd-kreator-pomiar-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Wskazanego wyłącznika liniowego nie ma w modelu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
