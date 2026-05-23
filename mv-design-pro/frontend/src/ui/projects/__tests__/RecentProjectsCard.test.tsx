import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  RecentProjectsCard,
  loadRecentProjects,
  saveRecentProject,
  clearRecentProjects,
} from '../RecentProjectsCard';

beforeEach(() => {
  localStorage.clear();
});

describe('saveRecentProject / loadRecentProjects', () => {
  it('zapisuje i odczytuje projekt', () => {
    saveRecentProject({ id: 'proj-1', name: 'GPZ Test', investor: 'PSE' });
    const loaded = loadRecentProjects();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('proj-1');
    expect(loaded[0].name).toBe('GPZ Test');
    expect(loaded[0].lastOpenedAt).toBeTruthy();
  });

  it('deduplikuje po id (najnowszy wpis wygrywa)', () => {
    saveRecentProject({ id: 'proj-1', name: 'Stara nazwa', investor: 'A' });
    saveRecentProject({ id: 'proj-1', name: 'Nowa nazwa', investor: 'B' });
    const loaded = loadRecentProjects();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Nowa nazwa');
  });

  it('limit do 5 najnowszych', () => {
    for (let i = 0; i < 7; i++) {
      saveRecentProject({ id: `proj-${i}`, name: `Projekt ${i}`, investor: 'X' });
    }
    const loaded = loadRecentProjects();
    expect(loaded).toHaveLength(5);
    // Most recent first
    expect(loaded[0].id).toBe('proj-6');
  });

  it('clearRecentProjects usuwa wszystko', () => {
    saveRecentProject({ id: 'proj-1', name: 'Test', investor: 'X' });
    clearRecentProjects();
    expect(loadRecentProjects()).toHaveLength(0);
  });
});

describe('RecentProjectsCard', () => {
  it('pokazuje empty state gdy brak projektów', () => {
    render(<RecentProjectsCard onOpenProject={vi.fn()} onCreateNew={vi.fn()} />);
    expect(screen.getByTestId('empty-state-recent-projects')).toBeTruthy();
    expect(screen.getByTestId('empty-state-recent-projects-cta')).toBeTruthy();
  });

  it('empty state CTA wywołuje onCreateNew', () => {
    const onCreateNew = vi.fn();
    render(<RecentProjectsCard onOpenProject={vi.fn()} onCreateNew={onCreateNew} />);
    fireEvent.click(screen.getByTestId('empty-state-recent-projects-cta'));
    expect(onCreateNew).toHaveBeenCalledOnce();
  });

  it('renderuje listę gdy są projekty', () => {
    saveRecentProject({ id: 'proj-1', name: 'GPZ Wschód', investor: 'PSE' });
    saveRecentProject({ id: 'proj-2', name: 'GPZ Zachód', investor: 'Energa' });
    render(<RecentProjectsCard onOpenProject={vi.fn()} onCreateNew={vi.fn()} />);
    expect(screen.getByTestId('recent-projects-card')).toBeTruthy();
    expect(screen.getByTestId('recent-project-proj-1')).toBeTruthy();
    expect(screen.getByTestId('recent-project-proj-2')).toBeTruthy();
  });

  it('kliknięcie projektu wywołuje onOpenProject z id', () => {
    saveRecentProject({ id: 'proj-1', name: 'Test', investor: 'X' });
    const onOpenProject = vi.fn();
    render(<RecentProjectsCard onOpenProject={onOpenProject} onCreateNew={vi.fn()} />);
    fireEvent.click(screen.getByTestId('recent-project-proj-1'));
    expect(onOpenProject).toHaveBeenCalledWith('proj-1');
  });

  it('button "+ Nowy projekt" zawsze widoczny gdy są recents', () => {
    saveRecentProject({ id: 'proj-1', name: 'X', investor: 'Y' });
    render(<RecentProjectsCard onOpenProject={vi.fn()} onCreateNew={vi.fn()} />);
    expect(screen.getByTestId('recent-projects-new')).toBeTruthy();
  });
});
