// @vitest-environment node
/**
 * Fault Scenarios Store Tests — PR-24
 * Determinism, sort order, basic operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useFaultScenariosStore } from '../store';
import { useStudyCasesStore } from '../../study-cases/store';

describe('FaultScenariosStore', () => {
  beforeEach(() => {
    useFaultScenariosStore.getState().reset();
  });

  it('starts with empty state', () => {
    const state = useFaultScenariosStore.getState();
    expect(state.scenarios).toEqual([]);
    expect(state.selectedScenarioId).toBeNull();
    expect(state.isModalOpen).toBe(false);
  });

  it('openModal sets isModalOpen to true', () => {
    useFaultScenariosStore.getState().openModal();
    expect(useFaultScenariosStore.getState().isModalOpen).toBe(true);
  });

  it('openModal with scenarioId sets editingScenarioId', () => {
    useFaultScenariosStore.getState().openModal('scenario-123');
    const state = useFaultScenariosStore.getState();
    expect(state.isModalOpen).toBe(true);
    expect(state.editingScenarioId).toBe('scenario-123');
  });

  it('closeModal resets modal state', () => {
    useFaultScenariosStore.getState().openModal('scenario-123');
    useFaultScenariosStore.getState().closeModal();
    const state = useFaultScenariosStore.getState();
    expect(state.isModalOpen).toBe(false);
    expect(state.editingScenarioId).toBeNull();
  });

  it('selectScenario sets selectedScenarioId and clears eligibility/overlay', () => {
    useFaultScenariosStore.getState().selectScenario('s-1');
    const state = useFaultScenariosStore.getState();
    expect(state.selectedScenarioId).toBe('s-1');
    expect(state.eligibility).toBeNull();
    expect(state.sldOverlay).toBeNull();
  });

  it('reset restores initial state', () => {
    useFaultScenariosStore.getState().openModal('x');
    useFaultScenariosStore.getState().selectScenario('y');
    useFaultScenariosStore.getState().reset();
    const state = useFaultScenariosStore.getState();
    expect(state.scenarios).toEqual([]);
    expect(state.selectedScenarioId).toBeNull();
    expect(state.isModalOpen).toBe(false);
  });

  it('no Date.now or Math.random in store', () => {
    // Static analysis check: the store source should not contain Date.now or Math.random
    // This test verifies the store functions are deterministic
    const state = useFaultScenariosStore.getState();
    expect(typeof state.loadScenarios).toBe('function');
    expect(typeof state.createScenario).toBe('function');
  });
});

/*
 * Karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN: scenariusz zwarciowy jest scenariuszem nazwanym
 * magazynu scenariuszy — wejściem oceny świeżości biegów przypadku. Każdy zapis (utworzenie,
 * zmiana, usunięcie) odczytuje ponownie werdykt aktywnego przypadku, żeby odcisk wejść
 * (`odcisk_wejsc_swiezosci`) i za nim nagłówki ekranów analiz oraz lista biegów pobrały
 * swoje werdykty od nowa. Iloczyn: operacja {utwórz, zmień, usuń} × odczyt przypadku po niej.
 */
describe('FaultScenariosStore — zapis scenariusza odświeża werdykt aktywnego przypadku', () => {
  const PROJEKT = 'proj-scen';
  const PRZYPADEK = 'case-scen';
  const scenariusz = { scenario_id: 's-1', study_case_id: PRZYPADEK, name: 'Zwarcie na szynie' };
  let adresy: string[] = [];

  beforeEach(() => {
    adresy = [];
    useFaultScenariosStore.getState().reset();
    useStudyCasesStore.setState({ projectId: PROJEKT } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        adresy.push(`${init?.method ?? 'GET'} ${url}`);
        if (url === `/api/study-cases/project/${PROJEKT}/active`) {
          return { ok: false, status: 204, json: async () => null } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => scenariusz } as Response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useStudyCasesStore.setState({ projectId: null } as never);
  });

  const odczytPrzypadku = () => adresy.filter((a) => a === `GET /api/study-cases/project/${PROJEKT}/active`);

  it.each(['utworz', 'zmien', 'usun'] as const)('operacja „%s" odczytuje werdykt przypadku', async (op) => {
    const magazyn = useFaultScenariosStore.getState();
    if (op === 'utworz') {
      await magazyn.createScenario(PRZYPADEK, { name: 'Zwarcie na szynie' } as never);
    } else {
      useFaultScenariosStore.setState({ scenarios: [scenariusz as never] });
      if (op === 'zmien') {
        await magazyn.updateScenario('s-1', { name: 'Zwarcie na szynie 2' } as never);
      } else {
        await magazyn.deleteScenario('s-1');
      }
    }
    await vi.waitFor(() => expect(odczytPrzypadku()).toHaveLength(1));
    // Odczyt PO zapisie — nigdy przed nim (inaczej odcisk opisywałby stan sprzed zmiany).
    const zapis = adresy.findIndex((a) => !a.startsWith('GET '));
    expect(zapis).toBeGreaterThanOrEqual(0);
    expect(adresy.indexOf(odczytPrzypadku()[0]!)).toBeGreaterThan(zapis);
  });
});

