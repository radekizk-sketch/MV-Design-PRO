/**
 * Kreator „Zespół uziemiający SN" (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA) — realna ścieżka
 * użytkownika: render → katalogi trzech przestrzeni → natywne kliki (wariant, kroki, typy,
 * SPZ, wyłączenie od transformatorów) → zapis operacją domenową. Mockowane są tylko store'y
 * i końcówki katalogu, nie ekran; próba `dry_run` idzie przez prawdziwy klient (stub `fetch`).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ladunekProbyZWywolania, wynikiProby } from '../../rama/__tests__/wynikiProby';

import { KreatorZespoluUziemiajacegoSn } from '../KreatorZespoluUziemiajacegoSn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const fetchMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { bay_ref: 'pole-zu-1', bay_name: 'Pole ZU sekcji 1' };
const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: {
    buses: [
      { ref_id: 'wn', voltage_kv: 110 },
      { ref_id: 's1', voltage_kv: 15 },
    ],
    transformers: [{ ref_id: 'tr-1', name: 'T1 110/15 kV', hv_bus_ref: 'wn', lv_bus_ref: 's1' }],
  },
};
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
  navigateToSld: vi.fn(),
}));

const TU = {
  id: 'TU_ZNYN11_15KV_PW160',
  name: 'Transformator uziemiający ZNyn11 15 kV 160 kVA',
  u_n_kv: 15,
  s_n_kva: 160,
  grupa_polaczen: 'ZNyn11',
  r0_ohm: 1.5,
  x0_ohm: 6,
  s_pw_kva: 160,
  u_pw_kv: 0.4,
  wartosci_robocze: { r0_ohm: 'katalog typowy', x0_ohm: 'katalog typowy' },
};
const DL = {
  id: 'DL_40_400A_15KV_CIAGLY',
  name: 'Dławik gaszący 15 kV 40–400 A',
  u_n_kv: 15,
  i_min_a: 40,
  i_max_a: 400,
  regulacja: 'ciagla',
  liczba_zaczepow: null,
  u_wtorne_v: 500,
};
const RZ = {
  id: 'REZ_200A_15KV',
  name: 'Rezystor uziemiający 15 kV 200 A',
  u_n_kv: 15,
  r_ohm: 43.3,
  i_n_a: 200,
  t_s: 10,
};

const { katalogi } = vi.hoisted(() => ({
  katalogi: {
    tu: vi.fn(),
    dl: vi.fn(),
    rz: vi.fn(),
  },
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'błąd katalogu'),
  fetchEarthingTransformerTypes: () => katalogi.tu(),
  fetchArcSuppressionCoilTypes: () => katalogi.dl(),
  fetchNeutralEarthingResistorTypes: () => katalogi.rz(),
}));

const ODMOWA = {
  komunikat: 'Transformator uziemiający na napięcie 20 kV nie pasuje do sieci 15 kV.',
  kod: 'zu.voltage_mismatch',
};

async function wybierz(testid: string, wartosc: string) {
  await waitFor(() =>
    expect(screen.getByTestId(testid).querySelector(`option[value="${wartosc}"]`)).not.toBeNull(),
  );
  await userEvent.selectOptions(screen.getByTestId(testid), wartosc);
}

/** Natywna ścieżka projektanta: wariant → typ TU → Dalej → elementy → Dalej → automatyka. */
async function wypelnij(wariant: 'dlawik' | 'dlawik_rezystor' | 'rezystor' | 'bezposrednie') {
  await userEvent.click(screen.getByTestId(`mvd-kreator-zu-wariant-${wariant}`));
  await wybierz('mvd-kreator-zu-transformator', TU.id);
  await userEvent.click(screen.getByTestId('mvd-kreator-zu-dalej'));
  if (wariant === 'dlawik' || wariant === 'dlawik_rezystor') {
    await wybierz('mvd-kreator-zu-dlawik', DL.id);
  }
  if (wariant === 'rezystor' || wariant === 'dlawik_rezystor') {
    await wybierz('mvd-kreator-zu-rezystor', RZ.id);
  }
}

describe('KreatorZespoluUziemiajacegoSn — realna ścieżka', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(wynikiProby(ODMOWA)[0].odpowiedz);
    vi.stubGlobal('fetch', fetchMock);
    appState.activeCaseId = 'case-1';
    context = { bay_ref: 'pole-zu-1', bay_name: 'Pole ZU sekcji 1' };
    snapshotState.error = null;
    selectionState.selectedElements = [];
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    katalogi.tu.mockReset().mockResolvedValue([TU]);
    katalogi.dl.mockReset().mockResolvedValue([DL]);
    katalogi.rz.mockReset().mockResolvedValue([RZ]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(['dlawik', 'dlawik_rezystor', 'rezystor', 'bezposrednie'] as const)(
    'wariant %s: natywne kliki → operacja z elementami wyłącznie tego wariantu',
    async (wariant) => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      render(<KreatorZespoluUziemiajacegoSn />);
      await wypelnij(wariant);
      await userEvent.click(screen.getByTestId('mvd-kreator-zu-dalej'));
      await userEvent.click(screen.getByTestId('mvd-kreator-zu-wylaczenie-tr-1'));
      await userEvent.click(screen.getByTestId('mvd-kreator-zu-zapisz'));

      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const [sprawa, operacja, ladunek] = executeDomainOperationMock.mock.calls[0];
      expect(sprawa).toBe('case-1');
      expect(operacja).toBe('add_zespol_uziemiajacy_sn');
      expect(ladunek).toMatchObject({
        bay_ref: 'pole-zu-1',
        uziemienie_bezposrednie: wariant === 'bezposrednie',
        spz: false,
        wylaczenie_od_transformatorow_refs: ['tr-1'],
        catalog_binding: expect.objectContaining({ catalog_item_id: TU.id }),
      });
      expect('dlawik' in ladunek).toBe(wariant === 'dlawik' || wariant === 'dlawik_rezystor');
      expect('rezystor' in ladunek).toBe(wariant === 'rezystor' || wariant === 'dlawik_rezystor');
      expect(closeFormMock).toHaveBeenCalled();
    },
  );

  it('Z.13 z AWSC: przełącznik automatyki odsłania pola i niesie je w ładunku', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorZespoluUziemiajacegoSn />);
    await wypelnij('dlawik');
    await userEvent.type(screen.getByTestId('mvd-kreator-zu-dlawik-nastawa'), '120');
    await userEvent.click(screen.getByTestId('mvd-kreator-zu-awsc'));
    await userEvent.type(screen.getByTestId('mvd-kreator-zu-awsc-prad'), '30');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zu-awsc-strona'), 'wtorna');
    await userEvent.click(screen.getByTestId('mvd-kreator-zu-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const ladunek = executeDomainOperationMock.mock.calls[0][2];
    expect(ladunek.dlawik).toMatchObject({
      i_nastawy_a: 120,
      awsc: { i_wymuszany_a: 30, strona: 'wtorna' },
    });
  });

  it('SPZ zaznaczone natywnie trafia do ładunku (regułę SPZ ocenia walidator modelu)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorZespoluUziemiajacegoSn />);
    await wypelnij('rezystor');
    await userEvent.click(screen.getByTestId('mvd-kreator-zu-dalej'));
    await userEvent.click(screen.getByTestId('mvd-kreator-zu-spz'));
    await userEvent.click(screen.getByTestId('mvd-kreator-zu-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    expect(executeDomainOperationMock.mock.calls[0][2]).toMatchObject({ spz: true });
  });

  it('niekompletny formularz: zapis pokazuje błędy pól i nie woła operacji', async () => {
    render(<KreatorZespoluUziemiajacegoSn />);
    await screen.findByRole('option', { name: TU.name });
    await userEvent.click(screen.getByTestId('mvd-kreator-zu-zapisz'));
    expect(await screen.findByText('Wybierz typ transformatora uziemiającego z katalogu.')).toBeInTheDocument();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('odmowa operacji przy zapisie jest pokazana słowami backendu', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: ODMOWA.komunikat });
    render(<KreatorZespoluUziemiajacegoSn />);
    await wypelnij('rezystor');
    await userEvent.click(screen.getByTestId('mvd-kreator-zu-zapisz'));
    expect(await screen.findByText(ODMOWA.komunikat)).toBeInTheDocument();
    expect(closeFormMock).not.toHaveBeenCalled();
  });

  it('uczciwy stan zerowy: bez pola ZU i szyny zapis zablokowany', async () => {
    context = {};
    render(<KreatorZespoluUziemiajacegoSn />);
    await screen.findByRole('option', { name: TU.name });
    expect(screen.getByTestId('mvd-kreator-zu-brak-miejsca')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-zu-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-zu')).toHaveAttribute('data-status', 'zablokowany');
  });

  it('szyna z selekcji, gdy kontekst pusty — zespół wprost na szynie', async () => {
    context = {};
    selectionState.selectedElements = [{ id: 's1', type: 'Bus', name: 'Szyna S1' }];
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorZespoluUziemiajacegoSn />);
    await wypelnij('rezystor');
    await userEvent.click(screen.getByTestId('mvd-kreator-zu-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const ladunek = executeDomainOperationMock.mock.calls[0][2];
    expect(ladunek.bus_ref).toBe('s1');
    expect('bay_ref' in ladunek).toBe(false);
  });

  it('katalog w trakcie ładowania × miejsce dostępne → zapis zablokowany z komunikatem', async () => {
    // Jeden katalog w trakcie ładowania wystarcza do blokady; pozostałe także zawieszone,
    // żeby żadna aktualizacja stanu nie przyszła po końcu testu.
    katalogi.tu.mockReturnValueOnce(new Promise(() => {}));
    katalogi.dl.mockReturnValueOnce(new Promise(() => {}));
    katalogi.rz.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorZespoluUziemiajacegoSn />);
    expect(screen.getByTestId('mvd-kreator-zu-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-zu')).toHaveAttribute('data-status', 'ladowanie');
  });

  it('błąd katalogu jest nazwany, nie pusta lista', async () => {
    katalogi.rz.mockRejectedValueOnce(new Error('katalog rezystorów niedostępny'));
    render(<KreatorZespoluUziemiajacegoSn />);
    await userEvent.click(screen.getByTestId('mvd-kreator-zu-wariant-rezystor'));
    await wybierz('mvd-kreator-zu-transformator', TU.id);
    await userEvent.click(screen.getByTestId('mvd-kreator-zu-dalej'));
    expect(await screen.findByText('katalog rezystorów niedostępny')).toBeInTheDocument();
  });

  it('wartość robocza katalogu typowego jest oznaczona w odczycie typu', async () => {
    render(<KreatorZespoluUziemiajacegoSn />);
    await wybierz('mvd-kreator-zu-transformator', TU.id);
    expect(screen.getByText(/wartość robocza katalogu typowego/)).toBeInTheDocument();
  });

  it.each(wynikiProby(ODMOWA))('próba $nazwa → werdykt operacji w kreatorze', async (wynik) => {
    fetchMock.mockImplementation(wynik.odpowiedz);
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorZespoluUziemiajacegoSn />);
    await wypelnij('rezystor');

    const proba = await screen.findByTestId('mvd-kreator-zu-proba');
    await waitFor(() => expect(proba).toHaveAttribute('data-stan', wynik.stan));
    if (wynik.tresc) expect(proba.textContent).toContain(wynik.tresc);
    expect(screen.getByTestId('mvd-kreator-zu-gotowosc-Kontrola modelu').textContent).toContain(wynik.wiersz);

    await userEvent.click(screen.getByTestId('mvd-kreator-zu-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const ladunekZapisu = executeDomainOperationMock.mock.calls[0][2];
    const ostatniaProba = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1];
    expect(ladunekProbyZWywolania(ostatniaProba)).toEqual({ ...ladunekZapisu, dry_run: true });
  });
});
