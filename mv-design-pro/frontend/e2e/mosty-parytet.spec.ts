/**
 * Parytet mostów legacy — bramka karty K8 (wygaszanie tras o pełnym parytecie).
 *
 * INTENCJA: trasa mostu legacy, dla której zdolność ma PEŁNEGO dostawcę w ui2,
 * nie może dłużej prowadzić do powierzchni mostu. Wejście STARYM adresem
 * (zakładka użytkownika, link od kolegi, zimny start w nowej karcie) musi
 * wylądować w oknie ui2 Z ZACHOWANYM KONTEKSTEM (projekt / przypadek), a nie
 * w zdegradowanym widoku mostu:
 *   - `#power-flow-results` i `#protection-results` renderowały GENERYCZNĄ
 *     tabelę analityczną powierzchni E-35 (ta sama dla każdej zakładki —
 *     zakładki 'power-flow' i 'protection' nie miały własnej gałęzi renderu),
 *   - `#case-config` otwierał powierzchnię E-07, dla której `renderSurfaceBody`
 *     NIE MA gałęzi — prawy panel pokazywał sam nagłówek bez treści,
 *   - `#variants` otwierał kartę read-only E-08 (metryki + cztery przyciski
 *     nawigacyjne), w całości pokrytą przez przestrzeń „Obliczenia" ui2.
 * Werdykty i luki pozostałych tras: `docs/uiux/INWENTARZ_PARYTETU_MOSTOW_2026-07.md`.
 *
 * Druga część bramki: trasa ZOSTAWIONA w moście (`#catalog` → E-38) MUSI nadal
 * działać — wygaszanie nie może zabrać funkcji, dla której ui2 nie ma parytetu
 * (przeglądarka katalogu ui2 nie zna kategorii CT / VT / kabli i aparatów nN).
 *
 * Seed: realny backend przez API (wzorzec `e2e/deep-link-wyniki.spec.ts`) —
 * projekt + przypadek wystarczą, bo bramka bada NAWIGACJĘ i KONTEKST, nie liczby.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const FRONTEND_BASE = process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://127.0.0.1:5173';

let entityCounter = 0;

interface Kontekst {
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
}

async function utworzProjektIPrzypadek(request: APIRequestContext): Promise<Kontekst> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `E2E mosty ${suffix}`;
  // Nazwa w formie PUBLICZNEJ: pasek zakresu przepuszcza ją przez
  // `calculationScopeDisplayName` (przedrostek „Przypadek” → „Zakres”),
  // więc asercja kontekstu porównuje dokładnie to, co widzi użytkownik.
  const caseName = `Zakres mosty ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Parytet mostów legacy (bramka K8)',
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

/**
 * Zimne wejście starym adresem: NOWY kontekst przeglądarki (zero pamięci
 * poprzedniej karty) + kontekst projektu/przypadku wyłącznie z persistu, tak
 * jak po ponownym otwarciu aplikacji z zakładki. Parametr `case=` w adresie
 * jest dodatkowym, uczciwym źródłem kontekstu (hydratacja K2).
 */
async function zimneWejscie(page: Page, kontekst: Kontekst, hash: string): Promise<void> {
  await page.addInitScript((seed) => {
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
  }, kontekst);

  await page.goto(`${FRONTEND_BASE}/${hash}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
}

/** Kontekst zachowany = pasek zakresu niesie nazwę PROJEKTU i ZAKRESU obliczeń. */
async function oczekujZachowanyKontekst(page: Page, kontekst: Kontekst): Promise<void> {
  const pasek = page.getByTestId('active-case-bar');
  await expect(pasek).toContainText(kontekst.projectName, { timeout: 20000 });
  await expect(pasek).toContainText(kontekst.caseName, { timeout: 20000 });
}

test.describe('K8 — wygaszone trasy mostu lądują w ui2 z zachowanym kontekstem', () => {
  test('#power-flow-results → warsztat Wyników, zakładka „Rozpływ mocy" (bez powierzchni mostu)', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120000);
    const kontekst = await utworzProjektIPrzypadek(request);
    const ctx = await browser.newContext();
    try {
      const strona = await ctx.newPage();
      await zimneWejscie(strona, kontekst, `#power-flow-results?case=${kontekst.caseId}`);

      await expect(strona.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });
      await expect(strona.getByTestId('mvd-wyniki-zakladka-rozplyw')).toHaveAttribute(
        'aria-selected',
        'true',
        { timeout: 20000 },
      );
      // Bez naprawy K8 trasa otwierała powierzchnię mostu (E-35) w zakładce
      // „Pozostałe analizy" — tabela generyczna zamiast okna rozpływu.
      await expect(strona.getByTestId('mvd-analizy-most-dziecko')).toHaveCount(0);
      await oczekujZachowanyKontekst(strona, kontekst);
    } finally {
      await ctx.close();
    }
  });

  test('#protection-results → warsztat Wyników, zakładka „Koordynacja zabezpieczeń"', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120000);
    const kontekst = await utworzProjektIPrzypadek(request);
    const ctx = await browser.newContext();
    try {
      const strona = await ctx.newPage();
      await zimneWejscie(strona, kontekst, `#protection-results?case=${kontekst.caseId}`);

      await expect(strona.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 20000 });
      await expect(strona.getByTestId('mvd-wyniki-zakladka-koordynacja')).toHaveAttribute(
        'aria-selected',
        'true',
        { timeout: 20000 },
      );
      await expect(strona.getByTestId('mvd-analizy-most-dziecko')).toHaveCount(0);
      await oczekujZachowanyKontekst(strona, kontekst);
    } finally {
      await ctx.close();
    }
  });

  test('#case-config → przestrzeń „Obliczenia" (menedżer przypadków), bez pustej powierzchni E-07', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120000);
    const kontekst = await utworzProjektIPrzypadek(request);
    const ctx = await browser.newContext();
    try {
      const strona = await ctx.newPage();
      await zimneWejscie(strona, kontekst, `#case-config?case=${kontekst.caseId}`);

      await expect(strona.getByTestId('mvd-przypadki')).toBeVisible({ timeout: 20000 });
      // Defekt zastany: E-07 (klasa B) zajmowała prawy panel nagłówkiem bez
      // treści (router nie ma gałęzi renderu dla tego kodu ekranu).
      await expect(strona.getByTestId('workspace-surface-panel')).toHaveCount(0);
      await oczekujZachowanyKontekst(strona, kontekst);
    } finally {
      await ctx.close();
    }
  });

  test('#variants → przestrzeń „Obliczenia" (menedżer przypadków + przebiegi), bez karty E-08', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120000);
    const kontekst = await utworzProjektIPrzypadek(request);
    const ctx = await browser.newContext();
    try {
      const strona = await ctx.newPage();
      await zimneWejscie(strona, kontekst, `#variants?case=${kontekst.caseId}`);

      await expect(strona.getByTestId('mvd-przypadki')).toBeVisible({ timeout: 20000 });
      // Trasa `#variants` prowadziła do PORÓWNANIA wariantów pracy, więc parytet
      // wymaga OBU okien przestrzeni „Obliczenia": menedżera przypadków ORAZ
      // historii przebiegów. Historia była drugą instancją tego samego defektu
      // zapadania panelu (`.mvd-przebiegi`, zmierzone rect 1045x0) — pin trzyma
      // teraz obie, żeby naprawa nie cofnęła się połowicznie.
      await expect(strona.getByTestId('mvd-przebiegi')).toBeVisible({ timeout: 20000 });
      await expect(strona.getByTestId('variants-engineering-surface')).toHaveCount(0);
      await oczekujZachowanyKontekst(strona, kontekst);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('K8 — trasa ZOSTAWIONA w moście działa bez regresji', () => {
  test('#catalog nadal otwiera przeglądarkę katalogu mostu (E-38 — ui2 bez parytetu kategorii)', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120000);
    const kontekst = await utworzProjektIPrzypadek(request);
    const ctx = await browser.newContext();
    try {
      const strona = await ctx.newPage();
      await zimneWejscie(strona, kontekst, '#catalog');

      // Powierzchnia pomocnicza klasy B → prawy panel powłoki (LegacyInspektor).
      await expect(strona.getByTestId('workspace-surface-panel')).toBeVisible({ timeout: 20000 });
      await expect(strona.getByTestId('workspace-surface-panel')).toContainText('Katalogi', {
        timeout: 20000,
      });
      await oczekujZachowanyKontekst(strona, kontekst);
    } finally {
      await ctx.close();
    }
  });
});
