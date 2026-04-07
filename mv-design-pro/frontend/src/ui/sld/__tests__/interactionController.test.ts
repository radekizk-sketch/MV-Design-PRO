import { describe, expect, it } from 'vitest';

import { getToolStatusTable, resolveToolAction } from '../interactionController';
import type { SelectedElement } from '../../types';

const TARGET: SelectedElement = {
  id: 'seg-001',
  type: 'LineBranch',
  name: 'Segment 001',
};

describe('interactionController', () => {
  it('zwraca tabele statusow z delete_element ustawionym jako DZIALA', () => {
    const table = getToolStatusTable();
    const deleteRow = table.find((row) => row.tool === 'delete_element');

    expect(deleteRow).toBeDefined();
    expect(deleteRow?.status).toBe('DZIALA');
    expect(deleteRow?.canonicalOp).toBe('delete_element');
  });

  it('blokuje akcje, gdy brak aktywnego case', () => {
    const resolved = resolveToolAction('continue_trunk', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: null,
    });

    expect(resolved.mode).toBe('BLOCKED');
    expect(resolved.reasonPl).toContain('Brak aktywnego przypadku');
  });

  it('otwiera formularz wstawienia stacji dla odcinka SN', () => {
    const resolved = resolveToolAction('insert_station', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    });

    expect(resolved.mode).toBe('OPEN_FORM');
    expect(resolved.canonicalOp).toBe('insert_station_on_segment_sn');
    expect(resolved.payload).toEqual({
      segmentRef: 'seg-001',
      segmentLabel: 'Segment 001',
      insertRatio: 0.5,
    });
  });

  it('otwiera formularz przypisania katalogu bez zgadywania parametrow', () => {
    const resolved = resolveToolAction('assign_catalog', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    });

    expect(resolved.mode).toBe('OPEN_FORM');
    expect(resolved.canonicalOp).toBe('assign_catalog_to_element');
    expect(resolved.payload).toEqual({
      element_ref: 'seg-001',
      element_name: 'Segment 001',
      element_type: 'LineBranch',
    });
  });

  it('mapuje delete_element na canonical delete_element i payload element_ref', () => {
    const resolved = resolveToolAction('delete_element', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    });

    expect(resolved.mode).toBe('DOMAIN_OP');
    expect(resolved.canonicalOp).toBe('delete_element');
    expect(resolved.payload).toEqual({ element_ref: 'seg-001' });
  });

  it('otwiera formularz GPZ po kliknieciu plotna', () => {
    const resolved = resolveToolAction(
      'add_gpz',
      TARGET,
      {
        hasSource: false,
        hasRing: false,
        activeCaseId: 'case-1',
      },
      { kind: 'canvas' },
    );

    expect(resolved.mode).toBe('OPEN_FORM');
    expect(resolved.canonicalOp).toBe('add_grid_source_sn');
    expect(resolved.payload).toEqual({});
  });

  it('blokuje start_branch na porcie innym niz BRANCH_OUT', () => {
    const resolved = resolveToolAction(
      'start_branch',
      TARGET,
      {
        hasSource: true,
        hasRing: false,
        activeCaseId: 'case-1',
      },
      { kind: 'port', portRole: 'TRUNK_OUT' },
    );

    expect(resolved.mode).toBe('BLOCKED');
    expect(resolved.reasonPl).toContain('BRANCH_OUT');
  });

  it('blokuje narzedzie wymagajace elementu, gdy kliknieto plotno', () => {
    const resolved = resolveToolAction(
      'insert_station',
      TARGET,
      {
        hasSource: true,
        hasRing: false,
        activeCaseId: 'case-1',
      },
      { kind: 'canvas' },
    );

    expect(resolved.mode).toBe('BLOCKED');
    expect(resolved.reasonPl).toContain('elementu');
  });

  it('otwiera formularz kontynuacji magistrali tylko dla poprawnego portu', () => {
    const resolved = resolveToolAction(
      'continue_trunk',
      TARGET,
      {
        hasSource: true,
        hasRing: false,
        activeCaseId: 'case-1',
      },
      { kind: 'port', portRole: 'TRUNK_OUT' },
    );

    expect(resolved.mode).toBe('OPEN_FORM');
    expect(resolved.canonicalOp).toBe('continue_trunk_segment_sn');
    expect(resolved.payload).toEqual({
      fromTerminalId: 'seg-001',
      terminalLabel: 'Segment 001',
    });
  });

  it('blokuje ring i NOP poza zakresem tego etapu', () => {
    const ring = resolveToolAction('connect_ring', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    });
    const nop = resolveToolAction('set_nop', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    });

    expect(ring.mode).toBe('BLOCKED');
    expect(nop.mode).toBe('BLOCKED');
  });
});
