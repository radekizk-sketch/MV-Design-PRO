/*
 * Testy kontenera „Nowy / otwórz projekt" (E1a, karta K4 — bramka #4):
 * 1. klik celu tworzy projekt (TO-BE, 15,0 kV / 50,0 Hz) + PIERWSZY przypadek
 *    (`set_active: true`) i aktywuje oba w stanie aplikacji;
 * 2. otwarcie istniejącego projektu aktywuje projekt (nazwa z listy)
 *    i aktywny przypadek pobrany z serwera;
 * 3. sekcja przykładów NIE renderuje się (brak realnego dostawcy — zero
 *    fabrykacji, dowód w nagłówku `OtworzProjektKontener.tsx`).
 *
 * API zamockowane na granicy modułów klienckich (`ui/projects/api`,
 * `ui/study-cases/api`) — kontener ćwiczy realną ścieżkę interakcji
 * (klik → wywołanie → aktualizacja store'ów), bez sieci.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

import { OtworzProjektKontener } from '../OtworzProjektKontener';
import { OTWORZ_STRINGS, PRZYKLADY } from '../strings';
import { useAppStateStore } from '../../../../../ui/app-state';
import { createProject, deleteProject, listProjects } from '../../../../../ui/projects/api';
import { createStudyCase, getActiveStudyCase } from '../../../../../ui/study-cases/api';

vi.mock('../../../../../ui/projects/api', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('../../../../../ui/study-cases/api', () => ({
  createStudyCase: vi.fn(),
  getActiveStudyCase: vi.fn(),
}));

const CZAS = '2026-07-01T10:00:00Z';

function projektOdpowiedz(id: string, name: string) {
  return { id, name, description: null, created_at: CZAS, updated_at: CZAS };
}

describe('OtworzProjektKontener — realne akcje E1a (K4)', () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockResolvedValue([]);
    act(() => {
      useAppStateStore.getState().reset();
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('klik celu tworzy projekt (TO-BE, 15,0 kV / 50,0 Hz) + pierwszy przypadek i aktywuje oba', async () => {
    (createProject as Mock).mockResolvedValue(
      projektOdpowiedz('proj-1', OTWORZ_STRINGS.celNowaSiec),
    );
    (createStudyCase as Mock).mockResolvedValue({
      id: 'case-1',
      project_id: 'proj-1',
      name: 'Wariant bazowy',
      description: '',
      case_type: 'ShortCircuitCase',
      is_active: true,
      result_status: 'NONE',
      created_at: CZAS,
      updated_at: CZAS,
      config: {},
    });

    render(<OtworzProjektKontener />);
    fireEvent.click(await screen.findByText(OTWORZ_STRINGS.celNowaSiec));

    await waitFor(() => {
      expect(useAppStateStore.getState().activeCaseId).toBe('case-1');
    });

    // Kształt żądania projektu — 1:1 z kontraktem backendu (jak specy e2e).
    expect(createProject).toHaveBeenCalledWith({
      name: OTWORZ_STRINGS.celNowaSiec,
      description: OTWORZ_STRINGS.celNowaSiecOpis,
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    });
    // Pierwszy przypadek: set_active — bez niego pulpit i obliczenia są martwe.
    expect(createStudyCase).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 'proj-1', set_active: true }),
    );

    const stan = useAppStateStore.getState();
    expect(stan.activeProjectId).toBe('proj-1');
    expect(stan.activeProjectName).toBe(OTWORZ_STRINGS.celNowaSiec);
    expect(stan.activeCaseName).toBe('Wariant bazowy');
  });

  it('otwarcie istniejącego projektu aktywuje projekt (nazwa z listy) i aktywny przypadek z serwera', async () => {
    vi.mocked(listProjects).mockResolvedValue([
      projektOdpowiedz('PR1', 'Sieć SN Rejon Wschód'),
    ]);
    (getActiveStudyCase as Mock).mockResolvedValue({
      id: 'case-9',
      project_id: 'PR1',
      name: 'Wariant roboczy',
      description: '',
      case_type: 'ShortCircuitCase',
      is_active: true,
      result_status: 'NONE',
      created_at: CZAS,
      updated_at: CZAS,
      config: {},
    });

    render(<OtworzProjektKontener />);
    fireEvent.doubleClick(await screen.findByText('Sieć SN Rejon Wschód'));

    await waitFor(() => {
      expect(useAppStateStore.getState().activeCaseId).toBe('case-9');
    });

    const stan = useAppStateStore.getState();
    expect(stan.activeProjectId).toBe('PR1');
    expect(stan.activeProjectName).toBe('Sieć SN Rejon Wschód');
    expect(getActiveStudyCase).toHaveBeenCalledWith('PR1');
    // Nowy projekt NIE był tworzony — otwarcie ≠ tworzenie.
    expect(createProject).not.toHaveBeenCalled();
    expect(createStudyCase).not.toHaveBeenCalled();
  });

  it('sekcja przykładów nie renderuje się — brak realnego dostawcy materializacji (K4 §c)', async () => {
    render(<OtworzProjektKontener />);
    // Ekran gotowy (lista załadowana — pusty stan listy widoczny).
    expect(await screen.findByText(OTWORZ_STRINGS.brakProjektow)).toBeInTheDocument();

    expect(screen.queryByText(OTWORZ_STRINGS.przykladyTytul)).toBeNull();
    for (const p of PRZYKLADY) {
      expect(screen.queryByText(p.nazwa)).toBeNull();
    }
  });

  // -------------------------------------------------------------------------
  // Parytet z mostem `#dashboard` (karta KD-1, luki L-2…L-5)
  // -------------------------------------------------------------------------

  it('L-3: własna nazwa i opis trafiają do POST /api/projects (bez metryki celu)', async () => {
    (createProject as Mock).mockResolvedValue(projektOdpowiedz('proj-7', 'GPZ Wschód'));
    (createStudyCase as Mock).mockResolvedValue({
      id: 'case-7',
      project_id: 'proj-7',
      name: 'Wariant bazowy',
      description: '',
      case_type: 'ShortCircuitCase',
      is_active: true,
      result_status: 'NONE',
      created_at: CZAS,
      updated_at: CZAS,
      config: {},
    });

    render(<OtworzProjektKontener />);
    fireEvent.click(await screen.findByTestId('mvd-projekty-wlasna-nazwa'));
    fireEvent.change(screen.getByTestId('mvd-nowy-projekt-nazwa'), {
      target: { value: '  GPZ Wschód  ' },
    });
    fireEvent.change(screen.getByTestId('mvd-nowy-projekt-opis'), {
      target: { value: 'Zlecenie 2026/114' },
    });
    fireEvent.click(screen.getByTestId('mvd-nowy-projekt-utworz'));

    await waitFor(() => {
      expect(useAppStateStore.getState().activeProjectId).toBe('proj-7');
    });
    expect(createProject).toHaveBeenCalledWith({
      name: 'GPZ Wschód',
      description: 'Zlecenie 2026/114',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    });
  });

  it('L-3: pusta nazwa nie tworzy projektu (walidacja w dialogu)', async () => {
    render(<OtworzProjektKontener />);
    fireEvent.click(await screen.findByTestId('mvd-projekty-wlasna-nazwa'));
    fireEvent.click(screen.getByTestId('mvd-nowy-projekt-utworz'));

    expect(screen.getByTestId('mvd-nowy-projekt-blad')).toHaveTextContent(
      OTWORZ_STRINGS.bladNazwaPusta,
    );
    expect(createProject).not.toHaveBeenCalled();
  });

  it('L-4: „Odśwież listę" ponownie woła GET /api/projects', async () => {
    vi.mocked(listProjects).mockResolvedValue([projektOdpowiedz('PR1', 'Sieć A')]);
    render(<OtworzProjektKontener />);
    await screen.findByText('Sieć A');
    expect(listProjects).toHaveBeenCalledTimes(1);

    vi.mocked(listProjects).mockResolvedValue([
      projektOdpowiedz('PR1', 'Sieć A'),
      projektOdpowiedz('PR2', 'Sieć B'),
    ]);
    fireEvent.click(screen.getByTestId('mvd-projekty-odswiez'));

    expect(await screen.findByText('Sieć B')).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledTimes(2);
  });

  it('L-2: usunięcie wymaga potwierdzenia, potem woła DELETE i odświeża listę', async () => {
    vi.mocked(listProjects).mockResolvedValue([projektOdpowiedz('PR1', 'Sieć do kasacji')]);
    (deleteProject as Mock).mockResolvedValue(undefined);

    render(<OtworzProjektKontener />);
    fireEvent.click(await screen.findByText('Sieć do kasacji'));
    fireEvent.click(screen.getByTestId('mvd-projekty-usun'));

    // Dialog potwierdzenia — sama prośba NIE usuwa (operacja nieodwracalna).
    expect(screen.getByTestId('mvd-projekty-usun-dialog')).toBeInTheDocument();
    expect(deleteProject).not.toHaveBeenCalled();

    vi.mocked(listProjects).mockResolvedValue([]);
    fireEvent.click(screen.getByTestId('mvd-projekty-usun-dialog-potwierdz'));

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith('PR1');
    });
    expect(await screen.findByText(OTWORZ_STRINGS.brakProjektow)).toBeInTheDocument();
  });

  it('L-2: anulowanie potwierdzenia nie usuwa projektu', async () => {
    vi.mocked(listProjects).mockResolvedValue([projektOdpowiedz('PR1', 'Sieć zostaje')]);

    render(<OtworzProjektKontener />);
    fireEvent.click(await screen.findByText('Sieć zostaje'));
    fireEvent.click(screen.getByTestId('mvd-projekty-usun'));
    fireEvent.click(screen.getByTestId('mvd-projekty-usun-dialog-anuluj'));

    expect(screen.queryByTestId('mvd-projekty-usun-dialog')).toBeNull();
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('L-2: usunięcie AKTYWNEGO projektu czyści kontekst aplikacji', async () => {
    vi.mocked(listProjects).mockResolvedValue([projektOdpowiedz('PR1', 'Sieć aktywna')]);
    (deleteProject as Mock).mockResolvedValue(undefined);
    act(() => {
      useAppStateStore.getState().setActiveProject('PR1', 'Sieć aktywna');
      useAppStateStore.getState().setActiveCase('case-1', 'Wariant', null, 'NONE');
    });

    render(<OtworzProjektKontener onWrocDoPulpitu={() => {}} />);
    fireEvent.click(await screen.findByText('Sieć aktywna'));
    fireEvent.click(screen.getByTestId('mvd-projekty-usun'));
    vi.mocked(listProjects).mockResolvedValue([]);
    fireEvent.click(screen.getByTestId('mvd-projekty-usun-dialog-potwierdz'));

    await waitFor(() => {
      expect(useAppStateStore.getState().activeProjectId).toBeNull();
    });
    expect(useAppStateStore.getState().activeCaseId).toBeNull();
  });

  it('L-5: zmiana projektu przy otwartym projekcie przechodzi przez potwierdzenie', async () => {
    vi.mocked(listProjects).mockResolvedValue([
      projektOdpowiedz('PR1', 'Sieć bieżąca'),
      projektOdpowiedz('PR2', 'Sieć docelowa'),
    ]);
    (getActiveStudyCase as Mock).mockResolvedValue(null);
    act(() => {
      useAppStateStore.getState().setActiveProject('PR1', 'Sieć bieżąca');
    });

    render(<OtworzProjektKontener onWrocDoPulpitu={() => {}} />);
    fireEvent.doubleClick(await screen.findByText('Sieć docelowa'));

    // Bez potwierdzenia kontekst pozostaje na bieżącym projekcie.
    expect(screen.getByTestId('mvd-projekty-zmiana-dialog')).toBeInTheDocument();
    expect(useAppStateStore.getState().activeProjectId).toBe('PR1');

    fireEvent.click(screen.getByTestId('mvd-projekty-zmiana-dialog-potwierdz'));
    await waitFor(() => {
      expect(useAppStateStore.getState().activeProjectId).toBe('PR2');
    });
    expect(useAppStateStore.getState().activeProjectName).toBe('Sieć docelowa');
  });

  it('L-5: ponowne otwarcie TEGO SAMEGO projektu nie pyta o zmianę kontekstu', async () => {
    vi.mocked(listProjects).mockResolvedValue([projektOdpowiedz('PR1', 'Sieć bieżąca')]);
    (getActiveStudyCase as Mock).mockResolvedValue(null);
    act(() => {
      useAppStateStore.getState().setActiveProject('PR1', 'Sieć bieżąca');
    });

    render(<OtworzProjektKontener onWrocDoPulpitu={() => {}} />);
    fireEvent.doubleClick(await screen.findByText('Sieć bieżąca'));

    expect(screen.queryByTestId('mvd-projekty-zmiana-dialog')).toBeNull();
    await waitFor(() => {
      expect(getActiveStudyCase).toHaveBeenCalledWith('PR1');
    });
  });
});
