/**
 * RunButton tests — PR-14 wykonywanie obliczeń.
 *
 * INVARIANTS:
 * - Disabled gdy readiness.ready === false
 * - Disabled gdy run is in progress
 * - 100% PL etykiety
 * - NO physics, NO model mutation
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunButton } from '../RunButton';
import { useExecutionRunsStore } from '../runStore';
import type { ExecutionAnalysisType } from '../types';

afterEach(() => {
  // Reset run store state between tests
  useExecutionRunsStore.setState({
    isCreatingRun: false,
    isExecutingRun: false,
  });
});

describe('RunButton — labels per analysis type', () => {
  it('renders Polish label for SC_3F', () => {
    render(
      <RunButton readinessReady analysisType="SC_3F" onRun={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toHaveTextContent(
      'Oblicz: Zwarcie trójfazowe (3F)',
    );
  });

  it('renders Polish label for LOAD_FLOW', () => {
    render(
      <RunButton readinessReady analysisType="LOAD_FLOW" onRun={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('Oblicz: Rozpływ mocy');
  });

  it.each<[ExecutionAnalysisType, string]>([
    ['SC_1F', 'Zwarcie jednofazowe (1F)'],
    ['SC_2F', 'Zwarcie dwufazowe (2F)'],
    ['SC_2F_G', 'Zwarcie dwufazowe z ziemią (2F+Z)'],
    ['PHASE_STATE_SN', 'Stan fazowy SN'],
    ['DYNAMIC_STABILITY', 'Stabilność dynamiczna'],
    ['SOURCE_COMPLIANCE', 'Zgodność źródła'],
  ])('renders Polish label for %s', (analysisType, expectedLabel) => {
    render(<RunButton readinessReady analysisType={analysisType} onRun={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent(`Oblicz: ${expectedLabel}`);
  });
});

describe('RunButton — disabled states', () => {
  it('enabled when readinessReady=true and no run in progress', () => {
    render(
      <RunButton readinessReady analysisType="SC_3F" onRun={vi.fn()} />,
    );
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('disabled when readinessReady=false', () => {
    render(
      <RunButton readinessReady={false} analysisType="SC_3F" onRun={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disabled when run is creating', () => {
    useExecutionRunsStore.setState({ isCreatingRun: true });
    render(
      <RunButton readinessReady analysisType="SC_3F" onRun={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disabled when run is executing', () => {
    useExecutionRunsStore.setState({ isExecutingRun: true });
    render(
      <RunButton readinessReady analysisType="SC_3F" onRun={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disabled when external disabled prop is true', () => {
    render(
      <RunButton readinessReady analysisType="SC_3F" onRun={vi.fn()} disabled />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('RunButton — label/tooltip during run', () => {
  it('shows "Obliczanie..." text when run in progress', () => {
    useExecutionRunsStore.setState({ isExecutingRun: true });
    render(
      <RunButton readinessReady analysisType="SC_3F" onRun={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('Obliczanie...');
  });

  it('tooltip: "Sieć nie jest gotowa do obliczeń" when readiness=false', () => {
    render(
      <RunButton readinessReady={false} analysisType="SC_3F" onRun={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      'Sieć nie jest gotowa do obliczeń',
    );
  });

  it('tooltip: "Obliczenie w trakcie — proszę czekać" when in progress', () => {
    useExecutionRunsStore.setState({ isExecutingRun: true });
    render(
      <RunButton readinessReady analysisType="SC_3F" onRun={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      'Obliczenie w trakcie — proszę czekać',
    );
  });

  it('tooltip: "Uruchom obliczenie: ..." when ready', () => {
    render(
      <RunButton readinessReady analysisType="LOAD_FLOW" onRun={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      'Uruchom obliczenie: Rozpływ mocy',
    );
  });
});

describe('RunButton — onRun callback', () => {
  it('invokes onRun with analysis type on click when enabled', () => {
    const onRun = vi.fn();
    render(
      <RunButton readinessReady analysisType="SC_3F" onRun={onRun} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith('SC_3F');
  });

  it('does NOT invoke onRun when disabled (readiness=false)', () => {
    const onRun = vi.fn();
    render(
      <RunButton readinessReady={false} analysisType="SC_3F" onRun={onRun} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onRun).not.toHaveBeenCalled();
  });

  it('does NOT invoke onRun when run is in progress', () => {
    const onRun = vi.fn();
    useExecutionRunsStore.setState({ isExecutingRun: true });
    render(
      <RunButton readinessReady analysisType="SC_3F" onRun={onRun} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onRun).not.toHaveBeenCalled();
  });
});
