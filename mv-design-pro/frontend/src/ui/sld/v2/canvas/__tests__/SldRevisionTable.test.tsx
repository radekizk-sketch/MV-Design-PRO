/**
 * K30-100: SldRevisionTable — revision history table dla OSD wniosek.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SldRevisionTable, type SldRevisionEntry } from '../SldRevisionTable';

afterEach(() => cleanup());

describe('SldRevisionTable — K30-100 tabela rewizji OSD', () => {
  it('renderuje empty state gdy brak entries', () => {
    const { container } = render(<svg><SldRevisionTable /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-revision-empty"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-revision-table"]')?.getAttribute('data-row-count')).toBe('0');
  });

  it('renderuje header z kolumnami R/Data/Opis/Proj/Sprawdził', () => {
    const { container, getByText } = render(<svg><SldRevisionTable /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-revision-header"]')).toBeTruthy();
    expect(getByText('Opis zmian')).toBeInTheDocument();
    expect(getByText('Sprawdził')).toBeInTheDocument();
  });

  it('renderuje rows dla entries', () => {
    const entries: SldRevisionEntry[] = [
      { rev: '0', date: '2026-04-01', description: 'Pierwsza wersja', designer: 'JK', approver: 'AN' },
      { rev: 'A', date: '2026-05-10', description: 'Zmiana TR4', designer: 'JK', approver: 'AN' },
    ];
    const { container, getByText } = render(<svg><SldRevisionTable entries={entries} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-revision-row-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-revision-row-A"]')).toBeTruthy();
    expect(getByText('Pierwsza wersja')).toBeInTheDocument();
    expect(getByText('Zmiana TR4')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="sld-v2-revision-table"]')?.getAttribute('data-row-count')).toBe('2');
  });

  it('maxRows ogranicza do najnowszych N entries', () => {
    const entries: SldRevisionEntry[] = Array.from({ length: 10 }, (_, i) => ({
      rev: String(i),
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      description: `Change ${i}`,
      designer: 'JK',
      approver: 'AN',
    }));
    const { container } = render(<svg><SldRevisionTable entries={entries} maxRows={3} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-revision-table"]')?.getAttribute('data-row-count')).toBe('3');
    expect(container.querySelector('[data-testid="sld-v2-revision-row-9"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-revision-row-0"]')).toBeFalsy();
  });

  it('ucina opis zmian gdy >26 znaków (column width PN-EN ISO 7200)', () => {
    const entries: SldRevisionEntry[] = [
      { rev: '0', date: '2026-04-01', description: 'Bardzo długi opis zmian który nie zmieści się', designer: 'JK', approver: 'AN' },
    ];
    const { container } = render(<svg><SldRevisionTable entries={entries} /></svg>);
    const row = container.querySelector('[data-testid="sld-v2-revision-row-0"]');
    expect(row?.textContent).toContain('…');
  });
});
