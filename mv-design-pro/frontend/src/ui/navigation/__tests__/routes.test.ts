import { beforeEach, describe, expect, it } from 'vitest';

import {
  ROUTES,
  getRouteByHash,
  isAnalysisRouteAlias,
  navigateToCaseConfig,
  navigateToCompare,
  navigateToNetworkBuild,
  navigateToProof,
  navigateToResults,
  navigateToResultsPowerFlow,
  navigateToResultsProtection,
  resolveAnalysisRouteAliasTab,
} from '../routes';

function getHashParts() {
  const [hash, query = ''] = window.location.hash.split('?');
  return {
    hash,
    params: new URLSearchParams(query),
  };
}

describe('routes V12.5', () => {
  beforeEach(() => {
    window.location.hash = '#analysis?run=run-1&sel=bus-1&tab=compare';
  });

  it('resolves canonical analysis route from hash with query params', () => {
    expect(getRouteByHash('#analysis?tab=compare')).toEqual(ROUTES.ANALYSIS);
  });

  it('does not expose legacy public hashes as route definitions', () => {
    expect(getRouteByHash('#results')).toBeNull();
    expect(getRouteByHash('#proof')).toBeNull();
    expect(getRouteByHash('#compare')).toBeNull();
    expect(getRouteByHash('#switchgear')).toBeNull();
    expect(getRouteByHash('#network-build')).toBeNull();
    expect(getRouteByHash('#case-manager')).toBeNull();
  });

  it('treats legacy result hashes only as aliases to the canonical E-24 route', () => {
    expect(isAnalysisRouteAlias('#results')).toBe(true);
    expect(isAnalysisRouteAlias('#proof')).toBe(true);
    expect(isAnalysisRouteAlias('#protection-results')).toBe(true);
    expect(isAnalysisRouteAlias('#power-flow-results')).toBe(true);
    expect(isAnalysisRouteAlias('#compare')).toBe(true);
    expect(isAnalysisRouteAlias('#case-manager')).toBe(false);
    expect(resolveAnalysisRouteAliasTab('#results')).toBe('results');
    expect(resolveAnalysisRouteAliasTab('#proof')).toBe('trace');
    expect(resolveAnalysisRouteAliasTab('#protection-results')).toBe('protection');
    expect(resolveAnalysisRouteAliasTab('#power-flow-results')).toBe('power-flow');
    expect(resolveAnalysisRouteAliasTab('#compare')).toBe('compare');
    expect(resolveAnalysisRouteAliasTab('#switchgear')).toBeNull();
  });

  it('navigates analysis aliases through dedicated public alias hashes', () => {
    navigateToResults();

    let location = getHashParts();
    expect(location.hash).toBe('#analysis');
    expect(location.params.get('run')).toBe('run-1');
    expect(location.params.get('sel')).toBe('bus-1');
    expect(location.params.has('tab')).toBe(false);

    navigateToProof();
    location = getHashParts();
    expect(location.hash).toBe('#proof');
    expect(location.params.has('tab')).toBe(false);

    navigateToResultsProtection();
    location = getHashParts();
    expect(location.hash).toBe('#protection-results');
    expect(location.params.has('tab')).toBe(false);

    navigateToResultsPowerFlow();
    location = getHashParts();
    expect(location.hash).toBe('#power-flow-results');
    expect(location.params.has('tab')).toBe(false);

    navigateToCompare();
    location = getHashParts();
    expect(location.hash).toBe('#compare');
    expect(location.params.has('tab')).toBe(false);
  });

  it('maps legacy helper entrypoints onto canonical hashes', () => {
    navigateToCaseConfig();
    let location = getHashParts();
    expect(location.hash).toBe('#case-config');
    expect(location.params.has('tab')).toBe(false);

    navigateToNetworkBuild();
    location = getHashParts();
    expect(location.hash).toBe('#sld');
    expect(location.params.has('tab')).toBe(false);
  });
});
