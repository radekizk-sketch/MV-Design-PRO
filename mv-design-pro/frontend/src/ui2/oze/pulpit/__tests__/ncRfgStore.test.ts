/*
 * Testy wspólnego store'a biegu NC RfG (ui2/oze/ncRfgStore, karty P39 + P47).
 * Logika przeniesiona 1:1 z lokalnego stanu MacierzNcRfg — weryfikacja katalogu,
 * operatora, biegu (sukces/pusty/błąd) i resetu. API mockowane (determinizm).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import {
  fetchNcRfgTestCatalog,
  runNcRfgPtpireeTests,
  type NcRfgModuleInput,
} from '../../../../ui/ncrfg-tests/api';
import { useNcRfgStore } from '../../ncRfgStore';
import { derFixture, katalogFixture, wynikFixture } from '../../macierz/__tests__/fixtures';
import { zbudujModuly, zbudujWejscieModulu } from '../../macierz';

vi.mock('../../../../ui/ncrfg-tests/api', () => ({
  fetchNcRfgTestCatalog: vi.fn(),
  runNcRfgPtpireeTests: vi.fn(),
}));

const fetchMock = vi.mocked(fetchNcRfgTestCatalog);
const runMock = vi.mocked(runNcRfgPtpireeTests);

function wejscia(): readonly NcRfgModuleInput[] {
  const opisy = zbudujModuly([derFixture({ id: 'pv-1', nominal_power_kw: 500 })]);
  return opisy
    .map((o) => zbudujWejscieModulu(o, 'enea'))
    .filter((m): m is NcRfgModuleInput => m !== null);
}

beforeEach(() => {
  useNcRfgStore.getState().reset();
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(katalogFixture());
  runMock.mockResolvedValue(wynikFixture());
});

describe('ncRfgStore — katalog i operator', () => {
  it('zaladujKatalog wczytuje katalog i ustawia domyślnego operatora', async () => {
    await useNcRfgStore.getState().zaladujKatalog();
    const stan = useNcRfgStore.getState();
    expect(stan.katalog?.procedure_version).toBe('PTPiREE Procedura testowania v3.0');
    expect(stan.operatorId).toBe('enea');
    expect(stan.bladKatalogu).toBeNull();
  });

  it('zaladujKatalog jest idempotentny — nie pobiera powtórnie', async () => {
    await useNcRfgStore.getState().zaladujKatalog();
    await useNcRfgStore.getState().zaladujKatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('zaladujKatalog zapisuje błąd, gdy pobranie się nie powiedzie', async () => {
    fetchMock.mockRejectedValueOnce(new Error('katalog niedostępny'));
    await useNcRfgStore.getState().zaladujKatalog();
    const stan = useNcRfgStore.getState();
    expect(stan.katalog).toBeNull();
    expect(stan.bladKatalogu).toBe('katalog niedostępny');
  });

  it('ustawOperator zmienia wybranego operatora', () => {
    useNcRfgStore.getState().ustawOperator('pge');
    expect(useNcRfgStore.getState().operatorId).toBe('pge');
  });
});

describe('ncRfgStore — bieg testów', () => {
  it('przeprowadzTesty z pustą listą modułów jest bez efektu', async () => {
    await useNcRfgStore.getState().przeprowadzTesty([]);
    expect(runMock).not.toHaveBeenCalled();
    expect(useNcRfgStore.getState().status).toBe('idle');
  });

  it('przeprowadzTesty zapisuje wynik i status „ready"', async () => {
    await useNcRfgStore.getState().przeprowadzTesty(wejscia(), 'PTPiREE Procedura testowania v3.0');
    const stan = useNcRfgStore.getState();
    expect(stan.status).toBe('ready');
    expect(stan.wynik?.deterministic_hash).toBe('det-9f8e7d6c');
    expect(stan.bladBiegu).toBeNull();
  });

  it('przeprowadzTesty niesie aktywny przypadek (dowód certyfikatu z modelu)', async () => {
    useAppStateStore.setState({ activeCaseId: 'case-42' });
    try {
      await useNcRfgStore.getState().przeprowadzTesty(wejscia());
      expect(runMock).toHaveBeenCalledWith(expect.anything(), 'case-42');
    } finally {
      useAppStateStore.setState({ activeCaseId: null });
    }
  });

  it('przeprowadzTesty zapisuje błąd i status „error" przy odrzuceniu', async () => {
    runMock.mockRejectedValueOnce(new Error('solver padł'));
    await useNcRfgStore.getState().przeprowadzTesty(wejscia());
    const stan = useNcRfgStore.getState();
    expect(stan.status).toBe('error');
    expect(stan.bladBiegu).toBe('solver padł');
    expect(stan.wynik).toBeNull();
  });

  it('reset przywraca stan początkowy', async () => {
    await useNcRfgStore.getState().zaladujKatalog();
    await useNcRfgStore.getState().przeprowadzTesty(wejscia());
    useNcRfgStore.getState().reset();
    const stan = useNcRfgStore.getState();
    expect(stan.katalog).toBeNull();
    expect(stan.wynik).toBeNull();
    expect(stan.status).toBe('idle');
    expect(stan.operatorId).toBe('enea');
  });
});
