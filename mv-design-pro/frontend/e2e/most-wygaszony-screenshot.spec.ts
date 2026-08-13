/**
 * Zrzuty ŻYWEJ aplikacji — wygaszona trasa mostu (bramka 5 karty K8,
 * dyrektywa właściciela #8: ekrany do oceny po każdym etapie).
 *
 * Scena: wejście STARYM adresem mostu `#protection-results` (który renderował
 * generyczną tabelę analityczną powierzchni E-35 — zero treści zabezpieczeniowej)
 * i lądowanie w oknie ui2 „Koordynacja zabezpieczeń” warsztatu Wyników.
 * Oba motywy (dyspozytorski i techniczny jasny). Realny backend, realna powłoka.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');
const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const FRONTEND_BASE = process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://127.0.0.1:5173';

const MOTYWY = [
  { plik: 'light', tryb: 'light_technical' },
  { plik: 'dark', tryb: 'dark_scada' },
] as const;

async function utworzKontekst(request: APIRequestContext): Promise<{
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
}> {
  const projectName = 'E2E most wygaszony';
  const caseName = 'Zakres most wygaszony';

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Zrzut lądowiska wygaszonej trasy mostu (bramka K8)',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok(), await projectResponse.text()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: {
      project_id: project.id,
      name: caseName,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok(), await caseResponse.text()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

test.describe('most-wygaszony:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const motyw of MOTYWY) {
    test(`stary adres #protection-results → lądowisko ui2 — ${motyw.plik}`, async ({
      browser,
      request,
    }) => {
      test.setTimeout(120000);
      const kontekst = await utworzKontekst(request);
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const strona = await ctx.newPage();
        await strona.addInitScript(
          (seed) => {
            localStorage.setItem(
              'mvd-theme-mode',
              JSON.stringify({ state: { mode: seed.tryb }, version: 0 }),
            );
            localStorage.setItem(
              'mv-design-app-state',
              JSON.stringify({
                state: {
                  activeProjectId: seed.projectId,
                  activeProjectName: seed.projectName,
                  activeCaseId: seed.caseId,
                  activeCaseName: seed.caseName,
                  activeCaseKind: 'ShortCircuitCase',
                  activeCaseResultStatus: 'NONE',
                  activeSnapshotId: null,
                  activeMode: 'MODEL_EDIT',
                  activeRunId: null,
                  activeAnalysisType: 'SHORT_CIRCUIT',
                  caseManagerOpen: false,
                  issuePanelOpen: false,
                },
                version: 1,
              }),
            );
          },
          { ...kontekst, tryb: motyw.tryb },
        );

        await strona.goto(`${FRONTEND_BASE}/#protection-results?case=${kontekst.caseId}`, {
          waitUntil: 'commit',
        });
        await strona.waitForSelector('[data-testid="app-ready"]', {
          state: 'attached',
          timeout: 30000,
        });

        // Dowód sceny (zrzut nie może być pustym ekranem ani widokiem mostu).
        await expect(strona.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });
        await expect(strona.getByTestId('mvd-wyniki-zakladka-koordynacja')).toHaveAttribute(
          'aria-selected',
          'true',
          { timeout: 20000 },
        );
        await expect(strona.locator('html')).toHaveAttribute('data-theme', motyw.tryb);

        await strona.screenshot({
          path: path.join(OUTPUT_DIR, `most-wygaszony-${motyw.plik}.png`),
        });
      } finally {
        await ctx.close();
      }
    });
  }
});
