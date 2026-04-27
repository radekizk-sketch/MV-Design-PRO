import { describe, expect, it } from 'vitest';

import { CANONICAL_SCREEN_CODES, getScreenDefinition } from '../screenCanonRegistry';

const FORBIDDEN_LABEL_PARTS = [
  'Grid Code',
  'Workspace',
  'Modal',
  'Dialog',
  'Wizard',
  'Run',
  'Snapshot',
  'Proof',
  'Case',
  'Branch',
  'Feeder',
];

describe('screen labels polish canon', () => {
  it('does not expose old English or application labels as screen names', () => {
    const visibleLabels = CANONICAL_SCREEN_CODES.flatMap((screenId) => {
      const definition = getScreenDefinition(screenId);
      return [definition.labelFull, definition.labelShort];
    });

    for (const label of visibleLabels) {
      for (const forbidden of FORBIDDEN_LABEL_PARTS) {
        expect(label).not.toContain(forbidden);
      }
    }
  });

  it('uses formal user labels instead of raw component keys', () => {
    for (const screenId of CANONICAL_SCREEN_CODES) {
      const definition = getScreenDefinition(screenId);
      expect(definition.labelFull).not.toBe(definition.componentKey);
      expect(definition.labelShort).not.toBe(definition.componentKey);
    }
  });
});
