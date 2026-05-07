/**
 * Testy Iteracji 14 — TCC chart w ProtectionCoordinationSurface (E-28).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { useAppStateStore } from '../../app-state';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import type { WorkspaceSurfaceDescriptor } from '../types';

const E28_SURFACE: WorkspaceSurfaceDescriptor = {
  surfaceId: 'e28-test',
  screenCode: 'E-28',
  titlePl: 'Koordynacja zabezpieczeń',
  entityRef: null,
  entityType: null,
  routeState: { payload: { runId: 'run-XYZ' } } as never,
  breadcrumbs: [],
  supportsMiniSld: false,
  supportsChildren: false,
  sizeClass: 'C',
  stackLevel: 0,
  openMode: 'expand_workspace',
  subjectKind: 'helper_context',
  subjectRef: null,
  saveMode: 'edit',
  hasUnsavedChanges: false,
  tabId: null,
} as never;

describe('Iteracja 14 — TCC chart w E-28 ProtectionCoordinationSurface', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.setState({ activeSurface: E28_SURFACE });
  });

  it('renderuje ProtectionCoordinationSurface z TCC chart container', () => {
    render(<WorkspaceSurfaceRouter region="main" />);
    expect(screen.getByTestId('protection-coordination-surface')).toBeInTheDocument();
    expect(screen.getByTestId('protection-coordination-tcc')).toBeInTheDocument();
  });

  it('renderuje TCC chart container (TimeCurrentChart)', () => {
    const { container } = render(<WorkspaceSurfaceRouter region="main" />);
    // TimeCurrentChart renderuje ResponsiveContainer; w jsdom zewnętrzny
    // wrapper jest obecny, jego dzieci (svg) są jednak generowane przez
    // Recharts dopiero po pomiarach DOM. Sprawdzamy że surface renderuje się
    // bez wyjątków.
    expect(screen.getByTestId('protection-coordination-tcc')).toBeInTheDocument();
    // Recharts wrapper jest obecny w DOM (klasa .recharts-responsive-container).
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });

  it('opisuje referencyjne dane krzywych IEC 60255 bez komunikatu demonstracyjnego', () => {
    render(<WorkspaceSurfaceRouter region="main" />);
    expect(screen.getByText(/Krzywe IEC 60255/)).toBeInTheDocument();
    expect(screen.getByText(/Krzywe referencyjne \(IEC 60255 SI\)/)).toBeInTheDocument();
  });

  it('podaje active runId z surface.routeState', () => {
    render(<WorkspaceSurfaceRouter region="main" />);
    expect(screen.getByText(/run-XYZ/)).toBeInTheDocument();
  });

  it('zachowuje regułę PROTECTION_CANONICAL_ARCHITECTURE — brak werdyktów OK/FAIL', () => {
    render(<WorkspaceSurfaceRouter region="main" />);
    const text = screen.getByTestId('protection-coordination-surface').textContent;
    expect(text).toContain('marginesach numerycznych');
    expect(text).toContain('bez werdyktów OK/FAIL');
  });
});
