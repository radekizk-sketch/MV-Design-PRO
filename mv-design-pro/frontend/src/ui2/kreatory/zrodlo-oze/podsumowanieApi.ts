/**
 * D4 (RECENZJA_DER_SN_DOBORY_2026-07): klient dokumentów toru DER-SN po zapisie
 * kreatora — raport zgodności (wymaganie 13) + lista materiałowa (BOM).
 *
 * ZERO fizyki w UI: wszystkie liczby/werdykty pochodzą 1:1 z backendu
 * (`/api/der-sn/{caseId}/...`). Auto-bieg reużywa ISTNIEJĄCEGO mechanizmu przebiegów
 * (`/api/execution/...` — LF + SC), nie tworzy nowego pipeline'u obliczeń.
 */

import {
  createRun,
  executeRun,
} from '../../../ui/study-cases/api';
import type { ExecutionAnalysisType, RunStatus } from '../../../ui/study-cases/types';

// ---------------------------------------------------------------------------
// Kontrakt raportu zgodności (1:1 z application/analyses/raport_zgodnosci.py).
// ---------------------------------------------------------------------------
export type StatusPozycji = 'PASS' | 'WARN' | 'FAIL';
export type WerdyktRaportu = 'ZGODNY' | 'ZGODNY_Z_UWAGAMI' | 'NIEZGODNY';

export interface PozycjaRaportu {
  readonly check_id: string;
  readonly kategoria: string;
  readonly status: StatusPozycji;
  readonly code: string;
  readonly message_pl: string;
  readonly parametr?: string;
  readonly zastosowano?: unknown;
  readonly propozycja?: unknown;
}

export interface RaportZgodnosci {
  readonly wersja: string;
  readonly source_ref: string;
  readonly source_name: string;
  readonly werdykt: WerdyktRaportu;
  readonly komunikat_krytyczny: string | null;
  readonly pozycje: readonly PozycjaRaportu[];
  readonly podsumowanie: {
    readonly pass: number;
    readonly warn: number;
    readonly fail: number;
    readonly razem: number;
  };
}

// ---------------------------------------------------------------------------
// Kontrakt listy materiałowej (1:1 z application/analyses/lista_materialowa.py).
// ---------------------------------------------------------------------------
export interface PozycjaBom {
  readonly lp: number;
  readonly kategoria: string;
  readonly element: string;
  readonly catalog_ref: string | null;
  readonly ref_id: string | null;
  readonly parametry: Readonly<Record<string, unknown>>;
  readonly ilosc: number | null;
  readonly jednostka: string;
}

export interface ListaMaterialowa {
  readonly wersja: string;
  readonly source_ref: string;
  readonly source_name: string;
  readonly pozycje: readonly PozycjaBom[];
  readonly count: number;
  readonly braki_ogniw: readonly string[];
}

const DER_SN_BASE = '/api/der-sn';

async function odczytaj<T>(response: Response): Promise<T | null> {
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Błąd ${response.status} podczas pobierania dokumentu toru DER-SN.`);
  }
  return (await response.json()) as T;
}

export interface OpcjeDokumentu {
  readonly projectId?: string | null;
  readonly zapiszDoMagazynu?: boolean;
}

export async function fetchRaportZgodnosci(
  caseId: string,
  opcje: OpcjeDokumentu & { readonly runStatus?: string | null } = {},
): Promise<RaportZgodnosci | null> {
  const params = new URLSearchParams();
  if (opcje.runStatus) params.set('run_status', opcje.runStatus);
  if (opcje.projectId) params.set('project_id', opcje.projectId);
  if (opcje.zapiszDoMagazynu) params.set('zapisz_do_magazynu', 'true');
  const query = params.toString();
  const response = await fetch(
    `${DER_SN_BASE}/${encodeURIComponent(caseId)}/compliance-report${query ? `?${query}` : ''}`,
  );
  return odczytaj<RaportZgodnosci>(response);
}

export async function fetchListaMaterialowa(
  caseId: string,
  opcje: OpcjeDokumentu = {},
): Promise<ListaMaterialowa | null> {
  const params = new URLSearchParams();
  if (opcje.projectId) params.set('project_id', opcje.projectId);
  if (opcje.zapiszDoMagazynu) params.set('zapisz_do_magazynu', 'true');
  const query = params.toString();
  const response = await fetch(
    `${DER_SN_BASE}/${encodeURIComponent(caseId)}/bom${query ? `?${query}` : ''}`,
  );
  return odczytaj<ListaMaterialowa>(response);
}

// ---------------------------------------------------------------------------
// Auto-bieg: LF + SC przez ISTNIEJĄCY mechanizm przebiegów.
// ---------------------------------------------------------------------------

/** Rodzaje przebiegu auto-biegu (rozpływ + zwarcia) — kanon wymaganie 12. */
export const AUTO_BIEG_RODZAJE: readonly ExecutionAnalysisType[] = ['LOAD_FLOW', 'SC_3F'];

/**
 * Wyprowadź łączny status auto-biegu z wyników pojedynczych przebiegów.
 * Dowolny błąd ⇒ FAILED; wszystkie zakończone ⇒ DONE; inaczej ⇒ RUNNING.
 * Pusta lista ⇒ null (auto-bieg wyłączony).
 */
export function polaczStatusBiegu(statusy: readonly RunStatus[]): RunStatus | null {
  if (statusy.length === 0) return null;
  if (statusy.some((s) => s === 'FAILED')) return 'FAILED';
  if (statusy.every((s) => s === 'DONE')) return 'DONE';
  return 'RUNNING';
}

/**
 * Uruchom auto-bieg (LF + SC) dla przypadku i zwróć łączny status.
 * Reużywa `createRun` + `executeRun` (istniejący mechanizm). Błąd pojedynczego
 * przebiegu odzwierciedlamy statusem FAILED (nie rzucamy — raport zgodności
 * oznajmia nieudany bieg jawnie).
 */
export async function uruchomAutoBieg(caseId: string): Promise<RunStatus | null> {
  const statusy: RunStatus[] = [];
  for (const analysisType of AUTO_BIEG_RODZAJE) {
    try {
      const run = await createRun(caseId, { analysis_type: analysisType });
      const executed = await executeRun(run.id);
      statusy.push(executed.status);
    } catch {
      statusy.push('FAILED');
    }
  }
  return polaczStatusBiegu(statusy);
}
