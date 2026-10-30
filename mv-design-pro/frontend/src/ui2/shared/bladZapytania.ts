/**
 * Jedno źródło komunikatu o nieudanym zapytaniu do serwera (karta komunikatów, commit 4).
 *
 * Projektant widzi zdanie po polsku: CO się nie udało (czynność podana przez wywołującego),
 * DLACZEGO w języku inżyniera (opis statusu HTTP) i — w nawiasie, na drugim planie — kod HTTP
 * do zgłoszenia błędu. Surowy adres zapytania NIE trafia do treści komunikatu; zostaje w polu
 * `adres` błędu dla dziennika i diagnostyki. Angielski `statusText` serwera nie jest używany
 * wcale (zależy od serwera, pod HTTP/2 bywa pusty).
 *
 * Wcześniej każdy klient API składał własną kopię (`Request ${url} failed: ...`,
 * `Zapytanie ${url} nie powiodło się: ...`, `...: ${response.statusText}`, gołe `HTTP 404`);
 * strażnik `scripts/forbidden_ui_terms_guard.py` (reguła komunikatu zapytania) zakazuje
 * lokalnego składania takich treści poza tym plikiem.
 */

/** Status odpowiedzi i — jeśli jest — jej adres (wystarcza `Response` z `fetch`). */
export interface OdpowiedzZapytania {
  readonly status: number;
  readonly url?: string;
}

/** Opis statusu HTTP w języku projektanta (bez kodu — kod dokleja `komunikatZapytania`). */
export function opisStatusuHttp(status: number): string {
  if (status === 0) return 'brak połączenia z serwerem';
  if (status === 400) return 'serwer odrzucił dane zapytania';
  if (status === 401) return 'sesja wymaga ponownego zalogowania';
  if (status === 403) return 'brak uprawnień do tej operacji';
  if (status === 404) return 'serwer nie znalazł żądanego zasobu';
  if (status === 409) return 'stan modelu zmienił się w międzyczasie — odśwież widok i ponów';
  if (status === 413) return 'dane zapytania są zbyt duże';
  if (status === 422) return 'serwer odrzucił dane zapytania jako niekompletne lub niespójne';
  if (status === 429) return 'zbyt wiele zapytań naraz — ponów za chwilę';
  if (status === 502 || status === 503 || status === 504) {
    return 'serwer obliczeń jest chwilowo niedostępny';
  }
  if (status >= 500) return 'wewnętrzny błąd serwera obliczeń';
  if (status >= 400) return 'serwer odrzucił zapytanie';
  return 'nieoczekiwana odpowiedź serwera';
}

const CZYNNOSC_DOMYSLNA = 'Zapytanie do serwera nie powiodło się';

/**
 * Zdanie dla projektanta: „<czynność>: <opis statusu> (HTTP <kod>).”.
 * Bez czynności — ogólne „Zapytanie do serwera nie powiodło się”.
 */
export function komunikatZapytania(odpowiedz: OdpowiedzZapytania, czynnosc?: string): string {
  const poczatek = (czynnosc ?? CZYNNOSC_DOMYSLNA).trim().replace(/[.:]+$/, '');
  return `${poczatek}: ${opisStatusuHttp(odpowiedz.status)} (HTTP ${odpowiedz.status}).`;
}

/** Błąd nieudanego zapytania: treść po polsku, adres i status jako pola diagnostyczne. */
export class BladZapytania extends Error {
  readonly status: number;
  readonly adres: string | null;

  constructor(odpowiedz: OdpowiedzZapytania, czynnosc?: string, tresc?: string) {
    super(tresc ?? komunikatZapytania(odpowiedz, czynnosc));
    this.name = 'BladZapytania';
    this.status = odpowiedz.status;
    this.adres = odpowiedz.url ? odpowiedz.url : null;
  }
}

/** Skrót: `throw bladZapytania(response, 'Nie udało się pobrać …')`. */
export function bladZapytania(odpowiedz: OdpowiedzZapytania, czynnosc?: string): BladZapytania {
  return new BladZapytania(odpowiedz, czynnosc);
}

/**
 * Błąd z odpowiedzi odrzuconej przez backend: polskie zdanie z pola `detail` (łańcuch; z czynnością
 * jako „<czynność>: <detail>”), a gdy go nie ma (brak JSON, `detail` strukturalny) — opis
 * statusu z `komunikatZapytania`.
 */
export async function bladOdpowiedzi(
  odpowiedz: Response,
  czynnosc?: string,
): Promise<BladZapytania> {
  let detal: string | undefined;
  try {
    const tresc = (await odpowiedz.json()) as { detail?: unknown } | null;
    if (typeof tresc?.detail === 'string' && tresc.detail.trim()) detal = tresc.detail.trim();
  } catch {
    // Odpowiedź bez JSON — zostaje opis statusu HTTP.
  }
  if (detal === undefined) return new BladZapytania(odpowiedz, czynnosc);
  const poczatek = czynnosc?.trim().replace(/[.:]+$/, '');
  return new BladZapytania(odpowiedz, czynnosc, poczatek ? `${poczatek}: ${detal}` : detal);
}
