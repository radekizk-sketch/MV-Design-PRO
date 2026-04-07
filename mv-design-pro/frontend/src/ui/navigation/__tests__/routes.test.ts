import { afterEach, describe, expect, it } from 'vitest';

import {
  ROUTES,
  getRouteByHash,
  navigateTo,
  normalizeEditorHashRoute,
  normalizeHashRoute,
} from '../routes';

describe('navigation routes', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('normalizes legacy editor aliases to the canonical editor route', () => {
    expect(normalizeEditorHashRoute('')).toBe(ROUTES.SLD.hash);
    expect(normalizeEditorHashRoute('#sld')).toBe(ROUTES.SLD.hash);
    expect(normalizeEditorHashRoute('#network-build')).toBe(ROUTES.SLD.hash);
  });

  it('normalizes legacy results aliases to the canonical results route', () => {
    expect(normalizeHashRoute('#results-workspace')).toBe(ROUTES.RESULTS.hash);
    expect(getRouteByHash('#results-workspace')?.label).toBe(ROUTES.RESULTS.label);
  });

  it('resolves legacy editor aliases as the same route definition', () => {
    expect(getRouteByHash('')?.label).toBe(ROUTES.SLD.label);
    expect(getRouteByHash('#sld')?.label).toBe(ROUTES.SLD.label);
    expect(getRouteByHash('#network-build')?.label).toBe(ROUTES.SLD.label);
    expect(getRouteByHash('#editor')?.label).toBe(ROUTES.SLD.label);
  });

  it('preserves query params while navigating from results to the editor', () => {
    window.location.hash = '#results?run=run-1&mode=run&sel=Bus:bus-1&overlay=result';

    navigateTo(ROUTES.SLD);

    expect(window.location.hash).toBe('#editor?run=run-1&mode=run&sel=Bus:bus-1&overlay=result');
  });
});
