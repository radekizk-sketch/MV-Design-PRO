import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

function Boom({ message = 'Test error' }: { message?: string }): JSX.Element {
  throw new Error(message);
}

function Ok(): JSX.Element {
  return <div data-testid="ok-content">OK</div>;
}

describe('ErrorBoundary', () => {
  // React loguje błędy do konsoli z ErrorBoundary - wyciszamy w testach
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('renderuje dzieci gdy brak błędu', () => {
    render(
      <ErrorBoundary>
        <Ok />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('ok-content')).toBeInTheDocument();
  });

  it('renderuje fallback gdy dziecko rzuca błąd', () => {
    render(
      <ErrorBoundary>
        <Boom message="Coś się popsuło" />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByText('Coś poszło nie tak')).toBeInTheDocument();
    expect(screen.getByText(/Coś się popsuło/)).toBeInTheDocument();
  });

  it('renderuje sectionLabel w nagłówku gdy podany', () => {
    render(
      <ErrorBoundary sectionLabel="Środowisko SLD">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Błąd w sekcji: Środowisko SLD/)).toBeInTheDocument();
  });

  it('wywołuje onError callback', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom message="callback test" />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalled();
    const [error] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('callback test');
  });

  it('przycisk "Spróbuj ponownie" jest dostępny w fallback', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const retryButton = screen.getByTestId('error-boundary-retry');
    expect(retryButton).toBeInTheDocument();
    // Kliknięcie nie powinno rzucić wyjątku
    fireEvent.click(retryButton);
  });

  it('renderuje custom fallback gdy prop fallback podany', () => {
    render(
      <ErrorBoundary
        fallback={(error, reset) => (
          <div>
            <div data-testid="custom-fallback">Custom: {error.message}</div>
            <button onClick={reset}>Reset</button>
          </div>
        )}
      >
        <Boom message="customize me" />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('custom-fallback')).toHaveTextContent('Custom: customize me');
  });

  it('zawiera 3 przyciski akcji (Spróbuj / Odśwież / Kopiuj)', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-retry')).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-reload')).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-copy')).toBeInTheDocument();
  });
});
