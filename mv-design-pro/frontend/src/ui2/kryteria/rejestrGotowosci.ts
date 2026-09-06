/**
 * Kanoniczny rejestr kodów gotowości jako JEDYNE źródło tekstu dla kodów.
 *
 * `GET /api/readiness/registry` → `backend/src/api/readiness_registry.py`
 * → `domain/readiness_bridge.widok_rejestru` → `domain/canonical_operations.READINESS_CODES`.
 *
 * DLACZEGO NIE WŁASNA TABLICA. Kod gotowości (`ct.secondary_circuit_missing`) jest
 * identyfikatorem produkcyjnym — nie wolno go pokazać inżynierowi. Kusi, żeby
 * dopisać w UI mapę „kod → zdanie po polsku", ale to tworzy DRUGIE źródło prawdy,
 * które rozjedzie się z kanonem przy pierwszej zmianie komunikatu (dokładnie ta
 * klasa długu, którą zamknęła karta F-K6: front trzymał własne tablice kodów,
 * których backend nie zna). Dlatego treść przychodzi z kanonu.
 *
 * Rejestr jest NIEZMIENNY w czasie życia karty, więc pobieramy go raz i trzymamy
 * w pamięci modułu (bez store'u, bez ponownych zapytań przy każdym readoucie).
 */

export interface WpisRejestruGotowosci {
  readonly code: string;
  readonly message_pl: string;
  readonly level: string;
}

let pamiec: Map<string, WpisRejestruGotowosci> | null = null;
let wPoblizu: Promise<Map<string, WpisRejestruGotowosci>> | null = null;

function maKsztaltWpisu(dane: unknown): dane is WpisRejestruGotowosci {
  if (typeof dane !== 'object' || dane === null) return false;
  const w = dane as Record<string, unknown>;
  return typeof w.code === 'string' && typeof w.message_pl === 'string';
}

/** Pobierz kanoniczny rejestr (raz na sesję modułu). */
export async function pobierzRejestrGotowosci(): Promise<Map<string, WpisRejestruGotowosci>> {
  if (pamiec) return pamiec;
  if (wPoblizu) return wPoblizu;
  wPoblizu = (async () => {
    const odpowiedz = await fetch('/api/readiness/registry');
    if (!odpowiedz.ok) {
      throw new Error(`Nie udało się pobrać rejestru gotowości (HTTP ${odpowiedz.status}).`);
    }
    const dane: unknown = await odpowiedz.json();
    const kody =
      typeof dane === 'object' && dane !== null ? (dane as Record<string, unknown>).codes : null;
    if (!Array.isArray(kody)) {
      throw new Error('Rejestr gotowości ma nieoczekiwany kształt — sprawdź wersję API.');
    }
    const mapa = new Map<string, WpisRejestruGotowosci>();
    for (const wpis of kody) {
      if (maKsztaltWpisu(wpis)) mapa.set(wpis.code, wpis);
    }
    pamiec = mapa;
    return mapa;
  })();
  try {
    return await wPoblizu;
  } finally {
    wPoblizu = null;
  }
}

/** Wyczyść pamięć rejestru (wyłącznie testy — izolacja przypadków). */
export function wyczyscRejestrGotowosci(): void {
  pamiec = null;
  wPoblizu = null;
}

/**
 * Zamień kody na zdania po polsku. Kod, którego nie ma w kanonie, jest POMIJANY —
 * pokazanie surowego identyfikatora byłoby kodem produkcyjnym w tekście dla
 * inżyniera, a wymyślenie zdania byłoby fabrykacją.
 */
export function komunikatyKodow(
  kody: readonly string[],
  rejestr: ReadonlyMap<string, WpisRejestruGotowosci> | null,
): string[] {
  if (!rejestr) return [];
  return kody
    .map((kod) => rejestr.get(kod)?.message_pl)
    .filter((m): m is string => typeof m === 'string' && m.length > 0);
}
