/**
 * quickCaseSwitcher — Ctrl+Tab/Cmd+Tab switch między case-ami (Etap 9 z planu).
 *
 * "Quick switcher Ctrl+Tab między case-ami"
 *
 * Funkcjonalność:
 * - Ctrl+Tab przechodzi do następnego case
 * - Ctrl+Shift+Tab do poprzedniego
 * - Ctrl+1...9 wybiera case z indeksu
 * - LIFO order — najnowszy użyty na górze
 */

export interface CaseTab {
  id: string;
  name: string;
  type: string;
  lastActiveAt: number;
}

export interface QuickSwitcherState {
  tabs: CaseTab[];
  activeId: string | null;
  maxTabs: number;
}

const DEFAULT_MAX_TABS = 9;

export function createQuickSwitcher(maxTabs = DEFAULT_MAX_TABS): QuickSwitcherState {
  return { tabs: [], activeId: null, maxTabs };
}

export function activateCase(
  state: QuickSwitcherState,
  caseId: string,
  caseName: string,
  caseType: string,
): QuickSwitcherState {
  const now = Date.now();
  const existing = state.tabs.find((t) => t.id === caseId);
  let newTabs: CaseTab[];
  if (existing) {
    newTabs = state.tabs.map((t) =>
      t.id === caseId ? { ...t, name: caseName, lastActiveAt: now } : t,
    );
  } else {
    const newTab: CaseTab = { id: caseId, name: caseName, type: caseType, lastActiveAt: now };
    newTabs = [...state.tabs, newTab];
    // Enforce maxTabs (kick out najdawniejszy non-active)
    if (newTabs.length > state.maxTabs) {
      const sortedByOldest = [...newTabs]
        .filter((t) => t.id !== caseId)
        .sort((a, b) => a.lastActiveAt - b.lastActiveAt);
      const toRemove = sortedByOldest[0];
      newTabs = newTabs.filter((t) => t.id !== toRemove.id);
    }
  }
  return { ...state, tabs: newTabs, activeId: caseId };
}

export function nextCase(state: QuickSwitcherState): string | null {
  if (state.tabs.length === 0) return null;
  if (!state.activeId) return state.tabs[0].id;
  const idx = state.tabs.findIndex((t) => t.id === state.activeId);
  if (idx === -1 || state.tabs.length === 1) return state.activeId;
  return state.tabs[(idx + 1) % state.tabs.length].id;
}

export function prevCase(state: QuickSwitcherState): string | null {
  if (state.tabs.length === 0) return null;
  if (!state.activeId) return state.tabs[state.tabs.length - 1].id;
  const idx = state.tabs.findIndex((t) => t.id === state.activeId);
  if (idx === -1 || state.tabs.length === 1) return state.activeId;
  return state.tabs[(idx - 1 + state.tabs.length) % state.tabs.length].id;
}

export function caseAtIndex(state: QuickSwitcherState, index: number): string | null {
  if (index < 0 || index >= state.tabs.length) return null;
  return state.tabs[index].id;
}

export function closeCase(state: QuickSwitcherState, caseId: string): QuickSwitcherState {
  const tabs = state.tabs.filter((t) => t.id !== caseId);
  let activeId = state.activeId;
  if (state.activeId === caseId) {
    // Activate most recent remaining
    const sorted = [...tabs].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    activeId = sorted[0]?.id ?? null;
  }
  return { ...state, tabs, activeId };
}

/**
 * matchKeyboard — sprawdza czy event keyboard pasuje do skrótu quick switcher.
 *
 * Zwraca akcję do wykonania lub null.
 */
export type SwitcherAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'index'; index: number };

export function matchKeyboard(event: KeyboardEvent): SwitcherAction | null {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return null;
  if (event.key === 'Tab') {
    return { type: event.shiftKey ? 'prev' : 'next' };
  }
  if (/^[1-9]$/.test(event.key)) {
    return { type: 'index', index: parseInt(event.key, 10) - 1 };
  }
  return null;
}
