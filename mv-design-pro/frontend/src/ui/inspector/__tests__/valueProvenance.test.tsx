/**
 * Testy pochodzenia wartości w inspektorze — V12 § 5.6 tryb Audyt
 *
 * Weryfikuje:
 * - Ikona provenance renderuje się przy polach z source=calculated/type
 * - Kliknięcie ikony otwiera popover
 * - Popover wyświetla dane provenance (źródło, opis, freshness)
 * - Brak provenance → komunikat „brak śladu" bez sztucznego uzasadnienia
 * - Zamknięcie popovera działa
 * - Brak zakazanych terminów w komunikatach
 * - freshness FRESH/OUTDATED/NONE wyświetlane po polsku
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValueProvenanceIcon } from '../ValueProvenancePopover';
import type { ValueProvenance } from '../types';

const FORBIDDEN = ['PCC', 'snapshot', 'proof', 'case', 'feeder', 'branch', 'wizard', 'legacy', 'Boundary'];

const FULL_PROVENANCE: ValueProvenance = {
  sourceLabel: 'Katalog typów',
  descriptionPl: 'Wartość pochodzi z przypisanego typu w katalogu.',
  catalogId: 'cable-YAKY-50',
  enmRevision: 42,
  updatedAt: '2026-04-27T10:00:00Z',
  freshness: 'FRESH',
};

describe('ValueProvenanceIcon', () => {
  it('renderuje ikonę', () => {
    render(<ValueProvenanceIcon fieldLabel="Napięcie" provenance={FULL_PROVENANCE} />);
    expect(screen.getByTestId('provenance-icon-Napięcie')).toBeTruthy();
    expect(screen.getByTestId('provenance-btn-Napięcie')).toBeTruthy();
  });

  it('popover nie jest widoczny przed kliknięciem', () => {
    render(<ValueProvenanceIcon fieldLabel="Napięcie" provenance={FULL_PROVENANCE} />);
    expect(screen.queryByTestId('provenance-popover')).toBeNull();
  });

  it('kliknięcie ikony otwiera popover z danymi', () => {
    render(<ValueProvenanceIcon fieldLabel="Napięcie" provenance={FULL_PROVENANCE} />);
    fireEvent.click(screen.getByTestId('provenance-btn-Napięcie'));
    expect(screen.getByTestId('provenance-popover')).toBeTruthy();
    expect(screen.getByText('Katalog typów')).toBeTruthy();
    expect(screen.getByText('Wartość pochodzi z przypisanego typu w katalogu.')).toBeTruthy();
  });

  it('wyświetla freshness=FRESH jako "Aktualne"', () => {
    render(<ValueProvenanceIcon fieldLabel="Prąd" provenance={FULL_PROVENANCE} />);
    fireEvent.click(screen.getByTestId('provenance-btn-Prąd'));
    expect(screen.getByText('Aktualne')).toBeTruthy();
  });

  it('wyświetla freshness=OUTDATED jako "Nieaktualne"', () => {
    const prov: ValueProvenance = { ...FULL_PROVENANCE, freshness: 'OUTDATED' };
    render(<ValueProvenanceIcon fieldLabel="Prąd" provenance={prov} />);
    fireEvent.click(screen.getByTestId('provenance-btn-Prąd'));
    expect(screen.getByText('Nieaktualne')).toBeTruthy();
  });

  it('brak provenance → komunikat brak śladu (bez sztucznego uzasadnienia)', () => {
    render(<ValueProvenanceIcon fieldLabel="Moc" provenance={undefined} />);
    fireEvent.click(screen.getByTestId('provenance-btn-Moc'));
    expect(screen.getByTestId('provenance-no-trace')).toBeTruthy();
    const text = screen.getByTestId('provenance-no-trace').textContent ?? '';
    expect(text.toLowerCase()).toContain('brak śladu');
  });

  it('zamknięcie popovera przyciskiem × działa', () => {
    render(<ValueProvenanceIcon fieldLabel="Napięcie" provenance={FULL_PROVENANCE} />);
    fireEvent.click(screen.getByTestId('provenance-btn-Napięcie'));
    expect(screen.getByTestId('provenance-popover')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    expect(screen.queryByTestId('provenance-popover')).toBeNull();
  });

  it('brak zakazanych terminów w treści popovera', () => {
    render(<ValueProvenanceIcon fieldLabel="Napięcie" provenance={FULL_PROVENANCE} />);
    fireEvent.click(screen.getByTestId('provenance-btn-Napięcie'));
    const popover = screen.getByTestId('provenance-popover');
    const text = popover.textContent ?? '';
    for (const term of FORBIDDEN) {
      expect(text).not.toContain(term);
    }
  });

  it('wyświetla catalogId', () => {
    render(<ValueProvenanceIcon fieldLabel="Typ kabla" provenance={FULL_PROVENANCE} />);
    fireEvent.click(screen.getByTestId('provenance-btn-Typ kabla'));
    expect(screen.getByText('cable-YAKY-50')).toBeTruthy();
  });
});
