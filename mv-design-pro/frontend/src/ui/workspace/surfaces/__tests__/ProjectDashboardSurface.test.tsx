/**
 * Testy ProjectDashboardSurface (Etap 2 — Pulpit projektu E-00).
 *
 * Pokrycie:
 *  1. Empty state — render gdy GET /api/projects zwraca [].
 *  2. Lista projektów — render projektów + akcja "Otwórz".
 *  3. Akcja "Otwórz" wywołuje setActiveProject + nawigację do #sld.
 *  4. Stan błędu — render komunikatu gdy API rzuca wyjątek.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProjectDashboardSurface } from '../ProjectDashboardSurface';
import { useAppStateStore } from '../../../app-state';
import * as projectsApi from '../../../projects/api';

describe('ProjectDashboardSurface — pulpit projektu E-00', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    vi.spyOn(projectsApi, 'listProjects');
    vi.spyOn(projectsApi, 'createProject');
    vi.spyOn(projectsApi, 'deleteProject');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderuje empty state gdy lista projektów jest pusta', async () => {
    (projectsApi.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    render(<ProjectDashboardSurface />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-empty')).toBeInTheDocument();
    });
    expect(screen.getByText(/Załóż pierwszy projekt MV-DESIGN-PRO/)).toBeInTheDocument();
  });

  it('renderuje listę projektów i pozwala otworzyć projekt', async () => {
    const project = {
      id: 'p1',
      name: 'Sieć SN Gmina Test',
      description: 'Sieć testowa do walidacji',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
    };
    (projectsApi.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([project]);

    render(<ProjectDashboardSurface />);

    await waitFor(() => {
      expect(screen.getByTestId(`dashboard-project-card-${project.id}`)).toBeInTheDocument();
    });
    expect(screen.getByText('Sieć SN Gmina Test')).toBeInTheDocument();

    const openBtn = screen.getByTestId(`dashboard-open-${project.id}`);
    fireEvent.click(openBtn);

    expect(useAppStateStore.getState().activeProjectId).toBe('p1');
    expect(useAppStateStore.getState().activeProjectName).toBe('Sieć SN Gmina Test');
    expect(window.location.hash).toBe('#sld');
  });

  it('pokazuje stan błędu gdy listProjects rzuca wyjątek', async () => {
    (projectsApi.listProjects as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Niedostępny serwer API'),
    );

    render(<ProjectDashboardSurface />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Niedostępny serwer API/)).toBeInTheDocument();
  });

  it('przycisk "Nowy projekt" otwiera modal metadanych', async () => {
    (projectsApi.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    render(<ProjectDashboardSurface />);
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-empty')).toBeInTheDocument();
    });

    const newBtn = screen.getByTestId('dashboard-new-project');
    fireEvent.click(newBtn);
    expect(screen.getByRole('dialog', { name: 'Metadane projektu' })).toBeInTheDocument();
  });
});
