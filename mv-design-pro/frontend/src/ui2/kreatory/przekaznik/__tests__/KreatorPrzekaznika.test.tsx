/**
 * Testy kreatora „Zabezpieczenie pola SN" (add_relay) — realna ścieżka użytkownika, Zero-Debt §5.
 * Pola wybierane natywnie (userEvent), payload weryfikowany 1:1 z operacją domenową.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPrzekaznika } from '../KreatorPrzekaznika';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let activeForm: { op: string; context?: Record<string, unknown> } | null = { op: 'add_relay', context: {} };
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

// FAB-F: katalog KANONICZNY MV (`fetchMvProtectionDeviceTypes`), nie biblioteka
// analityczna (`fetchProtectionDeviceTypes`) — jedyny zbiór, który przyjmuje
// brama katalogowa `add_relay`. Kształt rekordu jak w prawdziwym katalogu MV:
// `name_pl` + `vendor` (NIE `name`/`manufacturer` biblioteki analitycznej) —
// gdyby etykieta w komponencie czytała złe pola, ten fixture by to ujawnił.
vi.mock('../../../../ui/catalog/api', () => ({
  fetchMvProtectionDeviceTypes: () =>
    Promise.resolve([
      { id: 'relay-1', name_pl: 'Przekaźnik REF615', vendor: 'ABB' },
      { id: 'relay-2', name_pl: 'Przekaźnik 7SJ82', vendor: 'Siemens' },
    ]),
}));

vi.mock('../../../../ui/network-build/forms/catalogFirstRules', () => ({
  validateCatalogFirst: () => null,
}));

const FIELD_ITEM = { bay_ref: 'bay-1', bay_id: 'bay-1', bay_name: 'Pole liniowe A' };
const FIELD_ITEM_2 = { bay_ref: 'bay-2', bay_id: 'bay-2', bay_name: 'Pole liniowe B' };

// Stabilny wynik hooka (jak `useFieldReadModel` z pamięcią zapytania) — nowy obiekt na każdy
// render zmieniałby listę pól przy każdym renderze i resetował wybór pola.
const MODEL_ODCZYTU = {
  data: { fields: [FIELD_ITEM, FIELD_ITEM_2] },
  itemsByBayRef: new Map([['bay-1', FIELD_ITEM], ['bay-2', FIELD_ITEM_2]]),
};
vi.mock('../../../../ui/field/useFieldReadModel', () => ({
  useFieldReadModel: () => MODEL_ODCZYTU,
}));

// Kontekst z karty pola (`{bay_ref}`) rozstrzyga pole jak `resolveFieldReadModelItem` — po
// referencji pola; brak kontekstu — `null` (kreator bierze wtedy pierwsze pole z listy).
vi.mock('../../../../ui/field/fieldReadModelSelectors', () => ({
  buildFieldReadModelOptions: () => [
    { ref_id: 'bay-1', name: 'Pole liniowe A', bay_role: 'FEEDER', station_name: 'GPZ Wschód', bus_name: 'Szyna I', ct_count: 1, vt_count: 1 },
    { ref_id: 'bay-2', name: 'Pole liniowe B', bay_role: 'FEEDER', station_name: 'GPZ Wschód', bus_name: 'Szyna II', ct_count: 1, vt_count: 0 },
  ],
  resolveFieldReadModelItem: (_items: unknown, ctx: Record<string, unknown> | undefined) =>
    ctx?.bay_ref === 'bay-2' ? FIELD_ITEM_2 : ctx?.bay_ref === 'bay-1' ? FIELD_ITEM : null,
}));

vi.mock('../../../../ui/field/fieldControlSelectors', () => ({
  buildControlDeviceOptions: () => [{ ref_id: 'cb-1', name: 'wyłącznik cb-1', kind: 'CB', catalog_ref: null }],
  measurementCountsForField: () => ({ ct: 1, vt: 1 }),
}));

/**
 * Wybór pozycji katalogowej przekaźnika.
 *
 * CZEKAMY NA OPCJĘ, NIE NA SAM `<select>` (naprawa chwiejności, 2026-08-08).
 * Lista pozycji przychodzi z asynchronicznego `fetchMvProtectionDeviceTypes`, a
 * pole `<select>` renderuje się PRZED jej rozwiązaniem — więc warunek „element
 * jest w dokumencie" spełniał się na PUSTEJ liście i `selectOptions` wywracał
 * się z „Value »relay-1« not found in options". Objaw wychodził wyłącznie
 * w pełnym przebiegu shardowanym (setki plików w jednym procesie, przesunięte
 * kolejkowanie mikrozadań), a w izolacji test przechodził — czyli czekanie na
 * niewłaściwy warunek udawało zieleń. Zmierzone: ten sam commit dawał raz
 * czerwień, raz zieleń na `--shard=1/4`.
 */
async function pickCatalog() {
  const katalog = await screen.findByTestId('mvd-kreator-przekaznik-katalog');
  await waitFor(() => {
    expect(within(katalog).getByRole('option', { name: /REF615/ })).toBeInTheDocument();
  });
  await userEvent.selectOptions(katalog, 'relay-1');
}

describe('KreatorPrzekaznika — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    activeForm = { op: 'add_relay', context: {} };
    snapshotState.error = null;
    snapshotState.snapshot = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('przypisuje zabezpieczenie do pola (add_relay z catalog_binding ZABEZPIECZENIE)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'relay-x' } });
    render(<KreatorPrzekaznika />);
    await pickCatalog();

    await userEvent.click(screen.getByTestId('mvd-kreator-przekaznik-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_relay',
        expect.objectContaining({
          bay_ref: 'bay-1',
          relay_type: 'NADPRADOWY',
          catalog_ref: 'relay-1',
          catalog_binding: expect.objectContaining({ catalog_namespace: 'ZABEZPIECZENIE', catalog_item_id: 'relay-1' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
    expect(selectElementMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'relay-x', type: 'ProtectionAssignment' }));
  });

  it('wybór rodziny ziemnozwarciowej trafia do payloadu', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPrzekaznika />);
    await pickCatalog();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-przekaznik-rodzina'), 'ZIEMNOZWARCIOWY');
    await userEvent.click(screen.getByTestId('mvd-kreator-przekaznik-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_relay',
        expect.objectContaining({ relay_type: 'ZIEMNOZWARCIOWY' }),
      );
    });
  });

  // KARTA-POLA-KD6: kreator otwarty z karty KONKRETNEGO pola („dodaj zabezpieczenie” →
  // `add_relay` z `{bay_ref}`) ma to pole i jego wyłącznik wybrane, kontekst pola jako zwartą
  // listę danych, a stopka nazywa jedyny brak (typ katalogowy), nie „uzupełnij pole SN”.
  it.each([
    ['bay-2', 'Szyna II'],
    ['bay-1', 'Szyna I'],
  ])('otwarty z karty pola %s: pole i wyłącznik wybrane, stopka mówi o typie katalogowym', async (poleRef, szyna) => {
    activeForm = { op: 'add_relay', context: { bay_ref: poleRef } };
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPrzekaznika />);
    await waitFor(() =>
      expect((screen.getByTestId('mvd-kreator-przekaznik-bay') as HTMLSelectElement).value).toBe(poleRef),
    );
    expect((screen.getByTestId('mvd-kreator-przekaznik-breaker') as HTMLSelectElement).value).toBe('cb-1');
    const kontekst = screen.getByTestId('mvd-kreator-przekaznik-kontekst');
    expect(kontekst.tagName).toBe('DL');
    expect(kontekst).toHaveTextContent(szyna);
    expect(screen.getByTestId('mvd-kreator-walidacja')).toHaveTextContent('Wybierz typ katalogowy przekaźnika');
    expect(screen.getByTestId('mvd-kreator-walidacja')).not.toHaveTextContent('pole SN');
    await pickCatalog();
    expect(screen.queryByTestId('mvd-kreator-walidacja')).toBeNull();
    await userEvent.click(screen.getByTestId('mvd-kreator-przekaznik-zapisz'));
    await waitFor(() =>
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_relay',
        expect.objectContaining({ bay_ref: poleRef, breaker_ref: 'cb-1', catalog_ref: 'relay-1' }),
      ),
    );
  });

  it('pole odznaczone: stopka nazywa brak pola SN', async () => {
    render(<KreatorPrzekaznika />);
    const pole = await screen.findByTestId('mvd-kreator-przekaznik-bay');
    await userEvent.selectOptions(pole, '');
    expect(screen.getByTestId('mvd-kreator-walidacja')).toHaveTextContent('Wybierz pole SN');
    expect(screen.queryByTestId('mvd-kreator-przekaznik-kontekst')).toBeNull();
  });

  it('wstęp kreatora jednym zdaniem, nagłówek bez wersalików w źródle', () => {
    render(<KreatorPrzekaznika />);
    const cel = document.querySelector('.mvd-kreator-cel')?.textContent ?? '';
    expect(cel.match(/[.!?](?=\s|$)/gu) ?? []).toHaveLength(1);
    expect(document.querySelector('.mvd-kreator-eyebrow')?.textContent).toBe('Model sieci · zabezpieczenie pola SN');
  });

  it('uczciwy stan zerowy: bez typu katalogowego zapis zablokowany', async () => {
    render(<KreatorPrzekaznika />);
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-przekaznik-katalog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mvd-kreator-przekaznik-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorPrzekaznika />);
    await pickCatalog();
    expect(screen.getByTestId('mvd-kreator-przekaznik-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});

/**
 * Kotwica „wyłącznik liniowy" (karta BIEG-ZABEZPIECZEN-Z-MODELU): wejście z ekranu
 * „Zabezpieczenia i automatyka" z kontekstem `{kotwica: 'wylacznik', breaker_ref}` — wyłącznik
 * w torze odcinka, bez pola rozdzielnicy. Iloczyn cech: {przekładnik przy wyłączniku: jest,
 * brak, przekładnik innego wyłącznika} × {wyłącznik w modelu: jest, brak}.
 */
describe('KreatorPrzekaznika — kotwica wyłącznika liniowego', () => {
  const WYLACZNIK = { ref_id: 'q-1', name: 'Wyłącznik odcinka 1', type: 'breaker' };
  const ct = (breakerRef: string) => ({
    ref_id: `ct-${breakerRef}`,
    measurement_type: 'CT',
    meta: { breaker_ref: breakerRef },
  });

  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
    activeForm = { op: 'add_relay', context: { kotwica: 'wylacznik', breaker_ref: 'q-1' } };
  });

  afterEach(() => cleanup());

  it('przekładnik przy wyłączniku — payload z breaker_ref (bez pola), bez ostrzeżenia o CT', async () => {
    snapshotState.snapshot = { branches: [WYLACZNIK], measurements: [ct('q-1')] };
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'relay-q' } });
    render(<KreatorPrzekaznika />);
    expect(screen.getByTestId('mvd-kreator-przekaznik-pole')).toHaveTextContent('Wyłącznik odcinka 1');
    expect(screen.queryByTestId('mvd-kreator-przekaznik-bay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kreator-przekaznik-brak-ct')).not.toBeInTheDocument();
    await pickCatalog();
    await userEvent.click(screen.getByTestId('mvd-kreator-przekaznik-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const [, operacja, ladunek] = executeDomainOperationMock.mock.calls[0];
    expect(operacja).toBe('add_relay');
    expect(ladunek).toMatchObject({ breaker_ref: 'q-1', relay_type: 'NADPRADOWY', catalog_ref: 'relay-1' });
    expect(ladunek).not.toHaveProperty('bay_ref');
    expect(closeFormMock).toHaveBeenCalled();
  });

  it.each([
    ['brak przekładnika', [] as ReturnType<typeof ct>[]],
    ['przekładnik innego wyłącznika', [ct('q-inny')]],
  ])('%s — ostrzeżenie o braku CT (przypisanie dozwolone, brak nazwany)', async (_opis, pomiary) => {
    snapshotState.snapshot = { branches: [WYLACZNIK], measurements: pomiary };
    render(<KreatorPrzekaznika />);
    expect(screen.getByTestId('mvd-kreator-przekaznik-brak-ct')).toBeInTheDocument();
    await pickCatalog();
    expect(screen.getByTestId('mvd-kreator-przekaznik-zapisz')).toBeEnabled();
  });

  it('wyłącznika nie ma w modelu — zapis zablokowany, operacja nie wychodzi', async () => {
    snapshotState.snapshot = { branches: [], measurements: [] };
    render(<KreatorPrzekaznika />);
    await pickCatalog();
    expect(screen.getByTestId('mvd-kreator-przekaznik-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
