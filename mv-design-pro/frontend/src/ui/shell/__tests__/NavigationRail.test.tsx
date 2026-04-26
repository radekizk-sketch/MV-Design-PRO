/**
 * Tests for NavigationRail — V12 obszary aplikacji.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NavigationRail } from '../NavigationRail';
import { useAppStateStore } from '../../app-state/store';

const AREAS = ['MO', 'AN', 'ZA', 'OZ', 'RA', 'AD', 'HI'] as const;

describe('NavigationRail — 7 obszarów V12', () => {
  beforeEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveArea('MO');
    });
  });

  afterEach(() => {
    act(() => {
      useAppStateStore.getState().setActiveArea('MO');
    });
  });

  it('renderuje wszystkie 7 obszarów', () => {
    render(<NavigationRail />);
    expect(screen.getByTestId('navigation-rail')).toBeInTheDocument();
    for (const code of AREAS) {
      expect(screen.getByTestId(`nav-area-${code}`)).toBeInTheDocument();
    }
  });

  it('klik w obszar AN aktywuje AN w store', () => {
    render(<NavigationRail />);
    act(() => {
      fireEvent.click(screen.getByTestId('nav-area-AN'));
    });
    expect(useAppStateStore.getState().activeArea).toBe('AN');
  });

  it('Ctrl+3 aktywuje obszar ZA', () => {
    render(<NavigationRail />);
    act(() => {
      fireEvent.keyDown(window, { key: '3', ctrlKey: true });
    });
    expect(useAppStateStore.getState().activeArea).toBe('ZA');
  });

  it('Ctrl+7 aktywuje obszar HI', () => {
    render(<NavigationRail />);
    act(() => {
      fireEvent.keyDown(window, { key: '7', ctrlKey: true });
    });
    expect(useAppStateStore.getState().activeArea).toBe('HI');
  });

  it('Ctrl+8 NIE zmienia obszaru (poza zakresem)', () => {
    render(<NavigationRail />);
    act(() => {
      useAppStateStore.getState().setActiveArea('MO');
    });
    act(() => {
      fireEvent.keyDown(window, { key: '8', ctrlKey: true });
    });
    expect(useAppStateStore.getState().activeArea).toBe('MO');
  });

  it('aktywny obszar ma klasy bg-scada-active i text-scada-sn', () => {
    act(() => {
      useAppStateStore.getState().setActiveArea('OZ');
    });
    render(<NavigationRail />);
    const button = screen.getByTestId('nav-area-OZ');
    expect(button.className).toMatch(/scada-active/);
    expect(button.className).toMatch(/scada-sn/);
  });

  it('etykiety obszarów są w języku polskim', () => {
    render(<NavigationRail />);
    expect(screen.getByLabelText(/Model sieci/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Analizy/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Zabezpieczenia/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Źródła i profile/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Raporty/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Administracja/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Historia i audyt/)).toBeInTheDocument();
  });
});
