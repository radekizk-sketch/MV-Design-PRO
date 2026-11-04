/**
 * Wybór zabezpieczeń PRZYPADKU obliczeniowego (ADR-022, karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN).
 *
 * INTENCJA. Nastawy bazowe sterownika pola są danymi modelu; przypadek obliczeniowy WYBIERA grupę
 * nastaw albo NADPISUJE pojedyncze nastawy jako deltę. Do tej karty delty istniały wyłącznie
 * w API (zdolność fantomowa). Spec idzie REALNĄ ścieżką projektanta na żywym backendzie,
 * klikami NATYWNYMI: karta przypadku B → sekcja „Zabezpieczenia w tym przypadku" → wybór grupy /
 * nadpisanie zwłoki → zapis.
 *
 * ASERCJE NIE SĄ LITERAŁAMI UI. Skutek wyboru sprawdzamy na wynikach backendu obu przypadków:
 *  1. grupa 2 w przypadku B zmienia ocenę zabezpieczeń B (czas zadziałania = zwłoka grupy 2),
 *     przypadek A liczy grupą 1, a model (sterownik, jego grupy i grupa aktywna) jest bez zmian;
 *  2. nadpisanie zwłoki I> (51) w przypadku B zmienia czas wyłączenia pola i ocenę wytrzymałości
 *     cieplnej jego aparatury (prąd cieplny dopuszczalny przy t_k) w B, nie w A; zapis unieważnia
 *     wyniki TYLKO przypadku B (karta przypadku A dalej „aktualne").
 * Zrzuty sekcji i znaczników karty pola (przed i po zapisie, oba motywy) — do oceny właściciela.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { katalogZrzutow } from './katalogZrzutow';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';
import {
  BACKEND_BASE,
  domainOp,
  policzZwarcie,
  widokZBiegu,
  zbudujProjektZeStacja,
  ZWLOKA_51_S,
  type Kontekst,
} from './siecZeStacjaZabezpieczona';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert'));

/** Zwłoka członu I> (51, DT) w GRUPIE 2 modelu — wybierana przez przypadek B. */
const ZWLOKA_51_GRUPA_2_S = 0.8;
/** Zwłoka I> nadpisana w przypadku B (druga ścieżka: nadpisanie zamiast grupy). */
const ZWLOKA_51_NADPISANA_S = 1.2;

const MOTYWY = [
  { id: 'light', mode: 'light_technical' },
  { id: 'dark', mode: 'dark_scada' },
] as const;

type Sterownik = {
  ref_id: string;
  bay_ref?: string | null;
  aktywna_grupa?: number;
  grupy_nastaw: unknown[];
};
type Migawka = { protection_assignments?: Sterownik[] };
type Wybor = { protection_groups: Record<string, number>; protection_overrides: Record<string, unknown> };

async function model(request: APIRequestContext, caseId: string): Promise<Migawka> {
  const odpowiedz = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  return (await odpowiedz.json()) as Migawka;
}

async function sterownikPola(request: APIRequestContext, kontekst: Kontekst): Promise<Sterownik> {
  const s = (await model(request, kontekst.studyCase.id)).protection_assignments?.find(
    (p) => p.bay_ref === kontekst.poleZabezpieczoneRef,
  );
  expect(s, 'sterownik pola wejściowego').toBeTruthy();
  return s!;
}

async function wybor(request: APIRequestContext, caseId: string): Promise<Wybor> {
  const odpowiedz = await request.get(
    `${BACKEND_BASE}/api/scenariusze-laczeniowe/study-cases/${caseId}/zabezpieczenia-przypadku`,
  );
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  return (await odpowiedz.json()) as Wybor;
}

/** Drugi przypadek projektu (ten sam model sieci — jeden model na projekt). */
async function przypadekB(request: APIRequestContext, kontekst: Kontekst): Promise<{ id: string; name: string }> {
  const odpowiedz = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: kontekst.project.id, name: 'Przypadek B — rezerwa', description: '', config: {}, set_active: false },
  });
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  return (await odpowiedz.json()) as { id: string; name: string };
}

/** Ocena zabezpieczeń przez TĘ SAMĄ końcówkę co przycisk ekranu — czasy zadziałania urządzenia. */
async function czasyOceny(request: APIRequestContext, runId: string): Promise<number[]> {
  const odpowiedz = await request.get(`${BACKEND_BASE}/api/protection-runs/${runId}/results`);
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  const wynik = (await odpowiedz.json()) as { evaluations: Array<{ t_trip_s: number | null }> };
  return wynik.evaluations.map((e) => e.t_trip_s).filter((t): t is number => t !== null);
}

async function ocenaPrzezApi(
  request: APIRequestContext,
  projectId: string,
  caseId: string,
  scRunId: string,
): Promise<string> {
  const utworzony = await request.post(`${BACKEND_BASE}/api/projects/${projectId}/protection-runs`, {
    data: { sc_run_id: scRunId, protection_case_id: caseId },
  });
  expect(utworzony.ok(), await utworzony.text()).toBeTruthy();
  const { id } = (await utworzony.json()) as { id: string };
  const wykonany = await request.post(`${BACKEND_BASE}/api/protection-runs/${id}/execute`);
  expect(wykonany.ok(), await wykonany.text()).toBeTruthy();
  await expect
    .poll(async () => ((await (await request.get(`${BACKEND_BASE}/api/protection-runs/${id}`)).json()) as { status: string }).status, {
      timeout: 60000,
    })
    .toBe('FINISHED');
  return id;
}

async function otworz(page: Page, kontekst: Kontekst, motyw: string, hash: string): Promise<void> {
  await page.addInitScript(
    (dane) => {
      localStorage.setItem(
        'mv-design-app-state',
        JSON.stringify({
          state: {
            activeProjectId: dane.projectId,
            activeProjectName: dane.projectName,
            activeCaseId: dane.caseId,
            activeCaseName: dane.caseName,
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
      localStorage.setItem('mvd-theme-mode', JSON.stringify({ state: { mode: dane.motyw }, version: 0 }));
    },
    {
      projectId: kontekst.project.id,
      projectName: kontekst.project.name,
      caseId: kontekst.studyCase.id,
      caseName: kontekst.studyCase.name,
      motyw,
    },
  );
  await page.goto(hash, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
}

/** Karta przypadku z menedżera przypadków (klik wiersza = selekcja + karta). */
async function kartaPrzypadku(page: Page, nazwa: string): Promise<void> {
  const menedzer = page.getByTestId('mvd-przypadki');
  await expect(menedzer).toBeVisible({ timeout: 30000 });
  await menedzer.getByRole('row').filter({ hasText: nazwa }).first().click();
  await expect(page.getByTestId('mvd-karta')).toContainText(nazwa, { timeout: 20000 });
}

/** Panel sterownika w sekcji przypadku — rozwinięty natywnym klikiem nagłówka. */
async function panelSterownika(page: Page, ref: string) {
  const id = `mvd-zabezpieczenia-przypadku-${ref}`;
  const panel = page.getByTestId(id);
  await expect(panel).toBeVisible({ timeout: 30000 });
  if ((await panel.getAttribute('open')) === null) await page.getByTestId(`${id}-naglowek`).click();
  await expect(page.getByTestId(`${id}-grupa`)).toBeVisible();
  return id;
}

async function zapiszWPrzypadku(page: Page, caseId: string): Promise<void> {
  const zapis = page.waitForResponse(
    (r) => r.url().endsWith(`/study-cases/${caseId}/zabezpieczenia-przypadku`) && r.request().method() === 'PUT',
  );
  await page.getByTestId('mvd-zabezpieczenia-przypadku-zapisz').click();
  const odpowiedz = await zapis;
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  await expect(page.getByTestId('mvd-zabezpieczenia-przypadku-zapisano')).toBeVisible();
}

/** Ekran „Zabezpieczenia i automatyka" paletą poleceń (Ctrl+K) i edytor nastaw sterownika. */
async function edytorNastaw(page: Page, ref: string): Promise<string> {
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('mvd-cmdk-dialog')).toBeVisible();
  await page.getByTestId('mvd-cmdk-input').fill('Zabezpieczenia i automatyka');
  await page.getByTestId('mvd-cmdk-opcja-ekran:E-27').click();
  await expect(page.getByTestId('mvd-za-zabezpieczenia')).toBeVisible({ timeout: 20000 });
  const przelacz = page.getByTestId(`mvd-za-nastawy-${ref}`);
  if ((await przelacz.getAttribute('aria-expanded')) !== 'true') await przelacz.click();
  const prefiks = `mvd-za-edytor-${ref}`;
  await expect(page.getByTestId(prefiks)).toBeVisible({ timeout: 20000 });
  return prefiks;
}

test.describe('Zabezpieczenia w przypadku obliczeniowym — delta nad nastawami modelu', () => {
  test('grupa 2 w przypadku B zmienia ocenę zabezpieczeń B; przypadek A i model bez zmian', async ({
    page,
    request,
  }) => {
    test.setTimeout(300000);
    const kontekst = await zbudujProjektZeStacja(request, 'Wybór grupy nastaw w przypadku', true);
    const caseA = kontekst.studyCase;
    const sterownik = await sterownikPola(request, kontekst);
    // Grupa 2 w MODELU: ta sama charakterystyka, dłuższa zwłoka (np. nastawy na czas rezerwy).
    await domainOp(request, caseA.id, 'update_protection_settings', {
      protection_ref: sterownik.ref_id,
      grupa: 2,
      nastawy: { '51': { prog: 400.0, jednostka_progu: 'A_PIERWOTNY', krzywa: 'DT', zwloka_s: ZWLOKA_51_GRUPA_2_S } },
    });
    const caseB = await przypadekB(request, kontekst);
    const sterownikiPrzed = JSON.stringify((await model(request, caseA.id)).protection_assignments);
    expect((await sterownikPola(request, kontekst)).aktywna_grupa).toBe(1);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await otworz(page, kontekst, 'light_technical', `/#case-config?case=${caseA.id}`);
    await kartaPrzypadku(page, caseB.name);
    const id = await panelSterownika(page, sterownik.ref_id);
    const select = page.getByTestId(`${id}-grupa`);
    await expect(select.locator('option')).toHaveText(['Z modelu (grupa 1)', 'Grupa 1', 'Grupa 2']);
    await select.selectOption('2');
    await zapiszWPrzypadku(page, caseB.id);

    // Wybór należy do B; A bez wyboru; model (sterowniki z grupami i grupą aktywną) nietknięty.
    expect((await wybor(request, caseB.id)).protection_groups).toEqual({ [sterownik.ref_id]: 2 });
    expect((await wybor(request, caseA.id)).protection_groups).toEqual({});
    expect(JSON.stringify((await model(request, caseA.id)).protection_assignments)).toBe(sterownikiPrzed);

    // Biegi zwarciowe obu przypadków; ocena B NATYWNYM klikiem na ekranie koordynacji B.
    const scA = await policzZwarcie(request, kontekst);
    const scB = await policzZwarcie(request, { ...kontekst, studyCase: caseB });
    await page.getByTestId('mvd-przypadki').getByRole('row').filter({ hasText: caseB.name }).first().dblclick();
    await expect(page.getByTestId('active-case-bar')).toContainText(caseB.name, { timeout: 20000 });
    await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
    await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 30000 });
    await otworzZakladkeWynikow(page, 'koordynacja');
    const uruchom = page.getByTestId('mvd-ocena-zabezpieczen-uruchom');
    await expect(uruchom).toBeEnabled({ timeout: 30000 });
    const utworzenie = page.waitForResponse(
      (r) => /\/api\/projects\/[^/]+\/protection-runs$/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 60000 },
    );
    await uruchom.click();
    const odpowiedzB = await utworzenie;
    expect(odpowiedzB.ok(), await odpowiedzB.text()).toBeTruthy();
    const ocenaB = ((await odpowiedzB.json()) as { id: string; sc_run_id?: string }).id;
    await expect(page.getByTestId('mvd-ocena-zabezpieczen-wynik')).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('mvd-ocena-zabezpieczen')).toHaveAttribute('data-run-id', ocenaB);

    const ocenaA = await ocenaPrzezApi(request, kontekst.project.id, caseA.id, scA.runId);
    const czasyA = await czasyOceny(request, ocenaA);
    const czasyB = await czasyOceny(request, ocenaB);
    expect(czasyA.length).toBeGreaterThan(0);
    expect(czasyB.length).toBe(czasyA.length);
    // DT: czas zadziałania = zwłoka grupy czytanej przez przypadek.
    for (const t of czasyA) expect(t).toBeCloseTo(ZWLOKA_51_S, 6);
    for (const t of czasyB) expect(t).toBeCloseTo(ZWLOKA_51_GRUPA_2_S, 6);
    // Ekran pokazuje liczby TEGO biegu oceny (B), nie A.
    await expect(page.getByTestId('mvd-ocena-zabezpieczen-wynik')).toContainText(/0,800/);
    await expect(page.getByTestId('mvd-ocena-zabezpieczen-wynik')).not.toContainText(/0,300/);
    expect(scB.runId).not.toBe(scA.runId);
    expect(JSON.stringify((await model(request, caseA.id)).protection_assignments)).toBe(sterownikiPrzed);
  });

  test('nadpisanie zwłoki I> w przypadku B zmienia czas wyłączenia pola i wytrzymałość cieplną B; unieważnia tylko B', async ({
    page,
    request,
  }) => {
    test.setTimeout(300000);
    const kontekst = await zbudujProjektZeStacja(request, 'Nadpisanie nastawy w przypadku', true);
    const caseA = kontekst.studyCase;
    const sterownik = await sterownikPola(request, kontekst);
    const caseB = await przypadekB(request, kontekst);
    // Oba przypadki mają aktualne wyniki PRZED zmianą — zapis ma unieważnić wyłącznie B.
    await policzZwarcie(request, kontekst);
    await policzZwarcie(request, { ...kontekst, studyCase: caseB });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await otworz(page, kontekst, 'light_technical', `/#case-config?case=${caseA.id}`);
    await kartaPrzypadku(page, caseB.name);
    await expect(page.getByTestId('mvd-karta-status')).toHaveText('aktualne');
    const id = await panelSterownika(page, sterownik.ref_id);
    await page.getByTestId(`${id}-dodaj-funkcja`).selectOption('51');
    await page.getByTestId(`${id}-dodaj-nastawa`).selectOption('zwloka_s');
    await page.getByTestId(`${id}-dodaj`).click();
    await expect(page.getByTestId(`${id}-51-zwloka_s-bazowa`)).toHaveText('0,3 s');
    const pole = page.getByTestId(`${id}-51-zwloka_s-wartosc`);
    await expect(pole).toHaveValue(String(ZWLOKA_51_S));
    await pole.fill(String(ZWLOKA_51_NADPISANA_S));
    await zapiszWPrzypadku(page, caseB.id);
    await expect(page.getByTestId('mvd-karta-status')).toHaveText('nieaktualne', { timeout: 20000 });
    await kartaPrzypadku(page, caseA.name);
    await expect(page.getByTestId('mvd-karta-status')).toHaveText('aktualne');

    expect((await wybor(request, caseB.id)).protection_overrides).toEqual({
      [sterownik.ref_id]: { '51': { zwloka_s: ZWLOKA_51_NADPISANA_S } },
    });

    const scA = await policzZwarcie(request, kontekst);
    const scB = await policzZwarcie(request, { ...kontekst, studyCase: caseB });
    const poleA = (await widokZBiegu(request, kontekst, scA.runId)).pola.find(
      (p) => p.pole_ref === kontekst.poleZabezpieczoneRef,
    )!;
    const poleB = (await widokZBiegu(request, { ...kontekst, studyCase: caseB }, scB.runId)).pola.find(
      (p) => p.pole_ref === kontekst.poleZabezpieczoneRef,
    )!;
    expect(poleA.czas_wylaczenia.czlon_nastawczy_s).toBeCloseTo(ZWLOKA_51_S, 6);
    expect(poleB.czas_wylaczenia.czlon_nastawczy_s).toBeCloseTo(ZWLOKA_51_NADPISANA_S, 6);
    const wlasny = poleA.czas_wylaczenia.czas_wlasny_wylacznika_s ?? 0;
    expect(poleB.czas_wylaczenia.t_clearing_s).toBeCloseTo(ZWLOKA_51_NADPISANA_S + wlasny, 6);
    // Prąd cieplny dopuszczalny aparatury przy t_k maleje z dłuższym czasem wyłączenia.
    const ithA = (poleA as unknown as { werdykt: { i_th_effective_ka: number } }).werdykt.i_th_effective_ka;
    const ithB = (poleB as unknown as { werdykt: { i_th_effective_ka: number } }).werdykt.i_th_effective_ka;
    expect(ithB).toBeLessThan(ithA);
  });

  for (const { id: motyw, mode } of MOTYWY) {
    test(`zrzuty: sekcja przypadku i znaczniki karty pola, przed i po zapisie — ${motyw}`, async ({
      page,
      request,
    }) => {
      test.setTimeout(240000);
      const kontekst = await zbudujProjektZeStacja(request, 'Zrzuty wyboru zabezpieczeń przypadku', true);
      const sterownik = await sterownikPola(request, kontekst);
      await domainOp(request, kontekst.studyCase.id, 'update_protection_settings', {
        protection_ref: sterownik.ref_id,
        grupa: 2,
        nastawy: { '51': { prog: 400.0, jednostka_progu: 'A_PIERWOTNY', krzywa: 'DT', zwloka_s: ZWLOKA_51_GRUPA_2_S } },
      });
      const caseB = await przypadekB(request, kontekst);

      await page.setViewportSize({ width: 1440, height: 1000 });
      await otworz(page, kontekst, mode, `/#case-config?case=${kontekst.studyCase.id}`);
      await kartaPrzypadku(page, caseB.name);
      const id = await panelSterownika(page, sterownik.ref_id);
      const sekcja = page.getByTestId('mvd-zabezpieczenia-przypadku');
      await sekcja.scrollIntoViewIfNeeded();
      await sekcja.screenshot({ path: path.join(OUTPUT_DIR, `zabezpieczenia-przypadku-przed-${motyw}.png`) });

      await page.getByTestId(`${id}-grupa`).selectOption('2');
      await page.getByTestId(`${id}-dodaj-funkcja`).selectOption('51');
      await page.getByTestId(`${id}-dodaj-nastawa`).selectOption('zwloka_s');
      await page.getByTestId(`${id}-dodaj`).click();
      await page.getByTestId(`${id}-51-zwloka_s-wartosc`).fill(String(ZWLOKA_51_NADPISANA_S));
      await zapiszWPrzypadku(page, caseB.id);
      await sekcja.screenshot({ path: path.join(OUTPUT_DIR, `zabezpieczenia-przypadku-po-${motyw}.png`) });

      const prefiks = await edytorNastaw(page, sterownik.ref_id);
      const znaczniki = page.getByTestId(`${prefiks}-przypadki`);
      await expect(znaczniki).toContainText(`W przypadku „${caseB.name}"`);
      await expect(znaczniki).toContainText('grupa 2');
      await expect(znaczniki).toContainText('1,2 s');
      await expect(page.getByTestId(`${prefiks}-51-w-przypadkach`)).toContainText(caseB.name);
      await page.getByTestId(prefiks).screenshot({
        path: path.join(OUTPUT_DIR, `zabezpieczenia-przypadku-karta-pola-${motyw}.png`),
      });
    });
  }
});
