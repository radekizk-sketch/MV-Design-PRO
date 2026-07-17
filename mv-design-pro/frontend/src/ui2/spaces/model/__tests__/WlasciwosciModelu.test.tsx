/**
 * Testy zakładki „Właściwości" przestrzeni Model (E5.x).
 *
 * Kontrakt pod testem:
 * - selekcja ze store `ui/selection` (`selectedElements`),
 * - dane z snapshotu ENM (`ui/topology/snapshotStore`),
 * - zapis WYŁĄCZNIE przez istniejącą operację domenową `update_element_parameters`.
 *
 * `PropertyGridContainer` atrapowany — testujemy powłokę i kontrakt, nie wnętrze
 * przejmowanego property grida.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSelectionStore } from '../../../../ui/selection';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useAppStateStore } from '../../../../ui/app-state';
import type { SelectedElement } from '../../../../ui/types';

vi.mock('../../../../ui/property-grid', () => ({
  PropertyGridContainer: (props: {
    elementId?: string;
    elementName?: string;
    elements?: Array<{ id: string }>;
    onFieldChange?: (fieldKey: string, value: unknown) => void;
    onFieldChangeMulti?: (elementId: string, fieldKey: string, value: unknown) => void;
  }) => (
    <div
      data-testid="atrapa-property-grid"
      data-element-id={props.elementId ?? ''}
      data-element-name={props.elementName ?? ''}
      data-count={String(props.elements?.length ?? 0)}
    >
      <button
        type="button"
        data-testid="atrapa-zmien-pole"
        onClick={() => props.onFieldChange?.('length_km', 2.5)}
      >
        pole
      </button>
      <button
        type="button"
        data-testid="atrapa-zmien-pole-multi"
        onClick={() => props.onFieldChangeMulti?.('br-2', 'length_km', 3)}
      >
        pole multi
      </button>
    </div>
  ),
}));

import { WlasciwosciModelu } from '../WlasciwosciModelu';

const el = (id: string, name: string): SelectedElement => ({ id, type: 'LineBranch', name });

const snapshotZLinia = {
  branches: [
    { ref_id: 'br-1', id: 'br-1', name: 'Linia 1', length_km: 1.2 },
    { ref_id: 'br-2', id: 'br-2', name: 'Linia 2', length_km: 4.8 },
  ],
};

function ustawSelekcje(elementy: SelectedElement[]) {
  useSelectionStore.setState({ selectedElements: elementy });
}

let execMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  execMock = vi.fn().mockResolvedValue({});
  useSelectionStore.setState({ selectedElements: [] });
  useSnapshotStore.setState({ snapshot: null, executeDomainOperation: execMock as never });
  useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
});

afterEach(() => {
  cleanup();
  useSelectionStore.setState({ selectedElements: [] });
  useSnapshotStore.setState({ snapshot: null });
});

describe('E5.x — zakładka Właściwości modelu', () => {
  it('bez selekcji pokazuje uczciwy stan pusty (PL)', () => {
    ustawSelekcje([]);
    render(<WlasciwosciModelu />);
    expect(screen.getByTestId('mvd-model-wlasciwosci-pusto')).toBeTruthy();
    expect(screen.queryByTestId('atrapa-property-grid')).toBeNull();
  });

  it('stan pusty ma polską instrukcję zaznaczenia elementu', () => {
    ustawSelekcje([]);
    render(<WlasciwosciModelu />);
    expect(screen.getByTestId('mvd-model-wlasciwosci-pusto').textContent).toContain(
      'Zaznacz element na schemacie',
    );
  });

  it('z pojedynczą selekcją montuje property grid dla wskazanego elementu', () => {
    useSnapshotStore.setState({ snapshot: snapshotZLinia as never });
    ustawSelekcje([el('br-1', 'Linia 1')]);
    render(<WlasciwosciModelu />);
    const grid = screen.getByTestId('atrapa-property-grid');
    expect(grid.dataset.elementId).toBe('br-1');
    expect(grid.dataset.count).toBe('1');
  });

  it('rozwiązuje dane elementu ze snapshotu (nazwa z rekordu selekcji)', () => {
    useSnapshotStore.setState({ snapshot: snapshotZLinia as never });
    ustawSelekcje([el('br-1', 'Linia 1')]);
    render(<WlasciwosciModelu />);
    expect(screen.getByTestId('atrapa-property-grid').dataset.elementName).toBe('Linia 1');
  });

  it('przy wielu zaznaczonych elementach przełącza w tryb multi-edit', () => {
    useSnapshotStore.setState({ snapshot: snapshotZLinia as never });
    ustawSelekcje([el('br-1', 'Linia 1'), el('br-2', 'Linia 2')]);
    render(<WlasciwosciModelu />);
    expect(screen.getByTestId('atrapa-property-grid').dataset.count).toBe('2');
  });

  it('zapis pola pojedynczego idzie przez operację update_element_parameters', () => {
    useSnapshotStore.setState({ snapshot: snapshotZLinia as never });
    ustawSelekcje([el('br-1', 'Linia 1')]);
    render(<WlasciwosciModelu />);
    fireEvent.click(screen.getByTestId('atrapa-zmien-pole'));
    expect(execMock).toHaveBeenCalledWith('case-1', 'update_element_parameters', {
      element_ref: 'br-1',
      parameters: { length_km: 2.5 },
    });
  });

  it('zapis multi kieruje operację na wskazany element', () => {
    useSnapshotStore.setState({ snapshot: snapshotZLinia as never });
    ustawSelekcje([el('br-1', 'Linia 1'), el('br-2', 'Linia 2')]);
    render(<WlasciwosciModelu />);
    fireEvent.click(screen.getByTestId('atrapa-zmien-pole-multi'));
    expect(execMock).toHaveBeenCalledWith('case-1', 'update_element_parameters', {
      element_ref: 'br-2',
      parameters: { length_km: 3 },
    });
  });

  it('bez aktywnego zakresu obliczeń nie wywołuje operacji domenowej', () => {
    useAppStateStore.setState({ activeCaseId: null } as never);
    useSnapshotStore.setState({ snapshot: snapshotZLinia as never });
    ustawSelekcje([el('br-1', 'Linia 1')]);
    render(<WlasciwosciModelu />);
    fireEvent.click(screen.getByTestId('atrapa-zmien-pole'));
    expect(execMock).not.toHaveBeenCalled();
  });
});
