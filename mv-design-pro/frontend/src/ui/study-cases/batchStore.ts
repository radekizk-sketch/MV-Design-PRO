/**
 * Store serii przebiegów (Zustand) — karta BATCH-ROUTER.
 *
 * Seria (wsad) = sekwencja biegów kanonicznych nad scenariuszami zwarciowymi
 * jednego przypadku. Store trzyma WYŁĄCZNIE rekordy serii z backendu
 * (`/api/execution/study-cases/{id}/batches`); biegi serii żyją w
 * `useExecutionRunsStore` (jedno źródło prawdy o biegach — po wykonaniu serii
 * lista biegów jest odświeżana ISTNIEJĄCĄ akcją `loadRuns`, nie liczona tu).
 *
 * ZERO fizyki, ZERO fabrykacji: każda akcja mapuje 1:1 na realną końcówkę.
 */

import { create } from 'zustand';
import type { BatchJob } from './types';
import * as api from './api';
import { useExecutionRunsStore } from './runStore';

interface BatchRunsState {
  /** Przypadek, którego serie trzyma store (zakres listy). */
  activeStudyCaseId: string | null;
  /** Serie aktywnego przypadku, najnowsze pierwsze (porządek z backendu). */
  batches: BatchJob[];
  /** Ładowanie listy (pierwsze pobranie i odświeżenia). */
  isLoading: boolean;
  /** Tworzenie + wykonanie serii w toku. */
  isExecuting: boolean;
  /**
   * Błąd POBRANIA listy serii (stan okna „błąd" przy pustej liście).
   * PREDYKATY PARAMI: rozdzielony od `actionError` — błąd akcji (utworzenie/
   * wykonanie serii) nie może przełączyć całego okna w stan błędu listy.
   */
  listError: string | null;
  /** Błąd ostatniej AKCJI serii (komunikat PL z backendu, pokazywany inline). */
  actionError: string | null;

  /** Ustaw przypadek i pobierz jego serie (null czyści listę). */
  setStudyCaseId: (caseId: string | null) => void;
  /** Pobierz serie przypadku (autorytatywnie z backendu). */
  loadBatches: (caseId: string) => Promise<void>;
  /**
   * Utwórz serię nad scenariuszami i od razu ją wykonaj (dwie realne
   * końcówki: POST batches + POST execute — wzorzec `createAndExecuteRun`).
   * Po wykonaniu odświeża listę serii ORAZ listę biegów przypadku.
   */
  utworzIWykonajSerie: (caseId: string, scenarioIds: string[]) => Promise<BatchJob>;
  /** Wykonaj istniejącą serię PENDING. */
  wykonajSerie: (batchId: string) => Promise<BatchJob>;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  activeStudyCaseId: null,
  batches: [],
  isLoading: false,
  isExecuting: false,
  listError: null,
  actionError: null,
};

/** Po wykonaniu serii biegi kanoniczne są nowe — odśwież JEDNO źródło biegów. */
async function odswiezBiegiPrzypadku(caseId: string): Promise<void> {
  const runsStore = useExecutionRunsStore.getState();
  if (runsStore.activeStudyCaseId === caseId) {
    await runsStore.loadRuns(caseId);
  }
}

export const useBatchRunsStore = create<BatchRunsState>((set, get) => ({
  ...initialState,

  setStudyCaseId: (caseId) => {
    set({ activeStudyCaseId: caseId, batches: [], listError: null, actionError: null });
    if (caseId) {
      void get().loadBatches(caseId);
    }
  },

  loadBatches: async (caseId) => {
    set({ isLoading: true, listError: null });
    try {
      const result = await api.listBatches(caseId);
      // Kontrakt: { batches: BatchJob[] }. Odpowiedź bez tablicy nie może
      // zatruć store'u (wzorzec `runStore.loadRuns`).
      if (!Array.isArray(result?.batches)) {
        throw new Error('Niepoprawna odpowiedź listy serii (brak pola batches)');
      }
      set({ batches: result.batches, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        listError:
          error instanceof Error ? error.message : 'Nie udało się pobrać serii przebiegów',
      });
    }
  },

  utworzIWykonajSerie: async (caseId, scenarioIds) => {
    set({ isExecuting: true, actionError: null });
    try {
      const created = await api.createBatch(caseId, { scenario_ids: scenarioIds });
      const executed = await api.executeBatch(created.batch_id);
      set({ isExecuting: false });
      await get().loadBatches(caseId);
      await odswiezBiegiPrzypadku(caseId);
      return executed;
    } catch (error) {
      set({
        isExecuting: false,
        actionError:
          error instanceof Error ? error.message : 'Nie udało się wykonać serii przebiegów',
      });
      throw error;
    }
  },

  wykonajSerie: async (batchId) => {
    set({ isExecuting: true, actionError: null });
    try {
      const executed = await api.executeBatch(batchId);
      set({ isExecuting: false });
      const caseId = get().activeStudyCaseId;
      if (caseId) {
        await get().loadBatches(caseId);
        await odswiezBiegiPrzypadku(caseId);
      }
      return executed;
    } catch (error) {
      set({
        isExecuting: false,
        actionError:
          error instanceof Error ? error.message : 'Nie udało się wykonać serii przebiegów',
      });
      throw error;
    }
  },

  clearError: () => set({ actionError: null }),

  reset: () => set(initialState),
}));
