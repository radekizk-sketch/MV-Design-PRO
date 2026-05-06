/**
 * ProjectDashboardSurface (E-00) — Pulpit projektu MV-DESIGN-PRO.
 *
 * Etap 2 dostawy:
 *   - Lista istniejących projektów z `projects/api.ts` (GET /api/projects).
 *   - Akcja "Otwórz" → setActiveProject + nawigacja do E-01 (Środowisko SLD).
 *   - Akcja "Nowy projekt" → ProjectMetadataModal w trybie create →
 *     POST /api/projects → setActiveProject → nawigacja do E-01.
 *   - Empty state (brak projektów) z polskim komunikatem inżynierskim.
 *   - Stan loading / error obsłużony bez fałszywych wartości.
 */

import { useCallback, useEffect, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { ProjectMetadataModal } from '../../network-build/ProjectMetadataModal';
import { notify } from '../../notifications/store';
import {
  createProject,
  deleteProject,
  listProjects,
  type Project,
} from '../../projects';
import { MISSING_DASH } from '../../shared/formatPolishValue';

/** Format daty PL z ISO bez sztucznych zer. */
function formatDatePl(iso: string | null | undefined): string {
  if (!iso) return MISSING_DASH;
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return MISSING_DASH;
    return dt.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return MISSING_DASH;
  }
}

interface DashboardState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  projects: Project[];
  errorMessage: string | null;
}

export function ProjectDashboardSurface(): JSX.Element {
  const setActiveProject = useAppStateStore((state) => state.setActiveProject);
  const [state, setState] = useState<DashboardState>({
    status: 'idle',
    projects: [],
    errorMessage: null,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading', errorMessage: null }));
    try {
      const projects = await listProjects();
      setState({ status: 'ready', projects, errorMessage: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieznany błąd pobierania listy projektów.';
      setState({ status: 'error', projects: [], errorMessage: message });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleOpenProject = useCallback(
    (project: Project) => {
      setActiveProject(project.id, project.name);
      window.location.hash = '#sld';
      notify(`Otwarto projekt "${project.name}".`, 'success');
    },
    [setActiveProject],
  );

  const handleCreateProject = useCallback(
    async (metadata: { projectName: string; description: string }) => {
      const name = metadata.projectName.trim();
      if (!name) {
        notify('Nazwa projektu jest wymagana.', 'warning');
        return;
      }
      try {
        const created = await createProject({
          name,
          description: metadata.description.trim() || null,
        });
        setActiveProject(created.id, created.name);
        notify(`Utworzono projekt "${created.name}".`, 'success');
        setCreateOpen(false);
        window.location.hash = '#sld';
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Nieznany błąd tworzenia projektu.';
        notify(message, 'error');
      }
    },
    [setActiveProject],
  );

  const handleDeleteProject = useCallback(
    async (project: Project) => {
      const confirmed = window.confirm(
        `Czy na pewno usunąć projekt "${project.name}"? Operacja jest nieodwracalna.`,
      );
      if (!confirmed) return;
      setBusyId(project.id);
      try {
        await deleteProject(project.id);
        notify(`Usunięto projekt "${project.name}".`, 'info');
        await refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Nieznany błąd usuwania projektu.';
        notify(message, 'error');
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  return (
    <div data-testid="project-dashboard-surface" className="flex h-full w-full flex-col bg-scada-bg p-6">
      {/* Nagłówek */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
            E-00 · Pulpit projektu
          </div>
          <h1 className="mt-1 text-xl font-bold text-scada-text">
            Środowisko inżynierskie MV-DESIGN-PRO
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-scada-muted">
            Wybierz istniejący projekt lub utwórz nowy. Każdy projekt zawiera
            jeden model sieci, wiele zakresów i warunków obliczeń oraz historię
            obliczeń.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded border border-scada-border px-3 py-1.5 text-sm text-scada-text hover:bg-scada-hover-nav"
            data-testid="dashboard-refresh"
          >
            Odśwież listę
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded bg-scada-sn px-4 py-1.5 text-sm font-medium text-scada-bg hover:bg-yellow-300"
            data-testid="dashboard-new-project"
          >
            Nowy projekt
          </button>
        </div>
      </div>

      {/* Stan ładowania */}
      {state.status === 'loading' && (
        <div className="rounded border border-scada-border bg-scada-panel p-6 text-center text-sm text-scada-muted">
          Pobieranie listy projektów...
        </div>
      )}

      {/* Stan błędu */}
      {state.status === 'error' && (
        <div
          data-testid="dashboard-error"
          className="rounded border border-red-700 bg-red-950/30 p-6 text-sm text-red-200"
        >
          <div className="font-semibold">Błąd pobierania listy projektów</div>
          <div className="mt-1 text-red-300">{state.errorMessage ?? MISSING_DASH}</div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 rounded border border-red-500 px-3 py-1 text-xs text-red-100 hover:bg-red-900/40"
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {/* Stan pusty */}
      {state.status === 'ready' && state.projects.length === 0 && (
        <div
          data-testid="dashboard-empty"
          className="flex flex-1 items-center justify-center"
        >
          <div className="max-w-md rounded border border-scada-border bg-scada-panel p-6 text-center">
            <div className="mb-2 text-sm font-bold uppercase tracking-widest text-scada-muted">
              Brak projektów
            </div>
            <h2 className="mb-3 text-base font-semibold text-scada-text">
              Załóż pierwszy projekt MV-DESIGN-PRO
            </h2>
            <p className="text-sm leading-6 text-scada-muted">
              Projekt zawiera model sieci SN, dane katalogowe, scenariusze obliczeń
              oraz raporty. Po utworzeniu przejdziesz do środowiska budowy modelu (E-01).
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-4 rounded bg-scada-sn px-4 py-1.5 text-sm font-medium text-scada-bg hover:bg-yellow-300"
            >
              Załóż pierwszy projekt
            </button>
          </div>
        </div>
      )}

      {/* Lista projektów */}
      {state.status === 'ready' && state.projects.length > 0 && (
        <div
          data-testid="dashboard-project-list"
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {state.projects.map((project) => (
            <div
              key={project.id}
              data-testid={`dashboard-project-card-${project.id}`}
              className="flex flex-col rounded border border-scada-border bg-scada-panel p-4 hover:border-scada-sn"
            >
              <div className="mb-2 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
                  Projekt
                </div>
                <h3 className="mt-1 text-base font-semibold text-scada-text">
                  {project.name || MISSING_DASH}
                </h3>
                <p className="mt-1 line-clamp-3 text-sm text-scada-muted">
                  {project.description?.trim() || 'Brak opisu projektu.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-scada-border pt-3 text-[11px] text-scada-muted">
                <div>
                  <div className="font-semibold text-scada-text">Utworzono</div>
                  <div>{formatDatePl(project.created_at)}</div>
                </div>
                <div>
                  <div className="font-semibold text-scada-text">Modyfikacja</div>
                  <div>{formatDatePl(project.updated_at)}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenProject(project)}
                  className="flex-1 rounded bg-scada-sn px-3 py-1.5 text-sm font-medium text-scada-bg hover:bg-yellow-300"
                  data-testid={`dashboard-open-${project.id}`}
                >
                  Otwórz
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteProject(project)}
                  disabled={busyId === project.id}
                  className="rounded border border-red-700 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid={`dashboard-delete-${project.id}`}
                  title="Usuń projekt"
                >
                  Usuń
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal tworzenia projektu */}
      <ProjectMetadataModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={(metadata) => void handleCreateProject(metadata)}
      />
    </div>
  );
}

export default ProjectDashboardSurface;
