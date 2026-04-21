import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { updateUrlWithSelection } from './urlState';

describe('urlState', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/#analysis?run=run-123&snapshot=run&tab=trace');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('preserves route context while updating selection on the canonical analysis hash', () => {
    updateUrlWithSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Szyna 1',
    });

    const [hash, query = ''] = window.location.hash.split('?');
    const params = new URLSearchParams(query);

    expect(hash).toBe('#analysis');
    expect(params.get('run')).toBe('run-123');
    expect(params.get('snapshot')).toBe('run');
    expect(params.get('tab')).toBe('trace');
    expect(params.get('sel')).toBe('bus-1');
    expect(params.get('type')).toBe('Bus');
    expect(params.get('name')).toBe('Szyna 1');
  });
});
