import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { EngineeringProjectExplorer } from '../EngineeringProjectExplorer';
import { useAppStateStore } from '../../../app-state';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useSelectionStore } from '../../../selection';

describe('EngineeringProjectExplorer — zunifikowana lewa karta', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useSelectionStore.setState({
      selectedElements: [],
      selectedElement: null,
      propertyGridOpen: false,
    });
  });

  it('Renderuje header z "Projekt" + "Gotowość"', () => {
    render(<EngineeringProjectExplorer />);
    expect(screen.getByTestId('engineering-project-explorer')).toBeInTheDocument();
    expect(screen.getByText(/Projekt/)).toBeInTheDocument();
    expect(screen.getByText(/Gotowość/)).toBeInTheDocument();
  });

  it('Pusty snapshot → renderuje empty hint', () => {
    render(<EngineeringProjectExplorer />);
    expect(screen.getByTestId('explorer-empty')).toBeInTheDocument();
    expect(screen.getByText(/Pusty model sieci/)).toBeInTheDocument();
  });

  it('Footer pokazuje licznik elementów + "Dodaj element"', () => {
    render(<EngineeringProjectExplorer />);
    expect(screen.getByTestId('explorer-footer')).toBeInTheDocument();
    expect(screen.getByText(/elementów/)).toBeInTheDocument();
    expect(screen.getByTestId('explorer-add-element')).toBeInTheDocument();
  });

  it('Pusty stan: 0 elementów', () => {
    render(<EngineeringProjectExplorer />);
    expect(screen.getByText(/0 elementów/)).toBeInTheDocument();
  });

  it('Aria role="navigation" z polskim aria-label', () => {
    render(<EngineeringProjectExplorer />);
    const nav = screen.getByRole('navigation', { name: /Eksplorator projektu/i });
    expect(nav).toBeInTheDocument();
  });

  it('Buduje drzewo z snapshot: GPZ + Stacje + Odcinki', () => {
    // Załaduj mock snapshot do store.
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'gpz-01', name: 'GPZ Centralny' }],
        substations: [
          { ref_id: 'st-01', name: 'ST-01 Wschodnia' },
          { ref_id: 'st-02', name: 'ST-02 Zachodnia' },
        ],
        branches: [{ ref_id: 'br-01', name: 'L01 Kabel' }],
        generators: [],
      },
    } as unknown as Parameters<typeof useSnapshotStore.setState>[0]);

    render(<EngineeringProjectExplorer />);
    expect(screen.getByText(/Główny Punkt Zasilający \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Stacje SN\/nN \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Odcinki SN \(1\)/)).toBeInTheDocument();
  });

  it('Klik na element drzewa wywołuje selectElement', () => {
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'gpz-01', name: 'GPZ Centralny' }],
        substations: [],
        branches: [],
        generators: [],
      },
    } as unknown as Parameters<typeof useSnapshotStore.setState>[0]);
    render(<EngineeringProjectExplorer />);

    const gpzNode = screen.getByText('GPZ Centralny');
    fireEvent.click(gpzNode);

    const selected = useSelectionStore.getState().selectedElement;
    expect(selected?.id).toBe('gpz-01');
    expect(selected?.name).toBe('GPZ Centralny');
  });

  it('Blokady gotowości — pokazuje gdy istnieją', () => {
    useSnapshotStore.setState({
      snapshot: {
        sources: [],
        substations: [],
        branches: [],
        generators: [],
        readiness: {
          blockers: [
            { code: 'B1', message_pl: 'Brak parametrów TR' },
            { code: 'B2', message_pl: 'Brakuje uziemnika' },
          ],
        },
      },
    } as unknown as Parameters<typeof useSnapshotStore.setState>[0]);

    render(<EngineeringProjectExplorer />);
    expect(screen.getByTestId('explorer-blockers')).toBeInTheDocument();
    expect(screen.getByText(/Brak parametrów TR/)).toBeInTheDocument();
  });

  it('UUID jako name → sanitizowany przez projectDisplayName', () => {
    useAppStateStore.setState({
      activeProjectName: 'abcd1234-5678-1234-5678-abcdef012345',
      activeProjectId: 'proj-1',
    } as unknown as Parameters<typeof useAppStateStore.setState>[0]);
    render(<EngineeringProjectExplorer />);
    // displayName powinno być "Projekt bez nazwy" (looksLikeTechnicalId fires).
    expect(screen.getByText(/Projekt bez nazwy/)).toBeInTheDocument();
  });
});
