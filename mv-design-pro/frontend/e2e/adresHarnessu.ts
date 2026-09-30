/**
 * Adres strony harnessu WZGLĘDEM adresu frontendu runnera.
 *
 * `playwright.config.ts` wyprowadza `baseURL` z `PLAYWRIGHT_FRONTEND_URL`
 * (E2E-RUNNER: runner jest właścicielem swoich serwerów, porty z adresów), ale
 * `page.goto` z adresem BEZWZGLĘDNYM omija `baseURL`. Dwadzieścia dziewięć
 * specyfikacji zrzutów trzymało literał `http://127.0.0.1:5173/...` — na
 * własnych portach (równoległe weryfikacje na jednej maszynie) każda z nich
 * dostawała `ERR_CONNECTION_REFUSED`, choć serwer runnera działał. Jedno
 * źródło adresu: ten helper. Zero drugiego mechanizmu (`HARNESS_URL` w środowisku
 * — usunięty razem z literałami).
 */
export function adresHarnessu(plik: string): string {
  const baza = process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://127.0.0.1:5173';
  return new URL(plik.replace(/^\/+/, ''), baza.endsWith('/') ? baza : `${baza}/`).toString();
}
