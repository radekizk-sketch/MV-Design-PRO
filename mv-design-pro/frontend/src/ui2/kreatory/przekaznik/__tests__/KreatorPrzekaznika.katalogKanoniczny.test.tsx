/**
 * KreatorPrzekaznika — parytet katalogu z bramą `add_relay` (FAB-F, F6).
 *
 * `KreatorPrzekaznika` korzystał z `fetchProtectionDeviceTypes` (biblioteka
 * ANALITYCZNA koordynacji zabezpieczeń, 51 pozycji producenckich), podczas gdy
 * brama katalogowa operacji domenowej `add_relay` przyjmuje WYŁĄCZNIE katalog
 * KANONICZNY MV (`fetchMvProtectionDeviceTypes`, przestrzeń `ZABEZPIECZENIE`,
 * 12 pozycji) — picker oferował wybór, który operacja i tak odrzucała
 * (fabrykacja wyboru). Ten plik mockuje ZAPYTANIE (`fetch`), nie listę opcji —
 * wzorzec identyczny jak `ui/sld/v2/canvas/__tests__/SldDetailDrawer.test.tsx`
 * (katalog DER) i `ui/catalog/__tests__/converterTypesPtpiree.test.ts` — żeby
 * realnie przejść przez `fetchMvProtectionDeviceTypes` → `fetchCatalogJson` →
 * `fetch`, a nie przez zaślepkę modułu, która ukryłaby błędny endpoint.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPrzekaznika } from '../KreatorPrzekaznika';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
const activeForm: { op: string; context?: Record<string, unknown> } = { op: 'add_relay', context: {} };
const snapshotState = { error: null as string | null, snapshot: null, executeDomainOperation: executeDomainOperationMock };

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

vi.mock('../../../../ui/navigation/routes', () => ({ navigateToSld: () => undefined }));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: () => void; centerSldOnElement: () => void }) => unknown) =>
    selector({ selectElement: () => undefined, centerSldOnElement: () => undefined }),
}));

vi.mock('../../../../ui/network-build/forms/catalogFirstRules', () => ({
  validateCatalogFirst: () => null,
}));

const FIELD_ITEM = { bay_ref: 'bay-1', bay_id: 'bay-1', bay_name: 'Pole liniowe A' };

vi.mock('../../../../ui/field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({
    data: { fields: [FIELD_ITEM] },
    itemsByBayRef: new Map([['bay-1', FIELD_ITEM]]),
  }),
}));

vi.mock('../../../../ui/field/fieldReadModelSelectors', () => ({
  buildFieldReadModelOptions: () => [
    { ref_id: 'bay-1', name: 'Pole liniowe A', bay_role: 'FEEDER', station_name: 'GPZ Wschód', bus_name: 'Szyna I', ct_count: 1, vt_count: 1 },
  ],
  resolveFieldReadModelItem: () => null,
}));

vi.mock('../../../../ui/field/fieldControlSelectors', () => ({
  buildControlDeviceOptions: () => [{ ref_id: 'cb-1', name: 'wyłącznik cb-1', kind: 'CB', catalog_ref: null }],
  measurementCountsForField: () => ({ ct: 1, vt: 1 }),
}));

/** Mock granicy `fetch` — rozróżnia katalog KANONICZNY MV od biblioteki
 *  ANALITYCZNEJ po ścieżce URL, dokładnie jak rzeczywiste dwa endpointy
 *  backendu (`/mv-protection-device-types` vs `/protection/device-types`). */
function mockProtectionCatalogFetch(opts: {
  canonical: unknown[];
  analytical?: unknown[];
}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/catalog/mv-protection-device-types')) {
        return new Response(JSON.stringify(opts.canonical), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/catalog/protection/device-types')) {
        return new Response(JSON.stringify(opts.analytical ?? []), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

describe('KreatorPrzekaznika — katalog KANONICZNY MV (parytet z bramą add_relay)', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    activeForm.context = {};
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('picker pokazuje WYŁĄCZNIE pozycje katalogu kanonicznego MV, nie biblioteki analitycznej', async () => {
    mockProtectionCatalogFetch({
      // Kształt rekordu jak prawdziwy `ProtectionDeviceType.to_dict()` katalogu MV
      // (backend/src/network_model/catalog/types.py) — `name_pl` + `vendor`, BEZ `name`.
      canonical: [
        { id: 'mv-rel-1', name_pl: 'Przekaźnik referencyjny 400 A', vendor: null },
        { id: 'mv-rel-2', name_pl: 'Przekaźnik Elektrometal e2TANGO-600', vendor: 'ELEKTROMETAL' },
      ],
      // Pozycja WYŁĄCZNIE biblioteki analitycznej — brama `add_relay` by ją odrzuciła.
      // MUSI być nieobecna w pickerze, inaczej test nie wykryłby regresji do złego endpointu.
      analytical: [
        { id: 'lib-analityczna-1', name: 'REF615 (biblioteka analityczna)', vendor: 'ABB' },
      ],
    });

    render(<KreatorPrzekaznika />);

    const katalog = await screen.findByTestId('mvd-kreator-przekaznik-katalog');
    await waitFor(() => {
      expect(within(katalog).getByRole('option', { name: /Przekaźnik referencyjny 400 A/ })).toBeInTheDocument();
    });
    // Etykieta z wiodącym producentem (`vendor`), nazwa kanoniczna `name_pl`.
    expect(within(katalog).getByRole('option', { name: 'ELEKTROMETAL · Przekaźnik Elektrometal e2TANGO-600' })).toBeInTheDocument();

    // Pozycja WYŁĄCZNIE analityczna nie może się pojawić w pickerze budowy modelu.
    expect(within(katalog).queryByRole('option', { name: /biblioteka analityczna/ })).not.toBeInTheDocument();
    expect(within(katalog).queryByRole('option', { name: /REF615/ })).not.toBeInTheDocument();

    // Dokładnie: placeholder + 2 pozycje katalogu kanonicznego, nic więcej.
    expect(within(katalog).getAllByRole('option')).toHaveLength(3);
  });

  it('uczciwy stan zerowy: katalog kanoniczny pusty -> ZERO listy zastępczej (zero fabrykacji)', async () => {
    mockProtectionCatalogFetch({ canonical: [] });

    render(<KreatorPrzekaznika />);

    const katalog = await screen.findByTestId('mvd-kreator-przekaznik-katalog');
    await waitFor(() => {
      expect(within(katalog).getAllByRole('option')).toHaveLength(1);
    });
    // Jedyna opcja to placeholder — brak fabrykowanej pozycji zastępczej.
    expect(within(katalog).getByRole('option', { name: '— wybierz przekaźnik —' })).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-przekaznik-zapisz')).toBeDisabled();
  });
});
