/*
 * JEDNA PRAWDA GOTOWOŚCI (karta KD-1, dług V12K-286).
 *
 * Defekt bazowy: chrom powłoki został przepięty na `useSnapshotStore.readiness`
 * w karcie K6, ale POZOSTALI czytelnicy (paski budowy sieci, inspektor,
 * przegląd blokad, pasek operacyjny warsztatu, panel braków danych i drzewo
 * topologii) czytali dalej `readinessLiveStore` — store, którego `refresh`
 * NIKT NIGDY nie wołał. Efekt widoczny dla projektanta: liczniki blokad w
 * drzewie topologii były ZAWSZE zerowe, choć panel gotowości pokazywał blokady.
 *
 * Ten test pilnuje niezmiennika: TE SAME dane wejściowe (odpowiedź domenowa
 * `readiness` w migawce) muszą dawać spójny obraz we WSZYSTKICH czytelnikach —
 * panel gotowości, chrom i drzewo topologii idą razem, a naprawa blokady
 * zeruje liczniki wszędzie naraz.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useTopologyStore } from '../../../../ui/topology/store';
import type { TopologyGraphSummary } from '../../../../types/enm';
import { ustawGotowoscMigawki, wyczyscGotowoscMigawki } from '../../../../test/gotowoscTestUtils';
import { useTopologyTree } from '../../../nav/adapters/topologyTreeAdapter';
import { usePodsumowanieGotowosci, useProblemyGotowosci, useGotowoscModelu } from '../adapters/gotowoscAdapter';

function summaryFixture(): TopologyGraphSummary {
  return {
    case_id: 'case-1',
    enm_revision: 1,
    bus_count: 2,
    branch_count: 1,
    transformer_count: 0,
    source_count: 1,
    load_count: 0,
    generator_count: 0,
    measurement_count: 0,
    protection_count: 0,
    is_radial: true,
    has_cycles: false,
    adjacency: [{ bus_ref: 'GPZ', neighbor_ref: 'ST-1', via_ref: 'L-1', via_type: 'line' }],
    spine: [
      { bus_ref: 'GPZ', depth: 0, is_source: true, children_refs: ['ST-1'] },
      { bus_ref: 'ST-1', depth: 1, is_source: false, children_refs: [] },
    ],
    lateral_roots: [],
  } as unknown as TopologyGraphSummary;
}

beforeEach(() => {
  useTopologyStore.setState({ summary: summaryFixture() } as never);
  wyczyscGotowoscMigawki();
});

describe('jedna prawda gotowości — drzewo topologii i panel idą razem', () => {
  it('blokada elementu daje NIEZEROWY licznik w drzewie i wpis w panelu', () => {
    ustawGotowoscMigawki({
      blockers: [
        {
          code: 'catalog.sn_line.missing',
          message_pl: 'Odcinek ST-1 nie ma przypisanego typu katalogowego.',
          element_ref: 'ST-1',
        },
      ],
      warnings: [
        {
          code: 'protection.settings_review',
          message_pl: 'Nastawy zabezpieczenia wymagają przeglądu.',
          element_ref: 'ST-1',
        },
      ],
    });

    const drzewo = renderHook(() => useTopologyTree('zasilania'));
    const panel = renderHook(() => useProblemyGotowosci());
    const chrom = renderHook(() => usePodsumowanieGotowosci());

    // Drzewo zasilania: grupa „Magistrala (od GPZ)" → GPZ → ST-1.
    const wezelSt1 = drzewo.result.current[0]?.dzieci?.[0]?.dzieci?.[0];
    expect(wezelSt1?.id).toBe('ST-1');
    expect(wezelSt1?.liczniki).toEqual({ blokady: 1, ostrzezenia: 1 });

    // Ta sama prawda w panelu gotowości i w chromie powłoki.
    expect(panel.result.current.map((p) => p.severity)).toEqual(['BLOCKER', 'IMPORTANT']);
    expect(chrom.result.current).toEqual({ ready: false, blokady: 1, ostrzezenia: 1 });
  });

  it('naprawa blokady zeruje licznik drzewa i opróżnia panel w tym samym kroku', () => {
    ustawGotowoscMigawki({
      blockers: [
        {
          code: 'catalog.sn_line.missing',
          message_pl: 'Odcinek ST-1 nie ma przypisanego typu katalogowego.',
          element_ref: 'ST-1',
        },
      ],
    });

    const drzewo = renderHook(() => useTopologyTree('zasilania'));
    expect(drzewo.result.current[0]?.dzieci?.[0]?.dzieci?.[0]?.liczniki.blokady).toBe(1);

    // „Naprawa" = kolejna odpowiedź domenowa bez blokad.
    ustawGotowoscMigawki({ ready: true });
    drzewo.rerender();

    expect(drzewo.result.current[0]?.dzieci?.[0]?.dzieci?.[0]?.liczniki.blokady).toBe(0);
    expect(renderHook(() => useProblemyGotowosci()).result.current).toEqual([]);
  });

  it('brak migawki gotowości → zerowe liczniki i model NIEzwalidowany (zero fabrykacji)', () => {
    const drzewo = renderHook(() => useTopologyTree('zasilania'));
    const chrom = renderHook(() => usePodsumowanieGotowosci());

    expect(drzewo.result.current[0]?.dzieci?.[0]?.liczniki).toEqual({ blokady: 0, ostrzezenia: 0 });
    expect(chrom.result.current.ready).toBe(false);
  });
});

describe('useGotowoscModelu — kształt dla pasków i paneli spoza przestrzeni „Gotowość"', () => {
  it('blokada ⇒ status FAIL, ready=false, liczby wg wagi', () => {
    ustawGotowoscMigawki({
      blockers: [{ code: 'x.blokada', message_pl: 'Blokada', element_ref: 'ST-1' }],
      warnings: [{ code: 'x.uwaga', message_pl: 'Uwaga', element_ref: null }],
    });

    const { result } = renderHook(() => useGotowoscModelu());
    expect(result.current.status).toBe('FAIL');
    expect(result.current.ready).toBe(false);
    expect(result.current.bySeverity).toEqual({ BLOCKER: 1, IMPORTANT: 1, INFO: 0 });
    expect(result.current.issues).toHaveLength(2);
  });

  it('samo ostrzeżenie ⇒ status WARN (odpowiedź domenowa decyduje o `ready`)', () => {
    ustawGotowoscMigawki({
      ready: true,
      warnings: [{ code: 'x.uwaga', message_pl: 'Uwaga', element_ref: null }],
    });

    const { result } = renderHook(() => useGotowoscModelu());
    expect(result.current.status).toBe('WARN');
    expect(result.current.ready).toBe(true);
  });

  it('stan ładowania i błąd pochodzą z TEJ SAMEJ migawki (bez drugiego store’u)', () => {
    useSnapshotStore.setState({ loading: true, error: 'Brak połączenia' });
    const { result } = renderHook(() => useGotowoscModelu());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe('Brak połączenia');
  });
});
