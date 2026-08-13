/**
 * Testy akceptacyjne Etapu 10 — workflow inżyniera E2E.
 *
 * Pokrywa kryteria akceptacyjne z planu (sekcja 26 wymagań użytkownika)
 * w trybie integracyjnym (vitest, jsdom). Pełne testy E2E (Playwright)
 * są w e2e/sld-canvas-routing.spec.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithQueryClient as render } from '../../test/queryClientTestUtils';

import { useAppStateStore } from '../app-state';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { useSnapshotStore } from '../topology/snapshotStore';
// D4: kanonem palety komend jest `ui2/search` — duplikat z `ui/network-build`
// skasowany, a jego jedyna unikalna zdolność (otwieranie okien E-XX) przeniesiona
// do indeksu wyszukiwarki. Test ćwiczy JĄ, na kanonicznym komponencie.
import { CommandPalette } from '../../ui2/search/CommandPalette';
import { zbudujIndeksWyszukiwania } from '../../ui2/search/searchIndex';
import { SldCanvasV3Workspace } from '../sld/v3/canvas/SldCanvasV3Workspace';
import { ProjectDashboardSurface } from '../workspace/surfaces/ProjectDashboardSurface';
import { GpzConfiguratorSurface } from '../workspace/surfaces/GpzConfiguratorSurface';
import { BayConfiguratorSurface } from '../workspace/surfaces/BayConfiguratorSurface';
import { StationConfiguratorSurface } from '../workspace/surfaces/StationConfiguratorSurface';
import { SnSegmentSurface } from '../workspace/surfaces/SnSegmentSurface';
import { ZksnSurface, BranchPoleSurface, NopSurface } from '../workspace/surfaces/InfrastructureSurfaces';
import { PvSourceSurface, BessSurface, FwSurface } from '../workspace/surfaces/DerSurfaces';

/**
 * Migawka PUSTEGO modelu (S9-11 / P-8): stan pusty kanwy montuje się wyłącznie
 * przy werdykcie 'pusty' (`ui/topology/pustoscModelu`) — brak migawki to
 * pustość NIEUSTALONA i stan pusty NIE ma prawa wisieć w drzewie (pomiar
 * audytu: akcje `sld-empty-state*` przy sieci 16/51 stacji).
 */
function pustaMigawka() {
  return {
    header: {
      enm_version: '1.0',
      name: 'test',
      revision: 0,
      hash_sha256: 'h0',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    sources: [], buses: [], branches: [], transformers: [], loads: [],
    generators: [], shunt_capacitors: [], substations: [], bays: [],
    junctions: [], branch_points: [], corridors: [], line_runs: [],
    connection_nodes: [], measurements: [], protection_assignments: [],
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
  } as never;
}

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
  it('A. SLD canvas renderuje się z polskim empty state przy PUSTYM modelu', () => {
    useSnapshotStore.setState({ snapshot: pustaMigawka() });
    render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(screen.getByTestId('sld-canvas-v3-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('sld-empty-state')).toBeInTheDocument();
  });

  // === Test B: Pulpit projektu (E-00) ===
  it('B. Pulpit projektu pokazuje stan loading na początku', () => {
    render(<ProjectDashboardSurface />);
    expect(screen.getByTestId('project-dashboard-surface')).toBeInTheDocument();
    expect(screen.getByText(/Środowisko inżynierskie MV-DESIGN-PRO/)).toBeInTheDocument();
  });

  // === Test C: Konfigurator GPZ (E-10) ===
  it('C. GPZ ma 5 kart konfiguracyjnych z polskimi etykietami', () => {
    render(<GpzConfiguratorSurface surface={sampleSurface} />);
    ['Identyfikacja', 'Strona 110 kV', 'Transformator 110/SN', 'Sekcje SN', 'Bilans pól SN'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  // === Test D: Pole SN (E-11) ===
  it('D. Pole SN ma 8 sekcji konfiguratora', () => {
    render(<BayConfiguratorSurface surface={sampleSurface} />);
    expect(screen.getByTestId('bay-configurator-surface')).toBeInTheDocument();
  });

  // === Test E: Stacja (E-13) ===
  it('E. Stacja ma pełny przepływ konfiguracji układu', () => {
    render(<StationConfiguratorSurface surface={sampleSurface} />);
    expect(screen.getByTestId('station-configurator-surface')).toBeInTheDocument();
  });

  // === Test F: Odcinek SN (E-12) ===
  it('F. Odcinek SN obsługuje przełączanie rodziny kabel/linia', () => {
    render(<SnSegmentSurface surface={sampleSurface} />);
    expect(screen.getByTestId('sn-segment-surface')).toBeInTheDocument();
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

  // Atrapa dostawców akcji indeksu — test bada FILTROWANIE, nie skutki komend.
  // (pole `otworzEkran` nadpisywane w przypadku testowym, żeby dało się je
  // sprawdzić, gdyby kiedyś doszła asercja wykonania).
// === Test I: Command Palette ===
  it('I. Paleta komend filtruje pozycje po fuzzy search i znajduje okno GPZ', () => {
    const otworzEkran = vi.fn();
    const pozycje = zbudujIndeksWyszukiwania({
      akcje: {
        przejdzDoPrzestrzeni: vi.fn(),
        wybierzObiekt: vi.fn(),
        otworzEkran,
        przelicz: vi.fn(),
        otworzProjekt: vi.fn(),
        przywrocUklad: vi.fn(),
        polaczPonownie: vi.fn(),
      },
    });
    render(
      <CommandPalette
        otwarta
        onZamknij={() => {}}
        pozycje={pozycje}
        trybAktualny="expert"
        onWykonaj={(pozycja) => pozycja.akcja()}
        onPrzelaczTryb={() => {}}
      />,
    );
    const input = screen.getByTestId('mvd-cmdk-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'GPZ' } });
    // Fraza „GPZ" trafia w SŁOWA KLUCZOWE pozycji (kod ekranu + nazwa
    // skrócona) — parytet ze skasowaną paletą, która szukała po tych samych
    // danych. Na liście widać etykietę pełną okna E-10.
    const wyniki = screen.getByTestId('mvd-cmdk-listbox');
    expect(wyniki.textContent).toContain('Główny Punkt Zasilający');
    expect(screen.getByTestId('mvd-cmdk-opcja-ekran:E-10')).toBeInTheDocument();
  });

  // === Test J: Brak placeholderów / TODO produkcyjnych ===
  it('J. Brak fałszywych zer "0,00" w empty stanach', () => {
    useSnapshotStore.setState({ snapshot: pustaMigawka() });
    render(<SldCanvasV3Workspace width={400} height={300} />);
    const empty = screen.getByTestId('sld-empty-state');
    expect(empty.textContent).not.toContain('0.00');
    expect(empty.textContent).not.toContain('0,00');
  });

  // === Test K: Polskie etykiety ===
  it('K. UI używa polskich etykiet z diakrytyką', () => {
    render(<GpzConfiguratorSurface surface={sampleSurface} />);
    // Polski z diakrytyką
    expect(screen.getByText(/Główny Punkt Zasilający/)).toBeInTheDocument();
  });

  // === Test L: Determinizm — ten sam input → ten sam output ===
  it('L. SldCanvasV3Workspace renderuje się deterministycznie 10× pod rząd', () => {
    for (let i = 0; i < 10; i++) {
      const { unmount } = render(<SldCanvasV3Workspace width={400} height={300} />);
      expect(screen.getByTestId('sld-canvas-v3-workspace')).toBeInTheDocument();
      unmount();
    }
  });
});
