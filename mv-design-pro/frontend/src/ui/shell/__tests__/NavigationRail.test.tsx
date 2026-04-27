import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AREA_DEFINITIONS } from '../../navigation/areaRegistry';
import { useAppStateStore } from '../../app-state/store';
import { NavigationRail } from '../NavigationRail';

describe('NavigationRail - pasek obszarów roboczych', () => {
  beforeEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveArea('MODEL_SIECI');
    });
  });

  afterEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveArea('MODEL_SIECI');
    });
  });

  it('renderuje dziewięć kanonicznych obszarów', () => {
    render(<NavigationRail />);
    expect(screen.getByTestId('navigation-rail')).toBeInTheDocument();
    for (const area of AREA_DEFINITIONS) {
      expect(screen.getByTestId(area.testId)).toBeInTheDocument();
    }
  });

  it('klik w obszar Wyniki i analizy aktywuje kanoniczny identyfikator', () => {
    render(<NavigationRail />);
    act(() => {
      fireEvent.click(screen.getByTestId('nav-area-WYNIKI_ANALIZY'));
    });
    expect(useAppStateStore.getState().activeArea).toBe('WYNIKI_ANALIZY');
  });

  it('Ctrl+5 aktywuje obszar Zabezpieczenia i automatyka', () => {
    render(<NavigationRail />);
    act(() => {
      fireEvent.keyDown(window, { key: '5', ctrlKey: true });
    });
    expect(useAppStateStore.getState().activeArea).toBe('ZABEZPIECZENIA_AUTOMATYKA');
  });

  it('Ctrl+9 aktywuje obszar Historia i audyt', () => {
    render(<NavigationRail />);
    act(() => {
      fireEvent.keyDown(window, { key: '9', ctrlKey: true });
    });
    expect(useAppStateStore.getState().activeArea).toBe('HISTORIA_AUDYT');
  });

  it('tooltip i aria-label zawierają pełną nazwę oraz skrót', () => {
    render(<NavigationRail />);
    for (const area of AREA_DEFINITIONS) {
      const button = screen.getByTestId(area.testId);
      expect(button).toHaveAccessibleName(new RegExp(area.labelFull));
      expect(button.getAttribute('title')).toContain(area.shortcut);
      expect(button.getAttribute('title')).toContain(area.labelFull);
    }
  });

  it('nie pokazuje roboczych kodów obszarów jako etykiet', () => {
    render(<NavigationRail />);
    for (const code of ['MO', 'AN', 'ZA', 'OZ', 'RA', 'AD', 'HI']) {
      expect(screen.queryByText(code)).not.toBeInTheDocument();
    }
  });
});
