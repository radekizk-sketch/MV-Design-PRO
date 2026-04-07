import { beforeEach, describe, expect, it } from 'vitest';

import {
  decodeSelectionFromParams,
  updateUrlWithSelection,
} from '../urlState';

describe('urlState', () => {
  beforeEach(() => {
    window.history.replaceState(
      null,
      '',
      '/#results?mode=run&run=run-42&overlay=result&trace_step=7',
    );
  });

  it('preserves run and trace params when selection changes', () => {
    updateUrlWithSelection({
      id: 'station-01',
      type: 'Station',
      name: 'Stacja SN 01',
    });

    expect(window.location.hash).toContain('#results?');
    expect(window.location.hash).toContain('mode=run');
    expect(window.location.hash).toContain('run=run-42');
    expect(window.location.hash).toContain('overlay=result');
    expect(window.location.hash).toContain('trace_step=7');
    expect(window.location.hash).toContain('sel=station-01');
    expect(window.location.hash).toContain('type=Station');
  });

  it('accepts Station as a valid selection type from URL params', () => {
    const params = new URLSearchParams('sel=station-01&type=Station&name=Stacja%20SN%2001');

    expect(decodeSelectionFromParams(params)).toEqual({
      id: 'station-01',
      type: 'Station',
      name: 'Stacja SN 01',
    });
  });
});
