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
import { createProject, listProjects } from '../../../../../ui/projects/api';
import { createStudyCase, getActiveStudyCase } from '../../../../../ui/study-cases/api';

vi.mock('../../../../../ui/projects/api', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
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
});
