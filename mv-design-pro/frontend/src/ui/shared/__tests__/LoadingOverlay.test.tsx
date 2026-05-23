import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingOverlay } from '../LoadingOverlay';

describe('LoadingOverlay', () => {
  it('nie renderuje gdy isOpen=false', () => {
    const { container } = render(<LoadingOverlay isOpen={false} title="Loading..." />);
    expect(container.querySelector('[data-testid="loading-overlay"]')).toBeNull();
  });

  it('renderuje title i subtitle', () => {
    render(
      <LoadingOverlay
        isOpen
        title="Trwa rozpływ mocy"
        subtitle="Newton-Raphson, iteracja 7/30"
      />,
    );
    expect(screen.getByTestId('loading-overlay-title')).toHaveTextContent('Trwa rozpływ mocy');
    expect(screen.getByTestId('loading-overlay-subtitle')).toHaveTextContent('Newton-Raphson, iteracja 7/30');
  });

  it('renderuje spinner', () => {
    render(<LoadingOverlay isOpen title="Loading" />);
    expect(screen.getByTestId('loading-overlay-spinner')).toBeInTheDocument();
  });

  it('progress=undefined renderuje indeterminate bar', () => {
    render(<LoadingOverlay isOpen title="Loading" />);
    expect(screen.getByTestId('loading-overlay-indeterminate')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-overlay-progress')).toBeNull();
  });

  it('progress=0.7 renderuje 70% progress bar', () => {
    render(<LoadingOverlay isOpen title="Loading" progress={0.7} />);
    expect(screen.getByTestId('loading-overlay-progress')).toBeInTheDocument();
    expect(screen.getByTestId('loading-overlay-progress-text')).toHaveTextContent('70%');
  });

  it('progress=1.5 clamped do 100%', () => {
    render(<LoadingOverlay isOpen title="Loading" progress={1.5} />);
    expect(screen.getByTestId('loading-overlay-progress-text')).toHaveTextContent('100%');
  });

  it('progress=-0.5 clamped do 0%', () => {
    render(<LoadingOverlay isOpen title="Loading" progress={-0.5} />);
    expect(screen.getByTestId('loading-overlay-progress-text')).toHaveTextContent('0%');
  });

  it('onCancel renderuje przycisk Anuluj', () => {
    const onCancel = vi.fn();
    render(<LoadingOverlay isOpen title="Loading" onCancel={onCancel} />);
    const cancel = screen.getByTestId('loading-overlay-cancel');
    expect(cancel).toBeInTheDocument();
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalled();
  });

  it('bez onCancel brak przycisku Anuluj', () => {
    render(<LoadingOverlay isOpen title="Loading" />);
    expect(screen.queryByTestId('loading-overlay-cancel')).toBeNull();
  });
});
