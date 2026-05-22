import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AREA_DEFINITIONS } from '../../navigation/areaRegistry';
import { useAppStateStore } from '../../app-state/store';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { NavigationRail } from '../NavigationRail';

describe('NavigationRail - pasek obszarów roboczych', () => {
  beforeEach(() => {
    act(() => {
      window.history.replaceState(null, '', '/#variants');
      useAppStateStore.getState().setActiveArea('MODEL_SIECI');
      useNetworkBuildStore.getState().reset();
    });
  });

  afterEach(() => {
    act(() => {
      window.history.replaceState(null, '', '/');
      useAppStateStore.getState().setActiveArea('MODEL_SIECI');
      useNetworkBuildStore.getState().reset();
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
    expect(window.location.hash).toBe('#analysis');
  });

  it('klik w Raporty przechodzi na powierzchnie raportu i zachowuje kontekst przebiegu', () => {
    act(() => {
      window.history.replaceState(
        null,
        '',
        '/#sld?case=case-1&run=run-1&sel=source-1&type=Source&name=GPZ',
      );
      useAppStateStore.getState().setActiveArea('SCHEMAT_TOPOLOGIA');
    });

    render(<NavigationRail />);
    act(() => {
      fireEvent.click(screen.getByTestId('nav-area-RAPORTY_UZASADNIENIA'));
    });

    expect(useAppStateStore.getState().activeArea).toBe('RAPORTY_UZASADNIENIA');
    expect(window.location.hash).toContain('#report');
    expect(window.location.hash).toContain('case=case-1');
    expect(window.location.hash).toContain('run=run-1');
    expect(window.location.hash).toContain('sel=source-1');
  });

  it('Ctrl+5 aktywuje obszar Zabezpieczenia i automatyka', () => {
    render(<NavigationRail />);
    act(() => {
      fireEvent.keyDown(window, { key: '5', ctrlKey: true });
    });
    expect(useAppStateStore.getState().activeArea).toBe('ZABEZPIECZENIA_AUTOMATYKA');
  });

  it('klik w Schemat wraca do bazowej kanwy SLD i zamyka widok pomocniczy', () => {
    act(() => {
      useNetworkBuildStore.getState().openRouteSurface('E-28', {
        titlePl: 'Koordynacja zabezpieczeń',
        route: 'analysis',
        openMode: 'expand_workspace',
      });
    });
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-28');

    render(<NavigationRail />);
    act(() => {
      fireEvent.click(screen.getByTestId('nav-area-SCHEMAT_TOPOLOGIA'));
    });

    expect(useAppStateStore.getState().activeArea).toBe('SCHEMAT_TOPOLOGIA');
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
    expect(useNetworkBuildStore.getState().surfaceStack).toHaveLength(0);
    expect(window.location.hash).toBe('#sld');
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
