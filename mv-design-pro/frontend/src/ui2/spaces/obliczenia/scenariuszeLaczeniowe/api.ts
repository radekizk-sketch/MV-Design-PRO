/*
 * Klient API scenariuszy łączeniowych (karta GPZ-H5-APARATURA, defekt koordynatora 5).
 * Wyłącznie istniejące końcówki backendu (`backend/src/api/scenariusze_laczeniowe.py`):
 *  - `GET  /api/scenariusze-laczeniowe/study-cases/{case}` — scenariusze nazwane projektu ze
 *    stanami łączników albo wyłączeniami elementów (kolejność magazynu),
 *  - `POST /api/scenariusze-laczeniowe/study-cases/{case}` — zapis (nowy scenariusz albo nowa
 *    rewizja istniejącego); odmowa 422 z listą `{pole, komunikat}`.
 * Bieg ze scenariuszem idzie istniejącym torem biegu (`scenario_id` w
 * `POST /api/execution/study-cases/{case}/runs`) — nie przez ten plik.
 */

const API = '/api/scenariusze-laczeniowe/study-cases';

/** Położenie łącznika w scenariuszu (słownik backendu `Literal["closed", "open"]`). */
export type StanLacznika = 'closed' | 'open';

/** Wpis scenariusza łączeniowego (kontrakt `_wpis_scenariusza`). */
export interface ScenariuszLaczeniowy {
  scenario_id: string;
  name: string;
  revision: number;
  hash: string;
  switch_states: Record<string, StanLacznika>;
  /** Elementy wyłączone z eksploatacji (ref_id, w kolejności `ref_id` — zapis backendu). */
  out_of_service: string[];
}

/** Żądanie zapisu (kontrakt `ZapisScenariuszaLaczeniowego`). */
export interface ZapisScenariuszaLaczeniowego {
  scenario_id?: string;
  name: string;
  switch_states: Record<string, StanLacznika>;
  out_of_service: string[];
}

/** Błąd jednego pola zapisu (`pole` = `switch_states.{ref}` albo `out_of_service.{ref}`). */
export interface BladPolaScenariuszaLaczeniowego {
  pole: string;
  komunikat: string;
}

/** Odmowa backendu z komunikatem i błędami pól. */
export class BladApiScenariuszaLaczeniowego extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly bledyPol: readonly BladPolaScenariuszaLaczeniowego[] = [],
  ) {
    super(message);
    this.name = 'BladApiScenariuszaLaczeniowego';
  }
}

async function odczytaj<T>(odpowiedz: Response): Promise<T> {
  if (!odpowiedz.ok) {
    const tresc = (await odpowiedz.json().catch(() => ({}))) as { detail?: unknown };
    const detail = tresc.detail;
    if (Array.isArray(detail)) {
      const bledy = detail.filter(
        (b): b is BladPolaScenariuszaLaczeniowego =>
          typeof b === 'object' && b !== null && 'pole' in b && 'komunikat' in b,
      );
      throw new BladApiScenariuszaLaczeniowego(
        bledy.map((b) => b.komunikat).join('; ') || `HTTP ${odpowiedz.status}`,
        odpowiedz.status,
        bledy,
      );
    }
    throw new BladApiScenariuszaLaczeniowego(
      typeof detail === 'string' ? detail : `HTTP ${odpowiedz.status}`,
      odpowiedz.status,
    );
  }
  return (await odpowiedz.json()) as T;
}

export async function pobierzScenariuszeLaczeniowe(
  caseId: string,
): Promise<ScenariuszLaczeniowy[]> {
  const tresc = await odczytaj<{ scenariusze?: unknown }>(
    await fetch(`${API}/${encodeURIComponent(caseId)}`),
  );
  if (!Array.isArray(tresc.scenariusze)) {
    throw new BladApiScenariuszaLaczeniowego(
      'Niepoprawna odpowiedź listy scenariuszy łączeniowych (brak pola „scenariusze”).',
      200,
    );
  }
  return tresc.scenariusze as ScenariuszLaczeniowy[];
}

export async function zapiszScenariuszLaczeniowy(
  caseId: string,
  zadanie: ZapisScenariuszaLaczeniowego,
): Promise<ScenariuszLaczeniowy> {
  return odczytaj(
    await fetch(`${API}/${encodeURIComponent(caseId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(zadanie),
    }),
  );
}
