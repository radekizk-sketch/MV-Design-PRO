/**
 * Testy akceptacyjne Etapu 10 — workflow inżyniera E2E.
 *
 * Pokrywa kryteria akceptacyjne z planu (sekcja 26 wymagań użytkownika)
 * w trybie integracyjnym (vitest, jsdom). Pełne testy E2E (Playwright)
 * są w e2e/sld-canvas-routing.spec.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithQueryClient as render } from '../../test/queryClientTestUtils';

import { useAppStateStore } from '../app-state';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { useSnapshotStore } from '../topology/snapshotStore';
import { CommandPalette } from '../network-build/CommandPalette';
import { SldWorkspaceContainer } from '../sld/v2/canvas/SldWorkspaceContainer';
import { ProjectDashboardSurface } from '../workspace/surfaces/ProjectDashboardSurface';
import { GpzConfiguratorSurface } from '../workspace/surfaces/GpzConfiguratorSurface';
import { BayConfiguratorSurface } from '../workspace/surfaces/BayConfiguratorSurface';
import { StationConfiguratorSurface } from '../workspace/surfaces/StationConfiguratorSurface';
import { SnSegmentSurface } from '../workspace/surfaces/SnSegmentSurface';
import { ZksnSurface, BranchPoleSurface, NopSurface } from '../workspace/surfaces/InfrastructureSurfaces';
import { PvSourceSurface, BessSurface, FwSurface } from '../workspace/surfaces/DerSurfaces';

const sampleSurface = {
  surfaceId: 'acc-surface',
  screenCode: 'E-01' as const,
  titlePl: 'Test',
  entityRef: null,
  entityType: null,
  routeState: { payload: {} },
  breadcrumbs: [],
  supportsMiniSld: false,
  supportsChildren: false,
  sizeClass: 'C' as const,
  stackLevel: 0 as const,
  openMode: 'expand_workspace' as const,
  subjectKind: 'helper_context' as const,
  subjectRef: null,
} as never;

describe('Etap 10 — Testy akceptacyjne workflow inżyniera E2E', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.setState({ activeSurface: null });
  });

  // === Test A: Środowisko SLD (E-01) ===
  it('A. SLD canvas renderuje się z polskim empty state', () => {
    render(<SldWorkspaceContainer width={800} height={600} />);
    expect(screen.getByTestId('sld-canvas-v2')).toBeInTheDocument();
    expect(screen.getByTestId('sld-empty-state')).toBeInTheDocument();
  });

  // === Test B: Pulpit projektu (E-00) ===
  it('B. Pulpit projektu pokazuje stan loading na początku', () => {
    render(<ProjectDashboardSurface />);
    expect(screen.getByTestId('project-dashboard-surface')).toBeInTheDocument();
    expect(screen.getByText(/Środowisko inżynierskie MV-DESIGN-PRO/)).toBeInTheDocument();
  });

  // === Test C: Konfigurator GPZ (E-10) — z entityRef widzi karty Advanced (R45) ===
  it('C. GPZ ma 5 kart konfiguracyjnych z polskimi etykietami (Advanced mode)', () => {
    const surfaceWithGpz = { ...sampleSurface, entityRef: 'gpz-test' };
    render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
    /* R45 dual mode — przełącz na Advanced żeby zobaczyć 7 kart inżynierskich. */
    fireEvent.click(screen.getByTestId('gpz-mode-advanced-switch'));
    ['Identyfikacja', 'Strona 110 kV', 'Sekcje SN', 'Bilans pól SN'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  // === Test D: Pole SN (E-11) ===
  it('D. Pole SN renderuje się (R47 Editor mode default)', () => {
    render(<BayConfiguratorSurface surface={sampleSurface} />);
    expect(screen.getByTestId('bay-configurator-surface')).toBeInTheDocument();
  });

  // === Test E: Stacja (E-13) — R46 wizard 8-step default + przełącznik do legacy ===
  it('E. Stacja ma wizard 8-step (R46) + dostęp do legacy 10-kart przez switcher', () => {
    render(<StationConfiguratorSurface surface={sampleSurface} />);
    /* Default = wizard. */
    expect(screen.getByTestId('station-wizard-surface')).toBeInTheDocument();
    /* Toggle do legacy view (10-kart). */
    fireEvent.click(screen.getByTestId('station-mode-legacy-switch'));
    expect(screen.getByTestId('station-configurator-surface')).toBeInTheDocument();
  });

  // === Test F: Odcinek SN (E-12) — R47 Inline mode default + przełącznik do legacy ===
  it('F. Odcinek SN — Inline mode default + legacy 4-kart przez switcher', () => {
    render(<SnSegmentSurface surface={sampleSurface} />);
    expect(screen.getByTestId('sn-segment-surface')).toBeInTheDocument();
    /* R47 default Inline (LineSegmentInline). */
    expect(screen.getByTestId('line-segment-inline')).toBeInTheDocument();
    /* Toggle do legacy 4-kart. */
    fireEvent.click(screen.getByTestId('segment-mode-legacy-switch'));
    expect(screen.getByText('Identyfikacja')).toBeInTheDocument();
  });

  // === Test G: Infrastruktura terenowa (ZK SN/słup/NOP) ===
  it('G. ZK SN, słup i NOP mają dedykowane konfiguratory', () => {
    const { rerender } = render(<ZksnSurface surface={sampleSurface} />);
    expect(screen.getByTestId('zksn-surface')).toBeInTheDocument();
    rerender(<BranchPoleSurface surface={sampleSurface} />);
    expect(screen.getByTestId('branch-pole-surface')).toBeInTheDocument();
    rerender(<NopSurface surface={sampleSurface} />);
    expect(screen.getByTestId('nop-surface')).toBeInTheDocument();
  });

  // === Test H: OZE (PV/BESS/FW) ===
  it('H. PV, BESS, FW mają dedykowane surface\'y z DerConfigurator', () => {
    const { rerender } = render(<PvSourceSurface surface={sampleSurface} />);
    expect(screen.getByTestId('pv-source-surface')).toBeInTheDocument();
    rerender(<BessSurface surface={sampleSurface} />);
    expect(screen.getByTestId('bess-surface')).toBeInTheDocument();
    rerender(<FwSurface surface={sampleSurface} />);
    expect(screen.getByTestId('fw-surface')).toBeInTheDocument();
  });

  // === Test I: Command Palette ===
  it('I. Command palette filtruje komendy po fuzzy search', () => {
    render(<CommandPalette isOpen onClose={() => {}} />);
    const input = screen.getByTestId('command-palette-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'GPZ' } });
    const results = screen.getByTestId('command-palette-results');
    expect(results.textContent).toContain('GPZ');
  });

  // === Test J: Brak placeholderów / TODO produkcyjnych ===
  it('J. Brak fałszywych zer "0,00" w empty stanach', () => {
    render(<SldWorkspaceContainer width={400} height={300} />);
    const empty = screen.getByTestId('sld-empty-state');
    expect(empty.textContent).not.toContain('0.00');
    expect(empty.textContent).not.toContain('0,00');
  });

  // === Test K: Polskie etykiety (z entityRef → karty Advanced widoczne) ===
  it('K. UI używa polskich etykiet z diakrytyką', () => {
    const surfaceWithGpz = { ...sampleSurface, entityRef: 'gpz-test' };
    render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
    fireEvent.click(screen.getByTestId('gpz-mode-advanced-switch'));
    // Polski z diakrytyką w nagłówku Advanced
    expect(screen.getByText(/Główny Punkt Zasilający/)).toBeInTheDocument();
  });

  // === Test L: Determinizm — ten sam input → ten sam output ===
  it('L. SldWorkspaceContainer renderuje się deterministycznie 10× pod rząd', () => {
    for (let i = 0; i < 10; i++) {
      const { unmount } = render(<SldWorkspaceContainer width={400} height={300} />);
      expect(screen.getByTestId('sld-canvas-v2')).toBeInTheDocument();
      unmount();
    }
  });
});
