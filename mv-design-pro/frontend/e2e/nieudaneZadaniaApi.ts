/**
 * Bramka KLASY dla scen harnessu (E2E-FULL-FIX-3, 2026-09-10): zero żądań do
 * realnego backendu zakończonych 4xx/5xx.
 *
 * DLACZEGO. Harness (`creator-harness.html`) podmienia `window.fetch` atrapami o
 * kształcie 1:1 z kontraktami backendu; żądanie BEZ atrapy przechodzi przez
 * `originalFetch` do realnego backendu biegu, który dla zasianego `case-demo`
 * odpowiada 404/400. Bramka treści „Nie udało się" łapała tylko sceny, które ten
 * błąd POKAZUJĄ (macierz po W3-D: sekcja zgodności przekrojowej); sceny, które
 * błąd połykają albo degradują się po cichu (rejestr „Co wymaga uwagi" bez
 * werdyktu, koordynacja z zapisem konfiguracji odrzuconym 400), przechodziły
 * z zrzutem do oceny udającym pełny ekran. Odpowiedź z atrapy nigdy nie wchodzi
 * w sieć, więc każda odpowiedź sieciowa `/api/*` ze statusem >= 400 jest z
 * definicji brakiem atrapy albo realną awarią — obie mają zatrzymać bieg.
 */
import type { Page } from '@playwright/test';

/** Dopisuje do `cel` wpis `API <status> <metoda> <ścieżka>` za każdą nieudaną odpowiedź `/api/*`. */
export function zbierajNieudaneZadaniaApi(page: Page, cel: string[]): void {
  page.on('response', (odpowiedz) => {
    const adres = new URL(odpowiedz.url());
    if (!adres.pathname.startsWith('/api/')) return;
    if (odpowiedz.status() < 400) return;
    cel.push(`API ${odpowiedz.status()} ${odpowiedz.request().method()} ${adres.pathname}${adres.search}`);
  });
}
