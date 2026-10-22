/**
 * Karta K8 — zaznaczenie i wskazanie elementu niosą `ref_id` modelu niezależnie od tego,
 * pod jakim identyfikatorem przyszedł element (wiersz wyniku rozpływu i zwarć niesie
 * identyfikator GRAFU obliczeniowego `uuid5(NAMESPACE_DNS, ref_id)`, inne wyniki `id`
 * elementu migawki). Iloczyn: rodzaj identyfikatora × operacja magazynu zaznaczenia,
 * plus dwa uczciwe braki (identyfikator nieznany migawce, brak migawki).
 *
 * Defekt, który przypina: klik wiersza ekranu pełnego rozpływu zapisywał do magazynu
 * UUID grafu — schemat nie kadrował elementu, inspektor nie pokazywał sekcji „Wyniki",
 * panel dolny nie podświetlał wiersza (wszystkie trzy zaznaczają po `ref_id`).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { identyfikatorGrafu } from '../../topology/identyfikatorGrafu';
import { refModeluElementu, useSnapshotStore } from '../../topology/snapshotStore';
import { useSelectionStore } from '../store';

const REF_ODCINKA = 'seg/372f90192b1b61aa04e5347876a377f3/segment';
const REF_SZYNY = 'stn/08e2aa11bb22cc33dd44ee55ff660011/sn_bus';
const MIGAWKA = {
  buses: [{ ref_id: REF_SZYNY, id: 'wezel-szyny', name: 'Szyna SN stacji 1', voltage_kv: 15 }],
  branches: [{ ref_id: REF_ODCINKA, id: 'galaz-odcinka', name: 'Odcinek 1' }],
} as unknown as EnergyNetworkModel;

const RODZAJE_IDENTYFIKATORA: ReadonlyArray<readonly [string, string, string]> = [
  ['ref_id modelu', REF_ODCINKA, REF_ODCINKA],
  ['id elementu migawki', 'galaz-odcinka', REF_ODCINKA],
  ['identyfikator grafu', identyfikatorGrafu(REF_ODCINKA), REF_ODCINKA],
  ['identyfikator grafu szyny', identyfikatorGrafu(REF_SZYNY), REF_SZYNY],
  ['identyfikator nieznany migawce', 'obcy-element', 'obcy-element'],
];

function resetZaznaczenia(): void {
  useSelectionStore.setState({
    selectedElement: null,
    selectedElements: [],
    sldWskazanie: null,
  } as never);
}

beforeEach(() => {
  useSnapshotStore.setState({ snapshot: MIGAWKA } as never);
  resetZaznaczenia();
});

afterEach(() => {
  useSnapshotStore.setState({ snapshot: null } as never);
  resetZaznaczenia();
});

describe('refModeluElementu — jedno źródło rozpoznania identyfikatora', () => {
  it.each(RODZAJE_IDENTYFIKATORA)('%s → ref modelu albo uczciwy brak', (_r, id, oczekiwany) => {
    const ref = refModeluElementu(MIGAWKA, id);
    expect(ref).toBe(id === 'obcy-element' ? null : oczekiwany);
  });

  it('brak migawki albo identyfikatora → null', () => {
    expect(refModeluElementu(null, REF_ODCINKA)).toBeNull();
    expect(refModeluElementu(MIGAWKA, null)).toBeNull();
  });
});

describe('magazyn zaznaczenia — rodzaj identyfikatora × operacja', () => {
  it.each(RODZAJE_IDENTYFIKATORA)('selectElement: %s', (_r, id, oczekiwany) => {
    useSelectionStore.getState().selectElement({ id, type: 'LineBranch', name: id });
    const { selectedElement, selectedElements } = useSelectionStore.getState();
    expect(selectedElement?.id).toBe(oczekiwany);
    // Nazwa zapasowa równa identyfikatorowi wyniku idzie za identyfikatorem.
    expect(selectedElement?.name).toBe(oczekiwany);
    expect(selectedElements.map((e) => e.id)).toEqual([oczekiwany]);
  });

  it.each(RODZAJE_IDENTYFIKATORA)('selectElement zachowuje nazwę inżynierską: %s', (_r, id, oczekiwany) => {
    useSelectionStore.getState().selectElement({ id, type: 'LineBranch', name: 'Odcinek 1' });
    expect(useSelectionStore.getState().selectedElement).toEqual({
      id: oczekiwany,
      type: 'LineBranch',
      name: 'Odcinek 1',
    });
  });

  it.each(RODZAJE_IDENTYFIKATORA)('selectElements: %s', (_r, id, oczekiwany) => {
    useSelectionStore.getState().selectElements([{ id, type: 'LineBranch', name: 'x' }]);
    expect(useSelectionStore.getState().selectedElement?.id).toBe(oczekiwany);
  });

  it.each(RODZAJE_IDENTYFIKATORA)('toggleElement dwa razy (UUID, potem ref): %s', (_r, id, oczekiwany) => {
    const stan = useSelectionStore.getState();
    stan.toggleElement({ id, type: 'LineBranch', name: 'x' });
    expect(useSelectionStore.getState().selectedElement?.id).toBe(oczekiwany);
    // Drugi przełącznik tym samym elementem pod INNYM identyfikatorem zdejmuje go —
    // predykat wejścia i wyjścia z jednego źródła (`naRefModelu`).
    useSelectionStore.getState().toggleElement({ id: oczekiwany, type: 'LineBranch', name: 'x' });
    expect(useSelectionStore.getState().selectedElements).toEqual([]);
  });

  it.each(RODZAJE_IDENTYFIKATORA)('extendSelection bez duplikatu: %s', (_r, id, oczekiwany) => {
    useSelectionStore.getState().selectElement({ id: oczekiwany, type: 'LineBranch', name: 'x' });
    useSelectionStore.getState().extendSelection({ id, type: 'LineBranch', name: 'x' });
    expect(useSelectionStore.getState().selectedElements.map((e) => e.id)).toEqual([oczekiwany]);
  });

  it.each(RODZAJE_IDENTYFIKATORA)('removeFromSelection: %s', (_r, id, oczekiwany) => {
    useSelectionStore.getState().selectElement({ id: oczekiwany, type: 'LineBranch', name: 'x' });
    useSelectionStore.getState().removeFromSelection(id);
    expect(useSelectionStore.getState().selectedElements).toEqual([]);
  });

  it.each(RODZAJE_IDENTYFIKATORA)('centerSldOnElement: %s', (_r, id, oczekiwany) => {
    useSelectionStore.getState().centerSldOnElement(id);
    expect(useSelectionStore.getState().sldWskazanie?.ref).toBe(oczekiwany);
  });

  it('bez migawki identyfikator zostaje bez zmian (bez zgadywania)', () => {
    useSnapshotStore.setState({ snapshot: null } as never);
    const uuid = identyfikatorGrafu(REF_ODCINKA);
    useSelectionStore.getState().selectElement({ id: uuid, type: 'LineBranch', name: uuid });
    useSelectionStore.getState().centerSldOnElement(uuid);
    expect(useSelectionStore.getState().selectedElement?.id).toBe(uuid);
    expect(useSelectionStore.getState().sldWskazanie?.ref).toBe(uuid);
  });
});
