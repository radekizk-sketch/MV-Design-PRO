/**
 * Wspólna oś iloczynu testów kreatorów z kontrolą przed zapisem: odpowiedź końcówki
 * `domain-ops` na próbę (`dry_run`) × oczekiwany stan próby, treść komunikatu i wartość
 * wiersza „Kontrola modelu”. Stubowany jest wyłącznie `fetch` — klient `executeDomainOpPreview`,
 * hak i kreator pracują naprawdę.
 */

export interface WynikProby {
  nazwa: string;
  odpowiedz: () => Promise<Response>;
  stan: 'przyjeta' | 'odrzucona' | 'nieustalona';
  /** Treść, która MUSI dojść do projektanta bez tłumaczenia (`null` = próba przyjęta). */
  tresc: string | null;
  wiersz: 'Przyjęta' | 'Odrzucona' | 'Nieustalona';
}

function json(status: number, tresc: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(tresc), {
      status,
      statusText: status === 200 ? 'OK' : 'Blad',
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

export function wynikiProby(odmowa: { komunikat: string; kod: string }): readonly WynikProby[] {
  return [
    {
      nazwa: 'przyjęta (200 bez odmowy)',
      odpowiedz: () => json(200, { dry_run: true, preview: { created_refs: ['nowy-1'] } }),
      stan: 'przyjeta',
      tresc: null,
      wiersz: 'Przyjęta',
    },
    {
      nazwa: 'odrzucona przez operację (200 z odmową)',
      odpowiedz: () => json(200, { error: odmowa.komunikat, error_code: odmowa.kod }),
      stan: 'odrzucona',
      tresc: odmowa.komunikat,
      wiersz: 'Odrzucona',
    },
    {
      nazwa: 'odrzucona przez bramę ładunku (422)',
      odpowiedz: () => json(422, { detail: { message: 'Ładunek operacji niezgodny ze specyfikacją.' } }),
      stan: 'odrzucona',
      tresc: 'Ładunek operacji niezgodny ze specyfikacją.',
      wiersz: 'Odrzucona',
    },
    {
      nazwa: 'nieustalona (500)',
      odpowiedz: () => json(500, null),
      stan: 'nieustalona',
      tresc: 'Błąd HTTP 500: Blad',
      wiersz: 'Nieustalona',
    },
  ];
}

/** Ładunek operacji z ciała zapytania próby (koperta `domain-ops`). */
export function ladunekProbyZWywolania(init: unknown): Record<string, unknown> {
  const body = (init as RequestInit).body;
  return (JSON.parse(String(body)) as { operation: { payload: Record<string, unknown> } }).operation.payload;
}
