import { describe, expect, it } from 'vitest';

import * as layoutModule from '..';

describe('layout public contract V12.5', () => {
  it('exports only the canonical layout surface', () => {
    expect(layoutModule).toHaveProperty('CanonicalLayout');
    expect(layoutModule).not.toHaveProperty('MainLayout');
    expect(layoutModule).not.toHaveProperty('SidebarLayout');
  });
});
