/**
 * Test ProofSurface (E-36) — widok publiczny powierzchni dowodów.
 *
 * Karta JEDNA-SCIEZKA-EDYCJI usunęła sekcję „Rozpływ mocy rozszerzony (z regulacją
 * zaczepów)": przełącznik zaczepów transformatora i dane źródeł OZE żyją w modelu sieci
 * (ENM), więc zwykły bieg rozpływu liczy je bez osobnej ścieżki. Intencja dawnego testu
 * zostaje: publiczny widok dowodów nie pokazuje wewnętrznych nazw, kodów ekranów ani
 * endpointów API, a uzasadnienia rozszerzonej walidacji są dostępne.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useAppStateStore } from '../../app-state';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import type { WorkspaceSurfaceDescriptor } from '../types';

const PROOF_SURFACE: WorkspaceSurfaceDescriptor = {
  surfaceId: 'proof-test',
  screenCode: 'E-36',
  titlePl: 'Uzasadnienie inżynierskie',
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

function renderuj() {
  global.fetch = vi.fn().mockImplementation((url: string | URL) => {
    const adres = url.toString();
    if (adres.includes('konfiguracja-stacji/snapshot')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          bess_operation_modes: [],
          tap_changers: [],
          hv_fuses: [],
          pf_curves: [],
          block_transformers: [],
        }),
      } as never);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as never);
  }) as never;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return rtlRender(
    <QueryClientProvider client={qc}>
      <WorkspaceSurfaceRouter region="main" />
    </QueryClientProvider>,
  );
}

describe('ProofSurface — widok publiczny', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.setState({ activeSurface: PROOF_SURFACE } as never);
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: 'case-1' });
  });

  it('pokazuje uzasadnienia rozszerzonej walidacji bez osobnego rozpływu rozszerzonego', () => {
    renderuj();
    expect(screen.getByText('Uzasadnienia rozszerzonej walidacji')).toBeInTheDocument();
    expect(screen.queryByText(/Rozpływ mocy rozszerzony/)).toBeNull();
  });

  it('nie pokazuje wewnętrznych nazw, kodów ekranów ani endpointów API', () => {
    renderuj();
    expect(document.body.textContent ?? '').not.toMatch(
      /audytu 2|\/api\/|Proof Pack|E-36|SC3F_IEC60909|POWER_FLOW|EQUIPMENT_PROOF|EARTHING_GROUND_FAULT_SN|\bDER\b/i,
    );
  });
});
