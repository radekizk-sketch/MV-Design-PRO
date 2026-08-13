/**
 * Krytyczny łańcuch DOWODU CERTYFIKACJI PTPiREE na realnym backendzie.
 *
 * PO CO. Bieg NC RfG/PTPiREE, gotowość wytwórcy i formalne dokumenty OZE
 * (certyfikat zgodności) powołują się na TĘ SAMĄ daną: pozycję wykazu PTPiREE
 * zapisaną w tabliczce urządzenia przez kreator źródła OZE. Do tej pory żaden
 * przebieg CI nie przechodził tego łańcucha od kliku w kreatorze do dowodu na
 * ekranie i w dokumencie — regresja któregokolwiek ogniwa była niewykrywalna.
 *
 * CO SPEC MIERZY (wyłącznie ścieżką NATYWNĄ w warstwie UI — kliki i wybory
 * Playwrighta; API służy do ZBUDOWANIA sieci i do NIEZALEŻNEJ weryfikacji
 * modelu, nigdy do obejścia interakcji, którą test ma sprawdzić):
 *
 *   1. sieć: GPZ → magistrala → stacja SN/nN 15/0,8 kV (napięcie strony nN
 *      dobrane do falownika string 0,8 kV, jedynego urządzenia katalogu
 *      powiązanego z wykazem PTPiREE),
 *   2. kreator źródła OZE otwarty ze STANU ZEROWEGO macierzy zgodności
 *      („Dodaj źródło OZE"), falownik wybrany z katalogu kreatora,
 *   3. model: wytwórca ma tabliczkę ze statusem POWIĄZANY i numerem dokumentu
 *      wykazu; gotowość NIE podnosi `der.inverter_certificate_unlinked` dla
 *      tego urządzenia, ale PODNOSI je dla urządzenia niepowiązanego
 *      (kontrola dodatnia — bez niej asercja przechodziłaby także wtedy, gdyby
 *      tor gotowości w ogóle nie działał),
 *   4. bieg NC RfG uruchomiony przyciskiem: dowód NA EKRANIE niesie NUMER
 *      DOKUMENTU i wersję WiPWC z wykazu, a urządzenie niepowiązane — uczciwy
 *      stan zerowy „brak dowodu",
 *   5. certyfikat zgodności: żądanie idzie z `case_id` aktywnego przypadku
 *      (bez niego backend nie ma skąd wziąć tabliczek i sekcja dowodu znika),
 *      a podgląd i plik DOCX niosą numer dokumentu tego samego urządzenia.
 *
 * Asercje idą po TREŚCI (numer dokumentu, wersja WiPWC), nie po samym istnieniu
 * elementów — element bez danej przechodziłby test tak samo jak element z daną.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
/** Transformator stacji 15/0,8 kV — strona nN zgodna napięciowo z falownikiem string. */
const TRAFO_ID = 'tr-sn-nn-15-0p8-1mva-dyn11-inverter';
/** JEDYNA pozycja katalogu powiązana z wykazem PTPiREE (HUAWEI SUN2000-215KTL-H3). */
const KONWERTER_POWIAZANY = 'conv-pv-card-huawei-sun2000-215ktl';
/** Falownik 0,8 kV spoza wykazu — kontrola dodatnia toru gotowości i dowodu. */
const KONWERTER_NIEPOWIAZANY = 'conv-pv-nn-0p5mw-0p8kv';
/** Dowód z wykazu WiPWC 1.2 (wiersz 3254) — wartości, nie tylko obecność pól. */
const NUMER_DOKUMENTU = 'TC-GCC-DNVGL-SE-0124-07526-1';
const WERSJA_WIPWC = '1.2';
const CATALOG_VERSION = '2024.1';
/** Kod gotowości podnoszony dla przetwornicy bez powiązanego certyfikatu. */
const KOD_BEZ_CERTYFIKATU = 'der.inverter_certificate_unlinked';

let opCounter = 0;
let entityCounter = 0;

type OstrzezenieGotowosci = { code: string; element_ref?: string | null };

type DomainOpResponse = {
  error?: string | null;
  readiness?: { warnings?: OstrzezenieGotowosci[] };
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    buses?: Array<{ ref_id: string; voltage_kv: number }>;
    substations?: Array<{ ref_id: string; station_type?: string }>;
    generators?: Array<{
      ref_id: string;
      catalog_ref?: string | null;
      materialized_params?: Record<string, unknown>;
    }>;
  };
};

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

function buildCatalogBinding(catalogNamespace: string, catalogItemId: string) {
  return {
    catalog_namespace: catalogNamespace,
    catalog_item_id: catalogItemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

async function executeDomainOp(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<DomainOpResponse> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `e2e-oze-dowod-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
    // Jawny limit — pod obciążeniem pełnej suity domyślne 10 s bywa za krótkie
    // (ten sam wzorzec i powód co w e2e/kreator-oze-max.spec.ts).
    timeout: 30000,
  });

  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E dowód OZE ${suffix}`;
  const caseName = `Przypadek dowodu OZE ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Łańcuch dowodu certyfikacji PTPiREE',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
    timeout: 30000,
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: {
      project_id: project.id,
      name: caseName,
      description: '',
      config: {},
      set_active: true,
    },
    timeout: 30000,
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

/** Sieć gotowa pod przyłączenie falownika 0,8 kV: GPZ → magistrala → stacja 15/0,8 kV. */
async function zbudujSiec(
  request: APIRequestContext,
  caseId: string,
): Promise<{ stationRef: string; busNnRef: string }> {
  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  const trunk = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 300,
      name: 'Odcinek 1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const segmentRefs = trunk.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  const stacja = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    // Aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.8 },
    // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
    // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
    // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
    // bez niego opisywal siec, ktorej kreator by nie zbudowal.
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: { create: true, catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  const stationRef = (stacja.snapshot?.substations ?? []).find(
    (substation) => (substation.station_type ?? '').toLowerCase() !== 'gpz',
  )?.ref_id;
  expect(stationRef, 'brak stacji SN/nN w migawce').toBeTruthy();

  const busNnRef = (stacja.snapshot?.buses ?? []).find(
    (bus) => bus.voltage_kv > 0 && bus.voltage_kv < 1.0,
  )?.ref_id;
  expect(busNnRef, 'brak szyny nN stacji w migawce').toBeTruthy();

  return { stationRef: stationRef!, busNnRef: busNnRef! };
}

async function otworzPowloke(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
): Promise<void> {
  await page.addInitScript((stan) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: stan.projectId,
          activeProjectName: stan.projectName,
          activeCaseId: stan.caseId,
          activeCaseName: stan.caseName,
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
  }, seed);

  await page.goto('/', { waitUntil: 'commit' });
  // Budżet ROZRUCHU narzędzia (nie asercja produktu): pierwsze wejście w biegu
  // uruchamia zimny transform vite dev całego grafu modułów — patrz ten sam
  // komentarz w e2e/critical-run-flow.spec.ts.
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('active-case-bar')).toContainText(/Zakres|Bieżący zestaw/);
}

/** Przestrzeń „Wyniki i dowody" → zakładka „Zgodność NC RfG". */
async function otworzMacierzZgodnosci(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('mvd-wyniki-zakladka-ncrfg').click();
  await expect(page.getByTestId('mvd-oze-macierz-ncrfg')).toBeVisible({ timeout: 30000 });
}

/** Przeładowanie powłoki z odczekaniem na odświeżenie migawki (wzorzec kreator-oze-max). */
async function przeladujPowloke(page: Page): Promise<void> {
  const odswiezenie = page
    .waitForResponse(
      (response) =>
        response.url().includes('/enm/domain-ops')
        && response.request().method() === 'POST'
        && (response.request().postData() ?? '').includes('"name":"refresh_snapshot"'),
      { timeout: 30000 },
    )
    .catch(() => null);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await odswiezenie;
}

/** Deklaracja zdolności modułu (dana „deklarowane") — bramka kompletności certyfikatu. */
async function zadeklarujZdolnoscModulu(page: Page, derRef: string): Promise<void> {
  await page.getByTestId(`mvd-oze-modul-${derRef}`).click();
  await expect(page.getByTestId('mvd-oze-panel-modulu')).toBeVisible();
  await page.getByTestId('mvd-oze-zdolnosc-stopGenerationEnabled').check();
}

test('krytyczny łańcuch dowodu PTPiREE: kreator OZE → tabliczka w modelu → gotowość → bieg NC RfG → dowód na ekranie → certyfikat zgodności', async ({
  page,
  request,
}) => {
  test.setTimeout(300000);

  const seed = await createProjectAndCase(request);
  const { stationRef, busNnRef } = await zbudujSiec(request, seed.caseId);
  await otworzPowloke(page, seed);

  // ------------------------------------------------------------------
  // Krok 1: stan zerowy macierzy prowadzi do kreatora źródła OZE.
  // ------------------------------------------------------------------
  await otworzMacierzZgodnosci(page);
  await expect(page.getByTestId('mvd-oze-pusty')).toContainText('Brak modułów wytwórczych do oceny');
  await page.getByRole('button', { name: 'Dodaj źródło OZE' }).click();
  await expect(page.getByTestId('mvd-kreator-oze')).toBeVisible({ timeout: 30000 });
  // Kreator MUSI mieć kontekst rozdzielni z modelu (inaczej zapis jest zablokowany).
  await expect(page.getByTestId('mvd-kreator-oze-brak')).toHaveCount(0);

  // ------------------------------------------------------------------
  // Krok 2: technologia i przyłączenie — falownik wprost na szynę nN stacji.
  // ------------------------------------------------------------------
  await page.getByTestId('mvd-kreator-oze-wariant').selectOption('nn_side');
  const aparat = page.getByTestId('mvd-kreator-oze-aparat');
  await expect(aparat.locator('option').nth(1)).toBeAttached({ timeout: 30000 });
  await aparat.selectOption({ index: 1 });

  // ------------------------------------------------------------------
  // Krok 3: karta falownika POWIĄZANEGO z wykazem — z katalogu kreatora.
  // ------------------------------------------------------------------
  await page.getByTestId('mvd-kreator-oze-dalej').click();
  const konwerter = page.getByTestId('mvd-kreator-oze-konwerter');
  await expect(konwerter).toBeVisible({ timeout: 30000 });
  const kartaHuawei = konwerter.locator(`option[value="${KONWERTER_POWIAZANY}"]`);
  await expect(kartaHuawei).toBeAttached({ timeout: 30000 });
  // Asercja po TREŚCI karty: to ma być falownik string Huawei 0,215 MW / 0,8 kV.
  await expect(kartaHuawei).toHaveText(/Huawei SUN2000-215KTL-H3/);
  await konwerter.selectOption(KONWERTER_POWIAZANY);

  // ------------------------------------------------------------------
  // Krok 4: przejście kreatora do kroku zapisu i zapis (bez auto-biegu —
  // obliczenia rozpływu/zwarć nie należą do mierzonego tu łańcucha dowodu).
  // ------------------------------------------------------------------
  for (let krok = 0; krok < 10; krok += 1) {
    const dalej = page.getByTestId('mvd-kreator-oze-dalej');
    if ((await dalej.count()) === 0) break;
    await dalej.click();
  }
  await expect(page.getByTestId('mvd-kreator-oze-autobieg-toggle')).toBeVisible();
  await page.getByTestId('mvd-kreator-oze-autobieg-toggle').selectOption('nie');
  await page.getByTestId('mvd-kreator-oze-zapisz').click();
  await expect(page.getByTestId('mvd-kreator-oze-sekwencja')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('mvd-kreator-oze-sekwencja-zrodlo')).toHaveAttribute(
    'data-stan',
    'zapisane',
  );

  // ------------------------------------------------------------------
  // Krok 5: MODEL — tabliczka wytwórcy niesie powiązanie z wykazem.
  // ------------------------------------------------------------------
  const enmResponse = await request.get(`${BACKEND_BASE}/api/cases/${seed.caseId}/enm`, {
    timeout: 30000,
  });
  expect(enmResponse.ok()).toBeTruthy();
  const enm = (await enmResponse.json()) as NonNullable<DomainOpResponse['snapshot']>;
  const wytworca = (enm.generators ?? []).find(
    (generator) => generator.catalog_ref === KONWERTER_POWIAZANY,
  );
  expect(wytworca, 'kreator nie zapisał wytwórcy z wybraną kartą katalogową').toBeTruthy();
  const tabliczka = wytworca!.materialized_params ?? {};
  expect(tabliczka.ptpiree_status).toBe('POWIAZANY');
  expect(tabliczka.ptpiree_document_number).toBe(NUMER_DOKUMENTU);
  expect(tabliczka.ptpiree_wipwc_version).toBe(WERSJA_WIPWC);
  const refPowiazany = wytworca!.ref_id;

  // ------------------------------------------------------------------
  // Krok 6: KONTROLA DODATNIA toru gotowości — drugie urządzenie, tej samej
  // technologii i na tej samej szynie, ale SPOZA wykazu. Bez tej pary asercja
  // „nie ma kodu" przechodziłaby także wtedy, gdyby tor gotowości milczał.
  // Urządzenie kontrolne dodajemy operacją domenową (nie kreatorem): mierzoną
  // ścieżką natywną jest wyłącznie droga urządzenia powiązanego.
  // ------------------------------------------------------------------
  const kontrolna = await executeDomainOp(request, seed.caseId, 'add_converter_source', {
    source_technology: 'PV',
    connection_variant: 'nn_side',
    station_ref: stationRef,
    bus_nn_ref: busNnRef,
    // Wiązanie katalogowe (catalog-first) — bez legacy pola płaskiego.
    catalog_binding: buildCatalogBinding('ZRODLO_NN_PV', KONWERTER_NIEPOWIAZANY),
    quantity: 1,
  });
  const refNiepowiazany = (kontrolna.snapshot?.generators ?? []).find(
    (generator) => generator.catalog_ref === KONWERTER_NIEPOWIAZANY,
  )?.ref_id;
  expect(refNiepowiazany, 'brak urządzenia kontrolnego w migawce').toBeTruthy();

  const gotowosc = await executeDomainOp(request, seed.caseId, 'refresh_snapshot', {});
  const bezCertyfikatu = (gotowosc.readiness?.warnings ?? [])
    .filter((ostrzezenie) => ostrzezenie.code === KOD_BEZ_CERTYFIKATU)
    .map((ostrzezenie) => ostrzezenie.element_ref);
  expect(
    bezCertyfikatu,
    'gotowość zgłasza brak certyfikatu dla urządzenia POWIĄZANEGO z wykazem',
  ).not.toContain(refPowiazany);
  expect(
    bezCertyfikatu,
    'gotowość milczy o urządzeniu SPOZA wykazu — asercja powyżej byłaby pusta',
  ).toContain(refNiepowiazany);

  // ------------------------------------------------------------------
  // Krok 7: bieg NC RfG na obu modułach — przycisk klikany NATYWNIE.
  // ------------------------------------------------------------------
  await przeladujPowloke(page);
  await otworzMacierzZgodnosci(page);
  await expect(page.getByTestId('mvd-oze-macierz-tabela')).toBeVisible({ timeout: 30000 });
  // Zdolność „zaprzestanie generacji" (test T12) jest daną DEKLAROWANĄ projektanta —
  // bez niej bramka kompletności certyfikatu odrzuca dokument (uczciwa lista braków).
  await zadeklarujZdolnoscModulu(page, refPowiazany);
  await zadeklarujZdolnoscModulu(page, refNiepowiazany!);

  await page.getByTestId('mvd-oze-przeprowadz').click();
  await expect(page.getByTestId('mvd-oze-komorka-wynik').first()).toBeVisible({ timeout: 60000 });

  // ------------------------------------------------------------------
  // Krok 8: DOWÓD NA EKRANIE — numer dokumentu wykazu przy urządzeniu
  // powiązanym, uczciwy stan zerowy przy urządzeniu spoza wykazu.
  // ------------------------------------------------------------------
  const dowod = page.getByTestId(`mvd-oze-dowod-${refPowiazany}`);
  await expect(dowod).toContainText(NUMER_DOKUMENTU);
  await expect(dowod).toContainText(`WiPWC ${WERSJA_WIPWC}`);
  await expect(page.getByTestId(`mvd-oze-dowod-brak-${refNiepowiazany}`)).toBeVisible();
  await expect(page.getByTestId(`mvd-oze-dowod-${refNiepowiazany}`)).toHaveCount(0);

  // ------------------------------------------------------------------
  // Krok 9: CERTYFIKAT ZGODNOŚCI — żądanie z aktywnym przypadkiem i dowód
  // w podglądzie. Bez `case_id` backend nie ma skąd wziąć tabliczek modelu
  // i dokument wraca bez sekcji dowodu.
  // ------------------------------------------------------------------
  const zadanieCertyfikatu = page.waitForRequest(
    (żądanie) =>
      żądanie.url().includes('/api/oze-analysis/compliance-certificate')
      && !żądanie.url().includes('.docx')
      && żądanie.method() === 'POST',
    { timeout: 60000 },
  );
  await page.getByTestId('mvd-oze-certyfikat-przycisk').click();
  const urlCertyfikatu = (await zadanieCertyfikatu).url();
  expect(
    urlCertyfikatu,
    'żądanie certyfikatu bez case_id — dokument powstałby bez sekcji dowodu',
  ).toContain(`case_id=${seed.caseId}`);

  await expect(page.getByTestId('mvd-oze-certyfikat')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('mvd-oze-cert-braki')).toHaveCount(0);
  await expect(page.getByTestId('mvd-oze-cert-widok')).toBeVisible({ timeout: 60000 });

  const dowodCertyfikatu = page.getByTestId(`mvd-oze-cert-dowod-${refPowiazany}`);
  await expect(dowodCertyfikatu).toContainText(NUMER_DOKUMENTU);
  await expect(dowodCertyfikatu).toContainText(`WiPWC ${WERSJA_WIPWC}`);
  await expect(page.getByTestId(`mvd-oze-cert-dowod-brak-${refNiepowiazany}`)).toContainText(
    'Brak danych tabliczki urządzenia w modelu.',
  );

  // ------------------------------------------------------------------
  // Krok 10: plik DOCX certyfikatu idzie tą samą drogą (ten sam przypadek).
  // ------------------------------------------------------------------
  const zadanieDocx = page.waitForResponse(
    (odpowiedz) =>
      odpowiedz.url().includes('/api/oze-analysis/compliance-certificate.docx')
      && odpowiedz.request().method() === 'POST',
    { timeout: 60000 },
  );
  await page.getByTestId('mvd-oze-cert-pobierz-docx').click();
  const odpowiedzDocx = await zadanieDocx;
  expect(odpowiedzDocx.url()).toContain(`case_id=${seed.caseId}`);
  expect(odpowiedzDocx.status()).toBe(200);
});
