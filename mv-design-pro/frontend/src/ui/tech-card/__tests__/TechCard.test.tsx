import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TechCard } from '../TechCard';
import type { TechCardSubject } from '../types';

function makeSubject(overrides: Partial<TechCardSubject> = {}): TechCardSubject {
  return {
    kind: 'zksn',
    displayName: 'ZKSN przy magistrali północnej',
    typeLabelPl: 'ZKSN (złączka kablowa SN)',
    technicalId: 'seg/abc123def456ZZZZ/branch_point_1',
    status: 'warning',
    sections: [
      {
        id: 'rola',
        label: 'Rola w sieci',
        fields: [
          { key: 'rola', label: 'Funkcja', value: 'Złączka kablowa SN z odgałęzieniem' },
          { key: 'sekcja', label: 'Sekcja', value: 'Magistrala 1' },
        ],
      },
      {
        id: 'katalog',
        label: 'Katalog',
        fields: [
          { key: 'catalog_ref', label: 'Pozycja katalogowa', value: 'ZPUE/ZKSN-15/630', source: 'catalog' },
        ],
      },
    ],
    diagnostics: [
      { key: 'ref_id', label: 'ref_id', value: 'seg/abc123def456ZZZZ/branch_point_1' },
      { key: 'parent_segment_id', label: 'parent_segment_id', value: 'seg/9aa9bb88cc77dd66/main_run' },
    ],
    readinessBlocker: null,
    ...overrides,
  };
}

describe('TechCard', () => {
  it('renderuje nagłówek w języku projektanta i nie pokazuje surowego identyfikatora', () => {
    render(<TechCard subject={makeSubject()} onClose={() => {}} />);

    expect(screen.getByText('ZKSN przy magistrali północnej')).toBeTruthy();
    expect(screen.getByText('ZKSN (złączka kablowa SN)')).toBeTruthy();
    // Surowy identyfikator nie może być widoczny w nagłówku karty.
    expect(screen.queryByText(/seg\/abc123def456ZZZZ/)).toBeNull();
  });

  it('ukrywa diagnostykę techniczną domyślnie i pokazuje ją po rozwinięciu', () => {
    render(<TechCard subject={makeSubject()} onClose={() => {}} />);

    expect(screen.queryByText('Diagnostyka techniczna')).toBeNull();
    fireEvent.click(screen.getByTestId('tech-card-diagnostics-toggle'));
    expect(screen.getByText('Diagnostyka techniczna')).toBeTruthy();
  });

  it('uwidacznia blokadę gotowości na górze karty', () => {
    render(
      <TechCard
        subject={makeSubject({
          readinessBlocker: 'Brak pozycji katalogowej. Akcja: Dobierz z katalogu.',
        })}
        onClose={() => {}}
      />,
    );

    const headings = screen.getAllByText('Gotowość obliczeniowa');
    expect(headings.length).toBeGreaterThan(0);
    expect(screen.getByText(/Brak pozycji katalogowej/)).toBeTruthy();
  });

  it('odsłania kind jako data-attribute (dla SLD i guardów stylu)', () => {
    const { container } = render(
      <TechCard subject={makeSubject({ kind: 'line_segment' })} onClose={() => {}} />,
    );
    const root = container.querySelector('[data-testid="tech-card"]');
    expect(root?.getAttribute('data-tech-card-kind')).toBe('line_segment');
  });

  it('wywołuje onClose po kliknięciu krzyżyka zamknięcia', () => {
    const onClose = vi.fn();
    render(<TechCard subject={makeSubject()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Zamknij kartę'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
