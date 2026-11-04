/**
 * Tabela zbiorcza odcinków SN — kontrakt „jedna ścieżka edycji" (karta JEDNA-SCIEZKA-EDYCJI).
 *
 * Iloczyn cech: rodzaj odcinka (kabel / linia napowietrzna) × kolumna (długość / ułożenie /
 * typ) × wartość (poprawna / odrzucona walidacją rejestru / zestaw „własne") × odpowiedź
 * backendu (sukces / odmowa). Zapis zawsze przez definicję rejestru pól — ten sam ładunek co
 * karta odcinka; komórka bez znaczenia w modelu jest odczytem, nie kontrolką.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';

vi.mock('../../../../ui/catalog/api', () => ({
  fetchCableTypes: vi.fn(async () => [{ id: 'kabel-120', name: 'XRUHAKXS 1x120' }]),
  fetchLineTypes: vi.fn(async () => [{ id: 'afl-70', name: 'AFL-6 70' }]),
}));
vi.mock('../../../kreatory/zrodlo-oze/derSelectionApi', () => ({
  fetchCableLayingConditions: vi.fn(async () => ({
    sets: [
      { name: 'warunki_katalogowe', label_pl: 'Warunki katalogowe', f_grunt: 1, f_wiazka: 1, f_grupa: 1, total: 1, basis: 'b', assumption_pl: 'a' },
      { name: 'ziemia_3_kable', label_pl: 'Ziemia, 3 kable', f_grunt: 1, f_wiazka: 0.9, f_grupa: 0.8, total: 0.72, basis: 'b', assumption_pl: 'a' },
    ],
    custom_name: 'wlasne',
    default_name: 'warunki_katalogowe',
    limitation_pl: 'lista krótka',
  })),
}));
vi.mock('../../../../ui/navigation/routes', () => ({ navigateToNetworkBuild: vi.fn() }));

import { TabelaOdcinkowSN } from '../TabelaOdcinkowSN';

const snapshot = {
  branches: [
    {
      ref_id: 'K1', name: 'Kabel K1', type: 'cable', length_km: 0.85, catalog_ref: 'kabel-120',
      rating: { in_a: 290 }, meta: { cable_laying_conditions: { set_name: 'warunki_katalogowe' } },
    },
    { ref_id: 'L1', name: 'Linia L1', type: 'line_overhead', length_km: 2.4, catalog_ref: null },
    { ref_id: 'Q1', name: 'Łącznik', type: 'switch' },
  ],
};

let execute: ReturnType<typeof vi.fn<unknown[], Promise<unknown>>>;

beforeEach(() => {
  execute = vi.fn<unknown[], Promise<unknown>>(async () => ({ error: undefined }));
  useSnapshotStore.setState({ snapshot: snapshot as never, executeDomainOperation: execute as never });
  useAppStateStore.setState({ activeCaseId: 'case-1' });
});
afterEach(() => cleanup());

const komorka = (klucz: string, ref: string) => `mvd-model-odcinki-tabela-komorka-${klucz}-${ref}`;

describe('TabelaOdcinkowSN', () => {
  it('pokazuje wyłącznie odcinki SN z wartościami z modelu', async () => {
    render(<TabelaOdcinkowSN />);
    expect(screen.getAllByTestId('mvd-model-odcinki-tabela-wiersz')).toHaveLength(2);
    expect((screen.getByTestId(`${komorka('dlugosc', 'K1')}-input`) as HTMLInputElement).value).toBe('850');
    expect(screen.getByTestId(komorka('obciazalnosc', 'K1')).textContent).toBe('290');
    await waitFor(() => expect(screen.getByTestId(`${komorka('typ', 'K1')}-akcja`).textContent).toBe('XRUHAKXS 1x120'));
    expect(screen.getByTestId(`${komorka('typ', 'L1')}-akcja`).textContent).toBe('brak typu — wybierz');
  });

  it.each([
    ['K1', '1200', 1.2],
    ['L1', '35', 0.035],
  ])('długość %s: zapis przez rejestr pól (%s m → %s km)', async (ref, wpis, km) => {
    render(<TabelaOdcinkowSN />);
    const pole = screen.getByTestId(`${komorka('dlugosc', ref)}-input`);
    fireEvent.change(pole, { target: { value: wpis } });
    fireEvent.blur(pole);
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('case-1', 'update_element_parameters', {
        element_ref: ref,
        parameters: { length_km: km },
      }),
    );
  });

  it.each(['0', '-5'])('długość %s odrzucona walidacją rejestru — bez operacji', (wpis) => {
    render(<TabelaOdcinkowSN />);
    const pole = screen.getByTestId(`${komorka('dlugosc', 'K1')}-input`);
    fireEvent.change(pole, { target: { value: wpis } });
    fireEvent.blur(pole);
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByTestId('mvd-model-odcinki-komunikat').textContent).toContain('Kabel K1');
  });

  it('odmowa backendu jest pokazana przy komórce i w komunikacie', async () => {
    execute.mockResolvedValueOnce({ error: 'Długość poza zakresem' });
    render(<TabelaOdcinkowSN />);
    const pole = screen.getByTestId(`${komorka('dlugosc', 'K1')}-input`);
    fireEvent.change(pole, { target: { value: '900' } });
    fireEvent.blur(pole);
    await waitFor(() => expect(screen.getByTestId('mvd-model-odcinki-komunikat').textContent).toContain('Długość poza zakresem'));
    expect(screen.getByText('Błąd zapisu')).toBeTruthy();
  });

  it('ułożenie kabla: zestaw nazwany idzie operacją; linia napowietrzna ma odczyt', async () => {
    render(<TabelaOdcinkowSN />);
    const wybor = await screen.findByTestId(`${komorka('ulozenie', 'K1')}-select`);
    fireEvent.change(wybor, { target: { value: 'ziemia_3_kable' } });
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('case-1', 'update_element_parameters', {
        element_ref: 'K1',
        parameters: { cable_laying_conditions: { set_name: 'ziemia_3_kable' } },
      }),
    );
    expect(screen.queryByTestId(`${komorka('ulozenie', 'L1')}-select`)).toBeNull();
    expect(screen.getByTestId(komorka('ulozenie', 'L1')).textContent).toBe('nie dotyczy linii napowietrznej');
  });

  it('zestaw „własne" i zmiana typu prowadzą do karty odcinka zamiast zapisu bez współczynników', async () => {
    const open = vi.fn();
    useNetworkBuildStore.setState({ openRouteSurface: open as never });
    render(<TabelaOdcinkowSN />);
    fireEvent.change(await screen.findByTestId(`${komorka('ulozenie', 'K1')}-select`), { target: { value: 'wlasne' } });
    expect(execute).not.toHaveBeenCalled();
    expect(open).toHaveBeenLastCalledWith('E-12', expect.objectContaining({ entityRef: 'K1', payload: { defaultCard: 'route' } }));
    fireEvent.click(screen.getByTestId(`${komorka('typ', 'L1')}-akcja`));
    expect(open).toHaveBeenLastCalledWith('E-12', expect.objectContaining({ entityRef: 'L1', payload: { defaultCard: 'catalog' } }));
  });

  it('pusty model: uczciwy stan pusty', () => {
    useSnapshotStore.setState({ snapshot: { branches: [] } as never });
    render(<TabelaOdcinkowSN />);
    expect(screen.getByTestId('mvd-model-odcinki-tabela-pusta')).toBeTruthy();
  });
});
