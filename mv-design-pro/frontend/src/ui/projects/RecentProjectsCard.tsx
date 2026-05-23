/**
 * RecentProjectsCard — kafelek "Ostatnio otwierane projekty" (Etap 0 z planu).
 *
 * "E-00 dashboard z CTA 'Stwórz nowy projekt' + 'Otwórz ostatni' +
 *  ostatnie 5 projektów (recents)"
 *
 * Storage: localStorage z TTL 30 dni. Limit do 5 entries.
 */

import { useState, useEffect } from 'react';

export interface RecentProject {
  id: string;
  name: string;
  investor: string;
  lastOpenedAt: string;
}

const STORAGE_KEY = 'mv-design-pro:recent-projects';
const MAX_RECENT = 5;
const TTL_DAYS = 30;

export function loadRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: RecentProject[] = JSON.parse(raw);
    const ttlMs = TTL_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return parsed
      .filter((p) => now - new Date(p.lastOpenedAt).getTime() < ttlMs)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function saveRecentProject(project: Omit<RecentProject, 'lastOpenedAt'>): void {
  try {
    const existing = loadRecentProjects();
    const filtered = existing.filter((p) => p.id !== project.id);
    const updated: RecentProject[] = [
      { ...project, lastOpenedAt: new Date().toISOString() },
      ...filtered,
    ].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore - localStorage might be unavailable
  }
}

export function clearRecentProjects(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface RecentProjectsCardProps {
  onOpenProject: (projectId: string) => void;
  onCreateNew: () => void;
}

export function RecentProjectsCard({ onOpenProject, onCreateNew }: RecentProjectsCardProps) {
  const [recents, setRecents] = useState<RecentProject[]>([]);

  useEffect(() => {
    setRecents(loadRecentProjects());
  }, []);

  if (recents.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center"
        data-testid="empty-state-recent-projects"
      >
        <div className="text-base font-semibold text-slate-700">
          Witaj w MV-Design-PRO
        </div>
        <p className="text-sm text-slate-500">
          Nie masz jeszcze żadnego projektu. Utwórz pierwszy aby rozpocząć projektowanie sieci SN/WN.
        </p>
        <button
          type="button"
          onClick={onCreateNew}
          className="rounded bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          data-testid="empty-state-recent-projects-cta"
        >
          Stwórz nowy projekt
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
      data-testid="recent-projects-card"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Ostatnio otwierane projekty</h3>
        <button
          type="button"
          onClick={onCreateNew}
          className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          data-testid="recent-projects-new"
        >
          + Nowy projekt
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {recents.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
              data-testid={`recent-project-${project.id}`}
              title={`Otwórz projekt ${project.name}`}
            >
              <div>
                <div className="font-medium text-slate-900">{project.name}</div>
                <div className="text-xs text-slate-500">{project.investor}</div>
              </div>
              <div className="text-xs text-slate-400">{formatRelativeDate(project.lastOpenedAt)}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatRelativeDate(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'dziś';
  if (diffDays === 1) return 'wczoraj';
  if (diffDays < 7) return `${diffDays} dni temu`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} tyg. temu`;
  return new Date(iso).toLocaleDateString('pl-PL');
}
