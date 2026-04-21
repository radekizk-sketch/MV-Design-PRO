import { describe, expect, it } from 'vitest';
import { getToolStatusTable, resolveToolAction } from '../interactionController';
import type { SelectedElement } from '../../types';

const TARGET: SelectedElement = {
  id: 'seg-001',
  type: 'LineBranch',
  name: 'Segment 001',
};

const BUS_TARGET: SelectedElement = {
  id: 'bus-001',
  type: 'Bus',
  name: 'Szyna 001',
};

const SOURCE_TARGET: SelectedElement = {
  id: 'source-001',
  type: 'Source',
  name: 'GPZ 001',
};

const TERMINAL_TARGET: SelectedElement = {
  id: 'terminal-001',
  type: 'Terminal',
  name: 'Terminal pola GPZ',
};

describe('interactionController', () => {
  it('zwraca tabelÄ™ statusĂłw z delete_element ustawionym jako DZIALA', () => {
    const table = getToolStatusTable();
    const deleteRow = table.find((row) => row.tool === 'delete_element');

    expect(deleteRow).toBeDefined();
    expect(deleteRow?.status).toBe('DZIALA');
    expect(deleteRow?.canonicalOp).toBe('delete_element');
  });

  it('blokuje akcjÄ™, gdy brak aktywnego case', () => {
    const resolved = resolveToolAction('continue_trunk_segment_sn', TARGET, {
      hasSource: true,
      hasCanonicalTrunkStart: true,
      hasRing: false,
      activeCaseId: null,
    });

    expect(resolved.mode).toBe('BLOCKED');
    expect(resolved.reasonPl).toContain('Brak aktywnego przypadku');
  });

  it('buduje minimalny kanoniczny kontekst dla insert_station_on_segment_sn', () => {
    const resolved = resolveToolAction('insert_station_on_segment_sn', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    });

    expect(resolved.mode).toBe('DOMAIN_OP');
    expect(resolved.canonicalOp).toBe('insert_station_on_segment_sn');
    expect(resolved.payload).toMatchObject({
      source: 'sld_tool',
      segment_id: 'seg-001',
      segment_ref: 'seg-001',
    });
  });

  it('buduje payload assign_catalog bez zgadywania namespace lub typu katalogu', () => {
    const resolved = resolveToolAction('assign_catalog', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    });

    expect(resolved.mode).toBe('DOMAIN_OP');
    expect(resolved.canonicalOp).toBe('assign_catalog_to_element');
    expect(resolved.payload).toEqual({
      source: 'sld_tool',
      element_ref: 'seg-001',
    });
    expect(resolved.payload).not.toHaveProperty('catalog_item_id');
    expect(resolved.payload).not.toHaveProperty('catalog_namespace');
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

  it('pozwala otworzyÄ‡ formularz add_grid_source_sn po klikniÄ™ciu pĹ‚Ăłtna', () => {
    const resolved = resolveToolAction('add_grid_source_sn', TARGET, {
      hasSource: false,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'canvas' });

    expect(resolved.mode).toBe('DOMAIN_OP');
    expect(resolved.canonicalOp).toBe('add_grid_source_sn');
    expect(resolved.payload).toEqual({ source: 'sld_tool' });
    expect(resolved.catalogRequired).toBe(true);
    expect(resolved.catalogNamespace).toBe('ZRODLO_SN');
  });

  it('blokuje start_branch na porcie innym niĹĽ BRANCH_OUT', () => {
    const resolved = resolveToolAction('start_branch_segment_sn', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'port', portRole: 'TRUNK_OUT' });

    expect(resolved.mode).toBe('BLOCKED');
    expect(resolved.reasonPl).toContain('BRANCH_OUT');
  });

  it('buduje payload start_branch wyĹ‚Ä…cznie z kanonicznym from_ref', () => {
    const resolved = resolveToolAction('start_branch_segment_sn', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'port', portRole: 'BRANCH_OUT' });

    expect(resolved.mode).toBe('DOMAIN_OP');
    expect(resolved.canonicalOp).toBe('start_branch_segment_sn');
    expect(resolved.payload).toEqual({
      source: 'sld_tool',
      from_ref: 'seg-001',
    });
    expect(resolved.payload).not.toHaveProperty('from_bus_ref');
    expect(resolved.catalogRequired).toBe(true);
    expect(resolved.catalogNamespace).toBe('KABEL_SN');
  });

  it('blokuje narzÄ™dzie wymagajÄ…ce elementu, gdy klikniÄ™to pĹ‚Ăłtno', () => {
    const resolved = resolveToolAction('insert_station_on_segment_sn', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'canvas' });

    expect(resolved.mode).toBe('BLOCKED');
    expect(resolved.reasonPl).toContain('elementu');
  });

  it('obsĹ‚uguje elastycznÄ… kolejnoĹ›Ä‡: edycja -> delete -> blokada trunk bez poprawnego kontekstu', () => {
    const edit = resolveToolAction('edit_properties', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'element' });
    const del = resolveToolAction('delete_element', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'element' });
    const trunk = resolveToolAction('continue_trunk_segment_sn', TARGET, {
      hasSource: true,
      hasCanonicalTrunkStart: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'element' });

    expect(edit.mode).toBe('DOMAIN_OP');
    expect(edit.payload).toEqual({
      source: 'sld_tool',
      element_ref: 'seg-001',
      element_name: 'Segment 001',
    });
    expect(del.mode).toBe('DOMAIN_OP');
    expect(trunk.mode).toBe('BLOCKED');
    expect(trunk.reasonPl).toContain('Kontynuacja magistrali');
  });

  it('blokuje kontynuacje magistrali z samej szyny GPZ', () => {
    const resolved = resolveToolAction('continue_trunk_segment_sn', BUS_TARGET, {
      hasSource: true,
      hasCanonicalTrunkStart: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'element' });

    expect(resolved.mode).toBe('BLOCKED');
    expect(resolved.reasonPl).toContain('Kontynuacja magistrali');
  });

  it('blokuje kontynuacje magistrali bezposrednio z obiektu zrodla GPZ', () => {
    const resolved = resolveToolAction('continue_trunk_segment_sn', SOURCE_TARGET, {
      hasSource: true,
      hasCanonicalTrunkStart: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'element' });

    expect(resolved.mode).toBe('BLOCKED');
    expect(resolved.reasonPl).toContain('pola liniowego GPZ');
  });

  it('pozwala kontynuowac magistrale z portu TRUNK_OUT pola liniowego', () => {
    const resolved = resolveToolAction('continue_trunk_segment_sn', TARGET, {
      hasSource: true,
      hasCanonicalTrunkStart: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'port', portRole: 'TRUNK_OUT' });

    expect(resolved.mode).toBe('DOMAIN_OP');
    expect(resolved.canonicalOp).toBe('continue_trunk_segment_sn');
    expect(resolved.payload).toMatchObject({
      source: 'sld_tool',
      trunk_id: 'seg-001',
      terminal_id: 'seg-001',
      from_terminal_id: 'seg-001',
    });
  });

  it('pozwala kontynuowac magistrale z terminala magistrali', () => {
    const resolved = resolveToolAction('continue_trunk_segment_sn', TERMINAL_TARGET, {
      hasSource: true,
      hasCanonicalTrunkStart: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'element' });

    expect(resolved.mode).toBe('DOMAIN_OP');
    expect(resolved.canonicalOp).toBe('continue_trunk_segment_sn');
    expect(resolved.payload).toMatchObject({
      source: 'sld_tool',
      trunk_id: 'terminal-001',
      terminal_id: 'terminal-001',
      from_terminal_id: 'terminal-001',
    });
  });

  it('blokuje kontynuacje magistrali z portu innego niz TRUNK_OUT', () => {
    const resolved = resolveToolAction('continue_trunk_segment_sn', TARGET, {
      hasSource: true,
      hasCanonicalTrunkStart: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'port', portRole: 'BRANCH_OUT' });

    expect(resolved.mode).toBe('BLOCKED');
    expect(resolved.reasonPl).toContain('TRUNK_OUT');
  });

  it('blokuje continue_trunk bez jawnego portu pola GPZ albo otwartego terminala', () => {
    const resolved = resolveToolAction('continue_trunk_segment_sn', TARGET, {
      hasSource: true,
      hasCanonicalTrunkStart: false,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'port', portRole: 'TRUNK_OUT' });

    expect(resolved.mode).toBe('BLOCKED');
    expect(resolved.reasonPl).toContain('Najpierw utworz pole liniowe GPZ');
  });
  it('buduje kanoniczny payload add_converter_source dla PV i BESS', () => {
    const pv = resolveToolAction('add_converter_source_pv', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'element' });
    const bess = resolveToolAction('add_converter_source_bess', TARGET, {
      hasSource: true,
      hasRing: false,
      activeCaseId: 'case-1',
    }, { kind: 'element' });

    expect(pv.mode).toBe('DOMAIN_OP');
    expect(pv.canonicalOp).toBe('add_converter_source');
    expect(pv.payload).toMatchObject({
      source: 'sld_tool',
      element_ref: 'seg-001',
      station_ref: 'seg-001',
      node_ref: 'seg-001',
      source_technology: 'PV',
      connection_variant: 'nn_side',
    });

    expect(bess.mode).toBe('DOMAIN_OP');
    expect(bess.canonicalOp).toBe('add_converter_source');
    expect(bess.payload).toMatchObject({
      source_technology: 'BESS',
      connection_variant: 'nn_side',
    });
  });
});
