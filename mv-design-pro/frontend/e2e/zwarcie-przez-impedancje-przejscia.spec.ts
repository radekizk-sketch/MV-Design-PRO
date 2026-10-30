/**
 * Zwarcie przez impedancję przejścia Z_f — tor projektanta od kreatora do ekranu
 * (karta OD-14, partia integracji 10; kontrakt
 * `docs/domain/KONTRAKT_SCENARIUSZY_ZWARCIOWYCH_TRYB_IMPEDANCE.md` §4).
 *
 * Dowodzi na REALNYM backendzie, REALNYMI klikami:
 *   1. scenariusz w trybie „przez impedancję" (R_f = 2 Ω, X_f = 0) zapisany z panelu
 *      „Scenariusze zwarciowe" przestrzeni Obliczenia,
 *   2. „Uruchom" WYKONUJE bieg (dawniej tworzył bieg PENDING, którego nikt nie
 *      wykonywał — tryb IMPEDANCE nie miał drogi do wyniku),
 *   3. ekran zwarć pokazuje w założeniach Z_f zapisaną na biegu, z uwagą o zakresie
 *      ważności IEC 60909, a prąd I_k'' punktu jest MNIEJSZY niż prąd zwarcia
 *      metalicznego tego samego punktu liczony tym samym torem.
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';

async function utworzProjektIPrzypadek(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const projectName = 'E2E Zwarcie przez impedancję';
  const caseName = 'Przypadek zwarcia przez Z_f';
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Zwarcie przez impedancję przejścia (OD-14)',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projekt.ok()).toBeTruthy();
  const { id: projectId } = (await projekt.json()) as { id: string };
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const { id: caseId } = (await przypadek.json()) as { id: string };
  return { projectId, projectName, caseId, caseName };
}

/** Sieć minimalna: GPZ SN (źródło + szyna) — ten sam krok 1 co `critical-batch-flow.spec.ts`. */
async function dodajZrodloSn(request: APIRequestContext, caseId: string): Promise<string> {
  const odpowiedz = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name: 'add_grid_source_sn',
        idempotency_key: 'e2e-zf-add-grid-source-sn',
        payload: {
          voltage_kv: 15.0,
          sk3_mva: 250.0,
          rx_ratio: 0.1,
          catalog_binding: {
            catalog_namespace: 'ZRODLO_SN',
            catalog_item_id: SOURCE_ID,
            catalog_item_version: CATALOG_VERSION,
          },
          hv_voltage_kv: 110.0,
          transformer_sn_mva: 25.0,
        },
      },
    },
  });
  expect(odpowiedz.ok()).toBeTruthy();
  const tresc = (await odpowiedz.json()) as {
    error?: string | null;
    snapshot?: { buses?: Array<{ ref_id: string }> };
  };
  expect(tresc.error ?? null).toBeNull();
  const busRef = tresc.snapshot?.buses?.[0]?.ref_id;
  expect(busRef).toBeTruthy();
  return busRef!;
}

async function otworzObliczenia(page: Page, seed: Awaited<ReturnType<typeof utworzProjektIPrzypadek>>) {
  await page.addInitScript((s) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: s.projectId,
          activeProjectName: s.projectName,
          activeCaseId: s.caseId,
          activeCaseName: s.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'NONE',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, seed);
  await page.goto(`/#case-config?case=${seed.caseId}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('mvd-scenariusze')).toBeVisible();
}

/** Zapis scenariusza 3F w panelu REALNYMI klikami; zwraca identyfikator wiersza tabeli. */
async function zapiszScenariusz(
  page: Page,
  nazwa: string,
  busRef: string,
  zf: { r: string; x: string } | null,
): Promise<string> {
  const istniejace = await page.locator('[data-testid^="mvd-scenariusze-wiersz-"]').count();
  await page.getByTestId('mvd-scenariusze-dodaj').click();
  await page.getByTestId('mvd-scenariusze-nazwa').fill(nazwa);
  await page.getByTestId('mvd-scenariusze-rodzaj').selectOption('SC_3F');
  await page.getByTestId('mvd-scenariusze-element').fill(busRef);
  if (zf) {
    await page.getByTestId('mvd-scenariusze-tryb').selectOption('IMPEDANCE');
    await page.getByTestId('mvd-scenariusze-r').fill(zf.r);
    await page.getByTestId('mvd-scenariusze-x').fill(zf.x);
  }
  await page.getByTestId('mvd-scenariusze-zapisz').click();
  const wiersze = page.locator('[data-testid^="mvd-scenariusze-wiersz-"]');
  await expect(wiersze).toHaveCount(istniejace + 1);
  const wiersz = wiersze.filter({ hasText: nazwa });
  const id = (await wiersz.getAttribute('data-testid'))!.replace('mvd-scenariusze-wiersz-', '');
  return id;
}

/** Klik „Uruchom" → identyfikator biegu z odpowiedzi utworzenia (realne żądanie panelu). */
async function uruchomScenariusz(page: Page, scenarioId: string, nazwa: string): Promise<string> {
  const utworzenie = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' && r.url().endsWith(`/fault-scenarios/${scenarioId}/runs`),
  );
  await page.getByTestId(`mvd-scenariusze-uruchom-${scenarioId}`).click();
  const odpowiedz = await utworzenie;
  expect(odpowiedz.status()).toBe(201);
  const { id } = (await odpowiedz.json()) as { id: string };
  await expect(page.getByTestId('mvd-scenariusze-komunikat')).toContainText(nazwa, {
    timeout: 90000,
  });
  return id;
}

async function otworzEkranZwarc(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible();
  await otworzZakladkeWynikow(page, 'zwarcia');
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 20000 });
}

/** I_k'' [kA] punktu z odpowiedzi wyników biegu (ta sama końcówka, którą czyta ekran). */
async function ikssBiegu(request: APIRequestContext, runId: string): Promise<number> {
  const odpowiedz = await request.get(
    `${BACKEND_BASE}/api/analysis-runs/${runId}/results/short-circuit`,
  );
  expect(odpowiedz.ok()).toBeTruthy();
  const tresc = (await odpowiedz.json()) as { rows: Array<{ ikss_ka: number }> };
  expect(tresc.rows).toHaveLength(1);
  return tresc.rows[0].ikss_ka;
}

test('zwarcie przez impedancję przejścia: kreator → bieg → ekran z Z_f w założeniach', async ({
  page,
  request,
}, testInfo) => {
  const seed = await utworzProjektIPrzypadek(request);
  const busRef = await dodajZrodloSn(request, seed.caseId);
  await otworzObliczenia(page, seed);

  // Bieg metaliczny (odniesienie) i bieg przez Z_f — oba z panelu, tym samym torem.
  const metaliczny = await zapiszScenariusz(page, 'Zwarcie metaliczne GPZ', busRef, null);
  const runMetaliczny = await uruchomScenariusz(page, metaliczny, 'Zwarcie metaliczne GPZ');

  const przezZf = await zapiszScenariusz(page, 'Zwarcie przez łuk GPZ', busRef, { r: '2', x: '0' });
  const runZf = await uruchomScenariusz(page, przezZf, 'Zwarcie przez łuk GPZ');
  expect(runZf).not.toBe(runMetaliczny);

  await otworzEkranZwarc(page);
  const zalozenia = page.getByTestId('mvd-wyn-zalozenia');
  const wierszZf = zalozenia
    .getByTestId('mvd-wyn-zalozenie')
    .filter({ hasText: 'Impedancja przejścia w miejscu zwarcia' });
  await expect(wierszZf).toHaveCount(1);
  // Symbol $Z_f$ etykiety składa KaTeX (`ui_math_guard`, karta UX-04/ZU) — węzeł wzoru, nie ASCII.
  await expect(wierszZf.locator('[data-testid="math-rendered"][data-latex="$Z_f$"]')).toHaveCount(1);
  await expect(wierszZf).toContainText('2,0000 + j0,0000');
  await expect(wierszZf).toHaveAttribute('title', /poza zakresem normy IEC 60909/);

  // Sanity 3F (pętla szeregowa): |I_k(Z_f)| < |I_k(0)| — wartości z backendu, nie z UI.
  const ikZf = await ikssBiegu(request, runZf);
  const ikMet = await ikssBiegu(request, runMetaliczny);
  expect(ikZf).toBeGreaterThan(0);
  expect(ikZf).toBeLessThan(ikMet);

  await page.screenshot({ path: testInfo.outputPath('ekran-zwarc-przez-impedancje.png'), fullPage: true });
});
