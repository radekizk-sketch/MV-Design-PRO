import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Breadcrumbs } from '../Breadcrumbs';

describe('Breadcrumbs', () => {
  it('renderuje wszystkie segmenty', () => {
    render(
      <Breadcrumbs
        segments={[
          { label: 'Pulpit' },
          { label: 'Projekt X' },
          { label: 'Wariant Y' },
          { label: 'SLD' },
        ]}
      />,
    );
    expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument();
    expect(screen.getByText('Pulpit')).toBeInTheDocument();
    expect(screen.getByText('Projekt X')).toBeInTheDocument();
    expect(screen.getByText('Wariant Y')).toBeInTheDocument();
    expect(screen.getByText('SLD')).toBeInTheDocument();
  });

  it('ostatni segment jest current (nie klikalny)', () => {
    render(
      <Breadcrumbs
        segments={[
          { label: 'A', onClick: vi.fn() },
          { label: 'B', onClick: vi.fn() },
          { label: 'C', onClick: vi.fn() },
        ]}
      />,
    );
    expect(screen.getByTestId('breadcrumb-current-2')).toHaveTextContent('C');
    expect(screen.queryByTestId('breadcrumb-link-2')).toBeNull();
  });

  it('klik na link wywołuje callback', () => {
    const onClickA = vi.fn();
    const onClickB = vi.fn();
    render(
      <Breadcrumbs
        segments={[
          { label: 'A', onClick: onClickA },
          { label: 'B', onClick: onClickB },
          { label: 'C' },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId('breadcrumb-link-0'));
    expect(onClickA).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('breadcrumb-link-1'));
    expect(onClickB).toHaveBeenCalled();
  });

  it('segment bez onClick renderowany jako current text', () => {
    render(
      <Breadcrumbs
        segments={[
          { label: 'A', onClick: vi.fn() },
          { label: 'B' }, // brak onClick
          { label: 'C', onClick: vi.fn() },
        ]}
      />,
    );
    expect(screen.getByTestId('breadcrumb-current-1')).toHaveTextContent('B');
    expect(screen.queryByTestId('breadcrumb-link-1')).toBeNull();
  });

  it('separator default to ›', () => {
    const { container } = render(
      <Breadcrumbs segments={[{ label: 'A' }, { label: 'B' }]} />,
    );
    expect(container.textContent).toContain('›');
  });

  it('custom separator', () => {
    const { container } = render(
      <Breadcrumbs segments={[{ label: 'A' }, { label: 'B' }]} separator="/" />,
    );
    expect(container.textContent).toContain('/');
  });

  it('renderuje ikony per segment', () => {
    render(
      <Breadcrumbs
        segments={[
          { label: 'Home', icon: <span>🏠</span> },
          { label: 'Projekt' },
        ]}
      />,
    );
    expect(screen.getByTestId('breadcrumb-icon-0')).toBeInTheDocument();
    expect(screen.queryByTestId('breadcrumb-icon-1')).toBeNull();
  });

  it('aria-label "Ścieżka nawigacji"', () => {
    render(<Breadcrumbs segments={[{ label: 'A' }]} />);
    expect(screen.getByLabelText('Ścieżka nawigacji')).toBeInTheDocument();
  });

  it('current segment ma aria-current="page"', () => {
    render(
      <Breadcrumbs
        segments={[
          { label: 'A' },
          { label: 'B' },
        ]}
      />,
    );
    const current = screen.getByTestId('breadcrumb-current-1');
    expect(current).toHaveAttribute('aria-current', 'page');
  });
});
