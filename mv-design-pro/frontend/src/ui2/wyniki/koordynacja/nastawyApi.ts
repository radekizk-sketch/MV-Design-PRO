/**
 * Klient nastaw zabezpieczenia nadprądowego (karta F-K5, dług V12K-189).
 *
 * `GET /api/protection/overcurrent-settings?case_id=` → `api/protection_overcurrent_settings.py`
 * → `application/analyses/protection/overcurrent/settings_presentation.py`.
 *
 * Kontrakt 1:1 z backendem. Nastawa, której projekt NIE wyliczył, przychodzi jako
 * `wartosc: null` + `stan: 'NIEDOSTEPNA'` + powód i akcja naprawcza z kanonicznego
 * rejestru kodów gotowości. ZERO fizyki i ZERO wartości domyślnych w UI: warstwa
 * prezentacji nie zna wzoru nastawy i nie ma prawa wpisać liczby, której nie dostała
 * (to jest sedno decyzji właściciela z V12K-189 — nastawa bez danych ma być
 * NIEDOSTĘPNA, bo liczba zastępcza trafia wprost do przekaźnika).
 */

export type StanNastawy = 'DOSTEPNA' | 'NIEDOSTEPNA';

export interface PozycjaNastawy {
  readonly klucz: string;
  readonly etykieta: string;
  readonly jednostka: string;
  readonly wartosc: number | null;
  readonly stan: StanNastawy;
  readonly komunikat_pl: string | null;
  readonly powod_pl: string | null;
  readonly fix_action_id: string | null;
  readonly fix_navigation: Record<string, string> | null;
}

export interface PrezentacjaNastaw {
  readonly pozycje: readonly PozycjaNastawy[];
  readonly kompletne: boolean;
  readonly brakujace: readonly string[];
  readonly kody_gotowosci: readonly string[];
  readonly podsumowanie_pl: string;
}

export interface NastawyResponse {
  readonly run_id: string;
  readonly case_id: string;
  readonly analysis_type: string;
  readonly status: string;
  readonly prezentacja: PrezentacjaNastaw;
}

/** Rozpoznanie „nie ma jeszcze biegu nastaw" — odróżnione od awarii końcówki. */
export class BrakBieguNastaw extends Error {
  constructor() {
    super('Brak biegu nastaw zabezpieczeń dla tego przypadku.');
    this.name = 'BrakBieguNastaw';
  }
}

/** Nastawy najnowszego biegu nastaw dla przypadku (wybór najnowszego robi backend). */
export async function fetchNastawyPrzypadku(
  caseId: string,
  options: { signal?: AbortSignal } = {},
): Promise<NastawyResponse> {
  const response = await fetch(
    `/api/protection/overcurrent-settings?case_id=${encodeURIComponent(caseId)}`,
    { signal: options.signal },
  );
  if (response.status === 404) {
    throw new BrakBieguNastaw();
  }
  if (!response.ok) {
    throw new Error(await odczytajBlad(response));
  }
  return (await response.json()) as NastawyResponse;
}

async function odczytajBlad(response: Response): Promise<string> {
  try {
    const dane = (await response.json()) as { detail?: unknown };
    if (typeof dane.detail === 'string' && dane.detail.trim().length > 0) {
      return dane.detail;
    }
  } catch {
    // Treść błędu jest opcjonalna — komunikat poniżej wystarcza projektantowi.
  }
  return 'Nastawy zabezpieczeń niedostępne — backend nie odpowiedział.';
}
