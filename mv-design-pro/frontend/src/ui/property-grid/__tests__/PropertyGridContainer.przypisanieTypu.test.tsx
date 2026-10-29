/**
 * Siatka właściwości → picker typu → operacja `assign_catalog_to_element` (realna ścieżka:
 * natywny klik przycisku sekcji „Referencja typu", wybór wiersza pickera).
 *
 * Zastępuje dawny test, który atrapował funkcje API i wołał je sam (sprawdzał atrapę, nie
 * komponent). Cechy iloczynu:
 * - rodzaj elementu {łącznik — kategoria aparatury SN z filtrem dopuszczenia, transformator —
 *   kategoria bez pól dopuszczenia};
 * - pozycja katalogu {dopuszczona, z SF₆, już przypisana z SF₆};
 * - bieżąca pozycja czytana z `catalog_ref` rekordu ENM (dawne `equipment_type_ref` nie istniało).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../catalog/api', async (importOriginal) => {
  const oryginal = await importOriginal<typeof import('../../catalog/api')>();
  return { ...oryginal, fetchTypesByCategory: vi.fn() };
});
// Sekcja diagnostyki pobiera wyniki zabezpieczeń — poza zakresem tej ścieżki.
vi.mock('../../inspector/DiagnosticsSection', () => ({ DiagnosticsSection: () => null }));

import * as catalogApi from '../../catalog/api';
import { useAppStateStore } from '../../app-state';
import { useSelectionStore } from '../../selection';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { PropertyGridContainer } from '../PropertyGridContainer';

const LACZNIKI = [
  {
    id: 'sw-sf6-a', name: 'Rozłącznik SF6 A', manufacturer: 'X', un_kv: 24, in_a: 630, ik_ka: null, icw_ka: 16,
    medium: 'SF6', gaz_fluorowany: true, dopuszczony_do_nowych_pol: false,
    powod_blokady_nowych_pol_pl: 'Aparat Rozłącznik SF6 A wykorzystuje gaz fluorowany (SF₆).',
  },
  {
    id: 'sw-sf6-b', name: 'Rozłącznik SF6 B', manufacturer: 'X', un_kv: 24, in_a: 630, ik_ka: null, icw_ka: 16,
    medium: 'SF6', gaz_fluorowany: true, dopuszczony_do_nowych_pol: false,
    powod_blokady_nowych_pol_pl: 'Aparat Rozłącznik SF6 B wykorzystuje gaz fluorowany (SF₆).',
  },
  {
    id: 'sw-vac', name: 'Rozłącznik próżniowy', manufacturer: 'Y', un_kv: 24, in_a: 630, ik_ka: null, icw_ka: 16,
    medium: 'VACUUM', gaz_fluorowany: false, dopuszczony_do_nowych_pol: true, powod_blokady_nowych_pol_pl: null,
  },
];

const TRANSFORMATORY = [
  { id: 'tr-1', name: 'Transformator 630 kVA', manufacturer: 'Z', rated_power_mva: 0.63, voltage_hv_kv: 15, voltage_lv_kv: 0.4, uk_percent: 6 },
];

let execMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  execMock = vi.fn().mockResolvedValue({});
  vi.mocked(catalogApi.fetchTypesByCategory).mockImplementation(async (kategoria) =>
    (kategoria === 'SWITCH_EQUIPMENT' ? LACZNIKI : TRANSFORMATORY) as never,
  );
  useSelectionStore.setState({ mode: 'MODEL_EDIT' } as never);
  useSnapshotStore.setState({ executeDomainOperation: execMock as never });
  useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderLacznik(catalogRef: string | null) {
  render(
    <PropertyGridContainer
      projectId="case-1"
      elementId="sw-1"
      elementType="Switch"
      elementName="Łącznik 1"
      elementData={{ ref_id: 'sw-1', type: 'switch', catalog_ref: catalogRef }}
    />,
  );
}

describe('Siatka właściwości — przypisanie typu łącznika', () => {
  it('pozycja przypisana z rekordu ENM (`catalog_ref`) jest widoczna w sekcji typu', () => {
    renderLacznik('sw-vac');
    expect(screen.getByText('ID: sw-vac')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zmień typ...' })).toBeInTheDocument();
  });

  it('picker łącznika ukrywa pozycje z gazem fluorowanym i mówi dlaczego', async () => {
    const user = userEvent.setup();
    renderLacznik(null);
    await user.click(screen.getByRole('button', { name: 'Przypisz typ...' }));
    expect(await screen.findByText('Rozłącznik próżniowy')).toBeInTheDocument();
    expect(screen.queryByText('Rozłącznik SF6 A')).toBeNull();
    expect(screen.queryByText('Rozłącznik SF6 B')).toBeNull();
    expect(screen.getByTestId('type-picker-nota-ukrytych').textContent).toContain(
      'Ukryto pozycje niedopuszczone do obiektu projektowanego: 2.',
    );
    expect(screen.getByText(/medium próżnia/)).toBeInTheDocument();

    await user.click(screen.getByText('Rozłącznik próżniowy'));
    await waitFor(() =>
      expect(execMock).toHaveBeenCalledWith(
        'case-1',
        'assign_catalog_to_element',
        { element_ref: 'sw-1', catalog_item_id: 'sw-vac' },
        { komunikatSukcesuPl: 'Przypisano typ: Rozłącznik próżniowy' },
      ),
    );
  });

  it('pozycja już przypisana z SF₆ zostaje na liście (inne SF₆ — ukryte)', async () => {
    const user = userEvent.setup();
    renderLacznik('sw-sf6-a');
    await user.click(screen.getByRole('button', { name: 'Zmień typ...' }));
    expect(await screen.findByText('Rozłącznik SF6 A')).toBeInTheDocument();
    expect(screen.getByText('Rozłącznik próżniowy')).toBeInTheDocument();
    expect(screen.queryByText('Rozłącznik SF6 B')).toBeNull();
    expect(screen.getByTestId('type-picker-nota-ukrytych').textContent).toContain(': 1.');
  });
});

describe('Siatka właściwości — kategoria bez pól dopuszczenia', () => {
  it('transformator: brak pól dopuszczenia nie ukrywa pozycji', async () => {
    const user = userEvent.setup();
    render(
      <PropertyGridContainer
        projectId="case-1"
        elementId="tr-a"
        elementType="TransformerBranch"
        elementName="Transformator A"
        elementData={{ ref_id: 'tr-a', catalog_ref: null }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Przypisz typ...' }));
    expect(await screen.findByText('Transformator 630 kVA')).toBeInTheDocument();
    expect(screen.queryByTestId('type-picker-nota-ukrytych')).toBeNull();
  });
});
