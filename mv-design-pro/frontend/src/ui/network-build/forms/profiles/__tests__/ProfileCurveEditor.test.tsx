import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileCurveEditor } from '../ProfileCurveEditor';

describe('ProfileCurveEditor', () => {
  const defaultProps = {
    title: 'Q(U) — krzywa testowa',
    xLabel: 'U [pu]',
    yLabel: 'Q [pu]',
    xRange: [0.85, 1.15] as [number, number],
    yRange: [-0.5, 0.5] as [number, number],
    points: [
      { x: 0.85, y: 0.4 },
      { x: 0.95, y: 0.1 },
      { x: 1.0, y: 0.0 },
      { x: 1.05, y: -0.1 },
      { x: 1.15, y: -0.4 },
    ],
  };

  it('renderuje SVG + title', () => {
    render(<ProfileCurveEditor {...defaultProps} />);
    expect(screen.getByTestId('profile-curve-editor')).toBeInTheDocument();
    expect(screen.getByText('Q(U) — krzywa testowa')).toBeInTheDocument();
  });

  it('renderuje wszystkie punkty krzywej', () => {
    render(<ProfileCurveEditor {...defaultProps} />);
    expect(screen.getByTestId('profile-curve-point-0')).toBeInTheDocument();
    expect(screen.getByTestId('profile-curve-point-1')).toBeInTheDocument();
    expect(screen.getByTestId('profile-curve-point-2')).toBeInTheDocument();
    expect(screen.getByTestId('profile-curve-point-3')).toBeInTheDocument();
    expect(screen.getByTestId('profile-curve-point-4')).toBeInTheDocument();
  });

  it('renderuje path z krzywą', () => {
    render(<ProfileCurveEditor {...defaultProps} />);
    const path = screen.getByTestId('profile-curve-path');
    expect(path.getAttribute('d')).toContain('M');
    expect(path.getAttribute('d')).toContain('L');
  });

  it('renderuje labele osi w SVG', () => {
    const { container } = render(<ProfileCurveEditor {...defaultProps} />);
    const texts = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(texts).toContain('U [pu]');
    expect(texts).toContain('Q [pu]');
  });

  it('non-editable shows readonly message', () => {
    render(<ProfileCurveEditor {...defaultProps} editable={false} />);
    expect(screen.getByText(/tylko do odczytu/)).toBeInTheDocument();
  });

  it('editable shows drag hint', () => {
    render(<ProfileCurveEditor {...defaultProps} editable />);
    expect(screen.getByText(/Przeciągnij punkty/)).toBeInTheDocument();
  });

  it('puste points - brak path data', () => {
    render(<ProfileCurveEditor {...defaultProps} points={[]} />);
    const path = screen.getByTestId('profile-curve-path');
    expect(path.getAttribute('d')).toBe('');
  });

  it('tabela renderuje wszystkie punkty', () => {
    const { container } = render(<ProfileCurveEditor {...defaultProps} />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(5);
  });

  it('punkty sortowane po X w renderingu', () => {
    const reverseProps = {
      ...defaultProps,
      points: [
        { x: 1.15, y: -0.4 },
        { x: 0.85, y: 0.4 },
        { x: 1.0, y: 0.0 },
      ],
    };
    const { container } = render(<ProfileCurveEditor {...reverseProps} />);
    // Pierwszy wiersz tabeli = punkt z najmniejszym X
    const firstRow = container.querySelector('tbody tr');
    expect(firstRow?.textContent).toContain('0.850');
  });
});
