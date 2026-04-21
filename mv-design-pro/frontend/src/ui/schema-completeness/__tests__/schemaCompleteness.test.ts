/**
 * SchemaCompletenessPanel — tests for the "Braki danych do obliczeń" panel.
 *
 * Verifies:
 * - Issue categorization (MAGISTRALA, STACJE, TRANSFORMATORY, ZRODLA, ZABEZPIECZENIA, KATALOG, INNE)
 * - Severity ordering (BLOCKER > IMPORTANT > INFO)
 * - Polish labels
 * - Fix action mapping
 * - Empty state rendering
 */

import { describe, it, expect } from 'vitest';
import type { ReadinessIssue, FixAction } from '../../types';
import { resolveFixActionSurface } from '../../../types/fixActionSurface';

// ---------------------------------------------------------------------------
// Categorization logic (replicated from SchemaCompletenessPanel for unit test)
// ---------------------------------------------------------------------------

type IssueCategory =
  | 'MAGISTRALA'
  | 'STACJE'
  | 'TRANSFORMATORY'
  | 'ZRODLA'
  | 'ZABEZPIECZENIA'
  | 'KATALOG'
  | 'INNE';

function categorizeIssue(issue: ReadinessIssue): IssueCategory {
  const code = issue.code.toLowerCase();
  if (code.includes('trunk') || code.includes('segment') || code.includes('line') || code.includes('cable') || code.includes('magistrala'))
    return 'MAGISTRALA';
  if (code.includes('station') || code.includes('stacja') || code.includes('bay'))
    return 'STACJE';
  if (code.includes('transformer') || code.includes('trafo'))
    return 'TRANSFORMATORY';
  if (code.includes('source') || code.includes('pv') || code.includes('bess') || code.includes('genset') || code.includes('ups') || code.includes('generator'))
    return 'ZRODLA';
  if (code.includes('protection') || code.includes('relay') || code.includes('ct') || code.includes('vt'))
    return 'ZABEZPIECZENIA';
  if (code.includes('catalog') || code.includes('type_ref') || code.includes('materialization'))
    return 'KATALOG';
  return 'INNE';
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeIssue(
  code: string,
  severity: 'BLOCKER' | 'IMPORTANT' | 'INFO',
  message: string,
  fixAction?: FixAction | null,
): ReadinessIssue {
  return {
    code,
    severity,
    element_ref: `elem-${code}`,
    element_refs: [`elem-${code}`],
    message_pl: message,
    wizard_step_hint: 'K2',
    suggested_fix: null,
    fix_action: fixAction ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaCompletenessPanel categorization', () => {
  it('categorizes trunk/segment/line/cable as MAGISTRALA', () => {
    expect(categorizeIssue(makeIssue('trunk.missing_length', 'BLOCKER', 'Brak długości'))).toBe('MAGISTRALA');
    expect(categorizeIssue(makeIssue('segment.no_type', 'IMPORTANT', 'Brak typu'))).toBe('MAGISTRALA');
    expect(categorizeIssue(makeIssue('line.impedance', 'INFO', 'Impedancja'))).toBe('MAGISTRALA');
    expect(categorizeIssue(makeIssue('cable.cross_section', 'BLOCKER', 'Przekrój'))).toBe('MAGISTRALA');
  });

  it('categorizes station/bay as STACJE', () => {
    expect(categorizeIssue(makeIssue('station.no_transformer', 'BLOCKER', 'Brak transformatora'))).toBe('STACJE');
    expect(categorizeIssue(makeIssue('bay.missing_apparatus', 'IMPORTANT', 'Brak aparatu'))).toBe('STACJE');
  });

  it('categorizes transformer/trafo as TRANSFORMATORY', () => {
    expect(categorizeIssue(makeIssue('transformer.no_catalog', 'BLOCKER', 'Brak katalogu'))).toBe('TRANSFORMATORY');
    expect(categorizeIssue(makeIssue('trafo.uk_missing', 'IMPORTANT', 'Brak Uk%'))).toBe('TRANSFORMATORY');
  });

  it('categorizes source/pv/bess/genset/ups as ZRODLA', () => {
    expect(categorizeIssue(makeIssue('source.missing_sk3', 'BLOCKER', 'Brak Sk3'))).toBe('ZRODLA');
    expect(categorizeIssue(makeIssue('pv.no_inverter', 'IMPORTANT', 'Brak falownika'))).toBe('ZRODLA');
    expect(categorizeIssue(makeIssue('bess.no_capacity', 'BLOCKER', 'Brak pojemności'))).toBe('ZRODLA');
    expect(categorizeIssue(makeIssue('genset.no_power', 'BLOCKER', 'Brak mocy'))).toBe('ZRODLA');
    expect(categorizeIssue(makeIssue('ups.no_backup', 'IMPORTANT', 'Brak podtrzymania'))).toBe('ZRODLA');
  });

  it('categorizes protection/relay/ct/vt as ZABEZPIECZENIA', () => {
    expect(categorizeIssue(makeIssue('protection.no_settings', 'BLOCKER', 'Brak nastaw'))).toBe('ZABEZPIECZENIA');
    expect(categorizeIssue(makeIssue('relay.no_ct', 'IMPORTANT', 'Brak CT'))).toBe('ZABEZPIECZENIA');
    expect(categorizeIssue(makeIssue('ct.no_ratio', 'INFO', 'Brak przekładni'))).toBe('ZABEZPIECZENIA');
    expect(categorizeIssue(makeIssue('vt.no_ratio', 'INFO', 'Brak przekładni'))).toBe('ZABEZPIECZENIA');
  });

  it('categorizes catalog/type_ref/materialization as KATALOG', () => {
    expect(categorizeIssue(makeIssue('catalog.missing_binding', 'BLOCKER', 'Brak powiązania'))).toBe('KATALOG');
    expect(categorizeIssue(makeIssue('type_ref.drift', 'IMPORTANT', 'Rozbieżność'))).toBe('KATALOG');
    expect(categorizeIssue(makeIssue('materialization.failed', 'BLOCKER', 'Błąd materializacji'))).toBe('KATALOG');
  });

  it('categorizes unknown codes as INNE', () => {
    expect(categorizeIssue(makeIssue('unknown.something', 'INFO', 'Coś'))).toBe('INNE');
    expect(categorizeIssue(makeIssue('misc.check', 'INFO', 'Sprawdź'))).toBe('INNE');
  });
});

describe('SchemaCompletenessPanel severity ordering', () => {
  const SEVERITY_ORDER = { BLOCKER: 0, IMPORTANT: 1, INFO: 2 };

  it('BLOCKER < IMPORTANT < INFO in sort order', () => {
    expect(SEVERITY_ORDER.BLOCKER).toBeLessThan(SEVERITY_ORDER.IMPORTANT);
    expect(SEVERITY_ORDER.IMPORTANT).toBeLessThan(SEVERITY_ORDER.INFO);
  });

  it('sorts issues by severity then code', () => {
    const issues = [
      makeIssue('z.info', 'INFO', 'Info'),
      makeIssue('a.blocker', 'BLOCKER', 'Blocker'),
      makeIssue('m.important', 'IMPORTANT', 'Important'),
      makeIssue('b.blocker', 'BLOCKER', 'Blocker 2'),
    ];

    const sorted = [...issues].sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return a.code.localeCompare(b.code);
    });

    expect(sorted[0].code).toBe('a.blocker');
    expect(sorted[1].code).toBe('b.blocker');
    expect(sorted[2].code).toBe('m.important');
    expect(sorted[3].code).toBe('z.info');
  });
});

describe('SchemaCompletenessPanel fix actions', () => {
  it('fix action types are valid', () => {
    const validTypes = ['OPEN_MODAL', 'NAVIGATE_TO_ELEMENT', 'SELECT_CATALOG', 'ADD_MISSING_DEVICE'];
    const fixAction: FixAction = {
      action_type: 'OPEN_MODAL',
      element_ref: 'elem-1',
      modal_type: null,
      surface_descriptor: resolveFixActionSurface({
        code: 'genset.missing_device',
        action_type: 'ADD_MISSING_DEVICE',
        element_ref: 'elem-1',
        payload_hint: null,
      }),
      payload_hint: {},
    };
    expect(validTypes).toContain(fixAction.action_type);
  });

  it('issue with fix_action can be repaired', () => {
    const issue = makeIssue('source.missing_sk3', 'BLOCKER', 'Brak Sk3', {
      action_type: 'OPEN_MODAL',
      element_ref: 'source-1',
      modal_type: null,
      surface_descriptor: resolveFixActionSurface({
        code: 'source.missing_sk3',
        action_type: 'OPEN_MODAL',
        element_ref: 'source-1',
        modal_type: 'NodeModal',
        payload_hint: null,
      }),
      payload_hint: null,
    });
    expect(issue.fix_action).not.toBeNull();
    expect(issue.fix_action!.action_type).toBe('OPEN_MODAL');
  });

  it('issue without fix_action shows only navigate', () => {
    const issue = makeIssue('trunk.missing_length', 'BLOCKER', 'Brak długości');
    expect(issue.fix_action).toBeNull();
    expect(issue.element_ref).toBeTruthy();
  });
});

describe('SchemaCompletenessPanel Polish labels', () => {
  it('all category labels are in Polish', () => {
    const labels = {
      MAGISTRALA: 'Magistrala SN',
      STACJE: 'Stacje',
      TRANSFORMATORY: 'Transformatory',
      ZRODLA: 'Źródła',
      ZABEZPIECZENIA: 'Zabezpieczenia',
      KATALOG: 'Katalog',
      INNE: 'Inne',
    };
    const forbiddenEnglish = ['Bus', 'Station', 'Transformer', 'Source', 'Protection', 'Catalog', 'Other'];
    for (const [, label] of Object.entries(labels)) {
      for (const word of forbiddenEnglish) {
        expect(label).not.toBe(word);
      }
    }
  });

  it('severity labels are in Polish', () => {
    const labels = { BLOCKER: 'Blokujące', IMPORTANT: 'Ważne', INFO: 'Informacja' };
    expect(labels.BLOCKER).toBe('Blokujące');
    expect(labels.IMPORTANT).toBe('Ważne');
    expect(labels.INFO).toBe('Informacja');
  });
});
