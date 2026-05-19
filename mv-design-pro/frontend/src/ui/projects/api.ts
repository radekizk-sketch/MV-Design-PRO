/**
 * Projects API Client
 *
 * Funkcje do zarządzania projektami.
 */

const API_BASE = '/api/projects';

/**
 * Interfejs projektu.
 */
export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Request do tworzenia projektu.
 */
export interface CreateProjectRequest {
  name: string;
  description?: string | null;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string | null;
  mode?: 'AS-IS' | 'TO-BE';
  voltage_level_kv?: number;
  frequency_hz?: number;
}

/**
 * Obsługa błędów API.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Błąd HTTP: ${response.status}`);
  }
  return response.json();
}

/**
 * Utwórz nowy projekt.
 */
export async function createProject(request: CreateProjectRequest): Promise<Project> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<Project>(response);
}

/**
 * Pobierz projekt po ID.
 */
export async function getProject(projectId: string): Promise<Project> {
  const response = await fetch(`${API_BASE}/${projectId}`);
  return handleResponse<Project>(response);
}

/**
 * Aktualizuj metadane projektu.
 */
export async function updateProject(projectId: string, request: UpdateProjectRequest): Promise<Project> {
  const response = await fetch(`${API_BASE}/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<Project>(response);
}

/**
 * Lista wszystkich projektów.
 */
export async function listProjects(): Promise<Project[]> {
  const response = await fetch(API_BASE);
  const data = await handleResponse<{ projects: Project[]; total: number }>(response);
  return data.projects;
}

/**
 * Usuń projekt.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${projectId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Błąd HTTP: ${response.status}`);
  }
}
