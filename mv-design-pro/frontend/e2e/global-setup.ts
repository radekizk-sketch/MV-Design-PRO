/**
 * Rozgrzewka serwera deweloperskiego PRZED pierwszym testem (2026-09-05, odbiór FE-HIGIENA).
 *
 * Playwright startuje serwery z `webServer` i uznaje je za gotowe, gdy adres odpowiada —
 * ale Vite dev odpowiada na `/` natychmiast, a pierwsze żądanie aplikacji dopiero
 * uruchamia pre-bundling zależności i transformację modułów. Pod obciążeniem CPU
 * (współdzielona maszyna, równoległe biegi) ten zimny start przekraczał limit
 * `app-ready` PIERWSZEGO testu w biegu (30 s), a każdy kolejny test już go nie płacił —
 * czerwień zależała od kolejności, nie od produktu. Jedno wejście na aplikację tutaj,
 * z limitem środowiskowym (nie testowym), zdejmuje koszt zimnego startu z testów, nie
 * podnosząc ich limitów. W CI (świeży runner) rozgrzewka trwa kilka sekund.
 */
import { chromium, type FullConfig } from '@playwright/test';

const WARMUP_TIMEOUT_MS = 180_000;

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.PLAYWRIGHT_DISABLE_WEBSERVER) {
    return;
  }
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) {
    throw new Error('global-setup: brak baseURL w konfiguracji Playwrighta');
  }
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage();
    const started = Date.now();
    await page.goto(baseURL, { waitUntil: 'commit', timeout: WARMUP_TIMEOUT_MS });
    await page.waitForSelector('[data-testid="app-ready"]', {
      state: 'attached',
      timeout: WARMUP_TIMEOUT_MS,
    });
    console.log(`[global-setup] aplikacja rozgrzana w ${Date.now() - started} ms (${baseURL})`);
  } finally {
    await browser.close();
  }
}
