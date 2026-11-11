/**
 * Fault Scenarios Store — PR-24
 *
 * Zustand state for fault scenario management.
 * Deterministic sorting by name.
 * No physics, no model mutations, no Date.now(), no Math.random().
 */

import { create } from 'zustand';
import type {
  FaultScenario,
  CreateFaultScenarioRequest,
  UpdateFaultScenarioRequest,
  ScenarioEligibilityResult,
  ScenarioSldOverlay,
} from './types';
import * as api from './api';
import { odswiezWerdyktAktywnegoPrzypadku } from '../study-cases/store';

interface FaultScenariosState {
  studyCaseId: string | null;
  scenarios: FaultScenario[];
  selectedScenarioId: string | null;
  eligibility: ScenarioEligibilityResult | null;
  sldOverlay: ScenarioSldOverlay | null;
  isLoading: boolean;
  isModalOpen: boolean;
  editingScenarioId: string | null;
  error: string | null;

  setStudyCaseId: (id: string | null) => void;
  loadScenarios: (studyCaseId: string) => Promise<void>;
  selectScenario: (scenarioId: string | null) => void;
  createScenario: (studyCaseId: string, data: CreateFaultScenarioRequest) => Promise<FaultScenario>;
  updateScenario: (scenarioId: string, data: UpdateFaultScenarioRequest) => Promise<FaultScenario>;
  deleteScenario: (scenarioId: string) => Promise<void>;
  checkEligibility: (scenarioId: string) => Promise<void>;
  loadSldOverlay: (scenarioId: string) => Promise<void>;
  createRun: (scenarioId: string) => Promise<Record<string, unknown>>;
  openModal: (scenarioId?: string) => void;
  closeModal: () => void;
  clearError: () => void;
  reset: () => void;
}

/**
 * Przypadek scenariusza z jego rekordu na liście — scenariusz jest adresowany w obrębie
 * przypadku (backend wyszukuje go wyłącznie w projekcie przypadku). Scenariusz spoza listy
 * to błąd wywołującego, nie adres do zgadnięcia.
 */
function przypadekScenariusza(scenarios: FaultScenario[], scenarioId: string): string {
  const scenariusz = scenarios.find((s) => s.scenario_id === scenarioId);
  if (!scenariusz) {
    throw new Error(`Scenariusz ${scenarioId} nie należy do wczytanej listy przypadku`);
  }
  return scenariusz.study_case_id;
}

function sortScenarios(scenarios: FaultScenario[]): FaultScenario[] {
  return [...scenarios].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

const initialState = {
  studyCaseId: null as string | null,
  scenarios: [] as FaultScenario[],
  selectedScenarioId: null as string | null,
  eligibility: null as ScenarioEligibilityResult | null,
  sldOverlay: null as ScenarioSldOverlay | null,
  isLoading: false,
  isModalOpen: false,
  editingScenarioId: null as string | null,
  error: null as string | null,
};

export const useFaultScenariosStore = create<FaultScenariosState>((set, get) => ({
  ...initialState,

  setStudyCaseId: (id) => {
    const current = get().studyCaseId;
    if (current !== id) {
      set({ studyCaseId: id, scenarios: [], selectedScenarioId: null, error: null });
      if (id) { get().loadScenarios(id); }
    }
  },

  loadScenarios: async (studyCaseId) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.fetchScenarios(studyCaseId);
      set({ scenarios: sortScenarios(response.scenarios), isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd ładowania scenariuszy';
      set({ error: message, isLoading: false });
    }
  },

  selectScenario: (scenarioId) => {
    set({ selectedScenarioId: scenarioId, eligibility: null, sldOverlay: null });
    if (scenarioId) {
      get().checkEligibility(scenarioId);
      get().loadSldOverlay(scenarioId);
    }
  },

  createScenario: async (studyCaseId, data) => {
    set({ isLoading: true, error: null });
    try {
      const scenario = await api.createScenario(studyCaseId, data);
      set((state) => ({
        scenarios: sortScenarios([...state.scenarios, scenario]),
        isLoading: false,
        isModalOpen: false,
        editingScenarioId: null,
      }));
      odswiezWerdyktAktywnegoPrzypadku();
      return scenario;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd tworzenia scenariusza';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  updateScenario: async (scenarioId, data) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await api.updateScenario(
        przypadekScenariusza(get().scenarios, scenarioId),
        scenarioId,
        data,
      );
      set((state) => ({
        scenarios: sortScenarios(state.scenarios.map((s) => (s.scenario_id === scenarioId ? updated : s))),
        isLoading: false,
        isModalOpen: false,
        editingScenarioId: null,
      }));
      odswiezWerdyktAktywnegoPrzypadku();
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd aktualizacji scenariusza';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteScenario: async (scenarioId) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteScenario(przypadekScenariusza(get().scenarios, scenarioId), scenarioId);
      set((state) => ({
        scenarios: state.scenarios.filter((s) => s.scenario_id !== scenarioId),
        selectedScenarioId: state.selectedScenarioId === scenarioId ? null : state.selectedScenarioId,
        isLoading: false,
      }));
      odswiezWerdyktAktywnegoPrzypadku();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd usuwania scenariusza';
      set({ error: message, isLoading: false });
    }
  },

  checkEligibility: async (scenarioId) => {
    try {
      const eligibility = await api.fetchScenarioEligibility(
        przypadekScenariusza(get().scenarios, scenarioId),
        scenarioId,
      );
      set({ eligibility });
    } catch { /* non-critical */ }
  },

  loadSldOverlay: async (scenarioId) => {
    try {
      const overlay = await api.fetchScenarioSldOverlay(
        przypadekScenariusza(get().scenarios, scenarioId),
        scenarioId,
      );
      set({ sldOverlay: overlay });
    } catch { /* non-critical */ }
  },

  createRun: async (scenarioId) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.createRunFromScenario(
        przypadekScenariusza(get().scenarios, scenarioId),
        scenarioId,
      );
      set({ isLoading: false });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd uruchamiania analizy';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  openModal: (scenarioId) => {
    set({ isModalOpen: true, editingScenarioId: scenarioId ?? null, error: null });
  },

  closeModal: () => { set({ isModalOpen: false, editingScenarioId: null }); },
  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}));

export function useSelectedScenario(): FaultScenario | null {
  return useFaultScenariosStore((state) => {
    if (!state.selectedScenarioId) return null;
    return state.scenarios.find((s) => s.scenario_id === state.selectedScenarioId) ?? null;
  });
}

export function useScenarioEligibility(): ScenarioEligibilityResult | null {
  return useFaultScenariosStore((state) => state.eligibility);
}

export function useScenarioSldOverlay(): ScenarioSldOverlay | null {
  return useFaultScenariosStore((state) => state.sldOverlay);
}
