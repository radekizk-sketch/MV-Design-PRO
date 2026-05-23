import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotFoundPage } from '../NotFoundPage';

describe('NotFoundPage', () => {
  it('renderuje 404 i tytuł', () => {
    render(<NotFoundPage onReturnHome={() => {}} />);
    expect(screen.getByText('404')).toBeTruthy();
    expect(screen.getByText('Nie znaleziono ekranu')).toBeTruthy();
  });

  it('pokazuje attemptedRoute jeśli podany', () => {
    render(<NotFoundPage attemptedRoute="/workspace/dead" onReturnHome={() => {}} />);
    expect(screen.getByTestId('attempted-route').textContent).toBe('/workspace/dead');
  });

  it('button "Wróć do pulpitu projektu" wywołuje onReturnHome', () => {
    const onReturnHome = vi.fn();
    render(<NotFoundPage onReturnHome={onReturnHome} />);
    fireEvent.click(screen.getByTestId('return-home'));
    expect(onReturnHome).toHaveBeenCalledOnce();
  });

  it('pokazuje "Zgłoś błąd" tylko gdy onReportIssue podany', () => {
    const { rerender } = render(<NotFoundPage onReturnHome={() => {}} />);
    expect(screen.queryByTestId('report-issue')).toBeNull();

    rerender(<NotFoundPage onReturnHome={() => {}} onReportIssue={() => {}} />);
    expect(screen.getByTestId('report-issue')).toBeTruthy();
  });

  it('aria-live="polite" dla ogłoszenia screen reader', () => {
    render(<NotFoundPage onReturnHome={() => {}} />);
    const root = screen.getByTestId('screen-not-found');
    expect(root.getAttribute('aria-live')).toBe('polite');
  });
});
