/**
 * PRZYJĘTY CZAS ZWARCIA POLA SN — kryterium cieplne aparatury bez stanu „nieustalony”
 * (karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN, pakiet 8; dyrektywa właściciela).
 *
 * INTENCJA: pole bez przypisanego zabezpieczenia ma kryterium cieplne rozstrzygnięte dla
 * wartości roboczej t = 1 s (IEC 62271-1 §4.7) z komunikatem backendu „Spełnione dla t = 1 s”;
 * projektant zmienia przyjęty czas przy T_k, a zapis wywołuje operację modelu i AUTOMATYCZNE
 * przeliczenie (nowy bieg zwarciowy, ponowny odczyt oceny) — bez drugiego kliku „Sprawdź”.
 *
 * Ścieżka REALNA: sieć ze stacją bez zabezpieczeń (operacje domenowe) → bieg SC_3F → ekran
 * zwarć → natywny klik w punkt i „Sprawdź” → rozwinięcie pola → wpis 3 → „Zapisz i przelicz”.
 * Asercje liczbowe idą przeciw końcówce backendu dla biegu (przed i po), nie przeciw literałom.
 * Zrzuty przed/po w obu motywach: docs/audit/visual/flow-ekspert/przyjety-czas-zwarcia-*.png.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';
import { katalogZrzutow } from './katalogZrzutow';
import { bramkaTresciMatematycznej } from './trescMatematyczna';
import {
  BACKEND_BASE,
  policzZwarcie,
  widokZBiegu,
  zbudujProjektZeStacja,
} from './siecZeStacjaZabezpieczona';
import { formatujWielkosc } from '../src/ui2/wyniki/zwarcia/aparatura/format';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = katalogZrzutow(path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert'));

const MOTYWY = ['light', 'dark'] as const;

async function otworzEkranZwarc(
  page: Page,
  seed: {
    projectId: string;
    projectName: string;
    caseId: string;
    caseName: string;
    runId: string;
    motyw: string;
  },
): Promise<void> {
  await page.addInitScript((dane) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: dane.projectId,
          activeProjectName: dane.projectName,
          activeCaseId: dane.caseId,
          activeCaseName: dane.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'FRESH',
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
  }, seed);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/#analysis?run=${seed.runId}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await otworzZakladkeWynikow(page, 'zwarcia');
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 30000 });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const motyw of MOTYWY) {
  test(`przyjęty czas zwarcia: pole bez zabezpieczenia → t = 1 s → 3 s z przeliczeniem (${motyw})`, async ({
    page,
    request,
  }) => {
    test.setTimeout(300000);

    // Stacja BEZ zabezpieczeń: czas pola nie pochodzi z nastaw — wartość robocza 1 s.
    const kontekst = await zbudujProjektZeStacja(
      request,
      `Pakiet 8: przyjęty czas zwarcia pola SN (${motyw})`,
    );
    const { project, studyCase } = kontekst;
    const { runId, punkt } = await policzZwarcie(request, kontekst);

    // ODPOWIEDŹ REFERENCYJNA przed zmianą: pole z czasem roboczym i rozstrzygniętym porównaniem.
    const przed = await widokZBiegu(request, kontekst, runId);
    const pole = przed.pola.find(
      (p) =>
        p.czas_wylaczenia.zrodlo === 'wartosc_robocza' &&
        p.czas_wylaczenia.wylacznik_czasu_ref !== null &&
        p.komunikat_cieplny_pl !== null,
    );
    expect(pole, 'pole z czasem roboczym 1 s i łącznikiem w modelu').toBeTruthy();
    expect(pole!.czas_wylaczenia.t_clearing_s).toBe(1);
    expect(pole!.komunikat_cieplny_pl).toMatch(/^(Spełnione|Niespełnione) dla t = 1 s$/);
    const P = pole!.pole;

    await otworzEkranZwarc(page, {
      projectId: project.id,
      projectName: project.name,
      caseId: studyCase.id,
      caseName: studyCase.name,
      runId,
      motyw,
    });
    const nazwaPunktu = punkt.target_name ?? punkt.target_id;
    await page.getByRole('row', { name: new RegExp(escapeRegExp(nazwaPunktu)) }).first().click();
    await page.getByTestId('mvd-zwarcia-aparatura-sprawdz').click();
    await expect(page.getByTestId('mvd-zwarcia-aparatura-werdykty')).toBeVisible({ timeout: 30000 });
    await page.getByTestId(`mvd-zwarcia-aparatura-rozwin-${P}`).click();

    // Przed: liczba, źródło i komunikat backendu — bez słowa „nieustalony”.
    await expect(page.getByTestId(`mvd-zwarcia-aparatura-czas-${P}`)).toHaveText(
      formatujWielkosc(1, 'czas'),
    );
    await expect(page.getByTestId(`mvd-zwarcia-aparatura-czas-zrodlo-${P}`)).toContainText(
      'wartość robocza (IEC 62271-1)',
    );
    await expect(page.getByTestId(`mvd-zwarcia-aparatura-komunikat-cieplny-${P}`)).toHaveText(
      pole!.komunikat_cieplny_pl!,
    );
    await expect(page.getByTestId('mvd-zwarcia-aparatura')).not.toContainText(/nieustalon/i);
    await bramkaTresciMatematycznej(page);
    await page
      .getByTestId('mvd-zwarcia-aparatura')
      .screenshot({ path: path.join(OUTPUT_DIR, `przyjety-czas-zwarcia-przed-${motyw}.png`) });

    // Zmiana przyjętego czasu: natywne wpisanie i klik — zapis + automatyczne przeliczenie.
    const wejscie = page.getByTestId(`mvd-zwarcia-aparatura-przyjety-czas-${P}`);
    await wejscie.fill('');
    await wejscie.pressSequentially('3');
    await page.getByTestId(`mvd-zwarcia-aparatura-zapisz-czas-${P}`).click();

    // Ponowny odczyt z NOWEGO biegu: czas 3 s ze źródłem „wartość projektanta”.
    await expect(page.getByTestId(`mvd-zwarcia-aparatura-czas-${P}`)).toHaveText(
      formatujWielkosc(3, 'czas'),
      { timeout: 120000 },
    );
    await page.getByTestId(`mvd-zwarcia-aparatura-rozwin-${P}`).click();
    await expect(page.getByTestId(`mvd-zwarcia-aparatura-czas-zrodlo-${P}`)).toContainText(
      'wartość projektanta',
    );

    // Model: wartość projektanta na łączniku pola (operacja domenowa, nie stan ekranu).
    const migawka = await request.get(`${BACKEND_BASE}/api/cases/${studyCase.id}/enm`);
    expect(migawka.ok()).toBeTruthy();
    const enm = (await migawka.json()) as {
      branches: Array<{ ref_id: string; czas_wylaczenia_zwarcia_s?: number | null }>;
    };
    const lacznik = enm.branches.find((b) => b.ref_id === pole!.czas_wylaczenia.wylacznik_czasu_ref);
    expect(lacznik?.czas_wylaczenia_zwarcia_s).toBe(3);

    // Liczby po przeliczeniu = końcówka backendu dla najnowszego biegu przypadku.
    const biegi = await request.get(
      `${BACKEND_BASE}/api/execution/study-cases/${studyCase.id}/runs`,
    );
    expect(biegi.ok()).toBeTruthy();
    const lista = (await biegi.json()) as {
      runs: Array<{ id: string; analysis_type: string; status: string }>;
    };
    // Bieg przeliczenia: jedyny bieg zwarciowy poza biegiem wyjściowym (zlecił go zapis czasu).
    const nowe = lista.runs.filter(
      (r) => r.analysis_type === 'SC_3F' && r.status === 'DONE' && r.id !== runId,
    );
    expect(nowe).toHaveLength(1);
    const najnowszy = nowe[0];
    const po = await widokZBiegu(request, kontekst, najnowszy.id);
    const polePo = po.pola.find((p) => p.pole === P)!;
    expect(polePo.czas_wylaczenia.t_clearing_s).toBe(3);
    expect(polePo.czas_wylaczenia.zrodlo).toBe('projektant');
    expect(polePo.komunikat_cieplny_pl).toMatch(/^(Spełnione|Niespełnione) dla t = 3 s$/);
    await expect(page.getByTestId(`mvd-zwarcia-aparatura-komunikat-cieplny-${P}`)).toHaveText(
      polePo.komunikat_cieplny_pl!,
    );
    await bramkaTresciMatematycznej(page);
    await page
      .getByTestId('mvd-zwarcia-aparatura')
      .screenshot({ path: path.join(OUTPUT_DIR, `przyjety-czas-zwarcia-po-${motyw}.png`) });
  });
}
