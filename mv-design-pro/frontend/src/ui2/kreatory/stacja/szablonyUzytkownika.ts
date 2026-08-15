/**
 * Szablony stacji ZAPISANE PRZEZ UŻYTKOWNIKA (B-8, karta KD-3).
 *
 * `POST/GET/DELETE /api/station-templates/user` →
 * `backend/src/api/station_templates.py` → `application/station_templates/user_store.py`.
 *
 * DŁUG, KTÓRY TO ZAMYKA. Biblioteka szablonów była wyłącznie wbudowana:
 * projektant, który poskładał w kreatorze własną konfigurację, nie miał jak jej
 * zachować — przy następnej stacji tego samego typu klikał wszystko od nowa.
 *
 * ZERO MUTACJI WBUDOWANYCH: zapis idzie do osobnego zbioru z własną przestrzenią
 * identyfikatorów (`user_…`). Konfiguracja jest przechowywana BEZ ZMIAN — to ten
 * sam payload, który kreator wysyła do operacji stacyjnej, więc odtworzenie nie
 * wymaga żadnego tłumaczenia kształtu.
 */

/** Szablon zapisany przez użytkownika (kontrakt końcówki). */
export interface SzablonUzytkownika {
  readonly id: string;
  readonly name_pl: string;
  readonly description_pl: string;
  readonly source: 'UZYTKOWNIKA';
  readonly saved_at: string;
  readonly configuration: Record<string, unknown>;
}

const BAZA = '/api/station-templates/user';

function maKsztaltSzablonu(dane: unknown): dane is SzablonUzytkownika {
  if (typeof dane !== 'object' || dane === null) return false;
  const s = dane as Record<string, unknown>;
  return (
    typeof s.id === 'string'
    && typeof s.name_pl === 'string'
    && typeof s.configuration === 'object'
    && s.configuration !== null
  );
}

/** Zapisz bieżącą konfigurację kreatora jako szablon użytkownika. */
export async function zapiszSzablonUzytkownika(
  nazwa: string,
  opis: string | null,
  konfiguracja: Record<string, unknown>,
): Promise<SzablonUzytkownika> {
  const odpowiedz = await fetch(BAZA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name_pl: nazwa,
      description_pl: opis,
      configuration: konfiguracja,
    }),
  });
  if (!odpowiedz.ok) {
    throw new Error(`Nie udało się zapisać szablonu (HTTP ${odpowiedz.status}).`);
  }
  const dane: unknown = await odpowiedz.json();
  if (!maKsztaltSzablonu(dane)) {
    throw new Error('Zapisany szablon ma nieoczekiwany kształt — sprawdź wersję API.');
  }
  return dane;
}

/** Lista szablonów użytkownika (kolejność deterministyczna z backendu). */
export async function pobierzSzablonyUzytkownika(): Promise<SzablonUzytkownika[]> {
  const odpowiedz = await fetch(BAZA);
  if (!odpowiedz.ok) {
    throw new Error(`Nie udało się wczytać szablonów użytkownika (HTTP ${odpowiedz.status}).`);
  }
  const dane: unknown = await odpowiedz.json();
  const lista =
    typeof dane === 'object' && dane !== null
      ? (dane as Record<string, unknown>).templates
      : null;
  if (!Array.isArray(lista)) {
    throw new Error('Lista szablonów użytkownika ma nieoczekiwany kształt.');
  }
  return lista.filter(maKsztaltSzablonu);
}

/** Usuń szablon użytkownika (wbudowanego usunąć się nie da — backend zwróci 404). */
export async function usunSzablonUzytkownika(id: string): Promise<void> {
  const odpowiedz = await fetch(`${BAZA}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!odpowiedz.ok) {
    throw new Error(`Nie udało się usunąć szablonu (HTTP ${odpowiedz.status}).`);
  }
}
