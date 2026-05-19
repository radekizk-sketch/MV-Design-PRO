/**
 * EmptyInspectorPanel — bez 10 placeholder "—".
 *
 * Wymusza że empty state pokazuje:
 *   - czytelny CTA "Wybierz element ze schematu"
 *   - opis krokowy trybu budowy modelu
 *   - BRAK 10 placeholder fieldów z "—"
 *   - BRAK raw `selectedElement.id` w "Identyfikator techniczny"
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { EmptyInspectorPanel } from '../EmptyInspectorPanel';
import type { SelectedElement } from '../../types';

describe('EmptyInspectorPanel — brak placeholder "—"', () => {
  it('Empty state (brak selekcji) pokazuje CTA "Wybierz element ze schematu"', () => {
    render(<EmptyInspectorPanel selectedElement={null} />);
    expect(screen.getByTestId('inspector-panel-empty')).toBeInTheDocument();
    expect(screen.getByText(/Wybierz element ze schematu/i)).toBeInTheDocument();
  });

  it('Empty state ma 0 wystąpień placeholder "—" w pola fields', () => {
    const { container } = render(<EmptyInspectorPanel selectedElement={null} />);
    // Sprawdź że nie ma label-value par z value="—" (10 placeholderów usunięte).
    const dashValues = container.querySelectorAll('span[title="—"]');
    expect(dashValues.length).toBe(0);
  });

  it('Empty state w trybie budowy pokazuje opis flow', () => {
    render(<EmptyInspectorPanel selectedElement={null} isReadOnly={false} />);
    expect(screen.getByText(/Tryb budowy modelu/i)).toBeInTheDocument();
    expect(screen.getByText(/wstaw GPZ z menu/i)).toBeInTheDocument();
  });

  it('Empty state w trybie read-only (audyt) NIE pokazuje opisu trybu budowy', () => {
    render(<EmptyInspectorPanel selectedElement={null} isReadOnly={true} />);
    expect(screen.queryByText(/Tryb budowy modelu/i)).toBeNull();
  });

  it('Wybrany element z UUID jako name → format "Element #ABCD1234"', () => {
    const elem: SelectedElement = {
      id: 'abcd1234-5678-1234-5678-abcdef012345',
      type: 'Bus',
      name: 'abcd1234-5678-1234-5678-abcdef012345', // UUID jako name też
    };
    render(<EmptyInspectorPanel selectedElement={elem} />);
    expect(screen.getAllByText(/Element #ABCD1234/).length).toBeGreaterThan(0);
  });

  it('Wybrany element z human name → pokazuje name', () => {
    const elem: SelectedElement = {
      id: 'tr-01-abc',
      type: 'TransformerBranch',
      name: 'TR-01 Stacja Włoszczowa',
    };
    render(<EmptyInspectorPanel selectedElement={elem} />);
    expect(screen.getByText(/TR-01 Stacja Włoszczowa/)).toBeInTheDocument();
  });
});
