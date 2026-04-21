/**
 * Data Manager UI State Store
 *
 * P9.1: Persistent UI state for Data Manager (Canonical-grade ergonomics).
 *
 * Persists:
 * - Last selected element type
 * - Column view preset
 * - Sort configuration
 * - Filter settings
 * - Search query
 *
 * Per-project persistence via localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ElementType,
  DataManagerSort,
  DataManagerFilter,
  ColumnViewPreset,
} from '../types';

/**
 * Data Manager UI state interface.
 */
interface DataManagerUIState {
  // Last selected element type (per Data Manager)
  selectedElementType: ElementType | null;

  // Column view preset
  columnViewPreset: ColumnViewPreset;

  // Sort configuration (per element type)
  sortByType: Record<string, DataManagerSort>;

  // Filter configuration (per element type)
  filterByType: Record<string, DataManagerFilter>;

  // Search query (per element type)
  searchQueryByType: Record<string, string>;

  // Actions
  setSelectedElementType: (type: ElementType | null) => void;
  setColumnViewPreset: (preset: ColumnViewPreset) => void;
  setSort: (elementType: ElementType, sort: DataManagerSort) => void;
  setFilter: (elementType: ElementType, filter: DataManagerFilter) => void;
  setSearchQuery: (elementType: ElementType, query: string) => void;
  resetFilters: (elementType: ElementType) => void;
}

/**
 * Default filter state.
 */
const DEFAULT_FILTER: DataManagerFilter = {
  inServiceOnly: false,
  withTypeOnly: false,
  withoutTypeOnly: false,
  switchStateFilter: 'ALL',
  showErrorsOnly: false,
};

/**
 * Default sort state.
 */
const DEFAULT_SORT: DataManagerSort = {
  column: 'name',
  direction: 'asc',
};

/**
 * Zustand store for Data Manager UI state.
 *
 * Usage:
 * ```tsx
 * const { selectedElementType, setSelectedElementType } = useDataManagerUIStore();
 * ```
 */
export const useDataManagerUIStore = create<DataManagerUIState>()(
  persist(
    (set) => ({
      // Initial state
      selectedElementType: null,
      columnViewPreset: 'BASIC',
      sortByType: {},
      filterByType: {},
      searchQueryByType: {},

      // Set selected element type
      setSelectedElementType: (type) =>
        set(() => ({
          selectedElementType: type,
        })),

      // Set column view preset
      setColumnViewPreset: (preset) =>
        set(() => ({
          columnViewPreset: preset,
        })),

      // Set sort for element type
      setSort: (elementType, sort) =>
        set((state) => ({
          sortByType: {
            ...state.sortByType,
            [elementType]: sort,
          },
        })),

      // Set filter for element type
      setFilter: (elementType, filter) =>
        set((state) => ({
          filterByType: {
            ...state.filterByType,
            [elementType]: filter,
          },
        })),

      // Set search query for element type
      setSearchQuery: (elementType, query) =>
        set((state) => ({
          searchQueryByType: {
            ...state.searchQueryByType,
            [elementType]: query,
          },
        })),

      // Reset filters for element type
      resetFilters: (elementType) =>
        set((state) => ({
          filterByType: {
            ...state.filterByType,
            [elementType]: DEFAULT_FILTER,
          },
          searchQueryByType: {
            ...state.searchQueryByType,
            [elementType]: '',
          },
        })),
    }),
    {
      name: 'mv-design-data-manager-ui',
      version: 1,
    }
  )
);

/**
 * Hook to get sort for element type (with default).
 */
export function useDataManagerSort(elementType: ElementType): DataManagerSort {
  const sortByType = useDataManagerUIStore((state) => state.sortByType);
  return sortByType[elementType] ?? DEFAULT_SORT;
}

/**
 * Hook to get filter for element type (with default).
 */
export function useDataManagerFilter(elementType: ElementType): DataManagerFilter {
  const filterByType = useDataManagerUIStore((state) => state.filterByType);
  return filterByType[elementType] ?? DEFAULT_FILTER;
}

/**
 * Hook to get search query for element type (with default).
 */
export function useDataManagerSearchQuery(elementType: ElementType): string {
  const searchQueryByType = useDataManagerUIStore((state) => state.searchQueryByType);
  return searchQueryByType[elementType] ?? '';
}
