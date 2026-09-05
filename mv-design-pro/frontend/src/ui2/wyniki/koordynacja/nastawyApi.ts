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
  const payload: unknown = await response.json();
  if (!maObowiazkowyKsztalt(payload)) {
    // KSZTALT SPRAWDZANY, NIE ZAKLADANY (V12K-262; ta sama naprawa co V12K-252).
    // Rzutowanie `as NastawyResponse` przepuszczalo KAZDA odpowiedz — starsza wersje
    // API, atrape sceny, blad proxy — a pierwszy odczyt `prezentacja.kompletne`
    // wywracal CALY ekran koordynacji bialym ekranem, bez granicy bledu. Sekcja ma
    // pokazac nazwany powod, a reszta ekranu (krzywe TCC, werdykty par) ma dzialac.
    throw new Error(
      'Odpowiedź nastaw ma nieoczekiwany kształt — sprawdź wersję API zabezpieczeń.',
    );
  }
  return payload;
}

const STANY_KONTRAKTU: readonly string[] = ['DOSTEPNA', 'NIEDOSTEPNA'];

/** Minimalny kontrakt, bez ktorego sekcja nie ma czego pokazac. */
function maObowiazkowyKsztalt(payload: unknown): payload is NastawyResponse {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  const rekord = payload as Record<string, unknown>;
  const prezentacja = rekord.prezentacja as Record<string, unknown> | undefined;
  if (
    typeof prezentacja !== 'object'
    || prezentacja === null
    || !Array.isArray(prezentacja.pozycje)
    || typeof prezentacja.kompletne !== 'boolean'
  ) {
    return false;
  }
  // STAN JEST CZĘŚCIĄ KONTRAKTU (V12K-262). Pozycja z `stan` spoza
  // `DOSTEPNA`/`NIEDOSTEPNA` to odpowiedź, której ta sekcja nie umie zinterpretować —
  // a nastawa jest wielkością nastawianą na przekaźniku, więc lepiej nazwać
  // rozjazd wersji API niż wyświetlić wiersz o nieznanym znaczeniu.
  return prezentacja.pozycje.every((pozycja) => {
    if (typeof pozycja !== 'object' || pozycja === null) return false;
    return STANY_KONTRAKTU.includes((pozycja as Record<string, unknown>).stan as string);
  });
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
