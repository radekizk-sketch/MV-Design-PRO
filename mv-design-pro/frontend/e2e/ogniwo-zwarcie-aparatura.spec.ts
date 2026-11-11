/**
 * OGNIWO ŁAŃCUCHA: wynik zwarciowy → weryfikacja wytrzymałości aparatury
 * (bramka karty KD-4; dług nazwany imiennie w odbiorze V12K-287).
 *
 * INTENCJA: inżynier, który patrzy na prądy zwarciowe w punkcie, ma DOSTAĆ
 * w tym samym miejscu odpowiedź „czy aparatura pól tej stacji to wytrzyma" —
 * bez przechodzenia do konfiguratora stacji i zestawiania liczb w głowie.
 *
 * Spec idzie REALNĄ ścieżką: sieć ze stacją (operacje domenowe) → zapis
 * aparatury pól w konfiguracji stacji → bieg zwarciowy SC_3F → ekran zwarć →
 * wybór punktu → NATYWNY klik akcji weryfikacji → werdykty.
 *
 * ASERCJA NIE JEST LITERAŁEM UI: werdykt pokazany na ekranie porównujemy
 * z odpowiedzią TEJ SAMEJ końcówki backendu wywołanej niezależnie, dla prądów
 * pobranych z wyniku biegu (`/api/analysis-runs/{id}/results/short-circuit`).
 */
import { test, expect, type Page } from '@playwright/test';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';
import {
  BACKEND_BASE,
  policzZwarcie,
  sprawdzPradyPolZBiegiem,
  widokZBiegu,
  zbudujProjektZeStacja,
  ZWLOKA_51_S,
} from './siecZeStacjaZabezpieczona';
import { formatujWielkosc } from '../src/ui2/wyniki/zwarcia/aparatura/format';

/** Aparat z katalogu wytrzymałości backendu (`DEVICE_WITHSTAND_CATALOG`). */
const APARAT_ID = 'wstd_breaker_vacuum_15_25';
/** Czas wpisany w konfiguracji stacji — NIE jest źródłem tk (karta OCHRONA-JEDNO-ZRODLO). */
const CZAS_Z_KONFIGURACJI_S = 9.0;

test('ogniwo: z wyniku zwarciowego wprost do werdyktu wytrzymałości aparatury pola', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);

  const kontekst = await zbudujProjektZeStacja(
    request,
    'Bramka KD-4: wynik zwarciowy → wytrzymałość aparatury',
    true,
  );
  const { project, studyCase, stationRef } = kontekst;

  // --- Bieg zwarciowy (prądy pól = ŹRÓDŁO asercji, nie ekran) ----------------
  const { runId, punkt: punktStacji, wiersze } = await policzZwarcie(request, kontekst);

  // Pole modelu, dla którego inżynier wskaże aparat ręcznie: konfiguracja jest
  // kluczowana oznaczeniem pola modelu — wpis bez pola modelu nie ma punktu
  // zabudowy, więc nie ma też prądu (werdykt uczciwie bez oceny — brak prądu pola).
  const widokModelu = await widokZBiegu(request, kontekst, runId);
  const wierszPolaZabezpieczonego = widokModelu.pola.find(
    (p) => p.pole_ref === kontekst.poleZabezpieczoneRef,
  );
  expect(wierszPolaZabezpieczonego, 'wiersz pola ze sterownikiem').toBeTruthy();
  const POLE = wierszPolaZabezpieczonego!.pole;

  // --- Aparatura pola w konfiguracji stacji (źródło aparatu i czasu) ---------
  const configResponse = await request.put(
    `${BACKEND_BASE}/api/v1/projects/${project.id}/audit2-station-config/${encodeURIComponent(stationRef)}`,
    {
      data: {
        tap_changer_refs: [],
        der_specs: [],
        bay_device_withstand: {
          [POLE]: {
            device_id: APARAT_ID,
            // Liczby z DOBORU aparatu — ekran ma ich NIE użyć do sprawdzenia.
            i_peak_calculated_ka: 1.0,
            i_thermal_calculated_ka: 1.0,
            t_clearing_s: CZAS_Z_KONFIGURACJI_S,
          },
        },
      },
    },
  );
  expect(configResponse.ok()).toBeTruthy();

  const widok = await widokZBiegu(request, kontekst, runId);
  sprawdzPradyPolZBiegiem(widok, wiersze);
  const wierszKonfiguracji = widok.pola.find((p) => p.pole === POLE);
  expect(wierszKonfiguracji?.zrodlo).toBe('konfiguracja');
  const pradyPola = wierszKonfiguracji!.prady_pola;
  // Jedno źródło tk: nastawy sterownika pola + czas własny wyłącznika — czas wpisany
  // w konfiguracji stacji nie wchodzi do oceny (ten sam wiersz, oba kandydackie źródła).
  const czas = wierszKonfiguracji!.czas_wylaczenia;
  expect(czas.zrodlo).toBe('nastawy_pola');
  expect(czas.czlon_nastawczy_s).toBeCloseTo(ZWLOKA_51_S, 6);
  expect(czas.t_clearing_s).toBeCloseTo(ZWLOKA_51_S + (czas.czas_wlasny_wylacznika_s ?? NaN), 6);
  expect(czas.t_clearing_s).not.toBeCloseTo(CZAS_Z_KONFIGURACJI_S, 3);

  // Werdykt referencyjny: jądro wytrzymałości z prądami PUNKTU ZABUDOWY POLA
  // (wiersz biegu) i czasem z nastaw pola. Prąd cieplny = I_th przy T_k TEGO pola
  // (ślad `prad_cieplny_pola`, liczony z I_th wiersza biegu — sprawdzone wyżej).
  const pradCieplnyPola = wierszKonfiguracji!.prad_cieplny_pola;
  expect(pradCieplnyPola.tk_pola_s).toBeCloseTo(czas.t_clearing_s ?? NaN, 9);
  expect(pradCieplnyPola.ith_ka, 'czas pola ustalony — I_th pola istnieje').not.toBeNull();
  const werdyktResponse = await request.post(
    `${BACKEND_BASE}/api/v1/catalog/audit2/validate-device-withstand`,
    {
      data: {
        device_id: APARAT_ID,
        i_peak_calculated_ka: pradyPola.ip_ka,
        i_thermal_calculated_ka: pradCieplnyPola.ith_ka,
        t_clearing_s: czas.t_clearing_s,
      },
    },
  );
  expect(werdyktResponse.ok()).toBeTruthy();
  const werdykt = (await werdyktResponse.json()) as { ok: boolean; message_pl: string };

  // --- Aplikacja: ekran zwarć → wybór punktu → weryfikacja aparatury ---------
  await ustawKontekst(page, {
    projectId: project.id,
    projectName: project.name,
    caseId: studyCase.id,
    caseName: studyCase.name,
    runId,
  });

  await page.goto(`/#analysis?run=${runId}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await otworzZakladkeWynikow(page, 'zwarcia');
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 30000 });

  // Wybór punktu zwarcia = NATYWNY klik wiersza tabeli punktów.
  const nazwaPunktu = punktStacji.target_name ?? punktStacji.target_id;
  await page.getByRole('row', { name: new RegExp(escapeRegExp(nazwaPunktu)) }).first().click();

  // Sekcja ogniwa pokazuje prądy TEGO punktu jako wejścia.
  const sekcja = page.getByTestId('mvd-zwarcia-aparatura');
  await expect(sekcja).toBeVisible();
  // Strefa pierwszoplanowa pokazuje NAZWĘ stacji; ref modelu jest atrybutem
  // maszynowym — asercja idzie po nim (nazwa może się zmienić, ref nie).
  await expect(page.getByTestId('mvd-zwarcia-aparatura-stacje')).toHaveAttribute(
    'data-stacje-ref',
    stationRef,
  );

  // AKCJA: jawne przejście do weryfikacji wytrzymałości.
  await page.getByTestId('mvd-zwarcia-aparatura-sprawdz').click();

  const wierszWerdyktu = page.getByTestId(`mvd-zwarcia-aparatura-pole-${POLE}`);
  await expect(wierszWerdyktu).toBeVisible({ timeout: 30000 });
  // Werdykt na ekranie = werdykt backendu dla prądów z biegu (nie literał UI).
  await expect(wierszWerdyktu).toHaveAttribute('data-withstand-ok', String(werdykt.ok));
  await expect(page.getByTestId(`mvd-zwarcia-aparatura-czas-${POLE}`)).toHaveAttribute(
    'data-zrodlo-czasu',
    'nastawy_pola',
  );
  // Prądy pola są w „Szczegółach obliczeń” (karta APARATURA-TABELA): natywny klik przełącznika
  // wiersza, potem przełącznika szczegółów. Intencja przepisana (KD6-SZCZEGOLY pkt 4): słowny
  // komunikat backendu powtarzał liczby tabeli, więc szczegóły go nie cytują — werdykt na
  // ekranie wiąże z backendem atrybut wiersza (wyżej) i liczby tabeli kryteriów.
  await page.getByTestId(`mvd-zwarcia-aparatura-rozwin-${POLE}`).click();
  await page.getByTestId(`mvd-zwarcia-aparatura-szczegoly-przelacz-${POLE}`).click();
  await expect(page.getByTestId(`mvd-zwarcia-aparatura-dane-${POLE}`)).toBeVisible();
  await expect(page.getByTestId(`mvd-zwarcia-aparatura-szczegoly-${POLE}`)).not.toContainText(
    werdykt.message_pl,
  );
  // Prądy pola z punktem zabudowy jako daną maszynową.
  await expect(page.getByTestId(`mvd-zwarcia-aparatura-prady-${POLE}`)).toHaveAttribute(
    'data-punkt-ref',
    pradyPola.punkt_ref ?? '',
  );
});

test('ogniwo: stacja BEZ ręcznej konfiguracji — werdykty z MODELU (KD-6)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);

  // SEDNO KARTY KD-6: żadnego zapisu `bay_device_withstand`. Aparat pola
  // pochodzi z pozycji katalogu APARAT_SN wskazanej przy wstawianiu stacji,
  // więc werdykt MUSI powstać bez ręcznego konfigurowania czegokolwiek.
  const kontekst = await zbudujProjektZeStacja(
    request,
    'Bramka KD-6: werdykty wytrzymałości z modelu, bez konfiguracji stacji',
  );
  const { project, studyCase, stationRef } = kontekst;

  // Kontrola: konfiguracja stacji NIE ISTNIEJE (404 = brak zapisu).
  const konfiguracja = await request.get(
    `${BACKEND_BASE}/api/v1/projects/${project.id}/audit2-station-config/${encodeURIComponent(stationRef)}`,
  );
  expect(
    konfiguracja.status(),
    'Ten scenariusz sprawdza tor MODELOWY — konfiguracji stacji nie może być.',
  ).toBe(404);

  const { runId, punkt: punktStacji, wiersze } = await policzZwarcie(request, kontekst);

  // ODPOWIEDŹ REFERENCYJNA: ta sama końcówka dla zapisanego biegu. Asercje
  // ekranu idą PRZECIW NIEJ, nie przeciw literałom UI.
  const widok = await widokZBiegu(request, kontekst, runId);
  sprawdzPradyPolZBiegiem(widok, wiersze);
  expect(widok.status).toBe('OK');
  expect(widok.pola.length, 'Stacja z aparatami w modelu musi dać wiersze werdyktu').toBeGreaterThan(
    0,
  );
  expect(widok.pola.every((p) => p.zrodlo === 'model')).toBeTruthy();

  // --- Aplikacja: ekran zwarć → wybór punktu → weryfikacja aparatury ---------
  await ustawKontekst(page, {
    projectId: project.id,
    projectName: project.name,
    caseId: studyCase.id,
    caseName: studyCase.name,
    runId,
  });

  await page.goto(`/#analysis?run=${runId}`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await otworzZakladkeWynikow(page, 'zwarcia');
  await expect(page.getByTestId('mvd-zwarcia-ekran')).toBeVisible({ timeout: 30000 });

  const nazwaPunktu = punktStacji.target_name ?? punktStacji.target_id;
  await page.getByRole('row', { name: new RegExp(escapeRegExp(nazwaPunktu)) }).first().click();
  await page.getByTestId('mvd-zwarcia-aparatura-sprawdz').click();

  const werdykty = page.getByTestId('mvd-zwarcia-aparatura-werdykty');
  await expect(werdykty).toBeVisible({ timeout: 30000 });

  for (const pole of widok.pola) {
    const wiersz = page.getByTestId(`mvd-zwarcia-aparatura-pole-${pole.pole}`);
    await expect(wiersz).toBeVisible();
    // ŹRÓDŁO aparatu widoczne jako dana maszynowa — inżynier musi wiedzieć,
    // że ocenia aparat z modelu, a nie z własnego wpisu.
    await expect(wiersz).toHaveAttribute('data-zrodlo', 'model');
    // Zapasy w wierszu = margines rekordu K TEGO pola z odpowiedzi backendu (nigdy kopia
    // innego pola); brak marginesu = jawne „brak”, nie liczba.
    for (const rodzaj of ['dynamiczna', 'cieplna', 'wylaczanie'] as const) {
      const rekord = pole.oceny.find((o) => o.kryterium_id.endsWith(`.${rodzaj}`));
      const m = rekord?.margines?.wartosc?.wartosc ?? null;
      const oczekiwany =
        rekord === undefined
          ? 'brak oceny'
          : !rekord.stosowalnosc.dotyczy
            ? 'nie dotyczy'
            : m === null
              ? 'brak'
              : formatujWielkosc(m, 'zapas');
      await expect(
        page.getByTestId(`mvd-zwarcia-aparatura-zapas-wiersz-${pole.pole}-${rodzaj}`),
      ).toHaveText(oczekiwany);
    }
    // Czas trwania zwarcia pola: zawsze liczba backendu (projektant, nastawy albo wartość
    // robocza 1 s IEC 62271-1 — pakiet 8), bez t_b innego pola.
    await expect(page.getByTestId(`mvd-zwarcia-aparatura-czas-${pole.pole}`)).toHaveText(
      formatujWielkosc(pole.czas_wylaczenia.t_clearing_s, 'czas'),
    );
    // Werdykt na ekranie = werdykt backendu przez zapasy rekordów K (wyżej). Intencja przepisana
    // (KD6-SZCZEGOLY pkt 4): słowny komunikat pola nie jest cytowany w szczegółach.
    await page.getByTestId(`mvd-zwarcia-aparatura-rozwin-${pole.pole}`).click();
    await page.getByTestId(`mvd-zwarcia-aparatura-szczegoly-przelacz-${pole.pole}`).click();
    await expect(page.getByTestId(`mvd-zwarcia-aparatura-dane-${pole.pole}`)).toBeVisible();
    await expect(
      page.getByTestId(`mvd-zwarcia-aparatura-szczegoly-${pole.pole}`),
    ).not.toContainText(pole.komunikat_pl);
    // Prąd TEGO pola (punkt zabudowy pola z biegu), nie jedna liczba stacji.
    await expect(page.getByTestId(`mvd-zwarcia-aparatura-prady-${pole.pole}`)).toHaveAttribute(
      'data-punkt-ref',
      pole.prady_pola.punkt_ref ?? '',
    );
    // Wyprowadzenie z realnego biegu (karta KD6-SZCZEGOLY): wzory i_p / I_th / I_b z kroków
    // śladu solvera i κ z wiersza biegu — widok tylko je pokazuje.
    const wyprowadzenie = pole.prady_pola.wyprowadzenie;
    expect(Object.keys(wyprowadzenie?.wzory ?? {}).sort()).toEqual(['ib', 'ip', 'ith']);
    for (const klucz of ['ip', 'ith', 'ib']) {
      await expect(
        page.getByTestId(`mvd-zwarcia-aparatura-wzor-${pole.pole}-${klucz}`).locator('.katex'),
      ).toBeVisible();
    }
    expect(wyprowadzenie?.kappa).toBeDefined();
    await expect(page.getByTestId(`mvd-zwarcia-aparatura-posrednia-${pole.pole}-kappa`)).toHaveText(
      formatujWielkosc(wyprowadzenie?.kappa ?? Number.NaN, 'wspolczynnik'),
    );
    // Wiersz cieplny: zdanie backendu („Spełnione dla t = 1 s”) przy rozstrzygniętym porównaniu.
    if (pole.komunikat_cieplny_pl !== null) {
      await expect(
        page.getByTestId(`mvd-zwarcia-aparatura-komunikat-cieplny-${pole.pole}`),
      ).toHaveText(pole.komunikat_cieplny_pl);
    }
    // Źródło czasu jako dana maszynowa komórki Tk (rozbicie w szczegółach).
    const czas = page.getByTestId(`mvd-zwarcia-aparatura-czas-${pole.pole}`);
    await expect(czas).toHaveAttribute('data-zrodlo-czasu', pole.czas_wylaczenia.zrodlo);
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ustawKontekst(
  page: Page,
  seed: {
    projectId: string;
    projectName: string;
    caseId: string;
    caseName: string;
    runId: string;
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
  }, seed);
}
