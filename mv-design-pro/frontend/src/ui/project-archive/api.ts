/**
 * Project Archive API Client — P31
 *
 * API functions dla eksportu i importu projektów.
 */

import type { ArchivePreviewResponse, ImportResponse } from './types';

// KANON PREFIKSU (karta PREFIKSY): router archiwum stoi pod `/api/projects`.
// Wczesniej stal pod `/projects` i wymagal wlasnej reguly dev-proxy — bez niej
// eksport paczki z przegladarki dostawal HTML serwera statycznego zamiast ZIP-a.
const API_BASE = '/api/projects';

// =============================================================================
// Export
// =============================================================================

/**
 * Eksportuj projekt do archiwum ZIP.
 * Zwraca Blob do pobrania.
 */
export async function exportProject(projectId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/${projectId}/export`, {
    method: 'POST',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Błąd eksportu: ${response.status}`);
  }

  return response.blob();
}

/**
 * Eksportuj projekt i pobierz jako plik.
 */
export async function downloadProjectArchive(
  projectId: string,
  projectName?: string
): Promise<void> {
  const blob = await exportProject(projectId);

  // Utwórz link do pobrania
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  // Nazwa pliku
  const safeName = (projectName || 'projekt').replace(/[^a-zA-Z0-9_-]/g, '_');
  link.download = `${safeName}_${projectId.substring(0, 8)}.mvdp.zip`;

  // Symuluj kliknięcie
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// =============================================================================
// Import
// =============================================================================

/**
 * Importuj projekt z archiwum ZIP.
 */
export async function importProject(
  file: File,
  options?: {
    newName?: string;
    verifyIntegrity?: boolean;
  }
): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append('file', file);

  if (options?.newName) {
    formData.append('new_name', options.newName);
  }

  if (options?.verifyIntegrity !== undefined) {
    formData.append('verify_integrity', String(options.verifyIntegrity));
  }

  const response = await fetch(`${API_BASE}/import`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Błąd importu: ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// Preview
// =============================================================================

/**
 * Podgląd zawartości archiwum bez importu.
 */
export async function previewArchive(file: File): Promise<ArchivePreviewResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/import/preview`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Błąd podglądu: ${response.status}`);
  }

  return response.json();
}
