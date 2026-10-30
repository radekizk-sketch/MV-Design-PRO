import { bladZapytania } from '../shared/bladZapytania';
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
      throw bladZapytania(odpowiedz, 'Nie udało się pobrać rejestru gotowości');
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
 * Zdanie dla kodów, których opisu nie da się podać, bo REJESTR nie jest odczytany
 * (odczyt w toku albo nieudany). Bez identyfikatora kodu (kod produkcyjny nie jest
 * tekstem dla inżyniera) i bez wymyślonej treści — wyłącznie fakt: ile ograniczeń
 * wynik niesie i dlaczego ich opis jest niedostępny.
 */
export function zdanieKodowBezRejestru(liczba: number): string {
  return `Liczba ograniczeń gotowości wyniku: ${liczba} — ich opis nie został odczytany z rejestru kodów gotowości (odczyt w toku albo nieudany).`;
}

/**
 * Zamień kody na zdania po polsku. Kod, którego nie ma w kanonie, jest POMIJANY —
 * pokazanie surowego identyfikatora byłoby kodem produkcyjnym w tekście dla
 * inżyniera, a wymyślenie zdania byłoby fabrykacją (rejestr i kody wyniku pochodzą
 * z tego samego kanonu `READINESS_CODES`, więc kod spoza rejestru to rozjazd wersji
 * API, nie stan danych modelu).
 *
 * Rejestr NIEODCZYTANY (`null` — odczyt w toku albo nieudany) przy niepustych kodach
 * NIE daje pustej listy: wynik z ograniczeniami wyglądałby wtedy jak wynik bez
 * ograniczeń (kreska bez wyjaśnienia). Zwracane jest jedno zdanie o liczbie
 * ograniczeń (`zdanieKodowBezRejestru`) — odczyt w toku / błąd ≠ brak ograniczeń.
 */
export function komunikatyKodow(
  kody: readonly string[],
  rejestr: ReadonlyMap<string, WpisRejestruGotowosci> | null,
): string[] {
  if (!rejestr) return kody.length > 0 ? [zdanieKodowBezRejestru(kody.length)] : [];
  return kody
    .map((kod) => rejestr.get(kod)?.message_pl)
    .filter((m): m is string => typeof m === 'string' && m.length > 0);
}
