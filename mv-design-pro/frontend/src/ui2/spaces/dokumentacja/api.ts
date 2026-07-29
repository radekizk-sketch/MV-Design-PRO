/*
 * Dostawca danych magazynu dokumentów projektu (karta F-E8.3). Realny endpoint
 * backendu (api/document_store.py): `GET /api/projects/{id}/documents` → lista
 * REALNYCH rekordów cyklu życia dokumentu (status/data/rozmiar/strony/SHA).
 * ZERO fabrykacji: brak rekordu = uczciwy stan „Do wygenerowania" (jak dziś);
 * karta z rekordem pokazuje „Wygenerowany [data]" + realne akcje Pobierz/Podgląd.
 * Pobieranie do stanu lokalnego (cache per projectId na życie ekranu).
 */

import { useEffect, useState } from 'react';

const API_BASE = '/api';

/** Rekord magazynu 1:1 z widoku backendu (`_document_view`). */
export interface RekordDokumentu {
  readonly id: string;
  readonly project_id: string;
  readonly doc_type: string;
  readonly doc_format: string;
  readonly filename: string;
  readonly size_bytes: number;
  readonly sha256: string;
  readonly source: string;
  readonly created_at: string;
  readonly content_url: string;
  /** Opcjonalne (exclude_none): tylko realny PDF niesie liczbę stron. */
  readonly page_count?: number;
  readonly run_ref?: string;
}

interface OdpowiedzListy {
  readonly project_id: string;
  readonly items: readonly RekordDokumentu[];
  readonly count: number;
}

export async function fetchDokumentyProjektu(
  projectId: string,
): Promise<readonly RekordDokumentu[]> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/documents`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as OdpowiedzListy;
  return data.items;
}

export interface DaneMagazynu {
  readonly stan: 'laduje' | 'blad' | 'gotowe';
  readonly rekordy: readonly RekordDokumentu[];
}

const PUSTY: DaneMagazynu = { stan: 'gotowe', rekordy: [] };

/**
 * Hook dostawcy magazynu: pobiera rekordy przy zmianie projectId (cache per
 * projectId). `projectId = null` → pusty (ekran pokazuje stan „Do wygenerowania").
 * Błąd pobierania → pusty zbiór (zero regresu: karty działają jak dziś).
 */
export function useDokumentyMagazynu(projectId: string | null): DaneMagazynu {
  const [cache, setCache] = useState<Record<string, DaneMagazynu>>({});

  useEffect(() => {
    if (!projectId || cache[projectId]) return;
    let anulowane = false;
    void (async () => {
      try {
        const rekordy = await fetchDokumentyProjektu(projectId);
        if (anulowane) return;
        setCache((c) => ({ ...c, [projectId]: { stan: 'gotowe', rekordy } }));
      } catch {
        if (anulowane) return;
        setCache((c) => ({ ...c, [projectId]: { stan: 'blad', rekordy: [] } }));
      }
    })();
    return () => {
      anulowane = true;
    };
  }, [projectId, cache]);

  if (!projectId) return PUSTY;
  return cache[projectId] ?? { stan: 'laduje', rekordy: [] };
}
