/**
 * Podmiana dostawcy w routerze (karta F-E5b): E-28 renderuje ramę prowadzącą
 * `EkranKoordynacji` (realna strona koordynacji), a NIE atrapę
 * `ProtectionCoordinationSurface` z demonstracyjnymi krzywymi IEC 60255.
 * E-27 („Zabezpieczenia i automatyka" — INNA zdolność) renderuje uczciwego
 * dostawcę kontraktu analizy, również nie atrapę.
 *
 * Intencja: dawny plik Iteracja14TCC.test.tsx ćwiczył wnętrze atrapy (TCC z
 * fizyką liczoną w UI). Po usunięciu atrapy asercje sprawdzają, że dostawca
 * został podmieniony u źródła — atrapa zniknęła z routera całkowicie.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { useAppStateStore } from '../../app-state';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import type { WorkspaceSurfaceDescriptor } from '../types';

function surfaceForScreen(screenCode: string, surfaceId: string): WorkspaceSurfaceDescriptor {
  return {
    surfaceId,
    screenCode,
    titlePl: 'Koordynacja zabezpieczeń',
    entityRef: null,
    entityType: null,
    routeState: { payload: {} } as never,
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
}

describe('F-E5b — podmiana dostawcy E-28/E-27 w routerze', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
  });

  it('E-28 renderuje ramę prowadzącą EkranKoordynacji, nie atrapę', () => {
    useNetworkBuildStore.setState({ activeSurface: surfaceForScreen('E-28', 'e28-test') });
    render(<WorkspaceSurfaceRouter region="main" />);

    expect(screen.getByTestId('mvd-koordynacja')).toBeInTheDocument();
    // Atrapa ProtectionCoordinationSurface usunięta — jej testidy nie istnieją.
    expect(screen.queryByTestId('protection-coordination-surface')).not.toBeInTheDocument();
    expect(screen.queryByTestId('protection-coordination-tcc')).not.toBeInTheDocument();
  });

  it('E-28 bez aktywnego projektu pokazuje uczciwy stan zerowy (nie pustą tabelę)', () => {
    useNetworkBuildStore.setState({ activeSurface: surfaceForScreen('E-28', 'e28-zero') });
    render(<WorkspaceSurfaceRouter region="main" />);

    expect(screen.getByTestId('mvd-koordynacja-brak-projektu')).toBeInTheDocument();
    // Realna strona koordynacji renderuje się dopiero po spełnieniu warunków wejścia.
    expect(screen.queryByTestId('protection-coordination-page')).not.toBeInTheDocument();
  });

  it('E-27 (inna zdolność) renderuje dostawcę kontraktu analizy, nie atrapę', () => {
    useNetworkBuildStore.setState({ activeSurface: surfaceForScreen('E-27', 'e27-test') });
    render(<WorkspaceSurfaceRouter region="main" />);

    const kontrakt = screen.getByTestId('mvd-kontrakt-analizy');
    expect(kontrakt).toBeInTheDocument();
    expect(kontrakt.getAttribute('data-ekran')).toBe('E-27');
    expect(screen.queryByTestId('protection-coordination-surface')).not.toBeInTheDocument();
  });
});
