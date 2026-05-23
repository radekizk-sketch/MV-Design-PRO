import { describe, expect, it } from 'vitest';
import {
  createQuickSwitcher,
  activateCase,
  nextCase,
  prevCase,
  caseAtIndex,
  closeCase,
  matchKeyboard,
} from '../quickCaseSwitcher';

describe('createQuickSwitcher', () => {
  it('empty initial state', () => {
    const s = createQuickSwitcher();
    expect(s.tabs).toHaveLength(0);
    expect(s.activeId).toBe(null);
    expect(s.maxTabs).toBe(9);
  });
});

describe('activateCase', () => {
  it('dodaje nowy case + ustawia jako active', () => {
    let s = createQuickSwitcher();
    s = activateCase(s, 'case-1', 'Wariant 1', 'power_flow');
    expect(s.tabs).toHaveLength(1);
    expect(s.activeId).toBe('case-1');
  });

  it('re-activate istniejącego case', () => {
    let s = createQuickSwitcher();
    s = activateCase(s, 'case-1', 'Wariant 1', 'pf');
    s = activateCase(s, 'case-2', 'Wariant 2', 'pf');
    s = activateCase(s, 'case-1', 'Wariant 1 zaktualizowany', 'pf');
    expect(s.tabs).toHaveLength(2);
    expect(s.activeId).toBe('case-1');
    expect(s.tabs.find((t) => t.id === 'case-1')?.name).toBe('Wariant 1 zaktualizowany');
  });

  it('enforce maxTabs - kick out najstarszy', () => {
    let s = createQuickSwitcher(3);
    s = activateCase(s, 'a', 'A', 'pf');
    s = activateCase(s, 'b', 'B', 'pf');
    s = activateCase(s, 'c', 'C', 'pf');
    s = activateCase(s, 'd', 'D', 'pf');
    expect(s.tabs).toHaveLength(3);
    expect(s.tabs.find((t) => t.id === 'a')).toBeUndefined();
    expect(s.tabs.find((t) => t.id === 'd')).toBeDefined();
  });
});

describe('nextCase / prevCase', () => {
  it('next: idzie do następnego w order', () => {
    let s = createQuickSwitcher();
    s = activateCase(s, 'a', 'A', 'pf');
    s = activateCase(s, 'b', 'B', 'pf');
    s = activateCase(s, 'c', 'C', 'pf');
    // active = c (last added), next should wrap to 'a'
    expect(nextCase(s)).toBe('a');
  });

  it('prev: idzie wstecz', () => {
    let s = createQuickSwitcher();
    s = activateCase(s, 'a', 'A', 'pf');
    s = activateCase(s, 'b', 'B', 'pf');
    s = activateCase(s, 'c', 'C', 'pf');
    expect(prevCase(s)).toBe('b');
  });

  it('next pusty stan → null', () => {
    expect(nextCase(createQuickSwitcher())).toBe(null);
    expect(prevCase(createQuickSwitcher())).toBe(null);
  });

  it('single case → zwraca ten sam', () => {
    let s = createQuickSwitcher();
    s = activateCase(s, 'only', 'Only', 'pf');
    expect(nextCase(s)).toBe('only');
    expect(prevCase(s)).toBe('only');
  });
});

describe('caseAtIndex', () => {
  it('zwraca case z indeksu (0-based)', () => {
    let s = createQuickSwitcher();
    s = activateCase(s, 'a', 'A', 'pf');
    s = activateCase(s, 'b', 'B', 'pf');
    expect(caseAtIndex(s, 0)).toBe('a');
    expect(caseAtIndex(s, 1)).toBe('b');
  });

  it('null gdy out of bounds', () => {
    let s = createQuickSwitcher();
    s = activateCase(s, 'a', 'A', 'pf');
    expect(caseAtIndex(s, 5)).toBe(null);
    expect(caseAtIndex(s, -1)).toBe(null);
  });
});

describe('closeCase', () => {
  it('usuwa case z tabs', () => {
    let s = createQuickSwitcher();
    s = activateCase(s, 'a', 'A', 'pf');
    s = activateCase(s, 'b', 'B', 'pf');
    s = closeCase(s, 'a');
    expect(s.tabs).toHaveLength(1);
  });

  it('zamknięcie active → aktywuje most recent', () => {
    let s = createQuickSwitcher();
    s = activateCase(s, 'a', 'A', 'pf');
    s = activateCase(s, 'b', 'B', 'pf');
    s = activateCase(s, 'a', 'A', 'pf'); // a is now active and most recent
    s = closeCase(s, 'a');
    expect(s.activeId).toBe('b');
  });

  it('zamknięcie ostatniego → activeId null', () => {
    let s = createQuickSwitcher();
    s = activateCase(s, 'a', 'A', 'pf');
    s = closeCase(s, 'a');
    expect(s.activeId).toBe(null);
    expect(s.tabs).toHaveLength(0);
  });
});

describe('matchKeyboard', () => {
  function event(opts: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: '',
      ...opts,
    } as KeyboardEvent;
  }

  it('Ctrl+Tab → next', () => {
    expect(matchKeyboard(event({ ctrlKey: true, key: 'Tab' }))).toEqual({ type: 'next' });
  });

  it('Ctrl+Shift+Tab → prev', () => {
    expect(matchKeyboard(event({ ctrlKey: true, shiftKey: true, key: 'Tab' }))).toEqual({
      type: 'prev',
    });
  });

  it('Ctrl+5 → index 4', () => {
    expect(matchKeyboard(event({ ctrlKey: true, key: '5' }))).toEqual({ type: 'index', index: 4 });
  });

  it('Cmd+Tab (Mac) działa jak Ctrl+Tab', () => {
    expect(matchKeyboard(event({ metaKey: true, key: 'Tab' }))).toEqual({ type: 'next' });
  });

  it('bez modyfikatora → null', () => {
    expect(matchKeyboard(event({ key: 'Tab' }))).toBe(null);
  });
});
