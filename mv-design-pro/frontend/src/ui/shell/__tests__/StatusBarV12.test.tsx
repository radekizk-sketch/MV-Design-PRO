/**
 * Tests for StatusBarV12 — V12 dolny pasek statusu.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StatusBarV12 } from '../StatusBarV12';
import { useAppStateStore } from '../../app-state/store';

describe('StatusBarV12 — pasek statusu V12', () => {
  beforeEach(() => {
    act(() => {
      const store = useAppStateStore.getState();
      store.setActiveArea('MO');
      store.setActiveWorkMode('TE');
      store.setActiveProject(null);
      store.setActiveCase(null);
      store.setActiveSnapshot(null);
      store.setActiveRun(null);
    });
  });

  afterEach(() => {
    act(() => {
      const store = useAppStateStore.getState();
      store.setActiveArea('MO');
      store.setActiveWorkMode('TE');
    });
  });

  it('renderuje status-bar-v12 i status-area-mode', () => {
    render(<StatusBarV12 />);
    expect(screen.getByTestId('status-bar-v12')).toBeInTheDocument();
    expect(screen.getByTestId('status-area-mode')).toBeInTheDocument();
  });

  it('pokazuje aktywny obszar i tryb pracy w status-area-mode', () => {
    act(() => {
      useAppStateStore.getState().setActiveArea('AN');
      useAppStateStore.getState().setActiveWorkMode('TW');
    });
    render(<StatusBarV12 />);
    expect(screen.getByTestId('status-area-mode')).toHaveTextContent('Studia / Wyniki');
  });

  it('pokazuje status walidacji (valid/warnings/errors)', () => {
    const { rerender } = render(<StatusBarV12 validationStatus="valid" />);
    expect(screen.getByTestId('status-validation')).toBeInTheDocument();

    rerender(<StatusBarV12 validationStatus="warnings" validationWarnings={3} />);
    expect(screen.getByTestId('status-validation')).toBeInTheDocument();
    expect(screen.getByTestId('status-validation').textContent).toMatch(/3/);

    rerender(<StatusBarV12 validationStatus="errors" validationErrors={2} />);
    expect(screen.getByTestId('status-validation').textContent).toMatch(/2/);
  });

  it('pokazuje liczniki sieci', () => {
    render(<StatusBarV12 networkStats={{ nodeCount: 42, branchCount: 17 }} />);
    expect(screen.getByTestId('status-network')).toBeInTheDocument();
    expect(screen.getByTestId('status-network').textContent).toMatch(/42/);
    expect(screen.getByTestId('status-network').textContent).toMatch(/17/);
  });

  describe('Hash audytu (V12S-010 — chain pięciu hashy)', () => {
    afterEach(() => {
      act(() => {
        useAppStateStore.getState().setEnmHashChain(null);
      });
    });

    it('nie pokazuje chipu Hash audytu gdy brak hashy i brak viewHash', () => {
      render(<StatusBarV12 />);
      expect(screen.queryByTestId('status-hash')).not.toBeInTheDocument();
    });

    it('pokazuje chip Hash audytu z fallbackiem viewHash gdy chain pusty', () => {
      render(<StatusBarV12 viewHash="abcdef1234567890" />);
      const chip = screen.getByTestId('status-hash');
      expect(chip).toBeInTheDocument();
      expect(chip.textContent).toMatch(/Hash audytu/);
      expect(chip.textContent).toMatch(/abcdef1234/);
    });

    it('preferuje semantic_hash z chain V12S-010 nad viewHash', () => {
      act(() => {
        useAppStateStore.getState().setEnmHashChain({
          semantic: '11111111aaaaaaaa',
          input: '22222222bbbbbbbb',
          case: '33333333cccccccc',
          variant: '44444444dddddddd',
          switching: '55555555eeeeeeee',
        });
      });
      render(<StatusBarV12 viewHash="legacyhash00000" />);
      const chip = screen.getByTestId('status-hash');
      expect(chip.textContent).toMatch(/11111111/);
      expect(chip.textContent).not.toMatch(/legacyhash/);
    });

    it('eksponuje 5 hashy w tooltipie chipu (title)', () => {
      act(() => {
        useAppStateStore.getState().setEnmHashChain({
          semantic: 'sssssssssssssss',
          input: 'iiiiiiiiiiiiiii',
          case: 'ccccccccccccccc',
          variant: 'vvvvvvvvvvvvvvv',
          switching: 'wwwwwwwwwwwwwww',
        });
      });
      render(<StatusBarV12 />);
      const chip = screen.getByTestId('status-hash');
      const title = chip.getAttribute('title') ?? '';
      expect(title).toMatch(/Semantyka:\s*sssssss/);
      expect(title).toMatch(/Wejścia:\s*iiiiiii/);
      expect(title).toMatch(/Przypadek:\s*ccccccc/);
      expect(title).toMatch(/Wariant:\s*vvvvvvv/);
      expect(title).toMatch(/Łączniki:\s*wwwwwww/);
    });

    it('pokazuje placeholder „—" w tooltipie dla brakujących hashy chainu', () => {
      act(() => {
        useAppStateStore.getState().setEnmHashChain({
          semantic: 'abc12345xyz',
          input: null,
          case: null,
          variant: null,
          switching: null,
        });
      });
      render(<StatusBarV12 />);
      const title = screen.getByTestId('status-hash').getAttribute('title') ?? '';
      expect(title).toMatch(/Wejścia:\s*—/);
      expect(title).toMatch(/Przypadek:\s*—/);
      expect(title).toMatch(/Wariant:\s*—/);
      expect(title).toMatch(/Łączniki:\s*—/);
    });
  });
});
