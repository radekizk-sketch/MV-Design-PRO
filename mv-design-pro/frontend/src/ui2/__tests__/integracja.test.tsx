/**
 * Test integracyjny powłoki (karta E1.4 §4) — scenariusz SPEC_POWIAZANIA §7 w wersji powłoki:
 * klik w drzewie → zdarzenie `selekcja` (źródło: drzewo) → inspektor pokazuje obiekt;
 * zmiana rewizji modelu → pasek stanu aktualizuje się bez przeładowania.
 * Store'y produkcyjne sterowane setState (bez API); fetch /api/health zamockowany.
 */
import { screen, act, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel, TopologyGraphSummary } from '../../types/enm';
import { useAppStateStore } from '../../ui/app-state';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { useTopologyStore } from '../../ui/topology/store';
import { AppRoot } from '../AppRoot';
import { subskrybuj, type ZdarzenieSelekcja } from '../events';
import { OTWORZ_STRINGS } from '../spaces/projekt/otworz';
import { useShellStore } from '../shell/useShellStore';
// Karta FAB-J: `useSynchronizacjaDerZModelu` w `AppRoot` czyta snapshot audytu 2
// przez React Query — produkcja dostaje `QueryClientProvider` w `main.tsx`, test
// tego samego drzewa musi dostać go tak samo (ten sam helper co testy kreatora DER).
import { renderWithQueryClient } from '../../test/queryClientTestUtils';

// E1.7b: kanwa SLD (ciężki komponent canvas) jest atrapowana — testy powłoki
// sprawdzają kontrakt montażu (LegacySurface + testidy), nie silnik SLD.
vi.mock('../../ui/sld/v3/canvas/SldCanvasV3Workspace', () => ({
  SldCanvasV3Workspace: () => null,
}));

function snapshotZRewizja(revision: number): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'projekt-testowy',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      revision,
      hash_sha256: `hash-${revision}`,
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [{ id: 'bus-gpz', ref_id: 'GPZ', name: 'GPZ Przykładowo', tags: [], meta: {} }],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

function summaryZGpz(): TopologyGraphSummary {
  return {
    case_id: 'case-1',
    enm_revision: 5,
    bus_count: 1,
    branch_count: 0,
    transformer_count: 0,
    source_count: 1,
    load_count: 0,
    generator_count: 0,
    measurement_count: 0,
    protection_count: 0,
    is_radial: true,
    has_cycles: false,
    adjacency: [],
    spine: [{ bus_ref: 'GPZ', depth: 0, is_source: true, children_refs: [] }],
    lateral_roots: [],
  };
}

/**
 * Renderuje powłokę i czeka na znacznik gotowości `app-ready` — jak realny
 * użytkownik (i spec Playwright). Montaż AppRoot planuje dwie asynchroniczne
 * aktualizacje stanu: znacznik gotowości po klatce rAF oraz status zdrowia
 * backendu po mikrotasku fetch /api/health. Oczekiwanie na stan końcowy
 * domyka je w act() — bez tego React zgłasza
 * „An update to AppRoot inside a test was not wrapped in act(...)".
 */
async function renderujPowloke() {
  const wynik = renderWithQueryClient(<AppRoot />);
  await screen.findByTestId('app-ready');
  return wynik;
}

describe('E1.4 — integracja powłoki (shell + nav + inspector + events)', () => {
  beforeEach(() => {
    // E1.7c: trasa hash jest częścią stanu powłoki (LegacyWarsztat) — testy
    // startują z czystej trasy (mosty przestrzeni ustawiają np. '#sld').
    window.history.replaceState(null, '', '/');
    window.location.hash = '';
    // Atrapa fetch zwraca kształty zgodne z kontraktami czytanymi przez
    // powłokę (K4/E1a: kontener „Nowy / otwórz projekt" woła GET /api/projects,
    // hydratacja K2 waliduje projekt/przypadek i czyta listy zakresów).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (wejscie: RequestInfo | URL) => {
        const url = String(wejscie);
        if (url.endsWith('/api/projects')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ projects: [], total: 0 }),
          } as unknown as Response;
        }
        if (url.includes('/enm/topology/summary')) {
          // KD-1: drzewo topologii dostaje dane Z SERWERA (`useZasilanieDrzewaTopologii`)
          // — scena zasila TEN endpoint zamiast wstrzykiwac store'a bezposrednio,
          // wiec test ćwiczy realna sciezke danych powloki.
          return { ok: true, status: 200, json: async () => summaryZGpz() } as unknown as Response;
        }
        if (url.includes('/api/study-cases/project/') && url.endsWith('/active')) {
          return { ok: true, status: 204, json: async () => null } as unknown as Response;
        }
        if (url.includes('/api/study-cases/project/')) {
          return { ok: true, status: 200, json: async () => [] } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }),
    );
    act(() => {
      useSnapshotStore.setState({ snapshot: snapshotZRewizja(5), rewizjaBiezacegoModelu: 5 });
      useTopologyStore.setState({ summary: summaryZGpz() });
      useShellStore.setState({ activeSpace: 'model' });
      // E1a (K4): przestrzeń „Projekt" pokazuje pulpit tylko przy AKTYWNYM
      // projekcie — testy powłoki startują z otwartym projektem (intencja
      // testów bez zmian); scenariusz „bez projektu" ma osobny test niżej.
      useAppStateStore.setState({
        activeProjectId: 'projekt-testowy-id',
        activeProjectName: 'projekt-testowy',
        // KD-1: topologia jest danymi PRZYPADKU — bez aktywnego przypadku
        // powloka uczciwie nie ma czego pokazac w drzewie.
        activeCaseId: 'przypadek-testowy-id',
        activeCaseName: 'Wariant bazowy',
      });
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    act(() => {
      useSnapshotStore.setState({ snapshot: null, rewizjaBiezacegoModelu: null });
      useTopologyStore.setState({ summary: null });
      useAppStateStore.getState().reset();
    });
  });

  it('klik w drzewie emituje selekcję ze źródłem okna i wypełnia inspektor obiektem ze snapshotu', async () => {
    const odebrane: ZdarzenieSelekcja[] = [];
    const stop = subskrybuj('selekcja', (z) => odebrane.push(z));
    await renderujPowloke();

    // Grupy startują zwinięte — rozwiń „Magistrala (od GPZ)" chevronem, potem kliknij węzeł.
    fireEvent.click(screen.getByTestId('mvd-tree-chevron-magistrala'));
    const wezel = screen.getByText('GPZ');
    fireEvent.click(wezel);

    expect(odebrane.some((z) => z.obiektId === 'GPZ' && z.zrodlo === 'drzewo-kontekstowe')).toBe(true);
    // Inspektor pokazuje nazwę obiektu ze snapshotu (adapter po ref_id) —
    // nagłówek inspektora + wiersz „Nazwa" w sekcji Podstawowe.
    expect(screen.getAllByText('GPZ Przykładowo').length).toBeGreaterThanOrEqual(1);
    stop();
  });

  it('zmiana rewizji modelu aktualizuje pasek stanu bez przeładowania', async () => {
    await renderujPowloke();
    expect(screen.getByText('Model: rew. 5')).toBeTruthy();
    act(() => {
      useSnapshotStore.setState({ snapshot: snapshotZRewizja(6), rewizjaBiezacegoModelu: 6 });
    });
    expect(screen.getByText('Model: rew. 6')).toBeTruthy();
  });

  it('selektor trybów drzewa jest ukryty w U1 (decyzja E1.4 §2.2 — zero martwego UI)', async () => {
    await renderujPowloke();
    expect(screen.queryByTestId('mvd-tree-mode')).toBeNull();
  });

  it('przestrzeń „Projekt" renderuje pulpit projektu (E2.1) w warsztacie przy aktywnym projekcie', async () => {
    // Przestrzeń wybierana PO montażu: parytet trasy domyślnej (decyzja na
    // montaż) przełącza 'projekt'→'schemat' przy zimnym starcie z projektem —
    // jak w realnej pracy pulpit ogląda się wybierając przestrzeń jawnie.
    await renderujPowloke();
    act(() => {
      useShellStore.setState({ activeSpace: 'projekt' });
    });
    expect(screen.getByText('Pulpit projektu')).toBeTruthy();
    expect(screen.getByText('Przypadki obliczeniowe')).toBeTruthy();
  });

  it('bez aktywnego projektu przestrzeń „Projekt" prowadzi ekranem „Nowy / otwórz projekt" (E1a, K4)', async () => {
    act(() => {
      useAppStateStore.getState().reset();
      useShellStore.setState({ activeSpace: 'projekt' });
    });
    await renderujPowloke();
    // Sekwencja pierwszego użycia: cel pracy widoczny, pulpit nie renderuje się.
    expect(await screen.findByText(OTWORZ_STRINGS.celTytul)).toBeTruthy();
    expect(screen.getByText(OTWORZ_STRINGS.tytul)).toBeTruthy();
    expect(screen.queryByText('Pulpit projektu')).toBeNull();
  });

  it('Ctrl+K otwiera pełną wyszukiwarkę poleceń (E1.5) zamiast szkieletu', async () => {
    await renderujPowloke();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByPlaceholderText('Szukaj poleceń, obiektów, okien…')).toBeTruthy();
    expect(screen.queryByTestId('mvd-search-scrim')).toBeNull();
  });

  it('drzewo kontekstowe jest ukryte przy zwiniętym lewym panelu (listwa ikon)', async () => {
    await renderujPowloke();
    expect(screen.getByTestId('mvd-left-context')).toBeTruthy();
    act(() => {
      useShellStore.getState().toggleLeftCollapsed('model');
    });
    expect(screen.queryByTestId('mvd-left-context')).toBeNull();
  });

  // === E1.7b — kontrakt testid parytetu ze starą powłoką ===

  it('kontrakt e2e: znacznik app-ready pojawia się po załadowaniu powłoki', async () => {
    renderWithQueryClient(<AppRoot />);
    expect(screen.getByTestId('canonical-layout')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('app-ready')).toBeTruthy();
    });
    expect(screen.getByTestId('canonical-layout').getAttribute('data-ready')).toBe('true');
  });

  it('kontrakt e2e: pasek aktywnego przypadku i środkowy panel noszą testidy starej powłoki', async () => {
    await renderujPowloke();
    expect(screen.getByTestId('active-case-bar')).toBeTruthy();
    expect(screen.getByTestId('main-content')).toBeTruthy();
  });

  it('kontrakt e2e: przestrzeń legacy (model) montuje LegacySurface z workspace-surface-main', async () => {
    await renderujPowloke();
    expect(screen.getByTestId('workspace-surface-main')).toBeTruthy();
  });

  it('kontrakt e2e: przestrzeń z nową zawartością (projekt) też wystawia workspace-surface-main', async () => {
    await renderujPowloke();
    act(() => {
      useShellStore.setState({ activeSpace: 'projekt' });
    });
    const warsztat = screen.getByTestId('workspace-surface-main');
    expect(warsztat.textContent).toContain('Pulpit projektu');
  });

  // === Łańcuch etapu przekazania projektu: hub dokumentacji → archiwum ZIP ===

  it('karta „Archiwum projektu (ZIP)" huba prowadzi do DZIAŁAJĄCEJ akcji, nie do przestrzeni bez akcji', async () => {
    await renderujPowloke();
    act(() => {
      useShellStore.setState({ activeSpace: 'dokumentacja' });
    });

    // Natywny klik akcji karty huba (ścieżka realnego użytkownika).
    fireEvent.click(screen.getByRole('button', { name: 'Otwórz archiwum' }));

    // Lądowanie: przestrzeń „Projekt" pokazuje okno archiwum z realną akcją.
    expect(useShellStore.getState().activeSpace).toBe('projekt');
    const okno = await screen.findByTestId('mvd-archiwum-projektu');
    expect(okno.textContent).toContain('Archiwum projektu (ZIP)');
    expect(screen.getByTestId('mvd-arch-eksport')).toBeTruthy();
  });

  it('kafel pulpitu otwiera to samo okno archiwum (wejście niezależne od huba)', async () => {
    await renderujPowloke();
    act(() => {
      useShellStore.setState({ activeSpace: 'projekt' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Otwórz archiwum' }));
    expect(await screen.findByTestId('mvd-archiwum-projektu')).toBeTruthy();
  });

  it('wyjście z przestrzeni „Projekt" gasi żądanie okna archiwum (brak zaległych żądań)', async () => {
    await renderujPowloke();
    act(() => {
      useShellStore.getState().setZadanieArchiwumProjektu(true);
      useShellStore.setState({ activeSpace: 'projekt' });
    });
    expect(await screen.findByTestId('mvd-archiwum-projektu')).toBeTruthy();
    act(() => {
      useShellStore.setState({ activeSpace: 'model' });
    });
    expect(useShellStore.getState().zadanieArchiwumProjektu).toBe(false);
  });
});
